#!/usr/bin/env node
import crypto from 'node:crypto';
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.service-supervisor.v0.1.0';
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const UPSTREAM_TERMINAL_EVENT_STREAM_SOURCE =
  'HoloScript:experiments/holoshell-human-os-frontier/native-terminal-event-stream.hsplus';
const DEFAULT_CONTROL_ENDPOINT = 'http://127.0.0.1:4747/health';
const DEFAULT_HEARTBEAT_STALE_MS = 120000;

function parseArgs(argv) {
  const args = {
    action: 'status',
    json: false,
    selfTest: false,
    tmpDir: DEFAULT_TMP,
    output: null,
    jsOutput: null,
    controlEndpoint: process.env.HOLOSHELL_CONTROL_ENDPOINT || DEFAULT_CONTROL_ENDPOINT,
    skipControlProbe: false,
    heartbeatStaleMs: DEFAULT_HEARTBEAT_STALE_MS,
    timeoutMs: 900,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--status') args.action = 'status';
    else if (arg === '--ensure') args.action = 'ensure';
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--tmp-dir') args.tmpDir = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--control-endpoint') args.controlEndpoint = argv[++index];
    else if (arg === '--skip-control-probe') args.skipControlProbe = true;
    else if (arg === '--heartbeat-stale-ms') args.heartbeatStaleMs = Number(argv[++index]);
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++index]);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!['status', 'ensure'].includes(args.action)) {
    throw new Error('--action must be status or ensure');
  }
  if (!Number.isFinite(args.heartbeatStaleMs) || args.heartbeatStaleMs < 1000) {
    throw new Error('--heartbeat-stale-ms must be at least 1000');
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs < 100) {
    throw new Error('--timeout-ms must be at least 100');
  }

  if (args.selfTest) args.tmpDir = path.join(DEFAULT_TMP, 'self-test');
  args.output ||= path.join(args.tmpDir, 'service-supervisor.json');
  args.jsOutput ||= path.join(args.tmpDir, 'service-supervisor.js');
  return args;
}

