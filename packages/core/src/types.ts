/**
 * @holoscript/core Types
 *
 * Core type definitions for HoloScript AST and runtime
 */

// ============================================================================
// HS+ Consolidated Types (Imported from AdvancedTypeSystem and HoloScriptPlus)
// ============================================================================

import type {
  HSPlusDirective,
  HSPlusAST,
  ASTProgram,
  HSPlusCompileResult,
} from './types/AdvancedTypeSystem';

import type { HSPlusNode } from './types/HoloScriptPlus';

export type { HSPlusDirective, HSPlusAST, ASTProgram, HSPlusCompileResult, HSPlusNode };

export type { TraitBehavior } from './types/index';

// ============================================================================
// Spatial Types
// ============================================================================

export interface SpatialPosition {
  x: number;
  y: number;
  z: number;
}

export interface Position2D {
  x: number;
  y: number;
}

export interface Size2D {
  width: number;
  height: number;
}

// ============================================================================
// Hologram Types
// ============================================================================

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
// Input Types
// ============================================================================

export interface VoiceCommand {
  command: string;
  confidence: number;
  timestamp: number;
  spatialContext?: SpatialPosition;
}

export type GestureType = 'pinch' | 'swipe' | 'rotate' | 'grab' | 'release';
export type HandType = 'left' | 'right';

export interface GestureData {
  type: GestureType;
  position: SpatialPosition;
  direction?: SpatialPosition;
  magnitude: number;
  hand: HandType;
}

export interface Animation {
  target: string;
  property: string;
  from: number;
  to: number;
  duration: number;
  startTime: number;
  easing: string;
  loop?: boolean;
  yoyo?: boolean;
}

// ============================================================================
// AST Node Types
// ============================================================================

export type HoloScriptValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | HoloScriptValue[]
  | { [key: string]: any }
  // We can include ASTNode if values can be nodes (e.g. templates)
  | ASTNode
  | SpreadExpression
  | NullCoalescingAssignment
  | MatchExpression
  | Function
  | SpatialPosition
  | HologramProperties
  | Animation;

// Forward declaration for circular reference
export interface MatchExpression extends ASTNode {
  type: 'match';
  subject: string | HoloScriptValue;
  cases: MatchCase[];
  hasWildcard?: boolean;
  sourceLocation?: { line: number; column: number };
}

export interface MatchCase extends ASTNode {
  type: 'match-case';
  pattern: MatchPattern;
  body: ASTNode[] | HoloScriptValue;
  guard?: string;
}

export type MatchPattern = LiteralPattern | WildcardPattern | BindingPattern | DestructuringPattern;

export interface LiteralPattern {
  type: 'literal-pattern';
  value: string | number | boolean;
}

export interface WildcardPattern {
  type: 'wildcard-pattern';
  symbol: '_';
}

export interface BindingPattern {
  type: 'binding-pattern';
  name: string;
}

export interface DestructuringPattern {
  type: 'destructuring-pattern';
  kind: 'object' | 'array';
  properties: Array<{ key: string; pattern: MatchPattern }>;
}

export interface ASTNode {
  type: string;
  id?: string;
  position?: SpatialPosition;
  hologram?: HologramProperties;
  /** Source line number (1-indexed) */
  line?: number;
  /** Source column number (0-indexed) */
  column?: number;
  /** HS+ Directives */
  directives?: HSPlusDirective[];
  /** HS+ Traits (Pre-processed map) */
  traits?: Map<VRTraitName, any>;
}

