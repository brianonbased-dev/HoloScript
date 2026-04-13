/**
 * EntityAuthority — Production Test Suite
 *
 * Covers: registration, authority queries, write access, ownership transfer
 * (request/approve/deny/force), entity locking, pending requests.
 */
import { describe, it, expect } from 'vitest';
import { EntityAuthority } from '@holoscript/core';

describe('EntityAuthority — Production', () => {
  const LOCAL = 'player-local';

  // ─── Registration ─────────────────────────────────────────────────
  it('register creates authority record', () => {
    const ea = new EntityAuthority(LOCAL);
    const rec = ea.register('e1', LOCAL);
    expect(rec.entityId).toBe('e1');
    expect(rec.ownerId).toBe(LOCAL);
    expect(rec.authorityLevel).toBe('owner');
    expect(rec.transferable).toBe(true);
  });

  it('register with custom options', () => {
    const ea = new EntityAuthority(LOCAL);
    const rec = ea.register('e1', LOCAL, { authorityLevel: 'shared', transferable: false });
    expect(rec.authorityLevel).toBe('shared');
    expect(rec.transferable).toBe(false);
  });

  it('unregister removes entity', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', LOCAL);
    expect(ea.unregister('e1')).toBe(true);
    expect(ea.getOwner('e1')).toBeUndefined();
  });

  it('unregister returns false for unknown entity', () => {
    const ea = new EntityAuthority(LOCAL);
    expect(ea.unregister('unknown')).toBe(false);
  });

  // ─── Authority Queries ────────────────────────────────────────────
  it('getOwner returns ownerId', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', 'player-b');
    expect(ea.getOwner('e1')).toBe('player-b');
  });

  it('isLocalOwner true for local player', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', LOCAL);
    expect(ea.isLocalOwner('e1')).toBe(true);
  });

  it('isLocalOwner false for remote player', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', 'remote');
    expect(ea.isLocalOwner('e1')).toBe(false);
  });

  // ─── Write Access ─────────────────────────────────────────────────
  it('hasWriteAccess true for owner', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', 'player-a');
    expect(ea.hasWriteAccess('e1', 'player-a')).toBe(true);
  });

  it('hasWriteAccess true for shared authority', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', 'player-a', { authorityLevel: 'shared' });
    expect(ea.hasWriteAccess('e1', 'player-b')).toBe(true);
  });

  it('hasWriteAccess true for server on server authority', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', 'player-a', { authorityLevel: 'server' });
    expect(ea.hasWriteAccess('e1', 'server')).toBe(true);
    expect(ea.hasWriteAccess('e1', 'player-b')).toBe(false);
  });

  it('hasWriteAccess false for non-owner non-shared', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', 'player-a', { authorityLevel: 'owner' });
    expect(ea.hasWriteAccess('e1', 'player-b')).toBe(false);
  });

  it('hasWriteAccess false for unregistered entity', () => {
    const ea = new EntityAuthority(LOCAL);
    expect(ea.hasWriteAccess('unknown', LOCAL)).toBe(false);
  });

  // ─── Owned Entities ───────────────────────────────────────────────
  it('getOwnedEntities returns all entities owned by player', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', LOCAL);
    ea.register('e2', 'other');
    ea.register('e3', LOCAL);
    expect(ea.getOwnedEntities(LOCAL).sort()).toEqual(['e1', 'e3']);
  });

  // ─── Transfer ─────────────────────────────────────────────────────
  it('requestTransfer creates pending request', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', 'remote-owner');
    const req = ea.requestTransfer('e1');
    expect(req).not.toBeNull();
    expect(req!.status).toBe('pending');
    expect(req!.requesterId).toBe(LOCAL);
  });

  it('requestTransfer returns null when already owner', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', LOCAL);
    expect(ea.requestTransfer('e1')).toBeNull();
  });

  it('requestTransfer returns null for non-transferable', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', 'remote', { transferable: false });
    expect(ea.requestTransfer('e1')).toBeNull();
  });

  it('approveTransfer changes owner', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', 'remote');
    const req = ea.requestTransfer('e1')!;
    expect(ea.approveTransfer(req.id)).toBe(true);
    expect(ea.getOwner('e1')).toBe(LOCAL);
  });

  it('denyTransfer marks request denied', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', 'remote');
    const req = ea.requestTransfer('e1')!;
    expect(ea.denyTransfer(req.id)).toBe(true);
    expect(ea.getOwner('e1')).toBe('remote'); // unchanged
  });

  it('forceTransfer overrides owner', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', LOCAL);
    expect(ea.forceTransfer('e1', 'new-owner')).toBe(true);
    expect(ea.getOwner('e1')).toBe('new-owner');
  });

  // ─── Locking ──────────────────────────────────────────────────────
  it('lockEntity prevents transfer requests', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', 'remote');
    ea.lockEntity('e1', 60_000); // 60s lock
    expect(ea.isLocked('e1')).toBe(true);
    expect(ea.requestTransfer('e1')).toBeNull();
  });

  it('unlockEntity clears lock', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', 'remote');
    ea.lockEntity('e1', 60_000);
    ea.unlockEntity('e1');
    expect(ea.isLocked('e1')).toBe(false);
  });

  // ─── Pending Requests ─────────────────────────────────────────────
  it('getPendingRequests returns only pending', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', 'remote');
    ea.register('e2', 'remote');
    ea.requestTransfer('e1');
    const r2 = ea.requestTransfer('e2')!;
    ea.denyTransfer(r2.id);
    expect(ea.getPendingRequests().length).toBe(1);
  });

  it('clearCompletedRequests removes non-pending', () => {
    const ea = new EntityAuthority(LOCAL);
    ea.register('e1', 'remote');
    const r = ea.requestTransfer('e1')!;
    ea.approveTransfer(r.id);
    ea.clearCompletedRequests();
    expect(ea.getPendingRequests().length).toBe(0);
  });
});
