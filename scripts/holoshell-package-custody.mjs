#!/usr/bin/env node
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 'hololand.holoshell.package-custody.v0.1.0';
const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'package-custody-latest.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'package-custody-latest.js');
const DEFAULT_RECEIPT_DIR = path.join(DEFAULT_TMP, 'package-custody-receipts');
const DRY_RUN_PACKAGE_MANAGERS = ['winget', 'pnpm', 'npm', 'msi', 'exe'];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    packageId: 'unknown',
    packageName: '',
    manager: 'winget',
    mutation: 'upgrade',
    source: 'unknown',
    publisher: '',
    currentVersion: 'unknown',
    availableVersion: 'unknown',
    installerUrl: '',
    installerHash: '',
    binaryPath: '',
    versionCommand: '',
    verifiedVersion: '',
    adminRequired: false,
    diskStatus: 'unknown',
    networkStatus: '',
    processConflictStatus: '',
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    receiptDir: DEFAULT_RECEIPT_DIR,
    ttlMinutes: 10,
    json: false,
    selfTest: false,
    fromWingetBlenderFixture: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--package-id') args.packageId = argv[++index] || args.packageId;
    else if (arg === '--package-name') args.packageName = argv[++index] || '';
    else if (arg === '--manager') args.manager = argv[++index] || args.manager;
    else if (arg === '--mutation') args.mutation = argv[++index] || args.mutation;
    else if (arg === '--source') args.source = argv[++index] || args.source;
    else if (arg === '--publisher') args.publisher = argv[++index] || '';
    else if (arg === '--current-version') args.currentVersion = argv[++index] || args.currentVersion;
    else if (arg === '--available-version') args.availableVersion = argv[++index] || args.availableVersion;
    else if (arg === '--installer-url') args.installerUrl = argv[++index] || '';
    else if (arg === '--installer-hash') args.installerHash = argv[++index] || '';
    else if (arg === '--binary-path') args.binaryPath = argv[++index] || '';
    else if (arg === '--version-command') args.versionCommand = argv[++index] || '';
    else if (arg === '--verified-version') args.verifiedVersion = argv[++index] || '';
    else if (arg === '--admin-required') args.adminRequired = true;
    else if (arg === '--disk-status') args.diskStatus = argv[++index] || args.diskStatus;
    else if (arg === '--network-status') args.networkStatus = argv[++index] || '';
    else if (arg === '--process-conflict-status') args.processConflictStatus = argv[++index] || '';
    else if (arg === '--output') args.output = argv[++index] || args.output;
    else if (arg === '--js-output') args.jsOutput = argv[++index] || args.jsOutput;
    else if (arg === '--receipt-dir') args.receiptDir = argv[++index] || args.receiptDir;
    else if (arg === '--ttl-minutes') args.ttlMinutes = Number(argv[++index] || args.ttlMinutes);
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--from-winget-blender-fixture') args.fromWingetBlenderFixture = true;
    else if (arg === '--execute') {
      throw new Error('Package mutation execution is intentionally unsupported by this custody wrapper.');
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.selfTest || args.fromWingetBlenderFixture) applyBlenderFixture(args);
  if (!Number.isFinite(args.ttlMinutes) || args.ttlMinutes < 1) args.ttlMinutes = 10;
  args.manager = normalizePackageManager(args.manager);
  if (!args.source || args.source === 'unknown') args.source = defaultSourceForManager(args.manager);
  if (!args.packageName && args.packageId !== 'unknown') args.packageName = args.packageId;
  return args;
}

function printHelp() {
  console.log(`HoloShell package custody

Usage:
  node scripts/holoshell-package-custody.mjs --package-id BlenderFoundation.Blender --package-name Blender --manager winget --mutation upgrade --current-version 5.0.1 --available-version 5.1.1 --source winget --admin-required

Options:
  --mutation <kind>          inventory, install, upgrade, uninstall. Mutations are approval-only.
  --package-id <id>          Stable package id, e.g. BlenderFoundation.Blender.
  --package-name <name>      Human package label.
  --manager <kind>           winget, choco, scoop, brew, apt, npm, pnpm, etc.
  --source <name>            Package source/provider.
  --current-version <text>   Installed/current version anchor.
  --available-version <text> Available/target version anchor.
  --installer-hash <sha256>  Optional installer hash when already known.
  --admin-required           Mark package operation as requiring admin/UAC.
  --from-winget-blender-fixture  Replays the Blender incident as a safe approval fixture.
  --self-test                Write fixture receipt and assert custody invariants.
  --json                     Print receipt JSON.
`);
}

