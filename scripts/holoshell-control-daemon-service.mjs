#!/usr/bin/env node
import crypto from 'node:crypto';
import http from 'node:http';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.control-daemon-service.v0.1.0';
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4747;
const DEFAULT_MAX_APPS = 250;
const DEFAULT_TIMEOUT_MS = 900;
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
    host: process.env.HOLOSHELL_CONTROL_HOST || DEFAULT_HOST,
    port: Number(process.env.HOLOSHELL_CONTROL_PORT || DEFAULT_PORT),
    maxApps: DEFAULT_MAX_APPS,
    enableExecute: false,
    enableTrustedExecute: false,
    skipHealthProbe: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--status') args.action = 'status';
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
    else if (arg === '--host') args.host = argv[++index] || DEFAULT_HOST;
    else if (arg === '--port') args.port = Number(argv[++index] || DEFAULT_PORT);
    else if (arg === '--max-apps') args.maxApps = Number(argv[++index] || DEFAULT_MAX_APPS);
    else if (arg === '--enable-execute') args.enableExecute = true;
    else if (arg === '--enable-trusted-execute') args.enableTrustedExecute = true;
    else if (arg === '--skip-health-probe') args.skipHealthProbe = true;
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++index]);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!ACTIONS.has(args.action)) throw new Error(`--action must be one of: ${[...ACTIONS].join(', ')}`);
  if (!Number.isFinite(args.port) || args.port <= 0) throw new Error('--port must be a positive number');
  if (!Number.isFinite(args.maxApps) || args.maxApps <= 0) throw new Error('--max-apps must be a positive number');
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 100) throw new Error('--timeout-ms must be at least 100');
  if (args.enableTrustedExecute && !args.enableExecute) {
    throw new Error('--enable-trusted-execute requires --enable-execute');
  }

  if (args.selfTest) args.tmpDir = path.join(DEFAULT_TMP, 'self-test');
  args.output ||= path.join(args.tmpDir, 'control-daemon-service.json');
  args.jsOutput ||= path.join(args.tmpDir, 'control-daemon-service.js');
  args.pidFile ||= path.join(args.tmpDir, 'control-daemon-service.pid');
  args.logFile ||= path.join(args.tmpDir, 'control-daemon-service.log');
  return args;
}

function printHelp() {
  console.log(`HoloShell control daemon service manager

Usage:
  node scripts/holoshell-control-daemon-service.mjs --status
  node scripts/holoshell-control-daemon-service.mjs --ensure

Actions:
  --status                    Write service health. Default.
  --start                     Start the read/stage loopback daemon if no verified daemon is alive.
  --stop                      Stop only the verified managed control-daemon PID.
  --restart                   Stop verified daemon, then start a fresh one.
  --ensure                    Start when offline. Never grants execute by default.

Options:
  --json                      Print service receipt JSON.
  --tmp-dir <path>            Receipt directory. Defaults to .tmp/holoshell.
  --output <path>             Service receipt JSON. Defaults to <tmp-dir>/control-daemon-service.json.
  --js-output <path>          Browser bootstrap JS. Defaults to <tmp-dir>/control-daemon-service.js.
  --pid-file <path>           Managed PID file. Defaults to <tmp-dir>/control-daemon-service.pid.
  --log-file <path>           Daemon log file. Defaults to <tmp-dir>/control-daemon-service.log.
  --host <host>               Bind host. Defaults to 127.0.0.1.
  --port <number>             Bind port. Defaults to 4747.
  --max-apps <number>         Program registry scan cap for daemon actions.
  --enable-execute            Allow approved mutation execution inside daemon.
  --enable-trusted-execute    Mark trusted execute enabled; requires --enable-execute.
  --skip-health-probe         Avoid probing the daemon from inside the daemon.
  --timeout-ms <number>       Health probe timeout. Default 900.
  --self-test                 Assert receipt, redaction, and PID safety invariants.
  -h, --help                  Show this help.
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
  writeFileSync(resolved, `window.HOLOSHELL_CONTROL_DAEMON_SERVICE = ${payload};\n`, 'utf8');
  return resolved;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function nowIso() {
  return new Date().toISOString();
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

function isVerifiedControlDaemonCommand(commandLine) {
  const text = String(commandLine || '').toLowerCase();
  return text.includes('holoshell-control-daemon.mjs');
}

function controlEndpoint(args) {
  return `http://${args.host}:${args.port}/health`;
}

function httpGetJson(url, timeoutMs) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
        if (body.length > 64 * 1024) request.destroy(new Error('response too large'));
      });
      response.on('end', () => {
        try {
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            statusCode: response.statusCode,
            body: JSON.parse(body || '{}'),
            error: '',
          });
        } catch (error) {
          resolve({ ok: false, statusCode: response.statusCode, body: {}, error: error.message });
        }
      });
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', (error) => resolve({ ok: false, statusCode: 0, body: {}, error: error.message }));
  });
}

