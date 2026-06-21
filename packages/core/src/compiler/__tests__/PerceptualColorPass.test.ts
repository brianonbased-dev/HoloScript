import { describe, expect, it } from 'vitest';
import {
  analyzePerceptualColor,
  applyPerceptualColorPass,
  buildPerceptualGradient,
} from '../PerceptualColorPass';

describe('PerceptualColorPass', () => {
  it('samples scientific color maps through perceptual interpolation', () => {
    const pass = applyPerceptualColorPass({
      colorMap: 'viridis',
      steps: 5,
      scientific: true,
    });

    expect(pass.algorithm).toBe('perceptual_lerp_delta_e2000');
    expect(pass.source).toBe('color_map');
    expect(pass.colorMap?.name).toBe('viridis');
    expect(pass.colorMap?.colors).toHaveLength(5);
    expect(pass.colorMap?.deltaE).toHaveLength(4);
    expect(pass.colorMap?.colors[0]).toBe('#440154');
    expect(pass.colorMap?.colors[4]).toBe('#FDE725');
    expect(pass.colorMap?.minDeltaE).toBeGreaterThan(0);
  });

  it('warns and falls back to viridis for unknown scientific color maps', () => {
    const pass = applyPerceptualColorPass({
      colorMap: 'not-a-map',
      steps: 4,
    });

    expect(pass.source).toBe('color_map');
    expect(pass.colorMap?.name).toBe('viridis');
    expect(pass.colorMap?.colors).toHaveLength(4);
    expect(pass.warnings.some((warning) => warning.includes('Unknown color map'))).toBe(true);
  });

  it('builds perceptual gradients with measured adjacent delta E', () => {
    const gradient = buildPerceptualGradient(['#000000', '#FFFFFF'], { steps: 4 });

    expect(gradient.colors).toHaveLength(4);
    expect(gradient.deltaE).toHaveLength(3);
    expect(gradient.minDeltaE).toBeGreaterThan(0);
    expect(gradient.maxDeltaE).toBeGreaterThanOrEqual(gradient.minDeltaE);
  });

  it('adds neutral-axis analysis for palettes when requested', () => {
    const pass = applyPerceptualColorPass({
      palette: ['#FF0000', '#00FF00', '#0000FF'],
      neutralAxis: true,
    });

    expect(pass.source).toBe('palette');
    expect(pass.palette?.nearestNeutral).toHaveLength(3);
    expect(pass.palette?.pairwiseDeltaE).toHaveLength(2);
  });

  it('reports palettes that miss the target perceptual distance', () => {
    const pass = applyPerceptualColorPass({
      palette: ['#010101', '#020202'],
      targetDeltaE: 20,
    });

    expect(pass.warnings.some((warning) => warning.includes('below target'))).toBe(true);
  });

  it('exposes per-color lightness, chroma, hue, and nearest neutral', () => {
    const analysis = analyzePerceptualColor('#33AAFF');

    expect(analysis.color).toBe('#33AAFF');
    expect(analysis.lightness).toBeGreaterThan(0);
    expect(analysis.chroma).toBeGreaterThan(0);
    expect(analysis.nearestNeutral).toMatch(/^#[0-9A-F]{6}$/);
  });
});