// ============================================================================
// HS+ Directive Types
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
  | 'networked'
  // Environment Understanding
  | 'plane_detection'
  | 'mesh_detection'
  | 'anchor'
  | 'persistent_anchor'
  | 'shared_anchor'
  | 'geospatial'
  | 'occlusion'
  | 'light_estimation'
  // Input Modalities
  | 'eye_tracking'
  | 'hand_tracking'
  | 'controller'
  | 'spatial_accessory'
  | 'body_tracking'
  | 'face_tracking'
  // Accessibility
  | 'accessible'
  | 'alt_text'
  | 'spatial_audio_cue'
  | 'sonification'
  | 'haptic_cue'
  | 'magnifiable'
  | 'high_contrast'
  | 'motion_reduced'
  | 'subtitle'
  | 'screen_reader'
  // Gaussian Splatting & Volumetric
  | 'point_cloud'
  | 'photogrammetry'
  // WebGPU Compute
  | 'compute'
  | 'gpu_particle'
  | 'gpu_physics'
  | 'gpu_buffer'
  // Digital Twin & IoT
  | 'sensor'
  | 'digital_twin'
  | 'data_binding'
  | 'alert'
  | 'heatmap_3d'
  // Autonomous Agents
  | 'behavior_tree'
  | 'goal_oriented'
  | 'llm_agent'
  | 'memory'
  | 'perception'
  | 'emotion'
  | 'dialogue'
  | 'faction'
  | 'patrol'
  // Advanced Spatial Audio
  | 'ambisonics'
  | 'hrtf'
  | 'reverb_zone'
  | 'audio_occlusion'
  | 'audio_portal'
  | 'audio_material'
  | 'head_tracked_audio'
  // OpenUSD & Interoperability
  | 'usd'
  | 'gltf'
  | 'fbx'
  | 'material_x'
  | 'scene_graph'
  // Co-Presence & Shared Experiences
  | 'mitosis'
  | 'logic'
  | 'co_located'
  | 'remote_presence'
  | 'shared_world'
  | 'voice_proximity'
  | 'avatar_embodiment'
  | 'spectator'
  | 'role'
  // Geospatial & AR Cloud
  | 'geospatial_anchor'
  | 'terrain_anchor'
  | 'rooftop_anchor'
  | 'vps'
  | 'poi'
  // Web3 & Ownership
  | 'nft'
  | 'token_gated'
  | 'wallet'
  | 'marketplace'
  | 'portable'
  // Physics Expansion
  | 'cloth'
  | 'fluid'
  | 'soft_body'
  | 'rope'
  | 'chain'
  | 'wind'
  | 'buoyancy'
  | 'destruction'
  | 'zk_private'
  | 'roadmap_node'
  | 'proactive';

export { VRHand } from './types/HoloScriptPlus';

export interface TraitConstraint {
  type: 'requires' | 'conflicts' | 'oneof';
  source: string; // Trait being constrained
  targets: string[]; // Related traits
  message?: string; // Custom error message
  suggestion?: string; // Fix suggestion shown in IDE
}

// ---------------------------------------------------------------------------
// Type Alias
// ---------------------------------------------------------------------------

export type TypeAliasKind = 'simple' | 'union' | 'generic';

export interface TypeAliasDeclaration {
  name: string;
  kind: TypeAliasKind;
  /** Expanded type string (e.g. "string | number") */
  definition: string;
  /** Generic type parameters, e.g. ["T"] for List<T> */
  typeParams?: string[];
  line?: number;
}

export type LifecycleHook = 'on_mount' | 'on_unmount' | 'on_update' | 'on_data_update';

export type VRLifecycleHook =
  | 'on_grab'
  | 'on_release'
  | 'on_hover_enter'
  | 'on_hover_exit'
  | 'on_point_enter'
  | 'on_point_exit'
  | 'on_collision'
  | 'on_trigger_enter'
  | 'on_trigger_exit'
  | 'on_click'
  | 'on_double_click';

export type ControllerHook =
  | 'on_controller_button'
  | 'on_trigger_hold'
  | 'on_trigger_release'
  | 'on_grip_hold'
  | 'on_grip_release';

export type EnvironmentHook =
  | 'on_plane_detected'
  | 'on_plane_lost'
  | 'on_plane_updated'
  | 'on_mesh_detected'
  | 'on_mesh_updated'
  | 'on_anchor_created'
  | 'on_anchor_resolved'
  | 'on_anchor_lost'
  | 'on_anchor_shared'
  | 'on_light_estimated'
  | 'on_occlusion_updated';

