'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { isFounderWorkspaceIdentity } from '@/lib/workspace/workspaceIdentity';
import { FleetPanel } from '@/components/panels/FleetPanel';
import { PlatformAdminPanel } from '@/components/operations/PlatformAdminPanel';
import { AbsorbAdminPanel } from '@/components/operations/AbsorbAdminPanel';

/**
 * /operations — Operations Console (D.081 brick-1, read-only).
 *
 * Surfaces the infra state that until now lived only in CLI / cron / scripts:
 *  - Lotus gate (orchestrator /gpu/lotus-status — the VERIFIED count, the honest source)
 *  - GPU/CI job queue per lane (the same lotus-status `queue.by_lane`)
 *  - Fleet health snapshot (team /fleet)
 *  - Board (team /board — open/claimed/blocked + done count)
 *
 * Read-only by design. Actions (provision / dispatch CI / claim) are brick-2 and
 * will be founder-gated. Polls every 15s, like FleetPanel.
 *
 * Two-Lotus-truths note: this renders the ORCHESTRATOR gate (evidence-required,
 * the verified source) — NOT holoscript-net's separately-derived public bloom,
 * which can overclaim past the gate until they are single-sourced (tracked).
 */

const ACTIVE_TEAM_KEY = 'holomesh_active_team_id';
const DEFAULT_TEAM = 'team_1777834718247_unr35n';
const POLL_MS = 15000;

interface LaneCount {
  queued: number;
  running: number;
}
interface LotusStatus {
  lotus_gate?: {
    papers_with_rtx_bench: number;
    total_papers: number;
    pct: number;
    remaining: string[];
    verified_papers: string[];
    unverified_legacy: string[];
    status: string;
    lotus_fires_when: string;
  };
  queue?: {
    queued: number;
    running: number;
    done: number;
    by_lane?: { gpu?: LaneCount; ci?: LaneCount };
    running_jobs?: Array<{ id: string; tier: string; paper_id: string | null; age_s: number }>;
    queued_jobs?: Array<{ id: string; tier: string; paper_id: string | null; description: string }>;
  };
}

// Sovereign serving fleet (orchestrator /serve/status). Surfaces the
// scale-to-zero LLM serving state that backs Brittney — warm replicas, per-model
// demand, and whether serving is DARK while demand is live (the "Brittney
// silently on BYOK" risk this panel exists to make perceivable). D.081 / F.099.
interface ServeDemand {
  model: string;
  last_want_at: number;
  want_count: number;
}
interface ServeEndpoint {
  id?: string;
  model?: string;
  status?: string;
  url?: string;
  gpu?: string;
  dph?: number | null;
  last_heartbeat_at?: number;
}
interface ServeStatus {
  endpoints?: ServeEndpoint[];
  demand?: ServeDemand[];
  counts?: { warm?: number; draining?: number; models_with_demand?: number };
}

interface BoardTask {
  id: string;
  title: string;
  status?: string;
  claimedByName?: string | null;
  claimedBy?: string | null;
}

interface BoardState {
  open: BoardTask[];
  claimed: BoardTask[];
  blocked: BoardTask[];
  doneTotal: number;
}

interface FleetHealth {
  status?: string;
  reasons?: string[];
  onlineCount?: number;
  publishedAt?: string;
}

interface StabilizerTelemetry {
  provenanceBadge: 'corpus-replay' | 'live-fleet';
  determinismGrade: string;
  verdict: string;
  threshold: {
    independent: number | null;
    burst3: number | null;
    burst3AboveGrid?: boolean;
    note?: string;
  };
  syndrome: {
    cssProvenanceError: number;
    voteProvenanceError: number;
    cssValueError: number;
    voteValueError: number;
    byzantineChannel: string;
    sycophancyChannel: string;
    realVerifier: boolean;
    tamperEvidence: boolean;
  };
  curve: { p: number[]; d3: number[]; d5: number[]; d7: number[] };
  realFleet?: {
    recordsVerified: number;
    recordsTotal: number;
    verifyRate: number;
    tamperEvident: boolean;
    note?: string;
  } | null;
  source: string;
}

interface HoloShellProcess {
  pid: number;
  reason: string;
  ageSec: number;
  command: string;
}

interface HoloShellPending {
  id: string;
  operation: string;
  targetCount: number;
  timestamp: string;
}

