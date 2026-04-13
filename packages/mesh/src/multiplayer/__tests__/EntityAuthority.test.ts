import { describe, it, expect, beforeEach } from 'vitest';
import { EntityAuthority } from '../EntityAuthority';

describe('EntityAuthority', () => {
  let auth: EntityAuthority;

  beforeEach(() => {
    auth = new EntityAuthority('player-local');
  });

  // ===========================================================================
  // Registration
  // ===========================================================================
  describe('registration', () => {
    it('registers an entity', () => {
      const record = auth.register('entity-1', 'player-local');
      expect(record.entityId).toBe('entity-1');
      expect(record.ownerId).toBe('player-local');
      expect(record.authorityLevel).toBe('owner');
      expect(record.transferable).toBe(true);
    });

    it('registers with custom options', () => {
      const record = auth.register('entity-2', 'other', {
        authorityLevel: 'shared',
        transferable: false,
      });
      expect(record.authorityLevel).toBe('shared');
      expect(record.transferable).toBe(false);
    });

    it('unregisters an entity', () => {
      auth.register('entity-1', 'player-local');
      expect(auth.unregister('entity-1')).toBe(true);
      expect(auth.getOwner('entity-1')).toBeUndefined();
    });

    it('unregister returns false for unknown entity', () => {
      expect(auth.unregister('nonexistent')).toBe(false);
    });
  });

  // ===========================================================================
  // Authority Queries
  // ===========================================================================
  describe('queries', () => {
    beforeEach(() => {
      auth.register('e1', 'player-local');
      auth.register('e2', 'player-remote', { authorityLevel: 'shared' });
      auth.register('e3', 'server', { authorityLevel: 'server' });
    });

    it('getOwner returns owner id', () => {
      expect(auth.getOwner('e1')).toBe('player-local');
    });

    it('getOwner returns undefined for unknown', () => {
      expect(auth.getOwner('nope')).toBeUndefined();
    });

    it('getAuthority returns full record', () => {
      const record = auth.getAuthority('e1');
      expect(record).toBeDefined();
      expect(record!.authorityLevel).toBe('owner');
    });

    it('isLocalOwner is true for locally owned entities', () => {
      expect(auth.isLocalOwner('e1')).toBe(true);
      expect(auth.isLocalOwner('e2')).toBe(false);
    });

    it('hasWriteAccess for owner', () => {
      expect(auth.hasWriteAccess('e1', 'player-local')).toBe(true);
      expect(auth.hasWriteAccess('e1', 'player-remote')).toBe(false);
    });

    it('hasWriteAccess for shared', () => {
      expect(auth.hasWriteAccess('e2', 'anyone')).toBe(true);
    });

    it('hasWriteAccess for server-only', () => {
      expect(auth.hasWriteAccess('e3', 'server')).toBe(true);
      expect(auth.hasWriteAccess('e3', 'player-local')).toBe(false);
    });

    it('hasWriteAccess returns false for unknown entity', () => {
      expect(auth.hasWriteAccess('nope', 'player-local')).toBe(false);
    });

    it('getOwnedEntities', () => {
      auth.register('e4', 'player-local');
      const owned = auth.getOwnedEntities('player-local');
      expect(owned).toContain('e1');
      expect(owned).toContain('e4');
      expect(owned).not.toContain('e2');
    });
  });

  // ===========================================================================
  // Authority Transfer
  // ===========================================================================
  describe('transfer', () => {
    beforeEach(() => {
      auth.register('e1', 'player-remote');
    });

    it('requestTransfer creates a pending request', () => {
      const req = auth.requestTransfer('e1', 'interaction');
      expect(req).not.toBeNull();
      expect(req!.status).toBe('pending');
      expect(req!.requesterId).toBe('player-local');
      expect(req!.fromOwnerId).toBe('player-remote');
    });

    it('requestTransfer returns null for own entity', () => {
      auth.register('e-own', 'player-local');
      expect(auth.requestTransfer('e-own')).toBeNull();
    });

    it('requestTransfer returns null for non-transferable entity', () => {
      auth.register('e-locked', 'player-remote', { transferable: false });
      expect(auth.requestTransfer('e-locked')).toBeNull();
    });

    it('requestTransfer returns null for unknown entity', () => {
      expect(auth.requestTransfer('nope')).toBeNull();
    });

    it('approveTransfer changes ownership', () => {
      const req = auth.requestTransfer('e1')!;
      expect(auth.approveTransfer(req.id)).toBe(true);
      expect(auth.getOwner('e1')).toBe('player-local');
      expect(req.status).toBe('approved');
    });

    it('denyTransfer keeps ownership', () => {
      const req = auth.requestTransfer('e1')!;
      expect(auth.denyTransfer(req.id)).toBe(true);
      expect(auth.getOwner('e1')).toBe('player-remote');
      expect(req.status).toBe('denied');
    });

    it('forceTransfer overrides ownership', () => {
      expect(auth.forceTransfer('e1', 'player-3')).toBe(true);
      expect(auth.getOwner('e1')).toBe('player-3');
    });

    it('forceTransfer returns false for unknown entity', () => {
      expect(auth.forceTransfer('nope', 'x')).toBe(false);
    });
  });

  // ===========================================================================
  // Locking
  // ===========================================================================
  describe('locking', () => {
    beforeEach(() => {
      auth.register('e1', 'player-remote');
    });

    it('lockEntity sets expiry', () => {
      expect(auth.lockEntity('e1', 5000)).toBe(true);
      expect(auth.isLocked('e1')).toBe(true);
    });

    it('unlockEntity clears expiry', () => {
      auth.lockEntity('e1', 5000);
      expect(auth.unlockEntity('e1')).toBe(true);
      expect(auth.isLocked('e1')).toBe(false);
    });

    it('isLocked returns false for unknown entity', () => {
      expect(auth.isLocked('nope')).toBe(false);
    });

    it('locked entity blocks transfer request', () => {
      auth.lockEntity('e1', 60000);
      expect(auth.requestTransfer('e1')).toBeNull();
    });
  });

  // ===========================================================================
  // Pending Requests
  // ===========================================================================
  describe('pending requests', () => {
    it('getPendingRequests returns only pending', () => {
      auth.register('e1', 'player-remote');
      auth.register('e2', 'player-remote');
      const r1 = auth.requestTransfer('e1')!;
      auth.requestTransfer('e2');
      auth.approveTransfer(r1.id);

      const pending = auth.getPendingRequests();
      expect(pending.length).toBe(1);
    });

    it('getPendingRequests filters by player', () => {
      auth.register('e1', 'player-remote');
      auth.requestTransfer('e1');

      expect(auth.getPendingRequests('player-remote').length).toBe(1);
      expect(auth.getPendingRequests('player-other').length).toBe(0);
    });

    it('clearCompletedRequests removes non-pending', () => {
      auth.register('e1', 'player-remote');
      const r = auth.requestTransfer('e1')!;
      auth.denyTransfer(r.id);
      auth.clearCompletedRequests();
      expect(auth.getPendingRequests().length).toBe(0);
    });
  });
});
