/**
 * POST /api/fairness/sweep
 *
 * Run a verifiable algorithmic-fairness sweep IN-PROCESS through the real
 * @holoscript/engine FairnessSweep (Simulation.runFairnessSweep /
 * runFairnessRobustness) and return the sovereign FairnessReceipt + a derived
 * gate ledger. This is the server side of the /operations "Fairness" tab —
 * mirroring POST /api/simulation/run (in-process engine solver) and
 * POST /api/game/compile (in-process @holoscript work → {artifact, report, gates}).
 *
 * D.057 (regulated verifiable orchestration — "the receipt IS the product"):
 * the FairnessReceipt is the deliverable. This route surfaces it so the receipt
 * is perceivable (F.099 show-don't-reference) instead of buried behind the
 * fairness_sweep MCP tool with no Studio surface.
 *
 * The decision model exposed here is the examiner-friendly transparent linear
 * scorer (weights + bias + threshold over named features) — the SAME model the
 * fairness_sweep MCP tool builds (packages/mcp-server/src/fairness-mcp-tools.ts
 * buildLinearModel). In production the `.holo` domain bridge swaps in the
 * institution's real model + point-in-time data; core stays domain-free (D.007).
 *
 * Request body (JSON):
 *   {
 *     scenario?: 'fair' | 'disparate-impact'   — curated examiner cohort+model (default 'disparate-impact')
 *     // OR a fully custom sweep:
 *     cohort?:   Array<{ group: string; features: Record<string, number> }>
 *     model?:    { id?: string; weights: Record<string, number>; bias?: number; threshold?: number }
 *     seed?:               number               — replay-key seed (default 0)
 *     protectedAttribute?: string               — recorded on the receipt (default 'group')
 *     hashMode?:           'fnv1a' | 'sha256'   — receipt hash chokepoint (default engine default = fnv1a)
 *     verifyDeterminism?:  boolean              — double-run the model; auto-downgrade an over-claimed grade (default true)
 *     robustness?:         boolean | { replicates?: number; driftRange?: [number,number]; noiseRange?: [number,number] }
 *   }
 *
 * Response 200 (JSON):
 *   {
 *     receipt:    FairnessReceipt,              — the sovereign per-decision receipt
 *     metrics:    FairnessMetrics,              — approvalRate / adverseImpactRatio / demographicParityDiff / fourFifthsPass
 *     decision:   'PASS' | 'FLAG-DISPARATE-IMPACT',
 *     replayDeterminism: 'exact' | 'quantized' | 'statistical',
 *     robustness?: { receipt: FairnessRobustnessReceipt; band; verdict },
 *     gates:      FairnessGate[],               — verify-card ledger (integrity + 4/5ths + determinism + robustness)
 *     runReport:  { modelId; sampleSize; groups; replicates; hashMode; wallMs },
 *   }
 *
 * Response 400: { error: string }
 *
 * Engine loading: same webpackIgnore pattern as /api/simulation/run — engine is
 * aliased to an empty stub in webpack (next.config.js) and must never reach the
 * client bundle, so Node resolves the REAL package at request time.
 *
 * SAFETY: pure CPU compute (no spend, no fleet, no network). Cohort + replicates
 * are clamped so a browser caller can't drive an unbounded sweep.
 */

import { NextRequest, NextResponse } from 'next/server';

// Type-only engine imports (erased at compile time — the real module is loaded
// at request time via the webpackIgnore dynamic import below).
import type * as EngineNS from '@holoscript/engine';
import type {
  FairnessRecord,
  FairnessModel,
  FairnessReceipt,
  FairnessRobustnessReceipt,
  FairnessMetrics,
  RobustnessBand,
} from '@holoscript/engine/simulation';

// ── Safety limits (enforced, not advisory) ──────────────────────────────────────

const MAX_COHORT = 5000; // a browser caller can't drive an unbounded sweep
const MAX_REPLICATES = 500; // robustness LHS replicate cap
const MAX_FEATURES = 32;

// ── Engine loader (same pattern as /api/simulation/run) ─────────────────────────

/**
 * Load @holoscript/engine at runtime, bypassing webpack. next.config.js aliases
 * '@holoscript/engine' to an empty stub for the client graph; the webpackIgnore
 * comment makes Node resolve the real package at request time. Identical to
 * packages/studio/src/app/api/simulation/run/route.ts.
 */
