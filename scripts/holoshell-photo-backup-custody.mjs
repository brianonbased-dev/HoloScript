#!/usr/bin/env node
import crypto from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const SCHEMA_VERSION = 'hololand.holoshell.photo-backup-custody.v0.1.0';
const PRIVATE_SCHEMA_VERSION = 'hololand.holoshell.photo-backup-private.v0.1.0';
const DEFAULT_TMP = path.join('.tmp', 'holoshell');
const DEFAULT_ALBUM_DIR = path.join(DEFAULT_TMP, 'sample-photo-albums');
const DEFAULT_OUTPUT = path.join(DEFAULT_TMP, 'photo-backup-custody-latest.json');
const DEFAULT_JS_OUTPUT = path.join(DEFAULT_TMP, 'photo-backup-custody-latest.js');
const DEFAULT_RECEIPT_DIR = path.join(DEFAULT_TMP, 'photo-backup-receipts');
const HASH_LIMIT_BYTES = 64 * 1024 * 1024;

const MEDIA_BY_EXT = new Map([
  ['.jpg', 'photo'], ['.jpeg', 'photo'], ['.png', 'photo'], ['.heic', 'photo'], ['.heif', 'photo'],
  ['.webp', 'photo'], ['.gif', 'photo'], ['.tif', 'photo'], ['.tiff', 'photo'], ['.bmp', 'photo'],
  ['.mp4', 'video'], ['.mov', 'video'], ['.m4v', 'video'], ['.avi', 'video'], ['.webm', 'video'],
  ['.mkv', 'video'], ['.3gp', 'video'],
  ['.dng', 'raw'], ['.cr2', 'raw'], ['.cr3', 'raw'], ['.nef', 'raw'], ['.arw', 'raw'], ['.raf', 'raw'],
  ['.xmp', 'sidecar'], ['.aae', 'sidecar'], ['.json', 'sidecar'],
]);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    albumDir: DEFAULT_ALBUM_DIR,
    output: DEFAULT_OUTPUT,
    jsOutput: DEFAULT_JS_OUTPUT,
    receiptDir: DEFAULT_RECEIPT_DIR,
    maxFiles: 500,
    json: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--album-dir') args.albumDir = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--js-output') args.jsOutput = argv[++index];
    else if (arg === '--receipt-dir') args.receiptDir = argv[++index];
    else if (arg === '--max-files') args.maxFiles = Number(argv[++index] || args.maxFiles);
    else if (arg === '--json') args.json = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  args.maxFiles = Number.isFinite(args.maxFiles) && args.maxFiles > 0 ? Math.floor(args.maxFiles) : 500;
  return args;
}

