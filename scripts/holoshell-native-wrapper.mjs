#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_VERSION = 'hololand.holoshell.native-wrapper.v0.1.0';
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const UPSTREAM_HOLOSCRIPT_ROOT = process.env.HOLOSCRIPT_ROOT || path.resolve(REPO_ROOT, '..', 'HoloScript');
const UPSTREAM_NATIVE_CAPABILITY_ENVELOPE_SOURCE =
  'experiments/holoshell-human-os-frontier/native-holoshell-capability-envelope.hsplus';
const UPSTREAM_NATIVE_CAPABILITY_ENVELOPE_LABEL =
  `HoloScript:${UPSTREAM_NATIVE_CAPABILITY_ENVELOPE_SOURCE}`;
const NATIVE_CAPABILITY_ENVELOPE_SCHEMA = 'holoscript.holoshell.native-capability-envelope.v0.1.0';
const UPSTREAM_NATIVE_TERMINAL_EVENT_STREAM_SOURCE =
  'experiments/holoshell-human-os-frontier/native-terminal-event-stream.hsplus';
const UPSTREAM_NATIVE_TERMINAL_EVENT_STREAM_LABEL =
  `HoloScript:${UPSTREAM_NATIVE_TERMINAL_EVENT_STREAM_SOURCE}`;
const NATIVE_TERMINAL_EVENT_STREAM_SCHEMA = 'holoscript.holoshell.native-terminal-event-stream.v0.1.0';
const NATIVE_CAPABILITY_LANES = [
  'receipt_read',
  'terminal_event_read',
  'jetson_appliance_observe',
  'service_status',
  'guarded_service_ensure',
  'guarded_open_url',
  'break_glass_os_mutation',
];

const SOURCE_ANCHORS = {
  source: 'apps/holoshell/source/holoshell-native-wrapper.hsplus',
  upstreamCapabilityEnvelopeSource: UPSTREAM_NATIVE_CAPABILITY_ENVELOPE_LABEL,
  upstreamCapabilityEnvelopeSchema: NATIVE_CAPABILITY_ENVELOPE_SCHEMA,
  upstreamTerminalEventStreamSource: UPSTREAM_NATIVE_TERMINAL_EVENT_STREAM_LABEL,
  upstreamTerminalEventStreamSchema: NATIVE_TERMINAL_EVENT_STREAM_SCHEMA,
  startupIntegrationSource: 'apps/holoshell/source/holoshell-startup-integration.hsplus',
  founderHostSource: 'apps/holoshell/source/holoshell-founder-host.hsplus',
  wrapperRoot: 'apps/holoshell/native',
  windowsLauncher: 'apps/holoshell/native/windows/Start-HoloShellFounderHost.ps1',
  windowsCommandShim: 'apps/holoshell/native/windows/Start-HoloShellFounderHost.cmd',
  windowsStartupRegistration: 'apps/holoshell/native/windows/Register-HoloShellStartup.ps1',
  nativeAppSurfaceUrl: 'http://holojetson.local:8747',
  browserSelfTestSurface: 'GET /',
  serviceSupervisorSource: 'apps/holoshell/source/holoshell-service-supervisor.hsplus',
  serviceSupervisorAdapter: 'scripts/holoshell-service-supervisor.mjs',
  serviceSupervisorReceipt: '.tmp/holoshell/service-supervisor.json',
  previewHost: 'apps/holoshell/prototype/local-capability-room.html',
  startupIntegrationReceipt: '.tmp/holoshell/startup-integration.json',
  founderHostReceipt: '.tmp/holoshell/founder-host.json',
  startupIntegrationAdapter: 'scripts/holoshell-startup-integration.mjs',
  adapter: 'scripts/holoshell-native-wrapper.mjs',
};

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    tmpDir: DEFAULT_TMP,
    output: null,
    jsOutput: null,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--tmp-dir') args.tmpDir = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.selfTest) args.tmpDir = path.join(DEFAULT_TMP, 'self-test');
  args.output ||= path.join(args.tmpDir, 'native-wrapper.json');
  args.jsOutput ||= path.join(args.tmpDir, 'native-wrapper.js');
  return args;
}