export type InputModalityHook =
  | 'on_gaze_enter'
  | 'on_gaze_exit'
  | 'on_gaze_dwell'
  | 'on_hand_gesture'
  | 'on_hand_pinch'
  | 'on_hand_lost'
  | 'on_body_pose_update'
  | 'on_face_expression'
  | 'on_controller_vibrate'
  | 'on_accessory_input';

export type AccessibilityHook =
  | 'on_accessibility_announce'
  | 'on_subtitle_display'
  | 'on_magnify'
  | 'on_contrast_change'
  | 'on_motion_reduce'
  | 'on_screen_reader_focus'
  | 'on_sonification_update';

export type VolumetricHook =
  | 'on_splat_loaded'
  | 'on_nerf_ready'
  | 'on_volume_frame'
  | 'on_point_cloud_loaded'
  | 'on_capture_complete';

export type ComputeHook = 'on_compute_complete' | 'on_buffer_ready' | 'on_gpu_error';

export type DigitalTwinHook =
  | 'on_sensor_update'
  | 'on_data_change'
  | 'on_alert_triggered'
  | 'on_twin_sync'
  | 'on_heatmap_update';

export type AgentHook =
  | 'on_goal_completed'
  | 'on_goal_failed'
  | 'on_perception_change'
  | 'on_emotion_shift'
  | 'on_faction_change'
  | 'on_patrol_waypoint'
  | 'on_llm_response'
  | 'on_memory_recalled'
  | 'on_dialogue_start'
  | 'on_dialogue_end';

export type SpatialAudioHook =
  | 'on_reverb_enter'
  | 'on_reverb_exit'
  | 'on_audio_occluded'
  | 'on_audio_portal_enter';

export type InteropHook = 'on_asset_loaded' | 'on_format_converted' | 'on_scene_composed';

export type CoPresenceHook =
  | 'on_co_presence_joined'
  | 'on_co_presence_left'
  | 'on_voice_proximity_change'
  | 'on_role_change'
  | 'on_spectator_join'
  | 'on_avatar_sync';

export type GeospatialHook =
  | 'on_vps_localized'
  | 'on_poi_proximity'
  | 'on_terrain_resolved'
  | 'on_rooftop_resolved';

export type Web3Hook =
  | 'on_wallet_connected'
  | 'on_token_verified'
  | 'on_nft_transferred'
  | 'on_purchase_complete'
  | 'on_asset_ported';

export type PhysicsExpansionHook =
  | 'on_cloth_tear'
  | 'on_fluid_splash'
  | 'on_soft_body_deform'
  | 'on_rope_snap'
  | 'on_wind_change'
  | 'on_submerge'
  | 'on_destruction_complete';

export type AllExpandedHooks =
  | LifecycleHook
  | VRLifecycleHook
  | ControllerHook
  | EnvironmentHook
  | InputModalityHook
  | AccessibilityHook
  | VolumetricHook
  | ComputeHook
  | DigitalTwinHook
  | AgentHook
  | SpatialAudioHook
  | InteropHook
  | CoPresenceHook
  | GeospatialHook
  | Web3Hook
  | PhysicsExpansionHook;

// HS+ Directive and AST types are now imported from AdvancedTypeSystem

export interface OrbNode extends ASTNode {
  type: 'orb';
  name: string;
  properties: Record<string, HoloScriptValue>;
  methods?: MethodNode[];
  children?: ASTNode[];
}

export interface MethodNode extends ASTNode {
  type: 'method';
  name: string;
  parameters: ParameterNode[];
  body: ASTNode[];
  returnType?: string;
}

export interface ParameterNode extends ASTNode {
  type: 'parameter';
  name: string;
  dataType: string;
  defaultValue?: HoloScriptValue;
}

export interface ConnectionNode extends ASTNode {
  type: 'connection';
  from: string;
  to: string;
  dataType: string;
  bidirectional: boolean;
}

export interface GateNode extends ASTNode {
  type: 'gate';
  condition: string | TypeGuardExpression;
  truePath: ASTNode[];
  falsePath: ASTNode[];
}

