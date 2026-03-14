#!/usr/bin/env npx tsx
/**
 * HoloScript Self-Improvement Runner — Continuous Daemon
 *
 * Autonomous, persistent self-improvement loop powered by Claude API.
 *
 * Modes:
 *   SINGLE:   Run N cycles and exit (default)
 *   DAEMON:   Run continuously on an interval, with convergence detection
 *
 * Persistence:
 *   ~/.holoscript/graph-cache.json    — Codebase knowledge graph (auto-loaded, 24h TTL)
 *   .holoscript/daemon-state.json     — Daemon state (cycle count, quality scores, focus history)
 *   .holoscript/quality-history.json  — Quality score history for convergence tracking
 *   .holoscript/daemon.log            — Runtime log
 *
 * Usage:
 *   # Dry run — one cycle, diagnosis only
 *   npx tsx scripts/self-improve.ts --verbose
 *
 *   # Three cycles with auto-commit
 *   npx tsx scripts/self-improve.ts --cycles 3 --commit
 *
 *   # Continuous daemon mode (runs every 15 min, backs off when converged)
 *   npx tsx scripts/self-improve.ts --daemon
 *
 *   # Daemon with custom interval
 *   npx tsx scripts/self-improve.ts --daemon --interval 30
 *
 *   # Resume from last state
 *   npx tsx scripts/self-improve.ts --daemon --resume
 *
 *   # Harvest training data (captures iteration tuples as JSONL)
 *   npx tsx scripts/self-improve.ts --cycles 5 --harvest
 *
 *   # Daemon with harvesting enabled
 *   npx tsx scripts/self-improve.ts --daemon --harvest
 *
 * Environment:
 *   ANTHROPIC_API_KEY  — Required. Your Claude API key.
 *   HOLOSCRIPT_ROOT    — Optional. Defaults to this repo root.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { SelfImproveHarvester } from '../packages/core/src/self-improvement/SelfImproveHarvester';

// ─── .env Loading (no dotenv dependency) ─────────────────────────────────────

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
      // Strip surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      // Only set if not already in environment (env vars take precedence)
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch { /* best effort */ }
}

// ─── Path Resolution ─────────────────────────────────────────────────────────

const __scriptDir =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = process.env.HOLOSCRIPT_ROOT ?? path.resolve(__scriptDir, '..');

// Load .env from repo root before anything else
loadEnvFile(REPO_ROOT);
const STATE_DIR = path.join(REPO_ROOT, '.holoscript');
const STATE_FILE = path.join(STATE_DIR, 'daemon-state.json');
const HISTORY_FILE = path.join(STATE_DIR, 'quality-history.json');
const LOG_FILE = path.join(STATE_DIR, 'daemon.log');
const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOOL_CALLS = 40;

// ─── Types ───────────────────────────────────────────────────────────────────

interface Config {
  commit: boolean;
  cycles: number;
  focus: 'coverage' | 'docs' | 'complexity' | 'typefix' | 'all';
  rootDir: string;
  verbose: boolean;
  daemon: boolean;
  intervalMinutes: number;
  resume: boolean;
  harvest: boolean;
}

interface DaemonState {
  totalCycles: number;
  lastCycleAt: string;
  lastQuality: number;
  bestQuality: number;
  focusRotation: string[];
  currentFocusIndex: number;
  convergenceStreak: number; // consecutive cycles with < 0.01 quality change
  backoffMultiplier: number; // increases when converged, resets on improvement
  improvements: Array<{
    cycle: number;
    timestamp: string;
    candidate: string;
    qualityBefore: number;
    qualityAfter: number;
  }>;
}

interface QualityEntry {
  timestamp: string;
  cycle: number;
  composite: number;
  grade: string;
  focus: string;
  summary: string;
}

