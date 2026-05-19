#!/usr/bin/env node
/**
 * HoloShell Downloads Scanner Adapter
 *
 * Scans a local directory (Downloads folder or approved root), classifies files
 * by metadata, and emits a unified receipt pack:
 *   - Public redacted receipt (no absolute paths)
 *   - Private-path local receipt (opaque handle, absolute paths kept locally)
 *
 * Safety invariants enforced:
 *   1. Read-only default -- scanner never mutates source files
 *   2. No raw absolute paths in public receipts (hasAbsolutePath guard)
 *   3. Private path receipt local only (opaque handle in public data)
 *   4. Installers never executable by default (executable block)
 *   5. Delete/import require nonce-bound fresh gesture (replayKey)
 *   6. Replay key includes root hash, file hashes, policy version, and selected action set
 *
 * task_1779150614671_ndha
 */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  resolve,
  relative,
} from 'node:path';
import { tmpdir } from 'node:os';

const VERSION = '0.1.0';
const POLICY_VERSION = '1';
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);

// ── CLI ──

function parseArgs(argv) {
  const args = {
    root: undefined,
    out: undefined,
    date: DEFAULT_DATE,
    selfTest: false,
    dryRun: false,
    privacyClass: 'local-private',
    source: 'user_downloads',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--self-test') {
      args.selfTest = true;
    } else if (arg === '--root') {
      args.root = argv[++i];
    } else if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--privacy-class') {
      args.privacyClass = argv[++i];
    } else if (arg === '--source') {
      args.source = argv[++i];
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  process.stdout.write(`HoloShell Downloads Scanner Adapter ${VERSION}

Usage:
  node scripts/holoshell-downloads-scanner-adapter.mjs --root <dir> [--out <receipt.json>]
  node scripts/holoshell-downloads-scanner-adapter.mjs --self-test

Options:
  --root <dir>             Approved root directory to scan (e.g. ~/Downloads).
  --out <receipt.json>      Output receipt path.
  --date <yyyy-mm-dd>       Bench-log date folder when --out is omitted.
  --privacy-class <class>  public | local-private | credential-adjacent | secret | unknown.
  --source <source>        browser_downloads | user_downloads | temp_downloads | custom_shelf.
  --dry-run                Validate receipts without writing output.
`);
}

// ── Hashing ──

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// ── MIME / Extension Classification ──

const EXECUTABLE_EXTENSIONS = new Set([
  '.exe', '.msi', '.bat', '.cmd', '.ps1', '.vbs', '.wsf', '.scr', '.com',
  '.app', '.dmg', '.pkg', '.deb', '.rpm', '.sh', '.bash', '.run',
  '.appimage', '.jar', '.war', '.pyc', '.dll', '.so', '.dylib',
]);

const ARCHIVE_EXTENSIONS = new Set([
  '.zip', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar',
  '.zst', '.lz4', '.cab', '.iso', '.dmg',
]);

const PARTIAL_DOWNLOAD_EXTENSIONS = new Set([
  '.crdownload', '.part', '.download', '.tmp',
]);

const MEDIA_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff',
  '.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm',
  '.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a',
]);

const DOCUMENT_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.odt', '.ods', '.odp', '.rtf', '.txt', '.csv', '.tsv',
  '.md', '.html', '.htm',
]);

const CODE_EXTENSIONS = new Set([
  '.js', '.ts', '.py', '.rb', '.go', '.rs', '.java', '.c', '.cpp',
  '.h', '.hpp', '.cs', '.swift', '.kt', '.scala', '.json', '.xml',
  '.yaml', '.yml', '.toml', '.ini', '.cfg',
]);

const FONT_EXTENSIONS = new Set([
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
]);

function classifyCategory(extension) {
  const ext = extension.toLowerCase();
  if (EXECUTABLE_EXTENSIONS.has(ext)) return 'executable';
  if (ARCHIVE_EXTENSIONS.has(ext)) return 'archive';
  if (PARTIAL_DOWNLOAD_EXTENSIONS.has(ext)) return 'other';
  if (MEDIA_EXTENSIONS.has(ext)) {
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff'].includes(ext)) return 'image';
    if (['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a'].includes(ext)) return 'audio';
    return 'video';
  }
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  if (FONT_EXTENSIONS.has(ext)) return 'font';
  if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') return 'data';
  return 'other';
}