function applyBlenderFixture(args) {
  args.packageId = 'BlenderFoundation.Blender';
  args.packageName = 'Blender';
  args.manager = 'winget';
  args.mutation = 'upgrade';
  args.source = 'winget';
  args.publisher = 'Blender Foundation';
  args.currentVersion = '5.0.1';
  args.availableVersion = '5.1.1';
  args.installerUrl = 'https://download.blender.org/release/';
  args.installerHash = args.installerHash || 'fixture-installer-hash-not-captured-live';
  args.binaryPath = 'C:/Program Files/Blender Foundation/Blender/blender.exe';
  args.versionCommand = 'blender.exe --version';
  args.verifiedVersion = '5.1.1';
  args.adminRequired = true;
  if (args.selfTest) {
    args.output = path.join('.tmp', 'holoshell', 'self-test', 'package-custody-latest.json');
    args.jsOutput = path.join('.tmp', 'holoshell', 'self-test', 'package-custody-latest.js');
    args.receiptDir = path.join('.tmp', 'holoshell', 'self-test', 'package-custody-receipts');
  }
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function publicPath(filePath) {
  return path.relative(REPO_ROOT, resolveRepoPath(filePath)).replace(/\\/g, '/');
}

function readJson(filePath, fallback = null) {
  const resolved = resolveRepoPath(filePath);
  if (!existsSync(resolved)) return fallback;
  return JSON.parse(readFileSync(resolved, 'utf8'));
}

function writeText(filePath, text) {
  const resolved = resolveRepoPath(filePath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const tempPath = `${resolved}.${process.pid}.${Date.now().toString(36)}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tempPath, text, 'utf8');
  renameSync(tempPath, resolved);
  return resolved;
}

function writeJson(filePath, value) {
  return writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeBrowserBootstrap(filePath, value) {
  const payload = JSON.stringify(value, null, 2).replace(/<\/script/gi, '<\\/script');
  return writeText(filePath, `window.HOLOSHELL_PACKAGE_CUSTODY = ${payload};\n`);
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hashValue(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function shortHash(value, length = 12) {
  return hashValue(value).slice(0, length);
}

function normalizePackageManager(manager) {
  const raw = String(manager || 'unknown').trim().toLowerCase();
  if (raw === 'windows-installer') return 'msi';
  if (raw === 'executable' || raw === 'installer-exe') return 'exe';
  return raw || 'unknown';
}

function defaultSourceForManager(manager) {
  if (manager === 'winget') return 'winget';
  if (manager === 'npm' || manager === 'pnpm') return 'npm_registry';
  if (manager === 'msi' || manager === 'exe') return 'local_installer';
  return 'unknown';
}

function shellQuote(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^[A-Za-z0-9@/_:.,+=~^-]+$/.test(text)) return text;
  return JSON.stringify(text);
}

function packageManagerAvailable(args) {
  const manager = normalizePackageManager(args.manager);
  if (manager === 'msi' || manager === 'exe') {
    return Boolean(args.installerHash || args.installerUrl || (args.packageId && args.packageId !== 'unknown'));
  }
  if (manager === 'unknown') return false;
  const probe = process.platform === 'win32' ? 'where.exe' : 'which';
  try {
    execFileSync(probe, [manager], { stdio: 'ignore', timeout: 2500 });
    return true;
  } catch {
    return false;
  }
}

function isAdminSession() {
  if (process.platform !== 'win32') return typeof process.getuid === 'function' ? process.getuid() === 0 : false;
  try {
    execFileSync('net', ['session'], { stdio: 'ignore', timeout: 2500 });
    return true;
  } catch {
    return false;
  }
}

function networkStatus(args) {
  if (args.networkStatus) return args.networkStatus;
  const network = readJson(path.join(DEFAULT_TMP, 'network-reality.json'), null);
  if (!network) return 'unknown';
  const state = network.health?.state || network.summary?.status || '';
  if (state === 'pass' || state === 'ok' || state === 'connected') return 'pass';
  if (state === 'warn' || state === 'metered_or_hotspot') return 'warn';
  if (state === 'fail' || state === 'offline') return 'fail';
  return 'unknown';
}

function processConflictStatus(args) {
  if (args.processConflictStatus) return args.processConflictStatus;
  const processHealth = readJson(path.join(DEFAULT_TMP, 'process-health.json'), null);
  if (!processHealth) return 'unknown';
  const name = String(args.packageName || args.packageId || '').toLowerCase();
  const processes = Array.isArray(processHealth.processes) ? processHealth.processes : [];
  return processes.some((processEntry) => String(processEntry.name || '').toLowerCase().includes(name))
    ? 'warn'
    : 'pass';
}

function mutationStatus(kind) {
  return kind === 'inventory' ? 'inventory_only' : 'approval_required';
}

function commandPreview(args) {
  const manager = normalizePackageManager(args.manager);
  const packageId = shellQuote(args.packageId && args.packageId !== 'unknown' ? args.packageId : args.packageName);
  if (manager === 'winget') {
    const idArg = args.packageId && args.packageId !== 'unknown' ? ` --id ${packageId}` : '';
    if (args.mutation === 'install') return `winget install${idArg} --accept-source-agreements`;
    if (args.mutation === 'upgrade') return `winget upgrade${idArg} --accept-source-agreements`;
    if (args.mutation === 'uninstall') return `winget uninstall${idArg}`;
    return `winget list${idArg}`;
  }
  if (manager === 'pnpm') {
    if (args.mutation === 'install') return `pnpm add ${packageId}`.trim();
    if (args.mutation === 'upgrade') return `pnpm update ${packageId} --latest`.trim();
    if (args.mutation === 'uninstall') return `pnpm remove ${packageId}`.trim();
    return `pnpm view ${packageId} version`.trim();
  }
  if (manager === 'npm') {
    if (args.mutation === 'install') return `npm install ${packageId}`.trim();
    if (args.mutation === 'upgrade') return `npm update ${packageId}`.trim();
    if (args.mutation === 'uninstall') return `npm uninstall ${packageId}`.trim();
    return `npm view ${packageId} version`.trim();
  }
  if (manager === 'msi') {
    const installer = args.installerUrl ? '<msi-installer-from-source>' : '<local-msi-installer>';
    if (args.mutation === 'uninstall') return `msiexec /x ${packageId || '<product-code>'}`;
    return `msiexec /i ${installer}`;
  }
  if (manager === 'exe') {
    const installer = args.installerUrl ? '<exe-installer-from-source>' : '<local-exe-installer>';
    if (args.mutation === 'uninstall') return `${installer} /uninstall`;
    return `${installer} /install`;
  }
  return `${manager} ${args.mutation} ${args.packageId}`.trim();
}

function rollbackLimitsFor(args) {
  const manager = normalizePackageManager(args.manager);
  const common = [
    'Admin/UAC prompts are human gestures and cannot be replayed silently.',
    'HoloShell must verify launch/version after mutation before declaring the tool ready.',
  ];
  if (manager === 'winget') {
    return [
      'winget rollback depends on publisher/source support and usually requires a separate exact-version install plan.',
      ...common,
    ];
  }
  if (manager === 'pnpm' || manager === 'npm') {
    return [
      `${manager} rollback requires the previous package spec and lockfile/package manifest diff to remain available.`,
      'Lifecycle scripts may run during real mutation and must stay behind the native approval gate.',
      ...common,
    ];
  }
  if (manager === 'msi') {
    return [
      'MSI rollback depends on product code, cached installer availability, and Windows Installer repair/uninstall state.',
      ...common,
    ];
  }
  if (manager === 'exe') {
    return [
      'EXE installer rollback is vendor-specific; silent uninstall switches may be absent or unsafe.',
      ...common,
    ];
  }
  return [
    'Package manager rollback behavior is provider-specific and may require a separate downgrade/install plan.',
    ...common,
  ];
}

function buildDryRunAdapterPlan(args, preflight) {
  const manager = normalizePackageManager(args.manager);
  const supported = DRY_RUN_PACKAGE_MANAGERS.includes(manager);
  const command = commandPreview({ ...args, manager });
  const packageIdentity = args.packageId || args.packageName || 'unknown';
  const networkRequired = manager === 'winget' || manager === 'pnpm' || manager === 'npm' || Boolean(args.installerUrl);
  const adapterId = supported ? `${manager}_dry_run_package_plan` : 'generic_dry_run_package_plan';
  return {
    schemaVersion: 'hololand.holoshell.package-manager-dry-run-plan.v0.1.0',
    adapterId,
    supported,
    dryRun: true,
    manager,
    mutationKind: args.mutation,
    packageId: packageIdentity,
    packageName: args.packageName || packageIdentity,
    source: args.source,
    publisher: args.publisher || undefined,
    fromVersion: args.currentVersion,
    toVersion: args.availableVersion,
    commandPreview: command,
    rollbackLimits: rollbackLimitsFor({ ...args, manager }),
    preflight: {
      packageManager: {
        available: preflight.packageManagerAvailable,
        probe: manager === 'msi' || manager === 'exe'
          ? 'installer artifact metadata'
          : `${process.platform === 'win32' ? 'where.exe' : 'which'} ${manager}`,
      },
      network: {
        required: networkRequired,
        status: preflight.networkStatus,
      },
      admin: {
        required: preflight.adminRequired,
        session: preflight.adminSession,
        boundary: preflight.adminRequired ? 'requires_user_uac_boundary' : 'not_required_for_plan',
      },
      process: {
        conflictStatus: preflight.processConflictStatus,
      },
    },
    execution: {
      allowed: false,
      performed: false,
      mode: 'dry_run_plan_only',
      blockedReason: 'Package manager adapters only emit approval receipts; they never execute install, upgrade, or uninstall.',
    },
  };
}

async function validatorForReceipt() {
  const candidates = [
    { name: '@holoscript/framework.validateHoloShellPackageMutationReceipt', specifier: '@holoscript/framework' },
    {
      name: '../HoloScript/packages/framework/dist/index.js.validateHoloShellPackageMutationReceipt',
      specifier: pathToFileURL(path.resolve(REPO_ROOT, '..', 'HoloScript', 'packages', 'framework', 'dist', 'index.js')).href,
    },
  ];
  for (const candidate of candidates) {
    try {
      const framework = await import(candidate.specifier);
      if (typeof framework.validateHoloShellPackageMutationReceipt === 'function') {
        return {
          name: candidate.name,
          validate: framework.validateHoloShellPackageMutationReceipt,
        };
      }
    } catch {
      // HoloLand may run before the local HoloScript package has been rebuilt.
    }
  }
  return {
    name: 'local_fallback_package_mutation_validator',
    validate(receipt) {
      const errors = [];
      if (!receipt.id) errors.push('HoloShellPackageMutationReceipt.id is required.');
      if (!receipt.candidate?.packageId) errors.push('PackageCandidate.packageId is required.');
      if (!receipt.candidate?.source) errors.push('PackageCandidate.source is required.');
      if (receipt.mutationKind !== 'inventory' && receipt.permissionEnvelope !== 'break_glass') {
        errors.push('HoloShellPackageMutationReceipt.permissionEnvelope must be break_glass for package mutations.');
      }
      if (receipt.mutationKind !== 'inventory' && !receipt.approval?.requiresFreshUserGesture) {
        errors.push('Package mutation receipts must require a fresh user gesture.');
      }
      return errors;
    },
  };
}

async function buildReceipt(args) {
  const now = new Date();
  const generatedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + args.ttlMinutes * 60 * 1000).toISOString();
  const mutation = args.mutation === 'install' || args.mutation === 'upgrade' || args.mutation === 'uninstall';
  const packageIdentity = args.packageId || args.packageName || 'unknown';
  const approvalId = `pkg-${Date.now().toString(36)}-${shortHash(packageIdentity, 10)}`;
  const permissionEnvelope = mutation ? 'break_glass' : 'read_only';
  const preflight = {
    adminRequired: Boolean(args.adminRequired),
    adminSession: isAdminSession(),
    diskStatus: args.diskStatus,
    networkStatus: networkStatus(args),
    processConflictStatus: processConflictStatus(args),
    packageManagerAvailable: packageManagerAvailable(args),
  };
  const adapterPlan = buildDryRunAdapterPlan(args, preflight);
  const command = adapterPlan.commandPreview;
  const candidate = {
    packageId: packageIdentity,
    packageName: args.packageName || packageIdentity,
    manager: args.manager,
    source: args.source,
    publisher: args.publisher || undefined,
    currentVersion: args.currentVersion,
    availableVersion: args.availableVersion,
    installerUrl: args.installerUrl || undefined,
    installerHash: args.installerHash || undefined,
    installerHashAlgorithm: args.installerHash ? 'sha256' : undefined,
  };
  const body = {
    schemaVersion: SCHEMA_VERSION,
    id: `package-custody-${shortHash({ generatedAt, packageIdentity, command })}`,
    workflow: 'install-update-tool-custody',
    generatedAt,
    startedAt: generatedAt,
    endedAt: generatedAt,
    mutationKind: args.mutation,
    status: mutationStatus(args.mutation),
    permissionEnvelope,
    candidate,
    preflight,
    adapterPlan,
    approval: {
      approvalId,
      approvalRequired: mutation,
      approvalCaptured: false,
      requiresFreshUserGesture: mutation,
      approvedCommandPreview: mutation ? command : '',
      rollbackLimits: mutation ? adapterPlan.rollbackLimits : ['No package mutation is planned.'],
      expiresAt,
    },
    verification: {
      binaryPath: args.binaryPath || undefined,
      versionCommand: args.versionCommand || undefined,
      versionCommandPassed: false,
      launchVerified: false,
      verifiedVersion: args.verifiedVersion || undefined,
    },
    mutationPerformed: false,
    replayKey: `sha256:${shortHash({ packageIdentity, command, currentVersion: args.currentVersion, availableVersion: args.availableVersion }, 24)}`,
    hash: '',
    hashAlgorithm: 'sha256',
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-package-custody.hsplus',
      adapter: 'scripts/holoshell-package-custody.mjs',
      upstreamValidator: 'packages/framework/src/board/holoshell-package-mutation-receipt.ts',
      priorEvidence: '.bench-logs/holoshell-human-os-frontier/2026-05-19/install-update-safe-wrapper-evidence-pack.md',
    },
    summary: {
      status: mutationStatus(args.mutation),
      packageId: packageIdentity,
      packageName: args.packageName || packageIdentity,
      manager: args.manager,
      source: args.source,
      fromVersion: args.currentVersion,
      toVersion: args.availableVersion,
      permissionEnvelope,
      approvalRequired: mutation,
      approvalId,
      executionAllowed: false,
      mutationPerformed: false,
      adminRequired: Boolean(args.adminRequired),
      adminSession: false,
      packageManagerAvailable: false,
      rollbackLimitCount: mutation ? 3 : 1,
      launchVerified: false,
    },
    output: {
      latestPath: publicPath(args.output),
      jsPath: publicPath(args.jsOutput),
      receiptDir: publicPath(args.receiptDir),
    },
    verificationCommands: [
      'node scripts/holoshell-package-custody.mjs --self-test',
      'node scripts/__tests__/holoshell-package-custody-adapters.test.mjs',
    ],
    provenance: [
      'experiments/holoshell-human-os-frontier/install-update-tool-policy.hsplus',
      'experiments/holoshell-human-os-frontier/install-update-tool-pipeline.hs',
    ],
    metadata: {
      deterministic: true,
      wrapperMode: 'approval_packet_only',
      liveMutationExecutionSupported: false,
      commandPreview: command,
      dryRunAdapterId: adapterPlan.adapterId,
      host: { platform: os.platform(), release: os.release(), hostname: os.hostname() },
    },
  };
  body.summary.adminSession = body.preflight.adminSession;
  body.summary.packageManagerAvailable = body.preflight.packageManagerAvailable;
  body.hash = hashValue({ ...body, hash: '' });

  const validator = await validatorForReceipt();
  const errors = validator.validate(body);
  body.schemaContract = {
    validator: validator.name,
    status: errors.length ? 'invalid' : 'valid',
    errors,
  };
  if (errors.length) body.summary.status = 'blocked';
  return body;
}

function assertSelfTest(receipt) {
  const failures = [];
  if (receipt.schemaContract.status !== 'valid') failures.push(`validator failed: ${receipt.schemaContract.errors.join('; ')}`);
  if (receipt.summary.status !== 'approval_required') failures.push('expected approval_required status');
  if (receipt.summary.executionAllowed) failures.push('expected execution to stay blocked');
  if (receipt.summary.mutationPerformed) failures.push('expected no package mutation');
  if (receipt.permissionEnvelope !== 'break_glass') failures.push('expected break_glass package mutation envelope');
  if (!receipt.approval.rollbackLimits.length) failures.push('expected visible rollback limits');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs();
  const receipt = await buildReceipt(args);
  const output = writeJson(args.output, receipt);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, receipt);
  const receiptPath = writeJson(path.join(args.receiptDir, `${receipt.id}.json`), receipt);
  if (args.selfTest) assertSelfTest(receipt);

  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    console.log(`HoloShell package custody: ${output}`);
    console.log(`HoloShell package custody bootstrap: ${jsOutput}`);
    console.log(`HoloShell package custody receipt: ${receiptPath}`);
    console.log(`Status: ${receipt.summary.status}`);
    console.log(`Package: ${receipt.summary.packageName} ${receipt.summary.fromVersion} -> ${receipt.summary.toVersion}`);
    console.log(`Permission: ${receipt.summary.permissionEnvelope}`);
    console.log(`Execution allowed: ${receipt.summary.executionAllowed}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