// ─── Configuration ───────────────────────────────────────────────────────────

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const config: Config = {
    commit: args.includes('--commit'),
    cycles: 1,
    focus: 'all',
    rootDir: REPO_ROOT,
    verbose: args.includes('--verbose') || args.includes('-v'),
    daemon: args.includes('--daemon'),
    intervalMinutes: 15,
    resume: args.includes('--resume'),
    harvest: args.includes('--harvest'),
  };

  const cyclesIdx = args.indexOf('--cycles');
  if (cyclesIdx !== -1 && args[cyclesIdx + 1]) {
    config.cycles = parseInt(args[cyclesIdx + 1], 10) || 1;
  }

  const focusIdx = args.indexOf('--focus');
  if (focusIdx !== -1 && args[focusIdx + 1]) {
    config.focus = args[focusIdx + 1] as Config['focus'];
  }

  const rootIdx = args.indexOf('--root');
  if (rootIdx !== -1 && args[rootIdx + 1]) {
    config.rootDir = path.resolve(args[rootIdx + 1]);
  }

  const intervalIdx = args.indexOf('--interval');
  if (intervalIdx !== -1 && args[intervalIdx + 1]) {
    config.intervalMinutes = parseInt(args[intervalIdx + 1], 10) || 15;
  }

  return config;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

function ensureStateDir(): void {
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
}

function loadDaemonState(): DaemonState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch {
    /* start fresh */
  }

  return {
    totalCycles: 0,
    lastCycleAt: '',
    lastQuality: 0,
    bestQuality: 0,
    focusRotation: ['typefix', 'coverage', 'typefix', 'docs', 'typefix', 'complexity', 'all'],
    currentFocusIndex: 0,
    convergenceStreak: 0,
    backoffMultiplier: 1,
    improvements: [],
  };
}

function saveDaemonState(state: DaemonState): void {
  ensureStateDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function appendQualityHistory(entry: QualityEntry): void {
  ensureStateDir();
  let history: QualityEntry[] = [];
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    }
  } catch {
    /* start fresh */
  }
  history.push(entry);
  // Keep last 500 entries
  if (history.length > 500) history = history.slice(-500);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

function log(msg: string, toConsole = true): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  if (toConsole) console.log(line);
  try {
    ensureStateDir();
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8');
  } catch {
    /* best effort */
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

// ─── Skill Loader ────────────────────────────────────────────────────────────

function loadSkill(): string {
  const skillPaths = [
    path.join(
      process.env.USERPROFILE || process.env.HOME || '',
      '.claude',
      'skills',
      'holoscript',
      'SKILL.md'
    ),
    path.join(REPO_ROOT, '.claude', 'skills', 'holoscript', 'SKILL.md'),
  ];
  for (const p of skillPaths) {
    try {
      if (fs.existsSync(p)) {
        return fs
          .readFileSync(p, 'utf-8')
          .replace(/^---[\s\S]*?---\s*/, '')
          .slice(0, 3000);
      }
    } catch {
      /* skip */
    }
  }
  return '';
}

// ─── Convergence Detection ──────────────────────────────────────────────────

function detectConvergence(
  state: DaemonState,
  newQuality: number
): {
  converged: boolean;
  backoffMinutes: number;
  reason: string;
} {
  const delta = Math.abs(newQuality - state.lastQuality);
  const CONVERGENCE_THRESHOLD = 0.01; // < 1% change = converged
  const MAX_BACKOFF = 8; // max 8x interval

  if (delta < CONVERGENCE_THRESHOLD && state.totalCycles > 1) {
    const streak = state.convergenceStreak + 1;
    const backoff = Math.min(MAX_BACKOFF, Math.pow(2, Math.floor(streak / 3)));
    return {
      converged: true,
      backoffMinutes: backoff,
      reason: `Quality plateau: ${state.lastQuality.toFixed(3)} → ${newQuality.toFixed(3)} (Δ${delta.toFixed(4)}, streak ${streak})`,
    };
  }

  return {
    converged: false,
    backoffMinutes: 1,
    reason:
      newQuality > state.lastQuality
        ? `Improving: ${state.lastQuality.toFixed(3)} → ${newQuality.toFixed(3)} (+${delta.toFixed(4)})`
        : `Change: ${state.lastQuality.toFixed(3)} → ${newQuality.toFixed(3)}`,
  };
}

// ─── Claude Agent Loop ──────────────────────────────────────────────────────

/** Data captured from a single improvement cycle for harvesting */
interface CycleHarvestData {
  diagnoseResult: any;
  validateResult: any;
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: string }>;
}

