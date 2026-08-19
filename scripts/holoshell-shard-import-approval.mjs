#!/usr/bin/env node
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SCHEMA_VERSION = 'hololand.holoshell.asset-shard-import-approval.v0.1.0';
const IMPORT_SCHEMA_VERSION = 'hololand.holoshell.asset-shard-import-receipt.v0.1.0';
const WORKFLOW_SCHEMA_VERSION = 'hololand.holoshell.asset-shard-workflow.v0.1.0';
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_WORKFLOW = path.join(DEFAULT_TMP, 'shard-workflow-latest.json');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'shard-import-approval-latest.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'shard-import-approval-latest.js');
const DEFAULT_BUNDLE_DIR = path.join(DEFAULT_TMP, 'shard-import-approval-bundles');
const DEFAULT_IMPORT_DIR = path.join(DEFAULT_TMP, 'imported-shards');
const DEFAULT_IMPORT_OUTPUT = path.join(DEFAULT_TMP, 'shard-import-latest.json');
const DEFAULT_IMPORT_JS_OUTPUT = path.join(DEFAULT_TMP, 'shard-import-latest.js');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    workflow: DEFAULT_WORKFLOW,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    bundleDir: DEFAULT_BUNDLE_DIR,
    importDir: DEFAULT_IMPORT_DIR,
    importOutput: DEFAULT_IMPORT_OUTPUT,
    importJsOutput: DEFAULT_IMPORT_JS_OUTPUT,
    ttlMinutes: 10,
    approvalBundle: '',
    approvalId: '',
    approvalNonce: '',
    confirm: '',
    execute: false,
    json: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--workflow') args.workflow = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--bundle-dir') args.bundleDir = argv[++index];
    else if (arg === '--import-dir') args.importDir = argv[++index];
    else if (arg === '--import-output') args.importOutput = argv[++index];
    else if (arg === '--import-js-output') args.importJsOutput = argv[++index];
    else if (arg === '--ttl-minutes') args.ttlMinutes = Number(argv[++index] || args.ttlMinutes);
    else if (arg === '--approval-bundle') args.approvalBundle = argv[++index] || '';
    else if (arg === '--approval-id') args.approvalId = argv[++index] || '';
    else if (arg === '--approval-nonce') args.approvalNonce = argv[++index] || '';
    else if (arg === '--confirm') args.confirm = argv[++index] || '';
    else if (arg === '--execute') args.execute = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(args.ttlMinutes) || args.ttlMinutes < 1) args.ttlMinutes = 10;
  return args;
}

function printHelp() {
  console.log(`HoloShell asset shard import approval

Usage:
  node scripts/holoshell-shard-import-approval.mjs [options]

Options:
  --workflow <path>          Asset shard workflow receipt. Default: ${DEFAULT_WORKFLOW}
  --output <path>            Latest approval bundle. Default: ${DEFAULT_OUTPUT}
  --js-output <path>         Browser bootstrap JS. Default: ${DEFAULT_JS_OUTPUT}
  --bundle-dir <path>        Archive approval bundles. Default: ${DEFAULT_BUNDLE_DIR}
  --import-dir <path>        Runtime-local imported shard dir. Default: ${DEFAULT_IMPORT_DIR}
  --import-output <path>     Latest import receipt. Default: ${DEFAULT_IMPORT_OUTPUT}
  --import-js-output <path>  Import receipt browser bootstrap JS. Default: ${DEFAULT_IMPORT_JS_OUTPUT}
  --ttl-minutes <n>          Approval expiry. Default: 10
  --execute                  Execute a nonce-approved local import.
  --approval-bundle <path>   Approval bundle used for execution.
  --approval-id <id>         Approval id used for execution.
  --approval-nonce <nonce>   Approval nonce used for execution.
  --confirm import           Required execute confirmation.
  --self-test                Run fixture assertions.
  --json                     Print JSON.
  -h, --help                 Show this help.
`);
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
  writeFileSync(resolved, text, 'utf8');
  return resolved;
}

