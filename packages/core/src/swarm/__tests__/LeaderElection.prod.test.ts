/**
 * LeaderElection.prod.test.ts
 *
 * Production tests for Raft-inspired LeaderElection:
 * immediate single-node election, receiveVote quorum mechanics,
 * onLeaderChange callbacks, handleMessage routing, and stop() cleanup.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LeaderElection } from '../LeaderElection';

describe('LeaderElection', () => {
  let le: LeaderElection;

  afterEach(() => {
    le?.stop();
  });

  // -------------------------------------------------------------------------
  // Single-node election
  // -------------------------------------------------------------------------
  describe('single-node cluster', () => {
    it('node elects itself immediately (no other members)', async () => {
      le = new LeaderElection('node-1', []);
      const leader = await le.startElection();
      expect(leader).toBe('node-1');
      le.stop();
    });

    it('becomes leader after startElection', async () => {
      le = new LeaderElection('node-1', []);
      await le.startElection();
      expect(le.getRole()).toBe('leader');
      le.stop();
    });

    it('getLeader returns self after winning', async () => {
      le = new LeaderElection('node-1', []);
      await le.startElection();
      expect(le.getLeader()).toBe('node-1');
      le.stop();
    });
  });

  // -------------------------------------------------------------------------
  // receiveVote — quorum mechanics
  // -------------------------------------------------------------------------
  describe('receiveVote() — quorum', () => {
    it('3-node cluster: receiving both other votes makes this node leader', async () => {
      le = new LeaderElection('node-1', ['node-2', 'node-3'], {
        electionTimeoutMin: 9000,
        electionTimeoutMax: 10000, // prevent auto-trigger
      });
      // Manually trigger candidate state
      const electionPromise = le.startElection(); // triggers becomeCandidate
      // Give it a tick to set candidate state
      await new Promise((r) => setTimeout(r, 20));
      le.receiveVote('node-2');
      le.receiveVote('node-3');
      const leader = await electionPromise;
      expect(leader).toBe('node-1');
      le.stop();
    });

    it('insufficient votes keeps node as candidate', async () => {
      le = new LeaderElection('node-1', ['node-2', 'node-3', 'node-4'], {
        electionTimeoutMin: 9000,
        electionTimeoutMax: 10000,
        quorumSize: 4, // need 4 votes to win
      });
      // Block local simulation by providing a no-op messageHandler
      le.setMessageHandler(() => {}); // messages go nowhere → no auto-votes
      le.startElection(); // triggers becomeCandidate (starts election timer, sends vote requests to handler)
      await new Promise((r) => setTimeout(r, 20));
      // Self vote is counted, only 1 more vote → still needs 2 more for quorum=4
      le.receiveVote('node-2'); // only 2 votes total (self + node-2) < quorum of 4
      expect(le.getRole()).toBe('candidate');
      le.stop();
    });
  });

  // -------------------------------------------------------------------------
  // onLeaderChange callback
  // -------------------------------------------------------------------------
  describe('onLeaderChange()', () => {
    it('fires callback when leader is elected', async () => {
      le = new LeaderElection('node-1', []);
      const callback = vi.fn();
      le.onLeaderChange(callback);
      await le.startElection();
      expect(callback).toHaveBeenCalledWith('node-1');
      le.stop();
    });

    it('unsubscribe removes callback', async () => {
      le = new LeaderElection('node-1', []);
      const callback = vi.fn();
      const unsub = le.onLeaderChange(callback);
      unsub();
      await le.startElection();
      expect(callback).not.toHaveBeenCalled();
      le.stop();
    });

    it('multiple callbacks all fire', async () => {
      le = new LeaderElection('node-1', []);
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      le.onLeaderChange(cb1);
      le.onLeaderChange(cb2);
      await le.startElection();
      expect(cb1).toHaveBeenCalled();
      expect(cb2).toHaveBeenCalled();
      le.stop();
    });
  });

  // -------------------------------------------------------------------------
  // handleMessage — heartbeat
  // -------------------------------------------------------------------------
  describe('handleMessage() — heartbeat', () => {
    it('receiving heartbeat with higher term makes node a follower', () => {
      le = new LeaderElection('node-2', ['node-1'], {
        electionTimeoutMin: 9000,
        electionTimeoutMax: 10000,
      });
      le.handleMessage('node-1', { type: 'heartbeat', term: 5, leaderId: 'node-1' });
      expect(le.getRole()).toBe('follower');
      expect(le.getLeader()).toBe('node-1');
      le.stop();
    });

    it('receiving heartbeat updates leader id', () => {
      le = new LeaderElection('node-2', ['node-1']);
      le.handleMessage('node-1', { type: 'heartbeat', term: 3, leaderId: 'node-1' });
      expect(le.getLeader()).toBe('node-1');
      le.stop();
    });
  });

  // -------------------------------------------------------------------------
  // handleMessage — request-vote
  // -------------------------------------------------------------------------
  describe('handleMessage() — request-vote', () => {
    it('responds with grant when not yet voted in term', () => {
      const sent: any[] = [];
      le = new LeaderElection('node-2', ['node-1'], {
        electionTimeoutMin: 9000,
        electionTimeoutMax: 10000,
      });
      le.setMessageHandler((to, msg) => sent.push({ to, msg }));
      // Term 1 vote request from node-1
      le.handleMessage('node-1', { type: 'request-vote', term: 1, candidateId: 'node-1' });
      const grant = sent.find((s) => s.msg.type === 'vote-response');
      expect(grant).toBeDefined();
      expect(grant.msg.voteGranted).toBe(true);
      le.stop();
    });
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------
  describe('initial state', () => {
    it('starts as follower', () => {
      le = new LeaderElection('n', ['m']);
      expect(le.getRole()).toBe('follower');
      le.stop();
    });

    it('starts with no leader', () => {
      le = new LeaderElection('n', ['m']);
      expect(le.getLeader()).toBeNull();
      le.stop();
    });
  });

  // -------------------------------------------------------------------------
  // stop()
  // -------------------------------------------------------------------------
  describe('stop()', () => {
    it('does not throw when called before startElection', () => {
      le = new LeaderElection('n', ['m']);
      expect(() => le.stop()).not.toThrow();
    });

    it('can be called multiple times without error', async () => {
      le = new LeaderElection('n', []);
      await le.startElection();
      expect(() => {
        le.stop();
        le.stop();
      }).not.toThrow();
    });
  });
});
