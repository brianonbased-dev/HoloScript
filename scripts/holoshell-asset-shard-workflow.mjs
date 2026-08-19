#!/usr/bin/env node
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SCHEMA_VERSION = 'hololand.holoshell.asset-shard-workflow.v0.1.0';
const PRIVATE_RECEIPT_SCHEMA = 'hololand.holoshell.asset-shard-private-receipt.v0.1.0';
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_ASSETS_DIR = path.join(DEFAULT_TMP, 'sample-shard-assets');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'shard-workflow-latest.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'shard-workflow-latest.js');
const DEFAULT_PREVIEW_OUTPUT = path.join(DEFAULT_TMP, 'shard-preview.holo');
const DEFAULT_RECEIPT_DIR = path.join(DEFAULT_TMP, 'shard-receipts');
const HASH_LIMIT_BYTES = 16 * 1024 * 1024;

const KIND_BY_EXT = new Map([
  ['.glb', 'model'], ['.gltf', 'model'], ['.fbx', 'model'], ['.obj', 'model'], ['.usdz', 'model'], ['.usd', 'model'],
  ['.png', 'image'], ['.jpg', 'image'], ['.jpeg', 'image'], ['.webp', 'image'], ['.ktx2', 'image'], ['.hdr', 'image'],
  ['.mp3', 'audio'], ['.wav', 'audio'], ['.ogg', 'audio'], ['.flac', 'audio'], ['.m4a', 'audio'],
  ['.mp4', 'media'], ['.webm', 'media'], ['.mov', 'media'],
  ['.holo', 'source'], ['.hs', 'source'], ['.hsplus', 'source'], ['.json', 'manifest'],
]);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    assetsDir: DEFAULT_ASSETS_DIR,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    previewOutput: DEFAULT_PREVIEW_OUTPUT,
    receiptDir: DEFAULT_RECEIPT_DIR,
    maxFiles: 250,
    maxPreviewObjects: 30,
    json: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--assets-dir') args.assetsDir = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--preview-output') args.previewOutput = argv[++index];
    else if (arg === '--receipt-dir') args.receiptDir = argv[++index];
    else if (arg === '--max-files') args.maxFiles = Number(argv[++index] || args.maxFiles);
    else if (arg === '--max-preview-objects') args.maxPreviewObjects = Number(argv[++index] || args.maxPreviewObjects);
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  args.maxFiles = Number.isFinite(args.maxFiles) && args.maxFiles > 0 ? Math.floor(args.maxFiles) : 250;
  args.maxPreviewObjects = Number.isFinite(args.maxPreviewObjects) && args.maxPreviewObjects > 0 ? Math.floor(args.maxPreviewObjects) : 30;
  return args;
}

function printHelp() {
  console.log(`HoloShell asset shard workflow

Usage:
  node scripts/holoshell-asset-shard-workflow.mjs [options]

Options:
  --assets-dir <path>           Local asset folder to stage. Defaults to ${DEFAULT_ASSETS_DIR}
  --output <path>               Public workflow receipt. Defaults to ${DEFAULT_OUTPUT}
  --js-output <path>            Browser bootstrap JS. Defaults to ${DEFAULT_JS_OUTPUT}
  --preview-output <path>       Generated .holo preview source. Defaults to ${DEFAULT_PREVIEW_OUTPUT}
  --receipt-dir <path>          Private source receipt directory. Defaults to ${DEFAULT_RECEIPT_DIR}
  --max-files <n>               Max files to scan. Defaults to 250
  --max-preview-objects <n>     Max preview objects to emit. Defaults to 30
  --self-test                   Assert staging invariants.
  --json                        Print the public workflow JSON.
  -h, --help                    Show this help.
`);
}

function resolveRepoPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function publicPath(filePath) {
  return path.relative(REPO_ROOT, resolveRepoPath(filePath)).replace(/\\/g, '/');
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

function writeBrowserBootstrap(filePath, workflow) {
  const payload = JSON.stringify(workflow, null, 2).replace(/<\/script/gi, '<\\/script');
  return writeText(filePath, `window.HOLOSHELL_SHARD_WORKFLOW = ${payload};\n`);
}

function shortHash(value, length = 12) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, length);
}

function hashJson(value, length = 12) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, length);
}

function safeString(value, fallback = '') {
  return String(value ?? fallback).replace(/[^\x20-\x7e]/g, '').trim();
}

