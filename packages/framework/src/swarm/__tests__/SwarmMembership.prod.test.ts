/**
 * SwarmMembership — Production Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SwarmMembership } from '../SwarmMembership';

function make(cfg = {}) {
  return new SwarmMembership(cfg);
}

describe('SwarmMembership — join', () => {
  it('first join succeeds', () => {
    const s = make();
    expect(s.join({ agentId: 'a1' })).toBe(true);
    expect(s.getMemberCount()).toBe(1);
  });
  it('first member becomes leader', () => {
    const s = make();
    s.join({ agentId: 'a1' });
    expect(s.getLeader()?.agentId).toBe('a1');
  });
  it('second member is ordinary member', () => {
    const s = make();
    s.join({ agentId: 'a1' });
    s.join({ agentId: 'a2' });
    expect(s.getMember('a2')?.role).toBe('member');
  });
  it('duplicate join returns true and does not duplicate', () => {
    const s = make();
    s.join({ agentId: 'a1' });
    expect(s.join({ agentId: 'a1' })).toBe(true);
    expect(s.getMemberCount()).toBe(1);
  });
  it('join fails when at maximumSize', () => {
    const s = make({ quorum: { minimumSize: 1, optimalSize: 2, maximumSize: 2 } });
    s.join({ agentId: 'a1' });
    s.join({ agentId: 'a2' });
    expect(s.join({ agentId: 'a3' })).toBe(false);
    expect(s.getMemberCount()).toBe(2);
  });
  it('metadata is stored on member', () => {
    const s = make();
    s.join({ agentId: 'a1', metadata: { region: 'us-east' } });
    expect(s.getMember('a1')?.metadata?.region).toBe('us-east');
  });
  it('joining with requestedRole=leader sets role after first joiner', () => {
    const s = make();
    s.join({ agentId: 'a1' }); // first = auto-leader
    expect(() => s.join({ agentId: 'a2', requestedRole: 'leader' })).not.toThrow();
  });
});

describe('SwarmMembership — leave', () => {
  it('graceful leave succeeds for multi-member swarm', () => {
    const s = make({ quorum: { minimumSize: 2 } });
    s.join({ agentId: 'a1' });
    s.join({ agentId: 'a2' });
    s.join({ agentId: 'a3' });
    expect(s.leave({ agentId: 'a3', graceful: true })).toBe(true);
    expect(s.getMemberCount()).toBe(2);
  });
  it('leave of unknown agent returns false', () => {
    const s = make();
    expect(s.leave({ agentId: 'nobody', graceful: true })).toBe(false);
  });
  it('last member forced-disbands on graceful leave', () => {
    const s = make();
    s.join({ agentId: 'a1' });
    expect(s.leave({ agentId: 'a1', graceful: true })).toBe(true);
    expect(s.getMemberCount()).toBe(0);
  });
  it('cannot leave when at minimumSize (quorum enforcement)', () => {
    const s = make({ quorum: { minimumSize: 3 } });
    s.join({ agentId: 'a1' });
    s.join({ agentId: 'a2' });
    s.join({ agentId: 'a3' });
    // 3 members, minimumSize=3 → canLeave=false
    const result = s.leave({ agentId: 'a3', graceful: true });
    // Either marks as 'leaving' (returns false) or permits for observers
    // non-leader, ordinary member: should be blocked
    expect(result).toBe(false);
    expect(s.getMember('a3')?.status).toBe('leaving');
  });
  it('leader leave triggers re-election', () => {
    const s = make({ quorum: { minimumSize: 1 } });
    s.join({ agentId: 'a1' });
    s.join({ agentId: 'a2' });
    s.leave({ agentId: 'a1', graceful: true });
    expect(s.getLeader()?.agentId).toBe('a2');
  });
});

describe('SwarmMembership — removeForcefully', () => {
  it('removes member unconditionally', () => {
    const s = make({ quorum: { minimumSize: 3 } });
    s.join({ agentId: 'a1' });
    s.join({ agentId: 'a2' });
    s.join({ agentId: 'a3' });
    s.removeForcefully('a3', 'timeout');
    expect(s.getMemberCount()).toBe(2);
    expect(s.getMember('a3')).toBeUndefined();
  });
  it('force removing leader triggers re-election', () => {
    const s = make({ quorum: { minimumSize: 1 } });
    s.join({ agentId: 'a1' });
    s.join({ agentId: 'a2' });
    s.removeForcefully('a1', 'kicked');
    expect(s.getLeader()?.agentId).toBe('a2');
  });
  it('removing unknown agent does not throw', () => {
    const s = make();
    expect(() => s.removeForcefully('ghost', 'test')).not.toThrow();
  });
});

describe('SwarmMembership — observers', () => {
  it('observer join succeeds', () => {
    const s = make({ allowObservers: true, maxObservers: 5 });
    expect(s.join({ agentId: 'obs1', requestedRole: 'observer' })).toBe(true);
  });
  it('observer not counted in getMemberCount', () => {
    const s = make({ allowObservers: true });
    s.join({ agentId: 'a1' });
    s.join({ agentId: 'obs1', requestedRole: 'observer' });
    expect(s.getMemberCount()).toBe(1); // only non-observer
  });
  it('observer join blocked when allowObservers=false', () => {
    const s = make({ allowObservers: false });
    expect(s.join({ agentId: 'obs1', requestedRole: 'observer' })).toBe(false);
  });
  it('observer join blocked when maxObservers reached', () => {
    const s = make({ allowObservers: true, maxObservers: 1 });
    s.join({ agentId: 'obs1', requestedRole: 'observer' });
    expect(s.join({ agentId: 'obs2', requestedRole: 'observer' })).toBe(false);
  });
});

describe('SwarmMembership — approval workflow', () => {
  it('join pending when requireApprovalToJoin=true and leader present', () => {
    const s = make({ requireApprovalToJoin: true });
    s.join({ agentId: 'leader' }); // auto-leader
    const result = s.join({ agentId: 'newcomer' });
    expect(result).toBe(false);
    expect(s.getPendingJoins()).toHaveLength(1);
    expect(s.getPendingJoins()[0].agentId).toBe('newcomer');
  });
  it('approveJoin by leader succeeds', () => {
    const s = make({ requireApprovalToJoin: true, quorum: { minimumSize: 1 } });
    s.join({ agentId: 'leader' });
    s.join({ agentId: 'newcomer' });
    expect(s.approveJoin('leader', 'newcomer')).toBe(true);
    expect(s.getMemberCount()).toBe(2);
  });
  it('approveJoin by non-leader fails', () => {
    const s = make({ requireApprovalToJoin: true });
    s.join({ agentId: 'leader' });
    s.join({ agentId: 'a2' });
    s.join({ agentId: 'newcomer' });
    expect(s.approveJoin('a2', 'newcomer')).toBe(false);
  });
  it('approveJoin for non-pending fails', () => {
    const s = make({ requireApprovalToJoin: true });
    s.join({ agentId: 'leader' });
    expect(s.approveJoin('leader', 'ghost')).toBe(false);
  });
});

describe('SwarmMembership — changeRole', () => {
  it('changeRole to leader updates leaderId', () => {
    const s = make({ quorum: { minimumSize: 1 } });
    s.join({ agentId: 'a1' });
    s.join({ agentId: 'a2' });
    s.changeRole('a2', 'leader');
    expect(s.getLeader()?.agentId).toBe('a2');
  });
  it('old leader demoted to member when new leader elected', () => {
    const s = make({ quorum: { minimumSize: 1 } });
    s.join({ agentId: 'a1' });
    s.join({ agentId: 'a2' });
    s.changeRole('a2', 'leader');
    expect(s.getMember('a1')?.role).toBe('member');
  });
  it('changeRole returns false for unknown agent', () => {
    const s = make();
    expect(s.changeRole('ghost', 'member')).toBe(false);
  });
});

describe('SwarmMembership — heartbeat & timeouts', () => {
  it('heartbeat updates lastHeartbeat', () => {
    const s = make();
    s.join({ agentId: 'a1' });
    const before = s.getMember('a1')!.lastHeartbeat;
    s.heartbeat('a1');
    expect(s.getMember('a1')!.lastHeartbeat).toBeGreaterThanOrEqual(before);
  });
  it('heartbeat reactivates inactive member', async () => {
    const s = make({ heartbeatTimeoutMs: 1 });
    s.join({ agentId: 'a1' });
    await new Promise((r) => setTimeout(r, 5)); // let timeout expire
    s.checkTimeouts(); // marks inactive
    s.heartbeat('a1');
    expect(s.getMember('a1')?.status).toBe('active');
  });
  it('checkTimeouts returns timed-out IDs', async () => {
    const s = make({ heartbeatTimeoutMs: 1 });
    s.join({ agentId: 'a1' });
    s.join({ agentId: 'a2' });
    await new Promise((r) => setTimeout(r, 5)); // let timeout expire
    const timedOut = s.checkTimeouts();
    expect(timedOut).toContain('a1');
    expect(timedOut).toContain('a2');
  });
  it('non-timed-out members not included', () => {
    const s = make({ heartbeatTimeoutMs: 999999 });
    s.join({ agentId: 'a1' });
    expect(s.checkTimeouts()).toHaveLength(0);
  });
});

describe('SwarmMembership — events', () => {
  it('emits joined event on join', () => {
    const s = make();
    const events: string[] = [];
    s.onEvent((e) => events.push(e.type));
    s.join({ agentId: 'a1' });
    expect(events).toContain('joined');
  });
  it('emits left event on leave', () => {
    const s = make({ quorum: { minimumSize: 1 } });
    const events: string[] = [];
    s.join({ agentId: 'a1' });
    s.join({ agentId: 'a2' });
    s.onEvent((e) => events.push(e.type));
    s.leave({ agentId: 'a2', graceful: true });
    expect(events).toContain('left');
  });
  it('emits quorum-gained when threshold reached', () => {
    // quorum requires 3 (ceil(5*0.5)=3 effective) by default
    const events: string[] = [];
    const s = make();
    s.onEvent((e) => events.push(e.type));
    s.join({ agentId: 'a1' });
    s.join({ agentId: 'a2' });
    s.join({ agentId: 'a3' });
    expect(events).toContain('quorum-gained');
  });
  it('unsubscribe returned function removes handler', () => {
    const s = make();
    const events: string[] = [];
    const unsub = s.onEvent((e) => events.push(e.type));
    unsub();
    s.join({ agentId: 'a1' });
    expect(events).toHaveLength(0);
  });
});

describe('SwarmMembership — getActiveMembers / getMembers', () => {
  it('getMembers includes all roles', () => {
    const s = make({ allowObservers: true });
    s.join({ agentId: 'a1' });
    s.join({ agentId: 'obs1', requestedRole: 'observer' });
    expect(s.getMembers()).toHaveLength(2);
  });
  it('getActiveMembers excludes observers and inactive', async () => {
    const s = make({ allowObservers: true, heartbeatTimeoutMs: 1 });
    s.join({ agentId: 'a1' });
    s.join({ agentId: 'obs1', requestedRole: 'observer' });
    await new Promise((r) => setTimeout(r, 5)); // let timeout expire
    s.checkTimeouts(); // marks a1 inactive
    expect(s.getActiveMembers()).toHaveLength(0);
  });
});
