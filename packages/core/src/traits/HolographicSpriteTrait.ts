/**
 * Holographic Sprite Meta-Trait
 *
 * Combines @segment, @depth_estimation, @displacement, and @billboard
 * into a unified trait for converting 2D media (video, image) into
 * immersive 3D holographic composites with depth-based parallax and
 * real-time background removal.
 *
 * Pipeline:
 * 1. Input: 2D image/video source
 * 2. Segmentation: Remove background via SAM 2 or rembg (@segment)
 * 3. Depth: Compute per-pixel depth via Transformers.js (@depth_estimation)
 * 4. Displacement: Apply depth map to vertex geometry (@displacement)
 * 5. Billboard: Project on 2D plane with parallax effect (@billboard)
 * 6. Output: 3D holographic sprite ready for XR/volumetric display
 *
 * Typical use cases:
 *   - Convert video calls into 3D avatar proxies
 *   - Create depth-aware UI cards with parallax
 *   - Transform still photos into volumetric portraits
 *   - Build immersive video backgrounds for VR/AR scenes
 *
 * @example
 * ```hsplus
 * object hologram @holographic_sprite {
 *   geometry: 'plane'
 *   holographicSprite: {
 *     segmentMethod: 'background-removal'
 *     depthMode: 'continuous'
 *     displacementScale: 1.5
 *     billboardType: 'spherical'
 *     imageSource: videoElement
 *   }
 * }
 * ```
 */

import type { TraitHandler, HSPlusNode } from './TraitTypes';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type HolographicSpriteMode =
  | 'portrait' // Optimized for faces/people (aggressive background removal)
  | 'product' // Optimized for objects (conservative segmentation)
  | 'scene'; // Full depth scene composition

export type BillboardType = 'planar' | 'spherical' | 'cylindrical';

export interface HolographicSpriteConfig {
  /**
   * Source property name for the 2D media (image/video).
   * Defaults to 'imageSource'.
   */
  imageSourceProp?: string;

  /**
   * Segmentation method: 'background-removal' (rembg) or 'sam2' (SAM 2).
   * 'background-removal' recommended for speed and simplicity.
   */
  segmentMethod?: 'background-removal' | 'sam2';

  /**
   * Depth estimation mode: 'on-demand', 'continuous', or 'interval'.
   * 'continuous' recommended for real-time video.
   */
  depthMode?: 'on-demand' | 'continuous' | 'interval';

  /**
   * Depth map update interval (ms) when depthMode='interval'.
   * Lower = more responsive but higher GPU cost. Default: 100ms.
   */
  depthIntervalMs?: number;

  /**
   * Scale factor for depth displacement on geometry.
   * Higher = more pronounced 3D effect. Range: 0.1-3.0. Default: 1.0.
   */
  displacementScale?: number;

  /**
   * Billboard projection type: 'planar' (flat), 'spherical' (360°), 'cylindrical'.
   * 'spherical' recommended for immersive viewing angles.
   */
  billboardType?: BillboardType;

  /**
   * Holographic composition mode. Tunes segmentation and depth params.
   * 'portrait' → aggressive background removal, smoother depth
   * 'product' → conservative background, finer depth detail
   * 'scene' → full depth composition, no background removal
   */
  mode?: HolographicSpriteMode;

  /**
   * Cache name for models. Set to null to disable caching.
   */
  cacheDb?: string | null;

  /**
   * Enable edge-aware filtering on segmentation mask for smoother transitions.
   * Default: true.
   */
  smoothMaskEdges?: boolean;

  /**
   * Enable temporal smoothing of depth maps to reduce flicker in video.
   * Default: true.
   */
  smoothDepthTemporal?: boolean;

  /**
   * Parallax intensity for depth-to-offset conversion. Higher = more dramatic
   * parallax effect when viewed at angles. Range: 0-1. Default: 0.8.
   */
  parallaxIntensity?: number;
}

// ---------------------------------------------------------------------------
// Internal runtime state
// ---------------------------------------------------------------------------