async function observeProcess(args) {
  const pid = readPid(args.pidFile);
  const pidAlive = isPidAlive(pid);
  const commandLine = pidAlive ? readProcessCommandLine(pid) : '';
  const pidCommandVerified = pidAlive && isVerifiedControlDaemonCommand(commandLine);
  const healthProbe = args.skipHealthProbe
    ? { skipped: true, ok: false, statusCode: 0, body: {}, error: 'skipped_by_parent_daemon' }
    : await httpGetJson(controlEndpoint(args), args.timeoutMs);
  return {
    pid,
    pidAlive,
    pidCommandVerified,
    commandLineObserved: Boolean(commandLine),
    commandLineHash: commandLine ? sha256(commandLine).slice(0, 16) : '',
    healthProbe,
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

function daemonArgs(args) {
  const command = [
    'scripts/holoshell-control-daemon.mjs',
    '--host',
    args.host,
    '--port',
    String(args.port),
    '--tmp-dir',
    args.tmpDir,
    '--max-apps',
    String(args.maxApps),
  ];
  if (args.enableExecute) command.push('--enable-execute');
  if (args.enableTrustedExecute) command.push('--enable-trusted-execute');
  return command;
}

async function waitForHealth(args, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  let latest = { ok: false, statusCode: 0, body: {}, error: 'not_checked' };
  while (Date.now() < deadline) {
    latest = await httpGetJson(controlEndpoint(args), Math.min(args.timeoutMs, 500));
    if (latest.ok) return latest;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return latest;
}

async function startService(args, previousObservation = null) {
  const observation = previousObservation || await observeProcess(args);
  if (observation.healthProbe?.ok && !observation.pidCommandVerified) {
    return {
      ...defaultActionResult('start'),
      status: 'already_online_unmanaged',
      reason: 'loopback daemon is already reachable but is not owned by this manager pid file',
    };
  }
  if (observation.pidAlive && observation.pidCommandVerified) {
    return {
      ...defaultActionResult('start'),
      status: 'already_running',
      reason: 'verified control daemon is already alive',
    };
  }
  if (observation.pidAlive && !observation.pidCommandVerified) {
    return {
      ...defaultActionResult('start'),
      status: 'refused_unverified_pid',
      reason: 'pid file points at a live process that is not a verified control daemon',
    };
  }

  const logPath = resolveRepoPath(args.logFile);
  mkdirSync(path.dirname(logPath), { recursive: true });
  const stdoutFd = openSync(logPath, 'a');
  const stderrFd = openSync(logPath, 'a');
  const startedAt = nowIso();
  writeFileSync(logPath, `[${startedAt}] starting HoloShell control daemon service\n`, { flag: 'a' });
  try {
    const child = spawn(process.execPath, daemonArgs(args), {
      cwd: REPO_ROOT,
      detached: true,
      windowsHide: true,
      stdio: ['ignore', stdoutFd, stderrFd],
    });
    child.unref();
    writePid(args.pidFile, child.pid);
    const health = await waitForHealth(args);
    return {
      ...defaultActionResult('start'),
      status: health.ok ? 'started' : 'start_pending',
      performed: true,
      reason: health.ok ? 'started managed control daemon' : `started process but health is not reachable yet: ${health.error || health.statusCode}`,
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

async function stopService(args, observation = null) {
  const currentObservation = observation || await observeProcess(args);
  if (!currentObservation.pid) {
    return {
      ...defaultActionResult('stop'),
      status: 'already_offline',
      reason: 'no managed pid file exists',
    };
  }
  if (!currentObservation.pidAlive) {
    removePid(args.pidFile);
    return {
      ...defaultActionResult('stop'),
      status: 'stale_pid_cleared',
      performed: true,
      reason: 'managed pid file was stale and has been cleared',
    };
  }
  if (!currentObservation.pidCommandVerified) {
    return {
      ...defaultActionResult('stop'),
      status: 'refused_unverified_pid',
      reason: 'refused to stop a pid that is not verified as the control daemon',
    };
  }

  process.kill(currentObservation.pid);
  const exited = waitForExit(currentObservation.pid);
  if (exited) removePid(args.pidFile);
  return {
    ...defaultActionResult('stop'),
    status: exited ? 'stopped' : 'stop_pending',
    performed: true,
    reason: exited ? 'verified control daemon stopped' : 'termination signal sent to verified daemon, process still visible',
    serviceProcessTerminated: exited,
  };
}

async function restartService(args, observation = null) {
  const currentObservation = observation || await observeProcess(args);
  const stop = await stopService(args, currentObservation);
  if (stop.status === 'refused_unverified_pid' || stop.status === 'stop_pending') {
    return {
      ...stop,
      requestedAction: 'restart',
      reason: `restart blocked: ${stop.reason}`,
    };
  }
  const start = await startService(args, await observeProcess(args));
  return {
    ...start,
    requestedAction: 'restart',
    restarted: start.status === 'started',
    reason: start.status === 'started' ? 'restarted managed control daemon' : start.reason,
  };
}

async function ensureService(args, observation = null) {
  const currentObservation = observation || await observeProcess(args);
  const preliminary = buildServiceReceipt(args, currentObservation, {}, defaultActionResult('ensure'));
  if (['online', 'online_unmanaged', 'starting', 'not_probed_verified_pid'].includes(preliminary.summary.serviceStatus)) {
    return {
      ...defaultActionResult('ensure'),
      status: 'already_healthy',
      reason: `service is ${preliminary.summary.serviceStatus}`,
    };
  }
  if (preliminary.summary.serviceStatus === 'unverified_pid') {
    return {
      ...defaultActionResult('ensure'),
      status: 'refused_unverified_pid',
      reason: 'ensure refused because the pid file points at an unverified live process',
    };
  }
  if (args.skipHealthProbe) {
    return {
      ...defaultActionResult('ensure'),
      status: 'skipped_by_parent_daemon',
      reason: 'ensure skipped because health probing was disabled by the parent daemon',
    };
  }
  return startService(args, currentObservation);
}

function serviceStatusFrom({ observation, actionResult }) {
  if (actionResult?.status === 'start_failed') return 'start_failed';
  if (observation.healthProbe?.skipped) {
    if (observation.pidAlive && observation.pidCommandVerified) return 'not_probed_verified_pid';
    return 'not_probed';
  }
  if (observation.healthProbe?.ok) {
    return observation.pidCommandVerified ? 'online' : 'online_unmanaged';
  }
  if (observation.pidAlive && !observation.pidCommandVerified) return 'unverified_pid';
  if (observation.pidAlive && observation.pidCommandVerified) return 'starting';
  return 'offline';
}

function buildServiceReceipt(args, observation, previousReceipt = {}, actionResult = defaultActionResult(args.action)) {
  const generatedAt = nowIso();
  const health = observation.healthProbe || {};
  const healthBody = health.body || {};
  const previousSummary = previousReceipt.summary || {};
  const lastStartedAt = actionResult.startedAt || previousSummary.lastStartedAt || '';
  const serviceStatus = serviceStatusFrom({ observation, actionResult });
  const hashInput = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    serviceStatus,
    pid: observation.pid || 0,
    pidAlive: observation.pidAlive,
    pidCommandVerified: observation.pidCommandVerified,
    loopbackReachable: Boolean(health.ok),
    executeEnabled: Boolean(healthBody.executeEnabled),
    actionStatus: actionResult.status,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-control-daemon-service.hsplus',
      daemonSource: 'apps/holoshell/source/holoshell-hardware-control.hsplus',
      adapter: 'scripts/holoshell-control-daemon-service.mjs',
      daemonAdapter: 'scripts/holoshell-control-daemon.mjs',
      serviceSupervisor: 'scripts/holoshell-service-supervisor.mjs',
    },
    summary: {
      serviceStatus,
      serviceMode: 'managed_loopback_daemon',
      pid: observation.pid || 0,
      pidAlive: Boolean(observation.pidAlive),
      pidCommandVerified: Boolean(observation.pidCommandVerified),
      commandLineObserved: Boolean(observation.commandLineObserved),
      commandLineHash: observation.commandLineHash || '',
      host: args.host,
      port: args.port,
      endpoint: health.skipped ? 'loopback_probe_skipped' : controlEndpoint(args),
      loopbackReachable: Boolean(health.ok),
      healthStatusCode: health.statusCode || 0,
      healthError: health.skipped ? 'skipped_by_parent_daemon' : health.error || '',
      executeEnabled: Boolean(healthBody.executeEnabled),
      trustedExecuteEnabled: Boolean(healthBody.trustedExecuteEnabled),
      workflowIntentGateRequired: healthBody.workflowIntentGateRequired !== false,
      mutationExecutionStatus: healthBody.executeEnabled ? 'enabled_after_approval' : 'disabled_by_default',
      maxApps: args.maxApps,
      lastStartedAt,
      restartPolicy: 'ensure_starts_offline_read_stage_daemon',
      autoRestartAllowed: true,
    },
    process: {
      pidFile: toRepoPath(args.pidFile),
      logFile: toRepoPath(args.logFile),
      commandPreview: `node scripts/holoshell-control-daemon.mjs --host ${args.host} --port ${args.port}`,
      rawCommandLineIncluded: false,
    },
    action: {
      requestedAction: actionResult.requestedAction || args.action,
      status: actionResult.status || 'observed',
      performed: Boolean(actionResult.performed),
      reason: actionResult.reason || '',
      startedPid: actionResult.startedPid || null,
      startedAt: actionResult.startedAt || '',
      serviceProcessTerminated: Boolean(actionResult.serviceProcessTerminated),
      rawCommandLineIncluded: false,
    },
    policy: {
      loopbackOnly: true,
      bindHost: args.host,
      exactPidRequired: true,
      stopOnlyVerifiedControlDaemonPid: true,
      unverifiedPidStopRefused: true,
      forceKillAllowed: false,
      defaultExecuteEnabled: false,
      enableExecuteRequested: Boolean(args.enableExecute),
      enableTrustedExecuteRequested: Boolean(args.enableTrustedExecute),
      approvalRequiredForMutation: true,
      workflowIntentGateRequired: true,
      rawCommandLineIncluded: false,
      localOnly: true,
    },
    receipt: {
      snapshotHash: sha256(JSON.stringify(hashInput)),
      localOnly: true,
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

function runSelfTest(args) {
  const onlineObservation = {
    pid: 4242,
    pidAlive: true,
    pidCommandVerified: true,
    commandLineObserved: true,
    commandLineHash: 'fixture-command',
    healthProbe: {
      ok: true,
      statusCode: 200,
      body: {
        status: 'online',
        executeEnabled: false,
        trustedExecuteEnabled: false,
        workflowIntentGateRequired: true,
      },
      error: '',
    },
  };
  const online = buildServiceReceipt(
    args,
    onlineObservation,
    {},
    { ...defaultActionResult('status'), status: 'observed', reason: 'fixture online' },
  );
  const unmanaged = buildServiceReceipt(
    args,
    { ...onlineObservation, pid: null, pidAlive: false, pidCommandVerified: false },
    {},
    { ...defaultActionResult('status'), status: 'observed', reason: 'fixture unmanaged' },
  );
  const unverified = buildServiceReceipt(
    args,
    { ...onlineObservation, pidCommandVerified: false, healthProbe: { ok: false, statusCode: 0, body: {}, error: 'offline' } },
    {},
    { ...defaultActionResult('stop'), status: 'refused_unverified_pid', reason: 'fixture refused' },
  );

  const failures = [];
  if (online.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (online.summary.serviceStatus !== 'online') failures.push(`expected online, got ${online.summary.serviceStatus}`);
  if (online.summary.executeEnabled !== false) failures.push('execute must default to disabled');
  if (online.policy.stopOnlyVerifiedControlDaemonPid !== true) failures.push('expected verified pid stop policy');
  if (online.policy.forceKillAllowed !== false) failures.push('force kill must stay disabled');
  if (online.receipt.rawCommandLineIncluded !== false) failures.push('raw command line must stay hidden');
  if (online.receipt.destructiveActionsTaken !== false) failures.push('self-test must be non-destructive');
  if (unmanaged.summary.serviceStatus !== 'online_unmanaged') failures.push('expected unmanaged online status');
  if (unverified.summary.serviceStatus !== 'unverified_pid') failures.push('expected unverified pid status');
  if (unverified.action.status !== 'refused_unverified_pid') failures.push('expected unverified stop refusal');
  if (/Get-CimInstance|powershell\.exe|Program Files\\nodejs/i.test(JSON.stringify(online))) failures.push('raw command text leaked');

  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }

  return online;
}

async function performAction(args, observation) {
  if (args.action === 'status') return defaultActionResult('status');
  if (args.action === 'start') return startService(args, observation);
  if (args.action === 'stop') return stopService(args, observation);
  if (args.action === 'restart') return restartService(args, observation);
  if (args.action === 'ensure') return ensureService(args, observation);
  return defaultActionResult(args.action);
}

try {
  const args = parseArgs(process.argv.slice(2));
  let receipt;
  if (args.selfTest) {
    receipt = runSelfTest(args);
  } else {
    const previousReceipt = readJson(args.output, {});
    const firstObservation = await observeProcess(args);
    let actionResult;
    try {
      actionResult = await performAction(args, firstObservation);
    } catch (error) {
      actionResult = {
        ...defaultActionResult(args.action),
        status: 'start_failed',
        reason: error.message,
      };
    }
    const secondObservation = await observeProcess(args);
    receipt = buildServiceReceipt(args, secondObservation, previousReceipt, actionResult);
  }

  const { output, jsOutput } = writeOutputs(args, receipt);
  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log(`HoloShell control daemon service: ${output}`);
    console.log(`HoloShell control daemon service browser bootstrap: ${jsOutput}`);
    console.log(`Status: ${receipt.summary.serviceStatus}`);
    console.log(`PID alive: ${receipt.summary.pidAlive ? 'yes' : 'no'}`);
    console.log(`PID verified: ${receipt.summary.pidCommandVerified ? 'yes' : 'no'}`);
    console.log(`Loopback reachable: ${receipt.summary.loopbackReachable ? 'yes' : 'no'}`);
    console.log(`Execute enabled: ${receipt.summary.executeEnabled ? 'yes' : 'no'}`);
    console.log(`Action: ${receipt.action.status}`);
  }
} catch (error) {
  console.error(`holoshell-control-daemon-service failed: ${error.message}`);
  process.exit(1);
}
