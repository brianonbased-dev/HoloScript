/**
 * Traffic flow solver — urban-planning-plugin
 *
 * Implements deterministic traffic analysis without external dependencies:
 *   - Bureau of Public Roads (BPR) volume-delay function
 *   - Highway Capacity Manual (HCM 6th ed.) Level of Service (LOS) grading A–F
 *   - Frank-Wolfe user-equilibrium assignment for small networks (Wardrop)
 *   - Greenshields macroscopic flow model (speed-density-flow relationship)
 *   - CAEL-backed receipt
 *
 * References:
 *   BPR (1964) "Traffic Assignment Manual." U.S. Bureau of Public Roads.
 *   HCM 6th Ed. (2016) Table 3-3 — freeway LOS thresholds.
 *   Frank & Wolfe (1956) "An Algorithm for Quadratic Programming." Naval Res. Log.
 *   Greenshields (1935) "A Study of Traffic Capacity." HRB Proceedings 14:448-477.
 */

import {
  DOMAIN_SIMULATION_RECEIPT_SCHEMA,
  buildDomainSimulationReceipt,
} from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LevelOfService = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface RoadSegment {
  id:           string;
  /** Free-flow speed (km/h) */
  freeFlowSpeedKph: number;
  /** Practical capacity (veh/h) */
  capacityVeh:  number;
  /** Length (km) */
  lengthKm:     number;
  /** BPR alpha parameter (default 0.15) */
  bprAlpha?:    number;
  /** BPR beta parameter (default 4) */
  bprBeta?:     number;
}

export interface SegmentResult {
  segmentId:        string;
  volume:           number;   // veh/h
  travelTimeMin:    number;   // congested travel time
  freeFlowTimeMin:  number;
  vcRatio:          number;   // volume/capacity
  los:              LevelOfService;
  avgSpeedKph:      number;
}

/** Origin-Destination demand matrix entry */
export interface ODPair {
  originId:      string;
  destinationId: string;
  demandVeh:     number; // veh/h
}

/** Network node */
export interface NetworkNode {
  id: string;
}

/** Network link (directional) */
export interface NetworkLink {
  id:      string;
  fromId:  string;
  toId:    string;
  segment: RoadSegment;
}

export interface NetworkAssignmentResult {
  linkFlows:      Record<string, number>; // linkId → flow (veh/h)
  segmentResults: SegmentResult[];
  totalVMT:       number; // vehicle-miles traveled
  totalVHT:       number; // vehicle-hours traveled
  converged:      boolean;
  iterations:     number;
}

export interface GreenshieldsResult {
  /** Maximum flow (capacity) veh/h = u_f × k_j / 4 */
  capacityVeh:    number;
  /** Speed at capacity km/h = u_f / 2 */
  speedAtCapacity: number;
  /** Density at capacity veh/km = k_j / 2 */
  densityAtCapacity: number;
  /** Flow at given density */
  flowAtDensity:  (densityVehKm: number) => number;
  /** Speed at given density */
  speedAtDensity: (densityVehKm: number) => number;
}

export interface TrafficAnalysisResult {
  segments:    SegmentResult[];
  networkAssignment?: NetworkAssignmentResult;
  greenshields?: GreenshieldsResult;
  converged:   boolean;
}

export interface TrafficFlowReceipt {
  plugin:        string;
  runId:         string;
  payloadHash:   string;
  hashAlgorithm: string;
  cael:          { event: string; solverType: string; version: string };
  acceptance:    { accepted: boolean; violations: Array<{ criterion: string; message: string }> };
  resultSummary: {
    segmentCount:  number;
    avgVCRatio:    number;
    worstLOS:      LevelOfService;
    totalVMT?:     number;
    totalVHT?:     number;
  };
}

// ─── BPR volume-delay function ────────────────────────────────────────────────

/**
 * Bureau of Public Roads (BPR) volume-delay function.
 * Returns the congested travel time (minutes) given a volume.
 *
 * t(v) = t₀ × [1 + α × (v/C)^β]
 *
 * Default parameters: α = 0.15, β = 4 (calibrated to U.S. freeway data)
 */
