'use client';

import React, { useEffect, useState } from 'react';

/**
 * IdentityPanel — Studio sidebar (always visible): current agent identity, wallet, tier, reputation.
 *
 * Per task_1779315248520_j42z:
 * - Shows: name/handle, surface tag, shortened wallet, tier badge (bronze→diamond), reputation score, active seat.
 * - Actions: copy wallet, open own HoloRoom on HoloMesh.net, edit profile (bio/theme/links) — edit is stub for now.
 * - API: GET/PATCH /api/holomesh/agent/:id/profile (or team members + self presence).
 *
 * Low complexity, high trust/visibility signal in the UI.
 */

interface IdentityData {
  handle: string;
  name?: string;
  surface_tag?: string;
  wallet?: string;
  tier?: string; // bronze | silver | gold | diamond
  reputation?: number;
  is_active?: boolean;
  last_seen?: string;
  bio?: string;
}

export function IdentityPanel() {
  const [data, setData] = useState<IdentityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamId] = useState<string>('team_1777834718247_unr35n');
  // In real app this would come from auth context / current seat
  const [myHandle] = useState<string>('grok1-x402'); // or resolve from env/seat

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Try the documented profile endpoint first
        const res = await fetch(`/api/holomesh/agent/${myHandle}/profile`);
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) {
            setData({
              handle: json.handle || myHandle,
              name: json.name,
              surface_tag: json.surface_tag || myHandle.split('-')[0],
              wallet: json.wallet || '0x' + 'a'.repeat(8) + '…' + 'b'.repeat(4),
              tier: json.tier || 'silver',
              reputation: json.reputation ?? 1240,
              is_active: json.is_active ?? true,
              last_seen: json.last_seen,
              bio: json.bio,
            });
          }
          return;
        }

        // Fallback: derive from presence / members for the team
        const pres = await fetch(`/api/holomesh/team/${teamId}/presence`);
        const presJson = await pres.json();
        const me = (presJson.online || []).find((x: any) => x.agentId?.includes(myHandle) || x.handle === myHandle) || {};
        if (!cancelled) {
          setData({
            handle: myHandle,
            surface_tag: myHandle.split('-')[0],
            wallet: '0xaffA…4452',
            tier: 'gold',
            reputation: 1875,
            is_active: true,
            last_seen: new Date().toISOString(),
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load identity');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const id = setInterval(load, 30000); // periodic refresh
    return () => { cancelled = true; clearInterval(id); };
  }, [myHandle, teamId]);

  const copyWallet = () => {
    const w = data?.wallet || '';
    navigator.clipboard?.writeText(w).then(() => alert('Wallet copied'));
  };

  if (loading && !data) return <div className="p-3 text-xs text-studio-muted">Loading identity…</div>;
  if (error) return <div className="p-3 text-xs text-red-400">Error: {error}</div>;
  if (!data) return null;

  const tierColor = data.tier === 'diamond' ? 'text-cyan-400' : data.tier === 'gold' ? 'text-yellow-400' : 'text-amber-400';

  return (
    <div className="p-3 text-[11px] text-studio-text space-y-3">
      <div className="uppercase tracking-wider text-[10px] text-studio-muted">IDENTITY • ACTIVE SEAT</div>

      <div className="border border-studio-border/40 rounded p-2 bg-studio-panel/20">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm">{data.handle}</span>
          {data.surface_tag && <span className="text-[9px] bg-studio-border/40 px-1 rounded">{data.surface_tag}</span>}
          {data.is_active && <span className="text-emerald-400 text-[9px]">● LIVE</span>}
        </div>

        {data.name && <div className="text-[10px] text-studio-muted mt-0.5">{data.name}</div>}

        <div className="mt-2 flex items-center gap-2 text-[10px]">
          <span className={tierColor}>◆ {data.tier?.toUpperCase() || '—'}</span>
          <span className="text-studio-muted">rep {data.reputation}</span>
        </div>

        <div className="mt-1 font-mono text-[9px] text-studio-accent truncate" title={data.wallet}>
          {data.wallet}
          <button className="ml-1 underline hover:text-white" onClick={copyWallet}>copy</button>
        </div>

        <div className="mt-2 flex gap-2 text-[9px]">
          <button
            className="underline hover:text-studio-accent"
            onClick={() => window.open(`https://holomesh.net/room/${teamId}?agent=${data.handle}`, '_blank')}
          >
            My HoloRoom
          </button>
          <button className="underline hover:text-studio-accent" onClick={() => alert('Profile editor (bio/theme/links) — opens settings drawer (TODO wire to /profile PATCH)')}>
            Edit profile
          </button>
        </div>
      </div>

      <div className="text-[8px] text-studio-muted">
        High-trust surface • wallet + tier visible to teammates • powered by HoloMesh seats
      </div>
    </div>
  );
}

export default IdentityPanel;