interface HolographicSpriteState {
  // Sub-trait instances (lazily initialized)
  segmentState: unknown; // SegmentationState-like
  depthState: unknown; // DepthEstimationState-like
  displacementState: unknown; // DisplacementState-like
  billboardState: unknown; // BillboardState-like

  // Composition state
  compositing: boolean; // Is the pipeline active?
  lastFrameTime: number;
  maskCache: Uint8ClampedArray | null;
  depthCache: Float32Array | null;

  // Composite output
  compositeReady: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_IMAGE_SOURCE_PROP = 'imageSource';
const DEFAULT_SEGMENT_METHOD: 'background-removal' | 'sam2' = 'background-removal';
const DEFAULT_DEPTH_MODE: 'on-demand' | 'continuous' | 'interval' = 'continuous';
const DEFAULT_DEPTH_INTERVAL_MS = 100;
const DEFAULT_DISPLACEMENT_SCALE = 1.0;
const DEFAULT_BILLBOARD_TYPE: BillboardType = 'spherical';
const DEFAULT_MODE: HolographicSpriteMode = 'portrait';
const DEFAULT_PARALLAX_INTENSITY = 0.8;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Apply temporal smoothing to depth map (simple exponential moving average) */
function smoothDepthFrame(
  current: Float32Array,
  previous: Float32Array | null,
  alpha: number = 0.7
): Float32Array {
  if (!previous || previous.length !== current.length) {
    return new Float32Array(current);
  }

  const smoothed = new Float32Array(current.length);
  for (let i = 0; i < current.length; i++) {
    smoothed[i] = alpha * current[i] + (1 - alpha) * previous[i];
  }
  return smoothed;
}

/** Apply edge-aware smoothing to segmentation mask using simple morphological ops */
function smoothMaskEdges(mask: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const smoothed = new Uint8ClampedArray(mask.length);
  const kernel = 3; // 3x3 kernel

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      let sum = 0;
      let count = 0;

      // Apply 3x3 median filter
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            sum += mask[(ny * width + nx) * 4 + 3]; // Alpha channel
            count++;
          }
        }
      }

      smoothed[idx * 4] = 255;
      smoothed[idx * 4 + 1] = 255;
      smoothed[idx * 4 + 2] = 255;
      smoothed[idx * 4 + 3] = Math.round(sum / count);
    }
  }

  return smoothed;
}

/** Compute displacement from depth map for geometry deformation */
function computeDisplacement(
  depthMap: Float32Array,
  scale: number,
  width: number,
  height: number
): Float32Array {
  const displacement = new Float32Array(depthMap.length);
  const normalizedScale = scale / 255;

  for (let i = 0; i < depthMap.length; i++) {
    // Convert depth to displacement in normal direction
    displacement[i] = depthMap[i] * normalizedScale;
  }

  return displacement;
}

// ---------------------------------------------------------------------------
// Trait handler
// ---------------------------------------------------------------------------

