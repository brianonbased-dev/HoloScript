import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockNode, createMockContext, attachTrait, updateTrait } from './traitTestHelpers';

// Mock KeplerianCalculator
vi.mock('@holoscript/engine/orbital', () => ({
  calculatePosition: vi.fn(() => ({ x: 1.0, y: 0.5, z: 0.2 })),
}));

import { orbitalHandler } from '../OrbitalTrait';
import { calculatePosition } from '@holoscript/engine/orbital';

describe('OrbitalTrait', () => {
  let node: Record<string, unknown>;
  let ctx: any;
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  const cfg = {
    semiMajorAxis: 1.0,
    eccentricity: 0.017,
    inclination: 0,
    longitudeOfAscendingNode: 0,
    argumentOfPerihelion: 0,
    meanAnomaly: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    node = createMockNode('earth');
    (node as any).properties = {};
    ctx = {
      ...createMockContext(),
      julianDate: 2451545.0,
      getScaleMultiplier: () => 1.0,
      getNode: vi.fn(),
    };
    attachTrait(orbitalHandler, node, cfg, ctx);
  });

  it('logs on attach', () => {
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('OrbitalTrait'));
  });

  it('calculates position on update', () => {
    updateTrait(orbitalHandler, node, cfg, ctx, 0.016);
    expect(calculatePosition).toHaveBeenCalled();
  });

  it('maps Keplerian Z to Three.js Y (coordinate swap)', () => {
    updateTrait(orbitalHandler, node, cfg, ctx, 0.016);
    // rawPosition = [1.0, 0.5, 0.2 ]
    // Three.js: x = raw.x * scale, y = raw.z * scale, z = raw.y * scale
    const pos = node.position as unknown as number[];
    expect(pos[1]).toBeCloseTo(0.2 * 50, 0); // Z→Y
    expect(pos[2]).toBeCloseTo(0.5 * 50, 0); // Y→Z
  });

  it('applies visual scale', () => {
    updateTrait(orbitalHandler, node, cfg, ctx, 0.016);
    const pos = node.position as unknown as number[];
    expect(pos[0]).toBeCloseTo(1.0 * 50, 0);
  });

  it('emits position_update event', () => {
    updateTrait(orbitalHandler, node, cfg, ctx, 0.016);
    const posEvents = ctx.emittedEvents.filter((e: any) => e.event === 'position_update');
    expect(posEvents.length).toBe(1);
  });

  it('does nothing without semiMajorAxis', () => {
    updateTrait(orbitalHandler, node, {}, ctx, 0.016);
    expect(calculatePosition).not.toHaveBeenCalled();
  });

  it('adds parent offset for satellites', () => {
    const parentNode = { position: [100, 200, 300] };
    ctx.getNode = vi.fn().mockReturnValue(parentNode);
    const moonCfg = { ...cfg, parent: 'earth' };
    updateTrait(orbitalHandler, node, moonCfg, ctx, 0.016);
    const pos = node.position as unknown as number[];
    expect(pos[0]).toBeGreaterThan(100);
    expect(pos[1]).toBeGreaterThan(200);
  });

  it('warns when parent not found', () => {
    ctx.getNode = vi.fn().mockReturnValue(null);
    const moonCfg = { ...cfg, parent: 'jupiter' };
    updateTrait(orbitalHandler, node, moonCfg, ctx, 0.016);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Parent "jupiter" not found'));
  });

  it('has correct handler name', () => {
    expect(orbitalHandler.name).toBe('orbital');
  });
});
