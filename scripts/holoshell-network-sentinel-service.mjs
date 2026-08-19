#!/usr/bin/env node
import crypto from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.network-sentinel-service.v0.1.0';
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_INTERVAL_MS = 30000;
const DEFAULT_MAX_EVENTS = 200;
const HEARTBEAT_STALE_MULTIPLIER = 3;
const STARTING_GRACE_MULTIPLIER = 2;
const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const ACTIONS = new Set(['status', 'start', 'stop', 'restart', 'ensure']);

function parseArgs(argv) {
  const args = {
    action: 'status',
    json: false,
    selfTest: false,
    tmpDir: DEFAULT_TMP,
    output: null,
    jsOutput: null,
    pidFile: null,
    logFile: null,
    intervalMs: DEFAULT_INTERVAL_MS,
    maxEvents: DEFAULT_MAX_EVENTS,
    ownerDeclaredKind: process.env.HOLOSHELL_OWNER_NETWORK_KIND || 'auto',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--status') args.action = 'status';
    else if (arg === '--start') args.action = 'start';
    else if (arg === '--stop') args.action = 'stop';
    else if (arg === '--restart') args.action = 'restart';
    else if (arg === '--ensure') args.action = 'ensure';
    else if (arg === '--action') args.action = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--tmp-dir') args.tmpDir = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--pid-file') args.pidFile = argv[++index];
    else if (arg === '--log-file') args.logFile = argv[++index];
    else if (arg === '--interval-ms') args.intervalMs = Number(argv[++index]);
    else if (arg === '--max-events') args.maxEvents = Number(argv[++index]);
    else if (arg === '--owner-declared-kind') args.ownerDeclaredKind = argv[++index];
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!ACTIONS.has(args.action)) {
    throw new Error(`--action must be one of: ${[...ACTIONS].join(', ')}`);
  }
  if (!Number.isFinite(args.intervalMs) || args.intervalMs < 1000) {
    throw new Error('--interval-ms must be at least 1000');
  }
  if (!Number.isFinite(args.maxEvents) || args.maxEvents < 1) {
    throw new Error('--max-events must be at least 1');
  }

  if (args.selfTest) args.tmpDir = path.join(DEFAULT_TMP, 'self-test');
  args.output ||= path.join(args.tmpDir, 'network-sentinel-service.json');
  args.jsOutput ||= path.join(args.tmpDir, 'network-sentinel-service.js');
  args.pidFile ||= path.join(args.tmpDir, 'network-sentinel-service.pid');
  args.logFile ||= path.join(args.tmpDir, 'network-sentinel-service.log');
  return args;
}

function printHelp() {
  console.log(`HoloShell network sentinel service manager

Usage:
  node scripts/holoshell-network-sentinel-service.mjs [action] [options]

Actions:
  --status             Write a service health receipt. Default.
  --start              Start the managed watch service when no verified watcher is alive.
  --stop               Stop only the verified managed watcher PID.
  --restart            Stop the verified watcher, then start a fresh one.
  --ensure             Start when offline, or restart stale verified watchers.

Options:
  --json                       Print service receipt JSON.
  --tmp-dir <path>             Receipt directory. Defaults to .tmp/holoshell.
  --output <path>              Service receipt JSON. Defaults to <tmp-dir>/network-sentinel-service.json.
  --js-output <path>           Browser bootstrap JS. Defaults to <tmp-dir>/network-sentinel-service.js.
  --pid-file <path>            Managed PID file. Defaults to <tmp-dir>/network-sentinel-service.pid.
  --log-file <path>            Watcher log file. Defaults to <tmp-dir>/network-sentinel-service.log.
  --interval-ms <number>       Watch interval. Defaults to 30000.
  --max-events <number>        Network event retention. Defaults to 200.
  --owner-declared-kind <kind> Pass owner network declaration to the sentinel.
  --self-test                  Assert receipt, redaction, and PID safety invariants.
  -h, --help                   Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function toRepoPath(filePath) {
  const resolved = resolveRepoPath(filePath);
  const relative = path.relative(REPO_ROOT, resolved);
  return relative && !relative.startsWith('..') ? relative.replace(/\\/g, '/') : path.basename(resolved);
}

function readJson(filePath, fallback = {}) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  try {
    return JSON.parse(readFileSync(resolved, 'utf8'));
  } catch (error) {
    return {
      schemaVersion: 'hololand.holoshell.read-error.v0.1.0',
      generatedAt: new Date().toISOString(),
      path: path.basename(resolved),
      error: error.message,
    };
  }
}

function writeJson(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return resolved;
}

function writeBrowserBootstrap(filePath, data) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const payload = JSON.stringify(data, null, 2).replace(/<\/script/gi, '<\\/script');
  writeFileSync(resolved, `window.HOLOSHELL_NETWORK_SENTINEL_SERVICE = ${payload};\n`, 'utf8');
  return resolved;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ageMs(value, generatedAt = new Date()) {
  const date = parseDate(value);
  if (!date) return null;
  return Math.max(0, generatedAt.getTime() - date.getTime());
}

function readPid(pidFile) {
  const resolved = resolveRepoPath(pidFile);
  if (!existsSync(resolved)) return null;
  const text = readFileSync(resolved, 'utf8').trim();
  const pid = Number(text);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function writePid(pidFile, pid) {
  const resolved = resolveRepoPath(pidFile);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${pid}\n`, 'utf8');
}

