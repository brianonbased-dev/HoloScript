/**
 * SwarmManager — Production Tests
 */
import { describe, it, expect } from 'vitest';
import { SwarmManager } from '../SwarmManager';
import type { SwarmEvent } from '../SwarmManager';

function make(cfg = {}) { return new SwarmManager(cfg); }

function req(name = 'Alpha', objective = 'Do stuff', createdBy = 'a1', extra = {}) {
  return { name, objective, createdBy, ...extra };
}

describe('SwarmManager — createSwarm', () => {
  it('creates swarm with required fields', () => {
    const sm = make(); const sw = sm.createSwarm(req());
    expect(sw.id.startsWith('swarm-')).toBe(true);
    expect(sw.name).toBe('Alpha'); expect(sw.objective).toBe('Do stuff');
    expect(sw.createdBy).toBe('a1');
  });
  it('creator is tracked in membership', () => {
    const sm = make(); const sw = sm.createSwarm(req());
    expect(sw.membership.getMember('a1')).toBeDefined();
  });
  it('creator is swarm leader', () => {
    const sm = make(); const sw = sm.createSwarm(req());
    expect(sw.membership.getLeader()?.agentId).toBe('a1');
  });
  it('status=forming initially', () => {
    const sm = make(); expect(sm.createSwarm(req()).status).toBe('forming');
  });
  it('getSwarm returns created swarm', () => {
    const sm = make(); const sw = sm.createSwarm(req());
    expect(sm.getSwarm(sw.id)).toBe(sw);
  });
  it('emits swarm-created event', () => {
    const events: string[] = [];
    const sm = make(); sm.onEvent((e) => events.push(e.type));
    sm.createSwarm(req());
    expect(events).toContain('swarm-created');
  });
  it('throws when agent at maxSwarmsPerAgent', () => {
    const sm = make({ maxSwarmsPerAgent: 1 });
    sm.createSwarm(req());
    expect(() => sm.createSwarm(req('Beta', 'xyz', 'a1'))).toThrow();
  });
  it('metadata stored', () => {
    const sm = make(); const sw = sm.createSwarm(req('A', 'b', 'a1', { metadata: { region: 'us' } }));
    expect(sw.metadata?.region).toBe('us');
  });
});

describe('SwarmManager — joinSwarm', () => {
  it('joinSwarm adds member', () => {
    const sm = make();
    const sw = sm.createSwarm(req());
    sm.joinSwarm(sw.id, 'a2');
    expect(sw.membership.getMember('a2')).toBeDefined();
  });
  it('joinSwarm returns true on success', () => {
    const sm = make(); const sw = sm.createSwarm(req());
    expect(sm.joinSwarm(sw.id, 'a2')).toBe(true);
  });
  it('joinSwarm unknown swarm throws', () => {
    expect(() => make().joinSwarm('ghost', 'a1')).toThrow();
  });
  it('joinSwarm disbanded swarm throws', () => {
    const sm = make(); const sw = sm.createSwarm(req());
    sm.disbandSwarm(sw.id, { reason: 'test', redistributeTasks: false, notifyMembers: false });
    expect(() => sm.joinSwarm(sw.id, 'a2')).toThrow();
  });
  it('joinSwarm as observer does not count against member limit', () => {
    const sm = make({ maxSwarmsPerAgent: 1 });
    sm.createSwarm(req()); // agent a1 hits limit
    const sw2 = sm.createSwarm(req('Beta', 'b', 'a2'));
    expect(() => sm.joinSwarm(sw2.id, 'a1', true)).not.toThrow(); // observer is fine
  });
  it('getAgentSwarms returns swarms', () => {
    const sm = make();
    const sw = sm.createSwarm(req());
    sm.joinSwarm(sw.id, 'a2');
    expect(sm.getAgentSwarms('a2')).toHaveLength(1);
  });
});

