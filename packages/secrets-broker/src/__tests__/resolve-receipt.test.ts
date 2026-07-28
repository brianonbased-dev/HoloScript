import { describe, it, expect, vi } from 'vitest';
import {
  sealResolveReceipt,
  verifyResolveReceiptChain,
  createResolveReceiptSink,
  type SecretResolveReceipt,
} from '../resolve-receipt';
import type { SecretResolveAudit } from '../secret-resolver';

function audit(over: Partial<SecretResolveAudit> = {}): SecretResolveAudit {
  return {
    event: 'secret.resolve',
    ownerId: 'u',
    ref: 'vault:K',
    purpose: null,
    outcome: 'allowed',
    reason: null,
    at: '2026-06-08T00:00:00.000Z',
    ...over,
  };
}

function chainOf(n: number): SecretResolveReceipt[] {
  const out: SecretResolveReceipt[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    const r = sealResolveReceipt(audit({ at: `2026-06-08T00:00:0${i}.000Z` }), prev);
    out.push(r);
    prev = r.receiptHash;
  }
  return out;
}

describe('HoloKey resolve receipts (tamper-evident chain)', () => {
  it('seals an audit with prevHash + a content hash; no secret material', () => {
    const r = sealResolveReceipt(audit(), null);
    expect(r.prevHash).toBeNull();
    expect(r.receiptHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('verifies an intact chain', () => {
    expect(verifyResolveReceiptChain(chainOf(4))).toEqual({ ok: true, brokenAt: null });
  });

  it('detects a tampered field (stale receiptHash)', () => {
    const c = chainOf(4);
    c[2] = { ...c[2], outcome: 'denied' };
    expect(verifyResolveReceiptChain(c)).toEqual({ ok: false, brokenAt: 2 });
  });

  it('detects a deleted receipt (chain link breaks)', () => {
    const c = chainOf(4);
    expect(verifyResolveReceiptChain([c[0], c[1], c[3]]).ok).toBe(false);
  });

  it('detects a reorder', () => {
    const c = chainOf(4);
    expect(verifyResolveReceiptChain([c[0], c[2], c[1], c[3]]).ok).toBe(false);
  });
});

describe('createResolveReceiptSink (emit → seal → persist wire)', () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('starts empty; audit() seals each attempt onto a verifiable chain', () => {
    const sink = createResolveReceiptSink();
    expect(sink.size()).toBe(0);
    expect(sink.head()).toBeNull();

    sink.audit(audit({ outcome: 'allowed', at: '2026-06-08T00:00:00.000Z' }));
    sink.audit(
      audit({ outcome: 'denied', reason: 'AuthRequiredError', at: '2026-06-08T00:00:01.000Z' })
    );

    expect(sink.size()).toBe(2);
    expect(sink.head()).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(sink.head()).toBe(sink.chain()[1].receiptHash);
    expect(sink.chain()[0].prevHash).toBeNull();
    expect(sink.chain()[1].prevHash).toBe(sink.chain()[0].receiptHash);
    expect(sink.verify()).toEqual({ ok: true, brokenAt: null });
    // Seals allowed AND denied — the log records every attempt.
    expect(sink.chain().map((r) => r.outcome)).toEqual(['allowed', 'denied']);
  });

  it('the sealed chain is tamper-evident (a mutated field breaks verification at its index)', () => {
    const sink = createResolveReceiptSink();
    sink.audit(audit({ at: '2026-06-08T00:00:00.000Z' }));
    sink.audit(audit({ at: '2026-06-08T00:00:01.000Z' }));
    sink.audit(audit({ at: '2026-06-08T00:00:02.000Z' }));
    const tampered = sink
      .chain()
      .map((r, i) => (i === 1 ? { ...r, outcome: 'denied' as const } : r));
    expect(verifyResolveReceiptChain(tampered)).toEqual({ ok: false, brokenAt: 1 });
  });

  it('never persists without a backend (in-memory only by default — no durable claim)', () => {
    const sink = createResolveReceiptSink(); // no persist
    sink.audit(audit());
    expect(sink.size()).toBe(1); // chain exists in memory, but nothing was written anywhere
  });

  it('persist is called once per sealed receipt, in chain order', () => {
    const persisted: SecretResolveReceipt[] = [];
    const sink = createResolveReceiptSink({ persist: (r) => void persisted.push(r) });
    sink.audit(audit({ ref: 'vault:A', at: '2026-06-08T00:00:00.000Z' }));
    sink.audit(audit({ ref: 'vault:B', at: '2026-06-08T00:00:01.000Z' }));
    expect(persisted).toHaveLength(2);
    expect(persisted.map((r) => r.ref)).toEqual(['vault:A', 'vault:B']);
    expect(persisted[1].prevHash).toBe(persisted[0].receiptHash);
  });

  it('an async persist rejection is routed to onPersistError and NEVER breaks the in-memory chain', async () => {
    const onPersistError = vi.fn();
    const sink = createResolveReceiptSink({
      persist: () => Promise.reject(new Error('db down')),
      onPersistError,
    });
    sink.audit(audit());
    sink.audit(audit({ at: '2026-06-08T00:00:01.000Z' }));
    await flush();
    expect(onPersistError).toHaveBeenCalledTimes(2);
    // The chain is authoritative regardless of durable-write failure.
    expect(sink.size()).toBe(2);
    expect(sink.verify().ok).toBe(true);
  });

  it('sealed receipts carry no secret material (only owner, ref, outcome, reason, time, hashes)', () => {
    const sink = createResolveReceiptSink();
    sink.audit(audit());
    const keys = Object.keys(sink.chain()[0]).sort();
    expect(keys).toEqual(
      [
        'at',
        'event',
        'outcome',
        'ownerId',
        'prevHash',
        'purpose',
        'reason',
        'receiptHash',
        'ref',
      ].sort()
    );
  });
});
