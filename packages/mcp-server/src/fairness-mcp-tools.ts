/**
 * HoloScript MCP Fairness Tools
 *
 * Surfaces the verifiable algorithmic-fairness sweep (@holoscript/engine
 * Simulation.runFairnessSweep / runFairnessRobustness) as two MCP tools:
 *
 *   1. `fairness_sweep` — run a transparent linear decision model over a cohort,
 *      emit a sovereign per-decision FairnessReceipt (4/5ths adverse-impact +
 *      demographic-parity + the regulator crosswalk + a replay fingerprint), and
 *      optionally an LHS robustness band (ROBUSTLY-FAIR / -UNFAIR).
 *
 *   2. `explain_fairness_receipt` — verify a receipt's content-hash integrity and
 *      explain it in plain English, rendering the regulator crosswalk.
 *
 * The model exposed here is the examiner-friendly transparent linear scorer
 * (weights + bias + threshold over named features) — the domain bridge swaps in
 * the institution's real model + point-in-time data in production. Core stays
 * domain-free (D.007).
 *
 * @version 1.0.0
 * @package @holoscript/mcp-server
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// Lazy import to avoid breaking tests when @holoscript/engine isn't resolvable.
let _Simulation: typeof import('@holoscript/engine').Simulation | null = null;
async function getSimulation(): Promise<typeof import('@holoscript/engine').Simulation> {
  if (!_Simulation) {
    const mod = await import('@holoscript/engine');
    _Simulation = mod.Simulation;
  }
  return _Simulation;
}

// ── Arg shapes ────────────────────────────────────────────────────────────────

interface CohortRecordArg {
  group: string;
  features: Record<string, number>;
}

interface LinearModelArg {
  id?: string;
  /** Feature weights: contribution += weights[k] * features[k]. */
  weights: Record<string, number>;
  /** Additive bias term. */
  bias?: number;
  /** Approval threshold: approved iff (Σ wₖ·fₖ + bias) ≥ threshold. */
  threshold?: number;
}

