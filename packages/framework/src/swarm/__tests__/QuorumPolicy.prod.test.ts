/**
 * QuorumPolicy — Production Tests
 */
import { describe, it, expect } from 'vitest';
import { QuorumPolicy } from '../QuorumPolicy';

function make(cfg = {}) {
  return new QuorumPolicy(cfg);
}

describe('QuorumPolicy — defaults', () => {
  it('constructs with no args', () => expect(() => make()).not.toThrow());
  it('default minimumSize=2', () => expect(make().getConfig().minimumSize).toBe(2));
  it('default optimalSize=5', () => expect(make().getConfig().optimalSize).toBe(5));
  it('default maximumSize=50', () => expect(make().getConfig().maximumSize).toBe(50));
  it('default quorumPercentage=0.5', () => expect(make().getConfig().quorumPercentage).toBe(0.5));
  it('default requireQuorumForOperations=true', () =>
    expect(make().getConfig().requireQuorumForOperations).toBe(true));
});

describe('QuorumPolicy — config validation', () => {
  it('throws if minimumSize > optimalSize', () =>
    expect(() => make({ minimumSize: 10, optimalSize: 5 })).toThrow());
  it('throws if optimalSize > maximumSize', () =>
    expect(() => make({ optimalSize: 100, maximumSize: 50 })).toThrow());
  it('throws if quorumPercentage < 0', () =>
    expect(() => make({ quorumPercentage: -0.1 })).toThrow());
  it('throws if quorumPercentage > 1', () =>
    expect(() => make({ quorumPercentage: 1.1 })).toThrow());
  it('quorumPercentage=0 is valid', () =>
    expect(() => make({ quorumPercentage: 0 })).not.toThrow());
  it('quorumPercentage=1 is valid', () =>
    expect(() => make({ quorumPercentage: 1 })).not.toThrow());
});

describe('QuorumPolicy — setMemberCount / canJoin / canLeave', () => {
  it('canJoin=true when below maximumSize', () => {
    const p = make({ maximumSize: 5 });
    p.setMemberCount(4);
    expect(p.canJoin()).toBe(true);
  });
  it('canJoin=false when at maximumSize', () => {
    const p = make({ maximumSize: 5 });
    p.setMemberCount(5);
    expect(p.canJoin()).toBe(false);
  });
  it('canLeave=true when above minimumSize', () => {
    const p = make({ minimumSize: 2 });
    p.setMemberCount(3);
    expect(p.canLeave()).toBe(true);
  });
  it('canLeave=false when at minimumSize', () => {
    const p = make({ minimumSize: 2 });
    p.setMemberCount(2);
    expect(p.canLeave()).toBe(false);
  });
  it('setMemberCount clamps negative to 0', () => {
    const p = make();
    p.setMemberCount(-5);
    expect(p.getState().currentSize).toBe(0);
  });
});

describe('QuorumPolicy — hasQuorum', () => {
  // Default: optimal=5, quorumPct=0.5 → required = ceil(5*0.5)=3, effective=max(2,3)=3
  it('false when below quorum threshold', () => {
    const p = make();
    p.setMemberCount(2);
    expect(p.hasQuorum()).toBe(false);
  });
  it('true when at quorum threshold (3)', () => {
    const p = make();
    p.setMemberCount(3);
    expect(p.hasQuorum()).toBe(true);
  });
  it('true at and above quorum threshold', () => {
    const p = make();
    p.setMemberCount(10);
    expect(p.hasQuorum()).toBe(true);
  });
  it('quorumPct=0 → hasQuorum when at minimumSize', () => {
    const p = make({ quorumPercentage: 0 });
    p.setMemberCount(2);
    expect(p.hasQuorum()).toBe(true);
  });
});

describe('QuorumPolicy — canOperate', () => {
  it('requires quorum when requireQuorumForOperations=true', () => {
    const p = make({ requireQuorumForOperations: true });
    p.setMemberCount(1);
    expect(p.canOperate()).toBe(false);
  });
  it('only needs >0 when requireQuorumForOperations=false', () => {
    const p = make({ requireQuorumForOperations: false });
    p.setMemberCount(1);
    expect(p.canOperate()).toBe(true);
  });
  it('0 members cannot operate regardless', () => {
    const p = make({ requireQuorumForOperations: false });
    p.setMemberCount(0);
    expect(p.canOperate()).toBe(false);
  });
});

