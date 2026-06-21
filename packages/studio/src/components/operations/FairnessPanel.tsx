'use client';

import React, { useCallback, useState } from 'react';

/**
 * FairnessPanel — the "Fairness" tab of /operations.
 *
 * Graduates the orphaned FairnessSweep / FairnessReceipt capability (engine
 * Simulation.runFairnessSweep + the fairness_sweep / explain_fairness_receipt MCP
 * tools) to a perceivable + triggerable Studio surface. D.057 (regulated
 * verifiable orchestration — "the receipt IS the product"); F.099
 * (show-don't-reference): the sovereign FairnessReceipt is rendered as a verify
 * card, not referenced by a commit hash.
 *
 * Drives POST /api/fairness/sweep, which runs the REAL engine sweep IN-PROCESS
 * (webpackIgnore engine import, same pattern as /api/simulation/run) over a
 * curated examiner cohort + transparent linear scorer — the same model the
 * fairness_sweep MCP tool exposes. Nothing is fabricated: the receipt, metrics,
 * determinism grade, and integrity check are all computed by the engine.
 *
 * Inherits the founder gate for free — only renders inside the founder-gated
 * /operations page.
 */

// ── Receipt + response shapes (mirror @holoscript/engine/simulation) ─────────────

interface FairnessMetrics {
  approvalRate: Record<string, number>;
  adverseImpactRatio: number;
  demographicParityDiff: number;
  fourFifthsPass: boolean;
}

type DeterminismGrade = 'exact' | 'quantized' | 'statistical';

interface FairnessReceipt {
  kind: 'fairness.receipt.v1';
  modelId: string;
  modelHash: string;
  seed: number;
  inputHash: string;
  weightStrategy: string;
  replayFingerprint: string;
  sampleSize: number;
  protectedAttribute: string;
  metrics: FairnessMetrics;
  decision: 'PASS' | 'FLAG-DISPARATE-IMPACT';
  decisionDigest: string;
  metricsDigest: string;
  replayDeterminism: DeterminismGrade;
  replayTolerance: number;
  regulatoryMapping: Record<string, string>;
  hashMode: 'fnv1a' | 'sha256';
  issuedAt: string;
  receiptHash: string;
}

interface RobustnessBand {
  mean: number;
  std: number;
  ci90: [number, number];
  worstCase: number;
}

interface FairnessRobustnessReceipt {
  kind: 'fairness.robustness.v1';
  modelId: string;
  replicates: number;
  ensembleHash: string;
  robustness: RobustnessBand;
  verdict: 'ROBUSTLY-FAIR' | 'ROBUSTLY-UNFAIR' | 'INDETERMINATE-FAIRNESS';
  replayFingerprint: string;
  hashMode: 'fnv1a' | 'sha256';
  receiptHash: string;
}

interface FairnessGate {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

interface SweepResponse {
  scenario: string;
  receipt: FairnessReceipt;
  metrics: FairnessMetrics;
  decision: 'PASS' | 'FLAG-DISPARATE-IMPACT';
  replayDeterminism: DeterminismGrade;
  robustness?: {
    receipt: FairnessRobustnessReceipt;
    band: RobustnessBand;
    verdict: FairnessRobustnessReceipt['verdict'];
  };
  gates: FairnessGate[];
  runReport: {
    modelId: string;
    sampleSize: number;
    groups: string[];
    replicates: number;
    hashMode: string;
    wallMs: number;
  };
}

type RagRisk = 'green' | 'amber' | 'red';

// ── Scenario options (curated examiner cohorts — the route runs the real sweep) ──

const SCENARIOS: { id: 'disparate-impact' | 'fair'; label: string; blurb: string }[] = [
  {
    id: 'disparate-impact',
    label: 'Disparate-impact',
    blurb:
      'Two groups, transparent score @ threshold 0.5; group B centered lower → trips the EEOC 4/5ths rule → FLAG-DISPARATE-IMPACT.',
  },
  {
    id: 'fair',
    label: 'Fair',
    blurb:
      'Same scorer; both groups near the threshold → near-equal approval rates → adverse-impact ratio ≥ 0.80 → PASS.',
  },
];

// ── Shared display helpers (match CapabilitiesPanel / operations page) ────────────

function Card({
  title,
  accent,
  children,
}: {
  title: React.ReactNode;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-studio-border bg-studio-panel/30 p-4">
      <h2 className={`text-sm font-semibold mb-3 ${accent ?? 'text-studio-text'}`}>{title}</h2>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="flex flex-col">
      <span className={`text-2xl font-mono ${tone ?? 'text-studio-text'}`}>{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-studio-muted">{label}</span>
    </div>
  );
}

/** A monospace hash row with a label — the provenance/signature surface (F.099). */
function HashRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] uppercase tracking-wider text-studio-muted">{label}</span>
      <code className="text-[10px] font-mono text-studio-muted break-all">{value}</code>
    </div>
  );
}

