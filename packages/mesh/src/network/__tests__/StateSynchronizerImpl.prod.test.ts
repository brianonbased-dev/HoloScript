import { describe, it, expect } from 'vitest';
import { StateSynchronizerImpl } from '../../network/StateSynchronizerImpl';

describe('StateSynchronizerImpl — Production Tests', () => {
  describe('set() / get()', () => {
    it('stores and retrieves a value', () => {
      const s = new StateSynchronizerImpl('peer-1');
      s.set('score', 42);
      expect(s.get<number>('score')).toBe(42);
    });

    it('increments version on each update', () => {
      const s = new StateSynchronizerImpl('peer-1');
      s.set('hp', 100);
      s.set('hp', 80);
      const all = s.getAll();
      expect(all.get('hp')!.version).toBe(2);
    });

    it('returns undefined for unknown key', () => {
      const s = new StateSynchronizerImpl('peer-1');
      expect(s.get('missing')).toBeUndefined();
    });

    it('sets version 1 for new keys', () => {
      const s = new StateSynchronizerImpl('peer-1');
      s.set('x', 5);
      expect(s.getAll().get('x')!.version).toBe(1);
    });

    it('rejects modification of foreign-owned key in authoritative mode', () => {
      const s = new StateSynchronizerImpl('peer-1', { mode: 'authoritative' });
      // Inject a state owned by peer-2
      s.applyRemoteUpdate({
        key: 'pos',
        value: 0,
        version: 1,
        ownerId: 'peer-2',
        timestamp: Date.now(),
        origin: 'remote',
      });
      expect(() => s.set('pos', 99)).toThrow('owned by');
    });
  });

  describe('delete()', () => {
    it('removes an existing key', () => {
      const s = new StateSynchronizerImpl('peer-1');
      s.set('k', 1);
      expect(s.delete('k')).toBe(true);
      expect(s.has('k')).toBe(false);
    });

    it('returns false for non-existent key', () => {
      expect(new StateSynchronizerImpl('peer-1').delete('nope')).toBe(false);
    });

    it('notifies listeners on delete', () => {
      const s = new StateSynchronizerImpl('peer-1');
      s.set('x', 10);
      const calls: unknown[] = [];
      s.onStateChanged('x', (e) => calls.push(e.value));
      s.delete('x');
      expect(calls).toContain(undefined);
    });
  });

  describe('has(), keys(), getStateCount()', () => {
    it('has() returns true for existing key', () => {
      const s = new StateSynchronizerImpl('peer-1');
      s.set('a', 1);
      expect(s.has('a')).toBe(true);
    });

    it('keys() returns all key names', () => {
      const s = new StateSynchronizerImpl('peer-1');
      s.set('a', 1);
      s.set('b', 2);
      expect(s.keys().sort()).toEqual(['a', 'b']);
    });

    it('getStateCount() reflects correct count', () => {
      const s = new StateSynchronizerImpl('peer-1');
      s.set('a', 1);
      s.set('b', 2);
      s.set('c', 3);
      expect(s.getStateCount()).toBe(3);
    });
  });

  describe('ownership — claim(), release(), isOwner(), getOwner()', () => {
    it('claim() sets ownership to local peer', () => {
      const s = new StateSynchronizerImpl('peer-1');
      s.set('ball', 1);
      expect(s.claim('ball')).toBe(true);
      expect(s.isOwner('ball')).toBe(true);
      expect(s.getOwner('ball')).toBe('peer-1');
    });

    it('claim() fails on non-existent key', () => {
      const s = new StateSynchronizerImpl('peer-1');
      expect(s.claim('ghost')).toBe(false);
    });

    it('release() clears ownership', () => {
      const s = new StateSynchronizerImpl('peer-1');
      s.set('item', 1);
      s.claim('item');
      s.release('item');
      expect(s.getOwner('item')).toBeUndefined();
    });

    it('getOwnedStates() returns only locally owned entries', () => {
      const s = new StateSynchronizerImpl('peer-1');
      // Default 'creator' ownership: first set() assigns ownerId = localPeerId
      s.set('a', 1);
      // Set 'b' with 'host' ownership so ownerId is undefined
      s.set('b', 2, { ownership: 'host' });
      const owned = s.getOwnedStates();
      expect(owned.length).toBe(1);
      expect(owned[0].key).toBe('a');
    });
  });

  describe('snapshots', () => {
    it('takeSnapshot() captures current state', () => {
      const s = new StateSynchronizerImpl('peer-1');
      s.set('x', 10);
      const snap = s.takeSnapshot();
      expect(snap.states.get('x')!.value).toBe(10);
    });

    it('restoreSnapshot() reverts state', () => {
      const s = new StateSynchronizerImpl('peer-1');
      s.set('v', 100);
      const snap = s.takeSnapshot();
      s.set('v', 999);
      s.restoreSnapshot(snap);
      expect(s.get('v')).toBe(100);
    });

    it('tick increments on each snapshot', () => {
      const s = new StateSynchronizerImpl('peer-1');
      s.takeSnapshot();
      s.takeSnapshot();
      expect(s.getCurrentTick()).toBe(2);
    });

    it('getHistory() returns all snapshots', () => {
      const s = new StateSynchronizerImpl('peer-1');
      s.takeSnapshot();
      s.takeSnapshot();
      s.takeSnapshot();
      expect(s.getHistory().length).toBe(3);
    });

    it('getHistory(n) returns last n snapshots', () => {
      const s = new StateSynchronizerImpl('peer-1');
      for (let i = 0; i < 5; i++) s.takeSnapshot();
      expect(s.getHistory(2).length).toBe(2);
    });
  });

  describe('applyRemoteUpdate()', () => {
    it('applies remote update in crdt mode (higher version wins)', () => {
      const s = new StateSynchronizerImpl('peer-1', { mode: 'crdt' });
      s.set('hp', 100);
      const accepted = s.applyRemoteUpdate({
        key: 'hp',
        value: 80,
        version: 5,
        ownerId: 'peer-2',
        timestamp: Date.now(),
        origin: 'remote',
      });
      expect(accepted).toBe(true);
      expect(s.get('hp')).toBe(80);
    });

    it('rejects remote update with lower version in crdt mode', () => {
      const s = new StateSynchronizerImpl('peer-1', { mode: 'crdt' });
      s.set('hp', 100);
      const rejected = s.applyRemoteUpdate({
        key: 'hp',
        value: 999,
        version: 0,
        ownerId: 'peer-2',
        timestamp: Date.now(),
        origin: 'remote',
      });
      expect(rejected).toBe(false);
      expect(s.get('hp')).toBe(100);
    });

    it('accepts new keys regardless of mode', () => {
      const s = new StateSynchronizerImpl('peer-1', { mode: 'authoritative' });
      const ok = s.applyRemoteUpdate({
        key: 'newKey',
        value: 77,
        version: 1,
        ownerId: 'peer-2',
        timestamp: Date.now(),
        origin: 'remote',
      });
      expect(ok).toBe(true);
    });
  });

  describe('pause() / resume()', () => {
    it('isPaused is false initially', () => {
      expect(new StateSynchronizerImpl('peer-1').isPaused).toBe(false);
    });

    it('isPaused is true after pause()', () => {
      const s = new StateSynchronizerImpl('peer-1');
      s.pause();
      expect(s.isPaused).toBe(true);
    });

    it('isPaused is false after resume()', () => {
      const s = new StateSynchronizerImpl('peer-1');
      s.pause();
      s.resume();
      expect(s.isPaused).toBe(false);
    });
  });

  describe('clear()', () => {
    it('removes all state and resets tick', () => {
      const s = new StateSynchronizerImpl('peer-1');
      s.set('a', 1);
      s.set('b', 2);
      s.takeSnapshot();
      s.clear();
      expect(s.getStateCount()).toBe(0);
      expect(s.getCurrentTick()).toBe(0);
      expect(s.getHistory().length).toBe(0);
    });
  });

  describe('onStateChanged() events', () => {
    it('fires callback when value changes', () => {
      const s = new StateSynchronizerImpl('peer-1');
      const vals: number[] = [];
      s.onStateChanged<number>('score', (e) => vals.push(e.value));
      s.set('score', 50);
      s.set('score', 75);
      expect(vals).toEqual([50, 75]);
    });

    it('offStateChanged removes callback', () => {
      const s = new StateSynchronizerImpl('peer-1');
      const calls: number[] = [];
      const cb = (e: any) => calls.push(e.value);
      s.onStateChanged('v', cb);
      s.set('v', 1);
      s.offStateChanged('v', cb);
      s.set('v', 2);
      expect(calls).toEqual([1]);
    });

    it('onAnyStateChanged fires for all keys', () => {
      const s = new StateSynchronizerImpl('peer-1');
      const keys: string[] = [];
      s.onAnyStateChanged((e) => keys.push(e.key));
      s.set('a', 1);
      s.set('b', 2);
      expect(keys).toContain('a');
      expect(keys).toContain('b');
    });
  });
});
