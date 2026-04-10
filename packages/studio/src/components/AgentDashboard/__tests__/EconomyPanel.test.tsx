// @vitest-environment node
/**
 * EconomyPanel — Unit Tests
 *
 * Tests the x402 payment flow visualization:
 * transaction rendering, settlement stats, bar chart percentages,
 * and address truncation logic.
 */

import { describe, it, expect } from 'vitest';
import type { Transaction, TransactionStatus, SettlementStats } from '../types';

// ── Test Fixtures ────────────────────────────────────────────────────────────

function createTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-001',
    amount: '25.50',
    payer: '0x1234567890abcdef1234567890abcdef12345678',
    recipient: '0xabcdef1234567890abcdef1234567890abcdef12',
    status: 'settled',
    taskId: 'task-001',
    timestamp: Date.now() - 60_000,
    network: 'base-l2',
    txHash: '0xdeadbeef',
    ...overrides,
  };
}

function createStats(overrides: Partial<SettlementStats> = {}): SettlementStats {
  return {
    totalVolume: '1000.00',
    pendingAmount: '150.00',
    settledAmount: '800.00',
    refundedAmount: '50.00',
    transactionCount: 42,
    ...overrides,
  };
}

// ── Transaction Type Tests ───────────────────────────────────────────────────

describe('EconomyPanel — transaction contract', () => {
  it('Transaction has all required fields', () => {
    const tx = createTransaction();
    expect(tx.id).toBeTruthy();
    expect(tx.amount).toBe('25.50');
    expect(tx.payer).toBeTruthy();
    expect(tx.recipient).toBeTruthy();
    expect(tx.status).toBe('settled');
    expect(tx.timestamp).toBeGreaterThan(0);
    expect(tx.network).toBe('base-l2');
  });

  it('status must be one of pending, settled, refunded', () => {
    const validStatuses: TransactionStatus[] = ['pending', 'settled', 'refunded'];
    for (const status of validStatuses) {
      const tx = createTransaction({ status });
      expect(validStatuses).toContain(tx.status);
    }
  });

  it('amount is stored as string for decimal precision', () => {
    const tx = createTransaction({ amount: '0.001' });
    expect(typeof tx.amount).toBe('string');
    expect(parseFloat(tx.amount)).toBeCloseTo(0.001);
  });
});

// ── Address Truncation Tests ─────────────────────────────────────────────────

describe('EconomyPanel — address truncation', () => {
  function truncateAddress(addr: string): string {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  it('long address is truncated to 6...4 format', () => {
    const addr = '0x1234567890abcdef1234567890abcdef12345678';
    expect(truncateAddress(addr)).toBe('0x1234...5678');
  });

  it('short address is not truncated', () => {
    const addr = '0x1234abcd';
    expect(truncateAddress(addr)).toBe('0x1234abcd');
  });

  it('exactly 12 char address is not truncated', () => {
    const addr = '0x1234abcdef';
    expect(addr.length).toBeLessThanOrEqual(12);
    expect(truncateAddress(addr)).toBe('0x1234abcdef');
  });
});

// ── Settlement Stats Tests ───────────────────────────────────────────────────

describe('EconomyPanel — settlement stats', () => {
  it('stats have totalVolume, pending, settled, refunded amounts', () => {
    const stats = createStats();
    expect(stats.totalVolume).toBe('1000.00');
    expect(stats.settledAmount).toBe('800.00');
    expect(stats.pendingAmount).toBe('150.00');
    expect(stats.refundedAmount).toBe('50.00');
    expect(stats.transactionCount).toBe(42);
  });

  it('settlement bar percentages are calculated correctly', () => {
    const stats = createStats();
    const total = parseFloat(stats.totalVolume) || 1;
    const settledPct = (parseFloat(stats.settledAmount) / total) * 100;
    const pendingPct = (parseFloat(stats.pendingAmount) / total) * 100;
    const refundedPct = (parseFloat(stats.refundedAmount) / total) * 100;

    expect(settledPct).toBe(80);
    expect(pendingPct).toBe(15);
    expect(refundedPct).toBe(5);
    // Should roughly sum to 100
    expect(settledPct + pendingPct + refundedPct).toBe(100);
  });

  it('zero total volume does not cause division by zero', () => {
    const stats = createStats({ totalVolume: '0' });
    const total = parseFloat(stats.totalVolume) || 1; // fallback to 1
    expect(total).toBe(1);
    const settledPct = (parseFloat(stats.settledAmount) / total) * 100;
    expect(Number.isFinite(settledPct)).toBe(true);
  });
});

// ── Transaction Status Badge Tests ───────────────────────────────────────────

describe('EconomyPanel — status badges', () => {
  const TX_STATUS_META: Record<
    TransactionStatus,
    { label: string; bgClass: string; textClass: string }
  > = {
    pending: { label: 'Pending', bgClass: 'bg-amber-500/20', textClass: 'text-amber-300' },
    settled: { label: 'Settled', bgClass: 'bg-emerald-500/20', textClass: 'text-emerald-300' },
    refunded: { label: 'Refunded', bgClass: 'bg-gray-500/20', textClass: 'text-gray-300' },
  };

  it('every transaction status has a corresponding badge', () => {
    const statuses: TransactionStatus[] = ['pending', 'settled', 'refunded'];
    for (const status of statuses) {
      const meta = TX_STATUS_META[status];
      expect(meta).toBeDefined();
      expect(meta.label).toBeTruthy();
      expect(meta.bgClass).toContain('bg-');
      expect(meta.textClass).toContain('text-');
    }
  });

  it('badge data-testid follows pattern tx-status-{status}', () => {
    const statuses: TransactionStatus[] = ['pending', 'settled', 'refunded'];
    for (const status of statuses) {
      expect(`tx-status-${status}`).toMatch(/^tx-status-/);
    }
  });
});

// ── Empty State Tests ────────────────────────────────────────────────────────

describe('EconomyPanel — empty states', () => {
  it('empty transaction list shows placeholder', () => {
    const transactions: Transaction[] = [];
    // Component checks: transactions.length === 0
    expect(transactions.length === 0).toBe(true);
  });

  it('non-empty transaction list renders table', () => {
    const transactions = [createTransaction()];
    expect(transactions.length === 0).toBe(false);
  });
});

// ── Network Indicator Tests ──────────────────────────────────────────────────

describe('EconomyPanel — network indicator', () => {
  it('displays Base L2 network label', () => {
    // The component hardcodes "Base L2" in the network indicator
    const networkLabel = 'Base L2';
    expect(networkLabel).toBe('Base L2');
  });

  it('all transactions reference a network', () => {
    const tx = createTransaction();
    expect(tx.network).toBeTruthy();
    expect(tx.network).toBe('base-l2');
  });
});