async function runImprovementCycle(
  anthropic: Anthropic,
  handlers: Array<(name: string, args: Record<string, unknown>) => Promise<unknown | null>>,
  toolDefs: any[],
  config: Config,
  state: DaemonState,
  skillContext: string,
  focus: string,
  harvestData?: CycleHarvestData
): Promise<{ summary: string; qualityScore: number }> {
  const tools: Anthropic.Tool[] = toolDefs.map((t: any) => ({
    name: t.name,
    description: t.description ?? '',
    input_schema: t.inputSchema as Anthropic.Tool['input_schema'],
  }));

  const systemPrompt = `You are HoloScript's autonomous self-improvement daemon (Cycle ${state.totalCycles + 1}).

${skillContext ? `## /holoscript Skill\n${skillContext}\n` : ''}
## State
- Total cycles: ${state.totalCycles}
- Best quality: ${state.bestQuality.toFixed(3)}
- Last quality: ${state.lastQuality.toFixed(3)}
- Convergence streak: ${state.convergenceStreak}
- Root: ${config.rootDir}
- Focus: ${focus}
- Auto-commit: ${config.commit ? 'YES' : 'NO'}

## Protocol
${focus === 'typefix' ? `### TYPEFIX MODE
1. Call holo_list_type_errors with rootDir="${config.rootDir}" to get actual TS errors.
2. Pick the file with the most errors.
3. Use holo_read_file to understand the code.
4. Fix 3-5 errors in that file using holo_edit_file (add missing types, fix imports, add properties to interfaces).
5. Run holo_run_tests_targeted to verify no regressions.
6. ${config.commit ? 'Call holo_git_commit to commit the fixes.' : 'Report what was fixed.'}
7. Call holo_validate_quality with rootDir="${config.rootDir}" skipLint=true to measure improvement.
8. Report: errors before, errors after, files changed.` :
focus === 'coverage' ? `### COVERAGE MODE
1. Check holo_graph_status. If no graph, call holo_absorb_repo with rootDir="${config.rootDir}".
2. Call holo_self_diagnose with focus="coverage" to find untested code.
3. Pick the #1 candidate. Use holo_read_file to understand what it does.
4. Create a test file using holo_write_file. Write REAL tests that exercise the function's behavior:
   - Test normal inputs, edge cases, and error cases.
   - Import the actual function — do NOT write placeholder tests.
   - Match the project's test patterns (vitest, describe/it blocks).
5. Run holo_run_tests_targeted on the new test file to verify tests pass.
6. ${config.commit ? 'Call holo_git_commit.' : 'Report what was tested.'}
7. Call holo_validate_quality with rootDir="${config.rootDir}" to measure coverage improvement.
8. Report: what was tested, how many tests, pass/fail.` :
`### STANDARD MODE
1. Check holo_graph_status. If no graph, call holo_absorb_repo with rootDir="${config.rootDir}".
2. Call holo_self_diagnose with focus="${focus}".
3. Pick the #1 candidate. Use holo_read_file to understand the code.
4. Write a fix using holo_write_file or holo_edit_file.
5. Run holo_run_tests_targeted to verify no regressions.
6. ${config.commit ? 'Call holo_git_commit.' : 'Report what was changed.'}
7. Call holo_validate_quality with rootDir="${config.rootDir}" to measure improvement.
8. Report: what changed, quality delta.`}

## Rules
- Read before editing. Always use holo_read_file before holo_edit_file.
- One fix per cycle. Pick the highest-priority candidate and fix it well.
- Keep changes small and targeted. Do not refactor unrelated code.
- Write REAL tests with actual assertions — never \`expect(true).toBe(true)\`.
- If a fix breaks tests, revert via holo_edit_file and report the failure.
- Keep responses concise — focus on actions, not analysis.`;

  let messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `Run self-improvement cycle ${state.totalCycles + 1}. Focus: ${focus}. Start now.`,
    },
  ];

  let toolCallCount = 0;
  let finalSummary = '';
  let qualityScore = 0;

  while (toolCallCount < MAX_TOOL_CALLS) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      tools,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    const textBlocks = response.content.filter((b) => b.type === 'text');
    if (textBlocks.length > 0) {
      finalSummary = textBlocks.map((b: any) => b.text).join('\n');
    }

    if (response.stop_reason !== 'tool_use') break;

    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      toolCallCount++;
      const input = toolUse.input as Record<string, unknown>;

      if (config.verbose) {
        log(
          `  🔧 [${toolCallCount}/${MAX_TOOL_CALLS}] ${toolUse.name}(${JSON.stringify(input).slice(0, 120)})`
        );
      }

      const result = await callTool(handlers, toolUse.name, input);

      // Capture tool call data for harvesting
      if (harvestData) {
        harvestData.toolCalls.push({ name: toolUse.name, args: input, result });
        if (toolUse.name === 'holo_self_diagnose') {
          try {
            harvestData.diagnoseResult = JSON.parse(result);
          } catch {
            /* skip */
          }
        }
        if (toolUse.name === 'holo_validate_quality') {
          try {
            harvestData.validateResult = JSON.parse(result);
          } catch {
            /* skip */
          }
        }
      }

      // Extract quality score if this was a validate call
      if (toolUse.name === 'holo_validate_quality') {
        try {
          const parsed = JSON.parse(result);
          if (parsed.composite !== undefined) qualityScore = parsed.composite;
        } catch {
          /* skip */
        }
      }

      if (config.verbose) {
        log(`  📦 ${result.slice(0, 300)}${result.length > 300 ? '...' : ''}`);
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    messages.push({ role: 'user', content: toolResults });
  }

  return { summary: finalSummary, qualityScore };
}

