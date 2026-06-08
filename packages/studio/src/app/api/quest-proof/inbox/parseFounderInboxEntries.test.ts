import { describe, it, expect } from 'vitest';
import { parseFounderInboxEntries } from './parse';

const push = (over: Record<string, unknown> = {}) => ({
  id: (over.id as string) ?? 'f1',
  content: JSON.stringify({
    founderInbox: true,
    v: 1,
    url: 'https://holoscript.studio/quest-proof',
    label: 'world ready',
    kind: 'action',
    taskId: null,
    pushedBy: 'claude',
    ts: '2026-05-26T20:00:00.000Z',
    ...over,
  }),
});

describe('parseFounderInboxEntries', () => {
  it('extracts a founderInbox feed entry into an inbox item', () => {
    const items = parseFounderInboxEntries([push()]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      label: 'world ready',
      url: 'https://holoscript.studio/quest-proof',
      kind: 'action',
    });
  });

  it('FAILING-IF-BROKEN: a non-founderInbox feed entry is NOT rendered', () => {
    const ordinary = {
      id: 'x',
      content: JSON.stringify({ kind: 'intelligence', content: 'board report' }),
    };
    expect(parseFounderInboxEntries([ordinary])).toHaveLength(0);
  });

  it('rejects junk: non-URL or empty label never reaches the founder', () => {
    expect(parseFounderInboxEntries([push({ url: 'not-a-url' })])).toHaveLength(0);
    expect(parseFounderInboxEntries([push({ label: '   ' })])).toHaveLength(0);
  });

  it('newest-first and capped by limit', () => {
    const items = parseFounderInboxEntries(
      [
        push({ id: 'a', label: 'older', ts: '2026-05-26T10:00:00.000Z' }),
        push({ id: 'b', label: 'newer', ts: '2026-05-26T22:00:00.000Z' }),
      ],
      1
    );
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('newer');
  });

  it('tolerates malformed content + non-array input', () => {
    expect(parseFounderInboxEntries([{ id: 'bad', content: '{not json' }])).toHaveLength(0);
    expect(parseFounderInboxEntries(null)).toHaveLength(0);
  });

  // ── State machine + idempotency (P0, founder-gate) ──────────────────────────

  it('defaults state to pending-vetting and derives dedupKey from taskId', () => {
    const items = parseFounderInboxEntries([push({ id: 'f1', taskId: 'task_42' })]);
    expect(items).toHaveLength(1);
    expect(items[0].state).toBe('pending-vetting');
    expect(items[0].dedupKey).toBe('task_42');
  });

  it('derives dedupKey from kind:url when no taskId or dedupKey present', () => {
    const items = parseFounderInboxEntries([
      push({ id: 'f1', taskId: null, url: 'https://x.io/a', kind: 'proof' }),
    ]);
    expect(items[0].dedupKey).toBe('proof:https://x.io/a');
  });

  it('normalizes an unknown state to pending-vetting', () => {
    const items = parseFounderInboxEntries([push({ id: 'f1', state: 'bogus' })]);
    expect(items[0].state).toBe('pending-vetting');
  });

  it('IDEMPOTENT: two pushes sharing a dedupKey collapse to ONE tile', () => {
    const items = parseFounderInboxEntries([
      push({ id: 'f1', dedupKey: 'k1', label: 'first', ts: '2026-05-26T10:00:00.000Z' }),
      push({ id: 'f2', dedupKey: 'k1', label: 'second', ts: '2026-05-26T11:00:00.000Z' }),
    ]);
    expect(items).toHaveLength(1);
  });

  it('STATE ADVANCES: a later ready/done push supersedes the earlier pending-vetting tile', () => {
    // Out-of-order ts on purpose: state rank wins over recency.
    const items = parseFounderInboxEntries([
      push({ id: 'f1', dedupKey: 'k1', state: 'done', ts: '2026-05-26T10:00:00.000Z' }),
      push({ id: 'f2', dedupKey: 'k1', state: 'pending-vetting', ts: '2026-05-26T12:00:00.000Z' }),
      push({ id: 'f3', dedupKey: 'k1', state: 'ready', ts: '2026-05-26T11:00:00.000Z' }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].state).toBe('done');
    expect(items[0].id).toBe('f1');
  });

  it('SAME STATE: ties broken by newest ts', () => {
    const items = parseFounderInboxEntries([
      push({
        id: 'old',
        dedupKey: 'k1',
        state: 'ready',
        label: 'old',
        ts: '2026-05-26T10:00:00.000Z',
      }),
      push({
        id: 'new',
        dedupKey: 'k1',
        state: 'ready',
        label: 'new',
        ts: '2026-05-26T11:00:00.000Z',
      }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('new');
  });

  it('distinct dedupKeys remain separate tiles', () => {
    const items = parseFounderInboxEntries([
      push({ id: 'f1', dedupKey: 'a', label: 'A' }),
      push({ id: 'f2', dedupKey: 'b', label: 'B' }),
    ]);
    expect(items).toHaveLength(2);
  });

  // ── Pre-Vetted Approval Gate (G2 — holoscript.founder-vetting.v1) ──────────

  it('unvetted push has preVetted:false and vetting:null', () => {
    const items = parseFounderInboxEntries([push({ id: 'f1' })]);
    expect(items[0].preVetted).toBe(false);
    expect(items[0].vetting).toBeNull();
  });

  it('pre-vetted push with vetting payload exposes badge fields on the item', () => {
    const vetting = {
      schema: 'holoscript.founder-vetting.v1',
      glance: 'GPU spend approved by /founder — tests GREEN, Stage 1-4 pass',
      tests: 'GREEN',
      reviewers: ['/critic', '/founder'],
      classes: ['spend'],
      express: false,
    };
    const items = parseFounderInboxEntries([push({ id: 'f1', preVetted: true, vetting })]);
    expect(items).toHaveLength(1);
    expect(items[0].preVetted).toBe(true);
    expect(items[0].vetting).not.toBeNull();
    expect(items[0].vetting!.schema).toBe('holoscript.founder-vetting.v1');
    expect(items[0].vetting!.tests).toBe('GREEN');
    expect(items[0].vetting!.reviewers).toEqual(['/critic', '/founder']);
    expect(items[0].vetting!.glance).toContain('GPU spend');
    expect(items[0].vetting!.express).toBe(false);
  });

  it('express-lane push is correctly flagged in the vetting summary', () => {
    const vetting = {
      schema: 'holoscript.founder-vetting.v1',
      glance: 'prod rollback — reversible, time-critical, Stage-3 deferred',
      tests: 'GREEN',
      reviewers: ['/critic'],
      classes: [],
      express: true,
    };
    const items = parseFounderInboxEntries([push({ id: 'f1', preVetted: true, vetting })]);
    expect(items[0].vetting!.express).toBe(true);
  });

  it('preVetted:true with no vetting payload yields preVetted:true and vetting:null (backward-compat)', () => {
    // An older payload might set preVetted but omit the vetting object.
    const items = parseFounderInboxEntries([
      push({ id: 'f1', preVetted: true }), // no vetting key
    ]);
    expect(items[0].preVetted).toBe(true);
    expect(items[0].vetting).toBeNull();
  });

  it('malformed vetting object (not an object) falls back to vetting:null', () => {
    const items = parseFounderInboxEntries([
      push({ id: 'f1', preVetted: true, vetting: 'corrupt-string' }),
    ]);
    expect(items[0].preVetted).toBe(true);
    expect(items[0].vetting).toBeNull();
  });
});