function removePid(pidFile) {
  const resolved = resolveRepoPath(pidFile);
  if (existsSync(resolved)) unlinkSync(resolved);
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function readProcessCommandLine(pid) {
  if (process.platform !== 'win32') return '';
  const command = `try { $p = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction Stop; if ($p) { $p.CommandLine } } catch { '' }`;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

function isVerifiedSentinelCommand(commandLine) {
  const text = String(commandLine || '').toLowerCase();
  return text.includes('holoshell-network-change-sentinel.mjs') && text.includes('--watch');
}

function observeProcess(args) {
  const pid = readPid(args.pidFile);
  const pidAlive = isPidAlive(pid);
  const commandLine = pidAlive ? readProcessCommandLine(pid) : '';
  const pidCommandVerified = pidAlive && isVerifiedSentinelCommand(commandLine);
  const ledger = readJson(path.join(args.tmpDir, 'network-change-events.json'), {});
  return {
    pid,
    pidAlive,
    pidCommandVerified,
    commandLineObserved: Boolean(commandLine),
    commandLineHash: commandLine ? sha256(commandLine).slice(0, 16) : '',
    ledger,
  };
}

function defaultActionResult(action) {
  return {
    requestedAction: action,
    status: 'observed',
    performed: false,
    reason: 'status receipt written',
    serviceProcessTerminated: false,
    startedPid: null,
    startedAt: '',
    restarted: false,
  };
}

function sentinelArgs(args) {
  const command = [
    'scripts/holoshell-network-change-sentinel.mjs',
    '--watch',
    '--record-routine',
    '--interval-ms',
    String(args.intervalMs),
    '--max-events',
    String(args.maxEvents),
    '--tmp-dir',
    args.tmpDir,
  ];
  if (args.ownerDeclaredKind && args.ownerDeclaredKind !== 'auto') {
    command.push('--owner-declared-kind', args.ownerDeclaredKind);
  }
  return command;
}

function startService(args, previousObservation = observeProcess(args)) {
  if (previousObservation.pidAlive && previousObservation.pidCommandVerified) {
    return {
      ...defaultActionResult('start'),
      status: 'already_running',
      reason: 'verified sentinel watcher is already alive',
    };
  }
  if (previousObservation.pidAlive && !previousObservation.pidCommandVerified) {
    return {
      ...defaultActionResult('start'),
      status: 'refused_unverified_pid',
      reason: 'pid file points at a live process that is not a verified network sentinel watcher',
    };
  }

  const logPath = resolveRepoPath(args.logFile);
  mkdirSync(path.dirname(logPath), { recursive: true });
  const stdoutFd = openSync(logPath, 'a');
  const stderrFd = openSync(logPath, 'a');
  const startedAt = nowIso();
  writeFileSync(logPath, `[${startedAt}] starting HoloShell network sentinel service\n`, { flag: 'a' });
  try {
    const child = spawn(process.execPath, sentinelArgs(args), {
      cwd: REPO_ROOT,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', stdoutFd, stderrFd],
    });
    child.unref();
    writePid(args.pidFile, child.pid);
    return {
      ...defaultActionResult('start'),
      status: 'started',
      performed: true,
      reason: 'started managed network sentinel watcher',
      startedPid: child.pid,
      startedAt,
    };
  } finally {
    closeSync(stdoutFd);
    closeSync(stderrFd);
  }
}

function waitForExit(pid, timeoutMs = 1200) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return true;
  }
  return !isPidAlive(pid);
}