function escapeHoloString(value) {
  return safeString(value).replace(/\\/g, '/').replace(/"/g, '\\"');
}

function slug(value, fallback = 'asset') {
  return safeString(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54) || fallback;
}

function createSampleAssets(assetsDir) {
  const resolved = resolveRepoPath(assetsDir);
  const files = [
    ['models', 'orbit-platform.glb', 'placeholder glb for staged HoloLand shard preview\n'],
    ['textures', 'liquid-skin.png', 'placeholder png for staged HoloLand shard preview\n'],
    ['audio', 'lofi-room-loop.ogg', 'placeholder ogg for staged HoloLand shard preview\n'],
    ['source', 'shard-behavior.holo', 'composition "Sample Shard Behavior" {\n  object "SpawnAnchor" { type: "anchor" }\n}\n'],
    ['', 'README.md', '# Sample shard assets\n\nGenerated by HoloShell asset shard workflow.\n'],
  ];
  for (const [dir, name, body] of files) {
    const targetDir = path.join(resolved, dir);
    mkdirSync(targetDir, { recursive: true });
    const filePath = path.join(targetDir, name);
    if (!existsSync(filePath)) writeFileSync(filePath, body, 'utf8');
  }
  return resolved;
}

function classifyKind(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return KIND_BY_EXT.get(ext) || 'unknown';
}

function blockReason(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath).toLowerCase();
  if (name === '.env' || name.endsWith('.env')) return 'environment secret file';
  if (['.pem', '.key', '.pfx', '.p12'].includes(ext)) return 'credential-like file extension';
  if (/\b(secret|token|credential|password)\b/i.test(name) && ['.json', '.txt', '.yaml', '.yml'].includes(ext)) {
    return 'credential-like filename';
  }
  return '';
}

function fileHash(filePath, sizeBytes) {
  if (sizeBytes > HASH_LIMIT_BYTES) {
    return { hashSha256: '', hashStatus: `skipped_large_file_over_${HASH_LIMIT_BYTES}_bytes` };
  }
  const hash = crypto.createHash('sha256').update(readFileSync(filePath)).digest('hex');
  return { hashSha256: hash, hashStatus: 'complete' };
}

function scanAssets(assetsDir, args) {
  const root = resolveRepoPath(assetsDir);
  if (!existsSync(root)) {
    const defaultRoot = resolveRepoPath(DEFAULT_ASSETS_DIR);
    if (path.resolve(root) === path.resolve(defaultRoot)) createSampleAssets(root);
    else throw new Error(`Asset folder not found: ${assetsDir}`);
  }
  const rootStat = statSync(root);
  if (!rootStat.isDirectory()) throw new Error(`Asset path is not a directory: ${assetsDir}`);

  const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.cache']);
  const stack = [root];
  const assets = [];
  const warnings = [];
  while (stack.length && assets.length < args.maxFiles) {
    const dir = stack.pop();
    const entries = readdirSync(dir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        warnings.push({ path: path.relative(root, entryPath).replace(/\\/g, '/'), reason: 'symlink skipped' });
        continue;
      }
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) stack.push(entryPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = statSync(entryPath);
      const relativePath = path.relative(root, entryPath).replace(/\\/g, '/');
      const reason = blockReason(entryPath);
      const hash = reason ? { hashSha256: '', hashStatus: 'blocked_not_hashed' } : fileHash(entryPath, stat.size);
      assets.push({
        id: `asset.${shortHash(relativePath, 10)}`,
        name: path.basename(entryPath),
        relativePath,
        kind: classifyKind(entryPath),
        sizeBytes: stat.size,
        blocked: Boolean(reason),
        blockReason: reason,
        ...hash,
      });
      if (assets.length >= args.maxFiles) break;
    }
  }
  if (assets.length >= args.maxFiles) warnings.push({ path: '', reason: `scan capped at ${args.maxFiles} files` });
  return { root, assets, warnings };
}

function countKind(assets, kind) {
  return assets.filter((asset) => asset.kind === kind).length;
}

function colorForKind(kind) {
  const colors = {
    model: '#72f0d3',
    image: '#64a6ff',
    audio: '#ffd66e',
    media: '#ff8870',
    source: '#9cff8f',
    manifest: '#f4f7ff',
    unknown: '#a8a0ff',
  };
  return colors[kind] || colors.unknown;
}

function previewMeshForKind(kind) {
  const meshes = {
    model: 'cube',
    image: 'texture_plane',
    audio: 'pulse_ring',
    media: 'screen_plane',
    source: 'script_crystal',
    manifest: 'receipt_crystal',
    unknown: 'orb',
  };
  return meshes[kind] || meshes.unknown;
}

