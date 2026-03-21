/**
 * Layer Executors — Execution logic for each pipeline layer.
 *
 * L0 (Code Fixer): Wraps existing runDaemonJob
 * L1 (Strategy Optimizer): Analyzes L0 trends, adjusts strategy
 * L2 (Meta-Strategist): Generates new skills, captures wisdom
 *
 * All executors consume feedback from below and produce typed results.
 */

import type { AgentEventBus } from '../agentEventBus';
import type { DaemonProfile, DaemonProjectDNA, DaemonPass } from '../daemon/types';
import type {
  LayerConfig,
  LayerCycleResult,
  L0Output,
  L1Output,
  L2Output,
  FeedbackSignal,
  GeneratedSkill,
  WisdomEntry,
  TrendSummary,
  LayerBudget,
} from './types';
import { generateFeedbackSignals, aggregateFeedback } from './feedbackEngine';
import { HOLOSCRIPT_SELF_DNA, isSelfTargetSafe } from './selfTargetConfig';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateCycleId(layerId: number): string {
  return `L${layerId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── L1 Prompt Building ──────────────────────────────────────────────────────

const L1_SYSTEM_PROMPT = `You are a Strategy Optimizer for a recursive self-improvement daemon.
You receive quality trend data from Layer 0 (Code Fixer) and propose strategy adjustments.

Your output MUST be valid JSON matching this exact shape:
{
  "focusRotationChange": ["absorb", "typefix", "lint", "coverage"] | null,
  "profileChange": "quick" | "balanced" | "deep" | null,
  "passesChange": ["absorb", "typefix", "docs", "coverage"] | null,
  "budgetAdjustment": { "maxCycles": number } | null,
  "rationale": "explanation string"
}

Rules:
- focusRotationChange MUST always include "absorb" as the first entry
- profileChange should only change when the current profile is clearly wrong
- budgetAdjustment can only increase maxCycles by 1, never decrease
- rationale must explain WHY the change will help based on the trend data
- If no changes are needed, set all fields to null with a rationale explaining why
- NEVER remove human review from any layer
- Keep responses concise — under 200 words for rationale`;

function buildL1Prompt(trends: TrendSummary): string {
  const focusList = trends.bestFocus.length > 0
    ? trends.bestFocus.map((f) => `  - ${f.focus}: avg delta ${f.avgDelta.toFixed(4)} (${f.count} cycles)`).join('\n')
    : '  (no focus data yet)';

  return `## Layer 0 Trend Summary

Quality trajectory: **${trends.qualityTrajectory}**
Plateau count: ${trends.plateauCount}
Average cost per quality point: $${trends.avgCostPerPoint.toFixed(2)}
Total signals analyzed: ${trends.totalSignals}

### Focus Effectiveness (best to worst):
${focusList}

Based on this data, what strategy adjustments should Layer 0 make for its next cycle?
If quality is improving and cost is reasonable, no changes may be needed.
If plateau is detected (count >= 2), consider changing focus rotation or increasing cycles.
If declining, consider switching to a different profile or removing low-effectiveness passes.

Respond with a JSON object only.`;
}

// ─── L2 Prompt Building ──────────────────────────────────────────────────────

const L2_SYSTEM_PROMPT = `You are a Meta-Strategist for a recursive self-improvement pipeline.
You analyze Layer 1's strategy history and generate new HoloScript skills.

Your output MUST be valid JSON matching this shape:
{
  "newSkills": [
    {
      "name": "skill-name",
      "description": "what this skill does",
      "content": "composition \\"SkillName\\" { ... }",
      "targetLayer": 0,
      "confidence": 0.8
    }
  ],
  "architecturalInsights": ["insight 1", "insight 2"],
  "wisdomEntries": [
    {
      "category": "pattern" | "gotcha" | "wisdom",
      "content": "W.XXX: description",
      "confidence": 0.9
    }
  ]
}

Skills must be valid HoloScript .hsplus compositions with:
- A composition name
- At least one state variable
- At least one behavior_tree action
- Proper HoloScript syntax

Keep skill count between 0-3. Only generate skills for clear gaps.
Wisdom entries should follow the W.XXX format convention.`;

function buildL2Prompt(
  trends: TrendSummary,
  l1History: LayerCycleResult[],
): string {
  const l1Summary = l1History.map((r) => {
    const output = r.output as L1Output;
    return `  - Cycle ${r.cycleId}: delta=${r.qualityDelta.toFixed(4)}, status=${r.status}, rationale="${output.rationale?.slice(0, 100) ?? 'N/A'}"`;
  }).join('\n');

  return `## Meta-Strategy Analysis

### Layer 0 Trends
Quality trajectory: ${trends.qualityTrajectory}
Plateau count: ${trends.plateauCount}
Best focus: ${trends.bestFocus[0]?.focus ?? 'unknown'} (avg delta: ${trends.bestFocus[0]?.avgDelta?.toFixed(4) ?? '0'})

### Layer 1 Strategy History
${l1Summary || '  (no L1 cycles yet)'}

### Task
1. Identify patterns in L1's strategy adjustments — what works, what doesn't
2. If there are recurring failures L0 can't fix, generate a new .hsplus skill targeting that gap
3. Capture any architectural insights or wisdom entries

If the system is performing well and no gaps are identified, return empty arrays.
Respond with a JSON object only.`;
}

// ─── Layer 0: Code Fixer ─────────────────────────────────────────────────────

export interface L0ExecutorDeps {
  runDaemonJob: (
    projectPath: string,
    profile: DaemonProfile,
    dna: DaemonProjectDNA,
    onProgress: (progress: number, status: string) => void,
    customLimits?: Record<string, unknown>,
  ) => Promise<{
    success: boolean;
    cycles: number;
    filesAnalyzed: number;
    filesChanged: number;
    qualityBefore: number;
    qualityAfter: number;
    qualityDelta: number;
    patches: Array<{
      id: string;
      filePath: string;
      action: string;
      diff: string | null;
      proposedContent: string | null;
      description: string;
      confidence: number;
      category: string;
    }>;
    summary: string;
  }>;
  resolveProjectPath: (targetProject: string) => string;
  resolveDNA: (targetProject: string) => Promise<DaemonProjectDNA>;
}

export async function executeLayer0(
  config: LayerConfig,
  targetProject: string,
  feedback: FeedbackSignal[],
  eventBus: AgentEventBus,
  deps: L0ExecutorDeps,
): Promise<LayerCycleResult> {
  const cycleId = generateCycleId(0);
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  // Read L1 strategy adjustments from feedback
  const strategySignal = feedback.find(
    (f) => f.signalType === 'focus_effectiveness' && f.data.profileOverride
  );
  const profile = (strategySignal?.data?.profileOverride as DaemonProfile) ?? 'balanced';
  const customFocus = strategySignal?.data?.focusOverride as string[] | undefined;

  // Resolve project path and DNA
  const projectPath = deps.resolveProjectPath(targetProject);
  const dna = targetProject === 'self'
    ? HOLOSCRIPT_SELF_DNA
    : await deps.resolveDNA(targetProject);

  // Build custom limits from feedback
  const customLimits: Record<string, unknown> = {};
  if (targetProject === 'self') {
    customLimits.protectedPaths = ['src/lib/recursive/', 'daemon-state.json'];
  }

  eventBus.publish('pipeline:layer_started', { layerId: 0, cycleId }, 'layer-0');

  try {
    const result = await deps.runDaemonJob(
      projectPath,
      profile,
      dna,
      (progress, status) => {
        eventBus.publish('pipeline:layer_progress', {
          layerId: 0, cycleId, progress, status,
        }, 'layer-0');
      },
      customLimits,
    );

    const output: L0Output = {
      kind: 'code_patches',
      patches: result.patches as L0Output['patches'],
      qualityDelta: result.qualityDelta,
      filesChanged: result.filesChanged,
      focusUsed: customFocus?.[0] ?? 'absorb',
    };

    const cycleResult: LayerCycleResult = {
      layerId: 0,
      cycleId,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      costUSD: 0, // Cost tracking added by orchestrator
      qualityBefore: result.qualityBefore,
      qualityAfter: result.qualityAfter,
      qualityDelta: result.qualityDelta,
      output,
      inputFromBelow: [],
      status: result.success ? 'success' : 'failure',
    };

    eventBus.publish('pipeline:layer_complete', {
      layerId: 0, cycleId, result: cycleResult,
    }, 'layer-0');

    return cycleResult;
  } catch (err) {
    const cycleResult: LayerCycleResult = {
      layerId: 0,
      cycleId,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      costUSD: 0,
      qualityBefore: 0,
      qualityAfter: 0,
      qualityDelta: 0,
      output: { kind: 'code_patches', patches: [], qualityDelta: 0, filesChanged: 0, focusUsed: 'absorb' },
      inputFromBelow: [],
      status: 'failure',
    };

    eventBus.publish('pipeline:layer_complete', {
      layerId: 0, cycleId, result: cycleResult, error: String(err),
    }, 'layer-0');

    return cycleResult;
  }
}

// ─── Layer 1: Strategy Optimizer ─────────────────────────────────────────────

export interface LLMProvider {
  chat: (params: { system: string; prompt: string; maxTokens: number }) => Promise<{ text: string }>;
}

/**
 * Parse L1's LLM response into a typed L1Output.
 * Falls back to no-op if parsing fails.
 */
function parseL1Response(text: string): L1Output {
  try {
    // Extract JSON from potential markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text];
    const parsed = JSON.parse(jsonMatch[1]?.trim() ?? text.trim());

    // Validate focus rotation always includes absorb
    if (parsed.focusRotationChange && !parsed.focusRotationChange.includes('absorb')) {
      parsed.focusRotationChange = ['absorb', ...parsed.focusRotationChange];
    }

    return {
      kind: 'strategy_adjustment',
      focusRotationChange: parsed.focusRotationChange ?? null,
      profileChange: parsed.profileChange ?? null,
      passesChange: parsed.passesChange ?? null,
      budgetAdjustment: parsed.budgetAdjustment ?? null,
      rationale: parsed.rationale ?? 'No rationale provided',
    };
  } catch {
    return {
      kind: 'strategy_adjustment',
      focusRotationChange: null,
      profileChange: null,
      passesChange: null,
      budgetAdjustment: null,
      rationale: 'Failed to parse LLM response — no changes applied',
    };
  }
}

export async function executeLayer1(
  config: LayerConfig,
  feedbackBuffer: FeedbackSignal[],
  eventBus: AgentEventBus,
  llmProvider: LLMProvider,
): Promise<LayerCycleResult> {
  const cycleId = generateCycleId(1);
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  eventBus.publish('pipeline:layer_started', { layerId: 1, cycleId }, 'layer-1');

  try {
    // Aggregate L0 feedback into trends
    const trends = aggregateFeedback(feedbackBuffer);

    // LLM micro-call
    const prompt = buildL1Prompt(trends);
    const llmResult = await llmProvider.chat({
      system: L1_SYSTEM_PROMPT,
      prompt,
      maxTokens: 2000,
    });

    const output = parseL1Response(llmResult.text);

    // Quality score for L1: did L0's trajectory improve after L1's adjustments?
    // (Simplified: use trends as proxy)
    const qualityBefore = trends.qualityTrajectory === 'declining' ? 0.3
      : trends.qualityTrajectory === 'stagnant' ? 0.5 : 0.7;
    const qualityAfter = output.focusRotationChange || output.profileChange
      ? qualityBefore + 0.1 : qualityBefore;

    const cycleResult: LayerCycleResult = {
      layerId: 1,
      cycleId,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      costUSD: 0,
      qualityBefore,
      qualityAfter,
      qualityDelta: qualityAfter - qualityBefore,
      output,
      inputFromBelow: feedbackBuffer,
      status: 'success',
    };

    eventBus.publish('pipeline:layer_complete', {
      layerId: 1, cycleId, result: cycleResult,
    }, 'layer-1');

    return cycleResult;
  } catch (err) {
    const cycleResult: LayerCycleResult = {
      layerId: 1,
      cycleId,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      costUSD: 0,
      qualityBefore: 0,
      qualityAfter: 0,
      qualityDelta: 0,
      output: {
        kind: 'strategy_adjustment',
        focusRotationChange: null, profileChange: null,
        passesChange: null, budgetAdjustment: null,
        rationale: `L1 execution failed: ${String(err)}`,
      },
      inputFromBelow: feedbackBuffer,
      status: 'failure',
    };

    eventBus.publish('pipeline:layer_complete', {
      layerId: 1, cycleId, result: cycleResult, error: String(err),
    }, 'layer-1');

    return cycleResult;
  }
}

// ─── Layer 2: Meta-Strategist ────────────────────────────────────────────────

function parseL2Response(text: string): L2Output {
  try {
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, text];
    const parsed = JSON.parse(jsonMatch[1]?.trim() ?? text.trim());

    const newSkills: GeneratedSkill[] = (parsed.newSkills ?? []).map((s: Record<string, unknown>) => ({
      name: String(s.name ?? 'unnamed-skill'),
      description: String(s.description ?? ''),
      content: String(s.content ?? ''),
      targetLayer: Number(s.targetLayer ?? 0),
      confidence: Number(s.confidence ?? 0.5),
    }));

    const wisdomEntries: WisdomEntry[] = (parsed.wisdomEntries ?? []).map((w: Record<string, unknown>) => ({
      category: (w.category as WisdomEntry['category']) ?? 'wisdom',
      content: String(w.content ?? ''),
      confidence: Number(w.confidence ?? 0.5),
    }));

    return {
      kind: 'evolution',
      newSkills,
      strategyPatches: [],
      architecturalInsights: parsed.architecturalInsights ?? [],
      wisdomEntries,
    };
  } catch {
    return {
      kind: 'evolution',
      newSkills: [],
      strategyPatches: [],
      architecturalInsights: [],
      wisdomEntries: [],
    };
  }
}

export async function executeLayer2(
  config: LayerConfig,
  feedbackBuffer: FeedbackSignal[],
  l1History: LayerCycleResult[],
  eventBus: AgentEventBus,
  llmProvider: LLMProvider,
): Promise<LayerCycleResult> {
  const cycleId = generateCycleId(2);
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  eventBus.publish('pipeline:layer_started', { layerId: 2, cycleId }, 'layer-2');

  try {
    const trends = aggregateFeedback(feedbackBuffer);
    const prompt = buildL2Prompt(trends, l1History);

    const llmResult = await llmProvider.chat({
      system: L2_SYSTEM_PROMPT,
      prompt,
      maxTokens: 4000,
    });

    const output = parseL2Response(llmResult.text);

    // Filter out skills with low confidence
    output.newSkills = output.newSkills.filter((s) => s.confidence >= 0.6);

    const qualityBefore = 0.5;
    const qualityAfter = output.newSkills.length > 0 || output.wisdomEntries.length > 0
      ? 0.6 : 0.5;

    const cycleResult: LayerCycleResult = {
      layerId: 2,
      cycleId,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      costUSD: 0,
      qualityBefore,
      qualityAfter,
      qualityDelta: qualityAfter - qualityBefore,
      output,
      inputFromBelow: feedbackBuffer,
      status: 'success',
    };

    eventBus.publish('pipeline:layer_complete', {
      layerId: 2, cycleId, result: cycleResult,
    }, 'layer-2');

    return cycleResult;
  } catch (err) {
    const cycleResult: LayerCycleResult = {
      layerId: 2,
      cycleId,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      costUSD: 0,
      qualityBefore: 0,
      qualityAfter: 0,
      qualityDelta: 0,
      output: {
        kind: 'evolution',
        newSkills: [],
        strategyPatches: [],
        architecturalInsights: [],
        wisdomEntries: [],
      },
      inputFromBelow: feedbackBuffer,
      status: 'failure',
    };

    eventBus.publish('pipeline:layer_complete', {
      layerId: 2, cycleId, result: cycleResult, error: String(err),
    }, 'layer-2');

    return cycleResult;
  }
}
