/**
 * SpatialTextLayoutTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { spatialTextLayoutHandler } from '../SpatialTextLayoutTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __spatialTextState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = {
  layout: 'cylinder' as const, radius: 5, letterSpacing: 1.1,
  lineHeight: 1.5, interactive: true, hoverEffect: 'scale' as const,
};

describe('SpatialTextLayoutTrait', () => {
  it('has name "spatial_text_layout"', () => {
    expect(spatialTextLayoutHandler.name).toBe('spatial_text_layout');
  });

  it('onAttach sets initialized state', () => {
    const node = makeNode();
    spatialTextLayoutHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect((node.__spatialTextState as { initialized: boolean }).initialized).toBe(true);
  });

  it('spatial:rotate emits node:rotate', () => {
    const node = makeNode();
    spatialTextLayoutHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    spatialTextLayoutHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'spatial:rotate', target: 'n1', delta: 100,
    } as never);
    expect(node.emit).toHaveBeenCalledWith('node:rotate', expect.objectContaining({ id: 'n1' }));
  });
});
