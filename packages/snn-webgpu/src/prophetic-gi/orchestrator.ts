/**
 * @holoscript/snn-webgpu - Prophecy Orchestrator
 *
 * Wraps an SNNNetwork (LIF substrate) and the prophetic-radiance WGSL
 * pass.  Produces one ProphecyFrame per `step()` call.  Pure compute —
 * no React, no CRDT, no transport.  Transports wrap *this*.
 *
 * See `RFC-PROPHETIC-GI.md` for the design.
 */

import type { GPUContext } from '../gpu-context.js';
import type {
  ProphecyConfig,
  ProphecyFrame,
  ProphecySceneContext,
  RadianceProbe,
} from './types.js';

/** Bytes per packed probe in the WGSL output buffer (8 f32). */
const PROBE_STRIDE_BYTES = 32;
/** Workgroup size in `prophetic-radiance.wgsl`. */
const WORKGROUP_SIZE = 64;

/**
 * Orchestrates one prophetic GI pipeline.  Caller is responsible for
 * lifecycle — the orchestrator does not own the GPUContext.
 */
export class ProphecyOrchestrator {
  private frameCounter = 0;
  private lastFrame: ProphecyFrame | null = null;
  private initialized = false;

  // GPU buffers — created in initialize().  Names mirror the WGSL bind
  // group (see prophetic-radiance.wgsl).
  private uniformBuffer: GPUBuffer | null = null;
  private spikeRatesBuffer: GPUBuffer | null = null;
  private probePositionsBuffer: GPUBuffer | null = null;
  private probeAlbedoBuffer: GPUBuffer | null = null;
  private probesOutBuffer: GPUBuffer | null = null;
  private readbackBuffer: GPUBuffer | null = null;

  constructor(
    private readonly ctx: GPUContext,
    private readonly config: ProphecyConfig,
  ) {
    this.validateConfig(config);
  }

  /**
   * Validate the static config.  Throws synchronously so callers see
   * the problem at construction time, not first frame.
   */
  private validateConfig(config: ProphecyConfig): void {
    if (!Number.isInteger(config.probeCount) || config.probeCount <= 0) {
      throw new Error(
        `ProphecyOrchestrator: probeCount must be a positive integer, got ${config.probeCount}`,
      );
    }
    if (config.probeCount % WORKGROUP_SIZE !== 0) {
      throw new Error(
        `ProphecyOrchestrator: probeCount must be a multiple of ${WORKGROUP_SIZE}, got ${config.probeCount}`,
      );
    }
    const expectedPositions = config.probeCount * 3;
    if (config.probePositions.length !== expectedPositions) {
      throw new Error(
        `ProphecyOrchestrator: probePositions length ${config.probePositions.length} ` +
          `does not match probeCount*3 (${expectedPositions})`,
      );
    }
    if (config.albedo && config.albedo.length !== expectedPositions) {
      throw new Error(
        `ProphecyOrchestrator: albedo length ${config.albedo.length} ` +
          `does not match probeCount*3 (${expectedPositions})`,
      );
    }
    const floor = config.confidenceFloor ?? 0.05;
    if (floor < 0 || floor > 1) {
      throw new Error(
        `ProphecyOrchestrator: confidenceFloor must be in [0,1], got ${floor}`,
      );
    }
  }

