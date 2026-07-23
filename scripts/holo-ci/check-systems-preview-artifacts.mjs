#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readDeterministicZip } from './lib/deterministic-zip.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SYSTEMS_DIR = join(ROOT, 'distributions', 'systems');
const ARTIFACT_DIR = join(ROOT, 'artifacts', 'releases', '0.1.0');
const BUILD_RECEIPT_PATH = join(ARTIFACT_DIR, 'systems-preview-build-receipt.json');
const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const outIndex = args.indexOf('--out');
const outPath = outIndex >= 0 ? resolve(args[outIndex + 1]) : null;

function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

function sha256File(path) {
  return sha256(readFileSync(path));
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

function parseSums(text, label, errors) {
  const sums = new Map();
  for (const line of String(text).trim().split(/\r?\n/u)) {
    const match = /^([0-9a-f]{64})  (.+)$/u.exec(line);
    if (!match) {
      errors.push(`${label}: invalid checksum line: ${line}`);
      continue;
    }
    if (sums.has(match[2])) errors.push(`${label}: duplicate checksum path: ${match[2]}`);
    sums.set(match[2], match[1]);
  }
  return sums;
}

function command(command, commandArgs, { cwd = ROOT, timeout = 120_000 } = {}) {
  const executable = process.platform === 'win32' && command === 'npm' ? 'npm.cmd' : command;
  return spawnSync(executable, commandArgs, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    timeout,
    windowsHide: true,
  });
}

function verifyFileSet(root, sums, files, label, errors) {
  const expected = new Set(files.map((path) => posixRelative(root, path)));
  for (const path of expected) {
    if (!sums.has(path)) errors.push(`${label}: checksum set is missing ${path}`);
  }
  for (const path of sums.keys()) {
    if (!expected.has(path)) errors.push(`${label}: checksum set has undeclared path ${path}`);
  }
  for (const path of files) {
    const relativePath = posixRelative(root, path);
    if (sums.get(relativePath) && sha256File(path) !== sums.get(relativePath)) {
      errors.push(`${label}: checksum mismatch for ${relativePath}`);
    }
  }
}

function secretFindings(files, root) {
  const patterns = [
    ['private-key-pem', /-----BEGIN [A-Z ]*PRIVATE KEY-----/u],
    ['openai-shaped-key', /\bsk-[A-Za-z0-9_-]{16,}/u],
    ['bearer-token', /Bearer\s+[A-Za-z0-9._-]{16,}/u],
    ['founder-local-windows-path', /C:\\Users\\josep(?:\\|\/)/iu],
    ['founder-local-posix-path', /\/home\/josep(?:\/|\\)/iu],
    ['private-ecosystem-path', /\.ai-ecosystem(?:\/|\\)/iu],
  ];
  const findings = [];
  for (const path of files) {
    const text = readFileSync(path).toString('latin1');
    for (const [kind, pattern] of patterns) {
      if (pattern.test(text)) findings.push({ path: posixRelative(root, path), kind });
    }
  }
  return findings;
}

const errors = [];
const checks = {};
let buildReceipt = null;
let embedded = null;
let artifacts = [];
const temp = mkdtempSync(join(tmpdir(), 'holoscript-systems-verify-'));

