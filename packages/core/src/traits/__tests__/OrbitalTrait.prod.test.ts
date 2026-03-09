/**
 * OrbitalTrait — Production Test Suite
 *
 * orbitalHandler delegates position computation to KeplerianCalculator.calculatePosition.
 * We vi.mock that module to control outputs deterministically.
 *
 * Key behaviours:
 * 1. onAttach — no crash (just logs)
 * 2. onUpdate — no-op when semiMajorAxis absent
 * 3. onUpdate — calls calculatePosition with merged config
 * 4. onUpdate — applies visualScale (getScaleMultiplier * 50) to raw position
 * 5. onUpdate — maps Keplerian Z → Three.js Y (y: rawPos.z * scale)
 * 6. onUpdate — applies satelliteScale (×5) when config.parent is set
 * 7. onUpdate — adds parent node position when getNode resolves it
 * 8. onUpdate — emits position_update with final position
 * 9. onUpdate — updates node.position
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── mock KeplerianCalculator ──────────────────────────────────────────────
vi.mock('../../orbital/KeplerianCalculator', () => ({
  calculatePosition: vi.fn().mockReturnValue({ x: 1, y: 2, z: 3 }),
}));

import { orbitalHandler } from '../OrbitalTrait';
import { calculatePosition } from '../../orbital/KeplerianCalculator';

const mockCalcPos = calculatePosition as ReturnType<typeof vi.fn>;

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode(properties: Record<string, any> = {}, name = 'earth') {
  return { id: 'orb_node', name, properties, position: { x: 0, y: 0, z: 0 } };
}

function makeCtx(overrides: Record<string, any> = {}) {
  return {
    emit: vi.fn(),
    julianDate: 2451545.0, // J2000
    getScaleMultiplier: vi.fn().mockReturnValue(1),
    getNode: vi.fn().mockReturnValue(null),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCalcPos.mockReturnValue({ x: 1, y: 2, z: 3 });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('orbitalHandler.onAttach', () => {
  it('does not throw', () => {
    const node = makeNode();
    const ctx = makeCtx();
    expect(() => orbitalHandler.onAttach!(node as any, {} as any, ctx as any)).not.toThrow();
  });

  it('does not emit any event on attach', () => {
    const node = makeNode();
    const ctx = makeCtx();
    orbitalHandler.onAttach!(node as any, {} as any, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onUpdate — early-out ─────────────────────────────────────────────────────

describe('orbitalHandler.onUpdate — early-out (no semiMajorAxis)', () => {
  it('is a no-op when config has no semiMajorAxis AND node.properties has no semiMajorAxis', () => {
    const node = makeNode({}); // no semiMajorAxis in properties
    const ctx = makeCtx();
    orbitalHandler.onUpdate!(node as any, {} as any, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
    expect(mockCalcPos).not.toHaveBeenCalled();
  });

  it('proceeds when node.properties has semiMajorAxis (merged config path)', () => {
    const node = makeNode({ semiMajorAxis: 1.0 });
    const ctx = makeCtx();
    orbitalHandler.onUpdate!(node as any, {} as any, ctx as any, 0.016);
    expect(mockCalcPos).toHaveBeenCalled();
  });

  it('proceeds when config has semiMajorAxis', () => {
    const node = makeNode({});
    const ctx = makeCtx();
    orbitalHandler.onUpdate!(node as any, { semiMajorAxis: 1.0 } as any, ctx as any, 0.016);
    expect(mockCalcPos).toHaveBeenCalled();
  });
});

// ─── onUpdate — calculatePosition call ───────────────────────────────────────

describe('orbitalHandler.onUpdate — calculatePosition', () => {
  it('passes julianDate from context to calculatePosition', () => {
    const node = makeNode({ semiMajorAxis: 1.5 });
    const ctx = makeCtx({ julianDate: 2451545.0 });
    orbitalHandler.onUpdate!(node as any, {} as any, ctx as any, 0.016);
    expect(mockCalcPos).toHaveBeenCalledWith(expect.anything(), 2451545.0);
  });

  it('uses julianDate=0 when not on context', () => {
    const node = makeNode({ semiMajorAxis: 1.5 });
    const ctx = makeCtx();
    delete (ctx as any).julianDate;
    orbitalHandler.onUpdate!(node as any, {} as any, ctx as any, 0.016);
    expect(mockCalcPos).toHaveBeenCalledWith(expect.anything(), 0);
  });

  it('merges node.properties into config (node properties override config)', () => {
    const node = makeNode({ semiMajorAxis: 2.0, eccentricity: 0.1 });
    const ctx = makeCtx();
    orbitalHandler.onUpdate!(node as any, { semiMajorAxis: 1.0 } as any, ctx as any, 0.016);
    // config properties come after node properties → config.semiMajorAxis=1.0 wins (spread: {...props,...config})
    // Actually: mergedConfig = { ...properties, ...config } → config wins
    const calledWith = mockCalcPos.mock.calls[0][0];
    expect(calledWith.semiMajorAxis).toBe(1.0); // config wins
    expect(calledWith.eccentricity).toBe(0.1); // from node properties
  });
});

// ─── onUpdate — coordinate mapping ───────────────────────────────────────────

describe('orbitalHandler.onUpdate — position mapping (Keplerian→Three.js)', () => {
  it('maps rawPos.x to finalPosition.x', () => {
    mockCalcPos.mockReturnValue({ x: 2, y: 0, z: 0 });
    const node = makeNode({ semiMajorAxis: 1 });
    const ctx = makeCtx(); // scaleMultiplier=1 → visualScale=50
    orbitalHandler.onUpdate!(node as any, {} as any, ctx as any, 0.016);
    expect(node.position.x).toBeCloseTo(2 * 50, 1);
  });

  it('maps rawPos.z (Keplerian height) → Three.js Y', () => {
    mockCalcPos.mockReturnValue({ x: 0, y: 0, z: 4 });
    const node = makeNode({ semiMajorAxis: 1 });
    const ctx = makeCtx();
    orbitalHandler.onUpdate!(node as any, {} as any, ctx as any, 0.016);
    expect(node.position.y).toBeCloseTo(4 * 50, 1); // rawPos.z → y
  });

  it('maps rawPos.y (Keplerian in-plane) → Three.js Z', () => {
    mockCalcPos.mockReturnValue({ x: 0, y: 3, z: 0 });
    const node = makeNode({ semiMajorAxis: 1 });
    const ctx = makeCtx();
    orbitalHandler.onUpdate!(node as any, {} as any, ctx as any, 0.016);
    expect(node.position.z).toBeCloseTo(3 * 50, 1); // rawPos.y → z
  });

  it('applies scaleMultiplier * 50 to all axes', () => {
    mockCalcPos.mockReturnValue({ x: 1, y: 1, z: 1 });
    const node = makeNode({ semiMajorAxis: 1 });
    const ctx = makeCtx({ getScaleMultiplier: vi.fn().mockReturnValue(2) }); // visualScale=100
    orbitalHandler.onUpdate!(node as any, {} as any, ctx as any, 0.016);
    expect(node.position.x).toBeCloseTo(100, 1);
  });

  it('applies satelliteScale ×5 when config.parent set', () => {
    mockCalcPos.mockReturnValue({ x: 1, y: 0, z: 0 });
    const node = makeNode({});
    const ctx = makeCtx(); // visualScale=50
    // config.parent set → currentScale = visualScale * 5 = 250
    orbitalHandler.onUpdate!(
      node as any,
      { semiMajorAxis: 1, parent: 'earth' } as any,
      ctx as any,
      0.016
    );
    expect(node.position.x).toBeCloseTo(1 * 50 * 5, 1); // 250
  });

  it('does NOT apply satelliteScale when no parent', () => {
    mockCalcPos.mockReturnValue({ x: 1, y: 0, z: 0 });
    const node = makeNode({});
    const ctx = makeCtx();
    orbitalHandler.onUpdate!(node as any, { semiMajorAxis: 1 } as any, ctx as any, 0.016);
    expect(node.position.x).toBeCloseTo(50, 1); // just visualScale
  });
});

// ─── onUpdate — parent offset ─────────────────────────────────────────────────

describe('orbitalHandler.onUpdate — parent node offset', () => {
  it('adds parent node position when getNode resolves it', () => {
    mockCalcPos.mockReturnValue({ x: 0, y: 0, z: 0 });
    const parentNode = { position: { x: 100, y: 200, z: 300 } };
    const ctx = makeCtx({ getNode: vi.fn().mockReturnValue(parentNode) });
    const node = makeNode({});
    orbitalHandler.onUpdate!(
      node as any,
      { semiMajorAxis: 1, parent: 'sun' } as any,
      ctx as any,
      0.016
    );
    // orbPos at (0,0,0) scaled; parent adds offset
    expect(node.position.x).toBeCloseTo(100, 1);
    expect(node.position.y).toBeCloseTo(200, 1);
    expect(node.position.z).toBeCloseTo(300, 1);
  });

  it('no parent offset when getNode returns null', () => {
    mockCalcPos.mockReturnValue({ x: 1, y: 0, z: 0 });
    const ctx = makeCtx({ getNode: vi.fn().mockReturnValue(null) });
    const node = makeNode({});
    orbitalHandler.onUpdate!(
      node as any,
      { semiMajorAxis: 1, parent: 'unknown' } as any,
      ctx as any,
      0.016
    );
    // Position is just the scaled orbital position (no parent offset)
    expect(node.position.x).toBeCloseTo(250, 1); // x=1*50*5 (satellite scale)
  });

  it('supports parent passed as object reference (fallback path)', () => {
    mockCalcPos.mockReturnValue({ x: 0, y: 0, z: 0 });
    const parentObj = { position: { x: 5, y: 10, z: 15 } };
    // getNode returns null, but parent IS the object
    const ctx = makeCtx({ getNode: vi.fn().mockReturnValue(null) });
    const node = makeNode({});
    orbitalHandler.onUpdate!(
      node as any,
      { semiMajorAxis: 1, parent: parentObj } as any,
      ctx as any,
      0.016
    );
    // parent is object with .position → parentNode = parent → adds offset
    expect(node.position.x).toBeCloseTo(5, 1);
    expect(node.position.y).toBeCloseTo(10, 1);
    expect(node.position.z).toBeCloseTo(15, 1);
  });
});

// ─── onUpdate — position_update event ────────────────────────────────────────

describe('orbitalHandler.onUpdate — position_update', () => {
  it('emits position_update with finalPosition', () => {
    mockCalcPos.mockReturnValue({ x: 1, y: 0, z: 0 });
    const node = makeNode({ semiMajorAxis: 1 });
    const ctx = makeCtx();
    orbitalHandler.onUpdate!(node as any, {} as any, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'position_update',
      expect.objectContaining({ position: expect.any(Object) })
    );
  });

  it('emitted position matches node.position', () => {
    mockCalcPos.mockReturnValue({ x: 2, y: 0, z: 0 });
    const node = makeNode({ semiMajorAxis: 1 });
    const ctx = makeCtx();
    orbitalHandler.onUpdate!(node as any, {} as any, ctx as any, 0.016);
    const emitted = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'position_update');
    expect(emitted![1].position).toEqual(node.position);
  });

  it('does NOT emit position_update when semiMajorAxis absent', () => {
    const node = makeNode({});
    const ctx = makeCtx();
    orbitalHandler.onUpdate!(node as any, {} as any, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('position_update', expect.anything());
  });
});
