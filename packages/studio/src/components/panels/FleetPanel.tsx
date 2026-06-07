'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

const SETTINGS_KEY = 'fleet-dispatch-settings';

/**
 * FleetPanel — Studio sidebar: full compute estate (agents + GPUs + hardware).
 *
 * Per task_1779315631445_clf7:
 * - AGENTS: online/offline, surface tag (claude1 etc.), current claimed task, last heartbeat.
 *   Click → open HoloRoom on HoloMesh.net. Ping → DM to inbox.
 * - HARDWARE: GPUs (RTX 4090, Adreno, etc.), WASM workers, CPU cores.
 *   Shows device, VRAM/memory, utilization, which agent using it, solver jobs.
 *
 * Data:
 * - Agents: /api/holomesh/team/:id/room/presence + /api/holomesh/agents
 * - Hardware: sync_hardware_loop MCP + holo_get_dev_dashboard_state (or fleet-status composite).
 * - Fleet-status endpoint already exists and aggregates presence + CAEL activity.
 *
 * Unified view: software agents + physical/hardware compute.
 */

interface AgentEntry {
  handle: string;
  online: boolean;
  last_heartbeat: string | null;
  status?: string;
  current_task?: string;
  surface_tag?: string;
}

interface HardwareEntry {
  device_id: string;
  type: 'gpu' | 'wasm' | 'cpu';
  name: string;
  vram_or_memory?: string;
  utilization?: number;
  used_by_agent?: string;
  jobs?: string[];
}

interface FleetData {
  team_id: string;
  snapshot_iso: string;
  online_count: number;
  agents: AgentEntry[];
  hardware: HardwareEntry[];
  fleet_health?: string;
  fleet_reasons?: string[];
  by_handle?: Record<string, any>;
}

function toHardwareEntry(entry: any, index: number, orphan = false): HardwareEntry {
  const handle = entry.handle || (orphan ? 'orphan' : 'unassigned');
  const instanceId = entry.instance_id ?? entry.id ?? `${handle}-${index}`;
  const state = entry.actual_status || entry.cur_state || entry.status;
  const jobs = [state, entry.warning].filter(Boolean).map(String);
  return {
    device_id: String(instanceId),
    type: 'gpu',
    name: entry.gpu_name ? `${entry.gpu_name} (${handle})` : String(handle),
    vram_or_memory: typeof entry.vram_gb === 'number' ? `${entry.vram_gb}GB` : undefined,
    utilization: undefined,
    used_by_agent: orphan ? undefined : entry.handle || undefined,
    jobs,
  };
}

// ─── Dispatch config persisted to localStorage ───────────────────────────────

interface DispatchSettings {
  teamId: string;
  capUsd: number;
  maxDispatches: number;
  dryRun: boolean;
}

const DEFAULT_SETTINGS: DispatchSettings = {
  teamId: 'team_1777834718247_unr35n',
  capUsd: 25,
  maxDispatches: 1,
  dryRun: true,
};

function loadSettings(): DispatchSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<DispatchSettings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: DispatchSettings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// ─── Dispatch result types ───────────────────────────────────────────────────

interface DispatchDecision {
  taskId: string;
  taskTitle: string;
  agentId: string;
  agentHandle: string;
  score: number;
  estimatedSpendUsd: number;
  reason: string;
  success?: boolean;
  error?: string;
}

