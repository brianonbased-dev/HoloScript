#!/usr/bin/env node
/* global console, process */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { pathToFileURL } from 'node:url';

import { scanStaleSurfaces } from './hololand-stale-surface-inventory.mjs';

const DEFAULT_REMOTE = 'username@holojetson.local';
const DEFAULT_REMOTE_DIR = '/mnt/nvme/archives/hololand/2026-06-29-reboot';
const DEFAULT_OUTPUT_DIR = '.tmp/hololand/jetson-archive';
const DEFAULT_MANIFEST = 'docs/audits/hololand-jetson-archive-2026-06-29-reboot.json';

function normalizePath(path) {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    paths: [],
    fromStaleInventory: false,
    execute: false,
    json: false,
    selfTest: false,
    outputDir: DEFAULT_OUTPUT_DIR,
    manifest: DEFAULT_MANIFEST,
    remote: DEFAULT_REMOTE,
    remoteDir: DEFAULT_REMOTE_DIR,
    sshKey: process.env.JETSON_SSH_KEY || join(process.env.USERPROFILE || '', '.ssh', 'jetson_ed25519'),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      args.root = argv[index + 1];
      index += 1;
    } else if (arg === '--paths') {
      args.paths = argv[index + 1].split(',').map((path) => path.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--from-stale-inventory') {
      args.fromStaleInventory = true;
    } else if (arg === '--execute') {
      args.execute = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--output-dir') {
      args.outputDir = argv[index + 1];
      index += 1;
    } else if (arg === '--manifest') {
      args.manifest = argv[index + 1];
      index += 1;
    } else if (arg === '--remote') {
      args.remote = argv[index + 1];
      index += 1;
    } else if (arg === '--remote-dir') {
      args.remoteDir = argv[index + 1];
      index += 1;
    } else if (arg === '--ssh-key') {
      args.sshKey = argv[index + 1];
      index += 1;
    } else if (arg === '--self-test') {
      args.selfTest = true;
    }
  }

  return args;
}

