import { describe, it, expect } from 'vitest';
import {
  OutcomeLoop,
  artifactHash,
  type OutcomeArtifact,
  type OutcomeCriterion,
  type OutcomeGraderResult,
  type OutcomeImplementerResult,
  type OutcomeSpec,
  type OutcomeValidationResult,
} from '../OutcomeLoop';
import { createAnthropicProvider } from '@holoscript/llm-provider';
import type { LLMCompletionRequest, LLMCompletionResponse, TokenUsage } from '@holoscript/llm-provider';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Env gate ───────────────────────────────────────────────────────────────

const enabled = Boolean(process.env.ANTHROPIC_API_KEY && process.env.BENCHMARK_CRITIC_LOOP);
const model = process.env.BENCHMARK_CRITIC_MODEL || 'claude-sonnet-4-6';

const provider = enabled
  ? createAnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY!, defaultModel: model })
  : null;

// ── Fixtures ───────────────────────────────────────────────────────────────

const CODE_FIXTURE: OutcomeArtifact = {
  path: 'fixture/agents.ts',
  kind: 'code',
  content: `function fetchAgents(): any {
  const total = 1800;
  return { count: total };
}`,
};

const DOCS_FIXTURE: OutcomeArtifact = {
  path: 'fixture/overview.md',
  kind: 'docs',
  content: `# HoloScript Overview
HoloScript supports 1,800+ VR traits out of the box.`,
};

const SHARED_RUBRIC: OutcomeCriterion[] = [
  { id: 'no-any', description: 'Artifact must not use the any type.', weight: 1 },
  { id: 'no-hardcoded', description: 'Artifact must not contain hardcoded ecosystem counts (e.g. "1,800+"). Reference a verification command instead.', weight: 1 },
  { id: 'type-safety', description: 'Code must have explicit return types and avoid implicit any.', weight: 1 },
  { id: 'provenance', description: 'Docs must cite a source or verification command for every quantitative claim.', weight: 1 },
];

// ── JSON extraction helper ─────────────────────────────────────────────────

