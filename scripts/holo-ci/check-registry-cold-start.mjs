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
  'uaal-semantic-gate-import': [
    '@holoscript/uaal',
    '@holoscript/uaal/semantic',
    '@holoscript/uaal/gate',
  ],
  'sdk-compat-import': [
    '@holoscript/sdk',
    '@holoscript/sdk/schema',
  ],
  'memory-client-import': [
    '@holoscript/memory',
  ],
  'formatter-import': [
    '@holoscript/formatter',
  ],
  'holoscript-agent-library-import': [
    '@holoscript/holoscript-agent/brain',
    '@holoscript/holoscript-agent/identity',
    '@holoscript/holoscript-agent/cost-guard',
    '@holoscript/holoscript-agent/supervisor-config',
  ],
  'xr-embodiment-import': [
    '@holoscript/xr-embodiment',
    '@holoscript/xr-embodiment/three',
  ],
};
const PACKAGE_BIN_HELP_PROBES = {
  'cli-bin-help': {
    packageName: '@holoscript/cli',
    runBin: 'holoscript',
    expectedBins: ['holo', 'holoscript', 'hs'],
    expectedOutput: ['HoloScript CLI', 'Usage: holoscript', 'parse <file>'],
    expectPackageVersion: true,
  },
  'formatter-bin-help': {
    packageName: '@holoscript/formatter',
    runBin: 'holoscript-format',
    expectedBins: ['holoscript-format'],
    expectedOutput: ['HoloScript Formatter', 'Usage:', 'holoscript-format'],
    expectPackageVersion: true,
  },
  'holoscript-agent-bin-help': {
    packageName: '@holoscript/holoscript-agent',
    runBin: 'holoscript-agent',
    expectedBins: ['holoscript-agent'],
    expectedOutput: ['holoscript-agent', 'USAGE', 'tick', 'supervise'],
  },
};
const PROBES = new Set([
  'core-holo-webgpu',
  'mcp-server-sizing',
  'holollama-harness',
  'engine-public-api',
  'framework-public-api',
  'absorb-service-public-api',
  ...Object.keys(PACKAGE_IMPORT_PROBES),
  ...Object.keys(PACKAGE_BIN_HELP_PROBES),
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

function buildHoloLlamaHarnessProbeScript() {
  return `
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const target = join(process.cwd(), '.ai-ecosystem');
const bin = join(
  process.cwd(),
  'node_modules',
  '@holoscript',
  'holollama',
  'bin',
  'holollama.cjs'
);

const raw = execFileSync(
  process.execPath,
  [
    bin,
    'harness',
    '--out',
    target,
    '--profile',
    'jetson-orin',
    '--team-id',
    'team_test',
    '--json'
  ],
  {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60_000
  }
);

const receipt = JSON.parse(raw);
const required = [
  'AGENTS.md',
  '.env.example',
  'holollama.harness.json',
  'receipts/holollama/doctor.json',
  'receipts/holollama/lifecycle.json',
  'receipts/holollama/install.json'
];
const missing = required.filter((file) => !existsSync(join(target, file)));
const installReceiptPath = join(target, 'receipts', 'holollama', 'install.json');
const installReceipt = existsSync(installReceiptPath)
  ? readFileSync(installReceiptPath, 'utf8')
  : '';
const privateLeak =
  /C:[\\\\/]+Users[\\\\/]+josep|D:[\\\\/]+GOLD|holoscript_sk_|holomesh_sk_/i.test(
    installReceipt
  );

console.log(JSON.stringify({
  kind: 'holollama-harness',
  ok:
    receipt.schema === 'holollama.public-harness-install.v1' &&
    receipt.ok === true &&
    missing.length === 0 &&
    privateLeak === false,
  receiptSchema: receipt.schema,
  files: receipt.files || [],
  receiptFiles: receipt.receiptFiles || [],
  missing,
  privateLeak,
  receiptHash: receipt.receiptHash || null
}, null, 2));
`;
}

function buildEnginePublicApiProbeScript() {
  return `
import {
  HEADLESS_PROFILE,
  MINIMAL_PROFILE,
  HeadlessRuntime,
  createCustomProfile,
  getAvailableProfiles,
  getProfile
} from '@holoscript/engine/runtime';

const availableProfiles = getAvailableProfiles().sort();
const headless = getProfile('headless');
const minimal = getProfile('minimal');
const custom = createCustomProfile('headless', {
  name: 'probe-headless',
  memoryBudget: 32,
  network: { enabled: false }
});

const checks = {
  headlessProfileName: HEADLESS_PROFILE?.name === 'headless',
  headlessRenderingDisabled:
    HEADLESS_PROFILE?.rendering?.enabled === false &&
    HEADLESS_PROFILE?.rendering?.renderer === 'none',
  headlessNoAudioInput:
    HEADLESS_PROFILE?.audio?.enabled === false && HEADLESS_PROFILE?.input?.enabled === false,
  headlessMemoryBudget: HEADLESS_PROFILE?.memoryBudget === 50,
  minimalProfileName: MINIMAL_PROFILE?.name === 'minimal',
  availableProfilesIncludeExpected: ['headless', 'minimal', 'standard', 'vr'].every((name) =>
    availableProfiles.includes(name)
  ),
  getProfileReturnsProfiles:
    headless?.name === HEADLESS_PROFILE.name && minimal?.name === MINIMAL_PROFILE.name,
  customProfileMergesNestedConfig:
    custom.name === 'probe-headless' &&
    custom.memoryBudget === 32 &&
    custom.rendering?.renderer === 'none' &&
    custom.network?.enabled === false,
  hasHeadlessRuntimeCtor: typeof HeadlessRuntime === 'function'
};

console.log(JSON.stringify({
  kind: 'engine-public-api',
  ok: Object.values(checks).every(Boolean),
  checks,
  samples: {
    availableProfiles,
    headless: {
      name: headless.name,
      renderingEnabled: headless.rendering.enabled,
      renderer: headless.rendering.renderer,
      memoryBudget: headless.memoryBudget
    },
    minimal: {
      name: minimal.name,
      renderer: minimal.rendering.renderer,
      memoryBudget: minimal.memoryBudget
    },
    custom: {
      name: custom.name,
      networkEnabled: custom.network.enabled,
      renderer: custom.rendering.renderer,
      memoryBudget: custom.memoryBudget
    }
  }
}, null, 2));
`;
}

function buildFrameworkPublicApiProbeScript() {
  return `
import {
  AgentManifestBuilder,
  GCounter,
  createAgentManifest,
  validateManifest
} from '@holoscript/framework/agents';

const left = new GCounter();
left.increment('laptop', 2);
left.increment('jetson', 1);

const right = GCounter.fromJSON({ laptop: 1, jetson: 5, vast: 3 });
left.merge(right);
const roundTrip = GCounter.fromJSON(left.toJSON());

const capability = {
  type: 'validate',
  domain: 'general',
  id: 'package-canary',
  name: 'Package Canary',
  latency: 'fast',
  available: true
};
const endpoint = {
  protocol: 'local',
  address: 'in-process',
  primary: true,
  formats: ['json']
};
const manifest = createAgentManifest()
  .identity('agent-package-canary', 'Package Canary', '1.0.0')
  .description('Cold-start package public API probe')
  .addCapability(capability)
  .addEndpoint(endpoint)
  .trust('local', 'unverified')
  .tags('package', 'canary')
  .build();
const validation = validateManifest(manifest);

const checks = {
  hasCounterCtor: typeof GCounter === 'function',
  counterMergeConverges: left.value() === 10,
  counterNodeMaxPreserved: left.nodeValue('jetson') === 5,
  counterRoundTrip: roundTrip.value() === 10 && roundTrip.nodeValue('vast') === 3,
  hasManifestBuilderCtor: typeof AgentManifestBuilder === 'function',
  builderFactoryReturnsBuilder: createAgentManifest() instanceof AgentManifestBuilder,
  manifestBuildsOnlineAgent:
    manifest.id === 'agent-package-canary' &&
    manifest.status === 'online' &&
    manifest.capabilities.length === 1 &&
    manifest.endpoints.length === 1,
  manifestValidates: validation.valid === true
};

console.log(JSON.stringify({
  kind: 'framework-public-api',
  ok: Object.values(checks).every(Boolean),
  checks,
  samples: {
    counter: left.toJSON(),
    manifest: {
      id: manifest.id,
      status: manifest.status,
      tags: manifest.tags,
      capabilityTypes: manifest.capabilities.map((entry) => entry.type),
      endpointProtocols: manifest.endpoints.map((entry) => entry.protocol)
    },
    validation
  }
}, null, 2));
`;
}

function buildAbsorbServicePublicApiProbeScript() {
  return `
import { CodebaseGraph } from '@holoscript/absorb-service/engine';
import { absorbProjects, knowledgeEntries } from '@holoscript/absorb-service/schema';

const graph = new CodebaseGraph();
const filePath = '/probe/fleet-canary.ts';
graph.addFile({
  path: filePath,
  language: 'typescript',
  symbols: [
    {
      name: 'fleetCanary',
      type: 'function',
      language: 'typescript',
      visibility: 'public',
      filePath,
      line: 1,
      column: 1,
      endLine: 3,
      endColumn: 2
    }
  ],
  imports: [],
  calls: [],
  loc: 3,
  sizeBytes: 88
});
graph.buildIndexes();

const stats = graph.getStats();
const symbols = graph.findSymbolsByName('fleetCanary');
const queried = graph.querySymbols({ name: 'fleetCanary', visibility: 'public' });
const files = graph.getFilePaths();

const knowledgeColumnKeys = ['id', 'workspaceId', 'type', 'content', 'createdAt'];
const projectColumnKeys = ['id', 'userId', 'name', 'status', 'createdAt'];
const checks = {
  hasGraphCtor: typeof CodebaseGraph === 'function',
  graphIndexesSyntheticFile:
    stats.totalFiles === 1 &&
    stats.totalSymbols === 1 &&
    stats.totalLoc === 3 &&
    files.includes(filePath),
  graphSymbolLookup:
    symbols.length === 1 &&
    symbols[0].name === 'fleetCanary' &&
    queried.length === 1 &&
    queried[0].visibility === 'public',
  hasKnowledgeEntriesSchema:
    Boolean(knowledgeEntries) && knowledgeColumnKeys.every((key) => key in knowledgeEntries),
  hasAbsorbProjectsSchema:
    Boolean(absorbProjects) && projectColumnKeys.every((key) => key in absorbProjects)
};

console.log(JSON.stringify({
  kind: 'absorb-service-public-api',
  ok: Object.values(checks).every(Boolean),
  checks,
  samples: {
    stats,
    files,
    symbols: symbols.map((symbol) => ({
      name: symbol.name,
      type: symbol.type,
      language: symbol.language,
      visibility: symbol.visibility
    })),
    schemaColumns: {
      knowledgeEntries: knowledgeColumnKeys.filter((key) => key in knowledgeEntries),
      absorbProjects: projectColumnKeys.filter((key) => key in absorbProjects)
    }
  }
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

function buildPackageBinHelpProbeScript(probeKind) {
  const config = PACKAGE_BIN_HELP_PROBES[probeKind];
  return `
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const config = ${JSON.stringify(config, null, 2)};
const manifestPath = join(process.cwd(), 'node_modules', ...config.packageName.split('/'), 'package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const binMap = typeof manifest.bin === 'string' ? { [manifest.name]: manifest.bin } : manifest.bin || {};
const missingBins = config.expectedBins.filter((binName) => !(binName in binMap));
const runBinPath = binMap[config.runBin];
const resolvedBin = runBinPath
  ? resolve(process.cwd(), 'node_modules', ...config.packageName.split('/'), runBinPath)
  : null;
const binExists = resolvedBin ? existsSync(resolvedBin) : false;
let stdout = '';
let error = null;

if (binExists) {
  try {
    stdout = execFileSync(process.execPath, [resolvedBin, '--help'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000
    });
  } catch (err) {
    error = String(err?.stderr || err?.stdout || err?.message || err).slice(0, 1600);
  }
}

const plainStdout = stdout.replace(/\\u001b\\[[0-9;]*m/g, '');
const outputChecks = Object.fromEntries(
  config.expectedOutput.map((marker) => [marker, plainStdout.includes(marker)])
);
if (config.expectPackageVersion) {
  outputChecks[\`v\${manifest.version}\`] = plainStdout.includes(\`v\${manifest.version}\`);
}

console.log(JSON.stringify({
  kind: ${JSON.stringify(probeKind)},
  ok:
    missingBins.length === 0 &&
    binExists === true &&
    error === null &&
    Object.values(outputChecks).every(Boolean),
  packageName: manifest.name,
  version: manifest.version,
  bins: Object.keys(binMap).sort(),
  runBin: config.runBin,
  resolvedBin,
  binExists,
  missingBins,
  outputChecks,
  stdoutBytes: Buffer.byteLength(stdout),
  sample: plainStdout.slice(0, 800),
  error
}, null, 2));
`;
}

function main() {
  const work = mkdtempSync(join(tmpdir(), 'hs-registry-cold-start-'));
  const npmCacheDir = join(work, 'npm-cache');
  mkdirSync(npmCacheDir, { recursive: true });
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
      npmCacheDir,
      tempDirKept: KEEP_TEMP,
      repoAccess: false,
      installCommand:
        `npm install ${PACKAGE_SPEC}${REGISTRY_URL ? ` --registry ${REGISTRY_URL}` : ''} ` +
        '--ignore-scripts --no-audit --no-fund ' +
        `${installOmit.join(' ')} --prefer-online --cache <temp>/npm-cache --loglevel=error`,
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
        '--prefer-online',
        '--cache',
        npmCacheDir,
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
    } else if (PROBE === 'holollama-harness') {
      writeFileSync(probeFile, buildHoloLlamaHarnessProbeScript());
    } else if (PROBE === 'engine-public-api') {
      writeFileSync(probeFile, buildEnginePublicApiProbeScript());
    } else if (PROBE === 'framework-public-api') {
      writeFileSync(probeFile, buildFrameworkPublicApiProbeScript());
    } else if (PROBE === 'absorb-service-public-api') {
      writeFileSync(probeFile, buildAbsorbServicePublicApiProbeScript());
    } else if (PACKAGE_IMPORT_PROBES[PROBE]) {
      writeFileSync(probeFile, buildPackageImportProbeScript(PROBE));
    } else if (PACKAGE_BIN_HELP_PROBES[PROBE]) {
      writeFileSync(probeFile, buildPackageBinHelpProbeScript(PROBE));
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
