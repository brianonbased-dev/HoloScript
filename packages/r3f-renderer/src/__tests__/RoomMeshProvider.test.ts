/**
 * RoomMeshProvider — Tests for trait-to-provider event bridge.
 *
 * Verifies that `room_mesh_request_update` emitted by the core
 * RoomMeshTrait is consumed by a registered provider, which then
 * emits `mesh_block_update` back so the trait advances node state.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { roomMeshHandler } from '../../../core/src/traits/RoomMeshTrait';
import {
  RoomMeshProvider,
  createRoomMeshProvider,
  type RoomMeshEventBus,
  type MeshProviderResult,
} from '../room-mesh/RoomMeshProvider';

class TestBus implements RoomMeshEventBus {
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
  return {
    emit: <T = unknown>(event: string, payload: T) => bus.emit(event, payload),
    bus,
  };
}

function attachTrait(
  handler: typeof roomMeshHandler,
  node: Record<string, unknown>,
  config: unknown,
  ctx: ReturnType<typeof createMockContext>
) {
  handler.onAttach?.(node as any, config as any, ctx as any);
}

function sendEvent(
  handler: typeof roomMeshHandler,
  node: Record<string, unknown>,
  config: unknown,
  ctx: ReturnType<typeof createMockContext>,
  event: unknown
) {
  handler.onEvent?.(node as any, config as any, ctx as any, event);
}

function tickTrait(
  handler: typeof roomMeshHandler,
  node: Record<string, unknown>,
  config: unknown,
  ctx: ReturnType<typeof createMockContext>,
  delta: number = 16
) {
  handler.onUpdate?.(node as any, config as any, ctx as any, delta);
}

describe('RoomMeshProvider', () => {
  const cfg = {
    resolution: 'medium' as const,
    update_rate: 5,
    semantic_labeling: true,
    room_boundary_detection: true,
    physics_collider: false,
    merge_adjacent_blocks: false,
    visible: false,
    wireframe: false,
  };

  it('subscribes to room_mesh_request_update on start', () => {
    const bus = new TestBus();
    const provider = new RoomMeshProvider({ bus, provider: () => ({ blocks: [] }) });
    provider.start();
    expect(bus.listenerCount('room_mesh_request_update')).toBe(1);
    provider.stop();
    expect(bus.listenerCount('room_mesh_request_update')).toBe(0);
  });

  it('invokes the registered provider when a request is emitted', async () => {
    const bus = new TestBus();
    const mockProvider = vi.fn().mockReturnValue({ blocks: [] } as MeshProviderResult);
    const provider = createRoomMeshProvider({ bus, provider: mockProvider });

    bus.emit('room_mesh_request_update', { node: { id: 'room-1' } });

    await vi.waitFor(() => {
      expect(mockProvider).toHaveBeenCalledTimes(1);
    });

    expect(provider.getCallCount('room-1')).toBe(1);
    provider.stop();
  });

  it('emits mesh_block_update for each block returned by the provider', async () => {
    const bus = new TestBus();
    const block = {
      id: 'block-a',
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      bounds: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 0] as [number, number, number] },
      semanticLabel: 'floor' as const,
      vertexCount: 3,
      triangleCount: 1,
      lastUpdated: Date.now(),
    };

    const provider = createRoomMeshProvider({
      bus,
      provider: () => ({
        blocks: [block],
        bounds: { min: [0, 0, 0], max: [1, 1, 0] },
        progress: 0.5,
      }),
    });

    bus.emit('room_mesh_request_update', { node: { id: 'room-2' } });

    await vi.waitFor(() => {
      expect(bus.payloadsFor('mesh_block_update')).toHaveLength(1);
    });

    expect(bus.payloadsFor('room_boundary_detected')).toHaveLength(1);
    expect(bus.payloadsFor('room_mesh_scan_progress')).toHaveLength(1);

    provider.stop();
  });

  it('advances RoomMeshTrait node state when integrated end-to-end', async () => {
    const node = createMockNode('scan-room');
    const traitCtx = createMockContext();
    attachTrait(roomMeshHandler, node, cfg, traitCtx);

    // Trait is now scanning and will emit room_mesh_request_update on tick
    const providerBus = new TestBus();
    // Bridge the two buses: traitCtx.bus emits -> providerBus receives
    // and providerBus emits -> traitCtx.bus receives
    traitCtx.bus.on('room_mesh_request_update', (payload) => {
      providerBus.emit('room_mesh_request_update', payload);
    });
    providerBus.on('mesh_block_update', (payload: unknown) => {
      const p = payload as Record<string, unknown>;
      sendEvent(roomMeshHandler, node, cfg, traitCtx, {
        type: 'mesh_block_update',
        block: p.block,
      });
    });
    providerBus.on('room_boundary_detected', (payload: unknown) => {
      const p = payload as Record<string, unknown>;
      sendEvent(roomMeshHandler, node, cfg, traitCtx, {
        type: 'room_boundary_detected',
        bounds: p.bounds,
      });
    });

    const block = {
      id: 'block-1',
      vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      bounds: { min: [0, 0, 0] as [number, number, number], max: [1, 1, 0] as [number, number, number] },
      semanticLabel: 'floor' as const,
      vertexCount: 3,
      triangleCount: 1,
      lastUpdated: Date.now(),
    };

    createRoomMeshProvider({
      bus: providerBus,
      provider: () => ({
        blocks: [block],
        bounds: { min: [0, 0, 0], max: [1, 1, 0] },
      }),
    });

    // Mock Date.now so the update interval has elapsed
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 250);

    tickTrait(roomMeshHandler, node, cfg, traitCtx);

    await vi.waitFor(() => {
      const state = (node as any).__roomMeshState;
      return state && state.meshBlocks.size > 0;
    });

    const state = (node as any).__roomMeshState;
    expect(state.meshBlocks.size).toBe(1);
    expect(state.totalVertices).toBe(3);
    expect(state.totalTriangles).toBe(1);
    expect(state.detectedSurfaces.size).toBe(1);
    expect(state.detectedSurfaces.get('floor')).toBeTruthy();

    vi.restoreAllMocks();
  });

  it('emits room_mesh_provider_error on provider exception', async () => {
    const bus = new TestBus();
    const provider = createRoomMeshProvider({
      bus,
      provider: () => {
        throw new Error('depth sensor offline');
      },
    });

    bus.emit('room_mesh_request_update', { node: { id: 'room-3' } });

    await vi.waitFor(() => {
      expect(bus.lastPayload('room_mesh_provider_error')).toBeTruthy();
    });

    const err = bus.lastPayload<{ error: string }>('room_mesh_provider_error');
    expect(err?.error).toContain('depth sensor offline');

    provider.stop();
  });
});
