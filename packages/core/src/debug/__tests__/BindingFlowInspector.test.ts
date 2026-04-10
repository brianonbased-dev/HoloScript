import { describe, it, expect, beforeEach } from 'vitest';
import { BindingFlowInspector } from '../BindingFlowInspector';

describe('BindingFlowInspector', () => {
  let inspector: BindingFlowInspector;

  beforeEach(() => {
    inspector = new BindingFlowInspector();
    inspector.setEnabled(true);
  });

  it('should register and retrieve bindings', () => {
    const id = inspector.registerBinding('orb1', 'orb2', 'position', 'orb1.position + [1,0,0]');
    expect(id).toBe('orb1->orb2:position');

    const bindings = inspector.getActiveBindings();
    expect(bindings).toHaveLength(1);
    expect(bindings[0].sourceId).toBe('orb1');
  });

  it('should track updates to recorded bindings', () => {
    const id = inspector.registerBinding('p1', 'p2', 'health', 'p1.health');
    inspector.trackUpdate(id, 85);

    const b = inspector.getActiveBindings()[0];
    expect(b.lastValue).toBe(85);
    expect(b.updateCount).toBe(1);

    inspector.trackUpdate(id, 70);
    expect(b.updateCount).toBe(2);
  });

  it('should respect enabled/disabled state', () => {
    const id = inspector.registerBinding('a', 'b', 'v', 'a.v');
    inspector.setEnabled(false);
    inspector.trackUpdate(id, 10);

    const b = inspector.getActiveBindings()[0];
    expect(b.updateCount).toBe(0);
    expect(b.lastValue).toBeUndefined();
  });

  it('should reset stats correctly', () => {
    const id = inspector.registerBinding('x', 'y', 'z', 'x.z');
    inspector.trackUpdate(id, 5);
    inspector.resetStats();

    expect(inspector.getActiveBindings()[0].updateCount).toBe(0);
  });
});
