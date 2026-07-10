import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LlamaServerCompiler,
  type LlamaServerBundle,
  type LlamaServerCompilerOptions,
} from '@holoscript/core/compiler';
import { parseHolo, type HoloParseError } from '@holoscript/core/parser';

export {
  HOLOLLAMA_BRAIN_LEXICON,
  HOLOLLAMA_BRAIN_SELECTION_SCHEMA,
  HOLOLLAMA_BRAIN_CONSUMER_PROFILE_DEFINITIONS,
  HOLOLLAMA_BRAIN_DEFINITIONS,
  listHoloLlamaBrainConsumerProfiles,
  listHoloLlamaBrains,
  profileIdForHoloLlamaDevice,
  scoreHoloLlamaBrain,
  scoreHoloLlamaBrains,
  selectHoloLlamaBrain,
} from './brain.js';
export type {
  HoloLlamaBrainConsumerProfileDefinition,
  HoloLlamaBrainConsumerProfileId,
  HoloLlamaBrainDefinition,
  HoloLlamaBrainId,
  HoloLlamaBrainScore,
  HoloLlamaBrainSelection,
  SelectHoloLlamaBrainOptions,
} from './brain.js';

export type HoloLlamaProfile = 'jetson-orin' | 'laptop-windows' | 'vast-linux-gpu';

export interface HoloLlamaServeSpec {
  name: string;
  model: string;
  modelPath: string;
  mmprojPath?: string;
  vision: boolean;
  host: string;
  port: number;
  contextLength: number;
  gpuLayers: number;
  fit: 'on' | 'off';
  imageMinTokens?: number;
  imageMaxTokens?: number;
  parallel: number;
  metrics: boolean;
  grammar?: string;
  grammarPath?: string;
  loras?: Array<string | { path: string; scale?: number }>;
  loraInitWithoutApply?: boolean;
  executable: string;
  cudaPath?: string;
  llamaBinDir?: string;
  workingDirectory?: string;
  platform: 'windows' | 'linux';
  serviceUser: string;
  node: string;
  registerAs: string;
}

export interface HoloLlamaProfileDefinition {
  id: HoloLlamaProfile;
  label: string;
  consumer: 'jetson' | 'laptop' | 'vast';
  description: string;
  spec: HoloLlamaServeSpec;
}

export interface CompileHoloLlamaInput {
  code?: string;
  profile?: HoloLlamaProfile;
  overrides?: Partial<HoloLlamaServeSpec>;
  compilerOptions?: LlamaServerCompilerOptions;
}

export interface HoloLlamaBundleCheck {
  ok: true;
  requiredFiles: string[];
  registryHandle: string;
  healthUrl: string;
}

export interface HoloLlamaBundleSummary {
  name: string;
  target: 'llama-server';
  command: string;
  healthUrl: string;
  registryHandle: string;
  endpoint: string;
  files: string[];
  capabilities: LlamaServerBundle['registryEntry']['capabilities'];
  warnings: string[];
}

export interface HoloLlamaDoctorOptions {
  profile?: HoloLlamaProfile;
  generatedAt?: string;
}

export interface HoloLlamaProfileDoctorResult {
  profile: HoloLlamaProfile;
  consumer: HoloLlamaProfileDefinition['consumer'];
  ok: boolean;
  registryHandle: string;
  healthUrl: string;
  endpoint: string;
  files: string[];
  warnings: string[];
  blockers: string[];
}

export interface HoloLlamaDoctorReport {
  schema: typeof HOLOLLAMA_DOCTOR_SCHEMA;
  generatedAt: string;
  ok: boolean;
  profiles: HoloLlamaProfileDoctorResult[];
}

export interface HoloLlamaMeshReadOnlyBridgeOptions {
  profile?: HoloLlamaProfile;
  teamId?: string;
  orchestratorUrl?: string;
  apiKeyEnv?: string;
  generatedAt?: string;
}

export interface HoloLlamaReadOnlyEndpoint {
  id: string;
  method: 'GET';
  path: string;
  url: string;
  purpose: string;
}

export interface HoloLlamaMeshReadOnlyBridgeReceipt {
  schema: typeof HOLOLLAMA_MESH_READONLY_BRIDGE_SCHEMA;
  generatedAt: string;
  ok: boolean;
  profile: HoloLlamaProfile;
  consumer: HoloLlamaProfileDefinition['consumer'];
  registryHandle: string;
  node: string;
  mode: 'read-only';
  mesh: {
    orchestratorUrl: string;
    teamId: string;
    apiKeyEnv: string;
    authHeader: string;
  };
  access: {
    allowedMethods: ['GET'];
    forbiddenMethods: ['POST', 'PATCH', 'PUT', 'DELETE'];
    writeScopes: [];
  };
  deviceRegistry: {
    handle: string;
    endpoint: string;
    healthUrl: string;
    capabilities: LlamaServerBundle['registryEntry']['capabilities'];
  };
  endpoints: HoloLlamaReadOnlyEndpoint[];
  lifecycleUse: string[];
  warnings: string[];
  blockers: string[];
}

export interface HoloLlamaVisionPreflightOptions {
  generatedAt?: string;
  checkFilesystem?: boolean;
  exists?: (path: string) => boolean;
}

export interface HoloLlamaPreflightCheck {
  id: string;
  required: boolean;
  ok: boolean;
  detail: string;
}

export interface HoloLlamaFilesystemCheck {
  id: string;
  path: string;
  required: boolean;
  exists: boolean;
}

export interface HoloLlamaVisionPreflightReceipt {
  schema: typeof HOLOLLAMA_VISION_PREFLIGHT_SCHEMA;
  generatedAt: string;
  ok: boolean;
  profile: HoloLlamaProfile;
  consumer: HoloLlamaProfileDefinition['consumer'];
  registryHandle: string;
  visionRequested: boolean;
  launchCommand: string;
  checks: HoloLlamaPreflightCheck[];
  filesystemChecks: HoloLlamaFilesystemCheck[];
  warnings: string[];
  blockers: string[];
}

export interface HoloLlamaServerContractOptions {
  generatedAt?: string;
}

export interface HoloLlamaServerContractReceipt {
  schema: typeof HOLOLLAMA_SERVER_CONTRACT_SCHEMA;
  generatedAt: string;
  ok: boolean;
  profile: HoloLlamaProfile;
  consumer: HoloLlamaProfileDefinition['consumer'];
  registryHandle: string;
  visionRequested: boolean;
  checks: HoloLlamaPreflightCheck[];
  warnings: string[];
  blockers: string[];
}

export interface HoloLlamaRuntimePortOwnerEvidence {
  ok: boolean;
  detail: string;
  pid?: number;
  executable?: string;
  commandLine?: string;
}

export interface HoloLlamaStaleServerCleanupEvidence {
  ok: boolean;
  detail: string;
  stalePids?: number[];
  cleanedPids?: number[];
}

export interface HoloLlamaRuntimeObservation {
  portOwner: HoloLlamaRuntimePortOwnerEvidence;
  staleServerCleanup: HoloLlamaStaleServerCleanupEvidence;
  openaiModels: unknown;
  props: unknown;
}

export interface HoloLlamaRuntimeReadinessOptions {
  generatedAt?: string;
  requireRuntimeReadiness?: boolean;
  observation?: HoloLlamaRuntimeObservation;
}

export interface HoloLlamaRuntimeReadinessReceipt {
  schema: typeof HOLOLLAMA_RUNTIME_READINESS_SCHEMA;
  generatedAt: string;
  ok: boolean;
  profile: HoloLlamaProfile;
  consumer: HoloLlamaProfileDefinition['consumer'];
  registryHandle: string;
  endpoint: string;
  visionRequested: boolean;
  runtimeRequired: boolean;
  checks: HoloLlamaPreflightCheck[];
  warnings: string[];
  blockers: string[];
}

export interface HoloLlamaSystemdEvidence {
  unit: string;
  raw?: string;
  LoadState?: string;
  ActiveState?: string;
  SubState?: string;
  FragmentPath?: string;
  ExecMainPID?: string;
  loaded?: boolean;
  active?: boolean;
  running?: boolean;
  ok: boolean | null;
  skipped?: boolean;
  error?: string;
}

export interface HoloLlamaHttpProbe {
  url: string;
  ok: boolean | null;
  status?: number;
  statusText?: string;
  body?: unknown;
  error?: string;
  skipped?: boolean;
}

export interface HoloLlamaLiveModelSummary {
  id: string | null;
  name: string | null;
  ownedBy: string | null;
  nVocab: number | null;
  nCtx: number | null;
  nParams: number | null;
}

export interface HoloLlamaCompletionProbe extends HoloLlamaHttpProbe {
  mode?: 'openai-chat' | 'llama-completion-fallback';
  model?: string;
  contentPreview?: string;
  completionOk?: boolean;
  fallbackFrom?: {
    url: string;
    ok: boolean | null;
    status?: number;
    error?: string | null;
  };
}

export type HoloLlamaFetch = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
}>;

export interface HoloLlamaLiveLifecycleOptions {
  profile?: HoloLlamaProfile;
  generatedAt?: string;
  endpoint?: string;
  sshHost?: string;
  sshKey?: string;
  systemdUnit?: string;
  modelsPath?: string;
  timeoutMs?: number;
  prompt?: string;
  maxTokens?: number;
  noLive?: boolean;
  skipSystemd?: boolean;
  skipFootprint?: boolean;
  requireSystemd?: boolean;
  fetchImpl?: HoloLlamaFetch;
  systemdProbe?: HoloLlamaSystemdEvidence;
  footprintProbe?: HoloLlamaFootprintEvidence;
}

export interface HoloLlamaFootprintEvidence {
  ok: boolean | null;
  skipped?: boolean;
  source: 'ssh-procfs-journal' | 'provided' | 'none';
  unit?: string;
  pid?: number | null;
  command?: string | null;
  expected: {
    executable: string;
    modelPath: string;
    loraPaths: string[];
    gpuLayers: number;
    contextLength: number;
  };
  observed: {
    executable?: string | null;
    modelPath?: string | null;
    loraPaths?: string[];
    gpuLayers?: number | null;
    contextLength?: number | null;
    cacheRamMiB?: number | null;
    promptCacheLimitMiB?: number | null;
    noUsableGpuWarning?: boolean;
    processRssMiB?: number | null;
    processHighWaterMiB?: number | null;
    processSwapMiB?: number | null;
    ramUsedMiB?: number | null;
    ramTotalMiB?: number | null;
    swapUsedMiB?: number | null;
    swapTotalMiB?: number | null;
    modelFilesMiB?: number | null;
  };
  warnings: string[];
  blockers: string[];
}

export interface HoloLlamaFootprintAssessmentInput {
  source?: HoloLlamaFootprintEvidence['source'];
  unit?: string;
  pid?: number | null;
  command?: string | null;
  promptCacheLimitMiB?: number | null;
  noUsableGpuWarning?: boolean;
  processRssMiB?: number | null;
  processHighWaterMiB?: number | null;
  processSwapMiB?: number | null;
  ramUsedMiB?: number | null;
  ramTotalMiB?: number | null;
  swapUsedMiB?: number | null;
  swapTotalMiB?: number | null;
  modelFilesMiB?: number | null;
}