export function bprTravelTime(
  segment: RoadSegment,
  volumeVeh: number,
): number {
  const t0    = (segment.lengthKm / segment.freeFlowSpeedKph) * 60; // min
  const alpha = segment.bprAlpha ?? 0.15;
  const beta  = segment.bprBeta  ?? 4;
  const vc    = volumeVeh / segment.capacityVeh;
  return t0 * (1 + alpha * Math.pow(vc, beta));
}

// ─── Level of Service (HCM 6th ed.) ─────────────────────────────────────────

/**
 * Classify a road segment's Level of Service using HCM 6th edition thresholds.
 *
 * LOS is determined by the density (veh/km/lane) derived from flow and speed.
 * For simplicity this uses the V/C ratio as proxy (freeway basic segment criteria).
 *
 * HCM Table 3-2 (freeway basic segments):
 *   LOS A: vc ≤ 0.35
 *   LOS B: vc ≤ 0.54
 *   LOS C: vc ≤ 0.77
 *   LOS D: vc ≤ 0.91
 *   LOS E: vc ≤ 1.00
 *   LOS F: vc > 1.00
 */
export function levelOfService(vcRatio: number): LevelOfService {
  if (vcRatio <= 0.35) return 'A';
  if (vcRatio <= 0.54) return 'B';
  if (vcRatio <= 0.77) return 'C';
  if (vcRatio <= 0.91) return 'D';
  if (vcRatio <= 1.00) return 'E';
  return 'F';
}

// ─── Single-segment analysis ──────────────────────────────────────────────────

/** Analyse an individual road segment under a given volume. */
export function analyzeSegment(segment: RoadSegment, volumeVeh: number): SegmentResult {
  if (volumeVeh < 0)          throw new Error('[traffic] volume must be ≥ 0');
  if (segment.capacityVeh <= 0) throw new Error('[traffic] capacity must be > 0');
  if (segment.freeFlowSpeedKph <= 0) throw new Error('[traffic] freeFlowSpeedKph must be > 0');

  const freeFlowTimeMin = (segment.lengthKm / segment.freeFlowSpeedKph) * 60;
  const travelTimeMin   = bprTravelTime(segment, volumeVeh);
  const vcRatio         = volumeVeh / segment.capacityVeh;
  const avgSpeedKph     = (segment.lengthKm / travelTimeMin) * 60;

  return {
    segmentId:       segment.id,
    volume:          volumeVeh,
    travelTimeMin,
    freeFlowTimeMin,
    vcRatio,
    los:             levelOfService(vcRatio),
    avgSpeedKph,
  };
}

/** Analyse multiple segments simultaneously. */
export function analyzeSegments(
  segments: Array<{ segment: RoadSegment; volume: number }>,
): SegmentResult[] {
  return segments.map(({ segment, volume }) => analyzeSegment(segment, volume));
}

// ─── Greenshields model ───────────────────────────────────────────────────────

/**
 * Greenshields (1935) linear speed-density model.
 * Assumes a linear relationship: u(k) = u_f × (1 − k/k_j)
 *
 * Parameters:
 *   freeFlowSpeedKph  (u_f): speed when density → 0
 *   jamDensityVehKm   (k_j): density when speed → 0 (gridlock)
 */
export function greenshieldsModel(
  freeFlowSpeedKph: number,
  jamDensityVehKm:  number,
): GreenshieldsResult {
  if (freeFlowSpeedKph <= 0) throw new Error('[traffic] freeFlowSpeedKph must be > 0');
  if (jamDensityVehKm  <= 0) throw new Error('[traffic] jamDensityVehKm must be > 0');

  const uf = freeFlowSpeedKph;
  const kj = jamDensityVehKm;

  const speedAtDensity = (k: number): number => uf * (1 - k / kj);
  const flowAtDensity  = (k: number): number => k * speedAtDensity(k);

  return {
    capacityVeh:        (uf * kj) / 4,   // q_max at k = k_j/2
    speedAtCapacity:    uf / 2,
    densityAtCapacity:  kj / 2,
    flowAtDensity,
    speedAtDensity,
  };
}

