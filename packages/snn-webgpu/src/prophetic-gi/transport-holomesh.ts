/**
 * @holoscript/snn-webgpu - HoloMesh Prophecy Transport (scaffold)
 *
 * Sends scene context to a remote peer over the HoloMesh CRDT feed
 * and receives ProphecyFrames back.  This file is the **interface
 * scaffold** — the actual feed (`crdt://holomesh/feed/ttu`) is being
 * stood up by sibling task `task_1776361304039_0v98`.
 *
 * Behaviour today:
 *   - `initialize()` succeeds (records the endpoint, no network call).
 *   - `step()` throws ProphecyNotImplementedError unless a fallback
 *     transport was supplied, in which case the call is delegated.
 *
 * Behaviour after `_0v98` lands:
 *   - `initialize()` opens the CRDT subscription.
 *   - `step()` posts the scene context, awaits the next probe frame,
 *     and falls back if the round-trip exceeds `latencyBudgetMs`.
 *
 * The interface is committed now so the `GIRenderer` extension can
 * reference it without churn when the channel goes live.
 */

import {
  ProphecyNotImplementedError,
  type ProphecyConfig,
  type ProphecyFrame,
  type ProphecySceneContext,
  type ProphecyTransport,
} from './types.js';

export interface HoloMeshProphecyTransportOptions {
  /**
   * Endpoint URL.  Today this is a placeholder; once `_0v98` ships it
   * will be `crdt://holomesh/feed/ttu/<sessionId>`.
   */
  endpoint: string;
  /**
   * Round-trip budget in milliseconds.  If a frame takes longer the
   * transport falls back (if a fallback was supplied) or returns the
   * previous frame with `source: 'fallback'`.
   */
  latencyBudgetMs?: number;
  /** Fallback transport, e.g. a LocalProphecyTransport. */
  fallback?: ProphecyTransport;
}

export class HoloMeshProphecyTransport implements ProphecyTransport {
  readonly kind = 'holomesh' as const;

  private initializedFallback = false;
  private lastFrame: ProphecyFrame | null = null;

  constructor(private readonly options: HoloMeshProphecyTransportOptions) {}

  async initialize(config: ProphecyConfig): Promise<void> {
    // No remote handshake yet; only initialise the fallback if present
    // so `step()` can immediately delegate.
    if (this.options.fallback && !this.initializedFallback) {
      await this.options.fallback.initialize(config);
      this.initializedFallback = true;
    }
  }

  async step(scene: ProphecySceneContext): Promise<ProphecyFrame> {
    // Until the CRDT feed lands we cannot actually send.  Two
    // honest options:
    //   1. delegate to fallback (preferred — keeps the renderer
    //      working and the surface stable);
    //   2. throw ProphecyNotImplementedError so callers know to
    //      configure a fallback.
    if (this.options.fallback) {
      const frame = await this.options.fallback.step(scene);
      // Tag the source so the renderer / debug overlay can show
      // that this came via the fallback path, not the remote feed.
      const tagged: ProphecyFrame = { ...frame, source: 'fallback' };
      this.lastFrame = tagged;
      return tagged;
    }
    throw new ProphecyNotImplementedError(
      `holomesh@${this.options.endpoint} (no fallback configured)`,
    );
  }

  async destroy(): Promise<void> {
    if (this.options.fallback && this.initializedFallback) {
      await this.options.fallback.destroy();
      this.initializedFallback = false;
    }
    this.lastFrame = null;
  }
}
