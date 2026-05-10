/**
 * HoloMapReconstructionTrait — tests with runtime binding
 */
import { describe, it, expect, vi } from 'vitest';
import { holomapReconstructionHandler } from '../HoloMapReconstructionTrait';
import type { ReconstructionFrame } from '../../reconstruction/HoloMapRuntime';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __holomapState: undefined as unknown,
  __holomapRuntime: null,
});

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
  setState: vi.fn(),
});

const defaultConfig = { source: 'webcam' as const, autoFinalize: true };

/** Flush microtask queue so fire-and-forget trait async callbacks execute. */
const tick = () => new Promise<void>((r) => setTimeout(r, 10));

function makeFrame(index = 0): ReconstructionFrame {
  return {
    index,
    timestampMs: index * 33,
    rgb: new Uint8Array([128, 64, 32, 255]),
    width: 1,
    height: 1,
    stride: 4,
  };
}

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

  // ── Runtime binding ────────────────────────────────────────────────────────

  it('holomap:start_session creates a runtime and emits session_started', async () => {
    const node = makeNode();
    const ctx = makeCtx(node);
    holomapReconstructionHandler.onAttach!(node as never, defaultConfig, ctx as never);
    node.emit.mockClear();

    holomapReconstructionHandler.onEvent!(node as never, defaultConfig, ctx as never, {
      type: 'holomap:start_session',
      payload: { sessionId: 'sess-abc', seed: 42, modelHash: 'test-model' },
    } as never);

    await tick();

    const state = (node as unknown as Record<string, unknown>).__holomapState as {
      isActive: boolean; sessionId: string; replayHash: string;
    };
    expect(state.isActive).toBe(true);
    expect(state.sessionId).toBe('sess-abc');
    expect(state.replayHash).toBeDefined();
    expect(state.replayHash!.length).toBeGreaterThan(8);

    expect(node.emit).toHaveBeenCalledWith('holomap:session_started', expect.anything());
    expect(node.emit).toHaveBeenCalledWith('reconstruction:session_started', expect.anything());
  });

  it('holomap:frame produces holomap:step_result and reconstruction:progress', async () => {
    const node = makeNode();
    const ctx = makeCtx(node);
    holomapReconstructionHandler.onAttach!(node as never, defaultConfig, ctx as never);

    // Start session
    holomapReconstructionHandler.onEvent!(node as never, defaultConfig, ctx as never, {
      type: 'holomap:start_session',
      payload: { sessionId: 'sess-frame', seed: 7, modelHash: 'frame-test', targetFPS: 10000 },
    } as never);
    await tick();
    node.emit.mockClear();

    // Push frame
    holomapReconstructionHandler.onEvent!(node as never, defaultConfig, ctx as never, {
      type: 'holomap:frame',
      payload: { frame: makeFrame(0) },
    } as never);
    await tick();

    expect(node.emit).toHaveBeenCalledWith(
      'holomap:step_result',
      expect.objectContaining({ frameIndex: 0, pose: expect.anything() })
    );
    expect(node.emit).toHaveBeenCalledWith(
      'reconstruction:progress',
      expect.objectContaining({ framesProcessed: expect.any(Number) })
    );

    const state = (node as unknown as Record<string, unknown>).__holomapState as {
      framesProcessed: number;
    };
    expect(state.framesProcessed).toBeGreaterThanOrEqual(1);
  });

  it('holomap:finalize produces manifest and disposes runtime', async () => {
    const node = makeNode();
    const ctx = makeCtx(node);
    holomapReconstructionHandler.onAttach!(node as never, defaultConfig, ctx as never);

    holomapReconstructionHandler.onEvent!(node as never, defaultConfig, ctx as never, {
      type: 'holomap:start_session',
      payload: { sessionId: 'sess-fin', seed: 1, modelHash: 'fin-test', targetFPS: 10000 },
    } as never);
    await tick();

    holomapReconstructionHandler.onEvent!(node as never, defaultConfig, ctx as never, {
      type: 'holomap:frame',
      payload: { frame: makeFrame(0) },
    } as never);
    await tick();
    node.emit.mockClear();

    holomapReconstructionHandler.onEvent!(node as never, defaultConfig, ctx as never, {
      type: 'holomap:finalize',
      payload: {},
    } as never);
    await tick();

    expect(node.emit).toHaveBeenCalledWith(
      'holomap:finalized',
      expect.objectContaining({ manifest: expect.anything() })
    );
    expect(node.emit).toHaveBeenCalledWith(
      'reconstruction:manifest',
      expect.objectContaining({ replayHash: expect.any(String) })
    );

    const state = (node as unknown as Record<string, unknown>).__holomapState as {
      isActive: boolean; lastManifest: unknown;
    };
    expect(state.isActive).toBe(false);
    expect(state.lastManifest).not.toBeNull();
  });

  it('emits error when frame arrives without active session', async () => {
    const node = makeNode();
    const ctx = makeCtx(node);
    holomapReconstructionHandler.onAttach!(node as never, defaultConfig, ctx as never);
    node.emit.mockClear();

    holomapReconstructionHandler.onEvent!(node as never, defaultConfig, ctx as never, {
      type: 'holomap:frame',
      payload: { frame: makeFrame(0) },
    } as never);
    await tick();

    expect(node.emit).toHaveBeenCalledWith(
      'holomap:error',
      expect.objectContaining({ message: expect.stringContaining('not ready') })
    );
  });

  it('emits error when frame payload is invalid', async () => {
    const node = makeNode();
    const ctx = makeCtx(node);
    holomapReconstructionHandler.onAttach!(node as never, defaultConfig, ctx as never);

    holomapReconstructionHandler.onEvent!(node as never, defaultConfig, ctx as never, {
      type: 'holomap:start_session',
      payload: { sessionId: 'sess-bad', seed: 0, modelHash: 'bad', targetFPS: 10000 },
    } as never);
    await tick();
    node.emit.mockClear();

    holomapReconstructionHandler.onEvent!(node as never, defaultConfig, ctx as never, {
      type: 'holomap:frame',
      payload: { frame: { notAFrame: true } },
    } as never);
    await tick();

    expect(node.emit).toHaveBeenCalledWith(
      'holomap:error',
      expect.objectContaining({ message: expect.stringContaining('Invalid or missing') })
    );
  });

  // ── Backward compat ──────────────────────────────────────────────────────

  it('legacy holomap:session_started passthrough still works', () => {
    const node = makeNode();
    const ctx = makeCtx(node);
    holomapReconstructionHandler.onAttach!(node as never, defaultConfig, ctx as never);
    node.emit.mockClear();
    holomapReconstructionHandler.onEvent!(node as never, defaultConfig, ctx as never, {
      type: 'holomap:session_started',
      payload: { sessionId: 'legacy-sess', replayHash: 'legacy-hash' },
    } as never);
    const state = (node as unknown as Record<string, unknown>).__holomapState as { isActive: boolean };
    expect(state.isActive).toBe(true);
    expect(node.emit).toHaveBeenCalledWith('reconstruction:session_started', expect.anything());
  });

  it('legacy holomap:step_result passthrough increments framesProcessed', () => {
    const node = makeNode();
    const ctx = makeCtx(node);
    holomapReconstructionHandler.onAttach!(node as never, defaultConfig, ctx as never);
    holomapReconstructionHandler.onEvent!(node as never, defaultConfig, ctx as never, {
      type: 'holomap:step_result',
      payload: { frameIndex: 5 },
    } as never);
    const state = (node as unknown as Record<string, unknown>).__holomapState as { framesProcessed: number };
    expect(state.framesProcessed).toBe(6);
    expect(node.emit).toHaveBeenCalledWith('reconstruction:progress', expect.anything());
  });

  it('legacy holomap:finalized passthrough stores manifest', () => {
    const node = makeNode();
    const ctx = makeCtx(node);
    holomapReconstructionHandler.onAttach!(node as never, defaultConfig, ctx as never);
    holomapReconstructionHandler.onEvent!(node as never, defaultConfig, ctx as never, {
      type: 'holomap:finalized',
      payload: { manifest: { replayHash: 'abc' } },
    } as never);
    const state = (node as unknown as Record<string, unknown>).__holomapState as {
      isActive: boolean; lastManifest: { replayHash: string } | null;
    };
    expect(state.isActive).toBe(false);
    expect(state.lastManifest?.replayHash).toBe('abc');
  });

  it('onDetach emits holomap:detached and cleans state', async () => {
    const node = makeNode();
    const ctx = makeCtx(node);
    holomapReconstructionHandler.onAttach!(node as never, defaultConfig, ctx as never);
    holomapReconstructionHandler.onDetach!(node as never, defaultConfig, ctx as never);
    expect(node.emit).toHaveBeenCalledWith('holomap:detached', expect.anything());
    expect((node as unknown as Record<string, unknown>).__holomapState).toBeUndefined();
  });
});
