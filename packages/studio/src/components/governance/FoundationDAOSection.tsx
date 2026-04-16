'use client';

/**
 * Foundation DAO — builder controls for @foundation_dao / sovereign economy provisioning.
 * Binds to scene graph trait properties (quorum, voting period, treasury preview).
 */

import { useCallback, useMemo, useState } from 'react';
import { Landmark, Plus, Trash2 } from 'lucide-react';
import { useEditorStore, useSceneGraphStore } from '@/lib/stores';

const DEFAULT_DAO: Record<string, unknown> = {
  quorumThreshold: 0.1,
  votingPeriod: 259200,
  liquidDemocracy: false,
  tokenAddress: '',
};

function parseDaoProps(p: Record<string, unknown>) {
  return {
    quorumThreshold:
      typeof p.quorumThreshold === 'number' ? p.quorumThreshold : Number(DEFAULT_DAO.quorumThreshold),
    votingPeriod:
      typeof p.votingPeriod === 'number' ? p.votingPeriod : Number(DEFAULT_DAO.votingPeriod),
    liquidDemocracy: Boolean(p.liquidDemocracy),
    tokenAddress: typeof p.tokenAddress === 'string' ? p.tokenAddress : '',
  };
}

interface PreviewProposal {
  id: string;
  label: string;
  votesFor: number;
  votesAgainst: number;
}

