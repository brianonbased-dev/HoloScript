/**
 * SpatialProfilerTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { spatialProfilerHandler } from '../SpatialProfilerTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __profState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { sample_rate_ms: 16 };

describe('SpatialProfilerTrait', () => {
  it('has name "spatial_profiler"', () => {
    expect(spatialProfilerHandler.name).toBe('spatial_profiler');
  });

  it('prof:start emits prof:started', () => {
    const node = makeNode();
    spatialProfilerHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    spatialProfilerHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'prof:start',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('prof:started', {});
  });
});
