import { describe, it, expect } from 'vitest';
import { SaturationManager } from '../SaturationManager';
import { RegularGrid3D } from '../RegularGrid3D';

describe('SaturationManager', () => {
  it('detects warning threshold crossing', () => {
    const field = new RegularGrid3D([3, 3, 3], [3, 3, 3]);
    field.fill(0.5);

    const mgr = new SaturationManager({
      field,
      thresholds: { warning: 0.8, critical: 0.95, recovery: 0.7 },
      type: 'thermal',
    });

    // No crossings initially
    let events = mgr.update();
    expect(events.length).toBe(0);

    // Push a cell above warning
    field.set(1, 1, 1, 0.85);
    events = mgr.update();
    expect(events.length).toBe(1);
    expect(events[0].to).toBe('warning');
    expect(events[0].type).toBe('thermal');
  });

  it('detects critical threshold crossing', () => {
    const field = new RegularGrid3D([3, 3, 3], [3, 3, 3]);
    field.fill(0);

    const mgr = new SaturationManager({
      field,
      thresholds: { warning: 0.8, critical: 0.95, recovery: 0.7 },
      type: 'pressure',
    });

    // Jump directly to critical
    field.set(0, 0, 0, 0.98);
    const events = mgr.update();
    expect(events.length).toBe(1);
    expect(events[0].to).toBe('critical');
  });

  it('hysteresis prevents oscillation', () => {
    const field = new Float32Array(5);
    field[0] = 0.85; // above warning

    const mgr = new SaturationManager({
      field,
      thresholds: { warning: 0.8, critical: 0.95, recovery: 0.6 },
      type: 'moisture',
    });

    // Initial: crosses to warning
    mgr.update();
    expect(mgr.getStateField()[0]).toBe(1); // warning

    // Drop to 0.75 — still above recovery (0.6), should stay warning
    field[0] = 0.75;
    mgr.update();
    expect(mgr.getStateField()[0]).toBe(1); // still warning

    // Drop below recovery
    field[0] = 0.5;
    const events = mgr.update();
    expect(mgr.getStateField()[0]).toBe(0); // normal
    expect(events.length).toBe(1);
    expect(events[0].from).toBe('warning');
    expect(events[0].to).toBe('normal');
  });

  it('getSaturationFraction reports correctly', () => {
    const field = new Float32Array(10);
    field.fill(0);
    field[0] = 0.9;
    field[1] = 0.9;
    field[2] = 0.9;

    const mgr = new SaturationManager({
      field,
      thresholds: { warning: 0.8, critical: 0.95, recovery: 0.7 },
      type: 'structural',
    });

    mgr.update();
    expect(mgr.getSaturationFraction()).toBeCloseTo(0.3, 5);
  });

  it('phase transition flag set at critical', () => {
    const field = new Float32Array(5);
    field.fill(0);

    const mgr = new SaturationManager({
      field,
      thresholds: { warning: 300, critical: 373, recovery: 280 },
      type: 'thermal',
      phaseTransition: {
        transitionPoint: 373,
        latentHeat: 2260000,
        fromPhase: 'liquid',
        toPhase: 'gas',
      },
    });

    expect(mgr.isPhaseTransitionActive()).toBe(false);

    // Heat above transition point
    field[0] = 380;
    const events = mgr.update();
    const ptEvent = events.find((e) => e.phaseTransition);
    expect(ptEvent).toBeDefined();
    expect(mgr.isPhaseTransitionActive()).toBe(true);
  });

  it('stats report all categories', () => {
    const field = new Float32Array(10);
    field.fill(0);
    field[0] = 0.85; // warning
    field[1] = 0.96; // critical

    const mgr = new SaturationManager({
      field,
      thresholds: { warning: 0.8, critical: 0.95, recovery: 0.7 },
      type: 'electrical',
    });

    mgr.update();
    const stats = mgr.getStats();
    expect(stats.totalCells).toBe(10);
    expect(stats.warningCount).toBe(1);
    expect(stats.criticalCount).toBe(1);
    expect(stats.normalCount).toBe(8);
  });
});
