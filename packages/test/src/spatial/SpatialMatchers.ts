/**
 * SpatialMatchers — vitest custom matchers for spatial assertions in HoloTest
 *
 * Usage in vitest test file:
 *   import { setupSpatialMatchers } from '@holoscript/test/spatial';
 *   setupSpatialMatchers();
 *
 *   // OR — in vitest.config.ts setupFiles:
 *   import '@holoscript/test/spatial/setup';
 *
 * Then in tests:
 *   expect(entity).toBeWithinVolume(roomBounds);
 *   expect(crateA).not.toIntersect(crateB);
 */

import { expect } from 'vitest';
import { BoundingBox } from './BoundingBox';
import { SpatialEntity } from './SpatialEntity';

type SpatialReceiver = SpatialEntity | BoundingBox;

function toBounds(v: SpatialReceiver): BoundingBox {
  return v instanceof SpatialEntity ? v.bounds : v;
}

function label(v: SpatialReceiver): string {
  if (v instanceof SpatialEntity) return `entity '${v.id}'`;
  return `BoundingBox(${v.min.x},${v.min.y},${v.min.z} → ${v.max.x},${v.max.y},${v.max.z})`;
}

// ── Matcher implementations ────────────────────────────────────────────────

const spatialMatchers = {
  /**
   * Assert that an entity's AABB is fully contained within the given BoundingBox.
   *
   * @example
   *   expect(player).toBeWithinVolume(roomBounds);
   */
  toBeWithinVolume(
    this: { isNot: boolean },
    received: SpatialReceiver,
    container: BoundingBox
  ) {
    const b = toBounds(received);
    const pass =
      container.contains(b.min) &&
      container.contains(b.max);

    if (pass) {
      return {
        pass: true,
        message: () =>
          `Expected ${label(received)} NOT to be fully within ${container}, but it was.`,
      };
    }

    // Build informative failure message
    const violations: string[] = [];
    if (b.min.x < container.min.x) violations.push(`min.x (${b.min.x}) < container.min.x (${container.min.x})`);
    if (b.min.y < container.min.y) violations.push(`min.y (${b.min.y}) < container.min.y (${container.min.y})`);
    if (b.min.z < container.min.z) violations.push(`min.z (${b.min.z}) < container.min.z (${container.min.z})`);
    if (b.max.x > container.max.x) violations.push(`max.x (${b.max.x}) > container.max.x (${container.max.x})`);
    if (b.max.y > container.max.y) violations.push(`max.y (${b.max.y}) > container.max.y (${container.max.y})`);
    if (b.max.z > container.max.z) violations.push(`max.z (${b.max.z}) > container.max.z (${container.max.z})`);

    return {
      pass: false,
      message: () =>
        [
          `Expected ${label(received)} to be fully within ${container}.`,
          `Violations:`,
          ...violations.map((v) => `  · ${v}`),
        ].join('\n'),
    };
  },

  /**
   * Assert that two spatial objects have overlapping AABBs.
   *
   * Use `.not.toIntersect` to assert no clipping.
   *
   * @example
   *   expect(crateA).not.toIntersect(crateB);       // no clipping
   *   expect(bullet).toIntersect(targetEntity);     // hit detection
   */
  toIntersect(
    this: { isNot: boolean },
    received: SpatialReceiver,
    other: SpatialReceiver
  ) {
    const bA = toBounds(received);
    const bB = toBounds(other);
    const pass = bA.intersects(bB);
    const vol = bA.intersectionVolume(bB);
    const pen = bA.penetrationDepth(bB);

    if (pass) {
      return {
        pass: true,
        message: () => {
          const lines = [
            `Expected ${label(received)} NOT to intersect ${label(other)}, but they overlap.`,
            `  Intersection volume: ${vol.toFixed(4)} m³`,
          ];
          if (Math.abs(pen.y) <= Math.abs(pen.x) && Math.abs(pen.y) <= Math.abs(pen.z)) {
            lines.push(`  Smallest separation axis: Y — adjust by ${pen.y.toFixed(4)} m`);
          } else if (Math.abs(pen.x) <= Math.abs(pen.z)) {
            lines.push(`  Smallest separation axis: X — adjust by ${pen.x.toFixed(4)} m`);
          } else {
            lines.push(`  Smallest separation axis: Z — adjust by ${pen.z.toFixed(4)} m`);
          }
          return lines.join('\n');
        },
      };
    }

    return {
      pass: false,
      message: () =>
        `Expected ${label(received)} to intersect ${label(other)}, but they do not overlap.`,
    };
  },

  /**
   * Assert that the intersection volume between two spatial objects equals
   * the expected value (within a tolerance of ±0.001 m³ by default).
   *
   * @example
   *   expect(crateA.getIntersectionVolume(crateB)).toBeCloseTo(0.5, 2);
   *   // — use standard vitest toBeCloseTo for scalar checks
   *
   * This matcher targets spatial entities directly:
   *   expect(crateA).toHaveIntersectionVolumeWith(crateB, 0.5);
   */
  toHaveIntersectionVolumeWith(
    this: { isNot: boolean },
    received: SpatialReceiver,
    other: SpatialReceiver,
    expected: number,
    tolerance = 0.001
  ) {
    const bA = toBounds(received);
    const bB = toBounds(other);
    const actual = bA.intersectionVolume(bB);
    const pass = Math.abs(actual - expected) <= tolerance;

    return {
      pass,
      message: () =>
        pass
          ? `Expected intersection volume NOT to be ≈${expected} m³, but got ${actual.toFixed(4)} m³.`
          : `Expected intersection volume ≈${expected} m³ (±${tolerance}), but got ${actual.toFixed(4)} m³.\n` +
            `  ${label(received)} ∩ ${label(other)}`,
    };
  },
};

// ── Registration ───────────────────────────────────────────────────────────

let registered = false;

/**
 * Register all spatial matchers with vitest's `expect`.
 * Call once in a setup file or at the top of your test file.
 */
export function setupSpatialMatchers(): void {
  if (registered) return;
  expect.extend(spatialMatchers);
  registered = true;
}

// ── TypeScript declaration merging ─────────────────────────────────────────

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<R = any> {
    /** Assert the entity/box is fully inside `container`. */
    toBeWithinVolume(container: BoundingBox): R;
    /** Assert the entity/box overlaps `other`. Use `.not.toIntersect` to assert no clipping. */
    toIntersect(other: SpatialReceiver): R;
    /** Assert intersection volume with `other` equals `expected` ± `tolerance` m³. */
    toHaveIntersectionVolumeWith(other: SpatialReceiver, expected: number, tolerance?: number): R;
  }
  interface AsymmetricMatchersContaining {
    toBeWithinVolume(container: BoundingBox): unknown;
    toIntersect(other: SpatialReceiver): unknown;
    toHaveIntersectionVolumeWith(other: SpatialReceiver, expected: number, tolerance?: number): unknown;
  }
}
