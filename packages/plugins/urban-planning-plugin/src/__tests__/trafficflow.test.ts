/**
 * Traffic flow solver tests — urban-planning-plugin
 *
 * Reference values verified against:
 *  - HCM 6th Edition (2016) LOS thresholds
 *  - BPR (1964) manual worked examples
 *  - Sheffi (1985) "Urban Transportation Networks" — UE assignment
 */

import { describe, it, expect } from 'vitest';
import {
  bprTravelTime,
  levelOfService,
  analyzeSegment,
  analyzeSegments,
  greenshieldsModel,
  frankWolfeAssignment,
  buildTrafficFlowReceipt,
  type RoadSegment,
  type NetworkNode,
  type NetworkLink,
  type ODPair,
} from '../trafficflow';

// ─── Reference segment ────────────────────────────────────────────────────────

const freeway: RoadSegment = {
  id:               'I-90-west',
  freeFlowSpeedKph: 100,
  capacityVeh:      2200,
  lengthKm:         5,
  bprAlpha:         0.15,
  bprBeta:          4,
};

// ─── BPR travel time ─────────────────────────────────────────────────────────

describe('bprTravelTime', () => {
  /**
   * Free-flow: t₀ = (5 / 100) × 60 = 3.0 min
   * At v = 0: t = t₀ × (1 + 0.15 × 0) = 3.0 min
   */
  it('returns free-flow time at zero volume', () => {
    const t = bprTravelTime(freeway, 0);
    expect(t).toBeCloseTo(3.0, 4);
  });

  /**
   * At capacity (v = C): t = t₀ × (1 + 0.15 × 1^4) = 3.0 × 1.15 = 3.45 min
   */
  it('returns t₀ × 1.15 at v = C (α = 0.15, β = 4)', () => {
    const t = bprTravelTime(freeway, freeway.capacityVeh);
    expect(t).toBeCloseTo(3.0 * 1.15, 4);
  });

  /**
   * At v = 2C (severely congested): t = 3 × (1 + 0.15 × 2^4) = 3 × 3.4 = 10.2 min
   */
  it('returns correct time at 2× capacity', () => {
    const t = bprTravelTime(freeway, freeway.capacityVeh * 2);
    expect(t).toBeCloseTo(3.0 * (1 + 0.15 * 16), 3);
  });

  it('travel time is monotonically increasing in volume', () => {
    const vols = [0, 500, 1000, 1500, 2000, 2500, 3000];
    const times = vols.map((v) => bprTravelTime(freeway, v));
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
  });

  it('uses default α=0.15 β=4 when not specified', () => {
    const seg: RoadSegment = { id: 'x', freeFlowSpeedKph: 60, capacityVeh: 1000, lengthKm: 2 };
    const t0  = (2 / 60) * 60; // 2 min
    const t   = bprTravelTime(seg, 1000);
    expect(t).toBeCloseTo(t0 * 1.15, 4);
  });
});

// ─── Level of Service ─────────────────────────────────────────────────────────

describe('levelOfService', () => {
  it('LOS A for vc ≤ 0.35', () => {
    expect(levelOfService(0.10)).toBe('A');
    expect(levelOfService(0.35)).toBe('A');
  });

  it('LOS B for 0.35 < vc ≤ 0.54', () => {
    expect(levelOfService(0.40)).toBe('B');
    expect(levelOfService(0.54)).toBe('B');
  });

  it('LOS C for 0.54 < vc ≤ 0.77', () => {
    expect(levelOfService(0.65)).toBe('C');
    expect(levelOfService(0.77)).toBe('C');
  });

  it('LOS D for 0.77 < vc ≤ 0.91', () => {
    expect(levelOfService(0.85)).toBe('D');
    expect(levelOfService(0.91)).toBe('D');
  });

  it('LOS E for 0.91 < vc ≤ 1.00', () => {
    expect(levelOfService(0.95)).toBe('E');
    expect(levelOfService(1.00)).toBe('E');
  });

  it('LOS F for vc > 1.00', () => {
    expect(levelOfService(1.01)).toBe('F');
    expect(levelOfService(1.50)).toBe('F');
  });
});

// ─── analyzeSegment ───────────────────────────────────────────────────────────

