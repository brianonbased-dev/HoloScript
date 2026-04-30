/**
 * Android XR Component Types and Trait Mapping Interface
 *
 * Shared types for the Android XR trait mapping system.
 */

/**
 * Android XR Trait Mapping System
 *
 * Maps HoloScript traits to Android XR SceneCore components, ARCore providers,
 * and Filament rendering primitives with Kotlin code generation.
 * Used by AndroidXRCompiler for trait-to-native conversion.
 *
 * Platform stack:
 *   - Jetpack XR SceneCore (entities, components, ECS)
 *   - ARCore for Jetpack XR (perception, anchors, hand tracking, face tracking)
 *   - Filament (PBR rendering, lighting, shadows)
 *   - Jetpack Compose for XR (spatial UI, UserSubspace, SceneCoreEntity)
 *   - Oboe / SoundPool / MediaPlayer (spatial audio)
 *   - SurfaceEntity with DRM (Widevine protected video playback)
 *
 * DP3 additions (Android XR SDK Developer Preview 3):
 *   - face_tracking: 68 blendshapes via FaceTrackingMode.BLEND_SHAPES
 *   - follows_head / head_follow: UserSubspace soft-locking follow behavior
 *   - drm_video / protected_video: SurfaceEntity with SurfaceProtection.PROTECTED
 *   - scene_core_entity: SceneCoreEntity composable for 3D model placement
 *
 * @version 2.0.0 — Android XR SDK Developer Preview 3
 */

// =============================================================================
// ANDROID XR COMPONENT TYPES
// =============================================================================

export type AndroidXRComponent =
  | 'MovableComponent'
  | 'ResizableComponent'
  | 'InteractableComponent'
  | 'GltfModelEntity'
  | 'PanelEntity'
  | 'SurfaceEntity'
  | 'AnchorEntity'
  | 'SpatialSoundPool'
  | 'SpatialMediaPlayer'
  | 'PointSourceParams'
  | 'SoundFieldAttributes'
  | 'SpatialEnvironment'
  | 'HandTrackingProvider'
  | 'FaceTrackingProvider' // DP3: Face tracking with 68 blendshapes
  | 'UserSubspaceComponent' // DP3: Head-following UI via UserSubspace
  | 'SceneCoreEntityComponent' // DP3: SceneCoreEntity composable
  | 'PlaneTrackable'
  | 'CollisionComponent'
  | 'PhysicsComponent'
  | 'MeshReconstruction'
  | 'OcclusionProvider'
  | 'BluetoothGatt'
  | 'UsbManager'
  | 'TFLiteInterpreter'
  | 'NnApiDelegate'
  | 'OkHttpClient'
  | 'SpeechRecognizer'
  | 'LightManager'
  | 'ParticleSystem'
  | 'BillboardNode'
  | 'AccessibilityDelegate';

export type TraitImplementationLevel =
  | 'full' // Generates complete Kotlin/Android XR code
  | 'partial' // Generates some code with TODOs
  | 'comment' // Only generates documentation comment
  | 'unsupported'; // Not available in Android XR

export interface AndroidXRTraitMapping {
  /** HoloScript trait name */
  trait: string;
  /** Android XR components to add */
  components: AndroidXRComponent[];
  /** Implementation completeness */
  level: TraitImplementationLevel;
  /** Required Kotlin/Android imports */
  imports?: string[];
  /** Required minimum SDK version */
  minSdkVersion?: number;
  /** Code generator function */
  generate: (varName: string, config: Record<string, unknown>) => string[];
}

// =============================================================================
// PHYSICS TRAITS
// =============================================================================

