/**
 * @holoscript/core-types AST & Directive Types
 *
 * Self-contained type definitions for HoloScript AST nodes and HS+ directives.
 * ZERO imports -- all types are defined in this file.
 */

// ============================================================================
// Spatial Types
// ============================================================================

export type SpatialPosition = [number, number, number];

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
 * Algebraic-weight threading context for provenance.
 *
 * Mirrored from `packages/core/src/compiler/traits/ProvenanceSemiring.ts:142`.
 * Kept inline here so core-types preserves its zero-runtime-import
 * invariant (the README at `index.ts:14-30` describes the design rule;
 * a planned `pnpm sync` script will eventually automate the mirror —
 * task_1777526367629_270g). Drift fix: 2026-04-30 / task_1777526366319_mobj.
 * See research/2026-04-29_core-types-overlap-audit.md §1.
 */
export interface ProvenanceContext {
  /** Authority weight (e.g., Founder=100, Agent=50, Guest=0) */
  authorityLevel: number;
  agentId?: string;
  sourceType?: 'user' | 'agent' | 'system';
  /** Optional reputation score from HoloMesh (0-100) — threads reputation into algebra */
  reputationScore?: number;
}

/**
 * Full ASTNode with directives, traits, and spatial-feed provenance.
 * HSPlusDirective is defined below in this same file (no circular import needed).
 */
export interface ASTNode extends BaseASTNode {
  /** HS+ Directives */
  directives?: HSPlusDirective[];
  /** HS+ Traits (Pre-processed map) */
  traits?: Map<VRTraitName, Record<string, unknown>>;
  /** Spatial Feed Provenance */
  provenance?: {
    author: string;
    timestamp: number;
    provenanceHash: string;
    context?: ProvenanceContext; // Algebraic weight threading
  };
}

/**
 * Spatial-tuple alias mirrored from
 * `packages/core/src/types/HoloScriptPlus.ts:10`. Vector3 is the canonical
 * 3-axis tuple shape used by every spatial trait at runtime; downstream
 * type-narrowing utilities key on this alias rather than the raw tuple,
 * so core-types must export it under the same name to preserve narrowing
 * across the core-types boundary. Drift fix: 2026-04-30 /
 * task_1777526366932_d16p. See research/2026-04-29_core-types-overlap-audit.md §2.
 */
export type Vector3 = [number, number, number];

/**
 * Quaternion alias mirrored from
 * `packages/core/src/types/HoloScriptPlus.ts:26`. Same reasoning as
 * Vector3 above — the alias is load-bearing for type narrowing, not just
 * documentation.
 */
export type Quaternion = [number, number, number, number];

/**
 * HSPlus primitive-type name union mirrored from
 * `packages/core/src/types/HoloScriptPlus.ts:157`. Output of
 * `TypeInferencePass` on parsed HSPlus AST nodes — the simple compiler-
 * target type list, distinct from the richer structured `HoloScriptType`
 * (defined below) which models the full type-system surface (arrays,
 * unions, intersections, generics).
 */
export type HSPlusType =
  | 'float'
  | 'int'
  | 'bool'
  | 'string'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'color'
  | 'unknown';

/**
 * Minimal HoloScript+ scene node shape used by downstream packages that need
 * to inspect parsed object trees without importing @holoscript/core.
 */
export interface HSPlusNode extends ASTNode {
  name?: string;
  children?: HSPlusNode[];
  properties?: Record<string, unknown>;
  directives?: HSPlusDirective[];
  args?: unknown;
  body?: unknown;
  /** Scene-graph rotation set by spatial traits at runtime (euler or quaternion). */
  rotation?: Vector3 | Quaternion;
  /** Scene-graph scale set by spatial traits at runtime. */
  scale?: Vector3;
  version?: string | number;
  migrations?: Array<{ type: string; fromVersion: number; body: string }>;
  migrationBlocks?: Record<number, string>;
  // Additional properties for runtime evaluation
  value?: unknown;
  target?: unknown;
  arguments?: unknown[];
  method?: string;
  condition?: HSPlusNode;
  consequent?: HSPlusNode;
  alternate?: HSPlusNode;
  event?: string;
  data?: unknown;
  loc?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  /**
   * Per-node reactive state block.
   * Populated by the parser when a `state { key = value }` block
   * appears inside a node/object declaration.
   * Keys are state variable names; values are initial values.
   */
  stateBlock?: Record<string, unknown>;
  /**
   * Type inferred by TypeInferencePass.
   * Set during compilation; never present on freshly-parsed AST.
   */
  inferredType?: HSPlusType;
  /** Trait private state — `__`-prefixed keys are reserved for trait handlers. */
  [key: `__${string}`]: unknown;
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
