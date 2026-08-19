#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SCHEMA_VERSION = 'hololand.holoshell.startup-integration.v0.1.0';
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_STARTUP_NAME = 'HoloShell Founder Host';

const SOURCE_ANCHORS = {
  source: 'apps/holoshell/source/holoshell-startup-integration.hsplus',
  nativeWrapperSource: 'apps/holoshell/source/holoshell-native-wrapper.hsplus',
  founderHostSource: 'apps/holoshell/source/holoshell-founder-host.hsplus',
  adapter: 'scripts/holoshell-startup-integration.mjs',
  registrationScript: 'apps/holoshell/native/windows/Register-HoloShellStartup.ps1',
  nativeLauncher: 'apps/holoshell/native/windows/Start-HoloShellFounderHost.ps1',
  nativeCommandShim: 'apps/holoshell/native/windows/Start-HoloShellFounderHost.cmd',
  startupRegistrationReceipt: '.tmp/holoshell/startup-registration.json',
  wrapperReceipt: '.tmp/holoshell/native-wrapper.json',
  founderHostReceipt: '.tmp/holoshell/founder-host.json',
};

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    tmpDir: DEFAULT_TMP,
    output: null,
    jsOutput: null,
    startupName: DEFAULT_STARTUP_NAME,
    json: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--tmp-dir') args.tmpDir = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--startup-name') args.startupName = argv[++index];
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
  args.output ||= path.join(args.tmpDir, 'startup-integration.json');
  args.jsOutput ||= path.join(args.tmpDir, 'startup-integration.js');
  return args;
}

