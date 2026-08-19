#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.network-change-events.v0.1.0';
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_INTERVAL_MS = 30000;
const DEFAULT_MAX_EVENTS = 200;
const REPO_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

function parseArgs(argv) {
  const args = {
    json: false,
    selfTest: false,
    watch: false,
    recordRoutine: false,
    refreshDependents: false,
    tmpDir: DEFAULT_TMP,
    output: null,
    latestOutput: null,
    jsOutput: null,
    intervalMs: DEFAULT_INTERVAL_MS,
    maxEvents: DEFAULT_MAX_EVENTS,
    ownerDeclaredKind: process.env.HOLOSHELL_OWNER_NETWORK_KIND || 'auto',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--watch') args.watch = true;
    else if (arg === '--once') args.watch = false;
    else if (arg === '--record-routine') args.recordRoutine = true;
    else if (arg === '--refresh-dependents') args.refreshDependents = true;
    else if (arg === '--skip-dependents') args.refreshDependents = false;
    else if (arg === '--tmp-dir') args.tmpDir = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--latest-output') args.latestOutput = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
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

  if (!Number.isFinite(args.intervalMs) || args.intervalMs < 1000) {
    throw new Error('--interval-ms must be at least 1000');
  }
  if (!Number.isFinite(args.maxEvents) || args.maxEvents < 1) {
    throw new Error('--max-events must be at least 1');
  }

  const tmpDir = args.selfTest ? path.join(DEFAULT_TMP, 'self-test') : args.tmpDir;
  args.tmpDir = tmpDir;
  args.output ||= path.join(tmpDir, 'network-change-events.json');
  args.latestOutput ||= path.join(tmpDir, 'network-change-latest.json');
  args.jsOutput ||= path.join(tmpDir, 'network-change-events.js');
  args.freshnessOutput = path.join(tmpDir, 'network-freshness.json');
  return args;
}

function printHelp() {
  console.log(`HoloShell network change sentinel

Usage:
  node scripts/holoshell-network-change-sentinel.mjs [options]

Options:
  --once                       Run one observation. Default.
  --watch                      Keep observing until stopped.
  --json                       Print ledger JSON for the final/first observation.
  --record-routine             Append routine checks, not only changes and failures.
  --refresh-dependents         Ask freshness watcher to refresh live feed and Brittney.
  --skip-dependents            Only refresh network/freshness before writing events. Default.
  --tmp-dir <path>             Receipt directory. Defaults to .tmp/holoshell.
  --output <path>              Event ledger JSON. Defaults to <tmp-dir>/network-change-events.json.
  --latest-output <path>       Latest event JSON. Defaults to <tmp-dir>/network-change-latest.json.
  --js-output <path>           Browser bootstrap JS. Defaults to <tmp-dir>/network-change-events.js.
  --interval-ms <number>       Watch interval. Defaults to 30000.
  --max-events <number>        Ledger retention. Defaults to 200.
  --owner-declared-kind <kind> Pass owner network declaration to freshness watcher.
  --self-test                  Assert event, redaction, and ledger invariants.
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
  writeFileSync(resolved, `window.HOLOSHELL_NETWORK_CHANGE_EVENTS = ${payload};\n`, 'utf8');
  return resolved;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
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

function freshnessCommand(args) {
  const command = [
    'scripts/holoshell-network-freshness-watch.mjs',
    args.refreshDependents ? '--refresh-dependents' : '--skip-dependents',
    '--tmp-dir',
    args.tmpDir,
    '--output',
    args.freshnessOutput,
  ];
  if (args.ownerDeclaredKind && args.ownerDeclaredKind !== 'auto') {
    command.push('--owner-declared-kind', args.ownerDeclaredKind);
  }
  return command;
}

function runFreshness(args) {
  const startedMs = Date.now();
  const command = freshnessCommand(args);
  const result = runNode(command);
  const endedMs = Date.now();
  return {
    name: 'network_freshness',
    status: result.ok ? 'pass' : 'fail',
    command: `${process.execPath} ${command.join(' ')}`,
    durationMs: Math.max(0, endedMs - startedMs),
    stdout: result.stdout.trim().split(/\r?\n/).filter(Boolean).slice(-6),
    stderr: result.stderr.trim().split(/\r?\n/).filter(Boolean).slice(-6),
    exitCode: result.status,
    error: result.error,
  };
}

function eventKindFromFreshness(freshness, commandStatus = 'pass') {
  const summary = freshness?.summary || {};
  if (commandStatus === 'fail' || summary.status === 'refresh_failed') return 'refresh_failed';
  if (summary.classificationChanged) return 'classification_changed';
  if (summary.signatureChanged) return 'signature_changed';
  if (summary.staleBeforeRefresh) return 'stale_refresh';
  return 'routine_check';
}

function createEvent(freshness, commandRecord, observedAt = new Date()) {
  const summary = freshness?.summary || {};
  const eventKind = eventKindFromFreshness(freshness, commandRecord?.status || 'pass');
  const base = {
    observedAt: observedAt.toISOString(),
    eventKind,
    freshnessStatus: summary.status || 'missing',
    refreshReason: summary.refreshReason || 'unknown',
    previousClassification: summary.previousClassification || 'unknown',
    currentClassification: summary.currentClassification || 'unknown',
    previousSignatureHash: summary.previousSignatureHash || '',
    currentSignatureHash: summary.currentSignatureHash || '',
    signatureChanged: Boolean(summary.signatureChanged),
    classificationChanged: Boolean(summary.classificationChanged),
    staleBeforeRefresh: Boolean(summary.staleBeforeRefresh),
    networkRealityContractStatus: summary.networkRealityContractStatus || 'missing',
    dependentRefreshStatus: summary.dependentRefreshStatus || 'unknown',
    freshnessReceiptHash: freshness?.receipt?.snapshotHash || '',
    endpointDetailsRedacted: true,
    rawIdentifiersIncluded: false,
    commandStatus: commandRecord?.status || 'unknown',
    commandExitCode: commandRecord?.exitCode ?? null,
  };
  return {
    eventId: `netevt_${sha256(JSON.stringify(base)).slice(0, 16)}`,
    ...base,
  };
}

function shouldAppendEvent(event, existingEvents, args) {
  if (args.recordRoutine) return true;
  if (!existingEvents.length) return true;
  return event.eventKind !== 'routine_check';
}

function summarizeEvents(events, lastObservation, args, status = 'observed') {
  const changeEvents = events.filter((event) => event.eventKind !== 'routine_check');
  const latestEvent = events[events.length - 1] || null;
  const lastChange = [...events].reverse().find((event) => event.eventKind !== 'routine_check') || null;
  return {
    status: lastObservation?.eventKind === 'refresh_failed' ? 'warn' : status,
    watchMode: args.watch ? 'watch' : 'once',
    intervalMs: args.intervalMs,
    maxEvents: args.maxEvents,
    eventCount: events.length,
    changeEventCount: changeEvents.length,
    classificationChangedCount: events.filter((event) => event.eventKind === 'classification_changed').length,
    signatureChangedCount: events.filter((event) => event.eventKind === 'signature_changed').length,
    staleRefreshCount: events.filter((event) => event.eventKind === 'stale_refresh').length,
    refreshFailedCount: events.filter((event) => event.eventKind === 'refresh_failed').length,
    latestEventKind: latestEvent?.eventKind || 'none',
    lastObservationKind: lastObservation?.eventKind || 'unknown',
    lastObservedAt: lastObservation?.observedAt || '',
    lastChangeAt: lastChange?.observedAt || '',
    previousClassification: lastObservation?.previousClassification || 'unknown',
    currentClassification: lastObservation?.currentClassification || 'unknown',
    currentSignatureHash: lastObservation?.currentSignatureHash || '',
    freshnessStatus: lastObservation?.freshnessStatus || 'unknown',
    networkRealityContractStatus: lastObservation?.networkRealityContractStatus || 'missing',
    endpointDetailsRedacted: true,
    rawIdentifiersIncluded: false,
  };
}

function createLedger({ args, existing = {}, freshness, commandRecord, observedAt = new Date(), status = 'observed' }) {
  const existingEvents = safeArray(existing.events);
  const observation = createEvent(freshness, commandRecord, observedAt);
  const nextEvents = shouldAppendEvent(observation, existingEvents, args)
    ? [...existingEvents, observation].slice(-args.maxEvents)
    : existingEvents.slice(-args.maxEvents);
  const summary = summarizeEvents(nextEvents, observation, args, status);
  const hashInput = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: observedAt.toISOString(),
    summary,
    eventIds: nextEvents.map((event) => event.eventId),
    lastObservationId: observation.eventId,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: observedAt.toISOString(),
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-network-change-sentinel.hsplus',
      adapter: 'scripts/holoshell-network-change-sentinel.mjs',
      freshnessSource: 'apps/holoshell/source/holoshell-network-freshness-watch.hsplus',
      freshnessAdapter: 'scripts/holoshell-network-freshness-watch.mjs',
    },
    summary,
    lastObservation: observation,
    events: nextEvents,
    policy: {
      staleNetworkReceiptMayDriveActions: false,
      refreshBeforeLiveFeed: true,
      endpointDetailsRedacted: true,
      rawSsidIncluded: false,
      rawBssidIncluded: false,
      ipAddressIncluded: false,
      gatewayIncluded: false,
      remoteEndpointIncluded: false,
      localOnly: true,
    },
    receipt: {
      snapshotHash: sha256(JSON.stringify(hashInput)),
      destructiveActionsTaken: false,
      rawIdentifiersIncluded: false,
      localOnly: true,
    },
  };
}

function fixtureFreshness({ previous = 'metered_or_hotspot', current = 'normal_unmetered', changed = true, stale = true, status = 'refreshed' } = {}) {
  return {
    schemaVersion: 'hololand.holoshell.network-freshness.v0.1.0',
    generatedAt: '2026-05-14T00:05:00.000Z',
    summary: {
      status,
      refreshReason: changed ? 'classification_changed' : 'routine_freshness_check',
      previousClassification: previous,
      currentClassification: current,
      previousSignatureHash: `hash-${previous}`,
      currentSignatureHash: changed ? `hash-${current}` : `hash-${previous}`,
      signatureChanged: changed,
      classificationChanged: changed && previous !== current,
      staleBeforeRefresh: stale,
      networkRealityContractStatus: 'pass',
      dependentRefreshStatus: 'skipped',
    },
    policy: {
      staleNetworkReceiptMayDriveActions: false,
      endpointDetailsRedacted: true,
    },
    receipt: { snapshotHash: `fresh-${previous}-${current}-${status}` },
  };
}

function writeOutputs(args, ledger) {
  const output = writeJson(args.output, ledger);
  const latest = writeJson(args.latestOutput, ledger.lastObservation);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, ledger);
  return { output, latest, jsOutput };
}

function runSelfTest(args) {
  const commandRecord = { status: 'pass', exitCode: 0 };
  const first = createLedger({
    args: { ...args, watch: false, maxEvents: 10 },
    existing: {},
    freshness: fixtureFreshness(),
    commandRecord,
    observedAt: new Date('2026-05-14T00:05:00.000Z'),
  });
  const second = createLedger({
    args: { ...args, watch: false, maxEvents: 10 },
    existing: first,
    freshness: fixtureFreshness({ previous: 'normal_unmetered', current: 'normal_unmetered', changed: false, stale: false, status: 'fresh' }),
    commandRecord,
    observedAt: new Date('2026-05-14T00:06:00.000Z'),
  });
  const failures = [];
  if (second.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (second.summary.eventCount !== 1) failures.push('routine checks should not append by default');
  if (second.summary.latestEventKind !== 'classification_changed') failures.push('expected latest stored event to remain classification change');
  if (second.summary.lastObservationKind !== 'routine_check') failures.push('expected routine last observation');
  if (second.summary.changeEventCount !== 1) failures.push('expected one change event');
  if (second.policy.staleNetworkReceiptMayDriveActions !== false) failures.push('stale receipt must not drive actions');
  if (second.policy.endpointDetailsRedacted !== true) failures.push('endpoint details must be redacted');
  if (second.receipt.rawIdentifiersIncluded !== false) failures.push('raw identifiers must be absent');

  if (failures.length) {
    throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
  }

  writeOutputs(args, second);
  return second;
}

function observeOnce(args) {
  const commandRecord = runFreshness(args);
  const freshness = readJson(args.freshnessOutput, {});
  const existing = readJson(args.output, {});
  const ledger = createLedger({
    args,
    existing,
    freshness,
    commandRecord,
    observedAt: new Date(),
  });
  writeOutputs(args, ledger);
  return ledger;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function watch(args) {
  let firstLedger = null;
  while (true) {
    const ledger = observeOnce(args);
    firstLedger ||= ledger;
    console.log(`${new Date().toISOString()} network sentinel ${ledger.summary.lastObservationKind}: ${ledger.summary.previousClassification} -> ${ledger.summary.currentClassification}`);
    await delay(args.intervalMs);
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    const ledger = runSelfTest(args);
    if (args.json) console.log(JSON.stringify(ledger, null, 2));
    else console.log(`HoloShell network change sentinel self-test: ${resolveRepoPath(args.output)}`);
  } else if (args.watch) {
    await watch(args);
  } else {
    const ledger = observeOnce(args);
    if (args.json) {
      console.log(JSON.stringify(ledger, null, 2));
    } else {
      console.log(`HoloShell network change events: ${resolveRepoPath(args.output)}`);
      console.log(`HoloShell latest network change: ${resolveRepoPath(args.latestOutput)}`);
      console.log(`Status: ${ledger.summary.status}`);
      console.log(`Observation: ${ledger.summary.lastObservationKind}`);
      console.log(`Network: ${ledger.summary.previousClassification} -> ${ledger.summary.currentClassification}`);
      console.log(`Events: ${ledger.summary.eventCount}`);
    }

    if (ledger.summary.status === 'warn') {
      process.exitCode = 1;
    }
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