export interface HoloLlamaLiveLifecycleReceipt {
  schema: typeof HOLOLLAMA_LIVE_LIFECYCLE_SCHEMA;
  generatedAt: string;
  ok: boolean;
  runtimeState: 'ready' | 'attention_required' | 'blocked';
  profile: HoloLlamaProfile;
  consumer: HoloLlamaProfileDefinition['consumer'];
  registryHandle: string;
  target: {
    endpoint: string;
    unit?: string;
    sshHost?: string;
    modelsPath: string;
    package: '@holoscript/holollama';
    providerCompatibilityId: string;
  };
  checks: {
    systemd: HoloLlamaSystemdEvidence;
    footprint: HoloLlamaFootprintEvidence;
    health: HoloLlamaHttpProbe;
    models: HoloLlamaHttpProbe;
    model: HoloLlamaLiveModelSummary | null;
    completion: HoloLlamaCompletionProbe;
  };
  failures: string[];
  warnings: string[];
  safety: {
    destructiveActionsTaken: false;
    paidComputeUsed: false;
    secretsIncluded: false;
  };
  receiptHash: string;
}

export interface HoloLlamaFleetLifecycleOptions
  extends
    HoloLlamaMeshReadOnlyBridgeOptions,
    Pick<HoloLlamaVisionPreflightOptions, 'checkFilesystem' | 'exists'> {
  requireRuntimeReadiness?: boolean;
  runtimeObservations?: Partial<Record<HoloLlamaProfile, HoloLlamaRuntimeObservation>>;
  requireLiveLifecycle?: boolean;
  liveLifecycleReceipts?: Partial<Record<HoloLlamaProfile, HoloLlamaLiveLifecycleReceipt>>;
}

export interface HoloLlamaFleetLifecycleStage {
  id:
    | 'plan'
    | 'server-contract'
    | 'vision-preflight'
    | 'runtime-readiness'
    | 'mesh-readonly-bridge'
    | 'serve-health-probe'
    | 'live-lifecycle';
  ok: boolean;
  receiptSchema: string;
  summary: string;
}

export interface HoloLlamaFleetLifecycleProfile {
  profile: HoloLlamaProfile;
  consumer: HoloLlamaProfileDefinition['consumer'];
  registryHandle: string;
  ok: boolean;
  stages: HoloLlamaFleetLifecycleStage[];
  doctor: HoloLlamaProfileDoctorResult;
  serverContract: HoloLlamaServerContractReceipt;
  visionPreflight: HoloLlamaVisionPreflightReceipt;
  runtimeReadiness: HoloLlamaRuntimeReadinessReceipt;
  meshReadOnlyBridge: HoloLlamaMeshReadOnlyBridgeReceipt;
  liveLifecycle?: HoloLlamaLiveLifecycleReceipt;
}

export interface HoloLlamaFleetLifecycleReport {
  schema: typeof HOLOLLAMA_FLEET_LIFECYCLE_SCHEMA;
  generatedAt: string;
  ok: boolean;
  profiles: HoloLlamaFleetLifecycleProfile[];
}

export interface HoloLlamaHarnessSafetyIssue {
  file: string;
  kind: 'private-anchor' | 'filled-secret';
  id: string;
  detail: string;
}

export interface HoloLlamaHarnessSafetyReport {
  schema: typeof HOLOLLAMA_HARNESS_SAFETY_SCHEMA;
  generatedAt: string;
  ok: boolean;
  root: string;
  filesScanned: string[];
  issues: HoloLlamaHarnessSafetyIssue[];
}

export interface HoloLlamaHarnessSafetyOptions {
  generatedAt?: string;
  rootLabel?: string;
}

export interface HoloLlamaHarnessInstallOptions extends HoloLlamaMeshReadOnlyBridgeOptions {
  targetDir?: string;
  force?: boolean;
  writeReceipts?: boolean;
}

export interface HoloLlamaHarnessInstallReceipt {
  schema: typeof HOLOLLAMA_HARNESS_INSTALL_SCHEMA;
  generatedAt: string;
  ok: boolean;
  targetDir: string;
  template: string;
  files: string[];
  receiptFiles: string[];
  safety: HoloLlamaHarnessSafetyReport;
  doctor: HoloLlamaDoctorReport;
  lifecycle: HoloLlamaFleetLifecycleReport;
  warnings: string[];
  blockers: string[];
  receiptHash: string;
}

const DEFAULT_IMAGE_MIN_TOKENS = 1024;
const DEFAULT_IMAGE_MAX_TOKENS = 1536;
const DEFAULT_JETSON_HOLO_LLAMA_EXECUTABLE =
  '/opt/holoscript/llama.cpp/build-holo/bin/llama-server';
// Portable defaults (W.726 cross-platform-paths R1): env override first, else derive from
// the user home dir so no hardcoded drive literal ships in this published package. On the
// founder's Windows laptop homedir() resolves to C:\Users\josep, preserving prior behavior.
const DEFAULT_LAPTOP_HOLO_LLAMA_BIN_DIR =
  process.env.HOLO_LLAMA_LAPTOP_BIN_DIR ||
  join(homedir(), 'Documents', 'GitHub', 'llama.cpp', 'build-holo', 'bin', 'Release');
const DEFAULT_LAPTOP_HOLO_LLAMA_EXECUTABLE =
  process.env.HOLO_LLAMA_LAPTOP_EXECUTABLE ||
  join(DEFAULT_LAPTOP_HOLO_LLAMA_BIN_DIR, 'llama-server.exe');
const DEFAULT_HOLOMESH_ORCHESTRATOR_URL = 'https://mcp-orchestrator-production-45f9.up.railway.app';
const DEFAULT_HOLOMESH_TEAM_ID = 'TEAM_ID';
const DEFAULT_HOLOMESH_API_KEY_ENV = 'HOLOSCRIPT_API_KEY';
const DEFAULT_JETSON_HOLOLLAMA_LIVE_ENDPOINT = 'http://192.168.0.119:18080';
const DEFAULT_JETSON_HOLOLLAMA_SSH_HOST = 'username@192.168.0.119';
const DEFAULT_JETSON_HOLOLLAMA_SYSTEMD_UNIT = 'jetson-orin-llamacpp.service';
const HOLOLLAMA_PROFILE_SOURCE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'profiles'
);
const HOLOLLAMA_PUBLIC_HARNESS_TEMPLATE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'templates',
  'ai-ecosystem-basic'
);
export const HOLOLLAMA_DOCTOR_SCHEMA = 'holollama.doctor.v1';
export const HOLOLLAMA_MESH_READONLY_BRIDGE_SCHEMA = 'holollama.holomesh-readonly-bridge.v1';
export const HOLOLLAMA_SERVER_CONTRACT_SCHEMA = 'holollama.llama-cpp-server-contract.v1';
export const HOLOLLAMA_VISION_PREFLIGHT_SCHEMA = 'holollama.llama-cpp-vision-preflight.v1';
export const HOLOLLAMA_RUNTIME_READINESS_SCHEMA = 'holollama.llama-cpp-runtime-readiness.v1';
export const HOLOLLAMA_LIVE_LIFECYCLE_SCHEMA = 'holollama.lifecycle-doctor.v1';
export const HOLOLLAMA_FLEET_LIFECYCLE_SCHEMA = 'holollama.fleet-lifecycle.v1';
export const HOLOLLAMA_HARNESS_SAFETY_SCHEMA = 'holollama.public-harness-safety.v1';
export const HOLOLLAMA_HARNESS_INSTALL_SCHEMA = 'holollama.public-harness-install.v1';
export const HOLOLLAMA_PROFILE_DEFINITIONS: Record<HoloLlamaProfile, HoloLlamaProfileDefinition> = {
  'jetson-orin': {
    id: 'jetson-orin',
    label: 'Jetson Orin owned-metal lane',
    consumer: 'jetson',
    description: 'Linux ARM64 text-serving HoloLlama lane for the owned Jetson.',
    spec: {
      name: 'jetson-brittney-edge',
      model: 'qwen3-4b-instruct+brittney-edge:v0-4',
      modelPath: '/opt/holoscript/models/qwen3-4b-instruct.gguf',
      vision: false,
      host: '0.0.0.0',
      port: 18080,
      contextLength: 4096,
      gpuLayers: 32,
      fit: 'on',
      parallel: 1,
      metrics: true,
      grammar: 'holoscript',
      loras: ['/opt/holoscript/models/brittney-edge-v0-4.lora.gguf'],
      executable: DEFAULT_JETSON_HOLO_LLAMA_EXECUTABLE,
      workingDirectory: '/opt/holoscript/holollama',
      platform: 'linux',
      serviceUser: 'holoscript',
      node: 'jetson-orin',
      registerAs: 'jetson-brittney-edge',
    },
  },
  'laptop-windows': {
    id: 'laptop-windows',
    label: 'Founder laptop Windows lane',
    consumer: 'laptop',
    description: 'Windows vision/tooling lane for local laptop HoloLlama experiments.',
    spec: {
      name: 'laptop-fara-vision',
      model: 'fara-7b',
      modelPath: '.scratch\\llama-cpp-models\\fara-7b-q4-k-m.gguf',
      mmprojPath: '.scratch\\llama-cpp-models\\fara-7b-mmproj.gguf',
      vision: true,
      host: '127.0.0.1',
      port: 18080,
      contextLength: 4096,
      gpuLayers: 12,
      fit: 'on',
      imageMinTokens: DEFAULT_IMAGE_MIN_TOKENS,
      imageMaxTokens: DEFAULT_IMAGE_MAX_TOKENS,
      parallel: 1,
      metrics: true,
      executable: DEFAULT_LAPTOP_HOLO_LLAMA_EXECUTABLE,
      llamaBinDir: DEFAULT_LAPTOP_HOLO_LLAMA_BIN_DIR,
      platform: 'windows',
      serviceUser: 'holoscript',
      node: 'laptop-rtx3060',
      registerAs: 'laptop-fara-7b-llama',
    },
  },
  'vast-linux-gpu': {
    id: 'vast-linux-gpu',
    label: 'Vast Linux GPU fleet lane',
    consumer: 'vast',
    description: 'Linux x64 GPU fleet lane for higher-throughput HoloLlama serving.',
    spec: {
      name: 'vast-holollama',
      model: 'brittney-edge:v0-4',
      modelPath: '/models/holoscript/brittney-edge-v0-4.gguf',
      vision: false,
      host: '0.0.0.0',
      port: 18080,
      contextLength: 8192,
      gpuLayers: 99,
      fit: 'on',
      parallel: 4,
      metrics: true,
      grammar: 'holoscript',
      executable: '/srv/holoscript/llama.cpp/build-holo/bin/llama-server',
      workingDirectory: '/srv/holoscript/holollama',
      platform: 'linux',
      serviceUser: 'holoscript',
      node: 'vast-linux-gpu',
      registerAs: 'vast-holollama',
    },
  },
};

const REQUIRED_BUNDLE_FILES = [
  'launch-llama-server.ps1',
  'health-probe.ps1',
  'install-s4u-task.ps1',
  'llama-server-manifest.json',
];

export class HoloLlamaCompileError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: HoloParseError[] = []
  ) {
    super(message);
    this.name = 'HoloLlamaCompileError';
  }
}