describe('analyzeSegment', () => {
  it('returns LOS A for very light traffic', () => {
    const r = analyzeSegment(freeway, 500); // vc = 500/2200 ≈ 0.23
    expect(r.los).toBe('A');
    expect(r.vcRatio).toBeCloseTo(500 / 2200, 4);
  });

  it('avgSpeedKph ≈ freeFlowSpeedKph at v = 0', () => {
    const r = analyzeSegment(freeway, 0);
    expect(r.avgSpeedKph).toBeCloseTo(100, 3);
  });

  it('avgSpeedKph < freeFlowSpeedKph under congestion', () => {
    const r = analyzeSegment(freeway, 2200);
    expect(r.avgSpeedKph).toBeLessThan(freeway.freeFlowSpeedKph);
  });

  it('freeFlowTimeMin = length / speed × 60', () => {
    const r = analyzeSegment(freeway, 0);
    expect(r.freeFlowTimeMin).toBeCloseTo((5 / 100) * 60, 5);
  });

  it('travelTimeMin ≥ freeFlowTimeMin for any volume', () => {
    for (const v of [0, 1000, 2200, 3000]) {
      const r = analyzeSegment(freeway, v);
      expect(r.travelTimeMin).toBeGreaterThanOrEqual(r.freeFlowTimeMin);
    }
  });

  it('throws on negative volume', () => {
    expect(() => analyzeSegment(freeway, -1)).toThrow();
  });

  it('throws on zero capacity', () => {
    const bad = { ...freeway, capacityVeh: 0 };
    expect(() => analyzeSegment(bad, 100)).toThrow();
  });
});

// ─── analyzeSegments ──────────────────────────────────────────────────────────

describe('analyzeSegments', () => {
  it('returns one result per segment', () => {
    const inputs = [
      { segment: freeway, volume: 500 },
      { segment: { ...freeway, id: 'seg2' }, volume: 2000 },
    ];
    const results = analyzeSegments(inputs);
    expect(results).toHaveLength(2);
    expect(results[0].segmentId).toBe('I-90-west');
    expect(results[1].los).not.toBe('A'); // 2000/2200 = 0.91 → LOS D/E
  });
});

// ─── Greenshields model ───────────────────────────────────────────────────────

describe('greenshieldsModel', () => {
  /**
   * Greenshields: u_f = 100 km/h, k_j = 200 veh/km
   * q_max = u_f × k_j / 4 = 100 × 200 / 4 = 5000 veh/h
   * u at capacity = u_f / 2 = 50 km/h
   * k at capacity = k_j / 2 = 100 veh/km
   */
  const model = greenshieldsModel(100, 200);

  it('capacity = u_f × k_j / 4', () => {
    expect(model.capacityVeh).toBeCloseTo(5000, 3);
  });

  it('speed at capacity = u_f / 2', () => {
    expect(model.speedAtCapacity).toBeCloseTo(50, 3);
  });

  it('density at capacity = k_j / 2', () => {
    expect(model.densityAtCapacity).toBeCloseTo(100, 3);
  });

  it('flow at zero density is 0 (no vehicles)', () => {
    expect(model.flowAtDensity(0)).toBeCloseTo(0, 6);
  });

  it('flow at jam density is 0 (gridlock)', () => {
    expect(model.flowAtDensity(200)).toBeCloseTo(0, 4);
  });

  it('speed is linear: u(k_j/2) = u_f/2', () => {
    expect(model.speedAtDensity(100)).toBeCloseTo(50, 3);
  });

  it('flow is maximised at k = k_j/2', () => {
    const flowAtCapacity = model.flowAtDensity(model.densityAtCapacity);
    expect(flowAtCapacity).toBeCloseTo(model.capacityVeh, 2);
  });

  it('throws for non-positive free-flow speed', () => {
    expect(() => greenshieldsModel(0, 200)).toThrow();
  });

  it('throws for non-positive jam density', () => {
    expect(() => greenshieldsModel(100, 0)).toThrow();
  });
});

// ─── Frank-Wolfe UE assignment ────────────────────────────────────────────────

describe('frankWolfeAssignment — asymmetric 2-link network', () => {
  /**
   * Two parallel routes A→B with different characteristics.
   * link1: t₀=10min (fast, low-cap), link2: t₀=15min (slow, high-cap)
   * OD demand: 150 veh/h.
   * UE exists (all demand on link2 gives t1<t2, all on link1 gives t1>t2).
   */
  const nodes: NetworkNode[] = [{ id: 'A' }, { id: 'B' }];
  const seg1: RoadSegment = { id: 'seg1', freeFlowSpeedKph: 60, capacityVeh: 100, lengthKm: 10 };
  const seg2: RoadSegment = { id: 'seg2', freeFlowSpeedKph: 40, capacityVeh: 200, lengthKm: 10 };
  const links: NetworkLink[] = [
    { id: 'link1', fromId: 'A', toId: 'B', segment: seg1 },
    { id: 'link2', fromId: 'A', toId: 'B', segment: seg2 },
  ];
  const odPairs: ODPair[] = [{ originId: 'A', destinationId: 'B', demandVeh: 150 }];

  it('total assigned flow equals demand', () => {
    const r = frankWolfeAssignment(nodes, links, odPairs);
    const total = r.linkFlows['link1'] + r.linkFlows['link2'];
    expect(total).toBeCloseTo(150, 1);
  });

  it('both links carry positive flow (demand splits between routes)', () => {
    const r = frankWolfeAssignment(nodes, links, odPairs, 100);
    expect(r.linkFlows['link1']).toBeGreaterThan(0);
    expect(r.linkFlows['link2']).toBeGreaterThan(0);
  });

  it('totalVMT and totalVHT are positive', () => {
    const r = frankWolfeAssignment(nodes, links, odPairs);
    expect(r.totalVMT).toBeGreaterThan(0);
    expect(r.totalVHT).toBeGreaterThan(0);
  });
});

