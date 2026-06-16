import { describe, it, expect } from 'vitest';
import {
  dhTransform,
  solveFk,
  solveIk,
  kinematicChainHandler,
  type DHParameter,
} from '../KinematicChainTrait';

const NEAR = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const EPS = 1e-4;

// ── dhTransform ───────────────────────────────────────────────────────────────

describe('dhTransform', () => {
  it('all-zero params → identity', () => {
    const T = dhTransform(0, 0, 0, 0);
    const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    T.forEach((v, i) => expect(v).toBeCloseTo(I[i], 6));
  });

  it('pure x translation (a=1, others=0)', () => {
    const T = dhTransform(1, 0, 0, 0);
    expect(T[3]).toBeCloseTo(1, 6);   // x
    expect(T[7]).toBeCloseTo(0, 6);   // y
    expect(T[11]).toBeCloseTo(0, 6);  // z
    // rotation block = identity
    expect(T[0]).toBeCloseTo(1, 6);
    expect(T[5]).toBeCloseTo(1, 6);
    expect(T[10]).toBeCloseTo(1, 6);
  });

  it('pure z translation (d=2, others=0)', () => {
    const T = dhTransform(0, 0, 2, 0);
    expect(T[3]).toBeCloseTo(0, 6);
    expect(T[7]).toBeCloseTo(0, 6);
    expect(T[11]).toBeCloseTo(2, 6);
  });

  it('θ=π/2 rotation around z', () => {
    const T = dhTransform(0, 0, 0, Math.PI / 2);
    expect(T[0]).toBeCloseTo(0, 6);   // cos(π/2)
    expect(T[1]).toBeCloseTo(-1, 6);  // -sin(π/2)
    expect(T[4]).toBeCloseTo(1, 6);   // sin(π/2)
    expect(T[5]).toBeCloseTo(0, 6);   // cos(π/2)
  });

  it('α=π/2 twists x into -z for new y, z into +y', () => {
    // dhTransform(0, π/2, 0, 0): ct=1,st=0,ca=0,sa=1
    // Row 1 (y): [ 0,  0, -1, 0 ]   T[4..7]
    // Row 2 (z): [ 0,  1,  0, 0 ]   T[8..11]
    const T = dhTransform(0, Math.PI / 2, 0, 0);
    // z-axis of new frame = column 2 = (T[2], T[6], T[10]) = (0, -1, 0)
    expect(T[2]).toBeCloseTo(0, 6);
    expect(T[6]).toBeCloseTo(-1, 6);
    expect(T[10]).toBeCloseTo(0, 6);
  });
});

// ── solveFk — 2-link planar arm (a=[1,1], alpha=0, d=0, theta=0) ─────────────

function planarLinks(n: number, linkLen = 1): DHParameter[] {
  return Array.from({ length: n }, () => ({ a: linkLen, alpha: 0, d: 0, theta: 0 }));
}

describe('solveFk – 2-link planar arm', () => {
  const links = planarLinks(2);

  it('q=[0,0] → ee=(2,0,0)', () => {
    const { endEffectorPosition: p } = solveFk(links, [0, 0]);
    expect(p.x).toBeCloseTo(2, 5);
    expect(p.y).toBeCloseTo(0, 5);
    expect(p.z).toBeCloseTo(0, 5);
  });

  it('q=[π/2,0] → ee=(0,2,0)', () => {
    const { endEffectorPosition: p } = solveFk(links, [Math.PI / 2, 0]);
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeCloseTo(2, 5);
    expect(p.z).toBeCloseTo(0, 5);
  });

  it('q=[π,0] → ee=(-2,0,0)', () => {
    const { endEffectorPosition: p } = solveFk(links, [Math.PI, 0]);
    expect(p.x).toBeCloseTo(-2, 5);
    expect(p.y).toBeCloseTo(0, 5);
    expect(p.z).toBeCloseTo(0, 5);
  });

  it('q=[π/4,π/4] → ee≈(0.707, 1.707, 0)', () => {
    const { endEffectorPosition: p } = solveFk(links, [Math.PI / 4, Math.PI / 4]);
    const s = Math.SQRT2 / 2;
    expect(p.x).toBeCloseTo(s, 5);
    expect(p.y).toBeCloseTo(1 + s, 5);
    expect(p.z).toBeCloseTo(0, 5);
  });

  it('returns n frameTransforms', () => {
    const { frameTransforms } = solveFk(links, [0, 0]);
    expect(frameTransforms).toHaveLength(2);
    frameTransforms.forEach((T) => expect(T).toHaveLength(16));
  });

  it('endEffectorTransform last column matches endEffectorPosition', () => {
    const r = solveFk(links, [Math.PI / 3, -Math.PI / 6]);
    expect(r.endEffectorTransform[3]).toBeCloseTo(r.endEffectorPosition.x, 6);
    expect(r.endEffectorTransform[7]).toBeCloseTo(r.endEffectorPosition.y, 6);
    expect(r.endEffectorTransform[11]).toBeCloseTo(r.endEffectorPosition.z, 6);
  });
});

