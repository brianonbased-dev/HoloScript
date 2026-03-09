/**
 * Scenario: Texture Paint — Settings & Canvas
 *
 * Tests for the texture paint system:
 * - Default settings
 * - PaintSettings type validation
 * - Canvas UV coordinate flipping
 * - Blend mode coverage
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_PAINT, type PaintSettings } from '../../hooks/useTexturePaint';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Scenario: Texture Paint — Default Settings', () => {
  it('default color is pink (#ec4899)', () => {
    expect(DEFAULT_PAINT.color).toBe('#ec4899');
  });

  it('default size is 24', () => {
    expect(DEFAULT_PAINT.size).toBe(24);
  });

  it('default opacity is 0.8', () => {
    expect(DEFAULT_PAINT.opacity).toBe(0.8);
  });

  it('default blend mode is source-over', () => {
    expect(DEFAULT_PAINT.blendMode).toBe('source-over');
  });
});

describe('Scenario: Texture Paint — PaintSettings Type', () => {
  it('PaintSettings accepts all valid blend modes', () => {
    const modes: PaintSettings['blendMode'][] = ['source-over', 'multiply', 'screen'];
    modes.forEach((mode) => {
      const settings: PaintSettings = { ...DEFAULT_PAINT, blendMode: mode };
      expect(settings.blendMode).toBe(mode);
    });
  });

  it('opacity can be set to 0 (transparent)', () => {
    const settings: PaintSettings = { ...DEFAULT_PAINT, opacity: 0 };
    expect(settings.opacity).toBe(0);
  });

  it('opacity can be set to 1 (fully opaque)', () => {
    const settings: PaintSettings = { ...DEFAULT_PAINT, opacity: 1 };
    expect(settings.opacity).toBe(1);
  });

  it('size can range from small to large', () => {
    const small: PaintSettings = { ...DEFAULT_PAINT, size: 4 };
    const large: PaintSettings = { ...DEFAULT_PAINT, size: 128 };
    expect(small.size).toBeLessThan(large.size);
  });

  it('color accepts hex strings', () => {
    const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000'];
    colors.forEach((color) => {
      const settings: PaintSettings = { ...DEFAULT_PAINT, color };
      expect(settings.color).toBe(color);
    });
  });
});

describe('Scenario: Texture Paint — UV Coordinate Mapping', () => {
  const CANVAS_SIZE = 1024;

  function uvToCanvas(u: number, v: number): { x: number; y: number } {
    return { x: u * CANVAS_SIZE, y: (1 - v) * CANVAS_SIZE };
  }

  it('UV (0,0) maps to canvas bottom-left (0, 1024)', () => {
    const { x, y } = uvToCanvas(0, 0);
    expect(x).toBe(0);
    expect(y).toBe(CANVAS_SIZE);
  });

  it('UV (1,1) maps to canvas top-right (1024, 0)', () => {
    const { x, y } = uvToCanvas(1, 1);
    expect(x).toBe(CANVAS_SIZE);
    expect(y).toBe(0);
  });

  it('UV (0.5,0.5) maps to canvas center (512, 512)', () => {
    const { x, y } = uvToCanvas(0.5, 0.5);
    expect(x).toBe(512);
    expect(y).toBe(512);
  });

  it('V axis is flipped (WebGL convention)', () => {
    const low = uvToCanvas(0.5, 0.25); // lower in texture
    const high = uvToCanvas(0.5, 0.75); // higher in texture
    expect(low.y).toBeGreaterThan(high.y); // flipped on canvas
  });
});
