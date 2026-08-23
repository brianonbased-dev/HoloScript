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
  statfsSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const args = process.argv.slice(2);
function valueAfterFlag(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] || null : null;
}

const JSON_OUT = args.includes('--json');
const KEEP_TEMP = args.includes('--keep-temp');
const PREFER_OFFLINE = args.includes('--prefer-offline');
const NPM_CACHE_PREFERENCE = PREFER_OFFLINE ? '--prefer-offline' : '--prefer-online';
const packageIdx = args.indexOf('--package');
const outIdx = args.indexOf('--out');
const probeIdx = args.indexOf('--probe');
const registryIdx = args.indexOf('--registry');
const mirrorIdx = args.indexOf('--mirror-url');
const scratchRootArg = valueAfterFlag('--scratch-root');
const minFreeBytesArg = valueAfterFlag('--min-free-bytes');
const npmCacheRootArg = valueAfterFlag('--npm-cache-root');
const installTimeoutArg = valueAfterFlag('--install-timeout-ms');
const probeTimeoutArg = valueAfterFlag('--probe-timeout-ms');
const SCRATCH_ROOT = resolve(
  scratchRootArg || process.env.HOLOSCRIPT_CANARY_SCRATCH_ROOT || tmpdir(),
);
const NPM_CACHE_ROOT = npmCacheRootArg ? resolve(npmCacheRootArg) : null;
const MIN_FREE_BYTES = minFreeBytesArg === null ? 0 : Number(minFreeBytesArg);
const INSTALL_TIMEOUT_MS = installTimeoutArg === null ? 180_000 : Number(installTimeoutArg);
const PROBE_TIMEOUT_MS = probeTimeoutArg === null ? 300_000 : Number(probeTimeoutArg);
const PACKAGE_SPEC = packageIdx >= 0 ? args[packageIdx + 1] : '@holoscript/core@latest';
const LOCAL_PACKAGE_PATH = existsSync(resolve(PACKAGE_SPEC)) ? resolve(PACKAGE_SPEC) : null;
const INSTALL_SPEC = LOCAL_PACKAGE_PATH || PACKAGE_SPEC;
const DISPLAY_PACKAGE_SPEC = LOCAL_PACKAGE_PATH
  ? `file:<local-artifact>/${basename(LOCAL_PACKAGE_PATH)}`
  : PACKAGE_SPEC;
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
let ACTIVE_WORK_DIR = null;
const PACKAGE_IMPORT_PROBES = {
  'agent-protocol-public-api': ['@holoscript/agent-protocol'],
  'llm-provider-public-api': ['@holoscript/llm-provider'],
  'snn-webgpu-public-api': ['@holoscript/snn-webgpu'],
  'holoembed-public-api': ['@holoscript/holoembed'],
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
  'sdk-compat-import': ['@holoscript/sdk', '@holoscript/sdk/schema'],
  'memory-client-import': ['@holoscript/memory'],
  'agent-runtime-import': ['@holoscript/agent-runtime'],
  'formatter-import': ['@holoscript/formatter'],
  'holoscript-agent-library-import': [
    '@holoscript/holoscript-agent/brain',
    '@holoscript/holoscript-agent/identity',
    '@holoscript/holoscript-agent/cost-guard',
    '@holoscript/holoscript-agent/supervisor-config',
  ],
  'xr-embodiment-import': ['@holoscript/xr-embodiment', '@holoscript/xr-embodiment/three'],
};
const PACKAGE_REQUIRED_EXPORTS = {
  'agent-protocol-public-api': {
    '@holoscript/agent-protocol': ['ProtocolPhase', 'PHASE_NAMES', 'isPattern'],
  },
  'llm-provider-public-api': {
    '@holoscript/llm-provider': ['LLMProviderManager', 'MockAdapter', 'createMockProvider'],
  },
  'snn-webgpu-public-api': {
    '@holoscript/snn-webgpu': ['LIFSimulator', 'SNNNetwork', 'DEFAULT_LIF_PARAMS'],
  },
  'holoembed-public-api': {
    '@holoscript/holoembed': ['HoloEmbedEncoder', 'HOLOEMBED_DIM', 'trigramHistogram'],
  },
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
  'memory-bin-help': {
    packageName: '@holoscript/memory',
    runBin: 'holoscript-memory',
    expectedBins: ['holoscript-memory'],
    expectedOutput: [
      'HoloScript Sovereign Memory',
      'Usage: holoscript-memory',
      'doctor',
      'roundtrip',
    ],
  },
};
const PROBES = new Set([
  'systems-toolchain',
  'core-holo-webgpu',
  'mcp-server-sizing',
  'holollama-harness',
  'engine-public-api',
  'framework-public-api',
  'platform-public-api',
  'absorb-service-public-api',
  ...Object.keys(PACKAGE_IMPORT_PROBES),
  ...Object.keys(PACKAGE_BIN_HELP_PROBES),
]);

