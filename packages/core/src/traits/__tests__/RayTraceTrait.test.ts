/**
 * RayTraceTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { rayTraceHandler } from '../RayTraceTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __rtState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_bounces: 4, samples_per_pixel: 1 };

describe('RayTraceTrait', () => {
  it('has name "ray_trace"', () => {
    expect(rayTraceHandler.name).toBe('ray_trace');
  });

  it('rt:cast emits rt:result', () => {
    const node = makeNode();
    rayTraceHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    rayTraceHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'rt:cast', origin: [0,0,0], direction: [0,0,1],
    } as never);
    expect(node.emit).toHaveBeenCalledWith('rt:result', expect.objectContaining({ maxBounces: 4 }));
  });

  it('rt:hit emits rt:hit_result', () => {
    const node = makeNode();
    rayTraceHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    rayTraceHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'rt:hit', hitPoint: [1,0,0], normal: [0,1,0], distance: 2,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('rt:hit_result', expect.objectContaining({ totalHits: 1 }));
  });
});
