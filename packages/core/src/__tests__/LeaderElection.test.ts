import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LeaderElection } from '../swarm/LeaderElection';

// =============================================================================
// C218 — Leader Election (Raft-inspired)
// =============================================================================

describe('LeaderElection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructor sets initial state to follower', () => {
    const le = new LeaderElection('node1', ['node1', 'node2', 'node3']);
    expect(le.getRole()).toBe('follower');
    expect(le.getLeader()).toBeNull();
    le.stop();
  });

  it('becomes leader via startElection + votes', () => {
    const le = new LeaderElection('node1', ['node1', 'node2', 'node3']);
    le.startElection();
    le.receiveVote('node2'); // quorum → leader
    expect(le.getRole()).toBe('leader');
    expect(le.getLeader()).toBe('node1');
    le.stop();
  });

  it('becomes follower via heartbeat message', () => {
    const le = new LeaderElection('node1', ['node1', 'node2', 'node3']);
    le.handleMessage('node2', { type: 'heartbeat', term: 1, leaderId: 'node2' });
    expect(le.getRole()).toBe('follower');
    expect(le.getLeader()).toBe('node2');
    le.stop();
  });

  it('receiveVote accumulates votes and wins with quorum', () => {
    const le = new LeaderElection('node1', ['node1', 'node2', 'node3']);
    // startElection makes it a candidate (votes for self) and requests votes
    // We manually simulate that path:
    // becomeCandidate is private, so use startElection which internally calls it
    // After startElection, node1 is candidate with 1 self-vote
    // receiveVote from node2 gives quorum (2 of 3)
    const promise = le.startElection();
    le.receiveVote('node2');
    expect(le.getRole()).toBe('leader');
    le.stop();
  });

  it('onLeaderChange fires callback when leader changes', () => {
    const le = new LeaderElection('node1', ['node1', 'node2', 'node3']);
    const cb = vi.fn();
    // First become leader so we have a leader set
    le.startElection();
    le.receiveVote('node2'); // becomes leader
    le.onLeaderChange(cb);
    // Now receive heartbeat from higher-term leader (causes leader change)
    le.handleMessage('node2', { type: 'heartbeat', term: 5, leaderId: 'node2' });
    expect(cb).toHaveBeenCalledWith('node2');
    le.stop();
  });

  it('onLeaderChange fires callback when elected leader', () => {
    const le = new LeaderElection('node1', ['node1', 'node2', 'node3']);
    const cb = vi.fn();
    le.onLeaderChange(cb);
    le.startElection(); // candidate, 1 self-vote
    le.receiveVote('node2'); // quorum → leader
    expect(cb).toHaveBeenCalledWith('node1');
    le.stop();
  });

  it('onLeaderChange unsubscribe prevents callback', () => {
    const le = new LeaderElection('node1', ['node1', 'node2', 'node3']);
    const cb = vi.fn();
    const unsub = le.onLeaderChange(cb);
    unsub();
    // Become leader then step down — callback should NOT fire
    le.startElection();
    le.receiveVote('node2');
    le.handleMessage('node2', { type: 'heartbeat', term: 5, leaderId: 'node2' });
    expect(cb).not.toHaveBeenCalled();
    le.stop();
  });

  it('stop clears timers', () => {
    const le = new LeaderElection('node1', ['node1', 'node2', 'node3']);
    le.startElection();
    le.receiveVote('node2'); // become leader
    le.stop();
    // stop() only clears timers, doesn't reset role
    expect(le.getRole()).toBe('leader');
  });

  it('handleMessage routes Heartbeat to become follower', () => {
    const le = new LeaderElection('node1', ['node1', 'node2', 'node3']);
    le.handleMessage('node2', { type: 'heartbeat', term: 1, leaderId: 'node2' });
    expect(le.getRole()).toBe('follower');
    expect(le.getLeader()).toBe('node2');
    le.stop();
  });

  it('handleMessage routes VoteRequest and responds', () => {
    const le = new LeaderElection('node1', ['node1', 'node2', 'node3']);
    const handler = vi.fn();
    le.setMessageHandler(handler);
    le.handleMessage('node2', { type: 'request-vote', term: 1, candidateId: 'node2' });
    expect(handler).toHaveBeenCalled();
    le.stop();
  });

  it('getQuorumSize calculates majority', () => {
    const le3 = new LeaderElection('a', ['a', 'b', 'c']);
    expect(le3.getQuorumSize()).toBe(2);
    le3.stop();

    const le5 = new LeaderElection('a', ['a', 'b', 'c', 'd', 'e']);
    expect(le5.getQuorumSize()).toBe(3);
    le5.stop();
  });

  it('getRandomElectionTimeout is within configured range', () => {
    const le = new LeaderElection('node1', ['node1'], {
      electionTimeoutMin: 100,
      electionTimeoutMax: 200,
    });
    for (let i = 0; i < 20; i++) {
      const t = le.getRandomElectionTimeout();
      expect(t).toBeGreaterThanOrEqual(100);
      expect(t).toBeLessThanOrEqual(200);
    }
    le.stop();
  });

  it('single-node cluster self-elects as leader', () => {
    const le = new LeaderElection('solo', ['solo']);
    le.startElection();
    // With 1 node, self-vote immediately wins quorum
    expect(le.getRole()).toBe('leader');
    expect(le.getLeader()).toBe('solo');
    le.stop();
  });
});
