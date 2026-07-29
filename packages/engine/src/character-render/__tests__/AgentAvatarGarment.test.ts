import { describe, expect, it } from 'vitest';
import { buildAgentAvatarGarment } from '../AgentAvatarGarment';
import { buildAgentAvatarMesh } from '../AgentAvatarMesh';

const RADIAL_SEGMENTS = 24;
const TUNIC_RING_COUNT = 8;

function pointAt(positions: Float32Array, vertex: number): [number, number, number] {
  const offset = vertex * 3;
  return [positions[offset], positions[offset + 1], positions[offset + 2]];
}

function outwardClearance(
  bodyPoint: [number, number, number],
  garmentPoint: [number, number, number]
): number {
  const radialLength = Math.hypot(bodyPoint[0], bodyPoint[2]);
  const outwardX = bodyPoint[0] / radialLength;
  const outwardZ = bodyPoint[2] / radialLength;
  return (garmentPoint[0] - bodyPoint[0]) * outwardX + (garmentPoint[2] - bodyPoint[2]) * outwardZ;
}

describe('AgentAvatarGarment — coherent upper-body fit', () => {
  it('emits a pose-proofable tunic range fitted to authored torso proportions', () => {
    const buildScale = 1.08;
    const heightScale = 1.88 / 1.75;
    const shoulderScale = 1.13;
    const torsoScale = 0.98;
    const body = buildAgentAvatarMesh({
      buildScale,
      heightScale,
      shoulderScale,
      torsoScale,
      upperBodyProfile: 'coherent-shoulder-neck-torso-v1',
      upperBodyRadialSegments: RADIAL_SEGMENTS,
    });
    const garment = buildAgentAvatarGarment({
      style: 'stormglass_open_civic_tunic',
      buildScale,
      heightScale,
      shoulderScale,
      torsoScale,
      radialSegments: RADIAL_SEGMENTS,
    });

    expect(garment.receipt).toMatchObject({
      fitProfile: 'coherent-upper-body-clearance-v1',
      torsoScale,
      shoulderScale,
      tunicIndexRange: {
        indexStart: 0,
        indexCount: (TUNIC_RING_COUNT - 1) * RADIAL_SEGMENTS * 6,
      },
    });

    const upperBody = body.anatomy.upperBody;
    expect(upperBody).toBeDefined();
    if (!upperBody) return;

    // Rings 0..6 are the continuously covered torso. For each angular sample, interpolate
    // between the two authored tunic rings that straddle the body ring and measure clearance
    // along the body's outward radial. This is a bind-space regression floor; the HoloLand
    // pose matrix supplies the articulated triangle/ray proof.
    for (let bodyRing = 0; bodyRing <= 6; bodyRing += 1) {
      for (let segment = 0; segment < RADIAL_SEGMENTS; segment += 1) {
        const bodyPoint = pointAt(
          body.positions,
          upperBody.vertexRange.vertexStart + bodyRing * RADIAL_SEGMENTS + segment
        );
        let lowerRing = 0;
        while (lowerRing < TUNIC_RING_COUNT - 2) {
          const upperY = pointAt(
            garment.cloth.positions,
            (lowerRing + 1) * RADIAL_SEGMENTS + segment
          )[1];
          if (bodyPoint[1] <= upperY) break;
          lowerRing++;
        }
        const lower = pointAt(garment.cloth.positions, lowerRing * RADIAL_SEGMENTS + segment);
        const upper = pointAt(garment.cloth.positions, (lowerRing + 1) * RADIAL_SEGMENTS + segment);
        const t = Math.max(
          0,
          Math.min(1, (bodyPoint[1] - lower[1]) / Math.max(upper[1] - lower[1], 1e-6))
        );
        const garmentPoint: [number, number, number] = [
          lower[0] + (upper[0] - lower[0]) * t,
          bodyPoint[1],
          lower[2] + (upper[2] - lower[2]) * t,
        ];
        expect(outwardClearance(bodyPoint, garmentPoint)).toBeGreaterThanOrEqual(0.015);
      }
    }
  });

  it('keeps the hooded preset on its existing shell fit', () => {
    const garment = buildAgentAvatarGarment({
      style: 'stormglass_hooded_tunic',
      buildScale: 1.04,
      heightScale: 1.02,
      torsoScale: 1.1,
      shoulderScale: 1.2,
      radialSegments: 14,
    });

    expect(garment.receipt.fitProfile).toBe('legacy-shell-v1');
    expect(garment.receipt.tunicIndexRange).toEqual({
      indexStart: 0,
      indexCount: (TUNIC_RING_COUNT - 1) * 14 * 6,
    });
  });

  it('tailors the open collar and sleeve silhouette to the coherent upper limbs', () => {
    const garment = buildAgentAvatarGarment({
      style: 'stormglass_open_civic_tunic',
      buildScale: 1,
      heightScale: 1,
      torsoScale: 0.96,
      shoulderScale: 1.1,
      radialSegments: 20,
    });

    expect(garment.receipt).toMatchObject({
      fitProfile: 'coherent-upper-body-clearance-v1',
      collarProfile: 'tailored-open-v-collar-v1',
      shoulderShellHalfWidth: 0.352,
      sleeveRootRadius: 0.086,
      sleeveWristRadius: 0.047,
    });
    expect(garment.receipt.shoulderShellHalfWidth).toBeLessThan(0.4);
    expect(garment.receipt.sleeveRootRadius).toBeLessThan(0.1);
    expect(garment.receipt.sleeveWristRadius).toBeLessThan(
      garment.receipt.sleeveRootRadius
    );
  });
});