describe('solveFk – single link with d offset', () => {
  it('d=3, a=0, α=0, q=0 → ee=(0,0,3)', () => {
    const links: DHParameter[] = [{ a: 0, alpha: 0, d: 3, theta: 0 }];
    const { endEffectorPosition: p } = solveFk(links, [0]);
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeCloseTo(0, 5);
    expect(p.z).toBeCloseTo(3, 5);
  });
});

describe('solveFk – 3-link planar arm', () => {
  const links = planarLinks(3);

  it('q=[0,0,0] → ee=(3,0,0)', () => {
    const { endEffectorPosition: p } = solveFk(links, [0, 0, 0]);
    expect(p.x).toBeCloseTo(3, 5);
    expect(p.y).toBeCloseTo(0, 5);
    expect(p.z).toBeCloseTo(0, 5);
  });

  it('planar arm stays in z=0 plane for any θ', () => {
    const angles = [0.3, -0.7, 1.2];
    const { endEffectorPosition: p } = solveFk(links, angles);
    expect(Math.abs(p.z)).toBeLessThan(1e-10);
  });
});

// ── solveIk ───────────────────────────────────────────────────────────────────

describe('solveIk – 2-link planar arm', () => {
  const links = planarLinks(2);

  it('reachable target (1,1,0) converges', () => {
    const r = solveIk({ links, target: { x: 1, y: 1, z: 0 } });
    expect(r.converged).toBe(true);
    expect(r.finalError).toBeLessThan(EPS);
    expect(r.jointAngles).toHaveLength(2);
  });

  it('FK∘IK round-trip within tolerance', () => {
    const target = { x: 1.5, y: 0.5, z: 0 };
    const ik = solveIk({ links, target });
    expect(ik.converged).toBe(true);
    const fk = solveFk(links, ik.jointAngles);
    expect(NEAR(fk.endEffectorPosition.x, target.x, EPS)).toBe(true);
    expect(NEAR(fk.endEffectorPosition.y, target.y, EPS)).toBe(true);
    expect(NEAR(fk.endEffectorPosition.z, target.z, EPS)).toBe(true);
  });

  it('near-origin target (0.1,0,0) — collinear edge, reports final error', () => {
    // Fully folded (origin) is singular for gradient solvers; test that
    // the solver runs and returns a valid result shape without throwing.
    const r = solveIk({
      links,
      target: { x: 0.1, y: 0, z: 0 },
      maxIterations: 50,
      tolerance: 1e-3,
    });
    expect(r.jointAngles).toHaveLength(2);
    expect(typeof r.finalError).toBe('number');
    expect(typeof r.iterations).toBe('number');
  });

  it('respects maxIterations', () => {
    const r = solveIk({
      links,
      target: { x: 0.5, y: 0.5, z: 0 },
      maxIterations: 3,
    });
    expect(r.iterations).toBeLessThanOrEqual(3);
  });

  it('returns jointAngles.length === links.length', () => {
    const r = solveIk({ links, target: { x: 1, y: 0, z: 0 } });
    expect(r.jointAngles).toHaveLength(links.length);
  });

  it('uses initialAngles when provided', () => {
    const target = { x: 1, y: 1, z: 0 };
    const r1 = solveIk({ links, target });
    const r2 = solveIk({ links, target, initialAngles: [r1.jointAngles[0], r1.jointAngles[1]] });
    // Starting from the solution should converge immediately (0 or 1 iterations)
    expect(r2.converged).toBe(true);
    expect(r2.iterations).toBeLessThanOrEqual(2);
  });
});

