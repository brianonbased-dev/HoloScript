#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeterministicZip } from './lib/deterministic-zip.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SYSTEMS_DIR = join(ROOT, 'distributions', 'systems');
const NATIVE_DIR = join(SYSTEMS_DIR, 'native', 'win32-x64');
const WASM_DIR = join(SYSTEMS_DIR, 'wasm');
const ARTIFACT_DIR = join(ROOT, 'artifacts', 'releases', '0.1.0');
const CANONICAL_MANIFEST_PATH = join(
  ROOT,
  'scripts',
  'holo-ci',
  'systems-preview-release-manifest.json'
);
const SOURCE_PATHS = [
  'Cargo.toml',
  'Cargo.lock',
  'packages/compiler-native/Cargo.toml',
  'packages/compiler-native/src',
  'packages/compiler-wasm/Cargo.toml',
  'packages/compiler-wasm/src',
  'distributions/systems/package.json',
  'distributions/systems/index.mjs',
  'distributions/systems/index.d.ts',
  'distributions/systems/bin',
  'distributions/systems/conformance',
  'distributions/systems/scripts',
  'scripts/holo-ci/build-systems-preview-artifacts.mjs',
  'scripts/holo-ci/lib/deterministic-zip.mjs',
  'scripts/holo-ci/systems-preview-release-manifest.json',
];

const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const sourceCommitIndex = args.indexOf('--source-commit');

function fail(message) {
  if (jsonOutput) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  else console.error(`[systems-preview-build] ${message}`);
  process.exit(1);
}

