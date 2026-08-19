#!/usr/bin/env node
import crypto from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.laptop-reasoning-bridge-service.v0.1.0';
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_INTERVAL_MS = 10000;
const HEARTBEAT_STALE_MULTIPLIER = 4;
const STARTING_GRACE_MULTIPLIER = 2;
const DEFAULT_REMOTE_ROOT = '/mnt/nvme/holo/holoshell-surface/.tmp/holoshell';
const DEFAULT_RESULT_TEXT = 'Laptop reasoning bridge service processed this Jetson dispatch on the Windows laptop.';
const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const ACTIONS = new Set(['status', 'start', 'stop', 'restart', 'ensure']);

function defaultSshKey() {
  return process.env.HOLOSHELL_LAPTOP_REASONING_SSH_KEY
    || process.env.JETSON_KEY
    || path.join(process.env.USERPROFILE || os.homedir(), '.ssh', 'jetson_ed25519');
}

function defaultRemoteHost() {
  return process.env.HOLOSHELL_LAPTOP_REASONING_REMOTE_HOST
    || process.env.JETSON_HOST
    || 'username@holojetson.local';
}

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
    dispatchDir: null,
    inboxDir: null,
    resultDir: null,
    resultOutput: null,
    bridgeOutput: null,
    statePath: null,
    resultText: DEFAULT_RESULT_TEXT,
    remoteHost: defaultRemoteHost(),
    remoteRoot: process.env.HOLOSHELL_LAPTOP_REASONING_REMOTE_ROOT || DEFAULT_REMOTE_ROOT,
    sshKey: defaultSshKey(),
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
    else if (arg === '--dispatch-dir') args.dispatchDir = argv[++index];
    else if (arg === '--inbox-dir') args.inboxDir = argv[++index];
    else if (arg === '--result-dir') args.resultDir = argv[++index];
    else if (arg === '--result-output') args.resultOutput = argv[++index];
    else if (arg === '--bridge-output') args.bridgeOutput = argv[++index];
    else if (arg === '--state') args.statePath = argv[++index];
    else if (arg === '--result-text') args.resultText = argv[++index] || '';
    else if (arg === '--remote-host') args.remoteHost = argv[++index] || '';
    else if (arg === '--remote-root') args.remoteRoot = argv[++index] || DEFAULT_REMOTE_ROOT;
    else if (arg === '--ssh-key') args.sshKey = argv[++index] || '';
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!ACTIONS.has(args.action)) throw new Error(`--action must be one of: ${[...ACTIONS].join(', ')}`);
  if (!Number.isFinite(args.intervalMs) || args.intervalMs < 1000) {
    throw new Error('--interval-ms must be at least 1000');
  }
  if (!args.remoteHost) throw new Error('--remote-host is required');

  if (args.selfTest) args.tmpDir = path.join(DEFAULT_TMP, 'self-test');
  args.output ||= path.join(args.tmpDir, 'laptop-reasoning-bridge-service.json');
  args.jsOutput ||= path.join(args.tmpDir, 'laptop-reasoning-bridge-service.js');
  args.pidFile ||= path.join(args.tmpDir, 'laptop-reasoning-bridge-service.pid');
  args.logFile ||= path.join(args.tmpDir, 'laptop-reasoning-bridge-service.log');
  args.dispatchDir ||= path.join(args.tmpDir, 'agent-dispatches');
  args.inboxDir ||= path.join(args.tmpDir, 'laptop-reasoning-service-inbox');
  args.resultDir ||= path.join(args.tmpDir, 'laptop-reasoning-results');
  args.resultOutput ||= path.join(args.tmpDir, 'laptop-reasoning-result-latest.json');
  args.bridgeOutput ||= path.join(args.tmpDir, 'laptop-reasoning-bridge-latest.json');
  args.statePath ||= path.join(args.tmpDir, 'laptop-reasoning-bridge-service-state.json');
  return args;
}