describe('solveIk – 3-DOF arm', () => {
  it('converges to a target within workspace', () => {
    const links = planarLinks(3);
    const r = solveIk({ links, target: { x: 1, y: 1, z: 0 } });
    expect(r.converged).toBe(true);
    expect(r.finalError).toBeLessThan(EPS);
  });

  it('FK∘IK round-trip on 3-DOF arm', () => {
    const links = planarLinks(3);
    const target = { x: 2, y: 0.5, z: 0 };
    const ik = solveIk({ links, target });
    expect(ik.converged).toBe(true);
    const fk = solveFk(links, ik.jointAngles);
    expect(NEAR(fk.endEffectorPosition.x, target.x, EPS)).toBe(true);
    expect(NEAR(fk.endEffectorPosition.y, target.y, EPS)).toBe(true);
  });
});

// ── TraitHandler ──────────────────────────────────────────────────────────────

function makeNode(): Record<string, unknown> {
  return {};
}

describe('kinematicChainHandler.onAttach', () => {
  it('pre-computes FK when links and jointAngles are set', () => {
    const node = makeNode();
    const links = planarLinks(2);
    kinematicChainHandler.onAttach!(node as never, { links, jointAngles: [0, 0] }, {} as never);
    expect(node.__kinematic_fk).toBeDefined();
    const fk = node.__kinematic_fk as ReturnType<typeof solveFk>;
    expect(fk.endEffectorPosition.x).toBeCloseTo(2, 5);
  });

  it('skips FK when links is empty', () => {
    const node = makeNode();
    kinematicChainHandler.onAttach!(node as never, { links: [], jointAngles: [] }, {} as never);
    expect(node.__kinematic_fk).toBeUndefined();
  });

  it('skips FK when jointAngles length does not match links', () => {
    const node = makeNode();
    kinematicChainHandler.onAttach!(node as never, { links: planarLinks(2), jointAngles: [0] }, {} as never);
    expect(node.__kinematic_fk).toBeUndefined();
  });
});

describe('kinematicChainHandler.onEvent', () => {
  it('solve_fk event writes FK to node', () => {
    const node = makeNode();
    const links = planarLinks(2);
    kinematicChainHandler.onEvent!(
      node as never,
      { links, jointAngles: [0, 0] },
      {} as never,
      { type: 'kinematic_chain.solve_fk', links, jointAngles: [Math.PI / 2, 0] } as never,
    );
    const fk = node.__kinematic_fk as ReturnType<typeof solveFk>;
    expect(fk.endEffectorPosition.x).toBeCloseTo(0, 5);
    expect(fk.endEffectorPosition.y).toBeCloseTo(2, 5);
  });

  it('solve_fk falls back to config links/angles when event omits them', () => {
    const node = makeNode();
    const links = planarLinks(2);
    kinematicChainHandler.onEvent!(
      node as never,
      { links, jointAngles: [0, 0] },
      {} as never,
      { type: 'kinematic_chain.solve_fk' } as never,
    );
    const fk = node.__kinematic_fk as ReturnType<typeof solveFk>;
    expect(fk.endEffectorPosition.x).toBeCloseTo(2, 5);
  });

  it('solve_ik event writes converged IK to node', () => {
    const node = makeNode();
    const links = planarLinks(2);
    kinematicChainHandler.onEvent!(
      node as never,
      { links, jointAngles: [0, 0] },
      {} as never,
      { type: 'kinematic_chain.solve_ik', links, target: { x: 1, y: 1, z: 0 } } as never,
    );
    const ik = node.__kinematic_ik as ReturnType<typeof solveIk>;
    expect(ik.converged).toBe(true);
    expect(ik.finalError).toBeLessThan(EPS);
  });

  it('solve_ik uses default target (0,0,0) when event omits it', () => {
    const node = makeNode();
    const links = planarLinks(2);
    kinematicChainHandler.onEvent!(
      node as never,
      { links, jointAngles: [0, 0] },
      {} as never,
      { type: 'kinematic_chain.solve_ik' } as never,
    );
    const ik = node.__kinematic_ik as ReturnType<typeof solveIk>;
    expect(ik.jointAngles).toHaveLength(2);
  });

  it('unknown event type does not throw', () => {
    const node = makeNode();
    expect(() =>
      kinematicChainHandler.onEvent!(
        node as never,
        { links: [], jointAngles: [] },
        {} as never,
        { type: 'unknown.event' } as never,
      ),
    ).not.toThrow();
  });
});