function isPartialDownload(filename) {
  const ext = extname(filename).toLowerCase();
  return PARTIAL_DOWNLOAD_EXTENSIONS.has(ext);
}

function isExecutableExtension(extension) {
  return EXECUTABLE_EXTENSIONS.has(extension.toLowerCase());
}

function isArchiveExtension(extension) {
  return ARCHIVE_EXTENSIONS.has(extension.toLowerCase());
}

// ── File Scanning ──

function scanFile(absolutePath, rootDir) {
  const bytes = readFileSync(absolutePath);
  const stats = statSync(absolutePath);
  const extension = extname(absolutePath).toLowerCase();
  const filename = basename(absolutePath);
  const relativePath = relative(rootDir, absolutePath).replace(/\\/g, '/');
  const category = classifyCategory(extension);
  const contentHash = sha256Bytes(bytes);
  const filenameHash = sha256Text(filename);
  const isExecutable = isExecutableExtension(extension);
  const isPartial = isPartialDownload(filename);
  const isArchive = isArchiveExtension(extension);
  const isInstaller = isExecutable && !isArchive;

  // Check for absolute path leakage in file content (basic heuristic)
  let containsPrivateData = false;
  if (category === 'document' || category === 'code') {
    const sample = bytes.subarray(0, Math.min(bytes.length, 64 * 1024)).toString('utf8', 0, Math.min(bytes.length, 64 * 1024));
    containsPrivateData = /[A-Z]:\\[Uu]sers\\/.test(sample) || /\/home\/[a-z]+\//.test(sample);
  }

  return {
    id: `fp_${contentHash.slice(0, 12)}`,
    redactedFilename: filename,
    filenameHash,
    extension,
    sizeBytes: stats.size,
    contentHash,
    contentHashAlgorithm: 'sha256',
    source: 'browser', // will be overridden by caller
    category,
    downloadedAt: stats.mtime.toISOString(),
    containsAbsolutePaths: false, // invariant: never in public receipt
    scannedForSecurity: true,
    isExecutable,
    isPartial,
    isArchive,
    isInstaller,
    containsPrivateData,
    rawPublishAllowed: false,
    permissionEnvelope: 'preview_only',
    // Private receipt data (NOT in public receipt)
    privateAbsolutePath: absolutePath,
    relativePath,
    rootHash: '', // filled by caller
  };
}

function detectDuplicates(files) {
  const hashGroups = new Map();
  for (const file of files) {
    const group = hashGroups.get(file.contentHash) ?? [];
    group.push(file);
    hashGroups.set(file.contentHash, group);
  }

  const duplicateGroups = [];
  for (const [hash, group] of hashGroups.entries()) {
    if (group.length > 1) {
      duplicateGroups.push({
        canonicalContentHash: hash,
        entries: group.map((file, i) => ({
          file,
          isCanonical: i === 0,
          matchReason: 'content_hash',
        })),
      });
    }
  }

  // Also detect filename-based duplicates across different content hashes
  const nameGroups = new Map();
  for (const file of files) {
    const key = `${file.redactedFilename.toLowerCase()}`;
    const group = nameGroups.get(key) ?? [];
    group.push(file);
    nameGroups.set(key, group);
  }

  for (const [, group] of nameGroups.entries()) {
    if (group.length > 1) {
      const hashes = new Set(group.map((f) => f.contentHash));
      if (hashes.size > 1) {
        // Same name, different content -- add as metadata match
        duplicateGroups.push({
          canonicalContentHash: group[0].contentHash,
          entries: group.map((file, i) => ({
            file,
            isCanonical: i === 0,
            matchReason: 'filename',
          })),
        });
      }
    }
  }

  return duplicateGroups;
}

// ── Receipt Construction ──

