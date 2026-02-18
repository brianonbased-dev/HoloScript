import { describe, it, expect, beforeEach } from 'vitest';
import { ImpostorSystem } from '../ImpostorSystem';

describe('ImpostorSystem', () => {
  let system: ImpostorSystem;

  beforeEach(() => {
    system = new ImpostorSystem(8, 8);
  });

  it('registerImpostor and getConfig', () => {
    const config = { entityId: 'tree1', angleCount: 8, atlasIndex: 0, switchDistance: 50, size: { width: 2, height: 4 } };
    system.registerImpostor(config);
    expect(system.getConfig('tree1')).toEqual(config);
    expect(system.getImpostorCount()).toBe(1);
  });

  it('removeImpostor deletes entity', () => {
    system.registerImpostor({ entityId: 'tree1', angleCount: 8, atlasIndex: 0, switchDistance: 50, size: { width: 2, height: 4 } });
    system.removeImpostor('tree1');
    expect(system.getImpostorCount()).toBe(0);
  });

  it('selectAngle returns correct frame for camera angle', () => {
    system.registerImpostor({ entityId: 'tree1', angleCount: 8, atlasIndex: 0, switchDistance: 50, size: { width: 2, height: 4 } });
    const frame = system.selectAngle('tree1', 0);
    expect(frame).not.toBeNull();
    expect(frame!.angleIndex).toBe(0);
    expect(frame!.uvX).toBe(0);
    expect(frame!.uvY).toBe(0);
    expect(frame!.uvW).toBeCloseTo(1 / 8);
    expect(frame!.uvH).toBeCloseTo(1 / 8);
  });

  it('selectAngle wraps around 2PI', () => {
    system.registerImpostor({ entityId: 'tree1', angleCount: 8, atlasIndex: 0, switchDistance: 50, size: { width: 2, height: 4 } });
    const frame = system.selectAngle('tree1', Math.PI * 2);
    expect(frame).not.toBeNull();
    expect(frame!.angleIndex).toBe(0); // Full rotation = same as 0
  });

  it('selectAngle handles negative angles', () => {
    system.registerImpostor({ entityId: 'tree1', angleCount: 4, atlasIndex: 0, switchDistance: 50, size: { width: 2, height: 4 } });
    const frame = system.selectAngle('tree1', -Math.PI / 2);
    expect(frame).not.toBeNull();
    expect(frame!.angleIndex).toBe(3); // -90° = 270° → index 3 of 4
  });

  it('selectAngle returns null for unknown entity', () => {
    expect(system.selectAngle('unknown', 0)).toBeNull();
  });

  it('shouldUseImpostor checks distance', () => {
    system.registerImpostor({ entityId: 'tree1', angleCount: 8, atlasIndex: 0, switchDistance: 50, size: { width: 2, height: 4 } });
    expect(system.shouldUseImpostor('tree1', 49)).toBe(false);
    expect(system.shouldUseImpostor('tree1', 50)).toBe(true);
    expect(system.shouldUseImpostor('tree1', 100)).toBe(true);
  });

  it('shouldUseImpostor returns false for unknown entity', () => {
    expect(system.shouldUseImpostor('unknown', 100)).toBe(false);
  });

  it('atlas UV positions offset by atlasIndex', () => {
    system.registerImpostor({ entityId: 'tree2', angleCount: 2, atlasIndex: 1, switchDistance: 50, size: { width: 2, height: 4 } });
    const frame = system.selectAngle('tree2', 0);
    expect(frame).not.toBeNull();
    // atlasIndex=1, angleCount=2, angleIndex=0 → globalIndex=2
    // col=2%8=2, row=0
    expect(frame!.uvX).toBeCloseTo(2 / 8);
    expect(frame!.uvY).toBe(0);
  });
});
