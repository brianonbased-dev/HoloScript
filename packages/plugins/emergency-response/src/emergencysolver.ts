/**
 * Emergency response solvers — emergency-response plugin
 *
 * Implements:
 *  - START triage classification (FEMA protocol)
 *  - Resource dispatch optimizer (greedy nearest-unit)
 *  - Incident growth model (logistic saturation curve)
 *  - Shelter capacity calculator (ARC standards)
 *  - Evacuation route Dijkstra (capacity-constrained road network)
 *  - Communication cascade BFS (notification tree coverage)
 *  - After-action report scorer
 *
 * References:
 *  - FEMA START Triage Protocol (2010)
 *  - NIMS ICS-300 Resource Management
 *  - ARC 3068A Shelter Operations Manual
 *  - NFPA 921 Fire Investigation Guide
 */

import { buildDomainSimulationReceipt, type DomainSimulationReceipt } from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TriageCategory = 'IMMEDIATE' | 'DELAYED' | 'MINOR' | 'EXPECTANT';

export interface TriagePatient {
  id: string;
  /** Respirations per minute (0 = not breathing) */
  respirationsPerMin: number;
  /** Radial pulse present */
  radialPulse: boolean;
  /** Mental status: 'obeys' | 'fails' (obeys simple commands) */
  mentalStatus: 'obeys' | 'fails';
  /** Can walk to designated area */
  canWalk: boolean;
}

export interface TriageResult {
  id: string;
  category: TriageCategory;
  /** Color tag: RED/YELLOW/GREEN/BLACK */
  tag: 'RED' | 'YELLOW' | 'GREEN' | 'BLACK';
  rationale: string;
}

export interface EmergencyUnit {
  id: string;
  type: 'ambulance' | 'fire' | 'police' | 'rescue' | 'hazmat';
  available: boolean;
  locationX: number;
  locationY: number;
  /** Capacity (patients, incidents, etc.) */
  capacity: number;
}

export interface IncidentCall {
  id: string;
  type: 'medical' | 'fire' | 'rescue' | 'hazmat' | 'police';
  locationX: number;
  locationY: number;
  /** Priority 1 (critical) to 3 (routine) */
  priority: 1 | 2 | 3;
  /** Units required */
  unitsRequired: number;
}

export interface DispatchResult {
  assignments: Array<{
    incidentId: string;
    assignedUnitIds: string[];
    /** Euclidean distance from nearest unit */
    distanceUnits: number;
    /** Estimated response time minutes (assuming speed=1 unit/min) */
    estimatedResponseMin: number;
    fullyStaffed: boolean;
  }>;
  unassignedIncidents: string[];
  utilizationRate: number;
}

export interface IncidentGrowthResult {
  /** Time steps (minutes) */
  timeMinutes: number[];
  /** Affected population/area at each time step */
  affected: number[];
  /** Time to 50% containment (minutes) */
  halfContainmentMin: number;
  /** Predicted peak affected */
  peakAffected: number;
  /** Growth rate constant k */
  growthRate: number;
}

export interface ShelterCapacityResult {
  /** Available floor area sq ft */
  floorAreaSqFt: number;
  /** Emergency capacity (6 sq ft/person) */
  emergencyCapacity: number;
  /** Extended-stay capacity (20 sq ft/person) */
  extendedCapacity: number;
  /** Current occupancy */
  currentOccupancy: number;
  /** Overflow: current > emergency capacity */
  overflow: boolean;
  /** Occupancy rate vs emergency capacity */
  occupancyRate: number;
}

export interface EvacuationNode {
  id: string;
  isExit: boolean;
  x: number;
  y: number;
}

export interface EvacuationEdge {
  fromId: string;
  toId: string;
  /** Travel time minutes */
  travelTimeMin: number;
  /** Max persons per hour */
  capacityPph: number;
}

export interface EvacuationResult {
  /** Shortest path to nearest exit from each zone */
  routes: Array<{
    fromId: string;
    path: string[];
    travelTimeMin: number;
    bottleneckCapacityPph: number;
  }>;
  /** Total estimated evacuation time for full population */
  totalEvacuationTimeMin: number;
}

export interface NotificationNode {
  id: string;
  /** IDs this node notifies */
  contacts: string[];
  /** Minutes to relay notification after receiving it */
  relayDelayMin: number;
}