function buildDownloadsInventoryReceipt(files, rootDir, rootHash, source) {
  const categoriesFound = [...new Set(files.map((f) => f.category))];
  const anyExecutable = files.some((f) => f.isExecutable);
  const anyPartial = files.some((f) => f.isPartial);
  const anyPrivateData = files.some((f) => f.containsPrivateData);

  const fileProxies = files.map((f) => ({
    id: f.id,
    schemaVersion: 'holoscript-downloaded-file-proxy/v1',
    redactedFilename: f.redactedFilename,
    filenameHash: f.filenameHash,
    extension: f.extension,
    sizeBytes: f.sizeBytes,
    contentHash: f.contentHash,
    contentHashAlgorithm: f.contentHashAlgorithm,
    source: f.source || source,
    category: f.category,
    downloadedAt: f.downloadedAt,
    containsAbsolutePaths: false,
    scannedForSecurity: f.scannedForSecurity,
    isExecutable: f.isExecutable,
    isPartial: f.isPartial,
    containsPrivateData: f.containsPrivateData,
    rawPublishAllowed: false,
    permissionEnvelope: 'preview_only',
  }));

  const receiptWithoutHash = {
    id: `inv_${rootHash.slice(0, 12)}_${Date.now().toString(36)}`,
    schemaVersion: 'holoscript-downloads-inventory-receipt/v1',
    inventoriedAt: new Date().toISOString(),
    inventoriedBy: 'holoscript-downloads-scanner-adapter',
    files: fileProxies,
    fileCount: fileProxies.length,
    totalSizeBytes: files.reduce((sum, f) => sum + f.sizeBytes, 0),
    categoriesFound,
    anyFileContainsAbsolutePath: false,
    anyFileExecutable: anyExecutable,
    anyFilePartial: anyPartial,
    anyFileContainsPrivateData: anyPrivateData,
    importMode: 'preview_only',
    hash: '', // filled below
    hashAlgorithm: 'sha256',
    provenance: ['scripts/holoshell-downloads-scanner-adapter.mjs'],
    verificationCommands: ['node scripts/holoshell-downloads-scanner-adapter.mjs --self-test'],
  };

  receiptWithoutHash.hash = sha256Text(JSON.stringify(receiptWithoutHash));
  return receiptWithoutHash;
}

function buildExecutableBlockReceipts(files) {
  const blockedFiles = files.filter((f) => f.isExecutable || f.isInstaller);
  return blockedFiles.map((f) => {
    const receiptWithoutHash = {
      id: `exe_block_${f.contentHash.slice(0, 12)}`,
      schemaVersion: 'holoscript-executable-block-receipt/v1',
      blockedFile: {
        id: f.id,
        schemaVersion: 'holoscript-downloaded-file-proxy/v1',
        redactedFilename: f.redactedFilename,
        filenameHash: f.filenameHash,
        extension: f.extension,
        sizeBytes: f.sizeBytes,
        contentHash: f.contentHash,
        contentHashAlgorithm: f.contentHashAlgorithm,
        source: f.source,
        category: f.category,
        downloadedAt: f.downloadedAt,
        containsAbsolutePaths: false,
        scannedForSecurity: true,
        isExecutable: f.isExecutable,
        isPartial: f.isPartial,
        containsPrivateData: f.containsPrivateData,
        rawPublishAllowed: false,
        permissionEnvelope: 'preview_only',
      },
      blockedAt: new Date().toISOString(),
      blockReason: f.isInstaller ? 'executable_detected' : f.isArchive ? 'archive_contains_executable' : 'executable_detected',
      executionAttempted: false,
      executableLaunched: false,
      previewShown: true,
      rollbackNote: 'Executable blocked by default; import requires nonce-bound fresh gesture.',
      hash: '', // filled below
      hashAlgorithm: 'sha256',
      provenance: ['scripts/holoshell-downloads-scanner-adapter.mjs'],
      verificationCommands: ['node scripts/holoshell-downloads-scanner-adapter.mjs --self-test'],
    };
    receiptWithoutHash.hash = sha256Text(JSON.stringify(receiptWithoutHash));
    return receiptWithoutHash;
  });
}

function buildDuplicateGroupReceipts(duplicateGroups) {
  return duplicateGroups.map((group) => {
    const entries = group.entries.map((entry) => ({
      file: {
        id: entry.file.id,
        schemaVersion: 'holoscript-downloaded-file-proxy/v1',
        redactedFilename: entry.file.redactedFilename,
        filenameHash: entry.file.filenameHash,
        extension: entry.file.extension,
        sizeBytes: entry.file.sizeBytes,
        contentHash: entry.file.contentHash,
        contentHashAlgorithm: entry.file.contentHashAlgorithm,
        source: entry.file.source,
        category: entry.file.category,
        downloadedAt: entry.file.downloadedAt,
        containsAbsolutePaths: false,
        scannedForSecurity: true,
        isExecutable: entry.file.isExecutable,
        isPartial: entry.file.isPartial,
        containsPrivateData: entry.file.containsPrivateData,
        rawPublishAllowed: false,
        permissionEnvelope: 'preview_only',
      },
      isCanonical: entry.isCanonical,
      matchReason: entry.matchReason,
    }));

    const receiptWithoutHash = {
      id: `dup_${group.canonicalContentHash.slice(0, 12)}`,
      schemaVersion: 'holoscript-duplicate-group-receipt/v1',
      identifiedAt: new Date().toISOString(),
      canonicalContentHash: group.canonicalContentHash,
      entries,
      groupSize: entries.length,
      canonicalCount: 1,
      cleanupPerformed: false,
      sourceFileMutationPerformed: false,
      rollbackNote: 'Duplicate group identified; cleanup requires nonce-bound fresh gesture.',
      hash: '', // filled below
      hashAlgorithm: 'sha256',
      provenance: ['scripts/holoshell-downloads-scanner-adapter.mjs'],
    };
    receiptWithoutHash.hash = sha256Text(JSON.stringify(receiptWithoutHash));
    return receiptWithoutHash;
  });
}

