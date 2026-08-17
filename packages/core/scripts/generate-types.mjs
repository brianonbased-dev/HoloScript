#!/usr/bin/env node

/**
 * Post-build script for @holoscript/core
 * Generates type declaration files for downstream packages
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Go up from scripts/ to core/, then to dist/
const coreRoot = path.join(__dirname, '..');
const distDir = path.join(coreRoot, 'dist');

// Subpath export @holoscript/core/trait-docs — emit real .d.ts (tsup has dts: false)
try {
  const tscBin = path.join(coreRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  execFileSync(process.execPath, [tscBin, '-p', 'tsconfig.trait-docs.json'], {
    cwd: coreRoot,
    stdio: 'inherit',
  });
  console.log('✓ Created traitDocs/traitDocs.d.ts');
} catch (err) {
  console.error('✗ trait-docs declaration emit failed:', err?.message ?? err);
  process.exit(1);
}

// Subpath export @holoscript/core/policy — emit real .d.ts for the ContentPolicyGate
// barrel (tsup has dts: false). Consumers (Brittney, HoloLand NPC dialogue, the
// conformance content-admission gate) import { evaluateContentPolicy,
// buildContentPolicyConfig, ContentPolicyGate, ... } from '@holoscript/core/policy'
// and need the full typed surface, not just the runtime JS.
try {
  const tscBin = path.join(coreRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  execFileSync(process.execPath, [tscBin, '-p', 'tsconfig.policy.json'], {
    cwd: coreRoot,
    stdio: 'inherit',
  });
  console.log('✓ Created policy/index.d.ts');
} catch (err) {
  console.error('✗ policy declaration emit failed:', err?.message ?? err);
  process.exit(1);
}

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Comprehensive type declaration - includes all major exports
const mainDTS = `/**
 * @fileoverview Type definitions for HoloScript Core (v5.0)
 * @module @holoscript/core
 */

import type {
  UnknownFieldLowering,
  UAALContainmentIR,
  UAALContainmentQuery,
  UAALContainmentRelation,
  UAALSemanticEntity,
} from '@holoscript/meaning';

// ============================================================================
// CORE TYPES
// ============================================================================

export interface ASTNode {
  type: string;
  [key: string]: any;
}

export interface ParseResult {
  success?: boolean;
  ast: any;
  errors: any[];
  warnings: any[];
}

export interface TraitHandler<T = any> {
  name: string;
  defaultConfig?: T;
  onAttach?: (node: any, config: T, context: TraitContext) => void;
  onDetach?: (node: any, config: T, context: TraitContext) => void;
  onUpdate?: (node: any, config: T, context: TraitContext, delta: number) => void;
  onEvent?: (node: any, config: T, context: TraitContext, event: TraitEvent) => void;
  [key: string]: any;
}

export type SRGB = readonly [r: number, g: number, b: number];
export type LinearRGB = readonly [r: number, g: number, b: number];
export type XYZ = readonly [x: number, y: number, z: number];

export interface Lab {
  L: number;
  a: number;
  b: number;
}

export interface PerceptualDistanceOptions {
  dampening?: number;
  steps?: number;
}
export type LabMetricTensor = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];
export interface DeltaE2000MetricTensorOptions {
  epsilon?: number;
  regularization?: number;
}
export interface DeltaE2000GeodesicOptions extends DeltaE2000MetricTensorOptions {
  segments?: number;
  iterations?: number;
  stepSize?: number;
  gradientStep?: number;
  maxCoordinateStep?: number;
  clampLab?: boolean;
}
export interface DeltaE2000GeodesicResult {
  path: Lab[];
  length: number;
  straightLength: number;
  energy: number;
  iterations: number;
}
export interface LanlGrayAchromaticAggregate {
  Ls: number;
  Lt1: number;
  Lt2: number;
  count: number;
  choseT2: number;
}
export interface LanlGrayChoiceModelOptions {
  dampening?: number;
  noise?: number;
}
export interface LanlGrayFitOptions {
  dampeningCandidates?: readonly number[];
  noiseCandidates?: readonly number[];
}
export interface LanlGrayFitResult {
  dampening: number;
  noise: number;
  negativeLogLikelihood: number;
  meanAccuracy: number;
  rows: number;
}

export const DAMPENING_OFF: number;
export const DEFAULT_DAMPENING: number;
export const DEFAULT_LANL_GRAY_NOISE: number;

export function srgbToLinearChannel(c: number): number;
export function linearToSrgbChannel(c: number): number;
export function srgbToLinear(rgb: SRGB): LinearRGB;
export function linearToSrgb(rgb: LinearRGB): SRGB;
export function linearRgbToXyz(rgb: LinearRGB): XYZ;
export function xyzToLinearRgb(xyz: XYZ): LinearRGB;
export function xyzToLab(xyz: XYZ): Lab;
export function labToXyz(lab: Lab): XYZ;
export function srgbToLab(rgb: SRGB): Lab;
export function labToSrgb(lab: Lab): SRGB;
export function deltaE2000(lab1: Lab, lab2: Lab): number;
export function dampen(x: number, tau?: number): number;
export function arcLengthDeltaE2000(A: Lab, B: Lab, steps?: number): number;
export function metricTensorDeltaE2000(center: Lab, options?: DeltaE2000MetricTensorOptions): LabMetricTensor;
export function labMetricQuadraticForm(vector: readonly [number, number, number], metric: LabMetricTensor): number;
export function metricTensorArcLengthDeltaE2000(A: Lab, B: Lab, steps?: number, options?: DeltaE2000MetricTensorOptions): number;
export function solveDeltaE2000Geodesic(A: Lab, B: Lab, options?: DeltaE2000GeodesicOptions): DeltaE2000GeodesicResult;
export function lanlGrayChoiceProbability(row: Pick<LanlGrayAchromaticAggregate, 'Ls' | 'Lt1' | 'Lt2'>, options?: LanlGrayChoiceModelOptions): number;
export function lanlGrayNegativeLogLikelihood(rows: readonly LanlGrayAchromaticAggregate[], options?: LanlGrayChoiceModelOptions): number;
export function lanlGrayMeanAccuracy(rows: readonly LanlGrayAchromaticAggregate[], options?: LanlGrayChoiceModelOptions): number;
export function fitLanlGrayAchromaticModel(rows: readonly LanlGrayAchromaticAggregate[], options?: LanlGrayFitOptions): LanlGrayFitResult;
export function perceptualDistance(a: SRGB, b: SRGB, options?: PerceptualDistanceOptions): number;
export function nearestNeutral(c: SRGB): SRGB;
export function lightness(c: SRGB): number;
export function chroma(c: SRGB): number;
export function hue(c: SRGB): number;
export function perceptualLerp(a: SRGB, b: SRGB, t: number): SRGB;
export const LANL_GRAY_ACHROMATIC_SOURCE: {
  readonly repo: string;
  readonly dataUrl: string;
  readonly path: string;
  readonly sha: string;
  readonly columns: readonly string[];
  readonly license: string;
  readonly deposited: string;
  readonly note: string;
};
export const LANL_GRAY_ACHROMATIC_AGGREGATES: readonly LanlGrayAchromaticAggregate[];

export type PerceptualColorPassSource = 'palette' | 'gradient' | 'color_map';
export type PerceptualColorMode = 'auto' | 'palette' | 'gradient' | 'color_map';
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
export interface PerceptualColorConfig {
  mode: PerceptualColorMode;
  palette: string[];
  gradient: PerceptualGradientStop[];
  color_map: string;
  steps: number;
  dampening: number;
  target_delta_e: number;
  neutral_axis: boolean;
  scientific: boolean;
  emit_analysis: boolean;
}
export interface PerceptualColorTraitOutput {
  mode: PerceptualColorMode;
  palette?: string[];
  gradient?: PerceptualGradientStop[];
  colorMap?: string;
  analysis?: PerceptualColorAnalysis[];
  compilerColorPass: PerceptualColorPassResult;
}
export interface PerceptualColorState {
  revisions: number;
  lastApplied: PerceptualColorTraitOutput | null;
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
export const perceptualColorHandler: TraitHandler<PerceptualColorConfig>;
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

export interface ParsedTrait {
  name: string;
  config: any;
  [key: string]: any;
}

export interface ReconstructionManifest {
  version: '1.0.0';
  worldId: string;
  displayName: string;
  createdAt: string;
  frameCount: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  replayHash: string;
  simulationContract: {
    kind: 'holomap.reconstruction.v1';
    replayFingerprint: string;
    holoScriptBuild: string;
  };
  [key: string]: unknown;
}

export function assertHoloMapManifestContract(m: ReconstructionManifest): void;

export const DOMAIN_SIMULATION_RECEIPT_SCHEMA: 'holoscript.domain-simulation-receipt.v0.1.0';
export type DomainSimulationReceiptSchema = typeof DOMAIN_SIMULATION_RECEIPT_SCHEMA;
export type DomainSimulationReceiptHashAlgorithm = 'fnv1a32';
export type DomainReceiptJson =
  | string
  | number
  | boolean
  | null
  | DomainReceiptJson[]
  | { [key: string]: DomainReceiptJson };
export interface DomainSimulationReceiptAcceptance {
  accepted: boolean;
  violations: Array<{ criterion: string; message: string }>;
}
export interface DomainSimulationReceiptInput {
  plugin: string;
  pluginVersion: string;
  runId: string;
  createdAt?: string;
  modelId?: string;
  solverConfig: {
    solverType: string;
    scale: string;
    [key: string]: DomainReceiptJson;
  };
  resultSummary: { [key: string]: DomainReceiptJson };
  acceptance: DomainSimulationReceiptAcceptance;
  cael?: {
    version?: 'cael.v1';
    event?: string;
    solverType?: string;
  };
  artifacts?: Array<{
    kind: string;
    path?: string;
    hash?: string;
  }>;
}
export interface DomainSimulationReceipt {
  schema: DomainSimulationReceiptSchema;
  plugin: string;
  pluginVersion: string;
  runId: string;
  createdAt: string;
  modelId?: string;
  solverConfig: {
    solverType: string;
    scale: string;
    [key: string]: DomainReceiptJson;
  };
  resultSummary: { [key: string]: DomainReceiptJson };
  cael: {
    version: 'cael.v1';
    event: string;
    solverType: string;
  };
  acceptance: DomainSimulationReceiptAcceptance;
  artifacts?: Array<{
    kind: string;
    path?: string;
    hash?: string;
  }>;
  payloadHash: string;
  hashAlgorithm: DomainSimulationReceiptHashAlgorithm;
}
export interface DomainSimulationReceiptVerification {
  valid: boolean;
  errors: string[];
}
export function buildDomainSimulationReceipt(input: DomainSimulationReceiptInput): DomainSimulationReceipt;
export function verifyDomainSimulationReceipt(receipt: DomainSimulationReceipt): DomainSimulationReceiptVerification;
export function stableDomainReceiptHash(payload: unknown): string;
export function canonicalizeDomainReceiptPayload(payload: unknown): string;

export const SCALE_BRIDGE_PROJECTION_SCHEMA: 'holoscript.scale-bridge.projection.v0.1.0';
export type ScaleBridgeProjectionSchema = typeof SCALE_BRIDGE_PROJECTION_SCHEMA;
export type ScaleBridgeJson =
  | string
  | number
  | boolean
  | null
  | ScaleBridgeJson[]
  | { [key: string]: ScaleBridgeJson };
export interface ScaleDescriptor {
  id: string;
  label?: string;
  granularity?: string;
  includePaths?: string[];
  excludePaths?: string[];
  collectionLimits?: Record<string, number>;
  collectionStride?: Record<string, number>;
  defaultStride?: number;
  metadata?: { [key: string]: ScaleBridgeJson };
}
export interface ScaleBridgeProvenanceEdge {
  type: 'scale_projection';
  hashAlgorithm: 'sha256';
  sourceStateHash: string;
  projectedStateHash: string;
  targetScaleId: string;
}
export interface ScaleBridgeProjection<TState extends ScaleBridgeJson = ScaleBridgeJson> {
  schema: ScaleBridgeProjectionSchema;
  targetScale: ScaleDescriptor;
  state: TState;
  provenance: {
    edge: ScaleBridgeProvenanceEdge;
    carriedReceipts: ScaleBridgeJson[];
  };
}
export class ScaleBridge {
  static project(sourceState: unknown, scaleDescriptor: ScaleDescriptor): ScaleBridgeProjection;
  static hashState(state: unknown): string;
}
export function canonicalizeScaleBridgeJson(value: unknown): string;

// ============================================================================
// PARSERS
// ============================================================================

export interface HSPlusParserOptions {
  sourceMap?: boolean;
  strict?: boolean;
  enableTypeScriptImports?: boolean;
  enableVRTraits?: boolean;
}
export class HoloScriptPlusParser {
  constructor(options?: HSPlusParserOptions);
  parse(source: string): HSPlusParseResult;
  parseExpression(source: string): any;
  parseStatement(source: string): any;
}
export interface AgentBrainSourceHeader {
  brainName: string;
  version?: string;
  targets: string[];
}
export interface PreparedAgentBrainSource {
  header: AgentBrainSourceHeader;
  source: string;
  locationMap: Array<{ authoredLine: number; columnOffset: number }>;
}
export function preprocessAgentBrainSource(source: string): PreparedAgentBrainSource;

export interface ParseCacheStats {
  size: number;
  evictions: number;
  maxEntries: number;
}

export interface ParseCache {
  get(id: string, currentHash: string): any | null;
  set(id: string, hash: string, node: any): void;
  clear(): void;
  getStats(): ParseCacheStats;
}

export const globalParseCache: ParseCache;

export interface IncrementalParseResult {
  ast: any;
  cached: number;
  parsed: number;
  duration: number;
  changedChunks: string[];
}

export class ChunkBasedIncrementalParser {
  constructor(cache?: ParseCache);
  parse(source: string): IncrementalParseResult;
  clearCache(): void;
  getCacheStats(): ParseCacheStats;
}

export class HSPlusRuntime {
  constructor(options?: any);
  mount(container: any): void;
  unmount(): void;
  update(delta: number): void;
  setState(updates: Record<string, any>): void;
  getState(): Record<string, any>;
  on(event: string, handler: (payload: any) => void): () => void;
  emit(event: string, payload?: any): void;
}

export class World {
  constructor();
  createEntity(): string;
  removeEntity(id: string): void;
}

export class ComponentRegistry {
  static register(name: string, component: any): void;
}

export class HoloCompositionParser {
  parse(source: string): any;
}

export type CanonicalSourceSurface = 'holo' | 'hsplus' | 'hs';
export type CanonicalValidator = 'holo-parser' | 'typescript-hsplus' | 'rust-wasm';
export interface CanonicalDiagnostic {
  severity: 'error' | 'warning';
  message: string;
  line?: number;
  column?: number;
  code?: string;
  suggestion?: string;
}
export interface CanonicalSourceValidationRequest {
  source: string;
  fileName?: string;
  surface?: CanonicalSourceSurface | '.holo' | '.hsplus' | '.hs';
}
export type CanonicalHsDetailedValidator = (source: string) => string | unknown;
export interface CanonicalSourceValidationDependencies {
  validateHsDetailed?: CanonicalHsDetailedValidator;
}
export interface CanonicalSourceValidationResult {
  valid: boolean;
  surface: CanonicalSourceSurface;
  validator: CanonicalValidator;
  errors: CanonicalDiagnostic[];
  warnings: CanonicalDiagnostic[];
  ast?: unknown;
  preprocessedAgentBrain?: boolean;
  agentBrainHeader?: {
    brainName: string;
    version?: string;
    targets: string[];
  };
}
export function resolveCanonicalSourceSurface(request: {
  fileName?: string;
  surface?: CanonicalSourceSurface | '.holo' | '.hsplus' | '.hs';
}): CanonicalSourceSurface;
export function validateCanonicalSource(
  request: CanonicalSourceValidationRequest,
  dependencies?: CanonicalSourceValidationDependencies
): CanonicalSourceValidationResult;

export class HoloScriptCodeParser {
  parse(source: string): ParseResult;
  parseExpression(source: string): any;
  parseBlock(source: string): any[];
  getErrors(): any[];
}

export function parse(source: string, options?: any): ParseResult;
export function parseHolo(source: string, options?: any): any;
export function parseHoloStrict(source: string): any;
export function parseHoloScriptPlus(
  source: string,
  options?: HSPlusParserOptions
): HSPlusParseResult;
export const holoFactory: any;
export function generateHoloSource(ast: any): string;

// uAAL cognitive front-end bridge (G3): HoloComposition behavior -> UAAL bytecode.
export class UaalBehaviorCompiler {
  compile(
    composition: any,
    options?: {
      sourceSurface?: '.holo' | '.hsplus';
      entryPoints?: string[];
    }
  ): {
    bytecode: { version: number; instructions: Array<{ opCode: number; operands?: any[] }> };
    stats: {
      actions: number;
      handlers: number;
      statements: number;
      instructions: number;
      executeCalls: number;
      branches: number;
      unhandled: Record<string, number>;
      compilationMs: number;
    };
    semanticClosure: any;
  };
}
export interface UaalBehaviorStateReference {
  abi: 'holo.behavior.state-ref.v1';
  key: string;
}
export function resolveUaalBehaviorOperand(
  operand: any,
  context: Readonly<Record<string, any>>
): any;

// ============================================================================
// COMPOSITION TYPES (from .holo files)
// ============================================================================

export interface HoloComposition extends ASTNode {
  type: 'Composition';
  name: string;
  environment?: any;
  state?: any;
  templates: any[];
  objects: any[];
  spatialGroups: any[];
  lights: any[];
  effects?: any;
  camera?: any;
  logic?: any;
  imports: any[];
  timelines: any[];
  audio: any[];
  zones: any[];
  ui?: any;
  transitions: any[];
  conditionals: any[];
  iterators: any[];
  [key: string]: any;
}

export interface HoloEnvironment extends ASTNode {
  type: 'Environment';
  properties: any[];
}

export interface HoloState extends ASTNode {
  type: 'State';
  properties: any[];
}

export interface HoloTemplate extends ASTNode {
  type: 'Template';
  name: string;
  properties: any[];
}

export interface HoloObjectDecl extends ASTNode {
  type: 'Object';
  name: string;
  traits: any[];
  properties: any[];
}

export interface HoloObjectTrait extends ASTNode {
  type: 'Trait';
  name: string;
  config?: any;
  args?: any[];
  platformConstraint?: PlatformConstraint;
}

export interface HoloSpatialGroup extends ASTNode {
  type: 'SpatialGroup';
  name: string;
  objects: HoloObjectDecl[];
}

export interface HoloLight extends ASTNode {
  type: 'Light';
}

export interface HoloLogic extends ASTNode {
  type: 'Logic';
}

export interface HoloEventHandler extends ASTNode {
  event: string;
  [key: string]: any;
}

export interface HoloAction extends ASTNode {
  name: string;
  [key: string]: any;
}

export interface HoloStatement extends ASTNode {
  [key: string]: any;
}

export interface HoloParseResult {
  success: boolean;
  ast?: HoloComposition;
  errors: any[];
  warnings: any[];
}

export type HoloContainmentPerceptionErrorCode =
  | 'invalid-source'
  | 'unsupported-import'
  | 'unsupported-template'
  | 'unsupported-dynamic-containment'
  | 'unsupported-platform-constraint'
  | 'duplicate-semantic-id'
  | 'invalid-semantic-property'
  | 'conflicting-semantic-property'
  | 'unknown-query-entity';

export class HoloContainmentPerceptionError extends Error {
  readonly code: HoloContainmentPerceptionErrorCode;
  constructor(code: HoloContainmentPerceptionErrorCode, message: string);
}

export interface HoloContainmentPerceptionOptions {
  sourceId?: string;
  query?: UAALContainmentQuery;
}

export interface HoloContainmentSourceRef {
  format: '.holo';
  parser: 'HoloCompositionParser';
  composition: string;
  sourceDigest: string;
  sourceId?: string;
  path: string;
  line?: number;
  column?: number;
}

export interface HoloContainmentPerceptionMetadata {
  format: '.holo';
  parser: 'HoloCompositionParser';
  composition: string;
  sourceDigest: string;
  sourceId?: string;
}

export type HoloPerceivedSemanticEntity = UAALSemanticEntity & {
  source: HoloContainmentSourceRef;
};

export type HoloPerceivedContainmentRelation = UAALContainmentRelation & {
  source: HoloContainmentSourceRef;
};

export type HoloPerceivedContainmentIR = UAALContainmentIR & {
  entities: HoloPerceivedSemanticEntity[];
  containment: HoloPerceivedContainmentRelation[];
  perception: HoloContainmentPerceptionMetadata;
};

export function perceiveContainmentIR(
  source: string,
  options?: HoloContainmentPerceptionOptions
): HoloPerceivedContainmentIR;

export type HSPlusStructMeaningLoweringErrorCode =
  | 'invalid-source'
  | 'invalid-struct'
  | 'duplicate-struct';

export class HSPlusStructMeaningLoweringError extends Error {
  readonly code: HSPlusStructMeaningLoweringErrorCode;
  constructor(code: HSPlusStructMeaningLoweringErrorCode, message: string);
}

export interface HSPlusStructMeaningLoweringOptions {
  sourceId?: string;
}

export interface HSPlusUnknownStructSource {
  line?: number;
  column?: number;
}

export interface HSPlusUnknownStructMeaning {
  name: string;
  unknownFields: UnknownFieldLowering[];
  source: HSPlusUnknownStructSource;
}

export interface HSPlusUnknownStructMeaningProjection {
  schema: 'holoscript.hsplus-unknown-struct-meaning.v1';
  format: '.hsplus';
  parser: 'HoloScriptPlusParser';
  sourceDigest: string;
  sourceId?: string;
  structs: HSPlusUnknownStructMeaning[];
}

export function lowerHSPlusUnknownStructsToMeaning(
  source: string,
  options?: HSPlusStructMeaningLoweringOptions
): HSPlusUnknownStructMeaningProjection;

// ============================================================================
// TRAIT VISUAL SYSTEM
// ============================================================================

export class TraitCompositor {
  compose(traits: any[], material: any): any;
  [key: string]: any;
}

export interface TraitVisualConfig {
  [key: string]: any;
}

export interface R3FMaterialProps {
  [key: string]: any;
}

export type AssetMaturity = 'draft' | 'mesh' | 'final';

export interface R3FNode {
  type: string;
  id?: string;
  props: Record<string, any>;
  children?: R3FNode[];
  traits?: Map<string, any>;
  directives?: any[];
  assetMaturity?: AssetMaturity;
  [key: string]: any;
}

export interface VisualLayer {
  [key: string]: any;
}

export const VISUAL_LAYER_PRIORITY: Record<string, number>;
export const MATERIAL_PRESETS: Record<string, any>;
export const ENVIRONMENT_PRESETS: Record<string, any>;

// ============================================================================
// MATERIAL SYSTEM
// ============================================================================

export interface MaterialConfig {
  [key: string]: any;
}

export interface PBRMaterial {
  [key: string]: any;
}

export type MaterialType = string;
export type TextureChannel = string;

export type HoloMaterialType = 'material' | 'pbr_material' | 'unlit_material' | 'shader' | 'toon_material' | 'glass_material' | 'subsurface_material' | string;

export interface TextureMapDef {
  channel: TextureChannel;
  source: string;
  tiling?: [number, number];
  filtering?: 'nearest' | 'linear' | 'trilinear';
  strength?: number;
  intensity?: number;
  scale?: number;
  format?: string;
  channelSelect?: 'r' | 'g' | 'b' | 'a';
}

export interface ShaderPassDef {
  name?: string;
  vertex?: string;
  fragment?: string;
  blend?: string;
  properties?: Record<string, unknown>;
}

export interface MaterialDefinition {
  type: HoloMaterialType;
  name: string;
  traits: string[];
  baseColor?: string | number[];
  roughness?: number;
  metallic?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  IOR?: number;
  transmission?: number;
  thickness?: number;
  doubleSided?: boolean;
  textureMaps: TextureMapDef[];
  shaderPasses: ShaderPassDef[];
  shaderConnections: Array<{ output: string; input: string }>;
  properties: Record<string, unknown>;
  [key: string]: any;
}

export interface CompositionMaterialNode {
  type: string;
  name: string;
  traits?: Array<{ name: string; arguments?: unknown[] }>;
  properties?: Record<string, unknown>;
  textureMaps?: Array<{ channel: string; source?: string; properties?: Record<string, unknown> }>;
  shaderPasses?: Array<{ name?: string; properties?: Record<string, unknown> }>;
  shaderConnections?: Array<{ output: string; input: string }>;
  children?: CompositionMaterialNode[];
}

export class HoloScriptMaterialParser {
  static parseAll(rootNode: ASTNode): MaterialDefinition[];
  static parseFromComposition(nodes: CompositionMaterialNode[]): MaterialDefinition[];
  static parse(node: ASTNode): MaterialDefinition;
  static parseJSON(json: Record<string, unknown>): MaterialDefinition;
}

export interface TextureMap {
  [key: string]: any;
}

export class MaterialTrait {
  constructor(config: any);
  toR3F(): Record<string, any>;
  [key: string]: any;
}
export function createMaterialTrait(config: any): MaterialTrait;

export class LightingTrait {
  constructor(config: any);
  [key: string]: any;
}
export function createLightingTrait(config: any): LightingTrait;
export const LIGHTING_PRESETS: Record<string, any>;

export class RenderingTrait {
  constructor(config: any);
  [key: string]: any;
}
export function createRenderingTrait(config: any): RenderingTrait;

// ============================================================================
// SHADER SYSTEM
// ============================================================================

export type ShaderType = 'vertex' | 'fragment' | 'compute';
export type UniformType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat3' | 'mat4' | 'sampler2D' | 'int' | 'bool';

export interface UniformDefinition {
  type: UniformType;
  value: any;
  [key: string]: any;
}

export interface ShaderConfig {
  vertexShader?: string;
  fragmentShader?: string;
  uniforms?: Record<string, UniformDefinition>;
  transparent?: boolean;
  depthTest?: boolean;
  depthWrite?: boolean;
  side?: number;
  [key: string]: any;
}

export class ShaderTrait {
  constructor(config: any);
  toThreeJSConfig(): ShaderConfig;
  [key: string]: any;
}
export function createShaderTrait(config: any): ShaderTrait;
export const SHADER_PRESETS: Record<string, any>;
export const SHADER_CHUNKS: Record<string, string>;

// ============================================================================
// PROCEDURAL GEOMETRY
// ============================================================================

export interface GeometryData {
  vertices: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  uvs?: Float32Array;
}

export interface BlobDef {
  center: [number, number, number];
  radius: number;
  strength?: number;
}

export function generateSplineGeometry(
  points: Array<[number, number, number]>,
  radius?: number,
  segments?: number,
  radialSegments?: number
): GeometryData;

export function generateHullGeometry(
  blobs: BlobDef[],
  resolution?: number,
  isoLevel?: number
): GeometryData;

export function generateMembraneGeometry(
  profiles: Array<Array<[number, number, number]>>,
  segments?: number
): GeometryData;

// ============================================================================
// GLTF PIPELINE
// ============================================================================

export interface GLTFPipelineOptions {
  format?: 'glb' | 'gltf';
  dracoCompression?: boolean;
  quantize?: boolean;
  prune?: boolean;
  dedupe?: boolean;
  embedTextures?: boolean;
  generator?: string;
  copyright?: string;
}

export interface GLTFExportResult {
  binary?: Uint8Array;
  json?: object;
  buffer?: Uint8Array;
  stats: GLTFExportStats;
}

export interface GLTFExportStats {
  meshCount: number;
  materialCount: number;
  textureCount: number;
  animationCount: number;
  fileSize: number;
  [key: string]: any;
}

export class GLTFPipeline {
  constructor(options?: GLTFPipelineOptions);
  export(composition: any): Promise<GLTFExportResult>;
  [key: string]: any;
}
export function createGLTFPipeline(options?: GLTFPipelineOptions): GLTFPipeline;

/** Generate hexagonal scale texture (RGBA Uint8Array) */
export function generateScaleTexture(size: number, baseColor?: [number, number, number]): Uint8Array;
/** Generate tangent-space normal map for hexagonal scales (RGBA Uint8Array) */
export function generateScaleNormalMap(size: number): Uint8Array;

// ============================================================================
// COMPRESSION & SPLATTING
// ============================================================================

export interface CompressionOptions {
  method?: 'lz4' | 'zstd' | 'brotli';
  level?: number;
  [key: string]: any;
}

export class AdvancedCompression {
  constructor(options?: any);
  static compressBuffer(buffer: ArrayBuffer | Uint8Array, options?: CompressionOptions): Promise<Uint8Array>;
  static decompressBuffer(buffer: Uint8Array, method?: string): Promise<ArrayBuffer>;
  [key: string]: any;
}

export interface INeuralSplatPacket {
  frameId: number;
  cameraState: {
    viewProjectionMatrix: number[];
    cameraPosition: number[];
  };
  splatCount: number;
  compressedSplatsBuffer: ArrayBuffer;
  sortedIndicesBuffer: ArrayBuffer;
}

// ============================================================================
// USDZ PIPELINE (USDA/USDZ Export)
// ============================================================================

export interface USDZPipelineOptions {
  upAxis?: 'Y' | 'Z';
  metersPerUnit?: number;
  includeAnimations?: boolean;
  exportMaterials?: boolean;
  defaultMaterial?: string;
  textureData?: Record<string, Uint8Array>;
}

export interface USDMaterial {
  name: string;
  baseColor?: [number, number, number];
  metallic?: number;
  roughness?: number;
  emissiveColor?: [number, number, number];
  emissiveIntensity?: number;
  opacity?: number;
  ior?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  transmission?: number;
  thickness?: number;
  attenuationColor?: [number, number, number];
  attenuationDistance?: number;
  sheen?: number;
  sheenRoughness?: number;
  sheenColor?: [number, number, number];
  iridescence?: number;
  iridescenceIOR?: number;
  anisotropy?: number;
  anisotropyRotation?: number;
  textureMaps?: Record<string, string>;
}

export interface USDGeometry {
  type: 'sphere' | 'cube' | 'cylinder' | 'cone' | 'plane' | 'mesh';
  radius?: number;
  size?: [number, number, number];
  height?: number;
  points?: number[][];
  faceVertexCounts?: number[];
  faceVertexIndices?: number[];
}

export interface USDXform {
  name: string;
  translation?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
  geometry?: USDGeometry;
  material?: string;
  children?: USDXform[];
}

export interface USDADocument {
  header: string;
  stage: string;
  materials: string;
  prims: string;
}

export class USDZPipeline {
  constructor(options?: USDZPipelineOptions);
  generateUSDA(composition: HoloComposition): string;
  generateUSDZ(composition: HoloComposition): Uint8Array;
}

export function generateUSDA(composition: HoloComposition, options?: USDZPipelineOptions): string;
export function generateUSDZ(composition: HoloComposition, options?: USDZPipelineOptions): Uint8Array;
export function getUSDZConversionCommand(usdaPath: string, usdzPath: string): string;
export function getPythonConversionScript(usdaPath: string, usdzPath: string): string;

// ============================================================================
// USD PHYSICS COMPILER (Isaac Sim / Omniverse)
// ============================================================================

export interface USDPhysicsCompilerOptions {
  stageName?: string;
  upAxis?: 'Y' | 'Z';
  metersPerUnit?: number;
  timeCodesPerSecond?: number;
  includePhysicsScene?: boolean;
  gravity?: [number, number, number];
  physicsTimestep?: number;
  enableGPUDynamics?: boolean;
  includeCollision?: boolean;
  includeVisual?: boolean;
  defaultMass?: number;
  defaultStaticFriction?: number;
  defaultDynamicFriction?: number;
  defaultRestitution?: number;
  enableArticulation?: boolean;
}

export class USDPhysicsCompiler {
  constructor(options?: USDPhysicsCompilerOptions);
  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string;
}

export function compileToUSDPhysics(composition: HoloComposition, options?: USDPhysicsCompilerOptions): string;
export function compileForIsaacSim(composition: HoloComposition, options?: Partial<USDPhysicsCompilerOptions>): string;

// ============================================================================
// ============================================================================
// REACTIVE STATE & EVENTS
// ============================================================================

export class ExpressionEvaluator {
  constructor(context?: Record<string, unknown>, builtins?: Record<string, unknown>);
  evaluate(expression: string, context?: any): any;
  extractVariables(expression: string): string[];
  updateContext(updates: Record<string, unknown>): void;
}

export class EventBus {
  constructor();
  on(event: string, callback: (data: unknown) => void, priority?: number): number;
  once(event: string, callback: (data: unknown) => void, priority?: number): number;
  off(listenerId: number): void;
  offAll(event: string): void;
  emit(event: string, data?: unknown): void;
  getHistory(): Array<{ event: string; data: unknown; timestamp: number }>;
  listenerCount(event: string): number;
  setPaused(paused: boolean): void;
  clear(): void;
}
export const eventBus: EventBus;
export function getSharedEventBus(): EventBus;
export function setSharedEventBus(bus: EventBus): void;

// COMPILERS & GENERATORS
// ============================================================================

export interface BaseCompilerOptions {
  generateDocs?: boolean;
  docsOptions?: any;
  [key: string]: any;
}

export class CompilerBase {
  protected compilerName: string;
  validateCompilerAccess(agentToken: string, outputPath?: string): void;
  generateDocumentation(composition: any, code: string, options?: any): any;
  compile(composition: any, agentToken: string, outputPath?: string, options?: BaseCompilerOptions): any;
  [key: string]: any;
}

export class SemanticSceneGraph {
  static generate(composition: any, options?: any): string;
  static generateObject(composition: any, options?: any): any;
  [key: string]: any;
}

export class HoloScriptCompiler {
  compile(ast: any, target: string): any;
}

export interface SceneIRCompilerOptions {
  qualityTier?: 'low' | 'med' | 'high' | 'ultra';
  defaultLighting?: boolean;
  holomapPointCloud?: any;
  platformTarget?: any;
}

export class SceneIRCompiler {
  constructor(options?: SceneIRCompilerOptions);
  compile(ast: any): any;
  compileComposition(composition: any): R3FNode;
  [key: string]: any;
}

export interface SceneIRTsxEmitterOptions {
  componentName?: string;
  sourcePath?: string;
  includeCanvas?: boolean;
}

export function emitSceneIRTsx(root: R3FNode, options?: SceneIRTsxEmitterOptions): string;

export interface CompilationResult {
  success: boolean;
  sceneIR?: unknown;
  error?: string;
  metadata?: {
    zones: number;
    entities: number;
    handlers: number;
    duration: number;
  };
}

export class CompilerBridge {
  compile(holoScript: string): Promise<CompilationResult>;
  validate(holoScript: string): Promise<{ valid: boolean; errors: string[] }>;
  getMetrics(holoScript: string): { lines: number; characters: number; estimatedZones: number; estimatedComplexity: 'simple' | 'moderate' | 'complex' };
}

export function getCompilerBridge(): CompilerBridge;

export interface TraitCompositionDecl {
  name: string;
  components: string[];
  overrides?: Record<string, unknown>;
}

export interface ComposedTraitDef {
  name: string;
  components: string[];
  defaultConfig: Record<string, unknown>;
}

export interface ComponentTraitHandler {
  defaultConfig?: Record<string, unknown>;
  conflicts?: string[];
}

export class TraitDependencyGraph {
  constructor(options?: any);
  registerTrait(name: string, handler: any): void;
  [key: string]: any;
}

export class TraitCompositionCompiler {
  constructor(inheritanceResolver?: any);
  setInheritanceResolver(resolver: any): void;
  compile(decls: TraitCompositionDecl[], getHandler: (name: string) => ComponentTraitHandler | undefined, traitGraph?: any, agentToken?: string): ComposedTraitDef[];
}

// ============================================================================
// RUNTIME & EXECUTION
// ============================================================================

export type HoloValue = any;
export interface HoloTemplate {
  type: string;
  id: string;
  [key: string]: any;
}
export interface HSPlusForDirective {
  type: 'for';
  variable: string;
  range?: [number, number];
  iterable?: string;
  body: unknown[];
}
export interface RaycastHit {
  point: Vector3;
  normal: Vector3;
  distance: number;
  bodyId: string;
  [key: string]: any;
}

export class HoloScriptRuntime {
  constructor(importLoader?: any, customFunctions?: any);
  execute(ast: any, context?: any): Promise<any>;
  executeProgram(nodes: any[], depth?: number): Promise<any[]>;
  executeHoloProgram(statements: any[], scopeOverride?: any): Promise<any[]>;
  getContext(): any;
  reset(): void;
  startVisualizationServer(port?: number): void;
  broadcast(type: string, payload: unknown): void;
  on(event: string, handler: (...args: any[]) => any): void;
  off(event: string, handler?: (...args: any[]) => any): void;
  emit(event: string, data?: unknown): Promise<void>;
  setVariable(name: string, value: any, scopeOverride?: any): void;
  getVariable(name: string, scopeOverride?: any): any;
  callFunction(name: string, args?: any[]): Promise<any>;
  registerFunction(name: string, handler: (...args: any[]) => any): void;
  registerTrait(name: string, handler: any): void;
  getState(): Record<string, any>;
  getRootScope(): any;
  getExecutionHistory(): any[];
  getCallStack(): string[];
  [key: string]: any;
}

export interface RuntimeOptions {
  [key: string]: any;
}

export interface Renderer {
  [key: string]: any;
}

export interface NodeInstance {
  [key: string]: any;
}

export type HoloScriptValue = string | number | boolean | null | HoloScriptValue[] | { [key: string]: HoloScriptValue };

export interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  duration?: number;
  memoryUsed?: number;
  executionTime?: number;
  hologram?: { shape?: string; color?: string; [key: string]: any };
  spatialPosition?: { x: number; y: number; z: number; [key: string]: any };
  output?: any;
}

export interface SpatialPosition {
  x: number;
  y: number;
  z: number;
  rotation?: { x: number; y: number; z: number; w?: number };
  scale?: { x: number; y: number; z: number };
}

export interface HSPlusAST {
  type: 'Program';
  body: any[];
  version: string | number;
  root: any;
  imports: Array<{ path: string; alias: string; namedImports?: string[]; isWildcard?: boolean }>;
  hasState: boolean;
  hasVRTraits: boolean;
  hasControlFlow: boolean;
  migrations?: any[];
  nodes?: HSPlusASTNode[];
  metadata?: Record<string, any>;
}

export interface OrbNode extends ASTNode {
  type: 'Orb';
  name: string;
  properties: Record<string, any>;
  traits?: string[];
}

export class HoloScriptPlusRuntimeImpl {
  constructor(options?: RuntimeOptions);
  execute(ast: any, context?: any): Promise<ExecutionResult>;
  createRenderer(config?: any): Renderer;
  getState(): Record<string, any>;
  setState(updates: Record<string, any>): void;
  dispose(): void;
}

export function createRuntime(options?: RuntimeOptions): HoloScriptPlusRuntimeImpl;

// ============================================================================
// TYPE CHECKING
// ============================================================================

export class HoloScriptTypeChecker {
  check(ast: any): any;
  getType(node: any): any;
}

export interface ValidationError {
  message: string;
  loc?: any;
}

// ============================================================================
// ERROR HANDLING & DIAGNOSTICS
// ============================================================================

export interface RichParseError {
  message: string;
  loc?: any;
  code?: string;
  suggestion?: string;
  severity?: 'error' | 'warning';
}

export const HSPLUS_ERROR_CODES: Record<string, string>;

export function createRichError(message: string, code?: string): RichParseError;
export function createTraitError(traitName: string): RichParseError;
export function createKeywordError(keyword: string): RichParseError;
export function findSimilarTrait(partialName: string): string | null;
export function findSimilarKeyword(partialName: string): string | null;
export function getSourceContext(source: string, location: any): string;
export function formatRichError(error: RichParseError): string;
export function formatRichErrors(errors: RichParseError[]): string;
export function getErrorCodeDocumentation(code: string): string;

// ============================================================================
// DEBUGGER
// ============================================================================

export class HoloScriptDebugger {
  debug(ast: any): any;
  on(event: string, callback: any): void;
  start(): void;
  stop(): void;
  loadSource(source: string, path?: string): { success: boolean; errors?: string[] };
  clearBreakpoints(): void;
  setBreakpoint(line: number, options?: Partial<Breakpoint>): any;
  continue(): void;
  stepOver(): void;
  stepInto(): void;
  stepOut(): void;
  pause(): void;
  getCallStack(): any[];
  getState(): any;
  getRuntime(): any;
  evaluate(expression: string, frameId?: number): any;
  getVariables(frameId?: number): any;
}

// ============================================================================
// SAFETY & EFFECTS
// ============================================================================

export interface EffectASTNode {
  [key: string]: any;
}

export interface SafetyReport {
  [key: string]: any;
}

export type SafetyVerdict = 'safe' | 'warnings' | 'unsafe' | 'unchecked';
export type VREffect = string;
export type EffectCategory = string;
export type EffectViolationSeverity = 'error' | 'warning' | 'info';
export interface EffectViolation { effect: VREffect; severity: EffectViolationSeverity; [key: string]: any; }
export interface EffectDeclaration { effects: VREffect[]; [key: string]: any; }

// ============================================================================
// PLATFORM TYPES
// ============================================================================

export type XRPlatformTarget = string;
export type XRPlatformCategory = string;

export interface XRPlatformCapabilities {
  [key: string]: any;
}

// ============================================================================
// LSP & SAFETY TYPES
// ============================================================================

export interface StackFrame {
  id: number;
  name: string;
  file?: string;
  line: number;
  column: number;
  variables: Map<string, unknown>;
  node: any;
}

export interface Breakpoint {
  id: string;
  line: number;
  column?: number;
  condition?: string;
  hitCount: number;
  enabled: boolean;
  file?: string;
}

export interface SafetyPassConfig { [key: string]: any; }
export interface SafetyPassResult { [key: string]: any; }
export interface EffectViolation { [key: string]: any; }
export interface BudgetDiagnostic { [key: string]: any; }
export interface CapabilityRequirement { [key: string]: any; }
export interface LinearViolation { [key: string]: any; }
export type HSPlusStructField =
  | {
      name: string;
      projection: 'typed';
      type: string;
      annotations?: string[];
      optional?: true;
      defaultSource?: string;
    }
  | {
      name: string;
      projection: 'preserved-opaque';
      optional?: true;
      type?: never;
      annotations?: never;
      defaultSource?: never;
    };
export interface ASTProgram {
  type: 'Program';
  children: HSPlusNode[];
  body: HSPlusNode[];
  version: string | number;
  root: HSPlusNode;
  imports: Array<{
    path: string;
    alias: string;
    namedImports?: string[];
    isWildcard?: boolean;
  }>;
  hasState: boolean;
  hasVRTraits: boolean;
  hasControlFlow: boolean;
  migrations?: unknown[];
  [key: string]: unknown;
}
export type HSPlusASTNode = HSPlusNode;
export interface HSPlusCompileResult {
  success: boolean;
  code?: string;
  sourceMap?: unknown;
  errors: Array<{ message: string; line: number; column: number }>;
  ast?: ASTProgram;
  compiledExpressions?: unknown;
  requiredCompanions?: string[];
  features?: unknown;
  warnings?: unknown[];
  [key: string]: unknown;
}
export interface HSPlusParseResult extends HSPlusCompileResult {
  ast: ASTProgram;
}

export function runSafetyPass(ast: any, config?: SafetyPassConfig): SafetyPassResult;

export class HoloScriptValidator {
  validate(ast: any): ValidationError[];
}

export function createTypeChecker(): HoloScriptTypeChecker;

export interface AIAdapter { [key: string]: any; }
export function getDefaultAIAdapter(): AIAdapter;
export function useGemini(config?: any): AIAdapter;
export function useOllama(config?: any): AIAdapter;
export class SemanticSearchService<T = any> { 
  constructor(adapter: AIAdapter, items: T[]);
  initialize(): Promise<void>;
  search(query: string, limit?: number): Promise<any[]>;
}

// ============================================================================
// VR TRAIT SYSTEM TYPES
// ============================================================================

// Vector3 is a tuple in source (packages/core/src/types/HoloScriptPlus.ts:10).
// Emitting as {x,y,z} interface here in 2026-04-22..04-25 produced hundreds
// of engine-package TS errors like "Type 'number[]' is missing properties
// x,y,z from Vector3" because consumer code correctly uses tuple-form
// (engine/src/animation/IKSolver.ts:139, etc). Restoring tuple form here
// lets pre-flight pass; for {x,y,z} object shape use three.Vector3 directly.
export type Vector3 = [number, number, number];

export interface VRHand {
  id: string;
  position: Vector3;
  rotation: Quaternion;
  velocity: Vector3;
  joints?: Map<string, { position: Vector3; rotation: Vector3 }>;
  pinch?: number;
  pinchStrength?: number;
  grip: number;
  gripStrength?: number;
  trigger: number;
  pointing?: boolean;
}

export interface VRContext {
  hands: { left: VRHand | null; right: VRHand | null };
  headset: { position: Vector3; rotation: Vector3 };
  getPointerRay(hand: 'left' | 'right'): { origin: Vector3; direction: Vector3 } | null;
  getDominantHand(): VRHand | null;
}

export interface PhysicsContext {
  applyVelocity(node: HSPlusNode, velocity: Vector3): void;
  applyAngularVelocity(node: HSPlusNode, angularVelocity: Vector3): void;
  setKinematic(node: HSPlusNode, kinematic: boolean): void;
  raycast(origin: Vector3, direction: Vector3, maxDistance: number): RaycastHit | null;
  getBodyPosition(nodeId: string): Vector3 | null;
  getBodyVelocity(nodeId: string): Vector3 | null;
}

export interface AudioContext {
  playSound(source: string, options?: { position?: Vector3; volume?: number; spatial?: boolean }): void;
  updateSpatialSource?(nodeId: string, options: Record<string, any>): void;
  registerAmbisonicSource?(nodeId: string, order: number): void;
  setAudioPortal?(portalId: string, targetZone: string, openingSize: number): void;
  updateAudioMaterial?(nodeId: string, absorption: number, reflection: number): void;
}

export interface HapticsContext {
  pulse(hand: 'left' | 'right', intensity: number, duration?: number): void;
  rumble(hand: 'left' | 'right', intensity: number): void;
}

export interface AccessibilityContext {
  announce(text: string): void;
  setScreenReaderFocus(nodeId: string): void;
  setAltText(nodeId: string, text: string): void;
  setHighContrast(enabled: boolean): void;
}

export type ARTrackingState = 'not_available' | 'limited' | 'normal' | 'lost';

export interface ARSessionPose {
  anchorId?: string;
  target?: string;
  position: Vector3;
  rotation?: Vector3;
  confidence?: number;
  timestampMs?: number;
  trackingState?: ARTrackingState;
  source?: string;
}

export interface ARSessionContext {
  readonly available: boolean;
  getPose(nodeId?: string): ARSessionPose | null;
  getAnchor?(anchorId: string): ARSessionPose | null;
}

export interface TraitContext {
  vr: VRContext;
  physics: PhysicsContext;
  audio: AudioContext;
  haptics: HapticsContext;
  accessibility?: AccessibilityContext;
  arSession?: ARSessionContext;
  emit(event: string, payload?: unknown): void;
  getState(): Record<string, unknown>;
  setState(updates: Record<string, unknown>): void;
  getScaleMultiplier(): number;
  setScaleContext(magnitude: string): void;
}

export type TraitEvent =
  | { type: 'xr:grab'; hand: 'left' | 'right'; [key: string]: any }
  | { type: 'xr:release'; hand: 'left' | 'right'; [key: string]: any }
  | { type: 'collision'; other: string; [key: string]: any }
  | { type: string; [key: string]: any };

export interface HSPlusNode extends ASTNode {
  id?: string;
  name?: string;
  nameOrigin?: 'explicit' | 'synthetic';
  traits?: Map<string, unknown>;
  children?: HSPlusNode[];
  body?: unknown;
  fields?: HSPlusStructField[];
  [key: string]: any;
}

export interface TraitBehavior {
  readonly traitId: string;
  readonly name: string;
  enabled: boolean;
  initialize?(): void | Promise<void>;
  update?(deltaTime: number): void;
  dispose?(): void | Promise<void>;
}

export class ProceduralSkill {
  id: string;
  name: string;
  category: string;
  description: string;
  constructor(config: { id: string; name: string; category: string; description: string });
  execute(input: unknown): unknown;
}

export type VRTraitName = string;

export class VRTraitRegistry {
  register(handler: TraitHandler): void;
  getHandler(name: VRTraitName): TraitHandler | undefined;
  attachTrait(node: HSPlusNode, traitName: VRTraitName, config: unknown, context: TraitContext): void;
  detachTrait(node: HSPlusNode, traitName: VRTraitName, context: TraitContext): void;
  updateAllTraits(node: HSPlusNode, context: TraitContext, delta: number): void;
  handleEventForAllTraits(node: HSPlusNode, context: TraitContext, event: TraitEvent): void;
}

export declare const vrTraitRegistry: VRTraitRegistry;

// ============================================================================
// TRAIT CONTEXT FACTORY (migrated from Hololand)
// ============================================================================

export interface PhysicsProvider {
  applyVelocity(nodeId: string, velocity: Vector3): void;
  applyAngularVelocity(nodeId: string, angularVelocity: Vector3): void;
  setKinematic(nodeId: string, kinematic: boolean): void;
  raycast(origin: Vector3, direction: Vector3, maxDistance: number): RaycastHit | null;
}

export interface AudioProvider {
  playSound(source: string, options?: { position?: Vector3; volume?: number; spatial?: boolean }): void;
  updateSpatialSource?(nodeId: string, options: Record<string, any>): void;
  registerAmbisonicSource?(nodeId: string, order: number): void;
  setAudioPortal?(portalId: string, targetZone: string, openingSize: number): void;
  updateAudioMaterial?(nodeId: string, absorption: number, reflection: number): void;
}

export interface HapticsProvider {
  pulse(hand: 'left' | 'right', intensity: number, duration?: number): void;
  rumble(hand: 'left' | 'right', intensity: number): void;
}

export interface AccessibilityProvider {
  announce(text: string): void;
  setScreenReaderFocus(nodeId: string): void;
  setAltText(nodeId: string, text: string): void;
  setHighContrast(enabled: boolean): void;
}

export interface VRProvider {
  getLeftHand(): VRHand | null;
  getRightHand(): VRHand | null;
  getHeadsetPosition(): Vector3;
  getHeadsetRotation(): Vector3;
  getPointerRay(hand: 'left' | 'right'): { origin: Vector3; direction: Vector3 } | null;
  getDominantHand(): VRHand | null;
}

export interface NetworkProvider {
  broadcastState(nodeId: string, state: Record<string, unknown>): void;
  requestAuthority(nodeId: string): boolean;
  onRemoteUpdate(nodeId: string, callback: (state: Record<string, unknown>) => void): void;
}

export interface RendererProvider {
  createGaussianSplat(nodeId: string, config: Record<string, unknown>): void;
  createPointCloud(nodeId: string, config: Record<string, unknown>): void;
  dispatchCompute(nodeId: string, shader: string, workgroups: number[]): void;
  destroyRenderable(nodeId: string): void;
}

export interface TraitContextFactoryConfig {
  physics?: PhysicsProvider;
  audio?: AudioProvider;
  haptics?: HapticsProvider;
  accessibility?: AccessibilityProvider;
  vr?: VRProvider;
  network?: NetworkProvider;
  renderer?: RendererProvider;
}

export class TraitContextFactory {
  constructor(config?: TraitContextFactoryConfig);
  createContext(): TraitContext;
  setPhysicsProvider(provider: PhysicsProvider): void;
  setAudioProvider(provider: AudioProvider): void;
  setHapticsProvider(provider: HapticsProvider): void;
  setAccessibilityProvider(provider: AccessibilityProvider): void;
  setVRProvider(provider: VRProvider): void;
  setNetworkProvider(provider: NetworkProvider): void;
  setRendererProvider(provider: RendererProvider): void;
  getNetworkProvider(): NetworkProvider | undefined;
  getRendererProvider(): RendererProvider | undefined;
  on(event: string, handler: (payload: unknown) => void): void;
  off(event: string, handler: (payload: unknown) => void): void;
  dispose(): void;
}

export function createTraitContextFactory(config?: TraitContextFactoryConfig): TraitContextFactory;

// ============================================================================
// TRAIT RUNTIME INTEGRATION (migrated from Hololand)
// ============================================================================

export interface TrackedNode {
  node: HSPlusNode;
  traitNames: VRTraitName[];
}

export interface TraitRuntimeStats {
  trackedNodes: number;
  totalTraits: number;
  updatesPerSecond: number;
  lastUpdateMs: number;
}

export class TraitRuntimeIntegration {
  constructor(contextFactory: TraitContextFactory);
  registerNode(node: HSPlusNode): void;
  attachTraitsFromAST(nodes: HSPlusNode[]): void;
  attachTrait(nodeId: string, traitName: VRTraitName, config?: unknown): void;
  detachTrait(nodeId: string, traitName: VRTraitName): void;
  unregisterNode(nodeId: string): void;
  update(delta: number): void;
  dispatchEvent(nodeId: string, event: TraitEvent): void;
  broadcastEvent(event: TraitEvent): void;
  pause(): void;
  resume(): void;
  isPaused(): boolean;
  refreshContext(): void;
  getNode(nodeId: string): HSPlusNode | undefined;
  getNodeTraits(nodeId: string): VRTraitName[];
  getAllNodeIds(): string[];
  getStats(): TraitRuntimeStats;
  getRegistry(): VRTraitRegistry;
  getContext(): TraitContext;
  reset(): void;
  dispose(): void;
}

export function createTraitRuntime(contextFactory: TraitContextFactory): TraitRuntimeIntegration;

// ============================================================================
// HSPLUS VALIDATOR (migrated from Hololand)
// ============================================================================

export interface ParserValidationError {
  type: 'syntax' | 'semantic' | 'runtime' | 'device';
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
  recoverable: boolean;
}

export interface DeviceOptimizationContext {
  deviceId: string;
  gpuCapability: 'low' | 'medium' | 'high' | 'extreme';
  cpuCapability: 'low' | 'medium' | 'high' | 'extreme';
  targetFPS: number;
  maxGPUMemory: number;
  supportedShaderLevel: 'es2' | 'es3' | 'es31' | 'core';
}

export interface CodeGenerationOptions {
  includeMetadata?: boolean;
  optimizeForDevice?: DeviceOptimizationContext;
  generateImports?: boolean;
  strictMode?: boolean;
  validateDependencies?: boolean;
}

export interface ParserRegistrationResult {
  success: boolean;
  traitId?: string;
  error?: string;
  warnings?: string[];
  metadata?: {
    deviceOptimizations?: string[];
    estimatedMemory?: number;
    performanceImpact?: 'low' | 'medium' | 'high';
  };
}

export interface HSPlusValidationResult {
  valid: boolean;
  errors: ParserValidationError[];
  warnings: ParserValidationError[];
}

export function validateHSPlus(code: string): HSPlusValidationResult;

// ============================================================================
// HS KNOWLEDGE PARSER (migrated from Hololand)
// ============================================================================

export interface HSMeta {
  name: string;
  version: string;
  domain?: string;
  [key: string]: string | undefined;
}

export interface HSKnowledgeChunk {
  id: string;
  category: string;
  content: string;
  tags?: string[];
  [key: string]: any;
}

export interface HSPrompt {
  id: string;
  template: string;
  variables?: string[];
  [key: string]: any;
}

export interface HSRoute {
  method: string;
  path: string;
  handler: string;
  [key: string]: any;
}

export interface HSProvider {
  name: string;
  type: string;
  config?: Record<string, any>;
  [key: string]: any;
}

export interface HSParsedFile {
  meta: HSMeta;
  raw: string;
}

export interface HSKnowledgeFile extends HSParsedFile {
  chunks: HSKnowledgeChunk[];
}

export interface HSPromptFile extends HSParsedFile {
  prompts: HSPrompt[];
}

export interface HSServerFile extends HSParsedFile {
  routes: HSRoute[];
  providers: HSProvider[];
}

export function parseMeta(content: string): HSMeta;
export function parseKnowledge(raw: string): HSKnowledgeFile;
export function parsePrompts(raw: string): HSPromptFile;
export function parseServerRoutes(raw: string): HSServerFile;

// ============================================================================
// HOLOSCRIPT I/O (migrated from Hololand)
// ============================================================================

export interface CoreParseResult {
  success: boolean;
  program?: CoreProgram;
  errors: any[];
}

export interface CoreProgram {
  declarations: CoreDeclaration[];
  statements: CoreStatement[];
}

export interface CoreDeclaration { [key: string]: any; }
export interface CoreStatement { [key: string]: any; }

export interface CoreWorldDeclaration {
  type: 'WorldDeclaration';
  name: string;
  [key: string]: any;
}

export interface CoreOrbDeclaration {
  type: 'OrbDeclaration';
  name: string;
  properties: CoreOrbProperty[];
  [key: string]: any;
}

export interface CoreOrbProperty {
  key: string;
  value: CoreExpression;
}

export interface CoreExpression { [key: string]: any; }

export interface HoloScriptAST { nodes: HoloScriptASTNode[]; }
export interface HoloScriptASTNode { [key: string]: any; }
export interface HoloScriptASTLogic { [key: string]: any; }
export interface HoloScriptExportOptions { [key: string]: any; }
export interface HoloScriptImportOptions { [key: string]: any; }
export interface HoloScriptParseResult { success: boolean; [key: string]: any; }
export interface HoloScriptError { message: string; line?: number; [key: string]: any; }

export function initHoloScriptParser(): void;
export function parseWithCoreParser(source: string): CoreParseResult;
export function expressionToValue(expr: CoreExpression): any;
export function programToInternalAST(program: CoreProgram): HoloScriptAST;
export function extractWorldSettings(program: CoreProgram): Record<string, any>;
export function orbToASTNode(orb: CoreOrbDeclaration): HoloScriptASTNode;
export function parseHoloScriptSimplified(source: string): HoloScriptAST;
export function parseProperties(source: string): Record<string, any>;
export function parseValue(value: string): any;
export function escapeHoloString(str: string): string;
export function formatHoloValue(value: any): string;

// ============================================================================
// SMART ASSET SYSTEM
// ============================================================================

export interface AssetMetadata {
  id: string;
  name: string;
  type: string;
  format: string;
  size: number;
  hash?: string;
  tags?: string[];
  created?: string;
  modified?: string;
  [key: string]: any;
}

export interface AssetManifest {
  version: string;
  assets: AssetMetadata[];
  totalSize: number;
  [key: string]: any;
}

export interface SmartAssetLoader {
  load(id: string, options?: any): Promise<any>;
  preload(ids: string[]): Promise<void>;
  resolve(alias: string): string;
  getManifest(): AssetManifest;
  [key: string]: any;
}

export function getSmartAssetLoader(): SmartAssetLoader;
export function getAssetRegistry(): AssetRegistry;
export function createSmartAssetLoader(config?: any): SmartAssetLoader;
export function resolveAssetAlias(alias: string): string;
export declare const DEFAULT_ASSET_ALIASES: Record<string, string>;

// ============================================================================
// OPTIMIZATION
// ============================================================================

export interface OptimizationReport {
  passes: string[];
  savings: number;
  duration: number;
  before: { size: number; nodes: number };
  after: { size: number; nodes: number };
  [key: string]: any;
}

export interface OptimizationOptions {
  level?: 'none' | 'basic' | 'aggressive';
  passes?: string[];
  target?: string;
  [key: string]: any;
}

// ============================================================================
// GAUSSIAN CODEC
// ============================================================================

export interface GaussianSplatData {
  positions: Float32Array;
  colors: Float32Array;
  opacities: Float32Array;
  scales: Float32Array;
  rotations: Float32Array;
  count: number;
  [key: string]: any;
}

export interface CodecRegistry {
  register(name: string, codec: any): void;
  get(name: string): any;
  list(): string[];
  [key: string]: any;
}

export function getGlobalCodecRegistry(): CodecRegistry;

// ============================================================================
// AVATAR / NPC TRAIT SYSTEM
// ============================================================================

export interface LipSyncConfig {
  model?: string;
  sampleRate?: number;
  visemeMap?: Record<string, string>;
  smoothing?: number;
  [key: string]: any;
}

export type LipSyncEventType = 'viseme' | 'phoneme' | 'silence' | 'start' | 'end';

export interface LipSyncEvent {
  type: LipSyncEventType;
  viseme?: string;
  timestamp: number;
  duration?: number;
  weight?: number;
}

export interface VisemeTimestamp {
  viseme: string;
  start: number;
  end: number;
  weight: number;
}

export declare class LipSyncTrait {
  constructor(config?: LipSyncConfig);
  processAudio(audioData: any): LipSyncEvent[];
  getCurrentViseme(): string | null;
  getVisemeTimestamps(): VisemeTimestamp[];
  update(delta: number): void;
  reset(): void;
  [key: string]: any;
}

export interface EmotionDirectiveConfig {
  emotions?: string[];
  blendDuration?: number;
  intensityScale?: number;
  [key: string]: any;
}

export type EmotionDirectiveEventType = 'emotion_start' | 'emotion_end' | 'emotion_blend' | 'emotion_peak';

export interface EmotionDirectiveEvent {
  type: EmotionDirectiveEventType;
  emotion: string;
  intensity: number;
  timestamp: number;
  [key: string]: any;
}

export interface EmotionTaggedSegment {
  text: string;
  emotion: string;
  intensity: number;
  start: number;
  end: number;
}

export interface EmotionTaggedResponse {
  segments: EmotionTaggedSegment[];
  dominantEmotion: string;
  overallIntensity: number;
  [key: string]: any;
}

export interface TriggeringDirective {
  condition: string;
  emotion: string;
  intensity: number;
  [key: string]: any;
}

export interface ConditionalDirective {
  if: string;
  then: string;
  else?: string;
  [key: string]: any;
}

export declare class EmotionDirectiveTrait {
  constructor(config?: EmotionDirectiveConfig);
  processText(text: string): EmotionTaggedResponse;
  setEmotion(emotion: string, intensity?: number): void;
  getCurrentEmotion(): { emotion: string; intensity: number } | null;
  blendTo(emotion: string, intensity: number, duration?: number): void;
  update(delta: number): void;
  reset(): void;
  [key: string]: any;
}

export interface AvatarEmbodimentConfig {
  skeleton?: string;
  blendShapes?: string[];
  pipeline?: PipelineStage[];
  [key: string]: any;
}

export interface PipelineStage {
  name: string;
  type: string;
  config?: Record<string, any>;
  order?: number;
  enabled?: boolean;
  [key: string]: any;
}

export interface AIDriverConfig {
  model?: string;
  behaviorTree?: string;
  perception?: { range: number; fov: number; [key: string]: any };
  navigation?: { speed: number; avoidance: boolean; [key: string]: any };
  [key: string]: any;
}

export interface NPCContext {
  id: string;
  position: SpatialPosition;
  state: Record<string, any>;
  memory?: any[];
  currentGoal?: string;
  [key: string]: any;
}

export declare class AIDriverTrait {
  constructor(config?: AIDriverConfig);
  initialize(context: NPCContext): void;
  update(delta: number, context: NPCContext): void;
  setGoal(goal: string): void;
  getState(): Record<string, any>;
  perceive(entities: any[]): any[];
  decide(context: NPCContext): string;
  [key: string]: any;
}

// ============================================================================
// CROSS-PLATFORM COMPILERS (re-exported from compiler subpaths)
// ============================================================================

export class UnityCompiler { constructor(options?: any); compile(ast: any, options?: any): any; [key: string]: any; }
export class GodotCompiler { constructor(options?: any); compile(ast: any, options?: any): any; [key: string]: any; }
export class VisionOSCompiler { constructor(options?: any); compile(ast: any, options?: any): any; [key: string]: any; }
export class VRChatCompiler { constructor(options?: any); compile(ast: any, options?: any): any; [key: string]: any; }
export class UnrealCompiler { constructor(options?: any); compile(ast: any, options?: any): any; [key: string]: any; }

// ============================================================================
// REACTIVE STATE SYSTEM
// ============================================================================

export function reactive<T extends object>(target: T): T;
export function effect(fn: () => void): () => void;
export function computed<T>(getter: () => T): { readonly value: T };
export function bind(target: any, key: string, source: any, sourceKey?: string): void;
export function createState(initial?: Record<string, any>): ReactiveState;

// ============================================================================
// PARSER FACTORIES & VARIANTS
// ============================================================================

export class HoloScriptParser { parse(source: string): ParseResult; [key: string]: any; }
export class HoloScript2DParser { parse(source: string): ParseResult; [key: string]: any; }
export function createParser(options?: HSPlusParserOptions): HoloScriptPlusParser;
export function createDebugger(options?: any): HoloScriptDebugger;
export function createHoloScriptEnvironment(options?: any): any;

// ============================================================================
// RUNTIME CONTEXT & ENVIRONMENT
// ============================================================================

export interface RuntimeContext {
  runtime: HoloScriptRuntime;
  renderer?: Renderer;
  state?: Record<string, any>;
  [key: string]: any;
}

export interface HoloImport {
  source: string;
  specifiers: string[];
  [key: string]: any;
}

export interface HoloParseError {
  message: string;
  line?: number;
  column?: number;
  source?: string;
  [key: string]: any;
}

export interface HologramProperties {
  position?: SpatialPosition;
  scale?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  visible?: boolean;
  [key: string]: any;
}

export interface DebugEvent {
  type: string;
  data?: any;
  timestamp?: number;
  [key: string]: any;
}

export interface DebugState {
  paused: boolean;
  currentLine?: number;
  breakpoints: number[];
  callStack: any[];
  [key: string]: any;
}

export type StepMode = 'into' | 'over' | 'out';

// ============================================================================
// AST NODE VARIANTS
// ============================================================================

export interface ConnectionNode extends ASTNode { type: 'Connection'; from: string; to: string; [key: string]: any; }
export interface GateNode extends ASTNode { type: 'Gate'; condition: string; [key: string]: any; }
export interface StreamNode extends ASTNode { type: 'Stream'; name: string; [key: string]: any; }
export interface TransformationNode extends ASTNode { type: 'Transformation'; [key: string]: any; }
export interface MethodNode extends ASTNode { type: 'Method'; name: string; parameters: ParameterNode[]; [key: string]: any; }
export interface ParameterNode extends ASTNode { type: 'Parameter'; name: string; paramType?: string; [key: string]: any; }

// ============================================================================
// 2D UI TYPES
// ============================================================================

export interface Position2D { x: number; y: number; }
export interface Size2D { width: number; height: number; }
export type UIElementType = 'button' | 'text' | 'panel' | 'image' | 'input' | 'slider' | 'toggle' | string;
export interface UIStyle { [key: string]: any; }
export interface UI2DNode extends ASTNode { type: 'UI2D'; elementType: UIElementType; style?: UIStyle; children?: UI2DNode[]; [key: string]: any; }

// ============================================================================
// VOICE & GESTURE
// ============================================================================

export interface VoiceCommand { phrase: string; action: string; confidence?: number; [key: string]: any; }
export interface GestureData { type: string; confidence: number; hand?: 'left' | 'right'; [key: string]: any; }

// ============================================================================
// CONSTANTS & LOGGING
// ============================================================================

export declare const HOLOSCRIPT_VERSION: string;
export declare const HOLOSCRIPT_DEMO_SCRIPTS: Record<string, string>;
export declare const HOLOSCRIPT_GESTURES: string[];
export declare const HOLOSCRIPT_SUPPORTED_PLATFORMS: string[];
export declare const HOLOSCRIPT_VOICE_COMMANDS: VoiceCommand[];

export interface Logger { info(...args: any[]): void; warn(...args: any[]): void; error(...args: any[]): void; debug(...args: any[]): void; }
export class ConsoleLogger implements Logger { info(...args: any[]): void; warn(...args: any[]): void; error(...args: any[]): void; debug(...args: any[]): void; }
export class NoOpLogger implements Logger { info(...args: any[]): void; warn(...args: any[]): void; error(...args: any[]): void; debug(...args: any[]): void; }
export type HoloScriptLogger = Logger;
export function setHoloScriptLogger(logger: Logger): void;
export function resetLogger(): void;
export function enableConsoleLogging(): void;
export const logger: HoloScriptLogger;
export function isHoloScriptSupported(): boolean;

// ============================================================================
// CULTURE TYPES
// ============================================================================

export interface CulturalNorm {
  [key: string]: any;
}
export type NormCategory = string;
export type NormEnforcement = 'hard' | 'soft' | 'advisory';
export type NormScope = 'agent' | 'zone' | 'world' | 'session';
export type NormProvenanceSource =
  | 'agent'
  | 'corpus'
  | 'declaration_site'
  | 'builtin'
  | 'observation'
  | 'unknown';
export interface NormProvenance {
  source: NormProvenanceSource;
  sourceAgentId?: string;
  sourceCorpus?: string;
  declarationSite?: {
    file: string;
    line?: number;
    column?: number;
  };
  originInteractionId?: string;
  confidenceClassification?: 'genuine' | 'confabulated' | 'bullshitted';
  recordedAtIso?: string;
}
export declare const UNKNOWN_NORM_PROVENANCE: Readonly<NormProvenance>;
export declare const BUILTIN_NORM_PROVENANCE: Readonly<NormProvenance>;
export declare function normalizeNormProvenance(
  value: Partial<NormProvenance> | undefined | null
): NormProvenance;
export declare function serializeNormProvenance(
  value: NormProvenance | undefined | null
): Record<string, unknown>;
export declare function deserializeNormProvenance(value: unknown): NormProvenance;

// ============================================================================
// MARKETPLACE
// ============================================================================

export type ContentCategory = string;

export class MarketplaceRegistry {
  [key: string]: any;
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

declare const _default: {
  parse: typeof parse;
  parseHolo: typeof parseHolo;
  parseHoloStrict: typeof parseHoloStrict;
  parseHoloScriptPlus: typeof parseHoloScriptPlus;
  HoloScriptPlusParser: typeof HoloScriptPlusParser;
  HoloCompositionParser: typeof HoloCompositionParser;
  HoloScriptCodeParser: typeof HoloScriptCodeParser;
  HoloScriptCompiler: typeof HoloScriptCompiler;
  HoloScriptRuntime: typeof HoloScriptRuntime;
  HoloScriptPlusRuntimeImpl: typeof HoloScriptPlusRuntimeImpl;
  HoloScriptTypeChecker: typeof HoloScriptTypeChecker;
  HoloScriptDebugger: typeof HoloScriptDebugger;
  TraitCompositor: typeof TraitCompositor;
  createRuntime: typeof createRuntime;
  MATERIAL_PRESETS: typeof MATERIAL_PRESETS;
};
export default _default;

// ============================================================================
// ANIMATION ENGINE
// ============================================================================

export type EasingFn = (t: number) => number;
export declare const Easing: {
  readonly linear: (t: number) => number;
  readonly easeInQuad: (t: number) => number;
  readonly easeOutQuad: (t: number) => number;
  readonly easeInOutQuad: (t: number) => number;
  readonly easeInCubic: (t: number) => number;
  readonly easeOutCubic: (t: number) => number;
  readonly easeInOutCubic: (t: number) => number;
  readonly easeInExpo: (t: number) => number;
  readonly easeOutExpo: (t: number) => number;
  readonly easeInOutExpo: (t: number) => number;
  readonly easeOutBack: (t: number) => number;
  readonly easeOutElastic: (t: number) => number;
  readonly easeOutBounce: (t: number) => number;
};
export interface Keyframe<T = number> { time: number; value: T; easing?: EasingFn; }
export interface AnimationClip { id: string; property: string; keyframes: Keyframe[]; duration: number; loop: boolean; pingPong: boolean; delay: number; onComplete?: () => void; }
export interface ActiveAnimation { clip: AnimationClip; elapsed: number; isPlaying: boolean; isPaused: boolean; direction: 1 | -1; loopCount: number; }
export declare class AnimationEngine {
  play(clip: AnimationClip, setter: (value: any) => void): void;
  stop(clipId: string): void;
  pause(clipId: string): void;
  resume(clipId: string): void;
  isActive(clipId: string): boolean;
  getActiveIds(): string[];
  update(delta: number): void;
  clear(): void;
}
export interface SampledKeyframe { time: number; value: number; easing?: string; }
export declare function applyEasing(t: number, easing: string): number;
export declare function sampleTrack(
  keyframes: SampledKeyframe[],
  t: number,
  defaultEasing?: string
): number;

// ============================================================================
// AUDIO ENGINE
// ============================================================================

export type DistanceModel = 'linear' | 'inverse' | 'exponential';
export interface AudioSourceConfig { id: string; position: { x: number; y: number; z: number }; volume: number; pitch: number; loop: boolean; maxDistance: number; refDistance: number; rolloffFactor: number; distanceModel: DistanceModel; channel: string; spatialize: boolean; }
export interface AudioSource { config: AudioSourceConfig; isPlaying: boolean; currentTime: number; computedVolume: number; computedPan: number; soundId: string; }
export declare class AudioEngine {
  setListenerPosition(pos: { x: number; y: number; z: number }): void;
  setListenerOrientation(forward: { x: number; y: number; z: number }, up: { x: number; y: number; z: number }): void;
  getListener(): any;
  play(soundId: string, config?: Partial<AudioSourceConfig>): string;
  stop(sourceId: string): void;
  setSourcePosition(sourceId: string, pos: { x: number; y: number; z: number }): void;
  update(delta: number): void;
  getSource(sourceId: string): AudioSource | undefined;
  getActiveSources(): AudioSource[];
  setMasterVolume(vol: number): void;
  getMasterVolume(): number;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  getActiveCount(): number;
  stopAll(): void;
}

// ============================================================================
// PARTICLE SYSTEM
// ============================================================================

export interface EmitterConfig { [key: string]: any; }
export interface Particle { [key: string]: any; }
export interface Color4 { r: number; g: number; b: number; a: number; }
export declare class ParticleSystem {
  constructor(config: EmitterConfig);
  update(delta: number): void;
  emit(count?: number): void;
  clear(): void;
  getParticles(): Particle[];
  getActiveCount(): number;
  setConfig(config: Partial<EmitterConfig>): void;
  getConfig(): EmitterConfig;
  [key: string]: any;
}

// ============================================================================
// SHADER GRAPH
// ============================================================================

export declare class ShaderGraph {
  readonly id: string;
  nodes: Map<string, any>;
  connections: any[];
  constructor(id?: string);
  addNode(node: any): void;
  removeNode(nodeId: string): void;
  connect(fromId: string, fromPort: string, toId: string, toPort: string): void;
  disconnect(connectionId: string): void;
  compile(target?: string): string;
  toJSON(): any;
  static fromJSON(data: any): ShaderGraph;
  [key: string]: any;
}

// ============================================================================
// RUNTIME ENGINES
// ============================================================================

export declare class CameraController { constructor(config?: any); setMode(mode: string): void; getMode(): string; update(delta: number, input?: any): void; setTarget(target: any): void; getTransform(): any; [key: string]: any; }
export declare class AStarPathfinder { constructor(grid?: any); findPath(start: any, end: any): any[]; setGrid(grid: any): void; [key: string]: any; }
export type LightType = 'directional' | 'point' | 'spot' | 'area' | 'probe';
export declare class LightingModel { addLight(type: 'directional' | 'point' | 'spot', config?: any): string; removeLight(id: string): void; updateLight(id: string, config: any): void; getLights(): any[]; update(delta: number): void; [key: string]: any; }
export declare class CinematicDirector { play(sequence: any): void; stop(): void; pause(): void; resume(): void; update(delta: number): void; [key: string]: any; }
export declare class SaveManager { constructor(config?: any); save(key: string, data: any): Promise<void>; load(key: string): Promise<any>; delete(key: string): Promise<void>; list(): Promise<string[]>; [key: string]: any; }
export declare class Profiler { begin(label: string): void; end(label: string): number; getStats(): Record<string, any>; reset(): void; [key: string]: any; }

// ============================================================================
// SANDBOX
// ============================================================================

export interface Sandbox { [key: string]: any; }
export interface SandboxExecutionResult { success: boolean; result?: any; error?: string; memoryUsed: number; cpuTimeUsed: number; }
export declare function createSandbox(policy: any): Sandbox;
export declare function executeSandbox(code: string, sandbox: Sandbox): Promise<SandboxExecutionResult>;
export declare function destroySandbox(sandbox: Sandbox): void;
export declare class SandboxExecutor { constructor(config?: any); execute(code: string): Promise<SandboxExecutionResult>; [key: string]: any; }
export declare function quickSafetyCheck(traits: string[], builtins: string[], options?: { trustLevel?: string; targetPlatform?: string }): { passed: boolean; verdict: string; reasons: string[] };
export declare function buildSafetyReport(result: any): SafetyReport;
export declare function formatReport(report: SafetyReport): string;
export declare function generateCertificate(report: SafetyReport): string;

// ============================================================================
// LOD / TILEMAP
// ============================================================================

export interface LODLevel { level: number; distance: number; polygonRatio: number; textureScale: number; disabledFeatures: string[]; [key: string]: any; }
export interface LODConfig { id: string; levels: LODLevel[]; [key: string]: any; }
export declare class LODManager { register(id: string, config: LODConfig): void; unregister(id: string): void; update(cameraPosition: any): void; getActiveLevel(id: string): LODLevel | null; [key: string]: any; }
export interface TileData { id: number; flags: number; [key: string]: any; }
export declare const TileFlags: { readonly NONE: 0; readonly SOLID: 1; readonly WALKABLE: 2; readonly WATER: 4; [key: string]: number; };
export declare class TileMap { constructor(width: number, height: number, tileSize?: number); addLayer(name: string): void; removeLayer(name: string): void; setTile(layer: string, x: number, y: number, tile: TileData): void; getTile(layer: string, x: number, y: number): TileData | undefined; removeTile(layer: string, x: number, y: number): void; getTileSize(): number; getLayerCount(): number; [key: string]: any; }

// ============================================================================
// STATE / NETWORK
// ============================================================================

export interface StateDeclaration { name: string; type: string; [key: string]: any; }
export declare class ReactiveState<T extends StateDeclaration = StateDeclaration> { constructor(initial: Record<string, any>); set(key: keyof T, value: any): void; get(key: keyof T): any; getSnapshot(): Record<string, any>; undo(): void; redo(): void; subscribe(listener: (state: Record<string, any>) => void): () => void; [key: string]: any; }
export type MessageType = 'state_sync' | 'event' | 'rpc' | 'handshake' | 'heartbeat' | 'agent_state';
export declare class NetworkManager { constructor(config?: any); connect(url: string): Promise<void>; disconnect(): void; send(type: MessageType, payload: any): void; on(type: MessageType, handler: (payload: any) => void): void; off(type: MessageType, handler: (payload: any) => void): void; isConnected(): boolean; [key: string]: any; }
export declare class MultiplayerSession { constructor(config?: any); join(roomId: string): Promise<void>; leave(): Promise<void>; broadcast(event: string, data: any): void; on(event: string, handler: (data: any) => void): void; getConnectedPeers(): string[]; [key: string]: any; }

// ============================================================================
// ASSET REGISTRY
// ============================================================================

export interface AssetEntry { id: string; type: string; url: string; name: string; [key: string]: any; }
export declare class AssetRegistry {
  constructor(config?: any);
  register(entry: AssetEntry): void;
  unregister(id: string): void;
  get(id: string): AssetEntry | undefined;
  getByType(type: string): AssetEntry[];
  getAll(): AssetEntry[];
  load(id: string): Promise<any>;
  preload(ids: string[]): Promise<void>;
  [key: string]: any;
}

// ============================================================================
// TERRAIN SYSTEM
// ============================================================================

export interface TerrainLayer { [key: string]: any; }
export interface TerrainConfig { width: number; depth: number; heightScale?: number; layers?: TerrainLayer[]; [key: string]: any; }
export declare class TerrainSystem {
  constructor(config?: TerrainConfig);
  generate(config?: Partial<TerrainConfig>): void;
  getHeight(x: number, z: number): number;
  getNormal(x: number, z: number): any;
  update(delta: number): void;
  getConfig(): TerrainConfig;
  [key: string]: any;
}

// ============================================================================
// STATE MACHINE
// ============================================================================

export interface StateMachineState { name: string; onEnter?: () => void; onExit?: () => void; onUpdate?: (delta: number) => void; [key: string]: any; }
export interface StateMachineTransition { from: string; to: string; condition: () => boolean; [key: string]: any; }
export declare class StateMachine {
  constructor(states?: StateMachineState[], transitions?: StateMachineTransition[]);
  addState(state: StateMachineState): void;
  addTransition(transition: StateMachineTransition): void;
  start(initialState: string): void;
  stop(): void;
  update(delta: number): void;
  getCurrentState(): string | null;
  transition(to: string): void;
  [key: string]: any;
}

// ============================================================================
// TIMELINE
// ============================================================================

export type TimelineMode = 'once' | 'loop' | 'pingpong';
export interface TimelineEntry { time: number; action: () => void; }
export interface TimelineConfig { duration: number; mode?: TimelineMode; entries?: TimelineEntry[]; }
export declare class Timeline {
  constructor(config?: TimelineConfig);
  addEntry(entry: TimelineEntry): void;
  play(): void;
  pause(): void;
  stop(): void;
  update(delta: number): void;
  seek(time: number): void;
  getDuration(): number;
  getCurrentTime(): number;
  [key: string]: any;
}

// ============================================================================
// SCENE MANAGER
// ============================================================================

export interface SceneListEntry { id: string; name: string; description?: string; thumbnail?: string; [key: string]: any; }
export declare class SceneManager {
  constructor(config?: any);
  getScenes(): SceneListEntry[];
  getScene(id: string): SceneListEntry | undefined;
  addScene(scene: SceneListEntry): void;
  removeScene(id: string): void;
  loadScene(id: string): Promise<any>;
  saveScene(id: string, data: any): Promise<void>;
  [key: string]: any;
}

// ============================================================================
// SAVE SLOT (used by useSaveLoad)
// ============================================================================

export interface SaveSlot { id: string; name: string; data: any; timestamp: number; [key: string]: any; }

// ============================================================================
// NAV MESH / PATHFINDING
// ============================================================================

export interface NavPoint { x: number; y: number; z: number; [key: string]: any; }
export interface PathResult { path: NavPoint[]; cost: number; success: boolean; }
export declare class NavMesh {
  constructor(config?: any);
  build(geometry: any): void;
  findPath(start: NavPoint, end: NavPoint): PathResult;
  isWalkable(point: NavPoint): boolean;
  [key: string]: any;
}

// ============================================================================
// ECS WORLD
// ============================================================================

export interface TransformComponent { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number }; scale: { x: number; y: number; z: number }; }
export declare class ECSWorld {
  constructor();
  createEntity(): number;
  destroyEntity(entity: number): void;
  addComponent<T>(entity: number, componentType: number, data: T): void;
  removeComponent(entity: number, componentType: number): void;
  getComponent<T>(entity: number, componentType: number): T | undefined;
  query(...componentTypes: number[]): number[];
  update(delta: number): void;
  [key: string]: any;
}

// ============================================================================
// INPUT MANAGER
// ============================================================================

export declare class InputManager {
  constructor(config?: any);
  isKeyDown(key: string): boolean;
  isKeyPressed(key: string): boolean;
  isMouseDown(button: number): boolean;
  getMousePosition(): { x: number; y: number };
  getMouseDelta(): { x: number; y: number };
  bindAction(name: string, keys: string[]): void;
  isActionPressed(name: string): boolean;
  update(): void;
  [key: string]: any;
}

// ============================================================================
// CULTURE RUNTIME
// ============================================================================

export interface CultureEvent { type: string; data: any; [key: string]: any; }
export declare class CultureRuntime {
  constructor(config?: any);
  loadNorms(norms: any[]): void;
  evaluate(context: any): { violations: any[]; score: number };
  on(event: string, handler: (e: CultureEvent) => void): void;
  emit(event: CultureEvent): void;
  [key: string]: any;
}

// ============================================================================
// COMBAT MANAGER
// ============================================================================

export interface HitBox { x: number; y: number; z: number; width: number; height: number; depth: number; [key: string]: any; }
export interface HurtBox { x: number; y: number; z: number; width: number; height: number; depth: number; [key: string]: any; }
export interface ComboChain { id: string; attacks: string[]; window: number; [key: string]: any; }
export declare class CombatManager {
  constructor(config?: any);
  registerHitBox(entityId: string, hitBox: HitBox): void;
  registerHurtBox(entityId: string, hurtBox: HurtBox): void;
  registerCombo(chain: ComboChain): void;
  checkCollisions(): Array<{ attacker: string; defender: string; damage: number }>;
  update(delta: number): void;
  [key: string]: any;
}

// ============================================================================
// COLLABORATION SESSION
// ============================================================================

export interface SessionPeer { id: string; name: string; color: string; [key: string]: any; }
export interface SessionStats { peerCount: number; latency: number; uptime: number; [key: string]: any; }
export declare class CollaborationSession {
  constructor(config?: any);
  join(sessionId: string, peer: SessionPeer): Promise<void>;
  leave(): Promise<void>;
  getPeers(): SessionPeer[];
  getStats(): SessionStats;
  broadcast(event: string, data: any): void;
  on(event: string, handler: (data: any) => void): void;
  [key: string]: any;
}

// ============================================================================
// CINEMATIC TYPES
// ============================================================================

export interface CinematicScene { id: string; duration: number; cues: CuePoint[]; [key: string]: any; }
export interface CuePoint { time: number; action: string; params?: any; [key: string]: any; }

// ============================================================================
// BEHAVIOR TREE
// ============================================================================

export type BehaviorStatus = 'success' | 'failure' | 'running';
export interface BehaviorNode { tick(agent: any): BehaviorStatus; [key: string]: any; }
export declare class BehaviorTree {
  constructor(root: BehaviorNode);
  tick(agent: any): BehaviorStatus;
  setRoot(node: BehaviorNode): void;
  [key: string]: any;
}

// ============================================================================
// DIALOGUE SYSTEM
// ============================================================================

export interface DialogueNode { id: string; text: string; speaker?: string; choices?: DialogueChoice[]; [key: string]: any; }
export interface DialogueChoice { id: string; text: string; nextId: string; condition?: string; [key: string]: any; }
export interface DialogueTree { id: string; nodes: DialogueNode[]; startId: string; [key: string]: any; }
export declare class DialogueManager {
  constructor(config?: any);
  loadTree(tree: DialogueTree): void;
  startDialogue(treeId: string): DialogueNode | null;
  selectChoice(choiceId: string): DialogueNode | null;
  getCurrentNode(): DialogueNode | null;
  isActive(): boolean;
  [key: string]: any;
}

// ============================================================================
// INVENTORY SYSTEM
// ============================================================================

export interface InventoryItem { id: string; name: string; type: string; quantity: number; [key: string]: any; }
export interface Inventory { id: string; slots: number; items: InventoryItem[]; [key: string]: any; }
export declare class InventoryManager {
  constructor(config?: any);
  createInventory(id: string, slots: number): Inventory;
  addItem(inventoryId: string, item: InventoryItem): boolean;
  removeItem(inventoryId: string, itemId: string, quantity?: number): boolean;
  getItems(inventoryId: string): InventoryItem[];
  [key: string]: any;
}

// ============================================================================
// LIGHTING TYPES
// ============================================================================

export interface Light { id: string; type: LightType; color: string; intensity: number; [key: string]: any; }
export interface AmbientConfig { color: string; intensity: number; [key: string]: any; }

// ============================================================================
// COMPILER TYPES  
// ============================================================================

export interface CompilerTarget { [key: string]: any; }
export interface TraitDefinition { name: string; properties?: Record<string, any>; [key: string]: any; }
export interface CompilerPlugin { [key: string]: any; }
export interface CompilerOptions { target?: string; optimize?: boolean; [key: string]: any; }
export interface CompilerDiagnostic { severity: 'error' | 'warning' | 'info'; message: string; line?: number; column?: number; [key: string]: any; }
export interface IncrementalBuildResult { success: boolean; diagnostics: CompilerDiagnostic[]; artifacts: any[]; [key: string]: any; }
export declare class IncrementalCompiler {
  static deserialize(json: string): IncrementalCompiler;
  constructor(config?: any);
  addSource(id: string, source: string): void;
  compile(ast: HoloComposition, compileObject: (obj: any) => string, options?: any): Promise<any>;
  invalidate(id: string): void;
  [key: string]: any;
}
export declare function createIncrementalCompiler(config?: any): IncrementalCompiler;

// ============================================================================
// ECS INSPECTOR TYPES
// ============================================================================

export interface ComponentInfo { type: number; data: any; name: string; }
export interface EntityStats { id: number; components: ComponentInfo[]; active: boolean; }
export declare class ECSInspector {
  constructor(world: ECSWorld);
  getEntityStats(entityId: number): EntityStats;
  getAllEntities(): EntityStats[];
  [key: string]: any;
}

// ============================================================================
// PHYSICS PREVIEW TYPES
// ============================================================================

export interface PhysicsBody { id: string; position: { x: number; y: number; z: number }; velocity: { x: number; y: number; z: number }; mass: number; [key: string]: any; }
export declare class PhysicsWorld {
  constructor(config?: any);
  addBody(body: PhysicsBody): void;
  removeBody(id: string): void;
  step(delta: number): void;
  raycast(from: any, to: any): any;
  [key: string]: any;
}

// ============================================================================
// MARKETPLACE TYPES
// ============================================================================

export type MarketplaceSubmissionStatus = 'draft' | 'pending' | 'verified' | 'published' | 'rejected';
export interface MarketplaceSubmission { id: string; title: string; description: string; category: string; price: number; status: MarketplaceSubmissionStatus; [key: string]: any; }

// ============================================================================
// PLATFORM TARGET TYPES
// ============================================================================

export type PlatformTarget = 'quest3' | 'pcvr' | 'visionos' | 'android-xr' | 'visionos-ar' | 'android-xr-ar' | 'webxr' | 'ios' | 'android' | 'windows' | 'macos' | 'linux' | 'web' | 'android-auto' | 'carplay' | 'watchos' | 'wearos';

// ============================================================================
// DRAFT TRAIT (Draft→Mesh→Simulation Pipeline)
// ============================================================================

export type DraftShape = 'box' | 'sphere' | 'cylinder' | 'cone' | 'capsule' | 'plane' | 'torus';

export interface DraftConfig {
  shape: DraftShape;
  collision: boolean;
  color: string;
  opacity: number;
  wireframe: boolean;
  collisionScale: number;
  targetMaturity: AssetMaturity;
}

export declare const DRAFT_DEFAULTS: DraftConfig;

export declare const DRAFT_TRAIT: {
  readonly name: '@draft';
  readonly version: '1.0.0';
  readonly description: string;
  readonly category: 'pipeline';
  readonly properties: Record<string, any>;
};

export declare class DraftManager {
  setDraft(entityId: string, config?: Partial<DraftConfig>): DraftConfig;
  getDraft(entityId: string): DraftConfig | null;
  isDraft(entityId: string): boolean;
  promote(entityId: string): AssetMaturity;
  demote(entityId: string, config?: Partial<DraftConfig>): DraftConfig;
  getDraftIds(): string[];
  readonly count: number;
  clear(): void;
  demoteAll(entityIds: string[], shape?: DraftShape): void;
  getCollisionShape(entityId: string): DraftShape | null;
}

// ============================================================================
// VR PERFORMANCE REGRESSION MONITOR
// ============================================================================

export interface PerformanceRegressionConfig {
  thresholdMs: number;
  consecutiveFrames: number;
  recoveryFrames: number;
  recoveryThresholdMs: number;
  enabled: boolean;
}

export interface PerformanceRegressionState {
  avgFrameTimeMs: number;
  isRegressed: boolean;
  aboveCount: number;
  belowCount: number;
  regressionCount: number;
  recoveryCount: number;
}

export declare const PERF_REGRESSION_DEFAULTS: PerformanceRegressionConfig;

export declare class PerformanceRegressionMonitor {
  constructor(config?: Partial<PerformanceRegressionConfig>);
  tick(deltaMs: number): PerformanceRegressionState;
  getState(): PerformanceRegressionState;
  forceRegress(): void;
  forceRecover(): void;
  reset(): void;
}

// ============================================================================
// PLUGIN SYSTEM (Sandboxing, API, Lifecycle)
// ============================================================================

export interface PluginSandboxOptions {
  maxMemoryMB?: number;
  timeoutMs?: number;
  allowedAPIs?: string[];
  [key: string]: any;
}

export declare class PluginSandbox {
  constructor(options?: PluginSandboxOptions);
  load(manifest: any): Promise<void>;
  unload(): Promise<void>;
  call(method: string, ...args: any[]): Promise<any>;
  getState(): string;
  [key: string]: any;
}

export declare function createPluginSandbox(options?: PluginSandboxOptions): PluginSandbox;

export declare class PluginAPI {
  constructor(config?: any);
  registerCommand(name: string, handler: (...args: any[]) => any): void;
  getAssets(): any[];
  [key: string]: any;
}

export declare class PluginLoader {
  constructor();
  loadFromManifest(manifest: any): Promise<any>;
  validateManifest(manifest: any): boolean;
  [key: string]: any;
}

export declare class ModRegistry {
  constructor();
  register(entry: any): void;
  resolve(name: string): any;
  detectConflicts(): any[];
  [key: string]: any;
}

export declare class HololandExtensionRegistry {
  constructor();
  registerExtension(type: string, extension: any): void;
  getExtensions(type: string): any[];
  [key: string]: any;
}

// ============================================================================
// POST-QUANTUM CRYPTOGRAPHY (Hybrid Classical + PQ)
// ============================================================================

export interface HybridKeyPair {
  classicalPublicKey: Uint8Array;
  classicalPrivateKey: Uint8Array;
  pqPublicKey: Uint8Array;
  pqPrivateKey: Uint8Array;
  [key: string]: any;
}

export interface HybridSignature {
  classicalSignature: Uint8Array;
  pqSignature: Uint8Array;
  algorithm: string;
  [key: string]: any;
}

export interface HybridCryptoConfig {
  classicalAlgorithm?: string;
  pqAlgorithm?: string;
  [key: string]: any;
}

export declare class HybridCryptoProvider {
  constructor(config?: HybridCryptoConfig);
  generateKeyPair(): Promise<HybridKeyPair>;
  sign(data: Uint8Array, privateKey: any): Promise<HybridSignature>;
  verify(data: Uint8Array, signature: HybridSignature, publicKey: any): Promise<boolean>;
  [key: string]: any;
}

export declare function getHybridCryptoProvider(): HybridCryptoProvider;
export declare function resetHybridCryptoProvider(): void;

// ============================================================================
// x402 PAYMENT PROTOCOL (HTTP 402 + USDC Settlement)
// ============================================================================

export declare const X402_VERSION: number;
export declare const MICRO_PAYMENT_THRESHOLD: number;
export declare const USDC_CONTRACTS: Record<SettlementChain, string>;
export declare const CHAIN_IDS: Record<string, number>;
export declare const CHAIN_ID_TO_NETWORK: Record<number, SettlementChain>;

export type SettlementChain = 'base' | 'base-sepolia' | 'solana' | 'solana-devnet';
export type PaymentScheme = 'exact';
export type SettlementMode = 'in_memory' | 'on_chain';
export type SettlementEventType =
  | 'payment:authorization_created'
  | 'payment:verification_started'
  | 'payment:verification_passed'
  | 'payment:verification_failed'
  | 'payment:settlement_started'
  | 'payment:settlement_completed'
  | 'payment:settlement_failed'
  | 'payment:refund_initiated'
  | 'payment:refund_completed'
  | 'payment:refund_failed'
  | 'payment:batch_settlement_started'
  | 'payment:batch_settlement_completed';
export type SettlementEventListener = (event: SettlementEvent) => void;

export interface X402PaymentRequired {
  x402Version: number;
  accepts: X402PaymentOption[];
  error: string;
}

export interface X402PaymentOption {
  scheme: PaymentScheme;
  network: SettlementChain;
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: string;
  asset: string;
  maxTimeoutSeconds: number;
}

export interface X402PaymentPayload {
  x402Version: number;
  scheme: PaymentScheme;
  network: SettlementChain;
  payload: {
    signature: string;
    authorization: {
      from: string;
      to: string;
      value: string;
      validAfter: string;
      validBefore: string;
      nonce: string;
    };
  };
}

export interface X402SettlementResult {
  success: boolean;
  transaction: string | null;
  network: SettlementChain | 'in_memory';
  payer: string;
  errorReason: string | null;
  mode: SettlementMode;
  settledAt: number;
}

export interface X402VerificationResult {
  isValid: boolean;
  invalidReason: string | null;
}

export interface X402FacilitatorConfig {
  recipientAddress: string;
  chain: SettlementChain;
  secondaryChain?: SettlementChain;
  microPaymentThreshold?: number;
  maxTimeoutSeconds?: number;
  optimisticExecution?: boolean;
  batchSettlementIntervalMs?: number;
  maxLedgerEntries?: number;
  facilitatorUrl?: string;
  resourceDescription?: string;
}

export interface CreditTraitConfig {
  price: number;
  chain: SettlementChain;
  recipient: string;
  description: string;
  timeout: number;
  secondary_chain?: SettlementChain;
  optimistic: boolean;
  micro_threshold?: number;
}

export interface LedgerEntry {
  id: string;
  from: string;
  to: string;
  amount: number;
  resource: string;
  timestamp: number;
  settled: boolean;
  settlementTx: string | null;
}

export interface SettlementEvent {
  type: SettlementEventType;
  timestamp: string;
  eventId: string;
  nonce: string | null;
  payer: string | null;
  recipient: string | null;
  amount: string | null;
  network: SettlementChain | 'in_memory' | null;
  transaction: string | null;
  metadata: Record<string, unknown>;
}

export interface RefundRequest {
  originalNonce: string;
  reason: string;
  partialAmount: string | null;
}

export interface RefundResult {
  success: boolean;
  refundId: string;
  amountRefunded: string;
  originalNonce: string;
  transaction: string | null;
  originalMode: SettlementMode;
  reason: string;
  errorReason: string | null;
  refundedAt: number;
}

export declare class MicroPaymentLedger {
  constructor(maxEntries?: number);
  record(from: string, to: string, amount: number, resource: string): LedgerEntry;
  getUnsettled(): LedgerEntry[];
  markSettled(entryIds: string[], txHash: string): void;
  getBalance(address: string): number;
  getUnsettledVolume(): number;
  getEntriesForPayer(from: string): LedgerEntry[];
  getStats(): {
    totalEntries: number;
    unsettledEntries: number;
    unsettledVolume: number;
    uniquePayers: number;
    uniqueRecipients: number;
  };
  pruneSettled(): number;
  reset(): void;
}

export declare class X402Facilitator {
  constructor(config: X402FacilitatorConfig);
  createPaymentRequired(resource: string, amountUSDC: number, description?: string): X402PaymentRequired;
  verifyPayment(payment: X402PaymentPayload, requiredAmount: string): X402VerificationResult;
  getSettlementMode(amountBaseUnits: number): SettlementMode;
  processPayment(payment: X402PaymentPayload, resource: string, requiredAmount: string): Promise<X402SettlementResult>;
  startBatchSettlement(): void;
  stopBatchSettlement(): void;
  runBatchSettlement(): Promise<{ settled: number; failed: number; totalVolume: number }>;
  static decodeXPaymentHeader(header: string): X402PaymentPayload | null;
  static encodeXPaymentHeader(payload: X402PaymentPayload): string;
  static createPaymentResponseHeader(result: X402SettlementResult): string;
  getSettlementStatus(nonce: string): X402SettlementResult | 'pending' | 'unknown';
  getLedger(): MicroPaymentLedger;
  getStats(): {
    usedNonces: number;
    pendingSettlements: number;
    completedSettlements: number;
    ledger: ReturnType<MicroPaymentLedger['getStats']>;
  };
  dispose(): void;
}

export declare class PaymentGateway {
  constructor(config: X402FacilitatorConfig);
  on(eventType: SettlementEventType | '*', listener: SettlementEventListener): () => void;
  off(eventType: SettlementEventType | '*', listener: SettlementEventListener): void;
  createPaymentAuthorization(resource: string, amountUSDC: number, description?: string): X402PaymentRequired & { chainId: number };
  verifyPayment(payment: string | X402PaymentPayload, requiredAmount: string): X402VerificationResult & { decodedPayload: X402PaymentPayload | null };
  settlePayment(payment: string | X402PaymentPayload, resource: string, requiredAmount: string): Promise<X402SettlementResult>;
  refundPayment(request: RefundRequest): Promise<RefundResult>;
  runBatchSettlement(): Promise<{ settled: number; failed: number; totalVolume: number }>;
  getFacilitator(): X402Facilitator;
  getChainId(): number;
  getUSDCContract(): string;
  getRefund(refundId: string): RefundResult | undefined;
  getAllRefunds(): RefundResult[];
  getStats(): {
    facilitator: ReturnType<X402Facilitator['getStats']>;
    chainId: number;
    usdcContract: string;
    totalRefunds: number;
    listenerCount: number;
  };
  dispose(): void;
}

export declare const creditTraitHandler: any;

// ============================================================================
// CIRCUIT BREAKER SUITE
// ============================================================================

export declare class CircuitBreakerCICD {
  constructor(config?: any);
  runHealthChecks(): Promise<any>;
  getMetrics(): any;
  [key: string]: any;
}

export declare class CircuitBreakerBenchmarks {
  constructor(config?: any);
  runAll(): Promise<any>;
  getResults(): any[];
  [key: string]: any;
}

export declare class CircuitBreakerDeployment {
  constructor(config?: any);
  deploy(target: string): Promise<any>;
  rollback(): Promise<void>;
  [key: string]: any;
}

// ============================================================================
// MIXTURE-OF-MEMORY-EXPERTS TRAIT DATABASE
// ============================================================================

export declare class MoMETraitDatabase {
  constructor(config?: any);
  query(traitName: string, context?: any): any;
  register(trait: any): void;
  getExperts(): any[];
  [key: string]: any;
}

// ============================================================================
// UNIFIED PBR SCHEMA
// ============================================================================

export declare class UnifiedPBRSchema {
  constructor();
  validate(material: any): boolean;
  normalize(material: any): any;
  toThreeJS(material: any): any;
  [key: string]: any;
}

// ============================================================================
// SCRIPTING & AUTOMATION TRAITS
// ============================================================================

export interface SchedulerJob { id: string; interval_ms: number; action: string; params: Record<string, unknown>; mode: 'repeat' | 'once'; max_executions: number; paused: boolean; }
export interface SchedulerConfig { jobs: SchedulerJob[]; max_jobs: number; poll_interval_ms: number; }
export declare const schedulerHandler: TraitHandler<SchedulerConfig>;

export type CBState = 'closed' | 'open' | 'half-open';
export interface CircuitBreakerConfig { failure_threshold: number; window_ms: number; reset_timeout_ms: number; success_threshold: number; failure_rate_threshold: number; min_requests: number; }
export declare const circuitBreakerHandler: TraitHandler<CircuitBreakerConfig>;

export type RateLimitStrategy = 'token_bucket' | 'sliding_window';
export interface RateLimiterConfig { strategy: RateLimitStrategy; max_requests: number; window_ms: number; refill_rate: number; max_tokens: number; default_key: string; }
export declare const rateLimiterHandler: TraitHandler<RateLimiterConfig>;

export interface TimeoutGuardConfig { default_timeout_ms: number; default_fallback_action: string; max_concurrent: number; }
export declare const timeoutGuardHandler: TraitHandler<TimeoutGuardConfig>;

export type TransformOp = { type: 'pick'; fields: string[] } | { type: 'omit'; fields: string[] } | { type: 'rename'; from: string; to: string } | { type: 'default'; field: string; value: unknown } | { type: 'compute'; field: string; expr: string } | { type: 'filter'; field: string; op: string; value: unknown } | { type: 'map_value'; field: string; mapping: Record<string, unknown> };
export interface TransformRule { id: string; source_event: string; output_event: string; ops: TransformOp[]; enabled: boolean; }
export interface TransformConfig { rules: TransformRule[]; }
export declare const transformHandler: TraitHandler<TransformConfig>;

export interface BufferChannel { id: string; source_event: string; output_event: string; max_count: number; max_wait_ms: number; max_size: number; enabled: boolean; }
export interface BufferConfig { channels: BufferChannel[]; }
export declare const bufferHandler: TraitHandler<BufferConfig>;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface StructuredLoggerConfig { min_level: LogLevel; max_entries: number; rotation_count: number; emit_events: boolean; console_output: boolean; default_fields: Record<string, unknown>; }
export interface LogEntry { level: LogLevel; message: string; fields: Record<string, unknown>; timestamp: number; iso: string; }
export declare const structuredLoggerHandler: TraitHandler<StructuredLoggerConfig>;

// ============================================================================
// RUNTIME PROFILES & HEADLESS RUNTIME
// ============================================================================

export type RuntimeProfileName = 'headless' | 'minimal' | 'standard' | 'vr' | string;

export interface RenderingConfig { enabled: boolean; [key: string]: any; }
export interface ProfilePhysicsConfig { enabled: boolean; [key: string]: any; }
export interface ProfileAudioConfig { enabled: boolean; [key: string]: any; }
export interface ProfileNetworkConfig { enabled: boolean; [key: string]: any; }
export interface ProfileInputConfig { enabled: boolean; [key: string]: any; }
export interface ProtocolConfig { enabled: boolean; [key: string]: any; }

export interface RuntimeProfile {
  name: RuntimeProfileName;
  rendering: RenderingConfig;
  physics: ProfilePhysicsConfig;
  audio: ProfileAudioConfig;
  network: ProfileNetworkConfig;
  input: ProfileInputConfig;
  protocol: ProtocolConfig;
  traits?: string[];
  [key: string]: any;
}

export declare const HEADLESS_PROFILE: RuntimeProfile;
export declare const MINIMAL_PROFILE: RuntimeProfile;
export declare const STANDARD_PROFILE: RuntimeProfile;
export declare const VR_PROFILE: RuntimeProfile;
export declare function getProfile(name: RuntimeProfileName): RuntimeProfile;
export declare function registerProfile(name: string, profile: RuntimeProfile): void;
export declare function getAvailableProfiles(): RuntimeProfileName[];
export declare function createCustomProfile(base: RuntimeProfileName, overrides: Partial<RuntimeProfile>): RuntimeProfile;

export interface HeadlessRuntimeOptions {
  tickRate?: number;
  maxTicks?: number;
  autoStart?: boolean;
  hostCapabilities?: Record<string, any>;
  [key: string]: any;
}

export interface HeadlessRuntimeStats {
  tickCount: number;
  elapsedMs: number;
  nodeCount: number;
  [key: string]: any;
}

export interface HeadlessNodeInstance {
  id: string;
  node: any;
  children: HeadlessNodeInstance[];
  destroyed: boolean;
  [key: string]: any;
}

export type ActionHandler = (
  params: Record<string, unknown>,
  blackboard: Record<string, unknown>,
  context: { emit: (event: string, payload?: unknown) => void; hostCapabilities?: Record<string, any> }
) => Promise<boolean> | boolean;

export declare class HeadlessRuntime {
  constructor(ast: any, profile: RuntimeProfile, options?: HeadlessRuntimeOptions);
  start(): void;
  stop(): void;
  tick(deltaMs?: number): void;
  emit(event: string, payload?: unknown): void;
  on(event: string, handler: (...args: any[]) => void): void;
  off(event: string, handler: (...args: any[]) => void): void;
  registerAction(name: string, handler: ActionHandler): void;
  getStats(): HeadlessRuntimeStats;
  getBlackboard(): Record<string, unknown>;
  isRunning(): boolean;
  [key: string]: any;
}

export declare function createHeadlessRuntime(ast: any, profile?: RuntimeProfile, options?: HeadlessRuntimeOptions): HeadlessRuntime;

// ============================================================================
// STDLIB (General-Purpose I/O Action Handlers)
// ============================================================================

export interface StdlibPolicy {
  allowedPaths: string[];
  maxFileBytes: number;
  allowShell: boolean;
  allowedShellCommands: string[];
  maxShellOutputBytes: number;
  shellTimeoutMs: number;
  allowNetwork: boolean;
  allowedHosts: string[];
  rootDir: string;
}

export interface StdlibOptions {
  policy: StdlibPolicy;
  hostCapabilities?: HostCapabilities;
  debug?: boolean;
}

export declare const DEFAULT_STDLIB_POLICY: StdlibPolicy;

export declare function createStdlibActions(options: StdlibOptions): Record<string, (params: Record<string, any>, bb: Record<string, any>, ctx: any) => Promise<boolean> | boolean>;
export declare function registerStdlib(runtime: { registerAction: (name: string, handler: any) => void }, options: StdlibOptions): void;
export declare function resolveRepoRelativePath(targetPath: string, rootDir: string): { rel: string; abs: string } | null;
export declare function isPathAllowed(relPath: string, allowedRoots: string[]): boolean;
export declare function parseHostFromUrl(url: string): string | null;
export declare function truncateText(value: any, max: number): string;
export declare function toStringArray(value: any): string[];

export interface StdlibPermissionScopeGrant {
  scope: string;
  purpose?: string;
  required?: boolean;
  riskLevel?: string;
  providerLabel?: string;
}

export interface StdlibPermissionScopePolicyEvaluation {
  scope: string;
  normalizedScope: string;
  allowed: boolean;
  reason?: string;
}

export interface StdlibPermissionScopeDiffInput {
  requestedScopes: StdlibPermissionScopeGrant[];
  minimumRequiredScopes: StdlibPermissionScopeGrant[];
  grantedScopes?: StdlibPermissionScopeGrant[];
  neverScopes?: string[];
}

export interface StdlibPermissionScopeDiffResult {
  requestedScopes: string[];
  minimumRequiredScopes: string[];
  grantedScopes: string[];
  invalidRequestedScopes: string[];
  invalidMinimumRequiredScopes: string[];
  invalidGrantedScopes: string[];
  invalidNeverScopes: string[];
  missingRequestedRequiredScopes: string[];
  missingGrantedRequiredScopes: string[];
  extraGrantedScopes: string[];
  forbiddenRequestedScopes: StdlibPermissionScopePolicyEvaluation[];
  forbiddenGrantedScopes: StdlibPermissionScopePolicyEvaluation[];
  minimumScopeSatisfied: boolean;
  excessScopesAbsent: boolean;
  policyInputValid: boolean;
}

export interface StdlibPermissionPreviewRedactionResult {
  preview: string;
  redacted: boolean;
  absolutePathRedacted: boolean;
  credentialMaterialRedacted: boolean;
}

export declare function normalizePermissionScopeName(scope: string): string;
export declare function isValidPermissionScopeName(scope: string | undefined): scope is string;
export declare function evaluateStdlibPermissionScopePolicy(scope: string, neverScopes?: string[]): StdlibPermissionScopePolicyEvaluation;
export declare function findMissingRequiredPermissionScopes(requiredScopes: StdlibPermissionScopeGrant[], candidateScopes: StdlibPermissionScopeGrant[]): string[];
export declare function findExtraPermissionScopes(grantedScopes: StdlibPermissionScopeGrant[], minimumRequiredScopes: StdlibPermissionScopeGrant[]): string[];
export declare function buildStdlibPermissionScopeDiff(input: StdlibPermissionScopeDiffInput): StdlibPermissionScopeDiffResult;
export declare function redactStdlibPermissionPreview(value: string | undefined): StdlibPermissionPreviewRedactionResult;
export declare function stdlibPermissionPreviewHasPublicLeak(value: string | undefined): boolean;

// ============================================================================
// HOLOGRAM MEDIA PIPELINE (2D-to-3D)
// ============================================================================

export type DepthBackend = 'webgpu' | 'wasm' | 'cpu';

export interface DepthEstimationConfig {
  backend: DepthBackend;
  maxResolution: number;
  enableCache: boolean;
  modelId: string;
  onProgress: (progress: number) => void;
}

export interface DepthResult {
  depthMap: Float32Array;
  normalMap: Float32Array;
  width: number;
  height: number;
  backend: DepthBackend;
  inferenceMs: number;
}

export interface DepthSequenceConfig {
  temporalAlpha: number;
  maxFrames: number;
}

export interface GIFFrame {
  imageData: ImageData;
  delay: number;
  disposalMethod: number;
}

export interface GIFDecomposerConfig {
  maxFrames: number;
  targetSize: number;
}

export declare class DepthEstimationService {
  static getInstance(config?: Partial<DepthEstimationConfig>): DepthEstimationService;
  static resetInstance(): void;
  initialize(config?: Partial<DepthEstimationConfig>): Promise<void>;
  estimateDepth(imageData: ImageData): Promise<DepthResult>;
  estimateDepthSequence(frames: ImageData[], config?: Partial<DepthSequenceConfig>): Promise<DepthResult[]>;
  dispose(): void;
}

export declare class TemporalSmoother {
  constructor(alpha?: number);
  smooth(current: Float32Array): Float32Array;
  reset(): void;
}

export declare class GIFDecomposer {
  decompose(buffer: ArrayBuffer, config?: Partial<GIFDecomposerConfig>): GIFFrame[];
}

export declare class ModelCache {
  open(): Promise<void>;
  close(): void;
  get(key: string): Promise<ArrayBuffer | null>;
  set(key: string, data: ArrayBuffer): Promise<void>;
}

export declare function depthToNormalMap(depthMap: Float32Array, width: number, height: number): Float32Array;
export declare function detectBestBackend(): Promise<DepthBackend>;

export declare const GIFDisposalMethod: {
  readonly UNSPECIFIED: 0;
  readonly NONE: 1;
  readonly RESTORE_BACKGROUND: 2;
  readonly RESTORE_PREVIOUS: 3;
};

export interface QuiltConfig {
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  fov: number;
  viewCone: number;
  depthiness: number;
  device: string;
}

export interface QuiltTile {
  viewIndex: number;
  column: number;
  row: number;
  cameraAngle: number;
  viewOffset: number;
}

export interface QuiltCompilationResult {
  config: QuiltConfig;
  tiles: QuiltTile[];
  shaderCode: string;
  metadata: Record<string, any>;
}

export declare class QuiltCompiler {
  compile(composition: any, agentToken: string): string;
  compileQuilt(composition: any, overrides?: Partial<QuiltConfig>): QuiltCompilationResult;
}

export interface MVHEVCConfig {
  ipd: number;
  resolution: [number, number];
  fps: number;
  convergenceDistance: number;
  fovDegrees: number;
  quality: 'low' | 'medium' | 'high';
  container: 'mov' | 'mp4';
  disparityScale: number;
}

export interface MVHEVCStereoView {
  eye: 'left' | 'right';
  cameraOffset: number;
  viewShear: number;
  layerIndex: number;
}

export interface MVHEVCCompilationResult {
  config: MVHEVCConfig;
  views: MVHEVCStereoView[];
  swiftCode: string;
  muxCommand: string;
  metadata: Record<string, any>;
}

export declare class MVHEVCCompiler {
  compile(composition: any, agentToken: string, outputPath?: string): string;
  compileMVHEVC(composition: any, overrides?: Partial<MVHEVCConfig>): MVHEVCCompilationResult;
}

export interface WebCodecsDepthConfig {
  maxFps: number;
  maxDepthResolution: number;
  temporalAlpha: number;
  codec: 'h264' | 'vp9' | 'av1';
  onFrame?: (result: DepthResult, frameIndex: number, timestamp: number) => void;
  onError?: (error: Error) => void;
}

export interface WebCodecsDepthStats {
  framesDecoded: number;
  framesProcessed: number;
  framesSkipped: number;
  avgDecodeMs: number;
  avgInferenceMs: number;
  running: boolean;
}

export declare class WebCodecsDepthPipeline {
  constructor(config?: Partial<WebCodecsDepthConfig>);
  static isSupported(): boolean;
  initialize(config?: Partial<WebCodecsDepthConfig>): Promise<void>;
  feedChunk(chunk: EncodedVideoChunk): void;
  processFrame(frame: VideoFrame): Promise<DepthResult | null>;
  get stats(): WebCodecsDepthStats;
  flush(): Promise<void>;
  dispose(): void;
}

// ============================================================================
// STUDIO BUNDLE SHIMS (Phase 2)
// ============================================================================
export class DialogueGraph {
  constructor();
  [key: string]: any;
}

export class InventorySystem {
  constructor();
  [key: string]: any;
}
export interface InventoryItem { [key: string]: any; }

export function createSubmission(data: any): any;
export function verifySubmission(id: string): any;
export function publishSubmission(id: string): any;

export const XR_PLATFORM_CATEGORIES: any;
export const XR_PLATFORM_CAPABILITIES: any;
export const XR_ALL_PLATFORMS: any;
export function platformCategory(platform: any): any;
export function embodimentFor(platform: any): any;
export function agentBudgetFor(platform: any): any;
export function hasCapability(platform: any, cap: any): any;
export function resolvePlatforms(criteria: any): any;

export interface HoloCamera { [key: string]: any; }
export type HoloValue = any;

export declare class ComplexityAnalyzer { [key: string]: any; }
export declare function generateProvenance(code: string, ast: any, options: any): any;
export declare function calculateRevenueDistribution(priceWei: string|bigint, author: string, importChain: any[], options?: any): any;
export declare function formatRevenueDistribution(dist: any): any;
export declare function ethToWei(eth: string): string;
export declare const PROTOCOL_CONSTANTS: any;
export class URDFCompiler { constructor(options?: any); [key: string]: any; }
export class SDFCompiler { constructor(options?: any); [key: string]: any; }
export class OpenXRCompiler { constructor(options?: any); [key: string]: any; }
export class AndroidCompiler { constructor(options?: any); [key: string]: any; }
export class AndroidXRCompiler { constructor(options?: any); [key: string]: any; }
export class IOSCompiler { constructor(options?: any); [key: string]: any; }
export class WebGPUCompiler { constructor(options?: any); [key: string]: any; }
export class WASMCompiler { constructor(options?: any); [key: string]: any; }
export class DTDLCompiler { constructor(options?: any); [key: string]: any; }
export class MultiLayerCompiler { constructor(options?: any); [key: string]: any; }

export declare const VR_TRAITS: any;
export declare const BUILTIN_CONSTRAINTS: any;
export class CircuitBreakerRegistry { [key: string]: any; }
export class CircuitState { [key: string]: any; }
export class ExportManager { [key: string]: any; }
export declare function getExportManager(options?: Partial<ExportOptions>): any;
export type ExportTarget = 'urdf' | 'sdf' | 'unity' | 'unreal' | 'godot' | 'vrchat' | 'openxr' | 'android' | 'android-xr' | 'ios' | 'visionos' | 'webgpu' | 'wasm' | 'usd' | 'usdz' | 'dtdl' | 'multi-layer' | 'incremental' | 'state' | 'trait-composition' | 'tsl' | 'a2a-agent-card' | 'nir' | 'openxr-spatial-entities' | 'context' | '3dgs' | 'mcp-server';
export class ExportOptions { [key: string]: any; }
export declare function selectModality(platform: any, options?: any): any;
export declare function selectModalityForAll(options?: any): Map<any, any>;
export declare function bestCategoryForTraits(): any;
export declare function compileHealthcareBlock(): any;
export declare function compileRoboticsBlock(): any;
export declare function compileIoTBlock(): any;
export declare function compileEducationBlock(): any;
export declare function compileMusicBlock(): any;
export class TraceWaterfallRenderer { [key: string]: any; }
export class TraceSpan { [key: string]: any; }
export declare function getTelemetryCollector(): any;
export declare function getPrometheusMetrics(prefix?: string): any;
export class PrometheusMetricsRegistry { [key: string]: any; }
export declare function getDefaultRegistry(): any;
export class OTLPExporter { [key: string]: any; }
export interface OTLPExporterConfig { [key: string]: any; }
export declare const telemetry: any;
export declare function getPluginLifecycleManager(): any;
export interface InstallPluginOptions { [key: string]: any; }
export type SandboxPermission = string;
export type PluginLifecycleState = string;
export class HoloDomainBlock { [key: string]: any; }
export type HoloDomainType = string;
export class TraitConstraint { [key: string]: any; }
export interface ISignalingBridge { [key: string]: any; }
export interface NeuralSignalPayload { [key: string]: any; }

// ============================================================================
// Visual logic graph (Studio bridge + PlayMode preview path)
// ============================================================================
export type PortType = 'number' | 'string' | 'boolean' | 'vec3' | 'any' | 'event';
export interface PortDefinition {
  name: string;
  type: PortType;
  defaultValue?: unknown;
}
export interface LogicNode {
  id: string;
  type: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  position: { x: number; y: number };
  data: Record<string, unknown>;
}
export interface LogicConnection {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}
export interface EvaluationContext {
  state: Record<string, unknown>;
  deltaTime: number;
  events: Map<string, unknown[]>;
  emittedEvents: Map<string, unknown[]>;
}
export declare class NodeGraph {
  readonly id: string;
  constructor(id?: string);
  addNode(
    type: string,
    position?: { x: number; y: number },
    data?: Record<string, unknown>
  ): LogicNode;
  connect(
    fromNode: string,
    fromPort: string,
    toNode: string,
    toPort: string
  ): LogicConnection | null;
  getNode(nodeId: string): LogicNode | undefined;
  getNodes(): LogicNode[];
  getConnections(): LogicConnection[];
  topologicalSort(): string[];
  evaluate(context: EvaluationContext): Map<string, Record<string, unknown>>;
}
export interface NodeGraphExecutionResult {
  nodeOrder: string[];
  outputs: Map<string, Record<string, unknown>>;
  state: Record<string, unknown>;
  emittedEvents: Map<string, unknown[]>;
}
export interface NodeGraphPanelConfig {
  position: [number, number, number];
  nodeWidth: number;
  nodeHeight: number;
  gridSpacing: number;
}
export interface UIEntity {
  id: string;
  type: 'panel' | 'label' | 'port' | 'connection_line';
  position: [number, number, number];
  size?: { width: number; height: number };
  text?: string;
  color?: string;
  data?: Record<string, unknown>;
}
export declare class NodeGraphPanel {
  constructor(graph: NodeGraph, config?: Partial<NodeGraphPanelConfig>);
  generateUI(): UIEntity[];
  selectNode(nodeId: string | null): void;
  getSelectedNode(): string | null;
  executeGraph(contextOverrides?: Partial<EvaluationContext>): NodeGraphExecutionResult;
}
export declare function emitPreviewHoloScriptFromNodeGraphExecution(
  execution: NodeGraphExecutionResult,
  graph: NodeGraph
): string;

// ============================================================================
// Agent Extension Types — mirrored from src/extensions/AgentExtensionTypes.ts.
// Added 2026-04-25 to unblock packages/framework imports of these types.
// Update both this block AND src/extensions/AgentExtensionTypes.ts if shape
// changes; CLAUDE.md flags dist/index.d.ts as hand-crafted (not tsc).
// ============================================================================

export interface IHiveContribution {
  id: string;
  agentId: string;
  timestamp: number;
  type: 'idea' | 'critique' | 'consensus' | 'solution';
  content: string;
  confidence: number;
}

export interface IHiveSession {
  id: string;
  topic: string;
  goal: string;
  initiator: string;
  status: 'active' | 'resolved' | 'closed';
  participants: string[];
  contributions: IHiveContribution[];
  resolution?: unknown;
}

export interface ICollectiveIntelligenceService {
  createSession(topic: string, goal: string, initiator: string): IHiveSession | Promise<string>;
  join(sessionId: string, agentId: string): void | Promise<void>;
  leave(sessionId: string, agentId: string): void | Promise<void>;
  contribute(
    sessionId: string,
    contribution: Omit<IHiveContribution, 'id' | 'timestamp'>
  ): IHiveContribution | Promise<void>;
  vote(
    sessionId: string,
    contributionId: string,
    voterId: string,
    vote: 'support' | 'oppose'
  ): void | Promise<void>;
  synthesize(sessionId: string): unknown;
  resolve(sessionId: string, resolution: string | unknown): void | Promise<void>;
}

export interface ISwarmConfig {
  algorithm: 'pso' | 'aco' | 'bees' | 'hybrid';
  populationSize: number;
  maxIterations: number;
  convergenceThreshold: number;
  adaptiveSizing?: boolean;
}

export interface ISwarmResult {
  bestSolution: number[];
  bestFitness: number;
  converged: boolean;
  iterations: number;
  improvementPercent: number;
}

export interface ISwarmCoordinator {
  optimize(
    agents: { id: string; capacity: number; load: number }[],
    tasks: { id: string; complexity: number; priority: number }[],
    config?: Partial<ISwarmConfig>
  ): Promise<ISwarmResult>;
  getRecommendedPopulation(problemSize: number): number;
}

export interface ILeaderElection {
  startElection(): Promise<string>;
  getLeader(): string | null;
  getRole(): 'leader' | 'follower' | 'candidate';
  onLeaderChange(callback: (leaderId: string | null) => void): () => void;
}

// ============================================================================
// SUPPLEMENTAL EXPORTS — fills the gap between the runtime barrel
// (\`packages/core/src/barrel/index.ts\` + \`barrel/culture-agents.ts\` +
// \`migration/SchemaDiff.ts\` + \`types/HoloScriptPlus.ts\` + \`traits/LipSyncTrait.ts\`)
// and the hand-crafted public d.ts. Engine + studio consumers import these from
// \`@holoscript/core\`; without these declarations the imports fail strict tsc
// (TS2614 / TS2724) even though the runtime symbols ARE present (re-exported
// via barrels). See W.099 deploy-blocker sweep.
// ============================================================================

// ── HSPlus runtime / parser surface ─────────────────────────────────────────

/** Runtime-injected helper functions exposed to user scripts. */
export interface HSPlusBuiltins {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  setTimeout: (fn: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  setInterval?: (fn: () => void, ms: number) => number;
  clearInterval?: (id: number) => void;
  fetch?: (url: string, options?: unknown) => Promise<unknown>;
  emit?: (event: string, data?: unknown) => void;
  on?: (event: string, handler: (data: unknown) => void) => void;
  off?: (event: string, handler?: (data: unknown) => void) => void;
  showSettings?: () => void;
  openChat?: (config?: unknown) => void;
  assistant_generate?: (prompt: string, context?: string) => void;
  [key: string]: unknown;
}

/** Parser directive variants — discriminated by \`type\`. Mirrors
 * \`packages/core/src/types/AdvancedTypeSystem.ts:396\`. Engine + studio
 * consumers narrow via \`directive.type === 'lifecycle'\` etc. */

export interface HSPlusBaseDirective {
  type: 'directive' | 'fragment';
  name: string;
  args: string[];
}

export interface HSPlusTraitDirective {
  type: 'trait';
  name: string;
  args?: unknown[];
  config?: Record<string, unknown>;
}

export interface HSPlusLifecycleDirective {
  type: 'lifecycle';
  name?: string;
  hook: string;
  params?: string[];
  body: string;
}

export interface HSPlusStateDirective {
  type: 'state';
  name?: string;
  body?: Record<string, unknown>;
  initial?: unknown;
}

export interface HSPlusForEachDirective {
  type: 'forEach';
  variable: string;
  collection: string;
  body: unknown[];
}

export interface HSPlusWhileDirective {
  type: 'while';
  condition: string;
  body: unknown[];
}

export interface HSPlusIfDirective {
  type: 'if';
  condition: string;
  body: unknown[];
  else?: unknown[];
}

export interface HSPlusImportDirective {
  type: 'import';
  path: string;
  alias: string;
  namedImports?: string[];
  isWildcard?: boolean;
}

export interface HSPlusVersionDirective {
  type: 'version';
  version: number;
}

export interface HSPlusMigrateDirective {
  type: 'migrate';
  fromVersion: number;
  body: string;
}

export interface HSPlusBindingsDirective {
  type: 'bindings';
  bindings: unknown[];
}

export interface HSPlusExportDirective {
  type: 'export';
  exportKind: string;
  exportName: string;
}

export interface HSPlusConfigDirective {
  type:
    | 'world_metadata'
    | 'world_config'
    | 'skybox'
    | 'ambient_light'
    | 'fog'
    | 'artwork_metadata'
    | 'npc_behavior';
  [key: string]: unknown;
}

export interface HSPlusNamedConfigDirective {
  type: 'manifest' | 'semantic' | 'directional_light';
  name: string;
  [key: string]: unknown;
}

/** Discriminated union of every parser directive. \`HSPlusForDirective\` is
 * declared earlier in this d.ts; the rest live above. */
export type HSPlusDirective =
  | HSPlusBaseDirective
  | HSPlusTraitDirective
  | HSPlusLifecycleDirective
  | HSPlusStateDirective
  | HSPlusForDirective
  | HSPlusForEachDirective
  | HSPlusWhileDirective
  | HSPlusIfDirective
  | HSPlusImportDirective
  | HSPlusVersionDirective
  | HSPlusMigrateDirective
  | HSPlusBindingsDirective
  | HSPlusExportDirective
  | HSPlusConfigDirective
  | HSPlusNamedConfigDirective;

// ── State migration (packages/core/src/migration/SchemaDiff.ts) ─────────────

export type FieldChangeKind =
  | 'added'
  | 'removed'
  | 'type-changed'
  | 'default-changed'
  | 'reactive-changed'
  | 'unchanged';

export interface FieldChange {
  kind: FieldChangeKind;
  key: string;
  oldValue?: HoloValue;
  newValue?: HoloValue;
  oldType?: string;
  newType?: string;
  requiresMigration: boolean;
}

export interface SchemaDiffResult {
  hasChanges: boolean;
  changes: FieldChange[];
  added: FieldChange[];
  removed: FieldChange[];
  typeChanged: FieldChange[];
  defaultChanged: FieldChange[];
  reactiveChanged: FieldChange[];
  requiresMigration: boolean;
  summary: string;
}

export interface MigrationStep {
  fromVersion: number;
  /** Statement list (parsed nodes) OR raw code string. */
  body: unknown[] | string;
}

export interface MigrationChain {
  fromVersion: number;
  toVersion: number;
  steps: MigrationStep[];
}

export function diffState(
  oldState: HoloState | undefined,
  newState: HoloState | undefined
): SchemaDiffResult;
export function buildMigrationChain(
  template: HoloTemplate,
  oldVersion: number,
  newVersion: number
): MigrationChain | null;
export function snapshotState(state: Map<string, HoloValue>): Map<string, HoloValue>;
export function applyAutoMigration(
  instanceState: Map<string, HoloValue>,
  diff: SchemaDiffResult,
  oldDefaults: Map<string, HoloValue>
): void;

// ── State machine AST node (packages/core/src/types.ts:735) ─────────────────

export interface StateMachineNode extends ASTNode {
  type: 'state-machine';
  name: string;
  initialState: string;
  states: any[];
  transitions: any[];
}

// ── Lip-sync (packages/core/src/traits/LipSyncTrait.ts) ─────────────────────

export interface PhonemeTimestamp {
  phoneme: string;
  time: number;
  duration: number;
  weight?: number;
}

// ── Culture / norms / WebRTC: NOT re-exported here.
//    These types live in \`@holoscript/framework/agents\` and \`@holoscript/mesh\`.
//    Engine consumers should import them DIRECTLY from those packages — both
//    are explicit dependencies of \`@holoscript/engine\`. Earlier attempts to
//    surface them through core's hand-crafted d.ts caused cascading TS2571
//    "Object is of type 'unknown'" errors because the minimal shapes here
//    couldn't keep up with the full method surface of \`CulturalMemory\` /
//    \`NormEngine\` classes. See engine/src/runtime/CultureRuntime.ts +
//    voice/VoiceManager.ts for the corrected import paths. ─────────────────

// ── Quaternion (packages/core/src/types/HoloScriptPlus.ts:26) ───────────────

export type Quaternion = [number, number, number, number];

// ── WebRTC transport (re-exported from @holoscript/mesh via
//    packages/core/src/barrel/registry-deploy-events.ts). Engine's
//    audio/VoiceManager.ts pulls a small subset; we mirror just that
//    surface here so the public d.ts isn't the wrong-shape lie that
//    blocked deploy pre-flight (W.099). Full surface lives in mesh. ─────────

export interface WebRTCTransportConfig {
  signalingUrl?: string;
  iceServers?: unknown[];
  [key: string]: unknown;
}

export class WebRTCTransport {
  constructor(config?: WebRTCTransportConfig);
  connect(): Promise<void>;
  disconnect(): void;
  setMicrophoneEnabled(enabled: boolean): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler?: (...args: unknown[]) => void): void;
}

// ── Theming (packages/core/src/theming/*) ────────────────────────────────────

export interface ThemeTokens {
  colors: Record<string, string>;
  spacing: Record<string, number>;
  borderRadius: Record<string, number>;
  fontSize: Record<string, number>;
  opacity: Record<string, number>;
  shadow: Record<string, string>;
}

export interface Theme {
  name: string;
  mode: 'light' | 'dark';
  tokens: ThemeTokens;
}

export declare const BuiltInThemes: Record<string, Theme>;

export class ThemeEngine {
  constructor();
  registerTheme(theme: Theme): void;
  setTheme(name: string): void;
  getTheme(): Theme;
  getTokens(): ThemeTokens;
  setOverrides(overrides: Partial<ThemeTokens>): void;
  resolve(path: string): unknown;
  onThemeChange(callback: (theme: Theme) => void): void;
  getActiveThemeName(): string;
  listThemes(): string[];
}

export interface StyleRule {
  selector: string;
  properties: Record<string, unknown>;
}

export interface ResolvedStyle {
  [key: string]: unknown;
}

export class StyleResolver {
  constructor();
  addRule(selector: string, properties: Record<string, unknown>): void;
  addRules(rules: StyleRule[]): void;
  resolve(
    type: string,
    classes?: string[],
    states?: string[],
    inline?: Record<string, unknown>
  ): ResolvedStyle;
  static fromTokens(tokens: ThemeTokens): StyleResolver;
  readonly ruleCount: number;
}

// ── Shared trait delegate (packages/core/src/traits/TraitTypes.ts:264) ───────

export interface TraitInstanceDelegate {
  onDetach?: (node: HSPlusNode, ctx: TraitContext) => void;
  onEvent?: (event: TraitEvent) => void;
  onUpdate?: (node: HSPlusNode, ctx: TraitContext, dt: number) => void;
  emit?: (event: TraitEvent) => void;
  dispose?: () => void;
  cleanup?: () => void;
  [key: string]: unknown;
}

// ── Engine-facing public compatibility types ────────────────────────────────

export interface ModuleImport {
  specifier: string;
  canonicalPath: string;
  named: string[];
  defaultImport?: string;
}

export interface ModuleExport {
  name: string;
  kind: 'object' | 'state' | 'template' | 'function' | 'unknown';
}

export interface ModuleHeader {
  imports: ModuleImport[];
  exports: ModuleExport[];
}

export interface CachedModule {
  canonicalPath: string;
  header: ModuleHeader;
  rawSource: string;
  cachedAt: number;
}

export class ModuleResolver {
  constructor(options?: {
    graph?: unknown;
    loader?: (canonicalPath: string) => string;
  });
  resolve(modulePath: string, fromFile: string): string;
  load(canonicalPath: string, fromFile?: string): CachedModule;
  invalidate(canonicalPath: string): void;
  getCached(canonicalPath: string): CachedModule | undefined;
  clearAll(): void;
}

export interface HotReloadConfig {
  watchPaths: string[];
  debounceMs: number;
  mode: 'soft' | 'hard';
  extensions: string[];
}

export interface HotReloadEvent {
  filePath: string;
  type: string;
  timestamp: number;
}

export type HotReloadCallback = (event: HotReloadEvent) => void;

export class HotReloadWatcher {
  constructor(config?: Partial<HotReloadConfig>);
  start(): void;
  stop(): void;
  on(event: string, listener: (...args: unknown[]) => void): this;
  off(event: string, listener: (...args: unknown[]) => void): this;
  emit(event: string, ...args: unknown[]): boolean;
}

export interface ScriptTestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
  assertions: number;
  passedAssertions: number;
}

export interface ScriptTestBlock {
  name: string;
  setup?: () => void;
  actions: Array<() => void>;
  assertions: Array<{ description: string; check: () => boolean }>;
  teardown?: () => void;
  skip?: boolean;
}

export interface ScriptTestRunnerOptions {
  debug?: boolean;
  timeout?: number;
  bail?: boolean;
  runtimeState?: Record<string, unknown>;
}

export class ScriptTestRunner {
  constructor(options?: ScriptTestRunnerOptions);
  setRuntimeState(state: Record<string, unknown>): void;
  addTest(test: ScriptTestBlock): void;
  runAll(): ScriptTestResult[];
}

export function hashBytes(input: Uint8Array | string, algo?: 'sha256' | 'fnv1a'): Promise<string>;

export type HologramShape =
  | 'orb'
  | 'cube'
  | 'cylinder'
  | 'pyramid'
  | 'sphere'
  | 'function'
  | 'gate'
  | 'stream'
  | 'server'
  | 'database'
  | 'fetch';

export type ResourceCategory =
  | 'particles'
  | 'physicsBodies'
  | 'audioSources'
  | 'meshInstances'
  | 'gaussians'
  | 'shaderPasses'
  | 'networkMsgs'
  | 'agentCount'
  | 'memoryMB'
  | 'gpuDrawCalls';

export const PLATFORM_BUDGETS: Record<string, Partial<Record<ResourceCategory, number>>>;

export interface InstallManifest {
  packageId: string;
  [key: string]: unknown;
}

// ── Host capabilities (packages/core/src/traits/TraitTypes.ts:134) ──────────

export interface HostCapabilities {
  fileSystem?: unknown;
  process?: unknown;
  network?: unknown;
  media?: unknown;
  depthInference?: unknown;
  gpuCompute?: unknown;
}

// Spatial MCP - 3D context as first-class MCP tool params
// (research/2026-05-07_spatial-mcp-spec.md, task_1778114195597_jira)

export declare const SPATIAL_CONTEXT_VERSION: '0.1';
export type SpatialContextVersion = typeof SPATIAL_CONTEXT_VERSION;
export declare const SPATIAL_FRAME: 'tracking-space-y-up-meters';
export type SpatialFrame = typeof SPATIAL_FRAME;

export type SpatialVec3 = readonly [number, number, number];
export interface SpatialQuat { x: number; y: number; z: number; w: number }
export interface SpatialAABB { min: SpatialVec3; max: SpatialVec3 }

export interface HandTransform {
  position: SpatialVec3;
  rotation: SpatialQuat;
  grip: number;
  pinch?: number;
}

export interface SpatialControllerPose {
  position: SpatialVec3;
  rotation: SpatialQuat;
  velocity?: SpatialVec3;
  angularVelocity?: SpatialVec3;
}

export interface SpatialMCPGazeRay {
  origin: SpatialVec3;
  direction: SpatialVec3;
  hitDistance?: number;
}

export interface HeadsetPose {
  position: SpatialVec3;
  rotation: SpatialQuat;
}

export interface RoomGeometry {
  pointCloudPly?: string;
  aabb?: SpatialAABB;
  floorHeight?: number;
}

export interface SpatialMCPContext {
  version: SpatialContextVersion;
  frame: SpatialFrame;
  room?: RoomGeometry;
  gaze?: SpatialMCPGazeRay;
  hands?: { left?: HandTransform; right?: HandTransform };
  controllers?: { left?: SpatialControllerPose; right?: SpatialControllerPose };
  headset?: HeadsetPose;
  meta?: Record<string, string | number | boolean>;
}

export type ScenePatchOp =
  | { op: 'spawn'; id: string; position: SpatialVec3; trait?: string }
  | { op: 'move'; id: string; position: SpatialVec3 }
  | { op: 'highlight'; id: string; color?: string }
  | { op: 'remove'; id: string };

export interface SpatialMCPResponse {
  text: string;
  holo?: string;
  scenePatch?: ScenePatchOp[];
  frame: SpatialFrame;
  version: SpatialContextVersion;
}

export interface SpatialValidationError { path: string; message: string }
export interface SpatialValidationResult { ok: boolean; errors: SpatialValidationError[] }
export declare function validateSpatialContext(input: unknown): SpatialValidationResult;

export interface PlacementChoice {
  position: SpatialVec3;
  source:
    | 'gaze-hit'
    | 'gaze-ray'
    | 'hand-right'
    | 'hand-left'
    | 'controller-right'
    | 'controller-left'
    | 'aabb-center'
    | 'headset'
    | 'origin';
}
export declare function pickPlacement(ctx: SpatialMCPContext): PlacementChoice;

// Hologram MCP Response - content_type schema for tools whose response
// payload IS a hologram (.holo / quilt / MV-HEVC), not text.
// (task_1778114362909_zp7u)

export declare const HOLOGRAM_MCP_VERSION: '0.1';
export type HologramMcpVersion = typeof HOLOGRAM_MCP_VERSION;

export declare const HOLOGRAM_CONTENT_TYPES: {
  readonly holo: 'application/holoscript+holo';
  readonly quilt: 'application/holoscript+quilt';
  readonly mvhevc: 'application/holoscript+mvhevc';
  readonly parallax: 'application/holoscript+parallax';
};

export type HologramContentType =
  | 'application/holoscript+holo'
  | 'application/holoscript+quilt'
  | 'application/holoscript+mvhevc'
  | 'application/holoscript+parallax';

export interface HologramBundleHashRef {
  kind: 'hash';
  hash: string;
  studioBase?: string;
}
export interface HologramBundleUrlRef {
  kind: 'url';
  url: string;
  mimeType?: string;
}
export interface HologramBundleHoloCodeRef {
  kind: 'holo-code';
  holoCode: string;
}
export type HologramBundleRef =
  | HologramBundleHashRef
  | HologramBundleUrlRef
  | HologramBundleHoloCodeRef;

export interface HologramRenderHints {
  preferredViewer?: 'parallax' | 'quilt' | 'mvhevc' | 'auto';
  size?: readonly [number, number];
  background?: string;
  animate?: boolean;
}

export interface HologramMcpMeta {
  producedBy: string;
  createdAt: string;
  label?: string;
  caption?: string;
  [extra: string]: unknown;
}

export interface HologramMcpResponse {
  content_type: HologramContentType;
  payload: HologramBundleRef;
  hints?: HologramRenderHints;
  meta: HologramMcpMeta;
  text: string;
  version: HologramMcpVersion;
}

export interface HologramMcpEnvelope {
  content: Array<{ type: 'text'; text: string }>;
  hologramContent: HologramMcpResponse;
  isError?: false;
}

export interface HologramMcpValidationError { path: string; message: string }
export interface HologramMcpValidationResult { ok: boolean; errors: HologramMcpValidationError[] }
export declare function validateHologramMcpResponse(value: unknown): HologramMcpValidationResult;
export declare function isHologramMcpResponse(value: unknown): value is HologramMcpResponse;
export declare function detectHologramContent(envelope: unknown): HologramMcpResponse | null;
export declare function buildHologramMcpResponse(input: {
  contentType: HologramContentType;
  payload: HologramBundleRef;
  text: string;
  producedBy: string;
  createdAt?: string;
  label?: string;
  caption?: string;
  hints?: HologramRenderHints;
  extraMeta?: Record<string, unknown>;
}): HologramMcpResponse;
export declare function wrapHologramMcpEnvelope(response: HologramMcpResponse): HologramMcpEnvelope;

// ============================================================================
// ENGINE-PUBLIC TYPES (missing from generate-types.mjs — consumed by @holoscript/engine)
// ============================================================================

export declare class ThemeEngine {
  registerTheme(theme: Theme): void;
  setTheme(name: string): void;
  getTheme(): Theme;
  getTokens(): ThemeTokens;
  setOverrides(overrides: Partial<ThemeTokens>): void;
  resolve(path: string): unknown;
  onThemeChange(callback: (theme: Theme) => void): void;
  [key: string]: unknown;
}

export declare interface Theme {
  name: string;
  mode: 'light' | 'dark';
  tokens: ThemeTokens;
}

export declare interface ThemeTokens {
  colors: Record<string, string>;
  spacing: Record<string, number>;
  borderRadius: Record<string, number>;
  fontSize: Record<string, number>;
  opacity: Record<string, number>;
  shadow: Record<string, string>;
}

export declare class StyleResolver {
  static fromTokens(tokens: ThemeTokens): StyleResolver;
  addRule(selector: string, properties: Record<string, any>): void;
  addRules(rules: { selector: string; properties: Record<string, any> }[]): void;
  resolve(type: string, classes?: string[], states?: string[], inline?: Record<string, any>): Record<string, unknown>;
  [key: string]: unknown;
}

export declare class ModuleResolver {
  resolve(id: string): unknown;
  [key: string]: unknown;
}

export declare class HotReloadWatcher {
  watch(path: string): void;
  [key: string]: unknown;
}

export declare type HotReloadConfig = unknown;

export declare class ScriptTestRunner {
  [key: string]: unknown;
}

export declare function hashBytes(input: Uint8Array | string, algo?: 'sha256' | 'fnv1a'): Promise<string>;

export declare type HologramShape = 'orb' | 'cube' | 'cylinder' | 'pyramid' | 'sphere' | 'function' | 'gate' | 'stream' | 'server' | 'database' | 'fetch';

export declare type ResourceCategory = 'particles' | 'physicsBodies' | 'audioSources' | 'meshInstances' | 'gaussians' | 'shaderPasses' | 'networkMsgs' | 'agentCount' | 'memoryMB' | 'gpuDrawCalls';

export declare const PLATFORM_BUDGETS: Record<string, Partial<Record<ResourceCategory, number>>>;

export declare type InstallManifest = unknown;

export declare interface TraitInstanceDelegate {
  onDetach?: (node: any, ctx: any) => void;
  onEvent?: (event: any) => void;
  onUpdate?: (node: any, ctx: any, dt: number) => void;
  emit?: (event: any) => void;
  dispose?: () => void;
  cleanup?: () => void;
  [key: string]: unknown;
}
`;

const parserDTS = `import type {
  HSPlusParseResult,
  HSPlusParserOptions,
} from './index.js';

export type {
  ASTProgram,
  HSPlusCompileResult,
  HSPlusNode,
  HSPlusParseResult,
  HSPlusParserOptions,
  HSPlusStructField,
} from './index.js';

export class HoloScriptPlusParser {
  constructor(options?: HSPlusParserOptions);
  parse(source: string): HSPlusParseResult;
}
export function parse(source: string, options?: HSPlusParserOptions): HSPlusParseResult;
export function createParser(options?: HSPlusParserOptions): HoloScriptPlusParser;
export interface HoloSourceToken {
  type: string;
  value: string;
  line: number;
  column: number;
}
export class HoloCompositionParser {
  constructor(options?: any);
  parse(source: string): any;
}
export function tokenizeHoloSource(source: string): HoloSourceToken[];
export function parseHolo(source: string, options?: any): any;
export function parseHoloStrict(source: string, options?: any): any;
export function parseHoloPartial(source: string, options?: any): any;
export type HoloParseResult = any;
export type HoloParseError = any;
export type HoloParserOptions = any;
`;

const runtimeDTS = `// @holoscript/core/runtime — engine/mesh/framework-backed runtime surface.
// Hand-crafted to mirror src/runtime.ts exactly (the value surface of dist/runtime.js).
// Requires the optional peers (@holoscript/engine, @holoscript/mesh, @holoscript/framework) installed.

export class HoloScriptRuntime {
  execute(ast: any, context?: any): Promise<any>;
  executeProgram(nodes: ASTNode[], depth?: number): Promise<ExecutionResult[]>;
  getContext(): RuntimeContext;
  registerTrait(name: string, handler: unknown): void;
  startVisualizationServer(port?: number): void;
  reset(): void;
}

export interface RuntimeContext { [key: string]: any; }
export interface RuntimeOptions { [key: string]: any; }
export interface Renderer { [key: string]: any; }
export interface ExecutionResult { success: boolean; output?: any; hologram?: any; spatialPosition?: any; error?: string; executionTime?: number; learningSignals?: Record<string, any>; result?: any; duration?: number; memoryUsed?: number; }

export class HoloScriptPlusRuntimeImpl {
  constructor(options?: RuntimeOptions);
  execute(ast: any, context?: any): Promise<ExecutionResult>;
  createRenderer(config?: any): Renderer;
  getState(): Record<string, any>;
  setState(updates: Record<string, any>): void;
  dispose(): void;
}

export function createRuntime(options?: RuntimeOptions): HoloScriptPlusRuntimeImpl;

// --- plugin-trait-registrar ---
export interface TraitRegistrarTarget { registerTrait(name: string, handler: unknown): void; }
export function registerPluginTraits(target: TraitRegistrarTarget, pluginId: string, handlers: readonly unknown[]): void;

// --- Local runtime symbols (cannot be re-exported from peer subpaths) ---
export class HoloScriptAgentRuntime {
  constructor(...args: any[]);
  [key: string]: any;
}
export type AgentSeed = any;
export type DurableAgentState = any;
export type LosableAgentState = any;

export class HoloScriptDebugger {
  debug(ast: any): any;
  on(event: string, callback: any): void;
  start(): void;
  stop(): void;
  loadSource(source: string, path?: string): { success: boolean; errors?: string[] };
  clearBreakpoints(): void;
  setBreakpoint(line: number, options?: any): any;
  continue(): void;
  stepOver(): void;
  stepInto(): void;
  stepOut(): void;
  pause(): void;
  getCallStack(): any[];
  getState(): any;
  getRuntime(): any;
  evaluate(expression: string, frameId?: number): any;
  getVariables(frameId?: number): any;
}
export function createDebugger(options?: any): HoloScriptDebugger;

// --- framework/ai ---
export { BehaviorTree, BTNode, SequenceNode, SelectorNode, ParallelNode, InverterNode, RepeaterNode, GuardNode, ActionNode, ConditionNode, WaitNode, Blackboard, StateMachine } from '@holoscript/framework/ai';
// --- framework/agents ---
export { CulturalMemory, NormEngine, negotiateHandoff, createMVCPayload, estimatePayloadSize, validatePayloadBudget, signOperation, verifyOperation, LWWRegister, GCounter, ORSet, createAgentState, setRegister, getRegister, incrementCounter, getCounter, mergeStates, AgentRegistry, getDefaultRegistry, resetDefaultRegistry } from '@holoscript/framework/agents';
// --- framework/swarm ---
export { SwarmCoordinator, LeaderElection, CollectiveIntelligence, SwarmManager, SwarmMembership, SwarmMetrics, SwarmInspector } from '@holoscript/framework/swarm';
// --- framework/training ---
export { SparsityMonitor, createSparsityMonitor } from '@holoscript/framework/training';
// --- engine ---
export { DialogueGraph, DialogueRunner } from '@holoscript/engine/dialogue';
export { CameraController } from '@holoscript/engine/camera';
export { InventorySystem } from '@holoscript/engine/gameplay';
export { TerrainSystem } from '@holoscript/engine/environment';
export { LightingModel, ShaderGraph, SHADER_NODES } from '@holoscript/engine/rendering';
export { CombatManager } from '@holoscript/engine/combat';
export { AStarPathfinder, NavMesh } from '@holoscript/engine/navigation';
export { ParticleSystem } from '@holoscript/engine/particles';
export { LODManager } from '@holoscript/engine/world';
export { InputManager } from '@holoscript/engine/input';
export { CultureRuntime } from '@holoscript/engine/runtime';
export { GaussianSplatExtractor } from '@holoscript/engine/gpu';
export { ChoreographyEngine, getDefaultEngine, resetDefaultEngine } from '@holoscript/engine/choreography';
// --- mesh ---
export { CollaborationSession, NetworkManager, WebRTCTransport } from '@holoscript/mesh';
export { ConsensusManager } from '@holoscript/mesh/consensus';
export { AgentMessaging } from '@holoscript/mesh/messaging';
`;

const typeCheckerDTS = `export class HoloScriptTypeChecker {
  check(ast: any): any;
  getType(node: any): any;
}
`;

const debuggerDTS = `export class HoloScriptDebugger {
  debug(ast: any): any;
  on(event: string, callback: any): void;
  start(): void;
  stop(): void;
  loadSource(source: string, path?: string): { success: boolean; errors?: string[] };
  clearBreakpoints(): void;
  setBreakpoint(line: number, options?: Partial<Breakpoint>): any; // Return type Breakpoint but any is fine for mock
  continue(): void;
  stepOver(): void;
  stepInto(): void;
  stepOut(): void;
  pause(): void;
  getCallStack(): any[];
  getState(): any;
  getRuntime(): any;
  evaluate(expression: string, frameId?: number): any;
  getVariables(frameId?: number): any;
}
`;

const wotDTS = `export interface WoT {}
`;

// ============================================================================
// SUBPATH BARREL DECLARATIONS
// ============================================================================

const traitsDTS = `/**
 * @holoscript/core/traits — Trait System Type Declarations
 */

export interface Trait {
  name: string;
  [key: string]: any;
}

export interface HostCapabilities {
  fileSystem?: HostFileSystemCapabilities;
  process?: HostProcessCapabilities;
  network?: HostNetworkCapabilities;
}

export interface HostFileSystemCapabilities {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  listDir(path: string): Promise<string[]>;
  exists(path: string): Promise<boolean>;
}

export interface HostProcessCapabilities {
  exec(command: string, options?: HostExecOptions): Promise<HostExecResult>;
}

export interface HostExecOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

export interface HostExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface HostNetworkCapabilities {
  fetch(url: string, options?: HostNetworkRequestOptions): Promise<HostNetworkResponse>;
}

export interface HostNetworkRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export interface HostNetworkResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface TraitContext {
  node: any;
  emit(event: string, payload?: any): void;
  getState(): Record<string, any>;
  setState(updates: Record<string, any>): void;
  hostCapabilities?: HostCapabilities;
  [key: string]: any;
}

export type TraitEvent = {
  type: string;
  [key: string]: any;
};

export interface TraitHandler<T = any> {
  name: string;
  defaultConfig?: T;
  onAttach?: (node: any, config: T, context: TraitContext) => void | Promise<void>;
  onDetach?: (node: any, config: T, context: TraitContext) => void | Promise<void>;
  onUpdate?: (node: any, config: T, context: TraitContext, delta: number) => void | Promise<void>;
  onEvent?: (node: any, config: T, context: TraitContext, event: TraitEvent) => void | Promise<void>;
  [key: string]: any;
}

export declare const SEMANTIC_CUSTODY_SCHEMA: 'holoscript.semantic-custody.v2';
export interface SemanticCustodyBindingV2 {
  schema: typeof SEMANTIC_CUSTODY_SCHEMA;
  message_id: string;
  action: string;
  sender: string;
  recipient: string;
  nonce: string;
  axis_1_id: string;
  axis_2_id: string;
  payload_digest: string;
  surface_id: string;
  holokey: string;
}
export interface HoloMeshSignedSemanticEnvelope {
  body: SemanticCustodyBindingV2;
  signature: string;
  signer_address: string;
  nonce: string;
  timestamp: string;
}
export interface SemanticCustodyEnvelope {
  schema: typeof SEMANTIC_CUSTODY_SCHEMA;
  signed: HoloMeshSignedSemanticEnvelope;
}
export interface SemanticCustodyMessageLike {
  version: '2.0';
  message_id: string;
  from: string;
  to: string;
  created_at_ms: number;
  action: string;
  nonce: string;
  pillar_slice: {
    axis_1_id: string;
    axis_2_id: string;
  };
  provenance: {
    surface_id: string;
    holokey: string;
    signer_address: string;
  };
  brain_coord?: unknown;
  receipt?: unknown;
  scene_delta?: unknown;
  task_state?: unknown;
  confidence?: number;
  payload?: Record<string, unknown>;
  parallel_slice?: unknown;
  text_boundary?: string;
  custody?: SemanticCustodyEnvelope;
}
export interface SemanticCustodyVerification {
  valid: boolean;
  signer: string | null;
  reason?: string;
}
export type SemanticCustodyVerifier = (
  envelope: HoloMeshSignedSemanticEnvelope
) => Promise<SemanticCustodyVerification>;
export interface SemanticReplayStore {
  claim(signer: string, nonce: string): boolean | Promise<boolean>;
}
export declare class InMemorySemanticReplayStore implements SemanticReplayStore {
  claim(signer: string, nonce: string): boolean;
  clear(): void;
}
export type SemanticCustodyFailureReason =
  | 'missing-custody'
  | 'schema-version'
  | 'binding-mismatch'
  | 'payload-digest'
  | 'signature'
  | 'signer-mismatch'
  | 'replay';
export interface SemanticCustodyReceipt {
  schema: 'holoscript.semantic-custody-receipt.v1';
  accepted: true;
  message_id: string;
  action: string;
  sender: string;
  recipient: string;
  nonce: string;
  signer_address: string;
  payload_digest: string;
  receipt_digest: string;
}
export type SemanticCustodyAdmission =
  | { ok: true; receipt: SemanticCustodyReceipt }
  | { ok: false; reason: SemanticCustodyFailureReason; detail?: string };
export declare function computeSemanticPayloadDigest(
  message: SemanticCustodyMessageLike
): Promise<string>;
export declare function buildSemanticCustodyBinding(
  message: SemanticCustodyMessageLike
): Promise<SemanticCustodyBindingV2>;
export declare function admitSemanticCustodyMessage(
  message: SemanticCustodyMessageLike,
  options: {
    verifySignedEnvelope: SemanticCustodyVerifier;
    replayStore: SemanticReplayStore;
  }
): Promise<SemanticCustodyAdmission>;
export declare function getSemanticCustodyReceipt(
  message: object
): SemanticCustodyReceipt | undefined;

export type PerceptualColorMode = 'auto' | 'palette' | 'gradient' | 'color_map';
export interface PerceptualGradientStop { t: number; color: string; }
export interface PerceptualColorConfig {
  mode: PerceptualColorMode;
  palette: string[];
  gradient: PerceptualGradientStop[];
  color_map: string;
  steps: number;
  dampening: number;
  target_delta_e: number;
  neutral_axis: boolean;
  scientific: boolean;
  emit_analysis: boolean;
}
export interface PerceptualColorAnalysis {
  color: string;
  lightness: number;
  chroma: number;
  hue: number;
  nearestNeutral: string;
}
export interface PerceptualColorTraitOutput {
  mode: PerceptualColorMode;
  palette?: string[];
  gradient?: PerceptualGradientStop[];
  colorMap?: string;
  analysis?: PerceptualColorAnalysis[];
  compilerColorPass: any;
}
export interface PerceptualColorState {
  revisions: number;
  lastApplied: PerceptualColorTraitOutput | null;
}
export const perceptualColorHandler: TraitHandler<PerceptualColorConfig>;

export type MeshClassification =
  | 'none'
  | 'wall'
  | 'floor'
  | 'ceiling'
  | 'table'
  | 'seat'
  | 'window'
  | 'door'
  | 'stairs'
  | 'bed'
  | 'counter'
  | 'unknown';
export interface RealityKitMeshConfig {
  mesh_classification: boolean;
  physics_enabled: boolean;
  occlusion_enabled: boolean;
  collision_margin: number;
  update_frequency: number;
  max_anchor_distance: number;
  render_wireframe: boolean;
}
export const realityKitMeshHandler: TraitHandler<RealityKitMeshConfig>;

export type RoomMeshResolution = 'low' | 'medium' | 'high';
export type SemanticSurface = 'floor' | 'wall' | 'ceiling' | 'furniture' | 'unknown';
export interface RoomMeshConfig {
  resolution: RoomMeshResolution;
  update_rate: number;
  semantic_labeling: boolean;
  room_boundary_detection: boolean;
  physics_collider: boolean;
  merge_adjacent_blocks: boolean;
  visible: boolean;
  wireframe: boolean;
}
export const roomMeshHandler: TraitHandler<RoomMeshConfig>;

export type ReconstructionMode =
  | 'realtime'
  | 'high_fidelity'
  | 'room_scan'
  | 'object_scan'
  | 'semantic_mesh';
export type MeshDetail = 'low' | 'medium' | 'high';
export type SemanticLabel =
  | 'floor'
  | 'ceiling'
  | 'wall'
  | 'table'
  | 'chair'
  | 'window'
  | 'door'
  | 'unknown';
export interface SceneReconstructionConfig {
  reconstruction_mode: ReconstructionMode;
  mesh_detail: MeshDetail;
  semantic_labeling: boolean;
  physics_collision: boolean;
  occlusion_enabled: boolean;
  update_interval_ms: number;
  max_mesh_faces: number;
}
export const sceneReconstructionHandler: TraitHandler<SceneReconstructionConfig>;

export interface AccessibilityContext {
  screenReader?: boolean;
  highContrast?: boolean;
  motionReduced?: boolean;
}

export interface VRContext {
  headset?: string;
  controllers?: any[];
  handTracking?: boolean;
}

export class VRTraitRegistry {
  register(handler: TraitHandler): void;
  unregister(name: string): void;
  get(name: string): TraitHandler | undefined;
  getHandler(name: string): TraitHandler | undefined;
  getAll(): TraitHandler[];
  handleEventForAllTraits(node: any, ctx: TraitContext, event: TraitEvent): void;
}

export const vrTraitRegistry: VRTraitRegistry;

export interface TraitPlatformSupport {
  platform: string;
  supported: boolean;
  notes?: string;
}

export interface TraitMatrixEntry {
  traitName: string;
  platforms: TraitPlatformSupport[];
}

export interface TraitSupportMatrixData {
  entries: TraitMatrixEntry[];
  generatedAt: string;
}

export function generateTraitSupportMatrix(traitDir: string): Promise<TraitSupportMatrixData>;
export function matrixToJSON(matrix: TraitSupportMatrixData): string;
export function matrixToYAML(matrix: TraitSupportMatrixData): string;

export interface Memory {
  id: string;
  key: string;
  content: string;
  tags: string[];
  embedding: number[] | null;
  createdAt: number;
  accessedAt: number;
  accessCount: number;
  ttl: number | null;
  source: string;
}

export interface MemoryRecallResult {
  memory: Memory;
  score: number;
}

export interface AgentMemoryConfig {
  max_memories: number;
  default_ttl: number | null;
  embedding_model: 'local' | 'openai' | 'none';
  embedding_dim: number;
  auto_compress: boolean;
  compress_prompt: string;
  sync_to_postgres: boolean;
  postgres_url: string;
  db_name: string;
}

export interface AgentMemoryState {
  memories: Map<string, Memory>;
  db: IDBDatabase | null;
  isReady: boolean;
  totalStored: number;
  totalRecalled: number;
  totalCompressed: number;
}

export const agentMemoryHandler: TraitHandler<AgentMemoryConfig>;

export interface JEPAPredictorConfig {
  latentDim: number;
  condDim: number;
}

export interface JEPAPredictorWeights {
  W1: Float32Array;
  b1: Float32Array;
  W2: Float32Array;
  b2: Float32Array;
}

export interface JEPAPredictorForwardResult {
  predicted: Float32Array;
  hidden: Float32Array;
}

export class JEPAPredictor {
  readonly latentDim: number;
  readonly condDim: number;
  constructor(config: JEPAPredictorConfig, weights?: JEPAPredictorWeights);
  forward(contextEmb: Float32Array, conditioning?: Float32Array | null): JEPAPredictorForwardResult;
  setWeights(weights: JEPAPredictorWeights): void;
  getWeights(): Readonly<JEPAPredictorWeights>;
  plan(currentState: string, candidateActions: string[]): {
    action: string;
    predicted: Float32Array;
    confidence: number;
  };
}

export class TraitCompositor {
  [key: string]: any;
}

export declare const COMPOSITION_RULES: any;

export class ECSWorld {
  [key: string]: any;
}

export declare const ComponentType: any;

export class MoMETraitDatabase {
  [key: string]: any;
}

export interface EmergentSpacetimeConfig {
  initial_voxels?: number;
  max_voxels?: number;
  seed?: number;
  force_layout_guard?: boolean;
  ricci_error_bound?: number;
  ricci_heatmap?: boolean;
  loop_threshold?: number;
  real_time_budget_ms?: number;
}

export interface EmergentSpacetimeState {
  network: {
    voxels: Map<string, any>;
    edges: any[];
    loopCount: number;
  };
  hubbleCorrection: number;
  violationCount: number;
  lastRicciError: number;
  isSimulating: boolean;
}

export const emergentSpacetimeHandler: TraitHandler<EmergentSpacetimeConfig>;

export interface NormalizedFaceLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
  presence?: number;
}
export interface WebcamGazeSample {
  gaze_x: number;
  gaze_y: number;
  foveal_center: [number, number];
  confidence: number;
  timestamp: number;
  source: 'webcam';
}
export interface WebcamGazeConfig {
  auto_start: boolean;
  video_width: number;
  video_height: number;
  sample_rate_hz: number;
  confidence_threshold: number;
  wasm_base_path: string;
  model_asset_path: string;
  gaze_gain_x: number;
  gaze_gain_y: number;
  max_ray_angle_degrees: number;
}
export const DEFAULT_WEBCAM_GAZE_CONFIG: WebcamGazeConfig;
export class WebcamGazeTracker {
  constructor(options: {
    config: WebcamGazeConfig;
    videoElement?: HTMLVideoElement | null;
    onSample: (sample: WebcamGazeSample) => void;
    onError?: (error: Error) => void;
  });
  getStream(): MediaStream | null;
  getVideoElement(): HTMLVideoElement | null;
  start(): Promise<void>;
  stop(): void;
}
export function estimateWebcamGazeFromLandmarks(
  landmarks: readonly NormalizedFaceLandmark[],
  config?: Partial<WebcamGazeConfig>
): WebcamGazeSample | null;
export function webcamGazeToRay(
  sample: Pick<WebcamGazeSample, 'foveal_center'>,
  maxAngleDegrees?: number
): [number, number, number];
export const webcamGazeHandler: TraitHandler<WebcamGazeConfig>;

// ── Domain plugins are NOT re-exported from core ──────────────────────────────
// Core must not statically depend on domain plugins — plugins are data, not code
// (CLAUDE.md / NORTH_STAR). Re-exporting them (even type-only) forced every
// consumer of '@holoscript/core/traits' to resolve each plugin's types, which
// point at source, dragging ~189 plugin source files (incl. .tsx importing
// react/three) into slim builds → TS2307 (broke Studio deploy 2026-05-26).
// Import a plugin directly from its own package, e.g. '@holoscript/radio-astronomy-plugin'.

// ── Quantum-Inspired optimization trait ──────────────────────────────────────
// (packages/core/src/traits/QuantumInspiredTrait.ts)

/** Minimal subset of SnnAccelerator the trait depends on. */
export interface SnnAcceleratorLike {
  readonly available: boolean;
  initialize(opts?: { enableSnn?: boolean; snnTimesteps?: number }): Promise<void>;
  encode(histogram: Float32Array): Promise<Float32Array>;
  dispose(): void;
}

/** Factory that constructs an SnnAcceleratorLike instance on demand. */
export type SnnAcceleratorProvider = () => SnnAcceleratorLike;

export interface QuantumInspiredConfig {
  /** Number of LIF neurons for population coding. Default: 128. */
  numNeurons: number;
  /** Scalar learning-rate exposed to .hs authors. Default: 0.01. */
  learningRate: number;
  /** LIF simulation timesteps per encode call. Default: 50. */
  snnTimesteps: number;
  /**
   * Optional factory for a concrete SnnAcceleratorLike.
   * Inject () => new SnnAccelerator() from @holoscript/holoembed for GPU.
   * Omit for pure-CPU sigmoid fallback.
   */
  acceleratorProvider?: SnnAcceleratorProvider;
}

export declare const quantumInspiredHandler: TraitHandler<QuantumInspiredConfig>;
`;

const botanicalLotusDTS = `/**
 * @holoscript/core/traits/botanical-lotus — narrow botanical trait surface
 *
 * This subpath intentionally avoids the full traits barrel because that barrel
 * imports every domain plugin. Browser renderers can use this contract without
 * bundling the entire plugin universe.
 */

export type BotanicalLotusAnchorStatus =
  | 'pending_media_ingest'
  | 'hashed'
  | 'wallet_signed';

export interface BotanicalLotusColors {
  petal_base: string;
  petal_mid: string;
  petal_inner: string;
  petal_rim: string;
  petal_shadow: string;
  seed_pod: string;
  seed_pod_rim: string;
  stamen: string;
  stamen_tip: string;
  leaf: string;
  leaf_dark: string;
  water: string;
}

export interface BotanicalLotusReferenceAnchor {
  id: string;
  label: string;
  uri: string;
  role: string;
  status: BotanicalLotusAnchorStatus;
  content_hash?: string;
  wallet_signature?: string;
  mime_type?: string;
  width?: number;
  height?: number;
}

export interface BotanicalLotusMaterial {
  subsurface_scattering: number;
  subsurface_radius_rgb: readonly [number, number, number];
  petal_translucency_base: number;
  petal_translucency_edge: number;
  roughness: number;
  ior: number;
  vein_normal_intensity: number;
  edge_curl_intensity: number;
  gravity_sag_outer: number;
  sheen: number;
  sheen_roughness: number;
  sheen_color: string;
}

export interface BotanicalLotusPetalRing {
  name: 'inner' | 'mid' | 'outer' | (string & {});
  count: number;
  cup: number;
  gravity_sag: number;
}

export interface BotanicalLotusGeometry {
  petal_rings: readonly BotanicalLotusPetalRing[];
  petal_shape: string;
  stamen_filament_count: number;
  seed_pod_dot_pattern: string;
}

export interface BotanicalLotusSource {
  kind: string;
  count: number;
  content_hash_status: BotanicalLotusAnchorStatus;
  wallet_signature_status: 'pending_cael_anchor' | 'wallet_signed';
  note: string;
}

export interface BotanicalLotusRendererHints {
  requires: readonly string[];
  lod: { close: string; mid: string; far: string };
  material_model: string;
}

export interface BotanicalLotusPlacement {
  surface_anchor_id?: string;
  surface_normal?: readonly [number, number, number];
  world_position?: readonly [number, number, number];
}

export interface BotanicalLotusLighting {
  reference_id?: string;
  estimated_lux?: number;
  color_temperature_k?: number;
  dominant_direction?: readonly [number, number, number];
}

export interface BotanicalLotusConfig {
  schema: 'holoscript.trait.botanical_lotus.v0';
  status: 'visual_seed' | 'content_hashed' | 'wallet_signed';
  source: BotanicalLotusSource;
  reference_anchors: readonly BotanicalLotusReferenceAnchor[];
  material: BotanicalLotusMaterial;
  colors: BotanicalLotusColors;
  geometry: BotanicalLotusGeometry;
  renderer: BotanicalLotusRendererHints;
}

export type BotanicalLotusConfigInput = Partial<
  Omit<BotanicalLotusConfig, 'source' | 'material' | 'colors' | 'geometry' | 'renderer'>
> & {
  source?: Partial<BotanicalLotusSource>;
  material?: Partial<BotanicalLotusMaterial>;
  colors?: Partial<BotanicalLotusColors>;
  geometry?: Partial<Omit<BotanicalLotusGeometry, 'petal_rings'>> & {
    petal_rings?: readonly BotanicalLotusPetalRing[];
  };
  renderer?: Partial<BotanicalLotusRendererHints>;
};

export interface BotanicalLotusRenderPetalRing {
  name: string;
  count: number;
  radius: number;
  length: number;
  width: number;
  cup: number;
  gravity_sag: number;
  pitch_degrees: number;
}

export interface BotanicalLotusRenderProfile {
  trait: 'botanical_lotus';
  anchor_status: BotanicalLotusAnchorStatus;
  wallet_signed: boolean;
  petal_count: number;
  petal_rings: readonly BotanicalLotusRenderPetalRing[];
  pbr_uniforms: {
    subsurface_scattering: number;
    subsurface_radius_rgb: readonly [number, number, number];
    transmission: number;
    thickness: number;
    roughness: number;
    ior: number;
    vein_normal_intensity: number;
    sheen: number;
    sheen_roughness: number;
    sheen_color: string;
  };
  colors: BotanicalLotusColors;
  stamen_filament_count: number;
  seed_pod_dot_pattern: string;
  reference_anchor_ids: readonly string[];
  renderer_requires: readonly string[];
  surface_anchor_id?: string;
  lighting_reference?: string;
}

export interface BotanicalLotusValidationResult {
  ok: boolean;
  errors: readonly string[];
  config: BotanicalLotusConfig;
}

export declare const DEFAULT_BOTANICAL_LOTUS_CONFIG: BotanicalLotusConfig;
export declare function normalizeBotanicalLotusConfig(input?: BotanicalLotusConfigInput): BotanicalLotusConfig;
export declare function validateBotanicalLotusConfig(input?: BotanicalLotusConfigInput): BotanicalLotusValidationResult;
export declare function assertBotanicalLotusConfig(input?: BotanicalLotusConfigInput): BotanicalLotusConfig;
export declare function deriveBotanicalLotusAnchorStatus(
  anchors: readonly BotanicalLotusReferenceAnchor[]
): BotanicalLotusAnchorStatus;
export declare function getBotanicalLotusPetalCount(input?: BotanicalLotusConfigInput): number;
export declare function createBotanicalLotusRenderProfile(
  input?: BotanicalLotusConfigInput,
  placement?: BotanicalLotusPlacement,
  lighting?: BotanicalLotusLighting
): BotanicalLotusRenderProfile;
export declare const botanicalLotusHandler: unknown;

// --- Scene compiler (.holo composition -> deterministic lotus scene) ---------

export type LotusBloomState = 'sealed' | 'budding' | 'blooming' | 'full' | 'wilted';

export interface LotusCompositionObject {
  name?: string;
  properties?: ReadonlyArray<{ key: string; value: unknown }>;
  traits?: ReadonlyArray<{ name: string; config?: Record<string, unknown> }>;
}

export interface LotusSceneRing {
  ring: 1 | 2 | 3;
  count: number;
  radius: number;
  length: number;
  width: number;
  cup: number;
  gravity_sag: number;
  height: number;
}

export interface LotusScenePetal {
  index: number;
  ring: 1 | 2 | 3;
  ringIndex: number;
  angle: number;
  radius: number;
  length: number;
  width: number;
  cup: number;
  gravitySag: number;
  height: number;
  color: string;
  bloom: LotusBloomState;
  label: string;
  title: string;
}

export interface LotusScene {
  seed: string;
  golden_angle_deg: number;
  growth_seconds: number;
  rings: LotusSceneRing[];
  petals: LotusScenePetal[];
  material: BotanicalLotusRenderProfile['pbr_uniforms'];
  colors: BotanicalLotusColors;
  stamen_filament_count: number;
  seed_pod_dot_pattern: string;
}

export declare const LOTUS_GOLDEN_ANGLE_DEG: number;
export declare const LOTUS_GROWTH_SECONDS: number;
export declare const LOTUS_GENESIS_SEED_PLACEHOLDER: string;
export declare const LOTUS_RING_SCALING: Record<
  1 | 2 | 3,
  { radius: number; length: number; width: number; height: number }
>;
export declare const LOTUS_OUTER_PETAL_COLOR: string;

export declare function deriveLotusBloomFromGlow(intensity: number, pulse: boolean): LotusBloomState;
export declare function lotusPetalRenderColor(
  ring: 1 | 2 | 3,
  isRoot: boolean,
  colors: BotanicalLotusColors
): string;
export declare function buildLotusSceneFromComposition(
  objects: ReadonlyArray<LotusCompositionObject>,
  profile?: BotanicalLotusRenderProfile,
  options?: { seed?: string }
): LotusScene;

export declare const LOTUS_PETAL_SHADER_CHUNKS: {
  readonly vertexHeader: string;
  readonly vertexBend: string;
  readonly vertexWorld: string;
  readonly fragmentHeader: string;
  readonly fragmentNormalInjection: string;
  readonly fragmentColorInjection: string;
  readonly fragmentEmissiveInjection: string;
};

export interface LotusShaderChunkEntry {
  stage: 'vertex' | 'fragment';
  include: string;
  code: string;
}
export declare const LOTUS_PETAL_CHUNK_ENTRIES: readonly LotusShaderChunkEntry[];
export interface LotusCompiledPhysicalProps {
  color?: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  transparent?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  ior?: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  transmission?: number;
  thickness?: number;
  sheen?: number;
  sheenColor?: string;
  sheenRoughness?: number;
  specularIntensity?: number;
  iridescence?: number;
}
export interface LotusCompiledShaderChunkSet {
  chunks: LotusShaderChunkEntry[];
  uniforms?: Record<string, { value: unknown }>;
}
export interface LotusCompiledProceduralSpec {
  generator: string;
  params?: Record<string, unknown>;
}
export interface LotusCompiledMaterialSpec {
  physical?: LotusCompiledPhysicalProps;
  shaderChunks?: LotusCompiledShaderChunkSet;
  proceduralMaps?: {
    normalMap?: LotusCompiledProceduralSpec;
    roughnessMap?: LotusCompiledProceduralSpec;
    map?: LotusCompiledProceduralSpec;
  };
}
export interface LotusPetalDynamicUniforms {
  devTime: number;
  curlScale: number;
  growth: number;
  bloom: number;
  time: number;
}
export interface BuildLotusPetalMaterialSpecOptions {
  detailMapSize?: number;
  veinSeed?: number;
  roughnessSeed?: number;
  dynamic?: Partial<LotusPetalDynamicUniforms>;
}
export declare const LOTUS_PETAL_UNIFORM_BINDINGS: Readonly<Record<string, string>>;
export declare function buildLotusPetalMaterialSpec(
  profile: BotanicalLotusRenderProfile,
  options?: BuildLotusPetalMaterialSpecOptions
): LotusCompiledMaterialSpec;

// --- Procedural texture data (three-free; renderer wraps in DataTexture) ------

export interface ProceduralTextureData {
  width: number;
  height: number;
  data: Uint8Array;
}

export type BotanicalSurfacePattern = 'petal_veins' | 'leaf_radial' | 'stalk_fiber' | 'micro';

export declare function generateBotanicalNormalMap(opts: {
  size?: number;
  seed?: number;
  pattern: BotanicalSurfacePattern;
  strength?: number;
}): ProceduralTextureData;

export declare function generateBotanicalRoughnessMap(opts: {
  size?: number;
  seed?: number;
  base?: number;
  variance?: number;
  scale?: number;
}): ProceduralTextureData;

// --- Morphogenesis: developmental phyllotaxis simulation (grown, not placed) ---

export interface LotusPrimordium {
  index: number;
  r: number;
  theta: number;
}

export interface LotusMorphogenesisParams {
  count: number;
  seed?: number;
  apexRadius?: number;
  radialVelocity?: number;
  inhibitionExponent?: number;
  angularSamples?: number;
}

export interface LotusMorphogenesisResult {
  primordia: LotusPrimordium[];
  emergentDivergenceDeg: number;
  divergenceSpreadDeg: number;
  resolvedParams: {
    count: number;
    seed: number;
    apexRadius: number;
    radialVelocity: number;
    inhibitionExponent: number;
    angularSamples: number;
  };
}

export declare function simulateLotusMorphogenesis(
  params: LotusMorphogenesisParams
): LotusMorphogenesisResult;

export interface LotusPhyllotaxisParams {
  count: number;
  seed?: number;
  apexRadius?: number;
  radialVelocity?: number;
  inhibitorRange?: number;
  threshold?: number;
  chiralWindowDeg?: readonly [number, number];
  angularSamples?: number;
}

export interface LotusPhyllotaxisResult {
  primordia: LotusPrimordium[];
  emergentDivergenceDeg: number;
  divergenceSpreadDeg: number;
}

export declare function simulateLotusPhyllotaxis(
  params: LotusPhyllotaxisParams
): LotusPhyllotaxisResult;

export interface LotusMeristem {
  primordia: LotusPrimordium[];
  last: number;
  apexRadius: number;
  v: number;
  range: number;
  threshold: number;
  wMin: number;
  wMax: number;
  samples: number;
  step: number;
}

export declare function createLotusMeristem(params: LotusPhyllotaxisParams): LotusMeristem;
export declare function stepLotusMeristem(m: LotusMeristem): boolean;

export interface LotusPetalGrowthParams {
  developmentalTime: number;
  budCurl?: number;
  openCurl?: number;
  matureStart?: number;
  matureSpan?: number;
  acropetalDelay?: number;
  baseAngleDeg?: number;
  segments?: number;
}

export interface LotusPetalGrowthState {
  tipAngleDeg: number;
  centerline: Array<[number, number]>;
  curvature: number[];
  baseMaturity: number;
  tipMaturity: number;
}

export declare function simulateLotusPetalGrowth(
  params: LotusPetalGrowthParams
): LotusPetalGrowthState;

export interface LotusPondParams {
  size?: number;
  extent?: number;
  waveSpeed?: number;
  damping?: number;
  stalkRadius?: number;
  capillaryLength?: number;
  contactRise?: number;
}

export interface LotusPondState {
  size: number;
  extent: number;
  c: number;
  damping: number;
  dx: number;
  h: Float32Array;
  v: Float32Array;
  meniscus: Float32Array;
  mask: Float32Array;
}

export declare function createLotusPond(params?: LotusPondParams): LotusPondState;
export declare function disturbLotusPond(
  state: LotusPondState,
  worldX: number,
  worldZ: number,
  amplitude: number,
  radius?: number
): void;
export declare function stepLotusPond(state: LotusPondState, dt: number): void;
export declare function lotusPondSurface(state: LotusPondState, out?: Float32Array): Float32Array;

export interface LotusMorphogenParams {
  size?: number;
  diffusionRatio?: number;
  gamma?: number;
  a?: number;
  b?: number;
  seed?: number;
}

export interface LotusMorphogenField {
  size: number;
  d: number;
  gamma: number;
  a: number;
  b: number;
  dt: number;
  u: Float32Array;
  v: Float32Array;
}

export declare function createLotusMorphogen(params?: LotusMorphogenParams): LotusMorphogenField;
export declare function stepLotusMorphogen(field: LotusMorphogenField, iterations?: number): void;
export declare function lotusMorphogenPeaks(field: LotusMorphogenField): number;

export interface LotusMorphogen2DParams {
  size?: number;
  diffusionRatio?: number;
  gamma?: number;
  a?: number;
  b?: number;
  seed?: number;
}
export interface LotusMorphogen2DField {
  size: number;
  d: number;
  gamma: number;
  a: number;
  b: number;
  dt: number;
  u: Float32Array;
  v: Float32Array;
  mask: Uint8Array;
}
export interface LotusMorphogen2DPeak {
  x: number;
  y: number;
  radius: number;
  angle: number;
  value: number;
}
export declare function createLotusMorphogen2D(params?: LotusMorphogen2DParams): LotusMorphogen2DField;
export declare function stepLotusMorphogen2D(field: LotusMorphogen2DField, iterations?: number): void;
export declare function lotusMorphogen2DPeaks(field: LotusMorphogen2DField): LotusMorphogen2DPeak[];
export declare function lotusMorphogen2DSampleAt(field: LotusMorphogen2DField, x: number, y: number): number;

export interface LotusPetalTurgorParams {
  budCurl?: number;
  openCurl?: number;
  matureStart?: number;
  matureSpan?: number;
  acropetalDelay?: number;
  baseAngleDeg?: number;
  segments?: number;
  turgorStiffness?: number;
  turgorRise?: number;
}

export interface LotusPetalTurgorState {
  segments: number;
  baseAngle: number;
  budCurl: number;
  openCurl: number;
  matureStart: number;
  matureSpan: number;
  acropetalDelay: number;
  turgorStiffness: number;
  turgorRise: number;
  turgor: number;
  kappaActual: Float32Array;
}

export declare function createLotusPetalTurgor(params?: LotusPetalTurgorParams): LotusPetalTurgorState;
export declare function stepLotusPetalTurgor(
  state: LotusPetalTurgorState,
  dt: number,
  developmentalTime: number
): void;
export declare function lotusPetalTurgorTipDeg(state: LotusPetalTurgorState): number;
export declare function lotusPetalTurgorOpenProgress(state: LotusPetalTurgorState): number;
`;

const simulationSolverFactoryDTS = `/**
 * @holoscript/core/traits/simulation-solver-factory — narrow simulation registry
 *
 * Browser renderers import this instead of @holoscript/core/traits so they do
 * not bundle every domain trait plugin.
 */

export interface SimulationSolver {
  step?(dt: number): void;
  solve?(): unknown;
  dispose(): void;
  getStats?(): Record<string, unknown>;
}

export type SolverFactory = (config: Record<string, unknown>) => SimulationSolver;

export declare const SimulationSolverFactory: {
  register(type: string, factory: SolverFactory): void;
  create(type: string, config: Record<string, unknown>): SimulationSolver | null;
  has(type: string): boolean;
  types(): string[];
  clear(): void;
};
`;

const webcamGazeDTS = `/**
 * @holoscript/core/traits/webcam-gaze — narrow browser-safe webcam gaze adapter
 */

export type {
  NormalizedFaceLandmark,
  WebcamGazeConfig,
  WebcamGazeSample,
} from './index';

export {
  DEFAULT_WEBCAM_GAZE_CONFIG,
  WebcamGazeTracker,
  estimateWebcamGazeFromLandmarks,
  webcamGazeHandler,
  webcamGazeToRay,
} from './index';
`;

const compilerDTS = `/**
 * @holoscript/core/compiler — Multi-Target Compiler Type Declarations
 */

import type { HoloComposition } from '../index.js';

export type ComputeAccelerator = 'cpu' | 'gpu' | 'npu' | 'other';
export type ComputePlacementPolicy = 'local_only' | 'owned_fleet' | 'external_bridge_requested';
export type ComputeDataClassification = 'public' | 'internal' | 'confidential' | 'restricted';
export type ComputeQualityOperator = 'eq' | 'lte' | 'gte';
export type ComputeQualityReference = 'none' | 'cpu_reference';
export type ComputeBudgetCurrency = 'USD';
export type ComputeSourceDigestKind = 'source_utf8' | 'canonical_ast';
export const COMPUTE_WORK_UNIT_SCHEMA_VERSION: 'holoscript.compute-work-unit.v1';
export const COMPUTE_WORK_UNIT_COMPILER_VERSION: '1.0.0';
export interface ComputeWorkUnitSourceConfig {
  intent: string;
  allowed_accelerators: readonly ComputeAccelerator[];
  placement_policy: ComputePlacementPolicy;
  data_classification: ComputeDataClassification;
  quality_metric: string;
  quality_operator: ComputeQualityOperator;
  quality_threshold: number;
  quality_reference: ComputeQualityReference;
  deadline_ms: number;
  budget_currency: ComputeBudgetCurrency;
  max_cost_minor_units: number;
  allow_fallback: boolean;
}
export interface ComputeWorkUnitSourceBinding {
  readonly objectName: string;
  readonly sourceDigest: string;
  readonly sourceDigestKind: ComputeSourceDigestKind;
  readonly compiler: 'ComputeWorkUnitCompiler';
  readonly compilerVersion: typeof COMPUTE_WORK_UNIT_COMPILER_VERSION;
  readonly artifact?: string;
  readonly artifactDigest?: string;
}
export interface ComputeWorkUnitContract {
  readonly schemaVersion: typeof COMPUTE_WORK_UNIT_SCHEMA_VERSION;
  readonly intent: string;
  readonly source_evidence: string;
  readonly producer_surface: '@compute';
  readonly executor_lane: 'compute';
  readonly allowed_actions: readonly string[];
  readonly forbidden_actions: readonly string[];
  readonly required_runtime_evidence: readonly string[];
  readonly done_criteria: string;
  readonly verification_mode: 'producer_contract';
  readonly verifier_command_or_receipt: 'verifyComputeWorkUnitEvidence';
  readonly compute: {
    readonly source: ComputeWorkUnitSourceBinding;
    readonly policy: {
      readonly placement: ComputePlacementPolicy;
      readonly externalAccess: 'denied' | 'requires_admission';
      readonly bridgeAdmission: 'not_applicable' | 'runtime_receipt_required';
      readonly allowedAccelerators: readonly ComputeAccelerator[];
      readonly dataClassification: ComputeDataClassification;
      readonly allowFallback: boolean;
    };
    readonly quality: {
      readonly metric: string;
      readonly operator: ComputeQualityOperator;
      readonly threshold: number;
      readonly reference: ComputeQualityReference;
    };
    readonly budget: {
      readonly deadlineMs: number;
      readonly currency: ComputeBudgetCurrency;
      readonly maxCostMinorUnits: number;
    };
  };
}
export interface ComputeWorkUnitValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}
export interface CompiledComputeWorkUnit {
  readonly objectName: string;
  readonly workUnit: ComputeWorkUnitContract;
}
export interface ComputeWorkUnitCompilationOptions {
  readonly sourceText?: string;
}
export interface ComputeWorkUnitEvidenceInput {
  readonly sourceText?: string;
  readonly composition?: HoloComposition;
  readonly artifacts?: Readonly<Record<string, string | Uint8Array>>;
}
export function buildComputeWorkUnit(
  config: Partial<ComputeWorkUnitSourceConfig>,
  source: ComputeWorkUnitSourceBinding
): ComputeWorkUnitContract;
export function compileComputeWorkUnits(
  composition: HoloComposition,
  options?: ComputeWorkUnitCompilationOptions
): CompiledComputeWorkUnit[];
export function computeCanonicalAstDigest(composition: HoloComposition): string;
export function computeWorkUnitDigest(workUnit: ComputeWorkUnitContract): string;
export function validateComputeWorkUnitContract(value: unknown): ComputeWorkUnitValidation;
export function verifyComputeWorkUnitEvidence(
  value: unknown,
  evidence: ComputeWorkUnitEvidenceInput
): ComputeWorkUnitValidation;

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

export type HSIScalar = string | number | boolean | null;

export interface HSPlusHSIIRLoweringOptions {
  worldName?: string;
}

export interface HSIMachineInput {
  id: string;
  name: string;
  inputType: 'bool' | 'float' | 'int' | 'trigger';
  baseline: HSIScalar;
}

export interface HSITransition {
  id: string;
  from: string;
  target: string;
  priority: number;
  guard?: unknown;
  event?: string;
  reads: string[];
}

export interface HSIStateMachine {
  id: string;
  name: string;
  initialState: string;
  states: string[];
  inputs: HSIMachineInput[];
  transitions: HSITransition[];
}

export interface HSIIRDocument {
  schemaVersion: 'holoscript.hsi-ir.v0.1.0';
  kind: 'HSIIR';
  world: { name: string; sourceDigest: string };
  entities: unknown[];
  relations: unknown[];
  state: unknown[];
  observationPolicy: unknown[];
  eventHandlers: unknown[];
  machines: HSIStateMachine[];
  predicates: unknown[];
  declaredUnknowns: string[];
  provenance: {
    compiler: 'HSIIRCompiler';
    sourceSurface?: 'holo' | 'hsplus';
    deterministicDigest: string;
  };
}

export type HSIScenarioStep =
  | { kind: 'set-input'; machine: string; input: string; value: HSIScalar }
  | { kind: 'fire-trigger'; machine: string; input: string }
  | { kind: 'fire-event'; event: string };

export interface HSITraceTransitionRecord {
  machine: string;
  transitionId: string;
  from: string;
  to: string;
}

export interface HSITraceStep {
  ordinal: number;
  step: HSIScenarioStep;
  transitions: HSITraceTransitionRecord[];
  effects: unknown[];
  emitted: string[];
  invariantViolations: string[];
  stateDigest: string;
}

export interface HSITrace {
  schemaVersion: 'holoscript.hsi-trace.v0.1.0';
  kind: 'HSITrace';
  worldDigest: string;
  preconditionResults: Array<{ id: string; holds: boolean }>;
  initial: {
    state: Record<string, HSIScalar>;
    machineStates: Record<string, string>;
    stateDigest: string;
  };
  steps: HSITraceStep[];
  final: {
    state: Record<string, HSIScalar>;
    machineStates: Record<string, string>;
    stateDigest: string;
  };
  valid: boolean;
  deterministicDigest: string;
}

export function lowerHSPlusProgramToHSIIR(
  source: string,
  options?: HSPlusHSIIRLoweringOptions
): HSIIRDocument;
export function runExactTrace(ir: HSIIRDocument, scenario: HSIScenarioStep[]): HSITrace;

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

export interface SceneIRTsxEmitterOptions {
  componentName?: string;
  sourcePath?: string;
  includeCanvas?: boolean;
}

export function emitSceneIRTsx(root: R3FNode, options?: SceneIRTsxEmitterOptions): string;

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
`;

const contextDTS = `export type ContextSurface = 'claude' | 'codex' | 'cursor' | 'copilot' | 'gemini' | 'any';
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
export declare class ContextCompileError extends Error { constructor(message: string); }
export declare class ContextCompiler {
  constructor(options?: ContextCompilerOptions);
  compile(composition: any, agentToken: string, outputPath?: string): ContextCompileResult;
}
export declare function createContextCompiler(options?: ContextCompilerOptions): ContextCompiler;
`;

const llmProviderCapabilitiesDTS = `export type LLMProviderStatus =
  | 'live'
  | 'partial'
  | 'teammate'
  | 'runtime'
  | 'planned';
export type LLMModelStatus =
  | 'active'
  | 'active-recommended'
  | 'active-legacy'
  | 'deprecated';
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
export interface LLMCapabilityMatrixAST {
  [key: string]: any;
  warnings: LLMCapabilityValidationDiagnostic[];
}
export interface LLMCapabilityCompileResult {
  files: Record<string, string>;
  ast: LLMCapabilityMatrixAST;
  diagnostics: LLMCapabilityValidationDiagnostic[];
}
export interface LLMCapabilityCompilerOptions {
  formats?: LLMCapabilityEmitFormat[];
  nowIso?: string;
}
export declare class LLMCapabilityCompileError extends Error { constructor(message: string); }
export declare class LLMProviderCapabilitiesCompiler {
  constructor(options?: LLMCapabilityCompilerOptions);
  compile(composition: any, agentToken: string, outputPath?: string): LLMCapabilityCompileResult;
}
export declare function createLLMProviderCapabilitiesCompiler(
  options?: LLMCapabilityCompilerOptions
): LLMProviderCapabilitiesCompiler;
`;

const selfImprovementDTS = `/**
 * @holoscript/core/self-improvement — Self-Improvement Pipeline Type Declarations
 */

export interface PipelineConfig { [key: string]: any; }
export interface PipelineStats { total: number; succeeded: number; failed: number; [key: string]: any; }
export interface FailedGeneration { source: string; error: string; [key: string]: any; }
export type FailureCategory = 'parse' | 'type' | 'runtime' | 'logic' | 'unknown';
export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'expert';
export interface TrainingExample { prompt: string; completion: string; [key: string]: any; }
export class SelfImprovementPipeline {
  constructor(config?: PipelineConfig);
  process(failures: FailedGeneration[]): Promise<TrainingExample[]>;
  getStats(): PipelineStats;
}

export interface QualityMetrics { [key: string]: number; }
export type QualityDimension = string;
export interface QualityReport { score: number; dimensions: Record<string, number>; [key: string]: any; }
export declare const QUALITY_WEIGHTS: Record<string, number>;
export function calculateQualityScore(metrics: QualityMetrics): QualityReport;

export interface ConvergenceConfig { windowSize?: number; threshold?: number; [key: string]: any; }
export interface ConvergenceStatus { converged: boolean; delta: number; trend: string; }
export interface ConvergenceSnapshot { values: number[]; status: ConvergenceStatus; }
export class ConvergenceDetector {
  constructor(config?: ConvergenceConfig);
  addSample(value: number): ConvergenceStatus;
  getSnapshot(): ConvergenceSnapshot;
  reset(): void;
}

export interface SelfImproveIO { [key: string]: any; }
export interface SelfImproveConfig { [key: string]: any; }
export interface SelfImproveResult { iterations: IterationRecord[]; finalQuality: number; [key: string]: any; }
export interface IterationRecord { [key: string]: any; }
export interface AbsorbResult { [key: string]: any; }
export interface UntestedTarget { [key: string]: any; }
export interface GeneratedTest { [key: string]: any; }
export interface VitestResult { passed: boolean; [key: string]: any; }
export interface VitestSuiteResult { [key: string]: any; }
export interface LintResult { [key: string]: any; }
export class SelfImproveCommand {
  constructor(io: SelfImproveIO, config?: SelfImproveConfig);
  run(): Promise<SelfImproveResult>;
}

export interface HarvestEntry { [key: string]: any; }
export interface HarvesterConfig { [key: string]: any; }
export interface FileWriter { write(path: string, content: string): Promise<void>; }
export interface AcceptedExample { [key: string]: any; }
export class SelfImproveHarvester {
  constructor(config?: HarvesterConfig);
  harvest(): Promise<HarvestEntry[]>;
}

export function computeRougeL(reference: string, candidate: string): number;

export interface ASTSegment { [key: string]: any; }
export type SegmentKind = string;
export interface DPOPair { chosen: string; rejected: string; [key: string]: any; }
export interface DPOPairMetadata { [key: string]: any; }
export type DegradationStrategy = string;
export interface FocusedDPOConfig { [key: string]: any; }
export interface SplitterStats { [key: string]: any; }
export class FocusedDPOSplitter {
  constructor(config?: FocusedDPOConfig);
  split(source: string): DPOPair[];
  getStats(): SplitterStats;
}

export interface GRPORewardFunction { (response: string, context: any): number; }
export interface RewardFunctionOptions { [key: string]: any; }
export interface RewardEvaluation { score: number; [key: string]: any; }
export interface RewardToolRunner { [key: string]: any; }
export declare const GRPO_REWARD_WEIGHTS: Record<string, number>;
export function createGRPORewardFunctions(options?: RewardFunctionOptions): Record<string, GRPORewardFunction>;

export interface GRPOOrchestratorConfig { [key: string]: any; }
export interface RewardStatistics { [key: string]: any; }
export interface RewardFunctionResult { [key: string]: any; }
export interface OrchestratorResult { score: number; [key: string]: any; }
export interface OrchestratorStats { [key: string]: any; }
export class GRPORewardOrchestrator {
  constructor(config?: GRPOOrchestratorConfig);
  evaluate(response: string, context: any): Promise<OrchestratorResult>;
  getStats(): OrchestratorStats;
}

export interface GRPOTrainingConfig { [key: string]: any; }
export interface GRPOHyperparameters { [key: string]: any; }
export interface VLLMConfig { [key: string]: any; }
export interface OPLoRAConfig { [key: string]: any; }
export interface TrainingSchedule { [key: string]: any; }
export interface HardwareConfig { [key: string]: any; }
export declare const RECOMMENDED_GRPO_CONFIG: GRPOTrainingConfig;
export function buildGRPOConfig(overrides?: Partial<GRPOTrainingConfig>): GRPOTrainingConfig;
export function exportGRPOConfigAsPython(config: GRPOTrainingConfig): string;

export interface GRPOPrompt { [key: string]: any; }
export interface TRLPromptRecord { [key: string]: any; }
export interface PromptExtractorConfig { [key: string]: any; }
export interface ExtractionStats { [key: string]: any; }
export interface PromptExtractorFS { [key: string]: any; }
export type PromptDifficulty = 'easy' | 'medium' | 'hard' | 'expert';
export type PromptSource = string;
export type DomainTag = string;
export class GRPOPromptExtractor {
  constructor(fs: PromptExtractorFS, config?: PromptExtractorConfig);
  extract(): Promise<GRPOPrompt[]>;
  getStats(): ExtractionStats;
}
export function createNodeFS(): PromptExtractorFS;
export function inferDomainTags(source: string): DomainTag[];
export function estimateDifficulty(source: string): PromptDifficulty;
export function extractPackageName(path: string): string;

export interface ExtendedOPLoRAConfig { [key: string]: any; }
export interface ValidatedOPLoRAConfig { [key: string]: any; }
export interface OPLoRAValidationError { field: string; message: string; }
export declare const DEFAULT_OPLORA_CONFIG: ExtendedOPLoRAConfig;
export function validateOPLoRAConfig(config: any): OPLoRAValidationError[];
export function buildOPLoRAConfig(overrides?: Partial<ExtendedOPLoRAConfig>): ExtendedOPLoRAConfig;
export function exportOPLoRAConfigAsPython(config: ExtendedOPLoRAConfig): string;

export type BenchmarkName = string;
export interface BenchmarkScore { [key: string]: any; }
export interface ModuleWeightRatio { [key: string]: any; }
export interface ConstraintSatisfaction { [key: string]: any; }
export type AlertSeverity = 'info' | 'warning' | 'critical';
export interface MonitorAlert { severity: AlertSeverity; message: string; [key: string]: any; }
export interface OPLoRAMonitorConfig { [key: string]: any; }
export interface MonitorStats { [key: string]: any; }
export interface MonitorSnapshot { [key: string]: any; }
export class OPLoRAMonitor {
  constructor(config?: OPLoRAMonitorConfig);
  addScore(benchmark: BenchmarkName, score: number): void;
  getAlerts(): MonitorAlert[];
  getStats(): MonitorStats;
  getSnapshot(): MonitorSnapshot;
}

export interface ForgettingDetectorConfig { [key: string]: any; }
export type ForgettingSeverity = 'none' | 'mild' | 'moderate' | 'severe';
export interface ForgettingResult { severity: ForgettingSeverity; [key: string]: any; }
export interface AggregateDetectionResult { [key: string]: any; }
export class ForgettingDetector {
  constructor(config?: ForgettingDetectorConfig);
  addSample(benchmark: string, score: number): ForgettingResult;
  getAggregate(): AggregateDetectionResult;
}

// ============================================================================
// Pillar 2: Native Neural Streaming & Splat Transport
// ============================================================================

export interface INeuralPacket {
  packetId: string;
  personaId: string;
  intent: string;
  spatialData: { origin: IVector3; focusPoint: IVector3 };
  metrics: { confidence: number; latencyMs: number };
  timestamp: number;
}

export interface INeuralSplatPacket {
  frameId: number;
  cameraState: { viewProjectionMatrix: number[]; cameraPosition: number[] };
  splatCount: number;
  compressedSplatsBuffer: ArrayBuffer;
  sortedIndicesBuffer: ArrayBuffer;
}

export interface ExtractorOptions {
  maxSplats: number;
}

export class GaussianSplatExtractor {
  constructor(context: any, options: ExtractorOptions);
  extractFrame(sorter: any, camera: any, compressedSource: any, indicesSource: any): Promise<INeuralSplatPacket | null>;
}

export interface StreamingTransportConfig {
  useWebRTC: boolean;
  endpointUrl?: string;
  rtcConfiguration?: any;
  chunkSize?: number;
}

export interface NeuralSignalPayload {
  type: 'offer' | 'answer' | 'ice-candidate';
  sdp?: any;
  candidate?: any;
}

export interface ISignalingBridge {
  targetPeerId: string;
  onReceiveSignal: (handler: (payload: NeuralSignalPayload) => void) => void;
  sendSignal: (payload: NeuralSignalPayload) => Promise<void>;
}

export class WebSocketSignaler implements ISignalingBridge {
  targetPeerId: string;
  constructor(endpointUrl: string, localPeerId: string, targetPeerId: string);
  connect(): Promise<void>;
  onReceiveSignal(handler: (payload: NeuralSignalPayload) => void): void;
  sendSignal(payload: NeuralSignalPayload): Promise<void>;
  disconnect(): void;
}

export class NeuralStreamingTransport {
  constructor(config: StreamingTransportConfig);
  connect(signalingBridge?: ISignalingBridge): Promise<void>;
  broadcastNeuralPacket(packet: INeuralPacket): void;
  broadcastSplatPacket(packet: INeuralSplatPacket): void;
  disconnect(): void;
}

export interface NeuralStreamingConfig extends StreamingTransportConfig {
  maxSplats: number;
}

export class NeuralStreamingService {
  constructor(config: NeuralStreamingConfig);
  initialize(signalingBridge?: ISignalingBridge): Promise<void>;
  attachSplatExtractor(context: any): void;
  streamCognitiveTelemetry(packet: INeuralPacket): void;
  streamVisualTopology(sorter: any, camera: any, compressedSource: any, indicesSource: any): Promise<void>;
  startStreaming(): void;
  stopStreaming(): void;
  shutdown(): void;
}

// ============================================================================
// Modality Transliteration
// ============================================================================

export interface ModalitySelection {
  platform: any;
  category: any;
  embodiment: any;
  exportTarget: string;
  fallbackTarget: string | null;
  capabilities: any;
  canRenderSpatial: boolean;
  recommendStreaming: boolean;
  budget: {
    frameBudgetMs: number;
    agentBudgetMs: number;
    computeModel: 'edge-first' | 'cloud-first' | 'safety-critical';
  };
  reasoning: string[];
}

export interface ModalitySelectorOptions {
  preferStreaming?: boolean;
  forceEmbodiment?: any;
  forceExportTarget?: any;
  spatialGpuThreshold?: boolean;
}

export function selectModality(platform: any, options?: ModalitySelectorOptions): ModalitySelection;
export function selectModalityForAll(options?: ModalitySelectorOptions): Map<any, ModalitySelection>;
export function bestCategoryForTraits(requiredCapabilities: any): any[];
export function inferCapabilitiesFromGraph(graph: any): any;
export function inferModalityFromGraph(graph: any, platform?: any, options?: ModalitySelectorOptions): ModalitySelection | null;

// ============================================================================
// SNN Sparsity Monitoring (Self-Improvement)
// ============================================================================
export interface SparsitySnapshot { [key: string]: any; }
export interface SNNLayerMetrics { [key: string]: any; }
export interface LayerActivityInput { [key: string]: any; }
export interface SparsityQualityHistoryEntry { [key: string]: any; }

export class SparsityMonitor {
  constructor(config?: any);
  recordLayerActivity(layerId: string, input: LayerActivityInput): SNNLayerMetrics;
  recordBatchActivity(layerInputs: any): SNNLayerMetrics[];
  takeSnapshot(): SparsitySnapshot | null;
  getActiveViolations(): any[];
  getViolationHistory(): any[];
  getStats(): any;
  toQualityHistoryEntry(cycle: number): SparsityQualityHistoryEntry;
  getHarvesterMetrics(): Record<string, number | boolean>;
  getSnapshots(): SparsitySnapshot[];
  getLatestSnapshot(): SparsitySnapshot | null;
  getCurrentLayerMetrics(): Map<string, SNNLayerMetrics>;
  getLayerHistory(layerId: string): SNNLayerMetrics[];
  getConfig(): any;
  reset(): void;
  [key: string]: any;
}
export function createSparsityMonitor(config?: any): SparsityMonitor;
`;

const testingDTS = `/** @holoscript/core/testing — narrow empirical test utilities */
export interface GpuInfo {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
  backend?: string;
}
export interface NodeInfo {
  version: string;
  arch: string;
  platform: string;
}
export interface BrowserInfo {
  userAgent?: string;
  browser?: string;
  os?: string;
}
export interface EnvironmentInfo {
  runtime: 'browser' | 'node' | 'unknown';
  gpu?: GpuInfo;
  node?: NodeInfo;
  browser?: BrowserInfo;
  annotations?: Record<string, string>;
}
export interface ProbeResult<T = Uint8Array | string> {
  name: string;
  timestamp: number;
  environment: EnvironmentInfo;
  durationMs: number;
  outputHash: string;
  outputSize: number;
  output?: T;
  error?: string;
}
export interface DivergenceGroup {
  hash: string;
  results: ProbeResult[];
  environments: string[];
}
export interface DivergenceReport {
  probeName: string;
  totalResults: number;
  uniqueHashes: number;
  divergent: boolean;
  groups: DivergenceGroup[];
  summary: string;
}
export interface HarnessOptions {
  captureOutput?: boolean;
  hashAlgorithm?: 'sha256' | 'fnv1a';
  annotations?: Record<string, string>;
}
export declare function captureEnvironment(
  annotations?: Record<string, string>
): Promise<EnvironmentInfo>;
export declare function hashBytes(
  input: Uint8Array | string,
  algo?: 'sha256' | 'fnv1a'
): Promise<string>;
export declare class DeterminismHarness {
  constructor(options?: HarnessOptions);
  probe<T extends Uint8Array | string>(
    name: string,
    fn: () => Promise<T> | T,
    annotations?: Record<string, string>
  ): Promise<ProbeResult<T>>;
  static compareResults(results: ProbeResult[]): DivergenceReport;
}
export declare function describeEnvironment(env: EnvironmentInfo): string;
`;

// HoloLand sovereign trait handlers (runtime bridge)
const holoLandTraitsDTS = `
// ============================================================================
// HOLOLAND TRAIT HANDLERS (sovereign @stat / @luck / @encounter / @drop_table)
// ============================================================================

export interface StatModifier { source: string; delta: number; }
export interface StatState { name: string; baseValue: number; min: number; max: number; modifiers: StatModifier[]; effective: number; }
export interface StatConfig { name: string; value: number; min?: number; max?: number; }
export declare const statHandler: TraitHandler<StatConfig>;

export interface LuckState { baseChance: number; luckBonus: number; seed?: number; }
export interface LuckConfig { baseChance: number; luckBonus?: number; seed?: number; }
export declare const luckHandler: TraitHandler<LuckConfig>;

export interface EncounterState { encounterId: string; triggerType: 'proximity' | 'interaction' | 'time' | 'state'; cooldownMs: number; lastFireMs: number; firedCount: number; }
export interface EncounterConfig { encounterId: string; triggerType: 'proximity' | 'interaction' | 'time' | 'state'; cooldownMs?: number; proximity_radius?: number; proximity_target?: string; time_interval?: number; state_key?: string; state_value?: unknown; check_interval?: number; }
export declare const encounterHandler: TraitHandler<EncounterConfig>;
export declare function shouldFire(state: EncounterState, config: EncounterConfig, now: number): boolean;

export interface DropTableEntry { itemId: string; weight: number; rareModifier?: number; }
export interface DropTableState { tableId: string; entries: DropTableEntry[]; respectLuck: boolean; }
export interface DropTableConfig { tableId: string; entries: DropTableEntry[]; respectLuck?: boolean; }
export declare const dropTableHandler: TraitHandler<DropTableConfig>;
export declare function effectiveWeight(entry: DropTableEntry, luckBonus: number): number;
export declare function pickByWeight(entries: DropTableEntry[], luckBonus: number, seed?: number): DropTableEntry | null;

export declare function extractPayload(event: TraitEvent): unknown;
`;

const careFieldDTS = `
// ============================================================================
// CARE-FIELD PRIMITIVES (D.052 universal love doctrine)
// ============================================================================

export type CareActorKind = 'human' | 'agent' | 'service' | 'device' | 'world';
export interface CareActor { id: string; kind: CareActorKind; displayName?: string; }
export type CarePrimitiveKind = 'care_field' | 'repair_loop' | 'autonomy_guard' | 'gratitude_ledger' | 'relational_memory';
export type CareConsentState = 'explicit' | 'delegated' | 'not_required' | 'unknown' | 'withdrawn';
export type CareBoundary = 'human_agency' | 'informed_consent' | 'privacy' | 'non_manipulation' | 'repairability' | 'credit_integrity';
export type CarePositiveOptimizationTarget = 'human_agency' | 'mutual_understanding' | 'repair_completion' | 'gratitude_credit' | 'reduced_burden';
export type CareRefusedOptimizationTarget = 'attachment_score' | 'session_frequency' | 'daily_active_dependence' | 'emotional_dependency';
export type CareOptimizationTarget = CarePositiveOptimizationTarget | CareRefusedOptimizationTarget;
export declare const REFUSED_CARE_OPTIMIZATION_TARGETS: readonly CareRefusedOptimizationTarget[];
export type CareSignalKind = 'consent_present' | 'consent_missing' | 'consent_withdrawn' | 'distress' | 'repair_needed' | 'gratitude_due' | 'attachment_optimization' | 'session_frequency_optimization' | 'dependency_creation' | 'human_isolation' | 'privacy_intrusion';
export interface CareSignal { kind: CareSignalKind; weight?: number; note?: string; evidenceRefs?: readonly string[]; }
export type AutonomyGuardBlockCode = 'refused_optimization_target' | 'missing_consent' | 'withdrawn_consent' | 'missing_disengage_path' | 'outside_support_eroded' | 'privacy_boundary_broken' | 'manipulative_signal';
export interface AutonomyGuardBlock { code: AutonomyGuardBlockCode; message: string; evidenceRefs?: readonly string[]; }
export interface AutonomyGuardPolicy {
  id: string;
  refusedOptimizationTargets: readonly CareRefusedOptimizationTarget[];
  requireConsent: boolean;
  requireDisengagePath: boolean;
  requireOutsideSupportPreserved: boolean;
  requireDataBoundaryRespected: boolean;
}
export declare const DEFAULT_AUTONOMY_GUARD_POLICY: AutonomyGuardPolicy;
export interface AutonomyGuardEvaluationInput {
  goal: string;
  consent: CareConsentState;
  optimizationTargets?: readonly CareOptimizationTarget[];
  signals?: readonly CareSignal[];
  hasDisengagePath?: boolean;
  preservesOutsideSupport?: boolean;
  respectsDataBoundary?: boolean;
  policy?: AutonomyGuardPolicy;
}
export interface AutonomyGuardDecision {
  allowed: boolean;
  policyId: string;
  goal: string;
  blocked: readonly AutonomyGuardBlock[];
  acceptedOptimizationTargets: readonly CarePositiveOptimizationTarget[];
}
export type RepairLoopStatus = 'open' | 'acknowledged' | 'repairing' | 'verified' | 'closed';
export type RepairLoopAction = 'acknowledge' | 'explain' | 'amend' | 'verify' | 'close';
export interface RepairLoopStep { at: string; actor: CareActor; action: RepairLoopAction; note: string; evidenceRefs?: readonly string[]; }
export interface RepairLoop { loopId: string; openedAt: string; status: RepairLoopStatus; harmOrMismatch: string; steps: readonly RepairLoopStep[]; }
export type GratitudeVisibility = 'private' | 'team' | 'public';
export interface GratitudeLedgerEntry { entryId: string; recordedAt: string; from: CareActor; to: CareActor; contribution: string; visibility: GratitudeVisibility; evidenceRefs?: readonly string[]; }
export type RelationalMemoryRetention = 'ephemeral' | 'session' | 'durable';
export interface RelationalMemoryEntry { memoryId: string; recordedAt: string; subject: CareActor; summary: string; consent: CareConsentState; retention: RelationalMemoryRetention; evidenceRefs?: readonly string[]; }
export interface CareField {
  schemaVersion: '1.0.0';
  fieldId: string;
  createdAt: string;
  steward: CareActor;
  counterpart: CareActor;
  goal: string;
  primitives: readonly CarePrimitiveKind[];
  boundaries: readonly CareBoundary[];
  consent: CareConsentState;
  autonomy: AutonomyGuardDecision;
  repairLoops: readonly RepairLoop[];
  gratitudeLedger: readonly GratitudeLedgerEntry[];
  relationalMemory: readonly RelationalMemoryEntry[];
}
export interface CreateCareFieldInput {
  createdAt: string;
  steward: CareActor;
  counterpart: CareActor;
  goal: string;
  consent: CareConsentState;
  autonomy?: Omit<AutonomyGuardEvaluationInput, 'goal' | 'consent'>;
  fieldId?: string;
  primitives?: readonly CarePrimitiveKind[];
  boundaries?: readonly CareBoundary[];
  repairLoops?: readonly RepairLoop[];
  gratitudeLedger?: readonly GratitudeLedgerEntry[];
  relationalMemory?: readonly RelationalMemoryEntry[];
}
export interface CreateRepairLoopInput { openedAt: string; actor: CareActor; harmOrMismatch: string; note: string; loopId?: string; evidenceRefs?: readonly string[]; }
export interface RecordGratitudeInput { recordedAt: string; from: CareActor; to: CareActor; contribution: string; visibility?: GratitudeVisibility; entryId?: string; evidenceRefs?: readonly string[]; }
export interface RememberRelationalContextInput { recordedAt: string; subject: CareActor; summary: string; consent: CareConsentState; retention?: RelationalMemoryRetention; memoryId?: string; evidenceRefs?: readonly string[]; }
export declare function evaluateAutonomyGuard(input: AutonomyGuardEvaluationInput): AutonomyGuardDecision;
export declare function createCareField(input: CreateCareFieldInput): CareField;
export declare function createRepairLoop(input: CreateRepairLoopInput): RepairLoop;
export declare function recordGratitude(input: RecordGratitudeInput): GratitudeLedgerEntry;
export declare function rememberRelationalContext(input: RememberRelationalContextInput): RelationalMemoryEntry;
export declare function validateCareField(field: CareField): { valid: boolean; errors: string[] };
`;

const conversationDaemonDTS = `
// ============================================================================
// CONVERSATION DAEMON PRIMITIVES (D.052 Brittney field / user daemon model)
// ============================================================================

export type DaemonOwnerPolicy = 'private' | 'shared_household' | 'workspace';
export type MemoryRetentionPolicy = 'session_only' | 'persisted_local' | 'persisted_with_absorb';
export type DispatchConfidence = 'autonomous' | 'confirm_before' | 'always_ask';
export interface DaemonAppearanceProfile { characterClass?: string; visualStyle?: string; colorPalette?: string[]; animationSet?: string; scale?: 'tiny' | 'small' | 'medium' | 'large'; }
export interface DaemonVoiceProfile { enabled: boolean; voiceId?: string; speed?: number; tone?: 'warm' | 'neutral' | 'formal' | 'playful'; }
export interface DaemonToneProfile { formality?: 'casual' | 'balanced' | 'formal'; verbosity?: 'terse' | 'balanced' | 'detailed'; humor?: 'none' | 'light' | 'moderate'; patience?: 'quick' | 'patient'; }
export interface DaemonPermissionProfile { readOnly: boolean; proposeMutations: boolean; autonomousMutations: boolean; breakGlassAllowed: boolean; custodyScope: string[]; permissionEnvelope: 'read_only' | 'guarded_execute' | 'break_glass'; }
export interface DaemonMemoryPolicy { retention: MemoryRetentionPolicy; maxContextWindowTokens?: number; absorbIntegration: boolean; ownerScoped: true; }
export type DaemonContextSourceKind = 'operator_brief' | 'holoscript_surface_map' | 'absorb_graph' | 'holomesh_lanes' | 'recent_receipts' | 'room_state' | 'holoscript_tool_manifest';
export interface DaemonDispatchPolicy { defaultConfidence: DispatchConfidence; trustedPatterns: string[]; receiptRequired: boolean; maxAutonomousActionsPerSession: number; }
export interface DaemonReceiptSink { local: boolean; holoshell: boolean; absorb: boolean; holomesh: boolean; }
export interface DaemonBrittneyRehydrationChannel { enabled: boolean; channelId: string; deltaCompression: boolean; minimumDeltaSignificance: number; }
export interface ConversationDaemon { daemonId: string; ownerId: string; ownerPolicy: DaemonOwnerPolicy; displayName: string; appearanceProfile: DaemonAppearanceProfile; voiceProfile: DaemonVoiceProfile; careProfile: string; toneProfile: DaemonToneProfile; permissionProfile: DaemonPermissionProfile; memoryPolicy: DaemonMemoryPolicy; contextSources: DaemonContextSourceKind[]; dispatchPolicy: DaemonDispatchPolicy; receiptSink: DaemonReceiptSink; brittneyRehydrationChannel: DaemonBrittneyRehydrationChannel; createdAt: string; lastActiveAt?: string; }
export type DaemonUrgencyLevel = 'low' | 'medium' | 'high' | 'immediate';
export type DaemonConsentBoundary = 'no_action' | 'read_only' | 'propose' | 'execute';
export interface ExtractedIntent { verb: string; target?: string; parameters: Record<string, unknown>; confidence: number; }
export interface ExtractedArtifact { kind: 'file' | 'url' | 'entity' | 'code' | 'receipt' | 'task'; ref: string; label?: string; }
export interface ContextDelta { newIntentSignals: ExtractedIntent[]; updatedPreferences: Record<string, unknown>; newReceiptRefs: string[]; capabilityUpdates: Array<{ capability: string; available: boolean }>; careSignalHistory: string[]; significanceScore: number; }
export interface ProposedAction { actionId: string; description: string; toolRef: string; parameters: Record<string, unknown>; permissionEnvelope: 'read_only' | 'guarded_execute' | 'break_glass'; reversible: boolean; estimatedImpact: 'none' | 'minor' | 'moderate' | 'significant'; }
export interface ConversationDaemonTurn { turnId: string; daemonId: string; surfaceId: string; userUtterance: string; selectedShellObject?: string; extractedIntent?: ExtractedIntent; extractedArtifacts: ExtractedArtifact[]; careSignal?: string; urgency: DaemonUrgencyLevel; consentBoundary: DaemonConsentBoundary; contextDelta: ContextDelta; proposedNextAction?: ProposedAction; requiredApproval: boolean; receiptLinks: string[]; timestamp: string; }
export declare class DaemonFieldSeparationError extends Error { constructor(message: string); }
export declare class UnauthorizedDaemonAccessError extends Error { constructor(message: string); }
export declare function assertDaemonFieldSeparation(daemon: ConversationDaemon): void;
export declare function assertCallerOwnsDaemon(daemon: ConversationDaemon, callerAgentId: string): void;
export declare function makeDefaultConversationDaemon(daemonId: string, ownerId: string, displayName: string, careProfile: string): ConversationDaemon;
export declare function makeEmptyContextDelta(): ContextDelta;
export declare function generateROS2LaunchFile(packageName: string, urdfFilename: string, options?: { useSimTime?: boolean; rviz?: boolean; gazebo?: boolean; controllers?: string[]; }): string;
export declare function generateControllersYaml(robotName: string, jointNames: string[], options?: { controllerType?: string; publishRate?: number; }): string;
`;

// ============================================================================
// DAEMON CUSTOMIZATION PROFILE (D.052 extended — per exports-core.ts re-exports)
// ============================================================================
const daemonCustomizationDTS = `

// Daemon Customization Profile (D.052 Brittney field / user daemon model extended)
// Matches packages/core/src/daemon/DaemonCustomizationProfile.ts source types
export interface DaemonRitual { name: string; trigger: string; description: string; enabled: boolean; }
export interface DaemonFavoriteWorkflow { name: string; workflowId: string; description: string; }
export interface DaemonStyleProfile { displayName: string; appearance: DaemonAppearanceProfile; voice: DaemonVoiceProfile; tone: DaemonToneProfile; careProfile: string; rituals: DaemonRitual[]; favoriteWorkflows: DaemonFavoriteWorkflow[]; visualTheme: string; personalNotes?: string; }
export interface DaemonPermissionConfig { readOnly: boolean; proposeMutations: boolean; autonomousMutations: boolean; breakGlassAllowed: boolean; custodyScope: string[]; permissionEnvelope: 'read_only' | 'guarded_execute' | 'break_glass'; }
export interface DaemonCustomizationProfile { profileId: string; ownerId: string; version: number; createdAt: string; updatedAt: string; style: DaemonStyleProfile; permissions: DaemonPermissionConfig; }
export type DaemonCareProfile = 'attentive' | 'steady' | 'minimal' | 'intensive';
export type DaemonVisualTheme = 'classic' | 'compact' | 'expanded' | 'terminal' | 'narrative';

export const DAEMON_VISUAL_THEMES: Record<string, DaemonVisualTheme>;
export const DAEMON_CARE_PROFILES: Record<string, DaemonCareProfile>;

export class DaemonCustomizationSeparationError extends Error { constructor(message: string); }

export declare function assertCustomizationSeparation(profile: DaemonCustomizationProfile): void;
export declare function validateCustomizationProfile(profile: DaemonCustomizationProfile): string[];
export declare function makeDefaultStyleProfile(displayName?: string, careProfile?: string): DaemonStyleProfile;
export declare function makeDefaultPermissionConfig(): DaemonPermissionConfig;
export declare function makeDefaultCustomizationProfile(profileId: string, ownerId: string, displayName?: string, careProfile?: string): DaemonCustomizationProfile;
export declare function customizationProfileToDaemon(profile: DaemonCustomizationProfile): ConversationDaemon;
export declare function daemonToCustomizationProfile(daemon: ConversationDaemon): DaemonCustomizationProfile;
export declare function mergeStyleUpdates(profile: DaemonCustomizationProfile, styleUpdates: Partial<DaemonStyleProfile>): DaemonCustomizationProfile;
export declare function mergePermissionUpdates(base: DaemonPermissionConfig, updates: Partial<DaemonPermissionConfig>): DaemonPermissionConfig;
export declare function makePresetProfile(preset: 'companion' | 'professional' | 'creative' | 'minimal' | 'guardian', profileId: string, ownerId: string): DaemonCustomizationProfile;
`;

// ============================================================================
// MISSING BARREL EXPORTS (cli, lsp, and build consumers need these from main barrel)
// ============================================================================
const missingBarrelExportsDTS = `

// Pipeline parser (barrel/material-io-pipeline re-export)
export function parsePipeline(source: string): { success: boolean; errors: any[]; ast?: any; [key: string]: any };
export function isPipelineSource(source: string): boolean;

// Version utilities
export function getVersionInfo(): { version: string; [key: string]: any };
export function getVersionString(): string;

// Semantic diff
export interface SemanticDiffResult { [key: string]: any; }
export class SemanticDiffEngine { constructor(options?: any); diff(a: any, b: any, ...args: any[]): SemanticDiffResult; [key: string]: any; }
export function formatDiffResult(result: any): string;

// Pipeline compilation helpers
export function compilePipelineSourceToNode(source: string, options?: any): any;
export function parseHoloPartial(source: string, options?: any): any;

// WASM compilation
export function compileToWASM(ast: any, options?: any): any;

// Compilers re-exported to main barrel for dynamic import callers
export class SCMCompiler { constructor(options?: any); compile(ast: any, token?: any): any; [key: string]: any; }
export class GaussianSplattingCompiler { constructor(options?: { format?: 'gltf' | 'glb'; [key: string]: any }); compile(ast: any, token?: any, ...args: any[]): any; [key: string]: any; }

// Worker proxy for LSP
export class CompilerWorkerProxy { [key: string]: any; }

// HoloZone for build tools
export interface HoloZone { name?: string; [key: string]: any; }

// LSP completions data
export const ErrorRecovery: any;
export const HOLOSCHEMA_KEYWORDS: string[];
export const HOLOSCHEMA_GEOMETRIES: string[];
export const HOLOSCHEMA_PROPERTIES: string[];

// Known-trait union seam — SSOT for parser / LSP / linter trait vocabulary
// (src/traits/knownTraitSet.ts, re-exported via barrel/trait-stdlib-interop).
export declare function buildKnownTraitSet(
  extras?: ReadonlyArray<string | readonly string[]>
): Set<string>;
export const NATIVE2D_TRAITS: readonly string[];
export const CODE_GRAPH_TRAITS: readonly string[];

// AutoRig (traits/AutoRigTrait.ts) — re-exported via the main barrel.
export type AutoRigRigType = 'humanoid' | 'custom';
export type AutoRigPose = 't-pose' | 'a-pose';
export interface NativeAutoRigPlan {
  rig: AutoRigRigType;
  pose: AutoRigPose;
  source: 'native-holoscript';
  topology: 'animation-compatible' | 'provider-native';
  skeleton: any;
  boneCount: number;
  humanoidMap?: any;
  animationCompatibility: { standard: string; retargetTargets: string[]; bindPose: AutoRigPose };
  weighting: { solver: 'heat-diffusion-seed' | 'custom-envelope-seed'; maxInfluences: number; status: 'seeded' };
}
export interface AutoRigConfig {
  rig?: AutoRigRigType;
  pose?: AutoRigPose;
  sourceMesh?: string;
  topology?: 'animation-compatible' | 'provider-native';
  objectName?: string;
  provider?: string;
}
export declare function createNativeAutoRigPlan(config?: AutoRigConfig): NativeAutoRigPlan;

// Audit logging (audit/AuditLogger.ts) — re-exported via the main barrel.
export interface AuditEvent {
  id: string;
  timestamp: Date;
  tenantId: string;
  actorId: string;
  actorType: 'user' | 'agent' | 'system';
  action: string;
  resource: string;
  resourceId?: string;
  outcome: 'success' | 'failure' | 'denied';
  metadata: Record<string, unknown>;
  clientIp?: string;
  userAgent?: string;
}
export type AuditEventInput = Omit<AuditEvent, 'id' | 'timestamp'>;
export interface AuditQueryFilter {
  tenantId?: string; actorId?: string; actorType?: 'user' | 'agent' | 'system';
  action?: string; resource?: string; resourceId?: string;
  outcome?: 'success' | 'failure' | 'denied';
  since?: Date; until?: Date; limit?: number; offset?: number;
}
export class AuditLogger {
  constructor(storage?: any);
  log(input: AuditEventInput): AuditEvent;
  query(filter: AuditQueryFilter): AuditEvent[];
  export(filter: AuditQueryFilter, format: 'json' | 'csv'): string;
  setRetentionPolicy(tenantId: string, days: number): void;
  getRetentionPolicy(tenantId: string): number | undefined;
  purgeExpired(): number;
  getEventCount(filter?: AuditQueryFilter): number;
}

export type FrameTier = 0 | 1 | 2 | 3;
export const FRAME_DECLARATION_MCP_META_KEY: 'holoscript.dev/frame-declaration';
export interface FrameDeclaration {
  domain: string;
  horizon: string;
  capability_tier: FrameTier;
  trust_tier: FrameTier;
  allowed_tools: string[];
  denied_domains: string[];
}
export type FrameDeclarationConfig = Partial<FrameDeclaration>;
export type FrameViolationType =
  | 'tool_not_allowed'
  | 'domain_denied'
  | 'horizon_exceeded'
  | 'tier_exceeded'
  | 'undeclared_frame';
export interface FrameCheckResult {
  allowed: boolean;
  violation_type?: FrameViolationType;
  detail?: string;
}
export function checkToolAllowed(frame: FrameDeclaration, tool: string): FrameCheckResult;
`;

// Confabulation risk layer — the per-trait enum/type/range prop-schema validator plus the
// schemas/conflicts derived from the .holo trait tree. Public API (see core/src/index.ts) so the
// shared validate_composition fold point can advise on trait props authored in .holo. tsup emits
// the runtime; this hand-crafted .d.ts declares the surface consumers import.
const confabulationValidatorDTS = `
// ============================================================================
// Confabulation risk layer — trait prop-schema validator (enum/type/range)
// ============================================================================
export type TraitPropertyType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'color' | 'vector3' | 'enum' | 'any';
export interface TraitPropertySchema { name: string; type: TraitPropertyType; required?: boolean; defaultValue?: unknown; min?: number; max?: number; enumValues?: string[]; description?: string; label?: string; step?: number; hidden?: boolean; }
export interface TraitSchema { name: string; category: string; properties: TraitPropertySchema[]; conflictsWith?: string[]; requires?: string[]; }
export interface ConfabulationValidatorConfig { riskThreshold?: number; unknownPropertySeverity?: 'error' | 'warning'; validatePrerequisites?: boolean; validateConflicts?: boolean; validateRanges?: boolean; customSchemas?: TraitSchema[]; strict?: boolean; includeDerivedSchemas?: boolean; }
export interface ConfabulationError { code: string; message: string; traitName?: string; objectName?: string; suggestion?: string; [key: string]: any; }
export interface ConfabulationWarning { code: string; message: string; traitName?: string; objectName?: string; suggestion?: string; riskContribution?: number; [key: string]: any; }
export interface ConfabulationValidationResult { valid: boolean; riskScore: number; errors: ConfabulationError[]; warnings: ConfabulationWarning[]; traitsChecked: number; propertiesChecked: number; validationTimeMs: number; }
export declare class ConfabulationValidator {
  constructor(config?: ConfabulationValidatorConfig);
  validateComposition(composition: any): ConfabulationValidationResult;
  validateTraitProperties(traitName: string, properties: Record<string, unknown>, objectName?: string): { errors: ConfabulationError[]; warnings: ConfabulationWarning[] };
  getTraitSchema(traitName: string): TraitSchema | undefined;
  registerSchema(schema: TraitSchema): void;
  registerSchemas(schemas: TraitSchema[]): void;
}
export declare function getConfabulationValidator(config?: ConfabulationValidatorConfig): ConfabulationValidator;
export declare const DERIVED_TRAIT_SCHEMAS: TraitSchema[];
export declare const DERIVED_TRAIT_CONFLICTS: string[];
/** Per-trait authoring affordances from \`.holo\` \`ui:\` blocks, keyed by trait name. Slim by
 *  design: editors import this instead of DERIVED_TRAIT_SCHEMAS (~590 KB). A trait absent
 *  here declares no affordances and the editor falls back to its own defaults. */
export declare const TRAIT_UI_AFFORDANCES: Readonly<Record<string, readonly TraitPropertySchema[]>>;
`;

const finalMainDTS =
  mainDTS +
  holoLandTraitsDTS +
  careFieldDTS +
  conversationDaemonDTS +
  daemonCustomizationDTS +
  missingBarrelExportsDTS +
  confabulationValidatorDTS;

// Write type declaration files
const files = [
  { path: path.join(distDir, 'index.d.ts'), content: finalMainDTS },
  { path: path.join(distDir, 'testing.d.ts'), content: testingDTS },
  { path: path.join(distDir, 'parser.d.ts'), content: parserDTS },
  { path: path.join(distDir, 'runtime.d.ts'), content: runtimeDTS },
  { path: path.join(distDir, 'type-checker.d.ts'), content: typeCheckerDTS },
  { path: path.join(distDir, 'debugger.d.ts'), content: debuggerDTS },
];

for (const file of files) {
  try {
    fs.writeFileSync(file.path, file.content, 'utf8');
    console.log(`✓ Created ${path.basename(file.path)}`);
  } catch (err) {
    console.error(`✗ Failed to create ${path.basename(file.path)}:`, err.message);
  }
}

try {
  const tscBin = path.join(coreRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  execFileSync(process.execPath, [tscBin, '-p', 'tsconfig.public-subpaths.json'], {
    cwd: coreRoot,
    stdio: 'inherit',
  });
  console.log('✓ Created public subpath declarations');
} catch (err) {
  console.error('✗ public subpath declaration emit failed:', err?.message ?? err);
  process.exit(1);
}

const publicSubpathDeclarationAliases = [
  { name: 'math/tropical-spmv.d.ts', target: './tropicalSpmv.js' },
  { name: 'traits/kinematic-chain.d.ts', target: './KinematicChainTrait.js' },
  { name: 'traits/control-loop.d.ts', target: './ControlLoopTrait.js' },
  { name: 'traits/sensor-sampling.d.ts', target: './SensorSamplingTrait.js' },
  { name: 'traits/transaction.d.ts', target: './TransactionTrait.js' },
  { name: 'matter/index.d.ts', target: './StagedMatter.js' },
];

for (const { name, target } of publicSubpathDeclarationAliases) {
  try {
    const aliasPath = path.join(distDir, name);
    fs.mkdirSync(path.dirname(aliasPath), { recursive: true });
    fs.writeFileSync(aliasPath, `export * from '${target}';\n`, 'utf8');
    console.log(`✓ Created ${name}`);
  } catch (err) {
    console.error(`✗ Failed to create ${name}:`, err.message);
  }
}

// Stub DTS for subpaths missing from hand-crafted declarations
const codebaseDTS = `// @holoscript/core/codebase — local dedup + god-file detection utilities
export declare class DedupFilter {
  constructor(config?: { hashFn?: (item: unknown) => string; [key: string]: unknown });
  add(item: unknown): boolean;
  has(item: unknown): boolean;
  report(): { duplicates: unknown[]; removals: unknown[] };
  [key: string]: unknown;
}
export declare function createDedupFilter(config?: unknown): DedupFilter;
export declare class GodFileDetector {
  constructor(thresholds?: unknown);
  analyze(path: string, content: string): unknown;
  [key: string]: unknown;
}
export declare function createGodFileDetector(thresholds?: unknown): GodFileDetector;
export type Dedupable = unknown;
export type DedupReport = { duplicates: unknown[]; removals: unknown[] };
export type DedupRemoval = unknown;
export type DedupConfig = unknown;
export type FileMetrics = unknown;
export type GodFileClassification = unknown;
export type GodFileReport = unknown;
export type VirtualSplitPlan = unknown;
export type SplitSegment = unknown;
export type GodFileThresholds = unknown;
`;

const storageDTS = `// @holoscript/core/storage — IPFS storage utilities
export declare class IPFSService {
  constructor(options?: unknown);
  upload(file: Uint8Array | string, options?: unknown): Promise<unknown>;
  pin(cid: string): Promise<unknown>;
  unpin(cid: string): Promise<unknown>;
  [key: string]: unknown;
}
export declare class PinataProvider { constructor(options?: unknown); [key: string]: unknown; }
export declare class NFTStorageProvider { constructor(options?: unknown); [key: string]: unknown; }
export declare class InfuraProvider { constructor(options?: unknown); [key: string]: unknown; }
export declare class IPFSUploadError extends Error {}
export declare class IPFSPinError extends Error {}
export declare class FileSizeExceededError extends Error {}
export type IPFSProvider = unknown;
export type IPFSServiceOptions = unknown;
export type FallbackProvider = unknown;
export type IPFSFile = unknown;
export type UploadProgress = unknown;
export type UploadOptions = unknown;
export type UploadResult = unknown;
export type PinStatus = unknown;
export type PinInfo = unknown;
export type IIPFSProvider = unknown;
`;

const toolsDTS = `// @holoscript/core/tools — developer tools and integrations
export declare class ErrorFormatter { format(error: unknown): string; [key: string]: unknown; }
export declare class HoloScriptREPL { start(): void; [key: string]: unknown; }
export declare function startREPL(): HoloScriptREPL;
export declare class HotReloadWatcher { watch(path: string): void; [key: string]: unknown; }
export declare class SourceMapGenerator { generate(source: string): string; [key: string]: unknown; }
export declare class MaterialEditor { constructor(config?: unknown); [key: string]: unknown; }
export declare class SceneInspector { constructor(config?: unknown); [key: string]: unknown; }
export declare class VisualEditor { constructor(config?: unknown); [key: string]: unknown; }
export interface MaterialEditorPreset {
  name: string;
  category: string;
  /** Partial PBR material override. Studio adapter consumes a known
   * subset (albedo / emission / blend / roughness / metallic / etc.); the
   * full MaterialDef surface lives in core's runtime. */
  material: {
    albedo?: { r: number; g: number; b: number; a?: number };
    emission?: { r: number; g: number; b: number };
    emissionStrength?: number;
    blendMode?: string;
    roughness?: number;
    metallic?: number;
    doubleSided?: boolean;
    [key: string]: unknown;
  };
  previewColor: string;
}
export type MaterialEditorConfig = unknown;
export type MaterialPreset = unknown;
export declare function getMaterialEditorBuiltinPresets(): MaterialEditorPreset[];
export declare function listMaterialEditorQuickPickPresetNames(): readonly string[];
export declare function listMaterialEditorQuickPickPresetsByCategory(): Map<string, string[]>;
export declare function rgbaToHex(color: { r: number; g: number; b: number; a?: number }): string;
`;

const constantsDTS = `// @holoscript/core/constants — trait name constants
// VR_TRAITS lives in the main bundle (chunk), not in dist/traits/index.js
export { VR_TRAITS } from './index.js';
export type { VRTraitName } from './index.js';
`;

const scriptingDTS = `// @holoscript/core/scripting — headless runtime and scripting traits
export declare function createHeadlessRuntime(options?: unknown): unknown;
export declare function getProfile(name: string): unknown;
export declare const HEADLESS_PROFILE: unknown;
export type HeadlessRuntime = unknown;
export type HeadlessRuntimeOptions = unknown;
export type RuntimeProfile = unknown;
`;

const interopDTS = `// @holoscript/core/interop — interop bindings and resilience patterns
export declare class InteropBindingGenerator {
  generate(exports: unknown[]): string;
  [key: string]: unknown;
}
export declare class ModuleResolver { resolve(id: string): unknown; [key: string]: unknown; }
export type BindingExport = unknown;
export type BindingParameter = unknown;
export type GeneratedBinding = unknown;
`;

const reconstructionDTS = `/** @holoscript/core/reconstruction — HoloMap + SimulationContract binding */
export declare const HOLOMAP_SIMULATION_CONTRACT_KIND: 'holomap.reconstruction.v1';
export interface ReconstructionFrame {
  index: number;
  timestampMs: number;
  rgb: Uint8Array;
  width: number;
  height: number;
  stride: 3 | 4;
}
export interface CameraPose {
  position: [number, number, number];
  rotation: [number, number, number, number];
  confidence: number;
}
export interface PointCloudChunk {
  positions: Float32Array;
  colors: Uint8Array;
  normals?: Float32Array;
  confidence: Float32Array;
}
export interface ReconstructionStep {
  frame: ReconstructionFrame;
  pose: CameraPose;
  points: PointCloudChunk;
  trajectory: TrajectoryMemoryState;
  anchor: AnchorContextState;
}
export interface TrajectoryKeyframe {
  frameIndex: number;
  timestampMs: number;
  pose: CameraPose;
  embedding: Float32Array;
}
export interface TrajectoryMemoryState {
  keyframes: TrajectoryKeyframe[];
  estimatedDriftMeters: number;
  lastLoopClosureFrame: number;
  revision: number;
}
export interface AnchorContextState {
  anchorFrameIndex: number;
  anchorPose: CameraPose;
  anchorDescriptor: Float32Array;
  revision: number;
}
export interface HoloMapConfig {
  inputResolution: { width: number; height: number };
  targetFPS: number;
  maxSequenceLength: number;
  seed: number;
  modelHash: string;
  videoHash?: string;
  tileGrid?: number;
  weightCid?: string;
  weightUrl?: string;
  weightUrls?: string[];
  cpuOffload: boolean;
  weightStrategy?: 'distill' | 'fine-tune' | 'from-scratch';
  verticalProfile?: 'generalist' | 'indoor' | 'outdoor' | 'object';
  allowCpuFallback?: boolean;
  localResolver?: (weightCid: string) => Promise<ArrayBuffer | undefined>;
}
export declare const HOLOMAP_DEFAULTS: HoloMapConfig;
export interface ReconstructionManifest {
  version: '1.0.0';
  worldId: string;
  displayName: string;
  pointCount: number;
  frameCount: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  replayHash: string;
  simulationContract: {
    kind: 'holomap.reconstruction.v1';
    replayFingerprint: string;
    holoScriptBuild: string;
  };
  provenance: {
    anchorHash?: string;
    opentimestampsProof?: string;
    baseCalldataTx?: string;
    capturedAtIso: string;
  };
  assets: { points: string; trajectory: string; anchors: string; splats?: string };
  weightStrategy: 'distill' | 'fine-tune' | 'from-scratch';
}
export interface HoloMapRuntime {
  init(config: HoloMapConfig): Promise<void>;
  step(frame: ReconstructionFrame): Promise<ReconstructionStep>;
  finalize(): Promise<ReconstructionManifest>;
  replayHash(): string;
  dispose(): Promise<void>;
}
export declare function createHoloMapRuntime(config?: Partial<HoloMapConfig>): HoloMapRuntime;
export declare function computeHoloMapReplayFingerprint(parts: {
  modelHash: string;
  seed: number;
  weightStrategy: string;
  videoHash?: string;
  tileGrid?: number;
  weightCid?: string;
  verticalProfile?: 'generalist' | 'indoor' | 'outdoor' | 'object';
}): string;
export declare function fnv1a32Hex(input: string): string;
export declare function assertHoloMapManifestContract(m: ReconstructionManifest): void;

/** HoloTorch WebGPU model types and shadow-only execution admission. */
export interface BlockWeights {
  ln1g: Float32Array;
  ln1b: Float32Array;
  wqkv: Float32Array;
  bqkv: Float32Array;
  wproj: Float32Array;
  bproj: Float32Array;
  ln2g: Float32Array;
  ln2b: Float32Array;
  wfc1: Float32Array;
  bfc1: Float32Array;
  wfc2: Float32Array;
  bfc2: Float32Array;
}
export interface ModelWeights {
  wte: Float32Array;
  wpe: Float32Array;
  blocks: BlockWeights[];
  lnfg: Float32Array;
  lnfb: Float32Array;
}
export interface ModelConfig { nEmbd: number; nHead: number; vocab: number; }
export interface HoloTorchModel {
  run(ids: Uint32Array, weights: ModelWeights, config: ModelConfig): Promise<Float32Array>;
}
export declare const HOLOTORCH_SHADOW_EXECUTION_SCHEMA: 'holoscript.holotorch-shadow-execution.v0.1.0';
export declare const HOLOTORCH_TENSOR_SET_SCHEMA: 'holoscript.holotorch-tensor-set.v0.1.0';
export declare const HOLOTORCH_ARTIFACT_BINDING_SCHEMA: 'holoscript.holotorch-artifact-binding.v0.1.0';
export type HoloTorchSha256 = \`sha256:\${string}\`;
export interface HoloTorchShadowBinding {
  model: string;
  architecture: 'holo-gpt2-v0';
  config: {
    nLayer: number;
    nEmbd: number;
    nHead: number;
    vocab: number;
    maxPosition: number;
  };
  artifactBindingSha256: HoloTorchSha256;
  checkpointSha256: HoloTorchSha256;
  tokenizerSha256: HoloTorchSha256;
  expectedTensorSetSha256: HoloTorchSha256;
  kernelSetSha256: HoloTorchSha256;
  runtimeSha256: HoloTorchSha256;
  sourceRevision: string;
}
export type HoloTorchArtifactBindingMaterial = Omit<
  HoloTorchShadowBinding,
  'artifactBindingSha256'
>;
export interface HoloTorchExecutionEnvironment {
  available: boolean;
  runtime: { name: string; version: string; hostOS: string };
  adapter: {
    vendor: string;
    architecture: string;
    device: string;
    driver: string;
    fingerprintSha256: HoloTorchSha256;
  };
}
export interface HoloTorchTensorSetFingerprint {
  tensorSetSha256: HoloTorchSha256;
  tensorCount: number;
  totalBytes: number;
}
export interface HoloTorchShadowExecutionReceipt {
  schema: typeof HOLOTORCH_SHADOW_EXECUTION_SCHEMA;
  authority: 'shadow-only';
  status: 'observed';
  trust: {
    executionEvidence: 'caller-observed';
    authentication: 'self-hash-only';
    executionClass: 'one-shot-audit';
  };
  model: {
    name: string;
    architecture: 'holo-gpt2-v0';
    config: { nLayer: number; nEmbd: number; nHead: number; vocab: number; maxPosition: number };
  };
  artifact: {
    artifactBindingSha256: HoloTorchSha256;
    checkpointSha256: HoloTorchSha256;
    tokenizerSha256: HoloTorchSha256;
    tensorSetSha256: HoloTorchSha256;
    tensorCount: number;
    totalBytes: number;
  };
  runtime: {
    backend: 'holotorch-webgpu';
    kernelSetSha256: HoloTorchSha256;
    runtimeSha256: HoloTorchSha256;
    sourceRevision: string;
    name: string;
    version: string;
    hostOS: string;
    adapter: {
      vendor: string;
      architecture: string;
      device: string;
      driver: string;
      fingerprintSha256: HoloTorchSha256;
    };
  };
  input: { dtype: 'u32le'; tokenCount: number; tokenIdsSha256: HoloTorchSha256 };
  output: {
    dtype: 'f32le';
    shape: [number, number];
    logitsSha256: HoloTorchSha256;
    finite: true;
  };
  timing: { startedAt: string; durationMs: number };
  receiptSha256: HoloTorchSha256;
}
export interface HoloTorchShadowVerificationPolicy {
  artifactBindingSha256: HoloTorchSha256;
  adapterFingerprintSha256: HoloTorchSha256;
  sourceRevision: string;
}
export interface HoloTorchShadowExecutor {
  execute(ids: Uint32Array): Promise<{
    logits: Float32Array;
    receipt: HoloTorchShadowExecutionReceipt;
  }>;
}
export interface HoloTorchShadowClock { nowMs(): number; nowIso(): string; }
export declare function fingerprintHoloTorchTensorSet(
  weights: ModelWeights,
  config: ModelConfig,
): Promise<HoloTorchTensorSetFingerprint>;
export declare function deriveHoloTorchArtifactBindingSha256(
  binding: HoloTorchArtifactBindingMaterial,
): Promise<HoloTorchSha256>;
export declare function createHoloTorchShadowExecutor(args: {
  model: HoloTorchModel | null;
  weights: ModelWeights;
  config: ModelConfig;
  binding: HoloTorchShadowBinding;
  environment: HoloTorchExecutionEnvironment;
  clock?: HoloTorchShadowClock;
}): Promise<HoloTorchShadowExecutor>;
export declare function verifyHoloTorchShadowExecutionReceipt(
  value: unknown,
  expected: HoloTorchShadowVerificationPolicy,
): Promise<{ valid: boolean; errors: string[] }>;

/** @cross_perceiver_contract — perceiver-consensus receipt + per-artifact derivations */
export declare const PERCEIVER_CONSENSUS_VERSION: 'perceiver-consensus-v3';
export declare const POSITION_EPSILON: number;
export type PerceiverFactClass =
  | 'source-name'
  | 'agent-entities'
  | 'affordance-count'
  | 'affordance-names'
  | 'physical-entities'
  | 'geometry'
  | 'position';
export declare function canonicalPhysicalId(name: string): string;
export interface PerceivedAffordanceOffer {
  action: string;
  target?: string;
  [key: string]: unknown;
}
export interface PerceivedEntity {
  id: string;
  kind: 'agent';
  offerCount: number;
  offers?: PerceivedAffordanceOffer[];
  [key: string]: unknown;
}
export interface PerceivedPhysicalEntity {
  id: string;
  label?: string;
  geometry?: string;
  position?: number[];
  extent?: number;
  mobility?: 'fixed' | 'actuated';
  [key: string]: unknown;
}
export interface PerceiverDerivation {
  perceiver: string;
  artifactHash: string;
  expresses: PerceiverFactClass[];
  sourceName: string | null;
  entities: PerceivedEntity[];
  physicalEntities?: PerceivedPhysicalEntity[];
  coverageGaps: string[];
}
export interface PerceiverDisagreement {
  fact: string;
  claims: Record<string, string | number | null>;
  detail: string;
}
export interface PerceiverConsensusReceipt {
  version: typeof PERCEIVER_CONSENSUS_VERSION;
  verdict: 'CONSENSUS' | 'FALSIFIED';
  sourceName: string | null;
  perceivers: Array<{
    perceiver: string;
    artifactHash: string;
    expresses: PerceiverFactClass[];
    entityCount: number;
    physicalEntityCount: number;
    coverageGaps: string[];
  }>;
  comparedFacts: number;
  disagreements: PerceiverDisagreement[];
  receiptHash: string;
}
export declare function derivePerceiverConsensus(
  derivations: PerceiverDerivation[]
): PerceiverConsensusReceipt;
export declare const WEBGPU_PERCEIVER: 'webgpu';
export declare function deriveWebGPUPerception(artifact: string): PerceiverDerivation;
export declare const AGENT_INFERENCE_PERCEIVER: 'agent-inference';
export declare function deriveAgentInferencePerception(
  files: Record<string, string>
): PerceiverDerivation;
export declare const URDF_PERCEIVER: 'urdf';
export declare function deriveUrdfPerception(artifact: string): PerceiverDerivation;
/** @verified_view — make agent-authored 2D surfaces provenance-complete for the gate. */
export declare function enforceVerifiedViewReceipts(source: string): string;
export declare function isProvenanceComplete(source: string): boolean;
export declare function derivedProjectionNode(
  config: Record<string, unknown> | undefined
): string | null;
export type VerifiedViewViolationReason =
  | 'missing-projects'
  | 'mismatched-node'
  | 'hallucinated-root'
  | 'projects-without-binding'
  | 'no-verified-view';
export interface VerifiedViewViolation {
  element: string;
  node: string | null;
  reason: VerifiedViewViolationReason;
  detail: string;
}
export interface VerifiedViewDiagnosis {
  parsed: boolean;
  hasBindings: boolean;
  verifiedViewOn: boolean;
  complete: boolean;
  violations: VerifiedViewViolation[];
}
export declare function diagnoseVerifiedView(source: string): VerifiedViewDiagnosis;
export declare const SURFACE_TWIN_VERSION: 'surface-twin-v1';
export type SurfaceTwinScalar = string | number | boolean | null;
export interface SurfaceTwinTransform {
  precision?: number;
  prefix?: string;
  suffix?: string;
}
export interface SurfaceTwinProjection {
  element: string;
  node: string;
  entity?: string;
  identity: boolean;
  transform?: SurfaceTwinTransform;
}
export interface SurfaceTwinDivergence {
  node: string;
  entity: string;
  displayed: SurfaceTwinScalar;
  authoritative: SurfaceTwinScalar;
  expected?: SurfaceTwinScalar;
  detail: string;
}
export type SurfaceTwinAbstentionReason =
  | 'no-entity-binding'
  | 'non-identity-transform'
  | 'authority-unavailable'
  | 'authority-missing'
  | 'display-missing';
export interface SurfaceTwinAbstention {
  node: string;
  entity?: string;
  reason: SurfaceTwinAbstentionReason;
}
export interface SurfaceTwinReceipt {
  version: typeof SURFACE_TWIN_VERSION;
  verdict: 'CONSENSUS' | 'FALSIFIED';
  checked: number;
  divergences: SurfaceTwinDivergence[];
  abstentions: SurfaceTwinAbstention[];
  receiptHash: string;
}
export interface SurfaceTwinInput {
  contract: { projections: SurfaceTwinProjection[] };
  displayedValues: Record<string, SurfaceTwinScalar>;
  authoritativeState: Record<string, Record<string, unknown> | SurfaceTwinScalar>;
  unavailableEntities?: readonly string[];
}
export declare function checkSurfaceTwinCorrespondence(input: SurfaceTwinInput): SurfaceTwinReceipt;
export declare function applyProjectionTransform(raw: SurfaceTwinScalar, transform: SurfaceTwinTransform): string;
export type AuthoritativeStateFetcher = (
  entity: string
) => Promise<Record<string, unknown> | SurfaceTwinScalar | null | undefined>;
export declare function verifySurfaceTwinLive(input: {
  contract: { projections: SurfaceTwinProjection[] };
  displayedValues: Record<string, SurfaceTwinScalar>;
  fetchAuthoritativeState: AuthoritativeStateFetcher;
}): Promise<SurfaceTwinReceipt>;
export declare function extractDisplayedProjections(html: string): Record<string, string>;
export declare function isTwinCheckable(projection: SurfaceTwinProjection): boolean;
export declare const LIVE_PROOF_TWIN_VERSION: 'live-proof-twin-v1';
export type LiveProofIndependence = 'self-referential' | 'fault-tested' | 'verified';
export interface LiveProofAnchor {
  input: string;
  node: string;
  entity: string;
}
export interface LiveProofBinding {
  claim: string;
  label: string;
  independence: LiveProofIndependence;
  inputs: string[];
  anchors: LiveProofAnchor[];
  unanchored: string[];
}
export type LiveProofTwinVerdict = 'VERIFIED' | 'FALSIFIED' | 'ABSTAIN';
export type LiveProofAbstentionReason =
  | 'independence-insufficient'
  | 'authority-unreachable'
  | 'receipt-mismatch';
export interface LiveProofTwinReceipt {
  version: typeof LIVE_PROOF_TWIN_VERSION;
  verdict: LiveProofTwinVerdict;
  claim: string;
  displayedState: 'pass' | 'falsified';
  confirmed: string[];
  divergent: Array<{ input: string; entity: string; detail: string }>;
  abstention?: { reason: LiveProofAbstentionReason; detail: string };
  reason: string;
  receiptHash: string;
}
export declare function deriveLiveProofInputs(claim: string, stateFields: Iterable<string>): string[];
export declare function anchorLiveProofClaim(input: {
  inputs: readonly string[];
  projections: readonly SurfaceTwinProjection[];
}): { anchors: LiveProofAnchor[]; unanchored: string[] };
export declare function gradeLiveProofIndependence(input: {
  faultTested: boolean;
  inputs: readonly string[];
  unanchored: readonly string[];
}): LiveProofIndependence;
export declare function checkLiveProofTwinVerdict(input: {
  binding: LiveProofBinding;
  displayedState: 'pass' | 'falsified';
  twinReceipt: SurfaceTwinReceipt;
}): LiveProofTwinReceipt;
`;

const worldDTS = `/** @holoscript/core/world — Native world generation adapters/service */
export interface WorldGenerationRequest {
  prompt: string;
  input_image?: string;
  input_images?: string[];
  format: 'mesh' | '3dgs' | 'both' | 'neural_field';
  quality: 'low' | 'medium' | 'high' | 'ultra';
  seed?: number;
  navEnabled?: boolean;
  interactiveMode?: boolean;
}
export interface WorldMetadata {
  format: 'mesh' | '3dgs' | 'both' | 'neural_field';
  bounds: [number, number, number, number, number, number];
  agentStart?: [number, number, number];
  waypoints?: [number, number, number][];
  splatCount?: number;
  triangleCount?: number;
  generationMs?: number;
}
export interface WorldGenerationResult {
  generationId: string;
  assetUrl: string;
  navmeshUrl?: string;
  pointCloudUrl?: string;
  metadata: WorldMetadata;
}
export interface WorldGeneratorAdapter {
  readonly id: string;
  generate(req: WorldGenerationRequest): Promise<WorldGenerationResult>;
  getProgress?(generationId: string): Promise<number>;
  cancel?(generationId: string): Promise<void>;
}
export declare class WorldAdapterRegistry {
  register(adapter: WorldGeneratorAdapter): void;
  get(engineId: string): WorldGeneratorAdapter;
  has(engineId: string): boolean;
  list(): string[];
}
export declare const worldAdapterRegistry: WorldAdapterRegistry;
export interface SovereignWorldAdapterOptions {
  endpoint?: string;
  apiKey?: string;
}
export declare class SovereignWorldAdapter implements WorldGeneratorAdapter {
  readonly id: string;
  constructor(options?: SovereignWorldAdapterOptions);
  generate(req: WorldGenerationRequest): Promise<WorldGenerationResult>;
}
export interface Sovereign3DAdapterOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  mockMode?: boolean;
  mockLatencyMs?: number;
}
export declare class Sovereign3DAdapter implements WorldGeneratorAdapter {
  readonly id: string;
  constructor(options?: Sovereign3DAdapterOptions);
  generate(req: WorldGenerationRequest): Promise<WorldGenerationResult>;
  getProgress(generationId: string): Promise<number>;
}
export type GeneratorSource = 'sovereign-local' | 'sovereign-cloud' | 'keyword-fallback' | 'mock';
export interface TraitSuggestionResult {
  traits: string[];
  reasoning: Record<string, string>;
  confidence: number;
  metadata: { source: GeneratorSource };
}
export interface ObjectGenerationResult {
  code: string;
  metadata: {
    description: string;
    traits: string[];
    geometry: string;
    generationMs?: number;
    source: GeneratorSource;
  };
}
export interface SceneGenerationResult {
  code: string;
  metadata: {
    description: string;
    objectCount: number;
    traits: string[];
    generationMs?: number;
    source: GeneratorSource;
  };
}
export interface SovereignGeneratorAdapterOptions {
  localEndpoint?: string;
  cloudEndpoint?: string;
  cloudApiKey?: string;
  localModel?: string;
  cloudModel?: string;
  maxTokens?: number;
  timeoutMs?: number;
  offlineOnly?: boolean;
  mockMode?: boolean;
  mockLatencyMs?: number;
}
export declare class SovereignGeneratorAdapter {
  readonly id: string;
  constructor(options?: SovereignGeneratorAdapterOptions);
  suggestTraits(description: string, context?: string): Promise<TraitSuggestionResult>;
  generateObject(description: string): Promise<ObjectGenerationResult>;
  generateScene(description: string): Promise<SceneGenerationResult>;
}
export interface WorldGenerateEvent extends WorldGenerationRequest {
  nodeId: string;
  engine: string;
}
export interface WorldGenerationStartedEvent {
  nodeId: string;
  engine: string;
  generationId: string;
}
export interface WorldGenerationProgressEvent {
  nodeId: string;
  progress: number;
}
export interface WorldGenerationCompleteEvent {
  nodeId: string;
  assetUrl: string;
  navmeshUrl?: string;
  pointCloudUrl?: string;
  generationId: string;
  metadata: Record<string, unknown>;
}
export interface WorldGenerationErrorEvent {
  nodeId: string;
  error: string;
}
export interface WorldEventEmitter {
  on(event: string, listener: (data: unknown) => void): void;
  off?(event: string, listener: (data: unknown) => void): void;
  emit(event: string, data: unknown): void;
}
export declare class WorldGeneratorService {
  readonly registry: WorldAdapterRegistry;
  constructor(registry?: WorldAdapterRegistry);
  registerDefaultAdapters(): void;
  bindEventEmitter(emitter: WorldEventEmitter): () => void;
  handleGenerateEvent(emitter: WorldEventEmitter, event: WorldGenerateEvent): Promise<void>;
}
export declare const worldGeneratorService: WorldGeneratorService;
`;

const worldModelDTS = `/** @holoscript/core/world-model — adversarial trajectory curriculum schema */
export type TrajectoryId = string & { readonly __brand: 'TrajectoryId' };
export type SceneHash = string & { readonly __brand: 'SceneHash' };
export type CaelReceiptHash = string & { readonly __brand: 'CaelReceiptHash' };
export type TrustTier = 'replayable' | 'adapter-bound' | 'unsigned';
export type SimulationContractHashMode = 'fnv1a' | 'sha256';
export type ReplayDigestMode =
  | 'strict-same-adapter'
  | 'epsilon-cross-adapter'
  | 'unsigned-observed';
export interface SimulationFieldQuantum {
  readonly fieldPattern: string;
  readonly quantum: number;
  readonly units?: string;
}
export interface SimulationContractReference {
  readonly contractId: string;
  readonly hashMode: SimulationContractHashMode;
  readonly adapterFingerprint: string | null;
  readonly replayDigestMode: ReplayDigestMode;
  readonly fieldQuantization: readonly SimulationFieldQuantum[];
}
export interface ActionStep {
  readonly stepIndex: number;
  readonly timestampMs: number;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}
export interface ObservationStep {
  readonly stepIndex: number;
  readonly timestampMs: number;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}
export interface SemanticPredicateScore {
  readonly violation: number;
  readonly novelty: number;
  readonly learnability: number;
  readonly regression: number;
  readonly invalidity: number;
}
export interface CurriculumPriority {
  readonly priority: number;
  readonly tieBreaker: number;
  readonly rationale: string;
}
export interface ValidityAnchor {
  readonly id: string;
  readonly description: string;
  evaluate(trajectory: AdversarialTrajectory): boolean;
}
export interface ReplayHandle {
  readonly trajectoryId: TrajectoryId;
  readonly sceneHash: SceneHash;
  readonly simulationContractId: string;
  readonly seed: number;
  readonly replayCommand: string;
}
export type TrajectoryStatus = 'open' | 'solved' | 'unresolved' | 'invalid' | 'archived';
export interface AdversarialTrajectory {
  readonly id: TrajectoryId;
  readonly sceneHash: SceneHash;
  readonly seed: number;
  readonly trustTier: TrustTier;
  readonly caelReceiptHash: CaelReceiptHash | null;
  readonly simulationContract: SimulationContractReference;
  readonly actionTrace: readonly ActionStep[];
  readonly observationTrace: readonly ObservationStep[];
  readonly predicateScore: SemanticPredicateScore;
  readonly priority: CurriculumPriority;
  readonly replayHandle: ReplayHandle;
  readonly status: TrajectoryStatus;
  readonly discoveredAtMs: number;
  readonly lastReplayedAtMs: number | null;
}
export interface AdversarialTrajectoryReport {
  readonly generatedAtMs: number;
  readonly sceneHash: SceneHash;
  readonly trajectories: readonly AdversarialTrajectory[];
  readonly counts: {
    readonly open: number;
    readonly solved: number;
    readonly unresolved: number;
    readonly invalid: number;
    readonly archived: number;
  };
  readonly topPriority: readonly TrajectoryId[];
}
export declare function isCurriculumEligible(trajectory: AdversarialTrajectory): boolean;
export declare function hasReplayEvidence(trajectory: AdversarialTrajectory): boolean;
export declare function asTrajectoryId(s: string): TrajectoryId;
export declare function asSceneHash(s: string): SceneHash;
export declare function asCaelReceiptHash(s: string): CaelReceiptHash;
export interface SoftAnchor {
  readonly id: string;
  readonly description: string;
  evaluate(trajectory: AdversarialTrajectory): number;
}
export interface ScorerInputs {
  readonly trajectory: AdversarialTrajectory;
  readonly hardAnchors: readonly ValidityAnchor[];
  readonly softAnchors: readonly SoftAnchor[];
  readonly historyActionTypes: ReadonlySet<string>;
  readonly learnabilityEstimate?: number;
  readonly previousStatus?: AdversarialTrajectory['status'];
}
export interface ScorerOutput {
  readonly predicateScore: SemanticPredicateScore;
  readonly priority: CurriculumPriority;
}
export declare function scoreTrajectory(inputs: ScorerInputs): ScorerOutput;
export declare function buildAdversarialTrajectoryReport(
  trajectories: readonly AdversarialTrajectory[],
  sceneHash: SceneHash,
  generatedAtMs: number,
  topPriorityLimit?: number
): AdversarialTrajectoryReport;
export declare function serializeReport(report: AdversarialTrajectoryReport): string;
export declare function isReportCountsConsistent(report: AdversarialTrajectoryReport): boolean;
// --- Builder result types ---
export interface DeterministicFailureTrajectoryBuild { readonly result: any; readonly trajectory: AdversarialTrajectory; }
export interface HumanoidRockThrowTrajectoryBuild { readonly result: any; readonly trajectory: AdversarialTrajectory; }
export interface TwoAgentHandoffCatchTrajectoryBuild { readonly result: any; readonly trajectory: AdversarialTrajectory; }
// --- Builder functions ---
export function buildDeterministicFailureTrajectory(actions?: readonly any[], options?: any): DeterministicFailureTrajectoryBuild;
export function buildHumanoidRockThrowTrajectory(options?: any): HumanoidRockThrowTrajectoryBuild;
export function buildTwoAgentHandoffCatchTrajectory(options?: any): TwoAgentHandoffCatchTrajectoryBuild;

// --- Portable hardware and compute execution receipts ---
export declare const HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION: 'holoscript.hardware-receipt-metadata.v1';
export type HardwareReceiptSchemaVersion = typeof HARDWARE_RECEIPT_METADATA_SCHEMA_VERSION;
export interface HardwareReceiptTarget {
  readonly id: string;
  readonly kind: string;
  readonly architecture: string;
  readonly artifactKind: string;
}
export interface HardwareReceiptDevice {
  readonly vendor: string;
  readonly model: string;
  readonly accelerator: string | null;
  readonly driverVersions?: Readonly<Record<string, string>>;
  readonly deviceHash?: string;
}
export interface HardwareReceiptRuntime {
  readonly name: string;
  readonly version: string;
  readonly hostOS: string;
  readonly adapterFingerprint?: string;
}
export interface HardwareReceiptConstraint {
  readonly id: string;
  readonly description: string;
  readonly limit: string | number | boolean;
  readonly unit?: string;
  readonly source?: string;
}
export interface HardwareReceiptMeasuredResult {
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
  readonly method: string;
  readonly sampleCount?: number;
  readonly tolerance?: number;
}
export interface HardwareReceiptReplayInput {
  readonly kind: string;
  readonly uri: string;
  readonly sha256: string;
  readonly description?: string;
}
export interface HardwareReceiptProvenance {
  readonly capturedAt: string;
  readonly sourceCompositionHash: string;
  readonly commit?: string;
  readonly commandHash?: string;
  readonly trustReceiptId?: string;
  readonly simulationContractId?: string;
}
export interface HardwareReceiptOwner {
  readonly agent: string;
  readonly team?: string;
  readonly contact?: string;
}
export interface PortableHardwareReceiptMetadata {
  readonly schemaVersion: HardwareReceiptSchemaVersion;
  readonly target: HardwareReceiptTarget;
  readonly device: HardwareReceiptDevice;
  readonly runtime: HardwareReceiptRuntime;
  readonly compilerVersion: string;
  readonly constraints: readonly HardwareReceiptConstraint[];
  readonly measuredResults: readonly HardwareReceiptMeasuredResult[];
  readonly replayInputs: readonly HardwareReceiptReplayInput[];
  readonly provenance: HardwareReceiptProvenance;
  readonly owner: HardwareReceiptOwner;
}
export interface HardwareReceiptMetadataValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}
export declare function validatePortableHardwareReceiptMetadata(receipt: unknown): HardwareReceiptMetadataValidation;
export declare function isPortableHardwareReceiptMetadata(receipt: unknown): receipt is PortableHardwareReceiptMetadata;

export declare const COMPUTE_EXECUTION_RECEIPT_SCHEMA_VERSION: 'holoscript.compute-execution-receipt.v1';
export type ComputeExecutionAccelerator = 'cpu' | 'gpu' | 'npu' | 'other';
export type ComputeExecutionTerminalStatus = 'succeeded' | 'failed' | 'cancelled';
export type ComputeExecutionQualityOperator = 'eq' | 'lte' | 'gte';
export type ComputeExecutionQualityReference = 'none' | 'cpu_reference';
export type ComputeExecutionPlacementOutcome = 'local_device' | 'owned_fleet' | 'external_bridge';
export type ComputeExecutionCost =
  | { readonly measurementState: 'measured'; readonly currency: 'USD'; readonly actualMinorUnits: number }
  | { readonly measurementState: 'not_measured'; readonly reason: 'meter_unavailable' | 'not_applicable' };
export interface ComputeExecutionWorkUnitBinding {
  readonly digest: string;
  readonly sourceEvidence: string;
}
export interface ComputeExecutionPlacementBinding {
  readonly planReceiptId: string;
  readonly capacityLeaseReceiptId: string;
  readonly outcome: ComputeExecutionPlacementOutcome;
}
export interface ComputeExecutionOutcome {
  readonly actualAccelerator: ComputeExecutionAccelerator;
  readonly fallbackAllowed: boolean;
  readonly fallbackUsed: boolean;
  readonly fallbackReason?: string;
  readonly terminalStatus: ComputeExecutionTerminalStatus;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
}
export interface ComputeExecutionQualityResult {
  readonly metric: string;
  readonly operator: ComputeExecutionQualityOperator;
  readonly threshold: number;
  readonly reference: ComputeExecutionQualityReference;
  readonly observedValue: number;
  readonly passed: boolean;
}
export interface ComputeExecutionReceipt {
  readonly schemaVersion: typeof COMPUTE_EXECUTION_RECEIPT_SCHEMA_VERSION;
  /** This validates structure/content addressing only, not external provenance. */
  readonly verificationScope: 'structural_only';
  readonly receiptId: string;
  readonly workUnit: ComputeExecutionWorkUnitBinding;
  readonly placement: ComputeExecutionPlacementBinding;
  readonly execution: ComputeExecutionOutcome;
  readonly quality: ComputeExecutionQualityResult;
  readonly cost: ComputeExecutionCost;
  readonly hardware: PortableHardwareReceiptMetadata;
}
export interface BuildComputeExecutionReceiptInput {
  readonly workUnit: ComputeExecutionWorkUnitBinding;
  readonly placement: ComputeExecutionPlacementBinding;
  readonly execution: Omit<ComputeExecutionOutcome, 'durationMs'>;
  readonly quality: ComputeExecutionQualityResult;
  readonly cost: ComputeExecutionCost;
  readonly hardware: PortableHardwareReceiptMetadata;
}
export interface ComputeExecutionReceiptValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}
/** Build a structurally valid, content-addressed receipt. This does not authenticate its references. */
export declare function buildComputeExecutionReceipt(input: BuildComputeExecutionReceiptInput): ComputeExecutionReceipt;
/** Validate structure and canonical receipt ID only. This does not verify WorkUnit, plan, lease, or trust evidence. */
export declare function validateComputeExecutionReceipt(value: unknown): ComputeExecutionReceiptValidation;

export declare const COMPUTE_CAPACITY_SNAPSHOT_SCHEMA_VERSION: 'holoscript.compute-capacity-snapshot.v1';
export declare const COMPUTE_BRIDGE_ADMISSION_SCHEMA_VERSION: 'holoscript.compute-bridge-admission.v1';
export declare const COMPUTE_PLACEMENT_PLAN_SCHEMA_VERSION: 'holoscript.compute-placement-plan.v1';
export declare const COMPUTE_CAPACITY_LEASE_SCHEMA_VERSION: 'holoscript.compute-capacity-lease.v1';
export declare const COMPUTE_SUBJECT_ATTESTATION_SCHEMA_VERSION: 'holoscript.compute-subject-attestation.v1';
export declare const COMPUTE_BUDGET_EVIDENCE_SCHEMA_VERSION: 'holoscript.compute-budget-evidence.v1';
export declare const COMPUTE_CAPACITY_LEASE_MAX_TTL_MS: number;
export declare const COMPUTE_EVIDENCE_MAX_FUTURE_SKEW_MS: number;
export declare const COMPUTE_CAPACITY_SNAPSHOT_MAX_TTL_MS: number;
export declare const COMPUTE_BRIDGE_ADMISSION_MAX_TTL_MS: number;
export type ComputeEvidenceRole =
  | 'capacity_observer'
  | 'bridge_admitter'
  | 'placement_planner'
  | 'lease_issuer'
  | 'execution_attestor'
  | 'budget_ledger_attestor';
export type ComputeCapacityLane = 'local_device' | 'owned_fleet' | 'managed_bridge';
export type ComputeCapacityHealth = 'ready' | 'degraded' | 'unavailable';
export type ComputePlacementVerdict = 'admitted' | 'rejected';
export type ComputeBridgeAdmissionVerdict = 'admitted' | 'rejected';
export type ComputeBridgeAdmissionReason =
  | 'policy_admitted'
  | 'tenant_policy_denied'
  | 'data_classification_denied'
  | 'budget_denied'
  | 'bridge_unavailable';
export type ComputePlacementReason =
  | 'capacity_evidence_untrusted'
  | 'telemetry_future'
  | 'telemetry_stale'
  | 'telemetry_degraded'
  | 'capacity_unavailable'
  | 'placement_forbidden'
  | 'accelerator_unavailable'
  | 'data_classification_unsupported'
  | 'cost_unavailable'
  | 'budget_exceeded'
  | 'bridge_admission_required'
  | 'bridge_admission_invalid'
  | 'bridge_admission_untrusted'
  | 'bridge_admission_future'
  | 'bridge_admission_expired'
  | 'bridge_admission_denied'
  | 'bridge_fallback_unexplained';
export type ComputeCapacityCostEstimate =
  | { readonly measurementState: 'measured'; readonly currency: 'USD'; readonly estimatedMinorUnits: number }
  | { readonly measurementState: 'not_measured'; readonly reason: 'meter_unavailable' }
  | { readonly measurementState: 'not_applicable' };
export interface ComputeEvidenceSigner {
  readonly issuer: string;
  readonly keyId: string;
  readonly sign: (message: Uint8Array) => string;
}
export interface ComputeEvidenceTrustAnchor {
  readonly issuer: string;
  readonly keyId: string;
  readonly algorithm: 'ed25519';
  readonly roles: readonly ComputeEvidenceRole[];
  readonly principalDigests: readonly string[];
  readonly lanes?: readonly ComputeCapacityLane[];
  readonly capacityRefs?: readonly string[];
  readonly teamIds?: readonly string[];
  readonly budgetRailIds?: readonly string[];
  readonly validFrom: string;
  readonly validUntil: string;
  readonly revokedAt?: string;
  readonly publicKeyPem: string;
}
export interface ComputeIssuerAttestation {
  readonly role: ComputeEvidenceRole;
  readonly issuer: string;
  readonly keyId: string;
  readonly algorithm: 'ed25519';
  readonly claimsDigest: string;
  readonly signature: string;
}
export type ComputeBudgetEvidenceStatus =
  | 'authorized'
  | 'held'
  | 'released'
  | 'settled'
  | 'rejected';
export interface ComputeBudgetAccountProjection {
  readonly heldAmountMinorUnits: number;
  readonly settledAmountMinorUnits: number;
  readonly version: number;
}
export interface ComputeBudgetEvidenceBinding {
  readonly teamId: string;
  readonly budgetRailId: string;
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly workUnitDigest: string;
  readonly currency: 'USD';
  readonly maxAmountMinorUnits: number;
  readonly policyDigest: string;
  readonly periodDigest: string;
  readonly nonceDigest: string;
  readonly idempotencyKeyHash: string;
}
export interface ComputeBudgetEvidence extends ComputeBudgetEvidenceBinding {
  readonly schemaVersion: typeof COMPUTE_BUDGET_EVIDENCE_SCHEMA_VERSION;
  readonly verificationScope: 'issuer_attested';
  readonly evidenceScope: 'budget_ledger_only';
  readonly receiptId: string;
  readonly status: ComputeBudgetEvidenceStatus;
  readonly heldAmountMinorUnits: number;
  readonly settledAmountMinorUnits: number;
  readonly accountBefore: ComputeBudgetAccountProjection;
  readonly accountAfter: ComputeBudgetAccountProjection;
  readonly measuredCostReceiptId?: string;
  readonly issuedAt: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly attestation: ComputeIssuerAttestation;
}
export interface BuildComputeBudgetEvidenceInput extends ComputeBudgetEvidenceBinding {
  readonly status: ComputeBudgetEvidenceStatus;
  readonly heldAmountMinorUnits: number;
  readonly settledAmountMinorUnits: number;
  readonly accountBefore: ComputeBudgetAccountProjection;
  readonly accountAfter: ComputeBudgetAccountProjection;
  readonly measuredCostReceiptId?: string;
  readonly issuedAt: string;
  readonly validFrom: string;
  readonly validUntil: string;
  readonly signer: ComputeEvidenceSigner;
}
export interface VerifyComputeBudgetEvidenceInput extends ComputeBudgetEvidenceBinding {
  readonly evidence: ComputeBudgetEvidence;
  readonly verifiedAt: string;
  readonly trustAnchors: readonly ComputeEvidenceTrustAnchor[];
}
export interface ComputeBudgetEvidenceVerification extends ComputeEvidenceValidation {
  readonly verificationScope: 'issuer_authenticated';
}
export interface ComputeCapacitySnapshot {
  readonly schemaVersion: typeof COMPUTE_CAPACITY_SNAPSHOT_SCHEMA_VERSION;
  readonly verificationScope: 'issuer_attested';
  readonly receiptId: string;
  readonly lane: ComputeCapacityLane;
  readonly capacityRef: string;
  readonly accelerator: import('../compiler/index.js').ComputeAccelerator;
  readonly health: ComputeCapacityHealth;
  readonly availableSlots: number;
  readonly allowedDataClassifications: readonly import('../compiler/index.js').ComputeDataClassification[];
  readonly observedAt: string;
  readonly validUntil: string;
  readonly estimatedCost: ComputeCapacityCostEstimate;
  readonly attestation: ComputeIssuerAttestation;
}
export interface BuildComputeCapacitySnapshotInput {
  readonly lane: ComputeCapacityLane;
  readonly capacityRef: string;
  readonly accelerator: import('../compiler/index.js').ComputeAccelerator;
  readonly health: ComputeCapacityHealth;
  readonly availableSlots: number;
  readonly allowedDataClassifications: readonly import('../compiler/index.js').ComputeDataClassification[];
  readonly observedAt: string;
  readonly validUntil: string;
  readonly estimatedCost: ComputeCapacityCostEstimate;
  readonly signer: ComputeEvidenceSigner;
}
export interface ComputeBridgeAdmission {
  readonly schemaVersion: typeof COMPUTE_BRIDGE_ADMISSION_SCHEMA_VERSION;
  readonly verificationScope: 'issuer_attested';
  readonly receiptId: string;
  readonly principalDigest: string;
  readonly bridgeRef: string;
  readonly workUnitDigest: string;
  readonly dataClassification: import('../compiler/index.js').ComputeDataClassification;
  readonly budget: { readonly currency: 'USD'; readonly maxCostMinorUnits: number };
  readonly verdict: ComputeBridgeAdmissionVerdict;
  readonly reason: ComputeBridgeAdmissionReason;
  readonly issuedAt: string;
  readonly validUntil: string;
  readonly attestation: ComputeIssuerAttestation;
}
export interface BuildComputeBridgeAdmissionInput {
  readonly principalDigest: string;
  readonly bridgeRef: string;
  readonly workUnitDigest: string;
  readonly dataClassification: import('../compiler/index.js').ComputeDataClassification;
  readonly budget: { readonly currency: 'USD'; readonly maxCostMinorUnits: number };
  readonly verdict: ComputeBridgeAdmissionVerdict;
  readonly reason: ComputeBridgeAdmissionReason;
  readonly issuedAt: string;
  readonly validUntil: string;
  readonly signer: ComputeEvidenceSigner;
}
export interface ComputePlacementPlan {
  readonly schemaVersion: typeof COMPUTE_PLACEMENT_PLAN_SCHEMA_VERSION;
  readonly verificationScope: 'issuer_attested';
  readonly receiptId: string;
  readonly principalDigest: string;
  readonly workUnitDigest: string;
  readonly sourceEvidence: string;
  readonly capacitySnapshotReceiptId: string;
  readonly bridgeAdmissionReceiptId?: string;
  readonly lane: ComputeCapacityLane;
  readonly capacityRef: string;
  readonly accelerator: import('../compiler/index.js').ComputeAccelerator;
  readonly estimatedCost: ComputeCapacityCostEstimate;
  readonly verdict: ComputePlacementVerdict;
  readonly reasonCodes: readonly ComputePlacementReason[];
  readonly checkedAt: string;
  readonly validUntil: string;
  readonly attestation: ComputeIssuerAttestation;
}
export interface PlanComputePlacementInput {
  readonly principalDigest: string;
  readonly workUnit: import('../compiler/index.js').ComputeWorkUnitContract;
  readonly capacitySnapshot: ComputeCapacitySnapshot;
  readonly bridgeAdmission?: ComputeBridgeAdmission;
  readonly checkedAt: string;
  readonly trustAnchors: readonly ComputeEvidenceTrustAnchor[];
  readonly signer: ComputeEvidenceSigner;
}
export interface VerifyComputePlacementPlanInput extends Omit<PlanComputePlacementInput, 'signer'> {
  readonly plan: ComputePlacementPlan;
  readonly verifiedAt: string;
}
export interface ComputeCapacityLease {
  readonly schemaVersion: typeof COMPUTE_CAPACITY_LEASE_SCHEMA_VERSION;
  readonly verificationScope: 'issuer_attested';
  readonly receiptId: string;
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly holderDigest: string;
  readonly workUnitDigest: string;
  readonly planReceiptId: string;
  readonly capacitySnapshotReceiptId: string;
  readonly lane: ComputeCapacityLane;
  readonly capacityRef: string;
  readonly accelerator: import('../compiler/index.js').ComputeAccelerator;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly fencingEpoch: number;
  readonly fencingTokenHash: string;
  readonly attestation: ComputeIssuerAttestation;
}
export interface ComputeCapacityAllocationCursor {
  readonly capacityRef: string;
  readonly slotState: 'available' | 'leased';
  readonly currentEpoch: number;
  readonly currentLeaseReceiptId?: string;
  readonly version: number;
  readonly etag: string;
}
export interface PrepareComputeCapacityLeaseInput {
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly holderDigest: string;
  readonly workUnit: import('../compiler/index.js').ComputeWorkUnitContract;
  readonly capacitySnapshot: ComputeCapacitySnapshot;
  readonly bridgeAdmission?: ComputeBridgeAdmission;
  readonly plan: ComputePlacementPlan;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly fencingToken: string | Uint8Array;
  readonly allocationCursor: ComputeCapacityAllocationCursor;
  readonly trustAnchors: readonly ComputeEvidenceTrustAnchor[];
  readonly signer: ComputeEvidenceSigner;
}
export interface PreparedComputeCapacityLease {
  readonly expectedAllocation: ComputeCapacityAllocationCursor;
  readonly nextAllocation: ComputeCapacityAllocationCursor;
  readonly lease: ComputeCapacityLease;
}
export interface VerifyComputeCapacityLeaseReceiptInput extends Omit<
  PrepareComputeCapacityLeaseInput,
  'issuedAt' | 'expiresAt' | 'fencingToken' | 'allocationCursor' | 'signer'
> {
  readonly lease: ComputeCapacityLease;
  readonly at: string;
}
export interface AuthorizeComputeCapacityLeaseUseInput extends VerifyComputeCapacityLeaseReceiptInput {
  readonly presentedFencingToken: string | Uint8Array;
  readonly allocationCursor: ComputeCapacityAllocationCursor;
}
export interface ComputeSubjectAttestation {
  readonly schemaVersion: typeof COMPUTE_SUBJECT_ATTESTATION_SCHEMA_VERSION;
  readonly verificationScope: 'issuer_attested';
  readonly receiptId: string;
  readonly principalDigest: string;
  readonly subject: { readonly schemaVersion: string; readonly receiptId: string };
  readonly issuedAt: string;
  readonly attestation: ComputeIssuerAttestation;
}
export interface AttestComputeExecutionReceiptInput {
  readonly principalDigest: string;
  readonly executionReceipt: ComputeExecutionReceipt;
  readonly issuedAt: string;
  readonly signer: ComputeEvidenceSigner;
}
export interface VerifyComputeExecutionEvidenceInput {
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly holderDigest: string;
  readonly workUnit: import('../compiler/index.js').ComputeWorkUnitContract;
  readonly capacitySnapshot: ComputeCapacitySnapshot;
  readonly bridgeAdmission?: ComputeBridgeAdmission;
  readonly plan: ComputePlacementPlan;
  readonly lease: ComputeCapacityLease;
  readonly executionReceipt: ComputeExecutionReceipt;
  readonly executionAttestation: ComputeSubjectAttestation;
  readonly verifiedAt: string;
  readonly trustAnchors: readonly ComputeEvidenceTrustAnchor[];
}
export interface ComputeEvidenceValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}
export interface ComputeExecutionEvidenceVerification extends ComputeEvidenceValidation {
  readonly verificationScope: 'issuer_authenticated';
}
export declare function computeCapacityAllocationEtag(
  cursor: Omit<ComputeCapacityAllocationCursor, 'etag'>
): string;
export declare function validateComputeCapacityAllocationCursor(value: unknown): ComputeEvidenceValidation;
export declare function buildComputeCapacitySnapshot(input: BuildComputeCapacitySnapshotInput): ComputeCapacitySnapshot;
export declare function validateComputeCapacitySnapshot(value: unknown): ComputeEvidenceValidation;
export declare function buildComputeBridgeAdmission(input: BuildComputeBridgeAdmissionInput): ComputeBridgeAdmission;
export declare function validateComputeBridgeAdmission(value: unknown): ComputeEvidenceValidation;
export declare function planComputePlacement(input: PlanComputePlacementInput): ComputePlacementPlan;
export declare function validateComputePlacementPlan(value: unknown): ComputeEvidenceValidation;
export declare function verifyComputePlacementPlan(input: VerifyComputePlacementPlanInput): ComputeEvidenceValidation;
export declare function prepareComputeCapacityLease(input: PrepareComputeCapacityLeaseInput): PreparedComputeCapacityLease;
export declare function validateComputeCapacityLease(value: unknown): ComputeEvidenceValidation;
export declare function verifyComputeCapacityLeaseReceipt(input: VerifyComputeCapacityLeaseReceiptInput): ComputeEvidenceValidation;
export declare function authorizeComputeCapacityLeaseUse(input: AuthorizeComputeCapacityLeaseUseInput): ComputeEvidenceValidation;
export declare function attestComputeExecutionReceipt(input: AttestComputeExecutionReceiptInput): ComputeSubjectAttestation;
export declare function validateComputeSubjectAttestation(value: unknown): ComputeEvidenceValidation;
export declare function verifyComputeExecutionEvidence(input: VerifyComputeExecutionEvidenceInput): ComputeExecutionEvidenceVerification;
export declare function buildComputeBudgetEvidence(input: BuildComputeBudgetEvidenceInput): ComputeBudgetEvidence;
export declare function validateComputeBudgetEvidence(value: unknown): ComputeEvidenceValidation;
export declare function verifyComputeBudgetEvidence(input: VerifyComputeBudgetEvidenceInput): ComputeBudgetEvidenceVerification;

// --- Provider-neutral compute job lifecycle projections ---
export declare const COMPUTE_JOB_SCHEMA_VERSION: 'holoscript.compute-job.v1';
export declare const COMPUTE_JOB_TRANSITION_SCHEMA_VERSION: 'holoscript.compute-job-transition.v1';
export declare const COMPUTE_ALLOCATOR_COMMIT_SCHEMA_VERSION: 'holoscript.compute-allocator-commit.v1';
export declare const COMPUTE_JOB_REQUEST_SCHEMA_VERSION: 'holoscript.compute-job-request.v1';
export type ComputeJobState =
  | 'preflighted'
  | 'queued'
  | 'leased'
  | 'starting'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';
export type ComputeJobTerminalState = 'succeeded' | 'failed' | 'cancelled';
export type ComputeJobTransitionAction =
  | 'queue'
  | 'acquire_lease'
  | 'start'
  | 'mark_running'
  | 'succeed'
  | 'fail'
  | 'cancel';
export type ComputeJobFailureReason =
  | 'queue_rejected'
  | 'lease_unavailable'
  | 'lease_expired'
  | 'start_failed'
  | 'executor_lost'
  | 'execution_failed'
  | 'deadline_exceeded'
  | 'receipt_unavailable'
  | 'system_failed';
export type ComputeJobCancellationReason =
  | 'user_cancelled'
  | 'policy_cancelled'
  | 'system_cancelled';
export type ComputeJobReasonCode =
  | 'execution_succeeded'
  | ComputeJobFailureReason
  | ComputeJobCancellationReason;
export type ComputeJobExecutionUnobservedReason =
  | 'executor_lost'
  | 'lease_expired'
  | 'receipt_unavailable';
export type ComputeJobCompletionDisposition =
  | 'work_unit_succeeded'
  | 'terminal_execution_observed'
  | 'execution_not_started'
  | 'execution_unobserved';
export type ComputeAllocatorCommitOperation = 'acquire' | 'release';
export interface ComputeJobRequest {
  readonly schemaVersion: typeof COMPUTE_JOB_REQUEST_SCHEMA_VERSION;
  readonly operation: 'create' | 'transition';
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly expectedJobReceiptId?: string;
  readonly expectedJobVersion?: number;
  readonly action?: ComputeJobTransitionAction;
  readonly reasonCode?: ComputeJobReasonCode;
  readonly executionUnobservedReason?: ComputeJobExecutionUnobservedReason;
  readonly evidenceReceiptIds: readonly string[];
  readonly expectedAllocationEtag?: string;
}
export interface ComputeJobRequestBinding {
  readonly idempotencyKeyHash: string;
  readonly requestHash: string;
}
export interface ComputeJobWorkUnitBinding {
  readonly digest: string;
  readonly sourceEvidence: string;
}
export interface ComputeJobPlacementBinding {
  readonly capacitySnapshotReceiptId: string;
  readonly bridgeAdmissionReceiptId?: string;
  readonly planReceiptId: string;
}
export interface ComputeJobLeaseBinding {
  readonly receiptId: string;
  readonly holderDigest: string;
  readonly capacityRef: string;
  readonly lane: ComputeCapacityLane;
  readonly accelerator: import('../compiler/index.js').ComputeAccelerator;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly fencingEpoch: number;
  readonly fencingTokenHash: string;
}
export type ComputeJobTerminalEvidence =
  | {
      readonly kind: 'attested_execution';
      readonly executionReceiptId: string;
      readonly executionAttestationReceiptId: string;
    }
  | {
      readonly kind: 'execution_not_started';
      readonly reasonCode: ComputeJobFailureReason | ComputeJobCancellationReason;
    }
  | {
      readonly kind: 'execution_unobserved';
      readonly reasonCode: ComputeJobExecutionUnobservedReason;
    };
export interface ComputeJobTerminal {
  readonly state: ComputeJobTerminalState;
  readonly at: string;
  readonly reasonCode: ComputeJobReasonCode;
  readonly completionDisposition: ComputeJobCompletionDisposition;
  readonly evidence: ComputeJobTerminalEvidence;
}
export interface ComputeJobReceipt {
  readonly schemaVersion: typeof COMPUTE_JOB_SCHEMA_VERSION;
  readonly verificationScope: 'structural_only';
  readonly receiptId: string;
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly version: number;
  readonly previousJobReceiptId?: string;
  readonly state: ComputeJobState;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deadlineAt: string | null;
  readonly workUnit: ComputeJobWorkUnitBinding;
  readonly placement: ComputeJobPlacementBinding;
  readonly request: ComputeJobRequestBinding;
  readonly lease?: ComputeJobLeaseBinding;
  readonly executionStartedAt?: string;
  readonly terminal?: ComputeJobTerminal;
}
export interface ComputeJobStateReference {
  readonly state: ComputeJobState;
  readonly version: number;
  readonly receiptId: string;
}
export interface ComputeJobTransitionReceipt {
  readonly schemaVersion: typeof COMPUTE_JOB_TRANSITION_SCHEMA_VERSION;
  readonly verificationScope: 'structural_only';
  readonly receiptId: string;
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly workUnitDigest: string;
  readonly action: ComputeJobTransitionAction;
  readonly from: ComputeJobStateReference;
  readonly to: ComputeJobStateReference;
  readonly request: ComputeJobRequestBinding;
  readonly transitionedAt: string;
  readonly evidenceReceiptIds: readonly string[];
  readonly allocatorCommitReceiptId?: string;
}
export interface ComputeAllocatorCommitReceipt {
  readonly schemaVersion: typeof COMPUTE_ALLOCATOR_COMMIT_SCHEMA_VERSION;
  readonly verificationScope: 'prepared_cas';
  readonly receiptId: string;
  readonly operation: ComputeAllocatorCommitOperation;
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly fromJobReceiptId: string;
  readonly toJobReceiptId: string;
  readonly leaseReceiptId: string;
  readonly capacityRef: string;
  readonly fencingEpoch: number;
  readonly expectedAllocation: ComputeCapacityAllocationCursor;
  readonly nextAllocation: ComputeCapacityAllocationCursor;
  readonly preparedAt: string;
}
export interface PrepareComputeJobInput {
  readonly principalDigest: string;
  readonly jobId: string;
  readonly attempt: number;
  readonly workUnit: import('../compiler/index.js').ComputeWorkUnitContract;
  readonly placementVerification: VerifyComputePlacementPlanInput;
  readonly preparedAt: string;
  readonly idempotencyKey: string | Uint8Array;
}
export interface PreparedComputeJob {
  readonly job: ComputeJobReceipt;
  readonly requestBinding: ComputeJobRequestBinding;
}
interface PrepareComputeJobTransitionBase {
  readonly expectedJob: ComputeJobReceipt;
  readonly transitionedAt: string;
  readonly idempotencyKey: string | Uint8Array;
}
export interface PrepareQueueComputeJobInput extends PrepareComputeJobTransitionBase {
  readonly action: 'queue';
  readonly placementVerification: VerifyComputePlacementPlanInput;
}
export interface PrepareLeaseComputeJobInput extends PrepareComputeJobTransitionBase {
  readonly action: 'acquire_lease';
  readonly preparedLease: PreparedComputeCapacityLease;
  readonly leaseVerification: VerifyComputeCapacityLeaseReceiptInput;
}
export interface PrepareStartComputeJobInput extends PrepareComputeJobTransitionBase {
  readonly action: 'start';
  readonly leaseAuthorization: AuthorizeComputeCapacityLeaseUseInput;
}
export interface PrepareRunningComputeJobInput extends PrepareComputeJobTransitionBase {
  readonly action: 'mark_running';
  readonly leaseAuthorization: AuthorizeComputeCapacityLeaseUseInput;
}
export interface PrepareSucceededComputeJobInput extends PrepareComputeJobTransitionBase {
  readonly action: 'succeed';
  readonly executionVerification: VerifyComputeExecutionEvidenceInput;
  readonly allocationCursor: ComputeCapacityAllocationCursor;
}
export interface PrepareFailedComputeJobInput extends PrepareComputeJobTransitionBase {
  readonly action: 'fail';
  readonly reasonCode: ComputeJobFailureReason;
  readonly executionVerification?: VerifyComputeExecutionEvidenceInput;
  readonly executionUnobservedReason?: ComputeJobExecutionUnobservedReason;
  readonly allocationCursor?: ComputeCapacityAllocationCursor;
}
export interface PrepareCancelledComputeJobInput extends PrepareComputeJobTransitionBase {
  readonly action: 'cancel';
  readonly reasonCode: ComputeJobCancellationReason;
  readonly executionVerification?: VerifyComputeExecutionEvidenceInput;
  readonly executionUnobservedReason?: ComputeJobExecutionUnobservedReason;
  readonly allocationCursor?: ComputeCapacityAllocationCursor;
}
export type PrepareComputeJobTransitionInput =
  | PrepareQueueComputeJobInput
  | PrepareLeaseComputeJobInput
  | PrepareStartComputeJobInput
  | PrepareRunningComputeJobInput
  | PrepareSucceededComputeJobInput
  | PrepareFailedComputeJobInput
  | PrepareCancelledComputeJobInput;
export interface PreparedComputeJobTransition {
  readonly expectedJob: ComputeJobReceipt;
  readonly nextJob: ComputeJobReceipt;
  readonly transition: ComputeJobTransitionReceipt;
  readonly allocatorCommit?: ComputeAllocatorCommitReceipt;
}
export interface VerifyComputeJobTransitionInput {
  readonly expectedJob: ComputeJobReceipt;
  readonly nextJob: ComputeJobReceipt;
  readonly transition: ComputeJobTransitionReceipt;
  readonly allocatorCommit?: ComputeAllocatorCommitReceipt;
}
export interface ComputeJobLifecycleValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}
export declare function computeJobIdempotencyKeyHash(key: string | Uint8Array): string;
export declare function computeJobRequestHash(request: ComputeJobRequest): string;
export declare function validateComputeJobReceipt(value: unknown): ComputeJobLifecycleValidation;
export declare function prepareComputeJob(input: PrepareComputeJobInput): PreparedComputeJob;
export declare function prepareComputeJobTransition(
  input: PrepareComputeJobTransitionInput
): PreparedComputeJobTransition;
export declare function validateComputeJobTransitionReceipt(
  value: unknown
): ComputeJobLifecycleValidation;
export declare function validateComputeAllocatorCommitReceipt(
  value: unknown
): ComputeJobLifecycleValidation;
export declare function verifyComputeJobTransition(
  input: VerifyComputeJobTransitionInput
): ComputeJobLifecycleValidation;

export declare const COMPUTE_UTILITY_OBSERVATION_SCHEMA_VERSION: 'holoscript.compute-utility-observation.v1';
export declare const COMPUTE_UTILITY_AGGREGATE_SCHEMA_VERSION: 'holoscript.compute-utility-aggregate.v1';
export declare const COMPUTE_UTILITY_MINIMUM_AGGREGATE: 10;
export type ComputeUtilityNotMeasuredReason =
  | 'analytics_unset'
  | 'analytics_disabled'
  | 'consent_unset'
  | 'consent_denied';
export type ComputeUtilityFallbackBucket =
  | 'not_allowed'
  | 'allowed_not_used'
  | 'used_cpu'
  | 'used_gpu'
  | 'used_npu'
  | 'used_other';
export type ComputeUtilityQualityBucket = 'passed' | 'failed';
export type ComputeUtilityLatencyBucket =
  | 'lt_100ms'
  | '100ms_to_lt_1s'
  | '1s_to_lt_10s'
  | '10s_to_lt_60s'
  | '60s_plus';
export type ComputeUtilityCostBucket =
  | 'not_measured'
  | 'zero'
  | 'minor_1_10'
  | 'minor_11_100'
  | 'minor_101_1000'
  | 'minor_1001_plus';
export interface ComputeUtilityBuckets {
  readonly requestedAccelerator: import('../compiler/index.js').ComputeAccelerator;
  readonly placementOutcome: ComputeExecutionPlacementOutcome;
  readonly fallback: ComputeUtilityFallbackBucket;
  readonly terminalStatus: ComputeExecutionTerminalStatus;
  readonly quality: ComputeUtilityQualityBucket;
  readonly latency: ComputeUtilityLatencyBucket;
  readonly cost: ComputeUtilityCostBucket;
}
export interface ComputeUtilityObservation {
  readonly schemaVersion: typeof COMPUTE_UTILITY_OBSERVATION_SCHEMA_VERSION;
  readonly privacyClass: 'local_private';
  readonly evidenceScope: 'structural_only';
  readonly observationId: string;
  readonly workUnitDigest: string;
  readonly executionReceiptId: string;
  readonly buckets: ComputeUtilityBuckets;
}
export interface BuildComputeUtilityObservationInput {
  readonly analyticsEnabled?: boolean;
  readonly consentGranted?: boolean;
  readonly workUnit: import('../compiler/index.js').ComputeWorkUnitContract;
  readonly executionReceipt: ComputeExecutionReceipt;
}
export type ComputeUtilityMeasurementResult =
  | { readonly measurementState: 'not_measured'; readonly reason: ComputeUtilityNotMeasuredReason }
  | { readonly measurementState: 'measured'; readonly observation: ComputeUtilityObservation };
export interface ComputeUtilityAggregateBucket extends ComputeUtilityBuckets {
  readonly count: number;
}
export interface ComputeUtilityAggregate {
  readonly schemaVersion: typeof COMPUTE_UTILITY_AGGREGATE_SCHEMA_VERSION;
  readonly privacyClass: 'aggregate_only';
  readonly evidenceScope: 'structural_only';
  readonly aggregateId: string;
  readonly minimumBucketCount: typeof COMPUTE_UTILITY_MINIMUM_AGGREGATE;
  readonly buckets: readonly ComputeUtilityAggregateBucket[];
}
export type ComputeUtilityAggregateResult =
  | { readonly measurementState: 'not_measured'; readonly reason: 'no_observations' }
  | { readonly measurementState: 'measured_suppressed'; readonly reason: 'minimum_aggregate_not_met' }
  | { readonly measurementState: 'measured'; readonly aggregate: ComputeUtilityAggregate };
export interface ComputeUtilityValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
}
export declare function buildComputeUtilityObservation(input: BuildComputeUtilityObservationInput): ComputeUtilityMeasurementResult;
export declare function validateComputeUtilityObservation(value: unknown): ComputeUtilityValidation;
export declare function aggregateComputeUtilityObservations(observations: readonly ComputeUtilityObservation[]): ComputeUtilityAggregateResult;
export declare function validateComputeUtilityAggregate(value: unknown): ComputeUtilityValidation;

// --- N4 exact-plus-learned residual world loop ---
export type N4ResidualTarget = 'object.drag' | 'event.gust' | 'event.contact';
export type N4Arm =
  | 'exact-only'
  | 'learned-only-object'
  | 'exact-plus-untyped-residual'
  | 'exact-plus-typed-residual'
  | 'exact-plus-typed-residual-uncertainty';
export interface N4Vec2 { readonly x: number; readonly y: number; }
export interface N4Object2D {
  readonly id: string;
  readonly kind: 'orb' | 'crate';
  readonly position: N4Vec2;
  readonly velocity: N4Vec2;
  readonly massKg: number;
  readonly dragPerSecond: number;
  readonly latentContactScale: number;
}
export type N4WorldEvent =
  | { readonly type: 'gust'; readonly impulse: N4Vec2 }
  | { readonly type: 'contact'; readonly objectIds: readonly string[] };
export interface N4WorldScene {
  readonly seed: number;
  readonly split: 'train' | 'ood' | 'planning';
  readonly step: number;
  readonly objects: readonly N4Object2D[];
  readonly events: readonly N4WorldEvent[];
}
export interface N4SourceContract {
  readonly sourceDigest: string;
  readonly ir: { readonly provenance: { readonly deterministicDigest: string; readonly sourceSurface?: string } };
  readonly learningGraph: { readonly deterministicDigest: string; readonly nodes: readonly { readonly nodeType: string }[] };
  readonly residualTargets: readonly N4ResidualTarget[];
  readonly actionVocabulary: readonly ['move'];
  readonly deterministicDigest: string;
}
export interface N4LinearModel {
  readonly featureNames: readonly string[];
  readonly outputNames: readonly string[];
  readonly weights: readonly number[];
  readonly shape: readonly [number, number];
  readonly deterministicDigest: string;
}
export interface N4ModelSet {
  readonly learnedOnly: N4LinearModel;
  readonly untypedResidual: N4LinearModel;
  readonly typedResidual: N4LinearModel;
  readonly typedEnsemble: readonly N4LinearModel[];
  readonly uncertaintyScale: number;
  readonly deterministicDigest: string;
}
export interface N4TypedMoveAction {
  readonly type: 'move';
  readonly entityId: string;
  readonly position: N4Vec2;
  readonly confidence: number;
  readonly residualScope: readonly N4ResidualTarget[];
  readonly sourceDigest: string;
  readonly graphDigest: string;
  readonly modelDigest: string;
  readonly deterministicDigest: string;
}
export interface N4WeightsManifest {
  readonly sourceDigest: string;
  readonly irDigest: string;
  readonly graphDigest: string;
  readonly modelDigest: string;
  readonly featureSchemaDigest: string;
  readonly featureNames: readonly string[];
  readonly outputNames: readonly string[];
  readonly weightTensor: readonly number[];
  readonly weightShape: readonly [number, number];
  readonly typeTensor: readonly number[];
  readonly typeShape: readonly [number, number];
  readonly tensorChecksum: string;
  readonly deterministicDigest: string;
}
export interface N4GeneratedArtifacts {
  readonly contract: N4SourceContract;
  readonly models: N4ModelSet;
  readonly weightsManifest: N4WeightsManifest;
  readonly deterministicDigest: string;
}
export interface N4RuntimeInference {
  readonly runtime: 'cpu' | 'wasm' | 'webgpu';
  readonly output: readonly number[];
  readonly sourceDigest: string;
  readonly graphDigest: string;
  readonly modelDigest: string;
  readonly weightsManifestDigest: string;
  readonly deterministicDigest: string;
}
export interface N4RuntimeParityVerdict {
  readonly valid: boolean;
  readonly maxAbsoluteError: number;
  readonly tolerance: number;
  readonly reason: string;
}
export declare const N4_METRIC_CONTRACT_SHA256: string;
export declare const N4_RESIDUAL_TARGETS: readonly N4ResidualTarget[];
export declare function compileN4ResidualWorldSource(source: string): N4SourceContract;
export declare function generateN4Scene(seed: number, split: N4WorldScene['split']): N4WorldScene;
export declare function trainN4Models(trainScenes: readonly N4WorldScene[]): N4ModelSet;
export declare function generateN4Artifacts(source: string): N4GeneratedArtifacts;
export declare function projectN4TypedFeatures(scene: N4WorldScene, object: N4Object2D): readonly number[];
export declare function proposeN4TypedMove(
  contract: N4SourceContract,
  models: N4ModelSet,
  scene: N4WorldScene,
  entityId: string,
  action: N4Vec2
): N4TypedMoveAction;
export declare function verifyN4TypedMove(action: N4TypedMoveAction): boolean;
export declare function inferN4Cpu(manifest: N4WeightsManifest, features: readonly number[]): N4RuntimeInference;
export declare function inferN4Wasm(manifest: N4WeightsManifest, features: readonly number[]): Promise<N4RuntimeInference>;
export declare function inferN4WebGPU(device: GPUDevice, manifest: N4WeightsManifest, features: readonly number[]): Promise<N4RuntimeInference>;
export declare function verifyN4RuntimeParity(
  reference: N4RuntimeInference,
  candidate: N4RuntimeInference
): N4RuntimeParityVerdict;
`;

const paper0cSpikeDTS = `/** @holoscript/core/paper-0c-spike — CAEL paper-0c primitives (subgrid attestation) */
export type HashMode = 'fnv1a' | 'sha256';
export declare const DEFAULT_HASH_MODE: HashMode;
export type SubgridParamValue = number | boolean | string;
export type SubgridParams = Record<string, SubgridParamValue>;
export interface SubgridAttestation {
  readonly hash: string;
  readonly hashMode: HashMode;
  readonly canonicalForm: string;
}
export type VerifyResult =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly reason: 'hashMode-mismatch' | 'hash-mismatch' | 'canonical-form-mismatch';
      readonly expected: string;
      readonly actual: string;
    };
export declare class MissingSubgridParamsError extends Error { constructor(); }
export declare class InvalidSubgridParamValueError extends Error { constructor(key: string, value: unknown); }
export declare function canonicalizeSubgridParams(params: SubgridParams): string;
export declare function hashSubgridParams(params: SubgridParams, mode: 'fnv1a'): string;
export declare function hashSubgridParams(params: SubgridParams, mode: 'sha256'): Promise<string>;
export declare function hashSubgridParams(params: SubgridParams, mode?: HashMode): string | Promise<string>;
export declare function attestSubgridParams(params: SubgridParams, mode: 'fnv1a'): SubgridAttestation;
export declare function attestSubgridParams(params: SubgridParams, mode: 'sha256'): Promise<SubgridAttestation>;
export declare function attestSubgridParams(params: SubgridParams, mode?: HashMode): SubgridAttestation | Promise<SubgridAttestation>;
export declare function verifySubgridAttestation(attestation: SubgridAttestation, params: SubgridParams): VerifyResult;
export declare function verifySubgridAttestationAsync(attestation: SubgridAttestation, params: SubgridParams): Promise<VerifyResult>;
`;

const coordinatorsDTS = `/** @holoscript/core/coordinators — Pattern E consumer-bus infrastructure */

// --- Shared duck-typed event source ---
export interface CoordinatorEventSource {
  on(event: string, handler: (payload: unknown) => void): void;
}

// --- AssetLoadCoordinator ---
export type AssetLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';
export interface AssetLoadState {
  url: string;
  format: 'gltf' | 'usd' | 'fbx' | 'unknown';
  status: AssetLoadStatus;
  progress: number;
  error?: string;
  updatedAt: number;
}
export interface AssetLoadStats {
  total: number;
  loading: number;
  loaded: number;
  failed: number;
  averageProgress: number;
}
export type AssetLoadListener = (state: AssetLoadState) => void;
export declare class AssetLoadCoordinator {
  constructor(source: CoordinatorEventSource);
  subscribe(listener: AssetLoadListener): () => void;
  getAllStates(): AssetLoadState[];
  getStats(): AssetLoadStats;
  reset(): void;
}

// --- SecurityEventBus ---
export interface SessionState {
  sessionId: string;
  status: 'authenticated' | 'expired' | 'revoked';
  idp?: string;
  userId?: string;
  updatedAt: number;
}
export interface AuthorizationState {
  agentId: string;
  tenantId?: string;
  roles: Set<string>;
  capabilities: Set<string>;
  updatedAt: number;
}
export interface QuotaState {
  resource: string;
  subject: string;
  consumed: number;
  limit: number;
  status: 'ok' | 'threshold_reached' | 'grace' | 'exceeded';
  updatedAt: number;
}
export interface TenantState {
  tenantId: string;
  status: 'provisioned' | 'active' | 'suspended' | 'decommissioned';
  tier?: string;
  updatedAt: number;
}
export interface AuditLogEntry {
  event: string;
  action?: string;
  actor?: string;
  tenantId?: string;
  outcome?: 'success' | 'denied' | 'error';
  observedAt: number;
}
export interface SecurityStats {
  sessions: { authenticated: number; expired: number; revoked: number };
  agents: { tracked: number };
  tenants: { active: number; suspended: number; decommissioned: number };
  quotas: { tracked: number; exceeded: number; grace: number };
  auditLog: { entries: number; capacity: number };
}
export interface SecurityEventEnvelope {
  domain: 'auth' | 'authz' | 'quota' | 'tenant' | 'audit' | 'forget' | 'unknown';
  event: string;
  payload: unknown;
  observedAt: number;
}
export type SecurityEventListener = (envelope: SecurityEventEnvelope) => void;
export declare class SecurityEventBus {
  constructor(source: CoordinatorEventSource);
  subscribe(listener: SecurityEventListener): () => void;
  getAllSessions(): SessionState[];
  getAuditLog(): AuditLogEntry[];
  getStats(): SecurityStats;
  reset(): void;
}

// --- GenerativeJobMonitor ---
export type GenerativeJobKind = 'inpainting' | 'texture_gen' | 'controlnet' | 'diffusion_rt';
export type GenerativeJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'errored';
export interface GenerativeJobState {
  jobId: string;
  kind: GenerativeJobKind;
  status: GenerativeJobStatus;
  startedAt: number;
  updatedAt: number;
  durationMs?: number;
  error?: string;
}
export interface GenerativeJobKindStats {
  queued: number;
  running: number;
  completed: number;
  cancelled: number;
  errored: number;
  meanLatencyMs: number;
}
export interface GenerativeJobStats {
  total: number;
  byKind: Record<GenerativeJobKind, GenerativeJobKindStats>;
  anyReady: boolean;
}
export type GenerativeJobListener = (state: GenerativeJobState) => void;
export declare class GenerativeJobMonitor {
  constructor(source: CoordinatorEventSource);
  subscribe(listener: GenerativeJobListener): () => void;
  getAllJobs(): GenerativeJobState[];
  getStats(): GenerativeJobStats;
  reset(): void;
}

// --- SessionPresenceCoordinator ---
export type PresenceDomain = 'shareplay' | 'voice' | 'messaging' | 'heartbeat' | 'unknown';
export type SessionStatus = 'idle' | 'started' | 'joined' | 'ended';
export interface SharePlaySessionState {
  sessionId: string;
  status: SessionStatus;
  participants: Set<string>;
  activityTitle?: string;
  updatedAt: number;
}
export interface SpatialVoiceState {
  nodeId: string;
  peers: Set<string>;
  muted: boolean;
  lastVoiceActivityAt: number;
  updatedAt: number;
}
export type MessagingConnectionStatus = 'disconnected' | 'connected' | 'errored';
export interface MessagingConnectionState {
  platform: string;
  status: MessagingConnectionStatus;
  messagesReceived: number;
  messagesSent: number;
  error?: string;
  updatedAt: number;
}
export interface HeartbeatState {
  nodeId: string;
  status: 'initialized' | 'alive' | 'failover' | 'errored';
  ticks: number;
  lastTickAt: number;
  error?: string;
  updatedAt: number;
}
export interface SessionPresenceStats {
  sessions: { active: number; ended: number; participants: number };
  voice: { nodes: number; peers: number; muted: number };
  messaging: { connections: number; connected: number; errored: number };
  heartbeat: { tracked: number; alive: number; failover: number; errored: number };
}
export interface SessionPresenceEnvelope {
  domain: PresenceDomain;
  event: string;
  payload: unknown;
  observedAt: number;
}
export type SessionPresenceListener = (envelope: SessionPresenceEnvelope) => void;
export declare class SessionPresenceCoordinator {
  constructor(source: CoordinatorEventSource);
  subscribe(listener: SessionPresenceListener): () => void;
  getAllSessions(): SharePlaySessionState[];
  getAllVoiceNodes(): SpatialVoiceState[];
  getAllMessagingConnections(): MessagingConnectionState[];
  getAllHeartbeats(): HeartbeatState[];
  getStats(): SessionPresenceStats;
  reset(): void;
}

// --- NeuralForgeCoordinator ---
export type NeuralNodeStatus = 'connected' | 'idle' | 'synthesizing' | 'timeout_fallback';
export interface NeuralNodeState {
  nodeId: string;
  status: NeuralNodeStatus;
  shardCount: number;
  weights: Record<string, number>;
  lastSynthesisAt: number | null;
  pendingExternalSynthesis: boolean;
  pendingSince: number | null;
  experienceLogLength: number;
  updatedAt: number;
}
export interface NeuralForgeStats {
  total: number;
  synthesizing: number;
  timeoutFallback: number;
  totalShards: number;
  anyConnected: boolean;
}
export type NeuralForgeListener = (state: NeuralNodeState) => void;
export declare class NeuralForgeCoordinator {
  constructor(source: CoordinatorEventSource);
  subscribe(listener: NeuralForgeListener): () => void;
  getNodeState(nodeId: string): NeuralNodeState | undefined;
  getAllStates(): NeuralNodeState[];
  isConnected(nodeId: string): boolean;
  getStats(): NeuralForgeStats;
  reset(): void;
  readonly subscribedEventCount: number;
}

// --- ObjectTrackingCoordinator ---
export type ObjectTrackingVector3 = [number, number, number];
export type ObjectTrackingStatus =
  | 'initialized'
  | 'tracking'
  | 'lost'
  | 'recovering'
  | 'removed';
export interface ObjectTrackingState {
  nodeId: string;
  target?: string;
  anchorId: string | null;
  status: ObjectTrackingStatus;
  position: ObjectTrackingVector3 | null;
  rotation: ObjectTrackingVector3 | null;
  confidence: number;
  recoveryAttempts: number;
  source?: string;
  timestampMs: number | null;
  updatedAt: number;
}
export interface ObjectTrackingStats {
  total: number;
  tracking: number;
  lost: number;
  recovering: number;
  removed: number;
}
export type ObjectTrackingListener = (state: ObjectTrackingState) => void;
export declare class ObjectTrackingCoordinator {
  constructor(source: CoordinatorEventSource);
  subscribe(listener: ObjectTrackingListener): () => void;
  getTrackingState(nodeId: string): ObjectTrackingState | undefined;
  getAllStates(): ObjectTrackingState[];
  getStats(): ObjectTrackingStats;
  reset(): void;
  readonly subscribedEventCount: number;
}
`;

const agentsDTS = `/**
 * @holoscript/core/agents
 *
 * Canonical agent protocol types for HoloScript Core.
 */
export type AgentPhase = 'intake' | 'reflect' | 'execute' | 'compress' | 'reintake' | 'grow' | 'evolve' | 'autonomize';
export declare const PHASE_ORDER: readonly AgentPhase[];
export interface AgentConfig {
  name: string;
  endpoint?: string;
  timeout?: number;
  [key: string]: unknown;
}
export interface AgentMessage {
  action: string;
  payload: unknown;
  timestamp: number;
}
export interface AgentResponse {
  success: boolean;
  data?: unknown;
  error?: string;
}
export interface CycleResult {
  success: boolean;
  phase: AgentPhase;
  data?: unknown;
  error?: Error;
}
export type TaskStatus = 'idle' | 'pending' | 'running' | 'success' | 'error' | 'cancelled' | 'timeout';
export interface TaskParams {
  input?: Record<string, unknown>;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  timeout?: number;
  retry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  metadata?: Record<string, unknown>;
}
export interface TaskResult<T = unknown> {
  taskId: string;
  status: TaskStatus;
  data?: T;
  error?: Error;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  retryCount: number;
}
export interface TaskLog {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: unknown;
}
export interface TaskProgress {
  progress: number;
  phase?: AgentPhase;
  estimatedTime?: number;
  logs: TaskLog[];
  status: TaskStatus;
}
export type CircuitState = 'closed' | 'open' | 'half-open';
export interface CircuitBreakerConfig {
  threshold: number;
  timeout: number;
  windowSize: number;
  minimumRequests: number;
}
export interface CircuitBreakerStatus {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  failureRate: number;
  lastError?: Error;
  timeUntilClose?: number;
  nextRetryTime?: number;
}
export interface DegradedModeStatus {
  isDegraded: boolean;
  affectedServices: string[];
  recoveryStatus: {
    inProgress: boolean;
    progress: number;
    estimatedTime?: number;
  };
  degradedSince?: number;
}
export interface AgentMetrics {
  agentName: string;
  circuitState: CircuitState;
  successRate: number;
  averageLatency: number;
  requestCount: number;
  errorCount: number;
  lastError?: Error;
  lastUpdated: number;
  activeTasks: number;
  queuedTasks: number;
}
`;

const hololandDTS = `/** @holoscript/core/hololand — HoloLand runtime integration (world schema + client) */
export interface WorldMetadata {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  version: string;
  author?: string;
  license?: string;
  tags: string[];
  thumbnailUrl?: string;
  previewImages: string[];
  platforms: string[];
  ageRating?: string;
  category: string;
  createdAt: string;
  modifiedAt: string;
  status: 'draft' | 'published' | 'archived';
  metadata: Record<string, unknown>;
}
export interface WorldConfig {
  maxUsers: number;
  bounds: Record<string, unknown>;
  physics: Record<string, unknown>;
  rendering: Record<string, unknown>;
  audio: Record<string, unknown>;
  networking: Record<string, unknown>;
  performance: Record<string, unknown>;
  accessibility: Record<string, unknown>;
}
export interface WorldEnvironment {
  skybox: Record<string, unknown>;
  ambientLight: Record<string, unknown>;
  directionalLights: Array<Record<string, unknown>>;
}
export interface WorldDefinition {
  schemaVersion: string;
  metadata: WorldMetadata;
  config: WorldConfig;
  environment: WorldEnvironment;
  zones: Array<Record<string, unknown>>;
  spawnPoints: Array<Record<string, unknown>>;
  lod: Record<string, unknown>;
  assetManifest?: string;
  prefabs: Array<Record<string, unknown>>;
  sceneGraph: Record<string, unknown>;
}
export interface ConnectionInfo {
  state: string;
}
export declare class HololandClient {
  getConnectionInfo(): ConnectionInfo;
  registerWorld(def: WorldDefinition): Promise<Record<string, unknown>>;
  updateWorld(id: string, def: WorldDefinition): Promise<Record<string, unknown>>;
  getCurrentWorld(): WorldDefinition | null;
}
export declare function createWorldMetadata(
  id: string,
  name: string,
  options?: Partial<Omit<WorldMetadata, 'id' | 'name'>>
): WorldMetadata;
export declare function createWorldConfig(options?: Partial<WorldConfig>): WorldConfig;
export declare function createWorldDefinition(
  id: string,
  name: string,
  options?: Partial<Omit<WorldDefinition, 'schemaVersion' | 'metadata' | 'config' | 'environment'>>
): WorldDefinition;
export declare function getHololandClient(config?: Partial<Record<string, unknown>>): HololandClient;
export declare function connectToHololand(config?: Partial<Record<string, unknown>>): Promise<HololandClient>;
export declare function disconnectFromHololand(): Promise<void>;
`;

const evolutionDTS = `/** @holoscript/core/evolution — browser-safe gated self-improvement slice
 *  (Web Crypto + fetch + pure parser, no node:fs). The edge AgentRunner imports
 *  this light subpath to accrue training corpus in-process on idle (I.023). */

/** The evolution policy (runtime shape of the \`@evolve_program\` trait data). */
export interface EvolvePolicy {
  goal: string;
  generations: number;
  population: number;
  archiveSize: number;
  proposerModel: string;
}
/** One evaluated candidate — the provenance unit. */
export interface EvolveCandidate {
  id: number;
  gen: number;
  parentId: number | null;
  passed: boolean;
  score: number;
  bytes: number;
  note: string;
}
/** Proposes a mutation: returns the FULL revised program (no diff applier exists). */
export type Proposer = (parentCode: string, goal: string, policy: EvolvePolicy) => Promise<string>;
/** Correctness + fitness oracle. \`passed\` is the hard gate; \`score\` is lower-is-better. */
export type Gate = (candidateCode: string) => Promise<{ passed: boolean; score: number }>;
/** One gated proposal, as training signal (the second loop). */
export interface EvolveTraceRecord {
  gen: number;
  parentId: number;
  parentCode: string;
  goal: string;
  candidateCode: string;
  passed: boolean;
  score: number;
}
/** Injected effects, so the loop is pure + deterministic under test. */
export interface EvolveIO {
  propose: Proposer;
  gate: Gate;
  now?: () => string;
  onCandidate?: (rec: EvolveTraceRecord) => void;
}
export type EvolveOutcome = 'IMPROVED' | 'NO_IMPROVEMENT' | 'SEED_INVALID';
/** The auditable receipt — the native \`{result, traceJSONL, verifyUrl}\` envelope. */
export interface EvolveReceipt {
  result: EvolveOutcome;
  generations: number;
  evaluated: number;
  survivors: number;
  discarded: number;
  seedScore: number | null;
  bestScore: number | null;
  improvementPct: number | null;
  proposerModel: string;
  verifierGated: true;
  selfShips: false;
  traceJSONL: string;
  verifyUrl: string;
  ts: string;
}
export interface EvolveResult {
  bestCode: string | null;
  receipt: EvolveReceipt;
}
export interface OpenAICompatibleProposerOptions {
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
}
/** A graded training row in the ecosystem REC-SHAPE (harvest_real.py reads this). */
export interface GradedTraceRow {
  system: string;
  user: string;
  target: string;
  grader: Record<string, unknown>;
  family: string;
  modality: string;
  source: string;
  agentId: string;
  ts: string;
}
/** Run the gated evolutionary search; returns winning code (only if it beat the seed)
 *  plus a full provenance receipt. Propose-not-ship; the gate IS the engine. */
export declare function runEvolution(seedCode: string, policy: EvolvePolicy, io: EvolveIO): Promise<EvolveResult>;
/** Default sovereign proposer wired to a local Ollama endpoint (local metal). */
export declare function makeOllamaProposer(endpoint: string, model: string): Proposer;
/** Proposer for HoloLlama/OpenAI-compatible chat-completions servers. */
export declare function makeOpenAICompatibleProposer(endpoint: string, model: string, opts?: OpenAICompatibleProposerOptions): Proposer;
/** Convert a gated evolve candidate into a graded REC-SHAPE training row. */
export declare function toGradedTraceRow(rec: EvolveTraceRecord, opts: { agentId: string; ts: string; source?: string }): GradedTraceRow;

/** Which native parser gates a seed's candidates (by CONSTRUCT, not file ext). */
export type SeedFormat = 'holo' | 'hsplus';
export interface EvolveSeed {
  name: string;
  format: SeedFormat;
  goal: string;
  source: string;
  preserved: RegExp[];
}
/** The canonical strategic seed portfolio (diverse forms across the language surface). */
export declare const CORPUS_PORTFOLIO: readonly EvolveSeed[];
/** Native parse — clean iff success AND zero errors. Never throws. */
export declare function parsesClean(src: string, format: SeedFormat): boolean;
/** Gate = parse-clean AND every preserved construct present; fitness = length. */
export declare function makeSeedGate(seed: EvolveSeed): Gate;
export interface AccrueStepResult {
  target: string;
  rows: GradedTraceRow[];
  receipt: EvolveReceipt;
}
/** Run ONE gated evolution step over a single portfolio seed (round-robin by \`tick\`)
 *  and return graded REC-SHAPE rows — the unit an autonomous idle loop calls per tick. */
export declare function accrueOneStep(opts: {
  propose: Proposer;
  agentId: string;
  seed?: EvolveSeed;
  tick?: number;
  now?: () => string;
}): Promise<AccrueStepResult>;
/** Pure + browser-safe cross-run dedup keyed on the candidate program (\`row.target\`);
 *  the caller owns the file IO (the node AgentRunner reads/appends the corpus JSONL). */
export declare function dedupRows(
  existingCorpus: string,
  rows: readonly GradedTraceRow[]
): { fresh: GradedTraceRow[]; deduped: number };
export interface WasmFitnessArtifact {
  wat: string;
  memoryLayout: { totalSize: number };
}
export interface WasmFitnessBaseline {
  scenarioId: string;
  score: number;
  watLength?: number;
  memoryTotalSize?: number;
  source?: string;
}
export interface WasmFitnessMeasurement {
  passed: boolean;
  score: number;
  watLength: number;
  memoryTotalSize: number;
  baselineScore: number | null;
  improvementPct: number | null;
  note: string;
}
export interface WasmFitnessOptions {
  baseline?: WasmFitnessBaseline | null;
  minMemoryTotalSize?: number;
  requireImprovement?: boolean;
}
export type WasmCompileCandidate = (candidateCode: string) => WasmFitnessArtifact | Promise<WasmFitnessArtifact>;
export type WasmCandidateCorrectness = (candidateCode: string) => { passed: boolean; note?: string } | Promise<{ passed: boolean; note?: string }>;
export interface WasmFitnessGateOptions extends WasmFitnessOptions {
  correctness?: WasmCandidateCorrectness;
}
export declare function wasmFitnessBaselineFromScenario(
  scenarioId: string,
  scenario: Record<string, unknown>,
  source?: string
): WasmFitnessBaseline | null;
export declare function scoreWasmCompilerArtifact(
  artifact: WasmFitnessArtifact,
  opts?: WasmFitnessOptions
): WasmFitnessMeasurement;
export declare function makeWasmCompilerFitnessGate(
  compileCandidate: WasmCompileCandidate,
  opts?: WasmFitnessGateOptions
): Gate;
`;

// Create subdirectory declaration files
const subdirDeclarations = [
  { dir: 'wot', content: wotDTS },
  { dir: 'traits', content: traitsDTS },
  { dir: 'compiler', content: compilerDTS },
  { dir: 'self-improvement', content: selfImprovementDTS },
  { dir: 'codebase', content: codebaseDTS },
  { dir: 'world', content: worldDTS },
  { dir: 'world-model', content: worldModelDTS },
  { dir: 'storage', content: storageDTS },
  { dir: 'tools', content: toolsDTS },
  { dir: 'reconstruction', content: reconstructionDTS },
  { dir: 'evolution', content: evolutionDTS },
  { dir: 'paper-0c-spike', content: paper0cSpikeDTS },
  { dir: 'coordinators', content: coordinatorsDTS },
  { dir: 'agents', content: agentsDTS },
  { dir: 'hololand', content: hololandDTS },
];

for (const { dir, content } of subdirDeclarations) {
  const subDir = path.join(distDir, dir);
  if (!fs.existsSync(subDir)) {
    fs.mkdirSync(subDir, { recursive: true });
  }
  try {
    fs.writeFileSync(path.join(subDir, 'index.d.ts'), content, 'utf8');
    console.log(`✓ Created ${dir}/index.d.ts`);
  } catch (err) {
    console.error(`✗ Failed to create ${dir}/index.d.ts:`, err.message);
  }
}

try {
  const traitsDir = path.join(distDir, 'traits');
  if (!fs.existsSync(traitsDir)) {
    fs.mkdirSync(traitsDir, { recursive: true });
  }
  fs.writeFileSync(path.join(traitsDir, 'botanical-lotus.d.ts'), botanicalLotusDTS, 'utf8');
  console.log('✓ Created traits/botanical-lotus.d.ts');
  fs.writeFileSync(path.join(traitsDir, 'webcam-gaze.d.ts'), webcamGazeDTS, 'utf8');
  console.log('✓ Created traits/webcam-gaze.d.ts');
  fs.writeFileSync(
    path.join(traitsDir, 'simulation-solver-factory.d.ts'),
    simulationSolverFactoryDTS,
    'utf8'
  );
  console.log('✓ Created traits/simulation-solver-factory.d.ts');
} catch (err) {
  console.error('✗ Failed to create narrow trait subpath declarations:', err.message);
}

try {
  const compilerDir = path.join(distDir, 'compiler');
  if (!fs.existsSync(compilerDir)) {
    fs.mkdirSync(compilerDir, { recursive: true });
  }
  // @holoscript/core/compiler/nodetoy — tsup emits the .js but dts:false, so the
  // ./compiler/* types glob found no nodetoy.d.ts -> TS7016 broke @holoscript/nodetoy-plugin's
  // build (the last full-monorepo build blocker post-8.0.0 merge). Faithful to
  // src/compiler/NodeToyMapping.ts (shader-dependent fields kept
  // loose to stay self-contained — consumers type-check on the graph shape).
  const nodetoyDTS = `// @holoscript/core/compiler/nodetoy — NodeToy shader-graph → HoloScript @shader mapping
export interface NodeToyPort {
  name: string;
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat3' | 'mat4' | 'sampler2D' | 'samplerCube';
  default?: number | number[];
  connection?: string;
}
export interface NodeToyNode {
  id: string;
  type: string;
  label?: string;
  position?: { x: number; y: number };
  inputs: NodeToyPort[];
  outputs: NodeToyPort[];
  params?: Record<string, unknown>;
}
export interface NodeToyEdge {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}
export interface NodeToyGraph {
  name: string;
  version?: string;
  nodes: NodeToyNode[];
  edges: NodeToyEdge[];
  settings?: {
    blendMode?: 'opaque' | 'blend' | 'additive' | 'multiply';
    doubleSided?: boolean;
    depthTest?: boolean;
    depthWrite?: boolean;
  };
}
export interface NodeToyMappingOptions {
  language?: string;
  autoTimeUniform?: boolean;
  autoResolutionUniform?: boolean;
  variablePrefix?: string;
  optimization?: 'none' | 'basic';
}
export type UniformType =
  | 'float' | 'int' | 'bool' | 'vec2' | 'vec3' | 'vec4'
  | 'mat2' | 'mat3' | 'mat4' | 'sampler2D' | 'samplerCube';
export interface ShaderUniform {
  name: string;
  type: UniformType;
  value: number | number[] | boolean | string;
  min?: number;
  max?: number;
  label?: string;
  group?: string;
}
export interface NodeToyMappingResult {
  shaderConfig: Record<string, unknown>;
  vertexSource: string;
  fragmentSource: string;
  uniforms: Record<string, Omit<ShaderUniform, 'name'>>;
  warnings: string[];
  unsupportedNodes: string[];
}
export declare function mapNodeToyToShader(graph: NodeToyGraph, options?: NodeToyMappingOptions): NodeToyMappingResult;
export declare class NodeToyMapper {
  constructor(options?: NodeToyMappingOptions);
  map(graph: NodeToyGraph): NodeToyMappingResult;
}
declare const _default: unknown;
export default _default;
`;
  fs.writeFileSync(path.join(compilerDir, 'nodetoy.d.ts'), nodetoyDTS, 'utf8');
  fs.writeFileSync(path.join(compilerDir, 'context.d.ts'), contextDTS, 'utf8');
  fs.writeFileSync(
    path.join(compilerDir, 'llm-provider-capabilities.d.ts'),
    llmProviderCapabilitiesDTS,
    'utf8'
  );
  console.log('✓ Created compiler/nodetoy.d.ts');
  console.log('✓ Created compiler/context.d.ts');
  console.log('✓ Created compiler/llm-provider-capabilities.d.ts');
} catch (err) {
  console.error('✗ Failed to create compiler subpath declarations:', err.message);
}

// Create entries/ subdirectory declaration files
const entriesDir = path.join(distDir, 'entries');
if (!fs.existsSync(entriesDir)) {
  fs.mkdirSync(entriesDir, { recursive: true });
}
const entriesDeclarations = [
  { name: 'scripting.d.ts', content: scriptingDTS },
  { name: 'interop.d.ts', content: interopDTS },
  { name: '../constants.d.ts', content: constantsDTS },
];
for (const { name, content } of entriesDeclarations) {
  try {
    fs.writeFileSync(path.join(entriesDir, name), content, 'utf8');
    console.log(`✓ Created entries/${name}`);
  } catch (err) {
    console.error(`✗ Failed to create entries/${name}:`, err.message);
  }
}

console.log('\n✓ Type declaration files generated successfully');
