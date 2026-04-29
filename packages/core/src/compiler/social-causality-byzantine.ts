/**
 * HoloScript -> Byzantine-Resilient Social Causal Merge (Cycle 13)
 *
 * Wraps {@link mergeSocialCausalModels} (Cycle 12) with a stateful per-agent
 * trust ledger that detects and silently drops agents whose edge-weight
 * observations are statistical outliers from the cluster consensus.
 *
 * Threat model (federated multi-agent reinforcement learning, FMARL):
 *  - Each agent contributes a private SCM-DAG (already affective-pruned per
 *    Cycle 9 and privacy-masked per Cycle 10).
 *  - A subset of contributing agents may be Byzantine: they assert edges with
 *    grossly skewed weights (e.g. 99.0 instead of the cluster's ~1.0) intending
 *    to poison the merged consensus.
 *  - The coordinator does NOT know a priori which agents are Byzantine.
 *
 * Defense:
 *  1. Compute per-edge weight mean and population standard deviation across
 *     all agents who asserted that edge.
 *  2. For each agent, count edges where their weight deviates more than
 *     `outlierSigma` (default 1.5) from the cluster mean. If a clear cluster
 *     mean cannot form (fewer than `minClusterAgents`, default 3) the edge is
 *     skipped — std-dev tests on n<3 are noise, not signal.
 *  3. Agents with >=1 outlier observation per call decay their trust score by
 *     `decayPerEpoch` (default 0.1). Agents with zero outliers in a call hold
 *     their score (no recovery — see "Recovery semantics" below).
 *  4. Agents whose trust score has fallen below `dropThreshold` (default 0.3)
 *     are excluded from the merge entirely; their DAG never reaches consensus.
 *
 * Recovery semantics: trust does NOT regenerate. A malicious actor that flips
 * to honest behavior cannot grind their score back up. This is intentional —
 * Cycle 13's threat model assumes adversaries are adaptive and a recoverable
 * trust score gives them a free re-entry channel. If an operator wants to
 * pardon an agent, call {@link AgentTrustLedger.reset} explicitly.
 *
 * What this is NOT:
 *  - Not a cryptographic Byzantine fault tolerance protocol (see
 *    `packages/hololand-platform/src/world/byzantineWorldConsensus.ts` for the
 *    PBFT-style quorum used at the world-creation layer).
 *  - Not a defense against agents who assert *novel* edges nobody else sees —
 *    those are already handled by Cycle 12's strict-majority consensus, which
 *    drops sub-majority observations regardless of trust.
 *  - Not a defense against coordinated Sybil swarms — if >=50% of contributing
 *    agents collude on a poisoned weight, the cluster mean IS the poison.
 *    Coalition-resistant variants are out of scope for Cycle 13.
 */

import {
  mergeSocialCausalModels,
  type SocialMergeOptions,
  type SocialMergeResult,
} from './social-causality';
import type { SCMDAG, SCMEdge } from './SCMCompiler';

export interface ByzantineMergeOptions extends SocialMergeOptions {
  /**
   * Standard-deviation threshold for outlier flagging. An agent's edge-weight
   * observation is flagged hostile when it deviates more than `outlierSigma`
   * from the per-edge cluster mean. Default 1.5.
   */
  outlierSigma?: number;
  /**
   * Per-call trust decrement for agents with >=1 hostile observation.
   * Default 0.1 (matches research/2026-02-26_embodied-ai-cycle-13-byzantine-fmarl.md).
   */
  decayPerEpoch?: number;
  /**
   * Trust score below which an agent is dropped from the merge entirely.
   * Default 0.3.
   */
  dropThreshold?: number;
  /**
   * Minimum number of agents that must assert an edge before a std-dev test
   * is meaningful. Edges below this count are skipped (no flag, no decay).
   * Default 3 — n<3 makes population std-dev fragile.
   */
  minClusterAgents?: number;
}

export interface AgentTrustEntry {
  /** Score in [0, 1]. Starts at 1.0, decays in `decayPerEpoch` chunks. */
  score: number;
  /** Total epochs (calls to {@link byzantineResilientMerge}) this agent
   *  has been observed in. */
  epochs: number;
  /** Number of those epochs where the agent had >=1 outlier observation. */
  hostileEpochs: number;
}