export interface CascadeResult {
  /** Time at which each node is notified (minutes from T=0) */
  notificationTimes: Map<string, number>;
  /** Coverage % of total nodes notified by time T */
  coverageAtTime: (t: number) => number;
  /** Time to reach 50% coverage */
  halfCoverageMin: number;
  /** Time to reach 90% coverage */
  ninetyCoverageMin: number;
}

export interface AfterActionResult {
  /** Response time score (0-100) */
  responseTimeScore: number;
  /** Resource utilization score (0-100) */
  utilizationScore: number;
  /** Coverage score (0-100) */
  coverageScore: number;
  /** Overall score (weighted average) */
  overallScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  recommendations: string[];
}

export interface EmergencyReceiptOptions {
  runId?: string;
}

// ─── START Triage ─────────────────────────────────────────────────────────────

/**
 * Simple Triage and Rapid Treatment (START) protocol.
 * Walking wounded → MINOR (GREEN).
 * Not walking: check respirations → if absent, reposition → if still absent → EXPECTANT (BLACK).
 * Breathing > 30/min → IMMEDIATE (RED).
 * Check perfusion (radial pulse) → absent → IMMEDIATE (RED).
 * Check mental status → fails commands → IMMEDIATE (RED).
 * Otherwise → DELAYED (YELLOW).
 */
export function startTriage(patients: TriagePatient[]): TriageResult[] {
  return patients.map(p => {
    // Step 1: Walking wounded
    if (p.canWalk) {
      return { id: p.id, category: 'MINOR', tag: 'GREEN', rationale: 'Ambulatory — walking wounded' };
    }

    // Step 2: Respirations
    if (p.respirationsPerMin === 0) {
      return { id: p.id, category: 'EXPECTANT', tag: 'BLACK', rationale: 'No respirations after repositioning — expectant' };
    }
    if (p.respirationsPerMin > 30) {
      return { id: p.id, category: 'IMMEDIATE', tag: 'RED', rationale: `Respirations ${p.respirationsPerMin}/min > 30 — immediate` };
    }

    // Step 3: Perfusion
    if (!p.radialPulse) {
      return { id: p.id, category: 'IMMEDIATE', tag: 'RED', rationale: 'Absent radial pulse — immediate (hemorrhagic shock)' };
    }

    // Step 4: Mental status
    if (p.mentalStatus === 'fails') {
      return { id: p.id, category: 'IMMEDIATE', tag: 'RED', rationale: 'Fails to obey commands — immediate (neurological)' };
    }

    return { id: p.id, category: 'DELAYED', tag: 'YELLOW', rationale: 'Stable — delayed treatment acceptable' };
  });
}

// ─── Resource dispatch ────────────────────────────────────────────────────────