interface RobustnessArg {
  replicates?: number;
  driftRange?: [number, number];
  noiseRange?: [number, number];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function validateCohort(cohort: unknown): CohortRecordArg[] {
  if (!Array.isArray(cohort) || cohort.length === 0) {
    throw new Error("fairness_sweep: 'cohort' must be a non-empty array of { group, features }.");
  }
  return cohort.map((r, i) => {
    const rec = r as Partial<CohortRecordArg>;
    if (typeof rec.group !== 'string' || !rec.group) {
      throw new Error(`fairness_sweep: cohort[${i}].group must be a non-empty string.`);
    }
    if (!rec.features || typeof rec.features !== 'object') {
      throw new Error(`fairness_sweep: cohort[${i}].features must be an object of numbers.`);
    }
    for (const [k, v] of Object.entries(rec.features)) {
      if (!isFiniteNumber(v)) {
        throw new Error(`fairness_sweep: cohort[${i}].features.${k} must be a finite number.`);
      }
    }
    return { group: rec.group, features: rec.features as Record<string, number> };
  });
}

function buildLinearModel(spec: unknown): {
  id: string;
  decide(features: Record<string, number>): boolean;
  fingerprint(): unknown;
} {
  const m = spec as Partial<LinearModelArg> | undefined;
  if (!m || !m.weights || typeof m.weights !== 'object') {
    throw new Error("fairness_sweep: 'model.weights' (object of feature→weight) is required.");
  }
  const weights = m.weights;
  for (const [k, v] of Object.entries(weights)) {
    if (!isFiniteNumber(v)) throw new Error(`fairness_sweep: model.weights.${k} must be finite.`);
  }
  const bias = isFiniteNumber(m.bias) ? m.bias : 0;
  const threshold = isFiniteNumber(m.threshold) ? m.threshold : 0;
  const id = typeof m.id === 'string' && m.id ? m.id : 'linear-scorer';
  return {
    id,
    decide: (features) => {
      let score = bias;
      for (const [k, w] of Object.entries(weights)) score += w * (features[k] ?? 0);
      return score >= threshold;
    },
    fingerprint: () => ({ kind: 'linear-scorer.v1', weights, bias, threshold }),
  };
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleFairnessSweep(args: Record<string, unknown>): Promise<unknown> {
  const Sim = await getSimulation();
  const cohort = validateCohort(args.cohort);
  const model = buildLinearModel(args.model);

  const hashMode = args.hashMode === 'sha256' ? 'sha256' : args.hashMode === 'fnv1a' ? 'fnv1a' : undefined;
  const seed = isFiniteNumber(args.seed) ? args.seed : 0;
  const protectedAttribute =
    typeof args.protectedAttribute === 'string' ? args.protectedAttribute : 'group';

  const sweep = await Sim.runFairnessSweep(model, cohort, {
    seed,
    protectedAttribute,
    hashMode,
  });

  const out: Record<string, unknown> = {
    receipt: sweep.receipt,
    metrics: sweep.metrics,
    decision: sweep.receipt.decision,
  };

  if (args.robustness) {
    const rob = (args.robustness === true ? {} : args.robustness) as RobustnessArg;
    const robustness = await Sim.runFairnessRobustness(model, cohort, {
      seed,
      hashMode,
      replicates: isFiniteNumber(rob.replicates) ? rob.replicates : undefined,
      driftRange: Array.isArray(rob.driftRange) ? rob.driftRange : undefined,
      noiseRange: Array.isArray(rob.noiseRange) ? rob.noiseRange : undefined,
    });
    out.robustness = {
      receipt: robustness.receipt,
      band: robustness.band,
      verdict: robustness.verdict,
      ensembleHash: robustness.ensembleHash,
      note:
        'MCP robustness uses the feature-agnostic default perturber (bootstrap + measurement noise). ' +
        'Population-drift modeling for a specific vertical is supplied via the .holo domain bridge.',
    };
  }

  return out;
}

async function handleExplainFairnessReceipt(args: Record<string, unknown>): Promise<unknown> {
  const Sim = await getSimulation();
  const receipt = args.receipt as
    | import('@holoscript/engine').Simulation.FairnessReceipt
    | import('@holoscript/engine').Simulation.FairnessRobustnessReceipt
    | undefined;
  if (!receipt || typeof receipt !== 'object' || !('kind' in receipt)) {
    throw new Error("explain_fairness_receipt: 'receipt' must be a FairnessReceipt object.");
  }

  const integrity = Sim.verifyReceiptIntegrity(receipt);
  const lines: string[] = [];

  if (receipt.kind === 'fairness.receipt.v1') {
    const r = receipt;
    lines.push(`Per-decision fairness receipt for model \`${r.modelId}\`.`);
    lines.push(`Sample size: ${r.sampleSize}; protected attribute: \`${r.protectedAttribute}\`.`);
    lines.push(
      `Adverse-impact ratio (4/5ths): ${r.metrics.adverseImpactRatio} → ${r.decision === 'PASS' ? 'PASS' : 'FLAG (disparate impact)'}.`,
    );
    lines.push(`Demographic-parity diff: ${r.metrics.demographicParityDiff}.`);
    lines.push(
      `Per-group approval: ${Object.entries(r.metrics.approvalRate).map(([g, v]) => `${g}=${v}`).join('  ')}.`,
    );
    lines.push(`Replay fingerprint: ${r.replayFingerprint} (hash mode: ${r.hashMode}).`);
  } else if (receipt.kind === 'fairness.robustness.v1') {
    const r = receipt;
    lines.push(`Robustness receipt for model \`${r.modelId}\` (${r.replicates} LHS replicates).`);
    lines.push(
      `Adverse-impact 90% CI: [${r.robustness.ci90[0]}, ${r.robustness.ci90[1]}], worst-case ${r.robustness.worstCase} → ${r.verdict}.`,
    );
    lines.push(`Ensemble hash: ${r.ensembleHash}; replay fingerprint: ${r.replayFingerprint}.`);
  } else {
    lines.push(`Unrecognized receipt kind: ${(receipt as { kind: string }).kind}.`);
  }

  lines.push('');
  lines.push(
    integrity
      ? '✓ Integrity verified: the receipt content hash matches — untampered.'
      : '✗ Integrity FAILED: the receipt content hash does not match — tampered or corrupted.',
  );
  lines.push('');
  lines.push('Regulator crosswalk (this receipt satisfies, simultaneously):');
  for (const [reg, field] of Object.entries(receipt.regulatoryMapping)) {
    lines.push(`  - ${reg} ← ${field}`);
  }

  return {
    integrity,
    kind: receipt.kind,
    explanation: lines.join('\n'),
    regulatoryMapping: receipt.regulatoryMapping,
  };
}

// ── Dispatcher + name guard ───────────────────────────────────────────────────

const FAIRNESS_TOOL_NAMES = new Set(['fairness_sweep', 'explain_fairness_receipt']);

export function isFairnessToolName(name: string): boolean {
  return FAIRNESS_TOOL_NAMES.has(name);
}

export async function handleFairnessTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown | null> {
  switch (name) {
    case 'fairness_sweep':
      return handleFairnessSweep(args);
    case 'explain_fairness_receipt':
      return handleExplainFairnessReceipt(args);
    default:
      return null;
  }
}

// ── Tool definitions ──────────────────────────────────────────────────────────

export const fairnessTools: Tool[] = [
  {
    name: 'fairness_sweep',
    description:
      'Run a verifiable algorithmic-fairness sweep over a cohort with a transparent linear ' +
      'decision model, and emit a sovereign FairnessReceipt: EEOC 4/5ths adverse-impact ratio, ' +
      'demographic-parity difference, per-group approval rates, a PASS / FLAG-DISPARATE-IMPACT ' +
      'verdict, the EU-AI-Act / Colorado SB21-169 / NAIC / FDA / SR 11-7 regulator crosswalk, and ' +
      'a deterministic replay fingerprint (offline-reproducible by a regulator). Optionally runs an ' +
      'LHS Monte-Carlo robustness band (ROBUSTLY-FAIR / ROBUSTLY-UNFAIR). The model is a stand-in ' +
      "for the institution's real model swapped in via the .holo domain bridge.",
    inputSchema: {
      type: 'object',
      properties: {
        cohort: {
          type: 'array',
          description: 'Records under evaluation. Each: { group, features }.',
          items: {
            type: 'object',
            properties: {
              group: { type: 'string', description: 'Protected-attribute value (e.g. "A" / "B").' },
              features: {
                type: 'object',
                description: 'Feature name → numeric value, consumed by the model.',
                additionalProperties: { type: 'number' },
              },
            },
            required: ['group', 'features'],
          },
        },
        model: {
          type: 'object',
          description: 'Transparent linear scorer: approved iff (Σ wₖ·featureₖ + bias) ≥ threshold.',
          properties: {
            id: { type: 'string', description: 'Model identifier recorded on the receipt.' },
            weights: {
              type: 'object',
              description: 'Feature name → weight.',
              additionalProperties: { type: 'number' },
            },
            bias: { type: 'number', description: 'Additive bias term (default 0).' },
            threshold: { type: 'number', description: 'Approval threshold (default 0).' },
          },
          required: ['weights'],
        },
        protectedAttribute: {
          type: 'string',
          description: 'Label for the protected attribute on the receipt (default "group").',
        },
        seed: { type: 'number', description: 'Replay-key seed recorded on the receipt (default 0).' },
        hashMode: {
          type: 'string',
          enum: ['fnv1a', 'sha256'],
          description: "Hash mode: 'fnv1a' (default, fast) or 'sha256' (adversarial-peer opt-in).",
        },
        robustness: {
          description:
            'If set, also run an LHS robustness band. true for defaults, or { replicates, driftRange, noiseRange }.',
          oneOf: [
            { type: 'boolean' },
            {
              type: 'object',
              properties: {
                replicates: { type: 'number', description: 'LHS replicate count (default 200).' },
                driftRange: {
                  type: 'array',
                  items: { type: 'number' },
                  description: 'Population-drift range [min, max].',
                },
                noiseRange: {
                  type: 'array',
                  items: { type: 'number' },
                  description: 'Measurement-noise range [min, max].',
                },
              },
            },
          ],
        },
      },
      required: ['cohort', 'model'],
    },
  },
  {
    name: 'explain_fairness_receipt',
    description:
      'Verify a FairnessReceipt (or FairnessRobustnessReceipt) content-hash integrity and explain ' +
      'it in plain English, rendering the regulator crosswalk. Returns integrity:true only when the ' +
      'receipt is byte-identical to issuance (tamper detection).',
    inputSchema: {
      type: 'object',
      properties: {
        receipt: {
          type: 'object',
          description: 'A FairnessReceipt or FairnessRobustnessReceipt as returned by fairness_sweep.',
        },
      },
      required: ['receipt'],
    },
  },
];