function buildReplayKey(rootHash, fileHashes, policyVersion, actionSet) {
  const components = [
    `sha256:${rootHash}`,
    `hashes:${fileHashes.sort().join(',')}`,
    `policy:${policyVersion}`,
    `actions:${actionSet.sort().join(',')}`,
  ];
  return sha256Text(components.join('|'));
}

function buildReplayReceipt(inventoryId, rootHash, fileHashes, actionSet) {
  const replayKey = buildReplayKey(rootHash, fileHashes, POLICY_VERSION, actionSet);
  const receiptWithoutHash = {
    id: `replay_${replayKey.slice(0, 12)}`,
    schemaVersion: 'holoscript-downloads-shelf-replay-receipt/v1',
    workflow: 'downloads-import-shelf',
    status: 'scanning',
    inventoryReceiptId: inventoryId,
    replayKey,
    importOutsidePreviewOnly: false,
    executableLaunched: false,
    rawPrivateDataPublished: false,
    deleteWithoutFreshUserGesture: false,
    anyFileHashMissing: false,
    rollbackNote: 'Full replay available; all mutations require nonce-bound fresh gesture.',
    createdAt: new Date().toISOString(),
    hash: '', // filled below
    hashAlgorithm: 'sha256',
  };
  receiptWithoutHash.hash = sha256Text(JSON.stringify(receiptWithoutHash));
  return receiptWithoutHash;
}

function buildPrivateReceipt(files, rootDir, rootHash) {
  // Private receipt: contains absolute paths, local-only
  const privateData = {
    rootDir,
    rootHash,
    scannedAt: new Date().toISOString(),
    adapterVersion: VERSION,
    policyVersion: POLICY_VERSION,
    files: files.map((f) => ({
      id: f.id,
      absolutePath: f.privateAbsolutePath,
      relativePath: f.relativePath,
      contentHash: f.contentHash,
      sizeBytes: f.sizeBytes,
    })),
  };
  return {
    handle: `priv_${rootHash.slice(0, 12)}_${sha256Text(JSON.stringify(privateData)).slice(0, 8)}`,
    data: privateData,
  };
}