function runGit(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function runCommand(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

export function validateRelativeArchivePath(inputPath) {
  const normalized = normalizePath(inputPath);
  if (!normalized || normalized === '.') {
    throw new Error(`Invalid archive path: ${inputPath}`);
  }
  if (isAbsolute(normalized) || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Archive path must stay inside the repo: ${inputPath}`);
  }
  if (normalized.startsWith('.git/') || normalized === '.git') {
    throw new Error(`Refusing to archive git internals: ${inputPath}`);
  }

  return normalized;
}

function candidatePathsFromInventory(root) {
  const report = scanStaleSurfaces({ root });
  return report.surfaces
    .filter((surface) => surface.status === 'jetson-archive-candidate')
    .map((surface) => surface.path);
}

function countLocalFiles(root, archivePath) {
  const absolutePath = join(root, archivePath);
  if (!existsSync(absolutePath)) return 0;
  const stats = statSync(absolutePath);
  if (stats.isFile()) return 1;
  if (!stats.isDirectory()) return 0;

  let count = 0;
  for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
    const childPath = normalizePath(join(archivePath, entry.name));
    if (entry.isDirectory()) {
      count += countLocalFiles(root, childPath);
    } else if (entry.isFile()) {
      count += 1;
    }
  }
  return count;
}

function inspectArchivePath(root, archivePath) {
  const trackedFiles = runGit(root, ['ls-files', '--', archivePath])
    .split(/\r?\n/)
    .filter(Boolean);

  const dirty = runGit(root, ['status', '--porcelain=v1', '--', archivePath])
    .split(/\r?\n/)
    .filter(Boolean);
  if (trackedFiles.length > 0 && dirty.length > 0) {
    throw new Error(`Refusing to archive dirty path: ${archivePath}\n${dirty.join('\n')}`);
  }

  const localFiles = trackedFiles.length > 0
    ? trackedFiles.length
    : countLocalFiles(root, archivePath);

  if (trackedFiles.length === 0 && localFiles === 0) {
    throw new Error(`Refusing to archive missing path: ${archivePath}`);
  }

  return { trackedFiles, localFiles, dirty };
}

function sha256File(path) {
  const hash = createHash('sha256');
  hash.update(readFileSync(path));
  return hash.digest('hex');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function resolveInside(root, outputPath) {
  const resolvedRoot = resolve(root);
  const resolved = resolve(root, outputPath);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`Path escapes repo: ${outputPath}`);
  }
  return resolved;
}

export function buildArchivePlan(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const explicitPaths = options.paths?.length ? options.paths : null;
  const paths = (explicitPaths ?? candidatePathsFromInventory(root))
    .map(validateRelativeArchivePath)
    .sort();

  if (paths.length === 0) {
    throw new Error('No archive paths selected');
  }

  const preRemovalCommit = runGit(root, ['rev-parse', 'HEAD']);
  const shortCommit = runGit(root, ['rev-parse', '--short=12', 'HEAD']);
  const selected = paths.map((archivePath) => {
    const inspected = inspectArchivePath(root, archivePath);
    const absolutePath = join(root, archivePath);
    const localOnly = inspected.trackedFiles.length === 0;
    return {
      path: archivePath,
      trackedFiles: inspected.trackedFiles.length,
      localFiles: inspected.localFiles,
      localOnly,
      exists: existsSync(absolutePath),
      restoreCommand: localOnly
        ? `tar -xzf <archive> -C <repo> ${archivePath}`
        : `git checkout ${preRemovalCommit} -- ${archivePath}`,
    };
  });

  const outputDir = resolveInside(root, options.outputDir ?? DEFAULT_OUTPUT_DIR);
  const manifestPath = resolveInside(root, options.manifest ?? DEFAULT_MANIFEST);
  const remoteDir = options.remoteDir ?? DEFAULT_REMOTE_DIR;
  const remoteManifestPath = `${remoteDir.replace(/\/$/, '')}/${basename(manifestPath)}`;
  const archiveBaseName = options.archiveBaseName ?? `hololand-stale-surfaces-${shortCommit}`;
  const artifacts = [];
  const trackedPaths = selected.filter((item) => !item.localOnly).map((item) => item.path);
  const localOnlyPaths = selected.filter((item) => item.localOnly).map((item) => item.path);

  if (trackedPaths.length > 0) {
    const archiveName = `${archiveBaseName}.tracked.tar.gz`;
    artifacts.push({
      kind: 'tracked',
      archiveName,
      archivePath: join(outputDir, archiveName),
      remotePath: `${remoteDir.replace(/\/$/, '')}/${archiveName}`,
      paths: trackedPaths,
    });
  }

  if (localOnlyPaths.length > 0) {
    const archiveName = `${archiveBaseName}.local.tar.gz`;
    artifacts.push({
      kind: 'local-only',
      archiveName,
      archivePath: join(outputDir, archiveName),
      remotePath: `${remoteDir.replace(/\/$/, '')}/${archiveName}`,
      paths: localOnlyPaths,
    });
  }

  return {
    schema: 'hololand-jetson-archive-plan/v0.1.0',
    root,
    preRemovalCommit,
    selected,
    outputDir,
    archiveBaseName,
    artifacts,
    manifestPath,
    remote: options.remote ?? DEFAULT_REMOTE,
    remoteDir,
    remoteManifestPath,
    sshKey: options.sshKey ?? join(process.env.USERPROFILE || '', '.ssh', 'jetson_ed25519'),
  };
}

async function createArchive(plan) {
  mkdirSync(plan.outputDir, { recursive: true });
  const archivedArtifacts = [];

  for (const artifact of plan.artifacts) {
    if (existsSync(artifact.archivePath)) rmSync(artifact.archivePath, { force: true });

    if (artifact.kind === 'tracked') {
      const tarPath = artifact.archivePath.replace(/\.gz$/i, '');
      if (existsSync(tarPath)) rmSync(tarPath, { force: true });
      runGit(plan.root, [
        'archive',
        '--format=tar',
        '--output',
        tarPath,
        plan.preRemovalCommit,
        '--',
        ...artifact.paths,
      ]);
      await pipeline(
        createReadStream(tarPath),
        createGzip({ level: 9 }),
        createWriteStream(artifact.archivePath),
      );
      rmSync(tarPath, { force: true });
    } else {
      runCommand('tar', [
        '-czf',
        artifact.archivePath,
        '-C',
        plan.root,
        ...artifact.paths,
      ]);
    }

    archivedArtifacts.push({
      kind: artifact.kind,
      archiveName: artifact.archiveName,
      localPath: artifact.archivePath,
      remotePath: artifact.remotePath,
      paths: artifact.paths,
      bytes: statSync(artifact.archivePath).size,
      sha256: sha256File(artifact.archivePath),
    });
  }

  return { artifacts: archivedArtifacts };
}

function uploadAndVerify(plan, archive) {
  const sshArgs = [];
  const scpArgs = [];
  if (plan.sshKey) {
    sshArgs.push('-i', plan.sshKey);
    scpArgs.push('-i', plan.sshKey);
  }

  runCommand('ssh', [
    ...sshArgs,
    plan.remote,
    `mkdir -p ${shellQuote(plan.remoteDir)}`,
  ]);

  const verifications = [];
  for (const artifact of archive.artifacts) {
    runCommand('scp', [
      ...scpArgs,
      artifact.localPath,
      `${plan.remote}:${artifact.remotePath}`,
    ]);

    const remoteSha = runCommand('ssh', [
      ...sshArgs,
      plan.remote,
      `sha256sum ${shellQuote(artifact.remotePath)} | awk '{print $1}'`,
    ]);
    const remoteBytes = Number(runCommand('ssh', [
      ...sshArgs,
      plan.remote,
      `stat -c '%s' ${shellQuote(artifact.remotePath)}`,
    ]));

    if (remoteSha !== artifact.sha256) {
      throw new Error(`Remote SHA mismatch for ${artifact.archiveName}: local=${artifact.sha256} remote=${remoteSha}`);
    }
    if (remoteBytes !== artifact.bytes) {
      throw new Error(`Remote byte mismatch for ${artifact.archiveName}: local=${artifact.bytes} remote=${remoteBytes}`);
    }

    verifications.push({
      archiveName: artifact.archiveName,
      remotePath: artifact.remotePath,
      sha256: remoteSha,
      bytes: remoteBytes,
      verified: true,
    });
  }

  return verifications;
}

function writeManifest(plan, archive, remoteVerification) {
  const trackedPaths = plan.selected.filter((item) => !item.localOnly).map((item) => item.path);
  const restoreCommands = [];
  if (trackedPaths.length > 0) {
    restoreCommands.push(`git checkout ${plan.preRemovalCommit} -- ${trackedPaths.join(' ')}`);
  }
  for (const artifact of archive.artifacts) {
    restoreCommands.push(`scp ${plan.remote}:${artifact.remotePath} .tmp/hololand/restore/${artifact.archiveName}`);
    restoreCommands.push(`tar -xzf .tmp/hololand/restore/${artifact.archiveName} -C ${plan.root}`);
  }

  const receipt = {
    schema: 'hololand-jetson-archive-receipt/v0.1.0',
    generatedAt: new Date().toISOString(),
    purpose: 'Archive HoloLand 60-day stale source surfaces before removing them from active source.',
    preRemovalCommit: plan.preRemovalCommit,
    archives: archive.artifacts.map((artifact) => ({
      kind: artifact.kind,
      localPath: normalizePath(relative(plan.root, artifact.localPath)),
      remote: plan.remote,
      remotePath: artifact.remotePath,
      paths: artifact.paths,
      bytes: artifact.bytes,
      sha256: artifact.sha256,
      remoteVerification: remoteVerification.find((item) => item.archiveName === artifact.archiveName),
    })),
    manifest: {
      localPath: normalizePath(relative(plan.root, plan.manifestPath)),
      remotePath: plan.remoteManifestPath,
    },
    archivedPaths: plan.selected,
    restoreCommands,
  };

  mkdirSync(dirname(plan.manifestPath), { recursive: true });
  writeFileSync(plan.manifestPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  const scpArgs = [];
  if (plan.sshKey) scpArgs.push('-i', plan.sshKey);
  runCommand('scp', [
    ...scpArgs,
    plan.manifestPath,
    `${plan.remote}:${plan.remoteManifestPath}`,
  ]);

  return receipt;
}

async function runArchive(options = {}) {
  const plan = buildArchivePlan(options);
  if (!options.execute) {
    return {
      schema: 'hololand-jetson-archive-dry-run/v0.1.0',
      generatedAt: new Date().toISOString(),
      plan: {
        ...plan,
        sshKey: plan.sshKey ? '<configured>' : null,
      },
    };
  }

  const archive = await createArchive(plan);
  const remoteVerification = uploadAndVerify(plan, archive);
  return writeManifest(plan, archive, remoteVerification);
}

async function runSelfTest() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'hololand-jetson-archive-'));
  runCommand('git', ['init'], { cwd: tempRoot });
  writeFileSync(join(tempRoot, 'package.json'), '{"type":"module"}\n', 'utf8');
  mkdirSync(join(tempRoot, 'examples', 'stale'), { recursive: true });
  writeFileSync(join(tempRoot, 'examples', 'stale', 'main.ts'), 'export const stale = true;\n', 'utf8');
  mkdirSync(join(tempRoot, 'examples', 'generated'), { recursive: true });
  writeFileSync(join(tempRoot, 'examples', 'generated', 'out.ts'), 'export const generated = true;\n', 'utf8');
  runCommand('git', ['add', '.'], { cwd: tempRoot });
  runCommand('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'fixture'], { cwd: tempRoot });
  writeFileSync(join(tempRoot, 'examples', 'generated-local.txt'), 'local only\n', 'utf8');

  const plan = buildArchivePlan({
    root: tempRoot,
    paths: ['examples/stale', 'examples/generated-local.txt'],
    outputDir: '.tmp/archive',
    manifest: 'docs/archive-receipt.json',
    remote: 'example@jetson',
    remoteDir: '/mnt/nvme/archives/test',
    sshKey: '',
  });

  if (plan.selected.length !== 2) throw new Error('self-test expected two paths');
  if (!plan.selected.some((item) => item.restoreCommand.includes('examples/stale'))) {
    throw new Error('self-test restore command missing archive path');
  }
  if (!plan.selected.some((item) => item.localOnly && item.path === 'examples/generated-local.txt')) {
    throw new Error('self-test expected local-only archive path');
  }
  try {
    validateRelativeArchivePath('../escape');
    throw new Error('self-test expected path escape rejection');
  } catch (error) {
    if (!String(error.message).includes('inside the repo')) throw error;
  }

  console.log('[hololand-jetson-archive] self-test ok');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfTest) {
    await runSelfTest();
    process.exit(0);
  }

  const result = await runArchive(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (args.execute) {
    console.log(`Archived ${result.archivedPaths.length} paths to ${result.archives.length} Jetson archives`);
    for (const archive of result.archives) {
      console.log(`${archive.kind}: ${archive.remotePath}`);
      console.log(`sha256 ${archive.sha256}`);
    }
    console.log(`manifest ${result.manifest.localPath}`);
  } else {
    console.log(`Dry run: ${result.plan.selected.length} paths selected`);
    for (const artifact of result.plan.artifacts) {
      console.log(`${artifact.kind} archive ${artifact.remotePath}`);
    }
    console.log(`manifest ${normalizePath(relative(result.plan.root, result.plan.manifestPath))}`);
  }
}
