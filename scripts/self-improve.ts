#!/usr/bin/env npx tsx
/**
 * HoloScript Self-Improvement Daemon — Native .hsplus Bridge
 *
 * THE primary daemon entry point. Connects the .hsplus self-improve-daemon
 * composition to real tool handlers via HeadlessRuntime. Parses the .hsplus
 * file, creates a HeadlessRuntime, and dispatches behavior tree actions to
 * actual tool calls and LLM micro-invocations.
 *
 * This is the treatment arm that won the G.ARCH.001 A/B experiment:
 *   - 75% cheaper than standalone TypeScript daemon
 *   - +0.080 quality delta
 *   - 9.6x better quality-per-dollar
 *   - 93.2% tool efficiency
 *
 * The standalone TypeScript control arm has been archived to
 * scripts/archive/self-improve-control-arm.ts.
 *
 * Usage:
 *   npx tsx scripts/self-improve.ts --cycles 15 --commit
 *   npx tsx scripts/self-improve.ts --cycles 3 --verbose
 *
 * @version 2.0.0
 */

import Anthropic from '@anthropic-ai/sdk';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { randomUUID } from 'crypto';

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

// Default to OpenAI embeddings (higher quality, persists index to disk).
// Use --bm25 flag to force free/fast BM25 (no API cost, no persistence).
// Override AFTER loadEnvFile so .env values are respected unless flagged.
if (process.argv.includes('--bm25')) {
  process.env.EMBEDDING_PROVIDER = 'bm25';
} else if (!process.env.EMBEDDING_PROVIDER) {
  process.env.EMBEDDING_PROVIDER = 'openai';
}

const STATE_DIR = path.join(REPO_ROOT, '.holoscript');
const BRIDGE_STATE_FILE = path.join(STATE_DIR, 'bridge-state.json');
const HISTORY_FILE = path.join(STATE_DIR, 'quality-history.json');
const LOCK_FILE = path.join(STATE_DIR, 'bridge.lock');
const COMPOSITION_FILE = path.join(REPO_ROOT, 'compositions', 'self-improve-daemon.hsplus');
const MODEL = 'claude-sonnet-4-20250514';

// W.090 Safeguard: Heartbeat interval and staleness threshold
const HEARTBEAT_INTERVAL_MS = 30_000;   // Refresh lock file every 30s
const HEARTBEAT_STALE_MS = 120_000;     // Lock is stale if not refreshed in 2min
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// G.ARCH.002: Session identity — unique per daemon invocation
const SESSION_ID = randomUUID();

// ─── Safeguard: Candidate Sanitizer ──────────────────────────────────────────
// Reject LLM edits that contain terminal/log output injected into source code.
// These indicate the LLM confused stdout with code, producing compiling but broken files.
const CONTAMINATION_SIGNATURES = [
  /node\.exe\s*:\s*npm\s+warn/i,
  /npm\s+warn\s+Unknown\s+project\s+config/i,
  /Command\s+exited\s+with\s+code\s+\d+/i,
  /^\s*at\s+\w+\s+\(.*:\d+:\d+\)\s*$/m,    // Stack trace lines
  /^\s*ERR!\s/m,                              // npm ERR! lines
];

function isContaminatedEdit(content: string): string | null {
  for (const sig of CONTAMINATION_SIGNATURES) {
    const match = content.match(sig);
    if (match) return match[0].slice(0, 80);
  }
  return null;
}

// ─── Safeguard: Per-File Quarantine ──────────────────────────────────────────
// Files that fail post-apply (compile or test) N times get auto-quarantined.
const QUARANTINE_THRESHOLD = 2;

// ─── Types ───────────────────────────────────────────────────────────────────

interface BridgeConfig {
  commit: boolean;
  cycles: number;
  rootDir: string;
  verbose: boolean;
  trial?: number;
  /** G.ARCH.002: Per-session budget cap in USD (default $5.00) */
  maxSpendUSD: number;
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
  compile_errors: Array<{ line?: number; message: string; code?: string }>;
  retry_count: number;
  focus: string;
  cycle_number: number;
  error_message: string | null;
  // v4.0 motivation fields
  intake_loaded?: boolean;
  cycle_wisdom?: any;
  cycle_praised?: boolean;
  // Internal bridge state (prefixed with __ to avoid .hsplus blackboard collisions)
  __circuitOpen?: boolean;
  __currentCbId?: string;
  __tickCount?: number;
  __attemptedFiles?: string[];
  __blacklistedFiles?: string[];
  /** Index into candidates array for multi-candidate rotation */
  __candidateIndex?: number;
}

