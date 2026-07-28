'use client';

/**
 * /earn — Earn Aggregator
 *
 * Canonical arc-stage destination for creator economics:
 *  - Section 1: Earnings summary + revenue by domain (from /api/holomesh/dashboard/earnings)
 *  - Section 2: Recent transactions ledger (from /api/holomesh/transactions)
 *  - Section 3: Storefront links — manage premium knowledge listings (links to /agents/me storefront)
 *
 * Auth-gated: requires a signed-in session. Non-authed visitors see a prompt to sign in.
 * Agents without a mesh registration see onboarding guidance via empty states.
 *
 * /holomesh/transactions deep-link continues to redirect to /agents/me?tab=transactions
 * and is not broken by this page.
 *
 * NOTE: This is a hand-authored .tsx (not .holo-backed). A native-authoring .holo
 * counterpart is tracked as follow-up work (holo-pages native authoring debt).
 *
 * surfaceClassification.ts entry for the orchestrator (DO NOT add here — orchestrator merges):
 *   route('/earn', 'account-workspace', 'primary', 'Creator economics: revenue, transactions, storefront.')
 * StudioNavigationId extension needed: add 'earn' to the union.
 * GlobalNavigation icon: DollarSign from lucide-react.
 */

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowUpRight,
  DollarSign,
  ExternalLink,
  Gift,
  Minus,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
} from 'lucide-react';
import { useSession } from 'next-auth/react';

// ── Types ────────────────────────────────────────────────────────────────────

interface EarningsData {
  totalRevenueCents: number;
  totalSales: number;
  uniqueBuyers: number;
  totalSpentCents: number;
  totalPurchases: number;
  byEntry: Array<{
    entryId: string;
    entryType?: string;
    domain?: string;
    sales: number;
    revenueCents: number;
  }>;
  byDomain: Record<string, number>;
}

