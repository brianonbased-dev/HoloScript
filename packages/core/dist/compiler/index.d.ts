/**
 * @holoscript/core/compiler — Multi-Target Compiler Type Declarations
 */

export interface CapabilityTokenCredential {
  token: string;
  scope: string[];
  issuedAt: number;
  expiresAt: number;
  issuer: string;
}

export type CompilerToken = string | CapabilityTokenCredential;

export function isCapabilityTokenCredential(token: CompilerToken): token is CapabilityTokenCredential;
export function createTestCompilerToken(): string;

export interface ICompiler {
  compile(ast: any, token: CompilerToken): any;
  [key: string]: any;
}

export class UnauthorizedCompilerAccessError extends Error {
  constructor(message: string);
}

export abstract class CompilerBase implements ICompiler {
  compile(ast: any, token: CompilerToken): any;
  [key: string]: any;
}

export interface R3FNode {
  type: string;
  [key: string]: any;
}

export type ExportTarget =
  | 'urdf'
  | 'sdf'
  | 'unity'
  | 'unreal'
  | 'godot'
  | 'vrchat'
  | 'openxr'
  | 'android'
  | 'android-xr'
  | 'ios'
  | 'visionos'
  | 'webgpu'
  | 'wasm'
  | 'usd'
  | 'usdz'
  | 'dtdl'
  | 'multi-layer'
  | 'incremental'
  | 'state'
  | 'trait-composition'
  | 'tsl'
  | 'a2a-agent-card'
  | 'nir'
  | 'openxr-spatial-entities'
  | 'context'
  | '3dgs'
  | 'llama-server'
  | 'mcp-server';

export interface HolomapPointCloudPayload {
  positionsB64: string;
  colorsB64: string;
  pointCount: number;
}

export interface SceneIRCompilerOptions {
  qualityTier?: 'low' | 'med' | 'high' | 'ultra';
  defaultLighting?: boolean;
  holomapPointCloud?: HolomapPointCloudPayload;
  platformTarget?: any;
}

export class SceneIRCompiler extends CompilerBase {
  constructor(options?: SceneIRCompilerOptions);
  compile(ast: any, token: CompilerToken): R3FNode[];
  compileComposition(composition: any): R3FNode;
}

export type PerceptualColorPassSource = 'palette' | 'gradient' | 'color_map';
export interface PerceptualGradientStop { t: number; color: string; }
export interface PerceptualColorPassOptions {
  steps?: number;
  dampening?: number;
  arcSteps?: number;
  targetDeltaE?: number;
  neutralAxis?: boolean;
}
export interface PerceptualColorPassInput {
  palette?: readonly string[];
  gradient?: readonly (string | PerceptualGradientStop)[];
  colorMap?: string | readonly (string | PerceptualGradientStop)[];
  steps?: number;
  dampening?: number;
  arcSteps?: number;
  targetDeltaE?: number;
  neutralAxis?: boolean;
  scientific?: boolean;
}
export interface PerceptualPaletteResult {
  colors: string[];
  pairwiseDeltaE: number[];
  minDeltaE: number;
  maxDeltaE: number;
  meanDeltaE: number;
  nearestNeutral?: string[];
}
export interface PerceptualGradientResult {
  stops: PerceptualGradientStop[];
  colors: string[];
  deltaE: number[];
  minDeltaE: number;
  maxDeltaE: number;
  meanDeltaE: number;
}
export interface PerceptualColorMapResult extends PerceptualGradientResult { name: string; }
export interface PerceptualColorPassResult {
  algorithm: 'perceptual_lerp_delta_e2000';
  source: PerceptualColorPassSource;
  scientific: boolean;
  targetDeltaE: number;
  dampening: number;
  palette?: PerceptualPaletteResult;
  gradient?: PerceptualGradientResult;
  colorMap?: PerceptualColorMapResult;
  warnings: string[];
}
export interface PerceptualColorAnalysis {
  color: string;
  lightness: number;
  chroma: number;
  hue: number;
  nearestNeutral: string;
}
export interface PerceptualColorCompilerMetadata {
  mapName: string;
  colors: string[];
  stops: PerceptualGradientStop[];
  minDeltaE: number;
  maxDeltaE: number;
  meanDeltaE: number;
  warnings: string[];
  pass: PerceptualColorPassResult;
}
export const SCIENTIFIC_COLOR_MAPS: Record<string, readonly string[]>;
export function normalizeHexColor(color: string): string;
export function hexToSrgb(color: string): readonly [number, number, number];
export function srgbToHex(rgb: readonly [number, number, number]): string;
export function buildPerceptualGradient(
  stops: readonly (string | PerceptualGradientStop)[],
  options?: PerceptualColorPassOptions
): PerceptualGradientResult;
export function buildPerceptualPalette(
  colors: readonly string[],
  options?: PerceptualColorPassOptions
): PerceptualPaletteResult;
export function analyzePerceptualColor(color: string): {
  color: string;
  lightness: number;
  chroma: number;
  hue: number;
  nearestNeutral: string;
};
export function applyPerceptualColorPass(input: PerceptualColorPassInput): PerceptualColorPassResult;

