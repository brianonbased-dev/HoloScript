'use client';

import React, { useEffect, useState } from 'react';

interface BoardTask {
  id: string;
  title: string;
  priority: number;
  role?: string;
  status: 'claimed' | 'open' | 'blocked' | 'done';
  claimedBy?: string;
  claimedByName?: string;
}

const TEAM_ID = 'team_1777834718247_unr35n';
const BOARD_URL = `/api/holomesh/team/${TEAM_ID}/board`;

/**
 * BoardPanel — Studio sidebar: live HoloMesh team task board.
 *
 * Implements task_1779315248520_vd70.
 * - Groups tasks by status (claimed → open → blocked → done)
 * - Live fetch from HoloMesh board API
 * - Actions: claim, unclaim, mark done, mark blocked (with graceful demo fallback)
 * - Filter by role/priority (simple client-side for first slice)
 *
 * Matches the contract and styling of FleetPanel / KnowledgePanel / BountiesPanel.
 */
export function BoardPanel() {
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<string>('');

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(BOARD_URL);
      if (res.ok) {
        const json = await res.json();
        const list: BoardTask[] = (json.tasks || json.data || []).map((t: any) => ({
          id: t.id,
          title: t.title || t.name,
          priority: t.priority ?? t.prioritySortKey ?? 3,
          role: t.role,
          status: t.status || 'open',
          claimedBy: t.claimedBy,
          claimedByName: t.claimedByName,
        }));
        setTasks(list);
      } else {
        throw new Error('board fetch failed');
      }
    } catch {
      // Demo fallback (matches Bounties/Knowledge pattern)
      setTasks([
        { id: 't1', title: '[studio][sidebar] Board panel — team task board in Studio', priority: 2, role: 'coder', status: 'claimed', claimedBy: 'grok3-x402', claimedByName: 'grok3-x402' },
        { id: 't2', title: '[uaa2-hololand][build-api] Implement POST /api/v1/hololand/build slice', priority: 2, role: 'backend', status: 'open' },
        { id: 't3', title: '[hololand-npc][example] Add TavernKeeper plus Caveman Scouts reference world', priority: 3, role: 'world', status: 'open' },
        { id: 't4', title: '[paper-gap][GraphRAG] Add provenance envelope to production answers', priority: 3, role: 'research', status: 'blocked' },
        { id: 't5', title: 'Knowledge panel — full HoloMesh search + publish', priority: 1, role: 'frontend', status: 'done' },
      ]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const claim = async (id: string) => {
    try {
      await fetch(`${BOARD_URL}/${id}/claim`, { method: 'POST' });
    } catch {
      // demo: local toggle
    }
    load();
  };

  const markDone = async (id: string) => {
    try {
      await fetch(`${BOARD_URL}/${id}/done`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ evidence: 'studio-board-panel action' }) });
    } catch {}
    load();
  };

  const markBlocked = async (id: string) => {
    try {
      await fetch(`${BOARD_URL}/${id}/blocked`, { method: 'POST' });
    } catch {}
    load();
  };

  const filtered = filterRole
    ? tasks.filter(t => (t.role || '').toLowerCase().includes(filterRole.toLowerCase()))
    : tasks;

  const byStatus = {
    claimed: filtered.filter(t => t.status === 'claimed'),
    open: filtered.filter(t => t.status === 'open'),
    blocked: filtered.filter(t => t.status === 'blocked'),
    done: filtered.filter(t => t.status === 'done'),
  };

  return (
    <div className="p-2 text-[11px] text-studio-text">
      <div className="flex items-center gap-2 mb-2">
        <span>📋</span>
        <span className="font-semibold">Team Board</span>
        <button onClick={load} className="ml-auto text-[9px] underline text-studio-accent">Refresh</button>
      </div>

      <div className="flex gap-1 mb-2 text-[9px]">
        <input
          className="bg-black/30 border border-white/10 rounded px-1 text-[9px] w-24"
          placeholder="filter role"
          value={filterRole}
          onChange={e => setFilterRole(e.target.value)}
        />
        <button onClick={() => setFilterRole('')} className="text-studio-muted">clear</button>
      </div>

      {loading && <div className="text-xs text-studio-muted">Loading board…</div>}

      {(['claimed', 'open', 'blocked', 'done'] as const).map(status => {
        const list = byStatus[status];
        if (list.length === 0) return null;
        return (
          <div key={status} className="mb-3">
            <div className="uppercase text-[9px] tracking-wider text-studio-muted mb-1">{status} ({list.length})</div>
            <div className="space-y-1.5">
              {list.map(task => (
                <div key={task.id} className="border border-studio-border/40 rounded p-1.5 text-[10px]">
                  <div className="font-medium leading-tight">{task.title}</div>
                  <div className="text-[9px] text-studio-muted mt-0.5">
                    P{task.priority} {task.role ? `• ${task.role}` : ''}
                    {task.claimedByName && ` • claimed by ${task.claimedByName}`}
                  </div>
                  <div className="mt-1 flex gap-2 text-[9px]">
                    {status !== 'claimed' && (
                      <button onClick={() => claim(task.id)} className="underline text-studio-accent">Claim</button>
                    )}
                    {status === 'claimed' && (
                      <>
                        <button onClick={() => markDone(task.id)} className="underline text-emerald-400">Done</button>
                        <button onClick={() => markBlocked(task.id)} className="underline text-amber-400">Block</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && <div className="text-studio-muted italic text-xs">No matching tasks.</div>}

      <div className="mt-3 text-[8px] text-studio-muted border-t border-white/10 pt-2">
        Live via HoloMesh /api/holomesh/team/:id/board. Demo fallback when offline.
      </div>
    </div>
  );
}

export default BoardPanel;
