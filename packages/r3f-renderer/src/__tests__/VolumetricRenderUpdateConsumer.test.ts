/**
 * VolumetricRenderUpdateConsumer — Tests for trait-to-renderer event bridge.
 *
 * Verifies that `volumetric_render_update` events emitted by the core
 * VolumetricTrait are consumed, stored, and applied to splat draw order
 * and opacity.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  VolumetricRenderUpdateConsumer,
  createVolumetricRenderUpdateConsumer,
  reorderByIndices,
  type VolumetricEventBus,
} from '../volumetric/VolumetricRenderUpdateConsumer';

class TestBus implements VolumetricEventBus {
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

describe('VolumetricRenderUpdateConsumer', () => {
  it('subscribes to volumetric_render_update', () => {
    const bus = new TestBus();
    const consumer = new VolumetricRenderUpdateConsumer({ bus });
    consumer.start();
    expect(bus.listenerCount('volumetric_render_update')).toBe(1);
    consumer.stop();
    expect(bus.listenerCount('volumetric_render_update')).toBe(0);
  });

  it('stores indices and opacity per node', () => {
    const bus = new TestBus();
    const consumer = createVolumetricRenderUpdateConsumer({ bus });

    const indices = new Uint32Array([2, 0, 1]);
    bus.emit('volumetric_render_update', {
      node: { id: 'vol-1' },
      indices,
      opacity: 0.75,
    });

    const state = consumer.getState({ id: 'vol-1' });
    expect(state).toBeTruthy();
    expect(state?.nodeId).toBe('vol-1');
    expect(state?.indices).toEqual(indices);
    expect(state?.opacity).toBe(0.75);
    expect(state?.updatedAt).toBeGreaterThan(0);

    consumer.stop();
  });

  it('overrides previous state on repeated updates', () => {
    const bus = new TestBus();
    const consumer = createVolumetricRenderUpdateConsumer({ bus });

    bus.emit('volumetric_render_update', {
      node: { id: 'vol-2' },
      indices: new Uint32Array([0, 1]),
      opacity: 1.0,
    });

    bus.emit('volumetric_render_update', {
      node: { id: 'vol-2' },
      indices: new Uint32Array([1, 0]),
      opacity: 0.5,
    });

    const state = consumer.getState({ id: 'vol-2' });
    expect(state?.indices).toEqual(new Uint32Array([1, 0]));
    expect(state?.opacity).toBe(0.5);

    consumer.stop();
  });

  it('isolates state per node', () => {
    const bus = new TestBus();
    const consumer = createVolumetricRenderUpdateConsumer({ bus });

    bus.emit('volumetric_render_update', {
      node: { id: 'node-a' },
      indices: new Uint32Array([0]),
      opacity: 0.9,
    });

    bus.emit('volumetric_render_update', {
      node: { id: 'node-b' },
      indices: new Uint32Array([1]),
      opacity: 0.3,
    });

    expect(consumer.getState({ id: 'node-a' })?.opacity).toBe(0.9);
    expect(consumer.getState({ id: 'node-b' })?.opacity).toBe(0.3);
    expect(consumer.getAllStates()).toHaveLength(2);

    consumer.stop();
  });

  it('clears all state on clear()', () => {
    const bus = new TestBus();
    const consumer = createVolumetricRenderUpdateConsumer({ bus });

    bus.emit('volumetric_render_update', {
      node: { id: 'vol-3' },
      indices: new Uint32Array([0]),
      opacity: 0.5,
    });

    expect(consumer.getAllStates()).toHaveLength(1);
    consumer.clear();
    expect(consumer.getAllStates()).toHaveLength(0);

    consumer.stop();
  });
});

describe('reorderByIndices', () => {
  it('reorders matrices (16 floats per entry) by index array', () => {
    const src = new Float32Array([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, // matrix 0
      2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1, // matrix 1
      3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1, // matrix 2
    ]);
    const indices = new Uint32Array([2, 0, 1]);
    const out = reorderByIndices(src, indices, 16);

    expect(out[0]).toBe(3); // first entry of matrix 2
    expect(out[16]).toBe(1); // first entry of matrix 0
    expect(out[32]).toBe(2); // first entry of matrix 1
  });

  it('reorders colors (4 floats per entry) by index array', () => {
    const src = new Float32Array([
      0.1, 0.2, 0.3, 0.4, // color 0
      0.5, 0.6, 0.7, 0.8, // color 1
      0.9, 1.0, 0.0, 0.1, // color 2
    ]);
    const indices = new Uint32Array([1, 2, 0]);
    const out = reorderByIndices(src, indices, 4);

    expect(out).toEqual(
      new Float32Array([
        0.5, 0.6, 0.7, 0.8, // color 1
        0.9, 1.0, 0.0, 0.1, // color 2
        0.1, 0.2, 0.3, 0.4, // color 0
      ])
    );
  });

  it('handles single-element arrays', () => {
    const src = new Float32Array([42, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    const indices = new Uint32Array([0]);
    const out = reorderByIndices(src, indices, 16);
    expect(out[0]).toBe(42);
  });
});
