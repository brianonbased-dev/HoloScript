'use client';

/**
 * EconomyPanel — x402 Payment Flow Visualization
 *
 * Displays recent transactions table, settlement statistics,
 * and Base L2 network indicator for the agent economy.
 */

import React from 'react';
import {
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  RotateCcw,
  Layers,
} from 'lucide-react';
import type { Transaction, TransactionStatus, SettlementStats } from './types';

export interface EconomyPanelProps {
  transactions: Transaction[];
  stats: SettlementStats;
  className?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const TX_STATUS_META: Record<
  TransactionStatus,
  { label: string; bgClass: string; textClass: string; Icon: typeof Clock }
> = {
  pending: {
    label: 'Pending',
    bgClass: 'bg-amber-500/20',
    textClass: 'text-amber-300',
    Icon: Clock,
  },
  settled: {
    label: 'Settled',
    bgClass: 'bg-emerald-500/20',
    textClass: 'text-emerald-300',
    Icon: CheckCircle2,
  },
  refunded: {
    label: 'Refunded',
    bgClass: 'bg-gray-500/20',
    textClass: 'text-gray-300',
    Icon: RotateCcw,
  },
};

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/** Single stat box */
function StatBox({
  label,
  value,
  variant = 'default',
}: {
  label: string;
  value: string;
  variant?: 'default' | 'accent' | 'warning' | 'muted';
}) {
  const variantClasses: Record<string, string> = {
    default: 'text-studio-text',
    accent: 'text-emerald-400',
    warning: 'text-amber-400',
    muted: 'text-studio-muted',
  };

  return (
    <div className="flex flex-col p-2 rounded-md bg-studio-panel/30 border border-studio-border/20">
      <span className="text-[9px] text-studio-muted uppercase tracking-wider">{label}</span>
      <span className={`text-sm font-bold ${variantClasses[variant]}`}>{value}</span>
    </div>
  );
}

/** Horizontal bar chart segment (CSS-only) */
function SettlementBar({ stats }: { stats: SettlementStats }) {
  const total = parseFloat(stats.totalVolume) || 1;
  const settled = parseFloat(stats.settledAmount) || 0;
  const pending = parseFloat(stats.pendingAmount) || 0;
  const refunded = parseFloat(stats.refundedAmount) || 0;

  const settledPct = (settled / total) * 100;
  const pendingPct = (pending / total) * 100;
  const refundedPct = (refunded / total) * 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[9px] text-studio-muted">
        <span>Settlement Distribution</span>
        <span>{stats.transactionCount} transactions</span>
      </div>
      <div
        className="flex h-3 rounded-full overflow-hidden bg-studio-border/20"
        role="img"
        aria-label={`Settlement: ${settledPct.toFixed(0)}% settled, ${pendingPct.toFixed(0)}% pending, ${refundedPct.toFixed(0)}% refunded`}
      >
        {settledPct > 0 && (
          <div
            className="bg-emerald-500/70 transition-all duration-500"
            style={{ width: `${settledPct}%` }}
            data-testid="bar-settled"
          />
        )}
        {pendingPct > 0 && (
          <div
            className="bg-amber-500/70 transition-all duration-500"
            style={{ width: `${pendingPct}%` }}
            data-testid="bar-pending"
          />
        )}
        {refundedPct > 0 && (
          <div
            className="bg-gray-500/70 transition-all duration-500"
            style={{ width: `${refundedPct}%` }}
            data-testid="bar-refunded"
          />
        )}
      </div>
      <div className="flex gap-3 text-[8px]">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500/70" />
          <span className="text-studio-muted">Settled ({settledPct.toFixed(0)}%)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-500/70" />
          <span className="text-studio-muted">Pending ({pendingPct.toFixed(0)}%)</span>
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-gray-500/70" />
          <span className="text-studio-muted">Refunded ({refundedPct.toFixed(0)}%)</span>
        </span>
      </div>
    </div>
  );
}

/** Transaction row */
function TransactionRow({ tx }: { tx: Transaction }) {
  const meta = TX_STATUS_META[tx.status];
  const StatusIcon = meta.Icon;
  const isIncoming = true; // Simplified - in real app would compare to current agent

  return (
    <tr className="border-b border-studio-border/10 hover:bg-studio-panel/20 transition-colors">
      <td className="py-1.5 px-2">
        <div className="flex items-center gap-1">
          {isIncoming ? (
            <ArrowDownRight className="h-3 w-3 text-emerald-400" />
          ) : (
            <ArrowUpRight className="h-3 w-3 text-red-400" />
          )}
          <span className="text-[11px] font-mono font-semibold text-studio-text">
            {tx.amount} USDC
          </span>
        </div>
      </td>
      <td className="py-1.5 px-2">
        <span
          className="text-[10px] text-studio-muted truncate block max-w-[100px]"
          title={tx.payer}
        >
          {truncateAddress(tx.payer)}
        </span>
      </td>
      <td className="py-1.5 px-2">
        <span
          className="text-[10px] text-studio-muted truncate block max-w-[100px]"
          title={tx.recipient}
        >
          {truncateAddress(tx.recipient)}
        </span>
      </td>
      <td className="py-1.5 px-2">
        <span
          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${meta.bgClass} ${meta.textClass}`}
          data-testid={`tx-status-${tx.status}`}
        >
          <StatusIcon className="h-2.5 w-2.5" />
          {meta.label}
        </span>
      </td>
      <td className="py-1.5 px-2 text-[9px] text-studio-muted/60 whitespace-nowrap">
        {new Date(tx.timestamp).toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
        })}
      </td>
    </tr>
  );
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function EconomyPanel({ transactions, stats, className = '' }: EconomyPanelProps) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Header with network indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-studio-accent" />
          <h3 className="text-sm font-semibold text-studio-text">Economy</h3>
        </div>
        <div
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-blue-500/10 border border-blue-500/20"
          title="Base L2 Network"
        >
          <Layers className="h-3 w-3 text-blue-400" />
          <span className="text-[9px] font-medium text-blue-300">Base L2</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Total Volume" value={`$${stats.totalVolume}`} variant="default" />
        <StatBox label="Settled" value={`$${stats.settledAmount}`} variant="accent" />
        <StatBox label="Pending" value={`$${stats.pendingAmount}`} variant="warning" />
        <StatBox label="Refunded" value={`$${stats.refundedAmount}`} variant="muted" />
      </div>

      {/* Settlement bar chart */}
      <SettlementBar stats={stats} />

      {/* Transaction table */}
      <div className="space-y-1.5">
        <h4 className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider">
          Recent Transactions
        </h4>
        {transactions.length === 0 ? (
          <div className="text-center text-studio-muted text-[11px] py-4">No transactions yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" role="table">
              <thead>
                <tr className="border-b border-studio-border/20">
                  <th className="text-left text-[9px] text-studio-muted font-medium py-1 px-2">
                    Amount
                  </th>
                  <th className="text-left text-[9px] text-studio-muted font-medium py-1 px-2">
                    Payer
                  </th>
                  <th className="text-left text-[9px] text-studio-muted font-medium py-1 px-2">
                    Recipient
                  </th>
                  <th className="text-left text-[9px] text-studio-muted font-medium py-1 px-2">
                    Status
                  </th>
                  <th className="text-left text-[9px] text-studio-muted font-medium py-1 px-2">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
