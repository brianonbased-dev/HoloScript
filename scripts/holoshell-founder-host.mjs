#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_VERSION = 'hololand.holoshell.founder-host.v0.1.0';
const DEFAULT_TMP = path.join('.tmp', 'holoshell');

const SOURCE_ANCHORS = {
  source: 'apps/holoshell/source/holoshell-founder-host.hsplus',
  shellWorld: 'apps/holoshell/source/holoshell-shell-world.holo',
  shellRender: 'apps/holoshell/source/holoshell-shell-render.holo',
  shellHome: 'apps/holoshell/source/holoshell-home.hsplus',
  hardwareControl: 'apps/holoshell/source/holoshell-hardware-control.hsplus',
  serviceSupervisorSource: 'apps/holoshell/source/holoshell-service-supervisor.hsplus',
  nativeWrapperSource: 'apps/holoshell/source/holoshell-native-wrapper.hsplus',
  startupIntegrationSource: 'apps/holoshell/source/holoshell-startup-integration.hsplus',
  nativeWrapperReceipt: '.tmp/holoshell/native-wrapper.json',
  startupIntegrationReceipt: '.tmp/holoshell/startup-integration.json',
  adapter: 'scripts/holoshell-founder-host.mjs',
  previewHost: 'apps/holoshell/prototype/local-capability-room.html',
  nativeWrapperTarget: 'apps/holoshell/native',
};

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    tmpDir: DEFAULT_TMP,
    output: null,
    jsOutput: null,
    json: false,
    selfTest: false,
    refresh: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--tmp-dir') args.tmpDir = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--refresh') args.refresh = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.selfTest) args.tmpDir = path.join(DEFAULT_TMP, 'self-test');
  args.output ||= path.join(args.tmpDir, 'founder-host.json');
  args.jsOutput ||= path.join(args.tmpDir, 'founder-host.js');
  return args;
}

