import { describe, expect, it, vi } from 'vitest';
import {
  POINT_CLOUD_TRAIT_EVENTS,
  PointCloudEventConsumer,
  parsePointCloudText,
  type PointCloudEventBus,
} from '../point-cloud/PointCloudEventConsumer';

class TestBus implements PointCloudEventBus {
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

describe('PointCloudEventConsumer', () => {
  it('subscribes to every PointCloudTrait renderer command event', () => {
    const bus = new TestBus();
    const consumer = new PointCloudEventConsumer({
      bus,
      loadText: async () => '',
    });

    consumer.start();

    for (const event of POINT_CLOUD_TRAIT_EVENTS) {
      expect(bus.listenerCount(event), event).toBe(1);
    }
  });

  it('loads an xyz point cloud and emits point_cloud_loaded with an octree handle', async () => {
    const bus = new TestBus();
    const consumer = new PointCloudEventConsumer({
      bus,
      maxPointsPerLeaf: 1,
      loadText: async (source) => {
        expect(source).toBe('/scan.xyz');
        return ['0 0 0 255 0 0', '2 0 0 0 255 0', '0 2 4 0 0 255'].join('\n');
      },
    });
    consumer.start();

    bus.emit('point_cloud_load', {
      node: { id: 'cloud-node' },
      source: '/scan.xyz',
      format: 'xyz',
      maxPoints: 3,
      pointSize: 0.5,
    });

    await vi.waitFor(() => {
      expect(bus.lastPayload('point_cloud_loaded')).toBeTruthy();
    });

    const loaded = bus.lastPayload<{
      pointCount: number;
      boundingBox: { min: [number, number, number]; max: [number, number, number] };
      octree: { pointCount: number; root: { children: unknown[] } };
    }>('point_cloud_loaded');

    expect(loaded?.pointCount).toBe(3);
    expect(loaded?.boundingBox).toEqual({ min: [0, 0, 0], max: [2, 2, 4] });
    expect(loaded?.octree.pointCount).toBe(3);
    expect(loaded?.octree.root.children.length).toBeGreaterThan(0);
    expect(consumer.getHandle({ id: 'cloud-node' })?.pointSize).toBe(0.5);
    expect(bus.lastPayload<{ visibleCount: number }>('point_cloud_visibility_update')?.visibleCount).toBe(3);
  });

  it('updates loaded cloud state from size, color, filter, pick, and destroy events', async () => {
    const bus = new TestBus();
    const consumer = new PointCloudEventConsumer({
      bus,
      loadText: async () => ['0 0 0', '0 0 5', '0 0 10'].join('\n'),
    });
    const node = { id: 'filter-node' };
    consumer.start();
    bus.emit('point_cloud_load', { node, source: '/scan.xyz', format: 'xyz' });

    await vi.waitFor(() => {
      expect(consumer.getHandle(node)).toBeTruthy();
    });

    bus.emit('point_cloud_update_size', { node, size: 2 });
    bus.emit('point_cloud_update_color', { node, mode: 'height' });
    bus.emit('point_cloud_apply_filter', { node, heightRange: [1, 6] });
    bus.emit('point_cloud_ray_pick', {
      node,
      callbackId: 'pick-1',
      origin: [0, 0, -1],
      direction: [0, 0, 1],
    });

    const handle = consumer.getHandle(node);
    expect(handle?.pointSize).toBe(2);
    expect(handle?.colorMode).toBe('height');
    expect(handle?.visiblePoints).toBe(1);
    expect(bus.lastPayload<{ visibleCount: number }>('point_cloud_visibility_update')?.visibleCount).toBe(1);
    expect(bus.lastPayload<{ point: { index: number } }>('point_cloud_pick_result')?.point.index).toBe(0);

    bus.emit('point_cloud_reset_filter', { node });
    expect(consumer.getHandle(node)?.visiblePoints).toBe(3);

    bus.emit('point_cloud_destroy', { node });
    expect(consumer.getHandle(node)).toBeUndefined();
  });

  it('emits load errors for binary formats that need an adapter', async () => {
    const bus = new TestBus();
    const consumer = new PointCloudEventConsumer({
      bus,
      loadText: async () => 'binary',
    });
    consumer.start();

    bus.emit('point_cloud_load', {
      node: 'binary-node',
      source: '/scan.las',
      format: 'las',
    });

    await vi.waitFor(() => {
      expect(bus.lastPayload('point_cloud_load_error')).toBeTruthy();
    });

    expect(bus.lastPayload<{ error: string }>('point_cloud_load_error')?.error).toContain(
      'binary loader adapter'
    );
  });
});

describe('parsePointCloudText', () => {
  it('parses ASCII PLY rows after the header', () => {
    const parsed = parsePointCloudText(
      [
        'ply',
        'format ascii 1.0',
        'element vertex 2',
        'property float x',
        'property float y',
        'property float z',
        'end_header',
        '1 2 3 255 128 0',
        '-1 -2 -3 0 0 255',
      ].join('\n'),
      { source: '/cloud.ply', format: 'ply' }
    );

    expect(parsed.pointCount).toBe(2);
    expect(Array.from(parsed.positions)).toEqual([1, 2, 3, -1, -2, -3]);
    expect(parsed.boundingBox).toEqual({ min: [-1, -2, -3], max: [1, 2, 3] });
    expect(parsed.colors[1]).toBeCloseTo(128 / 255);
  });
});