export interface StreamNode extends ASTNode {
  type: 'stream';
  name: string;
  source: string;
  transformations: TransformationNode[];
}

export interface TransformationNode extends ASTNode {
  type: 'transformation';
  operation: string;
  parameters: Record<string, HoloScriptValue>;
}

export interface GenericASTNode extends ASTNode {
  [key: string]: HoloScriptValue | unknown; // keeping unknown for flexibility but preferring HoloScriptValue
}

export interface ServerNode extends ASTNode {
  type: 'server';
  port: number;
  routes: string[];
}

export interface DatabaseNode extends ASTNode {
  type: 'database';
  query: string;
}

export interface FetchNode extends ASTNode {
  type: 'fetch';
  url: string;
  method: string;
}

export interface ExecuteNode extends ASTNode {
  type: 'execute';
  target: string;
}

export interface DebugNode extends ASTNode {
  type: 'debug';
  target: string;
}

export interface VisualizeNode extends ASTNode {
  type: 'visualize';
  target: string;
}

export interface ZoneNode extends ASTNode {
  type: 'zone';
  name: string;
  id?: string;
  position?: SpatialPosition;
  bounds?: { type: string; size: HoloScriptValue }; // box, sphere
  events: Record<string, string>; // on_enter, on_exit -> code
  properties: Record<string, HoloScriptValue>;
}

// ============================================================================
// Phase 2: Loop Types
// ============================================================================

export interface ForLoopNode extends ASTNode {
  type: 'for-loop';
  init: string;
  condition: string | TypeGuardExpression;
  update: string;
  body: ASTNode[];
}

export interface WhileLoopNode extends ASTNode {
  type: 'while-loop';
  condition: string | TypeGuardExpression;
  body: ASTNode[];
}

export interface ForEachLoopNode extends ASTNode {
  type: 'foreach-loop';
  variable: string;
  collection: string;
  body: ASTNode[];
}

// ============================================================================
// Universe Scale & Spatial Context Types
// ============================================================================

export interface ScaleNode extends ASTNode {
  type: 'scale';
  magnitude: string; // 'galactic', 'macro', 'standard', 'micro', 'atomic'
  multiplier: number;
  body: ASTNode[];
}

export interface FocusNode extends ASTNode {
  type: 'focus';
  target: string;
  body: ASTNode[];
}

// ============================================================================
// Composition & Environment Types
// ============================================================================

export interface CompositionNode extends ASTNode {
  type: 'composition';
  name: string;
  children: ASTNode[];
  body?: {
    systems: ASTNode[];
    configs: ASTNode[];
    children: ASTNode[];
  };
}

export interface SystemNode extends ASTNode {
  type: 'system';
  id: string;
  properties: Record<string, HoloScriptValue>;
  /** System state declarations */
  state?: Record<string, HoloScriptValue>;
  /** Named actions that can be invoked */
  actions?: Array<{
    name: string;
    params: string[];
    body: string;
  }>;
  /** Lifecycle hooks: on_start, on_update, on_destroy, etc. */
  hooks?: Array<{
    name: string;
    body: string;
  }>;
  /** Nested UI block declarations */
  ui?: ASTNode[];
  /** Nested children (objects, templates, etc.) */
  children?: ASTNode[];
  /** Trait directives on the system */
  directives?: HSPlusDirective[];
}

export interface ComponentNode extends ASTNode {
  type: 'component';
  name: string;
  /** Component props declarations (with defaults) */
  props?: Record<string, HoloScriptValue>;
  /** Component internal state */
  state?: Record<string, HoloScriptValue>;
  /** Named actions */
  actions?: Array<{
    name: string;
    params: string[];
    body: string;
  }>;
  /** UI block for rendering */
  ui?: ASTNode[];
  /** Lifecycle hooks */
  hooks?: Array<{
    name: string;
    body: string;
  }>;
  /** Nested children */
  children?: ASTNode[];
  /** Trait directives */
  directives?: HSPlusDirective[];
  /** Component properties (non-special) */
  properties?: Record<string, HoloScriptValue>;
}

