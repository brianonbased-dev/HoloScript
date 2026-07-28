'use client';

import React, { useCallback, useEffect, useState } from 'react';

/**
 * CapabilitiesPanel — the "Capabilities" tab of /operations (D.081: Studio =
 * operate surface; W.GOLD.343: capabilities without surfaces are invisible).
 *
 * Two halves:
 *  - AWARE: a grounded inventory from GET /api/capabilities, grouped by `surface`
 *    (Live / Orphaned-CLI / Orphaned-tool / Orphaned-route / Admin-only). Every
 *    row shows its REAL backing provenance (F.099 show-don't-reference).
 *  - UTILIZE: three action tiers.
 *      SAFE  → direct: Refresh (re-pull), Plan fleet dispatch (dryRun=true, no spend).
 *      SPEND → file-as-request: NEVER runs vast.ai from the browser. POSTs a board
 *              task (the exact CLI command as the body) to the canonical board route
 *              for an agent/hardware seat to pick up (F.025 file-as-task, F.115 no
 *              native task surface, D.080 founder-gate). The POST is auth'd
 *              server-side with the team key; the MCP board route itself enforces
 *              signing and may reject a non-founder browser caller — that rejection
 *              is the correct guard, surfaced honestly in the row.
 *      ADMIN → state only, never a trigger.
 *
 * Inherits the founder gate for free: this panel only renders inside the
 * founder-gated /operations page.
 */

type CapabilitySurface =
  | 'live'
  | 'orphaned-cli'
  | 'orphaned-tool'
  | 'orphaned-route'
  | 'admin-only';
type CapabilityGate = 'safe' | 'spend' | 'admin';

interface CapabilityEntry {
  id: string;
  label: string;
  category: string;
  backing: string;
  surface: CapabilitySurface;
  gate: CapabilityGate;
  triggerable: boolean;
  note?: string;
  live?: Record<string, number | string | null>;
}

interface CapabilitiesResponse {
  capabilities: CapabilityEntry[];
  summary: {
    total: number;
    surfaced: number;
    orphaned: number;
    orchestratorReachable: boolean;
    bySurface: Record<string, number>;
    note?: string;
  };
}

interface DispatchPlanResponse {
  dryRun?: boolean;
  plan?: {
    decisions?: Array<{
      taskId: string;
      taskTitle: string;
      agentHandle: string;
      estimatedSpendUsd: number;
      reason: string;
    }>;
    unassigned?: string[];
    capReached?: boolean;
  };
  spend?: { todayUsd?: number; capUsd?: number };
  agentCount?: number;
  taskCount?: number;
}

const DEFAULT_TEAM = 'team_1777834718247_unr35n';

const SURFACE_ORDER: { key: CapabilitySurface; label: string; accent: string; blurb: string }[] = [
  {
    key: 'live',
    label: 'Live',
    accent: 'text-emerald-400',
    blurb: 'Surfaced + wired — perceivable and usable today.',
  },
  {
    key: 'orphaned-cli',
    label: 'Orphaned · CLI',
    accent: 'text-amber-400',
    blurb: 'Ships as an ai-ecosystem script — no Studio surface (file-as-request to use).',
  },
  {
    key: 'orphaned-tool',
    label: 'Orphaned · MCP tool',
    accent: 'text-amber-400',
    blurb: 'Ships as an MCP tool — no Studio surface.',
  },
  {
    key: 'orphaned-route',
    label: 'Orphaned · route',
    accent: 'text-amber-400',
    blurb: 'Ships as a server route subsystem with zero Studio caller.',
  },
  {
    key: 'admin-only',
    label: 'Admin-only',
    accent: 'text-rose-400',
    blurb: 'Exists but founder/admin-gated — state only, never a browser trigger.',
  },
];