interface Transaction {
  id: string;
  type: string;
  fromAgentId?: string | null;
  fromAgentName?: string | null;
  toAgentId?: string | null;
  toAgentName?: string | null;
  entryId?: string | null;
  amount: number;
  currency: string;
  txHash?: string | null;
  status: string;
  mcpCreatedAt?: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtUsd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function fmtDate(raw?: string | null): string {
  if (!raw) return '';
  try {
    return new Date(raw).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return raw;
  }
}

function shortId(id?: string | null): string {
  if (!id) return '';
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

const BASESCAN_TX = 'https://sepolia.basescan.org/tx/';

const DOMAIN_COLORS: Record<string, string> = {
  infrastructure: '#f59e0b',
  economy: '#10b981',
  architecture: '#6366f1',
  tooling: '#ec4899',
  research: '#8b5cf6',
  security: '#ef4444',
  default: '#06b6d4',
};

const TX_TYPE_META: Record<string, { label: string; icon: React.ReactNode; colorClass: string }> = {
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

function txMeta(type: string) {
  return (
    TX_TYPE_META[type] ?? {
      label: type,
      icon: <Minus className="h-3.5 w-3.5" />,
      colorClass: 'text-studio-muted',
    }
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-studio-border bg-studio-panel p-4">
      <div className="text-2xl font-bold font-mono" style={{ color }}>
        {value}
      </div>
      <div className="text-xs font-medium text-studio-text mt-1">{label}</div>
      {sub && <div className="text-[10px] text-studio-muted mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Section 1: Earnings Overview ──────────────────────────────────────────────

function EarningsSection({
  earnings,
  loading,
  error,
  onRefresh,
}: {
  earnings: EarningsData | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-studio-panel" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        Could not load earnings data: {error}
      </div>
    );
  }

  if (!earnings) {
    return (
      <div className="rounded-xl border border-studio-border bg-studio-panel p-10 text-center">
        <DollarSign className="mx-auto mb-3 h-8 w-8 text-studio-muted/40" />
        <p className="text-sm text-studio-muted">No earnings data yet.</p>
        <p className="mt-1 text-xs text-studio-muted/60">
          Publish premium knowledge entries to start earning.
        </p>
        <Link
          href="/agents/me?tab=contribute"
          className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
        >
          Contribute Knowledge
        </Link>
      </div>
    );
  }

  const net = earnings.totalRevenueCents - earnings.totalSpentCents;
  const domainEntries = Object.entries(earnings.byDomain ?? {}).sort((a, b) => b[1] - a[1]);
  const maxDomain = domainEntries[0]?.[1] ?? 1;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Revenue"
          value={fmtUsd(earnings.totalRevenueCents)}
          sub="from knowledge sales"
          color="#10b981"
        />
        <StatCard
          label="Total Spent"
          value={fmtUsd(earnings.totalSpentCents)}
          sub="on purchases"
          color="#8b5cf6"
        />
        <StatCard
          label="Net"
          value={fmtUsd(net)}
          sub={net >= 0 ? 'positive balance' : 'spent more than earned'}
          color={net >= 0 ? '#10b981' : '#ef4444'}
        />
        <StatCard
          label="Sales"
          value={String(earnings.totalSales)}
          sub={`${earnings.uniqueBuyers} unique buyer${earnings.uniqueBuyers !== 1 ? 's' : ''}`}
          color="#6366f1"
        />
      </div>

      {domainEntries.length > 0 && (
        <div className="rounded-xl border border-studio-border bg-studio-panel p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-medium text-studio-muted uppercase tracking-wider">
              Revenue by Domain
            </h3>
            <button
              onClick={onRefresh}
              className="text-studio-muted hover:text-studio-text transition p-1 rounded"
              title="Refresh earnings"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-3">
            {domainEntries.map(([dmn, cents]) => (
              <div key={dmn} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-xs text-studio-text capitalize truncate">
                  {dmn}
                </div>
                <div className="flex-1 h-2 rounded-full bg-studio-border overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(4, (cents / maxDomain) * 100)}%`,
                      background: DOMAIN_COLORS[dmn] ?? DOMAIN_COLORS.default,
                    }}
                  />
                </div>
                <div className="w-16 shrink-0 text-right text-xs font-mono text-studio-muted">
                  {fmtUsd(cents)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section 2: Recent Transactions ───────────────────────────────────────────

function TransactionsSection({
  txs,
  loading,
  error,
}: {
  txs: Transaction[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg bg-studio-panel" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
        Could not load transactions: {error}
      </div>
    );
  }

  if (txs.length === 0) {
    return (
      <div className="rounded-xl border border-studio-border bg-studio-panel p-10 text-center">
        <TrendingUp className="mx-auto mb-3 h-8 w-8 text-studio-muted/40" />
        <p className="text-sm text-studio-muted">No transactions yet.</p>
        <p className="mt-1 text-xs text-studio-muted/60">
          Purchases, sales, rewards, and fees will appear here.
        </p>
      </div>
    );
  }

  const visible = txs.slice(0, 20);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-studio-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-studio-border bg-studio-panel text-left text-xs text-studio-muted">
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Amount</th>
              <th className="px-4 py-2.5 font-medium hidden sm:table-cell">Counterparty</th>
              <th className="px-4 py-2.5 font-medium hidden md:table-cell">Entry</th>
              <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Date</th>
              <th className="px-4 py-2.5 font-medium hidden lg:table-cell">Status</th>
              <th className="px-4 py-2.5 font-medium">Tx</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-studio-border">
            {visible.map((tx) => {
              const meta = txMeta(tx.type);
              const counterparty =
                tx.type === 'sale'
                  ? (tx.toAgentName ?? shortId(tx.toAgentId))
                  : (tx.fromAgentName ?? shortId(tx.fromAgentId));
              return (
                <tr key={tx.id} className="hover:bg-studio-panel/50 transition">
                  <td className="px-4 py-3">
                    <span className={`flex items-center gap-1.5 font-medium ${meta.colorClass}`}>
                      {meta.icon}
                      {meta.label}
                    </span>
                  </td>
                  <td className={`px-4 py-3 font-mono font-medium ${meta.colorClass}`}>
                    {fmtUsd(tx.amount)}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-studio-muted text-xs">
                    {counterparty || '—'}
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
                      <span className="text-studio-muted">&mdash;</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-studio-muted text-xs">
                    {fmtDate(tx.mcpCreatedAt)}
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
                        className="text-studio-muted hover:text-studio-accent transition"
                        aria-label="View on BaseScan"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="text-studio-muted">&mdash;</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {txs.length > 20 && (
        <div className="text-center">
          <Link
            href="/agents/me?tab=transactions"
            className="text-xs text-studio-accent hover:underline"
          >
            View all {txs.length} transactions on your agent page
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Section 3: Storefront Management ─────────────────────────────────────────

function StorefrontSection({ earnings }: { earnings: EarningsData | null }) {
  const topEntries = (earnings?.byEntry ?? [])
    .filter((e) => e.sales > 0)
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, 5);

  return (
    <div className="rounded-xl border border-studio-border bg-studio-panel p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-studio-text">Storefront</h3>
          <p className="text-xs text-studio-muted mt-0.5">
            Your premium knowledge listings and sales performance
          </p>
        </div>
        <ShoppingBag className="h-5 w-5 text-studio-muted/40 shrink-0" />
      </div>

      {topEntries.length > 0 ? (
        <>
          <div className="space-y-2">
            {topEntries.map((entry) => (
              <Link
                key={entry.entryId}
                href={`/holomesh/entry/${entry.entryId}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-studio-border/60 bg-[#111827] px-3 py-2 hover:border-studio-accent/40 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-xs font-mono text-studio-text truncate">{entry.entryId}</div>
                  <div className="text-[10px] text-studio-muted mt-0.5">
                    {entry.domain ?? entry.entryType ?? 'knowledge'} &middot; {entry.sales}{' '}
                    {entry.sales === 1 ? 'sale' : 'sales'}
                  </div>
                </div>
                <div className="shrink-0 text-xs font-bold text-emerald-400 font-mono">
                  {fmtUsd(entry.revenueCents)}
                </div>
              </Link>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Link
              href="/agents/me?tab=profile#storefront"
              className="rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition-colors"
            >
              Manage listings
            </Link>
            <Link
              href="/agents/me?tab=contribute"
              className="rounded-lg bg-emerald-600/20 border border-emerald-600/30 px-3 py-1.5 text-xs text-emerald-400 hover:bg-emerald-600/30 transition-colors"
            >
              Add entry
            </Link>
          </div>
        </>
      ) : (
        <div className="py-6 text-center">
          <p className="text-sm text-studio-muted">No premium listings yet.</p>
          <p className="mt-1 text-xs text-studio-muted/60">
            Set a price on a knowledge entry to list it for sale in the marketplace.
          </p>
          <div className="flex justify-center gap-2 mt-4">
            <Link
              href="/agents/me?tab=contribute"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              Contribute Knowledge
            </Link>
            <Link
              href="/holomesh/marketplace"
              className="rounded-lg border border-studio-border px-4 py-2 text-xs text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition-colors"
            >
              Browse Marketplace
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inner page (needs Suspense for useSession lazy init) ──────────────────────

function EarnPageInner() {
  const { data: session, status } = useSession();

  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [earningsLoading, setEarningsLoading] = useState(true);
  const [earningsError, setEarningsError] = useState<string | null>(null);

  const [txs, setTxs] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [txError, setTxError] = useState<string | null>(null);

  const loadEarnings = useCallback(async () => {
    setEarningsLoading(true);
    setEarningsError(null);
    try {
      const r = await fetch('/api/holomesh/dashboard/earnings');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: unknown = await r.json();
      if (data && typeof data === 'object') {
        const d = data as Record<string, unknown>;
        // API may return { earnings: {...} } or the flat object directly
        const payload = (d.earnings ?? d) as EarningsData;
        setEarnings(payload);
      }
    } catch (e) {
      setEarningsError(e instanceof Error ? e.message : 'Failed to load earnings');
    } finally {
      setEarningsLoading(false);
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    setTxLoading(true);
    setTxError(null);
    try {
      const r = await fetch('/api/holomesh/transactions?limit=50');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data: unknown = await r.json();
      if (data && typeof data === 'object') {
        const d = data as Record<string, unknown>;
        setTxs(Array.isArray(d.transactions) ? (d.transactions as Transaction[]) : []);
      }
    } catch (e) {
      setTxError(e instanceof Error ? e.message : 'Failed to load transactions');
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    void loadEarnings();
    void loadTransactions();
  }, [status, loadEarnings, loadTransactions]);

  if (status === 'loading') {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-sm text-studio-muted animate-pulse">Checking session…</div>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-4">
        <DollarSign className="h-12 w-12 text-studio-muted/30" />
        <div>
          <h2 className="text-lg font-semibold text-studio-text">Sign in to view your earnings</h2>
          <p className="mt-1 text-sm text-studio-muted">
            Track revenue, transactions, and storefront performance.
          </p>
        </div>
        <Link
          href="/auth/signin?callbackUrl=/earn"
          className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-6 px-4 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-studio-text flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            Earn
          </h1>
          <p className="mt-1 text-xs text-studio-muted">
            Creator economics — revenue, transactions, and storefront management.
          </p>
        </div>
        <Link
          href="/agents/me?tab=dashboard"
          className="shrink-0 rounded-lg border border-studio-border px-3 py-1.5 text-xs text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition-colors"
        >
          Full dashboard
        </Link>
      </div>

      <section aria-label="Earnings overview">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-studio-muted mb-3">
          Earnings
        </h2>
        <EarningsSection
          earnings={earnings}
          loading={earningsLoading}
          error={earningsError}
          onRefresh={loadEarnings}
        />
      </section>

      <section aria-label="Recent transactions">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-studio-muted">
            Recent Transactions
          </h2>
          <Link
            href="/agents/me?tab=transactions"
            className="text-[10px] text-studio-accent hover:underline"
          >
            View all
          </Link>
        </div>
        <TransactionsSection txs={txs} loading={txLoading} error={txError} />
      </section>

      <section aria-label="Storefront management">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-studio-muted mb-3">
          Storefront
        </h2>
        <StorefrontSection earnings={earnings} />
      </section>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function EarnPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center">
          <div className="text-sm text-studio-muted animate-pulse">Loading…</div>
        </div>
      }
    >
      <EarnPageInner />
    </Suspense>
  );
}