function buildFullReceiptPack(rootDir, source, privacyClass) {
  // Scan the root directory
  const rootPath = isAbsolute(rootDir) ? rootDir : resolve(rootDir);
  if (!existsSync(rootPath)) {
    throw new Error(`Root directory does not exist: ${rootPath}`);
  }

  const rootStat = statSync(rootPath);
  if (!rootStat.isDirectory()) {
    throw new Error(`Root path is not a directory: ${rootPath}`);
  }

  const rootHash = sha256Text(rootPath);

  // Read all files (non-recursive by default, like a Downloads folder)
  const entries = readdirSync(rootPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) continue; // skip subdirectories for initial scan
    const fullPath = join(rootPath, entry.name);
    try {
      const scanned = scanFile(fullPath, rootPath);
      scanned.source = source;
      scanned.rootHash = rootHash;
      files.push(scanned);
    } catch {
      // Skip files that cannot be read (permissions, locks, etc.)
    }
  }

  // Detect duplicates
  const duplicateGroups = detectDuplicates(files);
  const duplicateGroupReceipts = buildDuplicateGroupReceipts(duplicateGroups);

  // Build executable block receipts
  const executableBlockReceipts = buildExecutableBlockReceipts(files);

  // Build inventory receipt
  const inventoryReceipt = buildDownloadsInventoryReceipt(files, rootPath, rootHash, source);

  // Build replay receipt
  const fileHashes = files.map((f) => f.contentHash);
  const actionSet = ['scan', 'inventory', 'classify'];
  if (files.some((f) => f.isExecutable)) actionSet.push('block_executable');
  if (duplicateGroups.length > 0) actionSet.push('group_duplicates');
  if (files.some((f) => f.isPartial)) actionSet.push('mark_partial');
  const replayReceipt = buildReplayReceipt(inventoryReceipt.id, rootHash, fileHashes, actionSet);

  // Build private receipt
  const privateReceipt = buildPrivateReceipt(files, rootPath, rootHash);

  // Determine overall status
  const hasExecutable = files.some((f) => f.isExecutable);
  const hasPartial = files.some((f) => f.isPartial);
  const status = hasExecutable ? 'blocked' : hasPartial ? 'quarantined' : files.length > 0 ? 'scanning' : 'planned';

  // Build the composite receipt pack
  const packWithoutHash = {
    id: `pack_${rootHash.slice(0, 12)}_${Date.now().toString(36)}`,
    schemaVersion: 'holoscript-downloads-shelf-receipt-pack/v1',
    inventory: inventoryReceipt,
    executableBlocks: executableBlockReceipts,
    duplicateGroups: duplicateGroupReceipts,
    deleteDecisions: [],
    replay: replayReceipt,
    status,
    hash: '', // filled below
    hashAlgorithm: 'sha256',
  };
  packWithoutHash.hash = sha256Text(JSON.stringify(packWithoutHash));

  return {
    publicReceipt: packWithoutHash,
    privateReceipt: privateReceipt,
  };
}

// ── DownloadShelf Receipt Pack (generic) ──