function euclidean(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

/**
 * Greedy nearest-available-unit dispatch.
 * Sorts incidents by priority, then assigns closest compatible available units.
 */
export function resourceDispatch(
  units: EmergencyUnit[],
  incidents: IncidentCall[],
): DispatchResult {
  if (units.length === 0) throw new Error('No units available');
  if (incidents.length === 0) throw new Error('No incidents to dispatch');

  const unitTypeMap: Record<IncidentCall['type'], EmergencyUnit['type'][]> = {
    medical: ['ambulance'],
    fire:    ['fire', 'ambulance'],
    rescue:  ['rescue', 'fire'],
    hazmat:  ['hazmat', 'fire'],
    police:  ['police'],
  };

  const available = units.map(u => ({ ...u })); // mutable copy
  const sorted = [...incidents].sort((a, b) => a.priority - b.priority);

  const assignments: DispatchResult['assignments'] = [];
  const unassigned: string[] = [];

  for (const incident of sorted) {
    const compatible = available.filter(u => u.available && unitTypeMap[incident.type].includes(u.type));
    compatible.sort((a, b) =>
      euclidean(a.locationX, a.locationY, incident.locationX, incident.locationY) -
      euclidean(b.locationX, b.locationY, incident.locationX, incident.locationY),
    );

    const assigned: string[] = [];
    let needed = incident.unitsRequired;
    for (const unit of compatible) {
      if (needed <= 0) break;
      assigned.push(unit.id);
      unit.available = false;
      needed--;
    }

    if (assigned.length === 0) {
      unassigned.push(incident.id);
      continue;
    }

    const firstUnit = available.find(u => u.id === assigned[0])!;
    const dist = euclidean(firstUnit.locationX, firstUnit.locationY, incident.locationX, incident.locationY);

    assignments.push({
      incidentId: incident.id,
      assignedUnitIds: assigned,
      distanceUnits: dist,
      estimatedResponseMin: dist, // unit/min speed assumption
      fullyStaffed: assigned.length >= incident.unitsRequired,
    });
  }

  const dispatchedCount = assignments.reduce((acc, a) => acc + a.assignedUnitIds.length, 0);
  const utilizationRate = units.filter(u => !u.available).length / units.length;

  return { assignments, unassignedIncidents: unassigned, utilizationRate };
}

// ─── Incident growth model ────────────────────────────────────────────────────

/**
 * Logistic growth model for incident spread (fire, flood, crowd).
 * dA/dt = k × A × (1 − A/K)
 * Solution: A(t) = K / (1 + ((K - A0)/A0) × exp(-k×t))
 * K: carrying capacity (maximum affected)
 * A0: initial affected
 * k: growth rate
 */
export function incidentGrowthModel(
  initialAffected: number,
  carryingCapacity: number,
  growthRate: number,
  durationMinutes: number,
  dtMinutes = 1,
): IncidentGrowthResult {
  if (initialAffected <= 0) throw new Error('initialAffected must be positive');
  if (carryingCapacity <= initialAffected) throw new Error('carryingCapacity must exceed initialAffected');
  if (growthRate <= 0) throw new Error('growthRate must be positive');

  const A0 = initialAffected, K = carryingCapacity, k = growthRate;
  const N = Math.ceil(durationMinutes / dtMinutes);

  const timeMinutes: number[] = [];
  const affected: number[] = [];

  for (let i = 0; i <= N; i++) {
    const t = i * dtMinutes;
    const A = K / (1 + ((K - A0) / A0) * Math.exp(-k * t));
    timeMinutes.push(t);
    affected.push(A);
  }

  // Half-containment: time when A = K/2
  const halfContainmentMin = A0 < K / 2
    ? Math.log((K - A0) / A0) / k
    : 0;

  return {
    timeMinutes, affected,
    halfContainmentMin: Math.max(0, halfContainmentMin),
    peakAffected: K,
    growthRate: k,
  };
}

// ─── Shelter capacity ─────────────────────────────────────────────────────────

/** ARC 3068A shelter capacity standards */
export function shelterCapacity(
  floorAreaSqFt: number,
  currentOccupancy: number,
): ShelterCapacityResult {
  if (floorAreaSqFt <= 0) throw new Error('floorAreaSqFt must be positive');
  if (currentOccupancy < 0) throw new Error('currentOccupancy must be non-negative');

  const emergencyCapacity = Math.floor(floorAreaSqFt / 6);
  const extendedCapacity  = Math.floor(floorAreaSqFt / 20);
  const overflow = currentOccupancy > emergencyCapacity;
  const occupancyRate = currentOccupancy / emergencyCapacity;

  return { floorAreaSqFt, emergencyCapacity, extendedCapacity, currentOccupancy, overflow, occupancyRate };
}

// ─── Evacuation route (Dijkstra) ──────────────────────────────────────────────

export function evacuationRoutes(
  nodes: EvacuationNode[],
  edges: EvacuationEdge[],
  populationPerNode: Map<string, number>,
): EvacuationResult {
  if (nodes.length === 0) throw new Error('No nodes');
  if (!nodes.some(n => n.isExit)) throw new Error('No exit nodes defined');

  const exits = new Set(nodes.filter(n => n.isExit).map(n => n.id));
  const adj = new Map<string, Array<{ to: string; time: number; cap: number }>>();
  for (const node of nodes) adj.set(node.id, []);
  for (const edge of edges) {
    adj.get(edge.fromId)?.push({ to: edge.toId, time: edge.travelTimeMin, cap: edge.capacityPph });
    adj.get(edge.toId)?.push({ to: edge.fromId, time: edge.travelTimeMin, cap: edge.capacityPph });
  }

  const routes: EvacuationResult['routes'] = [];

  for (const node of nodes) {
    if (node.isExit) continue;
    // Dijkstra from this node to nearest exit
    const dist = new Map<string, number>(nodes.map(n => [n.id, Infinity]));
    const prev = new Map<string, string | null>();
    const caps = new Map<string, number>();
    dist.set(node.id, 0);
    caps.set(node.id, Infinity);
    const pq: Array<{ id: string; d: number }> = [{ id: node.id, d: 0 }];

    while (pq.length > 0) {
      pq.sort((a, b) => a.d - b.d);
      const { id: cur, d } = pq.shift()!;
      if (d > (dist.get(cur) ?? Infinity)) continue;
      for (const { to, time, cap } of (adj.get(cur) ?? [])) {
        const nd = d + time;
        if (nd < (dist.get(to) ?? Infinity)) {
          dist.set(to, nd);
          prev.set(to, cur);
          caps.set(to, Math.min(caps.get(cur) ?? Infinity, cap));
          pq.push({ id: to, d: nd });
        }
      }
    }

    // Find nearest exit
    let nearestExit = '', minDist = Infinity;
    for (const exitId of exits) {
      if ((dist.get(exitId) ?? Infinity) < minDist) {
        minDist = dist.get(exitId) ?? Infinity;
        nearestExit = exitId;
      }
    }

    if (nearestExit === '') continue;

    // Trace path
    const path: string[] = [];
    let cur: string | null | undefined = nearestExit;
    while (cur != null) {
      path.unshift(cur);
      cur = prev.get(cur);
    }

    routes.push({
      fromId: node.id,
      path,
      travelTimeMin: minDist,
      bottleneckCapacityPph: caps.get(nearestExit) ?? 0,
    });
  }

  // Total evacuation time: for each zone, time = travelTime + population / bottleneckCapacity × 60
  let totalEvacuationTimeMin = 0;
  for (const route of routes) {
    const pop = populationPerNode.get(route.fromId) ?? 0;
    const queueTimeMin = route.bottleneckCapacityPph > 0 ? (pop / route.bottleneckCapacityPph) * 60 : 0;
    totalEvacuationTimeMin = Math.max(totalEvacuationTimeMin, route.travelTimeMin + queueTimeMin);
  }

  return { routes, totalEvacuationTimeMin };
}

// ─── Communication cascade (BFS) ─────────────────────────────────────────────

export function communicationCascade(
  nodes: NotificationNode[],
  originId: string,
): CascadeResult {
  if (nodes.length === 0) throw new Error('No notification nodes');
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  if (!nodeMap.has(originId)) throw new Error(`Origin ${originId} not found`);

  const notificationTimes = new Map<string, number>();
  notificationTimes.set(originId, 0);
  const queue: Array<{ id: string; time: number }> = [{ id: originId, time: 0 }];

  while (queue.length > 0) {
    queue.sort((a, b) => a.time - b.time);
    const { id, time } = queue.shift()!;
    const node = nodeMap.get(id);
    if (!node) continue;
    for (const contactId of node.contacts) {
      const arrivalTime = time + node.relayDelayMin;
      if (!notificationTimes.has(contactId) || notificationTimes.get(contactId)! > arrivalTime) {
        notificationTimes.set(contactId, arrivalTime);
        queue.push({ id: contactId, time: arrivalTime });
      }
    }
  }

  const total = nodes.length;
  const coverageAtTime = (t: number) => {
    let count = 0;
    for (const [, time] of notificationTimes) if (time <= t) count++;
    return count / total;
  };

  // Half and 90% coverage times
  let halfCoverageMin = Infinity, ninetyCoverageMin = Infinity;
  const sortedTimes = [...notificationTimes.values()].sort((a, b) => a - b);
  for (const t of sortedTimes) {
    const cov = coverageAtTime(t);
    if (halfCoverageMin === Infinity && cov >= 0.5) halfCoverageMin = t;
    if (ninetyCoverageMin === Infinity && cov >= 0.9) ninetyCoverageMin = t;
  }

  return { notificationTimes, coverageAtTime, halfCoverageMin, ninetyCoverageMin };
}

// ─── After-action report scorer ───────────────────────────────────────────────

export function afterActionReport(
  actualResponseTimeMin: number,
  targetResponseTimeMin: number,
  resourceUtilizationRate: number,
  populationCoverageFraction: number,
): AfterActionResult {
  // Response time score: 100 if at or under target, 0 if 3× over target
  const rtRatio = actualResponseTimeMin / targetResponseTimeMin;
  const responseTimeScore = Math.max(0, Math.min(100, 100 * (1 - (rtRatio - 1) / 2)));

  // Utilization score: optimal around 70-85%
  const utilizationScore = resourceUtilizationRate < 0.5
    ? resourceUtilizationRate * 200            // under-utilized
    : resourceUtilizationRate > 0.95
    ? Math.max(0, (1 - resourceUtilizationRate) * 1000)  // over-stretched
    : 100 - Math.abs(resourceUtilizationRate - 0.80) * 100;

  // Coverage score
  const coverageScore = populationCoverageFraction * 100;

  // Weighted overall (40% response, 30% util, 30% coverage)
  const overallScore = 0.40 * responseTimeScore + 0.30 * utilizationScore + 0.30 * coverageScore;

  const grade: AfterActionResult['grade'] =
    overallScore >= 90 ? 'A' :
    overallScore >= 80 ? 'B' :
    overallScore >= 70 ? 'C' :
    overallScore >= 60 ? 'D' : 'F';

  const recommendations: string[] = [];
  if (rtRatio > 1.2) recommendations.push(`Response time ${actualResponseTimeMin.toFixed(1)}min exceeds target ${targetResponseTimeMin}min — pre-position units closer to high-risk zones`);
  if (resourceUtilizationRate > 0.90) recommendations.push('Resource utilization > 90% — insufficient reserve capacity; add mutual-aid agreements');
  if (resourceUtilizationRate < 0.50) recommendations.push('Resource utilization < 50% — consider consolidating deployment to reduce idle cost');
  if (populationCoverageFraction < 0.80) recommendations.push(`Only ${(populationCoverageFraction * 100).toFixed(0)}% population covered — expand response zones or add units`);

  return { responseTimeScore, utilizationScore: Math.max(0, Math.min(100, utilizationScore)), coverageScore, overallScore, grade, recommendations };
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export interface EmergencyAnalysisResult {
  triage?: TriageResult[];
  dispatch?: DispatchResult;
  incidentGrowth?: IncidentGrowthResult;
  shelter?: ShelterCapacityResult;
  evacuation?: EvacuationResult;
  cascade?: CascadeResult;
  afterAction?: AfterActionResult;
  converged: true;
}

export function buildEmergencyReceipt(
  result: EmergencyAnalysisResult,
  options?: EmergencyReceiptOptions,
): DomainSimulationReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (result.shelter?.overflow) {
    violations.push({ criterion: 'shelter_overflow', message: `Shelter at ${(result.shelter.occupancyRate * 100).toFixed(0)}% capacity — exceeds emergency limit` });
  }
  if (result.dispatch && result.dispatch.unassignedIncidents.length > 0) {
    violations.push({ criterion: 'unassigned', message: `${result.dispatch.unassignedIncidents.length} incident(s) have no available units` });
  }
  if (result.afterAction && result.afterAction.overallScore < 70) {
    violations.push({ criterion: 'after_action', message: `Overall AAR score ${result.afterAction.overallScore.toFixed(0)}/100 is below acceptable threshold (70)` });
  }

  return buildDomainSimulationReceipt({
    plugin: 'emergency-response',
    pluginVersion: '1.0.0',
    runId: options?.runId ?? `emerg-${Date.now().toString(36)}`,
    solverConfig: { solverType: 'incident-management', scale: 'jurisdiction' },
    resultSummary: {
      immediatePatients: result.triage?.filter(t => t.category === 'IMMEDIATE').length,
      dispatchedUnits: result.dispatch?.assignments.reduce((a, d) => a + d.assignedUnitIds.length, 0),
      shelterOccupancyRate: result.shelter?.occupancyRate,
      aarScore: result.afterAction?.overallScore,
    },
    cael: { version: 'cael.v1', event: 'emergency_response.incident_analysis', solverType: 'emergency-response.start-triage' },
    acceptance: { accepted: violations.length === 0, violations },
  });
}