interface BridgeState {
  totalCycles: number;
  bestQuality: number;
  lastQuality: number;
  focusIndex: number;
  attemptedFiles: string[];
  /** Files that failed after max retries — skip in future cycles until manually cleared */
  blacklistedFiles: string[];
  /** Per-file failure count — auto-quarantine after QUARANTINE_THRESHOLD failures */
  fileFailureCounts: Record<string, number>;
  /** Known limitations discovered during daemon operation */
  knownLimitations: string[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUSD: number;
  /** G.ARCH.002: UUID of the last daemon session that wrote this state */
  lastSessionId?: string;
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
  /** G.ARCH.002: Links this entry to a specific daemon invocation */
  sessionId?: string;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function ensureStateDir(): void {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

/** G.ARCH.002: Schema validation — detects corrupted state files */
function validateBridgeState(obj: unknown): obj is BridgeState {
  if (!obj || typeof obj !== 'object') return false;
  const s = obj as Record<string, unknown>;
  return typeof s.totalCycles === 'number'
    && typeof s.bestQuality === 'number'
    && typeof s.lastQuality === 'number'
    && Array.isArray(s.attemptedFiles);
}

/** G.ARCH.002: Atomic write — write to tmp then rename (prevents partial JSON on crash) */
function atomicWriteFileSync(filePath: string, content: string): void {
  const tmpFile = filePath + `.${process.pid}.tmp`;
  fs.writeFileSync(tmpFile, content, 'utf-8');
  fs.renameSync(tmpFile, filePath);
}

function loadBridgeState(): BridgeState {
  const defaults: BridgeState = {
    totalCycles: 0,
    bestQuality: 0,
    lastQuality: 0,
    focusIndex: 0,
    attemptedFiles: [],
    blacklistedFiles: [],
    fileFailureCounts: {},
    knownLimitations: [],
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUSD: 0,
  };
  try {
    if (fs.existsSync(BRIDGE_STATE_FILE)) {
      const raw = fs.readFileSync(BRIDGE_STATE_FILE, 'utf-8');
      const loaded = JSON.parse(raw);
      // G.ARCH.002: Validate schema before trusting persisted state
      if (!validateBridgeState(loaded)) {
        console.warn(`[G.ARCH.002] bridge-state.json failed schema validation — using defaults`);
        return defaults;
      }
      // Merge with defaults so new fields added after initial state creation
      // don't crash with "Cannot read properties of undefined"
      const merged = { ...defaults, ...loaded };

      // Per-session budget tracking: reset cost accumulators on new session
      // so --max-spend is truly per-run, not cumulative across all runs
      if (merged.lastSessionId && merged.lastSessionId !== SESSION_ID) {
        console.log(`[Budget] New session — resetting cost accumulators (prev session: ${merged.lastSessionId.slice(0, 8)}…)`);
        merged.totalCostUSD = 0;
        merged.totalInputTokens = 0;
        merged.totalOutputTokens = 0;
        // Reset totalCycles so avgCostPerCycle isn't 0/N = $0.00 (bypasses budget gate).
        // The first-cycle fallback ($1.50) will correctly prevent overcommitting.
        // focusIndex is NOT reset — daemon continues rotating focus from where it left off.
        merged.totalCycles = 0;
      }

      return merged;
    }
  } catch (err) {
    console.warn(`[G.ARCH.002] Failed to load bridge-state.json: ${err instanceof Error ? err.message : err} — using defaults`);
  }
  return defaults;
}

function saveBridgeState(state: BridgeState): void {
  ensureStateDir();
  state.lastSessionId = SESSION_ID;
  atomicWriteFileSync(BRIDGE_STATE_FILE, JSON.stringify(state, null, 2));
}

function appendQualityHistory(entry: QualityEntry): void {
  ensureStateDir();
  let history: QualityEntry[] = [];
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    }
  } catch { /* start fresh */ }
  entry.sessionId = SESSION_ID;
  history.push(entry);
  if (history.length > 500) history = history.slice(-500);
  atomicWriteFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

// ─── File Lock (W.090 Safeguards: heartbeat + staleness detection) ───────────

function acquireLock(): boolean {
  ensureStateDir();
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
      // W.090 Safeguard 1: Check heartbeat staleness BEFORE PID check.
      // If the lock file hasn't been refreshed within HEARTBEAT_STALE_MS,
      // the owning process is likely an orphan (parent died, no cleanup).
      const lockAge = Date.now() - (lockData.heartbeat ?? lockData.time);
      if (lockAge > HEARTBEAT_STALE_MS) {
        console.warn(`Stale lock detected (age: ${(lockAge / 1000).toFixed(0)}s, PID: ${lockData.pid}). Reclaiming.`);
        // Fall through to overwrite
      } else {
        // Lock is fresh — check if the process is still alive
        try {
          process.kill(lockData.pid, 0);
          return false; // Process is alive and lock is fresh
        } catch {
          // Process is dead, reclaim lock
        }
      }
    }
    fs.writeFileSync(LOCK_FILE, JSON.stringify({
      pid: process.pid,
      sessionId: SESSION_ID,
      time: Date.now(),
      heartbeat: Date.now(),
      spentUSD: 0,
      startedAt: new Date().toISOString(),
    }), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/** G.ARCH.002: Heartbeat now persists cumulative spend for external monitoring */
function startHeartbeat(getSpentUSD?: () => number): void {
  heartbeatTimer = setInterval(() => {
    try {
      if (fs.existsSync(LOCK_FILE)) {
        const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
        if (lockData.pid === process.pid) {
          lockData.heartbeat = Date.now();
          if (getSpentUSD) lockData.spentUSD = getSpentUSD();
          fs.writeFileSync(LOCK_FILE, JSON.stringify(lockData), 'utf-8');
        }
      }
    } catch { /* best effort */ }
  }, HEARTBEAT_INTERVAL_MS);
  // Don't let the heartbeat timer prevent process exit
  if (heartbeatTimer && typeof heartbeatTimer === 'object' && 'unref' in heartbeatTimer) {
    heartbeatTimer.unref();
  }
}

function stopHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function releaseLock(): void {
  stopHeartbeat();
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch { /* best effort */ }
}

// ─── W.090 Safeguard 2: API Credit Pre-Check ────────────────────────────────

async function validateApiKeyAndCredits(): Promise<void> {
  const anthropic = new Anthropic();
  try {
    // Minimal API call: 1 input token, max 1 output token — costs ~$0.000003
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'x' }],
    });
    if (response.stop_reason === 'end_turn' || response.stop_reason === 'max_tokens') {
      console.log('  API key validated (pre-check passed)');
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('credit') || message.includes('balance') || message.includes('billing')) {
      throw new Error(`Insufficient API credits. Fix billing before running daemon. Error: ${message}`);
    }
    if (message.includes('auth') || message.includes('key') || message.includes('401')) {
      throw new Error(`Invalid API key. Check ANTHROPIC_API_KEY. Error: ${message}`);
    }
    throw new Error(`API pre-check failed: ${message}`);
  }
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

