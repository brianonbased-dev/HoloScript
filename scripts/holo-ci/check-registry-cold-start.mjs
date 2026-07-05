#!/usr/bin/env node
/**
 * Registry cold-start gate.
 *
 * Reproduces a zero-repo consumer: create a fresh temp project, install the
 * published package from the configured npm registry, then parse, structurally
 * validate, and compile one minimal .holo source through the installed package.
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const KEEP_TEMP = args.includes('--keep-temp');
const packageIdx = args.indexOf('--package');
const outIdx = args.indexOf('--out');
const PACKAGE_SPEC = packageIdx >= 0 ? args[packageIdx + 1] : '@holoscript/core@latest';
const OUT_PATH = outIdx >= 0 ? resolve(args[outIdx + 1]) : null;
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const PYTHON_BIN = process.env.PYTHON || 'python';

const SOURCE = `composition "RegistryColdStart" {
  object "ProofCube" {
    position: [0, 1, -2]
    scale: [1, 1, 1]
    geometry: "cube"
    color: "#00d4ff"
  }
}
`;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function run(cmd, cmdArgs, opts = {}) {
  const isNpm = cmd === 'npm';
  return execFileSync(isNpm ? NPM_BIN : cmd, cmdArgs, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isNpm && process.platform === 'win32',
    ...opts,
  });
}

function commandVersion(command, versionArgs) {
  try {
    return run(command, versionArgs).trim();
  } catch (error) {
    return `unavailable: ${String(error.message || error).slice(0, 180)}`;
  }
}

function truncate(value, max = 2000) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function fail(receipt, reason, error) {
  receipt.ok = false;
  receipt.failure = {
    reason,
    detail: truncate(error?.stderr || error?.stdout || error?.message || error),
  };
  emit(receipt);
  process.exit(1);
}

function emit(receipt) {
  const text = `${JSON.stringify(receipt, null, 2)}\n`;
  if (OUT_PATH) {
    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, text);
  }
  if (JSON_OUT || !OUT_PATH) {
    console.log(text.trimEnd());
  } else {
    console.log(
      `[registry-cold-start] ${receipt.ok ? 'PASS' : 'FAIL'} ${receipt.package.spec} -> ${OUT_PATH}`
    );
  }
}

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function packageLockEntry(lock, packageName) {
  if (!lock?.packages) return null;
  return lock.packages[`node_modules/${packageName}`] || null;
}

function buildProbeScript(sourceFile, outputFile) {
  return `
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseHolo } from '@holoscript/core/parser';
import { WebGPUCompiler, createTestCompilerToken } from '@holoscript/core/compiler';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

const source = readFileSync(${JSON.stringify(sourceFile)}, 'utf8');
const parsed = parseHolo(source);
const parseOk = parsed.success === true && Boolean(parsed.ast);
const objectCount = parsed.ast?.objects?.length ?? 0;
const validation = {
  ok: parseOk && objectCount === 1,
  checks: {
    parseSuccess: parsed.success === true,
    astPresent: Boolean(parsed.ast),
    objectCount,
    expectedObjectCount: 1,
    diagnostics: (parsed.errors || []).map((error) => error.message || String(error))
  }
};

let compile = {
  ok: false,
  target: 'webgpu',
  outputBytes: 0,
  outputSha256: null,
  markers: []
};

if (validation.ok) {
  const compiled = new WebGPUCompiler().compile(parsed.ast, createTestCompilerToken());
  writeFileSync(${JSON.stringify(outputFile)}, compiled);
  compile = {
    ok: true,
    target: 'webgpu',
    outputBytes: Buffer.byteLength(compiled),
    outputSha256: sha256(compiled),
    markers: ['navigator.gpu', 'requestAdapter', 'requestAnimationFrame'].filter((marker) =>
      String(compiled).includes(marker)
    )
  };
}

console.log(JSON.stringify({
  sourceSha256: sha256(source),
  sourceBytes: Buffer.byteLength(source),
  parse: {
    ok: parseOk,
    objectCount,
    diagnostics: (parsed.errors || []).map((error) => error.message || String(error))
  },
  validation,
  compile
}, null, 2));
`;
}

function main() {
  const work = mkdtempSync(join(tmpdir(), 'hs-registry-cold-start-'));
  const receipt = {
    schema: 'holoscript.registry-cold-start.receipt.v1',
    generatedAt: new Date().toISOString(),
    ok: false,
    package: {
      spec: PACKAGE_SPEC,
      metadata: null,
      installed: null,
    },
    registry: {
      url: process.env.npm_config_registry || null,
      resolvedByNpmConfig: null,
    },
    environment: {
      node: process.version,
      npm: commandVersion('npm', ['--version']),
      python: commandVersion(PYTHON_BIN, ['--version']),
      platform: process.platform,
      arch: process.arch,
    },
    isolation: {
      tempDir: work,
      tempDirKept: KEEP_TEMP,
      repoAccess: false,
      installCommand:
        `npm install ${PACKAGE_SPEC} --ignore-scripts --no-audit --no-fund ` +
        '--omit=optional --omit=peer --loglevel=error',
    },
    source: {
      file: 'registry-cold-start.holo',
      sha256: sha256(SOURCE),
      bytes: Buffer.byteLength(SOURCE),
    },
    probe: null,
    finalDisposition: null,
  };

  try {
    receipt.registry.resolvedByNpmConfig = run('npm', ['config', 'get', 'registry']).trim();
    receipt.registry.url = receipt.registry.url || receipt.registry.resolvedByNpmConfig;
  } catch (error) {
    receipt.registry.resolvedByNpmConfig = `unavailable: ${truncate(error.message, 180)}`;
  }

  try {
    const metadataRaw = run('npm', [
      'view',
      PACKAGE_SPEC,
      'name',
      'version',
      'dist.integrity',
      'dist.tarball',
      'dependencies',
      'exports',
      '--json',
    ]);
    receipt.package.metadata = JSON.parse(metadataRaw);
  } catch (error) {
    fail(receipt, 'npm-view-failed', error);
  }

  try {
    writeFileSync(
      join(work, 'package.json'),
      JSON.stringify({ name: 'registry-cold-start', private: true, type: 'module' }, null, 2)
    );
    run(
      'npm',
      [
        'install',
        PACKAGE_SPEC,
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        '--omit=optional',
        '--omit=peer',
        '--loglevel=error',
      ],
      { cwd: work, timeout: 180_000 }
    );
  } catch (error) {
    fail(receipt, 'npm-install-failed', error);
  }

  try {
    const packageName =
      receipt.package.metadata?.name ||
      String(PACKAGE_SPEC).replace(/@latest$/u, '').replace(/@\d+\.\d+\.\d+.*$/u, '');
    const lock = readJsonIfExists(join(work, 'package-lock.json'));
    const installed = packageLockEntry(lock, packageName);
    const manifestPath = join(work, 'node_modules', ...packageName.split('/'), 'package.json');
    const manifestRaw = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null;
    const manifest = manifestRaw ? JSON.parse(manifestRaw) : null;
    receipt.package.installed = {
      name: manifest?.name || packageName,
      version: manifest?.version || installed?.version || null,
      integrity: installed?.integrity || null,
      resolved: installed?.resolved || null,
      packageJsonSha256: manifestRaw ? sha256(manifestRaw) : null,
    };
  } catch (error) {
    fail(receipt, 'installed-package-inspection-failed', error);
  }

  try {
    const sourceFile = join(work, 'registry-cold-start.holo');
    const outputFile = join(work, 'registry-cold-start.webgpu.ts');
    const probeFile = join(work, 'probe.mjs');
    writeFileSync(sourceFile, SOURCE);
    writeFileSync(probeFile, buildProbeScript(sourceFile, outputFile));
    const probe = JSON.parse(run('node', [probeFile], { cwd: work, timeout: 60_000 }));
    receipt.probe = probe;
    receipt.ok =
      probe.sourceSha256 === receipt.source.sha256 &&
      probe.parse?.ok === true &&
      probe.validation?.ok === true &&
      probe.compile?.ok === true &&
      probe.compile?.markers?.includes('navigator.gpu');
    receipt.finalDisposition = receipt.ok
      ? 'repo_less_parse_validate_compile_passed'
      : 'repo_less_probe_failed';
    if (!receipt.ok) {
      receipt.failure = {
        reason: 'probe-incomplete',
        detail: JSON.stringify(probe),
      };
    }
  } catch (error) {
    fail(receipt, 'probe-crashed', error);
  } finally {
    if (!KEEP_TEMP) rmSync(work, { recursive: true, force: true });
  }

  emit(receipt);
  process.exit(receipt.ok ? 0 : 1);
}

main();