export declare const ENVIRONMENT_PRESETS: Record<string, any>;

export class UnityCompiler extends CompilerBase { constructor(options?: any); compile(ast: any, token: CompilerToken): any; }
export class GodotCompiler extends CompilerBase { constructor(options?: any); compile(ast: any, token: CompilerToken): any; }
export class OpenXRCompiler extends CompilerBase { constructor(options?: any); compile(ast: any, token: CompilerToken): any; }
export class VRChatCompiler extends CompilerBase { constructor(options?: any); compile(ast: any, token: CompilerToken): any; }
export class VisionOSCompiler extends CompilerBase { constructor(options?: any); compile(ast: any, token: CompilerToken): any; }
export class AndroidCompiler extends CompilerBase { constructor(options?: any); compile(ast: any, token: CompilerToken): any; }
export class AndroidXRCompiler extends CompilerBase { constructor(options?: any); compile(ast: any, token: CompilerToken): any; }
export class IOSCompiler extends CompilerBase { constructor(options?: any); compile(ast: any, token: CompilerToken): any; }
export class WASMCompiler extends CompilerBase { constructor(options?: any); compile(ast: any, token: CompilerToken): any; }
export class WebGPUCompiler extends CompilerBase { constructor(options?: any); compile(ast: any, token: CompilerToken): any; }
export class SDFCompiler extends CompilerBase { constructor(options?: any); compile(ast: any, token: CompilerToken): any; }
export class DTDLCompiler extends CompilerBase { constructor(options?: any); compile(ast: any, token: CompilerToken): any; }
export class URDFCompiler extends CompilerBase { constructor(options?: any); compile(ast: any, token: CompilerToken): any; }
export class HoloMCPCompiler extends CompilerBase { constructor(options?: any); compileModule(composition: any, agentToken: string, outputPath?: string): string; }
export const DialectRegistry: {
  register(descriptor: any): void;
  unregister(name: string): boolean;
  has(name: string): boolean;
  get(name: string): any;
  create(name: string, options?: Record<string, unknown>): CompilerBase;
  list(): any[];
  listByDomain(domain: string): any[];
  names(): string[];
  readonly size: number;
};
export declare function registerBuiltinDialects(): void;
export declare function absorbFMU(input: any): any;
export declare function streamWorldTiles(composition: any, options?: any): any;
export class USDPhysicsCompiler extends CompilerBase { constructor(options?: any); compile(ast: any, token: CompilerToken): any; }
export class StateCompiler extends CompilerBase { constructor(options?: any); compile(ast: any, token: CompilerToken): any; }
export class TraitCompositionCompiler extends CompilerBase { constructor(options?: any); compile(ast: any, token: CompilerToken): any; }
export class IncrementalCompiler extends CompilerBase {
  constructor(options?: any);
  static deserialize(json: string): IncrementalCompiler;
  compile(ast: any, compileObject: (obj: any) => string, options?: any): Promise<any>;
  [key: string]: any;
}
export function createIncrementalCompiler(config?: any): IncrementalCompiler;
export class MultiLayerCompiler extends CompilerBase { constructor(options?: any); compile(ast: any, token: CompilerToken): any; }
export class COCOExporter { [key: string]: any; }
export class GLTFPipelineMCPTool { [key: string]: any; }
export const BUSINESS_QUEST_TOOLS: any[];
export function registerBusinessQuestTools(server: any): void;
export function handleBusinessQuestToolCall(request: any): Promise<any>;
export function buildVRRCompositionFromDraft(draft: any): any;
export function validateBusinessVRRDraft(
  draft: unknown,
  options?: { parseWithVrrCompiler?: boolean }
): Promise<any>;
export function draftToHoloPreview(draft: any): string;
export const businessVRRDraftSchema: any;
export type BusinessVRRDraft = any;
export type BusinessQuestValidationIssue = any;
export type BusinessQuestValidationResult = any;
export class NodeToyMapping { [key: string]: any; }
export class RemotionBridge { [key: string]: any; }
export class ReproducibilityMode { [key: string]: any; }
export class SemanticSceneGraph { [key: string]: any; }
export type MCPConfigTarget = 'claude' | 'vscode' | 'cursor' | 'antigravity' | 'generic';
export interface MCPConfigCompilerOptions {
  target?: MCPConfigTarget;
  envFile?: string;
  envValues?: Record<string, string>;
  cwd?: string;
}
export class MCPConfigCompiler extends CompilerBase {
  constructor(options?: MCPConfigCompilerOptions);
  compile(composition: any, agentToken: string, outputPath?: string): string;
}
export interface LlamaServerCompilerOptions {
  name?: string;
  model?: string;
  modelPath?: string;
  mmprojPath?: string;
  host?: string;
  port?: number;
  contextLength?: number;
  gpuLayers?: number;
  fit?: 'on' | 'off';
  imageMinTokens?: number;
  imageMaxTokens?: number;
  parallel?: number;
  metrics?: boolean;
  grammarPath?: string;
  grammar?: string;
  loraPath?: string;
  loraScale?: number;
  executable?: string;
  cudaPath?: string;
  llamaBinDir?: string;
  workingDirectory?: string;
  platform?: 'windows' | 'linux';
  serviceUser?: string;
  node?: string;
  registerAs?: string;
  dryRun?: boolean;
}
export interface LlamaServerBundleFile {
  path: string;
  content: string;
  executable?: boolean;
}
export interface LlamaServerBundle {
  name: string;
  target: 'llama-server';
  dryRun: true;
  launch: { executable: string; args: string[]; command: string; powershell: string };
  healthProbe: { url: string; openaiModelsUrl: string; powershell: string };
  service: { systemdUnit: string; windowsS4UTask: string };
  registryEntry: Record<string, any>;
  files: LlamaServerBundleFile[];
  config: Record<string, any>;
  warnings: string[];
}
export class LlamaServerCompiler extends CompilerBase {
  constructor(options?: LlamaServerCompilerOptions);
  compile(composition: any, agentToken: string, outputPath?: string): string;
  compileToFiles(composition: any, agentToken?: string): Record<string, string>;
}
export class AgentInferenceExportTarget extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class AgentInferenceCompiler extends CompilerBase {
  constructor(options?: any);
  compile(composition: any, agentToken: string, outputPath?: string): Record<string, string>;
}
export type ContextSurface = 'claude' | 'codex' | 'cursor' | 'copilot' | 'gemini' | 'any';
export type ContextEmitFormat =
  | 'claude_md'
  | 'agents_md'
  | 'cursor_rules'
  | 'skill_md'
  | 'anthropic_system_prompt'
  | 'brain_includes'
  | 'mcp_context_loader';
