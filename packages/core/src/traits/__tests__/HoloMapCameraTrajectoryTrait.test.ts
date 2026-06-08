/**
 * HoloMapCameraTrajectoryTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { holomapCameraTrajectoryHandler } from '../HoloMapCameraTrajectoryTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __holomapTrajectoryState: undefined as unknown,
});
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = { historyLength: 1024, emitEveryN: 15 };

describe('HoloMapCameraTrajectoryTrait', () => {
  it('has name "holomap_camera_trajectory"', () => {
    expect(holomapCameraTrajectoryHandler.name).toBe('holomap_camera_trajectory');
  });

  it('defaultConfig historyLength is 1024', () => {
    expect(holomapCameraTrajectoryHandler.defaultConfig?.historyLength).toBe(1024);
  });

  it('onAttach initializes empty poses array', () => {
    const node = makeNode();
    holomapCameraTrajectoryHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = (node as unknown as Record<string, unknown>).__holomapTrajectoryState as {
      poses: unknown[];
      keyframes: unknown[];
      currentFrameIndex: number;
      estimatedDriftMeters: number;
    };
    expect(state.poses).toEqual([]);
    expect(state.keyframes).toEqual([]);
    expect(state.currentFrameIndex).toBe(0);
    expect(state.estimatedDriftMeters).toBe(0);
  });

  it('onDetach removes trajectory state', () => {
    const node = makeNode();
    holomapCameraTrajectoryHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    holomapCameraTrajectoryHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect((node as unknown as Record<string, unknown>).__holomapTrajectoryState).toBeUndefined();
  });

  it('holomap:step_result stores pose and emits trajectory:tick at every emitEveryN frames', () => {
    const node = makeNode();
    holomapCameraTrajectoryHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const fakePose = { position: [0, 0, 0], rotation: [0, 0, 0, 1] };
    for (let i = 0; i < 15; i++) {
      holomapCameraTrajectoryHandler.onEvent!(
        node as never,
        defaultConfig,
        makeCtx(node) as never,
        {
          type: 'holomap:step_result',
          payload: {
            pose: fakePose,
            frameIndex: i,
            trajectory: {
              keyframes: [{ frameIndex: i, pose: fakePose, embedding: new Float32Array([i]) }],
              estimatedDriftMeters: i * 0.1,
            },
          },
        } as never
      );
    }
    const state = (node as unknown as Record<string, unknown>).__holomapTrajectoryState as {
      poses: unknown[];
      keyframes: unknown[];
      estimatedDriftMeters: number;
    };
    expect(state.poses.length).toBe(15);
    expect(state.keyframes.length).toBe(1);
    expect(state.estimatedDriftMeters).toBeCloseTo(1.4);
    expect(node.emit).toHaveBeenCalledWith(
      'trajectory:tick',
      expect.objectContaining({
        frameIndex: 0,
        keyframes: 1,
        estimatedDriftMeters: 0,
      })
    );

    holomapCameraTrajectoryHandler.onEvent!(
      node as never,
      defaultConfig,
      makeCtx(node) as never,
      {
        type: 'holomap:step_result',
        payload: { pose: fakePose, frameIndex: 15, trajectory: { keyframes: [] } },
      } as never
    );
    expect(state.keyframes).toEqual([]);
  });

  it('holomap:step_result does not emit for non-matching events', () => {
    const node = makeNode();
    holomapCameraTrajectoryHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    holomapCameraTrajectoryHandler.onEvent!(
      node as never,
      defaultConfig,
      makeCtx(node) as never,
      {
        type: 'other:event',
      } as never
    );
    expect(node.emit).not.toHaveBeenCalled();
  });
});