export interface CoreConfigNode extends ASTNode {
  type: 'core_config';
  properties: Record<string, HoloScriptValue>;
}

export interface EnvironmentNode extends ASTNode {
  type: 'environment';
  settings: Record<string, HoloScriptValue>;
}

export interface TemplateNode extends ASTNode {
  type: 'template';
  name: string;
  parameters: string[];
  children: ASTNode[];
  properties?: Record<string, HoloScriptValue>;
  directives?: HSPlusDirective[];
  version?: string | number;
  migrations?: MigrationNode[];
}

export interface MigrationNode extends ASTNode {
  type: 'migration';
  fromVersion: number;
  body: string; // Captured source code for runtime execution
}

// ============================================================================
// Narrative & Metadata Types
// ============================================================================

export interface NarrativeNode extends ASTNode {
  type: 'narrative';
  id: string;
  startNode?: string;
  quests: QuestNode[];
  dialogueNodes?: DialogueNode[];
}

export interface QuestNode extends ASTNode {
  type: 'quest';
  id: string;
  title: string;
  description: string;
  objectives: ObjectiveNode[];
  onComplete?: string;
}

export interface ObjectiveNode extends ASTNode {
  type: 'objective';
  id: string;
  description: string;
  targetCount?: number;
  currentCount?: number;
}

export interface DialogueNode extends ASTNode {
  type: 'dialogue';
  id: string;
  speaker: string;
  text: string;
  choices?: DialogueChoice[];
}

export interface DialogueChoice extends ASTNode {
  type: 'dialogue-choice';
  text: string;
  nextNode?: string;
  action?: string;
}

export interface VisualMetadataNode extends ASTNode {
  type: 'visual_metadata';
  properties: Record<string, HoloScriptValue>;
}

export interface GlobalHandlerNode extends ASTNode {
  type: 'global_handler';
  handlerType: 'every' | 'on_gesture';
  config: Record<string, HoloScriptValue>;
  action: string;
}

// ============================================================================
// Phase 2: Module Types
// ============================================================================

export interface ImportNode extends ASTNode {
  type: 'import';
  imports: string[];
  defaultImport?: string;
  modulePath: string;
}

export type ImportLoader = (path: string) => Promise<string>;

export interface ExportNode extends ASTNode {
  type: 'export';
  exports?: string[];
  declaration?: ASTNode;
}

// ============================================================================
// Phase 2: Variable Declaration Types
// ============================================================================

export interface VariableDeclarationNode extends ASTNode {
  type: 'variable-declaration';
  kind: 'const' | 'let' | 'var';
  name: string;
  dataType?: string;
  value?: HoloScriptValue;
  isExpression?: boolean;
}

// ============================================================================
// Type Guard Expression (is keyword)
// ============================================================================

export interface TypeGuardExpression extends ASTNode {
  type: 'type-guard';
  /** The value being checked */
  subject: string;
  /** The type being tested against */
  guardType: string;
  /** Whether this is a negated check (is not) */
  negated?: boolean;
}

// ============================================================================
// Spread Expression (...)
// ============================================================================
// Supports spreading objects, arrays, and template properties
// Example: { ...Base, override: value }, [...array, ...other]

export interface SpreadExpression extends ASTNode {
  type: 'spread';
  argument: unknown; // The identifier, reference, or expression being spread
  target?: string; // Alternative: direct target name for backward compatibility
  // Validation fields (populated during type checking)
  isValid?: boolean;
  targetType?: 'object' | 'array' | 'template' | 'unknown';
}

// ============================================================================
// Null Coalescing Assignment (??=)
// ============================================================================
// Short-circuit assignment if left side is null/undefined
// Example: x ??= defaultValue  →  x = x ?? defaultValue
// Only assigns if x is null or undefined

export interface NullCoalescingAssignment extends ASTNode {
  type: 'nullCoalescingAssignment';
  target: string | unknown; // Identifier or member expression being assigned
  value: unknown; // Right-hand side expression
  isValid?: boolean;
  targetType?: 'variable' | 'member' | 'unknown';
}