function printHelp() {
  console.log(`HoloShell service supervisor

Usage:
  node scripts/holoshell-service-supervisor.mjs --status
  node scripts/holoshell-service-supervisor.mjs --ensure

Options:
  --status                    Write read-only service health. Default.
  --ensure                    Delegate only to registered safe ensure managers.
  --json                      Print supervisor JSON.
  --tmp-dir <path>            Receipt directory. Defaults to .tmp/holoshell.
  --output <path>             Supervisor receipt. Defaults to <tmp-dir>/service-supervisor.json.
  --js-output <path>          Browser bootstrap. Defaults to <tmp-dir>/service-supervisor.js.
  --control-endpoint <url>    Local control daemon health endpoint.
  --skip-control-probe        Do not HTTP-probe the control daemon. Use inside the daemon to avoid self-probe blocking.
  --heartbeat-stale-ms <n>    Stale threshold for heartbeat-only services. Default 120000.
  --timeout-ms <n>            HTTP probe timeout. Default 900.
  --self-test                 Use fixtures and assert invariants.
  -h, --help                  Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
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
  writeFileSync(resolved, `window.HOLOSHELL_SERVICE_SUPERVISOR = ${payload};\n`, 'utf8');
  return resolved;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ageMs(value, nowMs = Date.now()) {
  const date = parseDate(value);
  if (!date) return null;
  return Math.max(0, nowMs - date.getTime());
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || result.error?.message || '',
  };
}

function refreshNetworkSentinelService(args) {
  const command = [
    'scripts/holoshell-network-sentinel-service.mjs',
    args.action === 'ensure' ? '--ensure' : '--status',
    '--tmp-dir',
    args.tmpDir,
  ];
  const result = runNode(command);
  const receipt = readJson(path.join(args.tmpDir, 'network-sentinel-service.json'), {});
  return {
    result,
    receipt,
    serviceMutationTaken: Boolean(receipt?.receipt?.serviceMutationTaken),
  };
}

function parseControlEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return {
      host: url.hostname || '127.0.0.1',
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
    };
  } catch {
    return { host: '127.0.0.1', port: 4747 };
  }
}

function refreshControlDaemonService(args) {
  const endpoint = parseControlEndpoint(args.controlEndpoint);
  const command = [
    'scripts/holoshell-control-daemon-service.mjs',
    args.action === 'ensure' ? '--ensure' : '--status',
    '--tmp-dir',
    args.tmpDir,
    '--host',
    endpoint.host,
    '--port',
    String(endpoint.port),
    '--timeout-ms',
    String(args.timeoutMs),
  ];
  if (args.skipControlProbe) command.push('--skip-health-probe');
  const result = runNode(command);
  const receipt = readJson(path.join(args.tmpDir, 'control-daemon-service.json'), {});
  return {
    result,
    receipt,
    serviceMutationTaken: Boolean(receipt?.receipt?.serviceMutationTaken),
  };
}

function refreshLaptopReasoningBridgeService(args) {
  const command = [
    'scripts/holoshell-laptop-reasoning-bridge-service.mjs',
    args.action === 'ensure' ? '--ensure' : '--status',
    '--tmp-dir',
    args.tmpDir,
  ];
  const result = runNode(command);
  const receipt = readJson(path.join(args.tmpDir, 'laptop-reasoning-bridge-service.json'), {});
  return {
    result,
    receipt,
    serviceMutationTaken: Boolean(receipt?.receipt?.serviceMutationTaken),
  };
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
    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });
    request.on('error', (error) => {
      resolve({ ok: false, statusCode: 0, body: {}, error: error.message });
    });
  });
}

function normalizeStatus(status, requiredForAutonomy = false) {
  if (['online', 'starting', 'observing', 'available', 'active_or_available', 'not_probed_verified_pid'].includes(status)) return 'online';
  if (['stale', 'unverified_pid', 'start_failed', 'blocked', 'partial', 'warn', 'online_unmanaged', 'not_probed'].includes(status)) return 'degraded';
  if (['offline', 'missing'].includes(status)) return requiredForAutonomy ? 'offline' : 'offline';
  return 'unknown';
}

function actionRequiredFor(service) {
  if (!service.requiredForAutonomy) return false;
  return !['online', 'starting', 'observing', 'available', 'active_or_available'].includes(service.status);
}

function serviceFromNetworkSentinel(receipt, commandResult) {
  const summary = receipt?.summary || {};
  const policy = receipt?.policy || {};
  const status = summary.serviceStatus || (commandResult?.ok ? 'unknown' : 'missing');
  return {
    serviceId: 'network-sentinel-service',
    label: 'Network Sentinel Service',
    serviceKind: 'managed_pid_watch',
    requiredForAutonomy: true,
    status,
    normalizedStatus: normalizeStatus(status, true),
    source: 'apps/holoshell/source/holoshell-network-sentinel-service.hsplus',
    adapter: 'scripts/holoshell-network-sentinel-service.mjs',
    receiptPath: '.tmp/holoshell/network-sentinel-service.json',
    pid: summary.pid || 0,
    pidAlive: Boolean(summary.pidAlive),
    pidCommandVerified: Boolean(summary.pidCommandVerified),
    lastHeartbeatAt: summary.lastHeartbeatAt || '',
    heartbeatAgeMs: summary.heartbeatAgeMs ?? null,
    staleHeartbeat: Boolean(summary.staleHeartbeat),
    restartPolicy: summary.restartPolicy || 'unknown',
    stopPolicy: policy.stopOnlyVerifiedSentinelPid ? 'verified_pid_only' : 'unknown',
    forceKillAllowed: Boolean(policy.forceKillAllowed),
    actionRequired: actionRequiredFor({ requiredForAutonomy: true, status }),
    managerExitStatus: commandResult?.status ?? null,
    managerOk: Boolean(commandResult?.ok),
    rawCommandLineIncluded: Boolean(receipt?.receipt?.rawCommandLineIncluded),
  };
}

function serviceFromLaptopReasoningBridge(manager) {
  const receipt = manager?.receipt || {};
  const summary = receipt?.summary || {};
  const policy = receipt?.policy || {};
  const commandResult = manager?.result || {};
  const status = summary.serviceStatus || (commandResult?.ok ? 'unknown' : 'missing');
  return {
    serviceId: 'laptop-reasoning-bridge-service',
    label: 'Laptop Reasoning Bridge Service',
    serviceKind: 'managed_remote_receipt_bridge',
    requiredForAutonomy: true,
    status,
    normalizedStatus: normalizeStatus(status, true),
    source: 'apps/holoshell/source/holoshell-laptop-reasoning-bridge-service.hsplus',
    bridgeSource: 'apps/holoshell/source/holoshell-laptop-reasoning-bridge.hsplus',
    adapter: 'scripts/holoshell-laptop-reasoning-bridge-service.mjs',
    bridgeAdapter: 'scripts/holoshell-laptop-reasoning-bridge.mjs',
    receiptPath: '.tmp/holoshell/laptop-reasoning-bridge-service.json',
    bridgeReceiptPath: '.tmp/holoshell/laptop-reasoning-bridge-latest.json',
    resultReceiptPath: '.tmp/holoshell/laptop-reasoning-result-latest.json',
    pid: summary.pid || 0,
    pidAlive: Boolean(summary.pidAlive),
    pidCommandVerified: Boolean(summary.pidCommandVerified),
    lastBridgeReceiptAt: summary.lastBridgeReceiptAt || '',
    bridgeReceiptAgeMs: summary.bridgeReceiptAgeMs ?? null,
    staleBridgeReceipt: Boolean(summary.staleBridgeReceipt),
    bridgeStatus: summary.bridgeStatus || 'unknown',
    pulledCount: summary.pulledCount || 0,
    processedCount: summary.processedCount || 0,
    pushedCount: summary.pushedCount || 0,
    errorCount: summary.errorCount || 0,
    latestDispatchId: summary.latestDispatchId || '',
    latestResultId: summary.latestResultId || '',
    remoteHostConfigured: Boolean(summary.remoteHostConfigured),
    pullRemote: Boolean(summary.pullRemote),
    pushRemote: Boolean(summary.pushRemote),
    restartPolicy: summary.restartPolicy || 'unknown',
    stopPolicy: policy.stopOnlyVerifiedLaptopReasoningBridgePid ? 'verified_pid_only' : 'unknown',
    remoteWriteScope: policy.remoteWriteScope || 'unknown',
    remoteMutationLimitedToResultReceipts: Boolean(policy.remoteMutationLimitedToResultReceipts),
    forceKillAllowed: Boolean(policy.forceKillAllowed),
    actionRequired: actionRequiredFor({ requiredForAutonomy: true, status }),
    managerExitStatus: commandResult?.status ?? null,
    managerOk: Boolean(commandResult?.ok),
    rawCommandLineIncluded: Boolean(receipt?.receipt?.rawCommandLineIncluded),
  };
}

function serviceFromGrokHeartbeat(receipt, nowMs, staleMs) {
  const summary = receipt?.summary || {};
  const generatedAt = receipt?.generatedAt || '';
  const receiptAge = ageMs(generatedAt, nowMs);
  const stale = receiptAge === null || receiptAge > staleMs;
  const baseStatus = summary.status || (receipt?.schemaVersion ? 'unknown' : 'missing');
  const status = stale && baseStatus !== 'missing' ? 'stale' : baseStatus;
  return {
    serviceId: 'grok-heartbeat',
    label: 'Grok Heartbeat',
    serviceKind: 'receipt_heartbeat',
    requiredForAutonomy: false,
    status,
    normalizedStatus: normalizeStatus(status, false),
    source: 'apps/holoshell/source/holoshell-grok-heartbeat.hsplus',
    adapter: 'scripts/holoshell-grok-heartbeat.mjs',
    receiptPath: '.tmp/holoshell/grok-heartbeat.json',
    lastHeartbeatAt: generatedAt,
    heartbeatAgeMs: receiptAge,
    staleHeartbeat: stale,
    agentPresenceStatus: summary.agentPresenceStatus || 'reserved',
    latestObservationStatus: summary.latestObservationStatus || 'none',
    primaryFinding: summary.primaryFinding || '',
    actionRequired: false,
    rawCommandLineIncluded: false,
  };
}

function serviceFromControlDaemon(manager, skipped, endpoint) {
  const receipt = manager?.receipt || {};
  const summary = receipt?.summary || {};
  const policy = receipt?.policy || {};
  const commandResult = manager?.result || {};
  const status = summary.serviceStatus || (commandResult?.ok ? 'unknown' : 'missing');
  return {
    serviceId: 'holoshell-control-daemon',
    label: 'HoloShell Control Daemon',
    serviceKind: 'managed_loopback_daemon',
    requiredForAutonomy: false,
    requiredForMutation: true,
    status,
    normalizedStatus: normalizeStatus(status, false),
    source: 'apps/holoshell/source/holoshell-control-daemon-service.hsplus',
    daemonSource: 'apps/holoshell/source/holoshell-hardware-control.hsplus',
    adapter: 'scripts/holoshell-control-daemon-service.mjs',
    daemonAdapter: 'scripts/holoshell-control-daemon.mjs',
    receiptPath: '.tmp/holoshell/control-daemon-service.json',
    endpoint: summary.endpoint || (skipped ? 'loopback_probe_skipped' : endpoint),
    pid: summary.pid || 0,
    pidAlive: Boolean(summary.pidAlive),
    pidCommandVerified: Boolean(summary.pidCommandVerified),
    loopbackReachable: Boolean(summary.loopbackReachable),
    executeEnabled: Boolean(summary.executeEnabled),
    trustedExecuteEnabled: Boolean(summary.trustedExecuteEnabled),
    mutationExecutionStatus: summary.mutationExecutionStatus || 'disabled_by_default',
    stopPolicy: policy.stopOnlyVerifiedControlDaemonPid ? 'verified_pid_only' : 'unknown',
    forceKillAllowed: Boolean(policy.forceKillAllowed),
    actionRequired: false,
    managerExitStatus: commandResult?.status ?? null,
    managerOk: Boolean(commandResult?.ok),
    probeOk: Boolean(summary.loopbackReachable),
    probeStatusCode: summary.healthStatusCode || 0,
    probeError: summary.healthError || (skipped ? 'skipped_by_parent_daemon' : ''),
    rawCommandLineIncluded: Boolean(receipt?.receipt?.rawCommandLineIncluded),
  };
}

function summarizeServices(services, action, serviceMutationTaken) {
  const required = services.filter((service) => service.requiredForAutonomy);
  const online = services.filter((service) => service.normalizedStatus === 'online');
  const degraded = services.filter((service) => service.normalizedStatus === 'degraded');
  const offline = services.filter((service) => service.normalizedStatus === 'offline');
  const optionalOffline = offline.filter((service) => !service.requiredForAutonomy);
  const requiredAttention = required.filter((service) => service.normalizedStatus !== 'online');
  const actionRequired = services.filter((service) => service.actionRequired);
  const managedPid = services.filter((service) => service.serviceKind.startsWith('managed_'));
  const verifiedPid = managedPid.filter((service) => service.pidCommandVerified);
  const controlDaemon = services.find((service) => service.serviceId === 'holoshell-control-daemon');
  const laptopReasoningBridge = services.find((service) => service.serviceId === 'laptop-reasoning-bridge-service');
  const status = requiredAttention.length
    ? 'attention_required'
    : optionalOffline.length
      ? 'ready_with_optional_offline'
      : degraded.length
        ? 'ready_with_degraded_optional'
        : 'ready';

  return {
    status,
    requestedAction: action,
    serviceCount: services.length,
    requiredServiceCount: required.length,
    onlineServiceCount: online.length,
    degradedServiceCount: degraded.length,
    offlineServiceCount: offline.length,
    optionalOfflineServiceCount: optionalOffline.length,
    requiredOnlineServiceCount: required.filter((service) => service.normalizedStatus === 'online').length,
    requiredAttentionCount: requiredAttention.length,
    managedPidServiceCount: managedPid.length,
    verifiedPidServiceCount: verifiedPid.length,
    heartbeatOnlyServiceCount: services.filter((service) => service.serviceKind === 'receipt_heartbeat').length,
    localDaemonServiceCount: services.filter((service) => ['http_loopback_daemon', 'managed_loopback_daemon'].includes(service.serviceKind)).length,
    remoteReceiptBridgeServiceCount: services.filter((service) => service.serviceKind === 'managed_remote_receipt_bridge').length,
    controlDaemonServiceStatus: controlDaemon?.status || 'unknown',
    controlDaemonPidCommandVerified: Boolean(controlDaemon?.pidCommandVerified),
    controlDaemonLoopbackReachable: Boolean(controlDaemon?.loopbackReachable),
    controlDaemonExecuteEnabled: Boolean(controlDaemon?.executeEnabled),
    laptopReasoningBridgeServiceStatus: laptopReasoningBridge?.status || 'unknown',
    laptopReasoningBridgePidCommandVerified: Boolean(laptopReasoningBridge?.pidCommandVerified),
    laptopReasoningBridgeStatus: laptopReasoningBridge?.bridgeStatus || 'unknown',
    laptopReasoningProcessedCount: laptopReasoningBridge?.processedCount || 0,
    laptopReasoningPushedCount: laptopReasoningBridge?.pushedCount || 0,
    actionRequiredCount: actionRequired.length,
    serviceMutationTaken,
    nextRequiredAction: actionRequired[0]
      ? `${actionRequired[0].serviceId}: run registered ensure manager or inspect service receipt`
      : optionalOffline.length
        ? `${optionalOffline[0].serviceId}: optional service is offline for mutations`
        : 'No required service action.',
  };
}

async function createSupervisor(args, fixtures = null) {
  const generatedAt = new Date().toISOString();
  const nowMs = Date.parse(generatedAt);
  const network = fixtures?.network || refreshNetworkSentinelService(args);
  const grokHeartbeat = fixtures?.grokHeartbeat || readJson(path.join(args.tmpDir, 'grok-heartbeat.json'), {});
  const controlDaemon = fixtures?.controlDaemon || refreshControlDaemonService(args);
  const laptopReasoningBridge = fixtures?.laptopReasoningBridge || refreshLaptopReasoningBridgeService(args);
  const services = [
    serviceFromNetworkSentinel(network.receipt, network.result),
    serviceFromLaptopReasoningBridge(laptopReasoningBridge),
    serviceFromGrokHeartbeat(grokHeartbeat, nowMs, args.heartbeatStaleMs),
    serviceFromControlDaemon(controlDaemon, args.skipControlProbe, args.controlEndpoint),
  ];
  const summary = summarizeServices(
    services,
    args.action,
    Boolean(network.serviceMutationTaken || laptopReasoningBridge.serviceMutationTaken || controlDaemon.serviceMutationTaken)
  );
  const controlService = services.find((service) => service.serviceId === 'holoshell-control-daemon');
  const hashInput = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    summary,
    services: services.map((service) => [service.serviceId, service.status, service.normalizedStatus, service.pid || 0]),
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-service-supervisor.hsplus',
      adapter: 'scripts/holoshell-service-supervisor.mjs',
      networkSentinelService: 'scripts/holoshell-network-sentinel-service.mjs',
      laptopReasoningBridgeService: 'scripts/holoshell-laptop-reasoning-bridge-service.mjs',
      laptopReasoningBridge: 'scripts/holoshell-laptop-reasoning-bridge.mjs',
      grokHeartbeat: 'scripts/holoshell-grok-heartbeat.mjs',
      controlDaemonService: 'scripts/holoshell-control-daemon-service.mjs',
      controlDaemon: 'scripts/holoshell-control-daemon.mjs',
      upstreamTerminalEventStream: UPSTREAM_TERMINAL_EVENT_STREAM_SOURCE,
    },
    summary,
    services,
    policy: {
      statusDefaultIsNonDestructive: true,
      ensureDelegatesOnlyToRegisteredManagers: true,
      arbitraryProcessStartAllowed: false,
      arbitraryProcessStopAllowed: false,
      forceKillAllowed: false,
      rawCommandLineIncluded: false,
      localOnly: true,
      upstreamTerminalEventStreamRequired: true,
      terminalEventReadCapabilityLane: 'terminal_event_read',
    },
    brittneyGuidance: {
      trustRequiredServicesOnlyWhenSupervisorReady: true,
      controlDaemonOfflineMeansNoLocalMutations: !controlService || controlService.normalizedStatus === 'offline',
      localMutationExecutionEnabled: Boolean(controlService?.executeEnabled),
      controlDaemonRequiresIntentGateForMutations: !controlService?.executeEnabled,
      nextRequiredAction: summary.nextRequiredAction,
    },
    receipt: {
      snapshotHash: sha256(JSON.stringify(hashInput)),
      localOnly: true,
      destructiveActionsTaken: false,
      rawCommandLineIncluded: false,
      serviceMutationTaken: summary.serviceMutationTaken,
    },
  };
}

function fixtureControlDaemonService() {
  return {
    result: { ok: true, status: 0 },
    serviceMutationTaken: false,
    receipt: {
      schemaVersion: 'hololand.holoshell.control-daemon-service.v0.1.0',
      generatedAt: new Date().toISOString(),
      summary: {
        serviceStatus: 'online',
        serviceMode: 'managed_loopback_daemon',
        pid: 4747,
        pidAlive: true,
        pidCommandVerified: true,
        endpoint: 'http://127.0.0.1:4747/health',
        loopbackReachable: true,
        healthStatusCode: 200,
        healthError: '',
        executeEnabled: false,
        trustedExecuteEnabled: false,
        mutationExecutionStatus: 'disabled_by_default',
      },
      policy: {
        stopOnlyVerifiedControlDaemonPid: true,
        forceKillAllowed: false,
      },
      receipt: {
        serviceMutationTaken: false,
        rawCommandLineIncluded: false,
      },
    },
  };
}

function fixtureNetworkReceipt() {
  return {
    result: { ok: true, status: 0 },
    serviceMutationTaken: false,
    receipt: {
      schemaVersion: 'hololand.holoshell.network-sentinel-service.v0.1.0',
      generatedAt: new Date().toISOString(),
      summary: {
        serviceStatus: 'online',
        pid: 4242,
        pidAlive: true,
        pidCommandVerified: true,
        lastHeartbeatAt: new Date(Date.now() - 1000).toISOString(),
        heartbeatAgeMs: 1000,
        staleHeartbeat: false,
        restartPolicy: 'ensure_restarts_offline_or_stale_verified_watchers',
      },
      policy: { stopOnlyVerifiedSentinelPid: true, forceKillAllowed: false },
      receipt: { rawCommandLineIncluded: false },
    },
  };
}

function fixtureLaptopReasoningBridgeService() {
  return {
    result: { ok: true, status: 0 },
    serviceMutationTaken: false,
    receipt: {
      schemaVersion: 'hololand.holoshell.laptop-reasoning-bridge-service.v0.1.0',
      generatedAt: new Date().toISOString(),
      summary: {
        serviceStatus: 'online',
        serviceMode: 'managed_remote_receipt_bridge',
        pid: 5280,
        pidAlive: true,
        pidCommandVerified: true,
        lastBridgeReceiptAt: new Date(Date.now() - 1000).toISOString(),
        bridgeReceiptAgeMs: 1000,
        staleBridgeReceipt: false,
        bridgeStatus: 'completed',
        pulledCount: 1,
        processedCount: 1,
        pushedCount: 1,
        errorCount: 0,
        latestDispatchId: 'hsdispatch-fixture',
        latestResultId: 'laptop_reasoning_result_fixture',
        remoteHostConfigured: true,
        pullRemote: true,
        pushRemote: true,
        restartPolicy: 'ensure_restarts_offline_or_stale_verified_bridge_watchers',
      },
      policy: {
        stopOnlyVerifiedLaptopReasoningBridgePid: true,
        remoteWriteScope: 'laptop-reasoning-results',
        remoteMutationLimitedToResultReceipts: true,
        forceKillAllowed: false,
      },
      receipt: { rawCommandLineIncluded: false },
    },
  };
}

function fixtureGrokHeartbeat() {
  return {
    schemaVersion: 'hololand.holoshell.grok-heartbeat.v0.1.0',
    generatedAt: new Date(Date.now() - 2000).toISOString(),
    summary: {
      status: 'observing',
      agentPresenceStatus: 'active_or_available',
      latestObservationStatus: 'reported_pass',
      primaryFinding: 'fixture',
    },
  };
}

function assertSelfTest(snapshot) {
  const failures = [];
  if (snapshot.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (snapshot.summary.requiredServiceCount !== 2) failures.push('expected two required services');
  if (snapshot.summary.requiredAttentionCount !== 0) failures.push('required service should be healthy');
  if (snapshot.summary.managedPidServiceCount !== 3) failures.push('expected three managed PID services');
  if (snapshot.summary.verifiedPidServiceCount !== 3) failures.push('expected three verified PID services');
  if (snapshot.summary.heartbeatOnlyServiceCount !== 1) failures.push('expected heartbeat-only service');
  if (snapshot.summary.localDaemonServiceCount !== 1) failures.push('expected local daemon service');
  if (snapshot.summary.remoteReceiptBridgeServiceCount !== 1) failures.push('expected remote receipt bridge service');
  if (!['ready', 'ready_with_optional_offline'].includes(snapshot.summary.status)) failures.push(`unexpected status ${snapshot.summary.status}`);
  if (snapshot.policy.arbitraryProcessStopAllowed !== false) failures.push('arbitrary stop must be disabled');
  if (snapshot.policy.forceKillAllowed !== false) failures.push('force kill must be disabled');
  if (snapshot.receipt.destructiveActionsTaken !== false) failures.push('self-test must be non-destructive');
  if (snapshot.receipt.rawCommandLineIncluded !== false) failures.push('raw commands must stay hidden');
  if (!snapshot.services.some((service) => service.serviceId === 'network-sentinel-service' && service.pidCommandVerified)) failures.push('network service must be verified');
  if (!snapshot.services.some((service) => service.serviceId === 'laptop-reasoning-bridge-service' && service.pidCommandVerified)) failures.push('laptop reasoning bridge service must be verified');
  if (!snapshot.services.some((service) => service.serviceId === 'holoshell-control-daemon' && service.pidCommandVerified)) failures.push('control daemon service must be verified');
  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  const fixtures = args.selfTest
    ? {
        network: fixtureNetworkReceipt(),
        laptopReasoningBridge: fixtureLaptopReasoningBridgeService(),
        grokHeartbeat: fixtureGrokHeartbeat(),
        controlDaemon: fixtureControlDaemonService(),
      }
    : null;
  const snapshot = await createSupervisor(args, fixtures);
  if (args.selfTest) assertSelfTest(snapshot);
  const output = writeJson(args.output, snapshot);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, snapshot);

  if (args.json) {
    console.log(JSON.stringify(snapshot, null, 2));
  } else {
    console.log(`HoloShell service supervisor: ${output}`);
    console.log(`HoloShell service supervisor browser bootstrap: ${jsOutput}`);
    console.log(`Status: ${snapshot.summary.status}`);
    console.log(`Services: ${snapshot.summary.serviceCount}`);
    console.log(`Required online: ${snapshot.summary.requiredOnlineServiceCount}/${snapshot.summary.requiredServiceCount}`);
    console.log(`Optional offline: ${snapshot.summary.optionalOfflineServiceCount}`);
    console.log(`Actions required: ${snapshot.summary.actionRequiredCount}`);
  }
} catch (error) {
  console.error(`holoshell-service-supervisor failed: ${error.message}`);
  process.exit(1);
}