function printHelp() {
  console.log(`HoloShell native wrapper receipt

Usage:
  node scripts/holoshell-native-wrapper.mjs [options]

Options:
  --json              Print the wrapper receipt.
  --tmp-dir <path>    Receipt directory. Defaults to .tmp/holoshell.
  --output <path>     Receipt JSON path. Defaults to <tmp-dir>/native-wrapper.json.
  --js-output <path>  Browser bootstrap path. Defaults to <tmp-dir>/native-wrapper.js.
  --self-test         Use fixtures and assert invariants.
  -h, --help          Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function resolveHoloScriptPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(UPSTREAM_HOLOSCRIPT_ROOT, filePath);
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
      path: toRepoPath(resolved),
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
  writeFileSync(resolved, `window.HOLOSHELL_NATIVE_WRAPPER = ${payload};\n`, 'utf8');
  return resolved;
}

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function sourceManifest(fixtures = null) {
  if (fixtures?.sources) return fixtures.sources;
  const entries = [
    ['wrapperSource', SOURCE_ANCHORS.source, true],
    ['upstreamNativeCapabilityEnvelope', SOURCE_ANCHORS.upstreamCapabilityEnvelopeSource, true, 'holoscript'],
    ['upstreamNativeTerminalEventStream', SOURCE_ANCHORS.upstreamTerminalEventStreamSource, true, 'holoscript'],
    ['startupIntegrationSource', SOURCE_ANCHORS.startupIntegrationSource, true],
    ['founderHostSource', SOURCE_ANCHORS.founderHostSource, true],
    ['wrapperRoot', SOURCE_ANCHORS.wrapperRoot, true],
    ['windowsLauncher', SOURCE_ANCHORS.windowsLauncher, true],
    ['windowsCommandShim', SOURCE_ANCHORS.windowsCommandShim, true],
    ['windowsStartupRegistration', SOURCE_ANCHORS.windowsStartupRegistration, true],
    ['startupIntegrationAdapter', SOURCE_ANCHORS.startupIntegrationAdapter, true],
    ['previewHost', SOURCE_ANCHORS.previewHost, true],
  ];

  return entries.map(([id, filePath, required, root = 'hololand']) => ({
    id,
    path: filePath,
    root,
    required,
    present: root === 'holoscript'
      ? existsSync(resolveHoloScriptPath(
          id === 'upstreamNativeTerminalEventStream'
            ? UPSTREAM_NATIVE_TERMINAL_EVENT_STREAM_SOURCE
            : UPSTREAM_NATIVE_CAPABILITY_ENVELOPE_SOURCE
        ))
      : existsSync(resolveRepoPath(filePath)),
  }));
}

function nativeCapabilityEnvelopeSnapshot(fixtures = null) {
  if (fixtures?.capabilityEnvelope) return fixtures.capabilityEnvelope;
  const resolved = resolveHoloScriptPath(UPSTREAM_NATIVE_CAPABILITY_ENVELOPE_SOURCE);
  const present = existsSync(resolved);
  const text = present ? readFileSync(resolved, 'utf8') : '';
  const matchedLanes = NATIVE_CAPABILITY_LANES.filter((lane) => text.includes(`"${lane}"`));
  const missingLanes = NATIVE_CAPABILITY_LANES.filter((lane) => !matchedLanes.includes(lane));
  const schemaObserved = text.includes(NATIVE_CAPABILITY_ENVELOPE_SCHEMA);
  const ready = present && schemaObserved && missingLanes.length === 0;
  return {
    source: UPSTREAM_NATIVE_CAPABILITY_ENVELOPE_LABEL,
    schemaVersion: NATIVE_CAPABILITY_ENVELOPE_SCHEMA,
    present,
    schemaObserved,
    status: ready ? 'ready' : (present ? 'incomplete' : 'missing'),
    requiredLaneCount: NATIVE_CAPABILITY_LANES.length,
    matchedLaneCount: matchedLanes.length,
    matchedLanes,
    missingLanes,
  };
}

function nativeTerminalEventStreamSnapshot(fixtures = null) {
  if (fixtures?.terminalEventStream) return fixtures.terminalEventStream;
  const resolved = resolveHoloScriptPath(UPSTREAM_NATIVE_TERMINAL_EVENT_STREAM_SOURCE);
  const present = existsSync(resolved);
  const text = present ? readFileSync(resolved, 'utf8') : '';
  const requiredKinds = [
    'run.started',
    'stdout.chunk',
    'stderr.chunk',
    'artifact.detected',
    'approval.required',
    'run.exited',
    'receipt.written',
  ];
  const matchedEventKinds = requiredKinds.filter((kind) => text.includes(`"${kind}"`));
  const missingEventKinds = requiredKinds.filter((kind) => !matchedEventKinds.includes(kind));
  const schemaObserved = text.includes(NATIVE_TERMINAL_EVENT_STREAM_SCHEMA);
  const laneObserved = text.includes('"terminal_event_read"');
  const ready = present && schemaObserved && laneObserved && missingEventKinds.length === 0;
  return {
    source: UPSTREAM_NATIVE_TERMINAL_EVENT_STREAM_LABEL,
    schemaVersion: NATIVE_TERMINAL_EVENT_STREAM_SCHEMA,
    present,
    schemaObserved,
    laneObserved,
    status: ready ? 'ready' : (present ? 'incomplete' : 'missing'),
    requiredEventKindCount: requiredKinds.length,
    matchedEventKindCount: matchedEventKinds.length,
    matchedEventKinds,
    missingEventKinds,
  };
}

function browserCandidates(fixtures = null) {
  if (fixtures?.browserCandidates) return fixtures.browserCandidates;
  const candidates = [
    { family: 'chrome', source: 'env.CHROME', path: process.env.CHROME || '' },
    { family: 'chrome', source: 'program_files', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    { family: 'chrome', source: 'program_files_x86', path: 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' },
    { family: 'edge', source: 'program_files', path: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' },
    { family: 'edge', source: 'program_files_x86', path: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe' },
  ];
  return candidates
    .filter((candidate) => candidate.path)
    .map((candidate) => ({
      family: candidate.family,
      source: candidate.source,
      present: existsSync(candidate.path),
    }));
}

function statusFrom({ sourceReady, launcherPresent, commandShimPresent, previewHostPresent, browserCandidateCount }) {
  if (!sourceReady || !launcherPresent || !commandShimPresent || !previewHostPresent) return 'blocked_missing_source';
  if (!browserCandidateCount) return 'wrapper_present_browser_missing';
  return 'launchable_wrapper_present';
}

function createReceipt(args, fixtures = null) {
  const generatedAt = new Date().toISOString();
  const sources = sourceManifest(fixtures);
  const capabilityEnvelope = nativeCapabilityEnvelopeSnapshot(fixtures);
  const terminalEventStream = nativeTerminalEventStreamSnapshot(fixtures);
  const requiredSources = sources.filter((source) => source.required);
  const sourceReady = requiredSources.every((source) => source.present);
  const launcherPresent = sources.some((source) => source.id === 'windowsLauncher' && source.present);
  const commandShimPresent = sources.some((source) => source.id === 'windowsCommandShim' && source.present);
  const startupRegistrationScriptPresent = sources.some((source) => source.id === 'windowsStartupRegistration' && source.present);
  const startupIntegrationAdapterPresent = sources.some((source) => source.id === 'startupIntegrationAdapter' && source.present);
  const previewHostPresent = sources.some((source) => source.id === 'previewHost' && source.present);
  const browsers = browserCandidates(fixtures);
  const availableBrowsers = browsers.filter((candidate) => candidate.present);
  const status = statusFrom({
    sourceReady,
    launcherPresent,
    commandShimPresent,
    previewHostPresent,
    browserCandidateCount: availableBrowsers.length,
  });
  const founderHost = fixtures?.founderHost || readJson(path.join(args.tmpDir, 'founder-host.json'), {});
  const startupIntegration = fixtures?.startupIntegration || readJson(path.join(args.tmpDir, 'startup-integration.json'), {});
  const startupIntegrationPresent = Boolean(
    startupIntegration?.summary?.startupIntegrationPresent
    || (sourceReady && startupRegistrationScriptPresent && startupIntegrationAdapterPresent)
  );
  const startupRegistered = Boolean(startupIntegration?.summary?.startupRegistered);
  const localMutationExecutionEnabled = false;
  const launchable = status === 'launchable_wrapper_present';
  const nextMove = launchable && startupIntegrationPresent
    ? startupRegistered
      ? 'observe_login_startup_receipt'
      : 'render_startup_approval_card'
    : launchable
      ? 'wire_startup_integration_with_approval'
      : 'install_chromium_or_repair_launcher';
  const hashInput = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    status,
    sourceReady,
    launcherPresent,
    commandShimPresent,
    previewHostPresent,
    browserCandidateCount: availableBrowsers.length,
    startupIntegrationPresent,
    startupRegistered,
    nativeCapabilityEnvelopeStatus: capabilityEnvelope.status,
    nativeCapabilityEnvelopeLaneCount: capabilityEnvelope.matchedLaneCount,
    upstreamTerminalEventStreamStatus: terminalEventStream.status,
    upstreamTerminalEventStreamEventKindCount: terminalEventStream.matchedEventKindCount,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceAnchors: SOURCE_ANCHORS,
    summary: {
      status,
      platform: process.platform,
      sourceReady,
      requiredSourceCount: requiredSources.length,
      requiredSourcePresentCount: requiredSources.filter((source) => source.present).length,
      launcherPresent,
      commandShimPresent,
      startupRegistrationScriptPresent,
      startupIntegrationAdapterPresent,
      previewHostPresent,
      browserCandidateCount: availableBrowsers.length,
      primaryBrowserFamily: availableBrowsers[0]?.family || 'none',
      launchMode: 'chromium_app_mode',
      launchable,
      startsWithoutManualHtml: launchable,
      startupIntegrationPresent,
      startupIntegrationStatus: startupIntegration?.summary?.status || 'unknown',
      startupRegistered,
      localMutationExecutionEnabled,
      primarySurfaceOwnership: 'native_holoshell_app_window',
      productTarget: 'native_holoshell_app_window',
      upstreamCapabilityEnvelopeStatus: capabilityEnvelope.status,
      upstreamCapabilityEnvelopePresent: capabilityEnvelope.present,
      upstreamCapabilityEnvelopeSchema: capabilityEnvelope.schemaVersion,
      nativeCapabilityLaneCount: capabilityEnvelope.matchedLaneCount,
      nativeCapabilityLanesReady: capabilityEnvelope.status === 'ready',
      upstreamTerminalEventStreamStatus: terminalEventStream.status,
      upstreamTerminalEventStreamPresent: terminalEventStream.present,
      upstreamTerminalEventStreamSchema: terminalEventStream.schemaVersion,
      nativeTerminalEventKindsReady: terminalEventStream.status === 'ready',
      nativeAppSurfaceUrl: SOURCE_ANCHORS.nativeAppSurfaceUrl,
      browserSelfTestSurface: SOURCE_ANCHORS.browserSelfTestSurface,
      nativeWindowOwnsDailyOperation: true,
      browserIsBootstrapSelfTestOnly: true,
      holoServicesRunThroughTerminalSupervisor: true,
      founderHostStatus: founderHost?.summary?.status || 'unknown',
      nextMove,
    },
    sources,
    capabilityEnvelope,
    terminalEventStream,
    browsers,
    launcher: {
      script: SOURCE_ANCHORS.windowsLauncher,
      commandShim: SOURCE_ANCHORS.windowsCommandShim,
      surface: SOURCE_ANCHORS.previewHost,
      profileDir: '.tmp/holoshell/native-profile',
      commandPreview: [
        'apps/holoshell/native/windows/Start-HoloShellFounderHost.ps1',
        '-SurfaceUrl',
        SOURCE_ANCHORS.nativeAppSurfaceUrl,
        '-RefreshReceipts',
      ],
      startupRegistrationPreview: [
        'apps/holoshell/native/windows/Register-HoloShellStartup.ps1',
        '-Register',
        '-Approve',
      ],
      rawBrowserPathIncluded: false,
      rawCommandLineIncluded: false,
    },
    policy: {
      localOnly: true,
      appModeOnly: true,
      launcherMayOpenHoloShell: true,
      launcherTargetsJetsonAppWindow: true,
      browserSelfTestBeforePackagingClaim: true,
      nativeWindowOwnsDailyOperation: true,
      holoServicesRunThroughTerminalSupervisor: true,
      launcherMayClaimOsReplacement: false,
      startupRegistrationRequiresApproval: true,
      startupRegistrationAdapterPresent: startupIntegrationPresent,
      startupRegisteredRequiresReceipt: true,
      explorerShellReplacementRequiresSeparateNativePlan: true,
      upstreamCapabilityEnvelopeRequired: true,
      upstreamTerminalEventStreamRequired: true,
      nativeCapabilityLaneGrantRequired: true,
      terminalEventsBeforeTerminalUi: true,
      jetsonApplianceEvidenceRequired: true,
      daemonExecuteDisabledByDefault: true,
      appMutationsRequireApprovalBundle: true,
      destructiveActionsAllowed: false,
    },
    receipt: {
      wrapperSnapshotHash: sha256(JSON.stringify(hashInput)),
      launchPerformed: false,
      startupRegistered,
      serviceMutationTaken: false,
      destructiveActionsTaken: false,
      rawBrowserPathIncluded: false,
      rawCommandLineIncluded: false,
    },
  };
}

function selfTestFixtures() {
  return {
    sources: [
      ['wrapperSource', SOURCE_ANCHORS.source, true, true],
      ['upstreamNativeCapabilityEnvelope', SOURCE_ANCHORS.upstreamCapabilityEnvelopeSource, true, true, 'holoscript'],
      ['upstreamNativeTerminalEventStream', SOURCE_ANCHORS.upstreamTerminalEventStreamSource, true, true, 'holoscript'],
      ['startupIntegrationSource', SOURCE_ANCHORS.startupIntegrationSource, true, true],
      ['founderHostSource', SOURCE_ANCHORS.founderHostSource, true, true],
      ['wrapperRoot', SOURCE_ANCHORS.wrapperRoot, true, true],
      ['windowsLauncher', SOURCE_ANCHORS.windowsLauncher, true, true],
      ['windowsCommandShim', SOURCE_ANCHORS.windowsCommandShim, true, true],
      ['windowsStartupRegistration', SOURCE_ANCHORS.windowsStartupRegistration, true, true],
      ['startupIntegrationAdapter', SOURCE_ANCHORS.startupIntegrationAdapter, true, true],
      ['previewHost', SOURCE_ANCHORS.previewHost, true, true],
    ].map(([id, filePath, required, present, root = 'hololand']) => ({ id, path: filePath, root, required, present })),
    capabilityEnvelope: {
      source: UPSTREAM_NATIVE_CAPABILITY_ENVELOPE_LABEL,
      schemaVersion: NATIVE_CAPABILITY_ENVELOPE_SCHEMA,
      present: true,
      schemaObserved: true,
      status: 'ready',
      requiredLaneCount: NATIVE_CAPABILITY_LANES.length,
      matchedLaneCount: NATIVE_CAPABILITY_LANES.length,
      matchedLanes: NATIVE_CAPABILITY_LANES,
      missingLanes: [],
    },
    terminalEventStream: {
      source: UPSTREAM_NATIVE_TERMINAL_EVENT_STREAM_LABEL,
      schemaVersion: NATIVE_TERMINAL_EVENT_STREAM_SCHEMA,
      present: true,
      schemaObserved: true,
      laneObserved: true,
      status: 'ready',
      requiredEventKindCount: 7,
      matchedEventKindCount: 7,
      matchedEventKinds: [
        'run.started',
        'stdout.chunk',
        'stderr.chunk',
        'artifact.detected',
        'approval.required',
        'run.exited',
        'receipt.written',
      ],
      missingEventKinds: [],
    },
    browserCandidates: [{ family: 'chrome', source: 'fixture', present: true }],
    founderHost: { summary: { status: 'native_host_present' } },
    startupIntegration: { summary: { status: 'registration_adapter_present', startupIntegrationPresent: true, startupRegistered: false } },
  };
}

function assertSelfTest(receipt) {
  const failures = [];
  if (receipt.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (receipt.summary.status !== 'launchable_wrapper_present') failures.push(`unexpected status ${receipt.summary.status}`);
  if (receipt.summary.launchable !== true) failures.push('wrapper should be launchable');
  if (receipt.summary.startsWithoutManualHtml !== true) failures.push('wrapper should start without manual HTML open');
  if (receipt.summary.startupIntegrationPresent !== true) failures.push('startup integration should be present in fixture');
  if (receipt.summary.startupRegistered !== false) failures.push('startup should be unregistered in fixture');
  if (receipt.summary.localMutationExecutionEnabled !== false) failures.push('execute must default disabled');
  if (receipt.summary.upstreamCapabilityEnvelopeStatus !== 'ready') failures.push('upstream capability envelope should be ready');
  if (receipt.summary.nativeCapabilityLanesReady !== true) failures.push('native capability lanes should be ready');
  if (receipt.capabilityEnvelope.missingLanes.length !== 0) failures.push('native capability envelope should have no missing lanes');
  if (receipt.summary.upstreamTerminalEventStreamStatus !== 'ready') failures.push('upstream terminal event stream should be ready');
  if (receipt.terminalEventStream.missingEventKinds.length !== 0) failures.push('upstream terminal event stream should have no missing event kinds');
  if (receipt.policy.launcherMayClaimOsReplacement !== false) failures.push('wrapper must not claim OS replacement');
  if (receipt.policy.startupRegistrationRequiresApproval !== true) failures.push('startup registration must require approval');
  if (receipt.policy.startupRegistrationAdapterPresent !== true) failures.push('startup registration adapter should be present');
  if (receipt.policy.upstreamCapabilityEnvelopeRequired !== true) failures.push('upstream capability envelope must be required');
  if (receipt.policy.upstreamTerminalEventStreamRequired !== true) failures.push('upstream terminal event stream must be required');
  if (receipt.receipt.launchPerformed !== false) failures.push('receipt check must not launch');
  if (receipt.receipt.destructiveActionsTaken !== false) failures.push('self-test must be non-destructive');
  if (receipt.receipt.rawCommandLineIncluded !== false) failures.push('raw command must stay hidden');
  if (!receipt.receipt.wrapperSnapshotHash) failures.push('missing wrapper hash');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs();
  const receipt = createReceipt(args, args.selfTest ? selfTestFixtures() : null);
  if (args.selfTest) assertSelfTest(receipt);
  const output = writeJson(args.output, receipt);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, receipt);

  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log(`HoloShell native wrapper: ${output}`);
    console.log(`HoloShell native wrapper browser bootstrap: ${jsOutput}`);
    console.log(`Status: ${receipt.summary.status}`);
    console.log(`Launchable: ${receipt.summary.launchable ? 'yes' : 'no'}`);
    console.log(`Launcher: ${receipt.summary.launcherPresent ? 'present' : 'missing'}`);
    console.log(`Browser candidates: ${receipt.summary.browserCandidateCount}`);
    console.log(`Startup integration: ${receipt.summary.startupIntegrationPresent ? 'present' : 'missing'}`);
    console.log(`Next: ${receipt.summary.nextMove}`);
  }
} catch (error) {
  console.error(`holoshell-native-wrapper failed: ${error.message}`);
  process.exit(1);
}
