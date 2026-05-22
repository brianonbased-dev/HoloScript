/**
 * Emergency response solver tests — emergency-response plugin
 *
 * Reference values verified against:
 *  - FEMA START Triage Protocol (2010)
 *  - ARC 3068A Shelter Operations Manual (6 sq ft emergency / 20 sq ft extended)
 *  - NIMS ICS-300 Resource Management
 */

import { describe, it, expect } from 'vitest';
import {
  startTriage,
  resourceDispatch,
  incidentGrowthModel,
  shelterCapacity,
  evacuationRoutes,
  communicationCascade,
  afterActionReport,
  buildEmergencyReceipt,
} from '../emergencysolver';

// ─── START Triage ─────────────────────────────────────────────────────────────

describe('startTriage', () => {
  it('walking patient → MINOR (GREEN)', () => {
    const r = startTriage([{ id: 'p1', respirationsPerMin: 20, radialPulse: true, mentalStatus: 'obeys', canWalk: true }]);
    expect(r[0].category).toBe('MINOR');
    expect(r[0].tag).toBe('GREEN');
  });

  it('not breathing → EXPECTANT (BLACK)', () => {
    const r = startTriage([{ id: 'p2', respirationsPerMin: 0, radialPulse: false, mentalStatus: 'fails', canWalk: false }]);
    expect(r[0].category).toBe('EXPECTANT');
    expect(r[0].tag).toBe('BLACK');
  });

  it('respirations > 30 → IMMEDIATE (RED)', () => {
    const r = startTriage([{ id: 'p3', respirationsPerMin: 35, radialPulse: true, mentalStatus: 'obeys', canWalk: false }]);
    expect(r[0].category).toBe('IMMEDIATE');
    expect(r[0].tag).toBe('RED');
  });

  it('absent radial pulse → IMMEDIATE (RED)', () => {
    const r = startTriage([{ id: 'p4', respirationsPerMin: 20, radialPulse: false, mentalStatus: 'obeys', canWalk: false }]);
    expect(r[0].category).toBe('IMMEDIATE');
    expect(r[0].tag).toBe('RED');
  });

  it('fails mental status → IMMEDIATE (RED)', () => {
    const r = startTriage([{ id: 'p5', respirationsPerMin: 20, radialPulse: true, mentalStatus: 'fails', canWalk: false }]);
    expect(r[0].category).toBe('IMMEDIATE');
    expect(r[0].tag).toBe('RED');
  });

  it('stable non-walker → DELAYED (YELLOW)', () => {
    const r = startTriage([{ id: 'p6', respirationsPerMin: 18, radialPulse: true, mentalStatus: 'obeys', canWalk: false }]);
    expect(r[0].category).toBe('DELAYED');
    expect(r[0].tag).toBe('YELLOW');
  });

  it('classifies multiple patients correctly', () => {
    const patients = [
      { id: 'walker', respirationsPerMin: 16, radialPulse: true, mentalStatus: 'obeys' as const, canWalk: true },
      { id: 'dead',   respirationsPerMin: 0,  radialPulse: false, mentalStatus: 'fails' as const, canWalk: false },
      { id: 'stable', respirationsPerMin: 20, radialPulse: true,  mentalStatus: 'obeys' as const, canWalk: false },
    ];
    const r = startTriage(patients);
    expect(r.find(x => x.id === 'walker')?.category).toBe('MINOR');
    expect(r.find(x => x.id === 'dead')?.category).toBe('EXPECTANT');
    expect(r.find(x => x.id === 'stable')?.category).toBe('DELAYED');
  });
});

// ─── Resource Dispatch ────────────────────────────────────────────────────────