describe('frankWolfeAssignment — symmetric 2-link network (Wardrop verification)', () => {
  /**
   * Symmetric parallel network: both links identical except capacity.
   * link1: t₀=10min, C=200 veh/h; link2: t₀=10min, C=200 veh/h
   * Demand: 200 veh/h.
   * UE: x1=x2=100, t1=t2 exactly (converges in 1 iteration by symmetry).
   */
  const nodes: NetworkNode[] = [{ id: 'A' }, { id: 'B' }];
  const seg: (id: string) => RoadSegment = (id) => ({
    id, freeFlowSpeedKph: 60, capacityVeh: 200, lengthKm: 10,
  });
  const links: NetworkLink[] = [
    { id: 'link1', fromId: 'A', toId: 'B', segment: seg('seg1') },
    { id: 'link2', fromId: 'A', toId: 'B', segment: seg('seg2') },
  ];
  const odPairs: ODPair[] = [{ originId: 'A', destinationId: 'B', demandVeh: 200 }];

  it('converges (symmetric networks converge fast)', () => {
    const r = frankWolfeAssignment(nodes, links, odPairs, 100, 1e-4);
    expect(r.converged).toBe(true);
  });

  it('travel times are equal at UE (Wardrop condition)', () => {
    const r = frankWolfeAssignment(nodes, links, odPairs, 100, 1e-5);
    const t1 = bprTravelTime(seg('seg1'), r.linkFlows['link1']);
    const t2 = bprTravelTime(seg('seg2'), r.linkFlows['link2']);
    expect(Math.abs(t1 - t2)).toBeLessThan(0.5);
  });

  it('each link carries 100 veh/h (equal split by symmetry)', () => {
    const r = frankWolfeAssignment(nodes, links, odPairs, 100, 1e-5);
    expect(r.linkFlows['link1']).toBeCloseTo(100, 0);
    expect(r.linkFlows['link2']).toBeCloseTo(100, 0);
  });
});

describe('frankWolfeAssignment — serial network', () => {
  /**
   * Serial 3-node network: A → B → C (all demand must use both links).
   * demand = 100 veh/h
   */
  const nodes: NetworkNode[] = [{ id: 'A' }, { id: 'B' }, { id: 'C' }];
  const segAB: RoadSegment = { id: 'AB', freeFlowSpeedKph: 80, capacityVeh: 500, lengthKm: 5 };
  const segBC: RoadSegment = { id: 'BC', freeFlowSpeedKph: 60, capacityVeh: 400, lengthKm: 3 };
  const links: NetworkLink[] = [
    { id: 'AB', fromId: 'A', toId: 'B', segment: segAB },
    { id: 'BC', fromId: 'B', toId: 'C', segment: segBC },
  ];
  const odPairs: ODPair[] = [{ originId: 'A', destinationId: 'C', demandVeh: 100 }];

  it('all demand passes through both serial links', () => {
    const r = frankWolfeAssignment(nodes, links, odPairs, 100, 1e-4);
    expect(r.linkFlows['AB']).toBeCloseTo(100, 1);
    expect(r.linkFlows['BC']).toBeCloseTo(100, 1);
  });

  it('throws for empty link array', () => {
    expect(() => frankWolfeAssignment(nodes, [], odPairs)).toThrow();
  });

  it('throws for empty OD array', () => {
    expect(() => frankWolfeAssignment(nodes, links, [])).toThrow();
  });
});

// ─── Receipt ──────────────────────────────────────────────────────────────────

describe('buildTrafficFlowReceipt', () => {
  it('produces receipt with plugin=urban-planning and CAEL event', () => {
    const segs = analyzeSegments([{ segment: freeway, volume: 1200 }]);
    const receipt = buildTrafficFlowReceipt({ segments: segs, converged: true });
    expect(receipt.plugin).toBe('urban-planning');
    expect(receipt.cael.event).toBe('urban_planning.traffic_flow');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true when all segments are LOS A–E', () => {
    const segs = analyzeSegments([{ segment: freeway, volume: 1200 }]); // vc ≈ 0.55
    const receipt = buildTrafficFlowReceipt({ segments: segs, converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false when segment is LOS F', () => {
    const segs = analyzeSegments([{ segment: freeway, volume: 3000 }]); // vc > 1.0
    const receipt = buildTrafficFlowReceipt({ segments: segs, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
  });

  it('uses provided runId', () => {
    const segs   = analyzeSegments([{ segment: freeway, volume: 1000 }]);
    const receipt = buildTrafficFlowReceipt({ segments: segs, converged: true }, { runId: 'run-42' });
    expect(receipt.runId).toBe('run-42');
  });
});
