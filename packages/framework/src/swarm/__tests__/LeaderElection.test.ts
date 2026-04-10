import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LeaderElection } from '../LeaderElection';
import type { ElectionMessage } from '../LeaderElection';

describe('LeaderElection', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeElection(nodeId: string, members: string[], config = {}) {
    return new LeaderElection(nodeId, members, {
      electionTimeoutMin: 10000,
      electionTimeoutMax: 20000,
      heartbeatInterval: 5000,
      ...config,
    });
  }

  it('initializes as follower with no leader', () => {
    const e = makeElection('n1', ['n2', 'n3']);
    expect(e.getRole()).toBe('follower');
    expect(e.getLeader()).toBeNull();
    e.stop();
  });

  it('filters self from cluster members', () => {
    // If self is in member list, should not cause issues
    const e = makeElection('n1', ['n1', 'n2', 'n3']);
    e.stop();
    expect(e.getRole()).toBe('follower');
  });

  it('wins election in local cluster (no message handler)', async () => {
    vi.useFakeTimers();
    const e = makeElection('n1', ['n2', 'n3']);
    const promise = e.startElection();
    vi.advanceTimersByTime(100);
    const leader = await promise;
    expect(leader).toBe('n1');
    expect(e.getRole()).toBe('leader');
    expect(e.getLeader()).toBe('n1');
    e.stop();
  });

  it('accepts votes from peers', () => {
    vi.useFakeTimers();
    const e = makeElection('n1', ['n2', 'n3', 'n4', 'n5'], { quorumSize: 3 });
    // Manually become a candidate
    e.startElection();
    // Already received own vote + all members' votes in local mode
    expect(e.getRole()).toBe('leader');
    e.stop();
  });

  it('receiveVote only counts when candidate', () => {
    const e = makeElection('n1', ['n2']);
    e.receiveVote('n2'); // Should be ignored, not a candidate
    expect(e.getRole()).toBe('follower');
    e.stop();
  });

  it('onLeaderChange fires on leader win', async () => {
    vi.useFakeTimers();
    const e = makeElection('n1', ['n2']);
    const cb = vi.fn();
    e.onLeaderChange(cb);
    const promise = e.startElection();
    vi.advanceTimersByTime(100);
    await promise;
    expect(cb).toHaveBeenCalledWith('n1');
    e.stop();
  });

  it('onLeaderChange returns unsubscribe fn', () => {
    vi.useFakeTimers();
    const e = makeElection('n1', ['n2']);
    const cb = vi.fn();
    const unsub = e.onLeaderChange(cb);
    unsub();
    e.startElection();
    vi.advanceTimersByTime(100);
    expect(cb).not.toHaveBeenCalled();
    e.stop();
  });

  it('handleMessage handles vote request (grants vote)', () => {
    vi.useFakeTimers();
    const e = makeElection('n2', ['n1']);
    const sent: { to: string; msg: ElectionMessage }[] = [];
    e.setMessageHandler((to, msg) => sent.push({ to, msg }));
    // n1 asks n2 for a vote
    e.handleMessage('n1', { type: 'request-vote', term: 1, candidateId: 'n1' });
    expect(sent.length).toBeGreaterThan(0);
    const resp = sent.find((s) => s.msg.type === 'vote-response');
    expect(resp).toBeDefined();
    expect((resp!.msg as any).voteGranted).toBe(true);
    e.stop();
  });

  it('handleMessage rejects old-term vote request', () => {
    vi.useFakeTimers();
    const e = makeElection('n2', ['n1']);
    // Force term to 5
    e.handleMessage('n1', { type: 'heartbeat', term: 5, leaderId: 'n1' });
    const sent: { to: string; msg: ElectionMessage }[] = [];
    e.setMessageHandler((to, msg) => sent.push({ to, msg }));
    // Request with old term
    e.handleMessage('n1', { type: 'request-vote', term: 2, candidateId: 'n1' });
    expect(sent.filter((s) => s.msg.type === 'vote-response')).toHaveLength(0);
    e.stop();
  });

  it('handleMessage handles heartbeat (become follower)', () => {
    vi.useFakeTimers();
    const e = makeElection('n2', ['n1']);
    e.handleMessage('n1', { type: 'heartbeat', term: 1, leaderId: 'n1' });
    expect(e.getRole()).toBe('follower');
    expect(e.getLeader()).toBe('n1');
    e.stop();
  });

  it('handleMessage handles vote response with higher term (step down)', () => {
    vi.useFakeTimers();
    const e = makeElection('n1', ['n2', 'n3', 'n4'], { quorumSize: 100 }); // huge quorum so we stay candidate
    e.setMessageHandler(() => {}); // prevent auto-vote
    e.startElection();
    // Now n1 is candidate. Receive vote response with higher term
    e.handleMessage('n2', { type: 'vote-response', term: 999, voteGranted: false });
    expect(e.getRole()).toBe('follower');
    e.stop();
  });

  it('single-node cluster wins immediately', async () => {
    vi.useFakeTimers();
    const e = makeElection('solo', []);
    const promise = e.startElection();
    vi.advanceTimersByTime(100);
    const leader = await promise;
    expect(leader).toBe('solo');
    e.stop();
  });

  it('stop clears all timers', () => {
    vi.useFakeTimers();
    const e = makeElection('n1', ['n2']);
    e.startElection();
    e.stop();
    // Should not throw or cause issues after stop
    expect(e.getLeader()).toBeTruthy(); // Was already elected
  });
});
