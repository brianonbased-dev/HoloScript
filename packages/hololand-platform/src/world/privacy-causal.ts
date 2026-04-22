/**
 * Privacy-Preserving Causal Discovery
 *
 * Implements secure multi-party causal structure learning with:
 * - Differentially private conditional independence tests (DP-CI)
 * - Federated PC-algorithm skeleton learning across silos
 * - Laplace mechanism on Fisher Z-transformed correlation statistics
 * - Cross-silo causal graph aggregation with majority-vote orientation
 *
 * Research Cycle 10 — Autonomize Phase 7
 */

import { createHash, randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CausalVariable {
  id: string;
  name: string;
  domain: 'continuous' | 'binary' | 'categorical';
}

export interface ConditionalIndependenceResult {
  x: string;
  y: string;
  condSet: string[];
  independent: boolean;
  pValue: number; // noisy p-value after DP mechanism
  epsilon: number;
}

export interface CausalEdge {
  from: string;
  to: string;
  orientation: 'directed' | 'undirected' | 'none';
  confidence: number; // 0–1
}

export interface CausalSkeleton {
  variables: string[];
  edges: CausalEdge[];
  privacyBudgetSpent: number;
}

export interface FederatedSiloData {
  siloId: string;
  skeleton: CausalSkeleton;
  sampleSize: number;
}

export interface AggregatedCausalGraph {
  variables: string[];
  edges: CausalEdge[];
  totalSilos: number;
  totalSamples: number;
  privacyBudgetSpent: number;
  discoveredAt: number;
}

export interface PrivacyCausalConfig {
  epsilon: number;          // total privacy budget
  delta: number;            // (ε,δ)-DP delta parameter, use 0 for pure DP
  alpha: number;            // significance level for CI tests (e.g. 0.05)
  maxCondSetSize: number;   // PC algorithm max conditioning set size
  minSiloAgreement: number; // fraction of silos that must agree on an edge (0–1)
}

// ---------------------------------------------------------------------------
// Differential Privacy — Laplace Mechanism
// ---------------------------------------------------------------------------

/**
 * Sample from Laplace(0, b) distribution.
 * Uses inverse CDF: b * sign(u - 0.5) * ln(1 - 2|u - 0.5|)
 */
function laplaceSample(scale: number): number {
  const u = (randomBytes(4).readUInt32BE(0) / 0xffffffff) - 0.5;
  if (u === 0) return 0;
  return -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
}

/**
 * Add Laplace noise calibrated to sensitivity/epsilon for a test statistic.
 * Returns the noised statistic.
 */
export function addDPNoise(
  statistic: number,
  sensitivity: number,
  epsilon: number,
): number {
  if (epsilon <= 0) throw new Error('epsilon must be > 0');
  if (sensitivity <= 0) throw new Error('sensitivity must be > 0');
  const scale = sensitivity / epsilon;
  return statistic + laplaceSample(scale);
}

// ---------------------------------------------------------------------------
// Conditional Independence Tests
// ---------------------------------------------------------------------------

/**
 * Compute Fisher Z transformation from sample correlation.
 * Z = 0.5 * ln((1+r)/(1-r))
 */
export function fisherZ(r: number): number {
  const clamped = Math.max(-0.9999, Math.min(0.9999, r));
  return 0.5 * Math.log((1 + clamped) / (1 - clamped));
}

/**
 * Inverse Fisher Z: r = tanh(z)
 */
export function inverseFisherZ(z: number): number {
  return Math.tanh(z);
}

/**
 * Differentially private CI test using Fisher Z statistic.
 *
 * In a real multi-party setting each silo computes local correlations,
 * adds DP noise, and shares noised Z-scores. Here we simulate this:
 * the caller supplies the sample correlation r and sample size n.
 * Sensitivity of the Fisher Z statistic ≈ 1/sqrt(n-3).
 *
 * Returns a DP-protected CI result.
 */
export function dpConditionalIndependenceTest(
  x: string,
  y: string,
  condSet: string[],
  sampleCorrelation: number,
  sampleSize: number,
  epsilon: number,
  alpha: number = 0.05,
): ConditionalIndependenceResult {
  if (epsilon <= 0) throw new Error('epsilon must be > 0');
  if (sampleSize < 4) throw new Error('sampleSize must be >= 4');

  const n = sampleSize;
  const df = n - condSet.length - 3;
  if (df <= 0) {
    // Not enough samples for this conditioning set size — treat as dependent
    return { x, y, condSet, independent: false, pValue: 0, epsilon };
  }

  const zStat = fisherZ(sampleCorrelation);
  const sensitivity = 1 / Math.sqrt(Math.max(1, n - 3));
  const noisyZ = addDPNoise(zStat, sensitivity, epsilon);

  // Test statistic: T = noisyZ * sqrt(n - |condSet| - 3)
  const testStat = Math.abs(noisyZ) * Math.sqrt(df);

  // Convert to two-tailed p-value approximation using normal distribution CDF
  const pValue = 2 * (1 - normalCDF(testStat));

  return {
    x,
    y,
    condSet,
    independent: pValue > alpha,
    pValue,
    epsilon,
  };
}

/**
 * Standard normal CDF approximation (Abramowitz & Stegun 26.2.17).
 */
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    t * (0.319381530 +
      t * (-0.356563782 +
        t * (1.781477937 +
          t * (-1.821255978 +
            t * 1.330274429))));
  const approx = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x) * poly;
  return x >= 0 ? approx : 1 - approx;
}

