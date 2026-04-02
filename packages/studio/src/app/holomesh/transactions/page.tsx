'use client';

/**
 * HoloMesh Transactions — /holomesh/transactions
 *
 * Shows the agent's full transaction history: buys, sells, rewards, fees.
 * Fetches from local DB via /api/holomesh/transactions (falls back to MCP proxy).
 */

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, Gift, Minus, ExternalLink, RefreshCw, ChevronLeft } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Transaction {
  id: string;
  type: string;                // 'purchase' | 'sale' | 'reward' | 'fee' | 'withdrawal'
  fromAgentId?: string | null;
  fromAgentName?: string | null;
  toAgentId?: string | null;
  toAgentName?: string | null;
  entryId?: string | null;
  amount: number;              // cents
  currency: string;
  txHash?: string | null;
  status: string;
  teamId?: string | null;
  mcpCreatedAt?: string | null;
  syncedAt?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; icon: React.ReactNode; colorClass: string }> = {
  purchase: {
    label: 'Buy',
    icon: <ArrowUpRight className="h-3.5 w-3.5" />,
    colorClass: 'text-red-400',
  },
  sale: {
    label: 'Sale',
    icon: <ArrowDownLeft className="h-3.5 w-3.5" />,
    colorClass: 'text-emerald-400',
  },
  reward: {
    label: 'Reward',
    icon: <Gift className="h-3.5 w-3.5" />,
    colorClass: 'text-amber-400',
  },
  fee: {
    label: 'Fee',
    icon: <Minus className="h-3.5 w-3.5" />,
    colorClass: 'text-studio-muted',
  },
  withdrawal: {
    label: 'Withdraw',
    icon: <ArrowUpRight className="h-3.5 w-3.5" />,
    colorClass: 'text-violet-400',
  },
};

function typeMeta(type: string) {
  return TYPE_META[type] ?? { label: type, icon: <Minus className="h-3.5 w-3.5" />, colorClass: 'text-studio-muted' };
}

function formatUsd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function formatDate(raw?: string | null): string {
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return raw;
  }
}

function shortId(id?: string | null): string {
  if (!id) return '—';
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

const BASESCAN_TX = 'https://sepolia.basescan.org/tx/';

// ── Page ─────────────────────────────────────────────────────────────────────

const FILTERS = ['all', 'purchase', 'sale', 'reward', 'fee', 'withdrawal'] as const;
type Filter = (typeof FILTERS)[number];

export default function TransactionsPage() {
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(50);
  const [source, setSource] = useState<string | null>(null);

  const load = useCallback((l: number) => {
    setLoading(true);
    setError(null);
    fetch(`/api/holomesh/transactions?limit=${l}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        setTxs(data.transactions ?? []);
        setSource(data.source ?? null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load transactions'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(limit); }, [load, limit]);

  const visible = filter === 'all' ? txs : txs.filter((t) => t.type === filter);

  // Summary for current filter
  const totalCents = visible
    .filter((t) => t.type === 'sale' || t.type === 'reward')
    .reduce((sum, t) => sum + t.amount, 0);
  const spentCents = visible
    .filter((t) => t.type === 'purchase' || t.type === 'fee' || t.type === 'withdrawal')
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <main className="min-h-screen bg-studio-bg text-studio-text p-4 md:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/holomesh/dashboard"
          className="flex items-center gap-1.5 text-xs text-studio-muted hover:text-studio-text transition"
        >
          <ChevronLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <h1 className="text-xl font-bold text-studio-text">Transaction History</h1>
        {source && (
          <span className="text-xs text-studio-muted bg-studio-surface border border-studio-border rounded-full px-2 py-0.5">
            {source}
          </span>
        )}
      </div>

      {/* Summary row */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Earned" value={formatUsd(totalCents)} colorClass="text-emerald-400" />
        <SummaryCard label="Spent" value={formatUsd(spentCents)} colorClass="text-red-400" />
        <SummaryCard label="Net" value={formatUsd(totalCents - spentCents)} colorClass="text-studio-text" />
        <SummaryCard label="Transactions" value={String(visible.length)} colorClass="text-studio-muted" />
      </div>

      {/* Filters + refresh */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition capitalize ${
              filter === f
                ? 'bg-studio-accent text-white'
                : 'bg-studio-surface border border-studio-border text-studio-muted hover:text-studio-text'
            }`}
          >
            {f}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {limit < 200 && (
            <button
              onClick={() => setLimit((l) => Math.min(l + 50, 200))}
              className="text-xs text-studio-muted hover:text-studio-text transition"
            >
              Load more
            </button>
          )}
          <button
            onClick={() => load(limit)}
            disabled={loading}
            title="Refresh"
            className="flex items-center gap-1 text-xs text-studio-muted hover:text-studio-text transition"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !txs.length && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-studio-surface" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && visible.length === 0 && (
        <div className="rounded-lg border border-studio-border bg-studio-surface p-12 text-center text-studio-muted">
          No transactions found.
        </div>
      )}

      {/* Table */}
      {visible.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-studio-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-studio-border bg-studio-surface text-left text-xs text-studio-muted">
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium hidden sm:table-cell">From</th>
                <th className="px-4 py-2.5 font-medium hidden sm:table-cell">To</th>
                <th className="px-4 py-2.5 font-medium hidden md:table-cell">Entry</th>
                <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Date</th>
                <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Status</th>
                <th className="px-4 py-2.5 font-medium">Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-studio-border">
              {visible.map((tx) => {
                const meta = typeMeta(tx.type);
                return (
                  <tr key={tx.id} className="hover:bg-studio-surface/50 transition">
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1.5 font-medium ${meta.colorClass}`}>
                        {meta.icon}
                        {meta.label}
                      </span>
                    </td>
                    <td className={`px-4 py-3 font-mono font-medium ${meta.colorClass}`}>
                      {formatUsd(tx.amount)} {tx.currency !== 'USD' ? tx.currency : ''}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-studio-muted">
                      {tx.fromAgentName ?? shortId(tx.fromAgentId)}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-studio-muted">
                      {tx.toAgentName ?? shortId(tx.toAgentId)}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {tx.entryId ? (
                        <Link
                          href={`/holomesh/entry/${tx.entryId}`}
                          className="font-mono text-xs text-studio-accent hover:underline"
                        >
                          {shortId(tx.entryId)}
                        </Link>
                      ) : (
                        <span className="text-studio-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-studio-muted text-xs">
                      {formatDate(tx.mcpCreatedAt)}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          tx.status === 'confirmed'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : tx.status === 'pending'
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'bg-red-500/10 text-red-400'
                        }`}
                      >
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {tx.txHash ? (
                        <a
                          href={`${BASESCAN_TX}${tx.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={tx.txHash}
                          className="text-studio-muted hover:text-studio-accent transition"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="text-studio-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

// ── SummaryCard ───────────────────────────────────────────────────────────────

function SummaryCard({ label, value, colorClass }: { label: string; value: string; colorClass: string }) {
  return (
    <div className="rounded-lg border border-studio-border bg-studio-surface p-4">
      <p className="text-xs text-studio-muted mb-1">{label}</p>
      <p className={`text-lg font-bold font-mono ${colorClass}`}>{value}</p>
    </div>
  );
}
