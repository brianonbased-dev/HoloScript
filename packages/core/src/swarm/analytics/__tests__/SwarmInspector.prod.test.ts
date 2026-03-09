/**
 * SwarmInspector — Production Tests
 */
import { describe, it, expect } from 'vitest';
import { SwarmInspector } from '../SwarmInspector';
import type {
  IAgentSnapshot,
  ISwarmSnapshot,
  IAgentRelation,
  IHealthCheck,
} from '../SwarmInspector';

function make(cfg = {}) {
  return new SwarmInspector(cfg);
}

function agent(id: string, overrides: Partial<IAgentSnapshot> = {}): IAgentSnapshot {
  return {
    id,
    state: 'active',
    health: 1,
    load: 0,
    lastActive: Date.now(),
    properties: {},
    ...overrides,
  };
}
function swarm(id: string, overrides: Partial<ISwarmSnapshot> = {}): ISwarmSnapshot {
  return {
    id,
    memberCount: 0,
    state: 'active',
    createdAt: Date.now(),
    properties: {},
    ...overrides,
  };
}
function health(name: string, status: IHealthCheck['status'] = 'healthy'): IHealthCheck {
  return { name, status, lastCheck: Date.now() };
}

describe('SwarmInspector — construction', () => {
  it('constructs without args', () => expect(() => make()).not.toThrow());
  it('custom maxEvents', () => expect(() => make({ maxEvents: 50 })).not.toThrow());
  it('empty state on construction', () => {
    const s = make();
    expect(s.getAllAgents()).toHaveLength(0);
  });
});

describe('SwarmInspector — agent tracking', () => {
  it('updateAgent stores snapshot', () => {
    const s = make();
    s.updateAgent(agent('a1'));
    expect(s.getAgent('a1')).toBeDefined();
    expect(s.getAgent('a1')!.id).toBe('a1');
  });
  it('getAllAgents returns all', () => {
    const s = make();
    s.updateAgent(agent('a1'));
    s.updateAgent(agent('a2'));
    expect(s.getAllAgents()).toHaveLength(2);
  });
  it('updateAgent overwrites existing', () => {
    const s = make();
    s.updateAgent(agent('a1', { health: 1 }));
    s.updateAgent(agent('a1', { health: 0.5 }));
    expect(s.getAgent('a1')!.health).toBe(0.5);
  });
  it('removeAgent deletes snapshot', () => {
    const s = make();
    s.updateAgent(agent('a1'));
    s.removeAgent('a1');
    expect(s.getAgent('a1')).toBeUndefined();
  });
  it('getAgent unknown=undefined', () => {
    expect(make().getAgent('ghost')).toBeUndefined();
  });
  it('getSwarmAgents filters by swarmId', () => {
    const s = make();
    s.updateAgent(agent('a1', { swarmId: 's1' }));
    s.updateAgent(agent('a2', { swarmId: 's2' }));
    s.updateAgent(agent('a3', { swarmId: 's1' }));
    expect(s.getSwarmAgents('s1')).toHaveLength(2);
  });
});

describe('SwarmInspector — swarm tracking', () => {
  it('updateSwarm stores snapshot', () => {
    const s = make();
    s.updateSwarm(swarm('sw1'));
    expect(s.getSwarm('sw1')).toBeDefined();
  });
  it('getAllSwarms returns all', () => {
    const s = make();
    s.updateSwarm(swarm('sw1'));
    s.updateSwarm(swarm('sw2'));
    expect(s.getAllSwarms()).toHaveLength(2);
  });
  it('updateSwarm overwrites existing', () => {
    const s = make();
    s.updateSwarm(swarm('sw1', { memberCount: 1 }));
    s.updateSwarm(swarm('sw1', { memberCount: 5 }));
    expect(s.getSwarm('sw1')!.memberCount).toBe(5);
  });
  it('removeSwarm deletes snapshot', () => {
    const s = make();
    s.updateSwarm(swarm('sw1'));
    s.removeSwarm('sw1');
    expect(s.getSwarm('sw1')).toBeUndefined();
  });
});

