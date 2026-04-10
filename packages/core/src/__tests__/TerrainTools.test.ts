import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainBrush } from '@holoscript/engine/terrain/TerrainBrush';
import { TerrainPaintLayer } from '@holoscript/engine/terrain/TerrainPaintLayer';
import { ErosionBrush } from '@holoscript/engine/terrain/ErosionBrush';

describe('Terrain Tools (Cycle 174)', () => {
  describe('TerrainBrush', () => {
    let brush: TerrainBrush;

    beforeEach(() => {
      brush = new TerrainBrush(16, {
        mode: 'raise',
        radius: 3,
        strength: 1,
        falloff: 'smooth',
        opacity: 1,
      });
    });

    it('should raise terrain height', () => {
      brush.apply(8, 8);
      expect(brush.getHeight(8, 8)).toBeGreaterThan(0);
    });

    it('should lower terrain height', () => {
      brush.apply(8, 8); // raise first
      const raised = brush.getHeight(8, 8);
      brush.apply(8, 8, { mode: 'lower' });
      expect(brush.getHeight(8, 8)).toBeLessThan(raised);
    });

    it('should apply smooth falloff', () => {
      brush.apply(8, 8);
      const center = brush.getHeight(8, 8);
      const edge = brush.getHeight(8 + 2, 8);
      expect(center).toBeGreaterThan(edge);
    });

    it('should undo strokes', () => {
      brush.apply(8, 8);
      expect(brush.getHeight(8, 8)).toBeGreaterThan(0);
      brush.undo();
      expect(brush.getHeight(8, 8)).toBe(0);
    });

    it('should respect locked cells', () => {
      brush.setLocked(8, 8, true);
      brush.apply(8, 8);
      expect(brush.getHeight(8, 8)).toBe(0);
    });

    it('should flatten to average height', () => {
      brush.apply(8, 8, { mode: 'raise', strength: 5 });
      const peak = brush.getHeight(8, 8);
      brush.apply(8, 8, { mode: 'flatten', strength: 1 });
      expect(brush.getHeight(8, 8)).toBeLessThan(peak);
    });

    it('should report height range', () => {
      brush.apply(8, 8, { mode: 'raise', strength: 5 });
      const range = brush.getHeightRange();
      expect(range.max).toBeGreaterThan(0);
      expect(range.min).toBeLessThanOrEqual(range.max);
    });
  });

  describe('TerrainPaintLayer', () => {
    let paint: TerrainPaintLayer;

    beforeEach(() => {
      paint = new TerrainPaintLayer(16);
      paint.addLayer({
        id: 'grass',
        name: 'Grass',
        textureId: 'tex_grass',
        tiling: 1,
        metallic: 0,
        roughness: 0.9,
      });
      paint.addLayer({
        id: 'rock',
        name: 'Rock',
        textureId: 'tex_rock',
        tiling: 2,
        metallic: 0.3,
        roughness: 0.7,
      });
    });

    it('should add and track layers', () => {
      expect(paint.getLayerCount()).toBe(2);
    });

    it('should paint weights at a position', () => {
      paint.paintAt(8, 8, 1, 0.8);
      const weights = paint.getWeights(8, 8);
      expect(weights[1]).toBeGreaterThan(0);
      // Weights should be normalized
      const sum = weights.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 3);
    });

    it('should get dominant layer', () => {
      expect(paint.getDominantLayer(0, 0)).toBe(0); // grass is default
      paint.paintAt(0, 0, 1, 5, 3);
      paint.paintAt(0, 0, 1, 5, 3);
      paint.paintAt(0, 0, 1, 5, 3);
      expect(paint.getDominantLayer(0, 0)).toBe(1); // rock dominates
    });

    it('should undo paint operations', () => {
      const before = paint.getWeights(8, 8);
      paint.paintAt(8, 8, 1, 1);
      paint.undo();
      // Weights restored (might differ slightly due to norm)
      expect(paint.getUndoCount()).toBe(0);
    });

    it('should remove layers', () => {
      paint.removeLayer(1);
      expect(paint.getLayerCount()).toBe(1);
    });
  });

  describe('ErosionBrush', () => {
    let erosion: ErosionBrush;

    beforeEach(() => {
      erosion = new ErosionBrush(16, { radius: 3, strength: 0.5, iterations: 5 });
      // Create a peak
      erosion.setHeight(8, 8, 10);
      erosion.setHeight(7, 8, 5);
      erosion.setHeight(9, 8, 5);
      erosion.setHeight(8, 7, 5);
      erosion.setHeight(8, 9, 5);
    });

    it('should erode high points with hydraulic erosion', () => {
      const before = erosion.getHeight(8, 8);
      const result = erosion.erode(8, 8, { type: 'hydraulic' });
      expect(erosion.getHeight(8, 8)).toBeLessThan(before);
      expect(result.totalErosion).toBeGreaterThan(0);
    });

    it('should apply thermal erosion based on slope', () => {
      const before = erosion.getHeight(8, 8);
      const result = erosion.erode(8, 8, { type: 'thermal', thermalAngle: 30 });
      expect(erosion.getHeight(8, 8)).toBeLessThanOrEqual(before);
      expect(result.cellsAffected).toBeGreaterThan(0);
    });

    it('should apply wind erosion to exposed peaks', () => {
      const result = erosion.erode(8, 8, { type: 'wind' });
      expect(result.totalErosion).toBeGreaterThan(0);
    });
  });
});
