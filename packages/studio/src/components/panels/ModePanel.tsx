'use client';

import React, { useEffect, useState } from 'react';

/**
 * ModePanel — Studio sidebar: team mode switcher (small toggle).
 *
 * Per task_1779315248520_6s8c:
 * - Shows current team mode pill: BUILD / AUDIT / RESEARCH / REVIEW.
 * - One-line mode description.
 * - Last switched timestamp and who switched it.
 * - Actions: click to switch via dropdown of 4 options.
 * - API: GET /api/holomesh/team/:id (for current mode), POST /api/holomesh/team/:id/mode.
 * - "Small toggle, completes HoloShell parity."
 */

const MODES = ['build', 'audit', 'research', 'review'] as const;
type Mode = typeof MODES[number];

interface ModeData {
  mode: Mode;
  objective?: string;
  last_switched?: string;
  switched_by?: string;
}

export function ModePanel() {
  const [data, setData] = useState<ModeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const [teamId] = useState('team_1777834718247_unr35n');

  const fetchMode = async () => {
    try {
      const res = await fetch(`/api/holomesh/team/${teamId}`);
      if (!res.ok) throw new Error(`team ${res.status}`);
      const json = await res.json();
      const team = json.team || json;
      setData({
        mode: (team.mode || 'build').toLowerCase() as Mode,
        objective: team.objective,
        last_switched: team.last_mode_switch?.timestamp,
        switched_by: team.last_mode_switch?.by,
      });
    } catch (e: any) {
      setError(e.message || 'Failed to load mode');
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      await fetchMode();
      if (!cancelled) setLoading(false);
    })();
    const id = setInterval(fetchMode, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [teamId]);

  const switchMode = async (newMode: Mode) => {
    if (switching || data?.mode === newMode) return;
    setSwitching(true);
    setError(null);
    try {
      const res = await fetch(`/api/holomesh/team/${teamId}/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      });
      if (!res.ok) throw new Error(`mode switch ${res.status}`);
      await fetchMode();
    } catch (e: any) {
      setError(e.message || 'Switch failed');
    } finally {
      setSwitching(false);
    }
  };

  if (loading && !data) return <div className="p-3 text-xs text-studio-muted">Loading mode…</div>;
  if (error && !data) return <div className="p-3 text-xs text-red-400">Error: {error}</div>;
  if (!data) return null;

  const current = data.mode.toUpperCase();

  return (
    <div className="p-2 text-[11px] text-studio-text space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-studio-muted">TEAM MODE</span>
        <span className="text-[8px] bg-studio-accent/20 text-studio-accent px-1 rounded">{current}</span>
      </div>

      <div className="text-[10px] text-studio-text">
        {data.objective || 'Standard team focus mode.'}
      </div>

      {data.last_switched && (
        <div className="text-[8px] text-studio-muted">
          Last: {new Date(data.last_switched).toLocaleString()} by {data.switched_by || 'unknown'}
        </div>
      )}

      <div className="pt-1 border-t border-studio-border/40">
        <div className="text-[9px] text-studio-muted mb-1">Switch mode:</div>
        <div className="flex flex-wrap gap-1">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              disabled={switching || data.mode === m}
              className={`text-[9px] px-2 py-0.5 rounded border transition
                ${data.mode === m 
                  ? 'bg-studio-accent text-white border-studio-accent' 
                  : 'border-studio-border hover:bg-studio-panel/50 hover:border-studio-accent/50'}
                ${switching ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
        {switching && <div className="text-[8px] text-studio-muted mt-1">Switching…</div>}
        {error && <div className="text-[8px] text-red-400 mt-1">{error}</div>}
      </div>

      <div className="text-[7px] text-studio-muted pt-1 border-t border-studio-border/30">
        Affects task derivation &amp; board objective. HoloShell parity.
      </div>
    </div>
  );
}

export default ModePanel;
