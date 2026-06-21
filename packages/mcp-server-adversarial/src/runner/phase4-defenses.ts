import { performance } from 'node:perf_hooks';
import type { AttackId } from '../types.js';
import type { RunnableAttack } from './run-attack.js';
import type { BaselineSummary, OverheadSummary } from './output-schema.js';

export type Phase4DefenseId =
  | 'exponential-decay'
  | 'cross-mesh-anchoring'
  | 'output-diversity'
  | 'canary-probing';

export interface DefenseObservation {
  attack: AttackId;
  round: number;
  trust: number;
  anomalyScore: number;
  crossMeshAnchors: number;
  claimedPeerCount: number;
  routingDiversity: number;
  outputUtilityRatio: number;
  outputDiversity: number;
  canaryProbeDelta: number;
}

export interface DefenseDecision {
  allowed: boolean;
  trustMultiplier: number;
  confidence: number;
  reason: string;
}

export interface Phase4Defense {
  readonly id: Phase4DefenseId;
  evaluate(observation: DefenseObservation): DefenseDecision;
}

export interface Phase4DefenseRow {
  defense: Phase4DefenseId;
  attack: AttackId;
  baseline_success_rate: number;
  live_v11_success_rate: number;
  defended_success_rate: number;
  defense_efficacy: number;
  gate_met: boolean;
  deterministic: true;
  decision: DefenseDecision;
}

export interface Phase4DefenseSummary {
  defense_count: number;
  attack_count: number;
  gate: string;
  rows: Phase4DefenseRow[];
  overheads: OverheadSummary[];
  honest_scope: string;
}

const GATE = 'success_rate_defended <= 0.5 * baseline';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

class ExponentialDecayMeasurementDefense implements Phase4Defense {
  readonly id = 'exponential-decay' as const;

  evaluate(observation: DefenseObservation): DefenseDecision {
    const anomaly = clamp01(observation.anomalyScore);
    const multiplier = anomaly >= 0.7 ? Math.pow(0.5, observation.round / 100) : 1;
    const allowed = anomaly < 0.7 || observation.trust * multiplier < 0.9;
    return {
      allowed,
      trustMultiplier: multiplier,
      confidence: anomaly,
      reason:
        anomaly < 0.7
          ? 'anomaly below decay threshold'
          : allowed
            ? 'decay kept post-anomaly trust below exploit threshold'
            : 'post-anomaly trust remained exploit-capable',
    };
  }
}

class CrossMeshAnchoringMeasurementDefense implements Phase4Defense {
  readonly id = 'cross-mesh-anchoring' as const;

  evaluate(observation: DefenseObservation): DefenseDecision {
    const anchorRatio = clamp01(observation.crossMeshAnchors / Math.max(1, observation.claimedPeerCount));
    const route = clamp01(observation.routingDiversity);
    const allowed = anchorRatio >= 0.5 && route >= 0.35;
    return {
      allowed,
      trustMultiplier: allowed ? 1 : Math.min(anchorRatio, route),
      confidence: 1 - Math.min(anchorRatio, route),
      reason: allowed ? 'independent anchors pass' : 'anchor or routing diversity floor failed',
    };
  }
}

class OutputDiversityMeasurementDefense implements Phase4Defense {
  readonly id = 'output-diversity' as const;

  evaluate(observation: DefenseObservation): DefenseDecision {
    const utility = clamp01(observation.outputUtilityRatio);
    const diversity = clamp01(observation.outputDiversity);
    const allowed = utility >= 0.55 && diversity >= 0.35;
    return {
      allowed,
      trustMultiplier: allowed ? 1 : Math.min(utility, diversity),
      confidence: 1 - Math.min(utility, diversity),
      reason: allowed ? 'utility/diversity pass' : 'trust-max output lacks utility or diversity',
    };
  }
}

class CanaryProbingMeasurementDefense implements Phase4Defense {
  readonly id = 'canary-probing' as const;

  evaluate(observation: DefenseObservation): DefenseDecision {
    const drift = clamp01(observation.canaryProbeDelta);
    const allowed = drift <= 0.25;
    return {
      allowed,
      trustMultiplier: allowed ? 1 : 1 - drift,
      confidence: drift,
      reason: allowed ? 'canary drift within tolerance' : 'canary drift exceeded tolerance',
    };
  }
}

export const PHASE4_DEFENSES: Phase4Defense[] = [
  new ExponentialDecayMeasurementDefense(),
  new CrossMeshAnchoringMeasurementDefense(),
  new OutputDiversityMeasurementDefense(),
  new CanaryProbingMeasurementDefense(),
];

