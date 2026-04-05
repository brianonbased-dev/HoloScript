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
}
