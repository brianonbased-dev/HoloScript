#!/usr/bin/env node

/**
 * Post-build script for @holoscript/core
 * Generates type declaration files for downstream packages
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Go up from scripts/ to core/, then to dist/
const distDir = path.join(__dirname, '..', 'dist');

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Comprehensive type declaration - includes all major exports
const mainDTS = `/**
 * @fileoverview Type definitions for HoloScript Core (v5.0)
 * @module @holoscript/core
 */

// ============================================================================
// CORE TYPES
// ============================================================================

export interface ASTNode {
  type: string;
  [key: string]: any;
}

export interface ParseResult {
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

export interface ParsedTrait {
  name: string;
  config: any;
  [key: string]: any;
}

// ============================================================================
// PARSERS
// ============================================================================

export class HoloScriptPlusParser {
  parse(source: string): ParseResult;
  parseExpression(source: string): any;
  parseStatement(source: string): any;
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

export class HoloScriptCodeParser {
  parse(source: string): ParseResult;
  parseExpression(source: string): any;
  parseBlock(source: string): any[];
  getErrors(): any[];
}

export function parse(source: string, options?: any): ParseResult;
export function parseHolo(source: string, options?: any): any;
export function parseHoloStrict(source: string): any;
export function parseHoloScriptPlus(source: string, options?: any): ParseResult;

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

export interface HoloParseResult {
  success: boolean;
  ast?: HoloComposition;
  errors: any[];
  warnings: any[];
}

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
  evaluate(expression: string, context?: any): any;
  extractVariables(expression: string): string[];
}

export class EventBus {
  static getInstance(): EventBus;
  on(event: string, callback: any): void;
  off(event: string, callback: any): void;
  emit(event: string, ...args: any[]): void;
}
export const eventBus: EventBus;

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

export class R3FCompiler {
  compile(ast: any): any;
  [key: string]: any;
}

export interface CompilationResult {
  success: boolean;
  r3fCode?: string;
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

export interface Native2DCompilerOptions {
  format?: 'html' | 'react';
  minify?: boolean;
}

export class Native2DCompiler {
  constructor(options?: Native2DCompilerOptions);
  compile(ast: any, agentToken: string, outputPath?: string, options?: Native2DCompilerOptions): string | any;
}

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
  iterable: string;
  variable: string;
  body?: any[];
}
export interface RaycastHit {
  point: Vector3;
  normal: Vector3;
  distance: number;
  bodyId: string;
  [key: string]: any;
}

export class HoloScriptRuntime {
  execute(ast: any, context?: any): Promise<any>;
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
export interface ASTProgram { [key: string]: any; }
export interface HSPlusASTNode { [key: string]: any; }
export interface HSPlusCompileResult { [key: string]: any; }

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

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface VRHand {
  position: Vector3;
  rotation: Vector3;
  joints: Map<string, { position: Vector3; rotation: Vector3 }>;
  pinchStrength: number;
  gripStrength: number;
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
  getBodyPosition(nodeId: string): { x: number; y: number; z: number } | null;
  getBodyVelocity(nodeId: string): { x: number; y: number; z: number } | null;
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

export interface TraitContext {
  vr: VRContext;
  physics: PhysicsContext;
  audio: AudioContext;
  haptics: HapticsContext;
  accessibility?: AccessibilityContext;
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
  traits?: Map<string, unknown>;
  children?: HSPlusNode[];
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

export class UnityCompiler { compile(ast: any, options?: any): any; [key: string]: any; }
export class GodotCompiler { compile(ast: any, options?: any): any; [key: string]: any; }
export class VisionOSCompiler { compile(ast: any, options?: any): any; [key: string]: any; }
export class VRChatCompiler { compile(ast: any, options?: any): any; [key: string]: any; }
export class UnrealCompiler { compile(ast: any, options?: any): any; [key: string]: any; }

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
export function createParser(options?: any): HoloScriptPlusParser;
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
  constructor(config?: any);
  addSource(id: string, source: string): void;
  compile(targets?: string[]): IncrementalBuildResult;
  invalidate(id: string): void;
  [key: string]: any;
}

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
export class URDFCompiler { [key: string]: any; }
export class SDFCompiler { [key: string]: any; }
export class OpenXRCompiler { [key: string]: any; }
export class AndroidCompiler { [key: string]: any; }
export class AndroidXRCompiler { [key: string]: any; }
export class IOSCompiler { [key: string]: any; }
export class ARCompiler { [key: string]: any; }
export class BabylonCompiler { [key: string]: any; }
export class WebGPUCompiler { [key: string]: any; }
export class WASMCompiler { [key: string]: any; }
export class PlayCanvasCompiler { [key: string]: any; }
export class DTDLCompiler { [key: string]: any; }
export class VRRCompiler { [key: string]: any; }
export class MultiLayerCompiler { [key: string]: any; }

export declare const VR_TRAITS: any;
export declare const BUILTIN_CONSTRAINTS: any;
export class CircuitBreakerRegistry { [key: string]: any; }
export class CircuitState { [key: string]: any; }
export class ExportManager { [key: string]: any; }
export declare function getExportManager(options?: Partial<ExportOptions>): any;
export class ExportTarget { [key: string]: any; }
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
`;

const parserDTS = `export class HoloScriptPlusParser {
  parse(source: string): any;
}
export function parse(source: string): any;
`;

const runtimeDTS = `export class HoloScriptRuntime {
  execute(ast: any, context?: any): Promise<any>;
}

export interface RuntimeOptions { [key: string]: any; }
export interface Renderer { [key: string]: any; }
export interface ExecutionResult { success: boolean; result?: any; error?: string; duration?: number; memoryUsed?: number; }

export class HoloScriptPlusRuntimeImpl {
  constructor(options?: RuntimeOptions);
  execute(ast: any, context?: any): Promise<ExecutionResult>;
  createRenderer(config?: any): Renderer;
  getState(): Record<string, any>;
  setState(updates: Record<string, any>): void;
  dispose(): void;
}

export function createRuntime(options?: RuntimeOptions): HoloScriptPlusRuntimeImpl;
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

// ── Namespaced domain plugins (mirrors packages/core/src/traits/index.ts) ──
// Keeps \`import { FilmVFXPlugin } from '@holoscript/core/traits'\` resolving after barrel namespacing.
export * as FilmVFXPlugin from '@holoscript/plugin-film-vfx';
export * as AlphaFoldPlugin from '@holoscript/alphafold-plugin';
export * as BankingFinancePlugin from '@holoscript/plugin-banking-finance';
export * as CivilEngineeringPlugin from '@holoscript/plugin-civil-engineering';
export * as CultureKeywordPlugin from '@holoscript/plugin-culture-keyword';
export * as DomainPluginTemplate from '@holoscript/domain-plugin-template';
export * as EconomicPrimitivesPlugin from '@holoscript/plugin-economic-primitives';
export * as EducationLmsPlugin from '@holoscript/plugin-education-lms';
export * as EmergencyResponsePlugin from '@holoscript/plugin-emergency-response';
export * as FashionPlugin from '@holoscript/plugin-fashion';
export * as Film3dVolumetricsPlugin from '@holoscript/plugin-film3d-volumetrics';
export * as FitnessWellnessPlugin from '@holoscript/plugin-fitness-wellness';
export * as ForensicsPlugin from '@holoscript/plugin-forensics';
export * as GeolocationGisPlugin from '@holoscript/plugin-geolocation-gis';
export * as HardwareInventionPlugin from '@holoscript/plugin-hardware-invention';
export * as HrWorkforcePlugin from '@holoscript/plugin-hr-workforce';
export * as InsurancePlugin from '@holoscript/plugin-insurance';
export * as LegalDocumentPlugin from '@holoscript/plugin-legal-document';
export * as ManufacturingQcPlugin from '@holoscript/plugin-manufacturing-qc';
export * as MedicalPlugin from '@holoscript/medical-plugin';
export * as NeurosciencePlugin from '@holoscript/plugin-neuroscience';
export * as RadioAstronomyPlugin from '@holoscript/radio-astronomy-plugin';
export * as RestaurantPlugin from '@holoscript/plugin-restaurant';
export * as RetailEcommercePlugin from '@holoscript/plugin-retail-ecommerce';
export * as RoboticsPlugin from '@holoscript/robotics-plugin';
export * as NarupaPlugin from '@holoscript/narupa-plugin';
export * as TherapyPlugin from '@holoscript/plugin-therapy';
export * as ThreatIntelligencePlugin from '@holoscript/plugin-threat-intelligence';
export * as TraitAuditPlugin from '@holoscript/plugin-trait-audit';
export * as TravelHospitalityPlugin from '@holoscript/plugin-travel-hospitality';
export * as UrbanPlanningPlugin from '@holoscript/plugin-urban-planning';
export * as WineFoodBeveragePlugin from '@holoscript/plugin-wine-food-beverage';
export * as WisdomGotchaPlugin from '@holoscript/plugin-wisdom-gotcha';
`;

const compilerDTS = `/**
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

export class R3FCompiler extends CompilerBase {
  compile(ast: any, token: CompilerToken): R3FNode[];
}

export declare const ENVIRONMENT_PRESETS: Record<string, any>;

export class UnityCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class GodotCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class BabylonCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class PlayCanvasCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class ARCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class OpenXRCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class VRChatCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class VisionOSCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class AndroidCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class AndroidXRCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class IOSCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class WASMCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class WebGPUCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class SDFCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class DTDLCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class URDFCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class USDPhysicsCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class StateCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class TraitCompositionCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class IncrementalCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
export class MultiLayerCompiler extends CompilerBase { compile(ast: any, token: CompilerToken): any; }
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
export class AgentInferenceExportTarget extends CompilerBase { compile(ast: any, token: CompilerToken): any; }

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

export class USDZPipeline { [key: string]: any; }
export interface USDZPipelineOptions { [key: string]: any; }

export class CompilerBridge { [key: string]: any; }
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

// Write type declaration files
const files = [
  { path: path.join(distDir, 'index.d.ts'), content: mainDTS },
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
export type MaterialEditorPreset = unknown;
export type MaterialEditorConfig = unknown;
export type MaterialPreset = unknown;
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
  trajectory: Record<string, unknown>;
  anchor: Record<string, unknown>;
}
export interface HoloMapConfig {
  inputResolution: { width: number; height: number };
  targetFPS: number;
  maxSequenceLength: number;
  seed: number;
  modelHash: string;
  videoHash?: string;
  cpuOffload: boolean;
  weightStrategy?: 'distill' | 'fine-tune' | 'from-scratch';
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
}): string;
export declare function fnv1a32Hex(input: string): string;
export declare function assertHoloMapManifestContract(m: ReconstructionManifest): void;
`;

// Create subdirectory declaration files
const subdirDeclarations = [
  { dir: 'wot', content: wotDTS },
  { dir: 'traits', content: traitsDTS },
  { dir: 'compiler', content: compilerDTS },
  { dir: 'self-improvement', content: selfImprovementDTS },
  { dir: 'codebase', content: codebaseDTS },
  { dir: 'storage', content: storageDTS },
  { dir: 'tools', content: toolsDTS },
  { dir: 'reconstruction', content: reconstructionDTS },
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