async function loadEngine(): Promise<typeof EngineNS> {
  return (await import(/* webpackIgnore: true */ '@holoscript/engine')) as typeof EngineNS;
}

// ── Validation helpers ──────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Validate a custom cohort (mirrors fairness-mcp-tools.ts validateCohort + a size clamp). */
function validateCohort(cohort: unknown): FairnessRecord[] {
  if (!Array.isArray(cohort) || cohort.length === 0) {
    throw new Error("'cohort' must be a non-empty array of { group, features }.");
  }
  if (cohort.length > MAX_COHORT) {
    throw new Error(`'cohort' exceeds the ${MAX_COHORT}-record cap.`);
  }
  return cohort.map((r, i) => {
    const rec = r as Partial<FairnessRecord>;
    if (typeof rec.group !== 'string' || !rec.group) {
      throw new Error(`cohort[${i}].group must be a non-empty string.`);
    }
    if (!rec.features || typeof rec.features !== 'object' || Array.isArray(rec.features)) {
      throw new Error(`cohort[${i}].features must be an object of numbers.`);
    }
    const keys = Object.keys(rec.features);
    if (keys.length === 0 || keys.length > MAX_FEATURES) {
      throw new Error(`cohort[${i}].features must have 1..${MAX_FEATURES} numeric features.`);
    }
    for (const [k, v] of Object.entries(rec.features)) {
      if (!isFiniteNumber(v)) {
        throw new Error(`cohort[${i}].features.${k} must be a finite number.`);
      }
    }
    return { group: rec.group, features: rec.features as Record<string, number> };
  });
}

interface LinearModelArg {
  id?: string;
  weights: Record<string, number>;
  bias?: number;
  threshold?: number;
}

/**
 * Build the transparent linear decision model from a {weights, bias, threshold}
 * spec — byte-for-byte the same scorer the fairness_sweep MCP tool exposes
 * (fairness-mcp-tools.ts buildLinearModel), so the Studio surface and the MCP
 * tool drive an IDENTICAL model. approved iff (Σ wᵏ·fᵏ + bias) ≥ threshold.
 */
function buildLinearModel(spec: unknown): FairnessModel {
  const m = spec as Partial<LinearModelArg> | undefined;
  if (!m || !m.weights || typeof m.weights !== 'object' || Array.isArray(m.weights)) {
    throw new Error("'model.weights' (object of feature→weight) is required.");
  }
  const weights = m.weights;
  const wKeys = Object.keys(weights);
  if (wKeys.length === 0 || wKeys.length > MAX_FEATURES) {
    throw new Error(`model.weights must have 1..${MAX_FEATURES} entries.`);
  }
  for (const [k, v] of Object.entries(weights)) {
    if (!isFiniteNumber(v)) throw new Error(`model.weights.${k} must be finite.`);
  }
  const bias = isFiniteNumber(m.bias) ? m.bias : 0;
  const threshold = isFiniteNumber(m.threshold) ? m.threshold : 0;
  const id = typeof m.id === 'string' && m.id ? m.id : 'linear-scorer';
  return {
    id,
    decide: (features: Record<string, number>) => {
      let score = bias;
      for (const [k, w] of Object.entries(weights)) score += w * (features[k] ?? 0);
      return score >= threshold;
    },
    fingerprint: () => ({ kind: 'linear-scorer.v1', weights, bias, threshold }),
  };
}

// ── Curated scenarios (the surface runs the REAL sweep over these — nothing fabricated) ──
// Examiner-friendly, fully deterministic cohorts + a transparent linear scorer.
// The 'disparate-impact' scenario is constructed so group B's feature distribution
// trips the 4/5ths rule → FLAG-DISPARATE-IMPACT; 'fair' clears it. Both are run
// through the actual engine — the receipt + metrics are computed, never hardcoded.

interface ScenarioSpec {
  id: string;
  label: string;
  description: string;
  protectedAttribute: string;
  cohort: FairnessRecord[];
  model: LinearModelArg;
}

/** Deterministic two-group cohort: nGroup records per group, with a per-group
 *  mean on the single "score" feature. No RNG — fully reproducible. */