describe('resourceDispatch', () => {
  const units = [
    { id: 'AMB-1', type: 'ambulance' as const, available: true, locationX: 0, locationY: 0, capacity: 2 },
    { id: 'AMB-2', type: 'ambulance' as const, available: true, locationX: 10, locationY: 0, capacity: 2 },
    { id: 'FIRE-1', type: 'fire' as const,     available: true, locationX: 5,  locationY: 5, capacity: 4 },
  ];

  it('medical incident dispatches nearest ambulance', () => {
    const incidents = [{ id: 'I1', type: 'medical' as const, locationX: 1, locationY: 0, priority: 1, unitsRequired: 1 }];
    const r = resourceDispatch(units, incidents);
    expect(r.assignments[0].incidentId).toBe('I1');
    // AMB-1 at (0,0) is closer to (1,0) than AMB-2 at (10,0)
    expect(r.assignments[0].assignedUnitIds).toContain('AMB-1');
  });

  it('higher priority incidents dispatched first', () => {
    const incidents = [
      { id: 'I-low',  type: 'medical' as const, locationX: 0, locationY: 0, priority: 3 as const, unitsRequired: 1 },
      { id: 'I-high', type: 'medical' as const, locationX: 0, locationY: 0, priority: 1 as const, unitsRequired: 1 },
    ];
    const r = resourceDispatch(units, incidents);
    // High priority should be assigned
    expect(r.assignments.some(a => a.incidentId === 'I-high')).toBe(true);
  });

  it('utilizationRate in [0, 1]', () => {
    const incidents = [{ id: 'I1', type: 'medical' as const, locationX: 0, locationY: 0, priority: 1, unitsRequired: 1 }];
    const r = resourceDispatch(units, incidents);
    expect(r.utilizationRate).toBeGreaterThanOrEqual(0);
    expect(r.utilizationRate).toBeLessThanOrEqual(1);
  });

  it('unassigned incidents tracked when no compatible unit available', () => {
    const policeOnly = [{ id: 'POL-1', type: 'police' as const, available: true, locationX: 0, locationY: 0, capacity: 2 }];
    const incidents  = [{ id: 'I1', type: 'medical' as const, locationX: 0, locationY: 0, priority: 1, unitsRequired: 1 }];
    const r = resourceDispatch(policeOnly, incidents);
    expect(r.unassignedIncidents).toContain('I1');
  });

  it('fullyStaffed=true when all required units assigned', () => {
    const incidents = [{ id: 'I1', type: 'medical' as const, locationX: 0, locationY: 0, priority: 1, unitsRequired: 1 }];
    const r = resourceDispatch(units, incidents);
    expect(r.assignments[0].fullyStaffed).toBe(true);
  });

  it('throws for empty units', () => {
    expect(() => resourceDispatch([], [{ id: 'I1', type: 'medical', locationX: 0, locationY: 0, priority: 1, unitsRequired: 1 }])).toThrow();
  });
});

// ─── Incident Growth Model ────────────────────────────────────────────────────

describe('incidentGrowthModel', () => {
  /**
   * Logistic growth: A(t) = K / (1 + ((K-A0)/A0) × exp(-k×t))
   * With A0=10, K=100, k=0.1, at t=0 → A=10 exactly.
   */
  it('initial affected = A0 at t=0', () => {
    const r = incidentGrowthModel(10, 100, 0.1, 60, 1);
    expect(r.affected[0]).toBeCloseTo(10, 1);
  });

  it('affected is monotonically non-decreasing', () => {
    const r = incidentGrowthModel(10, 100, 0.2, 30, 1);
    for (let i = 1; i < r.affected.length; i++) {
      expect(r.affected[i]).toBeGreaterThanOrEqual(r.affected[i - 1] - 0.001);
    }
  });

  it('peakAffected = carryingCapacity', () => {
    const r = incidentGrowthModel(10, 200, 0.1, 120);
    expect(r.peakAffected).toBe(200);
  });

  it('halfContainmentMin > 0 when A0 < K/2', () => {
    const r = incidentGrowthModel(10, 100, 0.1, 120);
    // A0=10 < 50 = K/2 → half-containment time is real
    expect(r.halfContainmentMin).toBeGreaterThan(0);
  });

  it('growthRate matches input', () => {
    const r = incidentGrowthModel(5, 50, 0.15, 30);
    expect(r.growthRate).toBeCloseTo(0.15, 5);
  });

  it('throws for non-positive initialAffected', () => {
    expect(() => incidentGrowthModel(0, 100, 0.1, 60)).toThrow();
  });

  it('throws when carryingCapacity ≤ initialAffected', () => {
    expect(() => incidentGrowthModel(100, 50, 0.1, 60)).toThrow();
  });
});