describe('QuorumPolicy — getStatus', () => {
  const cases: [number, string][] = [
    [0, 'below-minimum'],
    [1, 'below-minimum'],
    [2, 'quorum'], // at minimumSize=2, below optimalSize=5
    [4, 'quorum'],
    [5, 'optimal'], // at optimalSize
    [20, 'optimal'], // above but within maximumSize
    [51, 'above-maximum'],
  ];
  for (const [count, status] of cases) {
    it(`${count} members → ${status}`, () => {
      const p = make();
      p.setMemberCount(count);
      expect(p.getStatus()).toBe(status);
    });
  }
});

describe('QuorumPolicy — getState', () => {
  it('returns all required fields', () => {
    const p = make();
    p.setMemberCount(3);
    const s = p.getState();
    expect(s).toHaveProperty('currentSize', 3);
    expect(s).toHaveProperty('status');
    expect(s).toHaveProperty('hasQuorum');
    expect(s).toHaveProperty('canOperate');
    expect(s).toHaveProperty('requiredForQuorum');
    expect(s).toHaveProperty('spotsAvailable');
  });
  it('spotsAvailable = maximumSize - currentSize', () => {
    const p = make({ maximumSize: 50 });
    p.setMemberCount(30);
    expect(p.getState().spotsAvailable).toBe(20);
  });
  it('requiredForQuorum=0 when already has quorum', () => {
    const p = make();
    p.setMemberCount(10);
    expect(p.getState().requiredForQuorum).toBe(0);
  });
  it('requiredForQuorum>0 when below quorum', () => {
    const p = make();
    p.setMemberCount(1);
    expect(p.getState().requiredForQuorum).toBeGreaterThan(0);
  });
});

describe('QuorumPolicy — shouldRecruit / shouldSplit', () => {
  it('shouldRecruit=true below optimalSize', () => {
    const p = make();
    p.setMemberCount(3);
    expect(p.shouldRecruit()).toBe(true);
  });
  it('shouldRecruit=false at optimalSize', () => {
    const p = make();
    p.setMemberCount(5);
    expect(p.shouldRecruit()).toBe(false);
  });
  it('shouldSplit=false below maximumSize', () => {
    const p = make({ maximumSize: 50 });
    p.setMemberCount(49);
    expect(p.shouldSplit()).toBe(false);
  });
  it('shouldSplit=true above maximumSize', () => {
    const p = make({ maximumSize: 50 });
    p.setMemberCount(51);
    expect(p.shouldSplit()).toBe(true);
  });
});

describe('QuorumPolicy — getHealthScore', () => {
  it('0 members → health=0', () => {
    const p = make();
    p.setMemberCount(0);
    expect(p.getHealthScore()).toBe(0);
  });
  it('at optimal → health=1', () => {
    const p = make();
    p.setMemberCount(5);
    expect(p.getHealthScore()).toBe(1);
  });
  it('above optimal (within max) → health=1', () => {
    const p = make();
    p.setMemberCount(20);
    expect(p.getHealthScore()).toBe(1);
  });
  it('between min and optimal → 0.5 < health < 1', () => {
    const p = make();
    p.setMemberCount(3);
    expect(p.getHealthScore()).toBeGreaterThan(0.5);
    expect(p.getHealthScore()).toBeLessThan(1);
  });
  it('below minimum → health < 0.5', () => {
    const p = make({ minimumSize: 5 });
    p.setMemberCount(2);
    expect(p.getHealthScore()).toBeLessThan(0.5);
    expect(p.getHealthScore()).toBeGreaterThan(0);
  });
  it('above maximum → health still >= 0.5 (degraded, not critical)', () => {
    const p = make({ maximumSize: 10 });
    p.setMemberCount(15);
    expect(p.getHealthScore()).toBeGreaterThanOrEqual(0.5);
  });
  it('getConfig returns immutable copy', () => {
    const p = make();
    const c = p.getConfig();
    c.minimumSize = 99;
    expect(p.getConfig().minimumSize).toBe(2);
  });
});
