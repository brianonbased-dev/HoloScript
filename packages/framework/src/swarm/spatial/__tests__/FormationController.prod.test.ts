/**
 * FormationController — Production Tests
 */
import { describe, it, expect } from 'vitest';
import { FormationController } from '../FormationController';
import { Vector3 } from '../Vector3';

function make(cfg = {}) {
  return new FormationController(cfg);
}
function v(x: number, y = 0, z = 0) {
  return new Vector3(x, y, z);
}

describe('FormationController — defaults', () => {
  it('constructs without args', () => expect(() => make()).not.toThrow());
  it('default type=line', () => expect(make().getConfig().type).toBe('line'));
  it('default spacing=2', () => expect(make().getConfig().spacing).toBe(2));
  it('default scale=1', () => expect(make().getConfig().scale).toBe(1));
});

describe('FormationController — line formation', () => {
  it('generates correct slot count', () => {
    expect(make({ type: 'line' }).generateSlots(5)).toHaveLength(5);
  });
  it('slot[0] is leader', () => {
    expect(make({ type: 'line' }).generateSlots(3)[0].isLeaderSlot).toBe(true);
  });
  it('positions centered at spacing=2', () => {
    const slots = make({ type: 'line', spacing: 2 }).generateSlots(3);
    expect(slots[0].localPosition[0]).toBeCloseTo(-2, 5);
    expect(slots[1].localPosition[0]).toBeCloseTo(0, 5);
    expect(slots[2].localPosition[0]).toBeCloseTo(2, 5);
  });
  it('single slot at origin', () => {
    expect(make({ type: 'line', spacing: 2 }).generateSlots(1)[0].localPosition[0]).toBe(0);
  });
});

describe('FormationController — circle formation', () => {
  it('generates correct count', () => {
    expect(make({ type: 'circle' }).generateSlots(6)).toHaveLength(6);
  });
  it('all slots equidistant from center', () => {
    const slots = make({ type: 'circle', spacing: 3 }).generateSlots(8);
    const r = slots[0].localPosition.magnitude();
    for (const s of slots) expect(s.localPosition.magnitude()).toBeCloseTo(r, 3);
  });
  it('y=0 for all slots', () => {
    for (const s of make({ type: 'circle' }).generateSlots(6)) expect(s.localPosition[1]).toBe(0);
  });
});

describe('FormationController — grid formation', () => {
  it('generates correct count', () => {
    expect(make({ type: 'grid' }).generateSlots(9)).toHaveLength(9);
  });
  it('y=0 for all slots', () => {
    for (const s of make({ type: 'grid' }).generateSlots(4)) expect(s.localPosition[1]).toBe(0);
  });
});

describe('FormationController — wedge formation', () => {
  it('generates correct count', () => {
    expect(make({ type: 'wedge' }).generateSlots(5)).toHaveLength(5);
  });
  it('leader at z=0', () => {
    expect(make({ type: 'wedge' }).generateSlots(5)[0].localPosition[2]).toBe(0);
  });
});

describe('FormationController — sphere formation', () => {
  it('generates correct count', () => {
    expect(make({ type: 'sphere' }).generateSlots(10)).toHaveLength(10);
  });
  it('positions unique', () => {
    const slots = make({ type: 'sphere' }).generateSlots(20);
    const keys = slots.map(
      (s) =>
        `${s.localPosition[0].toFixed(2)},${s.localPosition[1].toFixed(2)},${s.localPosition[2].toFixed(2)}`
    );
    expect(new Set(keys).size).toBe(20);
  });
});

describe('FormationController — diamond formation', () => {
  it('generates correct count', () => {
    expect(make({ type: 'diamond' }).generateSlots(7)).toHaveLength(7);
  });
});

describe('FormationController — custom formation', () => {
  it('creates slots from positions', () => {
    const f = make();
    f.setCustomFormation([v(0), v(5), v(10)]);
    expect(f.getAllSlots()).toHaveLength(3);
  });
  it('type becomes custom', () => {
    const f = make({ type: 'line' });
    f.setCustomFormation([v(0)]);
    expect(f.getConfig().type).toBe('custom');
  });
});

