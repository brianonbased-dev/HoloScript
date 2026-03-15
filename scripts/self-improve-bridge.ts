#!/usr/bin/env npx tsx
/**
 * HoloScript Self-Improvement Bridge
 *
 * Connects the .hsplus self-improve-daemon composition to real tool handlers
 * via HeadlessRuntime. This is the TypeScript execution bridge — it parses
 * the .hsplus file, creates a HeadlessRuntime, and dispatches behavior tree
 * actions to actual tool calls and LLM micro-invocations.
 *
 * Part of the G.ARCH.001 experiment: HoloScript Self-Orchestration vs
 * TypeScript Daemon.
 *
 * Usage:
 *   npx tsx scripts/self-improve-bridge.ts --cycles 15 --commit
 *   npx tsx scripts/self-improve-bridge.ts --cycles 3 --verbose
 *
 * @version 1.0.0
 */

import Anthropic from '@anthropic-ai/sdk';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

// ─── HoloScript Runtime Imports ──────────────────────────────────────────────
// These are the REAL HoloScript primitives. The treatment arm uses them natively.
import { HeadlessRuntime, createHeadlessRuntime } from '../packages/core/src/runtime/profiles/HeadlessRuntime';
import { HEADLESS_PROFILE } from '../packages/core/src/runtime/profiles/RuntimeProfile';
import { parse } from '../packages/core/src/parser/HoloScriptPlusParser';

// ─── .env Loading ─────────────────────────────────────────────────────────────

function loadEnvFile(dir: string): void {
  const envPath = path.join(dir, '.env');
  try {
    if (!fs.existsSync(envPath)) return;
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* best effort */ }
}

// ─── Path Resolution ─────────────────────────────────────────────────────────

const __scriptDir =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.HOLOSCRIPT_ROOT ?? path.resolve(__scriptDir, '..');

loadEnvFile(REPO_ROOT);

// Force bm25 embeddings for the experiment bridge — free, fast, no API cost.
// OpenAI embeddings are higher quality but take 10+ minutes on the full repo
// and cost money. bm25 is sufficient for code symbol matching in self-diagnose.
// Override AFTER loadEnvFile so .env's EMBEDDING_PROVIDER=openai is overridden.
if (!process.argv.includes('--openai-embeddings')) {
  process.env.EMBEDDING_PROVIDER = 'bm25';
}

const STATE_DIR = path.join(REPO_ROOT, '.holoscript');
const BRIDGE_STATE_FILE = path.join(STATE_DIR, 'bridge-state.json');
const HISTORY_FILE = path.join(STATE_DIR, 'quality-history.json');
const LOCK_FILE = path.join(STATE_DIR, 'bridge.lock');
const COMPOSITION_FILE = path.join(REPO_ROOT, 'compositions', 'self-improve-daemon.hsplus');
const MODEL = 'claude-sonnet-4-20250514';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BridgeConfig {
  commit: boolean;
  cycles: number;
  rootDir: string;
  verbose: boolean;
  trial?: number;
}

interface Blackboard {
  has_candidates: boolean;
  compilation_passed: boolean;
  tests_passed: boolean;
  quality_improved: boolean;
  current_file: string | null;
  current_candidate: any | null;
  candidates: any[];
  quality_before: number;
  quality_after: number;
  files_edited: string[];
  focus: string;
  cycle_number: number;
  error_message: string | null;
  // Internal bridge state (prefixed with __ to avoid .hsplus blackboard collisions)
  __circuitOpen?: boolean;
  __currentCbId?: string;
  __tickCount?: number;
}

interface BridgeState {
  totalCycles: number;
  bestQuality: number;
  lastQuality: number;
  focusIndex: number;
  attemptedFiles: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUSD: number;
}

interface QualityEntry {
  timestamp: string;
  cycle: number;
  composite: number;
  grade: string;
  focus: string;
  summary: string;
  inputTokens?: number;
  outputTokens?: number;
  costUSD?: number;
  toolCallsTotal?: number;
  toolCallsUseful?: number;
  durationSeconds?: number;
  arm?: 'control' | 'treatment';
  trial?: number;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function ensureStateDir(): void {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

function loadBridgeState(): BridgeState {
  try {
    if (fs.existsSync(BRIDGE_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(BRIDGE_STATE_FILE, 'utf-8'));
    }
  } catch { /* start fresh */ }
  return {
    totalCycles: 0,
    bestQuality: 0,
    lastQuality: 0,
    focusIndex: 0,
    attemptedFiles: [],
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUSD: 0,
  };
}

function saveBridgeState(state: BridgeState): void {
  ensureStateDir();
  fs.writeFileSync(BRIDGE_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function appendQualityHistory(entry: QualityEntry): void {
  ensureStateDir();
  let history: QualityEntry[] = [];
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    }
  } catch { /* start fresh */ }
  history.push(entry);
  if (history.length > 500) history = history.slice(-500);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

// ─── File Lock ───────────────────────────────────────────────────────────────

function acquireLock(): boolean {
  ensureStateDir();
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
      // Check if the process is still alive (stale lock detection)
      try {
        process.kill(lockData.pid, 0);
        return false; // Process is alive, can't acquire
      } catch {
        // Process is dead, remove stale lock
      }
    }
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, time: Date.now() }), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch { /* best effort */ }
}

// ─── Tool Loading ────────────────────────────────────────────────────────────

