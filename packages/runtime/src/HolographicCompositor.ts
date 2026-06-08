/**
 * @holoscript/runtime - HolographicCompositor
 *
 * Consumes `holographic:frame-update` emitted by HolographicSpriteTrait
 * (packages/core/src/traits/HolographicSpriteTrait.ts) in continuous depth mode
 * and advances a per-sprite composite frame. Closes the missing listener side
 * (Pattern E: emit-without-listener) — before this, the multi-depth composite
 * never recomposed per frame.
 *
 * Headless composite-state tracker: the heavy GPU recomposition lives in the
 * renderer, but this consumer computes the per-frame parallax phase and advances
 * the composite frame index so the renderer / tests can verify recomposition
 * cadence without a GPU. Mirrors the other Pattern E coordinators.
 */

import type { EventBus } from './events.js';

export interface HolographicFrameUpdateEvent {
  nodeId: string;
  delta: number;
  /** Accumulated composite time in ms. */
  time: number;
}

export interface CompositeFrame {
  nodeId: string;
  /** Monotonic recomposed-frame index (starts at 1 on the first frame). */
  frameIndex: number;
  /** Accumulated composite time in ms (from the trait). */
  time: number;
  /** Last frame delta (seconds). */
  delta: number;
  /**
   * Parallax phase in [0, 1) derived from accumulated time — drives the
   * depth-based parallax sweep of the composite. Recomputed every frame.
   */
  parallaxPhase: number;
  recomposedAt: number;
}

export type CompositeHandler = (frame: CompositeFrame) => void;

export interface HolographicCompositorOptions {
  bus: EventBus;
  /** Parallax sweep period in ms. Default 4000 (one full sweep / 4s). */
  parallaxPeriodMs?: number;
  onRecompose?: CompositeHandler;
}

export class HolographicCompositor {
  private readonly bus: EventBus;
  private readonly parallaxPeriodMs: number;
  private frames = new Map<string, CompositeFrame>();
  private handlers = new Set<CompositeHandler>();
  private unsubscribers: Array<() => void> = [];
  private _started = false;

  constructor(options: HolographicCompositorOptions) {
    this.bus = options.bus;
    this.parallaxPeriodMs = options.parallaxPeriodMs ?? 4000;
    if (options.onRecompose) this.handlers.add(options.onRecompose);
  }

  start(): void {
    if (this._started) return;
    this._started = true;
    this.unsubscribers.push(
      this.bus.on<HolographicFrameUpdateEvent>('holographic:frame-update', (e) => this.onFrame(e))
    );
  }

  stop(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this._started = false;
  }

  private onFrame(e: HolographicFrameUpdateEvent): void {
    const nodeId = e.nodeId ?? 'default';
    const prev = this.frames.get(nodeId);
    const period = this.parallaxPeriodMs > 0 ? this.parallaxPeriodMs : 1;
    const phase = (((e.time % period) + period) % period) / period;
    const frame: CompositeFrame = {
      nodeId,
      frameIndex: (prev?.frameIndex ?? 0) + 1,
      time: e.time,
      delta: e.delta,
      parallaxPhase: phase,
      recomposedAt: Date.now(),
    };
    this.frames.set(nodeId, frame);
    this.handlers.forEach((h) => h(frame));
  }

  getComposite(nodeId: string): CompositeFrame | undefined {
    return this.frames.get(nodeId);
  }

  getFrameIndex(nodeId: string): number {
    return this.frames.get(nodeId)?.frameIndex ?? 0;
  }

  count(): number {
    return this.frames.size;
  }

  onRecompose(handler: CompositeHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}

export function createHolographicCompositor(
  options: HolographicCompositorOptions
): HolographicCompositor {
  const compositor = new HolographicCompositor(options);
  compositor.start();
  return compositor;
}