// ============================================================================
// Phase 13: State Machine Types
// ============================================================================

export interface StateMachineNode extends ASTNode {
  type: 'state-machine';
  name: string;
  initialState: string;
  states: StateNode[];
  transitions: TransitionNode[];
}

export interface StateNode extends ASTNode {
  type: 'state';
  name: string;
  onEntry?: string; // Code block
  onExit?: string; // Code block
}

export interface TransitionNode extends ASTNode {
  type: 'transition';
  from: string;
  to: string;
  event: string;
  condition?: string; // Optional expression
}

// ============================================================================
// 2D UI Types
// ============================================================================

export type UIElementType =
  | 'canvas'
  | 'button'
  | 'textinput'
  | 'panel'
  | 'text'
  | 'image'
  | 'list'
  | 'modal'
  | 'slider'
  | 'toggle'
  | 'dropdown'
  | 'flex-container'
  | 'grid-container'
  | 'scroll-view'
  | 'tab-view'
  | 'dashboard'
  | 'card'
  | 'metric'
  | 'row'
  | 'col';

export interface UI2DNode {
  type: '2d-element';
  elementType: UIElementType;
  name: string;
  properties: Record<string, HoloScriptValue>;
  children?: UI2DNode[];
  events?: Record<string, string>;
}

export interface UIStyle {
  backgroundColor?: string;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  padding?: number;
  margin?: number;
}

// ============================================================================
// Built-in API Types (storage, device, input)
// ============================================================================

/** Built-in storage API for persistent key/value data */
export interface StorageAPI {
  get(key: string): HoloScriptValue;
  set(key: string, value: HoloScriptValue): void;
  remove(key: string): void;
  has(key: string): boolean;
  clear(): void;
}

/** Built-in device API for platform detection and preferences */
export interface DeviceAPI {
  isMobile: boolean;
  isVR: boolean;
  isAR: boolean;
  isDesktop: boolean;
  prefersReducedMotion(): boolean;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  hasTouch: boolean;
  hasGamepad: boolean;
}

/** Built-in input API for handling user input */
export interface InputAPI {
  setMovement(x: number, y: number): void;
  jump(): void;
  interact(): void;
}

// ============================================================================
// Runtime Types
// ============================================================================

export interface RuntimeContext {
  variables: Map<string, HoloScriptValue>;
  functions: Map<string, MethodNode>;
  exports: Map<string, HoloScriptValue>;
  connections: ConnectionNode[];
  spatialMemory: Map<string, SpatialPosition>;
  hologramState: Map<string, HologramProperties>;
  executionStack: ASTNode[];
  stateMachines: Map<string, StateMachineNode>;
  mode?: 'public' | 'secure';

  // Scaling & Context
  currentScale: number;
  scaleMagnitude: string;
  focusHistory: string[];

  // Composition & Environment
  environment: Record<string, HoloScriptValue>;
  templates: Map<string, TemplateNode>;

  // Narrative & Story State
  quests: Map<string, QuestNode>;
  activeQuestId?: string;
  completedQuests: Set<string>;
  dialogueState?: {
    currentNodeId?: string;
    speaker?: string;
  };

  // HS+ State
  state: ReactiveState;
}

export interface QuestState {
  id: string;
  objectives: Record<string, { current: number; target: number; complete: boolean }>;
  status: 'active' | 'completed' | 'failed';
}

export interface ReactiveState {
  get(key: string): HoloScriptValue;
  set(key: string, value: HoloScriptValue): void;
  subscribe(callback: (state: Record<string, HoloScriptValue>) => void): () => void;
  getSnapshot(): Record<string, HoloScriptValue>;
  update(updates: Record<string, HoloScriptValue>): void;
}

export interface ExecutionResult {
  success: boolean;
  output?: HoloScriptValue;
  hologram?: HologramProperties;
  spatialPosition?: SpatialPosition;
  error?: string;
  executionTime?: number;
  learningSignals?: Record<string, HoloScriptValue>;
}