describe('SwarmInspector — relations', () => {
  it('addRelation stores relation', () => {
    const s = make();
    s.addRelation({ sourceId: 'a1', targetId: 'a2', type: 'member', strength: 1 });
    expect(s.getAllRelations()).toHaveLength(1);
  });
  it('duplicate addRelation updates existing', () => {
    const s = make();
    s.addRelation({ sourceId: 'a1', targetId: 'a2', type: 'member', strength: 1 });
    s.addRelation({ sourceId: 'a1', targetId: 'a2', type: 'member', strength: 0.5 });
    expect(s.getAllRelations()).toHaveLength(1);
    expect(s.getAllRelations()[0].strength).toBe(0.5);
  });
  it('getAgentRelations includes source and target', () => {
    const s = make();
    s.addRelation({ sourceId: 'a1', targetId: 'a2', type: 'leader', strength: 1 });
    expect(s.getAgentRelations('a1')).toHaveLength(1);
    expect(s.getAgentRelations('a2')).toHaveLength(1);
  });
  it('removeRelation removes specific relation', () => {
    const s = make();
    s.addRelation({ sourceId: 'a1', targetId: 'a2', type: 'member', strength: 1 });
    s.removeRelation('a1', 'a2', 'member');
    expect(s.getAllRelations()).toHaveLength(0);
  });
  it('removeAgent also removes its relations', () => {
    const s = make();
    s.updateAgent(agent('a1'));
    s.updateAgent(agent('a2'));
    s.addRelation({ sourceId: 'a1', targetId: 'a2', type: 'neighbor', strength: 1 });
    s.removeAgent('a1');
    expect(s.getAllRelations()).toHaveLength(0);
  });
  it('getAllRelations returns copy', () => {
    const s = make();
    const r1 = s.getAllRelations();
    const r2 = s.getAllRelations();
    expect(r1).not.toBe(r2);
  });
});

describe('SwarmInspector — health checks', () => {
  it('registerHealthCheck stored', () => {
    const s = make();
    s.registerHealthCheck(health('db'));
    expect(s.getHealthCheck('db')?.name).toBe('db');
  });
  it('getAllHealthChecks returns all', () => {
    const s = make();
    s.registerHealthCheck(health('db'));
    s.registerHealthCheck(health('cache'));
    expect(s.getAllHealthChecks()).toHaveLength(2);
  });
  it('getOverallHealth healthy when all healthy', () => {
    const s = make();
    s.registerHealthCheck(health('a'));
    s.registerHealthCheck(health('b'));
    expect(s.getOverallHealth()).toBe('healthy');
  });
  it('getOverallHealth degraded when any degraded', () => {
    const s = make();
    s.registerHealthCheck(health('a', 'healthy'));
    s.registerHealthCheck(health('b', 'degraded'));
    expect(s.getOverallHealth()).toBe('degraded');
  });
  it('getOverallHealth unhealthy when any unhealthy', () => {
    const s = make();
    s.registerHealthCheck(health('a', 'healthy'));
    s.registerHealthCheck(health('b', 'unhealthy'));
    expect(s.getOverallHealth()).toBe('unhealthy');
  });
  it('empty checks → healthy', () => {
    expect(make().getOverallHealth()).toBe('healthy');
  });
  it('getHealthCheck unknown=undefined', () => {
    expect(make().getHealthCheck('ghost')).toBeUndefined();
  });
});

describe('SwarmInspector — event log', () => {
  it('log stores event', () => {
    const s = make();
    s.log('info', 'test', 'message');
    expect(s.getEventLog()).toHaveLength(1);
  });
  it('log helpers (trace/debug/info/warn/error)', () => {
    const s = make();
    s.trace('src', 'trace msg');
    s.debug('src', 'debug msg');
    s.info('src', 'info msg');
    s.warn('src', 'warn msg');
    s.error('src', 'error msg');
    expect(s.getEventLog()).toHaveLength(5);
  });
  it('event has id, timestamp, level, source, message', () => {
    const s = make();
    s.info('mySource', 'hello');
    const e = s.getEventLog()[0];
    expect(e.id).toBeTruthy();
    expect(e.timestamp).toBeTruthy();
    expect(e.level).toBe('info');
    expect(e.source).toBe('mySource');
    expect(e.message).toBe('hello');
  });
  it('getEventLog filter by level', () => {
    const s = make();
    s.info('s', 'm');
    s.warn('s', 'w');
    expect(s.getEventLog({ level: 'warn' })).toHaveLength(1);
  });
  it('getEventLog filter by source', () => {
    const s = make();
    s.info('alpha', 'a');
    s.info('beta', 'b');
    expect(s.getEventLog({ source: 'alpha' })).toHaveLength(1);
  });
  it('getEventLog limit', () => {
    const s = make({ maxEvents: 100 });
    for (let i = 0; i < 5; i++) s.info('s', `msg-${i}`);
    expect(s.getEventLog({ limit: 2 })).toHaveLength(2);
  });
  it('maxEvents trims oldest', () => {
    const s = make({ maxEvents: 3 });
    for (let i = 0; i < 5; i++) s.info('s', `msg-${i}`);
    expect(s.getEventLog()).toHaveLength(3);
  });
  it('clearEventLog empties log', () => {
    const s = make();
    s.info('s', 'm');
    s.clearEventLog();
    expect(s.getEventLog()).toHaveLength(0);
  });
  it('addEventListener called on log', () => {
    const s = make();
    const events: string[] = [];
    s.addEventListener((e) => events.push(e.level));
    s.info('s', 'm');
    s.warn('s', 'w');
    expect(events).toEqual(['info', 'warn']);
  });
  it('removeListener stops events', () => {
    const s = make();
    const events: string[] = [];
    const unsub = s.addEventListener((e) => events.push(e.level));
    unsub();
    s.info('s', 'm');
    expect(events).toHaveLength(0);
  });
});

