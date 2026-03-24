/**
 * @holoscript/core-types Hologram Types — Quilt, MV-HEVC, Depth Estimation
 *
 * Pure type definitions for holographic rendering pipelines.
 * Zero runtime imports — these types are shared across packages.
 */

// ── Quilt Types ─────────────────────────────────────────────────────────────

export interface QuiltConfig {
  /** Number of views in the quilt. Default: 48 */
  views: number;
  /** Number of columns in the tile grid. Default: 8 */
  columns: number;
  /** Number of rows in the tile grid. Default: 6 */
  rows: number;
  /** Resolution of the full quilt image [width, height]. Default: [3360, 3360] */
  resolution: [number, number];
  /** Total camera baseline in scene units (horizontal offset range). Default: 0.06 */
  baseline: number;
  /** Target Looking Glass device. Default: '16inch' */
  device: 'go' | '16inch' | '27inch' | '65inch';
  /** Focus distance from camera rig center. Default: 2.0 */
  focusDistance: number;
}

export interface QuiltTile {
  /** View index (0 = leftmost, N-1 = rightmost) */
  index: number;
  /** Column position in tile grid */
  column: number;
  /** Row position in tile grid */
  row: number;
  /** Camera offset from center along horizontal baseline */
  cameraOffset: number;
  /** View shear amount for asymmetric frustum */
  viewShear: number;
}

export interface QuiltCompilationResult {
  /** Quilt configuration used */
  config: QuiltConfig;
  /** Per-tile camera parameters for rendering */
  tiles: QuiltTile[];
  /** R3F/Three.js code for rendering the quilt */
  rendererCode: string;
  /** Metadata for Looking Glass Bridge SDK */
  metadata: {
    quiltAspect: number;
    tileWidth: number;
    tileHeight: number;
    numViews: number;
  };
}

// ── MV-HEVC Types ───────────────────────────────────────────────────────────

export interface MVHEVCConfig {
  /** Inter-pupillary distance in meters. Default: 0.065 (65mm human average) */
  ipd: number;
  /** Video resolution per eye [width, height]. Default: [1920, 1080] */
  resolution: [number, number];
  /** Frames per second. Default: 30 */
  fps: number;
  /** Focus/convergence distance in meters. Default: 2.0 */
  convergenceDistance: number;
  /** Horizontal field of view in degrees. Default: 90 */
  fovDegrees: number;
  /** HEVC encoding quality. Default: 'high' */
  quality: 'low' | 'medium' | 'high';
  /** Output container format. Default: 'mov' */
  container: 'mov' | 'mp4';
  /** Disparity adjustment for depth comfort. Default: 1.0 */
  disparityScale: number;
}

export interface MVHEVCStereoView {
  /** Eye identifier */
  eye: 'left' | 'right';
  /** Camera offset from center (negative = left, positive = right) */
  cameraOffset: number;
  /** View shear for toe-in-free convergence */
  viewShear: number;
  /** HEVC layer index (0 = base layer, 1 = enhancement layer) */
  layerIndex: number;
}

export interface MVHEVCCompilationResult {
  /** Stereo rig configuration */
  config: MVHEVCConfig;
  /** Left and right eye view parameters */
  views: MVHEVCStereoView[];
  /** Swift code for spatial video playback on Vision Pro */
  swiftCode: string;
  /** FFmpeg-compatible muxing command for MV-HEVC container */
  muxCommand: string;
  /** ISOBMFF metadata for spatial video signaling */
  metadata: {
    stereoMode: 'side-by-side' | 'multiview-hevc';
    baseline: number;
    convergence: number;
    horizontalFOV: number;
  };
}

// ── Depth Estimation Types ──────────────────────────────────────────────────

export type DepthBackend = 'webgpu' | 'wasm' | 'cpu';

export interface DepthEstimationConfig {
  /** Model ID on Hugging Face. Default: 'depth-anything/Depth-Anything-V2-Small-hf' */
  modelId?: string;
  /** Preferred compute backend. Auto-detected if not specified. */
  backend?: DepthBackend;
  /** Maximum resolution for depth inference (width or height). Default: 512 */
  maxResolution?: number;
  /** Enable IndexedDB model caching. Default: true */
  enableCache?: boolean;
  /** Progress callback during model download (0-1) */
  onProgress?: (progress: number) => void;
}

export interface DepthResult {
  /** Depth map as Float32Array (0=near, 1=far), row-major */
  depthMap: Float32Array;
  /** Normal map derived via Sobel filter on depth (RGB Float32, row-major) */
  normalMap: Float32Array;
  /** Width of the output maps */
  width: number;
  /** Height of the output maps */
  height: number;
  /** Which backend was actually used */
  backend: DepthBackend;
  /** Inference time in milliseconds */
  inferenceMs: number;
}

export interface DepthSequenceConfig extends DepthEstimationConfig {
  /** Temporal smoothing alpha (0-1). Default: 0.8 (80% new, 20% history) */
  temporalAlpha?: number;
}