// ─── Shelter Capacity ─────────────────────────────────────────────────────────

describe('shelterCapacity', () => {
  /**
   * ARC 3068A: emergency = floor(sqft / 6), extended = floor(sqft / 20)
   * 1200 sq ft: emergency=200, extended=60
   */
  it('emergency capacity = floor(sqft / 6)', () => {
    const r = shelterCapacity(1200, 0);
    expect(r.emergencyCapacity).toBe(200);
  });

  it('extended capacity = floor(sqft / 20)', () => {
    const r = shelterCapacity(1200, 0);
    expect(r.extendedCapacity).toBe(60);
  });

  it('overflow=false when occupancy ≤ emergency capacity', () => {
    const r = shelterCapacity(1200, 150);
    expect(r.overflow).toBe(false);
  });

  it('overflow=true when occupancy > emergency capacity', () => {
    const r = shelterCapacity(1200, 250);
    expect(r.overflow).toBe(true);
  });

  it('occupancyRate = current / emergency', () => {
    const r = shelterCapacity(1200, 100);
    expect(r.occupancyRate).toBeCloseTo(100 / 200, 4);
  });

  it('throws for non-positive floorArea', () => {
    expect(() => shelterCapacity(0, 0)).toThrow();
  });
});

// ─── Evacuation Routes ────────────────────────────────────────────────────────

describe('evacuationRoutes', () => {
  const nodes = [
    { id: 'A', isExit: false, x: 0, y: 0 },
    { id: 'B', isExit: false, x: 5, y: 0 },
    { id: 'EXIT', isExit: true, x: 10, y: 0 },
  ];
  const edges = [
    { fromId: 'A', toId: 'B',    travelTimeMin: 5, capacityPph: 500 },
    { fromId: 'B', toId: 'EXIT', travelTimeMin: 3, capacityPph: 300 },
  ];
  const population = new Map([['A', 100], ['B', 50]]);

  it('routes computed for non-exit nodes', () => {
    const r = evacuationRoutes(nodes, edges, population);
    const fromA = r.routes.find(x => x.fromId === 'A');
    expect(fromA).toBeDefined();
    expect(fromA!.path).toContain('EXIT');
  });

  it('travel time is positive', () => {
    const r = evacuationRoutes(nodes, edges, population);
    for (const route of r.routes) {
      expect(route.travelTimeMin).toBeGreaterThan(0);
    }
  });

  it('bottleneck capacity is minimum along path', () => {
    const r = evacuationRoutes(nodes, edges, population);
    const fromA = r.routes.find(x => x.fromId === 'A');
    // Path A→B→EXIT: bottleneck = min(500, 300) = 300
    expect(fromA!.bottleneckCapacityPph).toBe(300);
  });

  it('totalEvacuationTimeMin ≥ max route travel time', () => {
    const r = evacuationRoutes(nodes, edges, population);
    const maxTravel = Math.max(...r.routes.map(x => x.travelTimeMin));
    expect(r.totalEvacuationTimeMin).toBeGreaterThanOrEqual(maxTravel);
  });

  it('throws for no exit nodes', () => {
    const noExits = nodes.map(n => ({ ...n, isExit: false }));
    expect(() => evacuationRoutes(noExits, edges, population)).toThrow();
  });
});

// ─── Communication Cascade ────────────────────────────────────────────────────