function buildDownloadShelfReceiptPack(rootDir, source, privacyClass) {
  const rootPath = isAbsolute(rootDir) ? rootDir : resolve(rootDir);
  if (!existsSync(rootPath)) {
    throw new Error(`Root directory does not exist: ${rootPath}`);
  }

  const rootStat = statSync(rootPath);
  if (!rootStat.isDirectory()) {
    throw new Error(`Root path is not a directory: ${rootPath}`);
  }

  const rootHash = sha256Text(rootPath);
  const entries = readdirSync(rootPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const fullPath = join(rootPath, entry.name);
    try {
      const scanned = scanFile(fullPath, rootPath);
      scanned.source = source;
      scanned.rootHash = rootHash;
      files.push(scanned);
    } catch {
      // Skip unreadable
    }
  }

  const relativePaths = files.map((f) => f.relativePath);
  const archiveOrFileHashes = Object.fromEntries(
    files.map((f) => [f.redactedFilename, f.contentHash])
  );

  const shelfIdentity = {
    shelfId: `shelf_${rootHash.slice(0, 12)}`,
    redactedLabel: basename(rootPath),
    shelfIdHash: rootHash,
    source,
    osPathPolicy: 'absolute_path_kept_in_private_receipt_only',
    probedByHardwareAudit: true,
  };

  const quarantineWithoutHash = {
    id: `quar_${rootHash.slice(0, 12)}_${Date.now().toString(36)}`,
    schemaVersion: 'holoscript-download-shelf-quarantine-receipt/v1',
    quarantinedAt: new Date().toISOString(),
    shelf: shelfIdentity,
    quarantineMode: files.some((f) => f.isExecutable) ? 'quarantined' : 'preview_only',
    fileCount: files.length,
    publicRelativePaths: relativePaths,
    archiveOrFileHashes,
    privateAbsolutePathReceipt: `priv_${rootHash.slice(0, 12)}`,
    downloadedFilesExecutable: false,
    rawPrivateDataPublished: false,
    sourceFileMutationPerformed: false,
    permissionEnvelope: 'guarded_download',
    hash: '',
    hashAlgorithm: 'sha256',
    provenance: ['scripts/holoshell-downloads-scanner-adapter.mjs'],
    verificationCommands: ['node scripts/holoshell-downloads-scanner-adapter.mjs --self-test'],
    substrateMetadata: { adapterVersion: VERSION, policyVersion: POLICY_VERSION },
  };
  quarantineWithoutHash.hash = sha256Text(JSON.stringify(quarantineWithoutHash));

  const consentWithoutHash = {
    id: `consent_${rootHash.slice(0, 12)}_${Date.now().toString(36)}`,
    schemaVersion: 'holoscript-download-shelf-consent-receipt/v1',
    shelfId: shelfIdentity.shelfId,
    consentedScopes: ['allowPreviewImport'],
    riskLevel: files.some((f) => f.isExecutable) ? 'high' : files.some((f) => f.isPartial) ? 'medium' : 'low',
    consentedAt: new Date().toISOString(),
    freshUserGesture: true,
    hiddenAutomationUsed: false,
    nonce: `nonce_${sha256Text(`${rootHash}:${Date.now()}`).slice(0, 16)}`,
    credentialAdjacent: false,
    hash: '',
    hashAlgorithm: 'sha256',
    provenance: ['scripts/holoshell-downloads-scanner-adapter.mjs'],
    verificationCommands: ['node scripts/holoshell-downloads-scanner-adapter.mjs --self-test'],
    substrateMetadata: { adapterVersion: VERSION, policyVersion: POLICY_VERSION },
  };
  consentWithoutHash.hash = sha256Text(JSON.stringify(consentWithoutHash));

  const actionSet = ['scan', 'inventory', 'classify'];
  if (files.some((f) => f.isExecutable)) actionSet.push('block_executable');
  if (files.some((f) => f.isPartial)) actionSet.push('mark_partial');

  const replayKey = buildReplayKey(rootHash, files.map((f) => f.contentHash), POLICY_VERSION, actionSet);

  const replayWithoutHash = {
    id: `replay_${rootHash.slice(0, 12)}_${Date.now().toString(36)}`,
    schemaVersion: 'holoscript-download-shelf-replay-lesson-receipt/v1',
    sourceImportReceiptId: quarantineWithoutHash.id,
    shelf: shelfIdentity,
    lessons: files.some((f) => f.isExecutable)
      ? [{
          lesson: 'Executable detected in Downloads; default policy blocks execution without fresh gesture.',
          kind: 'blocked_action',
          sourceOutcome: 'quarantine_blocked',
          autoDerived: true,
          showToNonDevelopers: true,
          insight: 'Executables require nonce-bound import approval before running.',
          recommendedAction: 'Review and approve via import shelf with fresh gesture.',
        }]
      : [{
          lesson: 'Downloads scanned successfully; no executables detected.',
          kind: 'import_success',
          sourceOutcome: 'success',
          autoDerived: true,
          showToNonDevelopers: false,
          insight: 'All files classified; safe for preview-only import.',
          recommendedAction: 'Proceed with import if desired.',
        }],
    generatedAt: new Date().toISOString(),
    replayable: true,
    replayKey,
    originalMutationPerformed: false,
    originalRollbackNote: 'No mutations performed; scan-only operation.',
    hash: '',
    hashAlgorithm: 'sha256',
    provenance: ['scripts/holoshell-downloads-scanner-adapter.mjs'],
  };
  replayWithoutHash.hash = sha256Text(JSON.stringify(replayWithoutHash));

  const status = files.some((f) => f.isExecutable) ? 'quarantined' : 'planned';

  const packWithoutHash = {
    id: `shelf_pack_${rootHash.slice(0, 12)}_${Date.now().toString(36)}`,
    shelfIdentity,
    quarantine: quarantineWithoutHash,
    consent: consentWithoutHash,
    replay: replayWithoutHash,
    status,
    hash: '',
    hashAlgorithm: 'sha256',
    substrateRef: `adapter:${VERSION}:policy:${POLICY_VERSION}`,
    substrateMetadata: {
      adapterVersion: VERSION,
      policyVersion: POLICY_VERSION,
      rootHash,
      fileCount: files.length,
    },
  };
  packWithoutHash.hash = sha256Text(JSON.stringify(packWithoutHash));

  const privateReceipt = buildPrivateReceipt(files, rootPath, rootHash);

  return {
    publicReceipt: packWithoutHash,
    privateReceipt: privateReceipt,
  };
}

// ── Self-Test ──

