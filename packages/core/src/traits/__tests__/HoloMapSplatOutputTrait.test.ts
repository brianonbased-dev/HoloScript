/**
 * HoloMapSplatOutputTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { holomapSplatOutputHandler } from '../HoloMapSplatOutputTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn() });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = {
  format: 'spz' as const,
  spzVersion: '2.0' as const,
  maxSplats: 500_000,
  bakeSphericalHarmonics: false,
};

describe('HoloMapSplatOutputTrait', () => {
  it('has name "holomap_splat_output"', () => {
    expect(holomapSplatOutputHandler.name).toBe('holomap_splat_output');
  });

  it('defaultConfig format is "spz" and maxSplats is 500000', () => {
    expect(holomapSplatOutputHandler.defaultConfig?.format).toBe('spz');
    expect(holomapSplatOutputHandler.defaultConfig?.maxSplats).toBe(500_000);
  });

  it('onAttach emits holomap:splat_output_registered', () => {
    const node = makeNode();
    holomapSplatOutputHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('holomap:splat_output_registered', {});
  });

  it('holomap:finalized emits holomap:splat_bake_requested with config params', () => {
    const node = makeNode();
    holomapSplatOutputHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    holomapSplatOutputHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'holomap:finalized',
      payload: { manifest: { replayHash: 'rh-xyz' } },
    } as never);
    expect(node.emit).toHaveBeenCalledWith('holomap:splat_bake_requested', expect.objectContaining({
      format: 'spz',
      maxSplats: 500_000,
      replayHash: 'rh-xyz',
    }));
  });

  it('unrelated events are ignored', () => {
    const node = makeNode();
    holomapSplatOutputHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    holomapSplatOutputHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'some:other_event',
    } as never);
    expect(node.emit).not.toHaveBeenCalled();
  });
});
