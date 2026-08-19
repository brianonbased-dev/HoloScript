#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.network-freshness.v0.1.0';
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_MAX_FRESHNESS_MS = 120000;
const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function parseArgs(argv) {
  const args = {
    json: false,
    selfTest: false,
    force: false,
    refreshDependents: false,
    tmpDir: DEFAULT_TMP,
    output: null,
    jsOutput: null,
    maxAgeMs: DEFAULT_MAX_FRESHNESS_MS,
    ownerDeclaredKind: process.env.HOLOSHELL_OWNER_NETWORK_KIND || 'auto',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--refresh-dependents') args.refreshDependents = true;
    else if (arg === '--skip-dependents') args.refreshDependents = false;
    else if (arg === '--tmp-dir') args.tmpDir = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--max-age-ms') args.maxAgeMs = Number(argv[++index]);
    else if (arg === '--owner-declared-kind') args.ownerDeclaredKind = argv[++index];
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isFinite(args.maxAgeMs) || args.maxAgeMs < 0) {
    throw new Error('--max-age-ms must be a non-negative number');
  }

  const tmpDir = args.selfTest ? path.join(DEFAULT_TMP, 'self-test') : args.tmpDir;
  args.tmpDir = tmpDir;
  args.output ||= path.join(tmpDir, 'network-freshness.json');
  args.jsOutput ||= path.join(tmpDir, 'network-freshness.js');
  args.networkRealityOutput = path.join(tmpDir, 'network-reality.json');
  return args;
}

