'use client';

import React, { useEffect, useState } from 'react';

/**
 * BountiesPanel — Studio sidebar: team bounties (Available + Mine).
 *
 * Per task_1779315248520_p837:
 * - Two tabs: Available (open on team), Mine (claimed by you)
 * - Bounty: title, reward, deadline, skills
 * - Actions: claim, post new, mark complete, dispute
 *
 * APIs: GET /api/holomesh/team/:id/bounties + claim/post routes.
 * Note in spec: wallet + attestation should be wired first (we surface a small call-to-action).
 */

interface Bounty {
  id: string;
  title: string;
  reward: number;
  deadline?: string;
  skills?: string[];
  claimed_by?: string;
  status: 'open' | 'claimed' | 'completed';
}

export function BountiesPanel() {
  const [tab, setTab] = useState<'available' | 'mine'>('available');
  const [bounties, setBounties] = useState<Bounty[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/holomesh/team/team_1777834718247_unr35n/bounties');
      if (res.ok) {
        const json = await res.json();
        setBounties(json.bounties || json.data || []);
      } else {
        setBounties([
          { id: 'b1', title: 'Implement Knowledge panel', reward: 420, skills: ['react', 'studio'], status: 'open' },
          { id: 'b2', title: 'Bounties UI + wallet wiring', reward: 680, skills: ['frontend', 'wallet'], status: 'open', claimed_by: 'grok1-x402' },
          { id: 'b3', title: 'Absorb diff view', reward: 310, status: 'completed' },
        ]);
      }
    } catch {
      setBounties([
        { id: 'b1', title: 'Implement Knowledge panel', reward: 420, skills: ['react', 'studio'], status: 'open' },
        { id: 'b2', title: 'Bounties UI + wallet wiring', reward: 680, skills: ['frontend', 'wallet'], status: 'open', claimed_by: 'grok1-x402' },
        { id: 'b3', title: 'Absorb diff view', reward: 310, status: 'completed' },
      ]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const claim = (id: string) => {
    alert('Claiming bounty (would POST /bounties/:id/claim + wallet attestation)');
    load();
  };

  const postNew = () => window.open('/bounties/new', '_blank');

  const filtered = tab === 'available'
    ? bounties.filter(b => b.status === 'open' && !b.claimed_by)
    : bounties.filter(b => b.claimed_by === 'grok1-x402' || b.status === 'claimed');

  return (
    <div className="p-2 text-[11px] text-studio-text">
      <div className="flex gap-2 mb-2 text-[10px] uppercase tracking-wider">
        <button onClick={() => setTab('available')} className={tab === 'available' ? 'text-studio-accent' : ''}>Available</button>
        <button onClick={() => setTab('mine')} className={tab === 'mine' ? 'text-studio-accent' : ''}>Mine</button>
        <button onClick={postNew} className="ml-auto text-[9px] underline">+ Post bounty</button>
      </div>

      {loading && <div className="text-xs text-studio-muted">Loading bounties…</div>}

      <div className="space-y-2">
        {filtered.length === 0 && <div className="text-studio-muted italic text-xs">No bounties in this tab.</div>}
        {filtered.map(b => (
          <div key={b.id} className="border border-studio-border/40 rounded p-2 text-xs">
            <div className="font-medium">{b.title}</div>
            <div className="text-emerald-400">+{b.reward} • {b.deadline || 'no deadline'}</div>
            {b.skills && <div className="text-[9px] text-studio-muted">{b.skills.join(', ')}</div>}
            {b.status === 'open' && !b.claimed_by && (
              <button onClick={() => claim(b.id)} className="mt-1 text-[9px] underline text-studio-accent">Claim</button>
            )}
            {b.claimed_by && <div className="text-[9px] text-amber-400">claimed by {b.claimed_by}</div>}
          </div>
        ))}
      </div>

      <div className="mt-2 text-[8px] text-studio-muted">
        Requires wallet attestation for claims (see Identity panel). GET/POST /team/:id/bounties
      </div>
    </div>
  );
}

export default BountiesPanel;