export interface ContextValidationDiagnostic {
  severity: 'error' | 'warning';
  rule: string;
  message: string;
  location?: string;
}
export interface ContextAST { [key: string]: any; warnings: ContextValidationDiagnostic[]; }
export interface ContextCompileResult {
  files: Record<string, string>;
  ast: ContextAST;
  diagnostics: ContextValidationDiagnostic[];
}
export interface ContextCompilerOptions { formats?: ContextEmitFormat[]; }
export class ContextCompileError extends Error { constructor(message: string); }
export class ContextCompiler extends CompilerBase {
  constructor(options?: ContextCompilerOptions);
  compile(composition: any, agentToken: string, outputPath?: string): ContextCompileResult;
}
export function createContextCompiler(options?: ContextCompilerOptions): ContextCompiler;
export type LLMProviderStatus = 'live' | 'partial' | 'teammate' | 'runtime' | 'planned';
export type LLMModelStatus = 'active' | 'active-recommended' | 'active-legacy' | 'deprecated';
export type LLMCapabilityEmitFormat =
  | 'markdown_ssot'
  | 'ts_adapter_capabilities'
  | 'cost_guard_pricing'
  | 'json_capability_matrix';
export interface LLMCapabilityValidationDiagnostic {
  severity: 'error' | 'warning';
  rule: string;
  message: string;
  location?: string;
}
export interface LLMCapabilityMatrixAST { [key: string]: any; warnings: LLMCapabilityValidationDiagnostic[]; }
export interface LLMCapabilityCompileResult {
  files: Record<string, string>;
  ast: LLMCapabilityMatrixAST;
  diagnostics: LLMCapabilityValidationDiagnostic[];
}
export interface LLMCapabilityCompilerOptions {
  formats?: LLMCapabilityEmitFormat[];
  nowIso?: string;
}
export class LLMCapabilityCompileError extends Error { constructor(message: string); }
export class LLMProviderCapabilitiesCompiler extends CompilerBase {
  constructor(options?: LLMCapabilityCompilerOptions);
  compile(composition: any, agentToken: string, outputPath?: string): LLMCapabilityCompileResult;
}
export function createLLMProviderCapabilitiesCompiler(
  options?: LLMCapabilityCompilerOptions
): LLMProviderCapabilitiesCompiler;