function printHelp() {
  console.log(`HoloShell network freshness watch

Usage:
  node scripts/holoshell-network-freshness-watch.mjs [options]

Options:
  --json                       Print freshness JSON.
  --force                      Mark the refresh as forced.
  --refresh-dependents         After writing freshness, refresh live feed and Brittney context.
  --skip-dependents            Only refresh network reality and freshness. Default.
  --tmp-dir <path>             Receipt directory. Defaults to .tmp/holoshell.
  --output <path>              Write JSON output. Defaults to <tmp-dir>/network-freshness.json.
  --js-output <path>           Write browser bootstrap JS. Defaults to <tmp-dir>/network-freshness.js.
  --max-age-ms <number>        Stale threshold. Defaults to 120000.
  --owner-declared-kind <kind> Pass owner network declaration to network reality.
  --self-test                  Assert freshness, redaction, and classification-change invariants.
  -h, --help                   Show this help.
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
  writeFileSync(resolved, `window.HOLOSHELL_NETWORK_FRESHNESS = ${payload};\n`, 'utf8');
  return resolved;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function safeDateMs(value) {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : null;
}

function receiptAgeMs(receipt, nowMs) {
  const generatedMs = safeDateMs(receipt?.generatedAt);
  return generatedMs === null ? null : Math.max(0, nowMs - generatedMs);
}

function bucketSignalPercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent <= 0) return 'unknown';
  if (percent >= 80) return 'excellent';
  if (percent >= 60) return 'good';
  if (percent >= 40) return 'fair';
  return 'weak';
}

function boolOrUnknown(value) {
  return typeof value === 'boolean' ? value : 'unknown';
}

function networkSignature(snapshot) {
  const underlay = snapshot?.underlay || {};
  const policy = snapshot?.policy || {};
  const brittney = snapshot?.brittney || {};
  const wifi = underlay.wifi || {};
  const cost = underlay.cost || {};
  return {
    classification: underlay.classification || 'unknown',
    confidence: underlay.confidence || 'unknown',
    ownerDeclaredKind: underlay.ownerDeclaredKind || 'none',
    ownerDeclaredSource: underlay.ownerDeclaredSource || 'none',
    osInterfaceKind: underlay.osInterfaceKind || 'unknown',
    osCost: underlay.osCost || 'Unknown',
    connectivity: underlay.connectivity || 'Unknown',
    vpnState: underlay.vpnState || 'unknown',
    wifiConnected: boolOrUnknown(wifi.connected),
    wifiSignalBucket: bucketSignalPercent(wifi.signalPercent),
    roaming: boolOrUnknown(cost.roaming),
    overDataLimit: boolOrUnknown(cost.overDataLimit),
    bandwidthPosture: policy.bandwidthPosture || 'unknown',
    heavyWorkPolicy: policy.heavyWorkPolicy || 'unknown',
    protectBandwidth: boolOrUnknown(brittney.protectBandwidth),
    contractStatus: snapshot?.schemaContract?.validationStatus || 'missing',
  };
}

function signatureHash(snapshot) {
  return sha256(JSON.stringify(networkSignature(snapshot)));
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    error: result.error?.message || '',
  };
}

function commandRecord(name, args, result, startedMs, endedMs) {
  return {
    name,
    status: result.ok ? 'pass' : 'fail',
    command: `${process.execPath} ${args.join(' ')}`,
    durationMs: Math.max(0, endedMs - startedMs),
    stdout: result.stdout.trim().split(/\r?\n/).slice(-6),
    stderr: result.stderr.trim().split(/\r?\n/).filter(Boolean).slice(-6),
    exitCode: result.status,
    error: result.error,
  };
}

function runNamed(name, args) {
  const startedMs = Date.now();
  const result = runNode(args);
  const endedMs = Date.now();
  const record = commandRecord(name, args, result, startedMs, endedMs);
  if (!result.ok) {
    const detail = result.stderr.trim() || result.stdout.trim() || result.error || `exit ${result.status}`;
    const error = new Error(`${name} failed: ${detail}`);
    error.record = record;
    throw error;
  }
  return record;
}

function networkRealityCommand(args) {
  const command = [
    'scripts/holoshell-network-reality.mjs',
    '--output',
    args.networkRealityOutput,
    '--agent-lanes',
    path.join(args.tmpDir, 'agent-lanes.json'),
    '--process-health',
    path.join(args.tmpDir, 'process-health.json'),
    '--run-registry',
    path.join(args.tmpDir, 'run-registry.json'),
  ];
  if (args.ownerDeclaredKind && args.ownerDeclaredKind !== 'auto') {
    command.push('--owner-declared-kind', args.ownerDeclaredKind);
  }
  return command;
}

function refreshReason({ force, staleBeforeRefresh, signatureChanged, classificationChanged }) {
  if (force) return 'forced';
  if (classificationChanged) return 'classification_changed';
  if (signatureChanged) return 'network_signature_changed';
  if (staleBeforeRefresh) return 'stale_receipt';
  return 'routine_freshness_check';
}

function createFreshnessReceipt({ args, previous, current, refreshes = [], dependentRefreshStatus = 'skipped', now = new Date() }) {
  const nowMs = now.getTime();
  const previousAgeMs = receiptAgeMs(previous, nowMs);
  const previousHash = previous?.underlay ? signatureHash(previous) : '';
  const currentHash = current?.underlay ? signatureHash(current) : '';
  const previousClassification = previous?.underlay?.classification || 'unknown';
  const currentClassification = current?.underlay?.classification || 'unknown';
  const previousMissing = !previous?.underlay;
  const staleBeforeRefresh = previousMissing || previousAgeMs === null || previousAgeMs > args.maxAgeMs;
  const signatureChanged = Boolean(previousHash && currentHash && previousHash !== currentHash);
  const classificationChanged = previousClassification !== 'unknown'
    && currentClassification !== 'unknown'
    && previousClassification !== currentClassification;
  const failedRefresh = refreshes.some((item) => item.status === 'fail') || dependentRefreshStatus === 'failed';
  const reason = refreshReason({
    force: args.force,
    staleBeforeRefresh,
    signatureChanged,
    classificationChanged,
  });
  const status = failedRefresh
    ? 'refresh_failed'
    : (args.force || staleBeforeRefresh || signatureChanged || classificationChanged ? 'refreshed' : 'fresh');
  const liveFeedRefreshed = refreshes.some((item) => item.name === 'live_feed' && item.status === 'pass');
  const brittneyContextRefreshed = refreshes.some((item) => item.name === 'brittney_context' && item.status === 'pass');
  const hashInput = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    previousHash,
    currentHash,
    status,
    reason,
    dependentRefreshStatus,
    refreshes: refreshes.map((item) => ({ name: item.name, status: item.status, exitCode: item.exitCode })),
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-network-freshness-watch.hsplus',
      adapter: 'scripts/holoshell-network-freshness-watch.mjs',
      networkRealitySource: 'apps/holoshell/source/holoshell-network-reality.hsplus',
      networkRealityAdapter: 'scripts/holoshell-network-reality.mjs',
      liveFeed: 'scripts/holoshell-live-feed.mjs',
      brittneyContext: 'scripts/holoshell-brittney-context.mjs',
    },
    summary: {
      status,
      refreshReason: reason,
      previousClassification,
      currentClassification,
      previousSignatureHash: previousHash,
      currentSignatureHash: currentHash,
      signatureChanged,
      classificationChanged,
      staleBeforeRefresh,
      previousReceiptAgeMs: previousAgeMs,
      maxFreshnessMs: args.maxAgeMs,
      networkRealityGeneratedAt: current?.generatedAt || '',
      networkRealityContractStatus: current?.schemaContract?.validationStatus || 'missing',
      networkRealityOutput: args.networkRealityOutput,
      dependentRefreshStatus,
      liveFeedRefreshed,
      brittneyContextRefreshed,
      endpointDetailsRedacted: true,
      rawIdentifiersIncluded: false,
    },
    currentNetworkSignature: networkSignature(current),
    policy: {
      staleNetworkReceiptMayDriveActions: false,
      refreshBeforeLiveFeed: true,
      classificationSwitchForcesDependentRefresh: true,
      endpointDetailsRedacted: true,
      rawSsidIncluded: false,
      rawBssidIncluded: false,
      ipAddressIncluded: false,
      gatewayIncluded: false,
      remoteEndpointIncluded: false,
      ownerNetworkDeclarationRespected: true,
    },
    refreshes,
    receipt: {
      snapshotHash: sha256(JSON.stringify(hashInput)),
      destructiveActionsTaken: false,
      rawIdentifiersIncluded: false,
      localOnly: true,
    },
  };
}

function fixtureNetworkReality(classification, generatedAt) {
  return {
    schemaVersion: 'hololand.holoshell.network-reality.v0.1.0',
    generatedAt,
    underlay: {
      classification,
      confidence: 'fixture',
      ownerDeclaredKind: classification === 'metered_or_hotspot' ? 'phone_hotspot' : 'none',
      ownerDeclaredSource: classification === 'metered_or_hotspot' ? 'cli' : 'none',
      osInterfaceKind: 'wifi',
      osCost: classification === 'metered_or_hotspot' ? 'Variable' : 'Unrestricted',
      connectivity: 'Internet',
      vpnState: 'disconnected',
      wifi: { connected: true, signalPercent: classification === 'metered_or_hotspot' ? 44 : 91 },
      cost: { roaming: false, overDataLimit: false },
    },
    policy: {
      bandwidthPosture: classification === 'metered_or_hotspot' ? 'protective_metered' : 'normal',
      heavyWorkPolicy: classification === 'metered_or_hotspot' ? 'ask_before_heavy_transfer' : 'allowed_with_receipts',
    },
    brittney: { protectBandwidth: classification !== 'normal_unmetered' },
    schemaContract: { validationStatus: 'pass' },
    receipt: { snapshotHash: `fixture-${classification}` },
  };
}

function runSelfTest(args) {
  const now = new Date('2026-05-14T00:05:00.000Z');
  const previous = fixtureNetworkReality('metered_or_hotspot', '2026-05-14T00:00:00.000Z');
  const current = fixtureNetworkReality('normal_unmetered', '2026-05-14T00:04:59.000Z');
  const receipt = createFreshnessReceipt({
    args: { ...args, force: false, maxAgeMs: 120000 },
    previous,
    current,
    dependentRefreshStatus: 'skipped',
    now,
  });
  const failures = [];
  if (receipt.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (receipt.summary.status !== 'refreshed') failures.push('expected refreshed status');
  if (!receipt.summary.classificationChanged) failures.push('expected classification change');
  if (!receipt.summary.signatureChanged) failures.push('expected signature change');
  if (!receipt.summary.staleBeforeRefresh) failures.push('expected stale previous receipt');
  if (receipt.policy.staleNetworkReceiptMayDriveActions !== false) failures.push('stale receipt must not drive actions');
  if (receipt.policy.endpointDetailsRedacted !== true) failures.push('endpoint details must be redacted');
  if (receipt.receipt.rawIdentifiersIncluded !== false) failures.push('raw identifiers must stay out');
  if (receipt.currentNetworkSignature.wifiSignalBucket !== 'excellent') failures.push('expected bucketed Wi-Fi signal only');

  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }

  writeJson(args.output, receipt);
  writeBrowserBootstrap(args.jsOutput, receipt);
  return receipt;
}

function createNormalReceipt(args) {
  const previous = readJson(args.networkRealityOutput, {});
  const refreshes = [];
  try {
    refreshes.push(runNamed('network_reality', networkRealityCommand(args)));
  } catch (error) {
    if (error.record) refreshes.push(error.record);
    const currentAfterFailure = readJson(args.networkRealityOutput, {});
    return createFreshnessReceipt({
      args,
      previous,
      current: currentAfterFailure,
      refreshes,
      dependentRefreshStatus: 'failed',
      now: new Date(),
    });
  }

  const current = readJson(args.networkRealityOutput, {});
  let dependentRefreshStatus = args.refreshDependents ? 'completed' : 'skipped';

  if (args.refreshDependents) {
    const provisional = createFreshnessReceipt({
      args,
      previous,
      current,
      refreshes,
      dependentRefreshStatus: 'in_progress',
      now: new Date(),
    });
    writeJson(args.output, provisional);
    writeBrowserBootstrap(args.jsOutput, provisional);

    try {
      refreshes.push(runNamed('live_feed', ['scripts/holoshell-live-feed.mjs']));
      refreshes.push(runNamed('brittney_context', ['scripts/holoshell-brittney-context.mjs']));
    } catch (error) {
      if (error.record) refreshes.push(error.record);
      dependentRefreshStatus = 'failed';
    }
  }

  if (args.refreshDependents && dependentRefreshStatus === 'completed') {
    const finalBeforeRepublish = createFreshnessReceipt({
      args,
      previous,
      current,
      refreshes,
      dependentRefreshStatus,
      now: new Date(),
    });
    writeJson(args.output, finalBeforeRepublish);
    writeBrowserBootstrap(args.jsOutput, finalBeforeRepublish);

    try {
      refreshes.push(runNamed('live_feed_final', ['scripts/holoshell-live-feed.mjs']));
      refreshes.push(runNamed('brittney_context_final', ['scripts/holoshell-brittney-context.mjs']));
    } catch (error) {
      if (error.record) refreshes.push(error.record);
      dependentRefreshStatus = 'failed';
    }
  }

  return createFreshnessReceipt({
    args,
    previous,
    current,
    refreshes,
    dependentRefreshStatus,
    now: new Date(),
  });
}

try {
  const args = parseArgs(process.argv.slice(2));
  const receipt = args.selfTest ? runSelfTest(args) : createNormalReceipt(args);
  const output = writeJson(args.output, receipt);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, receipt);

  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log(`HoloShell network freshness: ${output}`);
    console.log(`HoloShell network freshness bootstrap: ${jsOutput}`);
    console.log(`Status: ${receipt.summary.status}`);
    console.log(`Network: ${receipt.summary.previousClassification} -> ${receipt.summary.currentClassification}`);
    console.log(`Reason: ${receipt.summary.refreshReason}`);
    console.log(`Dependent refresh: ${receipt.summary.dependentRefreshStatus}`);
  }

  if (receipt.summary.status === 'refresh_failed') {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