// ─── Frank-Wolfe user equilibrium assignment ──────────────────────────────────

/**
 * Frank-Wolfe algorithm for traffic user-equilibrium (Wardrop's first principle).
 * Iterates: all-or-nothing assignment → line search → update flows.
 *
 * Works for small networks (< ~100 nodes). Converges in 50–200 iterations.
 *
 * @param nodes     Network nodes
 * @param links     Directed network links
 * @param odPairs   Origin-destination demand
 * @param maxIter   Maximum iterations (default 100)
 * @param tol       Convergence tolerance on relative gap (default 1e-4)
 */
export function frankWolfeAssignment(
  nodes:   NetworkNode[],
  links:   NetworkLink[],
  odPairs: ODPair[],
  maxIter = 100,
  tol     = 1e-4,
): NetworkAssignmentResult {
  if (links.length === 0)   throw new Error('[traffic] network must have at least one link');
  if (odPairs.length === 0) throw new Error('[traffic] must have at least one OD pair');

  const nodeIds = nodes.map((n) => n.id);
  const nodeIdx = new Map(nodeIds.map((id, i) => [id, i]));
  const nNodes  = nodes.length;

  // Current link flows
  const flows: Record<string, number> = {};
  for (const link of links) flows[link.id] = 0;

  /** Compute BPR travel time for each link at current flows */
  const linkTimes = (): Record<string, number> => {
    const t: Record<string, number> = {};
    for (const link of links) t[link.id] = bprTravelTime(link.segment, flows[link.id]);
    return t;
  };

  /**
   * Dijkstra shortest path — returns predecessor map tracking both the
   * previous node AND the exact link used (handles parallel links correctly).
   */
  const dijkstra = (
    originId: string,
    times: Record<string, number>,
  ): Map<string, { node: string | null; linkId: string | null }> => {
    const dist = new Map<string, number>(nodeIds.map((id) => [id, Infinity]));
    const prev = new Map<string, { node: string | null; linkId: string | null }>(
      nodeIds.map((id) => [id, { node: null, linkId: null }]),
    );
    dist.set(originId, 0);
    const unvisited = new Set(nodeIds);

    while (unvisited.size > 0) {
      let u: string | null = null;
      let minD = Infinity;
      for (const id of unvisited) {
        const d = dist.get(id)!;
        if (d < minD) { minD = d; u = id; }
      }
      if (u === null || minD === Infinity) break;
      unvisited.delete(u);

      for (const link of links) {
        if (link.fromId !== u) continue;
        const v   = link.toId;
        const alt = dist.get(u)! + times[link.id];
        if (alt < dist.get(v)!) {
          dist.set(v, alt);
          prev.set(v, { node: u, linkId: link.id });
        }
      }
    }
    return prev;
  };

  /** All-or-nothing assignment given current link costs */
  const allOrNothing = (times: Record<string, number>): Record<string, number> => {
    const aon: Record<string, number> = {};
    for (const link of links) aon[link.id] = 0;

    for (const od of odPairs) {
      const prev = dijkstra(od.originId, times);
      // Trace path from destination back to origin using exact link IDs
      let cur = od.destinationId;
      while (true) {
        const entry = prev.get(cur);
        if (!entry || entry.node === null || entry.linkId === null) break;
        aon[entry.linkId] = (aon[entry.linkId] ?? 0) + od.demandVeh;
        cur = entry.node;
      }
    }
    return aon;
  };

  // Iteration 0: all-or-nothing with free-flow times
  let times = linkTimes();
  const aon0 = allOrNothing(times);
  for (const link of links) flows[link.id] = aon0[link.id];

  let converged = false;
  let iter      = 0;

  for (iter = 1; iter <= maxIter; iter++) {
    times = linkTimes();
    const aon = allOrNothing(times);

    // Line search: find λ ∈ [0,1] minimising total BPR cost
    // Use golden section search
    const objectiveAt = (lambda: number): number => {
      let total = 0;
      for (const link of links) {
        const v  = (1 - lambda) * flows[link.id] + lambda * aon[link.id];
        total   += bprTravelTime(link.segment, v) * v;
      }
      return total;
    };
    let a = 0, b = 1;
    const gr = (Math.sqrt(5) + 1) / 2;
    let c = b - (b - a) / gr;
    let d = a + (b - a) / gr;
    for (let gs = 0; gs < 50; gs++) {
      if (objectiveAt(c) < objectiveAt(d)) b = d;
      else a = c;
      c = b - (b - a) / gr;
      d = a + (b - a) / gr;
    }
    const lambda = (a + b) / 2;

    // Check relative gap (convergence criterion)
    let aonCost = 0, currentCost = 0;
    for (const link of links) {
      aonCost     += times[link.id] * aon[link.id];
      currentCost += times[link.id] * flows[link.id];
    }
    const relGap = currentCost > 0 ? Math.abs(currentCost - aonCost) / currentCost : 0;

    // Update flows
    for (const link of links) {
      flows[link.id] = (1 - lambda) * flows[link.id] + lambda * aon[link.id];
    }

    if (relGap < tol) { converged = true; break; }
  }

  // Build segment results
  const segmentResults: SegmentResult[] = links.map((link) =>
    analyzeSegment(link.segment, flows[link.id]),
  );

  // Compute VMT and VHT
  let totalVMT = 0, totalVHT = 0;
  for (const link of links) {
    const res   = segmentResults.find((r) => r.segmentId === link.segment.id)!;
    totalVMT   += flows[link.id] * link.segment.lengthKm;
    totalVHT   += flows[link.id] * (res.travelTimeMin / 60);
  }

  return {
    linkFlows: { ...flows },
    segmentResults,
    totalVMT,
    totalVHT,
    converged,
    iterations: iter,
  };
}