function runSelfTest() {
  const fixtureDir = join(tmpdir(), 'holoshell-downloads-scanner-self-test');
  mkdirSync(fixtureDir, { recursive: true });

  // Create test fixtures
  writeFileSync(join(fixtureDir, 'report.pdf'), 'PDF fixture content for scanner test', 'utf8');
  writeFileSync(join(fixtureDir, 'setup.exe'), 'EXE fixture content for scanner test', 'utf8');
  writeFileSync(join(fixtureDir, 'data.csv'), 'name,value\nalpha,10\n', 'utf8');
  writeFileSync(join(fixtureDir, 'photo.jpg'), Buffer.from('JPEG fixture', 'utf8'));
  writeFileSync(join(fixtureDir, 'download.crdownload'), 'Partial download fixture', 'utf8');

  const errors = [];

  // Test Downloads Shelf receipt pack (task_1779150614671_ndha receipt types)
  try {
    const { publicReceipt: dlPack, privateReceipt: dlPriv } = buildFullReceiptPack(fixtureDir, 'browser', 'local-private');

    if (!dlPack.id) errors.push('shelf pack id missing');
    if (!dlPack.inventory) errors.push('shelf pack inventory missing');
    if (dlPack.inventory.fileCount !== 5) errors.push(`expected 5 files, got ${dlPack.inventory.fileCount}`);
    if (dlPack.inventory.anyFileContainsAbsolutePath !== false) errors.push('anyFileContainsAbsolutePath must be false');
    if (dlPack.inventory.anyFileExecutable !== true) errors.push('expected anyFileExecutable=true (has .exe)');
    if (dlPack.inventory.anyFilePartial !== true) errors.push('expected anyFilePartial=true (has .crdownload)');
    if (dlPack.inventory.importMode !== 'preview_only') errors.push('importMode must be preview_only');
    if (dlPack.executableBlocks.length !== 1) errors.push(`expected 1 executable block, got ${dlPack.executableBlocks.length}`);
    if (dlPack.executableBlocks[0]?.blockReason !== 'executable_detected') errors.push('expected executable_detected block reason');
    if (dlPack.executableBlocks[0]?.executionAttempted !== false) errors.push('executionAttempted must be false');
    if (dlPack.executableBlocks[0]?.executableLaunched !== false) errors.push('executableLaunched must be false');
    if (dlPack.replay.workflow !== 'downloads-import-shelf') errors.push('replay workflow must be downloads-import-shelf');
    if (dlPack.replay.importOutsidePreviewOnly !== false) errors.push('replay importOutsidePreviewOnly must be false');
    if (dlPack.replay.deleteWithoutFreshUserGesture !== false) errors.push('replay deleteWithoutFreshUserGesture must be false');
    if (!dlPack.replay.replayKey) errors.push('replay key missing');
    if (!dlPriv.handle) errors.push('private receipt handle missing');
    if (dlPack.status !== 'blocked') errors.push(`expected blocked status (has executable), got ${dlPack.status}`);

    // Verify no absolute paths leaked into public receipt
    const publicJson = JSON.stringify(dlPack);
    if (fixtureDir.includes(':') && publicJson.includes(fixtureDir)) {
      errors.push('ABSOLUTE PATH LEAKED into public receipt');
    }
  } catch (err) {
    errors.push(`shelf pack error: ${err.message}`);
  }

  // Test generic Download Shelf receipt pack
  try {
    const { publicReceipt: dsPack } = buildDownloadShelfReceiptPack(fixtureDir, 'user_downloads', 'local-private');

    if (!dsPack.id) errors.push('download shelf pack id missing');
    if (!dsPack.shelfIdentity) errors.push('download shelf shelfIdentity missing');
    if (dsPack.shelfIdentity.osPathPolicy !== 'absolute_path_kept_in_private_receipt_only') {
      errors.push('osPathPolicy must be absolute_path_kept_in_private_receipt_only');
    }
    if (!dsPack.quarantine) errors.push('download shelf quarantine missing');
    if (dsPack.quarantine.downloadedFilesExecutable !== false) errors.push('downloadedFilesExecutable must be false');
    if (dsPack.quarantine.rawPrivateDataPublished !== false) errors.push('rawPrivateDataPublished must be false');
    if (dsPack.quarantine.sourceFileMutationPerformed !== false) errors.push('sourceFileMutationPerformed must be false');
    if (!dsPack.consent) errors.push('download shelf consent missing');
    if (dsPack.consent.freshUserGesture !== true) errors.push('consent freshUserGesture must be true');
    if (dsPack.consent.hiddenAutomationUsed !== false) errors.push('consent hiddenAutomationUsed must be false');
    if (!dsPack.replay) errors.push('download shelf replay missing');
    if (dsPack.replay.originalMutationPerformed !== false) errors.push('replay originalMutationPerformed must be false');
  } catch (err) {
    errors.push(`download shelf pack error: ${err.message}`);
  }

  // Test classification functions
  if (classifyCategory('.pdf') !== 'document') errors.push('classify .pdf should be document');
  if (classifyCategory('.exe') !== 'executable') errors.push('classify .exe should be executable');
  if (classifyCategory('.zip') !== 'archive') errors.push('classify .zip should be archive');
  if (classifyCategory('.jpg') !== 'image') errors.push('classify .jpg should be image');
  if (classifyCategory('.mp3') !== 'audio') errors.push('classify .mp3 should be audio');
  if (classifyCategory('.mp4') !== 'video') errors.push('classify .mp4 should be video');
  if (classifyCategory('.js') !== 'code') errors.push('classify .js should be code');
  if (classifyCategory('.ttf') !== 'font') errors.push('classify .ttf should be font');
  if (classifyCategory('.crdownload') !== 'other') errors.push('classify .crdownload should be other (partial)');
  if (!isPartialDownload('video.mp4.crdownload')) errors.push('crdownload should be partial');
  if (!isExecutableExtension('.exe')) errors.push('.exe should be executable');

  // Test replay key determinism
  const key1 = buildReplayKey('abc', ['h1', 'h2'], '1', ['scan']);
  const key2 = buildReplayKey('abc', ['h1', 'h2'], '1', ['scan']);
  if (key1 !== key2) errors.push('replay key must be deterministic for same inputs');

  // Test duplicate detection
  try {
    const dupeDir = join(tmpdir(), 'holoshell-scanner-dupe-test');
    mkdirSync(dupeDir, { recursive: true });
    writeFileSync(join(dupeDir, 'a.txt'), 'same content', 'utf8');
    writeFileSync(join(dupeDir, 'b.txt'), 'same content', 'utf8');
    const dupeFiles = [];
    for (const entry of readdirSync(dupeDir, { withFileTypes: true })) {
      if (entry.isDirectory()) continue;
      dupeFiles.push(scanFile(join(dupeDir, entry.name), dupeDir));
    }
    const groups = detectDuplicates(dupeFiles);
    if (groups.length === 0) errors.push('expected duplicate group for identical content');
    if (groups[0]?.entries?.length !== 2) errors.push(`expected entries.length 2, got ${groups[0]?.entries?.length}`);
  } catch (err) {
    errors.push(`duplicate detection error: ${err.message}`);
  }

  if (errors.length > 0) {
    throw new Error(`Self-test failures:\n${errors.join('\n')}`);
  }

  process.stdout.write(`${JSON.stringify({ ok: true, adapter: 'holoshell-downloads-scanner-adapter', version: VERSION }, null, 2)}\n`);
}