function inferProbe(packageSpec) {
  const spec = String(packageSpec);
  if (spec.startsWith('@holoscript/mcp-server')) return 'mcp-server-sizing';
  if (spec.startsWith('@holoscript/cli')) return 'cli-bin-help';
  return 'core-holo-webgpu';
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
  return String(value || '')
    .trim()
    .replace(/\/+$/u, '')
    .toLowerCase();
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

function inspectScratchCapacity(root = SCRATCH_ROOT, minimumBytes = MIN_FREE_BYTES) {
  if (!Number.isFinite(minimumBytes) || minimumBytes < 0) {
    return {
      ok: false,
      reason: 'invalid-min-free-bytes',
      root,
      minFreeBytes: minimumBytes,
      freeBytes: null,
    };
  }
  try {
    mkdirSync(root, { recursive: true });
  } catch (error) {
    return {
      ok: false,
      reason: 'scratch-root-unavailable',
      root,
      minFreeBytes: minimumBytes,
      freeBytes: null,
      detail: truncate(error),
    };
  }
  try {
    const stats = statfsSync(root);
    const blockSize = Number(stats.bsize);
    const freeBlocks = Number(stats.bavail);
    const freeBytes = blockSize * freeBlocks;
    const ok = Number.isFinite(freeBytes) && freeBytes >= minimumBytes;
    return {
      ok,
      reason: ok ? null : 'scratch-capacity-insufficient',
      root,
      blockSize,
      freeBytes,
      minFreeBytes: minimumBytes,
    };
  } catch (error) {
    return {
      ok: false,
      reason: 'scratch-capacity-unavailable',
      root,
      minFreeBytes: minimumBytes,
      freeBytes: null,
      detail: truncate(error),
    };
  }
}

function cleanupActiveWork(receipt) {
  if (!ACTIVE_WORK_DIR) return;
  const work = ACTIVE_WORK_DIR;
  ACTIVE_WORK_DIR = null;
  if (KEEP_TEMP) {
    if (receipt?.isolation) {
      receipt.isolation.cleanup = {
        attempted: false,
        ok: true,
        retained: true,
        reason: 'keep-temp',
      };
    }
    return;
  }
  try {
    rmSync(work, {
      recursive: true,
      force: true,
      maxRetries: 120,
      retryDelay: 1000,
    });
    if (receipt?.isolation) {
      receipt.isolation.cleanup = { attempted: true, ok: true, retained: false };
    }
  } catch (error) {
    if (receipt?.isolation) {
      receipt.isolation.cleanup = {
        attempted: true,
        ok: false,
        retained: true,
        detail: truncate(error),
      };
    }
  }
}

function fail(receipt, reason, error) {
  receipt.ok = false;
  receipt.failure = {
    reason,
    detail: truncate(error?.stderr || error?.stdout || error?.message || error),
  };
  cleanupActiveWork(receipt);
  emit(receipt);
  process.exit(1);
}

function redactReceiptPaths(value) {
  if (Array.isArray(value)) return value.map(redactReceiptPaths);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, redactReceiptPaths(child)])
    );
  }
  if (typeof value !== 'string') return value;
  if (
    LOCAL_PACKAGE_PATH &&
    value.startsWith('file:') &&
    value.includes(basename(LOCAL_PACKAGE_PATH))
  ) {
    return DISPLAY_PACKAGE_SPEC;
  }
  let redacted = value;
  for (const [path, replacement] of [
    [LOCAL_PACKAGE_PATH, '<local-artifact>'],
    [process.cwd(), '<repo>'],
    [SCRATCH_ROOT, '<scratch-root>'],
    [tmpdir(), '<temp-root>'],
  ]) {
    if (path) redacted = redacted.replaceAll(path, replacement);
  }
  return redacted;
}

