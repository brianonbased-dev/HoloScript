#!/usr/bin/env node
/**
 * Registry cold-start gate.
 *
 * Reproduces a zero-repo consumer: create a fresh temp project, install the
 * published package from the configured npm registry, then run a package probe
 * without reading workspace sources or build outputs.
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
const probeIdx = args.indexOf('--probe');
const registryIdx = args.indexOf('--registry');
const mirrorIdx = args.indexOf('--mirror-url');
const PACKAGE_SPEC = packageIdx >= 0 ? args[packageIdx + 1] : '@holoscript/core@latest';
const OUT_PATH = outIdx >= 0 ? resolve(args[outIdx + 1]) : null;
const REGISTRY_URL =
  (registryIdx >= 0 ? args[registryIdx + 1] : null) ||
  (mirrorIdx >= 0 ? args[mirrorIdx + 1] : null) ||
  process.env.HOLOSCRIPT_NPM_REGISTRY_URL ||
  process.env.HOLOSCRIPT_PACKAGE_MIRROR_URL ||
  null;
const PUBLIC_FALLBACK_DISABLED =
  args.includes('--disable-public-fallback') ||
  process.env.HOLOSCRIPT_PACKAGE_PUBLIC_FALLBACK === '0';
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const PYTHON_BIN = process.env.PYTHON || 'python';
const PUBLIC_NPM_REGISTRIES = new Set(['https://registry.npmjs.org']);
const PACKAGE_IMPORT_PROBES = {
  'engine-runtime-import': [
    '@holoscript/engine',
    '@holoscript/engine/runtime',
    '@holoscript/engine/physics',
  ],
  'framework-agent-import': [
    '@holoscript/framework',
    '@holoscript/framework/board',
    '@holoscript/framework/agents',
  ],
  'absorb-service-import': [
    '@holoscript/absorb-service',
    '@holoscript/absorb-service/schema',
    '@holoscript/absorb-service/engine',
  ],
};
const PROBES = new Set([
  'core-holo-webgpu',
  'mcp-server-sizing',
  ...Object.keys(PACKAGE_IMPORT_PROBES),
]);

function inferProbe(packageSpec) {
  return String(packageSpec).startsWith('@holoscript/mcp-server')
    ? 'mcp-server-sizing'
    : 'core-holo-webgpu';
}

const PROBE = probeIdx >= 0 ? args[probeIdx + 1] : inferProbe(PACKAGE_SPEC);

if (!PROBES.has(PROBE)) {
  console.error(
    `[registry-cold-start] Unknown --probe ${JSON.stringify(PROBE)}. ` +
      `Expected one of: ${[...PROBES].join(', ')}`
  );
  process.exit(2);
}

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

function normalizeRegistryUrl(value) {
  return String(value || '').trim().replace(/\/+$/u, '').toLowerCase();
}

function isPublicNpmRegistry(value) {
  return PUBLIC_NPM_REGISTRIES.has(normalizeRegistryUrl(value));
}

function npmEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of Object.keys(env)) {
    const normalized = key.toLowerCase();
    if (
      normalized.startsWith('npm_config_overrides_') ||
      normalized === 'npm_config_shamefully_hoist' ||
      normalized === 'npm_config_strict_peer_dependencies'
    ) {
      delete env[key];
    }
  }
  if (REGISTRY_URL) {
    env.npm_config_registry = REGISTRY_URL;
    env.NPM_CONFIG_REGISTRY = REGISTRY_URL;
  }
  return env;
}

function withRegistry(cmdArgs) {
  return REGISTRY_URL ? [...cmdArgs, '--registry', REGISTRY_URL] : cmdArgs;
}

function runNpm(cmdArgs, opts = {}) {
  return run('npm', withRegistry(cmdArgs), {
    ...opts,
    env: npmEnv(opts.env || {}),
  });
}

function installOmitArgs() {
  const args = ['--omit=optional'];
  if (PROBE === 'core-holo-webgpu') args.push('--omit=peer');
  return args;
}

function writeConsumerPackageJson(work) {
  writeFileSync(
    join(work, 'package.json'),
    JSON.stringify({ name: 'registry-cold-start', private: true, type: 'module' }, null, 2)
  );
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

function buildCoreHoloWebgpuProbeScript(sourceFile, outputFile) {
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

function buildMcpServerSizingProbeScript() {
  return `
import {
  getMcpServerSizing,
  MCP_SERVER_SIZING_PROFILES
} from '@holoscript/mcp-server/server-sizing';

const profileNames = Object.keys(MCP_SERVER_SIZING_PROFILES).sort();
const fleet = getMcpServerSizing({ MCP_SERVER_SIZE: 'fleet' });
const jetson = getMcpServerSizing({
  MCP_SERVER_SIZE: 'jetson',
  MCP_MAX_CONCURRENT_TOOL_CALLS: '3'
});
const laptop = getMcpServerSizing({ MCP_SERVER_SIZE: 'laptop' });

const checks = {
  profilesPresent: ['fleet', 'jetson', 'laptop'].every((profile) =>
    profileNames.includes(profile)
  ),
  fleetConsumer: fleet.recommendedConsumer === 'hosted-service',
  fleetConcurrency: fleet.maxConcurrentToolCalls === 16,
  jetsonConsumer: jetson.recommendedConsumer === 'jetson-orin',
  jetsonOverride: jetson.maxConcurrentToolCalls === 3,
  laptopConsumer: laptop.recommendedConsumer === 'laptop-windows'
};

console.log(JSON.stringify({
  kind: 'mcp-server-sizing',
  ok: Object.values(checks).every(Boolean),
  profiles: profileNames,
  checks,
  samples: { fleet, jetson, laptop }
}, null, 2));
`;
}

function buildPackageImportProbeScript(probeKind) {
  const importSpecs = PACKAGE_IMPORT_PROBES[probeKind] || [];
  return `
const importSpecs = ${JSON.stringify(importSpecs, null, 2)};
const imports = [];

for (const spec of importSpecs) {
  try {
    const namespace = await import(spec);
    const exportedKeys = Object.keys(namespace).sort();
    imports.push({
      spec,
      ok: true,
      exportCount: exportedKeys.length,
      sampleExports: exportedKeys.slice(0, 20)
    });
  } catch (error) {
    imports.push({
      spec,
      ok: false,
      error: String(error?.stack || error?.message || error).slice(0, 1600)
    });
  }
}

console.log(JSON.stringify({
  kind: ${JSON.stringify(probeKind)},
  ok: imports.length === importSpecs.length && imports.every((entry) => entry.ok),
  imports
}, null, 2));
`;
}

function main() {
  const work = mkdtempSync(join(tmpdir(), 'hs-registry-cold-start-'));
  writeConsumerPackageJson(work);
  const installOmit = installOmitArgs();
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
      requestedUrl: REGISTRY_URL,
      url: REGISTRY_URL || process.env.npm_config_registry || null,
      resolvedByNpmConfig: null,
      publicFallbackAllowed: !PUBLIC_FALLBACK_DISABLED,
      publicFallbackDisabled: PUBLIC_FALLBACK_DISABLED,
      clientPolicy: REGISTRY_URL ? 'explicit-registry' : 'npm-config',
      publicRegistryUrls: [...PUBLIC_NPM_REGISTRIES],
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
        `npm install ${PACKAGE_SPEC}${REGISTRY_URL ? ` --registry ${REGISTRY_URL}` : ''} ` +
        '--ignore-scripts --no-audit --no-fund ' +
        `${installOmit.join(' ')} --loglevel=error`,
    },
    probeKind: PROBE,
    source:
      PROBE === 'core-holo-webgpu'
        ? {
            file: 'registry-cold-start.holo',
            sha256: sha256(SOURCE),
            bytes: Buffer.byteLength(SOURCE),
          }
        : null,
    probe: null,
    finalDisposition: null,
  };

  try {
    receipt.registry.resolvedByNpmConfig = runNpm(['config', 'get', 'registry'], {
      cwd: work,
    }).trim();
    receipt.registry.url = receipt.registry.url || receipt.registry.resolvedByNpmConfig;
  } catch (error) {
    receipt.registry.resolvedByNpmConfig = `unavailable: ${truncate(error.message, 180)}`;
  }

  if (PUBLIC_FALLBACK_DISABLED && isPublicNpmRegistry(receipt.registry.url)) {
    fail(
      receipt,
      'public-registry-disallowed',
      `public fallback disabled but effective registry is ${receipt.registry.url}`
    );
  }

  try {
    const metadataRaw = runNpm([
      'view',
      PACKAGE_SPEC,
      'name',
      'version',
      'dist.integrity',
      'dist.tarball',
      'dependencies',
      'exports',
      '--json',
    ], { cwd: work });
    receipt.package.metadata = JSON.parse(metadataRaw);
  } catch (error) {
    fail(receipt, 'npm-view-failed', error);
  }

  try {
    run(
      'npm',
      withRegistry([
        'install',
        PACKAGE_SPEC,
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        ...installOmit,
        '--loglevel=error',
      ]),
      { cwd: work, timeout: 180_000, env: npmEnv() }
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
    const probeFile = join(work, 'probe.mjs');
    if (PROBE === 'core-holo-webgpu') {
      const sourceFile = join(work, 'registry-cold-start.holo');
      const outputFile = join(work, 'registry-cold-start.webgpu.ts');
      writeFileSync(sourceFile, SOURCE);
      writeFileSync(probeFile, buildCoreHoloWebgpuProbeScript(sourceFile, outputFile));
    } else if (PROBE === 'mcp-server-sizing') {
      writeFileSync(probeFile, buildMcpServerSizingProbeScript());
    } else if (PACKAGE_IMPORT_PROBES[PROBE]) {
      writeFileSync(probeFile, buildPackageImportProbeScript(PROBE));
    }
    const probe = JSON.parse(run('node', [probeFile], { cwd: work, timeout: 60_000 }));
    receipt.probe = probe;
    receipt.ok =
      PROBE === 'core-holo-webgpu'
        ? probe.sourceSha256 === receipt.source.sha256 &&
          probe.parse?.ok === true &&
          probe.validation?.ok === true &&
          probe.compile?.ok === true &&
          probe.compile?.markers?.includes('navigator.gpu')
        : probe.ok === true;
    receipt.finalDisposition = receipt.ok
      ? `repo_less_${PROBE.replaceAll('-', '_')}_passed`
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
