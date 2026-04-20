import { describe, expect, it } from 'vitest';
import {
  holomapReconstructionHandler,
  type HoloMapReconstructionState,
} from '../../traits/HoloMapReconstructionTrait';
import { holomapCameraTrajectoryHandler } from '../../traits/HoloMapCameraTrajectoryTrait';
import { holomapDriftCorrectionHandler } from '../../traits/HoloMapDriftCorrectionTrait';
import { holomapAnchorContextHandler } from '../../traits/HoloMapAnchorContextTrait';
import { holomapSplatOutputHandler } from '../../traits/HoloMapSplatOutputTrait';

type Emitted = { event: string; payload: unknown };

function makeNode(id = 'holomap-node') {
  return { id, properties: {} } as Record<string, unknown>;
}

function makeContext() {
  const emitted: Emitted[] = [];
  const state: Record<string, unknown> = {};
  return {
    vr: {} as never,
    physics: {} as never,
    audio: {} as never,
    haptics: {} as never,
    emit: (event: string, payload?: unknown) => emitted.push({ event, payload }),
    getState: () => state,
    setState: (updates: Record<string, unknown>) => Object.assign(state, updates),
    getScaleMultiplier: () => 1,
    setScaleContext: () => {},
    emitted,
    state,
  };
}

describe('HoloMap trait integration wiring', () => {
  it('reconstruction handler tracks session, progress, finalize, and errors', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = { ...holomapReconstructionHandler.defaultConfig };

    holomapReconstructionHandler.onAttach?.(node as never, config as never, ctx as never);
    holomapReconstructionHandler.onEvent?.(node as never, config as never, ctx as never, {
      type: 'holomap:session_started',
      payload: { sessionId: 'sess-42', replayHash: 'fp-42' },
    });
    holomapReconstructionHandler.onEvent?.(node as never, config as never, ctx as never, {
      type: 'holomap:step_result',
      payload: { frameIndex: 3 },
    });
    holomapReconstructionHandler.onEvent?.(node as never, config as never, ctx as never, {
      type: 'holomap:finalized',
      payload: { manifest: { replayHash: 'fp-42' } },
    });

    const state = (node.__holomapState as HoloMapReconstructionState | undefined)!;
    expect(state.isActive).toBe(false);
    expect(state.sessionId).toBe('sess-42');
    expect(state.replayHash).toBe('fp-42');
    expect(state.framesProcessed).toBe(4);
    expect(ctx.emitted.some((e) => e.event === 'reconstruction:session_started')).toBe(true);
    expect(ctx.emitted.some((e) => e.event === 'reconstruction:progress')).toBe(true);
    expect(ctx.emitted.some((e) => e.event === 'reconstruction:manifest')).toBe(true);

    holomapReconstructionHandler.onEvent?.(node as never, config as never, ctx as never, {
      type: 'holomap:error',
      payload: { message: 'boom' },
    });
    expect(state.lastError).toBe('boom');
    expect(ctx.emitted.some((e) => e.event === 'reconstruction:error')).toBe(true);
  });

  it('trajectory handler retains poses and emits ticks on cadence', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = { historyLength: 2, emitEveryN: 2 };

    holomapCameraTrajectoryHandler.onAttach?.(node as never, config as never, ctx as never);
    for (let i = 0; i < 3; i += 1) {
      holomapCameraTrajectoryHandler.onEvent?.(node as never, config as never, ctx as never, {
        type: 'holomap:step_result',
        payload: {
          frameIndex: i,
          pose: {
            position: [i, i + 1, i + 2],
            rotation: [0, 0, 0, 1],
            confidence: 0.9,
          },
        },
      });
    }

    const state = node.__holomapTrajectoryState as { poses: unknown[]; currentFrameIndex: number };
    expect(state.currentFrameIndex).toBe(2);
    expect(state.poses).toHaveLength(2);
    expect(ctx.emitted.some((e) => e.event === 'trajectory:tick')).toBe(true);
  });

  it('drift and anchor handlers request correction/reanchor when thresholds are exceeded', () => {
    const node = makeNode();
    const ctx = makeContext();

    holomapDriftCorrectionHandler.onAttach?.(
      node as never,
      { maxDriftMeters: 1, loopClosureThreshold: 0.92, rewriteHistory: true } as never,
      ctx as never,
    );
    holomapDriftCorrectionHandler.onEvent?.(
      node as never,
      { maxDriftMeters: 1, loopClosureThreshold: 0.92, rewriteHistory: true } as never,
      ctx as never,
      { type: 'holomap:drift_update', payload: { estimatedDriftMeters: 1.5 } },
    );

    holomapAnchorContextHandler.onEvent?.(
      node as never,
      { autoReanchor: true } as never,
      ctx as never,
      {
        type: 'holomap:drift_update',
        payload: { estimatedDriftMeters: 2.5, maxDriftBeforeReanchor: 2.0 },
      },
    );

    expect(ctx.emitted.some((e) => e.event === 'holomap:drift_correction_requested')).toBe(true);
    expect(ctx.emitted.some((e) => e.event === 'holomap:reanchor_requested')).toBe(true);
  });

  it('splat output handler emits bake request on finalized session', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = { ...holomapSplatOutputHandler.defaultConfig };

    holomapSplatOutputHandler.onAttach?.(node as never, config as never, ctx as never);
    holomapSplatOutputHandler.onEvent?.(node as never, config as never, ctx as never, {
      type: 'holomap:finalized',
      payload: { manifest: { replayHash: 'fp-splat' } },
    });

    expect(ctx.emitted.some((e) => e.event === 'holomap:splat_output_registered')).toBe(true);
    expect(ctx.emitted.some((e) => e.event === 'holomap:splat_bake_requested')).toBe(true);
  });
});