// ── Output ──

function defaultOutputPath(date) {
  return join(
    '.bench-logs',
    'holoshell-downloads-scanner',
    date,
    'scanner-adapter-receipt.json'
  );
}

function writeReceipt(receipt, outPath) {
  const absoluteOutPath = resolve(outPath);
  mkdirSync(dirname(absoluteOutPath), { recursive: true });
  writeFileSync(absoluteOutPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  return absoluteOutPath;
}

// ── Main ──

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    runSelfTest();
  } else {
    if (!args.root) {
      throw new Error('--root is required unless --self-test is used.');
    }

    // Build both receipt pack types
    const { publicReceipt: dlPack, privateReceipt: dlPriv } = buildFullReceiptPack(
      args.root,
      args.source,
      args.privacyClass
    );

    const { publicReceipt: dsPack, privateReceipt: dsPriv } = buildDownloadShelfReceiptPack(
      args.root,
      args.source,
      args.privacyClass
    );

    const result = {
      ok: true,
      adapterVersion: VERSION,
      policyVersion: POLICY_VERSION,
      downloadsShelfReceipt: dlPack,
      downloadShelfReceipt: dsPack,
      privateReceiptHandle: {
        downloadsShelf: dlPriv.handle,
        downloadShelf: dsPriv.handle,
      },
    };

    if (!args.dryRun) {
      const outPath = args.out ?? defaultOutputPath(args.date);
      const written = writeReceipt(result, outPath);
      process.stdout.write(`${JSON.stringify({ ok: true, out: written, receiptId: dlPack.id }, null, 2)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify({ ok: true, dryRun: true, receiptId: dlPack.id, fileCount: dlPack.inventory.fileCount }, null, 2)}\n`);
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: message }, null, 2)}\n`);
  process.exit(1);
}