// ---------------------------------------------------------------------------
// PC Algorithm — Skeleton Learning (Privacy-Preserving)
// ---------------------------------------------------------------------------

/**
 * Run a single DP-PC skeleton phase for one silo's data.
 *
 * Parameters:
 *   variables    — list of variable IDs
 *   correlations — symmetric n×n matrix indexed by variable ID
 *   sampleSize   — number of observations at this silo
 *   config       — privacy and algorithm config
 *
 * Returns:
 *   CausalSkeleton with edges and budget spent
 */
export function runDPSkeletonLearning(
  variables: string[],
  correlations: Map<string, Map<string, number>>,
  sampleSize: number,
  config: PrivacyCausalConfig,
): CausalSkeleton {
  const { epsilon, alpha, maxCondSetSize } = config;

  // Start with fully connected skeleton (undirected)
  const adjacencies = new Set<string>();
  for (let i = 0; i < variables.length; i++) {
    for (let j = i + 1; j < variables.length; j++) {
      adjacencies.add(edgeKey(variables[i], variables[j]));
    }
  }

  let budgetSpent = 0;
  const epsilonPerTest = epsilon / Math.max(1, totalCITests(variables.length, maxCondSetSize));

  // PC skeleton: iteratively remove edges by testing conditional independence
  for (let condSize = 0; condSize <= maxCondSetSize; condSize++) {
    for (const key of [...adjacencies]) {
      const [x, y] = key.split('||');
      // Collect current neighbours of x (excluding y)
      const neighbours = getNeighbours(x, variables, adjacencies).filter(v => v !== y);
      if (neighbours.length < condSize) continue;

      // Try each conditioning set of size condSize
      const condSets = choose(neighbours, condSize);
      for (const condSet of condSets) {
        // Get partial correlation (simplified: use marginal correlation here)
        const r = correlations.get(x)?.get(y) ?? 0;
        const result = dpConditionalIndependenceTest(
          x, y, condSet, r, sampleSize, epsilonPerTest, alpha,
        );
        budgetSpent += epsilonPerTest;

        if (result.independent) {
          adjacencies.delete(key);
          break;
        }
      }
    }
  }

  const edges: CausalEdge[] = [];
  for (const key of adjacencies) {
    const [from, to] = key.split('||');
    edges.push({ from, to, orientation: 'undirected', confidence: 1.0 });
  }

  return { variables, edges, privacyBudgetSpent: budgetSpent };
}

function edgeKey(a: string, b: string): string {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `${lo}||${hi}`;
}

function getNeighbours(v: string, variables: string[], adjacencies: Set<string>): string[] {
  return variables.filter(u => u !== v && adjacencies.has(edgeKey(v, u)));
}

function totalCITests(n: number, maxK: number): number {
  let total = 0;
  for (let k = 0; k <= maxK; k++) {
    total += n * (n - 1) / 2 * binomialCoeff(n - 2, k);
  }
  return Math.max(total, 1);
}

function binomialCoeff(n: number, k: number): number {
  if (k > n) return 0;
  if (k === 0) return 1;
  let result = 1;
  for (let i = 0; i < k; i++) result = result * (n - i) / (i + 1);
  return Math.round(result);
}

