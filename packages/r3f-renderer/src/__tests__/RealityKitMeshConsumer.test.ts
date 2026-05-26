/**
 * RealityKitMeshConsumer — Tests for trait-to-consumer event bridge.
 *
 * Verifies that `rkMesh:tick` events emitted by the core RealityKitMeshTrait
 * are consumed and anchor/face counts are reconciled into consumer state.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { realityKitMeshHandler } from '../../../core/src/traits/RealityKitMeshTrait';
import {
  RealityKitMeshConsumer,
  createRealityKitMeshConsumer,
  type RealityKitMeshEventBus,
  type RealityKitMeshState,
} from '../realitykit/RealityKitMeshConsumer';

class TestBus implements RealityKitMeshEventBus {
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

  payloadsFor<T = unknown>(event: string): T[] {
    return this.emitted.filter((entry) => entry.event === event).map((e) => e.payload as T);
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
  handler: typeof realityKitMeshHandler,
  node: Record<string, unknown>,
  config: unknown,
  ctx: ReturnType<typeof createMockContext>
) {
  handler.onAttach?.(node as any, config as any, ctx as any);
}

function tickTrait(
  handler: typeof realityKitMeshHandler,
  node: Record<string, unknown>,
  config: unknown,
  ctx: ReturnType<typeof createMockContext>,
  delta: number
) {
  handler.onUpdate?.(node as any, config as any, ctx as any, delta);
}

function sendEvent(
  handler: typeof realityKitMeshHandler,
  node: Record<string, unknown>,
  config: unknown,
  ctx: ReturnType<typeof createMockContext>,
  event: unknown
) {
  handler.onEvent?.(node as any, config as any, ctx as any, event);
}

describe('RealityKitMeshConsumer', () => {
  const cfg = {
    mesh_classification: true,
    physics_enabled: true,
    occlusion_enabled: true,
    collision_margin: 0.02,
    update_frequency: 10,
    max_anchor_distance: 8.0,
    render_wireframe: false,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes to rkMesh events on start', () => {
    const bus = new TestBus();
    const consumer = new RealityKitMeshConsumer({ bus });
    consumer.start();
    expect(bus.listenerCount('rkMesh:init')).toBe(1);
    expect(bus.listenerCount('rkMesh:tick')).toBe(1);
    expect(bus.listenerCount('rkMesh:cleanup')).toBe(1);
    consumer.stop();
    expect(bus.listenerCount('rkMesh:tick')).toBe(0);
  });

  it('tracks tick anchorCount and totalFaces', () => {
    const bus = new TestBus();
    const consumer = createRealityKitMeshConsumer({ bus });

    bus.emit('rkMesh:init', { classification: true, physics: true });
    bus.emit('rkMesh:tick', { anchorCount: 4, totalFaces: 1200 });

    const state = consumer.getState();
    expect(state.anchorCount).toBe(4);
    expect(state.totalFaces).toBe(1200);
    expect(state.isActive).toBe(true);
    expect(state.classificationEnabled).toBe(true);
    expect(state.physicsEnabled).toBe(true);
    expect(state.updatedAt).toBeGreaterThan(0);

    consumer.stop();
  });

  it('clears state on cleanup', () => {
    const bus = new TestBus();
    const consumer = createRealityKitMeshConsumer({ bus });
    bus.emit('rkMesh:tick', { anchorCount: 3, totalFaces: 800 });
    bus.emit('rkMesh:cleanup');
    const state = consumer.getState();
    expect(state.isActive).toBe(false);
    expect(state.anchorCount).toBe(0);
    expect(state.totalFaces).toBe(0);
    consumer.stop();
  });

  it('resets state on reset()', () => {
    const bus = new TestBus();
    const consumer = createRealityKitMeshConsumer({ bus });
    bus.emit('rkMesh:tick', { anchorCount: 2, totalFaces: 400 });
    consumer.reset();
    const state = consumer.getState();
    expect(state.anchorCount).toBe(0);
    expect(state.totalFaces).toBe(0);
    expect(state.isActive).toBe(false);
    consumer.stop();
  });

  it('receives rkMesh:tick with anchor/face payload when integrated end-to-end', () => {
    const node = createMockNode('rk-node');
    const traitCtx = createMockContext();
    attachTrait(realityKitMeshHandler, node, cfg, traitCtx);

    // Bridge trait bus -> consumer bus
    const consumerBus = new TestBus();
    traitCtx.bus.on('rkMesh:init', (payload: unknown) => {
      consumerBus.emit('rkMesh:init', payload);
    });
    traitCtx.bus.on('rkMesh:tick', (payload: unknown) => {
      consumerBus.emit('rkMesh:tick', payload);
    });

    const consumer = createRealityKitMeshConsumer({ bus: consumerBus });

    // Activate and add an anchor
    sendEvent(realityKitMeshHandler, node, cfg, traitCtx, {
      type: 'rkMesh:started',
    });
    sendEvent(realityKitMeshHandler, node, cfg, traitCtx, {
      type: 'rkMesh:anchor_added',
      payload: {
        id: 'anchor-1',
        classification: 'floor',
        vertexCount: 120,
        faceCount: 40,
        boundingBox: { min: [0, 0, 0], max: [1, 0, 1] },
      },
    });

    // update_frequency = 10 Hz => interval = 0.1s. Tick past one interval.
    tickTrait(realityKitMeshHandler, node, cfg, traitCtx, 0.15);

    const state = consumer.getState();
    expect(state.isActive).toBe(true);
    expect(state.anchorCount).toBe(1);
    expect(state.totalFaces).toBe(40);
    expect(state.updatedAt).toBeGreaterThan(0);

    consumer.stop();
  });
});
