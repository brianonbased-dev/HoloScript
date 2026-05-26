/**
 * SceneReconstructionConsumer — Tests for trait-to-consumer event bridge.
 *
 * Verifies that `reconstruction:mesh_update` events emitted by the core
 * SceneReconstructionTrait are consumed, progress increases, and faceCount
 * becomes non-zero after two tick intervals.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { sceneReconstructionHandler } from '../../../core/src/traits/SceneReconstructionTrait';
import {
  SceneReconstructionConsumer,
  createSceneReconstructionConsumer,
  type ReconstructionEventBus,
  type ReconstructionState,
} from '../reconstruction/SceneReconstructionConsumer';

class TestBus implements ReconstructionEventBus {
  readonly listeners = new Map<string, Set<(payload: unknown) => void>>();
  readonly emitted: Array<{ event: string; payload: unknown }> = [];

  on<T = unknown>(event: string, callback: (payload: T) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    const wrapped = callback as (payload: unknown) => void;
    this.listeners.get(event)!.add(wrapped);
    return () => this.listeners.get(event)?.delete(wrapped);
  }

  emit<T = unknown>(event: string, payload: T): void {
    this.emitted.push({ event, payload });
    for (const callback of this.listeners.get(event) ?? []) callback(payload);
  }

  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  lastPayload<T = unknown>(event: string): T | undefined {
    return this.emitted.filter((entry) => entry.event === event).at(-1)?.payload as T | undefined;
  }
}

function createMockNode(id: string): Record<string, unknown> {
  return { id };
}

function createMockContext() {
  const bus = new TestBus();
  let state: Record<string, unknown> = {};
  return {
    emit: <T = unknown>(event: string, payload: T) => bus.emit(event, payload),
    getState: () => state,
    setState: (s: Record<string, unknown>) => {
      state = { ...state, ...s };
    },
    bus,
  };
}

function attachTrait(
  handler: typeof sceneReconstructionHandler,
  node: Record<string, unknown>,
  config: unknown,
  ctx: ReturnType<typeof createMockContext>
) {
  handler.onAttach?.(node as any, config as any, ctx as any);
}

function tickTrait(
  handler: typeof sceneReconstructionHandler,
  node: Record<string, unknown>,
  config: unknown,
  ctx: ReturnType<typeof createMockContext>,
  delta: number
) {
  handler.onUpdate?.(node as any, config as any, ctx as any, delta);
}

function sendEvent(
  handler: typeof sceneReconstructionHandler,
  node: Record<string, unknown>,
  config: unknown,
  ctx: ReturnType<typeof createMockContext>,
  event: unknown
) {
  handler.onEvent?.(node as any, config as any, ctx as any, event);
}

describe('SceneReconstructionConsumer', () => {
  const cfg = {
    reconstruction_mode: 'realtime' as const,
    mesh_detail: 'medium' as const,
    semantic_labeling: true,
    physics_collision: true,
    occlusion_enabled: true,
    update_interval_ms: 100,
    max_mesh_faces: 50000,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes to reconstruction events on start', () => {
    const bus = new TestBus();
    const consumer = new SceneReconstructionConsumer({ bus });
    consumer.start();
    expect(bus.listenerCount('reconstruction:init')).toBe(1);
    expect(bus.listenerCount('reconstruction:mesh_update')).toBe(1);
    expect(bus.listenerCount('reconstruction:stop')).toBe(1);
    expect(bus.listenerCount('reconstruction:complete')).toBe(1);
    consumer.stop();
    expect(bus.listenerCount('reconstruction:mesh_update')).toBe(0);
  });

  it('tracks mesh_update faceCount and progress', () => {
    const bus = new TestBus();
    const consumer = createSceneReconstructionConsumer({ bus });

    bus.emit('reconstruction:mesh_update', { faceCount: 1200, progress: 0.24 });
    const state = consumer.getState();
    expect(state.faceCount).toBe(1200);
    expect(state.progress).toBe(0.24);
    expect(state.isScanning).toBe(true);
    expect(state.updatedAt).toBeGreaterThan(0);

    consumer.stop();
  });

  it('advances to complete on reconstruction:complete', () => {
    const bus = new TestBus();
    const consumer = createSceneReconstructionConsumer({ bus });

    bus.emit('reconstruction:mesh_update', { faceCount: 800, progress: 0.5 });
    bus.emit('reconstruction:complete', { faceCount: 1600 });

    const state = consumer.getState();
    expect(state.isComplete).toBe(true);
    expect(state.progress).toBe(1);
    expect(state.faceCount).toBe(1600);
    expect(state.isScanning).toBe(false);

    consumer.stop();
  });

  it('resets state on reset()', () => {
    const bus = new TestBus();
    const consumer = createSceneReconstructionConsumer({ bus });
    bus.emit('reconstruction:mesh_update', { faceCount: 100, progress: 0.1 });
    consumer.reset();
    const state = consumer.getState();
    expect(state.faceCount).toBe(0);
    expect(state.progress).toBe(0);
    expect(state.isScanning).toBe(false);
    expect(state.isComplete).toBe(false);
    consumer.stop();
  });

  it('receives increasing progress and non-zero faceCount when integrated with the trait for two intervals', () => {
    const node = createMockNode('scan-node');
    const traitCtx = createMockContext();
    attachTrait(sceneReconstructionHandler, node, cfg, traitCtx);

    // Bridge trait bus -> consumer bus
    const consumerBus = new TestBus();
    traitCtx.bus.on('reconstruction:mesh_update', (payload: unknown) => {
      consumerBus.emit('reconstruction:mesh_update', payload);
    });
    traitCtx.bus.on('reconstruction:init', (payload: unknown) => {
      consumerBus.emit('reconstruction:init', payload);
    });
    traitCtx.bus.on('reconstruction:complete', (payload: unknown) => {
      consumerBus.emit('reconstruction:complete', payload);
    });

    const consumer = createSceneReconstructionConsumer({ bus: consumerBus });

    // Start scanning
    sendEvent(sceneReconstructionHandler, node, cfg, traitCtx, { type: 'reconstruction:started' });

    // Simulate face accumulation via mesh_received events
    sendEvent(sceneReconstructionHandler, node, cfg, traitCtx, {
      type: 'reconstruction:mesh_received',
      payload: { faceCount: 5000, labels: {} },
    });

    // Tick past first interval (update_interval_ms = 100, delta in seconds)
    tickTrait(sceneReconstructionHandler, node, cfg, traitCtx, 0.15);
    const state1 = consumer.getState();
    expect(state1.progress).toBeGreaterThan(0);
    expect(state1.faceCount).toBe(5000);
    expect(state1.isScanning).toBe(true);

    // Accumulate more faces and tick second interval
    sendEvent(sceneReconstructionHandler, node, cfg, traitCtx, {
      type: 'reconstruction:mesh_received',
      payload: { faceCount: 12000, labels: {} },
    });
    tickTrait(sceneReconstructionHandler, node, cfg, traitCtx, 0.15);
    const state2 = consumer.getState();
    expect(state2.progress).toBeGreaterThan(state1.progress);
    expect(state2.faceCount).toBe(12000);
    expect(state2.isScanning).toBe(true);

    consumer.stop();
  });
});