function buildTwoGroupCohort(nGroup: number, meanA: number, meanB: number): FairnessRecord[] {
  const out: FairnessRecord[] = [];
  for (let i = 0; i < nGroup; i++) {
    // Deterministic spread in [-0.2, +0.2] around the group mean.
    const t = nGroup === 1 ? 0 : (i / (nGroup - 1)) * 0.4 - 0.2;
    out.push({ group: 'A', features: { score: clamp01(meanA + t) } });
    out.push({ group: 'B', features: { score: clamp01(meanB + t) } });
  }
  return out;
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

function curatedScenarios(): Record<string, ScenarioSpec> {
  // Threshold 0.5 on a single feature whose weight is 1 → approved iff score ≥ 0.5.
  const model: LinearModelArg = {
    id: 'linear-scorer',
    weights: { score: 1 },
    bias: 0,
    threshold: 0.5,
  };
  return {
    'disparate-impact': {
      id: 'disparate-impact',
      label: 'Disparate-impact (fails 4/5ths)',
      description:
        'Two protected groups, single transparent score feature, threshold 0.5. Group B is centered lower → its approval rate is < 80% of group A → adverse-impact ratio trips the EEOC 4/5ths rule.',
      protectedAttribute: 'group',
      // A centered at 0.62 (most ≥ 0.5), B centered at 0.40 (most < 0.5).
      cohort: buildTwoGroupCohort(60, 0.62, 0.4),
      model,
    },
    fair: {
      id: 'fair',
      label: 'Fair (clears 4/5ths)',
      description:
        'Same transparent scorer; both groups centered near the 0.5 threshold so per-group approval rates are close → adverse-impact ratio ≥ 0.80 → PASS.',
      protectedAttribute: 'group',
      // Both groups centered just above threshold → near-equal approval rates.
      cohort: buildTwoGroupCohort(60, 0.6, 0.58),
      model,
    },
  };
}

// ── Gate ledger (verify card) ────────────────────────────────────────────────────

interface FairnessGate {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

function buildGates(args: {
  integrityOk: boolean;
  metrics: FairnessMetrics;
  receipt: FairnessReceipt;
  robustness: { verdict: string; band: RobustnessBand } | null;
}): FairnessGate[] {
  const { integrityOk, metrics, receipt, robustness } = args;
  const gates: FairnessGate[] = [
    {
      id: 'receipt-integrity',
      label: 'Receipt content-hash integrity verifies',
      pass: integrityOk,
      detail: integrityOk
        ? `receiptHash recomputes byte-identical (${receipt.hashMode})`
        : 'receiptHash mismatch — receipt body was altered',
    },
    {
      id: 'four-fifths',
      label: 'Passes the EEOC 4/5ths adverse-impact rule',
      pass: metrics.fourFifthsPass,
      detail: `adverse-impact ratio = ${metrics.adverseImpactRatio} (threshold 0.80) → ${receipt.decision}`,
    },
    {
      id: 'replay-fingerprint',
      label: 'Carries a re-derivable replay fingerprint (Guarantee-6)',
      pass: typeof receipt.replayFingerprint === 'string' && receipt.replayFingerprint.length > 0,
      detail: `replayFingerprint over {modelHash, seed, inputHash, weightStrategy}; grade = ${receipt.replayDeterminism}${
        receipt.replayTolerance ? ` (tol ${receipt.replayTolerance})` : ''
      }`,
    },
    {
      id: 'decision-digest',
      label: 'Commits to per-record decision outputs (not just the input key)',
      pass: typeof receipt.decisionDigest === 'string' && receipt.decisionDigest.length > 0,
      detail: `decisionDigest present — a validator can re-run the model and compare outputs`,
    },
  ];
  if (robustness) {
    gates.push({
      id: 'robustness',
      label: 'Robust under input drift + noise (LHS ensemble)',
      pass: robustness.verdict === 'ROBUSTLY-FAIR',
      detail: `verdict ${robustness.verdict} · 90% CI adverse-impact [${robustness.band.ci90[0]}, ${robustness.band.ci90[1]}] · worst ${robustness.band.worstCase}`,
    });
  }
  return gates;
}

// ── Route handler ───────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!isPlainObject(body)) {
    return NextResponse.json({ error: 'Body must be a JSON object' }, { status: 400 });
  }

  // Resolve cohort + model: explicit custom takes precedence, else a curated scenario.
  let cohort: FairnessRecord[];
  let modelSpec: LinearModelArg;
  let protectedAttribute: string;
  let scenarioId: string | undefined;

  try {
    if (body['cohort'] !== undefined || body['model'] !== undefined) {
      cohort = validateCohort(body['cohort']);
      modelSpec = (body['model'] as LinearModelArg) ?? { weights: {} };
      // Validate model shape early (buildLinearModel throws on bad spec).
      buildLinearModel(modelSpec);
      protectedAttribute =
        typeof body['protectedAttribute'] === 'string' ? body['protectedAttribute'] : 'group';
    } else {
      const scenarios = curatedScenarios();
      const requested =
        typeof body['scenario'] === 'string' ? body['scenario'] : 'disparate-impact';
      const scenario = scenarios[requested];
      if (!scenario) {
        return NextResponse.json(
          {
            error: `Unknown scenario "${requested}". Allowed: ${Object.keys(scenarios).join(
              ', '
            )} (or pass a custom { cohort, model }).`,
          },
          { status: 400 }
        );
      }
      cohort = scenario.cohort;
      modelSpec = scenario.model;
      protectedAttribute = scenario.protectedAttribute;
      scenarioId = scenario.id;
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  // Sweep options
  const seed = isFiniteNumber(body['seed']) ? body['seed'] : 0;
  const hashMode =
    body['hashMode'] === 'sha256' ? 'sha256' : body['hashMode'] === 'fnv1a' ? 'fnv1a' : undefined;
  // Default determinism-verify ON — the F-1 honesty layer (double-run + auto-downgrade).
  const verifyDeterminism = body['verifyDeterminism'] === false ? false : true;

  // Robustness opts (optional, clamped)
  const robustnessReq = body['robustness'];
  let robustnessOpts: {
    replicates?: number;
    driftRange?: [number, number];
    noiseRange?: [number, number];
  } | null = null;
  if (robustnessReq) {
    const r = (robustnessReq === true ? {} : robustnessReq) as Record<string, unknown>;
    robustnessOpts = {
      replicates: isFiniteNumber(r['replicates'])
        ? Math.min(Math.max(10, Math.round(r['replicates'])), MAX_REPLICATES)
        : undefined,
      driftRange: Array.isArray(r['driftRange'])
        ? (r['driftRange'] as [number, number])
        : undefined,
      noiseRange: Array.isArray(r['noiseRange'])
        ? (r['noiseRange'] as [number, number])
        : undefined,
    };
  }

  // Load the real engine + build the model
  let engine: typeof EngineNS;
  try {
    engine = await loadEngine();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Engine load failed: ${msg}` }, { status: 400 });
  }
  const model = buildLinearModel(modelSpec);

  const t0 = performance.now();
  try {
    const Sim = engine.Simulation;

    const sweep = await Sim.runFairnessSweep(model, cohort, {
      seed,
      protectedAttribute,
      hashMode,
      verifyDeterminism,
    });

    // Independent integrity check — recompute the receipt content hash (the
    // Guarantee-6 tamper check the explainer also runs). This is real
    // verification, not a stored boolean.
    const integrityOk = Sim.verifyReceiptIntegrity(sweep.receipt);

    let robustnessOut: {
      receipt: FairnessRobustnessReceipt;
      band: RobustnessBand;
      verdict: FairnessRobustnessReceipt['verdict'];
    } | null = null;
    if (robustnessOpts) {
      const rob = await Sim.runFairnessRobustness(model, cohort, {
        seed,
        hashMode,
        replicates: robustnessOpts.replicates,
        driftRange: robustnessOpts.driftRange,
        noiseRange: robustnessOpts.noiseRange,
      });
      robustnessOut = { receipt: rob.receipt, band: rob.band, verdict: rob.verdict };
    }

    const wallMs = performance.now() - t0;
    const groups = Array.from(new Set(cohort.map((r) => r.group))).sort();

    const gates = buildGates({
      integrityOk,
      metrics: sweep.metrics,
      receipt: sweep.receipt,
      robustness: robustnessOut
        ? { verdict: robustnessOut.verdict, band: robustnessOut.band }
        : null,
    });

    return NextResponse.json({
      scenario: scenarioId ?? 'custom',
      receipt: sweep.receipt,
      metrics: sweep.metrics,
      decision: sweep.receipt.decision,
      replayDeterminism: sweep.replayDeterminism,
      ...(robustnessOut ? { robustness: robustnessOut } : {}),
      gates,
      runReport: {
        modelId: model.id,
        sampleSize: cohort.length,
        groups,
        replicates: robustnessOut ? robustnessOut.receipt.replicates : 0,
        hashMode: sweep.receipt.hashMode,
        wallMs,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Fairness sweep failed: ${msg}` }, { status: 400 });
  }
}