function makePreviewSource(workflow, previewAssets) {
  const summary = workflow.summary;
  const source = workflow.source;
  const objects = previewAssets.map((asset, index) => {
    const column = index % 6;
    const row = Math.floor(index / 6);
    const x = ((column - 2.5) * 0.78).toFixed(2);
    const y = (1.8 - row * 0.46).toFixed(2);
    const z = (-2.4 - row * 0.08).toFixed(2);
    return `    object "Asset_${String(index + 1).padStart(2, '0')}_${slug(asset.kind)}" using "ShardAsset" {
      label: "${escapeHoloString(asset.name)}"
      asset_kind: "${escapeHoloString(asset.kind)}"
      source_ref: "${escapeHoloString(asset.relativePath)}"
      mesh: "${previewMeshForKind(asset.kind)}"
      color: "${colorForKind(asset.kind)}"
      blocked: ${asset.blocked ? 'true' : 'false'}
      position: [${x}, ${y}, ${z}]
    }`;
  }).join('\n\n');

  return `// Generated by scripts/holoshell-asset-shard-workflow.mjs
// Source assets are not copied, imported, published, overwritten, or deleted.

composition "HoloShell Asset Shard Preview" {
  metadata {
    title: "Asset Folder to Playable Shard"
    source_contract: "apps/holoshell/source/holoshell-asset-shard-workflow.hsplus"
    workflow_receipt: "${escapeHoloString(workflow.output.latestPath)}"
    shard_id: "${escapeHoloString(workflow.shardPlan.shardId)}"
  }

  environment {
    theme: "holo_os_liquid"
    render_mode: "desktop_spatial"
    skybox: "asset_shard_preview"
    ambient_light: 0.5
    receipt_underlay: true
  }

  state {
    status: "${escapeHoloString(summary.status)}"
    sourceFolderName: "${escapeHoloString(source.assetFolderName)}"
    assetCount: ${summary.assetCount}
    modelCount: ${summary.modelCount}
    imageCount: ${summary.imageCount}
    audioCount: ${summary.audioCount}
    blockedAssetCount: ${summary.blockedAssetCount}
    approvalRequired: ${summary.approvalRequired ? 'true' : 'false'}
    mutationExecuted: false
  }

  template "ShardAsset" {
    type: "asset_proxy"
    mesh: "orb"
    material: "hologram"
    radius: 0.24
    receipt_required: true
    launchable: true
    source_mutation_allowed: false
  }

  object "ShardRoot" {
    type: "playable_shard_root"
    label: "Asset Shard"
    mesh: "platform"
    material: "liquid_glass"
    color: "#0abed9"
    position: [0, 1.0, -2.8]
    scale: [4.8, 0.08, 2.8]
  }

  spatial_group "AssetObjectCloud" {
${objects || '    object "EmptyShard" using "ShardAsset" {\n      label: "No assets found"\n      asset_kind: "empty"\n      source_ref: ""\n      position: [0, 1.8, -2.4]\n    }'}
  }

  object "ShardApprovalGate" {
    type: "approval_gate"
    label: "Approve Import"
    permission_envelope: "guarded_execute"
    operation: "import_asset_folder_as_hololand_shard"
    approval_required: true
    mutation_executed: false
    position: [0, 0.45, -2.05]
    color: "#ffd66e"
  }
}
`;
}