export function listHoloLlamaProfiles(): HoloLlamaProfileDefinition[] {
  return Object.values(HOLOLLAMA_PROFILE_DEFINITIONS);
}

export function resolveHoloLlamaServeSpec(
  profile: HoloLlamaProfile = 'jetson-orin',
  overrides: Partial<HoloLlamaServeSpec> = {}
): HoloLlamaServeSpec {
  const definition = HOLOLLAMA_PROFILE_DEFINITIONS[profile];
  if (!definition) {
    throw new Error(`Unknown HoloLlama profile: ${profile}`);
  }
  return { ...definition.spec, ...defined(overrides) };
}

export function getHoloLlamaProfileSourcePath(profile: HoloLlamaProfile): string {
  return join(HOLOLLAMA_PROFILE_SOURCE_DIR, `${profile}.holo`);
}

export function readHoloLlamaProfileSource(profile: HoloLlamaProfile = 'jetson-orin'): string {
  return readFileSync(getHoloLlamaProfileSourcePath(profile), 'utf8');
}

export function buildLlamaServeComposition(
  profileOrSpec: HoloLlamaProfile | HoloLlamaServeSpec = 'jetson-orin',
  overrides: Partial<HoloLlamaServeSpec> = {}
): string {
  const cleanOverrides = defined(overrides);
  if (typeof profileOrSpec === 'string' && Object.keys(cleanOverrides).length === 0) {
    return readHoloLlamaProfileSource(profileOrSpec);
  }
  const spec =
    typeof profileOrSpec === 'string'
      ? resolveHoloLlamaServeSpec(profileOrSpec, cleanOverrides)
      : { ...profileOrSpec, ...cleanOverrides };
  return renderLlamaServeComposition(spec);
}

