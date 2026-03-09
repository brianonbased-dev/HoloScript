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

// ============================================================================
// PARSERS
// ============================================================================

export class HoloScriptPlusParser {
  parse(source: string): ParseResult;
  parseExpression(source: string): any;
  parseStatement(source: string): any;
}

export class HoloCompositionParser {
  parse(source: string): any;
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

export interface R3FNode {
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
// COMPILERS & GENERATORS
// ============================================================================

export class HoloScriptCompiler {
  compile(ast: any, target: string): any;
}

export class R3FCompiler {
  compile(ast: any): any;
  [key: string]: any;
}

// ============================================================================
// RUNTIME & EXECUTION
// ============================================================================

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

export type SafetyVerdict = 'safe' | 'caution' | 'unsafe';

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
// CULTURE TYPES
// ============================================================================

export interface CulturalNorm {
  [key: string]: any;
}
export type NormCategory = string;

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
  HoloScriptCompiler: typeof HoloScriptCompiler;
  HoloScriptRuntime: typeof HoloScriptRuntime;
  HoloScriptTypeChecker: typeof HoloScriptTypeChecker;
  HoloScriptDebugger: typeof HoloScriptDebugger;
  TraitCompositor: typeof TraitCompositor;
  MATERIAL_PRESETS: typeof MATERIAL_PRESETS;
};
export default _default;
`;

const parserDTS = `export class HoloScriptPlusParser {
  parse(source: string): any;
}
export function parse(source: string): any;
`;

const runtimeDTS = `export class HoloScriptRuntime {
  execute(ast: any, context?: any): Promise<any>;
}
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

// Create wot directory if needed
const wotDir = path.join(distDir, 'wot');
if (!fs.existsSync(wotDir)) {
  fs.mkdirSync(wotDir, { recursive: true });
}

try {
  fs.writeFileSync(path.join(wotDir, 'index.d.ts'), wotDTS, 'utf8');
  console.log(`✓ Created wot/index.d.ts`);
} catch (err) {
  console.error(`✗ Failed to create wot/index.d.ts:`, err.message);
}

console.log('\n✓ Type declaration files generated successfully');
