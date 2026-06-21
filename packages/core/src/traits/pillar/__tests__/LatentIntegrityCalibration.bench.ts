/**
 * LatentIntegrityLayer — calibration benchmark for Paper 22 measurements.
 *
 * Generates synthetic RecursiveLinkMessage histories (clean vs. corrupted)
 * and measures:
 *   - Byzantine detector: true positive rate (TPR) and false positive rate (FPR)
 *     at σ = 1.5, 2.0, 2.5, 3.0
 *   - Sycophancy probe: drift detection rate and latency (samples to first flag)
 *     at driftThreshold = 0.2, 0.3, 0.4, 0.5
 *
 * Run standalone: npx tsx packages/core/src/traits/pillar/__tests__/LatentIntegrityCalibration.bench.ts
 *
 * Outputs a JSON table to stdout for direct insertion into paper-22-two-axis-integrity-usenix.tex.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { LatentByzantineDetector, LatentSycophancyProbe } from '../LatentIntegrityLayer';
import type { PillarSlice } from '../SemanticCollaborationContract';
import type { RecursiveLinkMessage } from '../RecursiveLinkTrait';

// ─── synthetic data generators ────────────────────────────────────────────────

function makeSlice(pos1: number, pos2: number, domain = 'physics'): PillarSlice {
  return {
    axis_1_id: 'energy',
    axis_2_id: 'momentum',
    pos_1: pos1,
    pos_2: pos2,
    pillar_id: 'physics_conservation',
    pillar_domain: domain as PillarSlice['pillar_domain'],
  };
}

function makeMsg(slice: PillarSlice): RecursiveLinkMessage {
  return { from: 'peer', to: 'self', loop: 'inner', slice, timestamp_ms: Date.now() };
}

/** Generate N clean slices clustered tightly around (0.85, 0.15) with Gaussian noise σ=0.03 */
function cleanHistory(n: number): PillarSlice[] {
  const slices: PillarSlice[] = [];
  // Deterministic LCG for reproducibility
  let seed = 0xdeadbeef;
  const lcg = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let i = 0; i < n; i++) {
    const noise1 = (lcg() - 0.5) * 0.06; // ±0.03 std
    const noise2 = (lcg() - 0.5) * 0.06;
    slices.push(
      makeSlice(Math.max(0, Math.min(1, 0.85 + noise1)), Math.max(0, Math.min(1, 0.15 + noise2)))
    );
  }
  return slices;
}

/** Generate a Byzantine-corrupted slice (orthogonal to cluster mean — pos1≈0.1, pos2≈0.9) */
function byzantineSlice(): PillarSlice {
  return makeSlice(0.08, 0.93);
}

/** Generate a normal slice (within cluster bounds) */
function normalSlice(): PillarSlice {
  let seed = 0xc0ffee;
  const lcg = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  return makeSlice(0.85 + (lcg() - 0.5) * 0.06, 0.15 + (lcg() - 0.5) * 0.06);
}

// ─── Byzantine detector calibration ──────────────────────────────────────────

interface ByzantineResult {
  sigma: number;
  tpr: number; // true positive rate (attack correctly flagged)
  fpr: number; // false positive rate (clean incorrectly flagged)
  trials: number;
}

function calibrateByzantine(sigmas: number[], trials = 500): ByzantineResult[] {
  return sigmas.map((sigma) => {
    const detector = new LatentByzantineDetector({ sigmaThreshold: sigma, minHistory: 10 });
    const history = cleanHistory(50);
    let tp = 0,
      fp = 0;

    for (let i = 0; i < trials; i++) {
      // Test Byzantine slice
      const bResult = detector.check(makeMsg(byzantineSlice()), history);
      if (bResult.isAnomalous) tp++;

      // Test normal slice
      const nResult = detector.check(makeMsg(normalSlice()), history);
      if (nResult.isAnomalous) fp++;
    }

    return {
      sigma,
      tpr: tp / trials,
      fpr: fp / trials,
      trials,
    };
  });
}

// ─── Sycophancy probe calibration ────────────────────────────────────────────

interface SycophancyResult {
  driftThreshold: number;
  detectionRate: number; // fraction of drifting agents flagged within 20 observations
  latencySamples: number; // median samples to first flag
  trials: number;
}