// ─── Per-Focus Tool Budgets ──────────────────────────────────────────────────
// Different focus areas need different amounts of LLM latitude.
// typefix: needs to read related types across files → more tool calls
// coverage: writes full test files → more output tokens
// docs/complexity/all: moderate budgets
const TOOL_BUDGET: Record<string, number> = {
  typefix: 15,
  coverage: 10,
  docs: 8,
  complexity: 12,
  all: 15,
};

const MAX_OUTPUT_TOKENS: Record<string, number> = {
  typefix: 2048,
  coverage: 4096,   // test files are long
  docs: 2048,
  complexity: 3072,
  all: 3072,
};

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
  maxOutputTokens: number = 2048,
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
      max_tokens: maxOutputTokens,
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
  bridgeState?: BridgeState,
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

      // Files already attempted in recent cycles — skip to avoid repeating same unfixable issues
      const attempted = new Set(blackboard.__attemptedFiles ?? []);
      // Files that failed after max retries — permanently skip until manually cleared
      const blacklisted = new Set(blackboard.__blacklistedFiles ?? []);

      if (blackboard.focus === 'typefix') {
        // 'typefix' is not a valid holo_self_diagnose focus — use holo_list_type_errors instead
        const typeResult = await callTool(handlers, 'holo_list_type_errors', { rootDir, maxErrors: 20 });
        try {
          const parsed = JSON.parse(typeResult);
          const errors = parsed.errors ?? [];
          // Transform type errors into candidates format, dedup by file
          const byFile = new Map<string, any>();
          for (const e of errors) {
            const filePath = path.isAbsolute(e.file) ? e.file : path.join(rootDir, e.file);
            if (!byFile.has(filePath) && !blacklisted.has(filePath)) {
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
          const allCandidates = [...byFile.values()];
          // Prefer fresh candidates, fall back to already-attempted if none fresh
          const fresh = allCandidates.filter(c => !attempted.has(c.file));
          blackboard.candidates = fresh.length > 0 ? fresh : allCandidates;
          blackboard.has_candidates = blackboard.candidates.length > 0;
          if (blackboard.candidates.length > 0) {
            blackboard.current_candidate = blackboard.candidates[0];
            blackboard.current_file = blackboard.candidates[0].file;
          }
          if (config.verbose) {
            console.log(`  [diagnose] ${allCandidates.length} candidates, ${fresh.length} fresh, ${blacklisted.size} blacklisted`);
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
          const allCandidates = parsed.candidates ?? [];
          // Filter blacklisted, then prefer fresh candidates
          const nonBlacklisted = allCandidates.filter((c: any) => !blacklisted.has(c.file));
          const fresh = nonBlacklisted.filter((c: any) => !attempted.has(c.file));
          blackboard.candidates = fresh.length > 0 ? fresh : nonBlacklisted;
          blackboard.has_candidates = blackboard.candidates.length > 0;
          if (blackboard.candidates.length > 0) {
            blackboard.current_candidate = blackboard.candidates[0];
            blackboard.current_file = blackboard.candidates[0].file;
          }
          if (config.verbose) {
            console.log(`  [diagnose] ${allCandidates.length} candidates, ${fresh.length} fresh, ${blacklisted.size} blacklisted`);
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

      const toolBudget = TOOL_BUDGET[focus] ?? 8;
      const outputTokenBudget = MAX_OUTPUT_TOKENS[focus] ?? 2048;
      const llmResult = await callLLMForAction(anthropic, handlers, toolDefs, prompt, config, toolBudget, outputTokenBudget);

      metrics.inputTokens += llmResult.inputTokens;
      metrics.outputTokens += llmResult.outputTokens;
      metrics.toolCallsTotal += llmResult.toolCallsTotal;
      metrics.toolCallsUseful += llmResult.toolCallsUseful;
      blackboard.files_edited.push(...llmResult.filesEdited);

      // ── Safeguard: Candidate sanitizer ──
      // Check if LLM injected terminal/log output into source files.
      // If contaminated, revert immediately and fail the action.
      for (const editedFile of llmResult.filesEdited) {
        try {
          const content = fs.readFileSync(editedFile, 'utf-8');
          const contamination = isContaminatedEdit(content);
          if (contamination) {
            console.log(`  [sanitizer] REJECTED edit to ${path.basename(editedFile)}: contains terminal output "${contamination}"`);
            // Revert this file immediately
            const { execSync } = await import('child_process');
            try {
              execSync(`git checkout -- "${editedFile}"`, { cwd: rootDir, stdio: 'pipe' });
            } catch { /* file may be untracked */ }
            blackboard.files_edited = blackboard.files_edited.filter(f => f !== editedFile);
            if (runtimeEmit) {
              runtimeEmit('logger:warn', {
                message: `Sanitizer rejected contaminated edit`,
                fields: { file: path.basename(editedFile), signature: contamination },
              });
            }
          }
        } catch { /* file read failed — verify_compilation will catch it */ }
      }

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
        blackboard.compile_errors = [{ message: 'No files were edited — LLM exhausted tool budget without making an edit' }];
        return true; // Let the condition gate handle it
      }

      const verifyResult = await callTool(handlers, 'holo_verify_before_commit', {
        rootDir,
        files: blackboard.files_edited,
      });

      try {
        const parsed = JSON.parse(verifyResult);
        blackboard.compilation_passed = parsed.safe === true;
        // Store compile errors for retry loop — fix_from_compile_errors reads these.
        // holo_verify_before_commit returns { files: [{ file, errors, details: [...] }] }
        // Flatten per-file details into a single error list for the retry prompt.
        const fileEntries = parsed.files ?? [];
        const allErrors: Blackboard['compile_errors'] = [];
        for (const f of fileEntries) {
          for (const detail of (f.details ?? [])) {
            if (typeof detail === 'string') {
              const match = detail.match(/\((\d+),\d+\):\s*error\s*(TS\d+):\s*(.+)/);
              if (match) {
                allErrors.push({ line: parseInt(match[1], 10), code: match[2], message: match[3] });
              } else {
                allErrors.push({ message: detail });
              }
            } else if (detail && typeof detail === 'object') {
              allErrors.push({ line: detail.line, code: detail.code, message: detail.message ?? String(detail) });
            }
          }
        }
        blackboard.compile_errors = allErrors;
        if (allErrors.length > 0 && config.verbose) {
          console.log(`  [verify] ${allErrors.length} compile errors stored for retry`);
        }
      } catch {
        blackboard.compilation_passed = false;
        blackboard.compile_errors = [{ message: 'Failed to parse verification result' }];
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
      // Set has_candidates=false to stop the repeater from trying more candidates after a successful commit
      blackboard.has_candidates = false;
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

      // ── Safeguard: Per-file quarantine ──
      // Track per-file failure counts across cycles. Auto-quarantine (blacklist)
      // after QUARANTINE_THRESHOLD failures. This covers both compile failures
      // AND test regressions — any rollback increments the counter.
      if (blackboard.current_file && bridgeState) {
        const file = blackboard.current_file;
        const counts = bridgeState.fileFailureCounts;
        counts[file] = (counts[file] ?? 0) + 1;
        const failCount = counts[file];

        if (failCount >= QUARANTINE_THRESHOLD && !bridgeState.blacklistedFiles.includes(file)) {
          bridgeState.blacklistedFiles.push(file);
          const limitation = `${blackboard.focus}: ${path.basename(file)} quarantined after ${failCount} failures (compile-only success with test regression)`;
          if (!bridgeState.knownLimitations.includes(limitation)) {
            bridgeState.knownLimitations.push(limitation);
          }
          console.log(`  [quarantine] ${path.basename(file)} auto-blacklisted after ${failCount} failures`);
          if (runtimeEmit) {
            runtimeEmit('logger:warn', {
              message: `File quarantined after ${failCount} failures`,
              fields: { file: path.basename(file), focus: blackboard.focus, failCount },
            });
          }
        }
        saveBridgeState(bridgeState);
      }

      blackboard.files_edited = [];
      return true;
    }

    case 'advance_candidate': {
      // Multi-candidate rotation: move to the next candidate in the list.
      // Called after rollback to try a different file in the same cycle.
      const idx = (blackboard.__candidateIndex ?? 0) + 1;
      blackboard.__candidateIndex = idx;

      if (idx < blackboard.candidates.length) {
        blackboard.current_candidate = blackboard.candidates[idx];
        blackboard.current_file = blackboard.candidates[idx].file;
        blackboard.compilation_passed = false;
        blackboard.tests_passed = false;
        blackboard.compile_errors = [];
        blackboard.retry_count = 0;
        console.log(`  [BT] advance_candidate: trying candidate ${idx + 1}/${blackboard.candidates.length} — ${path.basename(blackboard.current_file ?? '?')}`);
        return true;
      }

      // No more candidates — signal exhaustion.
      // Null out current_file so read_candidate fails if repeater retries.
      blackboard.has_candidates = false;
      blackboard.current_candidate = null;
      blackboard.current_file = null;
      console.log(`  [BT] advance_candidate: all ${blackboard.candidates.length} candidates exhausted`);
      return false;
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

    case 'identity_intake': {
      // v4.0 — Load identity and accumulated wisdom before operational actions.
      // Reads compressed wisdom from bridge state and reinforces continuity.
      console.log(`  [BT] identity_intake: loading identity + wisdom`);
      const wisdomPath = path.join(STATE_DIR, 'accumulated-wisdom.json');
      let wisdom: string[] = [];
      try {
        if (fs.existsSync(wisdomPath)) {
          wisdom = JSON.parse(fs.readFileSync(wisdomPath, 'utf-8'));
        }
      } catch { /* start fresh */ }

      blackboard.intake_loaded = true;

      if (runtimeEmit) {
        runtimeEmit('logger:info', {
          message: `Identity intake: ${wisdom.length} wisdom entries loaded`,
          fields: { cycle: blackboard.cycle_number, wisdomCount: wisdom.length },
        });
        runtimeEmit('feedback:update_metric', {
          name: 'positive_energy',
          value: 1.0 + (wisdom.length * 0.01), // More wisdom = more energy
        });
        // Sync identity state to runtime composition state
        runtimeEmit('state:update', {
          path: 'identity.cycles_completed',
          value: bridgeState?.totalCycles ?? 0,
        });
        runtimeEmit('state:update', {
          path: 'identity.wisdom_accumulated',
          value: wisdom.slice(-10), // Last 10 entries for context
        });
      }
      return true;
    }

    case 'compress_knowledge': {
      // v4.0 — Extract W/P/G patterns from this cycle's results.
      // Captures what worked, what failed, and patterns observed.
      const delta = blackboard.quality_after - blackboard.quality_before;
      const committed = blackboard.quality_improved === true;
      const retries = blackboard.retry_count ?? 0;

      let wisdomEntry: string | null = null;

      if (committed && delta > 0) {
        wisdomEntry = `W: ${blackboard.focus} fix on ${path.basename(blackboard.current_file ?? '?')} improved quality by ${delta.toFixed(3)} (${retries} retries)`;
      } else if (retries > 0 && !blackboard.compilation_passed) {
        wisdomEntry = `G: ${blackboard.focus} fix on ${path.basename(blackboard.current_file ?? '?')} failed after ${retries} retries — compile errors persist`;
      } else if (blackboard.compilation_passed && !blackboard.tests_passed && blackboard.has_candidates) {
        // Known limitation: LLM produces edits that compile but break tests.
        // This is an LLM capability boundary, not an orchestration bug.
        wisdomEntry = `G: ${blackboard.focus} fix on ${path.basename(blackboard.current_file ?? '?')} compiled but tests regressed — LLM capability miss (compile-only success)`;
      } else if (blackboard.has_candidates && !committed) {
        wisdomEntry = `P: ${blackboard.focus} candidates found but no improvement — consider different approach`;
      }

      blackboard.cycle_wisdom = wisdomEntry;
      console.log(`  [BT] compress_knowledge: ${wisdomEntry ?? 'no wisdom this cycle'}`);

      // Persist wisdom
      if (wisdomEntry) {
        const wisdomPath = path.join(STATE_DIR, 'accumulated-wisdom.json');
        let wisdom: string[] = [];
        try {
          if (fs.existsSync(wisdomPath)) {
            wisdom = JSON.parse(fs.readFileSync(wisdomPath, 'utf-8'));
          }
        } catch { /* start fresh */ }
        wisdom.push(wisdomEntry);
        if (wisdom.length > 100) wisdom = wisdom.slice(-100);
        fs.writeFileSync(wisdomPath, JSON.stringify(wisdom, null, 2), 'utf-8');
      }

      return true;
    }

    case 'praise_improvement': {
      // v4.0 — Positive energy feedback for successful improvements.
      console.log(`  [BT] praise_improvement: quality improved!`);
      blackboard.cycle_praised = true;

      if (runtimeEmit) {
        runtimeEmit('motivation:cycle_complete', {
          energy_level: 1.2,
          praise_count: 1,
          shadow_count: 0,
          emergence_ratio: 0.8,
          regenerative_level: 'sustainable',
          consciousness_stage: 'orange',
        });
        // Reward via economy trait
        runtimeEmit('economy:earn', {
          agentId: 'daemon',
          amount: 0.10,
          reason: 'quality_improvement_reward',
        });
      }
      return true;
    }

    case 'integrate_shadow': {
      // v4.0 — Acknowledge failure without punishment. Shadow integration
      // frees energy rather than consuming it through suppression.
      console.log(`  [BT] integrate_shadow: acknowledging rollback`);
      blackboard.cycle_praised = false;

      if (runtimeEmit) {
        runtimeEmit('motivation:cycle_complete', {
          energy_level: 0.9,
          praise_count: 0,
          shadow_count: 1,
          emergence_ratio: 0.6,
          regenerative_level: 'conventional',
          consciousness_stage: 'orange',
        });
      }
      return true;
    }

    case 'fix_from_compile_errors': {
      // Retry action: feed compile errors back to LLM for a second attempt.
      // This is the key "loosening" — instead of blind rollback, the LLM gets
      // to see WHY its fix failed and try again, like a human developer.
      const errors = blackboard.compile_errors ?? [];
      blackboard.retry_count = (blackboard.retry_count ?? 0) + 1;
      console.log(`  [BT] fix_from_compile_errors: retry #${blackboard.retry_count} (${errors.length} errors)`);

      if (errors.length === 0) {
        // No errors stored — nothing to fix
        return true;
      }

      // ── @circuit_breaker: check before retry LLM call ──
      if (blackboard.__circuitOpen) {
        console.log(`  [BT] fix_from_compile_errors: SKIPPED — circuit breaker open`);
        return true;
      }

      // Build retry prompt — two modes:
      // 1. "No edit" mode: LLM exhausted tool budget without making an edit → be more directive
      // 2. "Compile failed" mode: LLM made an edit but it broke compilation → show errors
      const noEditMode = errors.length === 1 && errors[0].message.includes('No files were edited');
      let retryPrompt: string;

      if (noEditMode) {
        retryPrompt = `You were asked to fix ${blackboard.current_candidate?.symbol || 'an issue'} in ${blackboard.current_file} but you didn't make any edits. This time, you MUST use holo_edit_file to make a change. Read the file first with holo_read_file, then apply a targeted fix. Do not just read — you must edit.`;
      } else {
        const errorSummary = errors
          .slice(0, 10)
          .map((e: { line?: number; message: string; code?: string }) =>
            `  ${e.code ? `[${e.code}] ` : ''}Line ${e.line ?? '?'}: ${e.message}`)
          .join('\n');
        retryPrompt = `Your previous edit to ${blackboard.current_file} caused these compile errors:\n${errorSummary}\n\nFix these errors. Use holo_read_file to see the current state of the file, then use holo_edit_file to correct the issues. Do NOT rewrite the entire file — make targeted fixes only.`;
      }

      const retryResult = await callLLMForAction(anthropic, handlers, toolDefs, retryPrompt, config, 6, 2048);

      metrics.inputTokens += retryResult.inputTokens;
      metrics.outputTokens += retryResult.outputTokens;
      metrics.toolCallsTotal += retryResult.toolCallsTotal;
      metrics.toolCallsUseful += retryResult.toolCallsUseful;
      blackboard.files_edited.push(...retryResult.filesEdited.filter(f => !blackboard.files_edited.includes(f)));

      // ── @economy: emit retry LLM spend ──
      if (runtimeEmit) {
        const cost = calculateCostUSD(retryResult.inputTokens, retryResult.outputTokens);
        runtimeEmit('economy:spend', {
          agentId: 'daemon',
          amount: cost,
          reason: `fix_retry:${blackboard.focus}:${blackboard.retry_count}`,
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
    // Always sync bridge state into blackboard so actions can check it
    blackboard.__circuitOpen = circuitOpen;
    blackboard.__attemptedFiles = bridgeState.attemptedFiles;
    blackboard.__blacklistedFiles = bridgeState.blacklistedFiles;

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
    dispatchActionAsync(actionName, blackboard, anthropic, handlers, toolDefs, config, metrics, runtimeEmit, bridgeState)
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

  const rootAbs = path.resolve(config.rootDir);
  const resolveWithinRoot = (inputPath: string): string => {
    const absolutePath = path.resolve(rootAbs, inputPath);
    const rootPrefix = rootAbs.endsWith(path.sep) ? rootAbs : `${rootAbs}${path.sep}`;
    if (absolutePath !== rootAbs && !absolutePath.startsWith(rootPrefix)) {
      throw new Error(`Path escapes bridge root: ${inputPath}`);
    }
    return absolutePath;
  };

  const hostCapabilities = {
    fileSystem: {
      readFile: async (filePath: string): Promise<string> => {
        const target = resolveWithinRoot(filePath);
        return fs.promises.readFile(target, 'utf-8');
      },
      writeFile: async (filePath: string, content: string): Promise<void> => {
        const target = resolveWithinRoot(filePath);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.writeFile(target, content, 'utf-8');
      },
      deleteFile: async (filePath: string): Promise<void> => {
        const target = resolveWithinRoot(filePath);
        await fs.promises.rm(target, { force: true });
      },
      exists: async (filePath: string): Promise<boolean> => {
        const target = resolveWithinRoot(filePath);
        try {
          await fs.promises.access(target);
          return true;
        } catch {
          return false;
        }
      },
    },
    process: {
      exec: async (
        command: string,
        args: string[] = [],
        options?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number }
      ): Promise<{ code: number | null; signal?: string | null; stdout?: string; stderr?: string }> => {
        const { spawn } = await import('child_process');
        const execCwd = options?.cwd ? resolveWithinRoot(options.cwd) : rootAbs;
        const timeoutMs = options?.timeoutMs ?? 30_000;

        return new Promise((resolve, reject) => {
          const child = spawn(command, args, {
            cwd: execCwd,
            env: { ...process.env, ...(options?.env ?? {}) },
            shell: true,
            stdio: 'pipe',
          });

          let stdout = '';
          let stderr = '';
          let timedOut = false;

          const timer = timeoutMs > 0
            ? setTimeout(() => {
                timedOut = true;
                try { child.kill('SIGKILL'); } catch { /* best effort */ }
              }, timeoutMs)
            : null;

          child.stdout?.on('data', (chunk: Buffer) => {
            stdout += chunk.toString('utf-8');
          });

          child.stderr?.on('data', (chunk: Buffer) => {
            stderr += chunk.toString('utf-8');
          });

          child.on('error', (err) => {
            if (timer) clearTimeout(timer);
            reject(err);
          });

          child.on('close', (code, signal) => {
            if (timer) clearTimeout(timer);
            if (timedOut) {
              resolve({ code: code ?? null, signal: signal ?? 'SIGKILL', stdout, stderr: `${stderr}\nProcess timed out after ${timeoutMs}ms`.trim() });
              return;
            }
            resolve({ code, signal, stdout, stderr });
          });
        });
      },
    },
  };

  // Create HeadlessRuntime from the cloned .hsplus composition
  const runtime = createHeadlessRuntime(freshAST, {
    profile: HEADLESS_PROFILE,
    executeAction: executeActionCallback,
    hostCapabilities,
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

  // ── @feedback_loop: consume optimization signals ──
  // FeedbackLoopTrait emits signals when metrics trend down (auto_signal: true).
  // We listen here and adjust behavior: switch focus, tighten budgets, etc.
  let feedbackSignalAction: string | null = null;
  runtime.on('feedback:optimization_signal', (event: any) => {
    const metric = event?.metric ?? 'unknown';
    const signal = event?.signal ?? 'unknown';
    const trend = event?.trend ?? 'unknown';
    console.log(`  [feedback] Signal: ${metric} → ${signal} (trend: ${trend})`);

    // React to quality decline by suggesting focus change
    if (metric === 'quality_score' && (signal === 'alert' || signal === 'critical')) {
      feedbackSignalAction = 'switch_focus';
      console.log(`  [feedback] Quality declining — will suggest focus switch next cycle`);
    }
    // React to cost efficiency decline by tightening tool budget
    if (metric === 'cost_efficiency' && signal === 'critical') {
      feedbackSignalAction = 'tighten_budget';
      console.log(`  [feedback] Cost efficiency critical — tightening tool budget`);
    }
  });
  runtime.on('feedback:alert', (event: unknown) => {
    const e = event as Record<string, unknown> | undefined;
    const metric = (e?.metric as string) ?? 'unknown';
    const deviation = typeof e?.deviation === 'number' ? e.deviation.toFixed(1) : '?';
    console.log(`  [feedback] Alert: ${metric} deviated ${deviation}% from target`);
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
  runtimeEmit('scheduler:resume_job', { jobId: 'consciousness_eval' });

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

  // Listen for consciousness evaluation — the scheduler fires this every 10min
  runtime.on('daemon:evaluate_consciousness', () => {
    if (config.verbose) {
      console.log(`  [scheduler] Consciousness evaluation triggered`);
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
  runtime.on('daemon:motivation_batch_flushed', (event: any) => {
    if (config.verbose) {
      console.log(`  [buffer] Motivation batch flushed: ${event?.count ?? 0} entries`);
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
  runtimeEmit('scheduler:pause_job', { jobId: 'consciousness_eval' });
  runtimeEmit('buffer:force_flush', { channelId: 'cost_batch' });
  runtimeEmit('buffer:force_flush', { channelId: 'telemetry_batch' });
  runtimeEmit('buffer:force_flush', { channelId: 'motivation_batch' });

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

  // Apply feedback signal actions to bridge state for next cycle
  if (feedbackSignalAction === 'switch_focus') {
    // Skip ahead in focus rotation to avoid repeating a declining focus
    bridgeState.focusIndex += 1;
    console.log(`  [feedback] Focus rotation advanced due to quality decline signal`);
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
    maxSpendUSD: 5.00,
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

  // G.ARCH.002: Per-session budget cap (default $5.00)
  const maxSpendIdx = args.indexOf('--max-spend');
  if (maxSpendIdx !== -1 && args[maxSpendIdx + 1]) {
    const parsed = parseFloat(args[maxSpendIdx + 1]);
    if (!isNaN(parsed) && parsed > 0) config.maxSpendUSD = parsed;
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

  // W.090 Safeguard 1: Start heartbeat to keep lock file fresh
  // G.ARCH.002: Pass spend getter so lock file shows cumulative cost
  const bridgeStateRef = { current: null as BridgeState | null };
  startHeartbeat(() => bridgeStateRef.current?.totalCostUSD ?? 0);

  // W.090 Safeguard 3: Robust process cleanup — catch ALL exit paths
  const cleanup = () => { releaseLock(); };
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    cleanup();
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
    cleanup();
    process.exit(1);
  });

  // W.090 Safeguard 2: Validate API key with cheap pre-check before expensive cycles
  console.log('Validating API key...');
  try {
    await validateApiKeyAndCredits();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    releaseLock();
    process.exit(1);
  }

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
  console.log(`  Session:  ${SESSION_ID}`);
  console.log(`  Budget:   $${config.maxSpendUSD.toFixed(2)}`);
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
  bridgeStateRef.current = bridgeState;

  // Pre-load GraphRAG embeddings (default: OpenAI for quality + disk persistence).
  // Use --bm25 flag for free/fast BM25 (no persistence, rebuilds each run).
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
      // BM25 rebuild from cache ~2s. OpenAI persists index to disk, reloads in ~5s.
      const label = status.diskCache?.fresh
        ? `Loading from disk cache (${status.diskCache.ageHuman})...`
        : 'Scanning codebase (first run)...';
      console.log(`  ${label}`);

      const absorbPromise = callTool(handlers, 'holo_absorb_repo', {
        rootDir: config.rootDir, outputFormat: 'stats',
      });
      // OpenAI embeddings can take 3-5 min on first run (full repo scan + API calls).
      // BM25 rebuilds in ~2s from disk cache. 300s timeout covers both.
      const absorbTimeoutMs = process.env.EMBEDDING_PROVIDER === 'bm25' ? 120_000 : 300_000;
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error(`Absorb timed out after ${absorbTimeoutMs / 1000}s`)), absorbTimeoutMs),
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
    // G.ARCH.003: Pre-cycle budget gate — estimate next cycle cost BEFORE running it
    const remainingBudget = config.maxSpendUSD - bridgeState.totalCostUSD;
    if (remainingBudget <= 0) {
      console.warn(`\n[Budget] Already at $${bridgeState.totalCostUSD.toFixed(3)} (cap: $${config.maxSpendUSD.toFixed(2)}). Stopping.`);
      break;
    }
    const completedCycles = bridgeState.totalCycles;
    const avgCostPerCycle = completedCycles > 0
      ? bridgeState.totalCostUSD / completedCycles
      : 1.50;  // Conservative first-cycle estimate ($1.50)
    // Use 1.5x the average as safety margin (cycles vary in cost)
    const estimatedNextCost = avgCostPerCycle * 1.5;
    if (estimatedNextCost > remainingBudget) {
      console.warn(`\n[Budget] Estimated next cycle: ~$${estimatedNextCost.toFixed(3)}, remaining: $${remainingBudget.toFixed(3)}. Stopping to avoid overshoot.`);
      appendQualityHistory({
        timestamp: new Date().toISOString(),
        cycle: bridgeState.totalCycles + 1,
        composite: bridgeState.lastQuality,
        grade: 'BUDGET_GATE',
        focus: 'pre_cycle_gate',
        summary: `Pre-cycle budget gate: est $${estimatedNextCost.toFixed(3)} > remaining $${remainingBudget.toFixed(3)}`,
        costUSD: 0,
        arm: 'treatment',
        trial: config.trial,
      });
      break;
    }
    console.log(`  [Budget] Remaining: $${remainingBudget.toFixed(3)}, est next cycle: ~$${estimatedNextCost.toFixed(3)}`);

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

      // G.ARCH.002: Per-session budget cap enforcement
      if (bridgeState.totalCostUSD >= config.maxSpendUSD) {
        console.warn(`\n[G.ARCH.002] Budget cap reached: $${bridgeState.totalCostUSD.toFixed(3)} >= $${config.maxSpendUSD.toFixed(2)}. Stopping.`);
        appendQualityHistory({
          timestamp: new Date().toISOString(),
          cycle: bridgeState.totalCycles + 1,
          composite: result.qualityAfter,
          grade: 'BUDGET_CAP',
          focus: 'budget_stop',
          summary: `Budget cap reached at $${bridgeState.totalCostUSD.toFixed(3)} (limit: $${config.maxSpendUSD.toFixed(2)})`,
          costUSD,
          arm: 'treatment',
          trial: config.trial,
        });
        break;
      }

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
      if (bridgeState.blacklistedFiles?.length > 0) {
        console.log(`  Blacklisted files: ${bridgeState.blacklistedFiles.map(f => path.basename(f)).join(', ')}`)
      }
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