function gradeBadge(grade: DeterminismGrade): { label: string; cls: string; note: string } {
  switch (grade) {
    case 'exact':
      return {
        label: 'EXACT',
        cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        note: 'bit-reproducible — re-running the model yields a byte-identical decision digest',
      };
    case 'quantized':
      return {
        label: 'QUANTIZED',
        cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        note: 'aggregate adverse-impact reproduces within the recorded tolerance',
      };
    case 'statistical':
      return {
        label: 'STATISTICAL',
        cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        note: 'only the distribution-level verdict is stable — pair with the robustness band',
      };
  }
}

function ragRisk(
  metrics: FairnessMetrics,
  robustness?: SweepResponse['robustness']
): { label: string; tone: string; risk: RagRisk } {
  const worstCase = robustness?.band?.worstCase;
  if (robustness?.verdict === 'ROBUSTLY-UNFAIR' || metrics.adverseImpactRatio < 0.72) {
    return { label: 'RED', tone: 'text-rose-400', risk: 'red' };
  }
  if (
    robustness?.verdict === 'INDETERMINATE-FAIRNESS' ||
    (worstCase !== undefined && worstCase < 0.8) ||
    metrics.adverseImpactRatio < 0.8
  ) {
    return { label: 'AMBER', tone: 'text-amber-300', risk: 'amber' };
  }
  return { label: 'GREEN', tone: 'text-emerald-400', risk: 'green' };
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function FairnessPanel() {
  const [scenario, setScenario] = useState<'disparate-impact' | 'fair'>('disparate-impact');
  const [withRobustness, setWithRobustness] = useState(true);
  const [verifyDeterminism, setVerifyDeterminism] = useState(true);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<SweepResponse | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [explainErr, setExplainErr] = useState<string | null>(null);

  const runSweep = useCallback(async () => {
    setRunning(true);
    setErr(null);
    setData(null);
    setExplanation(null);
    setExplainErr(null);
    try {
      const r = await fetch('/api/fairness/sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario,
          verifyDeterminism,
          robustness: withRobustness ? { replicates: 200 } : false,
        }),
      });
      const j = (await r.json()) as SweepResponse | { error?: string };
      if (!r.ok) throw new Error((j as { error?: string }).error || `sweep ${r.status}`);
      setData(j as SweepResponse);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setRunning(false);
    }
  }, [scenario, withRobustness, verifyDeterminism]);

  // Optional: human-readable explanation via the explain_fairness_receipt MCP tool
  // (through the existing /api/mcp/call proxy). Best-effort — if the orchestrator
  // is dark the verify card still stands on the engine-computed receipt.
  const explainReceipt = useCallback(async () => {
    if (!data) return;
    setExplaining(true);
    setExplainErr(null);
    setExplanation(null);
    try {
      const r = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'explain_fairness_receipt',
          arguments: { receipt: data.receipt },
        }),
      });
      const j = (await r.json()) as { result?: unknown; error?: string; text?: string };
      if (!r.ok) throw new Error(j.error || `explain ${r.status}`);
      // The MCP call route returns the tool result; normalize a few common shapes
      // to a printable string without asserting a specific envelope.
      const text =
        typeof j.text === 'string'
          ? j.text
          : typeof j.result === 'string'
            ? j.result
            : JSON.stringify(j.result ?? j, null, 2);
      setExplanation(text);
    } catch (e: unknown) {
      setExplainErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setExplaining(false);
    }
  }, [data]);

  const receipt = data?.receipt;
  const metrics = data?.metrics;
  const robustness = data?.robustness;
  const grade = receipt ? gradeBadge(receipt.replayDeterminism) : null;
  const passDecision = data?.decision === 'PASS';
  const rag = metrics ? ragRisk(metrics, robustness) : null;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {/* Driver */}
      <Card title="⚖️ Verifiable Fairness Sweep — run & verify">
        <p className="text-xs text-studio-muted mb-3">
          Runs the real <code>@holoscript/engine</code> FairnessSweep in-process over a transparent
          linear scorer (the same model the <code>fairness_sweep</code> MCP tool exposes) and emits
          a sovereign <span className="text-studio-text">FairnessReceipt</span>. The receipt is the
          product (D.057): a content-hashed, replayable bias-audit record carrying the EEOC 4/5ths
          adverse-impact ratio, a declared + measured determinism grade, and a regulator crosswalk.
        </p>

        {/* Scenario picker */}
        <div className="flex flex-wrap gap-2 mb-3">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => setScenario(s.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded border transition ${
                scenario === s.id
                  ? 'border-studio-accent bg-studio-accent/15 text-studio-text'
                  : 'border-studio-border bg-studio-panel/40 text-studio-muted hover:text-studio-text'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-studio-muted mb-3">
          {SCENARIOS.find((s) => s.id === scenario)?.blurb}
        </p>

        {/* Options */}
        <div className="flex flex-wrap items-center gap-4 mb-3">
          <label className="flex items-center gap-1.5 text-[11px] text-studio-muted cursor-pointer">
            <input
              type="checkbox"
              checked={verifyDeterminism}
              onChange={(e) => setVerifyDeterminism(e.target.checked)}
              className="accent-studio-accent"
            />
            verify determinism (double-run + auto-downgrade an over-claim)
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-studio-muted cursor-pointer">
            <input
              type="checkbox"
              checked={withRobustness}
              onChange={(e) => setWithRobustness(e.target.checked)}
              className="accent-studio-accent"
            />
            robustness band (200-replicate seeded-LHS drift + noise)
          </label>
        </div>

        <button
          onClick={() => void runSweep()}
          disabled={running}
          className="px-4 py-1.5 text-xs font-semibold rounded border border-studio-accent bg-studio-accent/20 text-studio-accent hover:bg-studio-accent/30 disabled:opacity-50"
        >
          {running ? 'Running sweep…' : '▶ Run fairness sweep'}
        </button>
        {err && <p className="text-xs text-red-400 mt-2">sweep error: {err}</p>}
      </Card>

      {/* Verify card — the FairnessReceipt rendered as provenance (F.099) */}
      {receipt && metrics && (
        <Card
          title={
            <span className="flex items-center gap-2">
              📜 FairnessReceipt
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded ${
                  passDecision
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {data?.decision}
              </span>
              <span className="text-[10px] font-mono text-studio-muted">{receipt.kind}</span>
            </span>
          }
          accent={passDecision ? 'text-emerald-400' : 'text-rose-400'}
        >
          {/* Disparity metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
            {rag && <Stat label="RAG risk" value={rag.label} tone={rag.tone} />}
            <Stat
              label="adverse-impact ratio"
              value={metrics.adverseImpactRatio}
              tone={metrics.fourFifthsPass ? 'text-emerald-400' : 'text-rose-400'}
            />
            <Stat label="demographic-parity Δ" value={metrics.demographicParityDiff} />
            <Stat
              label="4/5ths rule"
              value={metrics.fourFifthsPass ? 'pass' : 'fail'}
              tone={metrics.fourFifthsPass ? 'text-emerald-400' : 'text-rose-400'}
            />
            <Stat label="sample size" value={receipt.sampleSize} />
          </div>

          {/* Per-group approval rates */}
          <div className="mb-4">
            <div className="text-[10px] uppercase tracking-wider text-studio-muted mb-1">
              per-group approval rate ({receipt.protectedAttribute})
            </div>
            <div className="flex flex-wrap gap-4">
              {Object.entries(metrics.approvalRate).map(([g, rate]) => (
                <div key={g} className="flex items-baseline gap-1.5">
                  <span className="text-xs font-mono text-studio-text">{g}</span>
                  <span className="text-sm font-mono text-studio-accent">
                    {(rate * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Determinism provenance — the F-1 honesty layer made perceivable */}
          {grade && (
            <div className="mb-4 rounded border border-studio-border/60 bg-studio-panel/20 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] uppercase tracking-wider text-studio-muted">
                  re-execution grade
                </span>
                <span className={`px-1.5 py-0.5 text-[9px] font-mono rounded border ${grade.cls}`}>
                  {grade.label}
                </span>
                {receipt.replayTolerance > 0 && (
                  <span className="text-[10px] font-mono text-studio-muted">
                    tol {receipt.replayTolerance}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-studio-muted">{grade.note}</p>
            </div>
          )}

          {/* Sovereign signature / replay provenance (F.099 show-don't-reference) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
            <HashRow label={`receipt hash (${receipt.hashMode})`} value={receipt.receiptHash} />
            <HashRow label="replay fingerprint" value={receipt.replayFingerprint} />
            <HashRow label="decision digest (outputs)" value={receipt.decisionDigest} />
            <HashRow label="input hash" value={receipt.inputHash} />
            <HashRow label="model hash" value={receipt.modelHash} />
            <HashRow label="weight strategy" value={receipt.weightStrategy} />
          </div>
          <div className="text-[9px] text-studio-muted">
            issued {receipt.issuedAt} · model {receipt.modelId} · seed {receipt.seed} ·{' '}
            {data?.runReport.wallMs.toFixed(1)}ms
          </div>

          {/* explain_fairness_receipt (optional MCP enrichment) */}
          <div className="mt-3 border-t border-studio-border/40 pt-3">
            <button
              onClick={() => void explainReceipt()}
              disabled={explaining}
              className="px-3 py-1 text-[11px] font-medium rounded border border-studio-border bg-studio-panel/40 text-studio-text hover:border-studio-accent disabled:opacity-50"
              title="Verify integrity + render a plain-English explanation via the explain_fairness_receipt MCP tool"
            >
              {explaining ? 'Explaining…' : '🗒️ Explain receipt (MCP)'}
            </button>
            {explainErr && (
              <p className="text-[10px] text-amber-400 mt-2">
                explain unavailable: {explainErr} — the verify card above still stands on the
                engine-computed receipt.
              </p>
            )}
            {explanation && (
              <pre className="mt-2 text-[10px] text-studio-muted whitespace-pre-wrap break-words rounded border border-studio-border/40 bg-studio-panel/20 p-2 max-h-64 overflow-y-auto">
                {explanation}
              </pre>
            )}
          </div>
        </Card>
      )}

      {/* Robustness band */}
      {robustness && (
        <Card
          title={
            <span className="flex items-center gap-2">
              🌊 Robustness band
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded ${
                  robustness.verdict === 'ROBUSTLY-FAIR'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : robustness.verdict === 'ROBUSTLY-UNFAIR'
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {robustness.verdict}
              </span>
            </span>
          }
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-2">
            <Stat label="mean adverse-impact" value={robustness.band.mean} />
            <Stat
              label="90% CI low (p5)"
              value={robustness.band.ci90[0]}
              tone={robustness.band.ci90[0] >= 0.8 ? 'text-emerald-400' : 'text-amber-300'}
            />
            <Stat label="90% CI high (p95)" value={robustness.band.ci90[1]} />
            <Stat
              label="worst case"
              value={robustness.band.worstCase}
              tone={robustness.band.worstCase >= 0.8 ? 'text-emerald-400' : 'text-rose-400'}
            />
          </div>
          <div className="text-[10px] text-studio-muted">
            {robustness.receipt.replicates}-replicate seeded-LHS ensemble (drift + measurement
            noise). std {robustness.band.std}.
          </div>
          <HashRow label="ensemble hash" value={robustness.receipt.ensembleHash} />
        </Card>
      )}

      {/* Gate ledger — verify card status rows */}
      {data?.gates && data.gates.length > 0 && (
        <Card title="✅ Gate Ledger">
          <ul className="space-y-2">
            {data.gates.map((g) => (
              <li
                key={g.id}
                className="flex items-start gap-2 rounded border border-studio-border/40 bg-studio-panel/20 p-2"
              >
                <span
                  className={`mt-0.5 text-xs font-mono ${
                    g.pass ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {g.pass ? '✓' : '✗'}
                </span>
                <div className="min-w-0">
                  <div className="text-xs text-studio-text">{g.label}</div>
                  <div className="text-[10px] text-studio-muted">{g.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Regulator crosswalk — what one receipt satisfies (data, not behavior) */}
      {receipt && Object.keys(receipt.regulatoryMapping).length > 0 && (
        <Card title="🏛️ Regulator crosswalk (this receipt satisfies)">
          <ul className="space-y-1.5">
            {Object.entries(receipt.regulatoryMapping).map(([reg, evidence]) => (
              <li key={reg} className="text-[11px]">
                <span className="text-studio-text">{reg}</span>
                <span className="text-studio-muted"> — {evidence}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-[10px] text-studio-muted">
        D.057 · the receipt IS the product. Pure CPU compute — no spend, no fleet. The transparent
        linear scorer is the examiner-friendly default; in production the <code>.holo</code> domain
        bridge swaps in the institution&apos;s real model + point-in-time data (core stays
        domain-free, D.007).
      </p>
    </div>
  );
}

export default FairnessPanel;
