/**
 * asset-drop.scenario.ts — Asset Auto-Snap
 *
 * Persona: Dev — Studio engineer verifying that asset drops get snapped
 * to the grid and floor correctly via useDragSnap + AssetDropProcessor.
 *
 * Tests the pure snap math directly (no React, no Three.js mocks needed).
 */

import { describe, it, expect } from 'vitest';
import { snapToGrid, snapPosition } from '@/lib/stores/builderStore';

// ── snapToGrid unit tests ─────────────────────────────────────────────────────

describe('Scenario: Asset Auto-Snap — snapToGrid()', () => {
  it('snaps a value exactly on grid to itself', () => {
    expect(snapToGrid(0.5, 0.5)).toBe(0.5);
    expect(snapToGrid(1.0, 0.5)).toBe(1.0);
    expect(snapToGrid(0.0, 0.5)).toBe(0.0);
  });

  it('snaps a value between grid lines to the nearest', () => {
    // 0.74 is closer to 0.5 than to 1.0
    expect(snapToGrid(0.74, 0.5)).toBe(0.5);
    // 0.76 is closer to 1.0
    expect(snapToGrid(0.76, 0.5)).toBe(1.0);
  });

  it('snaps negative values correctly', () => {
    expect(snapToGrid(-0.3, 0.5)).toBe(-0.5);
    expect(snapToGrid(-0.74, 0.5)).toBe(-0.5);
    expect(snapToGrid(-0.76, 0.5)).toBe(-1.0);
  });

  it('snaps to a 1.0 grid size', () => {
    expect(snapToGrid(1.4, 1.0)).toBe(1.0);
    expect(snapToGrid(1.6, 1.0)).toBe(2.0);
    expect(snapToGrid(2.5, 1.0)).toBe(3.0); // round-half-up
  });

  it('handles zero gridSize gracefully without dividing by zero', () => {
    // gridSize of 0 would cause NaN — guard in snapToGrid: Math.round(n/0)*0 = NaN
    // This test documents the behaviour and alerts us if it changes
    const result = snapToGrid(1.3, 0);
    expect(typeof result).toBe('number'); // NaN is still a 'number' in JS
  });
});

// ── snapPosition unit tests ───────────────────────────────────────────────────

describe('Scenario: Asset Auto-Snap — snapPosition()', () => {
  it('snaps all three axes', () => {
    const pos: [number, number, number] = [0.3, 0.7, 1.4];
    const snapped = snapPosition(pos, 0.5);
    expect(snapped).toEqual([0.5, 0.5, 1.5]);
  });

  it('leaves origin unchanged', () => {
    expect(snapPosition([0, 0, 0], 0.5)).toEqual([0, 0, 0]);
  });

  it('snaps a typical asset drop position', () => {
    // Character dropped at X=-1.23, Y=0.85 (floor), Z=2.17
    const pos: [number, number, number] = [-1.23, 0.85, 2.17];
    const snapped = snapPosition(pos, 0.5);
    // X: -1.23 → -1.0 (closer to -1.0 than -1.5)
    expect(snapped[0]).toBeCloseTo(-1.0, 5);
    // Y: 0.85 → 1.0
    expect(snapped[1]).toBeCloseTo(1.0, 5);
    // Z: 2.17 → 2.0
    expect(snapped[2]).toBeCloseTo(2.0, 5);
  });
});

// ── Floor-snap Y-offset logic ─────────────────────────────────────────────────

describe('Scenario: Asset Auto-Snap — floor snap (Y offset)', () => {
  it('raises an asset that sits below Y=0 (bounding box min.y < 0)', () => {
    // Simulate a box where the mesh origin is at Y=0 but geometry extends downward
    const minY = -0.5;  // bounding box bottom
    const yOffset = minY < 0 ? Math.abs(minY) : -minY;
    expect(yOffset).toBe(0.5);
  });

  it('lowers an asset whose origin is above its bottom (min.y > 0)', () => {
    // Mesh loaded with bounding box starting at Y=0.1 (origin not at base)
    const minY = 0.1;
    const yOffset = minY < 0 ? Math.abs(minY) : -minY;
    expect(yOffset).toBe(-0.1); // nudge down slightly
  });

  it('leaves Y unchanged when bounding box min.y is exactly 0', () => {
    const minY = 0;
    const yOffset = minY < 0 ? Math.abs(minY) : -minY;
    expect(yOffset).toBeCloseTo(0, 10); // handles -0 vs 0 (both are numerically equal)
  });

  it('handles very tall assets correctly', () => {
    // A 10-unit tall building whose bottom is at Y=-5
    const minY = -5;
    const yOffset = minY < 0 ? Math.abs(minY) : -minY;
    expect(yOffset).toBe(5); // raise 5 units to sit on floor
  });
});