try {
  if (!existsSync(BUILD_RECEIPT_PATH)) {
    errors.push(`missing build receipt: ${posixRelative(ROOT, BUILD_RECEIPT_PATH)}`);
  } else {
    buildReceipt = JSON.parse(readFileSync(BUILD_RECEIPT_PATH, 'utf8'));
    if (buildReceipt.schema !== 'holoscript.systems-preview-build-receipt/v1') {
      errors.push(`unexpected build receipt schema: ${buildReceipt.schema}`);
    }
    if (!/^[0-9a-f]{40}$/u.test(String(buildReceipt.sourceCommit || ''))) {
      errors.push('build receipt sourceCommit must be a full Git commit');
    } else {
      const resolves = command('git', ['cat-file', '-e', `${buildReceipt.sourceCommit}^{commit}`]);
      if (resolves.status !== 0) errors.push('build receipt sourceCommit does not resolve');
    }
    if (buildReceipt.deterministicRebuilds?.npmTarball !== true) {
      errors.push('build receipt must prove a byte-deterministic npm tarball rebuild');
    }
    if (buildReceipt.deterministicRebuilds?.nativeArchive !== true) {
      errors.push('build receipt must prove a byte-deterministic native archive rebuild');
    }
    artifacts = buildReceipt.artifacts || [];
  }

  for (const artifact of artifacts) {
    const path = resolve(ROOT, artifact.path || '');
    if (!path.startsWith(`${ROOT}${sep}`) || !existsSync(path) || !statSync(path).isFile()) {
      errors.push(`missing or unsafe artifact path: ${artifact.path}`);
      continue;
    }
    if (!/^[0-9a-f]{64}$/u.test(String(artifact.sha256 || ''))) {
      errors.push(`artifact has invalid SHA-256: ${artifact.path}`);
    } else if (sha256File(path) !== artifact.sha256) {
      errors.push(`artifact digest mismatch: ${artifact.path}`);
    }
    if (statSync(path).size !== artifact.bytes)
      errors.push(`artifact byte count mismatch: ${artifact.path}`);
  }
  if (artifacts.length !== 3)
    errors.push(`expected exactly three distribution artifacts, received ${artifacts.length}`);

  const embeddedPath = join(SYSTEMS_DIR, 'release-manifest.json');
  if (!existsSync(embeddedPath)) errors.push('package release-manifest.json is missing');
  else {
    embedded = JSON.parse(readFileSync(embeddedPath, 'utf8'));
    if (embedded.schema !== 'holoscript.systems-artifact-envelope/v1') {
      errors.push(`unexpected embedded release schema: ${embedded.schema}`);
    }
    if (embedded.sourceCommit !== buildReceipt?.sourceCommit) {
      errors.push('embedded release sourceCommit does not match the build receipt');
    }
    if (
      embedded.distributionId !== 'holoscript-systems-toolchain' ||
      embedded.version !== '0.1.0' ||
      embedded.machineContract !== 'hs-machine-v32'
    ) {
      errors.push('embedded release identity or machine contract mismatch');
    }
    for (const [relativePath, expected] of Object.entries(embedded.embeddedArtifactDigests || {})) {
      const path = resolve(SYSTEMS_DIR, relativePath);
      if (!path.startsWith(`${SYSTEMS_DIR}${sep}`) || !existsSync(path)) {
        errors.push(`embedded artifact path is missing or unsafe: ${relativePath}`);
      } else if (sha256File(path) !== expected) {
        errors.push(`embedded artifact digest mismatch: ${relativePath}`);
      }
    }
  }

  const packageFiles = [
    ...listFiles(join(SYSTEMS_DIR, 'bin')),
    ...listFiles(join(SYSTEMS_DIR, 'conformance')),
    ...listFiles(join(SYSTEMS_DIR, 'native')),
    ...listFiles(join(SYSTEMS_DIR, 'wasm')),
    ...[
      'package.json',
      'index.mjs',
      'index.d.ts',
      'release-manifest.json',
      'README.md',
      'LICENSE',
    ].map((file) => join(SYSTEMS_DIR, file)),
  ];
  const packageSums = parseSums(
    readFileSync(join(SYSTEMS_DIR, 'SHA256SUMS'), 'utf8'),
    'package SHA256SUMS',
    errors
  );
  verifyFileSet(SYSTEMS_DIR, packageSums, packageFiles, 'package SHA256SUMS', errors);

  const zipArtifact = artifacts.find((artifact) => artifact.path?.endsWith('.zip'));
  if (!zipArtifact) errors.push('native ZIP artifact is missing from the build receipt');
  else {
    const zipFiles = readDeterministicZip(readFileSync(resolve(ROOT, zipArtifact.path)));
    const expectedNames = ['LICENSE', 'SHA256SUMS', 'holoscriptc.exe', 'release-manifest.json'];
    if (JSON.stringify([...zipFiles.keys()]) !== JSON.stringify(expectedNames)) {
      errors.push(`native ZIP contents mismatch: ${[...zipFiles.keys()].join(', ')}`);
    }
    const zipSums = parseSums(zipFiles.get('SHA256SUMS'), 'native ZIP SHA256SUMS', errors);
    for (const name of ['LICENSE', 'holoscriptc.exe', 'release-manifest.json']) {
      const bytes = zipFiles.get(name);
      if (!bytes || zipSums.get(name) !== sha256(bytes)) {
        errors.push(`native ZIP checksum mismatch: ${name}`);
      }
    }
    if (
      zipFiles.get('release-manifest.json')?.toString('utf8') !==
      readFileSync(join(SYSTEMS_DIR, 'release-manifest.json'), 'utf8')
    ) {
      errors.push('native ZIP embeds a different release manifest');
    }
  }

  const tarball = artifacts.find((artifact) => artifact.path?.endsWith('.tgz'));
  if (!tarball) errors.push('npm tarball artifact is missing from the build receipt');
  else {
    const tarballPath = resolve(ROOT, tarball.path);
    const listing = command('tar', ['-tzf', tarballPath], { timeout: 60_000 });
    if (listing.status !== 0) errors.push(`npm tarball listing failed: ${listing.stderr.trim()}`);
    else {
      const names = listing.stdout.trim().split(/\r?\n/u);
      const unsafe = names.filter(
        (name) => !name.startsWith('package/') || name.split('/').includes('..')
      );
      if (unsafe.length) errors.push(`npm tarball has unsafe entries: ${unsafe.join(', ')}`);
      for (const required of [
        'package/package.json',
        'package/bin/holoscript.cjs',
        'package/bin/holoscriptc.cjs',
        'package/native/win32-x64/holoscriptc.exe',
        'package/wasm/holoscript_wasm_bg.wasm',
        'package/release-manifest.json',
        'package/SHA256SUMS',
      ]) {
        if (!names.includes(required)) errors.push(`npm tarball is missing ${required}`);
      }
      if (names.some((name) => name.endsWith('.map') || name.includes('/scripts/'))) {
        errors.push('npm tarball includes a source map or package-only verification script');
      }
    }
    if (errors.length === 0) {
      const extract = command('tar', ['-xzf', tarballPath, '-C', temp], { timeout: 60_000 });
      if (extract.status !== 0)
        errors.push(`npm tarball extraction failed: ${extract.stderr.trim()}`);
      else {
        const packedRoot = join(temp, 'package');
        if (
          readFileSync(join(packedRoot, 'release-manifest.json'), 'utf8') !==
          readFileSync(join(SYSTEMS_DIR, 'release-manifest.json'), 'utf8')
        ) {
          errors.push('npm tarball embeds a different release manifest');
        }
        const findings = secretFindings(listFiles(packedRoot), packedRoot);
        if (findings.length) errors.push(`secret-safe scan findings: ${JSON.stringify(findings)}`);
        checks.secretSafeArtifactScan = { ok: findings.length === 0, findings };
      }
    }
  }

  const wasmArtifact = artifacts.find((artifact) => artifact.path?.endsWith('-wasm.wasm'));
  if (!wasmArtifact) errors.push('portable WASM artifact is missing from the build receipt');
  else if (
    embedded?.embeddedArtifactDigests?.['wasm/holoscript_wasm_bg.wasm'] !== wasmArtifact.sha256
  ) {
    errors.push('portable WASM rail digest does not match the package-embedded WASM digest');
  }

  if (errors.length === 0) {
    const require = createRequire(join(SYSTEMS_DIR, 'wasm', 'index.cjs'));
    const wasm = require(join(SYSTEMS_DIR, 'wasm', 'index.cjs'));
    const wasmSource = 'function main(): i32 { return 5 }';
    const wasmValidation = wasm.validate(wasmSource);
    const wasmParse = JSON.parse(wasm.parse(wasmSource));
    checks.wasm = {
      ok: wasmValidation === true && !wasmParse.error,
      version: wasm.version(),
      validation: wasmValidation,
      parsedWithoutError: !wasmParse.error,
    };
    if (!checks.wasm.ok) errors.push('bundled WASM parse/validation probe failed');
    void require;

    const systems = await import(
      `${pathToFileURL(join(SYSTEMS_DIR, 'index.mjs')).href}?verify=${Date.now()}`
    );
    systems.assertSupportedHost();
    const nativeOutput = join(temp, 'proof.exe');
    const compile = command(
      process.execPath,
      [
        join(SYSTEMS_DIR, 'bin', 'holoscriptc.cjs'),
        systems.conformanceSourcePath,
        '-o',
        nativeOutput,
      ],
      { cwd: temp, timeout: 180_000 }
    );
    if (compile.status !== 0 || !existsSync(nativeOutput)) {
      errors.push(`bundled native compiler probe failed: ${compile.stderr || compile.stdout}`);
    } else {
      const execute = command(nativeOutput, [], { cwd: temp, timeout: 30_000 });
      checks.native = {
        ok: execute.status === 5,
        compilerExitCode: compile.status,
        programExitCode: execute.status,
      };
      if (!checks.native.ok)
        errors.push(`native proof program exited ${execute.status}, expected 5`);
    }
  }
} catch (error) {
  errors.push(error.stack || error.message);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const receipt = {
  schema: 'holoscript.systems-preview-artifact-verification/v1',
  generatedAt: new Date().toISOString(),
  ok: errors.length === 0,
  sourceCommit: buildReceipt?.sourceCommit || null,
  distributionId: embedded?.distributionId || null,
  version: embedded?.version || null,
  artifactDigests: Object.fromEntries(
    artifacts.map((artifact) => [artifact.path, artifact.sha256])
  ),
  checks,
  errors,
};

if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
}

if (jsonOutput) console.log(JSON.stringify(receipt, null, 2));
else if (receipt.ok) console.log('[systems-preview-artifacts] PASS');
else for (const error of errors) console.error(`[systems-preview-artifacts] FAIL: ${error}`);

process.exit(receipt.ok ? 0 : 1);
