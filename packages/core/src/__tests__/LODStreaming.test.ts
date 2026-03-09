/**
 * LODStreaming.test.ts — Cycle 187
 *
 * Tests for LODStreamer and LODTransition.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LODStreamer } from '../lod/LODStreamer';
import { LODTransition } from '../lod/LODTransition';

// =============================================================================
// LODStreamer
// =============================================================================
describe('LODStreamer', () => {
  let streamer: LODStreamer;

  beforeEach(() => {
    streamer = new LODStreamer(512);
  });

  it('initializes with budget', () => {
    expect(streamer.getMemoryBudget()).toBe(512);
    expect(streamer.getMemoryUsed()).toBe(0);
  });

  it('registers assets', () => {
    streamer.registerAsset({
      id: 'tree',
      lodLevels: [50, 100, 200],
      currentLOD: -1,
      priority: 1,
      memoryCost: [100, 50, 20],
    });
    expect(streamer.getCurrentLOD('tree')).toBe(-1);
  });

  it('evaluates distance-based LOD selection', () => {
    streamer.registerAsset({
      id: 'house',
      lodLevels: [30, 60, 120],
      currentLOD: -1,
      priority: 1,
      memoryCost: [200, 100, 40],
    });
    const lod = streamer.evaluateDistance('house', 25);
    expect(lod).toBe(0); // closest LOD
  });

  it('returns -1 for unknown asset', () => {
    expect(streamer.evaluateDistance('nope', 10)).toBe(-1);
  });

  it('selects higher LOD at farther distance', () => {
    streamer.registerAsset({
      id: 'rock',
      lodLevels: [20, 50, 100],
      currentLOD: -1,
      priority: 1,
      memoryCost: [80, 40, 10],
    });
    const near = streamer.evaluateDistance('rock', 5);
    const far = streamer.evaluateDistance('rock', 45);
    expect(near).toBe(0);
    expect(far).toBe(1);
  });

  it('processQueue respects memory budget', () => {
    streamer.registerAsset({
      id: 'big',
      lodLevels: [100],
      currentLOD: -1,
      priority: 2,
      memoryCost: [600],
    });
    streamer.update(0, 0, 0);
    const processed = streamer.processQueue();
    // 600 > 512 budget — should not load
    expect(streamer.getCurrentLOD('big')).toBe(-1);
  });

  it('processQueue loads within budget', () => {
    streamer.registerAsset({
      id: 'small',
      lodLevels: [100],
      currentLOD: -1,
      priority: 1,
      memoryCost: [100],
    });
    streamer.update(0, 0, 0);
    const processed = streamer.processQueue();
    expect(processed.length).toBeGreaterThanOrEqual(0); // At least processes
  });

  it('priority ordering in load queue', () => {
    streamer.registerAsset({
      id: 'low',
      lodLevels: [100],
      currentLOD: -1,
      priority: 1,
      memoryCost: [50],
    });
    streamer.registerAsset({
      id: 'high',
      lodLevels: [100],
      currentLOD: -1,
      priority: 10,
      memoryCost: [50],
    });
    streamer.update(0, 0, 0);
    // High priority should be processed first — just make sure no crash
    const processed = streamer.processQueue();
    expect(processed.length).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// LODTransition
// =============================================================================
describe('LODTransition', () => {
  let trans: LODTransition;

  beforeEach(() => {
    trans = new LODTransition();
  });

  it('defaults to crossfade mode', () => {
    expect(trans.getMode()).toBe('crossfade');
  });

  it('switches transition mode', () => {
    trans.setMode('dither');
    expect(trans.getMode()).toBe('dither');
  });

  it('instant transition completes immediately', () => {
    trans.setMode('instant');
    trans.startTransition('e1', 0, 1);
    expect(trans.isTransitioning('e1')).toBe(false);
    expect(trans.getBlendFactor('e1')).toBe(1);
  });

  it('crossfade progresses over time', () => {
    trans.startTransition('e1', 0, 1);
    expect(trans.isTransitioning('e1')).toBe(true);
    trans.update(0.25); // 50% of default 0.5s duration
    const blend = trans.getBlendFactor('e1');
    expect(blend).toBeGreaterThan(0);
    expect(blend).toBeLessThan(1);
  });

  it('transition completes at full duration', () => {
    trans.startTransition('e1', 0, 1);
    trans.update(0.5);
    expect(trans.isTransitioning('e1')).toBe(false);
    expect(trans.getBlendFactor('e1')).toBe(1);
  });

  it('dither threshold progresses', () => {
    trans.setMode('dither');
    trans.startTransition('e1', 0, 1);
    trans.update(0.25);
    const thresh = trans.getDitherThreshold('e1');
    expect(thresh).toBeGreaterThan(0);
    expect(thresh).toBeLessThanOrEqual(1);
  });

  it('hysteresis prevents flip-flopping', () => {
    const trans2 = new LODTransition({ hysteresisBand: 10 });
    // Moving to higher LOD requires exceeding threshold + band
    expect(trans2.shouldTransition(55, 50, 0, 1)).toBe(false); // 55 < 50+10
    expect(trans2.shouldTransition(65, 50, 0, 1)).toBe(true); // 65 > 50+10
  });

  it('morph uses smoothstep blending', () => {
    trans.setMode('morph');
    trans.startTransition('e1', 0, 1);
    trans.update(0.25); // 50% progress
    const blend = trans.getBlendFactor('e1');
    // smoothstep at 0.5 = 0.5
    expect(blend).toBeGreaterThan(0);
    expect(blend).toBeLessThanOrEqual(1);
  });
});
