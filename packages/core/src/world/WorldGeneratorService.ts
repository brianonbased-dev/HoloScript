/**
 * WorldGeneratorService — wires 'world:generate' events to adapter pipeline
 *
 * The WorldGeneratorTrait emits 'world:generate' on onAttach.
 * This service listens for that event (on any runtime event bus) and:
 *   1. Picks the right adapter from the registry
 *   2. Fires progress events back into the same context
 *   3. Emits 'world:generation_complete' (or 'world:generation_error') when done
 *
 * Usage (in runtime / scene bootstrap):
 *
 *   import { worldGeneratorService } from '@holoscript/core/world';
 *
 *   worldGeneratorService.registerDefaultAdapters();  // registers Sovereign3DAdapter (Brittney v43+)
 *
 *   // When running a scene, bind service to your event emitter:
 *   worldGeneratorService.bindEventEmitter(emitter);
 *
 * For testing / custom adapters:
 *
 *   worldGeneratorService.registry.register(myCustomAdapter);
 */

import {
  worldAdapterRegistry,
  type WorldAdapterRegistry,
  type WorldGenerationRequest,
} from './WorldGeneratorAdapter';
import { Sovereign3DAdapter } from './adapters/Sovereign3DAdapter';

// =============================================================================
// EVENT SHAPE (matches WorldGeneratorTrait expected events)
// =============================================================================

export interface WorldGenerateEvent {
  nodeId: string;
  engine: string;
  prompt: string;
  input_image?: string;
  input_images?: string[];
  format: 'mesh' | '3dgs' | 'both' | 'neural_field';
  quality: 'low' | 'medium' | 'high' | 'ultra';
  seed?: number;
  navEnabled?: boolean;
  interactiveMode?: boolean;
}

export interface WorldGenerationStartedEvent {
  nodeId: string;
  engine: string;
  generationId: string;
}

export interface WorldGenerationProgressEvent {
  nodeId: string;
  progress: number; // 0–1
}

export interface WorldGenerationCompleteEvent {
  nodeId: string;
  assetUrl: string;
  navmeshUrl?: string;
  pointCloudUrl?: string;
  generationId: string;
  metadata: Record<string, unknown>;
}

export interface WorldGenerationErrorEvent {
  nodeId: string;
  error: string;
}

// =============================================================================
// MINIMAL EVENT EMITTER INTERFACE
// =============================================================================

export interface WorldEventEmitter {
  on(event: string, listener: (data: unknown) => void): void;
  off?(event: string, listener: (data: unknown) => void): void;
  emit(event: string, data: unknown): void;
}

// =============================================================================
// SERVICE
// =============================================================================

export class WorldGeneratorService {
  readonly registry: WorldAdapterRegistry;
  private emitters = new Set<WorldEventEmitter>();
  private defaultAdaptersRegistered = false;

  constructor(registry: WorldAdapterRegistry = worldAdapterRegistry) {
    this.registry = registry;
  }

  /**
  * Register the built-in sovereign adapter (SovereignWorldAdapter — Brittney v43+).
   * Call once during scene/runtime bootstrap.
   */
  registerDefaultAdapters(): void {
    if (this.defaultAdaptersRegistered) return;
    this.registry.register(new Sovereign3DAdapter());
    this.defaultAdaptersRegistered = true;
  }

  /**
   * Bind to an event emitter (TraitContext-like).
   * The service starts listening for 'world:generate' events on this emitter.
   * Returns an unsubscribe function.
   */
  bindEventEmitter(emitter: WorldEventEmitter): () => void {
    const listener = (data: unknown) => {
      void this.handleGenerateEvent(emitter, data as WorldGenerateEvent);
    };
    emitter.on('world:generate', listener);
    this.emitters.add(emitter);

    return () => {
      emitter.off?.('world:generate', listener);
      this.emitters.delete(emitter);
    };
  }

  // ---------------------------------------------------------------------------
  // CORE HANDLER
  // ---------------------------------------------------------------------------

  async handleGenerateEvent(
    emitter: WorldEventEmitter,
    event: WorldGenerateEvent
  ): Promise<void> {
    const { nodeId, engine } = event;

    // Validate adapter availability
    if (!this.registry.has(engine)) {
      const errEvent: WorldGenerationErrorEvent = {
        nodeId,
        error: `No adapter registered for engine '${engine}'. Available: ${this.registry.list().join(', ')}`,
      };
      emitter.emit('world:generation_error', errEvent);
      return;
    }

    const adapter = this.registry.get(engine);
    const request: WorldGenerationRequest = {
      prompt: event.prompt,
      format: event.format,
      quality: event.quality,
      ...(event.input_image ? { input_image: event.input_image } : {}),
      ...(event.input_images ? { input_images: event.input_images } : {}),
      ...(event.seed !== undefined ? { seed: event.seed } : {}),
      ...(event.navEnabled !== undefined ? { navEnabled: event.navEnabled } : {}),
      ...(event.interactiveMode !== undefined
        ? { interactiveMode: event.interactiveMode }
        : {}),
    };

    try {
      // Kick off generation — if adapter supports progress polling, do it
      const generationPromise = adapter.generate(request);

      // Emit started (generationId not yet known — emit placeholder)
      emitter.emit('world:generation_started', {
        nodeId,
        engine,
        generationId: 'pending',
      } satisfies WorldGenerationStartedEvent);

      // If adapter supports getProgress, poll and re-emit
      let progressInterval: ReturnType<typeof setInterval> | undefined;
      if (adapter.getProgress) {
        const getProgress = adapter.getProgress.bind(adapter);
        progressInterval = setInterval(() => {
          // We don't have the job ID yet at this point — this is a best-effort
          // placeholder that individual adapters can override by emitting directly.
          // Once generationId is available (after generate() resolves) we stop polling.
          void getProgress('pending')
            .then((progress) => {
              emitter.emit('world:generation_progress', {
                nodeId,
                progress,
              } satisfies WorldGenerationProgressEvent);
            })
            .catch(() => {
              /* silently ignore poll errors */
            });
        }, 3000);
      }

      const result = await generationPromise;

      if (progressInterval !== undefined) {
        clearInterval(progressInterval);
      }

      // Final progress = 1
      emitter.emit('world:generation_progress', {
        nodeId,
        progress: 1,
      } satisfies WorldGenerationProgressEvent);

      const completeEvent: WorldGenerationCompleteEvent = {
        nodeId,
        assetUrl: result.assetUrl,
        generationId: result.generationId,
        metadata: result.metadata as unknown as Record<string, unknown>,
        ...(result.navmeshUrl ? { navmeshUrl: result.navmeshUrl } : {}),
        ...(result.pointCloudUrl ? { pointCloudUrl: result.pointCloudUrl } : {}),
      };

      emitter.emit('world:generation_complete', completeEvent);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const errEvent: WorldGenerationErrorEvent = {
        nodeId,
        error: message,
      };
      emitter.emit('world:generation_error', errEvent);
    }
  }
}

/** Singleton service — use this in runtime / MCP tool */
export const worldGeneratorService = new WorldGeneratorService();