function stopService(args, observation = observeProcess(args)) {
  if (!observation.pid) {
    return {
      ...defaultActionResult('stop'),
      status: 'already_offline',
      reason: 'no managed pid file exists',
    };
  }
  if (!observation.pidAlive) {
    removePid(args.pidFile);
    return {
      ...defaultActionResult('stop'),
      status: 'stale_pid_cleared',
      performed: true,
      reason: 'managed pid file was stale and has been cleared',
    };
  }
  if (!observation.pidCommandVerified) {
    return {
      ...defaultActionResult('stop'),
      status: 'refused_unverified_pid',
      reason: 'refused to stop a pid that is not verified as the network sentinel watcher',
    };
  }

  process.kill(observation.pid);
  const exited = waitForExit(observation.pid);
  if (exited) removePid(args.pidFile);
  return {
    ...defaultActionResult('stop'),
    status: exited ? 'stopped' : 'stop_pending',
    performed: true,
    reason: exited ? 'verified network sentinel watcher stopped' : 'termination signal sent to verified watcher, process still visible',
    serviceProcessTerminated: exited,
  };
}

function restartService(args, observation = observeProcess(args)) {
  const stop = stopService(args, observation);
  if (stop.status === 'refused_unverified_pid' || stop.status === 'stop_pending') {
    return {
      ...stop,
      requestedAction: 'restart',
      reason: `restart blocked: ${stop.reason}`,
    };
  }
  const start = startService(args, observeProcess(args));
  return {
    ...start,
    requestedAction: 'restart',
    restarted: start.status === 'started',
    reason: start.status === 'started' ? 'restarted managed network sentinel watcher' : start.reason,
  };
}

function ensureService(args, observation = observeProcess(args), previousReceipt = readJson(args.output, {})) {
  const preliminary = buildServiceReceipt(args, observation, previousReceipt, defaultActionResult('ensure'));
  if (['online', 'starting'].includes(preliminary.summary.serviceStatus)) {
    return {
      ...defaultActionResult('ensure'),
      status: 'already_healthy',
      reason: `service is ${preliminary.summary.serviceStatus}`,
    };
  }
  if (preliminary.summary.serviceStatus === 'stale' && observation.pidCommandVerified) {
    return restartService(args, observation);
  }
  if (preliminary.summary.serviceStatus === 'unverified_pid') {
    return {
      ...defaultActionResult('ensure'),
      status: 'refused_unverified_pid',
      reason: 'ensure refused because the pid file points at an unverified live process',
    };
  }
  return startService(args, observation);
}

function serviceStatusFrom({ observation, lastHeartbeatAt, lastStartedAt, generatedAt, args, actionResult }) {
  if (actionResult?.status === 'start_failed') return 'start_failed';
  if (!observation.pid || !observation.pidAlive) return 'offline';
  if (!observation.pidCommandVerified) return 'unverified_pid';

  const heartbeatAge = ageMs(lastHeartbeatAt, generatedAt);
  const startedAge = ageMs(lastStartedAt, generatedAt);
  const recentlyStarted = startedAge !== null && startedAge <= args.intervalMs * STARTING_GRACE_MULTIPLIER;
  if (!lastHeartbeatAt && recentlyStarted) return 'starting';
  if (heartbeatAge !== null && heartbeatAge > args.intervalMs * HEARTBEAT_STALE_MULTIPLIER) return 'stale';
  if (!lastHeartbeatAt) return 'stale';
  return 'online';
}