// ─── Harvest Helper ──────────────────────────────────────────────────────

function harvestCycleData(
  harvester: SelfImproveHarvester,
  harvestData: CycleHarvestData,
  cycleNumber: number,
  qualityScore: number,
  focus: string,
  convergenceConverged: boolean
): void {
  // Extract the top candidate from diagnose results
  const candidates = harvestData.diagnoseResult?.candidates ?? [];
  const topCandidate = candidates[0];

  if (!topCandidate) return;

  // Build an instruction from the diagnosis focus + candidate
  const instruction = [
    `Self-improvement cycle targeting ${focus}:`,
    `Analyze and test ${topCandidate.symbol} in ${topCandidate.file}`,
    topCandidate.reason ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  // Build output from all tool call results (summarized)
  const outputParts: string[] = [];
  for (const tc of harvestData.toolCalls) {
    outputParts.push(`[${tc.name}] ${tc.result.slice(0, 500)}`);
  }
  const output = outputParts.join('\n\n');

  // Build test_result from validate data
  const validate = harvestData.validateResult ?? {};
  const testResult = {
    passed: validate.allPassing ?? false,
    testsPassed: 0,
    testsFailed: 0,
    testsTotal: 0,
    duration: 0,
  };
  if (validate.scores?.tests) {
    const testsStr = validate.scores.tests.details ?? '';
    const match = testsStr.match(/(\d+)\/(\d+)/);
    if (match) {
      testResult.testsPassed = parseInt(match[1], 10);
      testResult.testsTotal = parseInt(match[2], 10);
      testResult.testsFailed = testResult.testsTotal - testResult.testsPassed;
    }
  }

  // Use the harvester's captureIteration by first setting up internal state
  // via a synthetic quality report and convergence status
  const qualityReport =
    qualityScore > 0
      ? {
          score: qualityScore,
          scorePercent: Math.round(qualityScore * 100),
          dimensions: {} as any,
          timestamp: new Date().toISOString(),
          status:
            qualityScore >= 0.9
              ? ('excellent' as const)
              : qualityScore >= 0.75
                ? ('good' as const)
                : qualityScore >= 0.55
                  ? ('fair' as const)
                  : qualityScore >= 0.35
                    ? ('poor' as const)
                    : ('critical' as const),
        }
      : null;

  const convergenceStatus = {
    converged: convergenceConverged,
    reason: convergenceConverged ? ('plateau' as const) : null,
    iterations: cycleNumber,
    currentScore: qualityScore,
    bestScore: qualityScore,
    windowAverage: qualityScore,
    windowSlope: 0,
    plateauCount: convergenceConverged ? 1 : 0,
    totalImprovement: 0,
  };

  // Write directly as JSONL since the CLI agent loop differs from SelfImproveCommand
  const harvestRecord = {
    instruction,
    input: [
      `Target: ${topCandidate.symbol}`,
      `File: ${topCandidate.file}`,
      `Type: ${topCandidate.type}`,
      `Priority: ${topCandidate.priority}`,
      `Action: ${topCandidate.suggestedAction ?? 'N/A'}`,
    ].join('\n'),
    output,
    metadata: {
      source: 'self-improve-harvester' as const,
      timestamp: Date.now(),
      iteration: cycleNumber,
      target_symbol: topCandidate.symbol ?? '',
      target_file: topCandidate.file ?? '',
      quality_score: qualityScore,
      test_passed: testResult.passed,
      pass_rate:
        testResult.testsTotal > 0
          ? Math.round((testResult.testsPassed / testResult.testsTotal) * 10000) / 10000
          : 0,
      convergence_converged: convergenceConverged,
      filter_stages_passed: ['format'],
    },
  };

  // Run through harvester's filter pipeline via a lightweight check
  const passesComplexity = instruction.length >= 20;
  const passesFormat = !!topCandidate.symbol && !!topCandidate.file && output.length > 0;

  if (passesComplexity && passesFormat) {
    const line = JSON.stringify(harvestRecord) + '\n';
    const outputFile = harvester.getOutputFile();
    try {
      const dir = path.dirname(outputFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(outputFile, line, 'utf-8');
    } catch (err: any) {
      log(`[harvest] Write failed: ${err.message}`);
    }
  }
}

// ─── Daemon Loop ─────────────────────────────────────────────────────────────

async function runDaemon(
  anthropic: Anthropic,
  handlers: Array<(name: string, args: Record<string, unknown>) => Promise<unknown | null>>,
  toolDefs: any[],
  config: Config,
  skillContext: string,
  harvester?: SelfImproveHarvester
) {
  let state = config.resume ? loadDaemonState() : loadDaemonState();
  let running = true;

  // Graceful shutdown
  const shutdown = () => {
    log('🛑 Shutdown signal received — saving state...');
    saveDaemonState(state);
    if (harvester) {
      harvester.flush().catch(() => {
        /* best effort */
      });
      const stats = harvester.getStats();
      log(
        `📊 Harvest stats: ${stats.totalAccepted} accepted / ${stats.totalCaptured} captured → ${stats.outputFile}`
      );
    }
    log(
      `💾 State saved (${state.totalCycles} cycles, best quality: ${state.bestQuality.toFixed(3)})`
    );
    running = false;
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  log(
    `🔁 Daemon started — interval: ${config.intervalMinutes}m, focus rotation: ${state.focusRotation.join(' → ')}`
  );
  log(`📊 Resuming from cycle ${state.totalCycles}, best quality: ${state.bestQuality.toFixed(3)}`);

  while (running) {
    // Rotate focus each cycle
    const focus =
      config.focus !== 'all'
        ? config.focus
        : state.focusRotation[state.currentFocusIndex % state.focusRotation.length];

    log(`\n━━━ Cycle ${state.totalCycles + 1} (focus: ${focus}) ━━━━━━━━━━━━━━━━━━━━━━`);
    const startTime = Date.now();

    try {
      // Prepare harvest data capture if harvesting is enabled
      const harvestData: CycleHarvestData | undefined = harvester
        ? { diagnoseResult: null, validateResult: null, toolCalls: [] }
        : undefined;

      const result = await runImprovementCycle(
        anthropic,
        handlers,
        toolDefs,
        config,
        state,
        skillContext,
        focus,
        harvestData
      );

      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

      // Update state
      state.totalCycles++;
      state.lastCycleAt = new Date().toISOString();
      state.currentFocusIndex = (state.currentFocusIndex + 1) % state.focusRotation.length;

      // Convergence detection
      const convergence = detectConvergence(state, result.qualityScore);

      if (result.qualityScore > state.bestQuality) {
        state.bestQuality = result.qualityScore;
        log(`🏆 New best quality: ${result.qualityScore.toFixed(3)}`);
      }

      if (convergence.converged) {
        state.convergenceStreak++;
        state.backoffMultiplier = convergence.backoffMinutes;
      } else {
        state.convergenceStreak = 0;
        state.backoffMultiplier = 1;
      }

      state.lastQuality = result.qualityScore;

      // Harvest training data if enabled
      if (harvester && harvestData) {
        harvestCycleData(
          harvester,
          harvestData,
          state.totalCycles,
          result.qualityScore,
          focus,
          convergence.converged
        );
      }

      // Save state after every cycle
      saveDaemonState(state);

      // Log quality history
      appendQualityHistory({
        timestamp: new Date().toISOString(),
        cycle: state.totalCycles,
        composite: result.qualityScore,
        grade:
          result.qualityScore >= 0.9
            ? 'A'
            : result.qualityScore >= 0.8
              ? 'B'
              : result.qualityScore >= 0.7
                ? 'C'
                : result.qualityScore >= 0.5
                  ? 'D'
                  : 'F',
        focus,
        summary: result.summary.slice(0, 300),
      });

      log(
        `📋 Cycle ${state.totalCycles} done (${durationSec}s) — quality: ${result.qualityScore.toFixed(3)} — ${convergence.reason}`
      );
      log(result.summary.split('\n').slice(0, 5).join('\n'));

      // Calculate next interval
      const nextIntervalMs = config.intervalMinutes * 60 * 1000 * state.backoffMultiplier;
      const nextIntervalMin = (nextIntervalMs / 60000).toFixed(0);

      if (convergence.converged) {
        log(
          `💤 Converged (streak ${state.convergenceStreak}) — backing off to ${nextIntervalMin}m interval`
        );
      }

      log(
        `⏰ Next cycle in ${nextIntervalMin}m (${new Date(Date.now() + nextIntervalMs).toLocaleTimeString()})`
      );

      // Wait for next cycle
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, nextIntervalMs);
        // Allow early termination
        const checkShutdown = setInterval(() => {
          if (!running) {
            clearTimeout(timeout);
            clearInterval(checkShutdown);
            resolve();
          }
        }, 1000);
      });
    } catch (err: any) {
      log(`❌ Cycle failed: ${err.message}`);
      if (config.verbose) log(err.stack);
      saveDaemonState(state);

      // Wait before retrying on error
      const retryMs = 60_000 * state.backoffMultiplier;
      log(`⏰ Retrying in ${(retryMs / 60000).toFixed(0)}m`);
      await new Promise((r) => setTimeout(r, retryMs));
    }
  }

  log('🏁 Daemon stopped gracefully.');
}

