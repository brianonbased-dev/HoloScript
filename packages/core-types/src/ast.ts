/**
 * @holoscript/core-types AST & Directive Types
 *
 * Self-contained type definitions for HoloScript AST nodes and HS+ directives.
 * ZERO imports -- all types are defined in this file.
 */

// ============================================================================
// Spatial Types
// ============================================================================

export interface SpatialPosition {
  x: number;
  y: number;
  z: number;
}

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

export interface HologramProperties {
  shape: HologramShape;
  color: string;
  size: number;
  glow: boolean;
  interactive: boolean;
}

// ============================================================================
// VR Trait Names
// ============================================================================

export type VRTraitName =
  | 'grabbable'
  | 'throwable'
  | 'pointable'
  | 'hoverable'
  | 'scalable'
  | 'rotatable'
  | 'stackable'
  | 'snappable'
  | 'breakable'
  | 'skeleton'
  | 'body'
  | 'haptic'
  | 'gaussian_splat'
  | 'nerf'
  | 'volumetric_video'
  | 'orbital'
  | 'mitosis'
  | 'portal'
  | 'vfx'
  | 'raycast'
  | 'speech'
  | 'gesture'
  | 'emoji'
  | 'audio'
  | 'video'
  | 'networked'
  | 'synced'
  | 'compute'
  | 'hidd'
  | 'seated'
  | 'eye_tracked'
  | 'hitl'
  | 'interactive_graph'
  | 'draft'
  | 'hot_reload'
  | (string & {}); // Allow any string for extensibility while preserving autocomplete

// ============================================================================
// Base AST Nodes
// ============================================================================

export interface BaseASTNode {
  type: string;
  id?: string;
  position?: SpatialPosition;
  hologram?: HologramProperties;
  /** Source line number (1-indexed) */
  line?: number;
  /** Source column number (0-indexed) */
  column?: number;
}

/**
 * Full ASTNode with directives and traits.
 * HSPlusDirective is defined below in this same file (no circular import needed).
 */
export interface ASTNode extends BaseASTNode {
  /** HS+ Directives */
  directives?: HSPlusDirective[];
  /** HS+ Traits (Pre-processed map) */
  traits?: Map<VRTraitName, Record<string, unknown>>;
}

// ============================================================================
// HoloScript Type System (needed by StateDeclaration)
// ============================================================================

export type PrimitiveTypeName = 'number' | 'string' | 'boolean' | 'void';

export interface PrimitiveType {
  kind: 'primitive';
  name: PrimitiveTypeName;
}

export interface ArrayType {
  kind: 'array';
  elementType: HoloScriptType;
}

export interface UnionType {
  kind: 'union';
  members: HoloScriptType[];
}

export interface IntersectionType {
  kind: 'intersection';
  members: HoloScriptType[];
}

export interface GenericType {
  kind: 'generic';
  name: string;
  typeArgs: HoloScriptType[];
}

export interface LiteralType {
  kind: 'literal';
  value: string | number | boolean;
}

export interface CustomType {
  kind: 'custom';
  name: string;
  properties: Map<string, HoloScriptType>;
  methods: Map<string, FunctionType>;
}

export interface FunctionType {
  kind: 'function';
  parameters: { name: string; type: HoloScriptType }[];
  returnType: HoloScriptType;
}

export type HoloScriptType =
  | PrimitiveType
  | ArrayType
  | UnionType
  | IntersectionType
  | GenericType
  | LiteralType
  | CustomType;

// ============================================================================
// AST Program
// ============================================================================

export interface ASTProgram {
  type: 'Program';
  body: unknown[];
  version: string | number;
  root: unknown;
  imports: Array<{ path: string; alias: string; namedImports?: string[]; isWildcard?: boolean }>;
  hasState: boolean;
  hasVRTraits: boolean;
  hasControlFlow: boolean;
  migrations?: unknown[];
}