function buildServiceReceipt(args, observation, previousReceipt = {}, actionResult = defaultActionResult(args.action)) {
  const generatedAtDate = new Date();
  const generatedAt = generatedAtDate.toISOString();
  const ledger = observation.ledger || {};
  const ledgerSummary = ledger.summary || {};
  const previousSummary = previousReceipt.summary || {};
  const lastStartedAt = actionResult.startedAt || previousSummary.lastStartedAt || '';
  const lastHeartbeatAt = ledgerSummary.lastObservedAt || ledger.generatedAt || '';
  const heartbeatAge = ageMs(lastHeartbeatAt, generatedAtDate);
  const serviceStatus = serviceStatusFrom({
    observation,
    lastHeartbeatAt,
    lastStartedAt,
    generatedAt: generatedAtDate,
    args,
    actionResult,
  });
  const restartCount = Number(previousSummary.restartCount || 0) + (actionResult.restarted ? 1 : 0);
  const hashInput = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    serviceStatus,
    pid: observation.pid || 0,
    pidAlive: observation.pidAlive,
    pidCommandVerified: observation.pidCommandVerified,
    lastHeartbeatAt,
    restartCount,
    actionStatus: actionResult.status,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-network-sentinel-service.hsplus',
      adapter: 'scripts/holoshell-network-sentinel-service.mjs',
      sentinelSource: 'apps/holoshell/source/holoshell-network-change-sentinel.hsplus',
      sentinelAdapter: 'scripts/holoshell-network-change-sentinel.mjs',
      processHealth: 'scripts/holoshell-process-health.mjs',
      runCustody: 'scripts/holoshell-run-custody-actions.mjs',
    },
    summary: {
      serviceStatus,
      serviceMode: 'managed_watch',
      pid: observation.pid || 0,
      pidAlive: Boolean(observation.pidAlive),
      pidCommandVerified: Boolean(observation.pidCommandVerified),
      commandLineObserved: Boolean(observation.commandLineObserved),
      commandLineHash: observation.commandLineHash || '',
      intervalMs: args.intervalMs,
      maxEvents: args.maxEvents,
      restartPolicy: 'ensure_restarts_offline_or_stale_verified_watchers',
      autoRestartAllowed: true,
      restartCount,
      lastStartedAt,
      lastHeartbeatAt,
      heartbeatAgeMs: heartbeatAge ?? null,
      staleHeartbeat: heartbeatAge !== null ? heartbeatAge > args.intervalMs * HEARTBEAT_STALE_MULTIPLIER : serviceStatus === 'stale',
      lastObservationKind: ledgerSummary.lastObservationKind || 'unknown',
      latestEventKind: ledgerSummary.latestEventKind || 'unknown',
      currentClassification: ledgerSummary.currentClassification || 'unknown',
      eventCount: ledgerSummary.eventCount || 0,
      changeEventCount: ledgerSummary.changeEventCount || 0,
      refreshFailedCount: ledgerSummary.refreshFailedCount || 0,
      ledgerGeneratedAt: ledger.generatedAt || '',
      ledgerReceiptHash: ledger.receipt?.snapshotHash || '',
    },
    process: {
      pidFile: toRepoPath(args.pidFile),
      logFile: toRepoPath(args.logFile),
      commandPreview: `node scripts/holoshell-network-change-sentinel.mjs --watch --record-routine --interval-ms ${args.intervalMs}`,
      rawCommandLineIncluded: false,
    },
    action: {
      requestedAction: actionResult.requestedAction || args.action,
      status: actionResult.status || 'observed',
      performed: Boolean(actionResult.performed),
      reason: actionResult.reason || '',
      startedPid: actionResult.startedPid || null,
      serviceProcessTerminated: Boolean(actionResult.serviceProcessTerminated),
      rawCommandLineIncluded: false,
    },
    policy: {
      exactPidRequired: true,
      stopOnlyVerifiedSentinelPid: true,
      unverifiedPidStopRefused: true,
      forceKillAllowed: false,
      endpointDetailsRedacted: true,
      rawNetworkDetailsInLogs: false,
      staleNetworkReceiptMayDriveActions: false,
      localOnly: true,
    },
    receipt: {
      snapshotHash: sha256(JSON.stringify(hashInput)),
      localOnly: true,
      rawIdentifiersIncluded: false,
      rawCommandLineIncluded: false,
      destructiveActionsTaken: false,
      serviceMutationTaken: Boolean(actionResult.performed),
    },
  };
}

function writeOutputs(args, receipt) {
  const output = writeJson(args.output, receipt);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, receipt);
  return { output, jsOutput };
}

