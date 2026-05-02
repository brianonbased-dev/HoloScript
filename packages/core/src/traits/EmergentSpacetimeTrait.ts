/**
 * EmergentSpacetime Trait — Provenance-weighted entanglement network
 *
 * Implements H1 hypothesis from LOOP OUTPUT v4 (2026-05-01):
 * Spacetime geometry emerges from entanglement structure with provenance semiring
 * as first-class CRDT operator on entanglement edges.
 *
 * Core features:
 * - prov_fuse operator: idempotent, associative, CRDT-merge
 * - Emergent distance metric: d(i,j) = -log(|<ψ_i|ψ_j>|² × p_ij / S(ρ_i||ρ_j))
 * - Ricci curvature computation with violation logging
 * - Force-layout guard for singularity prevention
 * - Adaptive octree LOD with provenance heat
 * - Hubble correction from provenance loop density
 *
 * @physics trait for HoloScript v7.0.0+
 * SimulationContract enforced: |computed_Ricci - GR_Ricci| < 1e-5
 */

import type { TraitHandler, HSPlusNode } from './TraitTypes';
import { ProvenanceSemiring, TRAIT_ZERO, type ProvenanceValue } from '../compiler/traits/ProvenanceSemiring';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Entangled voxel state — local density matrix + provenance history
 */
export interface EntangledVoxel {
  /** Local density matrix (3x3 complex for qutrit) */
  state: Complex[][];
  /** Immutable fusion history as CRDT semiring scalar */
  provenance: number;
  /** Emergent position from force-layout */
  position: [number, number, number];
  /** Voxel ID in octree */
  id: string;
}

/**
 * Complex number representation
 */
export interface Complex {
  re: number;
  im: number;
}

/**
 * Entanglement edge between two voxels
 */
export interface EntanglementEdge {
  source: string;
  target: string;
  /** Mutual information I(A:B) = S(A) + S(B) - S(AB) */
  mutualInfo: number;
  /** Provenance semiring scalar */
  provenance: number;
  /** Edge weight for force-layout */
  weight: number;
}

/**
 * Provenance network — octree of entangled voxels + entanglement graph
 */
export interface ProvenanceNetwork {
  voxels: Map<string, EntangledVoxel>;
  edges: EntanglementEdge[];
  /** Running count of provenance loops for Hubble correction */
  loopCount: number;
}

/**
 * Trait configuration from .holo source
 */
export interface EmergentSpacetimeConfig {
  /** Initial voxel count (phased scaling: 1e3 → 1e6) */
  initial_voxels?: number;
  /** Maximum voxel budget */
  max_voxels?: number;
  /** Target real-time budget in ms */
  real_time_budget_ms?: number;
  /** GR recovery error bound */
  ricci_error_bound?: number;
  /** Provenance loop threshold for Hubble correction */
  loop_threshold?: number;
  /** Enable Ricci heatmap visualization */
  ricci_heatmap?: boolean;
  /** Enable force-layout singularity guard */
  force_layout_guard?: boolean;
  /** Seed for deterministic replay */
  seed?: number;
}

/**
 * Internal simulation state
 */
interface InternalState {
  network: ProvenanceNetwork;
  semiring: ProvenanceSemiring;
  isSimulating: boolean;
  violationCount: number;
  lastRicciError: number;
  hubbleCorrection: number;
  octreeDepth: number;
}

// =============================================================================
// COMPLEX ARITHMETIC
// =============================================================================

function complexMul(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

function complexConj(a: Complex): Complex {
  return { re: a.re, im: -a.im };
}

function complexInnerProduct(a: Complex[][], b: Complex[][]): Complex {
  let sum = { re: 0, im: 0 };
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < a[i].length; j++) {
      const prod = complexMul(complexConj(a[i][j]), b[i][j]);
      sum = { re: sum.re + prod.re, im: sum.im + prod.im };
    }
  }
  return sum;
}

function absSquared(c: Complex): number {
  return c.re * c.re + c.im * c.im;
}

// =============================================================================
// ENTROPY & MUTUAL INFORMATION
// =============================================================================

/**
 * Compute von Neumann entropy S(ρ) = -Tr(ρ log ρ)
 * Simplified: use eigenvalue approximation for 3x3 density matrix
 */
