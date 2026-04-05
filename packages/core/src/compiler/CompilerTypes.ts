/**
 * Shared compiler result types.
 *
 * These types are extracted from the individual compiler files into a shared
 * module to break circular dependencies between CompilerBase and the concrete
 * compiler implementations.
 *
 * Pattern: CompilerBase needs result types for union type signatures,
 * concrete compilers need CompilerBase for inheritance. Moving result types
 * here means both can import from this file without creating cycles.
 */

// ─── GLTF Pipeline ────────────────────────────────────────────────────

export interface GLTFExportResult {
  /** Binary data (for GLB) or undefined (for gltf) */
  binary?: Uint8Array;
  /** JSON document (for gltf format) */
  json?: object;
  /** Separate binary buffer (for gltf format) */
  buffer?: Uint8Array;
  /** External resources (textures, etc.) */
  resources?: Map<string, Uint8Array>;
  /** Export statistics */
  stats: GLTFExportStats;
}

export interface GLTFExportStats {
  nodeCount: number;
  meshCount: number;
  materialCount: number;
  textureCount: number;
  animationCount: number;
  totalVertices: number;
  totalTriangles: number;
  fileSizeBytes: number;
}

// ─── AR Compiler ──────────────────────────────────────────────────────

export interface ARCompilationResult {
  success: boolean;
  target: 'webxr' | 'ar.js';
  code: string;
  source_map?: string;
  assets: Array<{ type: 'texture' | 'model' | 'audio'; url: string }>;
  warnings: string[];
  errors: string[];
}

// ─── Android XR Compiler ──────────────────────────────────────────────

export interface AndroidXRCompileResult {
  activityFile: string;
  stateFile: string;
  nodeFactoryFile: string;
  manifestFile: string;
  buildGradle: string;
  /** Present only in glasses mode — Glimmer composables file */
  glimmerComponentsFile?: string;
  [key: string]: string | undefined;
}

// ─── VRR Compiler ─────────────────────────────────────────────────────

export interface VRRCompilationResult {
  success: boolean;
  target: 'threejs' | 'babylonjs';
  code: string;
  source_map?: string;
  assets: Array<{ type: 'texture' | 'model' | 'audio'; url: string }>;
  api_endpoints: Array<{ type: 'weather' | 'events' | 'inventory'; url: string }>;
  warnings: string[];
  errors: string[];
}

// ─── iOS Compiler ─────────────────────────────────────────────────────

export interface IOSCompileResult {
  viewFile: string;
  sceneFile: string;
  stateFile: string;
  infoPlist: string;
  /** RoomPlan capture session file — emitted when roomplan_scan trait is present (iOS 16+) */
  roomPlanFile?: string;
  /** LiDAR scanner file — emitted when lidar_* traits are present (iOS 15+, LiDAR hardware) */
  lidarScannerFile?: string;
  /** NPU scene understanding file — emitted when npu_* traits are present (iOS 15+, Vision + CoreML) */
  npuSceneFile?: string;
  /** Hand tracking file — emitted when camera_hand_* traits are present (iOS 14+, Vision framework) */
  handTrackingFile?: string;
  /** Portal AR file — emitted when portal_* traits are present (iOS 15+, ARKit depth + scene reconstruction) */
  portalARFile?: string;
  /** Face tracking file — emitted when face_* traits are present (iOS 11+, ARKit TrueDepth) */
  faceTrackingFile?: string;
  /** Object Capture file — emitted when object_capture* traits are present (iOS 17+, RealityKit Object Capture) */
  objectCaptureFile?: string;
  /** SharePlay multi-user AR file — emitted when shareplay_* traits are present (iOS 15.4+, GroupActivities) */
  sharePlayFile?: string;
  /** UWB positioning file — emitted when uwb_* traits are present (iOS 16+, Nearby Interaction) */
  uwbPositioningFile?: string;
  /** Spatial audio file — emitted when spatial_audio_*/audio_* traits are present (iOS 15+, AVFoundation PHASE + CMHeadphoneMotionManager) */
  spatialAudioFile?: string;
}