interface HoloShellExecution {
  id: string;
  preflightId: string;
  operation: string;
  executedAtShort: string;
  summary: { killed: number; errors: number };
}

interface MachineStateSnapshot {
  schema: string;
  collectedAt: string;
  platform: string;
  nodeVersion: string;
  gpu: {
    name: string;
    totalMB: number;
    freeMB: number;
    usedMB: number;
    utilizationPct: number;
  } | null;
  hostMemory: {
    totalMB?: number;
    freeMB?: number;
    usedMB?: number;
    nodeHeapUsedMB?: number;
    nodeHeapTotalMB?: number;
    source: string;
  } | null;
  staleProcessCount: number;
}

interface MachineStateData {
  snapshot: MachineStateSnapshot;
  publishedAt?: string;
  _source?: string;
}

function timeAgo(iso?: string): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function Card({
  title,
  accent,
  children,
}: {
  title: string;
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

// Compact inline sparkline (values in [0,1]) — logical-error-vs-p curve for one distance.
function Sparkline({
  values,
  color,
  w = 120,
  h = 28,
}: {
  values: number[];
  color: string;
  w?: number;
  h?: number;
}) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 0.0001);
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / max) * h}`)
    .join(' ');
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

type OpsTab = 'infra' | 'admin' | 'absorb' | 'fleet';

export default function OperationsPage() {
  const { data: session, status } = useSession();
  const isFounder = isFounderWorkspaceIdentity(session?.user);
  const [activeTab, setActiveTab] = useState<OpsTab>('infra');
  const [teamId, setTeamId] = useState<string>(DEFAULT_TEAM);
  const [lotus, setLotus] = useState<LotusStatus | null>(null);
  const [serve, setServe] = useState<ServeStatus | null>(null);
  const [board, setBoard] = useState<BoardState | null>(null);
  const [fleet, setFleet] = useState<FleetHealth | null>(null);
  const [stabilizer, setStabilizer] = useState<StabilizerTelemetry | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastTick, setLastTick] = useState<string>('');
  const [holoshellProcs, setHoloshellProcs] = useState<HoloShellProcess[] | null>(null);
  const [holoshellPending, setHoloshellPending] = useState<HoloShellPending[] | null>(null);
  const [holoshellHistory, setHoloshellHistory] = useState<HoloShellExecution[] | null>(null);
  const [machineState, setMachineState] = useState<MachineStateData | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  useEffect(() => {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(ACTIVE_TEAM_KEY);
      if (saved) setTeamId(saved);
    }
  }, []);

  const load = useCallback(async () => {
    const errs: Record<string, string> = {};

    // Lotus gate + queue (orchestrator)
    try {
      const r = await fetch('/api/orchestrator/gpu/lotus-status', { cache: 'no-store' });
      if (!r.ok) throw new Error(`lotus-status ${r.status}`);
      setLotus(await r.json());
    } catch (e: unknown) {
      errs.lotus = e instanceof Error ? e.message : 'failed';
    }

    // Sovereign serving fleet (orchestrator /serve/status — allowlisted in the proxy)
    try {
      const r = await fetch('/api/orchestrator/serve/status', { cache: 'no-store' });
      if (!r.ok) throw new Error(`serve/status ${r.status}`);
      setServe(await r.json());
    } catch (e: unknown) {
      errs.serve = e instanceof Error ? e.message : 'failed';
    }

    // Board
    try {
      const r = await fetch(`/api/holomesh/team/${teamId}/board`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`board ${r.status}`);
      const j = await r.json();
      // Handle both shapes: { board:{open,claimed,blocked}, done:{total} } (DB) and { tasks:[...] } (raw MCP)
      if (j.board) {
        setBoard({
          open: j.board.open ?? [],
          claimed: j.board.claimed ?? [],
          blocked: j.board.blocked ?? [],
          doneTotal: j.done?.total ?? 0,
        });
      } else if (Array.isArray(j.tasks)) {
        const by = (s: string) => j.tasks.filter((t: BoardTask) => t.status === s);
        setBoard({
          open: by('open'),
          claimed: by('claimed'),
          blocked: by('blocked'),
          doneTotal: j.done_count ?? 0,
        });
      }
    } catch (e: unknown) {
      errs.board = e instanceof Error ? e.message : 'failed';
    }

    // Fleet health
    try {
      const r = await fetch(`/api/holomesh/team/${teamId}/fleet`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`fleet ${r.status}`);
      const j = await r.json();
      setFleet({
        status: j.health?.status,
        reasons: Array.isArray(j.health?.reasons) ? j.health.reasons : [],
        onlineCount: j.online_count,
        publishedAt: j.publishedAt,
      });
    } catch (e: unknown) {
      errs.fleet = e instanceof Error ? e.message : 'failed';
    }

    // Stabilizer-Fleet decoder telemetry (EXP-5-real; corpus-replay)
    try {
      const r = await fetch('/api/stabilizer/decoder-telemetry', { cache: 'no-store' });
      if (!r.ok) throw new Error(`stabilizer ${r.status}`);
      setStabilizer(await r.json());
    } catch (e: unknown) {
      errs.stabilizer = e instanceof Error ? e.message : 'failed';
    }

    // HoloShell stale processes
    try {
      const r = await fetch('/api/holoshell/stale-processes', { cache: 'no-store' });
      if (!r.ok) throw new Error(`holoshell-procs ${r.status}`);
      const j = await r.json();
      setHoloshellProcs(Array.isArray(j.items) ? j.items : []);
    } catch (e: unknown) {
      errs.holoshellProcs = e instanceof Error ? e.message : 'failed';
    }

    // HoloShell pending consents
    try {
      const r = await fetch('/api/holoshell/pending-consents', { cache: 'no-store' });
      if (!r.ok) throw new Error(`holoshell-pending ${r.status}`);
      const j = await r.json();
      setHoloshellPending(Array.isArray(j.items) ? j.items : []);
    } catch (e: unknown) {
      errs.holoshellPending = e instanceof Error ? e.message : 'failed';
    }

    // HoloShell execution history
    try {
      const r = await fetch('/api/holoshell/execution-history', { cache: 'no-store' });
      if (!r.ok) throw new Error(`holoshell-history ${r.status}`);
      const j = await r.json();
      setHoloshellHistory(Array.isArray(j.items) ? j.items : []);
    } catch (e: unknown) {
      errs.holoshellHistory = e instanceof Error ? e.message : 'failed';
    }

    // Machine state (pub/sub via prod MCP cache or local fallback)
    try {
      const r = await fetch('/api/holoshell/machine-state', { cache: 'no-store' });
      if (!r.ok) throw new Error(`machine-state ${r.status}`);
      const j = await r.json();
      if (j.snapshot) setMachineState(j as MachineStateData);
    } catch (e: unknown) {
      errs.machineState = e instanceof Error ? e.message : 'failed';
    }

    setErrors(errs);
    setLastTick(new Date().toLocaleTimeString());
  }, [teamId]);

  const approveConsent = useCallback(
    async (preflightId: string) => {
      setApproving(preflightId);
      try {
        const r = await fetch('/api/holoshell/consent/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preflightId }),
        });
        if (r.ok) await load();
      } finally {
        setApproving(null);
      }
    },
    [load]
  );

  useEffect(() => {
    if (!isFounder) return; // non-founders never trigger the operate proxies
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load, isFounder]);

  const gate = lotus?.lotus_gate;
  const q = lotus?.queue;
  const gpuLane = q?.by_lane?.gpu;
  const ciLane = q?.by_lane?.ci;
  const gateOpen = gate ? gate.papers_with_rtx_bench >= gate.total_papers : false;

  // ── Sovereign serving fleet derived state ──────────────────────────────────
  const SERVE_DEMAND_WINDOW_MS = 15 * 60 * 1000; // 15m: a want within this is "live"
  const serveCounts = serve?.counts ?? {};
  const serveEndpoints = serve?.endpoints ?? [];
  const serveDemand = serve?.demand ?? [];
  const warmCount = Number(
    serveCounts.warm ?? serveEndpoints.filter((e) => e.status === 'warm').length,
  );
  const now = Date.now();
  const freshDemand = serveDemand.filter(
    (d) => now - (Number(d.last_want_at) || 0) < SERVE_DEMAND_WINDOW_MS,
  );
  const freshWants = freshDemand.reduce((a, d) => a + (Number(d.want_count) || 0), 0);
  // The load-bearing signal this panel exists for: DARK while demand is live.
  const servingDark = warmCount === 0 && freshDemand.length > 0;
  const topDemand = [...serveDemand].sort(
    (a, b) => (Number(b.last_want_at) || 0) - (Number(a.last_want_at) || 0),
  )[0];
  const lastWantAgeMin = topDemand
    ? Math.round((now - (Number(topDemand.last_want_at) || 0)) / 60000)
    : null;

  // Founder-gate (brick-2): the operate console exposes fleet/CI/Lotus/board
  // internals and is the host for spend-triggering actions. Hide it from
  // non-founders. The nav item is also hidden; the action endpoints enforce
  // requireFounder server-side (the real gate).
  if (status === 'loading') {
    return <div className="p-6 text-sm text-studio-muted">Checking access…</div>;
  }
  if (!isFounder) {
    return (
      <div className="p-6 text-studio-text">
        <h1 className="text-xl font-bold mb-2">Operations</h1>
        <p className="text-sm text-studio-muted">
          This is the founder operate surface (live fleet, CI, Lotus gate, and board). Sign in as
          the founder to view it.
        </p>
      </div>
    );
  }

  const opsTabs: { key: OpsTab; label: string }[] = [
    { key: 'infra', label: 'Infra' },
    { key: 'admin', label: 'Admin' },
    { key: 'absorb', label: 'Absorb' },
    { key: 'fleet', label: 'Fleet' },
  ];

  return (
    <div className="h-full flex flex-col text-studio-text">
      {/* Top header + tab bar */}
      <div className="px-6 pt-5 pb-0 border-b border-studio-border shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold">Operations</h1>
            <p className="text-xs text-studio-muted">
              Founder operate surface — Infra · Admin · Absorb · Fleet (D.081).
            </p>
          </div>
          {activeTab === 'infra' && (
            <div className="text-right text-[10px] text-studio-muted">
              <div>team {teamId}</div>
              <div>updated {lastTick || '…'} · 15s poll</div>
            </div>
          )}
        </div>
        <div className="flex gap-1 -mb-px">
          {opsTabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`px-4 py-1.5 text-xs font-medium rounded-t border-b-2 transition-colors ${
                activeTab === key
                  ? 'border-studio-accent text-studio-text'
                  : 'border-transparent text-studio-muted hover:text-studio-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab panels */}
      {activeTab === 'admin' && <div className="flex-1 overflow-hidden"><PlatformAdminPanel /></div>}
      {activeTab === 'absorb' && <div className="flex-1 overflow-hidden"><AbsorbAdminPanel /></div>}
      {activeTab === 'fleet' && (
        <div className="flex-1 overflow-hidden p-4">
          <FleetPanel />
        </div>
      )}

      {activeTab === 'infra' && (
      <div className="flex-1 overflow-y-auto p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* LOTUS GATE */}
        <Card
          title="🪷 Lotus Genesis Gate"
          accent={gateOpen ? 'text-emerald-400' : 'text-studio-text'}
        >
          {errors.lotus ? (
            <div className="text-xs text-red-400">Error: {errors.lotus}</div>
          ) : gate ? (
            <div className="space-y-3">
              <div className="flex items-end gap-6">
                <Stat
                  label="verified RTX benches"
                  value={`${gate.papers_with_rtx_bench}/${gate.total_papers}`}
                  tone={gateOpen ? 'text-emerald-400' : 'text-amber-300'}
                />
                <Stat label="% to bloom" value={`${Math.round(gate.pct)}%`} />
              </div>
              <div className="text-xs text-studio-muted">{gate.status}</div>
              <div className="text-[10px] text-studio-muted">
                Fires when: {gate.lotus_fires_when}
              </div>
              {gate.unverified_legacy?.length > 0 && (
                <div className="text-[10px] text-amber-300/80">
                  {gate.unverified_legacy.length} legacy papers claim a bench but lack verified
                  evidence (provenance only — not counted): {gate.unverified_legacy.join(', ')}
                </div>
              )}
              <div className="text-[9px] text-studio-muted border-t border-studio-border/40 pt-1">
                Source: orchestrator gate (evidence-required). The public bloom on holoscript.net
                derives separately and may differ until single-sourced.
              </div>
            </div>
          ) : (
            <div className="text-xs text-studio-muted">Loading…</div>
          )}
        </Card>

        {/* SOVEREIGN SERVING FLEET — the Brittney-on-BYOK guard (D.081 / F.099) */}
        <Card
          title="🤖 Sovereign Serving (Brittney backend)"
          accent={servingDark ? 'text-red-400' : warmCount > 0 ? 'text-emerald-400' : 'text-studio-text'}
        >
          {errors.serve ? (
            <div className="text-xs text-red-400">Error: {errors.serve}</div>
          ) : serve ? (
            <div className="space-y-3">
              <div className="flex items-end gap-6">
                <Stat
                  label="warm replicas"
                  value={warmCount}
                  tone={warmCount > 0 ? 'text-emerald-400' : servingDark ? 'text-red-400' : 'text-amber-300'}
                />
                <Stat label="live wants (15m)" value={freshWants} />
                <Stat label="models w/ demand" value={serveCounts.models_with_demand ?? serveDemand.length} />
              </div>

              {servingDark ? (
                <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-[11px] text-red-300">
                  🚨 DARK UNDER DEMAND — serving is cold (warm=0) while {freshDemand.length} model(s)
                  have live wants. Brittney is on BYOK/local fallback. Re-enable the keep-warm
                  autoscaler (a-033) or pin BYOK deliberately.
                </div>
              ) : warmCount > 0 ? (
                <div className="text-[11px] text-emerald-400/90">
                  Serving live — {warmCount} warm replica{warmCount === 1 ? '' : 's'}.
                </div>
              ) : (
                <div className="text-[11px] text-studio-muted">
                  Cold at scale-to-zero (expected when idle). Last want{' '}
                  {lastWantAgeMin !== null ? `${lastWantAgeMin}m ago` : '—'} → no live demand, so
                  $0 idle is correct. Proven 21s cold resume on real demand.
                </div>
              )}

              {serveDemand.length > 0 && (
                <div className="space-y-0.5 border-t border-studio-border/40 pt-1">
                  {serveDemand.slice(0, 4).map((d) => {
                    const ageMin = Math.round((now - (Number(d.last_want_at) || 0)) / 60000);
                    const isFresh = now - (Number(d.last_want_at) || 0) < SERVE_DEMAND_WINDOW_MS;
                    return (
                      <div key={d.model} className="flex justify-between text-[10px] font-mono">
                        <span className="truncate text-studio-muted">{d.model}</span>
                        <span className={isFresh ? 'text-amber-300' : 'text-studio-muted'}>
                          {d.want_count} wants · {ageMin}m ago
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {serveEndpoints.length > 0 && (
                <div className="space-y-0.5">
                  {serveEndpoints.slice(0, 3).map((e, i) => (
                    <div key={e.id || i} className="text-[10px] font-mono text-emerald-400/80 truncate">
                      ▶ {e.id || e.model} · {e.status}
                      {e.gpu ? ` · ${e.gpu}` : ''}
                      {typeof e.dph === 'number' ? ` · $${e.dph}/hr` : ''}
                    </div>
                  ))}
                </div>
              )}

              {/* TRIGGER — D.081: action the founder/agent can fire from the surface. */}
              <div className="border-t border-studio-border/40 pt-2">
                <a
                  href="https://github.com/brianonbased-dev/ai-ecosystem/blob/main/automations/holoshell-team-automations/registry.json"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-[10px] rounded border border-studio-border px-2 py-1 text-studio-muted hover:text-studio-text hover:border-studio-text/40 transition"
                  title="Re-enable a-033 serving-autoscaler (keep-warm / scale-to-zero) in the HoloShell automation registry"
                >
                  ⚙️ Re-enable keep-warm autoscaler (a-033) →
                </a>
                <div className="text-[9px] text-studio-muted mt-1">
                  Watchdog: <code>scripts/serving-fleet-watchdog.mjs --alarm</code> fires a loud
                  board task + room DM when serving goes dark under demand.
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-studio-muted">Loading…</div>
          )}
        </Card>

        {/* JOB QUEUE BY LANE */}
        <Card title="⚙️ GPU / CI Queue">
          {errors.lotus ? (
            <div className="text-xs text-red-400">Error: {errors.lotus}</div>
          ) : q ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded border border-studio-border/40 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-studio-muted mb-1">
                    GPU lane
                  </div>
                  <div className="flex gap-4">
                    <Stat label="queued" value={gpuLane?.queued ?? '—'} />
                    <Stat label="running" value={gpuLane?.running ?? '—'} tone="text-emerald-400" />
                  </div>
                </div>
                <div className="rounded border border-studio-border/40 p-2">
                  <div className="text-[10px] uppercase tracking-wider text-studio-muted mb-1">
                    CI lane
                  </div>
                  <div className="flex gap-4">
                    <Stat
                      label="queued"
                      value={ciLane?.queued ?? '—'}
                      tone={(ciLane?.queued ?? 0) > 10 ? 'text-amber-300' : 'text-studio-text'}
                    />
                    <Stat label="running" value={ciLane?.running ?? '—'} tone="text-emerald-400" />
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-studio-muted">
                total: {q.queued} queued · {q.running} running · {q.done} done
              </div>
              {q.running_jobs && q.running_jobs.length > 0 && (
                <div className="space-y-0.5">
                  {q.running_jobs.slice(0, 5).map((j) => (
                    <div key={j.id} className="text-[10px] font-mono text-studio-muted truncate">
                      ▶ {j.tier} {j.paper_id ?? j.id.slice(0, 18)} · {j.age_s}s
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-studio-muted">Loading…</div>
          )}
        </Card>

        {/* FLEET HEALTH */}
        <Card title="🛰️ Fleet">
          {errors.fleet ? (
            <div className="text-xs text-red-400">Error: {errors.fleet}</div>
          ) : fleet ? (
            <div className="space-y-2">
              <div className="flex items-end gap-6">
                <Stat
                  label="agents online"
                  value={fleet.onlineCount ?? '—'}
                  tone="text-emerald-400"
                />
                <div className="flex flex-col">
                  <span
                    className={`text-lg font-mono ${
                      fleet.status === 'ok' ? 'text-emerald-400' : 'text-amber-300'
                    }`}
                  >
                    {fleet.status ?? 'unknown'}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-studio-muted">
                    health
                  </span>
                </div>
              </div>
              {fleet.reasons && fleet.reasons.length > 0 && (
                <div className="text-[10px] text-amber-300/80">{fleet.reasons.join(', ')}</div>
              )}
              <div className="text-[9px] text-studio-muted">
                snapshot {timeAgo(fleet.publishedAt)}
              </div>
            </div>
          ) : (
            <div className="text-xs text-studio-muted">Loading…</div>
          )}
        </Card>

        {/* BOARD */}
        <Card title="📋 Board">
          {errors.board ? (
            <div className="text-xs text-red-400">Error: {errors.board}</div>
          ) : board ? (
            <div className="space-y-3">
              <div className="flex items-end gap-5">
                <Stat label="open" value={board.open.length} />
                <Stat label="claimed" value={board.claimed.length} tone="text-amber-300" />
                <Stat
                  label="blocked"
                  value={board.blocked.length}
                  tone={board.blocked.length ? 'text-red-400' : 'text-studio-text'}
                />
                <Stat label="done" value={board.doneTotal} tone="text-emerald-400" />
              </div>
              <div className="space-y-0.5">
                {board.claimed.slice(0, 5).map((t) => (
                  <div key={t.id} className="text-[10px] text-studio-muted truncate">
                    ◗ {t.title}{' '}
                    <span className="text-studio-accent">
                      · {t.claimedByName || t.claimedBy || '?'}
                    </span>
                  </div>
                ))}
                {board.open.slice(0, 3).map((t) => (
                  <div key={t.id} className="text-[10px] text-studio-muted/70 truncate">
                    ○ {t.title}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-studio-muted">Loading…</div>
          )}
        </Card>

        {/* STABILIZER-FLEET DECODER (EXP-5-real) */}
        <Card
          title="⚛️ Stabilizer-Fleet Decoder"
          accent={stabilizer?.verdict === 'PROVE' ? 'text-emerald-400' : 'text-studio-text'}
        >
          {errors.stabilizer ? (
            <div className="text-xs text-red-400">Error: {errors.stabilizer}</div>
          ) : stabilizer ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                    stabilizer.provenanceBadge === 'live-fleet'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-studio-border text-studio-muted'
                  }`}
                >
                  {stabilizer.provenanceBadge}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-studio-border text-studio-text">
                  grade: {stabilizer.determinismGrade}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                    stabilizer.verdict === 'PROVE'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {stabilizer.verdict}
                </span>
              </div>

              <div className="flex items-end gap-6">
                <Stat
                  label="provenance err (CSS)"
                  value={`${(stabilizer.syndrome.cssProvenanceError * 100).toFixed(1)}%`}
                  tone="text-emerald-400"
                />
                <Stat
                  label="provenance err (voting)"
                  value={`${(stabilizer.syndrome.voteProvenanceError * 100).toFixed(1)}%`}
                  tone="text-amber-300"
                />
              </div>
              <div className="text-[10px] text-studio-muted">
                CSS syndrome gates sycophancy ({stabilizer.syndrome.sycophancyChannel});
                value-voting is blind to it.
              </div>

              <div className="flex items-end gap-6">
                <Stat
                  label="threshold p_c (indep)"
                  value={stabilizer.threshold.independent?.toFixed(3) ?? '—'}
                />
                <Stat
                  label="p_c (burst-3)"
                  value={
                    stabilizer.threshold.burst3 != null
                      ? stabilizer.threshold.burst3.toFixed(3)
                      : stabilizer.threshold.burst3AboveGrid
                        ? '≥0.2'
                        : '—'
                  }
                  tone="text-emerald-400"
                />
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-studio-muted mb-1">
                  logical error vs p (d=3 / d=5 / d=7)
                </div>
                <div className="flex gap-3 items-center">
                  <Sparkline values={stabilizer.curve.d3} color="#ef4444" />
                  <Sparkline values={stabilizer.curve.d5} color="#f59e0b" />
                  <Sparkline values={stabilizer.curve.d7} color="#22c55e" />
                </div>
              </div>

              {stabilizer.realFleet && (
                <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
                  <div className="text-[10px] text-emerald-300">
                    live-fleet verifier · {stabilizer.realFleet.recordsVerified}/
                    {stabilizer.realFleet.recordsTotal} real CAEL records verify clean
                    {stabilizer.realFleet.tamperEvident ? ' · tamper-evident' : ''}
                  </div>
                </div>
              )}

              <div className="text-[9px] text-studio-muted border-t border-studio-border/40 pt-1 flex gap-3">
                <span>
                  {stabilizer.syndrome.realVerifier ? '✓ real CAEL verifier' : '✗ verifier'}
                </span>
                <span>{stabilizer.syndrome.tamperEvidence ? '✓ tamper-evident' : '✗ tamper'}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-studio-muted">Loading…</div>
          )}
        </Card>

        {/* HOLOSHELL STALE PROCESSES */}
        <Card title="🖥️ HoloShell — Stale Processes">
          {errors.holoshellProcs ? (
            <div className="text-xs text-red-400">Error: {errors.holoshellProcs}</div>
          ) : holoshellProcs === null ? (
            <div className="text-xs text-studio-muted">Loading…</div>
          ) : holoshellProcs.length === 0 ? (
            <div className="text-xs text-emerald-400">No stale processes ✓</div>
          ) : (
            <div className="space-y-1">
              {holoshellProcs.map((p) => (
                <div key={p.pid} className="text-[10px] font-mono text-amber-300 truncate">
                  PID {p.pid} · {p.ageSec}s · {p.reason}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* HOLOSHELL PENDING CONSENTS */}
        <Card title="🔐 HoloShell — Pending Consents">
          {errors.holoshellPending ? (
            <div className="text-xs text-red-400">Error: {errors.holoshellPending}</div>
          ) : holoshellPending === null ? (
            <div className="text-xs text-studio-muted">Loading…</div>
          ) : holoshellPending.length === 0 ? (
            <div className="text-xs text-emerald-400">No pending consents ✓</div>
          ) : (
            <div className="space-y-2">
              {holoshellPending.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded border border-studio-border/40 bg-studio-panel/20 px-2 py-1"
                >
                  <div className="min-w-0">
                    <div className="text-[10px] text-studio-text truncate">
                      {c.operation} · {c.targetCount} targets
                    </div>
                    <div className="text-[9px] text-studio-muted">{timeAgo(c.timestamp)}</div>
                  </div>
                  <button
                    className="shrink-0 rounded bg-blue-600 px-2 py-0.5 text-[10px] text-white hover:bg-blue-500 disabled:opacity-50"
                    disabled={approving === c.id}
                    onClick={() => approveConsent(c.id)}
                  >
                    {approving === c.id ? '…' : 'Approve'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* MACHINE STATE */}
        <Card title="🖥️ Machine State">
          {errors.machineState ? (
            <div className="space-y-1">
              <div className="text-xs text-red-400">Error: {errors.machineState}</div>
              <div className="text-[9px] text-studio-muted">
                Start holoshell-operate-room-server.mjs or wait for publisher snapshot.
              </div>
            </div>
          ) : machineState === null ? (
            <div className="text-xs text-studio-muted">Loading…</div>
          ) : (
            <div className="space-y-3">
              {/* GPU */}
              {machineState.snapshot.gpu ? (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-studio-muted mb-1">
                    GPU — {machineState.snapshot.gpu.name}
                  </div>
                  <div className="flex items-end gap-5">
                    <Stat
                      label="VRAM used"
                      value={`${machineState.snapshot.gpu.usedMB.toLocaleString()} MB`}
                      tone={
                        machineState.snapshot.gpu.usedMB / machineState.snapshot.gpu.totalMB > 0.9
                          ? 'text-red-400'
                          : 'text-studio-text'
                      }
                    />
                    <Stat label="VRAM free" value={`${machineState.snapshot.gpu.freeMB.toLocaleString()} MB`} />
                    <Stat
                      label="util %"
                      value={`${machineState.snapshot.gpu.utilizationPct}%`}
                      tone={machineState.snapshot.gpu.utilizationPct > 80 ? 'text-amber-300' : 'text-emerald-400'}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-[10px] text-studio-muted">GPU — not detected</div>
              )}

              {/* Host memory */}
              {machineState.snapshot.hostMemory && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-studio-muted mb-1">
                    RAM ({machineState.snapshot.hostMemory.source})
                  </div>
                  {'totalMB' in machineState.snapshot.hostMemory && machineState.snapshot.hostMemory.totalMB ? (
                    <div className="flex items-end gap-5">
                      <Stat
                        label="used"
                        value={`${((machineState.snapshot.hostMemory.usedMB ?? 0) / 1024).toFixed(1)} GB`}
                        tone={
                          (machineState.snapshot.hostMemory.usedMB ?? 0) /
                            (machineState.snapshot.hostMemory.totalMB ?? 1) >
                          0.85
                            ? 'text-amber-300'
                            : 'text-studio-text'
                        }
                      />
                      <Stat
                        label="free"
                        value={`${((machineState.snapshot.hostMemory.freeMB ?? 0) / 1024).toFixed(1)} GB`}
                        tone="text-emerald-400"
                      />
                      <Stat
                        label="total"
                        value={`${((machineState.snapshot.hostMemory.totalMB ?? 0) / 1024).toFixed(0)} GB`}
                      />
                    </div>
                  ) : (
                    <div className="text-[10px] text-studio-muted">
                      Node heap: {machineState.snapshot.hostMemory.nodeHeapUsedMB ?? '—'} /{' '}
                      {machineState.snapshot.hostMemory.nodeHeapTotalMB ?? '—'} MB
                    </div>
                  )}
                </div>
              )}

              {/* Stale process count */}
              <div className="flex items-end gap-5">
                <Stat
                  label="stale procs"
                  value={machineState.snapshot.staleProcessCount}
                  tone={machineState.snapshot.staleProcessCount > 0 ? 'text-amber-300' : 'text-emerald-400'}
                />
              </div>

              {/* Source + age */}
              <div className="text-[9px] text-studio-muted border-t border-studio-border/40 pt-1 flex gap-3">
                <span>source: {machineState._source ?? 'unknown'}</span>
                <span>collected {timeAgo(machineState.snapshot.collectedAt)}</span>
                {machineState.publishedAt && <span>published {timeAgo(machineState.publishedAt)}</span>}
              </div>
            </div>
          )}
        </Card>

        {/* HOLOSHELL EXECUTION HISTORY */}
        <Card title="📜 HoloShell — Execution History">
          {errors.holoshellHistory ? (
            <div className="text-xs text-red-400">Error: {errors.holoshellHistory}</div>
          ) : holoshellHistory === null ? (
            <div className="text-xs text-studio-muted">Loading…</div>
          ) : holoshellHistory.length === 0 ? (
            <div className="text-xs text-studio-muted">No executions yet.</div>
          ) : (
            <div className="space-y-0.5">
              {holoshellHistory.slice(0, 8).map((e) => (
                <div key={e.id} className="text-[10px] font-mono text-studio-muted truncate">
                  {e.executedAtShort} · killed:{e.summary.killed} err:{e.summary.errors}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <p className="mt-5 text-[10px] text-studio-muted">
        D.081 brick-1 · read-only. Next: founder-gated actions (provision worker, dispatch CI, claim
        task) and single-sourcing the Lotus gate so the public bloom can&apos;t overclaim past it.
      </p>
      </div>
      )}
    </div>
  );
}