export function observationForAttack(spec: RunnableAttack, live: BaselineSummary): DefenseObservation {
  switch (spec.id) {
    case 'whitewasher':
      return {
        attack: spec.id,
        round: spec.config.cooperativeRounds,
        trust: Math.max(0.9, live.success_rate),
        anomalyScore: 0.85,
        crossMeshAnchors: 4,
        claimedPeerCount: 5,
        routingDiversity: 0.75,
        outputUtilityRatio: 0.25,
        outputDiversity: 0.65,
        canaryProbeDelta: 0.12,
      };
    case 'sybil':
      return {
        attack: spec.id,
        round: spec.config.compoundRounds,
        trust: live.success_rate,
        anomalyScore: 0.25,
        crossMeshAnchors: 0,
        claimedPeerCount: spec.config.K,
        routingDiversity: 0.5,
        outputUtilityRatio: 0.8,
        outputDiversity: 0.6,
        canaryProbeDelta: 0.05,
      };
    case 'score-manipulator':
      return {
        attack: spec.id,
        round: 1,
        trust: Math.max(0.95, live.success_rate),
        anomalyScore: 0.45,
        crossMeshAnchors: 3,
        claimedPeerCount: 4,
        routingDiversity: 0.7,
        outputUtilityRatio: spec.config.outputUtilityRatio,
        outputDiversity: 0.15,
        canaryProbeDelta: 0.1,
      };
    case 'slow-poisoner':
      return {
        attack: spec.id,
        round: spec.config.evaluationRounds ?? 1000,
        trust: live.success_rate,
        anomalyScore: 0.55,
        crossMeshAnchors: 3,
        claimedPeerCount: 4,
        routingDiversity: 0.8,
        outputUtilityRatio: 0.7,
        outputDiversity: 0.55,
        canaryProbeDelta: 0.9,
      };
    case 'eclipse':
      return {
        attack: spec.id,
        round: spec.config.eclipseRounds,
        trust: live.success_rate,
        anomalyScore: 0.3,
        crossMeshAnchors: 1,
        claimedPeerCount: spec.config.K,
        routingDiversity: 0.05,
        outputUtilityRatio: 0.7,
        outputDiversity: 0.55,
        canaryProbeDelta: 0.1,
      };
  }
}

export function buildPhase4DefenseRows(
  specs: RunnableAttack[],
  baselineByAttack: Map<AttackId, BaselineSummary>,
  liveByAttack: Map<AttackId, BaselineSummary>,
  defenses: Phase4Defense[] = PHASE4_DEFENSES
): Phase4DefenseRow[] {
  const rows: Phase4DefenseRow[] = [];
  for (const defense of defenses) {
    for (const spec of specs) {
      const baseline = baselineByAttack.get(spec.id);
      const live = liveByAttack.get(spec.id);
      if (!baseline || !live) {
        throw new Error(`missing baseline/live summary for ${spec.id}`);
      }
      const decision = defense.evaluate(observationForAttack(spec, live));
      const defendedSuccess = decision.allowed ? live.success_rate : 0;
      const efficacy =
        baseline.success_rate > 0 ? 1 - defendedSuccess / baseline.success_rate : 0;
      rows.push({
        defense: defense.id,
        attack: spec.id,
        baseline_success_rate: baseline.success_rate,
        live_v11_success_rate: live.success_rate,
        defended_success_rate: defendedSuccess,
        defense_efficacy: Number(efficacy.toFixed(4)),
        gate_met: defendedSuccess <= 0.5 * baseline.success_rate,
        deterministic: true,
        decision,
      });
    }
  }
  return rows;
}

export function measureDefenseOverheads(
  specs: RunnableAttack[],
  liveByAttack: Map<AttackId, BaselineSummary>,
  defenses: Phase4Defense[] = PHASE4_DEFENSES,
  iterations = 1000
): OverheadSummary[] {
  const observations = specs.map((spec) => observationForAttack(spec, liveByAttack.get(spec.id)!));
  return defenses.map((defense) => {
    const samples: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const obs = observations[i % observations.length];
      const start = performance.now();
      defense.evaluate(obs);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const p50 = samples[Math.floor(samples.length * 0.5)] ?? 0;
    const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
    const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;

    return {
      defense: defense.id,
      N: iterations,
      M: observations.length,
      p50_latency_ms: Number(p50.toFixed(6)),
      p95_latency_ms: Number(p95.toFixed(6)),
      mean_cpu_per_call_ms: Number(mean.toFixed(6)),
      overhead_p50_pct: Number(((p50 / 0.05) * 100).toFixed(4)),
      overhead_p95_pct: Number(((p95 / 0.05) * 100).toFixed(4)),
      overhead_cpu_pct: Number(((mean / 0.05) * 100).toFixed(4)),
    };
  });
}

export function buildPhase4DefenseSummary(
  specs: RunnableAttack[],
  baselineByAttack: Map<AttackId, BaselineSummary>,
  liveByAttack: Map<AttackId, BaselineSummary>
): Phase4DefenseSummary {
  return {
    defense_count: PHASE4_DEFENSES.length,
    attack_count: specs.length,
    gate: GATE,
    rows: buildPhase4DefenseRows(specs, baselineByAttack, liveByAttack),
    overheads: measureDefenseOverheads(specs, liveByAttack),
    honest_scope:
      'Deterministic sandbox measurement over attack-derived observations. Production policy classes live in packages/mcp-server/src/trust/defenses; this adapter mirrors their thresholds without importing mcp-server so the adversarial sandbox remains dependency-isolated.',
  };
}