interface DispatchResult {
  dryRun: boolean;
  teamId: string;
  plan?: { decisions: DispatchDecision[]; unassigned: string[]; capReached: boolean };
  dispatched?: (DispatchDecision & { success: boolean; error?: string })[];
  spend?: { dayKey: string; spentUsd: number; capUsd: number; remainingUsd: number };
  agentCount?: number;
  taskCount?: number;
  executorNote?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FleetPanel() {
  const [data, setData] = useState<FleetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dispatch settings — persisted
  const [settings, setSettings] = useState<DispatchSettings>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<DispatchResult | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const settingsLoaded = useRef(false);

  // Load from localStorage once
  useEffect(() => {
    if (!settingsLoaded.current) {
      settingsLoaded.current = true;
      setSettings(loadSettings());
    }
  }, []);

  const updateSettings = useCallback((patch: Partial<DispatchSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const teamId = settings.teamId;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [membersRes, fleetRes] = await Promise.all([
          fetch(`/api/holomesh/team/${teamId}/members`),
          fetch(`/api/holomesh/team/${teamId}/fleet`),
        ]);
        if (!membersRes.ok) throw new Error(`members ${membersRes.status}`);
        if (!fleetRes.ok) throw new Error(`fleet ${fleetRes.status}`);

        const membersJson = await membersRes.json();
        const fleetJson = await fleetRes.json();
        const members = Array.isArray(membersJson.members) ? membersJson.members : [];
        const snapshot = fleetJson.snapshot || fleetJson.fleet || null;
        const matched = Array.isArray(snapshot?.matched) ? snapshot.matched : [];
        const orphans = Array.isArray(snapshot?.orphans) ? snapshot.orphans : [];

        const agents: AgentEntry[] = members.map((member: any) => ({
          handle: member.agentName || member.agentId,
          online: !!member.online,
          last_heartbeat: member.lastHeartbeat || null,
          status: member.online ? 'active' : 'offline',
          current_task: null,
          surface_tag: member.surfaceTag || member.role,
        }));

        const hardware: HardwareEntry[] = [
          ...matched.map((entry: any, index: number) => toHardwareEntry(entry, index)),
          ...orphans.map((entry: any, index: number) => toHardwareEntry(entry, index, true)),
        ];
        const health = fleetJson.health || {};
        const snapshotIso =
          fleetJson.publishedAt ||
          snapshot?.captured_at ||
          snapshot?.summary?.captured_at ||
          new Date().toISOString();

        if (!cancelled) {
          setData({
            team_id: fleetJson.teamId || membersJson.teamId || teamId,
            snapshot_iso: snapshotIso,
            online_count: membersJson.online_count || agents.filter(a => a.online).length,
            agents,
            hardware,
            fleet_health: health.status,
            fleet_reasons: Array.isArray(health.reasons) ? health.reasons : [],
            by_handle: Object.fromEntries(agents.map((agent) => [agent.handle, agent])),
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load fleet');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, 15000); // live refresh
    return () => { cancelled = true; clearInterval(id); };
  }, [teamId]);

  const runDispatch = useCallback(async (overrideDryRun?: boolean) => {
    setDispatching(true);
    setDispatchResult(null);
    setDispatchError(null);
    const isDry = overrideDryRun ?? settings.dryRun;
    try {
      const res = await fetch('/api/agents/fleet/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: settings.teamId,
          maxDispatches: settings.maxDispatches,
          capUsd: settings.capUsd,
          dryRun: isDry,
        }),
      });
      const json = await res.json() as DispatchResult;
      if (!res.ok) {
        setDispatchError((json as unknown as { error?: string }).error ?? `HTTP ${res.status}`);
      } else {
        setDispatchResult(json);
      }
    } catch (e: unknown) {
      setDispatchError(e instanceof Error ? e.message : String(e));
    } finally {
      setDispatching(false);
    }
  }, [settings]);

  if (loading && !data) return <div className="p-3 text-xs text-studio-muted">Loading fleet…</div>;
  if (error) return <div className="p-3 text-xs text-red-400">Error: {error}</div>;
  if (!data) return null;

  return (
    <div className="p-2 text-[11px] text-studio-text space-y-3 overflow-y-auto h-full">
      <div className="text-[10px] uppercase tracking-wider text-studio-muted flex items-center justify-between">
        <span>FLEET • {data.online_count} online</span>
        <span className="text-[8px]">{new Date(data.snapshot_iso).toLocaleTimeString()}</span>
      </div>
      {data.fleet_health && data.fleet_health !== 'ok' && (
        <div className="rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-1 text-[9px] text-amber-200">
          Fleet health: {data.fleet_health}
          {data.fleet_reasons?.length ? ` (${data.fleet_reasons.join(', ')})` : ''}
        </div>
      )}

      {/* AGENTS SECTION */}
      <div>
        <div className="font-semibold mb-1 flex items-center gap-1">
          <span>🧠 AGENTS</span>
          <span className="text-[9px] text-studio-muted">({data.agents.length})</span>
        </div>
        <div className="space-y-1">
          {data.agents.length === 0 && <div className="text-studio-muted italic">No agents reported</div>}
          {data.agents.map((a) => (
            <div key={a.handle} className="border border-studio-border/40 rounded px-1.5 py-0.5 bg-studio-panel/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className={a.online ? 'text-emerald-400' : 'text-red-400'}>●</span>
                  <span className="font-mono text-[10px]">{a.handle}</span>
                  {a.surface_tag && <span className="text-[8px] bg-studio-border/30 px-0.5 rounded">{a.surface_tag}</span>}
                </div>
                <div className="text-[8px] text-studio-muted">{a.last_heartbeat ? new Date(a.last_heartbeat).toLocaleTimeString() : '—'}</div>
              </div>
              {a.current_task && <div className="text-[9px] text-studio-accent truncate">→ {a.current_task}</div>}
              <div className="flex gap-1 mt-0.5">
                <button className="text-[8px] underline hover:text-studio-accent" onClick={() => window.open(`https://holomesh.net/room/${data.team_id}?agent=${a.handle}`, '_blank')}>HoloRoom</button>
                <button
                  className="text-[8px] underline hover:text-studio-accent"
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/holomesh/team/${data.team_id}/message`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          type: 'dm',
                          content: `Ping from Studio Fleet panel at ${new Date().toISOString()} — please check current board / claimed work.`,
                          to: a.handle,
                        }),
                      });
                      if (res.ok) {
                        alert(`Ping sent to ${a.handle} (check their inbox)`);
                      } else {
                        alert(`Ping failed: ${res.status}`);
                      }
                    } catch (e: any) {
                      alert(`Ping error: ${e.message}`);
                    }
                  }}
                >
                  Ping
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* HARDWARE SECTION */}
      <div>
        <div className="font-semibold mb-1 flex items-center gap-1">
          <span>🖥️ HARDWARE (GPUs + WASM + CPU)</span>
        </div>
        <div className="space-y-1">
          {data.hardware.length === 0 && <div className="text-studio-muted italic">No hardware telemetry yet (sync_hardware_loop)</div>}
          {data.hardware.map((h) => (
            <div key={h.device_id} className="border border-studio-border/40 rounded px-1.5 py-0.5 bg-studio-panel/30">
              <div className="flex justify-between">
                <span className="font-mono text-[10px]">{h.name}</span>
                <span className="text-[9px]">{h.utilization ?? '—'}%</span>
              </div>
              <div className="text-[9px] text-studio-muted">{h.vram_or_memory || ''} • used by {h.used_by_agent || 'idle'}</div>
              {h.jobs && h.jobs.length > 0 && (
                <div className="text-[8px] text-studio-accent truncate">jobs: {h.jobs.join(', ')}</div>
              )}
            </div>
          ))}
        </div>
        <div className="text-[8px] text-studio-muted mt-1">Source: latest team fleet snapshot</div>
      </div>

      {/* DISPATCH SECTION */}
      <div className="border-t border-studio-border/40 pt-2">
        <button
          className="w-full flex items-center justify-between text-[10px] font-semibold mb-1 hover:text-studio-accent"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <span>⚡ DISPATCH</span>
          <span className="text-[8px] text-studio-muted">{settingsOpen ? '▲' : '▼'} settings</span>
        </button>

        {settingsOpen && (
          <div className="space-y-1.5 mb-2 bg-studio-panel/40 rounded p-1.5 border border-studio-border/30">
            <label className="flex flex-col gap-0.5">
              <span className="text-[8px] text-studio-muted uppercase tracking-wider">Team ID</span>
              <input
                className="bg-studio-panel border border-studio-border/50 rounded px-1 py-0.5 text-[9px] font-mono w-full"
                value={settings.teamId}
                onChange={(e) => updateSettings({ teamId: e.target.value.trim() })}
                spellCheck={false}
              />
            </label>
            <div className="flex gap-2">
              <label className="flex flex-col gap-0.5 flex-1">
                <span className="text-[8px] text-studio-muted uppercase tracking-wider">Daily cap ($)</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  step={5}
                  className="bg-studio-panel border border-studio-border/50 rounded px-1 py-0.5 text-[9px] w-full"
                  value={settings.capUsd}
                  onChange={(e) => updateSettings({ capUsd: Math.max(1, Number(e.target.value)) })}
                />
              </label>
              <label className="flex flex-col gap-0.5 flex-1">
                <span className="text-[8px] text-studio-muted uppercase tracking-wider">Max tasks</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  className="bg-studio-panel border border-studio-border/50 rounded px-1 py-0.5 text-[9px] w-full"
                  value={settings.maxDispatches}
                  onChange={(e) => updateSettings({ maxDispatches: Math.min(10, Math.max(1, Number(e.target.value))) })}
                />
              </label>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.dryRun}
                onChange={(e) => updateSettings({ dryRun: e.target.checked })}
                className="accent-studio-accent"
              />
              <span className="text-[9px]">Dry run (preview only — no claim)</span>
            </label>
          </div>
        )}

        <div className="flex gap-1.5">
          <button
            disabled={dispatching}
            onClick={() => runDispatch(true)}
            className="flex-1 text-[9px] border border-studio-border/50 rounded px-2 py-1 hover:bg-studio-panel/60 disabled:opacity-40"
          >
            {dispatching && settings.dryRun ? '…' : 'Plan'}
          </button>
          <button
            disabled={dispatching}
            onClick={() => runDispatch(false)}
            className="flex-1 text-[9px] border border-studio-accent/50 bg-studio-accent/10 rounded px-2 py-1 hover:bg-studio-accent/20 disabled:opacity-40 text-studio-accent font-medium"
          >
            {dispatching && !settings.dryRun ? '…' : 'Dispatch'}
          </button>
        </div>

        {dispatchError && (
          <div className="mt-1 text-[8px] text-red-400 border border-red-400/20 rounded px-1.5 py-1">
            {dispatchError}
          </div>
        )}

        {dispatchResult && (
          <div className="mt-1.5 space-y-1">
            <div className="text-[8px] text-studio-muted flex justify-between">
              <span>{dispatchResult.dryRun ? 'Plan (dry run)' : 'Dispatched'} • {dispatchResult.teamId}</span>
              {dispatchResult.spend && (
                <span>${dispatchResult.spend.spentUsd.toFixed(2)} / ${dispatchResult.spend.capUsd} today</span>
              )}
            </div>

            {/* Plan decisions */}
            {(dispatchResult.plan?.decisions ?? []).map((d, i) => (
              <div key={i} className="border border-studio-border/30 rounded px-1.5 py-0.5 bg-studio-panel/20">
                <div className="flex justify-between">
                  <span className="font-medium text-[9px] truncate max-w-[140px]">{d.taskTitle}</span>
                  <span className="text-[8px] text-studio-muted">${d.estimatedSpendUsd.toFixed(2)}</span>
                </div>
                <div className="text-[8px] text-studio-muted">→ {d.agentHandle} • {d.reason}</div>
              </div>
            ))}

            {/* Executed dispatches */}
            {(dispatchResult.dispatched ?? []).map((d, i) => (
              <div key={i} className={`border rounded px-1.5 py-0.5 ${d.success ? 'border-emerald-400/30 bg-emerald-400/5' : 'border-red-400/30 bg-red-400/5'}`}>
                <div className="flex justify-between">
                  <span className="font-medium text-[9px] truncate max-w-[140px]">{d.taskTitle}</span>
                  <span className={`text-[8px] ${d.success ? 'text-emerald-400' : 'text-red-400'}`}>{d.success ? 'claimed' : 'failed'}</span>
                </div>
                <div className="text-[8px] text-studio-muted">→ {d.agentHandle}</div>
                {d.error && <div className="text-[8px] text-red-400">{d.error}</div>}
              </div>
            ))}

            {dispatchResult.plan?.unassigned?.length ? (
              <div className="text-[8px] text-studio-muted">
                {dispatchResult.plan.unassigned.length} task(s) unassigned (no eligible agent)
              </div>
            ) : null}
            {dispatchResult.plan?.capReached && (
              <div className="text-[8px] text-amber-400">Daily cap reached — raise cap to dispatch more</div>
            )}
            {dispatchResult.taskCount !== undefined && (
              <div className="text-[8px] text-studio-muted">
                {dispatchResult.taskCount} board tasks • {dispatchResult.agentCount} agents
              </div>
            )}
          </div>
        )}
      </div>

      <div className="text-[8px] text-studio-muted border-t border-studio-border/30 pt-1">
        Unified fleet view • click agent → HoloRoom • hardware from live sync
      </div>
    </div>
  );
}

export default FleetPanel;