function makeWorkflow(args) {
  const generatedAt = new Date().toISOString();
  const scan = scanAssets(args.assetsDir, args);
  const folderName = path.basename(scan.root);
  const counts = {
    modelCount: countKind(scan.assets, 'model'),
    imageCount: countKind(scan.assets, 'image'),
    audioCount: countKind(scan.assets, 'audio'),
    mediaCount: countKind(scan.assets, 'media'),
    sourceCount: scan.assets.filter((asset) => asset.kind === 'source' || asset.kind === 'manifest').length,
    unknownCount: countKind(scan.assets, 'unknown'),
    blockedAssetCount: scan.assets.filter((asset) => asset.blocked).length,
  };
  const status = !scan.assets.length ? 'empty' : counts.blockedAssetCount ? 'blocked' : 'staged';
  const shardId = `shard.${slug(folderName, 'local-assets')}.${hashJson(scan.assets.map((asset) => [asset.relativePath, asset.sizeBytes, asset.hashSha256 || asset.hashStatus]), 10)}`;
  const previewAssets = scan.assets
    .filter((asset) => !asset.blocked)
    .sort((left, right) => {
      const order = { model: 0, image: 1, audio: 2, media: 3, source: 4, manifest: 5, unknown: 6 };
      return (order[left.kind] ?? 9) - (order[right.kind] ?? 9) || left.relativePath.localeCompare(right.relativePath);
    })
    .slice(0, args.maxPreviewObjects);
  const outputPath = publicPath(args.output);
  const jsOutputPath = publicPath(args.jsOutput);
  const previewPath = publicPath(args.previewOutput);
  const privateReceiptName = `${shardId.replace(/[^a-z0-9.-]/gi, '_')}-private.json`;
  const privateReceiptPath = publicPath(path.join(args.receiptDir, privateReceiptName));
  const rollbackPath = publicPath(path.join(args.receiptDir, `${shardId.replace(/[^a-z0-9.-]/gi, '_')}-rollback.json`));

  const workflow = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    workflowId: `asset-shard-${shortHash(`${scan.root}:${generatedAt}`, 10)}`,
    title: 'Asset Folder to Playable Shard',
    source: {
      assetFolderName: folderName,
      assetFolderFingerprint: shortHash(scan.root, 14),
      pathPolicy: 'absolute_path_kept_in_private_receipt_only',
      privacyClass: 'local_private',
      sourceContract: 'apps/holoshell/source/holoshell-asset-shard-workflow.hsplus',
      bridgeScript: 'scripts/holoshell-asset-shard-workflow.mjs',
    },
    summary: {
      status,
      assetCount: scan.assets.length,
      previewObjectCount: previewAssets.length,
      ...counts,
      approvalRequired: status === 'staged',
      pendingApprovalCount: status === 'staged' ? 1 : 0,
      mutationExecuted: false,
      nextWorkflow: status === 'staged'
        ? 'review_preview_then_approve_import_into_hololand_world'
        : status === 'empty'
          ? 'choose_asset_folder_with_models_images_audio_or_holoscript'
          : 'remove_blocked_files_before_import',
    },
    validation: {
      folderScan: 'pass',
      assetClassification: status === 'blocked' ? 'blocked' : 'pass',
      secretLikeAssetGate: counts.blockedAssetCount ? 'blocked' : 'pass',
      previewSourceValidation: previewAssets.length || !scan.assets.length ? 'pass' : 'blocked',
      browserPathRedaction: 'pass',
      sourceMutation: 'none',
      warnings: scan.warnings,
    },
    shardPlan: {
      shardId,
      worldName: `${folderName || 'Local Assets'} Shard`,
      targetRuntime: 'HoloLand playable shard',
      sourceMode: 'local_folder_proxy',
      importMode: 'guarded_execute_after_preview',
      assets: scan.assets.slice(0, 80).map((asset) => ({
        id: asset.id,
        name: asset.name,
        relativePath: asset.relativePath,
        kind: asset.kind,
        sizeBytes: asset.sizeBytes,
        hashSha256: asset.hashSha256,
        hashStatus: asset.hashStatus,
        blocked: asset.blocked,
        blockReason: asset.blockReason,
      })),
    },
    steps: [
      {
        id: 'scan-local-folder',
        label: 'Scan local folder',
        permissionEnvelope: 'read_only',
        status: 'pass',
        detail: `${scan.assets.length} file(s) scanned; no source asset mutation.`,
      },
      {
        id: 'classify-assets',
        label: 'Classify assets',
        permissionEnvelope: 'read_only',
        status: status === 'blocked' ? 'blocked' : 'pass',
        detail: `${counts.modelCount} model, ${counts.imageCount} image, ${counts.audioCount} audio, ${counts.sourceCount} source/manifest, ${counts.unknownCount} unknown.`,
      },
      {
        id: 'generate-preview-holo',
        label: 'Generate .holo preview',
        permissionEnvelope: 'write_tmp',
        status: 'pass',
        detail: `Preview source staged at ${previewPath}.`,
      },
      {
        id: 'write-source-receipts',
        label: 'Write source receipts',
        permissionEnvelope: 'write_tmp',
        status: 'pass',
        detail: `Private source receipt staged at ${privateReceiptPath}.`,
      },
      {
        id: 'approve-shard-import',
        label: 'Approve import into HoloLand',
        permissionEnvelope: 'guarded_execute',
        status: status === 'staged' ? 'pending_user_approval' : 'blocked',
        detail: status === 'staged'
          ? 'Import/publish is staged but not executed.'
          : 'Import is blocked until folder gates pass.',
      },
    ],
    approvals: [
      {
        id: 'asset-shard-import',
        operation: 'import_asset_folder_as_hololand_shard',
        permissionEnvelope: 'guarded_execute',
        status: status === 'staged' ? 'pending_user_approval' : 'blocked',
        executionAllowed: false,
        reason: 'Publishing or importing assets changes the HoloLand world graph and needs explicit approval.',
      },
    ],
    rollback: {
      sourceAssetsMutated: false,
      rollbackReceiptPath: rollbackPath,
      generatedTmpPaths: [outputPath, jsOutputPath, previewPath, privateReceiptPath],
      instructions: 'Delete generated .tmp/holoshell shard workflow files. Source assets were read only.',
    },
    output: {
      latestPath: outputPath,
      browserBootstrap: jsOutputPath,
      previewSourcePath: previewPath,
      privateReceiptPath,
    },
  };

  return { workflow, scan, previewAssets, privateReceiptPath, rollbackPath };
}

