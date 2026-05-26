/**
 * AccessoryTrackingProvider — Production Test Suite
 *
 * Integration: attach the REAL SpatialAccessoryTrait (connected), tick to emit
 * accessory_request_pose, let the provider resolve a pose and write it back via
 * accessory_pose_update, and assert node pose state updated. Fails against the
 * no-listener stub (request emitted, never resolved → pose never updates).
 */
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../events';
import {
  AccessoryTrackingProvider,
  createAccessoryTrackingProvider,
  projectPoseForMode,
  type Pose,
} from '../AccessoryTrackingProvider';
import { spatialAccessoryHandler } from '../../../core/src/traits/SpatialAccessoryTrait';

function makeTraitContext(bus: EventBus) {
  const spy = vi.fn((event: string, payload?: unknown) => bus.emit(event, payload));
  return { emit: spy };
}

/**
 * Mount the real trait connected, and bridge accessory_pose_update from the bus
 * back into the trait's onEvent (the runtime trait-event bridge does this in
 * production; wired explicitly here).
 */
function mountConnected(bus: EventBus, trackingMode: any = 'optical', nodeId = 'acc_1') {
  const node: any = { id: nodeId };
  const ctx = makeTraitContext(bus);
  const cfg = { ...spatialAccessoryHandler.defaultConfig!, tracking_mode: trackingMode };
  spatialAccessoryHandler.onAttach!(node, cfg, ctx as any);
  node.__spatialAccessoryState.isConnected = true;

  bus.on('accessory_pose_update', (e: any) => {
    spatialAccessoryHandler.onEvent!(node, cfg, ctx as any, {
      type: 'accessory_pose_update',
      pose: e.pose,
    });
  });

  return {
    node,
    ctx,
    cfg,
    tick: () => spatialAccessoryHandler.onUpdate!(node, cfg, ctx as any, 0.016),
  };
}

const RAW: Pose = { position: [1, 2, 3], rotation: [0.1, 0.2, 0.3, 0.9] };

describe('projectPoseForMode — tracking-mode projection', () => {
  it('full_6dof keeps both position and rotation', () => {
    expect(projectPoseForMode(RAW, 'full_6dof')).toEqual(RAW);
  });
  it('rotation_only zeroes position', () => {
    expect(projectPoseForMode(RAW, 'rotation_only')).toEqual({
      position: [0, 0, 0],
      rotation: RAW.rotation,
    });
  });
  it('position_only resets rotation to identity', () => {
    expect(projectPoseForMode(RAW, 'position_only')).toEqual({
      position: RAW.position,
      rotation: [0, 0, 0, 1],
    });
  });
});

describe('AccessoryTrackingProvider — Pattern E wiring', () => {
  it('registers a listener for accessory_request_pose (0 before this code)', () => {
    const bus = new EventBus();
    expect(bus.listenerCount('accessory_request_pose')).toBe(0);
    const provider = new AccessoryTrackingProvider({ bus });
    provider.start();
    expect(bus.listenerCount('accessory_request_pose')).toBeGreaterThan(0);
  });

  it('connected trait tick resolves a pose and node pose state updates (the done-when)', () => {
    const bus = new EventBus();
    const provider = createAccessoryTrackingProvider({ bus, rawPoseSource: () => RAW });
    const { node, ctx, tick } = mountConnected(bus, 'optical', 'acc_1');

    // Pre-tick: pose is identity, provider has no record.
    expect(node.__spatialAccessoryState.lastPose.position).toEqual([0, 0, 0]);
    expect(provider.requestCount('acc_1')).toBe(0);

    tick();

    // Provider responded to the request…
    expect(ctx.emit).toHaveBeenCalledWith('accessory_request_pose', expect.any(Object));
    expect(provider.requestCount('acc_1')).toBe(1);
    expect(provider.getResolvedPose('acc_1')).toEqual(RAW);
    // …and node pose state updated via the write-back.
    expect(node.__spatialAccessoryState.lastPose).toEqual(RAW);
    // …and the trait surfaced it for the attach point.
    expect(ctx.emit).toHaveBeenCalledWith('accessory_apply_pose', expect.objectContaining({
      position: RAW.position,
      rotation: RAW.rotation,
    }));
  });

  it('honors trackingMode: rotation_only zeroes the written-back position', () => {
    const bus = new EventBus();
    createAccessoryTrackingProvider({ bus, rawPoseSource: () => RAW });
    const { node, tick } = mountConnected(bus, 'rotation_only', 'acc_1');
    tick();
    expect(node.__spatialAccessoryState.lastPose.position).toEqual([0, 0, 0]);
    expect(node.__spatialAccessoryState.lastPose.rotation).toEqual(RAW.rotation);
  });

  it('disconnected accessory emits no request → no pose resolution', () => {
    const bus = new EventBus();
    const provider = createAccessoryTrackingProvider({ bus, rawPoseSource: () => RAW });
    const node: any = { id: 'acc_1' };
    const ctx = makeTraitContext(bus);
    const cfg = { ...spatialAccessoryHandler.defaultConfig! };
    spatialAccessoryHandler.onAttach!(node, cfg, ctx as any);
    // isConnected stays false.
    spatialAccessoryHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('accessory_request_pose', expect.any(Object));
    expect(provider.requestCount('acc_1')).toBe(0);
  });

  it('tracks pose across repeated ticks (live updates)', () => {
    const bus = new EventBus();
    let raw: Pose = { position: [0, 0, 0], rotation: [0, 0, 0, 1] };
    const provider = createAccessoryTrackingProvider({ bus, rawPoseSource: () => raw });
    const { node, tick } = mountConnected(bus, 'full_6dof', 'acc_1');

    raw = { position: [5, 0, 0], rotation: [0, 0, 0, 1] };
    tick();
    expect(node.__spatialAccessoryState.lastPose.position).toEqual([5, 0, 0]);

    raw = { position: [5, 6, 7], rotation: [0, 0, 0, 1] };
    tick();
    expect(node.__spatialAccessoryState.lastPose.position).toEqual([5, 6, 7]);
    expect(provider.requestCount('acc_1')).toBe(2);
  });
});