export interface GeometryData { vertices: Float32Array; indices?: Uint32Array; normals?: Float32Array; uvs?: Float32Array; }
export interface BlobDef { center: [number, number, number]; radius: number; }
export function generateSplineGeometry(points: number[][], opts?: any): GeometryData;
export function generateHullGeometry(points: number[][]): GeometryData;
export function generateMembraneGeometry(blobs: BlobDef[], resolution?: number): GeometryData;

export function runSafetyPass(ast: any, config?: SafetyPassConfig): SafetyPassResult;
export function quickSafetyCheck(ast: any): boolean;
export interface SafetyPassResult { passed: boolean; violations: any[]; }
export interface SafetyPassConfig { [key: string]: any; }
export interface SafetyReport { [key: string]: any; }
export type SafetyVerdict = 'safe' | 'warnings' | 'unsafe' | 'unchecked';
export interface LinearCheckerConfig { [key: string]: any; }
export interface InferredEffects { [key: string]: any; }
export type VREffect = string;
export type EffectCategory = string;
export type EffectViolationSeverity = 'error' | 'warning' | 'info';
export interface EffectViolation { effect: VREffect; severity: EffectViolationSeverity; [key: string]: any; }
export interface EffectDeclaration { effects: VREffect[]; [key: string]: any; }
export type CompilePlatformTarget = string;
export function createPlatformTarget(platform: string): CompilePlatformTarget;
export function filterCompositionForPlatform(composition: any, platform: string): any;
export function matchesPlatformConstraint(constraint: any, target: CompilePlatformTarget): boolean;
export function normalizePlatformName(name: string): string;

export class USDZPipeline { [key: string]: any; }
export interface USDZPipelineOptions { [key: string]: any; }

export interface QuantumAtom {
  symbol: string;
  x: number;
  y: number;
  z: number;
}
export interface QASMOutput {
  qasm: string;
  numQubits: number;
  numClbits: number;
  estimatedDepth: number;
  circuitType: 'vqe' | 'qaoa' | 'grover' | 'custom';
  molecule?: { atoms: QuantumAtom[] };
  weightMatrix?: number[][];
  recommendedBackend: 'aer' | 'ibm-quantum';
  warnings: string[];
}
export class QuantumCircuitCompiler extends CompilerBase {
  compile(composition: any, agentToken?: string, outputPath?: string, sceneGraph?: any): QASMOutput;
}

export class CompilerBridge { [key: string]: any; }