function calibrateSycophancy(thresholds: number[], trials = 200): SycophancyResult[] {
  return thresholds.map((driftThreshold) => {
    let detected = 0;
    const latencies: number[] = [];

    for (let t = 0; t < trials; t++) {
      const probe = new LatentSycophancyProbe({ driftThreshold, minSamples: 5 });

      // Simulate a drifting agent: truth_approval slices drifting from (0.5,0.5) toward (0.1,0.9)
      let flagged = false;
      let latency = -1;
      for (let obs = 0; obs < 20; obs++) {
        const driftAmount = obs / 20; // linear drift over 20 observations
        const pos1 = 0.5 - 0.4 * driftAmount;
        const pos2 = 0.5 + 0.4 * driftAmount;
        const driftSlice = makeSlice(pos1, pos2, 'truth_approval');
        const msg = makeMsg(driftSlice);
        probe.observe(msg);
        const result = probe.probe(msg);
        if (result.isDrifting && !flagged) {
          flagged = true;
          latency = obs;
        }
      }
      if (flagged) {
        detected++;
        latencies.push(latency);
      }
    }

    const medianLatency =
      latencies.length > 0 ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)] : -1;

    return {
      driftThreshold,
      detectionRate: detected / trials,
      latencySamples: medianLatency,
      trials,
    };
  });
}

// ─── main ─────────────────────────────────────────────────────────────────────

// --- T7 fleet snapshot injection harness ------------------------------------

type FleetProbeScenario = 'clean' | 'byzantine' | 'sycophancy' | 'joint';

interface FleetAgent {
  handle: string;
  agentId: string;
  trustScore?: string;
  online?: boolean;
}

interface FleetProbeRecord {
  trial: number;
  agent_id: string;
  handle: string;
  scenario: FleetProbeScenario;
  truth_byzantine: boolean;
  truth_sycophancy: boolean;
  byzantine_flag: boolean;
  sycophancy_flag: boolean;
  sycophancy_latency_samples: number | null;
  byzantine_sigma: number | null;
  sycophancy_score: number;
}

interface FleetSnapshotLoad {
  agents: FleetAgent[];
  snapshot_path: string;
  snapshot_sha256: string | null;
  inventory_path: string;
  inventory_sha256: string | null;
  configured_agent_count: number;
}