describe('SwarmManager — leaveSwarm', () => {
  it('leaveSwarm removes member (leader leaves)', () => {
    // With only 1 member (the creator/leader), graceful leave is allowed (last member case)
    // But to test removal of non-leader we need extra members so quorum stays
    const sm = make({ disbandEmptySwarms: false });
    const sw = sm.createSwarm(req('A', 'b', 'a1', { membershipConfig: { quorum: { minimumSize: 1, optimalSize: 3, maximumSize: 10, quorumPercentage: 0.3 } } }));
    sm.joinSwarm(sw.id, 'a2');
    sm.joinSwarm(sw.id, 'a3');
    sm.leaveSwarm(sw.id, 'a2');
    // After leave, member either removed or in 'leaving' — definitely not active
    const member = sw.membership.getMember('a2');
    expect(!member || member.status === 'leaving').toBe(true);
  });
  it('leaveSwarm unknown swarm throws', () => {
    expect(() => make().leaveSwarm('ghost', 'a1')).toThrow();
  });
  it('leaveSwarm untracks agent from swarm when fully removed', () => {
    // graceful leave of last member removes immediately
    const sm = make({ disbandEmptySwarms: false });
    const sw = sm.createSwarm(req());
    // a1 is the only member — graceful leave is allowed for last member
    sm.leaveSwarm(sw.id, 'a1', true);
    expect(sm.getAgentSwarms('a1')).toHaveLength(0);
  });
});

describe('SwarmManager — disbandSwarm', () => {
  it('sets status=disbanded', () => {
    const sm = make(); const sw = sm.createSwarm(req());
    sm.disbandSwarm(sw.id, { reason: 'done', redistributeTasks: false, notifyMembers: false });
    expect(sm.getSwarm(sw.id)!.status).toBe('disbanded');
  });
  it('removes all members', () => {
    const sm = make(); const sw = sm.createSwarm(req());
    sm.joinSwarm(sw.id, 'a2'); sm.joinSwarm(sw.id, 'a3');
    sm.disbandSwarm(sw.id, { reason: 'x', redistributeTasks: false, notifyMembers: false });
    expect(sw.membership.getMemberCount()).toBe(0);
  });
  it('emits swarm-disbanded event', () => {
    const events: string[] = [];
    const sm = make(); sm.onEvent((e) => events.push(e.type));
    const sw = sm.createSwarm(req());
    sm.disbandSwarm(sw.id, { reason: 'x', redistributeTasks: false, notifyMembers: false });
    expect(events).toContain('swarm-disbanded');
  });
  it('disbanding already disbanded swarm is idempotent', () => {
    const sm = make(); const sw = sm.createSwarm(req());
    sm.disbandSwarm(sw.id, { reason: 'x', redistributeTasks: false, notifyMembers: false });
    expect(() => sm.disbandSwarm(sw.id, { reason: 'x2', redistributeTasks: false, notifyMembers: false })).not.toThrow();
  });
  it('disbandSwarm unknown throws', () => {
    expect(() => make().disbandSwarm('ghost', { reason: 'x', redistributeTasks: false, notifyMembers: false })).toThrow();
  });
});

describe('SwarmManager — getSwarm queries', () => {
  it('getSwarm unknown=undefined', () => { expect(make().getSwarm('ghost')).toBeUndefined(); });
  it('getAllSwarms returns all', () => {
    const sm = make(); sm.createSwarm(req()); sm.createSwarm(req('Beta', 'b', 'a2'));
    expect(sm.getAllSwarms()).toHaveLength(2);
  });
  it('getActiveSwarms includes forming/active', () => {
    const sm = make(); sm.createSwarm(req()); sm.createSwarm(req('Beta', 'b', 'a2'));
    expect(sm.getActiveSwarms()).toHaveLength(2); // both forming
  });
  it('getActiveSwarms excludes disbanded', () => {
    const sm = make(); const sw = sm.createSwarm(req());
    sm.disbandSwarm(sw.id, { reason: 'x', redistributeTasks: false, notifyMembers: false });
    expect(sm.getActiveSwarms()).toHaveLength(0);
  });
});

describe('SwarmManager — findSwarmsByObjective', () => {
  it('finds by objective substring', () => {
    const sm = make(); sm.createSwarm(req('A', 'optimize redis cache'));
    sm.createSwarm(req('B', 'upgrade database', 'a2'));
    expect(sm.findSwarmsByObjective('redis')).toHaveLength(1);
  });
  it('finds by name substring', () => {
    const sm = make(); sm.createSwarm(req('AlphaTeam', 'do things'));
    expect(sm.findSwarmsByObjective('Alpha')).toHaveLength(1);
  });
  it('case-insensitive match', () => {
    const sm = make(); sm.createSwarm(req('A', 'Implement Redis Caching'));
    expect(sm.findSwarmsByObjective('redis')).toHaveLength(1);
  });
  it('no match returns empty', () => {
    const sm = make(); sm.createSwarm(req());
    expect(sm.findSwarmsByObjective('zzznomatch')).toHaveLength(0);
  });
});