export interface ByzantineMergeReport {
  /** All agent IDs the ledger has ever seen, with current scores. */
  ledger: Record<string, AgentTrustEntry>;
  /** Agent IDs dropped from THIS merge for being below `dropThreshold`. */
  dropped: string[];
  /** Agent IDs flagged hostile in THIS merge (>=1 outlier observation). */
  flaggedThisEpoch: string[];
  /** Per-edge outlier diagnostics: { edgeKey -> [agentId, ...] }. */
  outliersByEdge: Record<string, string[]>;
  /** Underlying Cycle-12 consensus report after Byzantine filtering. */
  consensus: SocialMergeResult['report'];
}

export interface ByzantineMergeResult {
  dag: SCMDAG;
  report: ByzantineMergeReport;
}

const DEFAULT_OUTLIER_SIGMA = 1.5;
const DEFAULT_DECAY = 0.1;
const DEFAULT_DROP_THRESHOLD = 0.3;
const DEFAULT_MIN_CLUSTER = 3;

const EDGE_KEY = (e: Pick<SCMEdge, 'source' | 'target' | 'relation'>): string =>
  `${e.source} ${e.target} ${e.relation}`;

/**
 * Stateful trust scores keyed by agent ID. Survives across multiple
 * {@link byzantineResilientMerge} calls so repeated abuse compounds.
 */
export class AgentTrustLedger {
  private readonly entries = new Map<string, AgentTrustEntry>();

  /**
   * Get a snapshot of an agent's trust state. Returns undefined if the
   * agent has never been observed.
   */
  get(agentId: string): AgentTrustEntry | undefined {
    const e = this.entries.get(agentId);
    return e ? { ...e } : undefined;
  }

  /**
   * Get a snapshot of every agent's trust state. Mutating the returned
   * object does NOT mutate the ledger.
   */
  snapshot(): Record<string, AgentTrustEntry> {
    const out: Record<string, AgentTrustEntry> = {};
    for (const [id, e] of this.entries) out[id] = { ...e };
    return out;
  }

  /**
   * Forget an agent's history entirely. Use to pardon an agent that was
   * dropped — see "Recovery semantics" in the file header.
   */
  reset(agentId: string): void {
    this.entries.delete(agentId);
  }

  /** Forget every agent. */
  resetAll(): void {
    this.entries.clear();
  }

  /** @internal — used by {@link byzantineResilientMerge}. */
  observe(agentId: string, hostileThisEpoch: boolean, decay: number): void {
    let e = this.entries.get(agentId);
    if (!e) {
      e = { score: 1.0, epochs: 0, hostileEpochs: 0 };
      this.entries.set(agentId, e);
    }
    e.epochs += 1;
    if (hostileThisEpoch) {
      e.hostileEpochs += 1;
      // Clamp at 0 — score never goes negative.
      e.score = Math.max(0, e.score - decay);
    }
  }

  /** @internal — used by {@link byzantineResilientMerge}. */
  isTrusted(agentId: string, threshold: number): boolean {
    const e = this.entries.get(agentId);
    if (!e) return true; // unknown agents start at 1.0
    return e.score >= threshold;
  }
}

/**
 * Byzantine-resilient wrapper around {@link mergeSocialCausalModels}.
 *
 * Per-call algorithm:
 *  1. Identify each input DAG by `metadata.model_name` (treat that as agentId).
 *     Falls back to a synthetic `agent#<index>` if model_name is missing or
 *     duplicated within the call.
 *  2. For every edge asserted by >= `minClusterAgents` agents, compute the
 *     cluster mean and population std-dev of weights. Mark every observation
 *     more than `outlierSigma` * std-dev from the mean as an outlier.
 *  3. For each agent, decay trust if they had >=1 outlier observation.
 *  4. Drop agents whose post-decay trust is below `dropThreshold`.
 *  5. Re-run {@link mergeSocialCausalModels} on the surviving agent set.
 *
 * The ledger is a required argument (not internal state) so callers can
 * persist trust across processes by serialising / restoring the ledger.
 */
