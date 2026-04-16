'use client';

/**
 * FoundationDAOPanel — @foundation_dao trait insertion + mock governance visualization.
 * Aligns with packages/core FoundationDAOConfig (quorum, voting period, liquid democracy).
 */

import { useMemo, useState } from 'react';
import { Landmark, X, Copy, Plus } from 'lucide-react';
import { useSceneStore } from '@/lib/stores';
import { COPY_FEEDBACK_DURATION } from '@/lib/ui-timings';

interface FoundationDAOPanelProps {
  onClose: () => void;
}

/** Mock proposals for UI preview only (runtime uses FoundationDAOTrait). */
const MOCK_PROPOSALS = [
  { id: 'p1', title: 'Treasury: fund biome grants', for: 72, against: 18, quorum: 100 },
  { id: 'p2', title: 'Parameter: raise quorum to 12%', for: 41, against: 52, quorum: 100 },
];

function buildDaoSnippet(opts: {
  name: string;
  quorumThreshold: number;
  votingPeriodSec: number;
  liquidDemocracy: boolean;
  tokenAddress: string;
}): string {
  const safe = opts.name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_') || 'Sovereign_DAO';
  const tokenLine =
    opts.tokenAddress.trim().length > 0
      ? `\n    tokenAddress: "${opts.tokenAddress.trim()}"`
      : '';
  return `object "${safe}" {
  @foundation_dao {
    quorumThreshold: ${opts.quorumThreshold}
    votingPeriod: ${opts.votingPeriodSec}
    liquidDemocracy: ${opts.liquidDemocracy}${tokenLine}
  }
}
`;
}

export function FoundationDAOPanel({ onClose }: FoundationDAOPanelProps) {
  const [name, setName] = useState('Sovereign_Foundation');
  const [quorumPct, setQuorumPct] = useState(10);
  const [periodDays, setPeriodDays] = useState(3);
  const [liquid, setLiquid] = useState(false);
  const [tokenAddress, setTokenAddress] = useState('');
  const [copied, setCopied] = useState(false);

  const setCode = useSceneStore((s) => s.setCode);
  const code = useSceneStore((s) => s.code) ?? '';

  const votingPeriodSec = Math.max(60, Math.round(periodDays * 86400));
  const quorumThreshold = Math.min(0.5, Math.max(0.01, quorumPct / 100));

  const snippet = useMemo(
    () =>
      buildDaoSnippet({
        name,
        quorumThreshold,
        votingPeriodSec,
        liquidDemocracy: liquid,
        tokenAddress,
      }),
    [name, quorumThreshold, votingPeriodSec, liquid, tokenAddress]
  );

  const insert = () => {
    setCode(code + `\n${snippet}\n`);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Landmark className="h-4 w-4 text-amber-400" />
        <span className="text-[12px] font-semibold">Foundation DAO</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <p className="text-[9px] leading-relaxed text-studio-muted">
          Inserts a world-level <code className="text-studio-accent">@foundation_dao</code> block for
          sovereign economy governance (quorum, voting period, optional token voting).
        </p>

        <label className="block space-y-1">
          <span className="text-[9px] font-medium text-studio-muted">Object name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-studio-border bg-studio-surface px-2 py-1.5 text-[11px] outline-none focus:border-studio-accent"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[9px] font-medium text-studio-muted">
            Quorum threshold: {quorumPct}%
          </span>
          <input
            type="range"
            min={1}
            max={50}
            value={quorumPct}
            onChange={(e) => setQuorumPct(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[9px] font-medium text-studio-muted">Voting period (days)</span>
          <input
            type="number"
            min={1}
            max={30}
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value) || 1)}
            className="w-full rounded border border-studio-border bg-studio-surface px-2 py-1.5 text-[11px] outline-none focus:border-studio-accent"
          />
        </label>

        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={liquid}
            onChange={(e) => setLiquid(e.target.checked)}
            className="rounded border-studio-border"
          />
          <span className="text-[10px] text-studio-text">Liquid democracy</span>
        </label>

        <label className="block space-y-1">
          <span className="text-[9px] font-medium text-studio-muted">
            Token address (optional, token-weighted voting)
          </span>
          <input
            value={tokenAddress}
            onChange={(e) => setTokenAddress(e.target.value)}
            placeholder="0x…"
            className="w-full rounded border border-studio-border bg-studio-surface px-2 py-1.5 font-mono text-[10px] outline-none focus:border-studio-accent"
          />
        </label>

        <div className="rounded-lg border border-studio-border bg-studio-surface/50 p-2">
          <p className="mb-2 text-[9px] font-semibold text-studio-muted">Governance preview (mock)</p>
          <ul className="space-y-2">
            {MOCK_PROPOSALS.map((p) => {
              const total = p.for + p.against || 1;
              const pctFor = Math.round((p.for / total) * 100);
              return (
                <li key={p.id} className="text-[9px]">
                  <div className="mb-0.5 line-clamp-2 text-studio-text">{p.title}</div>
                  <div className="flex h-2 overflow-hidden rounded bg-studio-border">
                    <div
                      className="bg-emerald-500/90"
                      style={{ width: `${pctFor}%` }}
                      title={`For ${p.for}`}
                    />
                    <div
                      className="bg-rose-500/80"
                      style={{ width: `${100 - pctFor}%` }}
                      title={`Against ${p.against}`}
                    />
                  </div>
                  <div className="mt-0.5 flex justify-between text-[8px] text-studio-muted">
                    <span>For {p.for}</span>
                    <span>Against {p.against}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <pre className="max-h-36 overflow-auto rounded border border-studio-border bg-black/30 p-2 text-[9px] leading-snug text-emerald-200/90">
          {snippet.trim()}
        </pre>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={insert}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-studio-accent px-3 py-2 text-[10px] font-semibold text-black hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Insert into scene
          </button>
          <button
            type="button"
            onClick={copy}
            className="flex items-center justify-center gap-1 rounded-lg border border-studio-border px-3 py-2 text-[10px] text-studio-muted hover:border-studio-accent hover:text-studio-text"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