function printHelp() {
  console.log(`HoloShell Founder host bootstrap

Usage:
  node scripts/holoshell-founder-host.mjs [options]

Options:
  --refresh           Refresh service supervisor, shell objects, and live feed before writing host receipt.
  --json              Print the host receipt.
  --tmp-dir <path>    Receipt directory. Defaults to .tmp/holoshell.
  --output <path>     Receipt JSON path. Defaults to <tmp-dir>/founder-host.json.
  --js-output <path>  Browser bootstrap path. Defaults to <tmp-dir>/founder-host.js.
  --self-test         Use fixtures and assert invariants.
  -h, --help          Show this help.
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
  writeFileSync(resolved, `window.HOLOSHELL_FOUNDER_HOST = ${payload};\n`, 'utf8');
  return resolved;
}

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function runNode(args, timeoutMs = 60000) {
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer: 10 * 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status ?? (result.error ? 1 : 0),
    command: `node ${args.join(' ')}`,
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr || result.error?.message || ''),
  };
}

function tail(value, lineCount = 8) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-lineCount);
}

function sourceManifest() {
  const entries = [
    ['hostSource', SOURCE_ANCHORS.source, true],
    ['shellWorld', SOURCE_ANCHORS.shellWorld, true],
    ['shellRender', SOURCE_ANCHORS.shellRender, true],
    ['shellHome', SOURCE_ANCHORS.shellHome, true],
    ['hardwareControl', SOURCE_ANCHORS.hardwareControl, true],
    ['serviceSupervisorSource', SOURCE_ANCHORS.serviceSupervisorSource, true],
    ['nativeWrapperSource', SOURCE_ANCHORS.nativeWrapperSource, true],
    ['startupIntegrationSource', SOURCE_ANCHORS.startupIntegrationSource, true],
    ['previewHost', SOURCE_ANCHORS.previewHost, true],
    ['nativeWrapperTarget', SOURCE_ANCHORS.nativeWrapperTarget, false],
  ];

  return entries.map(([id, filePath, required]) => ({
    id,
    path: filePath,
    required,
    present: existsSync(resolveRepoPath(filePath)),
  }));
}

function refreshInputs(args) {
  if (!args.refresh) return [];
  return [
    runNode(['scripts/holoshell-startup-integration.mjs', '--tmp-dir', args.tmpDir], 90000),
    runNode(['scripts/holoshell-native-wrapper.mjs', '--tmp-dir', args.tmpDir], 90000),
    runNode(['scripts/holoshell-service-supervisor.mjs', '--status', '--tmp-dir', args.tmpDir], 90000),
    runNode(['scripts/holoshell-shell-objects.mjs', '--tmp-dir', args.tmpDir], 90000),
    runNode(['scripts/holoshell-live-feed.mjs', '--tmp-dir', args.tmpDir], 90000),
  ];
}

function refreshDownstreamReceipts(args) {
  if (!args.refresh || args.selfTest) return [];
  return [
    runNode(['scripts/holoshell-shell-objects.mjs', '--tmp-dir', args.tmpDir], 90000),
    runNode(['scripts/holoshell-live-feed.mjs', '--tmp-dir', args.tmpDir], 90000),
  ];
}

function statusFrom({ sourceReady, previewHostReady, shellObjectGraphReady, liveFeedReady, nativeWrapperPresent }) {
  if (!sourceReady || !previewHostReady) return 'blocked_missing_source';
  if (!shellObjectGraphReady || !liveFeedReady) return 'needs_receipt_refresh';
  if (nativeWrapperPresent) return 'native_host_present';
  return 'ready_for_native_wrapper';
}

function createBootPhases({ sourceReady, previewHostReady, shellObjectGraphReady, liveFeedReady, serviceSupervisorReady, nativeWrapperPresent, startupIntegrationPresent }) {
  return [
    {
      phaseId: 'source_load',
      label: 'Load HoloScript shell source',
      status: sourceReady ? 'pass' : 'blocked',
      requiredForNativeWrapper: true,
      receiptRequired: true,
    },
    {
      phaseId: 'preview_host',
      label: 'Preview host available',
      status: previewHostReady ? 'pass' : 'blocked',
      requiredForNativeWrapper: true,
      receiptRequired: true,
    },
    {
      phaseId: 'service_supervision',
      label: 'Observe local services',
      status: serviceSupervisorReady ? 'pass' : 'warn',
      requiredForNativeWrapper: true,
      receiptRequired: true,
    },
    {
      phaseId: 'shell_object_graph',
      label: 'Materialize shell objects',
      status: shellObjectGraphReady ? 'pass' : 'warn',
      requiredForNativeWrapper: true,
      receiptRequired: true,
    },
    {
      phaseId: 'live_feed',
      label: 'Bundle live feed',
      status: liveFeedReady ? 'pass' : 'warn',
      requiredForNativeWrapper: true,
      receiptRequired: true,
    },
    {
      phaseId: 'native_wrapper',
      label: 'Native wrapper target',
      status: nativeWrapperPresent ? 'pass' : 'missing',
      requiredForNativeWrapper: false,
      receiptRequired: true,
    },
    {
      phaseId: 'startup_integration',
      label: 'Start HoloShell at machine login',
      status: startupIntegrationPresent ? 'pass' : 'missing',
      requiredForNativeWrapper: false,
      receiptRequired: true,
    },
  ];
}

function createReceipt(args, fixtures = null) {
  const generatedAt = new Date().toISOString();
  const refreshResults = fixtures?.refreshResults || refreshInputs(args);
  const sources = fixtures?.sources || sourceManifest();
  const tmpDir = resolveRepoPath(args.tmpDir);
  const serviceSupervisor = fixtures?.serviceSupervisor || readJson(path.join(tmpDir, 'service-supervisor.json'), {});
  const controlDaemonService = fixtures?.controlDaemonService || readJson(path.join(tmpDir, 'control-daemon-service.json'), {});
  const shellObjects = fixtures?.shellObjects || readJson(path.join(tmpDir, 'shell-objects.json'), {});
  const liveFeed = fixtures?.liveFeed || readJson(path.join(tmpDir, 'live-feed.json'), {});
  const sourceValidation = fixtures?.sourceValidation || readJson(path.join(tmpDir, 'source-validation.json'), {});
  const nativeWrapper = fixtures?.nativeWrapper || readJson(path.join(tmpDir, 'native-wrapper.json'), {});
  const startupIntegration = fixtures?.startupIntegration || readJson(path.join(tmpDir, 'startup-integration.json'), {});

  const requiredSources = sources.filter((source) => source.required);
  const sourceReady = requiredSources.every((source) => source.present);
  const previewHostReady = sources.some((source) => source.id === 'previewHost' && source.present);
  const nativeWrapperPresent = sources.some((source) => source.id === 'nativeWrapperTarget' && source.present);
  const nativeWrapperLaunchable = Boolean(nativeWrapper?.summary?.launchable);
  const startupIntegrationPresent = Boolean(startupIntegration?.summary?.startupIntegrationPresent || nativeWrapper?.summary?.startupIntegrationPresent);
  const startupRegistered = Boolean(startupIntegration?.summary?.startupRegistered || nativeWrapper?.summary?.startupRegistered);
  const shellObjectGraphReady = shellObjects?.summary?.status === 'ready';
  const liveFeedReady = Boolean(liveFeed?.schemaVersion && liveFeed?.summary);
  const serviceSupervisorReady = ['ready', 'ready_with_optional_offline', 'ready_with_degraded_optional'].includes(serviceSupervisor?.summary?.status);
  const localMutationExecutionEnabled = Boolean(controlDaemonService?.summary?.executeEnabled || liveFeed?.summary?.serviceSupervisorControlDaemonExecuteEnabled);
  const status = statusFrom({ sourceReady, previewHostReady, shellObjectGraphReady, liveFeedReady, nativeWrapperPresent });
  const bootPhases = createBootPhases({
    sourceReady,
    previewHostReady,
    shellObjectGraphReady,
    liveFeedReady,
    serviceSupervisorReady,
    nativeWrapperPresent,
    startupIntegrationPresent,
  });
  const blockedPhaseCount = bootPhases.filter((phase) => ['blocked', 'warn'].includes(phase.status)).length;
  const missingFuturePhaseCount = bootPhases.filter((phase) => phase.status === 'missing').length;
  const nextMove = nativeWrapperPresent && startupIntegrationPresent
    ? startupRegistered
      ? 'observe_login_startup_receipt'
      : 'render_startup_approval_card'
    : nativeWrapperPresent
      ? 'wire_startup_integration_with_approval'
    : status === 'needs_receipt_refresh'
      ? 'refresh_shell_objects_and_live_feed'
      : 'build_native_wrapper';
  const hashInput = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    status,
    sourceReady,
    previewHostReady,
    shellObjectGraphReady,
    liveFeedReady,
    serviceSupervisorReady,
    nativeWrapperPresent,
    startupIntegrationPresent,
    startupRegistered,
    bootPhases: bootPhases.map((phase) => [phase.phaseId, phase.status]),
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    sourceAnchors: SOURCE_ANCHORS,
    summary: {
      status,
      mode: 'founder_preview_host',
      sourceReady,
      requiredSourceCount: requiredSources.length,
      requiredSourcePresentCount: requiredSources.filter((source) => source.present).length,
      previewHostReady,
      nativeWrapperPresent,
      nativeWrapperStatus: nativeWrapper?.summary?.status || 'unknown',
      nativeWrapperLaunchable,
      nativeWrapperLauncherPresent: Boolean(nativeWrapper?.summary?.launcherPresent),
      nativeWrapperBrowserCandidateCount: nativeWrapper?.summary?.browserCandidateCount || 0,
      startupIntegrationPresent,
      startupIntegrationStatus: startupIntegration?.summary?.status || 'unknown',
      startupRegistered,
      shellObjectGraphReady,
      shellObjectCount: shellObjects?.summary?.shellObjectCount || 0,
      firstScreenObjectCount: shellObjects?.summary?.firstScreenObjectCount || 0,
      liveFeedReady,
      liveFeedRisk: liveFeed?.summary?.overallRisk || 'unknown',
      serviceSupervisorReady,
      serviceSupervisorStatus: serviceSupervisor?.summary?.status || 'unknown',
      controlDaemonStatus: controlDaemonService?.summary?.serviceStatus || 'unknown',
      controlDaemonLoopbackReachable: Boolean(controlDaemonService?.summary?.loopbackReachable),
      localMutationExecutionEnabled,
      sourceValidationStatus: sourceValidation?.summary?.status || 'unknown',
      sourceValidationFileCount: sourceValidation?.summary?.fileCount || 0,
      primarySurfaceOwnership: nativeWrapperPresent ? 'native_wrapper_candidate' : 'preview_only',
      bootPhaseCount: bootPhases.length,
      blockedPhaseCount,
      missingFuturePhaseCount,
      refreshCommandCount: refreshResults.length,
      refreshFailureCount: refreshResults.filter((result) => !result.ok).length,
      nextMove,
    },
    sources,
    bootPhases,
    refreshResults,
    hostPlan: {
      currentSurface: SOURCE_ANCHORS.previewHost,
      currentSurfaceKind: 'html_preview_host',
      nativeWrapperTarget: SOURCE_ANCHORS.nativeWrapperTarget,
      nativeWrapperReceipt: SOURCE_ANCHORS.nativeWrapperReceipt,
      startupIntegrationSource: SOURCE_ANCHORS.startupIntegrationSource,
      startupIntegrationReceipt: SOURCE_ANCHORS.startupIntegrationReceipt,
      startupIntegrationTarget: 'user_login_startup_task_or_native_shell_wrapper',
      nextCommands: [
        'node scripts/holoshell-startup-integration.mjs',
        'node scripts/holoshell-native-wrapper.mjs',
        'pnpm run holoshell:founder-host:refresh',
        'apps/holoshell/native/windows/Register-HoloShellStartup.ps1 -Register -Approve',
        'apps/holoshell/native/windows/Start-HoloShellFounderHost.ps1 -RefreshReceipts',
        'pnpm run holoshell:shell-objects',
        'node scripts/holoshell-live-feed.mjs',
      ],
    },
    policy: {
      statusDefaultIsReadOnly: true,
      htmlPreviewMayRenderShell: true,
      htmlPreviewMayClaimOsReplacement: false,
      nativeWrapperRequiredForPrimarySurface: true,
      startupIntegrationRequiresApproval: true,
      daemonExecuteDisabledByDefault: true,
      appMutationsRequireApprovalBundle: true,
      destructiveActionsAllowed: false,
      localOnly: true,
      startupRegistrationIsPerUser: true,
      explorerShellReplacementBlocked: true,
    },
    receipt: {
      hostSnapshotHash: sha256(JSON.stringify(hashInput)),
      localOnly: true,
      hostLaunched: false,
      startupRegistered,
      serviceMutationTaken: false,
      destructiveActionsTaken: false,
      rawCommandLineIncluded: false,
    },
  };
}

function fixtureSources() {
  return [
    ['hostSource', SOURCE_ANCHORS.source, true, true],
    ['shellWorld', SOURCE_ANCHORS.shellWorld, true, true],
    ['shellRender', SOURCE_ANCHORS.shellRender, true, true],
    ['shellHome', SOURCE_ANCHORS.shellHome, true, true],
    ['hardwareControl', SOURCE_ANCHORS.hardwareControl, true, true],
    ['serviceSupervisorSource', SOURCE_ANCHORS.serviceSupervisorSource, true, true],
    ['nativeWrapperSource', SOURCE_ANCHORS.nativeWrapperSource, true, true],
    ['startupIntegrationSource', SOURCE_ANCHORS.startupIntegrationSource, true, true],
    ['previewHost', SOURCE_ANCHORS.previewHost, true, true],
    ['nativeWrapperTarget', SOURCE_ANCHORS.nativeWrapperTarget, false, false],
  ].map(([id, filePath, required, present]) => ({ id, path: filePath, required, present }));
}

function selfTestFixtures() {
  return {
    sources: fixtureSources(),
    refreshResults: [],
    serviceSupervisor: { summary: { status: 'ready', requiredAttentionCount: 0 } },
    controlDaemonService: { summary: { serviceStatus: 'online', loopbackReachable: true, executeEnabled: false } },
    shellObjects: { schemaVersion: 'hololand.holoshell.shell-objects.v0.1.0', summary: { status: 'ready', shellObjectCount: 24, firstScreenObjectCount: 12 } },
    liveFeed: { schemaVersion: 'hololand.holoshell.live-feed.v0.1.0', summary: { overallRisk: 'warn' } },
    sourceValidation: { summary: { status: 'pass', fileCount: 48 } },
    startupIntegration: {
      summary: {
        status: 'registration_adapter_present',
        startupIntegrationPresent: true,
        startupRegistered: false,
      },
    },
  };
}

function assertSelfTest(receipt) {
  const failures = [];
  if (receipt.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (receipt.summary.status !== 'ready_for_native_wrapper') failures.push(`unexpected status ${receipt.summary.status}`);
  if (receipt.summary.sourceReady !== true) failures.push('source should be ready');
  if (receipt.summary.previewHostReady !== true) failures.push('preview host should be ready');
  if (receipt.summary.nativeWrapperPresent !== false) failures.push('native wrapper should be missing in fixture');
  if (receipt.summary.localMutationExecutionEnabled !== false) failures.push('execute must default disabled');
  if (receipt.summary.primarySurfaceOwnership !== 'preview_only') failures.push('fixture should stay preview only');
  if (!receipt.bootPhases.some((phase) => phase.phaseId === 'native_wrapper' && phase.status === 'missing')) failures.push('expected native wrapper missing phase');
  if (receipt.policy.htmlPreviewMayClaimOsReplacement !== false) failures.push('preview must not claim OS replacement');
  if (receipt.policy.appMutationsRequireApprovalBundle !== true) failures.push('app mutations must require approval');
  if (receipt.receipt.hostLaunched !== false) failures.push('self-test must not launch host');
  if (receipt.receipt.destructiveActionsTaken !== false) failures.push('self-test must be non-destructive');
  if (receipt.receipt.rawCommandLineIncluded !== false) failures.push('raw commands must stay hidden');
  if (!receipt.receipt.hostSnapshotHash) failures.push('missing host hash');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs();
  const receipt = createReceipt(args, args.selfTest ? selfTestFixtures() : null);
  if (args.selfTest) assertSelfTest(receipt);
  const output = writeJson(args.output, receipt);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, receipt);
  const downstreamRefreshResults = refreshDownstreamReceipts(args);
  const downstreamFailures = downstreamRefreshResults.filter((result) => !result.ok);
  if (downstreamFailures.length) {
    const detail = downstreamFailures.map((result) => `${result.command}: ${result.stderrTail.join(' ') || result.stdoutTail.join(' ') || 'failed'}`).join('\n');
    throw new Error(`downstream refresh failed after writing Founder host receipt:\n${detail}`);
  }

  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log(`HoloShell Founder host: ${output}`);
    console.log(`HoloShell Founder host browser bootstrap: ${jsOutput}`);
    console.log(`Status: ${receipt.summary.status}`);
    console.log(`Source ready: ${receipt.summary.sourceReady ? 'yes' : 'no'}`);
    console.log(`Preview ready: ${receipt.summary.previewHostReady ? 'yes' : 'no'}`);
    console.log(`Shell objects: ${receipt.summary.shellObjectGraphReady ? 'ready' : 'missing'}`);
    console.log(`Live feed: ${receipt.summary.liveFeedReady ? 'ready' : 'missing'}`);
    console.log(`Native wrapper: ${receipt.summary.nativeWrapperPresent ? 'present' : 'missing'}`);
    console.log(`Next: ${receipt.summary.nextMove}`);
  }
} catch (error) {
  console.error(`holoshell-founder-host failed: ${error.message}`);
  process.exit(1);
}