function printHelp() {
  console.log(`HoloShell photo backup custody

Usage:
  node scripts/holoshell-photo-backup-custody.mjs [options]

Options:
  --album-dir <path>      Local photo album root. Defaults to ${DEFAULT_ALBUM_DIR}
  --output <path>         Redacted public custody receipt. Defaults to ${DEFAULT_OUTPUT}
  --js-output <path>      Browser bootstrap JS. Defaults to ${DEFAULT_JS_OUTPUT}
  --receipt-dir <path>    Private receipt directory. Defaults to ${DEFAULT_RECEIPT_DIR}
  --max-files <n>         Max media files to scan. Defaults to 500
  --self-test             Generate a fixture and assert custody invariants.
  --json                  Print the public receipt JSON.
  -h, --help              Show this help.
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

function writeBrowserBootstrap(filePath, receipt) {
  const payload = JSON.stringify(receipt, null, 2).replace(/<\/script/gi, '<\\/script');
  return writeText(filePath, `window.HOLOSHELL_PHOTO_BACKUP_CUSTODY = ${payload};\n`);
}

function shortHash(value, length = 12) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, length);
}

function hashJson(value, length = 12) {
  return shortHash(JSON.stringify(value), length);
}

function createSampleAlbums(albumDir) {
  const resolved = resolveRepoPath(albumDir);
  const files = [
    ['summer', 'img-001.jpg', 'fixture-family-photo-bytes-001\n'],
    ['summer', 'img-001-copy.jpg', 'fixture-family-photo-bytes-001\n'],
    ['summer', 'img-002.heic', 'fixture-family-photo-bytes-002\n'],
    ['winter', 'clip-001.mov', 'fixture-family-video-bytes-001\n'],
    ['archive', 'raw-001.dng', 'fixture-family-raw-bytes-001\n'],
    ['archive', 'img-001.xmp', '<xmp>fixture metadata sidecar</xmp>\n'],
  ];
  for (const [dir, name, body] of files) {
    const targetDir = path.join(resolved, dir);
    mkdirSync(targetDir, { recursive: true });
    const target = path.join(targetDir, name);
    if (!existsSync(target)) writeFileSync(target, body, 'utf8');
  }
  return resolved;
}

function mediaKind(filePath) {
  return MEDIA_BY_EXT.get(path.extname(filePath).toLowerCase()) || '';
}

function fileHash(filePath, sizeBytes) {
  if (sizeBytes > HASH_LIMIT_BYTES) {
    return { hashSha256: '', hashStatus: `skipped_large_file_over_${HASH_LIMIT_BYTES}_bytes` };
  }
  return {
    hashSha256: crypto.createHash('sha256').update(readFileSync(filePath)).digest('hex'),
    hashStatus: 'complete',
  };
}

function scanAlbum(albumDir, args) {
  const root = resolveRepoPath(albumDir);
  if (!existsSync(root)) {
    if (path.resolve(root) === path.resolve(resolveRepoPath(DEFAULT_ALBUM_DIR))) createSampleAlbums(root);
    else throw new Error(`Photo album folder not found: ${albumDir}`);
  }
  if (!statSync(root).isDirectory()) throw new Error(`Photo album path is not a directory: ${albumDir}`);

  const ignoredDirs = new Set(['.git', 'node_modules', '.thumbs', '.cache', 'Lightroom Catalog Previews.lrdata']);
  const stack = [root];
  const files = [];
  const warnings = [];
  while (stack.length && files.length < args.maxFiles) {
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
      const kind = mediaKind(entryPath);
      if (!kind) continue;
      const relativePath = path.relative(root, entryPath).replace(/\\/g, '/');
      try {
        const stat = statSync(entryPath);
        const hash = fileHash(entryPath, stat.size);
        files.push({
          id: `media.${shortHash(relativePath, 10)}`,
          name: path.basename(entryPath),
          relativePath,
          mediaKind: kind,
          sizeBytes: stat.size,
          perceptualHash: hash.hashSha256 ? `phash:${hash.hashSha256.slice(0, 16)}` : '',
          unreadable: false,
          privacyMetadataClasses: privacyMetadataClasses(kind),
          ...hash,
        });
      } catch (error) {
        files.push({
          id: `media.${shortHash(relativePath, 10)}`,
          name: path.basename(entryPath),
          relativePath,
          mediaKind: kind,
          sizeBytes: 0,
          perceptualHash: '',
          hashSha256: '',
          hashStatus: `unreadable:${error.code || 'error'}`,
          unreadable: true,
          privacyMetadataClasses: privacyMetadataClasses(kind),
        });
      }
      if (files.length >= args.maxFiles) break;
    }
  }
  if (files.length >= args.maxFiles) warnings.push({ path: '', reason: `scan capped at ${args.maxFiles} media files` });
  return { root, files, warnings };
}

function privacyMetadataClasses(kind) {
  if (kind === 'video') return ['gps', 'faces', 'camera_serial', 'capture_time', 'audio'];
  if (kind === 'sidecar') return ['gps', 'faces', 'album_names', 'edit_history'];
  return ['gps', 'faces', 'camera_serial', 'capture_time'];
}

function attachDuplicateGroups(files) {
  const groups = new Map();
  for (const file of files) {
    if (!file.hashSha256) continue;
    const group = groups.get(file.hashSha256) || [];
    group.push(file);
    groups.set(file.hashSha256, group);
  }
  let duplicateIndex = 0;
  const duplicateGroups = [];
  for (const [hashSha256, group] of groups.entries()) {
    if (group.length < 2) continue;
    duplicateIndex += 1;
    const duplicateGroupId = `duplicate.${duplicateIndex}`;
    for (const file of group) file.duplicateGroupId = duplicateGroupId;
    duplicateGroups.push({
      duplicateGroupId,
      hashSha256,
      fileIds: group.map((file) => file.id),
      count: group.length,
      deletionAllowed: false,
    });
  }
  return duplicateGroups;
}

function countKind(files, kind) {
  return files.filter((file) => file.mediaKind === kind).length;
}

function makeReceipt(args) {
  const generatedAt = new Date().toISOString();
  const scan = scanAlbum(args.albumDir, args);
  const duplicateGroups = attachDuplicateGroups(scan.files);
  const albumLabel = path.basename(scan.root);
  const receiptId = `photo-backup-${shortHash(`${scan.root}:${generatedAt}`, 10)}`;
  const privateReceiptName = `${receiptId}-private.json`;
  const privateReceiptPath = publicPath(path.join(args.receiptDir, privateReceiptName));
  const latestPath = publicPath(args.output);
  const status = scan.files.some((file) => file.unreadable) ? 'blocked' : 'planned';

  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    receiptId,
    generatedAt,
    title: 'Family Photo Backup Custody',
    source: {
      albumLabel,
      albumFingerprint: shortHash(scan.root, 14),
      pathPolicy: 'absolute_path_kept_in_private_receipt_only',
      privacyClass: 'local_private',
      sourceContract: 'apps/holoshell/source/holoshell-family-photo-backup-custody-policy.hsplus',
      bridgeScript: 'scripts/holoshell-photo-backup-custody.mjs',
    },
    summary: {
      status,
      albumCount: new Set(scan.files.map((file) => file.relativePath.split('/')[0] || albumLabel)).size,
      photoCount: countKind(scan.files, 'photo') + countKind(scan.files, 'raw'),
      videoCount: countKind(scan.files, 'video'),
      duplicateGroupCount: duplicateGroups.length,
      unreadableCount: scan.files.filter((file) => file.unreadable).length,
      originalsDeleted: false,
      deleteBlocked: true,
      restoreVerified: false,
      copyApproved: false,
      copyExecuted: false,
      targetPlan: 'not_chosen',
      privacyMetadataClasses: Array.from(new Set(scan.files.flatMap((file) => file.privacyMetadataClasses))).sort(),
      nextWorkflow: 'choose_privacy_target_then_copy_then_sample_restore_before_delete',
    },
    privacyEnvelope: {
      chosen: false,
      metadataPolicy: 'not_chosen',
      rawPixelsInPublicReceipt: false,
      gpsRedacted: true,
      faceLabelsRedacted: true,
    },
    targetPlan: {
      targetKind: 'not_chosen',
      quotaChecked: false,
      deleteSemanticsVisible: false,
      providerAccountResolved: false,
    },
    files: scan.files.map((file) => ({
      id: file.id,
      name: file.name,
      relativePath: file.relativePath,
      mediaKind: file.mediaKind,
      sizeBytes: file.sizeBytes,
      hashSha256: file.hashSha256,
      hashStatus: file.hashStatus,
      perceptualHash: file.perceptualHash,
      duplicateGroupId: file.duplicateGroupId,
      unreadable: file.unreadable,
      privacyMetadataClasses: file.privacyMetadataClasses,
    })),
    duplicateGroups: duplicateGroups.map((group) => ({
      duplicateGroupId: group.duplicateGroupId,
      hashSha256: group.hashSha256,
      fileIds: group.fileIds,
      count: group.count,
      deletionAllowed: false,
    })),
    replay: {
      replayInputs: [
        `albumFingerprint:${shortHash(scan.root, 14)}`,
        `maxFiles:${args.maxFiles}`,
        'privacyEnvelope:not_chosen',
        'targetPlan:not_chosen',
      ],
      rollbackPlan: 'Remove generated .tmp/holoshell photo backup receipts. Source albums were scanned read-only.',
    },
    output: {
      latestPath,
      browserBootstrap: publicPath(args.jsOutput),
      privateReceiptPath,
    },
    warnings: scan.warnings,
  };

  const privateReceipt = {
    schemaVersion: PRIVATE_SCHEMA_VERSION,
    generatedAt,
    receiptId,
    source: {
      resolvedAlbumDir: scan.root,
      host: os.hostname(),
      platform: os.platform(),
      privacyClass: 'local_private',
    },
    files: scan.files.map((file) => ({
      ...file,
      absolutePath: path.join(scan.root, file.relativePath),
    })),
    duplicateGroups,
    originalsDeleted: false,
    deleteBlocked: true,
    restoreVerified: false,
  };

  return { receipt, privateReceipt, privateReceiptPath };
}

function assertSelfTest(receipt) {
  const failures = [];
  if (receipt.schemaVersion !== SCHEMA_VERSION) failures.push('schemaVersion mismatch');
  if (!receipt.summary.photoCount) failures.push('expected at least one photo/raw media file');
  if (!receipt.summary.videoCount) failures.push('expected at least one video file');
  if (!receipt.summary.duplicateGroupCount) failures.push('expected duplicate group detection');
  if (receipt.summary.originalsDeleted) failures.push('original deletion must be false');
  if (!receipt.summary.deleteBlocked) failures.push('delete blocker must remain active');
  if (receipt.summary.restoreVerified) failures.push('restore verification must be false before copy proof');
  if (receipt.privacyEnvelope.rawPixelsInPublicReceipt) failures.push('public receipt must not include raw pixels');
  const publicJson = JSON.stringify(receipt);
  if (publicJson.includes(resolveRepoPath(DEFAULT_ALBUM_DIR))) failures.push('public receipt leaked absolute album path');
  if (publicJson.match(/^[A-Za-z]:[\\/]/m)) failures.push('public receipt contains absolute Windows path');
  if (failures.length) throw new Error(`Self-test failed:\n- ${failures.join('\n- ')}`);
}

try {
  const args = parseArgs();
  const bundle = makeReceipt(args);
  writeJson(args.output, bundle.receipt);
  writeJson(bundle.privateReceiptPath, bundle.privateReceipt);
  writeBrowserBootstrap(args.jsOutput, bundle.receipt);
  if (args.selfTest) assertSelfTest(bundle.receipt);

  if (args.json) {
    console.log(JSON.stringify(bundle.receipt, null, 2));
  } else {
    console.log(`HoloShell photo backup custody: ${resolveRepoPath(args.output)}`);
    console.log(`HoloShell photo backup bootstrap: ${resolveRepoPath(args.jsOutput)}`);
    console.log(`Status: ${bundle.receipt.summary.status}`);
    console.log(`Photos/raw: ${bundle.receipt.summary.photoCount}`);
    console.log(`Videos: ${bundle.receipt.summary.videoCount}`);
    console.log(`Duplicate groups: ${bundle.receipt.summary.duplicateGroupCount}`);
    console.log(`Delete blocked: ${bundle.receipt.summary.deleteBlocked}`);
  }
} catch (error) {
  console.error(`holoshell-photo-backup-custody failed: ${error.message}`);
  process.exit(1);
}