function printHelp() {
  console.log(`HoloShell laptop reasoning bridge service manager

Usage:
  node scripts/holoshell-laptop-reasoning-bridge-service.mjs --status
  node scripts/holoshell-laptop-reasoning-bridge-service.mjs --ensure

Actions:
  --status               Write service health. Default.
  --start                Start the managed laptop reasoning bridge watcher.
  --stop                 Stop only the verified managed bridge PID.
  --restart              Stop verified bridge, then start a fresh one.
  --ensure               Start when offline, or restart stale verified watchers.

Options:
  --json                 Print service receipt JSON.
  --tmp-dir <path>       Receipt directory. Defaults to .tmp/holoshell.
  --output <path>        Service receipt JSON.
  --js-output <path>     Browser bootstrap JS.
  --pid-file <path>      Managed PID file.
  --log-file <path>      Watcher log file.
  --interval-ms <n>      Watch interval. Defaults to 10000.
  --remote-host <host>   SSH target. Defaults to username@holojetson.local.
  --remote-root <path>   Remote HoloShell tmp root.
  --ssh-key <path>       SSH private key path.
  --self-test            Assert receipt, redaction, and PID safety invariants.
  -h, --help             Show this help.
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
  writeFileSync(resolved, `window.HOLOSHELL_LAPTOP_REASONING_BRIDGE_SERVICE = ${payload};\n`, 'utf8');
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

function isVerifiedBridgeCommand(commandLine) {
  const text = String(commandLine || '').toLowerCase();
  return text.includes('holoshell-laptop-reasoning-bridge.mjs')
    && text.includes('--watch')
    && text.includes('--pull-remote')
    && text.includes('--push-remote');
}

function observeProcess(args) {
  const pid = readPid(args.pidFile);
  const pidAlive = isPidAlive(pid);
  const commandLine = pidAlive ? readProcessCommandLine(pid) : '';
  const pidCommandVerified = pidAlive && isVerifiedBridgeCommand(commandLine);
  const bridgeReceipt = readJson(args.bridgeOutput, {});
  const resultReceipt = readJson(args.resultOutput, {});
  return {
    pid,
    pidAlive,
    pidCommandVerified,
    commandLineObserved: Boolean(commandLine),
    commandLineHash: commandLine ? sha256(commandLine).slice(0, 16) : '',
    bridgeReceipt,
    resultReceipt,
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

function bridgeArgs(args) {
  const command = [
    'scripts/holoshell-laptop-reasoning-bridge.mjs',
    '--watch',
    '--interval-ms',
    String(args.intervalMs),
    '--dispatch-dir',
    args.dispatchDir,
    '--inbox-dir',
    args.inboxDir,
    '--result-dir',
    args.resultDir,
    '--result-output',
    args.resultOutput,
    '--bridge-output',
    args.bridgeOutput,
    '--state',
    args.statePath,
    '--remote-host',
    args.remoteHost,
    '--remote-root',
    args.remoteRoot,
    '--pull-remote',
    '--push-remote',
  ];
  if (args.sshKey) command.push('--ssh-key', args.sshKey);
  if (args.resultText) command.push('--result-text', args.resultText);
  return command;
}

function startService(args, previousObservation = observeProcess(args)) {
  if (previousObservation.pidAlive && previousObservation.pidCommandVerified) {
    return {
      ...defaultActionResult('start'),
      status: 'already_running',
      reason: 'verified laptop reasoning bridge is already alive',
    };
  }
  if (previousObservation.pidAlive && !previousObservation.pidCommandVerified) {
    return {
      ...defaultActionResult('start'),
      status: 'refused_unverified_pid',
      reason: 'pid file points at a live process that is not a verified laptop reasoning bridge',
    };
  }

  const logPath = resolveRepoPath(args.logFile);
  mkdirSync(path.dirname(logPath), { recursive: true });
  const stdoutFd = openSync(logPath, 'a');
  const stderrFd = openSync(logPath, 'a');
  const startedAt = nowIso();
  writeFileSync(logPath, `[${startedAt}] starting HoloShell laptop reasoning bridge service\n`, { flag: 'a' });
  try {
    const child = spawn(process.execPath, bridgeArgs(args), {
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
      reason: 'started managed laptop reasoning bridge watcher',
      startedPid: child.pid,
      startedAt,
    };
  } catch (error) {
    return {
      ...defaultActionResult('start'),
      status: 'start_failed',
      reason: error.message,
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
      reason: 'refused to stop a pid that is not verified as the laptop reasoning bridge',
    };
  }

  process.kill(observation.pid);
  const exited = waitForExit(observation.pid);
  if (exited) removePid(args.pidFile);
  return {
    ...defaultActionResult('stop'),
    status: exited ? 'stopped' : 'stop_pending',
    performed: true,
    reason: exited ? 'verified laptop reasoning bridge stopped' : 'termination signal sent to verified bridge, process still visible',
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
    reason: start.status === 'started' ? 'restarted managed laptop reasoning bridge watcher' : start.reason,
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

function serviceStatusFrom({ observation, lastBridgeReceiptAt, lastStartedAt, generatedAt, args, actionResult }) {
  if (actionResult?.status === 'start_failed') return 'start_failed';
  if (!observation.pid || !observation.pidAlive) return 'offline';
  if (!observation.pidCommandVerified) return 'unverified_pid';

  const bridgeAge = ageMs(lastBridgeReceiptAt, generatedAt);
  const startedAge = ageMs(lastStartedAt, generatedAt);
  const recentlyStarted = startedAge !== null && startedAge <= args.intervalMs * STARTING_GRACE_MULTIPLIER;
  if (!lastBridgeReceiptAt && recentlyStarted) return 'starting';
  if (bridgeAge !== null && bridgeAge > args.intervalMs * HEARTBEAT_STALE_MULTIPLIER) return 'stale';
  if (!lastBridgeReceiptAt) return 'stale';
  if (observation.bridgeReceipt?.summary?.status === 'blocked') return 'blocked';
  if (observation.bridgeReceipt?.summary?.status === 'partial') return 'partial';
  return 'online';
}

function buildServiceReceipt(args, observation, previousReceipt = {}, actionResult = defaultActionResult(args.action)) {
  const generatedAtDate = new Date();
  const generatedAt = generatedAtDate.toISOString();
  const bridgeReceipt = observation.bridgeReceipt || {};
  const bridgeSummary = bridgeReceipt.summary || {};
  const resultReceipt = observation.resultReceipt || {};
  const previousSummary = previousReceipt.summary || {};
  const lastStartedAt = actionResult.startedAt || previousSummary.lastStartedAt || '';
  const lastBridgeReceiptAt = bridgeReceipt.generatedAt || '';
  const bridgeReceiptAge = ageMs(lastBridgeReceiptAt, generatedAtDate);
  const serviceStatus = serviceStatusFrom({
    observation,
    lastBridgeReceiptAt,
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
    lastBridgeReceiptAt,
    latestDispatchId: bridgeSummary.latestDispatchId || '',
    latestResultId: bridgeSummary.latestResultId || '',
    restartCount,
    actionStatus: actionResult.status,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-laptop-reasoning-bridge-service.hsplus',
      adapter: 'scripts/holoshell-laptop-reasoning-bridge-service.mjs',
      bridgeSource: 'apps/holoshell/source/holoshell-laptop-reasoning-bridge.hsplus',
      bridgeScript: 'scripts/holoshell-laptop-reasoning-bridge.mjs',
      workerSource: 'apps/holoshell/source/holoshell-laptop-reasoning-worker.hsplus',
      workerScript: 'scripts/holoshell-laptop-reasoning-worker.mjs',
      supervisorSource: 'apps/holoshell/source/holoshell-service-supervisor.hsplus',
    },
    summary: {
      serviceStatus,
      serviceMode: 'managed_remote_receipt_bridge',
      pid: observation.pid || 0,
      pidAlive: Boolean(observation.pidAlive),
      pidCommandVerified: Boolean(observation.pidCommandVerified),
      commandLineObserved: Boolean(observation.commandLineObserved),
      commandLineHash: observation.commandLineHash || '',
      intervalMs: args.intervalMs,
      restartPolicy: 'ensure_restarts_offline_or_stale_verified_bridge_watchers',
      autoRestartAllowed: true,
      restartCount,
      lastStartedAt,
      lastBridgeReceiptAt,
      bridgeReceiptAgeMs: bridgeReceiptAge ?? null,
      staleBridgeReceipt: bridgeReceiptAge !== null ? bridgeReceiptAge > args.intervalMs * HEARTBEAT_STALE_MULTIPLIER : serviceStatus === 'stale',
      bridgeStatus: bridgeSummary.status || bridgeReceipt.status || 'unknown',
      bridgeId: bridgeReceipt.bridgeId || '',
      pulledCount: bridgeSummary.pulledCount || 0,
      processedCount: bridgeSummary.processedCount || 0,
      skippedCount: bridgeSummary.skippedCount || 0,
      pushedCount: bridgeSummary.pushedCount || 0,
      errorCount: bridgeSummary.errorCount || 0,
      latestDispatchId: bridgeSummary.latestDispatchId || '',
      latestResultId: bridgeSummary.latestResultId || '',
      latestResultStatus: resultReceipt.summary?.status || resultReceipt.status || 'unknown',
      latestResultGeneratedAt: resultReceipt.generatedAt || '',
      remoteHostConfigured: Boolean(args.remoteHost),
      remoteRoot: args.remoteRoot,
      pullRemote: true,
      pushRemote: true,
    },
    process: {
      pidFile: toRepoPath(args.pidFile),
      logFile: toRepoPath(args.logFile),
      statePath: toRepoPath(args.statePath),
      inboxDir: toRepoPath(args.inboxDir),
      resultDir: toRepoPath(args.resultDir),
      commandPreview: `node scripts/holoshell-laptop-reasoning-bridge.mjs --watch --pull-remote --push-remote --remote-host <configured> --remote-root ${args.remoteRoot}`,
      rawCommandLineIncluded: false,
      sshKeyPathIncluded: false,
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
      stopOnlyVerifiedLaptopReasoningBridgePid: true,
      unverifiedPidStopRefused: true,
      forceKillAllowed: false,
      pullsRemoteDispatchReceipts: true,
      remoteWriteScope: 'laptop-reasoning-results',
      remoteMutationLimitedToResultReceipts: true,
      forbiddenRemoteMutation: ['source_edit', 'service_restart', 'secret_write'],
      modelInvocationPerformedByServiceManager: false,
      destructiveActionsTaken: false,
      desktopAutomationExecuted: false,
      rawCommandLineIncluded: false,
      sshKeyPathIncluded: false,
      localReceiptOnly: true,
    },
    receipt: {
      snapshotHash: sha256(JSON.stringify(hashInput)),
      localOnly: true,
      rawIdentifiersIncluded: false,
      rawCommandLineIncluded: false,
      destructiveActionsTaken: false,
      desktopAutomationExecuted: false,
      serviceMutationTaken: Boolean(actionResult.performed),
    },
  };
}

function writeOutputs(args, receipt) {
  const output = writeJson(args.output, receipt);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, receipt);
  return { output, jsOutput };
}

function fixtureBridgeReceipt({ generatedAt = new Date(Date.now() - 1000).toISOString(), status = 'completed' } = {}) {
  return {
    schemaVersion: 'hololand.holoshell.laptop-reasoning-bridge.v0.1.0',
    bridgeId: 'laptop_reasoning_bridge_fixture',
    generatedAt,
    status,
    mode: {
      watch: true,
      pullRemote: true,
      pushRemote: true,
      remoteHostConfigured: true,
      remoteRoot: DEFAULT_REMOTE_ROOT,
    },
    summary: {
      status,
      pulledCount: 1,
      processedCount: 1,
      skippedCount: 0,
      errorCount: 0,
      pushedCount: 1,
      latestDispatchId: 'hsdispatch-fixture',
      latestResultId: 'laptop_reasoning_result_fixture',
      destructiveActionsTaken: false,
      desktopAutomationExecuted: false,
      receiptRequired: true,
    },
  };
}

function runSelfTest(args) {
  const previousReceipt = { summary: { restartCount: 2, lastStartedAt: '2026-06-28T00:04:30.000Z' } };
  const currentObservation = {
    pid: 5280,
    pidAlive: true,
    pidCommandVerified: true,
    commandLineObserved: true,
    commandLineHash: 'fixture-command',
    bridgeReceipt: fixtureBridgeReceipt(),
    resultReceipt: {
      schemaVersion: 'hololand.holoshell.laptop-reasoning-result.v0.1.0',
      generatedAt: new Date(Date.now() - 900).toISOString(),
      summary: { status: 'completed' },
    },
  };
  const online = buildServiceReceipt(
    args,
    currentObservation,
    previousReceipt,
    { ...defaultActionResult('status'), status: 'observed', reason: 'fixture online' },
  );
  const stale = buildServiceReceipt(
    args,
    {
      ...currentObservation,
      bridgeReceipt: fixtureBridgeReceipt({ generatedAt: '2026-06-28T00:00:00.000Z' }),
    },
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
  if (online.policy.stopOnlyVerifiedLaptopReasoningBridgePid !== true) failures.push('expected verified pid stop policy');
  if (online.policy.forceKillAllowed !== false) failures.push('force kill must stay disabled');
  if (online.policy.remoteMutationLimitedToResultReceipts !== true) failures.push('remote writes must be receipt-only');
  if (online.receipt.rawCommandLineIncluded !== false) failures.push('raw command line must stay hidden');
  if (online.process.sshKeyPathIncluded !== false) failures.push('ssh key path must stay hidden from receipts');
  if (online.receipt.destructiveActionsTaken !== false) failures.push('self-test must be non-destructive');
  if (/Get-CimInstance|powershell\.exe|Program Files\\nodejs|jetson_ed25519/i.test(JSON.stringify(online))) {
    failures.push('raw command text or key path leaked');
  }

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
    console.log(`HoloShell laptop reasoning bridge service: ${resolveRepoPath(args.output)}`);
    console.log(`Status: ${receipt.summary.serviceStatus}`);
    console.log(`Action: ${receipt.action.status}`);
    console.log(`PID alive: ${receipt.summary.pidAlive}`);
    console.log(`PID verified: ${receipt.summary.pidCommandVerified}`);
    console.log(`Bridge status: ${receipt.summary.bridgeStatus}`);
    console.log(`Bridge receipt age ms: ${receipt.summary.bridgeReceiptAgeMs ?? 'unknown'}`);
  }
} catch (error) {
  console.error(`holoshell-laptop-reasoning-bridge-service failed: ${error.message}`);
  process.exit(1);
}