export const holographicSpriteTraitHandler: TraitHandler<HolographicSpriteConfig> = {
  name: '@holographic_sprite' as any,

  defaultConfig: {
    imageSourceProp: DEFAULT_IMAGE_SOURCE_PROP,
    segmentMethod: DEFAULT_SEGMENT_METHOD,
    depthMode: DEFAULT_DEPTH_MODE,
    depthIntervalMs: DEFAULT_DEPTH_INTERVAL_MS,
    displacementScale: DEFAULT_DISPLACEMENT_SCALE,
    billboardType: DEFAULT_BILLBOARD_TYPE,
    mode: DEFAULT_MODE,
    cacheDb: 'holoscript-holographic-sprite-cache',
    smoothMaskEdges: true,
    smoothDepthTemporal: true,
    parallaxIntensity: DEFAULT_PARALLAX_INTENSITY,
  },

  async onAttach(node: HSPlusNode, config: HolographicSpriteConfig, _context: unknown) {
    const cfg: Required<HolographicSpriteConfig> = {
      imageSourceProp: config.imageSourceProp ?? DEFAULT_IMAGE_SOURCE_PROP,
      segmentMethod: config.segmentMethod ?? DEFAULT_SEGMENT_METHOD,
      depthMode: config.depthMode ?? DEFAULT_DEPTH_MODE,
      depthIntervalMs: config.depthIntervalMs ?? DEFAULT_DEPTH_INTERVAL_MS,
      displacementScale: config.displacementScale ?? DEFAULT_DISPLACEMENT_SCALE,
      billboardType: config.billboardType ?? DEFAULT_BILLBOARD_TYPE,
      mode: config.mode ?? DEFAULT_MODE,
      cacheDb: config.cacheDb !== undefined ? config.cacheDb : 'holoscript-holographic-sprite-cache',
      smoothMaskEdges: config.smoothMaskEdges ?? true,
      smoothDepthTemporal: config.smoothDepthTemporal ?? true,
      parallaxIntensity: config.parallaxIntensity ?? DEFAULT_PARALLAX_INTENSITY,
    };

    const state: HolographicSpriteState = {
      segmentState: null,
      depthState: null,
      displacementState: null,
      billboardState: null,
      compositing: false,
      lastFrameTime: 0,
      maskCache: null,
      depthCache: null,
      compositeReady: false,
      error: null,
    };

    (node as any).__holographicSpriteState = state;

    // Emit initial state
    (node as any).emit?.('holographic:ready', false);
    (node as any).emit?.('holographic:mode', cfg.mode);

    // Initialize sub-traits asynchronously
    (async () => {
      try {
        // In production, dynamically load and initialize sub-trait handlers
        // For this prototype, we mark as ready once config is validated
        state.compositing = true;
        state.compositeReady = true;

        (node as any).emit?.('holographic:ready', true);
        (node as any).emit?.('holographic:config', {
          segmentMethod: cfg.segmentMethod,
          depthMode: cfg.depthMode,
          displacementScale: cfg.displacementScale,
          billboardType: cfg.billboardType,
          mode: cfg.mode,
        });
      } catch (err) {
        state.error = String(err);
        (node as any).emit?.('holographic:error', state.error);
      }
    })();

    // Register event listeners for manual composition triggers
    (node as any).on?.('holographic:compose', () => {
      if (state.compositeReady) {
        (node as any).emit?.('holographic:compositing', true);
      }
    });

    (node as any).on?.('segment:mask', (mask: Uint8ClampedArray) => {
      if (cfg.smoothMaskEdges) {
        state.maskCache = smoothMaskEdges(mask, 512, 512); // Would get dimensions from config
      } else {
        state.maskCache = mask;
      }
      (node as any).emit?.('holographic:mask-updated', state.maskCache);
    });

    (node as any).on?.('depth:map', (depthMap: Float32Array) => {
      let processed = depthMap;
      if (cfg.smoothDepthTemporal && state.depthCache) {
        processed = smoothDepthFrame(depthMap, state.depthCache, 0.7);
      }
      state.depthCache = processed;

      const displacement = computeDisplacement(processed, cfg.displacementScale, 512, 512);
      (node as any).emit?.('holographic:displacement', displacement);
    });
  },

  onUpdate(node: HSPlusNode, config: HolographicSpriteConfig, _context: unknown, delta: number) {
    const state = (node as any).__holographicSpriteState as HolographicSpriteState | undefined;
    if (!state?.compositeReady) return;

    // In continuous mode, trigger composition on each frame
    if ((config.depthMode ?? DEFAULT_DEPTH_MODE) === 'continuous') {
      state.lastFrameTime += delta * 1000; // Convert to ms
      (node as any).emit?.('holographic:frame-update', { delta, time: state.lastFrameTime });
    }
  },

  onDetach(node: HSPlusNode, _config: HolographicSpriteConfig, _context: unknown) {
    const state = (node as any).__holographicSpriteState as HolographicSpriteState | undefined;
    if (state) {
      state.compositing = false;
      state.compositeReady = false;
      state.maskCache = null;
      state.depthCache = null;
    }
    delete (node as any).__holographicSpriteState;
    (node as any).emit?.('holographic:ready', false);
  },
};

export default holographicSpriteTraitHandler;