function writeJson(filePath, value) {
  return writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeBrowserBootstrap(filePath, globalName, value) {
  const payload = JSON.stringify(value, null, 2).replace(/<\/script/gi, '<\\/script');
  return writeText(filePath, `window.${globalName} = ${payload};\n`);
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

function slug(value, fallback = 'shard') {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || fallback;
}

function shellArg(value) {
  const text = String(value ?? '');
  if (/^[A-Za-z0-9_./:=@\\-]+$/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

const COMMAND_PREVIEW_PATH_FLAGS = new Map([
  ['--approval-bundle', 'approval-bundle'],
  ['--import-dir', 'import-dir'],
  ['--import-output', 'import-receipt'],
  ['--import-js-output', 'import-bootstrap'],
]);

function redactedPreviewToken(command, index) {
  const previous = command[index - 1];
  const alias = COMMAND_PREVIEW_PATH_FLAGS.get(previous);
  if (alias) return `<artifact:${alias}>`;
  return command[index];
}

function commandPreview(command) {
  return command.map((token, index) => shellArg(redactedPreviewToken(command, index))).join(' ');
}

function escapeHoloString(value) {
  return String(value ?? '').replace(/[^\x20-\x7e]/g, '').replace(/\\/g, '/').replace(/"/g, '\\"');
}

function fixtureWorkflow() {
  return {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    workflowId: 'asset-shard-fixture',
    title: 'Asset Folder to Playable Shard',
    source: {
      assetFolderName: 'fixture-assets',
      assetFolderFingerprint: 'fixture-folder',
      privacyClass: 'local_private',
    },
    summary: {
      status: 'staged',
      assetCount: 3,
      modelCount: 1,
      imageCount: 1,
      audioCount: 1,
      sourceCount: 0,
      unknownCount: 0,
      blockedAssetCount: 0,
      previewObjectCount: 3,
      approvalRequired: true,
      pendingApprovalCount: 1,
      mutationExecuted: false,
      nextWorkflow: 'review_preview_then_approve_import_into_hololand_world',
    },
    shardPlan: {
      shardId: 'shard.fixture-assets.demo',
      worldName: 'fixture-assets Shard',
      targetRuntime: 'HoloLand playable shard',
      sourceMode: 'local_folder_proxy',
      importMode: 'guarded_execute_after_preview',
      assets: [
        { id: 'asset.model', name: 'platform.glb', relativePath: 'models/platform.glb', kind: 'model', sizeBytes: 12, hashSha256: 'hash-model', hashStatus: 'complete', blocked: false },
        { id: 'asset.image', name: 'skin.png', relativePath: 'textures/skin.png', kind: 'image', sizeBytes: 12, hashSha256: 'hash-image', hashStatus: 'complete', blocked: false },
        { id: 'asset.audio', name: 'loop.ogg', relativePath: 'audio/loop.ogg', kind: 'audio', sizeBytes: 12, hashSha256: 'hash-audio', hashStatus: 'complete', blocked: false },
      ],
    },
    output: {
      latestPath: DEFAULT_WORKFLOW.replace(/\\/g, '/'),
      previewSourcePath: path.join(DEFAULT_TMP, 'fixture-shard-preview.holo').replace(/\\/g, '/'),
      privateReceiptPath: path.join(DEFAULT_TMP, 'shard-receipts', 'fixture-private.json').replace(/\\/g, '/'),
    },
    rollback: {
      sourceAssetsMutated: false,
      generatedTmpPaths: [],
    },
  };
}

function approvalStatusFor(workflow) {
  if (!workflow) return { status: 'empty', allowed: false, blockedReason: 'No asset shard workflow receipt was available.' };
  if (workflow.schemaVersion !== WORKFLOW_SCHEMA_VERSION) return { status: 'blocked', allowed: false, blockedReason: 'Workflow schema mismatch.' };
  if (workflow.summary?.status !== 'staged') return { status: 'blocked', allowed: false, blockedReason: `Workflow status is ${workflow.summary?.status || 'unknown'}.` };
  if (!workflow.summary?.approvalRequired) return { status: 'not_required', allowed: false, blockedReason: 'Workflow does not require import approval.' };
  if (workflow.summary?.mutationExecuted) return { status: 'blocked', allowed: false, blockedReason: 'Workflow already recorded a mutation.' };
  if (Number(workflow.summary?.blockedAssetCount || 0) > 0) return { status: 'blocked', allowed: false, blockedReason: 'Workflow contains blocked assets.' };
  if (!workflow.shardPlan?.shardId) return { status: 'blocked', allowed: false, blockedReason: 'Workflow is missing a shard id.' };
  return { status: 'pending_user_approval', allowed: true, blockedReason: '' };
}

function executeCommand(args, approvalId, nonce, bundlePath) {
  return [
    'node',
    'scripts\\holoshell-shard-import-approval.mjs',
    '--execute',
    '--approval-bundle',
    bundlePath,
    '--approval-id',
    approvalId,
    '--approval-nonce',
    nonce,
    '--confirm',
    'import',
    '--import-dir',
    args.importDir,
    '--import-output',
    args.importOutput,
    '--import-js-output',
    args.importJsOutput,
  ];
}

function buildBundle(args, workflowOverride = null) {
  const now = new Date();
  const generatedAt = now.toISOString();
  const workflow = workflowOverride || readJson(args.workflow, null);
  const gate = approvalStatusFor(workflow);
  const workflowHash = workflow ? hashValue(workflow) : '';
  const approvalId = `hsia-${Date.now().toString(36)}-${shortHash(workflow?.workflowId || workflowHash || 'empty', 10)}`;
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(now.getTime() + args.ttlMinutes * 60 * 1000).toISOString();
  const bundlePath = resolveRepoPath(path.join(args.bundleDir, `${approvalId}.json`));
  const command = gate.allowed ? executeCommand(args, approvalId, nonce, publicPath(bundlePath)) : [];

  return {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    approvalId,
    nonce,
    status: gate.status,
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-asset-shard-workflow.hsplus',
      adapter: 'scripts/holoshell-shard-import-approval.mjs',
      workflowReceipt: workflow?.output?.latestPath || publicPath(args.workflow),
      previewSource: workflow?.output?.previewSourcePath || '',
      privateReceipt: workflow?.output?.privateReceiptPath || '',
    },
    host: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      hostname: os.hostname(),
    },
    sourceWorkflow: workflow ? {
      workflowId: workflow.workflowId || '',
      title: workflow.title || 'Asset Folder to Playable Shard',
      status: workflow.summary?.status || 'unknown',
      shardId: workflow.shardPlan?.shardId || '',
      worldName: workflow.shardPlan?.worldName || '',
      assetCount: workflow.summary?.assetCount || 0,
      modelCount: workflow.summary?.modelCount || 0,
      imageCount: workflow.summary?.imageCount || 0,
      audioCount: workflow.summary?.audioCount || 0,
      blockedAssetCount: workflow.summary?.blockedAssetCount || 0,
      mutationExecuted: Boolean(workflow.summary?.mutationExecuted),
    } : {},
    approval: {
      approvalRequired: gate.allowed,
      requiresFreshUserGesture: true,
      expiresAt,
      ttlMinutes: args.ttlMinutes,
      approvalText: `Approve local import for ${workflow?.shardPlan?.worldName || workflow?.shardPlan?.shardId || 'asset shard'}`,
      risk: 'creates a runtime-local HoloLand shard manifest and .holo source under .tmp; source assets are not copied, deleted, or overwritten',
      rollback: 'delete generated files listed in the import receipt rollback block',
    },
    execution: {
      allowed: gate.allowed,
      command,
      commandPreview: commandPreview(command),
      blockedReason: gate.blockedReason,
    },
    witness: {
      workflowHash,
      secretsCaptured: false,
      sourceAssetsMutated: false,
    },
    summary: {
      status: gate.status,
      workflowId: workflow?.workflowId || '',
      shardId: workflow?.shardPlan?.shardId || '',
      pendingApprovalCount: gate.allowed ? 1 : 0,
      executionAllowed: gate.allowed,
      expiresAt,
      assetCount: workflow?.summary?.assetCount || 0,
      blockedAssetCount: workflow?.summary?.blockedAssetCount || 0,
      sourceAssetsMutated: false,
      runtimeMutationExecuted: false,
    },
  };
}

function writeApprovalOutputs(args, bundle) {
  const bundlePath = bundle.approvalId && bundle.status !== 'empty'
    ? path.join(resolveRepoPath(args.bundleDir), `${bundle.approvalId}.json`)
    : null;
  const withOutput = {
    ...bundle,
    output: {
      latestPath: publicPath(args.output),
      bundlePath: bundlePath ? publicPath(bundlePath) : '',
      browserBootstrap: publicPath(args.jsOutput),
    },
  };
  if (bundlePath) writeJson(bundlePath, withOutput);
  writeJson(args.output, withOutput);
  writeBrowserBootstrap(args.jsOutput, 'HOLOSHELL_SHARD_IMPORT_APPROVAL', withOutput);
  ensureImportPlaceholder(args, withOutput);
  return withOutput;
}

function ensureImportPlaceholder(args, bundle) {
  const importOutput = resolveRepoPath(args.importOutput);
  const existing = readJson(importOutput, null);
  if (existing?.summary?.status && existing.summary.status !== 'not_run') return;
  const placeholder = {
    schemaVersion: IMPORT_SCHEMA_VERSION,
    generatedAt: bundle.generatedAt,
    importId: '',
    approval: {
      approvalId: bundle.approvalId || '',
      nonceBound: Boolean(bundle.nonce),
      workflowHash: bundle.witness?.workflowHash || '',
    },
    summary: {
      status: 'not_run',
      shardId: bundle.summary?.shardId || '',
      assetCount: bundle.summary?.assetCount || 0,
      modelCount: 0,
      imageCount: 0,
      audioCount: 0,
      runtimeMutationExecuted: false,
      sourceAssetsMutated: false,
    },
    output: {
      manifestPath: '',
      shardSourcePath: '',
      receiptPath: '',
      latestPath: publicPath(args.importOutput),
      browserBootstrap: publicPath(args.importJsOutput),
    },
    rollback: {
      sourceAssetsMutated: false,
      generatedTmpPaths: [],
      instructions: 'No import has executed.',
    },
  };
  writeJson(args.importOutput, placeholder);
  writeBrowserBootstrap(args.importJsOutput, 'HOLOSHELL_SHARD_IMPORT', placeholder);
}

function meshForKind(kind) {
  if (kind === 'model') return 'cube';
  if (kind === 'image') return 'plane';
  if (kind === 'audio') return 'torus';
  if (kind === 'media') return 'plane';
  if (kind === 'source') return 'crystal';
  return 'sphere';
}

function colorForKind(kind) {
  if (kind === 'model') return '#72f0d3';
  if (kind === 'image') return '#64a6ff';
  if (kind === 'audio') return '#ffd66e';
  if (kind === 'media') return '#ff8870';
  if (kind === 'source') return '#9cff8f';
  return '#a8a0ff';
}

function makeImportedShardSource(workflow, manifestPath) {
  const assets = (workflow.shardPlan?.assets || []).filter((asset) => !asset.blocked).slice(0, 80);
  const objects = assets.map((asset, index) => {
    const column = index % 8;
    const row = Math.floor(index / 8);
    const x = ((column - 3.5) * 0.62).toFixed(2);
    const y = (1.65 - row * 0.36).toFixed(2);
    const z = (-2.6 - row * 0.05).toFixed(2);
    return `    object "ShardAsset_${String(index + 1).padStart(2, '0')}" using "ImportedShardAsset" {
      label: "${escapeHoloString(asset.name)}"
      asset_kind: "${escapeHoloString(asset.kind)}"
      source_ref: "${escapeHoloString(asset.relativePath)}"
      mesh: "${meshForKind(asset.kind)}"
      color: "${colorForKind(asset.kind)}"
      position: [${x}, ${y}, ${z}]
    }`;
  }).join('\n\n');

  return `// Generated by scripts/holoshell-shard-import-approval.mjs
// Runtime-local import source. Source assets remain read-only.

composition "Imported HoloLand Asset Shard" {
  metadata {
    title: "${escapeHoloString(workflow.shardPlan?.worldName || 'Imported Asset Shard')}"
    shard_id: "${escapeHoloString(workflow.shardPlan?.shardId || '')}"
    manifest: "${escapeHoloString(manifestPath)}"
    source_contract: "apps/holoshell/source/holoshell-asset-shard-workflow.hsplus"
  }

  environment {
    theme: "holo_os_liquid"
    render_mode: "desktop_spatial"
    skybox: "imported_asset_shard"
    ambient_light: 0.55
    receipt_underlay: true
  }

  template "ImportedShardAsset" {
    type: "asset_proxy"
    mesh: "sphere"
    material: "hologram"
    radius: 0.22
    source_mutation_allowed: false
    receipt_required: true
  }

  object "ImportedShardRoot" {
    type: "playable_shard_root"
    label: "${escapeHoloString(workflow.shardPlan?.worldName || 'Asset Shard')}"
    mesh: "platform"
    material: "liquid_glass"
    color: "#0abed9"
    position: [0, 1.0, -2.7]
    scale: [5.4, 0.08, 3.0]
  }

  spatial_group "ImportedShardAssets" {
${objects || '    object "ImportedShardEmpty" using "ImportedShardAsset" {\n      label: "No imported assets"\n      asset_kind: "empty"\n      source_ref: ""\n      position: [0, 1.65, -2.6]\n    }'}
  }
}
`;
}

function loadApprovedWorkflow(args) {
  if (!args.approvalBundle) throw new Error('--approval-bundle is required for --execute.');
  const bundle = readJson(args.approvalBundle, null);
  if (!bundle) throw new Error('Approval bundle was not found.');
  if (bundle.schemaVersion !== SCHEMA_VERSION) throw new Error('Approval bundle schema mismatch.');
  if (!args.approvalId || bundle.approvalId !== args.approvalId) throw new Error('Approval id mismatch.');
  if (!args.approvalNonce || bundle.nonce !== args.approvalNonce) throw new Error('Approval nonce mismatch.');
  if (args.confirm !== 'import') throw new Error('--confirm import is required.');
  if (bundle.approval?.expiresAt && Date.parse(bundle.approval.expiresAt) <= Date.now()) throw new Error('Approval bundle has expired.');
  if (!bundle.execution?.allowed) throw new Error(bundle.execution?.blockedReason || 'Approval does not allow execution.');
  const workflowPath = bundle.sourceAnchors?.workflowReceipt || args.workflow;
  const workflow = readJson(workflowPath, null);
  if (!workflow) throw new Error('Approved workflow receipt was not found.');
  if (hashValue(workflow) !== bundle.witness?.workflowHash) throw new Error('Workflow hash mismatch.');
  return { bundle, workflow };
}

function executeImport(args) {
  const { bundle, workflow } = loadApprovedWorkflow(args);
  const generatedAt = new Date().toISOString();
  const shardId = workflow.shardPlan?.shardId || bundle.summary?.shardId || 'shard.local';
  const safeShard = slug(shardId, 'shard');
  const shardDir = resolveRepoPath(path.join(args.importDir, safeShard));
  const manifestPath = path.join(shardDir, 'manifest.json');
  const shardSourcePath = path.join(shardDir, 'shard.holo');
  const receiptPath = path.join(shardDir, 'import-receipt.json');
  const assetCount = Number(workflow.summary?.assetCount || 0);
  const manifest = {
    schemaVersion: 'hololand.holoshell.imported-shard-manifest.v0.1.0',
    generatedAt,
    shardId,
    worldName: workflow.shardPlan?.worldName || shardId,
    sourceWorkflowId: workflow.workflowId || '',
    sourceMode: workflow.shardPlan?.sourceMode || 'local_folder_proxy',
    privacyClass: 'local_private',
    sourceAssetsMutated: false,
    assets: (workflow.shardPlan?.assets || []).map((asset) => ({
      id: asset.id,
      name: asset.name,
      relativePath: asset.relativePath,
      kind: asset.kind,
      sizeBytes: asset.sizeBytes,
      hashSha256: asset.hashSha256,
      hashStatus: asset.hashStatus,
      blocked: Boolean(asset.blocked),
    })),
  };
  const shardSource = makeImportedShardSource(workflow, publicPath(manifestPath));
  writeJson(manifestPath, manifest);
  writeText(shardSourcePath, shardSource);

  const receipt = {
    schemaVersion: IMPORT_SCHEMA_VERSION,
    generatedAt,
    importId: `hsir-${Date.now().toString(36)}-${shortHash(shardId, 10)}`,
    approval: {
      approvalId: bundle.approvalId,
      nonceBound: true,
      workflowHash: bundle.witness?.workflowHash || '',
    },
    summary: {
      status: 'completed',
      shardId,
      assetCount,
      modelCount: workflow.summary?.modelCount || 0,
      imageCount: workflow.summary?.imageCount || 0,
      audioCount: workflow.summary?.audioCount || 0,
      runtimeMutationExecuted: true,
      sourceAssetsMutated: false,
    },
    output: {
      manifestPath: publicPath(manifestPath),
      shardSourcePath: publicPath(shardSourcePath),
      receiptPath: publicPath(receiptPath),
      latestPath: publicPath(args.importOutput),
      browserBootstrap: publicPath(args.importJsOutput),
    },
    rollback: {
      sourceAssetsMutated: false,
      generatedTmpPaths: [
        publicPath(manifestPath),
        publicPath(shardSourcePath),
        publicPath(receiptPath),
        publicPath(args.importOutput),
        publicPath(args.importJsOutput),
      ],
      instructions: 'Delete generated imported-shard files under .tmp/holoshell/imported-shards. Source assets were read only.',
    },
  };
  writeJson(receiptPath, receipt);
  writeJson(args.importOutput, receipt);
  writeBrowserBootstrap(args.importJsOutput, 'HOLOSHELL_SHARD_IMPORT', receipt);
  return receipt;
}

function assertApprovalBundle(bundle) {
  const failures = [];
  if (bundle.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (bundle.summary.status !== 'pending_user_approval') failures.push('expected pending approval');
  if (!bundle.summary.executionAllowed) failures.push('expected executable approval');
  if (!bundle.execution.commandPreview.includes('--approval-nonce')) failures.push('expected nonce-bound command');
  if (bundle.witness.secretsCaptured) failures.push('must not capture secrets');
  if (bundle.witness.sourceAssetsMutated) failures.push('approval must not mutate source assets');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

function assertImportReceipt(receipt) {
  const failures = [];
  if (receipt.schemaVersion !== IMPORT_SCHEMA_VERSION) failures.push('import schema mismatch');
  if (receipt.summary.status !== 'completed') failures.push('expected completed import');
  if (!receipt.summary.runtimeMutationExecuted) failures.push('expected runtime mutation receipt');
  if (receipt.summary.sourceAssetsMutated) failures.push('source assets must remain read-only');
  if (!receipt.output.manifestPath || !receipt.output.shardSourcePath) failures.push('expected import outputs');
  if (failures.length) throw new Error(`Import self-test failed:\n- ${failures.join('\n- ')}`);
}

function runSelfTest(args) {
  const fixture = fixtureWorkflow();
  const selfDir = path.join(DEFAULT_TMP, 'shard-import-self-test');
  const workflowPath = path.join(selfDir, 'workflow.json');
  const bundleDir = path.join(selfDir, 'bundles');
  const importDir = path.join(selfDir, 'imports');
  const approvalOutput = path.join(selfDir, 'approval-latest.json');
  const approvalJsOutput = path.join(selfDir, 'approval-latest.js');
  const importOutput = path.join(selfDir, 'import-latest.json');
  const importJsOutput = path.join(selfDir, 'import-latest.js');
  fixture.output.latestPath = publicPath(workflowPath);
  writeJson(workflowPath, fixture);
  const testArgs = {
    ...args,
    workflow: workflowPath,
    output: approvalOutput,
    jsOutput: approvalJsOutput,
    bundleDir,
    importDir,
    importOutput,
    importJsOutput,
  };
  const bundle = writeApprovalOutputs(testArgs, buildBundle(testArgs, fixture));
  assertApprovalBundle(bundle);
  const receipt = executeImport({
    ...testArgs,
    approvalBundle: bundle.output.bundlePath,
    approvalId: bundle.approvalId,
    approvalNonce: bundle.nonce,
    confirm: 'import',
  });
  assertImportReceipt(receipt);
  return { bundle, receipt };
}

try {
  const args = parseArgs();
  if (args.selfTest) {
    const result = runSelfTest(args);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Shard import approval self-test: ${result.bundle.summary.status}`);
      console.log(`Shard import receipt self-test: ${result.receipt.summary.status}`);
    }
  } else if (args.execute) {
    const receipt = executeImport(args);
    if (args.json) console.log(JSON.stringify(receipt, null, 2));
    else {
      console.log(`HoloShell shard import receipt: ${resolveRepoPath(args.importOutput)}`);
      console.log(`Status: ${receipt.summary.status}`);
      console.log(`Shard: ${receipt.summary.shardId}`);
      console.log(`Source assets mutated: ${receipt.summary.sourceAssetsMutated ? 'yes' : 'no'}`);
    }
  } else {
    const bundle = writeApprovalOutputs(args, buildBundle(args));
    if (args.json) console.log(JSON.stringify(bundle, null, 2));
    else {
      console.log(`HoloShell shard import approval: ${resolveRepoPath(args.output)}`);
      if (bundle.output.bundlePath) console.log(`Bundle: ${resolveRepoPath(bundle.output.bundlePath)}`);
      console.log(`Status: ${bundle.summary.status}`);
      console.log(`Shard: ${bundle.summary.shardId || 'none'}`);
      console.log(`Executable: ${bundle.summary.executionAllowed ? 'yes' : 'no'}`);
    }
  }
} catch (error) {
  console.error(`holoshell-shard-import-approval failed: ${error.message}`);
  process.exit(1);
}
