import { describe, expect, it } from 'vitest';
import {
  COLLABORATIVE_WORLD_TRAIT_DEFAULTS,
  CollaborativeWorldTraitValidationError,
  applyTransformOp,
  createCollaborativeWorldTraitConfig,
  createSelectionLock,
  decideTransformOp,
  isSelectionLockActive,
  parseCollaborativeWorldTraitConfig,
  pruneCollaborativePresence,
  resolveCollaborativeWorldTraitConfig,
  toUnrealConcertDescriptor,
  validateCollaborativeWorldTraitConfig,
} from '../CollaborativeWorldTrait';
import type {
  CollaborativePresenceCursor,
  CollaborativeTransformOp,
} from '../CollaborativeWorldTrait';

describe('CollaborativeWorldTrait', () => {
  it('provides MUE-shaped defaults for transform collaboration', () => {
    expect(COLLABORATIVE_WORLD_TRAIT_DEFAULTS.syncRateHz).toBe(60);
    expect(COLLABORATIVE_WORLD_TRAIT_DEFAULTS.transformFields).toEqual([
      'position',
      'rotation',
      'scale',
    ]);
    expect(COLLABORATIVE_WORLD_TRAIT_DEFAULTS.selectionLocks).toBe(true);
    expect(COLLABORATIVE_WORLD_TRAIT_DEFAULTS.presenceCursors).toBe(true);
    expect(COLLABORATIVE_WORLD_TRAIT_DEFAULTS.concertBridge).toBe(true);
  });

  it('parses raw trait config from .holo-style values', () => {
    const parsed = parseCollaborativeWorldTraitConfig({
      roomName: 'World Jam',
      syncRateHz: '30',
      transformFields: ['position', 'scale'],
      conflictResolution: 'lamport_merge',
      selectionLocks: 'true',
      lockTtlMs: '4500',
      presenceCursors: true,
      cursorFrame: 'world',
    });

    expect(parsed).toEqual(
      expect.objectContaining({
        roomName: 'World Jam',
        syncRateHz: 30,
        transformFields: ['position', 'scale'],
        conflictResolution: 'lamport_merge',
        selectionLocks: true,
        lockTtlMs: 4500,
      })
    );
  });

  it('validates sync rates, lock TTLs, policies, and transform fields', () => {
    expect(() => validateCollaborativeWorldTraitConfig({ syncRateHz: 0 })).toThrow(
      CollaborativeWorldTraitValidationError
    );
    expect(() => validateCollaborativeWorldTraitConfig({ lockTtlMs: 100 })).toThrow(
      CollaborativeWorldTraitValidationError
    );
    expect(() =>
      validateCollaborativeWorldTraitConfig({ conflictResolution: 'bad' as never })
    ).toThrow(CollaborativeWorldTraitValidationError);
    expect(() =>
      validateCollaborativeWorldTraitConfig({ transformFields: ['position', 'skew'] as never })
    ).toThrow(CollaborativeWorldTraitValidationError);
  });

  it('resolves defaults and creates a validated config in one pass', () => {
    const resolved = resolveCollaborativeWorldTraitConfig({ roomName: 'Stage' });
    expect(resolved.roomName).toBe('Stage');
    expect(resolved.syncRateHz).toBe(60);

    const created = createCollaborativeWorldTraitConfig({
      conflictResolution: 'last_write_wins',
      presenceTimeoutMs: 8000,
    });
    expect(created.conflictResolution).toBe('last_write_wins');
    expect(created.presenceTimeoutMs).toBe(8000);
  });

  it('creates expiring selection locks', () => {
    const lock = createSelectionLock('tree-1', 'alice', {
      acquiredAt: 1000,
      ttlMs: 3000,
      lockId: 'lock-1',
    });

    expect(lock).toEqual(
      expect.objectContaining({
        entityId: 'tree-1',
        ownerId: 'alice',
        lockId: 'lock-1',
        expiresAt: 4000,
      })
    );
    expect(isSelectionLockActive(lock, 3999)).toBe(true);
    expect(isSelectionLockActive(lock, 4000)).toBe(false);
  });

  it('requires an active owner lock when lock_required is configured', () => {
    const lock = createSelectionLock('cube', 'alice', {
      acquiredAt: 1000,
      ttlMs: 5000,
      lockId: 'alice-lock',
    });
    const op: CollaborativeTransformOp = {
      type: 'transform',
      entityId: 'cube',
      actorId: 'bob',
      field: 'position',
      value: [1, 2, 3],
      lamport: 4,
      timestamp: 2000,
    };

    expect(
      decideTransformOp(
        op,
        [lock],
        {
          selectionLocks: true,
          conflictResolution: 'lock_required',
        },
        2000
      )
    ).toEqual(expect.objectContaining({ status: 'rejected', reason: 'locked_by_another_actor' }));

    expect(
      decideTransformOp(
        { ...op, actorId: 'alice', lockId: 'alice-lock' },
        [lock],
        {
          selectionLocks: true,
          conflictResolution: 'lock_required',
        },
        2000
      )
    ).toEqual({ status: 'applied' });
  });

  it('flags remote-lock conflicts under lamport_merge instead of overwriting silently', () => {
    const lock = createSelectionLock('cube', 'alice', {
      acquiredAt: 1000,
      ttlMs: 5000,
    });
    const op: CollaborativeTransformOp = {
      type: 'transform',
      entityId: 'cube',
      actorId: 'bob',
      field: 'rotation',
      value: [0, 1, 0],
      lamport: 9,
      timestamp: 2200,
    };

    expect(
      decideTransformOp(
        op,
        [lock],
        {
          selectionLocks: true,
          conflictResolution: 'lamport_merge',
        },
        2000
      )
    ).toEqual(expect.objectContaining({ status: 'conflict', reason: 'remote_lock_present' }));
  });

  it('applies transform ops with version and provenance metadata', () => {
    const next = applyTransformOp(
      { position: [0, 0, 0], version: 3 },
      {
        type: 'transform',
        entityId: 'cube',
        actorId: 'alice',
        field: 'position',
        value: [4, 5, 6],
        lamport: 10,
        timestamp: 12345,
      }
    );

    expect(next).toEqual({
      position: [4, 5, 6],
      version: 4,
      updatedBy: 'alice',
      updatedAt: 12345,
    });
  });

  it('prunes stale scene-space presence cursors', () => {
    const cursors: CollaborativePresenceCursor[] = [
      { actorId: 'fresh', position: [0, 0, 0], lastSeen: 9000 },
      { actorId: 'stale', position: [0, 0, 0], lastSeen: 1000 },
    ];

    expect(
      pruneCollaborativePresence(cursors, 10_000, 5000).map((cursor) => cursor.actorId)
    ).toEqual(['fresh']);
  });

  it('emits an Unreal Concert-compatible descriptor', () => {
    const descriptor = toUnrealConcertDescriptor(
      createCollaborativeWorldTraitConfig({
        syncRateHz: 60,
        conflictResolution: 'lock_required',
      })
    );

    expect(descriptor).toEqual(
      expect.objectContaining({
        protocol: 'unreal-concert-compatible',
        transactionStream: 'TransformDelta',
        selectionLockPolicy: 'lock_required',
        transformFields: ['position', 'rotation', 'scale'],
      })
    );
  });
});