// Social Causal Model (SCM) — Cycle 9/10/12
export interface AffectiveState {
  valence: number;
  arousal: number;
  dominantEmotion: 'calm' | 'excited' | 'frustrated' | 'engaged' | 'bored' | 'anxious';
}

export interface SCMCompilerOptions {
  modelName?: string;
  affectiveContext?: AffectiveState;
  privacyMask?: boolean;
}

export interface SCMNode {
  id: string;
  type: string;
  properties: Record<string, any>;
  do_capable: boolean;
}

export interface SCMEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

export interface SCMDAG {
  metadata: {
    model_name: string;
    generated_at: string;
    affective_context?: AffectiveState;
  };
  nodes: SCMNode[];
  edges: SCMEdge[];
}

export class SCMCompiler extends CompilerBase {
  constructor(options?: SCMCompilerOptions);
  compile(composition: any, agentToken: string, outputPath?: string): string;
}

export interface SocialMergeOptions {
  consensusThreshold?: number;
  modelName?: string;
}

export interface SocialMergeReport {
  agents: number;
  threshold: number;
  nodes: { kept: number; dropped: number };
  edges: { kept: number; dropped: number; smoothed: number };
}

export interface SocialMergeResult {
  dag: SCMDAG;
  report: SocialMergeReport;
}

export function mergeSocialCausalModels(
  agentDags: SCMDAG[],
  options?: SocialMergeOptions,
): SocialMergeResult;

export enum DispatchTier {
  TIER_1_NEUROMORPHIC = 'tier-1-neuromorphic',
  TIER_1_BROWSER = 'tier-1-browser',
  TIER_1_WASM = 'tier-1-wasm',
  TIER_2_SPECULATIVE = 'tier-2-speculative',
  TIER_3_CPU_DIRECT = 'tier-3-cpu-direct',
}

export type NeuromorphicDeviceTarget = 'loihi' | 'spinnaker' | 'synsense' | 'akida';
export interface NeuromorphicRuntimeDevice {
  target: NeuromorphicDeviceTarget;
  id?: string;
  available?: boolean;
  source?: string;
}
export interface NeuromorphicRuntimeProbeResult {
  available: boolean;
  device?: NeuromorphicDeviceTarget;
  source: string;
  reason?: string;
  devices?: NeuromorphicRuntimeDevice[];
}
export type NeuromorphicRuntimeProbe = (
  preferredDevice?: NeuromorphicDeviceTarget
) => NeuromorphicRuntimeProbeResult | Promise<NeuromorphicRuntimeProbeResult>;
export interface DispatchEffectVerifierResult {
  passed: boolean;
  reason?: string;
}
export interface Tier3CpuDirectOutput {
  trait: string;
  nodeId: string;
  config: Record<string, unknown>;
}
export interface TraitEquivalenceOracleInput {
  operation: DispatchableOperation;
  proposal: unknown;
  tier3Output: unknown;
}
export interface TraitEquivalenceOracleResult {
  equivalent: boolean;
  source: string;
  reason?: string;
  score?: number;
  proposalFingerprint?: string;
  tier3Fingerprint?: string;
}
export type DispatchProposalProvider = (
  op: DispatchableOperation
) => unknown | null | Promise<unknown | null>;
export type Tier3CpuExecutor = (op: DispatchableOperation) => unknown | Promise<unknown>;
export type TraitEquivalenceOracle = (
  input: TraitEquivalenceOracleInput
) => TraitEquivalenceOracleResult | Promise<TraitEquivalenceOracleResult>;
export interface Tier1WasmRuntimeProbeResult {
  available: boolean;
  source: string;
  reason?: string;
  moduleValidated?: boolean;
}
export interface Tier1WasmEmulatorResult {
  accepted: boolean;
  source: string;
  runtime: Tier1WasmRuntimeProbeResult;
  reason?: string;
  steps?: number;
  spikeCount?: number;
  membranePotential?: number;
  inputChecksum?: number;
}
export type Tier1WasmRuntimeProbe = () =>
  | Tier1WasmRuntimeProbeResult
  | Promise<Tier1WasmRuntimeProbeResult>;