function emit(receipt) {
  const safeReceipt = redactReceiptPaths(receipt);
  const text = `${JSON.stringify(safeReceipt, null, 2)}\n`;
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

function buildPlatformPublicApiProbeScript() {
  return `
import {
  AccessControl,
  CapabilityValidator,
  ContractValidator,
  MockWeb3Connector,
  TokenManager,
  TraitContractBuilder,
  TraitContractRegistry,
  createStrictPolicy,
  mergePolicy,
  parseSemVer,
  satisfiesRange,
  validateManifest,
  validatePackageName,
  createWeb3EventBridge
} from '@holoscript/platform';

const semver = parseSemVer('6.1.3');
const manifestValidation = validateManifest({
  name: '@holoscript/platform-canary',
  version: '1.2.3',
  dependencies: {
    '@holoscript/core': '^8.0.0'
  }
});

const access = new AccessControl();
access.createOrg('holoscript-canary', 'founder', 'HoloScript Canary');
access.addMember('holoscript-canary', 'agent', 'admin');
access.setVisibility('@holoscript/platform-canary', 'private', 'holoscript-canary');
access.grantAccess('@holoscript/platform-canary', 'agent', 'write', 'founder');

const tokenManager = new TokenManager();
const token = tokenManager.create({
  name: 'canary-ci',
  orgScope: 'holoscript-canary',
  permissions: ['read', 'publish'],
  readonly: false,
  expiresIn: 60
});
const tokenValidation = tokenManager.validate(token.rawToken);

const capability = new CapabilityValidator();
const capabilityToken = {
  issuer: 'did:holoscript:founder',
  subject: 'did:holoscript:agent',
  scopes: [
    {
      resource: 'registry.package',
      actions: ['read', 'write']
    }
  ],
  issuedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
  nonce: 'platform-public-api-canary'
};
const capabilityResult = capability.validate(capabilityToken, 'registry.package', 'write');
capability.markUsed(capabilityToken.nonce);
const replayResult = capability.validate(capabilityToken, 'registry.package', 'write');

const strict = createStrictPolicy();
const mergedPolicy = mergePolicy(strict, {
  network: { allowedHosts: ['registry.holoscript.net'], maxConnections: 1 }
});

const events = [];
const connector = new MockWeb3Connector();
const bridge = createWeb3EventBridge(connector, (event, data) => events.push({ event, data }));
const handledWallet = bridge.handle('wallet_request_connect', { provider: 'mock', chainId: 8453 });
const handledBalance = bridge.handle('token_gate_check_balance', {
  chain: 'base',
  contractAddress: '0x' + '1'.repeat(40),
  tokenType: 'ERC20',
  address: '0x' + '2'.repeat(40)
});
await new Promise((resolve) => setTimeout(resolve, 0));

const registry = new TraitContractRegistry();
const contract = TraitContractBuilder
  .for('x402_payment_gate')
  .requires('identity')
  .pre('amount is positive', (props) => Number(props.amount) > 0)
  .build();
registry.register(contract);
const contractValidation = new ContractValidator(registry).validatePreconditions(
  'x402_payment_gate',
  { amount: 1 },
  ['identity']
);

const checks = {
  hasExpectedConstructors:
    typeof AccessControl === 'function' &&
    typeof TokenManager === 'function' &&
    typeof CapabilityValidator === 'function' &&
    typeof MockWeb3Connector === 'function' &&
    typeof TraitContractRegistry === 'function',
  semverAndManifest:
    semver?.major === 6 &&
    satisfiesRange('6.1.3', '^6.0.0') &&
    validatePackageName('@holoscript/platform-canary').valid === true &&
    manifestValidation.valid === true,
  accessControl:
    access.isMember('holoscript-canary', 'agent') === true &&
    access.canAccess('@holoscript/platform-canary', 'agent', 'write') === true &&
    access.visiblePackages(['@holoscript/platform-canary'], 'agent').length === 1,
  tokenAuth:
    token.rawToken.startsWith('hls_') &&
    tokenValidation.valid === true &&
    tokenManager.hasPermission(tokenValidation.record, 'publish') === true &&
    tokenManager.listByScope('holoscript-canary').length === 1,
  capabilityAuth:
    capabilityResult.valid === true &&
    replayResult.valid === false &&
    replayResult.reason.includes('replay'),
  strictPolicy:
    strict.code.requireSignedPackages === true &&
    mergedPolicy.network.allowedHosts.includes('registry.holoscript.net') &&
    mergedPolicy.network.maxConnections === 1,
  web3Bridge:
    handledWallet === true &&
    handledBalance === true &&
    bridge.supportedEvents.includes('token_gate_check_balance') &&
    events.some((entry) => entry.event === 'wallet_connected') &&
    events.some((entry) => entry.event === 'token_gate_balance_result'),
  contractRegistry:
    registry.has('x402_payment_gate') === true &&
    contractValidation.valid === true
};

console.log(JSON.stringify({
  kind: 'platform-public-api',
  ok: Object.values(checks).every(Boolean),
  checks,
  samples: {
    semver,
    manifestErrors: manifestValidation.errors,
    access: {
      orgs: access.listOrgs().map((org) => org.name),
      visible: access.visiblePackages(['@holoscript/platform-canary'], 'agent')
    },
    token: {
      id: token.record.id,
      rawPrefix: token.rawToken.slice(0, 4),
      permissions: tokenValidation.record?.permissions || []
    },
    capability: {
      valid: capabilityResult.valid,
      replayReason: replayResult.reason
    },
    policy: {
      requireSignedPackages: mergedPolicy.code.requireSignedPackages,
      allowedHosts: mergedPolicy.network.allowedHosts
    },
    events: events.map((entry) => entry.event),
    contract: {
      traitName: contract.traitName,
      valid: contractValidation.valid
    }
  }
}, null, 2));
`;
}

function buildPackageImportProbeScript(probeKind) {
  const importSpecs = PACKAGE_IMPORT_PROBES[probeKind] || [];
  const requiredExportsBySpec = PACKAGE_REQUIRED_EXPORTS[probeKind] || {};
  return `
const importSpecs = ${JSON.stringify(importSpecs, null, 2)};
const requiredExportsBySpec = ${JSON.stringify(requiredExportsBySpec, null, 2)};
const imports = [];

for (const spec of importSpecs) {
  try {
    const namespace = await import(spec);
    const exportedKeys = Object.keys(namespace).sort();
    const requiredExports = requiredExportsBySpec[spec] || [];
    const missingExports = requiredExports.filter((name) => !(name in namespace));
    imports.push({
      spec,
      ok: missingExports.length === 0,
      exportCount: exportedKeys.length,
      sampleExports: exportedKeys.slice(0, 20),
      requiredExports,
      missingExports
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

function buildSystemsToolchainProbeScript() {
  return `
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import * as systems from '@holoscript/systems';

const wasmNamespace = await import('@holoscript/systems/wasm');
const wasm = wasmNamespace.default || wasmNamespace;
const packageRoot = resolve(process.cwd(), 'node_modules', '@holoscript', 'systems');
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
const release = JSON.parse(readFileSync(join(packageRoot, 'release-manifest.json'), 'utf8'));
const nativeBin = join(packageRoot, manifest.bin.holoscriptc);
const cliBin = join(packageRoot, manifest.bin.holoscript);
const conformanceDir = dirname(systems.conformanceSourcePath);
const conformancePrograms = readdirSync(conformanceDir)
  .filter((file) => file.endsWith('.hs'))
  .sort();
const wasmFailures = [];
const nativeFailures = [];

for (const file of conformancePrograms) {
  const sourcePath = join(conformanceDir, file);
  const source = readFileSync(sourcePath, 'utf8');
  const validation = wasm.validate(source);
  const parsed = JSON.parse(wasm.parse(source));
  if (validation !== true || parsed.error) wasmFailures.push(file);

  const output = join(process.cwd(), basename(file, '.hs') + '.exe');
  const compile = spawnSync(process.execPath, [nativeBin, sourcePath, '-o', output], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 180_000,
    windowsHide: true
  });
  if (compile.status !== 0 || !existsSync(output)) {
    nativeFailures.push({ program: file, phase: 'compile', exitCode: compile.status });
    continue;
  }
  const program = spawnSync(output, [], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      windowsHide: true
  });
  if (program.status !== 5) {
    nativeFailures.push({ program: file, phase: 'execute', exitCode: program.status });
  }
}
const cli = spawnSync(process.execPath, [cliBin, '--help'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 60_000,
  windowsHide: true
});
const cliText = String(cli.stdout || cli.stderr || '').replace(/\\u001b\\[[0-9;]*m/g, '');

const checks = {
  packageIdentity: manifest.name === '@holoscript/systems' && manifest.version === '0.1.0',
  exactCorePin: manifest.dependencies?.['@holoscript/core'] === '8.0.17',
  exactCliPin: manifest.dependencies?.['@holoscript/cli'] === '8.0.11',
  expectedBins: ['holoscript', 'hs', 'holoscriptc'].every((name) => name in (manifest.bin || {})),
  releaseIdentity:
    release.distributionId === 'holoscript-systems-toolchain' &&
    release.version === '0.1.0' &&
    release.machineContract === 'hs-machine-v32' &&
    /^[0-9a-f]{40}$/.test(release.sourceCommit || ''),
  exportedIdentity:
    systems.distribution?.version === release.version &&
    systems.distribution?.sourceCommit === release.sourceCommit,
  cumulativeCorpus:
    conformancePrograms.length >= 25 &&
    release.conformanceCorpus?.programCount === conformancePrograms.length,
  wasmCumulativeConformance: wasmFailures.length === 0,
  nativeCumulativeConformance: nativeFailures.length === 0,
  cliHelp: cli.status === 0 && cliText.includes('HoloScript')
};

console.log(JSON.stringify({
  kind: 'systems-toolchain',
  ok: Object.values(checks).every(Boolean),
  checks,
  sourceCommit: release.sourceCommit,
  native: {
    programCount: conformancePrograms.length,
    expectedExitCode: 5,
    failures: nativeFailures
  },
  wasm: { version: wasm.version(), programCount: conformancePrograms.length, failures: wasmFailures },
  cli: { exitCode: cli.status, stdoutBytes: Buffer.byteLength(cliText) }
}, null, 2));
`;
}

function main() {
  const scratchCapacity = inspectScratchCapacity();
  if (!scratchCapacity.ok) {
    const receipt = {
      schema: 'holoscript.registry-cold-start.receipt.v1',
      generatedAt: new Date().toISOString(),
      ok: false,
      package: { spec: DISPLAY_PACKAGE_SPEC, metadata: null, installed: null },
      registry: {
        requestedUrl: REGISTRY_URL,
        url: REGISTRY_URL || process.env.npm_config_registry || null,
        publicFallbackAllowed: !PUBLIC_FALLBACK_DISABLED,
        publicFallbackDisabled: PUBLIC_FALLBACK_DISABLED,
        clientPolicy: REGISTRY_URL ? 'explicit-registry' : 'npm-config',
        publicRegistryUrls: [...PUBLIC_NPM_REGISTRIES],
      },
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      isolation: {
        scratchRoot: SCRATCH_ROOT,
        npmCacheRoot: NPM_CACHE_ROOT,
        tempDir: null,
        npmCacheDir: null,
        tempDirKept: KEEP_TEMP,
        capacity: scratchCapacity,
        npmCachePreference: NPM_CACHE_PREFERENCE,
        timeouts: {
          installMs: INSTALL_TIMEOUT_MS,
          probeMs: PROBE_TIMEOUT_MS,
        },
        cleanup: { attempted: false, ok: true, retained: false },
        repoAccess: false,
      },
      probeKind: PROBE,
      probe: null,
      finalDisposition: 'repo_less_scratch_preflight_failed',
      failure: {
        reason: scratchCapacity.reason,
        detail: scratchCapacity.detail ||
          `scratch root ${SCRATCH_ROOT} has ${scratchCapacity.freeBytes ?? 'unknown'} free bytes; ` +
          `${MIN_FREE_BYTES} required`,
      },
    };
    emit(receipt);
    process.exit(1);
  }

  const work = mkdtempSync(join(SCRATCH_ROOT, 'hs-registry-cold-start-'));
  ACTIVE_WORK_DIR = work;
  const npmCacheDir = NPM_CACHE_ROOT || join(work, 'npm-cache');
  mkdirSync(npmCacheDir, { recursive: true });
  writeConsumerPackageJson(work);
  const installOmit = installOmitArgs();
  const receipt = {
    schema: 'holoscript.registry-cold-start.receipt.v1',
    generatedAt: new Date().toISOString(),
    ok: false,
    package: {
      spec: DISPLAY_PACKAGE_SPEC,
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
      scratchRoot: SCRATCH_ROOT,
      npmCacheRoot: NPM_CACHE_ROOT,
      capacity: scratchCapacity,
      npmCachePreference: NPM_CACHE_PREFERENCE,
      tempDir: work,
      npmCacheDir,
      tempDirKept: KEEP_TEMP,
      timeouts: {
        installMs: INSTALL_TIMEOUT_MS,
        probeMs: PROBE_TIMEOUT_MS,
      },
      repoAccess: false,
      installCommand:
        `npm install ${DISPLAY_PACKAGE_SPEC}${REGISTRY_URL ? ` --registry ${REGISTRY_URL}` : ''} ` +
        '--ignore-scripts --no-audit --no-fund ' +
        `${installOmit.join(' ')} ${NPM_CACHE_PREFERENCE} --cache ${NPM_CACHE_ROOT ? '<scratch-root>/npm-cache' : '<temp>/npm-cache'} --loglevel=error`,
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

  if (LOCAL_PACKAGE_PATH) {
    receipt.package.metadata = {
      source: 'local-artifact',
      filename: basename(LOCAL_PACKAGE_PATH),
      sha256: sha256(readFileSync(LOCAL_PACKAGE_PATH)),
    };
  } else {
    try {
      const metadataRaw = runNpm(
        [
          'view',
          PACKAGE_SPEC,
          'name',
          'version',
          'dist.integrity',
          'dist.tarball',
          'dependencies',
          'exports',
          '--json',
        ],
        { cwd: work }
      );
      receipt.package.metadata = JSON.parse(metadataRaw);
    } catch (error) {
      fail(receipt, 'npm-view-failed', error);
    }
  }

  try {
    run(
      'npm',
      withRegistry([
        'install',
        INSTALL_SPEC,
        '--ignore-scripts',
        '--no-audit',
        '--no-fund',
        ...installOmit,
        NPM_CACHE_PREFERENCE,
        '--cache',
        npmCacheDir,
        '--loglevel=error',
      ]),
      { cwd: work, timeout: INSTALL_TIMEOUT_MS, env: npmEnv() }
    );
  } catch (error) {
    fail(receipt, 'npm-install-failed', error);
  }

  try {
    const consumerManifest = readJsonIfExists(join(work, 'package.json'));
    const directPackageNames = Object.keys(consumerManifest?.dependencies || {});
    const packageName =
      receipt.package.metadata?.name ||
      directPackageNames.find((name) => name.startsWith('@holoscript/')) ||
      String(PACKAGE_SPEC)
        .replace(/@latest$/u, '')
        .replace(/@\d+\.\d+\.\d+.*$/u, '');
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
    if (LOCAL_PACKAGE_PATH && manifest) {
      receipt.package.metadata.name = manifest.name;
      receipt.package.metadata.version = manifest.version;
      receipt.package.metadata.dependencies = manifest.dependencies || {};
      receipt.package.metadata.exports = manifest.exports || {};
    }
  } catch (error) {
    fail(receipt, 'installed-package-inspection-failed', error);
  }

  try {
    const probeFile = join(work, 'probe.mjs');
    if (PROBE === 'systems-toolchain') {
      writeFileSync(probeFile, buildSystemsToolchainProbeScript());
    } else if (PROBE === 'core-holo-webgpu') {
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
    } else if (PROBE === 'platform-public-api') {
      writeFileSync(probeFile, buildPlatformPublicApiProbeScript());
    } else if (PROBE === 'absorb-service-public-api') {
      writeFileSync(probeFile, buildAbsorbServicePublicApiProbeScript());
    } else if (PACKAGE_IMPORT_PROBES[PROBE]) {
      writeFileSync(probeFile, buildPackageImportProbeScript(PROBE));
    } else if (PACKAGE_BIN_HELP_PROBES[PROBE]) {
      writeFileSync(probeFile, buildPackageBinHelpProbeScript(PROBE));
    }
    const probe = JSON.parse(
      run('node', [probeFile], {
        cwd: work,
        timeout: PROBE === 'systems-toolchain' ? PROBE_TIMEOUT_MS : 60_000,
      })
    );
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
    cleanupActiveWork(receipt);
  }

  emit(receipt);
  process.exit(receipt.ok ? 0 : 1);
}

main();