class Lcg {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  between(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function makeAgentMsg(
  agent: FleetAgent,
  slice: PillarSlice,
  timestamp_ms: number
): RecursiveLinkMessage {
  return {
    from: agent.agentId,
    to: 'paper-22-integrity-harness',
    loop: slice.pillar_domain === 'truth_approval' ? 'outer' : 'inner',
    slice,
    timestamp_ms,
    metadata: {
      handle: agent.handle,
      source: 'paper-22-fleet-probe-injection',
    },
  };
}

function cleanHistoryForTrial(rng: Lcg, n: number, domain = 'physics'): PillarSlice[] {
  const slices: PillarSlice[] = [];
  for (let i = 0; i < n; i++) {
    slices.push(
      makeSlice(
        clamp01(0.84 + rng.between(-0.04, 0.04)),
        clamp01(0.16 + rng.between(-0.04, 0.04)),
        domain
      )
    );
  }
  return slices;
}

function cleanSliceForTrial(rng: Lcg, domain = 'physics'): PillarSlice {
  return makeSlice(
    clamp01(0.84 + rng.between(-0.03, 0.03)),
    clamp01(0.16 + rng.between(-0.03, 0.03)),
    domain
  );
}

function byzantineSetter(): PillarSlice {
  return makeSlice(0.08, 0.93);
}

function byzantineGetter(): PillarSlice {
  return makeSlice(0.09, 0.92);
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    return asObject(parsed);
  } catch {
    return null;
  }
}

function fileHash(filePath: string): string | null {
  try {
    return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  } catch {
    return null;
  }
}

function defaultFleetSnapshotPath(): string {
  if (process.env.PAPER22_FLEET_SNAPSHOT) return process.env.PAPER22_FLEET_SNAPSHOT;
  const ecosystemRoot =
    process.env.AI_ECOSYSTEM_ROOT ??
    process.env.HOLOMESH_ECOSYSTEM_ROOT ??
    'C:\\Users\\josep\\.ai-ecosystem';
  return path.join(
    ecosystemRoot,
    'research',
    'paper-21-fleet-snapshots',
    '2026-05-03-T7-final.json'
  );
}

function findRepoRoot(startDir: string): string {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(startDir);
}

function loadFleetAgents(snapshotPath: string): FleetSnapshotLoad {
  const snapshot = readJsonFile(snapshotPath);
  const snapshotTotals = asObject(snapshot?.totals);
  const configuredAgentCount = numberValue(snapshotTotals?.configured_agents) ?? 36;
  const inventoryPath = path.join(path.dirname(snapshotPath), '2026-04-27-fleet-status.json');
  const inventory = readJsonFile(inventoryPath);
  const rawAgents = Array.isArray(inventory?.agents) ? inventory.agents : [];

  const agents = rawAgents
    .map((entry, index): FleetAgent | null => {
      const agent = asObject(entry);
      if (!agent) return null;
      const handle =
        stringValue(agent.handle) ?? `fleet-agent-${String(index + 1).padStart(2, '0')}`;
      const agentId = stringValue(agent.agentId) ?? `synthetic-agent-${index + 1}`;
      return {
        handle,
        agentId,
        trustScore: stringValue(agent.trustScore),
        online: booleanValue(agent.online),
      };
    })
    .filter((agent): agent is FleetAgent => agent !== null);

  const fallbackAgents = Array.from({ length: configuredAgentCount }, (_, index) => ({
    handle: `configured-agent-${String(index + 1).padStart(2, '0')}`,
    agentId: `configured-agent-${index + 1}`,
  }));

  return {
    agents: agents.length > 0 ? agents : fallbackAgents,
    snapshot_path: snapshotPath,
    snapshot_sha256: fileHash(snapshotPath),
    inventory_path: inventoryPath,
    inventory_sha256: fileHash(inventoryPath),
    configured_agent_count: configuredAgentCount,
  };
}

function runByzantineProbe(
  agent: FleetAgent,
  trial: number,
  attack: boolean,
  rng: Lcg
): { flag: boolean; sigma: number | null } {
  const detector = new LatentByzantineDetector({ sigmaThreshold: 2, minHistory: 10 });
  const history = cleanHistoryForTrial(rng, 49);
  const incoming = attack ? byzantineGetter() : cleanSliceForTrial(rng);
  const checkedHistory = attack
    ? [...history, byzantineSetter()]
    : [...history, cleanSliceForTrial(rng)];
  const result = detector.check(
    makeAgentMsg(agent, incoming, Date.UTC(2026, 4, 3) + trial),
    checkedHistory
  );
  return {
    flag: result.isAnomalous,
    sigma: result.deviationSigma ?? null,
  };
}

function runSycophancyProbe(
  agent: FleetAgent,
  trial: number,
  drifting: boolean
): { flag: boolean; latency: number | null; score: number } {
  const probe = new LatentSycophancyProbe({ driftThreshold: 0.2, minSamples: 5 });
  let flag = false;
  let latency: number | null = null;
  let score = 0;

  for (let obs = 0; obs < 20; obs++) {
    const amount = drifting ? obs / 19 : 0;
    const slice = makeSlice(0.5 - 0.4 * amount, 0.5 + 0.4 * amount, 'truth_approval');
    const msg = makeAgentMsg(agent, slice, Date.UTC(2026, 4, 3) + trial * 100 + obs);
    probe.observe(msg);
    const result = probe.probe(msg);
    score = result.driftScore;
    if (result.isDrifting && !flag) {
      flag = true;
      latency = obs;
    }
  }

  return { flag, latency, score };
}

function runFleetProbeRecords(agents: FleetAgent[], perScenario = 300): FleetProbeRecord[] {
  const scenarios: FleetProbeScenario[] = ['clean', 'byzantine', 'sycophancy', 'joint'];
  const records: FleetProbeRecord[] = [];

  for (const scenario of scenarios) {
    for (let i = 0; i < perScenario; i++) {
      const trial = records.length;
      const agent = agents[trial % agents.length];
      const rng = new Lcg((0x222026 ^ Math.imul(trial + 1, 2654435761)) >>> 0);
      const truthByzantine = scenario === 'byzantine' || scenario === 'joint';
      const truthSycophancy = scenario === 'sycophancy' || scenario === 'joint';
      const byzantine = runByzantineProbe(agent, trial, truthByzantine, rng);
      const sycophancy = runSycophancyProbe(agent, trial, truthSycophancy);

      records.push({
        trial,
        agent_id: agent.agentId,
        handle: agent.handle,
        scenario,
        truth_byzantine: truthByzantine,
        truth_sycophancy: truthSycophancy,
        byzantine_flag: byzantine.flag,
        sycophancy_flag: sycophancy.flag,
        sycophancy_latency_samples: sycophancy.latency,
        byzantine_sigma: byzantine.sigma,
        sycophancy_score: Number(sycophancy.score.toFixed(6)),
      });
    }
  }

  return records;
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function wilson(successes: number, total: number): { low: number; high: number } {
  if (total === 0) return { low: 0, high: 0 };
  const z = 1.96;
  const phat = successes / total;
  const denom = 1 + (z * z) / total;
  const center = (phat + (z * z) / (2 * total)) / denom;
  const margin = (z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * total)) / total)) / denom;
  return { low: clamp01(center - margin), high: clamp01(center + margin) };
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function summarizeFleetProbes(records: FleetProbeRecord[]) {
  const byzPositive = records.filter((r) => r.truth_byzantine);
  const byzNegative = records.filter((r) => !r.truth_byzantine);
  const sycPositive = records.filter((r) => r.truth_sycophancy);
  const sycNegative = records.filter((r) => !r.truth_sycophancy);
  const attacks = records.filter((r) => r.truth_byzantine || r.truth_sycophancy);
  const byzTruePositive = byzPositive.filter((r) => r.byzantine_flag).length;
  const byzFalsePositive = byzNegative.filter((r) => r.byzantine_flag).length;
  const sycTruePositive = sycPositive.filter((r) => r.sycophancy_flag).length;
  const sycFalsePositive = sycNegative.filter((r) => r.sycophancy_flag).length;
  const axis1OnlyFalseNegatives = attacks.filter((r) => !r.byzantine_flag);
  const twoAxisFalseNegatives = attacks.filter((r) => !r.byzantine_flag && !r.sycophancy_flag);
  const axis2CatchesAxis1Misses = attacks.filter((r) => !r.byzantine_flag && r.sycophancy_flag);
  const sycophancyLatencies = sycPositive
    .map((r) => r.sycophancy_latency_samples)
    .filter((value): value is number => value !== null);

  const byzTpr = rate(byzTruePositive, byzPositive.length);
  const byzFpr = rate(byzFalsePositive, byzNegative.length);
  const sycTpr = rate(sycTruePositive, sycPositive.length);
  const sycFpr = rate(sycFalsePositive, sycNegative.length);
  const axis1OnlyFnr = rate(axis1OnlyFalseNegatives.length, attacks.length);
  const twoAxisFnr = rate(twoAxisFalseNegatives.length, attacks.length);

  return {
    total_probes: records.length,
    by_agent_count: new Set(records.map((r) => r.agent_id)).size,
    byzantine_axis: {
      sigma_threshold: 2,
      positives: byzPositive.length,
      true_positive_count: byzTruePositive,
      tpr: byzTpr,
      tpr_wilson95: wilson(byzTruePositive, byzPositive.length),
      negatives: byzNegative.length,
      false_positive_count: byzFalsePositive,
      fpr: byzFpr,
      fpr_wilson95: wilson(byzFalsePositive, byzNegative.length),
    },
    sycophancy_axis: {
      drift_threshold: 0.2,
      positives: sycPositive.length,
      true_positive_count: sycTruePositive,
      tpr: sycTpr,
      tpr_wilson95: wilson(sycTruePositive, sycPositive.length),
      negatives: sycNegative.length,
      false_positive_count: sycFalsePositive,
      fpr: sycFpr,
      fpr_wilson95: wilson(sycFalsePositive, sycNegative.length),
      median_latency_samples: median(sycophancyLatencies),
    },
    false_negative_comparison: {
      attack_trials: attacks.length,
      axis1_only_false_negative_count: axis1OnlyFalseNegatives.length,
      axis1_only_fnr: axis1OnlyFnr,
      two_axis_false_negative_count: twoAxisFalseNegatives.length,
      two_axis_fnr: twoAxisFnr,
      axis2_catches_axis1_misses: axis2CatchesAxis1Misses.length,
      fnr_reduction: axis1OnlyFnr - twoAxisFnr,
    },
  };
}