function writeReceipts(bundle) {
  const privateReceipt = {
    schemaVersion: PRIVATE_RECEIPT_SCHEMA,
    generatedAt: bundle.workflow.generatedAt,
    workflowId: bundle.workflow.workflowId,
    shardId: bundle.workflow.shardPlan.shardId,
    source: {
      resolvedAssetsDir: bundle.scan.root,
      host: os.hostname(),
      platform: os.platform(),
      privacyClass: 'local_private',
    },
    files: bundle.scan.assets.map((asset) => ({
      ...asset,
      absolutePath: path.join(bundle.scan.root, asset.relativePath),
    })),
    mutationExecuted: false,
    approvalRequiredForImport: true,
  };
  const rollbackReceipt = {
    schemaVersion: 'hololand.holoshell.asset-shard-rollback.v0.1.0',
    generatedAt: bundle.workflow.generatedAt,
    workflowId: bundle.workflow.workflowId,
    shardId: bundle.workflow.shardPlan.shardId,
    sourceAssetsMutated: false,
    generatedTmpPaths: bundle.workflow.rollback.generatedTmpPaths,
    rollbackSteps: [
      'Remove the generated workflow JSON and browser bootstrap.',
      'Remove the generated .holo preview.',
      'Remove the private source receipt and rollback receipt.',
      'No source asset folder changes are required.',
    ],
  };
  writeJson(bundle.privateReceiptPath, privateReceipt);
  writeJson(bundle.rollbackPath, rollbackReceipt);
}

function assertSelfTest(workflow) {
  const failures = [];
  if (workflow.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (!workflow.summary.assetCount) failures.push('expected at least one staged asset');
  if (!workflow.summary.modelCount) failures.push('expected model classification');
  if (!workflow.summary.imageCount) failures.push('expected image classification');
  if (!workflow.summary.audioCount) failures.push('expected audio classification');
  if (workflow.summary.mutationExecuted) failures.push('workflow must not mutate assets');
  if (!workflow.summary.approvalRequired) failures.push('import must require approval');
  if (workflow.output.latestPath.match(/^[A-Za-z]:/)) failures.push('browser output path must be repo-relative');
  const publicJson = JSON.stringify(workflow);
  if (publicJson.includes(resolveRepoPath(DEFAULT_ASSETS_DIR))) failures.push('public workflow leaked absolute asset path');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs();
  const bundle = makeWorkflow(args);
  const previewSource = makePreviewSource(bundle.workflow, bundle.previewAssets);
  const previewOutput = writeText(args.previewOutput, previewSource);
  bundle.workflow.validation.previewSourceHash = shortHash(previewSource, 14);
  bundle.workflow.output.previewSourcePath = publicPath(previewOutput);
  writeReceipts(bundle);
  const output = writeJson(args.output, bundle.workflow);
  const jsOutput = writeBrowserBootstrap(args.jsOutput, bundle.workflow);
  if (args.selfTest) assertSelfTest(bundle.workflow);

  if (args.json) {
    console.log(JSON.stringify(bundle.workflow, null, 2));
  } else {
    console.log(`HoloShell shard workflow: ${output}`);
    console.log(`HoloShell shard browser bootstrap: ${jsOutput}`);
    console.log(`HoloShell shard preview: ${previewOutput}`);
    console.log(`Status: ${bundle.workflow.summary.status}`);
    console.log(`Assets: ${bundle.workflow.summary.assetCount}`);
    console.log(`Models: ${bundle.workflow.summary.modelCount}`);
    console.log(`Images: ${bundle.workflow.summary.imageCount}`);
    console.log(`Audio: ${bundle.workflow.summary.audioCount}`);
    console.log(`Approval required: ${bundle.workflow.summary.approvalRequired}`);
  }
} catch (error) {
  console.error(`holoshell-asset-shard-workflow failed: ${error.message}`);
  process.exit(1);
}