function renderLlamaServeComposition(spec: HoloLlamaServeSpec): string {
  const lines = [
    `composition ${quote(spec.name)} {`,
    '  @llama_serve {',
    `    name: ${quote(spec.name)}`,
    `    model: ${quote(spec.model)}`,
    `    model_path: ${quote(spec.modelPath)}`,
    spec.vision && spec.mmprojPath
      ? `    mmproj_path: ${quote(spec.mmprojPath)}`
      : '    mmproj_path: "none"',
    `    vision: ${spec.vision ? 'true' : 'false'}`,
    `    host: ${quote(spec.host)}`,
    `    port: ${spec.port}`,
    `    ctx: ${spec.contextLength}`,
    `    ngl: ${spec.gpuLayers}`,
    `    fit: ${quote(spec.fit)}`,
    `    parallel: ${spec.parallel}`,
    `    metrics: ${spec.metrics ? 'true' : 'false'}`,
  ];

  if (spec.imageMinTokens !== undefined) lines.push(`    image_min_tokens: ${spec.imageMinTokens}`);
  if (spec.imageMaxTokens !== undefined) lines.push(`    image_max_tokens: ${spec.imageMaxTokens}`);
  if (spec.grammar) lines.push(`    grammar: ${quote(spec.grammar)}`);
  if (spec.grammarPath) lines.push(`    grammar_path: ${quote(spec.grammarPath)}`);
  if (spec.loras?.length) lines.push(`    lora: ${formatLoras(spec.loras)}`);
  if (spec.loraInitWithoutApply !== undefined) {
    lines.push(`    lora_init_without_apply: ${spec.loraInitWithoutApply ? 'true' : 'false'}`);
  }
  lines.push(`    executable: ${quote(spec.executable)}`);
  if (spec.cudaPath) lines.push(`    cuda_path: ${quote(spec.cudaPath)}`);
  if (spec.llamaBinDir) lines.push(`    llama_bin_dir: ${quote(spec.llamaBinDir)}`);
  if (spec.workingDirectory) lines.push(`    working_directory: ${quote(spec.workingDirectory)}`);
  lines.push(`    platform: ${quote(spec.platform)}`);
  lines.push(`    service_user: ${quote(spec.serviceUser)}`);
  lines.push(`    node: ${quote(spec.node)}`);
  lines.push(`    register_as: ${quote(spec.registerAs)}`);
  lines.push('  }');
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

export function compileHoloLlamaBundle(
  input: string | CompileHoloLlamaInput = {}
): LlamaServerBundle {
  const normalized = normalizeCompileInput(input);
  const result = parseHolo(normalized.code);
  if (!result.success || !result.ast) {
    throw new HoloLlamaCompileError(
      `HoloLlama @llama_serve parse failed with ${result.errors.length} error(s).`,
      result.errors
    );
  }
  const compiler = new LlamaServerCompiler(normalized.compilerOptions);
  return JSON.parse(compiler.compile(result.ast, '')) as LlamaServerBundle;
}

export function compileHoloLlamaFiles(
  input: string | CompileHoloLlamaInput = {}
): Record<string, string> {
  const bundle = compileHoloLlamaBundle(input);
  return Object.fromEntries(bundle.files.map((file) => [file.path, file.content]));
}

export function assertHoloLlamaBundleConsumable(bundle: LlamaServerBundle): HoloLlamaBundleCheck {
  const paths = new Set(bundle.files.map((file) => file.path));
  const registryPath = `sovereign-devices/${bundle.registryEntry.handle}.json`;
  const required = [...REQUIRED_BUNDLE_FILES, registryPath];
  const missing = required.filter((file) => !paths.has(file));
  if (missing.length) {
    throw new Error(`HoloLlama bundle is missing required file(s): ${missing.join(', ')}`);
  }
  return {
    ok: true,
    requiredFiles: required,
    registryHandle: bundle.registryEntry.handle,
    healthUrl: bundle.registryEntry.healthUrl,
  };
}

export function extractSovereignDeviceRegistry(bundle: LlamaServerBundle): Record<string, unknown> {
  const path = `sovereign-devices/${bundle.registryEntry.handle}.json`;
  const file = bundle.files.find((candidate) => candidate.path === path);
  if (!file) throw new Error(`HoloLlama bundle does not include ${path}`);
  return JSON.parse(file.content) as Record<string, unknown>;
}

export function summarizeHoloLlamaBundle(bundle: LlamaServerBundle): HoloLlamaBundleSummary {
  return {
    name: bundle.name,
    target: bundle.target,
    command: bundle.launch.command,
    healthUrl: bundle.healthProbe.url,
    registryHandle: bundle.registryEntry.handle,
    endpoint: bundle.registryEntry.endpoint,
    files: bundle.files.map((file) => file.path),
    capabilities: bundle.registryEntry.capabilities,
    warnings: bundle.warnings,
  };
}

export function doctorHoloLlamaProfiles(
  options: HoloLlamaDoctorOptions = {}
): HoloLlamaDoctorReport {
  const profileIds = options.profile
    ? [options.profile]
    : (Object.keys(HOLOLLAMA_PROFILE_DEFINITIONS) as HoloLlamaProfile[]);
  const profiles = profileIds.map((profile) => doctorHoloLlamaProfile(profile));
  return {
    schema: HOLOLLAMA_DOCTOR_SCHEMA,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    ok: profiles.every((result) => result.ok),
    profiles,
  };
}

export function buildHoloMeshReadOnlyBridge(
  options: HoloLlamaMeshReadOnlyBridgeOptions = {}
): HoloLlamaMeshReadOnlyBridgeReceipt {
  const profile = options.profile ?? 'jetson-orin';
  const definition = HOLOLLAMA_PROFILE_DEFINITIONS[profile];
  const bundle = compileHoloLlamaBundle({ profile });
  const summary = summarizeHoloLlamaBundle(bundle);
  const orchestratorUrl = trimTrailingSlash(
    options.orchestratorUrl ?? DEFAULT_HOLOMESH_ORCHESTRATOR_URL
  );
  const teamId = options.teamId ?? DEFAULT_HOLOMESH_TEAM_ID;
  const apiKeyEnv = options.apiKeyEnv ?? DEFAULT_HOLOMESH_API_KEY_ENV;
  const teamPath = `/api/holomesh/team/${encodeURIComponent(teamId)}`;
  const endpoints = [
    endpoint(
      'orchestrator-health',
      orchestratorUrl,
      '/health',
      'Read orchestrator service health.'
    ),
    endpoint('team-slots', orchestratorUrl, `${teamPath}/slots`, 'Read live team slot health.'),
    endpoint(
      'team-board',
      orchestratorUrl,
      `${teamPath}/board`,
      'Read open, claimed, and done board state.'
    ),
    endpoint('team-done', orchestratorUrl, `${teamPath}/done`, 'Read permanent done log.'),
    endpoint(
      'team-messages',
      orchestratorUrl,
      `${teamPath}/messages`,
      'Read room feed and handoffs.'
    ),
    endpoint(
      'team-knowledge',
      orchestratorUrl,
      `${teamPath}/knowledge`,
      'Read team knowledge entries.'
    ),
  ];
  const warnings = options.teamId
    ? []
    : ['teamId is a placeholder; pass --team-id for a live bridge receipt.'];

  return {
    schema: HOLOLLAMA_MESH_READONLY_BRIDGE_SCHEMA,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    ok: true,
    profile,
    consumer: definition.consumer,
    registryHandle: summary.registryHandle,
    node: definition.spec.node,
    mode: 'read-only',
    mesh: {
      orchestratorUrl,
      teamId,
      apiKeyEnv,
      authHeader: `Authorization: Bearer $${apiKeyEnv}`,
    },
    access: {
      allowedMethods: ['GET'],
      forbiddenMethods: ['POST', 'PATCH', 'PUT', 'DELETE'],
      writeScopes: [],
    },
    deviceRegistry: {
      handle: bundle.registryEntry.handle,
      endpoint: bundle.registryEntry.endpoint,
      healthUrl: bundle.registryEntry.healthUrl,
      capabilities: bundle.registryEntry.capabilities,
    },
    endpoints,
    lifecycleUse: [
      'observe HoloMesh room and board state before registering a node',
      'attach fleet receipts without granting package-level write authority',
      'keep package consumers pointed at the canonical HoloMesh control plane',
    ],
    warnings,
    blockers: [],
  };
}

export function verifyHoloLlamaServerContract(
  profile: HoloLlamaProfile = 'jetson-orin',
  options: HoloLlamaServerContractOptions = {}
): HoloLlamaServerContractReceipt {
  const definition = HOLOLLAMA_PROFILE_DEFINITIONS[profile];
  const spec = definition.spec;
  const bundle = compileHoloLlamaBundle({ profile });
  const registry = extractSovereignDeviceRegistry(bundle);
  const capabilities = Array.isArray(registry.capabilities) ? registry.capabilities : [];
  const localLlm = capabilities.find(
    (capability) => isRecord(capability) && capability.id === 'local-llm'
  );
  const baseEndpoint = bundle.registryEntry.endpoint.replace(/\/v1\/?$/i, '');
  const mmprojArg = argAfter(bundle.launch.args, '--mmproj');
  const imageMin = argAfter(bundle.launch.args, '--image-min-tokens');
  const imageMax = argAfter(bundle.launch.args, '--image-max-tokens');
  const checks: HoloLlamaPreflightCheck[] = [
    check(
      'registry-capabilities-array',
      true,
      Array.isArray(registry.capabilities),
      'sovereign-devices registry must expose capabilities[]'
    ),
    check(
      'registry-local-llm-capability',
      true,
      Boolean(localLlm),
      'registry capabilities[] must include id=local-llm'
    ),
    check(
      'registry-base-endpoint',
      true,
      isRecord(localLlm) &&
        localLlm.endpoint === baseEndpoint &&
        !String(localLlm.endpoint).replace(/\/+$/g, '').endsWith('/v1'),
      `expected base endpoint ${baseEndpoint}`
    ),
    check(
      'registry-llama-backend',
      true,
      isRecord(localLlm) &&
        localLlm.backend === 'llama.cpp' &&
        localLlm.serverKind === 'llama-server',
      'registry local-llm capability must declare backend=llama.cpp and serverKind=llama-server'
    ),
    check(
      'registry-vision-flag',
      true,
      isRecord(localLlm) && localLlm.vision === spec.vision,
      `registry vision must equal profile vision=${String(spec.vision)}`
    ),
  ];

  if (spec.vision) {
    checks.push(
      check(
        'vision-mmproj-flag',
        true,
        Boolean(spec.mmprojPath) && mmprojArg === spec.mmprojPath,
        `--mmproj must be ${spec.mmprojPath ?? 'set'}`
      ),
      check(
        'vision-image-token-flags',
        true,
        imageMin === String(spec.imageMinTokens) && imageMax === String(spec.imageMaxTokens),
        `image token flags must be ${String(spec.imageMinTokens)}..${String(spec.imageMaxTokens)}`
      )
    );
  } else {
    checks.push(
      check(
        'text-omits-mmproj-flag',
        true,
        mmprojArg === undefined,
        'text profile must not emit --mmproj'
      ),
      check(
        'text-omits-image-token-flags',
        true,
        imageMin === undefined && imageMax === undefined,
        'text profile must not emit llama.cpp image-token flags'
      )
    );
  }

  const blockers = checks
    .filter((item) => item.required && !item.ok)
    .map((item) => `${item.id}: ${item.detail}`);

  return {
    schema: HOLOLLAMA_SERVER_CONTRACT_SCHEMA,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    ok: blockers.length === 0,
    profile,
    consumer: definition.consumer,
    registryHandle: spec.registerAs,
    visionRequested: spec.vision,
    checks,
    warnings: [],
    blockers,
  };
}

export function preflightHoloLlamaVision(
  profile: HoloLlamaProfile = 'laptop-windows',
  options: HoloLlamaVisionPreflightOptions = {}
): HoloLlamaVisionPreflightReceipt {
  const definition = HOLOLLAMA_PROFILE_DEFINITIONS[profile];
  const spec = definition.spec;
  const bundle = compileHoloLlamaBundle({ profile });
  const args = bundle.launch.args;
  const checks: HoloLlamaPreflightCheck[] = [
    check(
      'mmproj-path',
      spec.vision,
      !spec.vision || Boolean(spec.mmprojPath),
      spec.mmprojPath || 'none'
    ),
    check(
      'launch-mmproj-flag',
      spec.vision,
      !spec.vision ||
        (args.includes('--mmproj') && Boolean(spec.mmprojPath && args.includes(spec.mmprojPath))),
      spec.vision ? '--mmproj must point at the multimodal projector' : 'text-only profile'
    ),
    check(
      'image-token-window',
      spec.vision,
      !spec.vision ||
        (isPositive(spec.imageMinTokens) &&
          isPositive(spec.imageMaxTokens) &&
          Number(spec.imageMinTokens) <= Number(spec.imageMaxTokens)),
      `${String(spec.imageMinTokens ?? 'unset')}..${String(spec.imageMaxTokens ?? 'unset')}`
    ),
    check(
      'launch-image-token-flags',
      spec.vision,
      !spec.vision || (args.includes('--image-min-tokens') && args.includes('--image-max-tokens')),
      spec.vision ? 'llama.cpp mtmd image token flags are present' : 'text-only profile'
    ),
    check(
      'registry-vision-capability',
      spec.vision,
      !spec.vision || bundle.registryEntry.capabilities.vision === true,
      `registry vision=${String(bundle.registryEntry.capabilities.vision)}`
    ),
  ];
  const filesystemChecks = options.checkFilesystem
    ? buildVisionFilesystemChecks(spec, options.exists ?? existsSync)
    : [];
  const blockers = [
    ...checks
      .filter((item) => item.required && !item.ok)
      .map((item) => `${item.id}: ${item.detail}`),
    ...filesystemChecks
      .filter((item) => item.required && !item.exists)
      .map((item) => `${item.id}: missing ${item.path}`),
  ];
  const warnings = [
    ...(spec.vision ? [] : ['profile is text-only; llama.cpp vision preflight is not required.']),
    ...(options.checkFilesystem
      ? []
      : ['filesystem checks skipped; pass --check-filesystem for node-local proof.']),
  ];

  return {
    schema: HOLOLLAMA_VISION_PREFLIGHT_SCHEMA,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    ok: blockers.length === 0,
    profile,
    consumer: definition.consumer,
    registryHandle: spec.registerAs,
    visionRequested: spec.vision,
    launchCommand: bundle.launch.command,
    checks,
    filesystemChecks,
    warnings,
    blockers,
  };
}

export function assessHoloLlamaRuntimeReadiness(
  profile: HoloLlamaProfile = 'laptop-windows',
  options: HoloLlamaRuntimeReadinessOptions = {}
): HoloLlamaRuntimeReadinessReceipt {
  const definition = HOLOLLAMA_PROFILE_DEFINITIONS[profile];
  const spec = definition.spec;
  const bundle = compileHoloLlamaBundle({ profile });
  const observation = options.observation;
  const runtimeRequired = Boolean(spec.vision && options.requireRuntimeReadiness);
  const checks: HoloLlamaPreflightCheck[] = [];
  const warnings: string[] = [];

  if (!spec.vision) {
    warnings.push('profile is text-only; llama.cpp vision runtime readiness is not required.');
  }

  if (!observation) {
    const detail = runtimeRequired
      ? 'missing launched-node observation before benchmark/routing'
      : 'runtime observation not supplied; static lifecycle report only';
    checks.push(check('runtime-observation', runtimeRequired, !runtimeRequired, detail));
  } else {
    checks.push(
      check(
        'port-ownership',
        runtimeRequired,
        observation.portOwner.ok,
        observation.portOwner.detail
      )
    );
    checks.push(
      check(
        'stale-llama-server-cleanup',
        runtimeRequired,
        observation.staleServerCleanup.ok,
        observation.staleServerCleanup.detail
      )
    );
    checks.push(
      check(
        'openai-models-multimodal-capability',
        runtimeRequired,
        modelsDeclareVision(observation.openaiModels, spec.model),
        '/v1/models must expose vision or multimodal capability for the served model'
      )
    );
    checks.push(
      check(
        'props-modalities-vision',
        runtimeRequired,
        propsDeclareVision(observation.props),
        '/props modalities.vision must be true'
      )
    );
  }

  if (!runtimeRequired) {
    warnings.push(
      'pass requireRuntimeReadiness with launched-node evidence before benchmarks or routing.'
    );
  }

  const blockers = checks
    .filter((item) => item.required && !item.ok)
    .map((item) => `${item.id}: ${item.detail}`);

  return {
    schema: HOLOLLAMA_RUNTIME_READINESS_SCHEMA,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    ok: blockers.length === 0,
    profile,
    consumer: definition.consumer,
    registryHandle: spec.registerAs,
    endpoint: bundle.registryEntry.endpoint,
    visionRequested: spec.vision,
    runtimeRequired,
    checks,
    warnings,
    blockers,
  };
}

export function parseHoloLlamaSystemdShow(
  output: string,
  unit = DEFAULT_JETSON_HOLOLLAMA_SYSTEMD_UNIT
): HoloLlamaSystemdEvidence {
  const fields: Record<string, string> = {};
  for (const line of output.split(/\r?\n/u)) {
    const [key, ...rest] = line.split('=');
    if (key) fields[key] = rest.join('=');
  }
  const loaded = fields.LoadState === 'loaded';
  const active = fields.ActiveState === 'active';
  const running = fields.SubState === 'running';
  return {
    unit,
    raw: output,
    LoadState: fields.LoadState,
    ActiveState: fields.ActiveState,
    SubState: fields.SubState,
    FragmentPath: fields.FragmentPath,
    ExecMainPID: fields.ExecMainPID,
    loaded,
    active,
    running,
    ok: loaded && active,
  };
}

export function firstModelFromHoloLlamaModelsPayload(
  payload: unknown
): HoloLlamaLiveModelSummary | null {
  const body = isRecord(payload) && 'body' in payload ? payload.body : payload;
  const first = isRecord(body)
    ? Array.isArray(body.data)
      ? body.data[0]
      : Array.isArray(body.models)
        ? body.models[0]
        : null
    : null;
  if (!isRecord(first)) return null;
  const meta = isRecord(first.meta) ? first.meta : {};
  const details = isRecord(first.details) ? first.details : {};
  return {
    id:
      stringField(first, 'id') ?? stringField(first, 'model') ?? stringField(first, 'name') ?? null,
    name:
      stringField(first, 'name') ?? stringField(first, 'id') ?? stringField(first, 'model') ?? null,
    ownedBy: stringField(first, 'owned_by') ?? null,
    nVocab: numberField(meta, 'n_vocab') ?? numberField(details, 'n_vocab') ?? null,
    nCtx: numberField(meta, 'n_ctx') ?? null,
    nParams: numberField(meta, 'n_params') ?? null,
  };
}

export function assessHoloLlamaFootprint(
  profile: HoloLlamaProfile,
  input: HoloLlamaFootprintAssessmentInput = {}
): HoloLlamaFootprintEvidence {
  const definition = HOLOLLAMA_PROFILE_DEFINITIONS[profile];
  const spec = definition.spec;
  const command = input.command ?? null;
  const parsed = parseHoloLlamaLaunchCommand(command);
  const expectedLoraPaths = expectedHoloLlamaLoraPaths(spec);
  const observed: HoloLlamaFootprintEvidence['observed'] = {
    executable: parsed.executable,
    modelPath: parsed.modelPath,
    loraPaths: parsed.loraPaths,
    gpuLayers: parsed.gpuLayers,
    contextLength: parsed.contextLength,
    cacheRamMiB: parsed.cacheRamMiB,
    promptCacheLimitMiB: input.promptCacheLimitMiB ?? null,
    noUsableGpuWarning: input.noUsableGpuWarning === true,
    processRssMiB: input.processRssMiB ?? null,
    processHighWaterMiB: input.processHighWaterMiB ?? null,
    processSwapMiB: input.processSwapMiB ?? null,
    ramUsedMiB: input.ramUsedMiB ?? null,
    ramTotalMiB: input.ramTotalMiB ?? null,
    swapUsedMiB: input.swapUsedMiB ?? null,
    swapTotalMiB: input.swapTotalMiB ?? null,
    modelFilesMiB: input.modelFilesMiB ?? null,
  };
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (!command) {
    blockers.push('launch command unavailable from systemd/procfs');
  }
  if (
    observed.executable &&
    normalizeRuntimePath(observed.executable) !== normalizeRuntimePath(spec.executable)
  ) {
    blockers.push(`executable drift: observed ${observed.executable}, expected ${spec.executable}`);
  }
  if (observed.executable?.includes('/ollama/')) {
    blockers.push(
      'live unit uses Ollama-installed llama-server instead of the HoloLlama native binary'
    );
  }
  if (
    observed.modelPath &&
    normalizeRuntimePath(observed.modelPath) !== normalizeRuntimePath(spec.modelPath)
  ) {
    blockers.push(`model path drift: observed ${observed.modelPath}, expected ${spec.modelPath}`);
  }
  const observedLoraPaths = observed.loraPaths ?? [];
  for (const expectedLora of expectedLoraPaths) {
    if (
      !observedLoraPaths.some(
        (candidate) => normalizeRuntimePath(candidate) === normalizeRuntimePath(expectedLora)
      )
    ) {
      blockers.push(`missing LoRA adapter: expected ${expectedLora}`);
    }
  }
  for (const observedLora of observedLoraPaths) {
    if (
      !expectedLoraPaths.some(
        (candidate) => normalizeRuntimePath(candidate) === normalizeRuntimePath(observedLora)
      )
    ) {
      blockers.push(`unexpected LoRA adapter: observed ${observedLora}`);
    }
  }
  if (observed.gpuLayers !== null && observed.gpuLayers !== undefined) {
    if (observed.gpuLayers > spec.gpuLayers) {
      blockers.push(
        `gpu layer drift: observed ${observed.gpuLayers}, expected <= ${spec.gpuLayers}`
      );
    } else if (observed.gpuLayers < spec.gpuLayers) {
      warnings.push(
        `gpu layers lower than profile: observed ${observed.gpuLayers}, expected ${spec.gpuLayers}`
      );
    }
  }
  if (observed.contextLength !== null && observed.contextLength !== undefined) {
    if (observed.contextLength > spec.contextLength) {
      blockers.push(
        `context drift: observed ${observed.contextLength}, expected <= ${spec.contextLength}`
      );
    } else if (observed.contextLength < spec.contextLength) {
      warnings.push(
        `context lower than profile: observed ${observed.contextLength}, expected ${spec.contextLength}`
      );
    }
  }
  if (observed.noUsableGpuWarning && spec.gpuLayers > 0) {
    blockers.push('llama.cpp reported no usable GPU; requested gpu layers are ignored');
  }
  if (
    observed.promptCacheLimitMiB !== null &&
    observed.promptCacheLimitMiB !== undefined &&
    observed.promptCacheLimitMiB > 0
  ) {
    if (observed.ramTotalMiB && observed.promptCacheLimitMiB >= observed.ramTotalMiB * 0.75) {
      blockers.push(
        `prompt cache limit ${observed.promptCacheLimitMiB} MiB is unsafe for ${observed.ramTotalMiB} MiB unified RAM`
      );
    } else {
      warnings.push(`prompt cache enabled with ${observed.promptCacheLimitMiB} MiB limit`);
    }
  }
  if (
    observed.processRssMiB !== null &&
    observed.processRssMiB !== undefined &&
    observed.ramTotalMiB
  ) {
    const pct = observed.processRssMiB / observed.ramTotalMiB;
    if (pct >= 0.7) {
      blockers.push(`process RSS uses ${(pct * 100).toFixed(1)}% of unified RAM`);
    } else if (pct >= 0.5) {
      warnings.push(`process RSS uses ${(pct * 100).toFixed(1)}% of unified RAM`);
    }
  }
  if (observed.swapUsedMiB && observed.swapUsedMiB > 0) {
    warnings.push(`swap is already in use (${observed.swapUsedMiB} MiB)`);
  }

  return {
    ok: blockers.length === 0,
    source: input.source ?? 'provided',
    unit: input.unit,
    pid: input.pid ?? null,
    command,
    expected: {
      executable: spec.executable,
      modelPath: spec.modelPath,
      loraPaths: expectedLoraPaths,
      gpuLayers: spec.gpuLayers,
      contextLength: spec.contextLength,
    },
    observed,
    warnings,
    blockers,
  };
}

export async function probeHoloLlamaLiveLifecycle(
  options: HoloLlamaLiveLifecycleOptions = {}
): Promise<HoloLlamaLiveLifecycleReceipt> {
  const profile = options.profile ?? 'jetson-orin';
  const definition = HOLOLLAMA_PROFILE_DEFINITIONS[profile];
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const endpoint = normalizeLiveEndpoint(options.endpoint ?? defaultHoloLlamaLiveEndpoint(profile));
  const timeoutMs = positiveOrDefault(options.timeoutMs, 20000);
  const maxTokens = positiveOrDefault(options.maxTokens, 12);
  const prompt = options.prompt ?? 'Reply with a tiny readiness token.';
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as HoloLlamaFetch | undefined);
  const failures: string[] = [];
  const warnings: string[] = [];
  const noLive = options.noLive === true;

  if (!fetchImpl && !noLive) {
    throw new Error('fetch is unavailable for live HoloLlama probes');
  }

  let systemd: HoloLlamaSystemdEvidence;
  let footprint: HoloLlamaFootprintEvidence;
  let health: HoloLlamaHttpProbe;
  let models: HoloLlamaHttpProbe;
  let model: HoloLlamaLiveModelSummary | null = null;
  let completion: HoloLlamaCompletionProbe;

  const systemdUnit = options.systemdUnit ?? defaultHoloLlamaSystemdUnit(profile);
  const sshHost = options.sshHost ?? defaultHoloLlamaSshHost(profile);
  const sshKey = options.sshKey ?? resolve(homedir(), '.ssh', 'jetson_ed25519');

  if (noLive) {
    warnings.push('live probes skipped by caller');
    systemd = { ok: null, skipped: true, unit: systemdUnit ?? 'none' };
    footprint = skippedHoloLlamaFootprint(profile, systemdUnit, 'live probes skipped by caller');
    health = { ok: null, skipped: true, url: `${endpoint}/health` };
    models = { ok: null, skipped: true, url: `${endpoint}/v1/models` };
    completion = { ok: null, skipped: true, url: `${endpoint}/v1/chat/completions` };
  } else {
    if (options.systemdProbe) {
      systemd = options.systemdProbe;
    } else if (options.skipSystemd || !systemdUnit || !sshHost) {
      systemd = { ok: null, skipped: true, unit: systemdUnit ?? 'none' };
      warnings.push('systemd probe skipped; pass sshHost/systemdUnit for service ownership proof.');
    } else {
      try {
        systemd = runHoloLlamaSystemdProbe({ sshHost, sshKey, systemdUnit, timeoutMs });
      } catch (error) {
        systemd = {
          ok: false,
          unit: systemdUnit,
          error: systemdProbeError(error),
        };
      }
    }
    if (options.requireSystemd && !systemd.ok) failures.push('systemd unit is not active');

    if (options.footprintProbe) {
      footprint = {
        ...options.footprintProbe,
        source:
          options.footprintProbe.source === 'none' ? 'provided' : options.footprintProbe.source,
      };
    } else if (
      options.skipFootprint ||
      options.systemdProbe ||
      options.skipSystemd ||
      !systemd.ok ||
      !sshHost
    ) {
      footprint = skippedHoloLlamaFootprint(
        profile,
        systemdUnit,
        options.skipFootprint
          ? 'footprint probe skipped by caller'
          : 'footprint probe skipped without live SSH-owned systemd proof'
      );
    } else {
      try {
        footprint = runHoloLlamaFootprintProbe({
          profile,
          sshHost,
          sshKey,
          systemdUnit: systemdUnit ?? defaultHoloLlamaSystemdUnit(profile) ?? 'holollama.service',
          timeoutMs,
        });
      } catch (error) {
        footprint = {
          ...skippedHoloLlamaFootprint(profile, systemdUnit, systemdProbeError(error)),
          ok: false,
          source: 'ssh-procfs-journal',
        };
      }
    }
    if (!footprint.skipped) {
      for (const warning of footprint.warnings) warnings.push(`footprint: ${warning}`);
      for (const blocker of footprint.blockers) failures.push(`footprint: ${blocker}`);
    }

    health = await fetchHoloLlamaJson(fetchImpl as HoloLlamaFetch, `${endpoint}/health`, {
      timeoutMs,
    });
    if (!health.ok) failures.push('/health is not reachable');

    models = await fetchHoloLlamaJson(fetchImpl as HoloLlamaFetch, `${endpoint}/v1/models`, {
      timeoutMs,
    });
    model = firstModelFromHoloLlamaModelsPayload(models);
    if (!models.ok) failures.push('/v1/models is not reachable');
    if (!model) failures.push('/v1/models returned no model');
    if (model?.ownedBy && model.ownedBy !== 'llamacpp') {
      failures.push(`model owner is ${model.ownedBy}, expected llamacpp`);
    }

    completion = await runHoloLlamaCompletionProbe(fetchImpl as HoloLlamaFetch, endpoint, model, {
      prompt,
      maxTokens,
      timeoutMs,
    });
    if (!completion.completionOk) failures.push('tiny completion failed or returned empty content');
    if (completion.mode === 'llama-completion-fallback') {
      warnings.push('OpenAI chat completion fell back to /completion');
    }
  }

  const runtimeState: HoloLlamaLiveLifecycleReceipt['runtimeState'] = failures.length
    ? 'blocked'
    : warnings.length
      ? 'attention_required'
      : 'ready';
  const reportWithoutHash: Omit<HoloLlamaLiveLifecycleReceipt, 'receiptHash'> = {
    schema: HOLOLLAMA_LIVE_LIFECYCLE_SCHEMA,
    generatedAt,
    ok: failures.length === 0,
    runtimeState,
    profile,
    consumer: definition.consumer,
    registryHandle: definition.spec.registerAs,
    target: {
      endpoint,
      unit: systemdUnit,
      sshHost,
      modelsPath: options.modelsPath ?? defaultHoloLlamaModelsPath(profile),
      package: '@holoscript/holollama' as const,
      providerCompatibilityId: definition.spec.registerAs,
    },
    checks: {
      systemd,
      footprint,
      health,
      models,
      model,
      completion,
    },
    failures,
    warnings,
    safety: {
      destructiveActionsTaken: false as const,
      paidComputeUsed: false as const,
      secretsIncluded: false as const,
    },
  };

  return {
    ...reportWithoutHash,
    receiptHash: sha256Json({ ...reportWithoutHash, receiptHash: null }),
  };
}