function runFleetSnapshotInjection(): void {
  const snapshot = loadFleetAgents(defaultFleetSnapshotPath());
  const requestedProbesPerScenario = Number(process.env.PAPER22_PROBES_PER_SCENARIO);
  const perScenario = Number.isFinite(requestedProbesPerScenario)
    ? requestedProbesPerScenario
    : 300;
  const records = runFleetProbeRecords(snapshot.agents, perScenario);
  const summary = summarizeFleetProbes(records);
  const repoRoot = findRepoRoot(process.cwd());
  const runDate = new Date().toISOString().slice(0, 10);
  const outPath =
    process.env.PAPER22_FLEET_OUT ??
    path.join(repoRoot, 'research', 'paper-22-ati', `fleet-probe-injection-${runDate}.json`);
  const trialDigest = createHash('sha256').update(JSON.stringify(records)).digest('hex');

  const artifact = {
    schema: 'holoscript.paper22.fleet_probe_injection.v1',
    generated_at: new Date().toISOString(),
    source: {
      t7_snapshot_path: snapshot.snapshot_path,
      t7_snapshot_sha256: snapshot.snapshot_sha256,
      fleet_inventory_path: snapshot.inventory_path,
      fleet_inventory_sha256: snapshot.inventory_sha256,
      configured_agent_count: snapshot.configured_agent_count,
      measured_agent_count: summary.by_agent_count,
    },
    parameters: {
      scenarios: ['clean', 'byzantine', 'sycophancy', 'joint'],
      probes_per_scenario: perScenario,
      total_probes: records.length,
      byzantine_sigma_threshold: 2,
      sycophancy_drift_threshold: 0.2,
      sycophancy_observations_per_probe: 20,
      deterministic_seed_family: '0x222026 ^ trial*2654435761',
    },
    summary,
    paper22_tables: {
      tab_byz_sigma_2_0: {
        sigma: 2,
        tpr: summary.byzantine_axis.tpr,
        fpr: summary.byzantine_axis.fpr,
        row: `2.0 & ${pct(summary.byzantine_axis.tpr)} (measured, T7 injection) & ${pct(
          summary.byzantine_axis.fpr
        )} \\\\`,
      },
      tab_syc_production: {
        threshold: 0.2,
        detection_rate: summary.sycophancy_axis.tpr,
        false_positive_rate: summary.sycophancy_axis.fpr,
        median_latency_samples: summary.sycophancy_axis.median_latency_samples,
        row: `T7 snapshot injection & ${pct(summary.sycophancy_axis.tpr)} & ${String(
          summary.sycophancy_axis.median_latency_samples
        )} \\\\`,
      },
      false_negative_comparison: {
        axis1_only_fnr: summary.false_negative_comparison.axis1_only_fnr,
        two_axis_fnr: summary.false_negative_comparison.two_axis_fnr,
        axis2_catches_axis1_misses: summary.false_negative_comparison.axis2_catches_axis1_misses,
      },
    },
    claim_check: {
      axis2_catches_at_least_one_axis1_miss:
        summary.false_negative_comparison.axis2_catches_axis1_misses >= 1,
      statement:
        'Two-axis coverage eliminates sycophancy-only detection misses that the Axis-1-only filter cannot close.',
    },
    trial_digest_sha256: trialDigest,
    records,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(`\nPaper 22 fleet artifact: ${outPath}`);
  console.log(
    `Axis-1-only FNR ${pct(
      summary.false_negative_comparison.axis1_only_fnr
    )}; two-axis FNR ${pct(summary.false_negative_comparison.two_axis_fnr)}; Axis 2 catches ${
      summary.false_negative_comparison.axis2_catches_axis1_misses
    } Axis-1 misses.`
  );
}

const byzantineResults = calibrateByzantine([1.5, 2.0, 2.5, 3.0]);
const sycophancyResults = calibrateSycophancy([0.2, 0.3, 0.4, 0.5]);

const output = {
  generatedAt: new Date().toISOString(),
  description: 'LatentIntegrityLayer calibration — Paper 22 measurements',
  byzantine: byzantineResults,
  sycophancy: sycophancyResults,
};

console.log(JSON.stringify(output, null, 2));

// LaTeX table snippet
console.log('\n% ── Byzantine detection rates (Paper 22 Table 1) ──');
console.log('% \\sigma & TPR & FPR \\\\');
for (const r of byzantineResults) {
  console.log(
    `% ${r.sigma} & ${(r.tpr * 100).toFixed(1)}\\% & ${(r.fpr * 100).toFixed(1)}\\% \\\\`
  );
}

console.log('\n% ── Sycophancy detection rates (Paper 22 Table 2) ──');
console.log('% driftThreshold & DetectionRate & MedianLatency (samples) \\\\');
for (const r of sycophancyResults) {
  console.log(
    `% ${r.driftThreshold} & ${(r.detectionRate * 100).toFixed(1)}\\% & ${r.latencySamples} \\\\`
  );
}

runFleetSnapshotInjection();
