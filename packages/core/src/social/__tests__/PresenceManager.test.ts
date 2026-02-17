/**
 * PresenceManager Unit Tests
 *
 * Tests presence status management, heartbeat, and
 * network status updates.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PresenceManager } from '../PresenceManager';
import { SocialGraph, type SocialUser } from '../SocialGraph';

function makeUser(id: string, overrides: Partial<SocialUser> = {}): SocialUser {
  return {
    id,
    username: `user_${id}`,
    displayName: `User ${id}`,
    status: 'online',
    lastSeen: Date.now(),
    ...overrides,
  };
}

describe('PresenceManager', () => {
  let graph: SocialGraph;
  let presence: PresenceManager;

  beforeEach(() => {
    vi.useFakeTimers();
    graph = new SocialGraph('local-user');
    presence = new PresenceManager(graph); // No transport
  });

  afterEach(() => {
    presence.stopHeartbeat();
    vi.useRealTimers();
  });

  describe('setLocalStatus / getLocalStatus', () => {
    it('should default to online', () => {
      expect(presence.getLocalStatus()).toBe('online');
    });

    it('should update local status', () => {
      presence.setLocalStatus('away');
      expect(presence.getLocalStatus()).toBe('away');
    });

    it('should update to busy', () => {
      presence.setLocalStatus('busy');
      expect(presence.getLocalStatus()).toBe('busy');
    });
  });

  describe('handlePresenceUpdate', () => {
    it('should update a known user status', () => {
      graph.updateUser(makeUser('u1', { status: 'online' }));
      presence.handlePresenceUpdate('u1', 'away', 'AFK');

      const user = graph.getUser('u1');
      expect(user?.status).toBe('away');
      expect(user?.currentActivity).toBe('AFK');
    });

    it('should update lastSeen timestamp', () => {
      const user = makeUser('u1', { lastSeen: 0 });
      graph.updateUser(user);

      vi.advanceTimersByTime(1000);
      presence.handlePresenceUpdate('u1', 'online');

      const updated = graph.getUser('u1');
      expect(updated!.lastSeen).toBeGreaterThan(0);
    });

    it('should no-op for unknown users', () => {
      // Should not throw
      presence.handlePresenceUpdate('unknown', 'offline');
      expect(graph.getUser('unknown')).toBeUndefined();
    });
  });

  describe('startHeartbeat / stopHeartbeat', () => {
    it('should start periodic heartbeat', () => {
      const spy = vi.spyOn(presence, 'setLocalStatus');
      presence.startHeartbeat(1000);

      vi.advanceTimersByTime(3000);
      expect(spy).toHaveBeenCalledTimes(3);
    });

    it('should stop heartbeat', () => {
      const spy = vi.spyOn(presence, 'setLocalStatus');
      presence.startHeartbeat(1000);
      presence.stopHeartbeat();

      vi.advanceTimersByTime(3000);
      expect(spy).not.toHaveBeenCalled();
    });

    it('should replace existing heartbeat', () => {
      const spy = vi.spyOn(presence, 'setLocalStatus');
      presence.startHeartbeat(1000);
      presence.startHeartbeat(2000); // Replace

      vi.advanceTimersByTime(3000);
      // At 2s interval, should fire once in 3s (at t=2000)
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