function fixtureLedger({ lastObservedAt = new Date(Date.now() - 1000).toISOString() } = {}) {
  return {
    schemaVersion: 'hololand.holoshell.network-change-events.v0.1.0',
    generatedAt: lastObservedAt,
    summary: {
      status: 'watching',
      watchMode: 'watch',
      lastObservationKind: 'routine_check',
      latestEventKind: 'routine_check',
      lastObservedAt,
      currentClassification: 'normal_unmetered',
      eventCount: 4,
      changeEventCount: 1,
      refreshFailedCount: 0,
    },
    policy: {
      staleNetworkReceiptMayDriveActions: false,
      endpointDetailsRedacted: true,
    },
    receipt: { snapshotHash: 'fixture-network-change-ledger' },
  };
}

function runSelfTest(args) {
  const previousReceipt = { summary: { restartCount: 2, lastStartedAt: '2026-05-14T00:04:30.000Z' } };
  const currentObservation = {
    pid: 4242,
    pidAlive: true,
    pidCommandVerified: true,
    commandLineObserved: true,
    commandLineHash: 'fixture-command',
    ledger: fixtureLedger(),
  };
  const online = buildServiceReceipt(
    args,
    currentObservation,
    previousReceipt,
    { ...defaultActionResult('status'), status: 'observed', reason: 'fixture online' },
  );
  const stale = buildServiceReceipt(
    args,
    { ...currentObservation, ledger: fixtureLedger({ lastObservedAt: '2026-05-13T23:55:00.000Z' }) },
    previousReceipt,
    { ...defaultActionResult('status'), status: 'observed', reason: 'fixture stale' },
  );
  const unverified = buildServiceReceipt(
    args,
    { ...currentObservation, pidCommandVerified: false, commandLineHash: 'foreign-command' },
    previousReceipt,
    { ...defaultActionResult('stop'), status: 'refused_unverified_pid', reason: 'fixture refused' },
  );

  const failures = [];
  if (online.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (online.summary.serviceStatus !== 'online') failures.push(`expected online, got ${online.summary.serviceStatus}`);
  if (stale.summary.serviceStatus !== 'stale') failures.push(`expected stale, got ${stale.summary.serviceStatus}`);
  if (unverified.summary.serviceStatus !== 'unverified_pid') failures.push('expected unverified pid status');
  if (unverified.action.status !== 'refused_unverified_pid') failures.push('expected unverified stop refusal');
  if (online.policy.stopOnlyVerifiedSentinelPid !== true) failures.push('expected verified pid stop policy');
  if (online.policy.forceKillAllowed !== false) failures.push('force kill must stay disabled');
  if (online.policy.staleNetworkReceiptMayDriveActions !== false) failures.push('stale receipts must not drive actions');
  if (online.receipt.rawCommandLineIncluded !== false) failures.push('raw command line must stay hidden');
  if (online.receipt.destructiveActionsTaken !== false) failures.push('self-test must be non-destructive');
  if (/Get-CimInstance|powershell\.exe|Program Files\\nodejs/i.test(JSON.stringify(online))) failures.push('raw command text leaked');

  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }

  writeOutputs(args, online);
  return online;
}

function performAction(args, observation, previousReceipt) {
  if (args.action === 'status') return defaultActionResult('status');
  if (args.action === 'start') return startService(args, observation);
  if (args.action === 'stop') return stopService(args, observation);
  if (args.action === 'restart') return restartService(args, observation);
  if (args.action === 'ensure') return ensureService(args, observation, previousReceipt);
  return defaultActionResult(args.action);
}

try {
  const args = parseArgs(process.argv.slice(2));
  let receipt;
  if (args.selfTest) {
    receipt = runSelfTest(args);
  } else {
    const previousReceipt = readJson(args.output, {});
    const firstObservation = observeProcess(args);
    const actionResult = performAction(args, firstObservation, previousReceipt);
    const finalObservation = observeProcess(args);
    receipt = buildServiceReceipt(args, finalObservation, previousReceipt, actionResult);
    writeOutputs(args, receipt);
  }

  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log(`HoloShell network sentinel service: ${resolveRepoPath(args.output)}`);
    console.log(`Status: ${receipt.summary.serviceStatus}`);
    console.log(`Action: ${receipt.action.status}`);
    console.log(`PID alive: ${receipt.summary.pidAlive}`);
    console.log(`PID verified: ${receipt.summary.pidCommandVerified}`);
    console.log(`Heartbeat age ms: ${receipt.summary.heartbeatAgeMs ?? 'unknown'}`);
  }
} catch (error) {
  console.error(`holoshell-network-sentinel-service failed: ${error.message}`);
  process.exit(1);
}