function run(command, commandArgs, { cwd = ROOT, timeout = 1_200_000, capture = false } = {}) {
  const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
  const result = spawnSync(executable, commandArgs, {
    cwd,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: false,
    timeout,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? String(result.stderr || result.stdout || '').trim() : '';
    throw new Error(
      `${command} ${commandArgs.join(' ')} exited ${result.status}${detail ? `: ${detail}` : ''}`
    );
  }
  return capture ? String(result.stdout || '').trim() : '';
}

function git(argsToRun, options = {}) {
  return run('git', argsToRun, { ...options, capture: true });
}

function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

function sha256File(path) {
  return sha256(readFileSync(path));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function commandVersion(command, versionArgs = ['--version']) {
  try {
    return run(command, versionArgs, { capture: true, timeout: 30_000 }).split(/\r?\n/u)[0];
  } catch {
    return null;
  }
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function posixRelative(root, path) {
  return relative(root, path).split(sep).join('/');
}

function checksumLines(root, paths) {
  return (
    paths
      .map((path) => ({ path, relative: posixRelative(root, path) }))
      .sort((left, right) => left.relative.localeCompare(right.relative, 'en'))
      .map((entry) => `${sha256File(entry.path)}  ${entry.relative}`)
      .join('\n') + '\n'
  );
}

function resolveWasmPack() {
  if (process.env.WASM_PACK) return process.env.WASM_PACK;
  const homeCandidate = join(
    homedir(),
    '.cargo',
    'bin',
    process.platform === 'win32' ? 'wasm-pack.exe' : 'wasm-pack'
  );
  return existsSync(homeCandidate) ? homeCandidate : 'wasm-pack';
}

function ensureCleanSource() {
  for (const mode of [[], ['--cached']]) {
    const result = spawnSync('git', ['diff', '--quiet', ...mode, '--', ...SOURCE_PATHS], {
      cwd: ROOT,
      stdio: 'ignore',
      windowsHide: true,
    });
    if (result.status !== 0) {
      const label = mode.length ? 'staged' : 'working-tree';
      fail(`release source paths have ${label} changes; commit the source layer before assembly`);
    }
  }
}

let sourceCommit;
try {
  sourceCommit = sourceCommitIndex >= 0 ? args[sourceCommitIndex + 1] : git(['rev-parse', 'HEAD']);
  if (!/^[0-9a-f]{40}$/u.test(String(sourceCommit || ''))) {
    fail('--source-commit must resolve to a full 40-character Git commit');
  }
  git(['cat-file', '-e', `${sourceCommit}^{commit}`]);
  const head = git(['rev-parse', 'HEAD']);
  if (sourceCommit !== head) fail(`source commit ${sourceCommit} must equal current HEAD ${head}`);
  ensureCleanSource();
} catch (error) {
  fail(error.message);
}

const canonical = JSON.parse(readFileSync(CANONICAL_MANIFEST_PATH, 'utf8'));
const packageManifest = JSON.parse(readFileSync(join(SYSTEMS_DIR, 'package.json'), 'utf8'));
if (
  canonical.releaseIdentity?.version !== '0.1.0' ||
  packageManifest.name !== '@holoscript/systems' ||
  packageManifest.version !== '0.1.0'
) {
  fail('canonical and package identities must both remain HoloScript Systems 0.1.0');
}

const temp = mkdtempSync(join(tmpdir(), 'holoscript-systems-build-'));
const wasmTemp = join(temp, 'wasm');
const secondPackDir = join(temp, 'second-pack');
const wasmPack = resolveWasmPack();
const commands = [];

try {
  rmSync(NATIVE_DIR, { recursive: true, force: true });
  rmSync(WASM_DIR, { recursive: true, force: true });
  rmSync(ARTIFACT_DIR, { recursive: true, force: true });
  mkdirSync(NATIVE_DIR, { recursive: true });
  mkdirSync(WASM_DIR, { recursive: true });
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  mkdirSync(wasmTemp, { recursive: true });
  mkdirSync(secondPackDir, { recursive: true });

  commands.push('cargo build --release -p holoscript-native --bin holoscriptc');
  run('cargo', ['build', '--release', '-p', 'holoscript-native', '--bin', 'holoscriptc']);
  const nativeSource = join(
    ROOT,
    'target',
    'release',
    process.platform === 'win32' ? 'holoscriptc.exe' : 'holoscriptc'
  );
  if (!existsSync(nativeSource))
    throw new Error(`native compiler output is missing: ${nativeSource}`);
  const nativeTarget = join(NATIVE_DIR, 'holoscriptc.exe');
  copyFileSync(nativeSource, nativeTarget);

  const relativeWasmOut = relative(join(ROOT, 'packages', 'compiler-wasm'), wasmTemp);
  commands.push(`${basename(wasmPack)} build --release --target nodejs --out-dir <temp>`);
  run(wasmPack, ['build', '--release', '--target', 'nodejs', '--out-dir', relativeWasmOut], {
    cwd: join(ROOT, 'packages', 'compiler-wasm'),
  });

  for (const file of [
    'holoscript_wasm.js',
    'holoscript_wasm.d.ts',
    'holoscript_wasm_bg.wasm',
    'holoscript_wasm_bg.wasm.d.ts',
    'package.json',
  ]) {
    const source = join(wasmTemp, file);
    if (!existsSync(source)) throw new Error(`WASM package output is missing: ${source}`);
    copyFileSync(source, join(WASM_DIR, file));
  }
  writeFileSync(
    join(WASM_DIR, 'index.cjs'),
    "'use strict';\n\nmodule.exports = require('./holoscript_wasm.js');\n"
  );

  const embeddedArtifactDigests = {
    'native/win32-x64/holoscriptc.exe': sha256File(nativeTarget),
    'wasm/holoscript_wasm_bg.wasm': sha256File(join(WASM_DIR, 'holoscript_wasm_bg.wasm')),
  };
  const embeddedManifest = {
    schema: 'holoscript.systems-artifact-envelope/v1',
    releaseManifestSchema: canonical.schema,
    canonicalManifestSha256: sha256(readFileSync(CANONICAL_MANIFEST_PATH)),
    distributionId: canonical.releaseIdentity.distributionId,
    version: canonical.releaseIdentity.version,
    channel: canonical.releaseIdentity.channel,
    machineContract: canonical.supportedSurface.minimumMachineContract,
    hostPlatform: 'win32-x64',
    sourceCommit,
    components: Object.fromEntries(
      canonical.components.map((component) => [
        component.id,
        `${component.name}@${component.version}`,
      ])
    ),
    embeddedArtifactDigests,
  };
  const embeddedManifestPath = join(SYSTEMS_DIR, 'release-manifest.json');
  writeJson(embeddedManifestPath, embeddedManifest);

  const packageChecksumPaths = [
    ...listFiles(join(SYSTEMS_DIR, 'bin')),
    ...listFiles(join(SYSTEMS_DIR, 'conformance')),
    ...listFiles(NATIVE_DIR),
    ...listFiles(WASM_DIR),
    ...[
      'package.json',
      'index.mjs',
      'index.d.ts',
      'release-manifest.json',
      'README.md',
      'LICENSE',
    ].map((file) => join(SYSTEMS_DIR, file)),
  ];
  writeFileSync(join(SYSTEMS_DIR, 'SHA256SUMS'), checksumLines(SYSTEMS_DIR, packageChecksumPaths));
  run('node', ['scripts/verify-package.mjs'], { cwd: SYSTEMS_DIR, timeout: 60_000 });

  const nativeArchiveSums =
    [
      `${sha256File(join(SYSTEMS_DIR, 'LICENSE'))}  LICENSE`,
      `${sha256File(nativeTarget)}  holoscriptc.exe`,
      `${sha256File(embeddedManifestPath)}  release-manifest.json`,
    ].join('\n') + '\n';
  const nativeEntries = [
    { name: 'holoscriptc.exe', data: readFileSync(nativeTarget) },
    { name: 'release-manifest.json', data: readFileSync(embeddedManifestPath) },
    { name: 'LICENSE', data: readFileSync(join(SYSTEMS_DIR, 'LICENSE')) },
    { name: 'SHA256SUMS', data: Buffer.from(nativeArchiveSums) },
  ];
  const nativeZip = createDeterministicZip(nativeEntries);
  const nativeZipRepeat = createDeterministicZip([...nativeEntries].reverse());
  if (sha256(nativeZip) !== sha256(nativeZipRepeat)) {
    throw new Error('native archive is not deterministic across input ordering');
  }
  const nativeArchivePath = join(
    ARTIFACT_DIR,
    'holoscript-systems-v0.1.0-x86_64-pc-windows-msvc.zip'
  );
  writeFileSync(nativeArchivePath, nativeZip);

  commands.push('npm pack --json --pack-destination artifacts/releases/0.1.0');
  const firstPack = JSON.parse(
    run('npm', ['pack', '--json', '--pack-destination', ARTIFACT_DIR], {
      cwd: SYSTEMS_DIR,
      capture: true,
      timeout: 300_000,
    })
  );
  const tarballName = firstPack?.[0]?.filename;
  if (!tarballName) throw new Error('npm pack did not report a tarball filename');
  const npmTarballPath = join(ARTIFACT_DIR, tarballName);
  const secondPack = JSON.parse(
    run('npm', ['pack', '--json', '--pack-destination', secondPackDir], {
      cwd: SYSTEMS_DIR,
      capture: true,
      timeout: 300_000,
    })
  );
  const secondTarballPath = join(secondPackDir, secondPack?.[0]?.filename || '');
  if (!existsSync(npmTarballPath) || !existsSync(secondTarballPath)) {
    throw new Error('npm pack did not create both determinism candidates');
  }
  if (sha256File(npmTarballPath) !== sha256File(secondTarballPath)) {
    throw new Error('npm tarball is not byte-deterministic across consecutive packs');
  }

  const wasmArtifactPath = join(ARTIFACT_DIR, 'holoscript-systems-v0.1.0-wasm.wasm');
  copyFileSync(join(WASM_DIR, 'holoscript_wasm_bg.wasm'), wasmArtifactPath);

  const artifacts = [npmTarballPath, nativeArchivePath, wasmArtifactPath].map((path) => ({
    path: posixRelative(ROOT, path),
    bytes: statSync(path).size,
    sha256: sha256File(path),
  }));
  const receipt = {
    schema: 'holoscript.systems-preview-build-receipt/v1',
    generatedAt: new Date().toISOString(),
    ok: true,
    distributionId: canonical.releaseIdentity.distributionId,
    version: canonical.releaseIdentity.version,
    machineContract: canonical.supportedSurface.minimumMachineContract,
    sourceCommit,
    sourceTreeClean: true,
    host: { platform: process.platform, arch: process.arch },
    toolchain: {
      node: process.version,
      npm: commandVersion('npm'),
      rustc: commandVersion('rustc'),
      cargo: commandVersion('cargo'),
      wasmPack: commandVersion(wasmPack),
    },
    commands,
    deterministicRebuilds: { npmTarball: true, nativeArchive: true },
    embeddedArtifactDigests,
    artifacts,
  };
  const receiptPath = join(ARTIFACT_DIR, 'systems-preview-build-receipt.json');
  writeJson(receiptPath, receipt);

  const output = {
    ok: true,
    sourceCommit,
    receipt: posixRelative(ROOT, receiptPath),
    receiptSha256: sha256File(receiptPath),
    artifacts,
  };
  if (jsonOutput) console.log(JSON.stringify(output, null, 2));
  else {
    console.log(`[systems-preview-build] PASS ${sourceCommit}`);
    for (const artifact of artifacts) {
      console.log(`[systems-preview-build] ${artifact.sha256}  ${artifact.path}`);
    }
    console.log(`[systems-preview-build] receipt ${output.receiptSha256}  ${output.receipt}`);
  }
} catch (error) {
  fail(error.message);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
