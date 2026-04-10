import { describe, it, expect, beforeEach } from 'vitest';
import { IKTrait } from '../IKTrait';

describe('IKTrait', () => {
  let ik: IKTrait;

  beforeEach(() => {
    ik = new IKTrait({
      chain: {
        name: 'RightArm',
        bones: [
          { name: 'UpperArm', length: 0.3 },
          { name: 'LowerArm', length: 0.25 },
          { name: 'Hand', length: 0.1 },
        ],
      },
      iterations: 10,
      tolerance: 0.001,
      weight: 1.0,
      solver: 'fabrik',
    });
  });

  it('initializes with config', () => {
    const cfg = ik.getConfig();
    expect(cfg.iterations).toBe(10);
    expect(cfg.solver).toBe('fabrik');
  });

  it('getChain returns chain', () => {
    const chain = ik.getChain();
    expect(chain).toBeDefined();
    expect(chain?.name).toBe('RightArm');
    expect(chain?.bones).toHaveLength(3);
  });

  it('setWeight and getWeight', () => {
    ik.setWeight(0.5);
    expect(ik.getWeight()).toBe(0.5);
  });

  it('setEnabled and isEnabled', () => {
    expect(ik.isEnabled()).toBe(true);
    ik.setEnabled(false);
    expect(ik.isEnabled()).toBe(false);
  });

  it('setTarget with Vector3', () => {
    ik.setTarget({ x: 1, y: 1, z: 0 });
    const cfg = ik.getConfig();
    expect(cfg.targetPosition).toEqual({ x: 1, y: 1, z: 0 });
  });

  it('setTarget with string', () => {
    ik.setTarget('TargetSphere');
    expect(ik.getConfig().target).toBe('TargetSphere');
  });

  it('setPoleTarget with Vector3', () => {
    ik.setPoleTarget({ x: 0, y: 0, z: 1 });
    expect(ik.getConfig().polePosition).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('solve returns result', () => {
    const result = ik.solve({ x: 0.5, y: 0.5, z: 0 });
    expect(result).toBeDefined();
    expect(result.iterationsUsed).toBeGreaterThan(0);
    expect(typeof result.distanceToTarget).toBe('number');
  });

  it('getLastResult returns null before solve', () => {
    expect(ik.getLastResult()).toBeNull();
  });

  it('getLastResult returns result after solve', () => {
    ik.solve({ x: 0.3, y: 0.3, z: 0 });
    expect(ik.getLastResult()).toBeDefined();
  });

  it('serialize returns config snapshot', () => {
    const s = ik.serialize();
    expect(s.solver).toBe('fabrik');
    expect(s.iterations).toBe(10);
  });
});
