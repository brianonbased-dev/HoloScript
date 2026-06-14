import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { XRLocomotionController } from '../XRLocomotionController';
import { colourForEntity } from '../AgentAvatarTracker';

// Minimal fake renderer — turn()/teleportForward() never touch the XR session,
// only getCamera(), so the F.118 input math is unit-testable headless.
function fakeRenderer(): THREE.WebGLRenderer {
  return {
    xr: {
      addEventListener: () => {},
      removeEventListener: () => {},
      getCamera: () => ({ quaternion: new THREE.Quaternion() }),
      getSession: () => null,
      getReferenceSpace: () => null,
    },
  } as unknown as THREE.WebGLRenderer;
}

const SNAP_30 = (30 * Math.PI) / 180;

describe('XRLocomotionController snap-turn (F.118)', () => {
  it('fires exactly one snap per stick push and re-arms on re-centre', () => {
    const c = new XRLocomotionController({ renderer: fakeRenderer(), snapTurnDeg: 30 });
    c.turn(1, 0.016);
    expect(c.getYaw()).toBeCloseTo(-SNAP_30, 5); // one 30° snap right (yaw decreases)
    c.turn(1, 0.016); // stick still held → no repeat
    expect(c.getYaw()).toBeCloseTo(-SNAP_30, 5);
    c.turn(0, 0.016); // released → re-arm
    c.turn(1, 0.016); // next push snaps again
    expect(c.getYaw()).toBeCloseTo(-2 * SNAP_30, 5);
  });

  it('snaps the opposite way when the stick goes left', () => {
    const c = new XRLocomotionController({ renderer: fakeRenderer() });
    c.turn(-1, 0.016);
    expect(c.getYaw()).toBeCloseTo(SNAP_30, 5); // default 30°, left = +yaw
  });

  it('does not snap below the activation threshold', () => {
    const c = new XRLocomotionController({ renderer: fakeRenderer() });
    c.turn(0.4, 0.016); // partial push, under 0.6
    expect(c.getYaw()).toBe(0);
  });

  it('rotates continuously when snapTurn is disabled', () => {
    const c = new XRLocomotionController({ renderer: fakeRenderer(), snapTurn: false, turnRate: 2 });
    c.turn(1, 0.5);
    expect(c.getYaw()).toBeCloseTo(-1, 5);
    c.turn(1, 0.5); // continuous: keeps accumulating with the stick held
    expect(c.getYaw()).toBeCloseTo(-2, 5);
  });
});

describe('XRLocomotionController teleport (F.118)', () => {
  it('dashes forward by teleportDistance along gaze', () => {
    const c = new XRLocomotionController({ renderer: fakeRenderer(), teleportDistance: 3 });
    c.teleportForward(); // identity camera → forward is -Z
    const p = c.getPosition();
    expect(p.z).toBeCloseTo(-3, 5);
    expect(p.y).toBe(0); // floor-locked
  });
});

describe('colourForEntity (D.094 distinct bodies)', () => {
  it('is deterministic per id', () => {
    expect(colourForEntity('brittney')).toBe(colourForEntity('brittney'));
  });
  it('separates distinct ids', () => {
    expect(colourForEntity('brittney')).not.toBe(colourForEntity('grok1'));
  });
});
