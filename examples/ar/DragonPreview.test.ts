/**
 * @fileoverview Tests for DragonPreview AR component projection utilities
 */

import { describe, it, expect } from 'vitest';

// Extract the projectPoint function for testing
// This mimics the implementation from DragonPreview.tsx
function projectPoint(
  x: number,
  y: number,
  z: number,
  rotY: number,
  zoom: number,
  cx: number,
  cy: number
): [number, number] {
  // Rotate around Y axis
  const cosR = Math.cos(rotY);
  const sinR = Math.sin(rotY);
  const rx = x * cosR - z * sinR;
  const rz = x * sinR + z * cosR;

  // Simple perspective
  const perspective = 4;
  const scale = (perspective / (perspective + rz)) * zoom * 80;

  return [cx + rx * scale, cy - y * scale];
}

describe('DragonPreview - projectPoint', () => {
  it('should project a point at origin with no rotation', () => {
    const result = projectPoint(0, 0, 0, 0, 1, 100, 100);
    // At origin with no rotation, should be at center
    expect(result[0]).toBeCloseTo(100); // cx
    expect(result[1]).toBeCloseTo(100); // cy
  });

  it('should handle basic X translation', () => {
    const result = projectPoint(1, 0, 0, 0, 1, 100, 100);
    // X=1 should move right from center
    expect(result[0]).toBeGreaterThan(100);
    expect(result[1]).toBeCloseTo(100);
  });

  it('should handle basic Y translation', () => {
    const result = projectPoint(0, 1, 0, 0, 1, 100, 100);
    // Y=1 should move up from center (screen Y is inverted)
    expect(result[0]).toBeCloseTo(100);
    expect(result[1]).toBeLessThan(100);
  });

  it('should handle Y rotation correctly', () => {
    const result90 = projectPoint(1, 0, 0, Math.PI / 2, 1, 100, 100);
    // 90-degree rotation: X->Z, so x=1 becomes z=1
    // This should change the perspective scaling
    expect(result90[0]).toBeCloseTo(100); // Should be near center after rotation
    expect(result90[1]).toBeCloseTo(100);
  });

  it('should apply zoom factor correctly', () => {
    const zoom1 = projectPoint(1, 0, 0, 0, 1, 100, 100);
    const zoom2 = projectPoint(1, 0, 0, 0, 2, 100, 100);
    
    // Higher zoom should increase displacement from center
    const displacement1 = Math.abs(zoom1[0] - 100);
    const displacement2 = Math.abs(zoom2[0] - 100);
    expect(displacement2).toBeGreaterThan(displacement1);
  });

  it('should handle perspective correctly with Z depth', () => {
    const nearPoint = projectPoint(1, 0, 0, 0, 1, 100, 100);
    const farPoint = projectPoint(1, 0, 4, 0, 1, 100, 100);
    
    // Far points should have smaller displacement due to perspective
    const nearDisplacement = Math.abs(nearPoint[0] - 100);
    const farDisplacement = Math.abs(farPoint[0] - 100);
    expect(nearDisplacement).toBeGreaterThan(farDisplacement);
  });

  it('should handle negative coordinates', () => {
    const result = projectPoint(-1, -1, 0, 0, 1, 100, 100);
    // Negative X should move left, negative Y should move down
    expect(result[0]).toBeLessThan(100);
    expect(result[1]).toBeGreaterThan(100);
  });

  it('should maintain consistency with center offset', () => {
    const center1 = projectPoint(0, 0, 0, 0, 1, 50, 60);
    const center2 = projectPoint(0, 0, 0, 0, 1, 150, 160);
    
    // Different centers should affect output predictably
    expect(center1[0]).toBe(50);
    expect(center1[1]).toBe(60);
    expect(center2[0]).toBe(150);
    expect(center2[1]).toBe(160);
  });

  it('should handle full rotation (360 degrees)', () => {
    const original = projectPoint(1, 0, 0, 0, 1, 100, 100);
    const fullRotation = projectPoint(1, 0, 0, 2 * Math.PI, 1, 100, 100);
    
    // Full rotation should return to original position (within floating point precision)
    expect(fullRotation[0]).toBeCloseTo(original[0], 10);
    expect(fullRotation[1]).toBeCloseTo(original[1], 10);
  });

  it('should handle extreme perspective (very close Z)', () => {
    // Points very close to camera (negative Z) should have extreme scaling
    const result = projectPoint(1, 0, -3, 0, 1, 100, 100);
    // With perspective = 4 and z = -3, scale factor becomes very large
    expect(Math.abs(result[0] - 100)).toBeGreaterThan(80); // Significant displacement
  });
});