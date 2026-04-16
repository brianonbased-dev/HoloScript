/**
 * WorldSimulationBridge — orchestrates spatial state for generative worlds.
 *
 * This bridge connects the WorldGeneratorService (which handles the generation lifecycle)
 * with the active simulation/rendering context. It handles:
 *   1. Automatic rendering of completion results.
 *   2. Neural stream initialization (for Brittney neural fields).
 *   3. Epistemic metadata mapping (bounds, starts, waypoints).
 */

import {
  worldGeneratorService,
  type WorldGenerationCompleteEvent,
  type WorldEventEmitter,
} from './WorldGeneratorService';
import { logger } from '../logger';

export interface SimulationBridgeOptions {
  /** Should the bridge automatically trigger render events? (default: true) */
  autoRender?: boolean;
  /** Custom logger instance */
  logger?: typeof logger;
}

export class WorldSimulationBridge {
  private readonly options: SimulationBridgeOptions;
  private readonly log: typeof logger;
  private isBound = false;

  constructor(options: SimulationBridgeOptions = {}) {
    this.options = {
      autoRender: true,
      ...options,
    };
    this.log = options.logger ?? logger;
  }

  /**
   * Bind the bridge to an event emitter (e.g. TraitContext or Global Event Bus).
   * Once bound, it monitors generation completion and manages the simulation state.
   */
  bind(emitter: WorldEventEmitter): () => void {
    const unbindService = worldGeneratorService.bindEventEmitter(emitter);

    const onComplete = (data: unknown) => {
      this.handleGenerationComplete(emitter, data as WorldGenerationCompleteEvent);
    };

    emitter.on('world:generation_complete', onComplete);
    this.isBound = true;

    return () => {
      unbindService();
      emitter.off?.('world:generation_complete', onComplete);
      this.isBound = false;
    };
  }

  private handleGenerationComplete(
    emitter: WorldEventEmitter,
    event: WorldGenerationCompleteEvent
  ): void {
    const { nodeId, assetUrl, metadata, generationId } = event;

    this.log.info(`[WorldSimulationBridge] Generation ${generationId} complete for node ${nodeId}`);

    if (!this.options.autoRender) return;

    // 1. Map Spatial Metadata
    if (metadata.bounds) {
      emitter.emit('world:bounds_updated', {
        nodeId,
        bounds: metadata.bounds,
      });
    }

    if (metadata.agentStart) {
      emitter.emit('world:agent_start_set', {
        nodeId,
        position: metadata.agentStart,
      });
    }

    // 2. Specialized Result Handling
    const format = metadata.format as string;

    if (format === 'neural_field') {
      // Neural Streaming Activation
      emitter.emit('world:stream_ready', {
        nodeId,
        streamUrl: assetUrl,
        provider: 'sovereign-3d',
        generationId,
      });
    } else if (format === '3dgs') {
      // Gaussian Splat Rendering
      emitter.emit('splat_set_source', {
        nodeId,
        source: assetUrl,
      });
    } else if (format === 'mesh') {
      // Mesh Loading
      emitter.emit('mesh_set_source', {
        nodeId,
        source: assetUrl,
      });
    } else if (format === 'both') {
      // Handle hybrid results (Splat + Mesh)
      emitter.emit('splat_set_source', {
        nodeId,
        source: assetUrl, // Usually the splat PLY
      });
      if (event.pointCloudUrl) {
         emitter.emit('mesh_set_source', {
            nodeId,
            source: event.pointCloudUrl,
         });
      }
    }
  }
}

/** Singleton bridge for global use */
export const worldSimulationBridge = new WorldSimulationBridge();