export type HSPlusAST = ASTProgram;

// ============================================================================
// HS+ Directive Union
// ============================================================================

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
  | HSPlusNamedConfigDirective
  | HSPlusAnnotateDirective
  | HSPlusSemanticRefDirective
  | HSPlusZonesDirective
  | HSPlusSpawnPointsDirective
  | HSPlusExternalApiDirective
  | HSPlusGenerateDirective
  | HSPlusNpcDirective
  | HSPlusDialogDirective
  | HSPlusHololandEventDirective
  | HSPlusAssetDirective;

// ============================================================================
// HS+ Directive Interfaces
// ============================================================================

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

export interface HSPlusForDirective {
  type: 'for';
  variable: string;
  range?: [number, number];
  iterable?: string;
  body: unknown[];
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

/** Config-spread directives: { type: 'skybox', ...config } */
export interface HSPlusConfigDirective {
  type:
    | 'world_metadata'
    | 'world_config'
    | 'skybox'
    | 'ambient_light'
    | 'fog'
    | 'artwork_metadata'
    | 'npc_behavior'
    | 'interactive'
    | 'lod'
    | 'gravity'
    | 'time_of_day'
    | 'audio_settings'
    | 'render_settings'
    | 'physics_config'
    | 'network_config'
    | 'accessibility';
  [key: string]: unknown;
}

/** Named config-spread directives: { type: 'manifest', name, ...config } */
export interface HSPlusNamedConfigDirective {
  type: 'manifest' | 'semantic' | 'directional_light';
  name: string;
  [key: string]: unknown;
}

export interface HSPlusAnnotateDirective {
  type: 'annotate';
  annotationType: string;
  config: Record<string, unknown>;
}

export interface HSPlusSemanticRefDirective {
  type: 'semantic_ref';
  ref: string;
}

export interface HSPlusZonesDirective {
  type: 'zones';
  zones: unknown[];
}

export interface HSPlusSpawnPointsDirective {
  type: 'spawn_points';
  spawns: unknown[];
}

export interface HSPlusExternalApiDirective {
  type: 'external_api';
  url: string;
  method: string;
  interval?: unknown;
  body?: unknown[];
}

export interface HSPlusGenerateDirective {
  type: 'generate';
  prompt: string;
  context: string;
  target: string;
}

export interface HSPlusNpcDirective {
  type: 'npc';
  name: string;
  props: Record<string, unknown>;
}

export interface HSPlusDialogDirective {
  type: 'dialog';
  name: string;
  props: Record<string, unknown>;
  options: unknown[];
}

export interface HSPlusHololandEventDirective {
  type: 'hololand_event';
  event: string;
  params: unknown[];
}

export interface HSPlusAssetDirective {
  type: 'asset';
  id?: string;
  [key: string]: unknown;
}

// ============================================================================
// Compile Result & Parser Options
// ============================================================================

export interface HSPlusCompileResult {
  success: boolean;
  code?: string;
  sourceMap?: unknown;
  errors: Array<{ message: string; line: number; column: number }>;
  ast?: unknown;
  compiledExpressions?: unknown;
  requiredCompanions?: string[];
  features?: unknown;
  warnings?: unknown[];
  [key: string]: unknown;
}

export interface HSPlusParserOptions {
  sourceMap?: boolean;
  strict?: boolean;
  enableTypeScriptImports?: boolean;
  enableVRTraits?: boolean;
}

// ============================================================================
// State & Lifecycle Declarations
// ============================================================================

export interface StateDeclaration {
  name: string;
  type: HoloScriptType;
  initialValue?: unknown;
  [key: string]: unknown;
}

export interface LifecycleHook {
  name: 'mounted' | 'updated' | 'destroyed';
  handler: string;
}

export interface VRLifecycleHook {
  name: 'grabbed' | 'released' | 'pointed' | 'unpointed' | 'thrown';
  handler: string;
}
