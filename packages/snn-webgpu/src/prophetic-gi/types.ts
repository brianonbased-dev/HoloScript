/**
 * @holoscript/snn-webgpu - Prophetic GI Types
 *
 * Public contract for the prophetic stochastic global-illumination pipeline.
 * See `RFC-PROPHETIC-GI.md` for design rationale.
 */

/** A single radiance probe — one cell of the prophetic GI grid. */
export interface RadianceProbe {
  /** Probe index within the frame buffer. */
  index: number;
  /** World-space position [x, y, z] in metres. */
  position: readonly [number, number, number];
  /** Predicted indirect radiance, RGB linear, intensity-weighted. */
  rgb: readonly [number, number, number];
  /**
   * Confidence in the prediction.  Range [0, 1].
   * Derived from the SNN spike rate normalised by the network's
   * configured `vThreshold` window.  Probes below `confidenceFloor`
   * are dropped by the consumer.
   */
  confidence: number;
}

/** A complete prophetic GI frame produced by the orchestrator. */
export interface ProphecyFrame {
  /** Monotonically increasing frame counter. */
  frameId: number;
  /** Wall-clock timestamp at production time (ms since epoch). */
  producedAtMs: number;
  /**
   * Time spent producing this frame, in ms.
   * Includes SNN step + WGSL dispatch + readback if local; round-trip
   * if remote.  Useful for the GIRenderer's autotuning loop.
   */
  productionTimeMs: number;
  /** All probes for this frame, in deterministic index order. */
  probes: readonly RadianceProbe[];
  /** Source of the frame for debugging / fallback decisions. */
  source: 'local' | 'holomesh' | 'fallback';
}

/** Static configuration for one prophetic pipeline. */
export interface ProphecyConfig {
  /**
   * Number of probes the orchestrator will emit per frame.
   * Must be a positive multiple of 64 to align with the WGSL
   * workgroup size.  Typical values: 256 (low), 1024 (high), 4096 (ultra).
   */
  probeCount: number;
  /**
   * Probe positions in world space.  Length must equal `probeCount * 3`.
   * Caller-supplied — this RFC does not auto-place probes.
   */
  probePositions: Float32Array;
  /**
   * Drop probes below this confidence in the renderer's downstream
   * blend.  Defaults to 0.05.
   */
  confidenceFloor?: number;
  /**
   * Optional per-probe tint applied after SNN inference.  Length
   * `probeCount * 3`.  Used to model wall albedo without re-training
   * the network.  Defaults to all-white.
   */
  albedo?: Float32Array;
  /**
   * If true, the orchestrator will fall back to a static ambient
   * value when the transport fails.  If false, the previous frame's
   * probes are reused (one-frame latency).  Defaults to `true`.
   */
  failSafe?: boolean;
}

/**
 * Per-frame scene context fed into the orchestrator.  This is the
 * "input layer" for the SNN — small, stable, JSON-serialisable so it
 * can be sent over the HoloMesh transport.
 */
export interface ProphecySceneContext {
  /** Camera position in world space. */
  cameraPosition: readonly [number, number, number];
  /** Camera forward vector (unit). */
  cameraForward: readonly [number, number, number];
  /** Sun / dominant light direction (unit, points *from* the surface). */
  sunDirection: readonly [number, number, number];
  /** Sun colour in linear RGB. */
  sunColor: readonly [number, number, number];
  /**
   * Optional previous frame's average luminance.  If supplied the
   * orchestrator uses it to adapt the SNN's input current scaling.
   */
  prevAvgLuminance?: number;
}

/**
 * Transport contract.  All implementations are async because the
 * remote variant must be — local just resolves immediately.
 */
export interface ProphecyTransport {
  /** Human-readable identifier used in `ProphecyFrame.source`. */
  readonly kind: 'local' | 'holomesh';
  /** Initialise any underlying resources (GPU, websocket, etc.). */
  initialize(config: ProphecyConfig): Promise<void>;
  /** Produce a single frame for the given scene context. */
  step(ctx: ProphecySceneContext): Promise<ProphecyFrame>;
  /** Release resources. */
  destroy(): Promise<void>;
}

/** Sentinel error subtype thrown by stub implementations. */
export class ProphecyNotImplementedError extends Error {
  constructor(public readonly transport: string) {
    super(`Prophecy transport "${transport}" is not yet implemented`);
    this.name = 'ProphecyNotImplementedError';
  }
}