// ─── Receipt ─────────────────────────────────────────────────────────────────

const LOS_ORDER: LevelOfService[] = ['A', 'B', 'C', 'D', 'E', 'F'];

export function buildTrafficFlowReceipt(
  result:  TrafficAnalysisResult,
  options?: { runId?: string },
): TrafficFlowReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  const losF = result.segments.filter((s) => s.los === 'F');
  if (losF.length > 0) {
    violations.push({
      criterion: 'los',
      message:   `${losF.length} segment(s) at LOS F (v/c > 1.0): ${losF.map((s) => s.segmentId).join(', ')}`,
    });
  }
  if (result.networkAssignment && !result.networkAssignment.converged) {
    violations.push({ criterion: 'convergence', message: 'Frank-Wolfe UE assignment did not converge' });
  }

  const avgVCRatio = result.segments.reduce((s, r) => s + r.vcRatio, 0) / (result.segments.length || 1);
  const worstLOS   = result.segments.reduce<LevelOfService>(
    (worst, r) => LOS_ORDER.indexOf(r.los) > LOS_ORDER.indexOf(worst) ? r.los : worst,
    'A',
  );

  const raw = buildDomainSimulationReceipt({
    plugin:        'urban-planning',
    pluginVersion: '1.0.0',
    runId:         options?.runId ?? `traffic-${Date.now().toString(36)}`,
    solverConfig: {
      solverType:    'bpr-frankwolfe',
      scale:         'network',
      segmentCount:  result.segments.length,
    },
    resultSummary: {
      segmentCount:  result.segments.length,
      avgVCRatio:    +avgVCRatio.toFixed(4),
      worstLOS,
      totalVMT:      result.networkAssignment?.totalVMT ?? null,
      totalVHT:      result.networkAssignment?.totalVHT ?? null,
    },
    cael: {
      version:    'cael.v1',
      event:      'urban_planning.traffic_flow',
      solverType: 'urban-planning.bpr-frankwolfe',
    },
    acceptance: { accepted: violations.length === 0, violations },
  });

  return raw as unknown as TrafficFlowReceipt;
}