async function loadToolHandlers() {
  const mcpDir = path.join(REPO_ROOT, 'packages', 'mcp-server', 'src');
  const toURL = (p: string) => pathToFileURL(p).href;

  const codebaseTools = await import(toURL(path.join(mcpDir, 'codebase-tools.ts')));
  const graphRagTools = await import(toURL(path.join(mcpDir, 'graph-rag-tools.ts')));
  const selfImproveTools = await import(toURL(path.join(mcpDir, 'self-improve-tools.ts')));

  return {
    handlers: [
      codebaseTools.handleCodebaseTool,
      graphRagTools.handleGraphRagTool,
      selfImproveTools.handleSelfImproveTool,
    ] as Array<(name: string, args: Record<string, unknown>) => Promise<unknown | null>>,
    toolDefs: [
      ...codebaseTools.codebaseTools,
      ...graphRagTools.graphRagTools,
      ...selfImproveTools.selfImproveTools,
    ],
  };
}

async function callTool(
  handlers: Array<(name: string, args: Record<string, unknown>) => Promise<unknown | null>>,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  try {
    for (const handler of handlers) {
      const result = await handler(name, args);
      if (result !== null) return JSON.stringify(result, null, 2);
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (err: any) {
    return JSON.stringify({ error: err.message });
  }
}

// ─── Useful Tool Classification ──────────────────────────────────────────────

const USEFUL_TOOLS = new Set([
  'holo_read_file', 'holo_write_file', 'holo_edit_file',
  'holo_run_tests_targeted', 'holo_verify_before_commit',
  'holo_git_commit', 'holo_run_related_tests',
]);

// ─── LLM Micro-Call ──────────────────────────────────────────────────────────
// Instead of one mega-call per cycle, the bridge makes focused micro-calls
// for specific tasks. This is the core architectural difference.

async function callLLMForAction(
  anthropic: Anthropic,
  handlers: Array<(name: string, args: Record<string, unknown>) => Promise<unknown | null>>,
  toolDefs: any[],
  actionContext: string,
  config: BridgeConfig,
  maxToolCalls: number = 8,
): Promise<{ result: string; inputTokens: number; outputTokens: number; toolCallsTotal: number; toolCallsUseful: number; filesEdited: string[] }> {
  const tools: Anthropic.Tool[] = toolDefs.map((t: any) => ({
    name: t.name,
    description: t.description ?? '',
    input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
  }));

  let messages: Anthropic.MessageParam[] = [
    { role: 'user', content: actionContext },
  ];

  let totalInput = 0;
  let totalOutput = 0;
  let toolCalls = 0;
  let usefulCalls = 0;
  let lastText = '';
  const filesEdited: string[] = [];

  while (toolCalls < maxToolCalls) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: `You are a focused code improvement agent. Complete the specific task described. Use the tools provided. Be concise and action-oriented. Root directory: ${config.rootDir}`,
      tools,
      messages,
    });

    if (response.usage) {
      totalInput += response.usage.input_tokens;
      totalOutput += response.usage.output_tokens;
    }

    messages.push({ role: 'assistant', content: response.content });

    const textBlocks = response.content.filter((b) => b.type === 'text');
    if (textBlocks.length > 0) {
      lastText = textBlocks.map((b: any) => b.text).join('\n');
    }

    if (response.stop_reason !== 'tool_use') break;

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      toolCalls++;
      if (USEFUL_TOOLS.has(toolUse.name)) usefulCalls++;
      const input = toolUse.input as Record<string, unknown>;

      if (config.verbose) {
        console.log(`    [LLM] ${toolUse.name}(${JSON.stringify(input).slice(0, 100)})`);
      }

      const result = await callTool(handlers, toolUse.name, input);

      if (toolUse.name === 'holo_edit_file' || toolUse.name === 'holo_write_file') {
        const fp = input.filePath as string;
        if (fp && !filesEdited.includes(fp)) filesEdited.push(fp);
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  return {
    result: lastText,
    inputTokens: totalInput,
    outputTokens: totalOutput,
    toolCallsTotal: toolCalls,
    toolCallsUseful: usefulCalls,
    filesEdited,
  };
}

// ─── Action Dispatcher ───────────────────────────────────────────────────────
// Maps behavior tree action names to tool calls and LLM micro-calls.
// This is where the bridge connects HoloScript orchestration to real execution.
// Called ASYNCHRONOUSLY by the executeAction wrapper when the BT ticks an action.

async function dispatchActionAsync(
  actionName: string,
  btBlackboard: Record<string, unknown>,
  anthropic: Anthropic,
  handlers: Array<(name: string, args: Record<string, unknown>) => Promise<unknown | null>>,
  toolDefs: any[],
  config: BridgeConfig,
  metrics: { inputTokens: number; outputTokens: number; toolCallsTotal: number; toolCallsUseful: number },
  runtimeEmit?: (event: string, data: Record<string, unknown>) => void,
): Promise<boolean> {
  // Cast the BT blackboard to our typed interface for safe property access.
  // The BT passes its blackboard as Record<string, unknown> but we store
  // typed values in it (the BT doesn't care about the types, only conditions).
  const blackboard = btBlackboard as unknown as Blackboard;
  const rootDir = config.rootDir;

  switch (actionName) {
    case 'diagnose': {
      // Step 1: Diagnose the codebase for improvement candidates
      console.log(`  [BT] diagnose (focus: ${blackboard.focus})`);

      // Get quality baseline — skip tests for speed (full test run happens in validate_quality)
      const qualityResult = await callTool(handlers, 'holo_validate_quality', { rootDir, skipTests: true });
      try {
        const parsed = JSON.parse(qualityResult);
        blackboard.quality_before = parsed.composite ?? 0;
      } catch { blackboard.quality_before = 0; }

      if (blackboard.focus === 'typefix') {
        // 'typefix' is not a valid holo_self_diagnose focus — use holo_list_type_errors instead
        const typeResult = await callTool(handlers, 'holo_list_type_errors', { rootDir, maxErrors: 10 });
        try {
          const parsed = JSON.parse(typeResult);
          const errors = parsed.errors ?? [];
          // Transform type errors into candidates format, dedup by file
          const byFile = new Map<string, any>();
          for (const e of errors) {
            const filePath = path.isAbsolute(e.file) ? e.file : path.join(rootDir, e.file);
            if (!byFile.has(filePath)) {
              byFile.set(filePath, {
                type: e.code,
                priority: 1,
                symbol: `${e.code} at line ${e.line}`,
                file: filePath,
                line: e.line,
                reason: e.message,
                suggestedAction: `Fix ${e.code}: ${e.message}`,
              });
            }
          }
          blackboard.candidates = [...byFile.values()];
          blackboard.has_candidates = blackboard.candidates.length > 0;
          if (blackboard.candidates.length > 0) {
            blackboard.current_candidate = blackboard.candidates[0];
            blackboard.current_file = blackboard.candidates[0].file;
          }
        } catch {
          blackboard.has_candidates = false;
        }
        metrics.toolCallsTotal += 2;
        metrics.toolCallsUseful += 2;
      } else {
        // Standard diagnosis for coverage/docs/complexity/all
        const diagResult = await callTool(handlers, 'holo_self_diagnose', { focus: blackboard.focus });
        try {
          const parsed = JSON.parse(diagResult);
          const candidates = parsed.candidates ?? [];
          blackboard.candidates = candidates;
          blackboard.has_candidates = candidates.length > 0;
          if (candidates.length > 0) {
            blackboard.current_candidate = candidates[0];
            blackboard.current_file = candidates[0].file;
          }
        } catch {
          blackboard.has_candidates = false;
        }
        metrics.toolCallsTotal += 2;
        metrics.toolCallsUseful += 1;
      }

      return blackboard.has_candidates;
    }

    case 'read_candidate': {
      // Step 3: Read the candidate file
      console.log(`  [BT] read_candidate: ${blackboard.current_file}`);
      if (!blackboard.current_file) return false;

      await callTool(handlers, 'holo_read_file', { filePath: blackboard.current_file });
      metrics.toolCallsTotal += 1;
      metrics.toolCallsUseful += 1;
      return true;
    }

    case 'generate_fix': {
      // Step 4: LLM micro-call — focused on fixing ONE specific issue
      console.log(`  [BT] generate_fix: LLM micro-call for ${blackboard.current_candidate?.symbol || 'unknown'}`);
      if (!blackboard.current_candidate) return false;

      // ── @circuit_breaker: check if circuit is open before calling LLM ──
      // If the circuit is open (too many recent failures), skip the LLM call
      // entirely to save API credits. The circuit auto-recovers after reset_timeout_ms.
      if (blackboard.__circuitOpen) {
        console.log(`  [BT] generate_fix: SKIPPED — circuit breaker open`);
        blackboard.files_edited = [];
        if (runtimeEmit) {
          runtimeEmit('logger:warn', {
            message: 'LLM call skipped — circuit breaker open',
            fields: { focus: blackboard.focus, candidate: blackboard.current_candidate?.symbol },
          });
        }
        return true; // Proceed to verify_compilation which will fail gracefully
      }

      // ── @circuit_breaker: signal execution start ──
      const cbId = `cb_fix_${Date.now()}`;
      blackboard.__currentCbId = cbId;
      if (runtimeEmit) {
        runtimeEmit('circuit_breaker:execute', {
          action: 'llm_generate',
          params: { focus: blackboard.focus, cbId },
        });
      }

      const focus = blackboard.focus;
      const candidate = blackboard.current_candidate;
      let prompt: string;

      if (focus === 'typefix') {
        prompt = `Fix TypeScript type errors in ${candidate.file}. Use holo_read_file to read the file first, then use holo_edit_file to fix the errors. Focus on error code ${candidate.type || 'any'}. Fix ALL errors of that type in the file, not just one.`;
      } else if (focus === 'coverage') {
        prompt = `Create a test file for ${candidate.symbol} in ${candidate.file}. Use holo_read_file to understand the code, then use holo_write_file to create a comprehensive test file. Write REAL tests with actual assertions, not placeholders.`;
      } else if (focus === 'docs') {
        prompt = `Add JSDoc documentation to ${candidate.symbol} in ${candidate.file}. Use holo_read_file to understand the code, then use holo_edit_file to add documentation.`;
      } else {
        prompt = `Improve ${candidate.symbol} in ${candidate.file}. Reason: ${candidate.reason || 'general improvement'}. Use holo_read_file first, then apply a targeted fix with holo_edit_file.`;
      }

      const llmResult = await callLLMForAction(anthropic, handlers, toolDefs, prompt, config, 8);

      metrics.inputTokens += llmResult.inputTokens;
      metrics.outputTokens += llmResult.outputTokens;
      metrics.toolCallsTotal += llmResult.toolCallsTotal;
      metrics.toolCallsUseful += llmResult.toolCallsUseful;
      blackboard.files_edited.push(...llmResult.filesEdited);

      // ── @economy: emit LLM spend event ──
      if (runtimeEmit) {
        const cost = calculateCostUSD(llmResult.inputTokens, llmResult.outputTokens);
        runtimeEmit('economy:spend', {
          agentId: 'daemon',
          amount: cost,
          reason: `generate_fix:${blackboard.focus}`,
        });
      }

      // Always succeed — if LLM didn't edit any files, verify_compilation will
      // set compilation_passed=false and the selector handles the rollback path.
      return true;
    }

    case 'verify_compilation': {
      // Step 5: Verify the edit compiles
      // IMPORTANT: Always return true — set blackboard.compilation_passed for the
      // condition node in handle_verification selector. If we return false here,
      // the parent sequence aborts and the rollback action never executes.
      console.log(`  [BT] verify_compilation: ${blackboard.files_edited.join(', ')}`);
      if (blackboard.files_edited.length === 0) {
        blackboard.compilation_passed = false;
        return true; // Let the condition gate handle it
      }

      const verifyResult = await callTool(handlers, 'holo_verify_before_commit', {
        rootDir,
        files: blackboard.files_edited,
      });

      try {
        const parsed = JSON.parse(verifyResult);
        blackboard.compilation_passed = parsed.safe === true;
      } catch {
        blackboard.compilation_passed = false;
      }

      metrics.toolCallsTotal += 1;
      metrics.toolCallsUseful += 1;

      // ── @circuit_breaker: report result after verification ──
      // Success = compilation passed. Failure = compilation failed.
      // After failure_threshold failures, the circuit opens and skips future LLM calls.
      if (runtimeEmit && blackboard.__currentCbId) {
        runtimeEmit('circuit_breaker:result', {
          cbId: blackboard.__currentCbId,
          success: blackboard.compilation_passed,
          error: blackboard.compilation_passed ? undefined : 'compilation_failed',
        });
      }

      return true; // Always succeed — condition node checks compilation_passed
    }

    case 'run_related_tests': {
      // Step 7: Run tests related to the changed files
      console.log(`  [BT] run_related_tests: ${blackboard.files_edited.join(', ')}`);
      if (blackboard.files_edited.length === 0) {
        blackboard.tests_passed = true; // No files = no tests to fail
        return true;
      }

      const testResult = await callTool(handlers, 'holo_run_related_tests', {
        rootDir,
        sourceFiles: blackboard.files_edited,
      });

      try {
        const parsed = JSON.parse(testResult);
        blackboard.tests_passed = parsed.success === true || parsed.noRelatedTests === true;
      } catch {
        blackboard.tests_passed = false;
      }

      metrics.toolCallsTotal += 1;
      metrics.toolCallsUseful += 1;
      return true; // Always succeed — condition node checks tests_passed
    }

    case 'validate_quality': {
      // Step 9: Full quality validation
      // Use skipTests for speed — the verify_compilation + run_related_tests steps
      // already validated the changes. Full vitest on 10K+ tests takes 5+ minutes
      // and crashes on edited files, producing false 0.000 composites.
      console.log(`  [BT] validate_quality`);
      const qualityResult = await callTool(handlers, 'holo_validate_quality', { rootDir, skipTests: true });

      try {
        const parsed = JSON.parse(qualityResult);
        blackboard.quality_after = parsed.composite ?? 0;
        blackboard.quality_improved = blackboard.quality_after > blackboard.quality_before;
        if (config.verbose) {
          console.log(`  [quality] composite=${parsed.composite?.toFixed(3)} typeCheck=${parsed.scores?.typeCheck?.score?.toFixed(3)} lint=${parsed.scores?.lint?.score?.toFixed(3)}`);
        }
      } catch {
        console.warn(`  [quality] Failed to parse quality result: ${qualityResult.slice(0, 200)}`);
        blackboard.quality_after = 0;
        blackboard.quality_improved = false;
      }

      metrics.toolCallsTotal += 1;
      metrics.toolCallsUseful += 1;

      // ── @feedback_loop: emit quality_score metric ──
      // FeedbackLoopTrait.onEvent looks up payload.name in state.metrics Map.
      // The .hsplus defines quality_score (target 0.80) and cost_efficiency (target 0.50).
      if (runtimeEmit) {
        runtimeEmit('feedback:update_metric', {
          name: 'quality_score',
          value: blackboard.quality_after,
        });
      }

      return blackboard.quality_improved;
    }

    case 'commit_changes': {
      // Step 11: Commit changes
      if (!config.commit) {
        console.log(`  [BT] commit_changes: SKIPPED (dry run)`);
        return true;
      }
      console.log(`  [BT] commit_changes: committing ${blackboard.files_edited.length} files`);
      const commitResult = await callTool(handlers, 'holo_git_commit', {
        rootDir,
        message: `fix: ${blackboard.focus} improvement — ${blackboard.current_candidate?.symbol || 'auto'} (bridge cycle ${blackboard.cycle_number})`,
        files: blackboard.files_edited,
      });

      metrics.toolCallsTotal += 1;
      metrics.toolCallsUseful += 1;

      try {
        const parsed = JSON.parse(commitResult);
        return !parsed.error;
      } catch {
        return false;
      }
    }

    case 'rollback_changes': {
      // Rollback: revert edited files using git — quality unchanged
      console.log(`  [BT] rollback_changes: reverting ${blackboard.files_edited.length} files`);
      blackboard.quality_after = blackboard.quality_before; // Nothing changed after rollback
      if (blackboard.files_edited.length > 0) {
        const { execSync } = await import('child_process');
        for (const file of blackboard.files_edited) {
          try {
            // Try git checkout first (for tracked files)
            execSync(`git checkout -- "${file}"`, { cwd: rootDir, stdio: 'pipe' });
          } catch {
            try {
              // File might be untracked (newly created) — check and remove
              const status = execSync(`git status --porcelain "${file}"`, { cwd: rootDir, encoding: 'utf-8' });
              if (status.startsWith('??') || status.startsWith('A ')) {
                fs.unlinkSync(file);
                console.log(`    Removed untracked file: ${path.basename(file)}`);
              }
            } catch (err2: any) {
              console.error(`  [BT] rollback failed for ${path.basename(file)}: ${err2.message}`);
            }
          }
        }
      }
      blackboard.files_edited = [];
      return true;
    }

    case 'report_no_candidates': {
      console.log(`  [BT] No improvement candidates found for focus: ${blackboard.focus}`);
      // Preserve quality — nothing was changed
      blackboard.quality_after = blackboard.quality_before;
      return true;
    }

    case 'report_results': {
      const delta = blackboard.quality_after - blackboard.quality_before;
      console.log(`  [BT] report: quality ${blackboard.quality_before.toFixed(3)} → ${blackboard.quality_after.toFixed(3)} (Δ${delta >= 0 ? '+' : ''}${delta.toFixed(3)})`);

      // ── @feedback_loop: emit cost_efficiency metric ──
      if (runtimeEmit) {
        const costSoFar = calculateCostUSD(metrics.inputTokens, metrics.outputTokens);
        const efficiency = costSoFar > 0 ? Math.min(1, Math.max(0, delta / costSoFar)) : 0;
        runtimeEmit('feedback:update_metric', {
          name: 'cost_efficiency',
          value: efficiency,
        });

        // ── @transform: emit raw cycle telemetry ──
        // TransformTrait picks fields, computes qualityDelta + tokensPerDollar,
        // and emits the normalized result as daemon:cycle_telemetry.
        runtimeEmit('daemon:cycle_raw_telemetry', {
          focus: blackboard.focus,
          ticks: blackboard.__tickCount ?? 0,
          inputTokens: metrics.inputTokens,
          outputTokens: metrics.outputTokens,
          qualityBefore: blackboard.quality_before,
          qualityAfter: blackboard.quality_after,
          costUSD: costSoFar,
          committed: blackboard.quality_improved === true,
          filesEdited: blackboard.files_edited?.length ?? 0,
          circuitOpen: blackboard.__circuitOpen ?? false,
        });
      }

      return true;
    }

    default:
      console.log(`  [BT] unknown action: ${actionName}`);
      return false;
  }
}

// ─── Cost Calculation ────────────────────────────────────────────────────────

function calculateCostUSD(inputTokens: number, outputTokens: number): number {
  return (inputTokens * 3 + outputTokens * 15) / 1_000_000;
}

// ─── HeadlessRuntime Bridge Cycle ─────────────────────────────────────────────
// Creates a HeadlessRuntime from the parsed .hsplus composition, wires the
// executeAction callback so the BehaviorTreeTrait drives tool dispatch,
// then ticks until the BT completes. THIS IS THE REAL HOLOSCRIPT INTEGRATION.

async function runBridgeCycle(
  compositionAST: any,
  anthropic: Anthropic,
  handlers: Array<(name: string, args: Record<string, unknown>) => Promise<unknown | null>>,
  toolDefs: any[],
  config: BridgeConfig,
  bridgeState: BridgeState,
): Promise<{ qualityBefore: number; qualityAfter: number; inputTokens: number; outputTokens: number; toolCallsTotal: number; toolCallsUseful: number; filesEdited: string[] }> {
  const FOCUS_ROTATION = ['typefix', 'coverage', 'typefix', 'docs', 'typefix', 'complexity', 'all'];
  const focus = FOCUS_ROTATION[bridgeState.focusIndex % FOCUS_ROTATION.length];
  const cycleNumber = bridgeState.totalCycles + 1;

  console.log(`\n━━━ BT Cycle ${cycleNumber} (focus: ${focus}) ━━━━━━━━━━━━━━━━━━━━━━`);

  // Metrics accumulator (shared across all action dispatches)
  const metrics = { inputTokens: 0, outputTokens: 0, toolCallsTotal: 0, toolCallsUseful: 0 };

  // Pending async actions — bridges async tool calls to the BT's sync executeAction
  const pendingActions = new Map<string, { resolved: boolean; result: boolean }>();

  // Create the executeAction callback for HeadlessRuntime's TraitContext.
  // This is called synchronously by BehaviorTreeTrait.tickAction() on every tick.
  // Returns true (success), false (failure), or 'running' (async in progress).
  const executeActionCallback = (
    _owner: unknown,
    actionName: string,
    _params: Record<string, unknown>,
    blackboard?: Record<string, unknown>,
  ): boolean | 'running' => {
    if (!blackboard) return false;

    // Inject cycle context into BT blackboard on every action call
    // (The .hsplus only defines condition flags; we add runtime context here)
    if (!blackboard.focus) {
      blackboard.focus = focus;
      blackboard.cycle_number = cycleNumber;
      blackboard.candidates = [];
      blackboard.current_candidate = null;
      blackboard.current_file = null;
      blackboard.files_edited = blackboard.files_edited ?? [];
    }
    // Always sync circuit breaker state into blackboard so generate_fix can check it
    blackboard.__circuitOpen = circuitOpen;

    // Check if a previously started async action has resolved
    const pending = pendingActions.get(actionName);
    if (pending) {
      if (pending.resolved) {
        pendingActions.delete(actionName);
        return pending.result;
      }
      return 'running'; // Still waiting for async op
    }

    // Start a new async action via dispatchActionAsync
    const entry = { resolved: false, result: false };
    dispatchActionAsync(actionName, blackboard, anthropic, handlers, toolDefs, config, metrics, runtimeEmit)
      .then((result) => {
        entry.resolved = true;
        entry.result = result;
      })
      .catch((err) => {
        console.error(`  [BT] Action '${actionName}' threw: ${err.message}`);
        entry.resolved = true;
        entry.result = false;
      });
    pendingActions.set(actionName, entry);
    return 'running';
  };

  // Deep-clone the AST so each cycle gets fresh node objects.
  // BT trait state (__bt_state, __bt_blackboard) is stored on nodes —
  // without cloning, cycle 2+ would see stale "completed" state from cycle 1.
  // Use structuredClone to preserve Maps (node.traits is a Map).
  const freshAST = structuredClone(compositionAST);

  // Create HeadlessRuntime from the cloned .hsplus composition
  const runtime = createHeadlessRuntime(freshAST, {
    profile: HEADLESS_PROFILE,
    executeAction: executeActionCallback,
    tickRate: 0, // Manual ticking only — we control the loop
    debug: config.verbose,
  });

  // ── @feedback_loop + @economy: create event emitter bound to this runtime ──
  // Events emitted here flow through HeadlessRuntime's event bus, reaching any
  // FeedbackLoopTrait or EconomyTrait attached to nodes in the .hsplus composition.
  const runtimeEmit = (event: string, data: Record<string, unknown>) => {
    try {
      runtime.emit(event, data);
      if (config.verbose) console.log(`  [trait-event] ${event}`, JSON.stringify(data).slice(0, 120));
    } catch { /* best effort — traits may not be attached */ }
  };

  // Start the runtime — this instantiates nodes, attaches traits (including BT)
  // Blackboard context (focus, cycle_number, etc.) is injected on first action tick
  runtime.start();

  // ── @structured_logger: log cycle start ──
  runtimeEmit('logger:info', {
    message: `Cycle ${cycleNumber} started`,
    fields: { focus, cycle: cycleNumber },
  });

  // Listen for BT completion events — bt_complete includes the final blackboard
  let btComplete = false;
  let btStatus: string = 'unknown';
  let btBlackboard: Record<string, unknown> = {};
  runtime.on('bt_complete', (event: any) => {
    btComplete = true;
    btStatus = event?.status ?? 'unknown';
    btBlackboard = event?.blackboard ?? {};
  });

  // ── @economy: listen for cost circuit breaker events ──
  let budgetExhausted = false;
  runtime.on('economy:spend_limit_exceeded', (event: any) => {
    budgetExhausted = true;
    console.warn(`  [economy] Spend limit exceeded — aborting cycle. Details: ${JSON.stringify(event).slice(0, 200)}`);
  });
  runtime.on('economy:insufficient_funds', (event: any) => {
    budgetExhausted = true;
    console.warn(`  [economy] Insufficient funds — aborting cycle. Details: ${JSON.stringify(event).slice(0, 200)}`);
  });

  // ── @circuit_breaker: track circuit state ──
  let circuitOpen = false;

  // ── @circuit_breaker: listen for circuit state changes ──
  // When the circuit opens, set a flag on the blackboard so generate_fix skips the LLM call.
  // The circuit auto-recovers to half-open after reset_timeout_ms (60s in composition).
  runtime.on('circuit_breaker:opened', (event: any) => {
    console.warn(`  [circuit_breaker] Circuit OPENED — ${event?.failureCount ?? '?'} failures in window. Skipping LLM calls for ${Math.round((60000) / 1000)}s.`);
    // Inject into pending blackboard — next generate_fix will check this
    circuitOpen = true;
  });
  runtime.on('circuit_breaker:closed', (event: any) => {
    console.log(`  [circuit_breaker] Circuit CLOSED — recovered after ${Math.round((event?.recoveredAfterMs ?? 0) / 1000)}s.`);
    circuitOpen = false;
  });
  runtime.on('circuit_breaker:half_opened', () => {
    console.log(`  [circuit_breaker] Circuit HALF-OPEN — testing next LLM call.`);
    circuitOpen = false; // Allow one test call through
  });
  runtime.on('circuit_breaker:rejected', (event: any) => {
    console.log(`  [circuit_breaker] Action REJECTED — circuit open, ${Math.round((event?.remainingMs ?? 0) / 1000)}s remaining.`);
  });

  // ── @scheduler: activate periodic jobs after runtime starts ──
  // Resume the pre-configured jobs so they start firing.
  runtimeEmit('scheduler:resume_job', { jobId: 'quality_heartbeat' });
  runtimeEmit('scheduler:resume_job', { jobId: 'test_watchdog' });

  // Listen for scheduler job triggers — log them as structured events
  runtime.on('scheduler:job_triggered', (event: any) => {
    if (config.verbose) {
      console.log(`  [scheduler] Job fired: ${event?.jobId} (execution #${event?.executionCount})`);
    }
  });

  // Listen for quality heartbeat — the scheduler fires this periodically
  runtime.on('daemon:quality_heartbeat', () => {
    if (config.verbose) {
      console.log(`  [scheduler] Quality heartbeat — will re-check baseline on next cycle`);
    }
  });

  // ── @buffer: listen for batch flushes ──
  runtime.on('daemon:cost_batch_flushed', (event: any) => {
    const items = event?.items ?? [];
    const totalCost = items.reduce((sum: number, e: any) => sum + (e?.amount ?? 0), 0);
    if (config.verbose) {
      console.log(`  [buffer] Cost batch flushed: ${items.length} items, total $${totalCost.toFixed(3)}`);
    }
  });
  runtime.on('daemon:telemetry_batch_flushed', (event: any) => {
    if (config.verbose) {
      console.log(`  [buffer] Telemetry batch flushed: ${event?.count ?? 0} cycles`);
    }
  });

  // ── @transform: listen for normalized telemetry output ──
  runtime.on('daemon:cycle_telemetry', (event: any) => {
    if (config.verbose) {
      const delta = event?.qualityDelta?.toFixed(3) ?? '?';
      const tpd = event?.tokensPerDollar ? Math.round(event.tokensPerDollar) : '?';
      console.log(`  [transform] Cycle telemetry: Δ${delta}, ${tpd} tokens/$`);
    }
  });

  // Tick the runtime until the BT completes or we hit a safety limit
  const MAX_TICKS = 50_000; // Safety valve (~2.5h at 200ms yield per tick)
  const TICK_DELTA = 0.1; // 100ms simulated delta
  let tickCount = 0;

  while (!btComplete && !budgetExhausted && tickCount < MAX_TICKS) {
    runtime.manualTick(TICK_DELTA);
    tickCount++;

    // Yield to allow async Promises to resolve between ticks
    // This is critical: without yielding, pending actions never complete
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  // ── @structured_logger: log cycle completion ──
  runtimeEmit('logger:info', {
    message: `Cycle ${cycleNumber} finished`,
    fields: {
      focus,
      ticks: tickCount,
      btStatus,
      budgetExhausted,
      inputTokens: metrics.inputTokens,
      outputTokens: metrics.outputTokens,
    },
  });

  // ── Cleanup: pause scheduler jobs + flush buffers before stopping ──
  runtimeEmit('scheduler:pause_job', { jobId: 'quality_heartbeat' });
  runtimeEmit('scheduler:pause_job', { jobId: 'test_watchdog' });
  runtimeEmit('buffer:force_flush', { channelId: 'cost_batch' });
  runtimeEmit('buffer:force_flush', { channelId: 'telemetry_batch' });

  runtime.stop();

  if (tickCount >= MAX_TICKS) {
    console.warn(`  [BT] Safety limit reached (${MAX_TICKS} ticks). BT may not have completed.`);
  }

  // Extract results from the BT's blackboard (emitted with bt_complete event)
  const qualityBefore = (btBlackboard.quality_before as number) ?? 0;
  const qualityAfter = (btBlackboard.quality_after as number) ?? qualityBefore;
  const filesEdited = (btBlackboard.files_edited as string[]) ?? [];

  console.log(`  [Runtime] BT completed: ${btStatus} (${tickCount} ticks)`);

  // Mark attempted files
  for (const f of filesEdited) {
    if (!bridgeState.attemptedFiles.includes(f)) {
      bridgeState.attemptedFiles.push(f);
    }
  }
  if (bridgeState.attemptedFiles.length > 50) {
    bridgeState.attemptedFiles = bridgeState.attemptedFiles.slice(-50);
  }

  return {
    qualityBefore,
    qualityAfter,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    toolCallsTotal: metrics.toolCallsTotal,
    toolCallsUseful: metrics.toolCallsUseful,
    filesEdited,
  };
}

// ─── Configuration ───────────────────────────────────────────────────────────

function parseArgs(): BridgeConfig {
  const args = process.argv.slice(2);
  const config: BridgeConfig = {
    commit: args.includes('--commit'),
    cycles: 1,
    rootDir: REPO_ROOT,
    verbose: args.includes('--verbose') || args.includes('-v'),
  };

  const cyclesIdx = args.indexOf('--cycles');
  if (cyclesIdx !== -1 && args[cyclesIdx + 1]) {
    config.cycles = parseInt(args[cyclesIdx + 1], 10) || 1;
  }

  const trialIdx = args.indexOf('--trial');
  if (trialIdx !== -1 && args[trialIdx + 1]) {
    config.trial = parseInt(args[trialIdx + 1], 10);
  }

  const rootIdx = args.indexOf('--root');
  if (rootIdx !== -1 && args[rootIdx + 1]) {
    config.rootDir = path.resolve(args[rootIdx + 1]);
  }

  return config;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY required.');
    process.exit(1);
  }

  // Acquire file lock — prevent concurrent instances (G.ARCH.001 Symptom #3)
  if (!acquireLock()) {
    console.error('Another bridge instance is running. Exiting.');
    process.exit(1);
  }

  process.on('SIGINT', () => { releaseLock(); process.exit(0); });
  process.on('SIGTERM', () => { releaseLock(); process.exit(0); });

  // Parse the .hsplus composition — this is THE CORE of the treatment arm.
  // The BT structure, state machine, feedback loops, and economy traits are
  // all defined in HoloScript's native format and executed through HeadlessRuntime.
  console.log('Parsing .hsplus composition...');
  let compositionAST: any;
  try {
    const compositionSource = fs.readFileSync(COMPOSITION_FILE, 'utf-8');
    const parseResult = parse(compositionSource);
    if (!parseResult.success) {
      console.error('Failed to parse .hsplus:', parseResult.errors);
      releaseLock();
      process.exit(1);
    }
    compositionAST = parseResult.ast;
    console.log(`  Parsed: ${COMPOSITION_FILE.split(path.sep).pop()} (${compositionSource.split('\n').length} lines)`);
  } catch (err: any) {
    console.error(`Failed to read composition: ${err.message}`);
    releaseLock();
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🧪 HoloScript Self-Improvement Bridge (Treatment Arm)     ║');
  console.log('║  Runtime: HeadlessRuntime + BehaviorTreeTrait (native)      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Root:     ${config.rootDir}`);
  console.log(`  Cycles:   ${config.cycles}`);
  console.log(`  Commit:   ${config.commit ? 'YES' : 'NO (dry run)'}`);
  console.log(`  Model:    ${MODEL}`);
  console.log(`  Trial:    ${config.trial ?? 'unset'}`);
  console.log('');

  // Load tools (same handlers as control daemon)
  console.log('Loading HoloScript tools...');
  let handlers: Array<(name: string, args: Record<string, unknown>) => Promise<unknown | null>>;
  let toolDefs: any[];
  try {
    const loaded = await loadToolHandlers();
    handlers = loaded.handlers;
    toolDefs = loaded.toolDefs;
    console.log(`Loaded ${toolDefs.length} tools`);
  } catch (err: any) {
    console.error(`Failed to load tools: ${err.message}`);
    releaseLock();
    process.exit(1);
  }

  const anthropic = new Anthropic();
  const bridgeState = loadBridgeState();

  // Pre-load GraphRAG using bm25 embeddings (forced at startup, no API cost).
  // EMBEDDING_PROVIDER=bm25 is set above loadEnvFile to override .env's openai.
  // Use --openai-embeddings flag for higher quality at the cost of speed + API $.
  console.log(`Pre-loading GraphRAG (provider: ${process.env.EMBEDDING_PROVIDER})...`);
  let graphRAGReady = false;
  try {
    const statusResult = await callTool(handlers, 'holo_graph_status', {});
    const status = JSON.parse(statusResult);

    if (status.inMemory && status.graphRAGReady) {
      console.log('  Graph already in memory — skipping absorb');
      graphRAGReady = true;
    } else {
      // Absorb with force=false — uses disk cache if fresh (<24h), otherwise re-scans.
      // bm25 embedding rebuild from cached graph takes ~2s vs 10+ min for OpenAI.
      const label = status.diskCache?.fresh
        ? `Loading from disk cache (${status.diskCache.ageHuman})...`
        : 'Scanning codebase (first run)...';
      console.log(`  ${label}`);

      const absorbPromise = callTool(handlers, 'holo_absorb_repo', {
        rootDir: config.rootDir, outputFormat: 'stats',
      });
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Absorb timed out after 120s')), 120_000),
      );
      const absorbResult = await Promise.race([absorbPromise, timeoutPromise]);
      const parsed = JSON.parse(absorbResult);
      if (!parsed.error) {
        const src = parsed.cached ? 'cache' : 'scan';
        console.log(`  Loaded ${parsed.totalSymbols ?? parsed.stats?.totalSymbols ?? '?'} symbols from ${src}`);
        graphRAGReady = true;
      } else {
        console.warn(`  Absorb warning: ${parsed.error}`);
      }
    }
  } catch (err: any) {
    console.warn(`  GraphRAG pre-load skipped: ${err.message}`);
  }
  if (!graphRAGReady) {
    console.warn('  GraphRAG unavailable — non-typefix cycles may return 0 candidates.');
  }

  console.log(`Resuming from cycle ${bridgeState.totalCycles}, best quality: ${bridgeState.bestQuality.toFixed(3)}`);
  console.log('');

  for (let i = 0; i < config.cycles; i++) {
    const startTime = Date.now();

    try {
      const result = await runBridgeCycle(compositionAST, anthropic, handlers, toolDefs, config, bridgeState);
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

      // Update state
      bridgeState.totalCycles++;
      bridgeState.focusIndex++;
      bridgeState.lastQuality = result.qualityAfter;
      bridgeState.totalInputTokens += result.inputTokens;
      bridgeState.totalOutputTokens += result.outputTokens;

      if (result.qualityAfter > bridgeState.bestQuality) {
        bridgeState.bestQuality = result.qualityAfter;
        console.log(`  New best quality: ${result.qualityAfter.toFixed(3)}`);
      }

      const costUSD = calculateCostUSD(result.inputTokens, result.outputTokens);
      bridgeState.totalCostUSD += costUSD;

      saveBridgeState(bridgeState);

      // Log to shared quality history (same format as control)
      appendQualityHistory({
        timestamp: new Date().toISOString(),
        cycle: bridgeState.totalCycles,
        composite: result.qualityAfter,
        grade: result.qualityAfter >= 0.9 ? 'A' : result.qualityAfter >= 0.8 ? 'B' : result.qualityAfter >= 0.7 ? 'C' : result.qualityAfter >= 0.5 ? 'D' : 'F',
        focus: ['typefix', 'coverage', 'typefix', 'docs', 'typefix', 'complexity', 'all'][(bridgeState.focusIndex - 1) % 7],
        summary: `Bridge cycle ${bridgeState.totalCycles}: quality ${result.qualityBefore.toFixed(3)} → ${result.qualityAfter.toFixed(3)}`,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUSD,
        toolCallsTotal: result.toolCallsTotal,
        toolCallsUseful: result.toolCallsUseful,
        durationSeconds: parseFloat(durationSec),
        arm: 'treatment',
        trial: config.trial,
      });

      const delta = result.qualityAfter - result.qualityBefore;
      console.log(`\nCycle ${i + 1}/${config.cycles} (${durationSec}s) — quality: ${result.qualityAfter.toFixed(3)} (Δ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}) — $${costUSD.toFixed(3)}`);
    } catch (err: any) {
      console.error(`Cycle ${i + 1} failed: ${err.message}`);
      if (config.verbose) console.error(err.stack);
    }
  }

  console.log(`\nExperiment summary:`);
  console.log(`  Total cycles: ${bridgeState.totalCycles}`);
  console.log(`  Best quality: ${bridgeState.bestQuality.toFixed(3)}`);
  console.log(`  Total cost: $${bridgeState.totalCostUSD.toFixed(3)}`);
  console.log(`  Total tokens: ${bridgeState.totalInputTokens} in / ${bridgeState.totalOutputTokens} out`);

  releaseLock();
  console.log('Bridge session complete.');
}

main().catch((err) => {
  releaseLock();
  console.error('Fatal error:', err);
  process.exit(1);
});