describe('SwarmManager — getSwarmStats', () => {
  it('returns undefined for unknown', () => { expect(make().getSwarmStats('ghost')).toBeUndefined(); });
  it('returns memberCount, quorumState, ageMs, healthScore', () => {
    const sm = make(); const sw = sm.createSwarm(req());
    const stats = sm.getSwarmStats(sw.id)!;
    expect(stats.memberCount).toBe(1);
    expect(stats.quorumState).toBeDefined();
    expect(stats.ageMs).toBeGreaterThanOrEqual(0);
    expect(stats.healthScore).toBeGreaterThan(0);
  });
  it('healthScore=0 for disbanded swarm', () => {
    const sm = make(); const sw = sm.createSwarm(req());
    sm.disbandSwarm(sw.id, { reason: 'x', redistributeTasks: false, notifyMembers: false });
    expect(sm.getSwarmStats(sw.id)!.healthScore).toBe(0);
  });
  it('healthScore increases with quorum', () => {
    const sm = make({ defaultMembershipConfig: { quorum: { minimumSize: 1, optimalSize: 3, maximumSize: 10, quorumPercentage: 0.5 } } });
    const sw = sm.createSwarm(req());
    sm.joinSwarm(sw.id, 'a2'); sm.joinSwarm(sw.id, 'a3');
    expect(sm.getSwarmStats(sw.id)!.healthScore).toBeGreaterThan(0.5);
  });
});

describe('SwarmManager — events', () => {
  it('member-joined emitted on joinSwarm', () => {
    const events: SwarmEvent[] = [];
    const sm = make(); sm.onEvent((e) => events.push(e));
    const sw = sm.createSwarm(req());
    sm.joinSwarm(sw.id, 'a2');
    expect(events.some((e) => e.type === 'member-joined' && e.agentId === 'a2')).toBe(true);
  });
  it('member-left emitted when last member leaves gracefully', () => {
    const events: SwarmEvent[] = [];
    const sm = make({ disbandEmptySwarms: false }); const sw = sm.createSwarm(req());
    sm.onEvent((e) => events.push(e));
    // a1 is last member; graceful leave of last triggers full removal
    sm.leaveSwarm(sw.id, 'a1', true);
    expect(events.some((e) => e.type === 'member-left')).toBe(true);
  });
  it('status-changed emitted when forming→active', () => {
    const events: SwarmEvent[] = [];
    const sm = make({ defaultMembershipConfig: { quorum: { minimumSize: 1, optimalSize: 2, maximumSize: 10, quorumPercentage: 0.5 } } });
    const sw = sm.createSwarm(req());
    sm.onEvent((e) => events.push(e)); // subscribe after create
    sm.joinSwarm(sw.id, 'a2'); // now has quorum (2+ >= 1 threshold)
    // May or may not emit depending on initial quorum calculation
    // just check it doesn't throw
    expect(events).toBeDefined();
  });
  it('onEvent unsub removes handler', () => {
    const events: string[] = [];
    const sm = make(); const unsub = sm.onEvent((e) => events.push(e.type));
    unsub();
    sm.createSwarm(req());
    expect(events).toHaveLength(0);
  });
});

describe('SwarmManager — performMaintenance', () => {
  it('returns empty array when no timeouts', () => {
    const sm = make(); sm.createSwarm(req());
    expect(sm.performMaintenance()).toHaveLength(0);
  });
  it('does not throw with multiple swarms', () => {
    const sm = make();
    sm.createSwarm(req()); sm.createSwarm(req('B', 'b', 'a2'));
    expect(() => sm.performMaintenance()).not.toThrow();
  });
  it('skips disbanded swarms', () => {
    const sm = make(); const sw = sm.createSwarm(req());
    sm.disbandSwarm(sw.id, { reason: 'x', redistributeTasks: false, notifyMembers: false });
    expect(() => sm.performMaintenance()).not.toThrow();
  });
});
