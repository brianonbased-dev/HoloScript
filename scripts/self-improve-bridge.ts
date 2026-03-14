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

async function executeAction(
  actionName: string,
  blackboard: Blackboard,
  anthropic: Anthropic,
  handlers: Array<(name: string, args: Record<string, unknown>) => Promise<unknown | null>>,
  toolDefs: any[],
  config: BridgeConfig,
  metrics: { inputTokens: number; outputTokens: number; toolCallsTotal: number; toolCallsUseful: number },
): Promise<boolean> {
  const rootDir = config.rootDir;

  switch (actionName) {
    case 'diagnose': {
      // Step 1: Diagnose the codebase for improvement candidates
      console.log(`  [BT] diagnose (focus: ${blackboard.focus})`);

      // Get quality baseline
      const qualityResult = await callTool(handlers, 'holo_validate_quality', { rootDir });
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

      return llmResult.filesEdited.length > 0;
    }

    case 'verify_compilation': {
      // Step 5: Verify the edit compiles
      console.log(`  [BT] verify_compilation: ${blackboard.files_edited.join(', ')}`);
      if (blackboard.files_edited.length === 0) {
        blackboard.compilation_passed = false;
        return false;
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
      return blackboard.compilation_passed;
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
      return blackboard.tests_passed;
    }

    case 'validate_quality': {
      // Step 9: Full quality validation
      console.log(`  [BT] validate_quality`);
      const qualityResult = await callTool(handlers, 'holo_validate_quality', { rootDir });

      try {
        const parsed = JSON.parse(qualityResult);
        blackboard.quality_after = parsed.composite ?? 0;
        blackboard.quality_improved = blackboard.quality_after > blackboard.quality_before;
      } catch {
        blackboard.quality_after = 0;
        blackboard.quality_improved = false;
      }

      metrics.toolCallsTotal += 1;
      metrics.toolCallsUseful += 1;
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
      // Rollback: revert edited files using git
      console.log(`  [BT] rollback_changes: reverting ${blackboard.files_edited.length} files`);
      if (blackboard.files_edited.length > 0) {
        try {
          const { execSync } = await import('child_process');
          for (const file of blackboard.files_edited) {
            execSync(`git checkout -- "${file}"`, { cwd: rootDir });
          }
        } catch (err: any) {
          console.error(`  [BT] rollback failed: ${err.message}`);
        }
      }
      blackboard.files_edited = [];
      return true;
    }

    case 'report_no_candidates': {
      console.log(`  [BT] No improvement candidates found for focus: ${blackboard.focus}`);
      return true;
    }

    case 'report_results': {
      const delta = blackboard.quality_after - blackboard.quality_before;
      console.log(`  [BT] report: quality ${blackboard.quality_before.toFixed(3)} → ${blackboard.quality_after.toFixed(3)} (Δ${delta >= 0 ? '+' : ''}${delta.toFixed(3)})`);
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

// ─── Bridge Cycle ────────────────────────────────────────────────────────────
// Runs one complete improvement cycle by driving the behavior tree manually.
// Instead of using HeadlessRuntime's tick loop, we drive the behavior tree
// step by step, awaiting each async action before advancing.

async function runBridgeCycle(
  anthropic: Anthropic,
  handlers: Array<(name: string, args: Record<string, unknown>) => Promise<unknown | null>>,
  toolDefs: any[],
  config: BridgeConfig,
  bridgeState: BridgeState,
): Promise<{ qualityBefore: number; qualityAfter: number; inputTokens: number; outputTokens: number; toolCallsTotal: number; toolCallsUseful: number; filesEdited: string[] }> {
  const FOCUS_ROTATION = ['typefix', 'coverage', 'typefix', 'docs', 'typefix', 'complexity', 'all'];
  const focus = FOCUS_ROTATION[bridgeState.focusIndex % FOCUS_ROTATION.length];

  // Initialize blackboard
  const blackboard: Blackboard = {
    has_candidates: false,
    compilation_passed: false,
    tests_passed: false,
    quality_improved: false,
    current_file: null,
    current_candidate: null,
    candidates: [],
    quality_before: 0,
    quality_after: 0,
    files_edited: [],
    focus,
    cycle_number: bridgeState.totalCycles + 1,
    error_message: null,
  };

  const metrics = { inputTokens: 0, outputTokens: 0, toolCallsTotal: 0, toolCallsUseful: 0 };

  // Drive the behavior tree manually — this mirrors the BT structure from the .hsplus
  // but executes it imperatively so we can await async actions.

  console.log(`\n━━━ BT Cycle ${blackboard.cycle_number} (focus: ${focus}) ━━━━━━━━━━━━━━━━━━━━━━`);

  // Step 1: Diagnose
  await executeAction('diagnose', blackboard, anthropic, handlers, toolDefs, config, metrics);

  if (blackboard.has_candidates) {
    // Step 3: Read candidate
    await executeAction('read_candidate', blackboard, anthropic, handlers, toolDefs, config, metrics);

    // Step 4: Generate fix (LLM micro-call)
    const fixGenerated = await executeAction('generate_fix', blackboard, anthropic, handlers, toolDefs, config, metrics);

    if (fixGenerated && blackboard.files_edited.length > 0) {
      // Step 5: Verify compilation
      await executeAction('verify_compilation', blackboard, anthropic, handlers, toolDefs, config, metrics);

      if (blackboard.compilation_passed) {
        // Step 7: Run tests
        await executeAction('run_related_tests', blackboard, anthropic, handlers, toolDefs, config, metrics);

        if (blackboard.tests_passed) {
          // Step 9: Validate quality
          await executeAction('validate_quality', blackboard, anthropic, handlers, toolDefs, config, metrics);

          if (blackboard.quality_improved) {
            // Step 11: Commit
            await executeAction('commit_changes', blackboard, anthropic, handlers, toolDefs, config, metrics);
          } else {
            await executeAction('rollback_changes', blackboard, anthropic, handlers, toolDefs, config, metrics);
          }
        } else {
          await executeAction('rollback_changes', blackboard, anthropic, handlers, toolDefs, config, metrics);
        }
      } else {
        await executeAction('rollback_changes', blackboard, anthropic, handlers, toolDefs, config, metrics);
      }
    } else if (blackboard.files_edited.length === 0) {
      console.log('  [BT] No files edited — skipping verification');
    }
  } else {
    await executeAction('report_no_candidates', blackboard, anthropic, handlers, toolDefs, config, metrics);
  }

  // Step 12: Report
  await executeAction('report_results', blackboard, anthropic, handlers, toolDefs, config, metrics);

  // Mark attempted files
  for (const f of blackboard.files_edited) {
    if (!bridgeState.attemptedFiles.includes(f)) {
      bridgeState.attemptedFiles.push(f);
    }
  }
  if (bridgeState.attemptedFiles.length > 50) {
    bridgeState.attemptedFiles = bridgeState.attemptedFiles.slice(-50);
  }

  return {
    qualityBefore: blackboard.quality_before,
    qualityAfter: blackboard.quality_after,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    toolCallsTotal: metrics.toolCallsTotal,
    toolCallsUseful: metrics.toolCallsUseful,
    filesEdited: blackboard.files_edited,
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

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🧪 HoloScript Self-Improvement Bridge (Treatment Arm)     ║');
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
      const result = await runBridgeCycle(anthropic, handlers, toolDefs, config, bridgeState);
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