describe('communicationCascade', () => {
  const notifNodes = [
    { id: 'HQ',    contacts: ['A', 'B'], relayDelayMin: 0 },
    { id: 'A',     contacts: ['C'],      relayDelayMin: 5 },
    { id: 'B',     contacts: ['D'],      relayDelayMin: 3 },
    { id: 'C',     contacts: [],         relayDelayMin: 2 },
    { id: 'D',     contacts: [],         relayDelayMin: 1 },
  ];

  it('origin node notified at t=0', () => {
    const r = communicationCascade(notifNodes, 'HQ');
    expect(r.notificationTimes.get('HQ')).toBe(0);
  });

  it('coverage increases over time', () => {
    const r = communicationCascade(notifNodes, 'HQ');
    expect(r.coverageAtTime(0)).toBeLessThanOrEqual(r.coverageAtTime(10));
  });

  it('all nodes eventually notified (100% coverage)', () => {
    const r = communicationCascade(notifNodes, 'HQ');
    expect(r.coverageAtTime(100)).toBeCloseTo(1.0, 4);
  });

  it('halfCoverageMin < ninetyCoverageMin', () => {
    const r = communicationCascade(notifNodes, 'HQ');
    expect(r.halfCoverageMin).toBeLessThanOrEqual(r.ninetyCoverageMin);
  });

  it('direct contacts notified earlier than indirect', () => {
    const r = communicationCascade(notifNodes, 'HQ');
    // A and B are direct; C and D are indirect
    const tA = r.notificationTimes.get('A') ?? Infinity;
    const tC = r.notificationTimes.get('C') ?? Infinity;
    expect(tA).toBeLessThan(tC);
  });
});

// ─── After-Action Report ──────────────────────────────────────────────────────

describe('afterActionReport', () => {
  it('perfect response → grade A', () => {
    const r = afterActionReport(4, 5, 0.95, 1.0);
    expect(r.grade).toBe('A');
  });

  it('slow response, low coverage → grade D or F', () => {
    const r = afterActionReport(20, 5, 0.3, 0.4);
    expect(['D', 'F']).toContain(r.grade);
  });

  it('overallScore in [0, 100]', () => {
    const r = afterActionReport(8, 5, 0.80, 0.85);
    expect(r.overallScore).toBeGreaterThanOrEqual(0);
    expect(r.overallScore).toBeLessThanOrEqual(100);
  });

  it('poor response generates recommendations', () => {
    const r = afterActionReport(20, 5, 0.4, 0.5);
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  it('component scores are in [0, 100]', () => {
    const r = afterActionReport(6, 5, 0.75, 0.80);
    expect(r.responseTimeScore).toBeGreaterThanOrEqual(0);
    expect(r.responseTimeScore).toBeLessThanOrEqual(100);
    expect(r.utilizationScore).toBeGreaterThanOrEqual(0);
    expect(r.utilizationScore).toBeLessThanOrEqual(100);
    expect(r.coverageScore).toBeGreaterThanOrEqual(0);
    expect(r.coverageScore).toBeLessThanOrEqual(100);
  });
});

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('buildEmergencyReceipt', () => {
  it('plugin=emergency-response and CAEL event correct', () => {
    const triage = startTriage([
      { id: 'p1', respirationsPerMin: 20, radialPulse: true, mentalStatus: 'obeys', canWalk: true },
    ]);
    const receipt = buildEmergencyReceipt({ triage, converged: true });
    expect(receipt.plugin).toBe('emergency-response');
    expect(receipt.cael.event).toBe('emergency_response.incident_analysis');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for converged result', () => {
    const receipt = buildEmergencyReceipt({ converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false when AAR score < 70', () => {
    // Poor response time + low coverage → overall score < 70
    const afterAction = afterActionReport(20, 5, 0.3, 0.4);
    expect(afterAction.overallScore).toBeLessThan(70);
    const receipt = buildEmergencyReceipt({ afterAction, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
  });

  it('uses provided runId', () => {
    const receipt = buildEmergencyReceipt({ converged: true }, { runId: 'emr-run-7' });
    expect(receipt.runId).toBe('emr-run-7');
  });
});