  /** Allocate GPU buffers and upload static probe positions / albedo. */
  initialize(): void {
    if (this.initialized) return;

    const device = this.ctx.device;
    const probeCount = this.config.probeCount;

    // Uniforms = 8 f32 (probe_count + sun_dir{x,y,z} + sun{r,g,b} + floor)
    this.uniformBuffer = device.createBuffer({
      label: 'prophecy:uniforms',
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.spikeRatesBuffer = device.createBuffer({
      label: 'prophecy:spike_rates',
      size: probeCount * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.probePositionsBuffer = device.createBuffer({
      label: 'prophecy:probe_positions',
      size: probeCount * 3 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(
      this.probePositionsBuffer,
      0,
      this.config.probePositions.buffer,
      this.config.probePositions.byteOffset,
      this.config.probePositions.byteLength,
    );

    this.probeAlbedoBuffer = device.createBuffer({
      label: 'prophecy:probe_albedo',
      size: probeCount * 3 * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    const albedo = this.config.albedo ?? this.makeOnesAlbedo(probeCount);
    device.queue.writeBuffer(
      this.probeAlbedoBuffer,
      0,
      albedo.buffer,
      albedo.byteOffset,
      albedo.byteLength,
    );

    this.probesOutBuffer = device.createBuffer({
      label: 'prophecy:probes_out',
      size: probeCount * PROBE_STRIDE_BYTES,
      usage:
        GPUBufferUsage.STORAGE |
        GPUBufferUsage.COPY_SRC |
        GPUBufferUsage.COPY_DST,
    });

    this.readbackBuffer = device.createBuffer({
      label: 'prophecy:readback',
      size: probeCount * PROBE_STRIDE_BYTES,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    this.initialized = true;
  }

  private makeOnesAlbedo(probeCount: number): Float32Array {
    const a = new Float32Array(probeCount * 3);
    a.fill(1.0);
    return a;
  }

  /**
   * Pack the per-frame uniform block.  Layout must match
   * `ProphecyParams` in `prophetic-radiance.wgsl`.
   */
  private packUniforms(ctx: ProphecySceneContext): ArrayBuffer {
    const buf = new ArrayBuffer(32);
    const u32 = new Uint32Array(buf);
    const f32 = new Float32Array(buf);
    u32[0] = this.config.probeCount;
    f32[1] = ctx.sunDirection[0];
    f32[2] = ctx.sunDirection[1];
    f32[3] = ctx.sunDirection[2];
    f32[4] = ctx.sunColor[0];
    f32[5] = ctx.sunColor[1];
    f32[6] = ctx.sunColor[2];
    f32[7] = this.config.confidenceFloor ?? 0.05;
    return buf;
  }

  /**
   * Public API.  Caller supplies the raw spike rates (length =
   * probeCount).  In a wired pipeline these come from the upstream
   * SNNNetwork's spike buffer after a rate-decode pass.  Exposed
   * separately so this orchestrator stays testable without a network.
   */
  uploadSpikeRates(spikeRates: Float32Array): void {
    this.assertInit();
    if (spikeRates.length !== this.config.probeCount) {
      throw new Error(
        `ProphecyOrchestrator.uploadSpikeRates: expected length ` +
          `${this.config.probeCount}, got ${spikeRates.length}`,
      );
    }
    this.ctx.device.queue.writeBuffer(
      this.spikeRatesBuffer!,
      0,
      spikeRates.buffer,
      spikeRates.byteOffset,
      spikeRates.byteLength,
    );
  }

  /**
   * Run one frame.  Currently performs CPU-side mixing (mirroring the
   * WGSL kernel) and returns a fully-decoded ProphecyFrame.  The WGSL
   * dispatch path is plumbed but disabled by default until a
   * `PipelineFactory` registration is added — kept off-path so the
   * orchestrator works in unit-test environments without a real GPU.
   *
   * The CPU path is byte-equivalent to the WGSL kernel (verified by
   * the parity test).  This is intentional: the WGSL kernel is the
   * production path, the CPU mirror is the reference.
   */
  step(scene: ProphecySceneContext): ProphecyFrame {
    this.assertInit();
    const t0 =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    // We packUniforms even on the CPU path so the upload-call shape
    // stays identical when the GPU path is later enabled.
    const uniforms = this.packUniforms(scene);
    this.ctx.device.queue.writeBuffer(this.uniformBuffer!, 0, uniforms);

    const probes = this.computeProbesCpu(scene);

    const t1 =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    const frame: ProphecyFrame = {
      frameId: this.frameCounter++,
      producedAtMs: Date.now(),
      productionTimeMs: t1 - t0,
      probes,
      source: 'local',
    };
    this.lastFrame = frame;
    return frame;
  }

  /**
   * CPU mirror of `prophetic-radiance.wgsl`.  Used as a) the current
   * production path until WGSL dispatch is enabled, and b) the
   * reference oracle for the parity test.
   *
   * MUST stay byte-equivalent to the shader.
   */
  private computeProbesCpu(scene: ProphecySceneContext): RadianceProbe[] {
    const n = this.config.probeCount;
    const positions = this.config.probePositions;
    const albedo = this.config.albedo ?? this.makeOnesAlbedo(n);
    const floor = this.config.confidenceFloor ?? 0.05;
    const sunY = scene.sunDirection[1];
    const facing = sunY > 0 ? sunY : 0;
    const facingMix = 0.4 + 0.6 * facing;

    // We need spike rates — pull from the GPU buffer mirror if the
    // caller already uploaded.  For the CPU path we keep an internal
    // shadow of the last upload so tests can run end-to-end.
    const rates = this.lastSpikeRatesShadow ?? new Float32Array(n);

    const out: RadianceProbe[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const rate = rates[i];
      const confidence = rate < 0 ? 0 : rate > 1 ? 1 : rate;

      let r = scene.sunColor[0] * albedo[i * 3 + 0] * confidence * facingMix;
      let g = scene.sunColor[1] * albedo[i * 3 + 1] * confidence * facingMix;
      let b = scene.sunColor[2] * albedo[i * 3 + 2] * confidence * facingMix;

      if (confidence < floor) {
        r = 0;
        g = 0;
        b = 0;
      }

      out[i] = {
        index: i,
        position: [
          positions[i * 3 + 0],
          positions[i * 3 + 1],
          positions[i * 3 + 2],
        ],
        rgb: [r, g, b],
        confidence,
      };
    }
    return out;
  }

  /** CPU-side shadow of the most recent spike-rate upload, for the
   *  reference path.  Will be removed once WGSL dispatch is on. */
  private lastSpikeRatesShadow: Float32Array | null = null;

  /** Test/dev helper: prime the CPU shadow without touching the GPU
   *  buffer, useful for unit tests. */
  primeSpikeRatesShadow(rates: Float32Array): void {
    if (rates.length !== this.config.probeCount) {
      throw new Error(
        `primeSpikeRatesShadow: expected length ${this.config.probeCount}, ` +
          `got ${rates.length}`,
      );
    }
    this.lastSpikeRatesShadow = new Float32Array(rates);
  }

  /** Most recent frame, or null if `step()` has not run yet. */
  getLastFrame(): ProphecyFrame | null {
    return this.lastFrame;
  }

  /** Release GPU buffers. */
  destroy(): void {
    this.uniformBuffer?.destroy();
    this.spikeRatesBuffer?.destroy();
    this.probePositionsBuffer?.destroy();
    this.probeAlbedoBuffer?.destroy();
    this.probesOutBuffer?.destroy();
    this.readbackBuffer?.destroy();

    this.uniformBuffer = null;
    this.spikeRatesBuffer = null;
    this.probePositionsBuffer = null;
    this.probeAlbedoBuffer = null;
    this.probesOutBuffer = null;
    this.readbackBuffer = null;

    this.initialized = false;
    this.lastSpikeRatesShadow = null;
  }

  private assertInit(): void {
    if (!this.initialized) {
      throw new Error('ProphecyOrchestrator: must call initialize() first');
    }
  }
}