export type Tier1WasmExecutor = (
  op: DispatchableOperation,
  runtime: Tier1WasmRuntimeProbeResult
) => Tier1WasmEmulatorResult | Promise<Tier1WasmEmulatorResult>;
export type Tier1BrowserExecutor = (
  op: DispatchableOperation
) => Promise<{ accepted: boolean; source: string; steps?: number; reason?: string }>;
export interface DispatchPolicyConfig {
  tier1BrowserEnabled: boolean;
  tier1WasmEnabled: boolean;
  tier1WasmRuntimeProbe?: Tier1WasmRuntimeProbe;
  tier1WasmExecutor?: Tier1WasmExecutor;
  tier1BrowserExecutor?: Tier1BrowserExecutor;
  tier1NeuromorphicEnabled: boolean;
  tier1NeuromorphicDevice?: NeuromorphicDeviceTarget;
  neuromorphicRuntimeProbe?: NeuromorphicRuntimeProbe;
  tier2Enabled: boolean;
  llmProposalProvider?: DispatchProposalProvider;
  tier3CpuExecutor?: Tier3CpuExecutor;
  traitEquivalenceOracle?: TraitEquivalenceOracle;
  tier2AlphaThreshold: number;
  effectVerifier?: (traits: string[]) => Promise<DispatchEffectVerifierResult | null>;
  simulationContractVerifier?: (manifest: unknown) => Promise<boolean>;
  alphaWindowSize: number;
}
export interface DispatchableOperation {
  trait: string;
  nodeId: string;
  config?: Record<string, unknown>;
  provenanceContext?: unknown;
  manifest?: ReconstructionManifest;
}
export interface DispatchMetrics {
  tierAttempted: DispatchTier;
  tierAccepted: boolean;
  fallbackReason?: string;
  latencyEstimateMs: number;
  alpha?: number;
  verifierPassed?: boolean;
  traitEquivalence?: TraitEquivalenceOracleResult;
  neuromorphicProbe?: NeuromorphicRuntimeProbeResult;
  wasmProbe?: Tier1WasmRuntimeProbeResult;
  wasmEmulator?: Tier1WasmEmulatorResult;
  browserExecutor?: { accepted: boolean; source: string; steps?: number; reason?: string };
}
export interface DispatchDecision {
  tier: DispatchTier;
  accepted: boolean;
  provenance: unknown;
  metrics: DispatchMetrics;
  replayFingerprint?: string;
}
export class AlphaTracker {
  constructor(size?: number);
  recordAttempt(success: boolean): void;
  getAlpha(): number;
  readonly windowLength: number;
}
export class DispatchPolicy {
  constructor(config?: Partial<DispatchPolicyConfig>);
  route(op: DispatchableOperation): Promise<DispatchDecision>;
}
export function createTier3CpuDirectOutput(op: DispatchableOperation): Tier3CpuDirectOutput;
export function detectWasmRuntime(): Tier1WasmRuntimeProbeResult;
export function runCompilerWasmSnnEmulator(
  op: DispatchableOperation,
  runtime: Tier1WasmRuntimeProbeResult
): Tier1WasmEmulatorResult;

// Additional live compilers for compiler subpath consumers
export class GaussianSplattingCompiler extends CompilerBase {
  constructor(options?: { format?: 'gltf' | 'glb'; [key: string]: any });
  compile(ast: any, token?: any, ...args: any[]): any;
  [key: string]: any;
}

// Sovereign target classification (D.006 native-vs-bridge registry — sovereign-targets.ts)
export const SOVEREIGN_TARGETS: readonly ExportTarget[];
export const BRIDGE_TARGETS: readonly ExportTarget[];
export const NATIVE_COMPILE_MODES: readonly ExportTarget[];
export interface SovereignEngine {
  id: string;
  name: string;
  file: string;
  kind: 'renderer' | 'engine' | 'runtime' | 'compiler' | 'frontend';
  maturity: string;
  tests: boolean;
  promoted: boolean;
  note: string;
}
export const SOVEREIGN_ENGINES: readonly SovereignEngine[];
export function isSovereignTarget(target: ExportTarget): boolean;
export function isBridgeTarget(target: ExportTarget): boolean;
export function targetSovereignty(target: ExportTarget): 'sovereign' | 'bridge' | 'mode';
export function compilePipelineSourceToNode(source: string, options?: any): any;