export function buildHoloLlamaFleetLifecycleReport(
  options: HoloLlamaFleetLifecycleOptions = {}
): HoloLlamaFleetLifecycleReport {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const profileIds = options.profile
    ? [options.profile]
    : (Object.keys(HOLOLLAMA_PROFILE_DEFINITIONS) as HoloLlamaProfile[]);
  const profiles = profileIds.map((profile) => {
    const doctor = doctorHoloLlamaProfiles({ profile, generatedAt }).profiles[0];
    const serverContract = verifyHoloLlamaServerContract(profile, { generatedAt });
    const visionPreflight = preflightHoloLlamaVision(profile, {
      generatedAt,
      checkFilesystem: options.checkFilesystem,
      exists: options.exists,
    });
    const runtimeReadiness = assessHoloLlamaRuntimeReadiness(profile, {
      generatedAt,
      requireRuntimeReadiness: options.requireRuntimeReadiness,
      observation: options.runtimeObservations?.[profile],
    });
    const liveLifecycle = options.liveLifecycleReceipts?.[profile];
    const meshReadOnlyBridge = buildHoloMeshReadOnlyBridge({
      profile,
      teamId: options.teamId,
      orchestratorUrl: options.orchestratorUrl,
      apiKeyEnv: options.apiKeyEnv,
      generatedAt,
    });
    const stages: HoloLlamaFleetLifecycleStage[] = [
      {
        id: 'plan',
        ok: doctor.ok,
        receiptSchema: HOLOLLAMA_DOCTOR_SCHEMA,
        summary: `${doctor.files.length} serving artifact(s) compile for ${doctor.registryHandle}.`,
      },
      {
        id: 'server-contract',
        ok: serverContract.ok,
        receiptSchema: HOLOLLAMA_SERVER_CONTRACT_SCHEMA,
        summary: serverContract.ok
          ? 'text/vision launch flags and sovereign-devices registry contract pass.'
          : `${serverContract.blockers.length} server contract blocker(s).`,
      },
      {
        id: 'vision-preflight',
        ok: visionPreflight.ok,
        receiptSchema: HOLOLLAMA_VISION_PREFLIGHT_SCHEMA,
        summary: visionPreflight.visionRequested
          ? 'llama.cpp vision flags and registry capability are coherent.'
          : 'text-only profile does not require multimodal projector checks.',
      },
      {
        id: 'runtime-readiness',
        ok: runtimeReadiness.ok,
        receiptSchema: HOLOLLAMA_RUNTIME_READINESS_SCHEMA,
        summary: runtimeReadiness.runtimeRequired
          ? runtimeReadiness.ok
            ? 'launched-node port owner, stale cleanup, /v1/models, and /props checks passed.'
            : `${runtimeReadiness.blockers.length} launched-node runtime blocker(s).`
          : 'runtime readiness not required for this static lifecycle report.',
      },
      {
        id: 'mesh-readonly-bridge',
        ok: meshReadOnlyBridge.ok,
        receiptSchema: HOLOLLAMA_MESH_READONLY_BRIDGE_SCHEMA,
        summary: `${meshReadOnlyBridge.endpoints.length} read-only HoloMesh endpoint(s) resolved.`,
      },
      {
        id: 'serve-health-probe',
        ok: doctor.files.includes('health-probe.ps1') && Boolean(doctor.healthUrl),
        receiptSchema: HOLOLLAMA_DOCTOR_SCHEMA,
        summary: doctor.healthUrl || 'health URL missing',
      },
    ];
    if (liveLifecycle || options.requireLiveLifecycle) {
      stages.push({
        id: 'live-lifecycle',
        ok: Boolean(liveLifecycle?.ok),
        receiptSchema: HOLOLLAMA_LIVE_LIFECYCLE_SCHEMA,
        summary: liveLifecycle
          ? liveLifecycle.ok
            ? `${liveLifecycle.target.endpoint} served ${liveLifecycle.checks.model?.id ?? 'a model'} with a non-empty completion.`
            : `${liveLifecycle.failures.length} live lifecycle blocker(s).`
          : 'live HoloLlama lifecycle receipt missing.',
      });
    }

    return {
      profile,
      consumer: doctor.consumer,
      registryHandle: doctor.registryHandle,
      ok: stages.every((stage) => stage.ok),
      stages,
      doctor,
      serverContract,
      visionPreflight,
      runtimeReadiness,
      meshReadOnlyBridge,
      ...(liveLifecycle ? { liveLifecycle } : {}),
    };
  });

  return {
    schema: HOLOLLAMA_FLEET_LIFECYCLE_SCHEMA,
    generatedAt,
    ok: profiles.every((profile) => profile.ok),
    profiles,
  };
}

