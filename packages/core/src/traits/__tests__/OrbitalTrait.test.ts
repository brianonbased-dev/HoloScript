import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockNode, createMockContext, attachTrait, updateTrait } from './traitTestHelpers';

// Mock KeplerianCalculator
vi.mock('@holoscript/engine/orbital', () => ({
  calculatePosition: vi.fn(() => ([1.0, 0.5, 0.2 ])),
}));

// Mock logger
vi.mock('../../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { orbitalHandler } from '../OrbitalTrait';
import { calculatePosition } from '@holoscript/engine/orbital';
import { logger } from '../../logger';

describe('OrbitalTrait', () => {
  let node: Record<string, unknown>;
  let ctx: any;
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
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('OrbitalTrait'));
  });

  it('calculates position on update', async () => {
    await updateTrait(orbitalHandler, node, cfg, ctx, 0.016);
    expect(calculatePosition).toHaveBeenCalled();
  });

  it('maps Keplerian Z to Three.js Y (coordinate swap)', async () => {
    await updateTrait(orbitalHandler, node, cfg, ctx, 0.016);
    // rawPosition = [1.0, 0.5, 0.2 ]
    // Three.js: x = raw.x * scale, y = raw.z * scale, z = raw.y * scale
    const pos = node.position as unknown as number[];
    expect(pos[1]).toBeCloseTo(0.2 * 50, 0); // Z→Y
    expect(pos[2]).toBeCloseTo(0.5 * 50, 0); // Y→Z
  });

  it('applies visual scale', async () => {
    await updateTrait(orbitalHandler, node, cfg, ctx, 0.016);
    const pos = node.position as unknown as number[];
    expect(pos[0]).toBeCloseTo(1.0 * 50, 0);
  });

  it('emits position_update event', async () => {
    await updateTrait(orbitalHandler, node, cfg, ctx, 0.016);
    const posEvents = ctx.emittedEvents.filter((e: any) => e.event === 'position_update');
    expect(posEvents.length).toBe(1);
  });

  it('does nothing without semiMajorAxis', async () => {
    await updateTrait(orbitalHandler, node, {}, ctx, 0.016);
    expect(calculatePosition).not.toHaveBeenCalled();
  });

  it('adds parent offset for satellites', async () => {
    const parentNode = { position: [100, 200, 300] };
    ctx.getNode = vi.fn().mockReturnValue(parentNode);
    const moonCfg = { ...cfg, parent: 'earth' };
    await updateTrait(orbitalHandler, node, moonCfg, ctx, 0.016);
    const pos = node.position as unknown as number[];
    expect(pos[0]).toBeGreaterThan(100);
    expect(pos[1]).toBeGreaterThan(200);
  });

  it('warns when parent not found', async () => {
    ctx.getNode = vi.fn().mockReturnValue(null);
    const moonCfg = { ...cfg, parent: 'jupiter' };
    await updateTrait(orbitalHandler, node, moonCfg, ctx, 0.016);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('jupiter'));
  });

  it('has correct handler name', () => {
    expect(orbitalHandler.name).toBe('orbital');
  });
});