export interface ParticleSystem {
  particles: SpatialPosition[];
  color: string;
  lifetime: number;
  speed: number;
}

// ============================================================================
// Security Config Types
// ============================================================================

export interface SecurityConfig {
  maxCommandLength: number;
  maxTokens: number;
  maxHologramsPerUser: number;
  suspiciousKeywords: string[];
  allowedShapes: string[];
  allowedUIElements: string[];
}

export interface RuntimeSecurityLimits {
  maxExecutionDepth: number;
  maxTotalNodes: number;
  maxExecutionTimeMs: number;
  maxParticlesPerSystem: number;
}
// ============================================================================
// VR Types
// ============================================================================

export interface SpatialVector3 {
  x: number;
  y: number;
  z: number;
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export interface Duration {
  milliseconds: number;
}

export interface ASTTransform {
  position: SpatialVector3;
  rotation: SpatialVector3;
  scale: SpatialVector3;
}

export type VRHandSide = 'left' | 'right' | 'both';

export interface ThrowVelocity {
  magnitude: number;
  direction: SpatialVector3;
  spin?: SpatialVector3;
}

export interface CollisionEvent {
  object1: string;
  object2: string;
  position: SpatialVector3;
  normal: SpatialVector3;
  force: number;
  timestamp: number;
}

// ============================================================================
// VR Traits
// ============================================================================

export interface GrabbableTrait {
  snapToHand: boolean;
  grip_type: 'palm' | 'pinch' | 'full';
  haptic_feedback: boolean;
}

export interface ThrowableTrait {
  velocityMultiplier: number;
  enableSpin: boolean;
  gravityScale: number;
}

export interface PointableTrait {
  maxPointDistance: number;
  interactionRadius: number;
  hapticFeedback: boolean;
}

export interface HoverableTrait {
  hoverDistance: number;
  hoverColor: Color;
  hoverScale: number;
  enableHighlight: boolean;
}

export interface ScalableTrait {
  minScale: number;
  maxScale: number;
  scaleSpeed: number;
}

export interface RotatableTrait {
  rotationSpeed: number;
  freeRotation: boolean;
  snapAngles?: number[];
}

// ============================================================================
// Re-export all HoloScript+ types including new researcher/viralist traits
// ============================================================================
export type {
  // Core additional traits
  StackableTrait,
  SnappableTrait,
  BreakableTrait,
  StretchableTrait,
  MoldableTrait,

  // Humanoid/Avatar Traits
  SkeletonTrait,
  BodyTrait,
  FaceTrait,
  ExpressiveTrait,
  HairTrait,
  ClothingTrait,
  HandsTrait,
  CharacterVoiceTrait,
  LocomotionTrait,
  PoseableTrait,
  MorphTrait,
  NetworkedTrait,
  ProactiveTrait,

  // Media Production Traits
  RecordableTrait,
  StreamableTrait,
  CameraTrait,
  VideoTrait,

  // Analytics & Research Traits
  TrackableTrait,
  SurveyTrait,
  ABTestTrait,
  HeatmapTrait,

  // Social & Viral Traits
  ShareableTrait,
  EmbeddableTrait,
  QRTrait,
  CollaborativeTrait,

  // Effects Traits
  ParticleTrait,
  TransitionTrait,
  FilterTrait,
  TrailTrait,

  // Audio Traits
  SpatialAudioTrait,
  VoiceTrait,
  ReactiveAudioTrait,

  // AI & Generative Traits
  NarratorTrait,
  ResponsiveTrait,
  ProceduralTrait,
  CaptionedTrait,

  // Timeline & Choreography Traits
  TimelineTrait,
  ChoreographyTrait,

  // Environment Understanding Traits
  PlaneDetectionTrait,
  MeshDetectionTrait,
  AnchorTrait,
  PersistentAnchorTrait,
  SharedAnchorTrait,
  GeospatialTrait,
  OcclusionTrait,
  LightEstimationTrait,

  // Input Modality Traits
  EyeTrackingTrait,
  HandTrackingTrait,
  ControllerTrait,
  SpatialAccessoryTrait,
  BodyTrackingTrait,
  FaceTrackingTrait,
  HapticTrait,

  // Accessibility Traits
  AccessibleTrait,
  AltTextTrait,
  SpatialAudioCueTrait,
  SonificationTrait,
  HapticCueTrait,
  MagnifiableTrait,
  HighContrastTrait,
  MotionReducedTrait,
  SubtitleTrait,
  ScreenReaderTrait,

  // Gaussian Splatting & Volumetric Content Traits
  GaussianSplatTrait,
  NerfTrait,
  VolumetricVideoTrait,
  PointCloudTrait,
  PhotogrammetryTrait,

  // WebGPU Compute Traits
  ComputeTrait,
  GPUParticleTrait,
  GPUPhysicsTrait,
  GPUBufferTrait,

  // Digital Twin & IoT Traits
  SensorTrait,
  DigitalTwinTrait,
  DataBindingTrait,
  AlertTrait,
  Heatmap3DTrait,

  // Autonomous Agent Traits
  BehaviorTreeTrait,
  GoalOrientedTrait,
  LLMAgentTrait,
  MemoryTrait,
  PerceptionTrait,
  EmotionTrait,
  DialogueTrait,
  FactionTrait,
  PatrolTrait,

  // Advanced Spatial Audio Traits
  AmbisonicsTrait,
  HRTFTrait,
  ReverbZoneTrait,
  AudioOcclusionTrait,
  AudioPortalTrait,
  AudioMaterialTrait,
  HeadTrackedAudioTrait,

  // OpenUSD & Interoperability Traits
  USDTrait,
  GLTFTrait,
  FBXTrait,
  MaterialXTrait,
  SceneGraphTrait,

  // Co-Presence & Shared Experience Traits
  CoLocatedTrait,
  RemotePresenceTrait,
  SharedWorldTrait,
  VoiceProximityTrait,
  AvatarEmbodimentTrait,
  SpectatorTrait,
  RoleTrait,

  // Geospatial & AR Cloud Traits
  GeospatialAnchorTrait,
  TerrainAnchorTrait,
  RooftopAnchorTrait,
  VPSTrait,
  POITrait,

  // Web3 & Ownership Traits
  NFTTrait,
  TokenGatedTrait,
  WalletTrait,
  MarketplaceTrait,
  PortableTrait,

  // Physics Expansion Traits
  ClothTrait,
  FluidTrait,
  SoftBodyTrait,
  RopeTrait,
  ChainTrait,
  WindTrait,
  BuoyancyTrait,
  DestructionTrait,

  // Lifecycle Hooks
  AllLifecycleHooks,
  MediaLifecycleHook,
  AnalyticsLifecycleHook,
  SocialLifecycleHook,
  EffectsLifecycleHook,
  AudioLifecycleHook,
  AILifecycleHook,
  TimelineLifecycleHook,

  // Expanded Lifecycle Hooks
  EnvironmentLifecycleHook,
  InputModalityLifecycleHook,
  AccessibilityLifecycleHook,
  VolumetricLifecycleHook,
  ComputeLifecycleHook,
  DigitalTwinLifecycleHook,
  AgentLifecycleHook,
  SpatialAudioLifecycleHook,
  InteropLifecycleHook,
  CoPresenceLifecycleHook,
  GeospatialLifecycleHook,
  Web3LifecycleHook,
  PhysicsExpansionLifecycleHook,

  // Builtin Types
  RecordingClip,
  ShareContent,
  ShareResult,
  ParticleConfig,
  Vector3,
  Transform,
  Vector3Tuple,
} from './types/HoloScriptPlus';
export interface AnyTraitAnnotation {
  type: string;
  config: any;
  line?: number;
  column?: number;
}

export interface EnhancedOrbNode extends OrbNode {
  graphics?: any;
  traits?: any;
  eventHandlers?: Map<string, string>;
  isCompanion?: boolean;
}