export function FoundationDAOSection() {
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const nodes = useSceneGraphStore((s) => s.nodes);
  const addTrait = useSceneGraphStore((s) => s.addTrait);
  const removeTrait = useSceneGraphStore((s) => s.removeTrait);
  const setTraitProperty = useSceneGraphStore((s) => s.setTraitProperty);

  const selected = selectedId ? nodes.find((n) => n.id === selectedId) : null;
  const daoTrait = selected?.traits.find((t) => t.name === 'foundation_dao');
  const cfg = daoTrait ? parseDaoProps(daoTrait.properties) : null;

  const [preview, setPreview] = useState<PreviewProposal[]>([
    { id: 'p1', label: 'Treasury allocation — region mesh LOD', votesFor: 72, votesAgainst: 18 },
    { id: 'p2', label: 'Enable x402 micropayments for traits', votesFor: 41, votesAgainst: 39 },
  ]);

  const treasuryHint = useMemo(() => {
    if (!cfg) return 0;
    return Math.round(cfg.quorumThreshold * 100);
  }, [cfg]);

  const attachDao = useCallback(() => {
    if (!selectedId) return;
    addTrait(selectedId, { name: 'foundation_dao', properties: { ...DEFAULT_DAO } });
  }, [addTrait, selectedId]);

  const setNum = useCallback(
    (key: string, value: number) => {
      if (!selectedId || !daoTrait) return;
      setTraitProperty(selectedId, 'foundation_dao', key, value);
    },
    [daoTrait, selectedId, setTraitProperty]
  );

  const setStr = useCallback(
    (key: string, value: string) => {
      if (!selectedId || !daoTrait) return;
      setTraitProperty(selectedId, 'foundation_dao', key, value);
    },
    [daoTrait, selectedId, setTraitProperty]
  );

  const setBool = useCallback(
    (key: string, value: boolean) => {
      if (!selectedId || !daoTrait) return;
      setTraitProperty(selectedId, 'foundation_dao', key, value);
    },
    [daoTrait, selectedId, setTraitProperty]
  );

  if (!selectedId || !selected) {
    return (
      <div className="p-4 text-center text-xs text-studio-muted">
        Select an object in the scene to attach or edit <code className="text-studio-accent">@foundation_dao</code>.
      </div>
    );
  }

  if (!daoTrait || !cfg) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <p className="text-xs text-studio-muted leading-relaxed">
          Provision sovereign economy governance on <span className="text-studio-text">{selected.name}</span>.
        </p>
        <button
          type="button"
          onClick={attachDao}
          className="flex items-center justify-center gap-2 rounded-lg bg-studio-accent/20 px-3 py-2 text-xs font-medium text-studio-accent hover:bg-studio-accent/30"
        >
          <Landmark className="h-4 w-4" />
          Attach foundation_dao trait
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-3 text-xs text-studio-text">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-studio-text">Node</span>
        <span className="truncate text-studio-muted">{selected.name}</span>
      </div>

      <div className="space-y-3 rounded-lg border border-studio-border bg-studio-surface/80 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-studio-muted">
          Parameters
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-studio-muted">Quorum threshold</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0.01}
              max={1}
              step={0.01}
              value={cfg.quorumThreshold}
              onChange={(e) => setNum('quorumThreshold', parseFloat(e.target.value))}
              className="flex-1 accent-studio-accent"
            />
            <span className="w-10 text-right tabular-nums">{(cfg.quorumThreshold * 100).toFixed(0)}%</span>
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-studio-muted">Voting period (seconds)</span>
          <input
            type="number"
            min={60}
            step={60}
            value={cfg.votingPeriod}
            onChange={(e) => setNum('votingPeriod', parseInt(e.target.value, 10) || 60)}
            className="rounded border border-studio-border bg-studio-bg px-2 py-1 text-studio-text outline-none focus:ring-1 focus:ring-studio-accent/40"
          />
        </label>
        <div className="flex items-center justify-between gap-2">
          <span className="text-studio-muted">Liquid democracy</span>
          <button
            type="button"
            aria-label="Toggle liquid democracy"
            onClick={() => setBool('liquidDemocracy', !cfg.liquidDemocracy)}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              cfg.liquidDemocracy ? 'bg-studio-accent' : 'bg-studio-border'
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                cfg.liquidDemocracy ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-studio-muted">Token address (optional)</span>
          <input
            type="text"
            value={cfg.tokenAddress}
            onChange={(e) => setStr('tokenAddress', e.target.value)}
            placeholder="0x…"
            className="rounded border border-studio-border bg-studio-bg px-2 py-1 font-mono text-[11px] text-studio-text outline-none focus:ring-1 focus:ring-studio-accent/40"
          />
        </label>
      </div>

      <div className="rounded-lg border border-studio-border bg-studio-surface/80 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-studio-muted">
            Governance preview
          </span>
          <span className="text-[10px] text-studio-muted">quorum ≈ {treasuryHint}%</span>
        </div>
        <p className="mb-3 text-[11px] leading-snug text-studio-muted">
          Illustrative vote bars for studio preview — runtime executes on HoloScript / VRR pipeline.
        </p>
        <ul className="space-y-2">
          {preview.map((p) => {
            const total = p.votesFor + p.votesAgainst || 1;
            const forPct = (p.votesFor / total) * 100;
            return (
              <li key={p.id} className="rounded border border-studio-border/60 bg-studio-bg/50 p-2">
                <div className="mb-1 text-[11px] text-studio-text">{p.label}</div>
                <div
                  className="grid h-2 w-full overflow-hidden rounded-full bg-studio-border"
                  style={{
                    gridTemplateColumns: `${Math.min(100, Math.max(0, forPct))}fr ${Math.max(0, 100 - Math.min(100, Math.max(0, forPct)))}fr`,
                  }}
                >
                  <div className="min-h-0 bg-emerald-500/80" />
                  <div className="min-h-0 bg-transparent" />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-studio-muted">
                  <span>For {p.votesFor}</span>
                  <span>Against {p.votesAgainst}</span>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() =>
              setPreview((prev) => [
                ...prev,
                {
                  id: `demo_${Date.now()}`,
                  label: `Demo proposal ${prev.length + 1}`,
                  votesFor: 20 + Math.floor(Math.random() * 40),
                  votesAgainst: 5 + Math.floor(Math.random() * 25),
                },
              ])
            }
            className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-studio-border px-2 py-1.5 text-[11px] hover:bg-studio-surface"
          >
            <Plus className="h-3.5 w-3.5" />
            Add demo row
          </button>
          <button
            type="button"
            onClick={() => setPreview((p) => p.slice(0, -1))}
            disabled={preview.length === 0}
            className="inline-flex items-center justify-center rounded border border-studio-border px-2 py-1.5 text-studio-muted hover:text-studio-text disabled:opacity-40"
            title="Remove last row"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => removeTrait(selectedId, 'foundation_dao')}
        className="text-[11px] text-red-400/90 hover:text-red-300"
      >
        Remove foundation_dao from this node
      </button>
    </div>
  );
}