function gateBadge(gate: CapabilityGate): { label: string; cls: string } {
  switch (gate) {
    case 'safe':
      return { label: 'safe', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' };
    case 'spend':
      return { label: 'spend', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
    case 'admin':
      return { label: 'admin', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' };
  }
}

// The exact CLI command filed as the board-task body for each spend capability.
// This is a REQUEST (what an agent/hardware seat should run), never executed here.
const REQUEST_COMMANDS: Record<string, string> = {
  'fleet-bench-provision': 'python scripts/fleet-bench-provision.py --model <hf-model> --tp <N>',
  'fleet-job-run': 'python scripts/fleet-job-run.py --job <job-spec> --gpu <type>',
  'fleet-throughput-bench': 'node scripts/fleet-throughput-bench.mjs --endpoint <warm-url>',
  'quantum-scaleup-cuquantum': 'bash scripts/quantum-scaleup/run-cuquantum-job.sh --qubits <N>',
  'render-world-on-fleet': 'MCP render_world_on_fleet { world: <id> }  (spend-class)',
};

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

export function CapabilitiesPanel({ teamId = DEFAULT_TEAM }: { teamId?: string }) {
  const [data, setData] = useState<CapabilitiesResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Action state
  const [plan, setPlan] = useState<DispatchPlanResponse | null>(null);
  const [planErr, setPlanErr] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [requestState, setRequestState] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/capabilities', { cache: 'no-store' });
      if (!r.ok) throw new Error(`capabilities ${r.status}`);
      setData((await r.json()) as CapabilitiesResponse);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // SAFE action: dry-run fleet dispatch plan (no spend — dryRun:true).
  const planDispatch = useCallback(async () => {
    setPlanning(true);
    setPlanErr(null);
    setPlan(null);
    try {
      const r = await fetch('/api/agents/fleet/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, dryRun: true }),
      });
      const j = (await r.json()) as DispatchPlanResponse;
      if (!r.ok) throw new Error((j as { error?: string }).error || `dispatch ${r.status}`);
      setPlan(j);
    } catch (e: unknown) {
      setPlanErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setPlanning(false);
    }
  }, [teamId]);

  // SPEND action: file-as-request. Files a SIGNED board task whose body is the
  // exact CLI command; an agent/hardware seat picks it up. NEVER runs the spend
  // here. Routes through POST /api/operations/request-run (NOT the raw board
  // proxy): that route is founder-gated server-side and SIGNS the board envelope
  // with the Studio seat key so the Phase-3-strict board route accepts it
  // end-to-end. If the seat key isn't provisioned the route fails closed with an
  // honest "signing key not provisioned" — surfaced below, never an unsigned POST.
  const fileRequest = useCallback(
    async (cap: CapabilityEntry) => {
      const command = REQUEST_COMMANDS[cap.id] ?? `(run ${cap.backing})`;
      setRequestState((s) => ({ ...s, [cap.id]: 'filing…' }));
      try {
        const r = await fetch('/api/operations/request-run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            teamId,
            capabilityId: cap.id,
            label: cap.label,
            backing: cap.backing,
            command,
            gate: cap.gate,
          }),
        });
        const j = (await r.json().catch(() => ({}))) as {
          taskId?: string;
          error?: string;
          reason?: string;
          detail?: string;
        };
        if (!r.ok) {
          // Surface the route's / board's honest rejection (signing-rejected
          // reason, "signing key not provisioned", membership 403, etc.).
          throw new Error(j.reason || j.error || `request ${r.status}`);
        }
        setRequestState((s) => ({
          ...s,
          [cap.id]: j.taskId ? `filed ✓ ${j.taskId}` : 'filed ✓',
        }));
      } catch (e: unknown) {
        setRequestState((s) => ({
          ...s,
          [cap.id]: `failed: ${e instanceof Error ? e.message : 'error'}`,
        }));
      }
    },
    [teamId]
  );

  const caps = data?.capabilities ?? [];
  const summary = data?.summary;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      {/* Header / summary */}
      <Card title="🧭 Platform Capabilities — Aware & Utilize">
        {err && <p className="text-xs text-red-400 mb-2">inventory error: {err}</p>}
        {summary ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-3">
              <Stat label="capabilities" value={summary.total} />
              <Stat label="surfaced (live)" value={summary.surfaced} tone="text-emerald-400" />
              <Stat label="orphaned" value={summary.orphaned} tone="text-amber-400" />
              <Stat
                label="orchestrator"
                value={summary.orchestratorReachable ? 'live' : 'dark'}
                tone={summary.orchestratorReachable ? 'text-emerald-400' : 'text-studio-muted'}
              />
            </div>
            <p className="text-xs text-studio-muted">
              The platform ships {summary.total} catalogued capabilities;{' '}
              <span className="text-emerald-400">{summary.surfaced} are surfaced</span> and{' '}
              <span className="text-amber-400">{summary.orphaned} are orphaned</span> (real but
              unsurfaced). {summary.note}
            </p>
          </>
        ) : (
          <p className="text-xs text-studio-muted">{loading ? 'loading inventory…' : '—'}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded border border-studio-border bg-studio-panel/40 text-studio-text hover:border-studio-accent disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : '↻ Refresh inventory'}
          </button>
          <button
            onClick={() => void planDispatch()}
            disabled={planning}
            className="px-3 py-1.5 text-xs font-medium rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:border-emerald-400 disabled:opacity-50"
          >
            {planning ? 'Planning…' : '▶ Plan fleet dispatch (dry-run)'}
          </button>
        </div>
        {planErr && <p className="text-xs text-red-400 mt-2">dispatch error: {planErr}</p>}
        {plan && (
          <div className="mt-3 rounded border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
            <div className="flex flex-wrap gap-4 mb-2">
              <Stat
                label="dry-run plan"
                value={plan.dryRun ? 'yes' : 'no'}
                tone="text-emerald-300"
              />
              <Stat label="agents" value={plan.agentCount ?? 0} />
              <Stat label="open tasks" value={plan.taskCount ?? 0} />
              <Stat
                label="spend today / cap"
                value={`$${plan.spend?.todayUsd ?? 0} / $${plan.spend?.capUsd ?? 0}`}
              />
            </div>
            {plan.plan?.decisions && plan.plan.decisions.length > 0 ? (
              <ul className="space-y-1">
                {plan.plan.decisions.map((d) => (
                  <li key={d.taskId} className="text-studio-muted">
                    <span className="text-studio-text">{d.agentHandle}</span> → {d.taskTitle}{' '}
                    <span className="text-amber-300">(~${d.estimatedSpendUsd})</span> · {d.reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-studio-muted">
                No dispatch decisions (nothing to assign or cap reached). No spend would occur.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Inventory grouped by surface */}
      {SURFACE_ORDER.map(({ key, label, accent, blurb }) => {
        const group = caps.filter((c) => c.surface === key);
        if (group.length === 0) return null;
        return (
          <Card key={key} title={`${label} · ${group.length}`} accent={accent}>
            <p className="text-[11px] text-studio-muted mb-3">{blurb}</p>
            <ul className="space-y-2">
              {group.map((cap) => {
                const badge = gateBadge(cap.gate);
                const reqMsg = requestState[cap.id];
                return (
                  <li
                    key={cap.id}
                    className="rounded border border-studio-border bg-studio-panel/20 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-studio-text">{cap.label}</span>
                          <span
                            className={`px-1.5 py-0.5 text-[9px] uppercase tracking-wider rounded border ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                          <span className="text-[10px] text-studio-muted">{cap.category}</span>
                        </div>
                        {/* Provenance — F.099 show-don't-reference */}
                        <code className="block mt-1 text-[10px] text-studio-muted break-all font-mono">
                          {cap.backing}
                        </code>
                        {cap.live && (
                          <div className="mt-1 text-[10px] text-emerald-300 font-mono">
                            {Object.entries(cap.live)
                              .map(([k, v]) => `${k}=${v}`)
                              .join('  ·  ')}
                          </div>
                        )}
                        {cap.note && (
                          <p className="mt-1 text-[10px] text-studio-muted">{cap.note}</p>
                        )}
                      </div>

                      {/* UTILIZE action per tier */}
                      <div className="shrink-0 text-right">
                        {cap.gate === 'spend' && cap.triggerable ? (
                          <button
                            onClick={() => void fileRequest(cap)}
                            className="px-2.5 py-1 text-[10px] font-medium rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:border-amber-400"
                            title="Files a board task (the exact CLI command) via the canonical board route — an agent/hardware seat runs it. The server enforces signing; never executed in the browser."
                          >
                            Request run
                          </button>
                        ) : cap.gate === 'admin' ? (
                          <span className="text-[9px] uppercase tracking-wider text-rose-400/70">
                            state only
                          </span>
                        ) : cap.surface === 'live' ? (
                          <span className="text-[9px] uppercase tracking-wider text-emerald-400/70">
                            live
                          </span>
                        ) : (
                          <span className="text-[9px] uppercase tracking-wider text-studio-muted">
                            no trigger
                          </span>
                        )}
                        {reqMsg && (
                          <div
                            className={`mt-1 text-[9px] ${
                              reqMsg.startsWith('failed')
                                ? 'text-red-400'
                                : reqMsg.includes('✓')
                                  ? 'text-emerald-400'
                                  : 'text-studio-muted'
                            }`}
                          >
                            {reqMsg}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}

      <p className="text-[10px] text-studio-muted">
        Spend actions file a board task (the exact CLI command) for a hardware/fleet seat — vast.ai
        provisioning is NEVER initiated from the browser (F.025 / F.115 / D.080). Admin capabilities
        are state-only.
      </p>
    </div>
  );
}
