#!/usr/bin/env node
/**
 * Refresh laptop-owned HoloShell receipts and return them to the cockpit API.
 *
 * This runner is intentionally read-only. It generates local receipts with the
 * existing HoloShell adapters, then POSTs those receipts to the Jetson/browser
 * HoloShell receipt-return endpoints added by the cockpit capsule work.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_TMP = '.tmp/holoshell';
const DEFAULT_BASE_URL =
  process.env.HOLOSHELL_RECEIPT_RETURN_BASE_URL ||
  process.env.HOLOSHELL_SURFACE_URL ||
  'http://holojetson.local:8747';
const REPORT_SCHEMA = 'hololand.holoshell.laptop-receipt-freshness.v0.1.0';
const WATCH_INTERVAL_MS_DEFAULT = 60_000;

const GOLD_CODEBASE_SOURCE_REF = 'apps/holoshell/source/holoshell-holoscript-gold-codebase-bridge.hsplus';
const GOLD_CODEBASE_SCRIPT_REF = 'scripts/holoshell-holoscript-gold-codebase-bridge.mjs';
const LAPTOP_REASONING_WORKER_REF = 'scripts/holoshell-laptop-reasoning-worker.mjs';
const STUDIO_ORCHESTRATOR_REF = 'packages/brittney/service/src/orchestrator.ts';
const STUDIO_MODEL_ROUTER_REF = 'packages/brittney/service/src/model-router.ts';
const STUDIO_FLEET_BRIDGE_REF = 'packages/shared/inference/src/integrations/spatial-fleet-bridge.ts';
const PROVIDER_ROUTING_REGISTRY_REF = 'C:/Users/josep/.ai-ecosystem/config/provider-routing-registry.json';
const ADVISORY_COCKPIT_LANES = new Set([
  'browser_session',
  'fara_peer_automation',
  'sovereign_room',
  'holoclaw_runtime',
]);

function usage() {
  return `Usage: node scripts/holoshell-laptop-receipt-freshness.mjs [options]

Options:
  --base-url <url>       HoloShell receipt-return base URL. Default: ${DEFAULT_BASE_URL}
  --tmp-dir <path>       HoloShell tmp root. Default: ${DEFAULT_TMP}
  --output <path>        Summary receipt path. Default: <tmp-dir>/laptop-receipt-freshness.json
  --timeout-ms <n>       HTTP and command timeout. Default: 30000
  --watch                Repeat receipt refreshes until stopped.
  --interval-ms <n>      Watch interval. Default: ${WATCH_INTERVAL_MS_DEFAULT}
  --max-runs <n>         Stop watch mode after N runs. Default: 0 (forever).
  --pid-file <path>      Watch PID path. Default: <tmp-dir>/laptop-receipt-freshness-watch.pid
  --fixture              Use producer self-test fixtures. Tests only.
  --dry-run              Generate receipts without posting them.
  --json                 Print the summary receipt as JSON.
  -h, --help             Show this help.
`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    tmpDir: DEFAULT_TMP,
    output: '',
    timeoutMs: 30000,
    watch: false,
    intervalMs: WATCH_INTERVAL_MS_DEFAULT,
    maxRuns: 0,
    pidFile: '',
    fixture: false,
    dryRun: false,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    if (arg === '--base-url') args.baseUrl = argv[++index] || args.baseUrl;
    else if (arg === '--tmp-dir') args.tmpDir = argv[++index] || args.tmpDir;
    else if (arg === '--output') args.output = argv[++index] || '';
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++index] || args.timeoutMs);
    else if (arg === '--watch') args.watch = true;
    else if (arg === '--interval-ms') args.intervalMs = Number(argv[++index] || args.intervalMs);
    else if (arg === '--max-runs') args.maxRuns = Number(argv[++index] || args.maxRuns);
    else if (arg === '--pid-file') args.pidFile = argv[++index] || '';
    else if (arg === '--fixture') args.fixture = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 1000) {
    throw new Error('--timeout-ms must be >= 1000');
  }
  if (!Number.isFinite(args.intervalMs) || args.intervalMs < 1000) {
    throw new Error('--interval-ms must be >= 1000');
  }
  if (!Number.isInteger(args.maxRuns) || args.maxRuns < 0) {
    throw new Error('--max-runs must be a non-negative integer');
  }
  args.tmpDir = normalizeRepoPath(args.tmpDir);
  args.output = normalizeRepoPath(args.output || `${args.tmpDir}/laptop-receipt-freshness.json`);
  args.pidFile = normalizeRepoPath(args.pidFile || `${args.tmpDir}/laptop-receipt-freshness-watch.pid`);
  args.baseUrl = String(args.baseUrl || '').replace(/\/+$/u, '');
  if (!/^https?:\/\//iu.test(args.baseUrl)) throw new Error('--base-url must be an http(s) URL');
  return args;
}

function normalizeRepoPath(filePath) {
  const text = String(filePath || '').trim();
  if (!text) return text;
  return text.replace(/\\/gu, '/');
}

function resolveRepoPath(filePath) {
  const normalized = normalizeRepoPath(filePath);
  return /^[A-Za-z]:\//u.test(normalized) || normalized.startsWith('/')
    ? normalized
    : resolve(REPO_ROOT, normalized);
}

function writeJson(filePath, value) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return resolved;
}

function readJson(filePath) {
  const resolved = resolveRepoPath(filePath);
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function sleep(ms) {
  return new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });
}

function readPidFile(filePath) {
  try {
    const pid = Number(readFileSync(resolveRepoPath(filePath), 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function claimWatchPid(args) {
  const priorPid = readPidFile(args.pidFile);
  if (priorPid && priorPid !== process.pid && isPidAlive(priorPid)) {
    return { claimed: false, priorPid };
  }

  writeJson(args.pidFile, process.pid);
  return {
    claimed: true,
    release() {
      const currentPid = readPidFile(args.pidFile);
      if (currentPid === process.pid) {
        rmSync(resolveRepoPath(args.pidFile), { force: true });
      }
    },
  };
}

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function runNode(script, scriptArgs, options = {}) {
  const result = spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: options.timeoutMs,
    maxBuffer: 1024 * 1024 * 16,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim().slice(0, 1200);
    throw new Error(`${script} exited ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return {
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

function parseJsonOutput(commandResult, fallbackPath = '') {
  const text = commandResult.stdout.trim();
  if (text) return JSON.parse(text);
  if (fallbackPath && existsSync(resolveRepoPath(fallbackPath))) return readJson(fallbackPath);
  throw new Error('command produced no JSON output');
}

function buildFreshnessDispatch(args, generatedAt) {
  const dispatchId = `hsdispatch-laptop-receipt-freshness-${Date.now().toString(36)}`;
  const prompt = 'Scheduled HoloShell laptop receipt freshness check.';
  const dispatch = {
    schemaVersion: 'hololand.holoshell.agent-dispatch.v0.1.0',
    dispatchId,
    generatedAt,
    summary: {
      status: 'ready_to_stage',
      dispatchKind: 'reasoning_job',
      capabilityId: 'laptop_reasoning_receipt_freshness',
      route: '/workflow/laptop-reasoning-job',
      reasonCodes: ['scheduled_receipt_freshness'],
    },
    dispatch: {
      status: 'ready_to_stage',
      route: '/workflow/laptop-reasoning-job',
      dispatchKind: 'reasoning_job',
      permissionEnvelope: 'read_only',
      body: {
        sourceHost: 'holoshell_team_automation',
        targetHost: 'laptop_windows',
        lane: 'laptop-hardware',
        agentLane: 'local',
        canonicalProviderId: 'laptop-sovereign',
        workload: 'receipt_freshness_check',
        permissionEnvelope: 'read_only',
        reuseBeforeBuild: true,
        duplicateWorkPolicy: 'consume_existing_receipts_before_new_builds',
        prompt,
        promptHash: sha256(prompt),
        reasonCodes: ['scheduled_receipt_freshness'],
        requestedReturn: 'receipt_freshness_status',
        receiptRequired: true,
        workloadFocus: {
          local: [
            { id: 'jetson-holoshell-surface' },
            { id: 'laptop-reasoning-receipts' },
            { id: 'operator-terminal-receipts' },
          ],
          cloud: [{ id: 'managed-provider-or-family-seat' }],
        },
        canonicalSurfaces: {
          goldDrive: {
            id: 'gold.drive.read',
            root: 'D:/GOLD',
            readOnly: true,
            sourceAnchors: ['AGENTS.md', GOLD_CODEBASE_SOURCE_REF],
          },
          codebaseBridge: {
            id: 'holoshell.holoscript_gold_codebase_bridge',
            sourceAnchors: [GOLD_CODEBASE_SOURCE_REF, GOLD_CODEBASE_SCRIPT_REF],
          },
          sovereignPeerContext: {
            id: 'workflow.laptop-reasoning-job',
            route: '/workflow/laptop-reasoning-job',
            sourceAnchors: [LAPTOP_REASONING_WORKER_REF],
          },
          studioBrittney: {
            id: 'studio.brittney.chat_and_fleet',
            serviceOrchestrator: STUDIO_ORCHESTRATOR_REF,
            modelRouter: STUDIO_MODEL_ROUTER_REF,
            fleetBridge: STUDIO_FLEET_BRIDGE_REF,
          },
          providerRouting: {
            id: 'provider-routing-registry',
            sourceAnchors: [PROVIDER_ROUTING_REGISTRY_REF],
          },
          vastFleet: {
            id: 'vast.local_overflow',
            spendRail: 'purchased_compute',
            requires: [
              'free_first_or_owned_metal_unavailable_receipt',
              'active_lane_manifest',
              'daily_current_job_budget_fields',
              'output_contract',
              'teardown_receipt',
            ],
          },
        },
        budgetPolicy: {
          paidComputeRule: 'free_first_then_active_cap_spend_guard_then_receipted_output',
          capRaiseRequiresApprovalRef: true,
        },
      },
    },
    output: {
      dispatchReceiptPath: `${args.tmpDir}/laptop-receipt-freshness-dispatch.json`,
    },
  };
  writeJson(dispatch.output.dispatchReceiptPath, dispatch);
  return dispatch;
}

async function postJson(baseUrl, endpoint, payload, timeoutMs) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(body).slice(0, 800)}`);
  }
  return body;
}

async function getJson(baseUrl, endpoint, timeoutMs) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${endpoint} returned ${response.status}: ${JSON.stringify(body).slice(0, 800)}`);
  }
  return body;
}

async function refreshOperatorTerminal(args) {
  const output = `${args.tmpDir}/operator-terminal.json`;
  const jsOutput = `${args.tmpDir}/operator-terminal.js`;
  const commandArgs = args.fixture
    ? ['--self-test', '--json', '--output', output, '--js-output', jsOutput]
    : ['--agent', '--json', '--output', output, '--js-output', jsOutput];
  const receipt = parseJsonOutput(
    runNode('scripts/holoshell-operator-terminal.mjs', commandArgs, args),
    output,
  );
  const response = args.dryRun ? null : await postJson(args.baseUrl, '/api/operator-terminal/report', receipt, args.timeoutMs);
  return {
    id: 'operator_terminal',
    endpoint: 'POST /api/operator-terminal/report',
    status: response?.status || receipt.summary?.status || 'dry_run',
    receiptPath: output,
    receiptHash: receipt.receipt?.terminalHash || response?.receiptHash || null,
    response,
  };
}

async function refreshWindowAwareness(args) {
  const output = `${args.tmpDir}/legacy-window-inventory.json`;
  const jsOutput = `${args.tmpDir}/legacy-window-inventory.js`;
  const commandArgs = args.fixture
    ? ['--self-test', '--json', '--output', output, '--js-output', jsOutput]
    : ['--json', '--output', output, '--js-output', jsOutput];
  const receipt = parseJsonOutput(
    runNode('scripts/holoshell-legacy-window-inventory.mjs', commandArgs, args),
    output,
  );
  const response = args.dryRun ? null : await postJson(args.baseUrl, '/api/window-awareness/report', receipt, args.timeoutMs);
  return {
    id: 'window_awareness',
    endpoint: 'POST /api/window-awareness/report',
    status: response?.status || receipt.summary?.status || 'dry_run',
    receiptPath: output,
    visibleWindowCount: response?.visibleWindowCount || receipt.summary?.visibleWindowCount || 0,
    response,
  };
}

async function refreshDesktopBridge(args) {
  const commandArgs = ['--status', '--json', '--receipt-dir', `${args.tmpDir}/desktop-control-bridge`];
  const receipt = parseJsonOutput(
    runNode('scripts/holoshell-laptop-desktop-bridge.mjs', commandArgs, args),
  );
  const response = args.dryRun ? null : await postJson(args.baseUrl, '/api/desktop-control/bridge/report', { report: receipt }, args.timeoutMs);
  return {
    id: 'desktop_bridge',
    endpoint: 'POST /api/desktop-control/bridge/report',
    status: response?.status || receipt.status || 'dry_run',
    receiptPath: receipt.output?.latestPath || `${args.tmpDir}/desktop-control-bridge/latest.json`,
    reportId: receipt.reportId,
    response,
  };
}

async function refreshLaptopReasoning(args, generatedAt) {
  const output = `${args.tmpDir}/laptop-reasoning-result-latest.json`;
  const resultDir = `${args.tmpDir}/laptop-reasoning-results`;
  const commandArgs = args.fixture
    ? ['--self-test', '--json']
    : [
        '--dispatch',
        buildFreshnessDispatch(args, generatedAt).output.dispatchReceiptPath,
        '--output',
        output,
        '--result-dir',
        resultDir,
        '--result-text',
        'Scheduled freshness check consumed the laptop reasoning receipt contract; no model invocation was performed.',
        '--json',
      ];
  const receipt = parseJsonOutput(
    runNode('scripts/holoshell-laptop-reasoning-worker.mjs', commandArgs, args),
    output,
  );
  const response = args.dryRun ? null : await postJson(args.baseUrl, '/api/laptop-reasoning/report', receipt, args.timeoutMs);
  return {
    id: 'laptop_reasoning',
    endpoint: 'POST /api/laptop-reasoning/report',
    status: response?.status || receipt.summary?.status || 'dry_run',
    receiptPath: receipt.output?.latestPath || output,
    resultId: response?.resultId || receipt.resultId,
    gpuStatus: response?.gpuStatus || receipt.summary?.laptopGpuStatus || 'not_reported',
    gpuSummary: response?.gpuSummary || receipt.summary?.laptopGpuSummary || '',
    modelInvocationPerformed: response?.modelInvocationPerformed ?? receipt.summary?.modelInvocationPerformed ?? false,
    response,
  };
}

function summarizePostResults(results) {
  const failed = results.filter((item) => item.status === 'failed');
  return {
    status: failed.length ? 'attention_required' : 'ready',
    refreshedCount: results.filter((item) => item.status !== 'failed').length,
    failedCount: failed.length,
    failedIds: failed.map((item) => item.id),
  };
}

function addNonReadySignal(signals, label, value, readyValues = ['ready']) {
  if (!value) return;
  if (!readyValues.includes(value)) {
    signals.push(`${label}=${value}`);
  }
}

function cockpitAttentionSignals(cockpitCapsule, operatorSession, args) {
  if (args.dryRun) return [];
  const signals = [];
  addNonReadySignal(signals, 'cockpit.status', cockpitCapsule?.status);
  for (const lane of cockpitCapsule?.cockpitLanes || []) {
    let readyValues = ['ready'];
    if (lane.id === 'tool_action_cards') readyValues = ['ready', 'window_preflights_ready'];
    if (ADVISORY_COCKPIT_LANES.has(lane.id)) readyValues = ['ready', 'attention', 'waiting', 'disabled', 'not_checked', 'not_staged'];
    addNonReadySignal(signals, `cockpit.lane.${lane.id}`, lane.status, readyValues);
  }

  const summary = cockpitCapsule?.summary || {};
  addNonReadySignal(signals, 'cockpit.summary.runtimeTruthStatus', summary.runtimeTruthStatus);
  addNonReadySignal(signals, 'cockpit.summary.routeStatus', summary.routeStatus);
  addNonReadySignal(signals, 'cockpit.summary.contextCarryStatus', summary.contextCarryStatus);
  addNonReadySignal(signals, 'cockpit.summary.desktopBridgeStatus', summary.desktopBridgeStatus);
  addNonReadySignal(signals, 'cockpit.summary.laptopReasoningStatus', summary.laptopReasoningStatus);
  addNonReadySignal(signals, 'cockpit.summary.operatorTerminalStatus', summary.operatorTerminalStatus);
  addNonReadySignal(signals, 'cockpit.summary.windowAwarenessStatus', summary.windowAwarenessStatus);
  addNonReadySignal(signals, 'cockpit.summary.laptopReasoningPingbackStatus', summary.laptopReasoningPingbackStatus, ['', 'ready_for_brittney', 'ready']);
  addNonReadySignal(signals, 'operatorSession.terminal.receiptStatus', operatorSession?.terminal?.receiptStatus, ['fresh']);
  return [...new Set(signals)];
}

async function run(args) {
  const generatedAt = new Date().toISOString();
  const postResults = [];
  for (const refresh of [
    refreshOperatorTerminal,
    refreshWindowAwareness,
    refreshDesktopBridge,
    (innerArgs) => refreshLaptopReasoning(innerArgs, generatedAt),
  ]) {
    try {
      postResults.push(await refresh(args));
    } catch (error) {
      postResults.push({
        id: refresh.name.replace(/^refresh/u, '').replace(/[A-Z]/gu, (char) => `_${char.toLowerCase()}`).replace(/^_/u, ''),
        status: 'failed',
        error: String(error?.message || error).slice(0, 1200),
      });
    }
  }

  let cockpitCapsule = null;
  let operatorSession = null;
  if (!args.dryRun) {
    try {
      cockpitCapsule = await getJson(args.baseUrl, '/api/cockpit/capsule', args.timeoutMs);
    } catch (error) {
      cockpitCapsule = { status: 'failed', error: String(error?.message || error).slice(0, 500) };
    }
    try {
      operatorSession = await getJson(args.baseUrl, '/api/operator-terminal/session', args.timeoutMs);
    } catch (error) {
      operatorSession = { status: 'failed', error: String(error?.message || error).slice(0, 500) };
    }
  }

  const summary = summarizePostResults(postResults);
  const cockpitReady = args.dryRun || cockpitCapsule?.status === 'ready';
  const terminalFresh = args.dryRun || operatorSession?.terminal?.receiptStatus === 'fresh';
  const attentionSignals = cockpitAttentionSignals(cockpitCapsule, operatorSession, args);
  const overallStatus = summary.status === 'ready' && cockpitReady && terminalFresh && attentionSignals.length === 0
    ? 'ready'
    : 'attention_required';
  const report = {
    schemaVersion: REPORT_SCHEMA,
    generatedAt,
    baseUrl: args.baseUrl,
    mode: args.fixture ? 'fixture' : 'live',
    dryRun: args.dryRun,
    status: overallStatus,
    summary: {
      ...summary,
      cockpitStatus: cockpitCapsule?.status || (args.dryRun ? 'dry_run' : 'not_reported'),
      operatorSessionStatus: operatorSession?.status || (args.dryRun ? 'dry_run' : 'not_reported'),
      operatorTerminalReceiptStatus: operatorSession?.terminal?.receiptStatus || (args.dryRun ? 'dry_run' : 'not_reported'),
      attentionSignalCount: attentionSignals.length,
      destructiveActionsTaken: false,
      desktopAutomationExecuted: false,
      modelInvocationPerformed: postResults.some((item) => item.modelInvocationPerformed === true),
    },
    attentionSignals,
    endpoints: postResults.map((item) => ({
      id: item.id,
      endpoint: item.endpoint || null,
      status: item.status,
      receiptPath: item.receiptPath || null,
      receiptHash: item.receiptHash || null,
      resultId: item.resultId || null,
      gpuStatus: item.gpuStatus || null,
      gpuSummary: item.gpuSummary || null,
      visibleWindowCount: item.visibleWindowCount ?? null,
      modelInvocationPerformed: item.modelInvocationPerformed ?? null,
      error: item.error || null,
    })),
    cockpitCapsule: cockpitCapsule ? {
      schemaVersion: cockpitCapsule.schemaVersion,
      status: cockpitCapsule.status,
      mode: cockpitCapsule.mode,
      summary: cockpitCapsule.summary,
      destructiveActionsTaken: cockpitCapsule.destructiveActionsTaken,
      desktopAutomationExecuted: cockpitCapsule.desktopAutomationExecuted,
    } : null,
    operatorSession: operatorSession ? {
      schemaVersion: operatorSession.schemaVersion,
      status: operatorSession.status,
      terminal: operatorSession.terminal ? {
        status: operatorSession.terminal.status,
        receiptStatus: operatorSession.terminal.receiptStatus,
        receiptAgeMs: operatorSession.terminal.receiptAgeMs,
        receiptHash: operatorSession.terminal.receiptHash,
      } : null,
      safety: operatorSession.safety,
    } : null,
    safety: {
      destructiveActionsTaken: false,
      desktopAutomationExecuted: false,
      paidComputeAtLaunch: false,
      rawSecretsIncluded: false,
      directMutationAllowed: false,
    },
  };
  report.output = writeJson(args.output, report);
  return report;
}

function printReport(report, args) {
  if (args.json) console.log(JSON.stringify(report, args.watch ? undefined : null, args.watch ? undefined : 2));
  else {
    console.log(`HoloShell laptop receipt freshness: ${report.status}`);
    console.log(`Output: ${report.output}`);
    for (const endpoint of report.endpoints) {
      console.log(`- ${endpoint.id}: ${endpoint.status}${endpoint.error ? ` (${endpoint.error})` : ''}`);
    }
  }
}

async function runWatch(args) {
  const watchPid = claimWatchPid(args);
  if (!watchPid.claimed) {
    const report = {
      schemaVersion: REPORT_SCHEMA,
      generatedAt: new Date().toISOString(),
      baseUrl: args.baseUrl,
      mode: args.fixture ? 'fixture' : 'live',
      dryRun: args.dryRun,
      status: 'ready',
      summary: {
        watchStatus: 'already_running',
        priorPid: watchPid.priorPid,
      },
      safety: {
        destructiveActionsTaken: false,
        desktopAutomationExecuted: false,
        paidComputeAtLaunch: false,
        rawSecretsIncluded: false,
        directMutationAllowed: false,
      },
    };
    if (args.json) console.log(JSON.stringify(report));
    else console.log(`HoloShell laptop receipt freshness watch already running: pid ${watchPid.priorPid}`);
    return report;
  }

  let runCount = 0;
  let lastReport = null;
  try {
    while (args.maxRuns === 0 || runCount < args.maxRuns) {
      try {
        lastReport = await run(args);
        printReport(lastReport, args);
      } catch (error) {
        lastReport = {
          schemaVersion: REPORT_SCHEMA,
          generatedAt: new Date().toISOString(),
          baseUrl: args.baseUrl,
          mode: args.fixture ? 'fixture' : 'live',
          dryRun: args.dryRun,
          status: 'attention_required',
          summary: {
            watchStatus: 'refresh_failed',
            error: String(error?.message || error).slice(0, 1200),
          },
          safety: {
            destructiveActionsTaken: false,
            desktopAutomationExecuted: false,
            paidComputeAtLaunch: false,
            rawSecretsIncluded: false,
            directMutationAllowed: false,
          },
        };
        if (args.json) console.log(JSON.stringify(lastReport));
        else console.error(`HoloShell laptop receipt freshness failed: ${lastReport.summary.error}`);
      }
      runCount += 1;
      if (args.maxRuns !== 0 && runCount >= args.maxRuns) break;
      await sleep(args.intervalMs);
    }
  } finally {
    watchPid.release();
  }

  if (args.maxRuns !== 0 && lastReport?.status !== 'ready') process.exitCode = 1;
  return lastReport;
}

try {
  const args = parseArgs();
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  const report = args.watch ? await runWatch(args) : await run(args);
  if (!args.watch) {
    printReport(report, args);
    if (report.status !== 'ready') process.exitCode = 1;
  }
} catch (error) {
  console.error(`holoshell-laptop-receipt-freshness failed: ${error.message}`);
  process.exit(1);
}
