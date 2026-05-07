import { describe, expect, it } from 'vitest';
import {
  SPATIAL_CONTEXT_VERSION,
  SPATIAL_FRAME,
  pickPlacement,
  validateSpatialContext,
  type SpatialMCPContext,
} from '../spatial-context';

const IDENTITY_QUAT = { x: 0, y: 0, z: 0, w: 1 };

function baseContext(overrides: Partial<SpatialMCPContext> = {}): SpatialMCPContext {
  return {
    version: SPATIAL_CONTEXT_VERSION,
    frame: SPATIAL_FRAME,
    ...overrides,
  };
}

describe('validateSpatialContext', () => {
  it('accepts a minimal valid spatial context', () => {
    const result = validateSpatialContext(baseContext());
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it('rejects unknown versions, frames, non-finite numbers, and out-of-range hands', () => {
    const result = validateSpatialContext({
      version: '9.0',
      frame: 'feet-y-down',
      gaze: { origin: [0, 0, 0], direction: [0, 0, 2], hitDistance: Infinity },
      hands: {
        right: {
          position: [0, 0, 0],
          rotation: IDENTITY_QUAT,
          grip: 1.2,
          pinch: -0.1,
        },
      },
      room: { floorHeight: Number.NaN },
    });

    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.path)).toEqual(
      expect.arrayContaining([
        'version',
        'frame',
        'gaze.direction',
        'gaze.hitDistance',
        'hands.right.grip',
        'hands.right.pinch',
        'room.floorHeight',
      ])
    );
  });

  it('rejects malformed optional pose payloads without rejecting omitted fields', () => {
    const valid = validateSpatialContext(baseContext({ hands: {}, controllers: {} }));
    expect(valid.ok).toBe(true);

    const invalid = validateSpatialContext(
      baseContext({
        headset: { position: [0, 0, Number.POSITIVE_INFINITY], rotation: IDENTITY_QUAT },
        controllers: {
          left: {
            position: [0, 0, 0],
            rotation: { x: 0, y: 0, z: 0, w: Number.NaN },
          },
        },
      })
    );

    expect(invalid.ok).toBe(false);
    expect(invalid.errors.map((e) => e.path)).toEqual(
      expect.arrayContaining(['headset.position', 'controllers.left.rotation'])
    );
  });
});

describe('pickPlacement', () => {
  it('prefers gaze hit placement when hit distance is present', () => {
    const choice = pickPlacement(
      baseContext({
        gaze: {
          origin: [1, 2, 3],
          direction: [0, 0, -1],
          hitDistance: 2.5,
        },
        hands: {
          right: { position: [9, 9, 9], rotation: IDENTITY_QUAT, grip: 1 },
        },
      })
    );

    expect(choice.source).toBe('gaze-hit');
    expect(choice.position).toEqual([1, 2, 0.5]);
  });

  it('falls back through hands, room center, headset, then origin', () => {
    expect(
      pickPlacement(
        baseContext({
          hands: { left: { position: [1, 0, 0], rotation: IDENTITY_QUAT, grip: 0.5 } },
        })
      )
    ).toEqual({ source: 'hand-left', position: [1, 0, 0] });

    expect(
      pickPlacement(
        baseContext({
          room: { aabb: { min: [-2, 0, 2], max: [2, 4, 6] } },
        })
      )
    ).toEqual({ source: 'aabb-center', position: [0, 2, 4] });

    expect(
      pickPlacement(baseContext({ headset: { position: [0, 1.6, 0], rotation: IDENTITY_QUAT } }))
    ).toEqual({ source: 'headset', position: [0, 1.6, 0] });

    expect(pickPlacement(baseContext())).toEqual({ source: 'origin', position: [0, 0, 0] });
  });
});