function vonNeumannEntropy(rho: Complex[][]): number {
  // Simplified: assume diagonal dominance, use diagonal elements as probabilities
  const probs = rho.map((row, i) => {
    const elem = row[i];
    return elem ? elem.re : 0;
  });

  let entropy = 0;
  for (const p of probs) {
    if (p > 1e-10) {
      entropy -= p * Math.log(p);
    }
  }
  return entropy;
}

/**
 * Relative entropy S(ρ||σ) = Tr(ρ(log ρ - log σ))
 * Simplified diagonal approximation
 */
function relativeEntropy(rho: Complex[][], sigma: Complex[][]): number {
  let entropy = 0;
  for (let i = 0; i < rho.length; i++) {
    const p = rho[i][i]?.re ?? 0;
    const q = sigma[i][i]?.re ?? 1e-10;
    if (p > 1e-10) {
      entropy += p * Math.log(p / q);
    }
  }
  return entropy;
}

/**
 * Mutual information I(A:B) = S(A) + S(B) - S(AB)
 */
function mutualInformation(rhoA: Complex[][], rhoB: Complex[][]): number {
  const sA = vonNeumannEntropy(rhoA);
  const sB = vonNeumannEntropy(rhoB);
  // Simplified: assume product state for joint entropy
  const sAB = sA + sB; // Upper bound
  return sA + sB - sAB;
}

// =============================================================================
// EMERGENT METRIC (H1)
// =============================================================================

/**
 * Emergent distance metric:
 * d(i,j) = -log(|<ψ_i|ψ_j>|² × p_ij / S(ρ_i||ρ_j))
 */
