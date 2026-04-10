/**
 * Android Depth Scanner Traits
 *
 * Traits for depth scanning on Android using three backends that
 * auto-select the best available source at runtime:
 *   1. ARCore Depth API (ML-based, 200+ devices)
 *   2. Time-of-Flight (ToF) hardware sensor
 *   3. Dual-camera stereo depth estimation
 *
 * The pipeline: acquire depth → confidence filter → mesh reconstruction →
 * .holo scene export. Supports realtime streaming and single-shot capture.
 *
 * Categories:
 *   - Core (enable scanning, auto-select)
 *   - Backends (ARCore ML, ToF, stereo)
 *   - Processing (mesh generation, confidence, .holo conversion)
 *   - Output (realtime updates, export)
 *
 * @see https://developers.google.com/ar/develop/depth
 */
export const DEPTH_SCANNER_TRAITS = [
  // --- Core ---
  'depth_scan', // enables depth scanning pipeline
  'depth_auto_select', // runtime picks best source: ToF > ARCore ML > stereo

  // --- Backends ---
  'depth_ml_arcore', // ARCore Depth API — ML-based monocular depth (200+ devices)
  'depth_tof', // Time-of-Flight sensor path (hardware ToF required)
  'depth_stereo', // dual-camera stereo depth estimation

  // --- Processing ---
  'depth_confidence_map', // per-pixel confidence image (0-255)
  'depth_mesh_generate', // convert depth map to triangle mesh
  'depth_mesh_to_holo', // convert reconstructed mesh to .holo scene graph

  // --- Output ---
  'depth_realtime', // live depth updates every frame
  'depth_export', // export mesh as OBJ/GLB
] as const;

export type DepthScannerTraitName = (typeof DEPTH_SCANNER_TRAITS)[number];

/**
 * Depth scanner configuration defaults.
 * Used by AndroidCompiler to emit sensible defaults for each trait.
 */
export interface DepthScanConfig {
  /** Minimum confidence threshold (0-255) to include a depth pixel */
  confidenceThreshold: number;
  /** Maximum depth distance in meters */
  maxDepthMeters: number;
  /** Mesh vertex decimation factor (1.0 = full resolution) */
  meshDecimation: number;
}

export interface DepthExportConfig {
  /** Export format: 'obj' | 'glb' */
  format: 'obj' | 'glb';
  /** Whether to include vertex colors from RGB camera */
  includeColor: boolean;
  /** Whether to include normals */
  includeNormals: boolean;
}

export interface DepthRealtimeConfig {
  /** Target depth frame rate (actual may be lower depending on backend) */
  targetFps: number;
  /** Whether to smooth depth across frames */
  temporalSmoothing: boolean;
}

export const DEPTH_SCANNER_DEFAULTS: {
  scan: DepthScanConfig;
  export: DepthExportConfig;
  realtime: DepthRealtimeConfig;
} = {
  scan: {
    confidenceThreshold: 128,
    maxDepthMeters: 5.0,
    meshDecimation: 0.5,
  },
  export: {
    format: 'glb',
    includeColor: true,
    includeNormals: true,
  },
  realtime: {
    targetFps: 30,
    temporalSmoothing: true,
  },
};