describe('FormationController — assignAgent / removeAgent', () => {
  it('first agent gets slot 0', () => {
    const f = make({ type: 'line' });
    f.generateSlots(3);
    expect(f.assignAgent('a1')).toBe(0);
  });
  it('sequential agents get sequential slots', () => {
    const f = make({ type: 'line' });
    f.generateSlots(3);
    expect(f.assignAgent('a1')).toBe(0);
    expect(f.assignAgent('a2')).toBe(1);
  });
  it('assignAgent to specific slot', () => {
    const f = make({ type: 'line' });
    f.generateSlots(3);
    expect(f.assignAgent('a1', 2)).toBe(2);
  });
  it('returns -1 when full', () => {
    const f = make({ type: 'line' });
    f.generateSlots(2);
    f.assignAgent('a1');
    f.assignAgent('a2');
    expect(f.assignAgent('a3')).toBe(-1);
  });
  it('removeAgent frees slot', () => {
    const f = make({ type: 'line' });
    f.generateSlots(2);
    f.assignAgent('a1');
    expect(f.removeAgent('a1')).toBe(true);
    expect(f.getAvailableSlots()).toHaveLength(2);
  });
  it('removeAgent unknown returns false', () => {
    const f = make({ type: 'line' });
    f.generateSlots(2);
    expect(f.removeAgent('ghost')).toBe(false);
  });
  it('getAgentSlot returns assigned slot', () => {
    const f = make({ type: 'line' });
    f.generateSlots(3);
    f.assignAgent('a1', 1);
    expect(f.getAgentSlot('a1')?.index).toBe(1);
  });
  it('getAgentTarget returns world position', () => {
    const f = make({ type: 'line' });
    f.generateSlots(3);
    f.assignAgent('a1');
    expect(f.getAgentTarget('a1')).toBeDefined();
  });
});

describe('FormationController — completeness', () => {
  it('isComplete=false when slots available', () => {
    const f = make({ type: 'line' });
    f.generateSlots(2);
    expect(f.isComplete()).toBe(false);
  });
  it('isComplete=true when all filled', () => {
    const f = make({ type: 'line' });
    f.generateSlots(2);
    f.assignAgent('a1');
    f.assignAgent('a2');
    expect(f.isComplete()).toBe(true);
  });
  it('ratio = assigned/total', () => {
    const f = make({ type: 'line' });
    f.generateSlots(4);
    f.assignAgent('a1');
    f.assignAgent('a2');
    expect(f.getCompletenessRatio()).toBeCloseTo(0.5, 5);
  });
});

describe('FormationController — setCenter/setRotation/tightness', () => {
  it('setCenter offsets world positions', () => {
    const f = make({ type: 'line', spacing: 2 });
    f.generateSlots(3);
    f.setCenter(v(100, 0, 0));
    expect(f.getAllSlots()[1].worldPosition[0]).toBeCloseTo(100, 5);
  });
  it('setRotation changes world positions', () => {
    const f = make({ type: 'line', spacing: 2 });
    f.generateSlots(3);
    const before = f.getAllSlots()[2].worldPosition[0];
    f.setRotation(Math.PI / 2);
    expect(f.getAllSlots()[2].worldPosition[0]).not.toBeCloseTo(before, 1);
  });
  it('getCenter returns set value', () => {
    const f = make({ type: 'line' });
    f.generateSlots(1);
    f.setCenter(v(7, 0, 0));
    expect(f.getCenter()[0]).toBe(7);
  });
  it('tightness=1 when agents exactly on target', () => {
    const f = make({ type: 'line', spacing: 2 });
    f.generateSlots(2);
    f.assignAgent('a1', 0);
    f.assignAgent('a2', 1);
    const pos = new Map<string, Vector3>([
      ['a1', f.getAgentTarget('a1')!],
      ['a2', f.getAgentTarget('a2')!],
    ]);
    expect(f.getFormationTightness(pos)).toBeCloseTo(1, 5);
  });
  it('tightness<1 when off target', () => {
    const f = make({ type: 'line', spacing: 2 });
    f.generateSlots(2);
    f.assignAgent('a1', 0);
    const target = f.getAgentTarget('a1')!;
    const pos = new Map<string, Vector3>([['a1', v(target[0] + 5)]]);
    expect(f.getFormationTightness(pos)).toBeLessThan(1);
  });
});

describe('FormationController — optimizeAssignments', () => {
  it('assigns all available agents', () => {
    const f = make({ type: 'line', spacing: 2 });
    f.generateSlots(2);
    const slots = f.getAllSlots();
    const positions = new Map<string, Vector3>([
      ['a1', v(slots[1].worldPosition[0])],
      ['a2', v(slots[0].worldPosition[0])],
    ]);
    f.optimizeAssignments(positions);
    expect(f.getAssignedSlots()).toHaveLength(2);
  });
});

describe('FormationController — setConfig', () => {
  it('partial update merges without overwriting others', () => {
    const f = make({ spacing: 2, type: 'line' });
    f.generateSlots(3);
    f.setConfig({ spacing: 5 });
    expect(f.getConfig().spacing).toBe(5);
    expect(f.getConfig().type).toBe('line');
  });
});
