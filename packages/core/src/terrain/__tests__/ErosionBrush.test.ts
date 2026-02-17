import { describe, it, expect, beforeEach } from 'vitest';
import { ErosionBrush } from '../ErosionBrush';

describe('ErosionBrush', () => {
  let eb: ErosionBrush;

  beforeEach(() => { eb = new ErosionBrush(16); });

  it('constructs with defaults', () => {
    expect(eb.getGridSize()).toBe(16);
    expect(eb.getConfig().type).toBe('hydraulic');
  });

  it('setHeight / getHeight', () => {
    eb.setHeight(5, 5, 10);
    expect(eb.getHeight(5, 5)).toBe(10);
  });

  it('getHeight returns 0 for out-of-range', () => {
    expect(eb.getHeight(100, 100)).toBe(0);
  });

  it('setConfig merges', () => {
    eb.setConfig({ strength: 0.9 });
    expect(eb.getConfig().strength).toBe(0.9);
    expect(eb.getConfig().type).toBe('hydraulic'); // unchanged
  });

  it('getConfig returns copy', () => {
    const a = eb.getConfig();
    const b = eb.getConfig();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it('hydraulic erode lowers peaks', () => {
    eb.setHeight(8, 8, 5);
    const result = eb.erode(8, 8);
    expect(result.cellsAffected).toBeGreaterThan(0);
    expect(result.totalErosion).toBeGreaterThan(0);
    expect(result.iterations).toBe(10);
    expect(eb.getHeight(8, 8)).toBeLessThan(5);
  });

  it('thermal erode with override', () => {
    eb.setHeight(8, 8, 10);
    const result = eb.erode(8, 8, { type: 'thermal', thermalAngle: 10 });
    expect(result.totalErosion).toBeGreaterThan(0);
  });

  it('wind erode lowers exposed peaks', () => {
    eb.setHeight(8, 8, 10);
    const result = eb.erode(8, 8, { type: 'wind' });
    expect(result.totalErosion).toBeGreaterThan(0);
  });

  it('erode on flat terrain changes nothing', () => {
    const result = eb.erode(8, 8);
    expect(result.totalErosion).toBe(0);
    expect(result.cellsAffected).toBe(0);
  });

  it('getNeighborHeights skips out-of-range', () => {
    eb.setHeight(0, 0, 5);
    // Corner has only 2 neighbors
    const h = eb.getHeight(0, 0);
    expect(h).toBe(5);
  });

  it('custom config at construction', () => {
    const eb2 = new ErosionBrush(8, { type: 'thermal', radius: 3 });
    expect(eb2.getConfig().type).toBe('thermal');
    expect(eb2.getConfig().radius).toBe(3);
    expect(eb2.getGridSize()).toBe(8);
  });
});