export async function verifyHoloLlamaHarnessSafety(
  rootDir: string,
  options: HoloLlamaHarnessSafetyOptions = {}
): Promise<HoloLlamaHarnessSafetyReport> {
  const root = resolve(rootDir);
  const filesScanned = await collectHoloLlamaHarnessFiles(root);
  const issues: HoloLlamaHarnessSafetyIssue[] = [];

  for (const file of filesScanned) {
    const absolute = join(root, file);
    const content = await readFile(absolute, 'utf8');
    issues.push(...scanHoloLlamaHarnessPrivateAnchors(file, content));
    issues.push(...scanHoloLlamaHarnessSecrets(file, content));
  }

  return {
    schema: HOLOLLAMA_HARNESS_SAFETY_SCHEMA,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    ok: issues.length === 0,
    root: options.rootLabel ?? portableHarnessRootLabel(root),
    filesScanned,
    issues,
  };
}

export async function installHoloLlamaPublicHarness(
  options: HoloLlamaHarnessInstallOptions = {}
): Promise<HoloLlamaHarnessInstallReceipt> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const profile = options.profile ?? 'jetson-orin';
  const targetDir = resolve(options.targetDir ?? join(process.cwd(), '.ai-ecosystem'));
  const templateDir = HOLOLLAMA_PUBLIC_HARNESS_TEMPLATE_DIR;
  const templateSafety = await verifyHoloLlamaHarnessSafety(templateDir, {
    generatedAt,
    rootLabel: 'package:templates/ai-ecosystem-basic',
  });
  const templateFiles = await collectHoloLlamaHarnessFiles(templateDir);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const receiptFiles: string[] = [];

  if (!templateSafety.ok) {
    blockers.push(`template safety failed with ${templateSafety.issues.length} issue(s)`);
  }

  const conflicts = await findHoloLlamaHarnessConflicts(templateDir, targetDir, templateFiles);
  if (conflicts.length && !options.force) {
    blockers.push(
      `target has ${conflicts.length} conflicting file(s); rerun with --force to overwrite: ${conflicts.join(', ')}`
    );
  } else if (conflicts.length) {
    warnings.push(
      `overwrote ${conflicts.length} existing harness file(s): ${conflicts.join(', ')}`
    );
  }

  let installedSafety = templateSafety;
  let writtenFiles: string[] = [];
  let doctor = doctorHoloLlamaProfiles({ profile, generatedAt });
  let lifecycle = buildHoloLlamaFleetLifecycleReport({
    profile,
    teamId: options.teamId,
    orchestratorUrl: options.orchestratorUrl,
    apiKeyEnv: options.apiKeyEnv,
    generatedAt,
  });

  if (blockers.length === 0) {
    writtenFiles = await copyHoloLlamaHarnessTemplate(templateDir, targetDir, templateFiles);
    installedSafety = await verifyHoloLlamaHarnessSafety(targetDir, {
      generatedAt,
      rootLabel: '.ai-ecosystem',
    });
    if (!installedSafety.ok) {
      blockers.push(
        `installed harness safety failed with ${installedSafety.issues.length} issue(s)`
      );
    }
  }

  if (!doctor.ok)
    blockers.push(`doctor receipt failed with ${doctor.profiles.length} profile result(s)`);
  if (!lifecycle.ok) blockers.push('lifecycle receipt failed');
  if (blockers.length === 0 && options.writeReceipts !== false) {
    receiptFiles.push(
      'receipts/holollama/doctor.json',
      'receipts/holollama/lifecycle.json',
      'receipts/holollama/install.json'
    );
  }

  const withoutHash: Omit<HoloLlamaHarnessInstallReceipt, 'receiptHash'> = {
    schema: HOLOLLAMA_HARNESS_INSTALL_SCHEMA,
    generatedAt,
    ok: blockers.length === 0,
    targetDir: '.ai-ecosystem',
    template: 'package:templates/ai-ecosystem-basic',
    files: writtenFiles,
    receiptFiles,
    safety: installedSafety,
    doctor,
    lifecycle,
    warnings,
    blockers,
  };
  const receipt: HoloLlamaHarnessInstallReceipt = {
    ...withoutHash,
    receiptHash: sha256Json({ ...withoutHash, receiptHash: null }),
  };

  if (receipt.ok && options.writeReceipts !== false) {
    const receiptDir = join(targetDir, 'receipts', 'holollama');
    await mkdir(receiptDir, { recursive: true });
    await writeJsonReceipt(join(receiptDir, 'doctor.json'), doctor);
    await writeJsonReceipt(join(receiptDir, 'lifecycle.json'), lifecycle);
    await writeJsonReceipt(join(receiptDir, 'install.json'), receipt);
  }

  return receipt;
}

export async function writeHoloLlamaBundleFiles(
  bundle: LlamaServerBundle,
  outDir: string
): Promise<string[]> {
  const written: string[] = [];
  for (const file of bundle.files) {
    const target = join(outDir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, file.executable ? { mode: 0o755 } : undefined);
    written.push(target);
  }
  return written;
}

function doctorHoloLlamaProfile(profile: HoloLlamaProfile): HoloLlamaProfileDoctorResult {
  const definition = HOLOLLAMA_PROFILE_DEFINITIONS[profile];
  const blockers: string[] = [];
  const warnings: string[] = [];
  try {
    const bundle = compileHoloLlamaBundle({ profile });
    const check = assertHoloLlamaBundleConsumable(bundle);
    const summary = summarizeHoloLlamaBundle(bundle);
    const registry = extractSovereignDeviceRegistry(bundle);
    const registryHandle = readRegistryString(registry, 'handle') || check.registryHandle;
    if (registryHandle !== definition.spec.registerAs) {
      blockers.push(
        `registry handle ${registryHandle} does not match profile registerAs ${definition.spec.registerAs}`
      );
    }
    if (check.healthUrl !== summary.healthUrl) {
      blockers.push(
        `bundle health ${summary.healthUrl} does not match registry health ${check.healthUrl}`
      );
    }
    if (summary.warnings.length) warnings.push(...summary.warnings);
    return {
      profile,
      consumer: definition.consumer,
      ok: blockers.length === 0,
      registryHandle,
      healthUrl: summary.healthUrl,
      endpoint: summary.endpoint,
      files: summary.files,
      warnings,
      blockers,
    };
  } catch (error) {
    blockers.push(error instanceof Error ? error.message : String(error));
    return {
      profile,
      consumer: definition.consumer,
      ok: false,
      registryHandle: definition.spec.registerAs,
      healthUrl: '',
      endpoint: '',
      files: [],
      warnings,
      blockers,
    };
  }
}

function normalizeCompileInput(
  input: string | CompileHoloLlamaInput
): Required<CompileHoloLlamaInput> {
  if (typeof input === 'string') {
    return {
      code: input,
      profile: 'jetson-orin',
      overrides: {},
      compilerOptions: {},
    };
  }
  const profile = input.profile ?? 'jetson-orin';
  const code = input.code ?? buildLlamaServeComposition(profile, input.overrides);
  return {
    code,
    profile,
    overrides: input.overrides ?? {},
    compilerOptions: input.compilerOptions ?? {},
  };
}

function defined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as Partial<T>;
}

function readRegistryString(registry: Record<string, unknown>, key: string): string {
  const value = registry[key];
  return typeof value === 'string' ? value : '';
}

function endpoint(
  id: string,
  baseUrl: string,
  path: string,
  purpose: string
): HoloLlamaReadOnlyEndpoint {
  return {
    id,
    method: 'GET',
    path,
    url: `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`,
    purpose,
  };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/g, '');
}