export function byzantineResilientMerge(
  agentDags: SCMDAG[],
  ledger: AgentTrustLedger,
  options: ByzantineMergeOptions = {},
): ByzantineMergeResult {
  const sigma = options.outlierSigma ?? DEFAULT_OUTLIER_SIGMA;
  const decay = options.decayPerEpoch ?? DEFAULT_DECAY;
  const dropThreshold = options.dropThreshold ?? DEFAULT_DROP_THRESHOLD;
  const minCluster = options.minClusterAgents ?? DEFAULT_MIN_CLUSTER;

  if (sigma <= 0) {
    throw new RangeError(`outlierSigma must be > 0; got ${sigma}`);
  }
  if (decay < 0 || decay > 1) {
    throw new RangeError(`decayPerEpoch must be in [0, 1]; got ${decay}`);
  }
  if (dropThreshold < 0 || dropThreshold > 1) {
    throw new RangeError(
      `dropThreshold must be in [0, 1]; got ${dropThreshold}`,
    );
  }
  if (minCluster < 2 || !Number.isInteger(minCluster)) {
    throw new RangeError(
      `minClusterAgents must be an integer >= 2; got ${minCluster}`,
    );
  }

  // Step 1: stable agent IDs.
  const agentIds = new Map<SCMDAG, string>();
  const seenIds = new Set<string>();
  agentDags.forEach((dag, idx) => {
    let id = dag.metadata.model_name?.trim();
    if (!id || seenIds.has(id)) {
      id = `agent#${idx}`;
    }
    seenIds.add(id);
    agentIds.set(dag, id);
  });

  // Step 2: per-edge weight clusters.
  type Observation = { agentId: string; weight: number };
  const edgeObservations = new Map<string, Observation[]>();
  for (const dag of agentDags) {
    const agentId = agentIds.get(dag)!;
    const seenInThisAgent = new Set<string>();
    for (const edge of dag.edges) {
      const key = EDGE_KEY(edge);
      // De-dup intra-agent: only the first observation of a given edge counts
      // (matches Cycle 12's intra-agent de-dup semantics).
      if (seenInThisAgent.has(key)) continue;
      seenInThisAgent.add(key);
      const obs = edgeObservations.get(key) ?? [];
      obs.push({ agentId, weight: edge.weight });
      edgeObservations.set(key, obs);
    }
  }

  // Step 3: outlier detection.
  const outliersByEdge: Record<string, string[]> = {};
  const hostileThisEpoch = new Set<string>();
  for (const [edgeKey, obs] of edgeObservations) {
    if (obs.length < minCluster) continue;
    const mean = obs.reduce((s, o) => s + o.weight, 0) / obs.length;
    const variance =
      obs.reduce((s, o) => s + (o.weight - mean) ** 2, 0) / obs.length;
    const std = Math.sqrt(variance);
    if (std === 0) continue; // perfect agreement; no outliers definable
    const cutoff = sigma * std;
    const outliers: string[] = [];
    for (const o of obs) {
      if (Math.abs(o.weight - mean) > cutoff) {
        outliers.push(o.agentId);
        hostileThisEpoch.add(o.agentId);
      }
    }
    if (outliers.length > 0) outliersByEdge[edgeKey] = outliers;
  }

  // Step 4: ledger update.
  const seenThisEpoch = new Set<string>();
  for (const dag of agentDags) {
    const agentId = agentIds.get(dag)!;
    if (seenThisEpoch.has(agentId)) continue;
    seenThisEpoch.add(agentId);
    ledger.observe(agentId, hostileThisEpoch.has(agentId), decay);
  }

  // Step 5: drop agents below threshold.
  const dropped: string[] = [];
  const survivors: SCMDAG[] = [];
  for (const dag of agentDags) {
    const agentId = agentIds.get(dag)!;
    if (ledger.isTrusted(agentId, dropThreshold)) {
      survivors.push(dag);
    } else {
      dropped.push(agentId);
    }
  }

  // Step 6: delegate consensus to Cycle 12.
  const merged = mergeSocialCausalModels(survivors, options);

  return {
    dag: merged.dag,
    report: {
      ledger: ledger.snapshot(),
      dropped: Array.from(new Set(dropped)),
      flaggedThisEpoch: Array.from(hostileThisEpoch),
      outliersByEdge,
      consensus: merged.report,
    },
  };
}