function printHelp() {
  console.log(`HoloShell startup integration receipt

Usage:
  node scripts/holoshell-startup-integration.mjs [options]

Options:
  --json                    Print the startup integration receipt.
  --tmp-dir <path>          Receipt directory. Defaults to .tmp/holoshell.
  --output <path>           Receipt JSON path. Defaults to <tmp-dir>/startup-integration.json.
  --js-output <path>        Browser bootstrap path. Defaults to <tmp-dir>/startup-integration.js.
  --startup-name <name>     Startup shortcut name. Defaults to "HoloShell Founder Host".
  --self-test               Use fixtures and assert invariants.
  -h, --help                Show this help.
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
  writeFileSync(resolved, `window.HOLOSHELL_STARTUP_INTEGRATION = ${payload};\n`, 'utf8');
  return resolved;
}

function sha256(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function sourceManifest(fixtures = null) {
  if (fixtures?.sources) return fixtures.sources;
  const entries = [
    ['startupSource', SOURCE_ANCHORS.source, true],
    ['nativeWrapperSource', SOURCE_ANCHORS.nativeWrapperSource, true],
    ['founderHostSource', SOURCE_ANCHORS.founderHostSource, true],
    ['adapter', SOURCE_ANCHORS.adapter, true],
    ['registrationScript', SOURCE_ANCHORS.registrationScript, true],
    ['nativeLauncher', SOURCE_ANCHORS.nativeLauncher, true],
    ['nativeCommandShim', SOURCE_ANCHORS.nativeCommandShim, true],
  ];

  return entries.map(([id, filePath, required]) => ({
    id,
    path: filePath,
    required,
    present: existsSync(resolveRepoPath(filePath)),
  }));
}

function safeShortcutName(name) {
  const cleaned = String(name || DEFAULT_STARTUP_NAME).replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').trim();
  return `${cleaned || DEFAULT_STARTUP_NAME}.lnk`;
}

function userStartupShortcut(args, fixtures = null) {
  if (fixtures?.startup) return fixtures.startup;
  const startupFolder = process.env.APPDATA
    ? path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
    : '';
  const shortcutName = safeShortcutName(args.startupName);
  const shortcutPath = startupFolder ? path.join(startupFolder, shortcutName) : '';
  return {
    platform: process.platform,
    startupFolderReachable: Boolean(startupFolder && existsSync(startupFolder)),
    shortcutName,
    shortcutPathHash: shortcutPath ? sha256(shortcutPath) : '',
    shortcutPresent: Boolean(shortcutPath && existsSync(shortcutPath)),
  };
}

function statusFrom({ sourceReady, integrationPresent, shortcutPresent, startupFolderReachable }) {
  if (!sourceReady || !integrationPresent) return 'blocked_missing_source';
  if (!startupFolderReachable && process.platform === 'win32') return 'startup_folder_unavailable';
  if (shortcutPresent) return 'registered_at_user_login';
  return 'registration_adapter_present';
}

function createReceipt(args, fixtures = null) {
  const generatedAt = new Date().toISOString();
  const sources = sourceManifest(fixtures);
  const startup = userStartupShortcut(args, fixtures);
  const registration = fixtures?.registration || readJson(path.join(args.tmpDir, 'startup-registration.json'), {});
  const requiredSources = sources.filter((source) => source.required);
  const sourceReady = requiredSources.every((source) => source.present);
  const registrationScriptPresent = sources.some((source) => source.id === 'registrationScript' && source.present);
  const nativeLauncherPresent = sources.some((source) => source.id === 'nativeLauncher' && source.present);
  const startupIntegrationPresent = sourceReady && registrationScriptPresent && nativeLauncherPresent;
  const startupRegistered = Boolean(startup.shortcutPresent || registration?.summary?.startupRegistered);
  const status = statusFrom({
    sourceReady,
    integrationPresent: startupIntegrationPresent,
    shortcutPresent: startupRegistered,
    startupFolderReachable: startup.startupFolderReachable,
  });
  const nextMove = !startupIntegrationPresent
    ? 'repair_startup_adapter'
    : startupRegistered
      ? 'observe_login_startup_receipt'
      : 'render_startup_approval_card';
  const hashInput = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    status,
    sourceReady,
    startupIntegrationPresent,
    registrationScriptPresent,
    nativeLauncherPresent,
    startupFolderReachable: startup.startupFolderReachable,
    startupRegistered,
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
      startupIntegrationPresent,
      registrationScriptPresent,
      nativeLauncherPresent,
      startupMode: 'windows_user_startup_shortcut',
      startupFolderKind: 'current_user_startup',
      startupFolderReachable: startup.startupFolderReachable,
      startupRegistered,
      shortcutPresent: startupRegistered,
      shortcutName: startup.shortcutName,
      shortcutPathHash: startup.shortcutPathHash,
      approvalRequired: true,
      approvalSupplied: false,
      localMutationExecutionEnabled: false,
      primarySurfaceOwnership: 'login_start_candidate',
      nextMove,
    },
    sources,
    approval: {
      channel: 'holoshell:startup-integration',
      registerCommandPreview: 'apps/holoshell/native/windows/Register-HoloShellStartup.ps1 -Register -Approve',
      unregisterCommandPreview: 'apps/holoshell/native/windows/Register-HoloShellStartup.ps1 -Unregister -Approve',
      planCommandPreview: 'apps/holoshell/native/windows/Register-HoloShellStartup.ps1',
      requiresHumanVisibleApproval: true,
      approvalNonceRequired: true,
    },
    policy: {
      localOnly: true,
      perUserStartupOnly: true,
      machineWideStartupBlocked: true,
      explorerShellReplacementBlocked: true,
      registrationRequiresExplicitApproval: true,
      appModeLauncherOnly: true,
      unregisterIsAvailable: true,
      destructiveActionsAllowed: false,
      rawLocalPathDisclosureBlocked: true,
    },
    receipt: {
      startupIntegrationHash: sha256(JSON.stringify(hashInput)),
      registrationPerformed: false,
      startupRegistered,
      serviceMutationTaken: false,
      destructiveActionsTaken: false,
      rawCommandLineIncluded: false,
      rawStartupPathIncluded: false,
    },
  };
}

function selfTestFixtures() {
  return {
    sources: [
      ['startupSource', SOURCE_ANCHORS.source, true, true],
      ['nativeWrapperSource', SOURCE_ANCHORS.nativeWrapperSource, true, true],
      ['founderHostSource', SOURCE_ANCHORS.founderHostSource, true, true],
      ['adapter', SOURCE_ANCHORS.adapter, true, true],
      ['registrationScript', SOURCE_ANCHORS.registrationScript, true, true],
      ['nativeLauncher', SOURCE_ANCHORS.nativeLauncher, true, true],
      ['nativeCommandShim', SOURCE_ANCHORS.nativeCommandShim, true, true],
    ].map(([id, filePath, required, present]) => ({ id, path: filePath, required, present })),
    startup: {
      platform: 'win32',
      startupFolderReachable: true,
      shortcutName: 'HoloShell Founder Host.lnk',
      shortcutPathHash: 'fixture-startup-path-hash',
      shortcutPresent: false,
    },
    registration: {},
  };
}

function assertSelfTest(receipt) {
  const failures = [];
  if (receipt.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (receipt.summary.status !== 'registration_adapter_present') failures.push(`unexpected status ${receipt.summary.status}`);
  if (receipt.summary.startupIntegrationPresent !== true) failures.push('startup integration should be present');
  if (receipt.summary.registrationScriptPresent !== true) failures.push('registration script should be present');
  if (receipt.summary.nativeLauncherPresent !== true) failures.push('native launcher should be present');
  if (receipt.summary.startupRegistered !== false) failures.push('self-test should not be registered');
  if (receipt.summary.approvalRequired !== true) failures.push('approval should be required');
  if (receipt.summary.localMutationExecutionEnabled !== false) failures.push('execute must default disabled');
  if (receipt.policy.explorerShellReplacementBlocked !== true) failures.push('Explorer replacement must be blocked');
  if (receipt.policy.registrationRequiresExplicitApproval !== true) failures.push('registration must require approval');
  if (receipt.receipt.registrationPerformed !== false) failures.push('self-test must not register');
  if (receipt.receipt.destructiveActionsTaken !== false) failures.push('self-test must be non-destructive');
  if (receipt.receipt.rawStartupPathIncluded !== false) failures.push('raw startup path must stay hidden');
  if (!receipt.receipt.startupIntegrationHash) failures.push('missing startup integration hash');
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
    console.log(`HoloShell startup integration: ${output}`);
    console.log(`HoloShell startup integration browser bootstrap: ${jsOutput}`);
    console.log(`Status: ${receipt.summary.status}`);
    console.log(`Integration: ${receipt.summary.startupIntegrationPresent ? 'present' : 'missing'}`);
    console.log(`Startup registered: ${receipt.summary.startupRegistered ? 'yes' : 'no'}`);
    console.log(`Approval required: ${receipt.summary.approvalRequired ? 'yes' : 'no'}`);
    console.log(`Next: ${receipt.summary.nextMove}`);
  }
} catch (error) {
  console.error(`holoshell-startup-integration failed: ${error.message}`);
  process.exit(1);
}
