/**
 * HoloScript+ Type Definitions
 * Trait interfaces and lifecycle hooks for the HoloScript spatial computing language
 */

// ============================================================================
// Core Types
// ============================================================================

export type Vector3 = {
  x?: number;
  y?: number;
  z?: number;
  0?: number;
  1?: number;
  2?: number;
  [key: string]: unknown;
};

export interface Color {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export type Vector3Tuple = [number, number, number];

export interface Transform {
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
}

export type Quaternion = {
  x: number;
  y: number;
  z: number;
  w: number;
};

export interface VRHand {
  id: string;
  position: Vector3;
  rotation: Vector3;
  velocity: Vector3;
  pinch?: number;
  /** Normalized pinch strength 0-1 — alias for pinch */
  pinchStrength?: number;
  grip: number;
  /** Normalized grip strength 0-1 — alias for grip */
  gripStrength?: number;
  trigger: number;
  pointing?: boolean;
}

export interface HSPlusRuntime {
  mount(container: unknown): void;
  unmount(): void;
  update(delta: number): void;
  on(event: string, handler: (payload: unknown) => void): () => void;
  emit(event: string, payload?: unknown): void;
  getHologramStates(): Map<string, unknown>;
  setState(updates: Record<string, unknown>): void;
  // State access
  getState(): Record<string, unknown>;
  // Methods from AdvancedTypeSystem's version
  execute?(ast: unknown): unknown;
  callMethod?(name: string, args: unknown[]): unknown;
  destroy?(): void;
  state?: unknown; // Reconciled for ReactiveState implementations
  props?: Record<string, unknown>;
  refs?: Record<string, unknown>;
}

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

import type { VRTraitName, ASTNode } from './base';
import type { HSPlusDirective } from './AdvancedTypeSystem';

export interface HSPlusNode extends ASTNode {
  name?: string;
  children?: HSPlusNode[];
  properties?: Record<string, unknown>;
  directives?: HSPlusDirective[];
  args?: unknown;
  body?: unknown;
  /** Scene-graph rotation set by spatial traits at runtime (euler or quaternion). */
  rotation?: { x: number; y: number; z: number; w?: number };
  /** Scene-graph scale set by spatial traits at runtime. */
  scale?: { x: number; y: number; z: number };
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

export interface HSPlusAST {
  type: 'Program';
  body: HSPlusNode[];
  root: HSPlusNode;
  version?: string | number;
  migrations?: Array<{ type: string; fromVersion: number; body: string }>;
  imports?: Array<{
    source: string;
    specifiers: string[];
    path?: string;
    alias?: string;
  }>;
}

// Type aliases for statement and expression nodes
export type HSPlusStatement = HSPlusNode;
export type HSPlusExpression = HSPlusNode;

export interface StateDeclaration {
  name: string;
  type: string | unknown;
  initial?: unknown;
  reactive?: boolean;
  [key: string]: unknown;
}

/**
 * Primitive type system for HoloScript+.
 * Used by the TypeInferencePass to annotate AST nodes.
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

export interface ReactiveState<T = unknown> {
  get<K extends keyof T>(key: K): T[K];
  set<K extends keyof T>(key: K, value: T[K]): void;
  subscribe(callback: (state: T, changedKey?: keyof T) => void): () => void;
  update(updates: Partial<T>): void;
  getSnapshot(): T;
  undo?(): void;
  redo?(): void;
}

export interface ThrowVelocity {
  linear: Vector3;
  angular: Vector3;
}

export interface CollisionEvent {
  nodeId: string;
  otherId: string;
  relativeVelocity: Vector3;
  contactPoint?: Vector3;
  point?: Vector3;
  normal?: Vector3;
  target?: string;
  force?: number;
}

// ============================================================================
// Base Trait Interface
// ============================================================================

export interface BaseTrait {
  enabled?: boolean;
}

export interface GrabbableTrait extends BaseTrait {
  snap_to_hand?: boolean;
  two_handed?: boolean;
  haptic_on_grab?: number;
  grab_points?: Vector3[];
  preserve_rotation?: boolean;
  distance_grab?: boolean;
  max_grab_distance?: number;
}

export interface ThrowableTrait extends BaseTrait {
  velocity_multiplier?: number;
  gravity?: boolean;
  max_velocity?: number;
  spin?: boolean;
  bounce?: boolean;
  bounce_factor?: number;
}

export interface StretchableTrait extends BaseTrait {
  minStretch?: number;
  maxStretch?: number;
}

export interface MoldableTrait extends BaseTrait {
  moldResolution?: number;
}

// ============================================================================
// Humanoid/Avatar Traits
// ============================================================================

export interface SkeletonTrait extends BaseTrait {
  bones?: string[];
}

export interface BodyTrait extends BaseTrait {
  height?: number;
  proportions?: Record<string, number>;
}

export interface FaceTrait extends BaseTrait {
  blendShapes?: string[];
}

export interface ExpressiveTrait extends BaseTrait {
  expressions?: string[];
}

export interface HairTrait extends BaseTrait {
  style?: string;
  physics?: boolean;
}

export interface ClothingTrait extends BaseTrait {
  layers?: string[];
}

export interface HandsTrait extends BaseTrait {
  fingerTracking?: boolean;
}

export interface CharacterVoiceTrait extends BaseTrait {
  voiceId?: string;
}

export interface LocomotionTrait extends BaseTrait {
  speed?: number;
  jumpHeight?: number;
}

export interface PoseableTrait extends BaseTrait {
  poses?: string[];
}

export interface MorphTrait extends BaseTrait {
  targets?: string[];
}

export interface NetworkedTrait extends BaseTrait {
  syncRate?: number;
}

export interface ProactiveTrait extends BaseTrait {
  triggers?: string[];
  intelligence_tier?: 'basic' | 'advanced' | 'quantum';
  observation_range?: number;
  learning_rate?: number;
  auto_suggest?: boolean;
  context_window?: number;
}

// ============================================================================
// Media Production Traits
// ============================================================================

export interface RecordableTrait extends BaseTrait {
  format?: string;
  quality?: number;
}

export interface StreamableTrait extends BaseTrait {
  streamUrl?: string;
}

export interface CameraTrait extends BaseTrait {
  fov?: number;
  near?: number;
  far?: number;
}

export interface HoverableTrait extends BaseTrait {
  highlight_color?: string;
  scale_on_hover?: number;
  show_tooltip?: boolean | string;
  tooltip_offset?: Vector3Tuple;
  glow?: boolean;
  glow_intensity?: number;
}

export interface PointableTrait extends BaseTrait {
  highlight_on_point?: boolean;
  highlight_color?: string;
  cursor_style?: string;
}

export interface RotatableTrait extends BaseTrait {
  axis?: 'x' | 'y' | 'z' | 'all';
  snap_angles?: number[];
  speed?: number;
}

export interface ScalableTrait extends BaseTrait {
  min_scale?: number;
  max_scale?: number;
  uniform?: boolean;
  pivot?: Vector3Tuple;
}

export interface StackableTrait extends BaseTrait {
  stack_axis?: 'x' | 'y' | 'z';
  stack_offset?: number;
  max_stack?: number;
  snap_distance?: number;
}

export interface SnappableTrait extends BaseTrait {
  snap_points?: Vector3Tuple[];
  snap_distance?: number;
  snap_rotation?: boolean;
  magnetic?: boolean;
}

export interface BreakableTrait extends BaseTrait {
  break_velocity?: number;
  fragments?: number;
  fragment_mesh?: string;
  sound_on_break?: string;
  respawn?: boolean;
  respawn_delay?: string;
}

export interface VideoTrait extends BaseTrait {
  src?: string;
  autoplay?: boolean;
}

export interface RecordingClip {
  id: string;
  duration: number;
  format: string;
}

export interface ShareContent {
  type: string;
  data: unknown;
}

export interface ShareResult {
  success: boolean;
  platform?: string;
}

// ============================================================================
// Analytics & Research Traits
// ============================================================================

export interface TrackableTrait extends BaseTrait {
  trackingId?: string;
}

export interface SurveyTrait extends BaseTrait {
  questions?: unknown[];
}

export interface ABTestTrait extends BaseTrait {
  variants?: string[];
}

export interface HeatmapTrait extends BaseTrait {
  resolution?: number;
}

// ============================================================================
// Social & Viral Traits
// ============================================================================

export interface ShareableTrait extends BaseTrait {
  platforms?: string[];
}

export interface EmbeddableTrait extends BaseTrait {
  embedCode?: string;
}

export interface QRTrait extends BaseTrait {
  data?: string;
}

export interface CollaborativeTrait extends BaseTrait {
  maxUsers?: number;
}

// ============================================================================
// Effects Traits
// ============================================================================

export interface ParticleTrait extends BaseTrait {
  count?: number;
  lifetime?: number;
}

export interface ParticleConfig {
  count: number;
  lifetime: number;
  speed: number;
  size: number;
}

export interface TransitionTrait extends BaseTrait {
  duration?: number;
  easing?: string;
}

export interface FilterTrait extends BaseTrait {
  type?: string;
  intensity?: number;
}

export interface TrailTrait extends BaseTrait {
  length?: number;
  width?: number;
}

// ============================================================================
// Audio Traits
// ============================================================================

export interface SpatialAudioTrait extends BaseTrait {
  rolloff?: number;
  maxDistance?: number;
}

export interface VoiceTrait extends BaseTrait {
  voiceId?: string;
}

export interface ReactiveAudioTrait extends BaseTrait {
  triggers?: string[];
}

// ============================================================================
// AI & Generative Traits
// ============================================================================

export interface NarratorTrait extends BaseTrait {
  script?: string;
}

export interface ResponsiveTrait extends BaseTrait {
  responses?: Record<string, unknown>;
}

export interface ProceduralTrait extends BaseTrait {
  seed?: number;
}

export interface CaptionedTrait extends BaseTrait {
  captions?: string[];
}

// ============================================================================
// Timeline & Choreography Traits
// ============================================================================

export interface TimelineTrait extends BaseTrait {
  duration?: number;
  keyframes?: unknown[];
}

export interface ChoreographyTrait extends BaseTrait {
  sequence?: unknown[];
}

// ============================================================================
// Environment Understanding Traits
// ============================================================================

export interface PlaneDetectionTrait extends BaseTrait {
  planeTypes?: string[];
}

export interface MeshDetectionTrait extends BaseTrait {
  resolution?: number;
}

export interface AnchorTrait extends BaseTrait {
  anchorId?: string;
}

export interface PersistentAnchorTrait extends BaseTrait {
  persistenceKey?: string;
}

export interface SharedAnchorTrait extends BaseTrait {
  shareKey?: string;
}

export interface GeospatialTrait extends BaseTrait {
  latitude?: number;
  longitude?: number;
  altitude?: number;
}

export interface OcclusionTrait extends BaseTrait {
  enabled?: boolean;
}

export interface LightEstimationTrait extends BaseTrait {
  enabled?: boolean;
}

// ============================================================================
// Input Modality Traits
// ============================================================================

export interface EyeTrackingTrait extends BaseTrait {
  enabled?: boolean;
}

export interface HandTrackingTrait extends BaseTrait {
  enabled?: boolean;
}

export interface ControllerTrait extends BaseTrait {
  type?: string;
}

export interface SpatialAccessoryTrait extends BaseTrait {
  accessoryType?: string;
}

export interface BodyTrackingTrait extends BaseTrait {
  enabled?: boolean;
}

export interface FaceTrackingTrait extends BaseTrait {
  enabled?: boolean;
}

export interface HapticTrait extends BaseTrait {
  intensity?: number;
}

// ============================================================================
// Accessibility Traits
// ============================================================================

export interface AccessibleTrait extends BaseTrait {
  label?: string;
  role?: string;
}

export interface AltTextTrait extends BaseTrait {
  text?: string;
}

export interface SpatialAudioCueTrait extends BaseTrait {
  cueType?: string;
}

export interface SonificationTrait extends BaseTrait {
  dataMapping?: Record<string, unknown>;
}

export interface HapticCueTrait extends BaseTrait {
  pattern?: number[];
}

export interface MagnifiableTrait extends BaseTrait {
  maxZoom?: number;
}

export interface HighContrastTrait extends BaseTrait {
  enabled?: boolean;
}

export interface MotionReducedTrait extends BaseTrait {
  enabled?: boolean;
}

export interface SubtitleTrait extends BaseTrait {
  text?: string;
}

export interface ScreenReaderTrait extends BaseTrait {
  enabled?: boolean;
}

// ============================================================================
// Gaussian Splatting & Volumetric Content Traits
// ============================================================================

export interface GaussianSplatTrait extends BaseTrait {
  src?: string;
  opacity?: number;
  pointSize?: number;
  splatCount?: number;
}

export interface NerfTrait extends BaseTrait {
  src?: string;
  quality?: 'high' | 'medium' | 'low';
  resolution?: number;
}

export interface VolumetricVideoTrait extends BaseTrait {
  src?: string;
  autoplay?: boolean;
  loop?: boolean;
}

export interface PointCloudTrait extends BaseTrait {
  pointSize?: number;
}

export interface PhotogrammetryTrait extends BaseTrait {
  quality?: string;
}

// ============================================================================
// WebGPU Compute Traits
// ============================================================================

export interface ComputeTrait extends BaseTrait {
  shader?: string;
}

export interface GPUParticleTrait extends BaseTrait {
  maxParticles?: number;
}

export interface GPUPhysicsTrait extends BaseTrait {
  substeps?: number;
}

export interface GPUBufferTrait extends BaseTrait {
  size?: number;
}

// ============================================================================
// Digital Twin & IoT Traits
// ============================================================================

export interface SensorTrait extends BaseTrait {
  sensorId?: string;
  dataType?: string;
}

export interface DigitalTwinTrait extends BaseTrait {
  twinId?: string;
}

export interface DataBindingTrait extends BaseTrait {
  source?: string;
  binding?: string;
}

export interface AlertTrait extends BaseTrait {
  threshold?: number;
  message?: string;
}

export interface Heatmap3DTrait extends BaseTrait {
  dataSource?: string;
}

// ============================================================================
// Autonomous Agent Traits
// ============================================================================

export interface BehaviorTreeTrait extends BaseTrait {
  tree?: unknown;
}

export interface GoalOrientedTrait extends BaseTrait {
  goals?: string[];
}

export interface LLMAgentTrait extends BaseTrait {
  model?: string;
  systemPrompt?: string;
}

export interface MemoryTrait extends BaseTrait {
  capacity?: number;
}

export interface PerceptionTrait extends BaseTrait {
  range?: number;
}

export interface EmotionTrait extends BaseTrait {
  emotions?: string[];
}

export interface DialogueTrait extends BaseTrait {
  dialogueTree?: unknown;
}

export interface FactionTrait extends BaseTrait {
  faction?: string;
}

export interface PatrolTrait extends BaseTrait {
  waypoints?: Vector3[];
}

// ============================================================================
// Advanced Spatial Audio Traits
// ============================================================================

export interface AmbisonicsTrait extends BaseTrait {
  order?: number;
}

export interface HRTFTrait extends BaseTrait {
  profile?: string;
}

export interface ReverbZoneTrait extends BaseTrait {
  preset?: string;
}

export interface AudioOcclusionTrait extends BaseTrait {
  enabled?: boolean;
}

export interface AudioPortalTrait extends BaseTrait {
  targetRoom?: string;
}

export interface AudioMaterialTrait extends BaseTrait {
  absorption?: number;
}

export interface HeadTrackedAudioTrait extends BaseTrait {
  enabled?: boolean;
}

// ============================================================================
// OpenUSD & Interoperability Traits
// ============================================================================

export interface USDTrait extends BaseTrait {
  src?: string;
}

export interface GLTFTrait extends BaseTrait {
  src?: string;
}

export interface FBXTrait extends BaseTrait {
  src?: string;
}

export interface MaterialXTrait extends BaseTrait {
  material?: string;
}

export interface SceneGraphTrait extends BaseTrait {
  root?: HSPlusNode;
}

// ============================================================================
// Co-Presence & Shared Experience Traits
// ============================================================================

export interface CoLocatedTrait extends BaseTrait {
  anchorId?: string;
}

export interface RemotePresenceTrait extends BaseTrait {
  roomId?: string;
}

export interface SharedWorldTrait extends BaseTrait {
  worldId?: string;
}

export interface VoiceProximityTrait extends BaseTrait {
  range?: number;
}

export interface AvatarEmbodimentTrait extends BaseTrait {
  avatarId?: string;
}

export interface SpectatorTrait extends BaseTrait {
  enabled?: boolean;
}

export interface RoleTrait extends BaseTrait {
  role?: string;
}

// ============================================================================
// Geospatial & AR Cloud Traits
// ============================================================================

export interface GeospatialAnchorTrait extends BaseTrait {
  latitude?: number;
  longitude?: number;
}

export interface TerrainAnchorTrait extends BaseTrait {
  altitude?: number;
}

// ============================================================================
// Creator Economy & Web3 Traits
// ============================================================================

export interface Web3Trait extends BaseTrait {
  contractAddress: string;
  tokenId: string;
  chainId: number; // e.g., 8453 for Base
  tokenType: 'ERC721' | 'ERC1155';
  metadataUrl?: string;
}

export interface TokenGatedTrait extends BaseTrait {
  contractAddress: string;
  minBalance: string;
  chainId: number;
  message?: string; // "You need 1 Base Paint to enter"
}

export interface MintableTrait extends BaseTrait {
  price?: string; // ETH/USDC
  currency?: string;
  maxSupply?: number;
  royaltyBps?: number;
  platform?: 'zora' | 'manifold' | 'custom';
}

export interface RooftopAnchorTrait extends BaseTrait {
  buildingId?: string;
}

export interface VPSTrait extends BaseTrait {
  localizationMode?: string;
}

export interface POITrait extends BaseTrait {
  poiId?: string;
  name?: string;
}

// ============================================================================
// Web3 & Ownership Traits
// ============================================================================

export interface NFTTrait extends BaseTrait {
  contractAddress?: string;
  tokenId?: string;
}

export interface TokenGatedTrait extends BaseTrait {
  requiredTokens?: string[];
}

export interface WalletTrait extends BaseTrait {
  address?: string;
}

export interface MarketplaceTrait extends BaseTrait {
  listingId?: string;
}

export interface PortableTrait extends BaseTrait {
  exportFormats?: string[];
}

export interface ZKPrivateTrait extends BaseTrait {
  predicate?:
    | 'proximity'
    | 'in_region'
    | 'has_attribute'
    | 'is_inside_zone'
    | 'owns_asset'
    | 'has_permission';
  radius?: number;
  bounds?: [number, number, number];
  fallback?: 'hidden' | 'transparent' | 'dummy_model';
  circuit_url?: string;
  // v4.3 additions
  backend?: 'barretenberg' | 'mock';
  timeout_ms?: number;
  cache_circuits?: boolean;
  disclosure_policy?: {
    alwaysDisclose?: string[];
    requireConsent?: string[];
    neverDisclose?: string[];
  };
  wallet_integration?: {
    enabled?: boolean;
    chain?: 'ethereum' | 'polygon' | 'base' | 'arbitrum' | 'optimism';
    verifier_contract?: string;
    auto_submit?: boolean;
  };
}

// ============================================================================
// Physics Expansion Traits
// ============================================================================

export interface ClothTrait extends BaseTrait {
  stiffness?: number;
}

export interface FluidTrait extends BaseTrait {
  viscosity?: number;
}

export interface SoftBodyTrait extends BaseTrait {
  pressure?: number;
}

export interface RopeTrait extends BaseTrait {
  segments?: number;
}

export interface ChainTrait extends BaseTrait {
  links?: number;
}

export interface WindTrait extends BaseTrait {
  direction?: Vector3;
  strength?: number;
}

export interface BuoyancyTrait extends BaseTrait {
  density?: number;
}

export interface DestructionTrait extends BaseTrait {
  fracturePattern?: string;
}

// ============================================================================
// Lifecycle Hooks
// ============================================================================

export interface LifecycleHook {
  onMount?: () => void;
  onUnmount?: () => void;
  onUpdate?: (delta: number) => void;
}

export interface MediaLifecycleHook extends LifecycleHook {
  onRecordStart?: () => void;
  onRecordStop?: () => void;
}

export interface AnalyticsLifecycleHook extends LifecycleHook {
  onTrackEvent?: (event: string, data: unknown) => void;
}

export interface SocialLifecycleHook extends LifecycleHook {
  onShare?: () => void;
}

export interface EffectsLifecycleHook extends LifecycleHook {
  onEffectStart?: () => void;
  onEffectEnd?: () => void;
}

export interface AudioLifecycleHook extends LifecycleHook {
  onAudioStart?: () => void;
  onAudioEnd?: () => void;
}

export interface AILifecycleHook extends LifecycleHook {
  onInference?: (result: unknown) => void;
}

export interface TimelineLifecycleHook extends LifecycleHook {
  onKeyframe?: (time: number) => void;
}

export interface EnvironmentLifecycleHook extends LifecycleHook {
  onPlaneDetected?: (plane: unknown) => void;
}

export interface InputModalityLifecycleHook extends LifecycleHook {
  onInputChange?: (modality: string) => void;
}

export interface AccessibilityLifecycleHook extends LifecycleHook {
  onAccessibilityChange?: (settings: unknown) => void;
}

export interface VolumetricLifecycleHook extends LifecycleHook {
  onVolumeLoad?: () => void;
}

export interface ComputeLifecycleHook extends LifecycleHook {
  onComputeComplete?: (result: unknown) => void;
}

export interface DigitalTwinLifecycleHook extends LifecycleHook {
  onDataUpdate?: (data: unknown) => void;
}

export interface AgentLifecycleHook extends LifecycleHook {
  onGoalComplete?: (goal: string) => void;
}

export interface SpatialAudioLifecycleHook extends LifecycleHook {
  onListenerMove?: (position: Vector3) => void;
}

export interface InteropLifecycleHook extends LifecycleHook {
  onAssetLoad?: (asset: unknown) => void;
}

export interface CoPresenceLifecycleHook extends LifecycleHook {
  onUserJoin?: (userId: string) => void;
  onUserLeave?: (userId: string) => void;
}

export interface GeospatialLifecycleHook extends LifecycleHook {
  onLocationUpdate?: (coords: { lat: number; lng: number }) => void;
}

export interface Web3LifecycleHook extends LifecycleHook {
  onWalletConnect?: (address: string) => void;
}

export interface PhysicsExpansionLifecycleHook extends LifecycleHook {
  onCollision?: (other: unknown) => void;
}

export type AllLifecycleHooks =
  | MediaLifecycleHook
  | AnalyticsLifecycleHook
  | SocialLifecycleHook
  | EffectsLifecycleHook
  | AudioLifecycleHook
  | AILifecycleHook
  | TimelineLifecycleHook
  | EnvironmentLifecycleHook
  | InputModalityLifecycleHook
  | AccessibilityLifecycleHook
  | VolumetricLifecycleHook
  | ComputeLifecycleHook
  | DigitalTwinLifecycleHook
  | AgentLifecycleHook
  | SpatialAudioLifecycleHook
  | InteropLifecycleHook
  | CoPresenceLifecycleHook
  | GeospatialLifecycleHook
  | Web3LifecycleHook
  | PhysicsExpansionLifecycleHook;

// Re-export VRTraitName for backward compatibility if needed,
// though top-level import is preferred.
export type { VRTraitName };
