import { describe, it, expect } from 'vitest';
import { LODStreamer } from '../lod/LODStreamer';
import { ImpostorSystem } from '../lod/ImpostorSystem';
import { LODTransition } from '../lod/LODTransition';

describe('Cycle 163: LOD Extensions', () => {
  // -------------------------------------------------------------------------
  // LODStreamer
  // -------------------------------------------------------------------------

  it('should select LOD based on distance', () => {
    const streamer = new LODStreamer(1000);
    streamer.registerAsset({
      id: 'tree',
      lodLevels: [50, 150, 500],
      currentLOD: -1,
      priority: 5,
      memoryCost: [100, 50, 10],
    });

    expect(streamer.evaluateDistance('tree', 30)).toBe(0); // LOD 0 (< 50)
    expect(streamer.evaluateDistance('tree', 100)).toBe(1); // LOD 1 (< 150)
    expect(streamer.evaluateDistance('tree', 600)).toBe(-1); // Beyond all
  });

  it('should enforce memory budget when processing queue', () => {
    const streamer = new LODStreamer(100);
    streamer.registerAsset({
      id: 'a',
      lodLevels: [100],
      currentLOD: -1,
      priority: 5,
      memoryCost: [80],
    });
    streamer.registerAsset({
      id: 'b',
      lodLevels: [100],
      currentLOD: -1,
      priority: 3,
      memoryCost: [80],
    });

    // Manually force both to need loading
    streamer.update(0, 0, 0);
    streamer.processQueue(10);

    // Only one should fit in 100 budget (80 + 80 > 100)
    expect(streamer.getMemoryUsed()).toBeLessThanOrEqual(100);
  });

  // -------------------------------------------------------------------------
  // ImpostorSystem
  // -------------------------------------------------------------------------

  it('should select angle-based impostor frame', () => {
    const imp = new ImpostorSystem(8, 8);
    imp.registerImpostor({
      entityId: 'tree1',
      angleCount: 8,
      atlasIndex: 0,
      switchDistance: 100,
      size: { width: 2, height: 3 },
    });

    const frame = imp.selectAngle('tree1', Math.PI / 4)!; // 45 degrees → angle 1
    expect(frame.angleIndex).toBe(1);
    expect(frame.uvW).toBeCloseTo(1 / 8);
  });

  it('should check switch distance', () => {
    const imp = new ImpostorSystem();
    imp.registerImpostor({
      entityId: 'obj',
      angleCount: 4,
      atlasIndex: 0,
      switchDistance: 50,
      size: { width: 1, height: 1 },
    });

    expect(imp.shouldUseImpostor('obj', 30)).toBe(false);
    expect(imp.shouldUseImpostor('obj', 60)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // LODTransition
  // -------------------------------------------------------------------------

  it('should crossfade between LODs over time', () => {
    const trans = new LODTransition({ mode: 'crossfade', duration: 1 });
    trans.startTransition('obj1', 0, 1);

    expect(trans.isTransitioning('obj1')).toBe(true);

    trans.update(0.5);
    expect(trans.getBlendFactor('obj1')).toBeCloseTo(0.5);

    trans.update(0.5);
    expect(trans.getBlendFactor('obj1')).toBeCloseTo(1);
    expect(trans.isTransitioning('obj1')).toBe(false);
  });

  it('should apply hysteresis to prevent oscillation', () => {
    const trans = new LODTransition({ hysteresisBand: 10 });

    // Upgrading LOD (newLOD > currentLOD) requires distance > threshold + band
    expect(trans.shouldTransition(105, 100, 0, 1)).toBe(false); // 105 < 110
    expect(trans.shouldTransition(115, 100, 0, 1)).toBe(true); // 115 > 110
  });
});