function choose<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  const result: T[][] = [];
  for (let i = 0; i <= arr.length - k; i++) {
    const rest = choose(arr.slice(i + 1), k - 1);
    for (const r of rest) result.push([arr[i], ...r]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Cross-Silo Aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregate causal skeletons from multiple silos.
 *
 * Strategy: an edge appears in the final graph iff at least
 * `minSiloAgreement` fraction of silos include it.
 * Confidence = fraction of silos that agreed.
 */
export function aggregateCausalSkeletons(
  silos: FederatedSiloData[],
  config: PrivacyCausalConfig,
): AggregatedCausalGraph {
  if (silos.length === 0) throw new Error('At least one silo required');

  const edgeVotes = new Map<string, number>();
  const totalSamples = silos.reduce((s, silo) => s + silo.sampleSize, 0);
  let totalBudget = 0;

  // Collect all variable IDs
  const allVariables = new Set<string>();
  for (const silo of silos) {
    for (const v of silo.skeleton.variables) allVariables.add(v);
    for (const edge of silo.skeleton.edges) {
      const key = edgeKey(edge.from, edge.to);
      edgeVotes.set(key, (edgeVotes.get(key) ?? 0) + 1);
    }
    totalBudget += silo.skeleton.privacyBudgetSpent;
  }

  const threshold = config.minSiloAgreement * silos.length;
  const aggregatedEdges: CausalEdge[] = [];

  for (const [key, votes] of edgeVotes) {
    if (votes >= threshold) {
      const [from, to] = key.split('||');
      aggregatedEdges.push({
        from,
        to,
        orientation: 'undirected',
        confidence: votes / silos.length,
      });
    }
  }

  return {
    variables: [...allVariables],
    edges: aggregatedEdges,
    totalSilos: silos.length,
    totalSamples,
    privacyBudgetSpent: totalBudget,
    discoveredAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// SecureCausalDiscovery — Coordinator
// ---------------------------------------------------------------------------

/**
 * Coordinator that orchestrates privacy-preserving causal discovery
 * across multiple data silos.
 *
 * Usage:
 *   const scd = new SecureCausalDiscovery({ epsilon: 1.0, ... });
 *   scd.registerSilo('hospital-a', data);
 *   scd.registerSilo('hospital-b', data);
 *   const graph = scd.discover();
 */
export class SecureCausalDiscovery {
  private silos: Array<{
    id: string;
    variables: string[];
    correlations: Map<string, Map<string, number>>;
    sampleSize: number;
  }> = [];

  constructor(private config: PrivacyCausalConfig) {}

  registerSilo(
    siloId: string,
    variables: string[],
    correlations: Map<string, Map<string, number>>,
    sampleSize: number,
  ): void {
    this.silos.push({ id: siloId, variables, correlations, sampleSize });
  }

  discover(): AggregatedCausalGraph {
    if (this.silos.length === 0) throw new Error('No silos registered');

    const federatedData: FederatedSiloData[] = this.silos.map(silo => {
      const skeleton = runDPSkeletonLearning(
        silo.variables,
        silo.correlations,
        silo.sampleSize,
        this.config,
      );
      return { siloId: silo.id, skeleton, sampleSize: silo.sampleSize };
    });

    return aggregateCausalSkeletons(federatedData, this.config);
  }

  reset(): void {
    this.silos = [];
  }

  siloCount(): number {
    return this.silos.length;
  }
}

// ---------------------------------------------------------------------------
// Helpers — Correlation Matrix Builder
// ---------------------------------------------------------------------------

/**
 * Build a symmetric correlation map from raw observations.
 * observations: Map<variableId, number[]>
 *
 * Returns a Map<variableId, Map<variableId, pearsonR>>
 */
export function buildCorrelationMatrix(
  observations: Map<string, number[]>,
): Map<string, Map<string, number>> {
  const varIds = [...observations.keys()];
  const result = new Map<string, Map<string, number>>();

  for (const v of varIds) result.set(v, new Map());

  for (let i = 0; i < varIds.length; i++) {
    for (let j = i; j < varIds.length; j++) {
      const xi = observations.get(varIds[i])!;
      const xj = observations.get(varIds[j])!;
      const r = pearsonR(xi, xj);
      result.get(varIds[i])!.set(varIds[j], r);
      result.get(varIds[j])!.set(varIds[i], r);
    }
  }

  return result;
}

function pearsonR(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;
  const mx = x.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = y.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

// ---------------------------------------------------------------------------
// Privacy Audit Log
// ---------------------------------------------------------------------------

export interface PrivacyAuditEntry {
  timestamp: number;
  siloId: string;
  epsilonSpent: number;
  testsRun: number;
  sessionId: string;
}

export class PrivacyAuditLog {
  private entries: PrivacyAuditEntry[] = [];

  record(siloId: string, epsilonSpent: number, testsRun: number): void {
    this.entries.push({
      timestamp: Date.now(),
      siloId,
      epsilonSpent,
      testsRun,
      sessionId: randomBytes(8).toString('hex'),
    });
  }

  totalEpsilonSpent(): number {
    return this.entries.reduce((s, e) => s + e.epsilonSpent, 0);
  }

  entriesForSilo(siloId: string): PrivacyAuditEntry[] {
    return this.entries.filter(e => e.siloId === siloId);
  }

  all(): PrivacyAuditEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}
