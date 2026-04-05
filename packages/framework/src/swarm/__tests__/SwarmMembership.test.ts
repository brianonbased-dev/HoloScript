/**
 * SwarmMembership Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SwarmMembership, type MembershipEvent } from '../SwarmMembership';

describe('SwarmMembership', () => {
  let membership: SwarmMembership;

  beforeEach(() => {
    membership = new SwarmMembership({
      quorum: { minimumSize: 2, optimalSize: 5, maximumSize: 10 },
    });
  });

  describe('join', () => {
    it('should allow first agent to join as leader', () => {
      const success = membership.join({ agentId: 'agent-1' });
      expect(success).toBe(true);

      const member = membership.getMember('agent-1');
      expect(member?.role).toBe('leader');
    });

    it('should allow subsequent agents to join as members', () => {
      membership.join({ agentId: 'agent-1' });
      membership.join({ agentId: 'agent-2' });

      const member = membership.getMember('agent-2');
      expect(member?.role).toBe('member');
    });

    it('should return true for already joined agent', () => {
      membership.join({ agentId: 'agent-1' });
      const success = membership.join({ agentId: 'agent-1' });
      expect(success).toBe(true);
    });

    it('should prevent joining at maximum', () => {
      membership = new SwarmMembership({
        quorum: { minimumSize: 1, optimalSize: 2, maximumSize: 2 },
      });

      membership.join({ agentId: 'agent-1' });
      membership.join({ agentId: 'agent-2' });
      const success = membership.join({ agentId: 'agent-3' });

      expect(success).toBe(false);
    });

    it('should add pending when approval required', () => {
      membership = new SwarmMembership({ requireApprovalToJoin: true });
      membership.join({ agentId: 'leader' });

      const success = membership.join({ agentId: 'agent-2' });
      expect(success).toBe(false);

      const pending = membership.getPendingJoins();
      expect(pending).toHaveLength(1);
      expect(pending[0].agentId).toBe('agent-2');
    });
  });

  describe('approveJoin', () => {
    it('should allow leader to approve pending join', () => {
      membership = new SwarmMembership({ requireApprovalToJoin: true });
      membership.join({ agentId: 'leader' });
      membership.join({ agentId: 'agent-2' });

      const success = membership.approveJoin('leader', 'agent-2');
      expect(success).toBe(true);
      expect(membership.getMember('agent-2')).toBeDefined();
    });

    it('should reject approval from non-leader', () => {
      membership = new SwarmMembership({ requireApprovalToJoin: true });
      membership.join({ agentId: 'leader' });
      membership.join({ agentId: 'agent-2' });

      const success = membership.approveJoin('agent-2', 'agent-2');
      expect(success).toBe(false);
    });
  });

  describe('leave', () => {
    it('should remove member', () => {
      membership.join({ agentId: 'agent-1' });
      membership.join({ agentId: 'agent-2' });
      membership.join({ agentId: 'agent-3' });

      membership.leave({ agentId: 'agent-2', graceful: true });
      expect(membership.getMember('agent-2')).toBeUndefined();
    });

    it('should elect new leader when leader leaves', () => {
      membership.join({ agentId: 'agent-1' });
      membership.join({ agentId: 'agent-2' });
      membership.join({ agentId: 'agent-3' });

      expect(membership.getLeader()?.agentId).toBe('agent-1');
      membership.leave({ agentId: 'agent-1', graceful: true });

      expect(membership.getLeader()).toBeDefined();
      expect(membership.getLeader()?.agentId).not.toBe('agent-1');
    });

    it('should prevent leaving below minimum', () => {
      membership.join({ agentId: 'agent-1' });
      membership.join({ agentId: 'agent-2' });

      const success = membership.leave({ agentId: 'agent-2', graceful: true });
      expect(success).toBe(false);

      const member = membership.getMember('agent-2');
      expect(member?.status).toBe('leaving');
    });
  });

  describe('observers', () => {
    it('should allow observers to join', () => {
      membership.join({ agentId: 'agent-1' });
      membership.join({ agentId: 'observer-1', requestedRole: 'observer' });

      const observer = membership.getMember('observer-1');
      expect(observer?.role).toBe('observer');
    });

    it('should not count observers in member count', () => {
      membership.join({ agentId: 'agent-1' });
      membership.join({ agentId: 'observer-1', requestedRole: 'observer' });

      expect(membership.getMemberCount()).toBe(1);
    });

    it('should enforce max observers', () => {
      membership = new SwarmMembership({ maxObservers: 1 });
      membership.join({ agentId: 'agent-1' });
      membership.join({ agentId: 'observer-1', requestedRole: 'observer' });

      const success = membership.join({ agentId: 'observer-2', requestedRole: 'observer' });
      expect(success).toBe(false);
    });

    it('should allow disabling observers', () => {
      membership = new SwarmMembership({ allowObservers: false });
      membership.join({ agentId: 'agent-1' });

      const success = membership.join({ agentId: 'observer-1', requestedRole: 'observer' });
      expect(success).toBe(false);
    });
  });

  describe('heartbeat', () => {
    it('should update last heartbeat', async () => {
      membership.join({ agentId: 'agent-1' });
      const before = membership.getMember('agent-1')?.lastHeartbeat;

      // Wait a bit for timestamp to change
      await new Promise((resolve) => setTimeout(resolve, 10));
      membership.heartbeat('agent-1');

      const after = membership.getMember('agent-1')?.lastHeartbeat;
      expect(after).toBeGreaterThanOrEqual(before!);
    });
  });

  describe('changeRole', () => {
    it('should change member role', () => {
      membership.join({ agentId: 'agent-1' });
      membership.join({ agentId: 'agent-2' });

      membership.changeRole('agent-2', 'leader');

      expect(membership.getMember('agent-2')?.role).toBe('leader');
      expect(membership.getMember('agent-1')?.role).toBe('member');
      expect(membership.getLeader()?.agentId).toBe('agent-2');
    });
  });

  describe('getMembers', () => {
    it('should return all members', () => {
      membership.join({ agentId: 'agent-1' });
      membership.join({ agentId: 'agent-2' });
      membership.join({ agentId: 'observer-1', requestedRole: 'observer' });

      const all = membership.getMembers();
      expect(all).toHaveLength(3);
    });
  });

  describe('getActiveMembers', () => {
    it('should filter out observers and inactive', () => {
      membership.join({ agentId: 'agent-1' });
      membership.join({ agentId: 'agent-2' });
      membership.join({ agentId: 'observer-1', requestedRole: 'observer' });

      const active = membership.getActiveMembers();
      expect(active).toHaveLength(2);
      expect(active.find((m) => m.role === 'observer')).toBeUndefined();
    });
  });

  describe('getQuorumState', () => {
    it('should return quorum state', () => {
      membership.join({ agentId: 'agent-1' });
      membership.join({ agentId: 'agent-2' });
      membership.join({ agentId: 'agent-3' });

      const state = membership.getQuorumState();
      expect(state.currentSize).toBe(3);
      expect(state.hasQuorum).toBe(true);
    });
  });

  describe('events', () => {
    it('should emit join events', () => {
      const events: MembershipEvent[] = [];
      membership.onEvent((e) => events.push(e));

      membership.join({ agentId: 'agent-1' });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('joined');
      expect(events[0].agentId).toBe('agent-1');
    });

    it('should emit leave events', () => {
      membership.join({ agentId: 'agent-1' });
      membership.join({ agentId: 'agent-2' });
      membership.join({ agentId: 'agent-3' });

      const events: MembershipEvent[] = [];
      membership.onEvent((e) => events.push(e));

      membership.leave({ agentId: 'agent-2', graceful: true });

      expect(events.some((e) => e.type === 'left' && e.agentId === 'agent-2')).toBe(true);
    });

    it('should emit quorum events', () => {
      const events: MembershipEvent[] = [];
      membership.onEvent((e) => events.push(e));

      membership.join({ agentId: 'agent-1' });
      membership.join({ agentId: 'agent-2' });
      membership.join({ agentId: 'agent-3' });

      expect(events.some((e) => e.type === 'quorum-gained')).toBe(true);
    });

    it('should allow unsubscribing', () => {
      const events: MembershipEvent[] = [];
      const unsub = membership.onEvent((e) => events.push(e));

      membership.join({ agentId: 'agent-1' });
      expect(events).toHaveLength(1);

      unsub();
      membership.join({ agentId: 'agent-2' });
      expect(events).toHaveLength(1);
    });
  });
});