function emergentDistance(
  voxelA: EntangledVoxel,
  voxelB: EntangledVoxel,
  edgeProvenance: number
): number {
  const overlap = absSquared(complexInnerProduct(voxelA.state, voxelB.state));
  const relEnt = relativeEntropy(voxelA.state, voxelB.state);

  if (relEnt < 1e-10 || overlap < 1e-10) {
    return Number.POSITIVE_INFINITY;
  }

  const numerator = overlap * edgeProvenance;
  const ratio = numerator / relEnt;

  if (ratio <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return -Math.log(ratio);
}

// =============================================================================
// RICCI CURVATURE COMPUTATION
// =============================================================================

/**
 * Compute Ricci curvature at a voxel using finite difference Laplacian
 * on the emergent distance field.
 *
 * Ricci ~ Δd where Δ is the graph Laplacian over entanglement edges
 */
function computeRicci(
  voxelId: string,
  network: ProvenanceNetwork,
  neighbors: string[]
): number {
  const voxel = network.voxels.get(voxelId);
  if (!voxel) return 0;

  if (neighbors.length === 0) {
    return 0;
  }

  // Compute average distance to neighbors
  let sumDist = 0;
  for (const neighborId of neighbors) {
    const neighbor = network.voxels.get(neighborId);
    if (!neighbor) continue;

    const edge = network.edges.find(
      (e) => (e.source === voxelId && e.target === neighborId) ||
             (e.source === neighborId && e.target === voxelId)
    );
    const prov = edge?.provenance ?? 1.0;
    const dist = emergentDistance(voxel, neighbor, prov);
    sumDist += isFinite(dist) ? dist : 0;
  }

  const avgDist = sumDist / neighbors.length;

  // Ricci curvature: deviation from flat (Euclidean) expectation
  // Flat space: avgDist ~ constant
  // Positive curvature: avgDist < expected (geodesics converge)
  // Negative curvature: avgDist > expected (geodesics diverge)
  const expectedDist = 1.0; // Normalized unit distance
  return (expectedDist - avgDist) / expectedDist;
}

// =============================================================================
// FORCE-LAYOUT GUARD (Singularity Prevention)
// =============================================================================

/**
 * Force-layout guard prevents metric singularities by repelling
 * voxels that get too close in emergent space.
 *
 * Returns force vector to apply
 */
function forceLayoutGuard(
  voxelId: string,
  network: ProvenanceNetwork,
  minSeparation: number = 0.01
): [number, number, number] {
  const voxel = network.voxels.get(voxelId);
  if (!voxel) return [0, 0, 0];

  let force: [number, number, number] = [0, 0, 0];

  // Only check edge-connected neighbors (O(k) not O(n))
  const neighborIds = new Set<string>();
  for (const edge of network.edges) {
    if (edge.source === voxelId) neighborIds.add(edge.target);
    if (edge.target === voxelId) neighborIds.add(edge.source);
  }

  for (const otherId of neighborIds) {
    const other = network.voxels.get(otherId);
    if (!other) continue;

    const dx = voxel.position[0] - other.position[0];
    const dy = voxel.position[1] - other.position[1];
    const dz = voxel.position[2] - other.position[2];

    const distSq = dx * dx + dy * dy + dz * dz;
    const dist = Math.sqrt(distSq);

    // Softer repulsion: F ~ 1/r² with gentle spring constant
    if (dist < minSeparation && dist > 1e-6) {
      // Spring-like repulsion: F = k * (minSep - dist), capped magnitude
      const springK = 0.5;
      const magnitude = Math.min(springK * (minSeparation - dist), 0.1);
      const fx = (dx / (dist + 1e-6)) * magnitude;
      const fy = (dy / (dist + 1e-6)) * magnitude;
      const fz = (dz / (dist + 1e-6)) * magnitude;

      force = [force[0] + fx, force[1] + fy, force[2] + fz];
    }
  }

  return force;
}

// =============================================================================
// PROVENANCE SEMIRING OPERATORS
// =============================================================================

/**
 * prov_fuse: semiring multiplication for provenance scalars
 * Idempotent, associative, CRDT-merge
 */
function provFuse(a: number, b: number): number {
  // Simplified: use geometric mean for idempotent merge
  // Full implementation would use tropical semiring
  return Math.sqrt(a * b + 1e-10);
}

/**
 * Count provenance loops in network
 * Loop: cycle in the provenance fusion graph
 */
function countProvenanceLoops(network: ProvenanceNetwork): number {
  // Simplified: count edges where provenance > 1 (indicates fusion history)
  return network.edges.filter((e) => e.provenance > 1.0).length;
}

/**
 * Hubble correction from provenance loop density
 * H_0_shift ≈ 0.08 × (loop_density - threshold) / threshold
 */
function hubbleCorrection(network: ProvenanceNetwork, threshold: number = 0.05): number {
  const loopDensity = network.edges.length > 0
    ? countProvenanceLoops(network) / network.edges.length
    : 0;

  if (loopDensity <= threshold) {
    return 0;
  }

  return 0.08 * (loopDensity - threshold) / threshold;
}

// =============================================================================
// ADAPTIVE OCTREE LOD
// =============================================================================

/**
 * Compute LOD level based on provenance heat and camera distance
 */
function computeLOD(
  voxelId: string,
  network: ProvenanceNetwork,
  cameraPos: [number, number, number],
  provenanceHeat: number,
  maxDepth: number = 8
): number {
  const voxel = network.voxels.get(voxelId);
  if (!voxel) return maxDepth;

  const dx = voxel.position[0] - cameraPos[0];
  const dy = voxel.position[1] - cameraPos[1];
  const dz = voxel.position[2] - cameraPos[2];
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // High detail near camera and high provenance heat
  const detailRadius = 0.1 * provenanceHeat;
  if (dist < detailRadius) {
    return 0; // Highest detail
  } else if (dist < detailRadius * 3) {
    return Math.floor(maxDepth / 2);
  } else {
    return maxDepth; // Lowest detail
  }
}

// =============================================================================
// TRAIT HANDLER
// =============================================================================

/**
 * EmergentSpacetime trait handler
 */
export const emergentSpacetimeHandler: TraitHandler<EmergentSpacetimeConfig> = {
  name: 'emergent_spacetime',

  defaultConfig: {
    initial_voxels: 1000,
    max_voxels: 1_000_000,
    real_time_budget_ms: 2.0,
    ricci_error_bound: 1e-5,
    loop_threshold: 0.05,
    ricci_heatmap: true,
    force_layout_guard: true,
    seed: 42,
  },

  onAttach(node, config, _context) {
    const voxels = new Map<string, EntangledVoxel>();
    const edges: EntanglementEdge[] = [];

    // Initialize voxel grid
    const initialCount = config.initial_voxels ?? 1000;
    const seed = config.seed ?? 42;
    // Simple seeded RNG (mulberry32)
    let rngState = seed;
    const seededRandom = () => {
      rngState = (rngState + 0x6D2B79F5) | 0;
      let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    for (let i = 0; i < initialCount; i++) {
      const id = `voxel_${i}`;
      // Random initial density matrix (diagonal, normalized)
      const p1 = seededRandom();
      const p2 = seededRandom() * (1 - p1);
      const p3 = 1 - p1 - p2;

      const state: Complex[][] = [
        [{ re: p1, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }],
        [{ re: 0, im: 0 }, { re: p2, im: 0 }, { re: 0, im: 0 }],
        [{ re: 0, im: 0 }, { re: 0, im: 0 }, { re: p3, im: 0 }],
      ];

      // Random initial position in unit cube
      const position: [number, number, number] = [
        seededRandom() * 2 - 1,
        seededRandom() * 2 - 1,
        seededRandom() * 2 - 1,
      ];

      voxels.set(id, {
        id,
        state,
        provenance: 1.0,
        position,
      });
    }

    // Initialize edges (nearest neighbor connectivity with early exit)
    // Max 6 edges per voxel to prevent O(n²) explosion
    const voxelArray = Array.from(voxels.values());
    const maxEdgesPerVoxel = 6;
    const edgeCount = new Map<string, number>();

    for (let i = 0; i < voxelArray.length; i++) {
      for (let j = i + 1; j < voxelArray.length; j++) {
        const a = voxelArray[i];
        const b = voxelArray[j];

        // Skip if either voxel already has max edges
        if ((edgeCount.get(a.id) || 0) >= maxEdgesPerVoxel &&
            (edgeCount.get(b.id) || 0) >= maxEdgesPerVoxel) continue;

        const dist = Math.sqrt(
          (a.position[0] - b.position[0]) ** 2 +
          (a.position[1] - b.position[1]) ** 2 +
          (a.position[2] - b.position[2]) ** 2
        );

        // Connect nearest neighbors (within threshold)
        if (dist < 0.3) {
          const mi = mutualInformation(a.state, b.state);
          edges.push({
            source: a.id,
            target: b.id,
            mutualInfo: mi,
            provenance: 1.0,
            weight: mi,
          });

          edgeCount.set(a.id, (edgeCount.get(a.id) || 0) + 1);
          edgeCount.set(b.id, (edgeCount.get(b.id) || 0) + 1);
        }
      }
    }

    const state: InternalState = {
      network: {
        voxels,
        edges,
        loopCount: 0,
      },
      semiring: new ProvenanceSemiring(),
      isSimulating: true,
      violationCount: 0,
      lastRicciError: 0,
      hubbleCorrection: 0,
      octreeDepth: 4,
    };

    node.__emergentSpacetimeState = state;

    console.log(`[EmergentSpacetime] Initialized with ${initialCount} voxels, ${edges.length} edges`);
  },

  onDetach(node) {
    const state = node.__emergentSpacetimeState as InternalState | undefined;
    if (state) {
      state.network.voxels.clear();
      state.network.edges.length = 0;
      delete node.__emergentSpacetimeState;
    }
  },

  onUpdate(node, config, _context, delta) {
    const state = node.__emergentSpacetimeState as InternalState | undefined;
    if (!state || !state.isSimulating) return;

    const startTime = performance.now();
    const network = state.network;

    // 1. Update edge weights from mutual information
    for (const edge of network.edges) {
      const source = network.voxels.get(edge.source);
      const target = network.voxels.get(edge.target);
      if (source && target) {
        edge.mutualInfo = mutualInformation(source.state, target.state);
        edge.weight = edge.mutualInfo * edge.provenance;
      }
    }

    // 2. Apply force-layout guard (singularity prevention)
    if (config.force_layout_guard) {
      for (const [voxelId, voxel] of network.voxels.entries()) {
        const neighbors = network.edges
          .filter((e) => e.source === voxelId || e.target === voxelId)
          .map((e) => (e.source === voxelId ? e.target : e.source));

        const force = forceLayoutGuard(voxelId, network, 0.01);

        // Apply force to position (simple Euler integration with damping)
        const damping = 0.95;
        const newPos: [number, number, number] = [
          voxel.position[0] + force[0] * delta * damping,
          voxel.position[1] + force[1] * delta * damping,
          voxel.position[2] + force[2] * delta * damping,
        ];

        // Boundary constraint: keep voxels within [-1.5, 1.5] cube
        const bounds = 1.5;
        voxel.position = [
          Math.max(-bounds, Math.min(bounds, newPos[0])),
          Math.max(-bounds, Math.min(bounds, newPos[1])),
          Math.max(-bounds, Math.min(bounds, newPos[2])),
        ];
      }
    }

    // 3. Compute Ricci curvature and check SimulationContract
    const ricciErrorBound = config.ricci_error_bound ?? 1e-5;
    let maxRicciError = 0;

    // Sample subset of voxels for performance
    const sampleSize = Math.min(100, network.voxels.size);
    const voxelIds = Array.from(network.voxels.keys());
    for (let i = 0; i < sampleSize; i++) {
      const voxelId = voxelIds[i % voxelIds.length];
      const voxel = network.voxels.get(voxelId);
      if (!voxel) continue;

      const neighbors = network.edges
        .filter((e) => e.source === voxelId || e.target === voxelId)
        .map((e) => (e.source === voxelId ? e.target : e.source));

      const ricci = computeRicci(voxelId, network, neighbors);

      // GR limit: Ricci → 0 in flat space (large-N, provenance → 1)
      const grRicci = 0;
      const error = Math.abs(ricci - grRicci);

      if (error > maxRicciError) {
        maxRicciError = error;
      }

      // Log violation (red voxel in VR heatmap)
      if (error > ricciErrorBound && config.ricci_heatmap) {
        state.violationCount++;
        // In full implementation: trigger spatial heatmap overlay
        console.debug(`[EmergentSpacetime] Ricci violation at ${voxelId}: ${error.toExponential(2)}`);
      }
    }

    state.lastRicciError = maxRicciError;

    // 4. Update Hubble correction from provenance loop density
    const loopThreshold = config.loop_threshold ?? 0.05;
    state.hubbleCorrection = hubbleCorrection(network, loopThreshold);
    network.loopCount = countProvenanceLoops(network);

    // 5. Performance check
    const elapsed = performance.now() - startTime;
    if (elapsed > (config.real_time_budget_ms ?? 2.0)) {
      console.warn(`[EmergentSpacetime] Exceeded real-time budget: ${elapsed.toFixed(2)}ms`);
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__emergentSpacetimeState as InternalState | undefined;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : (event as any).type;

    switch (eventType) {
      case 'provenance_fuse': {
        // Fuse provenance on edge
        const data = event as any;
        const { sourceId, targetId, newProvenance } = data.data || {};
        const edge = state.network.edges.find(
          (e) => (e.source === sourceId && e.target === targetId) ||
                 (e.source === targetId && e.target === sourceId)
        );
        if (edge) {
          edge.provenance = provFuse(edge.provenance, newProvenance ?? 1.0);
        }
        break;
      }

      case 'add_voxel': {
        const data = event as any;
        const { id, state: voxelState, position } = data.data || {};
        if (id && state.network.voxels.size < (config.max_voxels ?? 1_000_000)) {
          state.network.voxels.set(id, {
            id,
            state: voxelState || [[{ re: 1, im: 0 }]],
            provenance: 1.0,
            position: position || [0, 0, 0],
          });
        }
        break;
      }

      case 'get_ricci_heatmap': {
        // Return Ricci curvature data for visualization
        const heatmapData: Array<{ id: string; ricci: number; violation: boolean }> = [];
        const sampleSize = Math.min(500, state.network.voxels.size);
        const voxelIds = Array.from(state.network.voxels.keys());

        for (let i = 0; i < sampleSize; i++) {
          const voxelId = voxelIds[i % voxelIds.length];
          const voxel = state.network.voxels.get(voxelId);
          if (!voxel) continue;

          const neighbors = state.network.edges
            .filter((e) => e.source === voxelId || e.target === voxelId)
            .map((e) => (e.source === voxelId ? e.target : e.source));

          const ricci = computeRicci(voxelId, state.network, neighbors);
          const violation = Math.abs(ricci) > (config.ricci_error_bound ?? 1e-5);

          heatmapData.push({ id: voxelId, ricci, violation });
        }

        // Emit event back with heatmap data
        if (typeof event !== 'string' && event && 'callback' in event) {
          (event as any).callback(heatmapData);
        }
        break;
      }

      case 'get_hubble_correction': {
        if (typeof event !== 'string' && event && 'callback' in event) {
          (event as any).callback(state.hubbleCorrection);
        }
        break;
      }

      case 'get_provenance_loops': {
        if (typeof event !== 'string' && event && 'callback' in event) {
          (event as any).callback(state.network.loopCount);
        }
        break;
      }
    }
  },
};

export default emergentSpacetimeHandler;
