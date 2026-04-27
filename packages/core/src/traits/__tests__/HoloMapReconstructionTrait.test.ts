/**
 * HoloMapReconstructionTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { holomapReconstructionHandler } from '../HoloMapReconstructionTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __holomapState: undefined as unknown,
});
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
  setState: vi.fn(),
});
const defaultConfig = { source: 'webcam' as const, autoFinalize: true };

describe('HoloMapReconstructionTrait', () => {
  it('has name "holomap_reconstruct"', () => {
    expect(holomapReconstructionHandler.name).toBe('holomap_reconstruct');
  });

  it('defaultConfig source is "webcam" and autoFinalize is true', () => {
    expect(holomapReconstructionHandler.defaultConfig?.source).toBe('webcam');
    expect(holomapReconstructionHandler.defaultConfig?.autoFinalize).toBe(true);
  });

  it('onAttach emits holomap:attached and initializes state', () => {
    const node = makeNode();
    const ctx = makeCtx(node);
    holomapReconstructionHandler.onAttach!(node as never, defaultConfig, ctx as never);
    expect(node.emit).toHaveBeenCalledWith('holomap:attached', expect.objectContaining({
      source: 'webcam',
    }));
    const state = (node as unknown as Record<string, unknown>).__holomapState as {
      isActive: boolean; framesProcessed: number;
    };
    expect(state.isActive).toBe(false);
    expect(state.framesProcessed).toBe(0);
  });

  it('holomap:session_started sets isActive=true and emits reconstruction:session_started', () => {
    const node = makeNode();
    const ctx = makeCtx(node);
    holomapReconstructionHandler.onAttach!(node as never, defaultConfig, ctx as never);
    node.emit.mockClear();
    holomapReconstructionHandler.onEvent!(node as never, defaultConfig, ctx as never, {
      type: 'holomap:session_started',
      payload: { sessionId: 'sess-abc', replayHash: 'hash-123' },
    } as never);
    const state = (node as unknown as Record<string, unknown>).__holomapState as { isActive: boolean };
    expect(state.isActive).toBe(true);
    expect(node.emit).toHaveBeenCalledWith('reconstruction:session_started', expect.anything());
  });
});