describe('SwarmInspector — inspect()', () => {
  it('returns IInspectionResult structure', () => {
    const s = make();
    const r = s.inspect();
    expect(r).toHaveProperty('timestamp');
    expect(r).toHaveProperty('swarms');
    expect(r).toHaveProperty('agents');
    expect(r).toHaveProperty('relations');
    expect(r).toHaveProperty('health');
    expect(r).toHaveProperty('summary');
  });
  it('summary counts correct', () => {
    const s = make();
    s.updateAgent(agent('a1', { health: 0.8 }));
    s.updateAgent(agent('a2', { health: 0.2 }));
    s.updateSwarm(swarm('sw1'));
    const r = s.inspect();
    expect(r.summary.totalAgents).toBe(2);
    expect(r.summary.totalSwarms).toBe(1);
    expect(r.summary.healthyAgents).toBe(1); // only a1 >= 0.5
  });
  it('averageLoad computed correctly', () => {
    const s = make();
    s.updateAgent(agent('a1', { load: 0.4 }));
    s.updateAgent(agent('a2', { load: 0.6 }));
    expect(s.inspect().summary.averageLoad).toBeCloseTo(0.5, 10);
  });
  it('warnings for degraded health', () => {
    const s = make();
    s.registerHealthCheck(health('db', 'unhealthy'));
    expect(s.inspect().summary.warnings).toContain('System health is degraded');
  });
  it('warnings for low-health agents', () => {
    const s = make();
    s.updateAgent(agent('a1', { health: 0.1 }));
    expect(s.inspect().summary.warnings).toContain('1 agents have low health');
  });
  it('warnings for overloaded agents', () => {
    const s = make();
    s.updateAgent(agent('a1', { load: 0.95 }));
    expect(s.inspect().summary.warnings).toContain('1 agents are overloaded');
  });
  it('warnings for stale agents', () => {
    const s = make();
    s.updateAgent(agent('a1', { lastActive: Date.now() - 70000 }));
    expect(s.inspect().summary.warnings).toContain('1 agents are stale');
  });
});

describe('SwarmInspector — toGraph()', () => {
  it('returns nodes and edges', () => {
    const s = make();
    const g = s.toGraph();
    expect(g).toHaveProperty('nodes');
    expect(g).toHaveProperty('edges');
  });
  it('agent node in graph', () => {
    const s = make();
    s.updateAgent(agent('a1'));
    const g = s.toGraph();
    expect(g.nodes.some((n) => n.id === 'a1' && n.type === 'agent')).toBe(true);
  });
  it('swarm node in graph', () => {
    const s = make();
    s.updateSwarm(swarm('sw1'));
    const g = s.toGraph();
    expect(g.nodes.some((n) => n.id === 'sw1' && n.type === 'swarm')).toBe(true);
  });
  it('member edge from agent to swarm', () => {
    const s = make();
    s.updateSwarm(swarm('sw1'));
    s.updateAgent(agent('a1', { swarmId: 'sw1' }));
    const g = s.toGraph();
    expect(
      g.edges.some((e) => e.source === 'a1' && e.target === 'sw1' && e.type === 'member')
    ).toBe(true);
  });
  it('relation edge in graph', () => {
    const s = make();
    s.addRelation({ sourceId: 'a1', targetId: 'a2', type: 'neighbor', strength: 0.7 });
    const g = s.toGraph();
    expect(g.edges.some((e) => e.source === 'a1' && e.target === 'a2' && e.weight === 0.7)).toBe(
      true
    );
  });
});

describe('SwarmInspector — reset()', () => {
  it('clears all state', () => {
    const s = make();
    s.updateAgent(agent('a1'));
    s.updateSwarm(swarm('sw1'));
    s.addRelation({ sourceId: 'a1', targetId: '?', type: 'custom', strength: 1 });
    s.registerHealthCheck(health('db'));
    s.info('src', 'msg');
    s.reset();
    expect(s.getAllAgents()).toHaveLength(0);
    expect(s.getAllSwarms()).toHaveLength(0);
    expect(s.getAllRelations()).toHaveLength(0);
    expect(s.getAllHealthChecks()).toHaveLength(0);
    expect(s.getEventLog()).toHaveLength(0);
  });
});
