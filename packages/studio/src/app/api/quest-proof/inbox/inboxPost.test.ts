/**
 * Inbox POST endpoint tests — slice B verification.
 *
 * Covers:
 * 1. buildInboxPayload — pure validation + content construction
 * 2. Round-trip property: a pushed entry (built by buildInboxPayload) is
 *    accepted by parseFounderInboxEntries (FAILING-IF-BROKEN gate).
 * 3. Tampered / absent founderInbox marker must NOT render to the founder.
 *
 * These tests are pure — no network calls, no Next.js runtime.
 */
import { describe, it, expect } from 'vitest';
import {
  buildInboxPayload,
  parseFounderInboxEntries,
  extractFeedArray,
  FounderInboxItem,
} from './parse';

// ── buildInboxPayload ────────────────────────────────────────────────────────

describe('buildInboxPayload', () => {
  it('produces a valid feed payload with founderInbox marker', () => {
    const p = buildInboxPayload({
      url: 'https://holoscript.studio/quest-proof',
      label: 'world ready',
    });
    expect(p.kind).toBe('intelligence');
    expect(p.scope).toBe('team');
    const c = JSON.parse(p.content) as Record<string, unknown>;
    expect(c.founderInbox).toBe(true);
    expect(c.url).toBe('https://holoscript.studio/quest-proof');
    expect(c.label).toBe('world ready');
    expect(c.kind).toBe('artifact'); // default
  });

  it('preserves known artifact kinds and normalizes unknown', () => {
    const known = buildInboxPayload({ url: 'https://x.io', label: 'l', kind: 'proof' });
    expect(JSON.parse(known.content).kind).toBe('proof');
    const unknown = buildInboxPayload({ url: 'https://x.io', label: 'l', kind: 'bogus' });
    expect(JSON.parse(unknown.content).kind).toBe('artifact');
  });

  it('FAILING-IF-BROKEN: rejects non-URL (cannot push junk to founder)', () => {
    expect(() => buildInboxPayload({ url: 'not-a-url', label: 'x' })).toThrow(/http\(s\) URL/);
  });

  it('FAILING-IF-BROKEN: rejects empty label', () => {
    expect(() => buildInboxPayload({ url: 'https://x.io', label: '   ' })).toThrow(
      /label is required/
    );
  });

  it('defaults state to pending-vetting and dedupKey to taskId', () => {
    const c = JSON.parse(
      buildInboxPayload({ url: 'https://x.io', label: 'l', taskId: 'task_9' }).content
    );
    expect(c.state).toBe('pending-vetting');
    expect(c.dedupKey).toBe('task_9');
  });

  it('threads an explicit state + dedupKey and falls back to kind:url for dedupKey', () => {
    const c = JSON.parse(
      buildInboxPayload({ url: 'https://x.io', label: 'l', kind: 'proof', state: 'ready' }).content
    );
    expect(c.state).toBe('ready');
    expect(c.dedupKey).toBe('proof:https://x.io');
  });

  it('round-trips state + dedupKey through parseFounderInboxEntries', () => {
    const payload = buildInboxPayload({
      url: 'https://x.io',
      label: 'l',
      taskId: 'task_rt',
      state: 'done',
    });
    const items = parseFounderInboxEntries([{ id: 'f1', content: payload.content }]);
    expect(items).toHaveLength(1);
    expect(items[0].state).toBe('done');
    expect(items[0].dedupKey).toBe('task_rt');
  });
});

// ── Round-trip: push payload → parseFounderInboxEntries ─────────────────────
//
// FAILING-IF-BROKEN: if either side changes its marker/schema and they desync,
// this test catches it immediately — push succeeds but GET returns 0 items.

describe('inbox push → parse round-trip (FAILING-IF-BROKEN)', () => {
  function simulateFeedEntry(
    payload: ReturnType<typeof buildInboxPayload>,
    overrideId = 'feed_test_123'
  ) {
    // Simulate what the team feed server wraps around our POST body.
    return { id: overrideId, content: payload.content, createdAt: new Date().toISOString() };
  }

  it('a pushed entry appears in GET inbox items', () => {
    const payload = buildInboxPayload({
      url: 'https://holoscript.studio/quest-proof',
      label: 'Slice B round-trip test',
      kind: 'proof',
      taskId: 'task_1779825718767_g2zj',
      pushedBy: 'claude1',
    });
    const feedEntry = simulateFeedEntry(payload);
    const items = parseFounderInboxEntries([feedEntry]);
    expect(items).toHaveLength(1);
    const item = items[0] as FounderInboxItem;
    expect(item.label).toBe('Slice B round-trip test');
    expect(item.url).toBe('https://holoscript.studio/quest-proof');
    expect(item.kind).toBe('proof');
    expect(item.taskId).toBe('task_1779825718767_g2zj');
    expect(item.pushedBy).toBe('claude1');
    expect(item.id).toBe('feed_test_123');
  });

  it('FAILING-IF-BROKEN: a tampered entry (founderInbox removed) does NOT render', () => {
    const payload = buildInboxPayload({ url: 'https://holoscript.studio', label: 'tamper test' });
    const tampered = JSON.parse(payload.content) as Record<string, unknown>;
    delete tampered.founderInbox; // attacker strips the marker
    const feedEntry = { id: 'feed_tampered', content: JSON.stringify(tampered) };
    expect(parseFounderInboxEntries([feedEntry])).toHaveLength(0);
  });

  it('FAILING-IF-BROKEN: a missing content entry does NOT render', () => {
    expect(parseFounderInboxEntries([{ id: 'feed_empty' }])).toHaveLength(0);
  });

  it('FAILING-IF-BROKEN: a non-founderInbox intelligence entry does NOT render', () => {
    // Ordinary agent report that happens to be kind:"intelligence"
    const ordinary = {
      id: 'feed_ordinary',
      content: JSON.stringify({ kind: 'intelligence', content: 'board report' }),
    };
    expect(parseFounderInboxEntries([ordinary])).toHaveLength(0);
  });

  it('extractFeedArray handles server response shapes', () => {
    expect(extractFeedArray({ feed: [1, 2] })).toEqual([1, 2]);
    expect(extractFeedArray({ items: [3] })).toEqual([3]);
    expect(extractFeedArray({ entries: [4] })).toEqual([4]);
    expect(extractFeedArray([5])).toEqual([5]);
    expect(extractFeedArray(null)).toEqual([]);
  });
});
