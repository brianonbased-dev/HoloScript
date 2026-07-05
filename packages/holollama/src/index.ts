import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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

const DEFAULT_IMAGE_MIN_TOKENS = 1024;
const DEFAULT_IMAGE_MAX_TOKENS = 1536;
export const HOLOLLAMA_DOCTOR_SCHEMA = 'holollama.doctor.v1';
export const HOLOLLAMA_PROFILE_DEFINITIONS: Record<HoloLlamaProfile, HoloLlamaProfileDefinition> = {
  'jetson-orin': {
    id: 'jetson-orin',
    label: 'Jetson Orin owned-metal lane',
    consumer: 'jetson',
    description: 'Linux ARM64 text-serving HoloLlama lane for the owned Jetson.',
    spec: {
      name: 'jetson-brittney-edge',
      model: 'brittney-edge:v0-4',
      modelPath: '/opt/holoscript/models/brittney-edge-v0-4.gguf',
      vision: false,
      host: '0.0.0.0',
      port: 18080,
      contextLength: 4096,
      gpuLayers: 32,
      fit: 'on',
      parallel: 1,
      metrics: true,
      grammar: 'holoscript',
      executable: '/usr/local/bin/llama-server',
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
      executable: 'llama-server.exe',
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
      executable: '/usr/local/bin/llama-server',
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

export function buildLlamaServeComposition(
  profileOrSpec: HoloLlamaProfile | HoloLlamaServeSpec = 'jetson-orin',
  overrides: Partial<HoloLlamaServeSpec> = {}
): string {
  const spec =
    typeof profileOrSpec === 'string'
      ? resolveHoloLlamaServeSpec(profileOrSpec, overrides)
      : { ...profileOrSpec, ...defined(overrides) };
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

export function compileHoloLlamaBundle(input: string | CompileHoloLlamaInput = {}): LlamaServerBundle {
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

export function compileHoloLlamaFiles(input: string | CompileHoloLlamaInput = {}): Record<string, string> {
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

export function doctorHoloLlamaProfiles(options: HoloLlamaDoctorOptions = {}): HoloLlamaDoctorReport {
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
      blockers.push(`bundle health ${summary.healthUrl} does not match registry health ${check.healthUrl}`);
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

function normalizeCompileInput(input: string | CompileHoloLlamaInput): Required<CompileHoloLlamaInput> {
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
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

function readRegistryString(registry: Record<string, unknown>, key: string): string {
  const value = registry[key];
  return typeof value === 'string' ? value : '';
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
