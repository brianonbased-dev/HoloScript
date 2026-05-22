import { describe, it, expect } from 'vitest';
import {
  negotiateRepresentation,
  resolveGrantedScope,
  hasValidAgentCard,
  hashWorldState,
  buildPortalEntryReceipt,
  sealPortalEntryReceipt,
  type ThresholdConnection,
} from '../holo-portal-threshold.js';
import type { SpatialPolicy } from '../holo-portal-intent.js';

describe('hasValidAgentCard', () => {
  it('requires a non-empty string id', () => {
    expect(hasValidAgentCard({ id: 'agent-1' })).toBe(true);
    expect(hasValidAgentCard({ id: '' })).toBe(false);
    expect(hasValidAgentCard(null)).toBe(false);
    expect(hasValidAgentCard(undefined)).toBe(false);
  });
});

describe('negotiateRepresentation (cbxy)', () => {
  it('agent (valid A2A card) → semantic lane', () => {
    const conn: ThresholdConnection = { worldId: 'w1', agentCard: { id: 'agent-7', name: 'Scout' } };
    const d = negotiateRepresentation(conn, { defaultScope: 'mutate-zone' });
    expect(d.representation).toBe('semantic');
    expect(d.entrant.kind).toBe('agent');
    expect(d.entrant.agentCardId).toBe('agent-7');
    expect(d.entrant.id).toBe('agent-7');
  });

  it('human (no card) → webxr lane', () => {
    const conn: ThresholdConnection = { worldId: 'w1', entrantId: 'sess-9' };
    const d = negotiateRepresentation(conn);
    expect(d.representation).toBe('webxr');
    expect(d.entrant.kind).toBe('human');
    expect(d.entrant.id).toBe('sess-9');
    expect(d.entrant.agentCardId).toBeUndefined();
  });

  it('derives a human id from worldId when none given', () => {
    const d = negotiateRepresentation({ worldId: 'w2' });
    expect(d.entrant.id).toBe('human:w2');
  });
});

describe('resolveGrantedScope (never escalates above policy)', () => {
  it('grants the requested scope when allowed', () => {
    const p: SpatialPolicy = { allowedScopes: ['read-only', 'mutate-zone', 'drive-avatar'] };
    expect(resolveGrantedScope(p, 'drive-avatar')).toBe('drive-avatar');
  });

  it('caps a request above allowedScopes to the highest allowed not exceeding it', () => {
    const p: SpatialPolicy = { allowedScopes: ['read-only', 'mutate-zone'] };
    expect(resolveGrantedScope(p, 'drive-avatar')).toBe('mutate-zone');
  });

  it('falls back to defaultScope, then read-only', () => {
    expect(resolveGrantedScope({ defaultScope: 'mutate-zone' })).toBe('mutate-zone');
    expect(resolveGrantedScope(undefined)).toBe('read-only');
  });

  it('falls back to lowest allowed when nothing fits under the request', () => {
    const p: SpatialPolicy = { allowedScopes: ['drive-avatar'] };
    // requested read-only but only drive-avatar allowed → returns the lowest allowed
    expect(resolveGrantedScope(p, 'read-only')).toBe('drive-avatar');
  });
});

describe('hashWorldState (rewind anchor)', () => {
  it('is deterministic and key-order independent', () => {
    const a = hashWorldState({ x: 1, y: { b: 2, a: 3 } });
    const b = hashWorldState({ y: { a: 3, b: 2 }, x: 1 });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('differs when state differs', () => {
    expect(hashWorldState({ x: 1 })).not.toBe(hashWorldState({ x: 2 }));
  });
});

describe('portal-entry.v1 receipt (svo2)', () => {
  it('builds an entry receipt and seals it with a distinct exit hash', () => {
    const decision = negotiateRepresentation(
      { worldId: 'w1', agentCard: { id: 'agent-7' }, requestedScope: 'drive-avatar', relayTunnelId: 't-123' },
      { allowedScopes: ['read-only', 'mutate-zone', 'drive-avatar'], driveAvatar: { allow: true, maxEntities: 4 } },
    );
    const receipt = buildPortalEntryReceipt({
      worldId: 'w1',
      decision,
      entryState: { 'avatar:7': { transform: { position: { x: 0 } } } },
      relayTunnelId: 't-123',
      now: '2026-05-22T00:00:00.000Z',
    });
    expect(receipt.schemaVersion).toBe('holoscript.holoportal.portal-entry.v1');
    expect(receipt.entrant.kind).toBe('agent');
    expect(receipt.representation).toBe('semantic');
    expect(receipt.spatialScope).toBe('drive-avatar');
    expect(receipt.entryStateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(receipt.exitStateHash).toBeUndefined();
    expect(receipt.relayTunnelId).toBe('t-123');

    const sealed = sealPortalEntryReceipt(receipt, { 'avatar:7': { transform: { position: { x: 5 } } } }, '2026-05-22T00:05:00.000Z');
    expect(sealed.exitStateHash).toMatch(/^[0-9a-f]{64}$/);
    expect(sealed.exitStateHash).not.toBe(sealed.entryStateHash);
    expect(sealed.exitedAt).toBe('2026-05-22T00:05:00.000Z');
    // original entry fields preserved
    expect(sealed.entryStateHash).toBe(receipt.entryStateHash);
  });
});