function extractJson<T>(text: string): T {
  const cleaned = text
    .replace(/```json\s*/g, '')
    .replace(/```\s*/g, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error(`No JSON object found in response: ${cleaned.slice(0, 200)}`);
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

// ── Anthropic helpers ──────────────────────────────────────────────────────

async function callAnthropic(system: string, user: string): Promise<{ text: string; usage: TokenUsage }> {
  if (!provider) throw new Error('Provider not available');
  const request: LLMCompletionRequest = {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    maxTokens: 2048,
    temperature: 0.2,
  };
  const response: LLMCompletionResponse = await provider.complete(request, model);
  return { text: response.content, usage: response.usage };
}

async function gradeArtifact(artifact: OutcomeArtifact, rubric: OutcomeCriterion[]): Promise<{ result: OutcomeGraderResult; usage: TokenUsage }> {
  const system = `You are a brutal honest critic. Grade the artifact against the rubric. Respond ONLY with valid JSON matching this shape:
{
  "criteria": [
    { "criterionId": string, "score": number (0-1), "passed": boolean, "gap": string | undefined }
  ],
  "summary": "ready" | "needs iteration"
}`;
  const user = `Rubric:\n${JSON.stringify(rubric, null, 2)}\n\nArtifact (${artifact.path}):\n\n\`\`\`${artifact.kind}\n${artifact.content}\n\`\`\``;
  const { text, usage } = await callAnthropic(system, user);
  const parsed = extractJson<{ criteria: Array<{ criterionId: string; score: number; passed: boolean; gap?: string }>; summary?: string }>(text);
  const result: OutcomeGraderResult = {
    criteria: parsed.criteria.map((c) => ({
      criterionId: c.criterionId,
      score: c.score,
      passed: c.passed,
      gap: c.gap,
    })),
    summary: parsed.summary || 'needs iteration',
  };
  return { result, usage };
}

async function fixArtifact(artifact: OutcomeArtifact, gaps: string[]): Promise<{ artifact: OutcomeArtifact; usage: TokenUsage }> {
  const system = `You are a senior engineer. Fix the gaps in the artifact. Respond ONLY with valid JSON matching this shape:
{
  "content": "the complete fixed artifact content",
  "notes": "brief description of what you changed"
}`;
  const user = `Artifact (${artifact.path}):\n\n\`\`\`${artifact.kind}\n${artifact.content}\n\`\`\`\n\nGaps to fix:\n${gaps.map((g, i) => `${i + 1}. ${g}`).join('\n')}`;
  const { text, usage } = await callAnthropic(system, user);
  const parsed = extractJson<{ content: string; notes?: string }>(text);
  const fixed: OutcomeArtifact = { ...artifact, content: parsed.content };
  return { artifact: fixed, usage };
}

// ── Direct Anthropic path ──────────────────────────────────────────────────

async function runDirectAnthropic(spec: OutcomeSpec): Promise<{ artifact: OutcomeArtifact; result: OutcomeGraderResult; usage: TokenUsage; wallMs: number }> {
  const system = `You are a senior engineer and critic. Given the artifact and rubric, produce a fixed version of the artifact AND grade yourself against the rubric. Respond ONLY with valid JSON matching this shape:
{
  "content": "the complete fixed artifact content",
  "criteria": [
    { "criterionId": string, "score": number (0-1), "passed": boolean, "gap": string | undefined }
  ],
  "summary": "ready" | "needs iteration"
}`;
  const user = `Rubric:\n${JSON.stringify(spec.rubric, null, 2)}\n\nArtifact (${spec.artifacts[0].path}):\n\n\`\`\`${spec.artifacts[0].kind}\n${spec.artifacts[0].content}\n\`\`\``;

  const t0 = performance.now();
  const { text, usage } = await callAnthropic(system, user);
  const wallMs = performance.now() - t0;

  const parsed = extractJson<{
    content: string;
    criteria: Array<{ criterionId: string; score: number; passed: boolean; gap?: string }>;
    summary?: string;
  }>(text);

  const artifact: OutcomeArtifact = { ...spec.artifacts[0], content: parsed.content };
  const result: OutcomeGraderResult = {
    criteria: parsed.criteria.map((c) => ({
      criterionId: c.criterionId,
      score: c.score,
      passed: c.passed,
      gap: c.gap,
    })),
    summary: parsed.summary || 'needs iteration',
  };

  return { artifact, result, usage, wallMs };
}

// ── OutcomeLoop path ─────────────────────────────────────────────────────────

async function runOutcomeLoop(spec: OutcomeSpec): Promise<{ receipt: import('../OutcomeLoop').OutcomeReceipt; finalArtifact: OutcomeArtifact; usage: TokenUsage; wallMs: number }> {
  let totalUsage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let finalArtifact: OutcomeArtifact = spec.artifacts[0];

  const loop = new OutcomeLoop({
    async implementer(input): Promise<OutcomeImplementerResult> {
      const gaps = input.previousGaps.filter((g) => !g.passed).map((g) => g.gap || g.criterionId);
      const { artifact: fixed, usage } = await fixArtifact(input.artifacts[0], gaps);
      totalUsage = addUsage(totalUsage, usage);
      finalArtifact = fixed;
      return { artifacts: [fixed], notes: gaps.length > 0 ? 'Applied grader gaps.' : 'No gaps remaining.' };
    },
    async grader(input): Promise<OutcomeGraderResult> {
      const { result, usage } = await gradeArtifact(input.artifacts[0], input.spec.rubric);
      totalUsage = addUsage(totalUsage, usage);
      return result;
    },
    validationRunner(command): OutcomeValidationResult {
      return { ...command, passed: true, exitCode: 0 };
    },
  });

  const t0 = performance.now();
  const receipt = await loop.run(spec);
  const wallMs = performance.now() - t0;

  return { receipt, finalArtifact, usage: totalUsage, wallMs };
}

// ── Fair re-grade ──────────────────────────────────────────────────────────

async function fairReGrade(artifact: OutcomeArtifact, rubric: OutcomeCriterion[]): Promise<{ result: OutcomeGraderResult; usage: TokenUsage }> {
  return gradeArtifact(artifact, rubric);
}

// ── Markdown reporter ───────────────────────────────────────────────────────

function renderArtifact(rows: Array<{
  fixture: string;
  path: string;
  approach: string;
  score: number;
  passed: boolean;
  iterations: number;
  wallMs: number;
  promptTokens: number;
  completionTokens: number;
}>): string {
  const lines: string[] = [];
  lines.push('# Benchmark: Anthropic Outcomes vs /critic quality loop');
  lines.push('');
  lines.push(`- Date: ${new Date().toISOString()}`);
  lines.push(`- Model: ${model}`);
  lines.push(`- Env gate: ANTHROPIC_API_KEY + BENCHMARK_CRITIC_LOOP=1`);
  lines.push('');
  lines.push('| Fixture | Approach | Score | Passed | Iterations | Wall (ms) | Prompt TOK | Completion TOK |');
  lines.push('|---------|----------|-------|--------|------------|-----------|------------|----------------|');
  for (const r of rows) {
    lines.push(
      `| ${r.fixture} | ${r.approach} | ${r.score.toFixed(4)} | ${r.passed} | ${r.iterations} | ${r.wallMs.toFixed(1)} | ${r.promptTokens} | ${r.completionTokens} |`
    );
  }
  lines.push('');
  lines.push('## Methodology');
  lines.push('');
  lines.push(
    'Each fixture is run through two paths: (1) a single direct Anthropic call that both critiques and fixes the artifact, and (2) an OutcomeLoop where a grader identifies gaps and an implementer fixes them iteratively. After both paths complete, a fair re-grade (same grader prompt) scores the final artifact so the scores are comparable. Cost = accumulated prompt + completion tokens across all loop turns.'
  );
  lines.push('');
  return lines.join('\n');
}

// ── Test ─────────────────────────────────────────────────────────────────────

const describeBench = enabled ? describe : describe.skip;

describeBench('Anthropic Outcomes vs /critic quality loop', () => {
  it('compares direct anthropic vs outcome loop on code and docs fixtures', async () => {
    const fixtures: { id: string; artifact: OutcomeArtifact; rubric: OutcomeCriterion[] }[] = [
      { id: 'code', artifact: CODE_FIXTURE, rubric: SHARED_RUBRIC },
      { id: 'docs', artifact: DOCS_FIXTURE, rubric: SHARED_RUBRIC },
    ];

    const rows: Array<{
      fixture: string;
      path: string;
      approach: string;
      score: number;
      passed: boolean;
      iterations: number;
      wallMs: number;
      promptTokens: number;
      completionTokens: number;
    }> = [];

    for (const { id, artifact, rubric } of fixtures) {
      const spec: OutcomeSpec = {
        id: `benchmark_${id}`,
        rubric,
        threshold: 1.0,
        maxIterations: 3,
        artifacts: [artifact],
        grader: { id: 'anthropic-grader', kind: 'model', label: 'Anthropic critic grader' },
        validationCommands: [],
      };

      // ── Direct Anthropic ──
      const direct = await runDirectAnthropic(spec);
      const directReGrade = await fairReGrade(direct.artifact, rubric);
      rows.push({
        fixture: id,
        path: artifact.path,
        approach: 'direct',
        score: directReGrade.result.score ?? 0,
        passed: directReGrade.result.criteria.every((c) => c.passed),
        iterations: 1,
        wallMs: direct.wallMs,
        promptTokens: direct.usage.promptTokens + directReGrade.usage.promptTokens,
        completionTokens: direct.usage.completionTokens + directReGrade.usage.completionTokens,
      });

      // ── OutcomeLoop ──
      const loop = await runOutcomeLoop(spec);
      const loopReGrade = await fairReGrade(loop.finalArtifact, rubric);
      rows.push({
        fixture: id,
        path: artifact.path,
        approach: 'outcome-loop',
        score: loopReGrade.result.score ?? 0,
        passed: loopReGrade.result.criteria.every((c) => c.passed),
        iterations: loop.receipt.iterations,
        wallMs: loop.wallMs,
        promptTokens: loop.usage.promptTokens + loopReGrade.usage.promptTokens,
        completionTokens: loop.usage.completionTokens + loopReGrade.usage.completionTokens,
      });
    }

    // Sanity: at least one row per fixture
    expect(rows.length).toBe(fixtures.length * 2);

    // Write artifact
    const __dir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = resolve(__dir, '..', '..', '..', '..');
    const benchLogsDir = resolve(repoRoot, '.bench-logs');
    if (!existsSync(benchLogsDir)) mkdirSync(benchLogsDir, { recursive: true });
    const artifactPath = resolve(benchLogsDir, 'anthropic-vs-critic-loop.md');
    const md = renderArtifact(rows);
    writeFileSync(artifactPath, md);

    console.log(`[benchmark] artifact=${artifactPath}`);
    for (const r of rows) {
      console.log(
        `[benchmark] ${r.fixture} ${r.approach} score=${r.score.toFixed(4)} pass=${r.passed} iters=${r.iterations} wall=${r.wallMs.toFixed(1)}ms tokens=${r.promptTokens}+${r.completionTokens}`
      );
    }
  });
});