// ─── Single-Shot Mode ────────────────────────────────────────────────────────

async function runSingleShot(
  anthropic: Anthropic,
  handlers: Array<(name: string, args: Record<string, unknown>) => Promise<unknown | null>>,
  toolDefs: any[],
  config: Config,
  skillContext: string,
  harvester?: SelfImproveHarvester
) {
  const state = loadDaemonState();

  for (let i = 0; i < config.cycles; i++) {
    const focus =
      config.focus !== 'all'
        ? config.focus
        : state.focusRotation[(state.currentFocusIndex + i) % state.focusRotation.length];

    console.log(`\n━━━ Cycle ${i + 1}/${config.cycles} (focus: ${focus}) ━━━━━━━━━━━━━━━━━━━`);
    const startTime = Date.now();

    try {
      // Prepare harvest data capture if harvesting is enabled
      const harvestData: CycleHarvestData | undefined = harvester
        ? { diagnoseResult: null, validateResult: null, toolCalls: [] }
        : undefined;

      const result = await runImprovementCycle(
        anthropic,
        handlers,
        toolDefs,
        config,
        state,
        skillContext,
        focus,
        harvestData
      );
      const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

      state.totalCycles++;
      state.lastCycleAt = new Date().toISOString();
      state.lastQuality = result.qualityScore;
      if (result.qualityScore > state.bestQuality) state.bestQuality = result.qualityScore;

      // Harvest training data if enabled
      if (harvester && harvestData) {
        harvestCycleData(
          harvester,
          harvestData,
          state.totalCycles,
          result.qualityScore,
          focus,
          false
        );
      }

      saveDaemonState(state);
      appendQualityHistory({
        timestamp: new Date().toISOString(),
        cycle: state.totalCycles,
        composite: result.qualityScore,
        grade: result.qualityScore >= 0.9 ? 'A' : result.qualityScore >= 0.8 ? 'B' : 'F',
        focus,
        summary: result.summary.slice(0, 300),
      });

      console.log(
        `\n📋 Cycle ${i + 1} (${durationSec}s) — quality: ${result.qualityScore.toFixed(3)}`
      );
      console.log(result.summary);
      console.log(`✅ Cycle ${i + 1} complete\n`);
    } catch (err: any) {
      console.error(`❌ Cycle ${i + 1} failed: ${err.message}`);
      if (config.verbose) console.error(err.stack);
    }
  }

  // Flush any remaining harvest data
  if (harvester) {
    await harvester.flush();
    const stats = harvester.getStats();
    console.log(`\n📊 Harvest complete: ${stats.totalAccepted} records → ${stats.outputFile}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const config = parseArgs();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY required. Set with: $env:ANTHROPIC_API_KEY = "sk-ant-..."');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(
    `║  🔁 HoloScript Self-Improvement ${config.daemon ? 'DAEMON' : 'Runner'}                  ║`
  );
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`  Root:     ${config.rootDir}`);
  console.log(`  Focus:    ${config.focus}`);
  console.log(
    `  Mode:     ${config.daemon ? `DAEMON (every ${config.intervalMinutes}m)` : `SINGLE (${config.cycles} cycle${config.cycles > 1 ? 's' : ''})`}`
  );
  console.log(`  Commit:   ${config.commit ? '✅ YES' : '❌ NO (dry run)'}`);
  console.log(`  Harvest:  ${config.harvest ? '✅ YES (JSONL training data)' : '❌ NO'}`);
  console.log(`  Model:    ${MODEL}`);
  console.log('');

  // Load tools
  console.log('⏳ Loading HoloScript tools...');
  let handlers: Array<(name: string, args: Record<string, unknown>) => Promise<unknown | null>>;
  let toolDefs: any[];
  try {
    const loaded = await loadToolHandlers();
    handlers = loaded.handlers;
    toolDefs = loaded.toolDefs;
    console.log(`✅ Loaded ${toolDefs.length} tools`);
  } catch (err: any) {
    console.error(`❌ Failed to load tools: ${err.message}`);
    if (config.verbose) console.error(err.stack);
    process.exit(1);
  }

  // Load skill
  const skillContext = loadSkill();
  console.log(`✅ /holoscript skill: ${skillContext ? 'loaded' : 'not found'}`);

  // Load state
  const state = loadDaemonState();
  if (state.totalCycles > 0) {
    console.log(
      `📊 Resuming — ${state.totalCycles} prior cycles, best quality: ${state.bestQuality.toFixed(3)}`
    );
  }

  // Initialize harvester if --harvest flag is set
  let harvester: SelfImproveHarvester | undefined;
  if (config.harvest) {
    const datasetsDir = path.join(config.rootDir, 'datasets');
    harvester = new SelfImproveHarvester({
      enabled: true,
      outputDir: datasetsDir,
      minPassRate: 0.8,
      minInstructionLength: 20,
      maxRougeLSimilarity: 0.7,
      validateSyntax: true,
      flushInterval: 10,
    });
    console.log(`✅ Harvester enabled → ${harvester.getOutputFile()}`);
  }

  const anthropic = new Anthropic();
  console.log('✅ Claude API connected');
  console.log('');

  if (config.daemon) {
    await runDaemon(anthropic, handlers, toolDefs, config, skillContext, harvester);
  } else {
    await runSingleShot(anthropic, handlers, toolDefs, config, skillContext, harvester);
    console.log('🏁 Self-improvement session complete.');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