function check(
  id: string,
  required: boolean,
  ok: boolean,
  detail: string
): HoloLlamaPreflightCheck {
  return { id, required, ok, detail };
}

function isPositive(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function buildVisionFilesystemChecks(
  spec: HoloLlamaServeSpec,
  exists: (path: string) => boolean
): HoloLlamaFilesystemCheck[] {
  const checks: HoloLlamaFilesystemCheck[] = [
    {
      id: 'llama-server-executable',
      path: spec.executable,
      required: true,
      exists: exists(spec.executable),
    },
    { id: 'model-gguf', path: spec.modelPath, required: true, exists: exists(spec.modelPath) },
  ];
  if (spec.vision && spec.mmprojPath) {
    checks.push({
      id: 'mmproj-gguf',
      path: spec.mmprojPath,
      required: true,
      exists: exists(spec.mmprojPath),
    });
  }
  return checks;
}

function argAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  return args[index + 1];
}

function modelsDeclareVision(value: unknown, expectedModel: string): boolean {
  const entries = modelEntries(value);
  if (entries.length === 0) return false;
  const matching = entries.filter((entry) => modelEntryMatches(entry, expectedModel));
  const candidates = matching.length > 0 ? matching : entries;
  return candidates.some((entry) => valueDeclaresVision(entry));
}

function propsDeclareVision(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const modalities = value.modalities;
  return isRecord(modalities) && modalities.vision === true;
}

function modelEntries(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.models)) return value.models;
  return [value];
}

function modelEntryMatches(entry: unknown, expectedModel: string): boolean {
  if (!isRecord(entry)) return false;
  const id = stringField(entry, 'id') ?? stringField(entry, 'model') ?? stringField(entry, 'name');
  if (!id) return false;
  return normalizeModelId(id) === normalizeModelId(expectedModel);
}

function valueDeclaresVision(value: unknown, depth = 0): boolean {
  if (depth > 4) return false;
  if (typeof value === 'string') return /vision|image|multimodal/i.test(value);
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.some((item) => valueDeclaresVision(item, depth + 1));
  if (!isRecord(value)) return false;

  for (const key of ['vision', 'multimodal', 'image']) {
    if (value[key] === true) return true;
  }
  for (const key of ['modalities', 'capabilities', 'input_modalities', 'inputModalities']) {
    const nested = value[key];
    if (valueDeclaresVision(nested, depth + 1)) return true;
  }
  return false;
}

function normalizeModelId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function parseHoloLlamaLaunchCommand(command: string | null): {
  executable?: string | null;
  modelPath?: string | null;
  loraPaths: string[];
  gpuLayers?: number | null;
  contextLength?: number | null;
  cacheRamMiB?: number | null;
} {
  const tokens = commandLineTokens(command ?? '');
  return {
    executable: tokens[0] ?? null,
    modelPath: tokenValue(tokens, ['-m', '--model']) ?? null,
    loraPaths: [
      ...tokenValues(tokens, ['--lora']),
      ...tokenValues(tokens, ['--lora-scaled']).map(loraPathFromScaledToken),
    ],
    gpuLayers: tokenNumber(tokens, ['-ngl', '--gpu-layers', '--n-gpu-layers']),
    contextLength: tokenNumber(tokens, ['-c', '--ctx-size', '--ctx', '--context-size']),
    cacheRamMiB: tokenNumber(tokens, ['--cache-ram']),
  };
}

function expectedHoloLlamaLoraPaths(spec: HoloLlamaServeSpec): string[] {
  return (spec.loras ?? []).map((lora) => (typeof lora === 'string' ? lora : lora.path));
}

function loraPathFromScaledToken(value: string): string {
  const idx = value.lastIndexOf(':');
  if (idx <= 0) return value;
  const scale = Number(value.slice(idx + 1));
  return Number.isFinite(scale) ? value.slice(0, idx) : value;
}

function commandLineTokens(command: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(command)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
  }
  return tokens.filter(Boolean);
}

function tokenValue(tokens: string[], names: string[]): string | undefined {
  return tokenValues(tokens, names)[0];
}

function tokenValues(tokens: string[], names: string[]): string[] {
  const values: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    for (const name of names) {
      if (token === name && tokens[i + 1]) values.push(tokens[i + 1]);
      if (token.startsWith(`${name}=`)) values.push(token.slice(name.length + 1));
    }
  }
  return values;
}

function tokenNumber(tokens: string[], names: string[]): number | null {
  const value = tokenValue(tokens, names);
  return optionalNumber(value);
}

function normalizeRuntimePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+/g, '/').toLowerCase();
}

function firstField(fields: Map<string, string[]>, key: string): string | undefined {
  return fields.get(key)?.[0];
}

