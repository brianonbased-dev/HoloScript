/**
 * @holoscript/snn-webgpu - Local Prophecy Transport
 *
 * Runs the prophetic GI pipeline in-process on the caller's GPUContext.
 * This is the default transport; the HoloMesh variant wraps a remote
 * peer and falls back to this if remoting fails.
 */

import type { GPUContext } from '../gpu-context.js';
import { ProphecyOrchestrator } from './orchestrator.js';
import type {
  ProphecyConfig,
  ProphecyFrame,
  ProphecySceneContext,
  ProphecyTransport,
} from './types.js';

/**
 * Optional spike-rate provider — caller injects the bridge between the
 * upstream SNNNetwork and this orchestrator.  In Phase 2.b this will
 * be the rate-decode pass on the SNN's spike buffer; for the
 * foundation it can be a synthetic generator.
 */
export type SpikeRateProvider = (
  scene: ProphecySceneContext,
  probeCount: number,
) => Float32Array | Promise<Float32Array>;

export interface LocalProphecyTransportOptions {
  /** GPU context to allocate resources on. */
  ctx: GPUContext;
  /** Spike-rate provider — see SpikeRateProvider. */
  spikeRates: SpikeRateProvider;
}

export class LocalProphecyTransport implements ProphecyTransport {
  readonly kind = 'local' as const;

  private orchestrator: ProphecyOrchestrator | null = null;

  constructor(private readonly options: LocalProphecyTransportOptions) {}

  async initialize(config: ProphecyConfig): Promise<void> {
    this.orchestrator = new ProphecyOrchestrator(this.options.ctx, config);
    this.orchestrator.initialize();
  }

  async step(scene: ProphecySceneContext): Promise<ProphecyFrame> {
    if (!this.orchestrator) {
      throw new Error('LocalProphecyTransport: not initialized');
    }
    const rates = await this.options.spikeRates(
      scene,
      this.orchestrator.getLastFrame()?.probes.length ??
        // Probe count is fixed at initialize-time; if no frame has run
        // yet we ask the provider for the configured count.  We can
        // recover that from the orchestrator's last upload, or we
        // honour what the provider returns.  We choose the latter for
        // simplicity and validate length in primeSpikeRatesShadow.
        0,
    );
    this.orchestrator.primeSpikeRatesShadow(rates);
    this.orchestrator.uploadSpikeRates(rates);
    return this.orchestrator.step(scene);
  }

  async destroy(): Promise<void> {
    this.orchestrator?.destroy();
    this.orchestrator = null;
  }
}
