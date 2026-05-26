/**
 * SpectatorCameraCoordinator — Production Test Suite
 *
 * Integration: mount the REAL SpectatorTrait in follow mode with a moving
 * target, tick, and assert the spectator camera transform tracked the target.
 * Fails against the emit-only trait (0 listeners → camera never moves).
 */
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../events';
import {
  SpectatorCameraCoordinator,
  createSpectatorCameraCoordinator,
  type Vec3,
} from '../SpectatorCameraCoordinator';
import { spectatorHandler } from '../../../core/src/traits/SpectatorTrait';

function makeTraitContext(bus: EventBus) {
  const spy = vi.fn((event: string, payload?: unknown) => bus.emit(event, payload));
  return { emit: spy };
}

/** Mount the real SpectatorTrait in follow mode tracking `targetId`. */
function mountFollow(bus: EventBus, targetId = 'player_1') {
  const node: any = { id: 'spectator_1' };
  const ctx = makeTraitContext(bus);
  const cfg = {
    ...spectatorHandler.defaultConfig!,
    camera_mode: 'follow' as const,
    follow_target: targetId,
  };
  spectatorHandler.onAttach!(node, cfg, ctx as any);
  return {
    node,
    ctx,
    tick: () => spectatorHandler.onUpdate!(node, cfg, ctx as any, 0.016),
  };
}

describe('SpectatorCameraCoordinator — Pattern E wiring', () => {
  it('registers a listener for spectator_update_follow (0 before this code)', () => {
    const bus = new EventBus();
    expect(bus.listenerCount('spectator_update_follow')).toBe(0);
    const coord = new SpectatorCameraCoordinator({ bus });
    coord.start();
    expect(bus.listenerCount('spectator_update_follow')).toBeGreaterThan(0);
  });

  it('follow-mode tick repositions the spectator camera to track the target (done-when)', () => {
    const bus = new EventBus();
    const offset: Vec3 = [0, 2, -6];
    const coord = createSpectatorCameraCoordinator({ bus, followOffset: offset, smoothing: 1 });

    const { ctx, tick } = mountFollow(bus, 'player_1');
    coord.setTargetPosition('player_1', [10, 0, 10]);

    expect(coord.getCamera('spectator_1')).toBeUndefined();
    tick();

    expect(ctx.emit).toHaveBeenCalledWith('spectator_update_follow', expect.any(Object));
    const cam = coord.getCamera('spectator_1')!;
    expect(cam).toBeDefined();
    expect(cam.tracking).toBe(true);
    // Camera snapped to target + offset, and looks at the target.
    expect(cam.transform.position).toEqual([10 + 0, 0 + 2, 10 - 6]);
    expect(cam.transform.lookAt).toEqual([10, 0, 10]);
  });

  it('camera follows a MOVING target across ticks', () => {
    const bus = new EventBus();
    const coord = createSpectatorCameraCoordinator({ bus, followOffset: [0, 0, 0], smoothing: 1 });
    const { tick } = mountFollow(bus, 'player_1');

    coord.setTargetPosition('player_1', [0, 0, 0]);
    tick();
    expect(coord.getCameraTransform('spectator_1')!.position).toEqual([0, 0, 0]);

    coord.setTargetPosition('player_1', [5, 1, -3]);
    tick();
    expect(coord.getCameraTransform('spectator_1')!.position).toEqual([5, 1, -3]);
    expect(coord.getCameraTransform('spectator_1')!.lookAt).toEqual([5, 1, -3]);
  });

  it('smoothing < 1 → camera trails the target, approaching monotonically', () => {
    const bus = new EventBus();
    const coord = createSpectatorCameraCoordinator({ bus, followOffset: [0, 0, 0], smoothing: 0.5 });
    const { tick } = mountFollow(bus, 'player_1');
    coord.setTargetPosition('player_1', [100, 0, 0]);

    let prev = 0;
    for (let i = 0; i < 5; i++) {
      tick();
      const x = coord.getCameraTransform('spectator_1')!.position[0];
      expect(x).toBeGreaterThan(prev); // getting closer each tick
      expect(x).toBeLessThanOrEqual(100);
      prev = x;
    }
    expect(prev).toBeGreaterThan(90); // converged most of the way
  });

  it('unknown target position → not tracking yet (graceful)', () => {
    const bus = new EventBus();
    const coord = createSpectatorCameraCoordinator({ bus });
    const { tick } = mountFollow(bus, 'ghost');
    tick(); // no setTargetPosition for 'ghost'
    const cam = coord.getCamera('spectator_1')!;
    expect(cam.updateCount).toBe(1);
    expect(cam.tracking).toBe(false);
  });

  it('free camera mode emits no follow → no camera record', () => {
    const bus = new EventBus();
    const coord = createSpectatorCameraCoordinator({ bus });
    const node: any = { id: 'spectator_1' };
    const ctx = makeTraitContext(bus);
    const cfg = { ...spectatorHandler.defaultConfig! }; // camera_mode defaults to 'free'
    spectatorHandler.onAttach!(node, cfg, ctx as any);
    spectatorHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('spectator_update_follow', expect.any(Object));
    expect(coord.count()).toBe(0);
  });
});