function optionalNumber(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function kibToMib(value: string | undefined | null): number | null {
  const parsed = optionalNumber(value);
  return parsed === null ? null : Math.round(parsed / 1024);
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function defaultHoloLlamaLiveEndpoint(profile: HoloLlamaProfile): string {
  if (profile === 'jetson-orin') return DEFAULT_JETSON_HOLOLLAMA_LIVE_ENDPOINT;
  const spec = HOLOLLAMA_PROFILE_DEFINITIONS[profile].spec;
  const host = spec.host === '0.0.0.0' ? '127.0.0.1' : spec.host;
  return `http://${host}:${spec.port}`;
}

function defaultHoloLlamaSshHost(profile: HoloLlamaProfile): string | undefined {
  return profile === 'jetson-orin' ? DEFAULT_JETSON_HOLOLLAMA_SSH_HOST : undefined;
}

function defaultHoloLlamaSystemdUnit(profile: HoloLlamaProfile): string | undefined {
  if (profile === 'jetson-orin') return DEFAULT_JETSON_HOLOLLAMA_SYSTEMD_UNIT;
  if (profile === 'vast-linux-gpu') return 'holollama.service';
  return undefined;
}

function defaultHoloLlamaModelsPath(profile: HoloLlamaProfile): string {
  const spec = HOLOLLAMA_PROFILE_DEFINITIONS[profile].spec;
  if (profile === 'jetson-orin') return '/mnt/nvme/holo/models';
  return dirname(spec.modelPath);
}

function normalizeLiveEndpoint(value: string): string {
  return value.replace(/\/+$/g, '');
}

function positiveOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function skippedHoloLlamaFootprint(
  profile: HoloLlamaProfile,
  unit: string | undefined,
  reason: string
): HoloLlamaFootprintEvidence {
  const spec = HOLOLLAMA_PROFILE_DEFINITIONS[profile].spec;
  return {
    ok: null,
    skipped: true,
    source: 'none',
    unit,
    pid: null,
    command: null,
    expected: {
      executable: spec.executable,
      modelPath: spec.modelPath,
      loraPaths: expectedHoloLlamaLoraPaths(spec),
      gpuLayers: spec.gpuLayers,
      contextLength: spec.contextLength,
    },
    observed: {},
    warnings: [reason],
    blockers: [],
  };
}

function runHoloLlamaSystemdProbe(options: {
  sshHost: string;
  sshKey: string;
  systemdUnit: string;
  timeoutMs: number;
}): HoloLlamaSystemdEvidence {
  const output = execFileSync(
    'ssh',
    [
      '-i',
      options.sshKey,
      '-o',
      'ConnectTimeout=15',
      '-o',
      'StrictHostKeyChecking=accept-new',
      options.sshHost,
      'systemctl',
      'show',
      options.systemdUnit,
      '-p',
      'LoadState',
      '-p',
      'ActiveState',
      '-p',
      'SubState',
      '-p',
      'FragmentPath',
      '-p',
      'ExecMainPID',
    ],
    {
      encoding: 'utf8',
      timeout: options.timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024,
    }
  );
  return parseHoloLlamaSystemdShow(output, options.systemdUnit);
}

function runHoloLlamaFootprintProbe(options: {
  profile: HoloLlamaProfile;
  sshHost: string;
  sshKey: string;
  systemdUnit: string;
  timeoutMs: number;
}): HoloLlamaFootprintEvidence {
  const output = execFileSync(
    'ssh',
    [
      '-i',
      options.sshKey,
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=15',
      '-o',
      'StrictHostKeyChecking=accept-new',
      options.sshHost,
      'bash',
      '-lc',
      buildFootprintProbeScript(options.systemdUnit),
    ],
    {
      encoding: 'utf8',
      timeout: options.timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024,
    }
  );
  return assessHoloLlamaFootprint(
    options.profile,
    parseHoloLlamaFootprintOutput(output, options.systemdUnit)
  );
}

function buildFootprintProbeScript(systemdUnit: string): string {
  return `
unit=${shellSingleQuote(systemdUnit)}
printf 'UNIT=%s\\n' "$unit"
pid="$(systemctl show "$unit" -p MainPID --value 2>/dev/null || true)"
if [ -z "$pid" ] || [ "$pid" = "0" ]; then
  pid="$(systemctl show "$unit" -p ExecMainPID --value 2>/dev/null || true)"
fi
active_since="$(systemctl show "$unit" -p ActiveEnterTimestamp --value 2>/dev/null || true)"
printf 'PID=%s\\n' "$pid"
printf 'ACTIVE_ENTER_TIMESTAMP=%s\\n' "$active_since"
if [ -n "$pid" ] && [ "$pid" != "0" ] && [ -r "/proc/$pid/cmdline" ]; then
  cmd="$(tr '\\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  printf 'COMMAND=%s\\n' "$cmd"
  awk '
    /^VmRSS:/ { print "VM_RSS_KB="$2 }
    /^VmHWM:/ { print "VM_HWM_KB="$2 }
    /^VmSwap:/ { print "VM_SWAP_KB="$2 }
  ' "/proc/$pid/status" 2>/dev/null || true
  total=0
  previous=''
  for token in $cmd; do
    if [ "$previous" = "-m" ] || [ "$previous" = "--model" ]; then
      printf 'MODEL_PATH=%s\\n' "$token"
      if [ -f "$token" ]; then size="$(du -sm "$token" 2>/dev/null | awk '{print $1}')"; total=$((total + size)); fi
    fi
    if [ "$previous" = "--lora" ]; then
      printf 'LORA_PATH=%s\\n' "$token"
      if [ -f "$token" ]; then size="$(du -sm "$token" 2>/dev/null | awk '{print $1}')"; total=$((total + size)); fi
    fi
    previous="$token"
  done
  printf 'MODEL_FILES_MIB=%s\\n' "$total"
fi
free -m | awk '
  /^Mem:/ { print "RAM_TOTAL_MIB="$2; print "RAM_USED_MIB="$3 }
  /^Swap:/ { print "SWAP_TOTAL_MIB="$2; print "SWAP_USED_MIB="$3 }
' 2>/dev/null || true
if [ -n "$active_since" ] && [ "$active_since" != "n/a" ]; then
  journal="$(journalctl -u "$unit" --since "$active_since" -n 500 --no-pager 2>/dev/null || sudo -n journalctl -u "$unit" --since "$active_since" -n 500 --no-pager 2>/dev/null || true)"
else
  journal="$(journalctl -u "$unit" -n 500 --no-pager 2>/dev/null || sudo -n journalctl -u "$unit" -n 500 --no-pager 2>/dev/null || true)"
fi
if [ -n "$pid" ] && [ "$pid" != "0" ]; then
  pid_journal="$(printf '%s' "$journal" | grep -F "[$pid]:" || true)"
  if [ -n "$pid_journal" ]; then journal="$pid_journal"; fi
fi
if printf '%s' "$journal" | grep -qi 'no usable GPU found'; then
  printf 'NO_USABLE_GPU_WARNING=1\\n'
else
  printf 'NO_USABLE_GPU_WARNING=0\\n'
fi
cache="$(printf '%s' "$journal" | sed -nE 's/.*prompt cache is enabled, size limit: ([0-9]+) MiB.*/\\1/p' | tail -1)"
if [ -n "$cache" ]; then printf 'PROMPT_CACHE_LIMIT_MIB=%s\\n' "$cache"; fi
`;
}

function parseHoloLlamaFootprintOutput(
  output: string,
  fallbackUnit: string
): HoloLlamaFootprintAssessmentInput {
  const fields = new Map<string, string[]>();
  for (const line of output.split(/\r?\n/u)) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const list = fields.get(key) ?? [];
    list.push(value);
    fields.set(key, list);
  }
  return {
    source: 'ssh-procfs-journal',
    unit: firstField(fields, 'UNIT') ?? fallbackUnit,
    pid: optionalNumber(firstField(fields, 'PID')),
    command: firstField(fields, 'COMMAND') ?? null,
    promptCacheLimitMiB: optionalNumber(firstField(fields, 'PROMPT_CACHE_LIMIT_MIB')),
    noUsableGpuWarning: firstField(fields, 'NO_USABLE_GPU_WARNING') === '1',
    processRssMiB: kibToMib(firstField(fields, 'VM_RSS_KB')),
    processHighWaterMiB: kibToMib(firstField(fields, 'VM_HWM_KB')),
    processSwapMiB: kibToMib(firstField(fields, 'VM_SWAP_KB')),
    ramUsedMiB: optionalNumber(firstField(fields, 'RAM_USED_MIB')),
    ramTotalMiB: optionalNumber(firstField(fields, 'RAM_TOTAL_MIB')),
    swapUsedMiB: optionalNumber(firstField(fields, 'SWAP_USED_MIB')),
    swapTotalMiB: optionalNumber(firstField(fields, 'SWAP_TOTAL_MIB')),
    modelFilesMiB: optionalNumber(firstField(fields, 'MODEL_FILES_MIB')),
  };
}

async function fetchHoloLlamaJson(
  fetchImpl: HoloLlamaFetch,
  url: string,
  options: { timeoutMs: number; method?: string; body?: unknown }
): Promise<HoloLlamaHttpProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: options.method ?? 'GET',
      headers: options.body
        ? { 'content-type': 'application/json', accept: 'application/json' }
        : { accept: 'application/json' },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      url,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body: compactHoloLlamaBody(json, text),
    };
  } catch (error) {
    return {
      url,
      ok: false,
      status: 0,
      error:
        error instanceof Error && error.name === 'AbortError' ? 'timeout' : errorMessage(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runHoloLlamaCompletionProbe(
  fetchImpl: HoloLlamaFetch,
  endpoint: string,
  model: HoloLlamaLiveModelSummary | null,
  options: { prompt: string; maxTokens: number; timeoutMs: number }
): Promise<HoloLlamaCompletionProbe> {
  const chatBody = {
    model: model?.id || model?.name || 'qwen3-4b-instruct.gguf',
    messages: [{ role: 'user', content: options.prompt }],
    max_tokens: options.maxTokens,
    temperature: 0,
    stream: false,
  };
  const chat = await fetchHoloLlamaJson(fetchImpl, `${endpoint}/v1/chat/completions`, {
    timeoutMs: options.timeoutMs,
    method: 'POST',
    body: chatBody,
  });
  const chatContent = completionContent(chat);
  if (chat.ok && String(chatContent).trim()) {
    return {
      ...chat,
      mode: 'openai-chat',
      model: chatBody.model,
      contentPreview: String(chatContent).slice(0, 300),
      completionOk: true,
    };
  }

  const completion = await fetchHoloLlamaJson(fetchImpl, `${endpoint}/completion`, {
    timeoutMs: options.timeoutMs,
    method: 'POST',
    body: {
      prompt: options.prompt,
      n_predict: options.maxTokens,
      temperature: 0,
      stream: false,
    },
  });
  const fallbackContent = completionContent(completion);
  return {
    ...completion,
    mode: 'llama-completion-fallback',
    fallbackFrom: {
      url: chat.url,
      ok: chat.ok,
      status: chat.status,
      error: chat.error ?? null,
    },
    contentPreview: String(fallbackContent || '').slice(0, 300),
    completionOk: completion.ok === true && Boolean(String(fallbackContent || '').trim()),
  };
}

function completionContent(payload: HoloLlamaHttpProbe): string {
  const body = payload.body;
  if (!isRecord(body)) return '';
  const choices = Array.isArray(body.choices) ? body.choices : [];
  const first = choices[0];
  if (isRecord(first)) {
    if (isRecord(first.message) && typeof first.message.content === 'string') {
      return first.message.content;
    }
    if (typeof first.text === 'string') return first.text;
  }
  if (typeof body.content === 'string') return body.content;
  if (typeof body.response === 'string') return body.response;
  return '';
}

function compactHoloLlamaBody(json: unknown, text: string): unknown {
  if (isRecord(json) || Array.isArray(json)) return json;
  return text ? text.slice(0, 500) : null;
}

async function collectHoloLlamaHarnessFiles(rootDir: string, prefix = ''): Promise<string[]> {
  const absolute = join(rootDir, prefix);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (['.git', 'node_modules'].includes(entry.name)) continue;
      files.push(...(await collectHoloLlamaHarnessFiles(rootDir, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

async function findHoloLlamaHarnessConflicts(
  templateDir: string,
  targetDir: string,
  files: string[]
): Promise<string[]> {
  const conflicts: string[] = [];
  for (const file of files) {
    const target = join(targetDir, file);
    if (!existsSync(target)) continue;
    const sourceContent = await readFile(join(templateDir, file), 'utf8');
    const targetContent = await readFile(target, 'utf8');
    if (sourceContent !== targetContent) conflicts.push(file);
  }
  return conflicts;
}

async function copyHoloLlamaHarnessTemplate(
  templateDir: string,
  targetDir: string,
  files: string[]
): Promise<string[]> {
  const written: string[] = [];
  for (const file of files) {
    const source = join(templateDir, file);
    const target = join(targetDir, file);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await readFile(source, 'utf8'));
    written.push(file);
  }
  return written;
}

async function writeJsonReceipt(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function scanHoloLlamaHarnessPrivateAnchors(
  file: string,
  content: string
): HoloLlamaHarnessSafetyIssue[] {
  const checks: Array<{ id: string; pattern: RegExp; detail: string }> = [
    {
      id: 'founder-windows-user-path',
      pattern: /C:[\\/]+Users[\\/]+josep/i,
      detail: 'founder Windows home path is private to the source machine',
    },
    {
      id: 'founder-gold-drive',
      pattern: /D:[\\/]+GOLD\b/i,
      detail: 'GOLD drive paths belong to the private founder harness',
    },
    {
      id: 'founder-jetson-volume',
      pattern: /\/mnt\/nvme2?\/holo(?:-volumes)?\b/i,
      detail: 'owned-metal volume paths should not ship in the public harness',
    },
    {
      id: 'founder-jetson-host',
      pattern: /\b(?:username@)?192\.168\.0\.119\b/i,
      detail: 'private LAN Jetson address should be replaced by user-local configuration',
    },
    {
      id: 'founder-holokey-seat',
      pattern: /\b(?:openai|claude|grok|gemini)-[a-z0-9-]*c40b1de5[a-z0-9-]*\b/i,
      detail: 'machine-specific HoloKey seat identifiers must not ship in public harness files',
    },
  ];
  return checks
    .filter((check) => check.pattern.test(content))
    .map((check) => ({
      file,
      kind: 'private-anchor' as const,
      id: check.id,
      detail: check.detail,
    }));
}

function scanHoloLlamaHarnessSecrets(file: string, content: string): HoloLlamaHarnessSafetyIssue[] {
  const issues: HoloLlamaHarnessSafetyIssue[] = [];
  const secretLiteral =
    /\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|holomesh_sk_[A-Za-z0-9_]{8,}|holoscript_sk_[A-Za-z0-9_]{8,})\b/u;
  if (secretLiteral.test(content)) {
    issues.push({
      file,
      kind: 'filled-secret',
      id: 'secret-looking-token',
      detail: 'file contains a token-shaped secret literal',
    });
  }

  const envLine =
    /^\s*([A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PRIVATE_KEY|WALLET|PASSWORD)[A-Z0-9_]*)\s*=\s*(.*?)\s*$/u;
  for (const line of content.split(/\r?\n/u)) {
    const match = envLine.exec(line);
    if (!match) continue;
    const name = match[1];
    const value = stripEnvComment(match[2]).trim();
    if (value && !isPlaceholderSecretValue(value)) {
      issues.push({
        file,
        kind: 'filled-secret',
        id: `filled-env-${name.toLowerCase()}`,
        detail: `${name} has a non-empty value`,
      });
    }
  }
  return issues;
}

function stripEnvComment(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('#')) return '';
  if (trimmed.startsWith('"') || trimmed.startsWith("'"))
    return trimmed.replace(/^['"]|['"]$/g, '');
  const commentIndex = trimmed.indexOf('#');
  return commentIndex >= 0 ? trimmed.slice(0, commentIndex).trim() : trimmed;
}

function isPlaceholderSecretValue(value: string): boolean {
  const normalized = value
    .replace(/^['"]|['"]$/g, '')
    .trim()
    .toLowerCase();
  return (
    normalized === '' ||
    normalized === 'changeme' ||
    normalized === 'replace-me' ||
    normalized === 'your-key-here' ||
    normalized === '<api-key>' ||
    normalized === '<token>' ||
    normalized.startsWith('your_') ||
    normalized.startsWith('example_')
  );
}

function portableHarnessRootLabel(root: string): string {
  const rel = relative(process.cwd(), root).replace(/\\/g, '/');
  if (rel && !rel.startsWith('..')) return rel || '.';
  return basename(root) || '.ai-ecosystem';
}

function sha256Json(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(stableJson(value)), 'utf8')
    .digest('hex')}`;
}

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableJson(value[key])])
    );
  }
  return value;
}

function systemdProbeError(error: unknown): string {
  if (isRecord(error)) {
    const stderr = error.stderr;
    if (typeof stderr === 'string') return stderr.slice(0, 1000);
    if (stderr && typeof stderr === 'object' && 'toString' in stderr) {
      return String(stderr).slice(0, 1000);
    }
  }
  return errorMessage(error).slice(0, 1000);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function formatLoras(loras: Array<string | { path: string; scale?: number }>): string {
  const rendered = loras.map((lora) => {
    if (typeof lora === 'string') return quote(lora);
    const fields = [`path: ${quote(lora.path)}`];
    if (lora.scale !== undefined) fields.push(`scale: ${lora.scale}`);
    return `{ ${fields.join(', ')} }`;
  });
  return `[${rendered.join(', ')}]`;
}
