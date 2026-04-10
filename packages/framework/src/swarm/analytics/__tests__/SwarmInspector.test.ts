/**
 * SwarmInspector Tests
 * HoloScript v3.2 - Autonomous Agent Swarms
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SwarmInspector, IAgentSnapshot, ISwarmSnapshot } from '../SwarmInspector';

describe('SwarmInspector', () => {
  let inspector: SwarmInspector;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    inspector = new SwarmInspector();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('agent tracking', () => {
    const createAgent = (id: string, overrides?: Partial<IAgentSnapshot>): IAgentSnapshot => ({
      id,
      state: 'active',
      health: 1.0,
      load: 0.5,
      lastActive: Date.now(),
      properties: {},
      ...overrides,
    });

    it('should update agent snapshot', () => {
      const agent = createAgent('agent-1');
      inspector.updateAgent(agent);

      expect(inspector.getAgent('agent-1')).toEqual(agent);
    });

    it('should remove agent snapshot', () => {
      inspector.updateAgent(createAgent('agent-1'));
      inspector.removeAgent('agent-1');

      expect(inspector.getAgent('agent-1')).toBeUndefined();
    });

    it('should get all agents', () => {
      inspector.updateAgent(createAgent('a1'));
      inspector.updateAgent(createAgent('a2'));
      inspector.updateAgent(createAgent('a3'));

      expect(inspector.getAllAgents()).toHaveLength(3);
    });

    it('should get agents by swarm', () => {
      inspector.updateAgent(createAgent('a1', { swarmId: 'swarm-1' }));
      inspector.updateAgent(createAgent('a2', { swarmId: 'swarm-1' }));
      inspector.updateAgent(createAgent('a3', { swarmId: 'swarm-2' }));

      expect(inspector.getSwarmAgents('swarm-1')).toHaveLength(2);
      expect(inspector.getSwarmAgents('swarm-2')).toHaveLength(1);
    });

    it('should remove relations when agent removed', () => {
      inspector.updateAgent(createAgent('a1'));
      inspector.updateAgent(createAgent('a2'));
      inspector.addRelation({
        sourceId: 'a1',
        targetId: 'a2',
        type: 'neighbor',
        strength: 0.8,
      });

      inspector.removeAgent('a1');

      expect(inspector.getAgentRelations('a2')).toHaveLength(0);
    });
  });

  describe('swarm tracking', () => {
    const createSwarm = (id: string, overrides?: Partial<ISwarmSnapshot>): ISwarmSnapshot => ({
      id,
      memberCount: 5,
      state: 'active',
      createdAt: Date.now(),
      properties: {},
      ...overrides,
    });

    it('should update swarm snapshot', () => {
      const swarm = createSwarm('swarm-1');
      inspector.updateSwarm(swarm);

      expect(inspector.getSwarm('swarm-1')).toEqual(swarm);
    });

    it('should remove swarm snapshot', () => {
      inspector.updateSwarm(createSwarm('swarm-1'));
      inspector.removeSwarm('swarm-1');

      expect(inspector.getSwarm('swarm-1')).toBeUndefined();
    });

    it('should get all swarms', () => {
      inspector.updateSwarm(createSwarm('s1'));
      inspector.updateSwarm(createSwarm('s2'));

      expect(inspector.getAllSwarms()).toHaveLength(2);
    });
  });

  describe('relations', () => {
    it('should add relation between agents', () => {
      inspector.addRelation({
        sourceId: 'a1',
        targetId: 'a2',
        type: 'neighbor',
        strength: 0.7,
      });

      const relations = inspector.getAllRelations();
      expect(relations).toHaveLength(1);
      expect(relations[0].strength).toBe(0.7);
    });

    it('should update existing relation', () => {
      inspector.addRelation({ sourceId: 'a1', targetId: 'a2', type: 'neighbor', strength: 0.5 });
      inspector.addRelation({ sourceId: 'a1', targetId: 'a2', type: 'neighbor', strength: 0.9 });

      const relations = inspector.getAllRelations();
      expect(relations).toHaveLength(1);
      expect(relations[0].strength).toBe(0.9);
    });

    it('should allow different relation types', () => {
      inspector.addRelation({ sourceId: 'a1', targetId: 'a2', type: 'neighbor', strength: 0.5 });
      inspector.addRelation({
        sourceId: 'a1',
        targetId: 'a2',
        type: 'communication',
        strength: 0.8,
      });

      expect(inspector.getAllRelations()).toHaveLength(2);
    });

    it('should remove relation', () => {
      inspector.addRelation({ sourceId: 'a1', targetId: 'a2', type: 'neighbor', strength: 0.5 });
      inspector.removeRelation('a1', 'a2', 'neighbor');

      expect(inspector.getAllRelations()).toHaveLength(0);
    });

    it('should get relations for agent', () => {
      inspector.addRelation({ sourceId: 'a1', targetId: 'a2', type: 'neighbor', strength: 0.5 });
      inspector.addRelation({ sourceId: 'a3', targetId: 'a1', type: 'neighbor', strength: 0.6 });
      inspector.addRelation({ sourceId: 'a2', targetId: 'a3', type: 'neighbor', strength: 0.7 });

      const a1Relations = inspector.getAgentRelations('a1');
      expect(a1Relations).toHaveLength(2);
    });
  });

  describe('health checks', () => {
    it('should register health check', () => {
      inspector.registerHealthCheck({
        name: 'database',
        status: 'healthy',
        latency: 5,
        lastCheck: Date.now(),
      });

      expect(inspector.getHealthCheck('database')?.status).toBe('healthy');
    });

    it('should get all health checks', () => {
      inspector.registerHealthCheck({ name: 'db', status: 'healthy', lastCheck: Date.now() });
      inspector.registerHealthCheck({ name: 'cache', status: 'degraded', lastCheck: Date.now() });

      expect(inspector.getAllHealthChecks()).toHaveLength(2);
    });

    it('should return healthy when all checks pass', () => {
      inspector.registerHealthCheck({ name: 'db', status: 'healthy', lastCheck: Date.now() });
      inspector.registerHealthCheck({ name: 'cache', status: 'healthy', lastCheck: Date.now() });

      expect(inspector.getOverallHealth()).toBe('healthy');
    });

    it('should return degraded when any check degraded', () => {
      inspector.registerHealthCheck({ name: 'db', status: 'healthy', lastCheck: Date.now() });
      inspector.registerHealthCheck({ name: 'cache', status: 'degraded', lastCheck: Date.now() });

      expect(inspector.getOverallHealth()).toBe('degraded');
    });

    it('should return unhealthy when any check unhealthy', () => {
      inspector.registerHealthCheck({ name: 'db', status: 'unhealthy', lastCheck: Date.now() });
      inspector.registerHealthCheck({ name: 'cache', status: 'healthy', lastCheck: Date.now() });

      expect(inspector.getOverallHealth()).toBe('unhealthy');
    });
  });

  describe('debug events', () => {
    it('should log events with different levels', () => {
      inspector.trace('source1', 'trace message');
      inspector.debug('source1', 'debug message');
      inspector.info('source1', 'info message');
      inspector.warn('source1', 'warn message');
      inspector.error('source1', 'error message');

      const log = inspector.getEventLog();
      expect(log).toHaveLength(5);
      expect(log.map((e) => e.level)).toEqual(['trace', 'debug', 'info', 'warn', 'error']);
    });

    it('should filter events by level', () => {
      inspector.info('src', 'info');
      inspector.error('src', 'error');

      expect(inspector.getEventLog({ level: 'error' })).toHaveLength(1);
    });

    it('should filter events by source', () => {
      inspector.info('source-a', 'msg1');
      inspector.info('source-b', 'msg2');

      expect(inspector.getEventLog({ source: 'source-a' })).toHaveLength(1);
    });

    it('should filter events by timestamp', () => {
      inspector.info('src', 'old');
      vi.advanceTimersByTime(5000);
      const cutoff = Date.now();
      vi.advanceTimersByTime(5000);
      inspector.info('src', 'new');

      expect(inspector.getEventLog({ since: cutoff })).toHaveLength(1);
    });

    it('should limit events returned', () => {
      for (let i = 0; i < 10; i++) {
        inspector.info('src', `msg ${i}`);
      }

      expect(inspector.getEventLog({ limit: 3 })).toHaveLength(3);
    });

    it('should support event listeners', () => {
      const events: string[] = [];
      const unsubscribe = inspector.addEventListener((e) => events.push(e.message));

      inspector.info('src', 'message1');
      inspector.info('src', 'message2');

      expect(events).toEqual(['message1', 'message2']);

      unsubscribe();
      inspector.info('src', 'message3');

      expect(events).toHaveLength(2);
    });

    it('should respect maxEvents limit', () => {
      const limitedInspector = new SwarmInspector({ maxEvents: 5 });

      for (let i = 0; i < 10; i++) {
        limitedInspector.info('src', `msg ${i}`);
      }

      const log = limitedInspector.getEventLog();
      expect(log).toHaveLength(5);
      expect(log[0].message).toBe('msg 5');
    });

    it('should clear event log', () => {
      inspector.info('src', 'message');
      inspector.clearEventLog();

      expect(inspector.getEventLog()).toHaveLength(0);
    });
  });

  describe('inspect', () => {
    it('should return full inspection result', () => {
      inspector.updateSwarm({
        id: 'swarm-1',
        memberCount: 3,
        state: 'active',
        createdAt: Date.now(),
        properties: {},
      });

      inspector.updateAgent({
        id: 'a1',
        swarmId: 'swarm-1',
        state: 'active',
        health: 1.0,
        load: 0.3,
        lastActive: Date.now(),
        properties: {},
      });

      inspector.registerHealthCheck({
        name: 'test',
        status: 'healthy',
        lastCheck: Date.now(),
      });

      const result = inspector.inspect();
      expect(result.swarms).toHaveLength(1);
      expect(result.agents).toHaveLength(1);
      expect(result.health).toHaveLength(1);
      expect(result.summary.totalSwarms).toBe(1);
      expect(result.summary.totalAgents).toBe(1);
    });

    it('should detect low health agents', () => {
      inspector.updateAgent({
        id: 'a1',
        state: 'active',
        health: 0.2,
        load: 0.5,
        lastActive: Date.now(),
        properties: {},
      });

      const result = inspector.inspect();
      expect(result.summary.healthyAgents).toBe(0);
      expect(result.summary.warnings).toContain('1 agents have low health');
    });

    it('should detect overloaded agents', () => {
      inspector.updateAgent({
        id: 'a1',
        state: 'active',
        health: 1.0,
        load: 0.95,
        lastActive: Date.now(),
        properties: {},
      });

      const result = inspector.inspect();
      expect(result.summary.warnings).toContain('1 agents are overloaded');
    });

    it('should detect stale agents', () => {
      inspector.updateAgent({
        id: 'a1',
        state: 'active',
        health: 1.0,
        load: 0.5,
        lastActive: Date.now() - 120000, // 2 min ago
        properties: {},
      });

      const result = inspector.inspect();
      expect(result.summary.warnings).toContain('1 agents are stale');
    });

    it('should calculate average load', () => {
      inspector.updateAgent({
        id: 'a1',
        state: 'active',
        health: 1.0,
        load: 0.4,
        lastActive: Date.now(),
        properties: {},
      });
      inspector.updateAgent({
        id: 'a2',
        state: 'active',
        health: 1.0,
        load: 0.6,
        lastActive: Date.now(),
        properties: {},
      });

      const result = inspector.inspect();
      expect(result.summary.averageLoad).toBe(0.5);
    });
  });

  describe('toGraph', () => {
    it('should generate graph with nodes and edges', () => {
      inspector.updateSwarm({
        id: 'swarm-1',
        memberCount: 2,
        state: 'active',
        createdAt: Date.now(),
        properties: {},
      });

      inspector.updateAgent({
        id: 'a1',
        swarmId: 'swarm-1',
        state: 'active',
        health: 1.0,
        load: 0.5,
        lastActive: Date.now(),
        properties: {},
      });

      inspector.addRelation({
        sourceId: 'a1',
        targetId: 'a2',
        type: 'neighbor',
        strength: 0.7,
      });

      const graph = inspector.toGraph();

      expect(graph.nodes.find((n) => n.id === 'swarm-1')).toBeDefined();
      expect(graph.nodes.find((n) => n.id === 'a1')).toBeDefined();

      // Edge for swarm membership
      expect(graph.edges.find((e) => e.source === 'a1' && e.target === 'swarm-1')).toBeDefined();
      // Edge for relation
      expect(graph.edges.find((e) => e.source === 'a1' && e.target === 'a2')).toBeDefined();
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      inspector.updateSwarm({
        id: 's1',
        memberCount: 1,
        state: 'active',
        createdAt: Date.now(),
        properties: {},
      });
      inspector.updateAgent({
        id: 'a1',
        state: 'active',
        health: 1.0,
        load: 0.5,
        lastActive: Date.now(),
        properties: {},
      });
      inspector.addRelation({ sourceId: 'a1', targetId: 'a2', type: 'neighbor', strength: 0.5 });
      inspector.registerHealthCheck({ name: 'test', status: 'healthy', lastCheck: Date.now() });
      inspector.info('src', 'message');

      inspector.reset();

      expect(inspector.getAllSwarms()).toHaveLength(0);
      expect(inspector.getAllAgents()).toHaveLength(0);
      expect(inspector.getAllRelations()).toHaveLength(0);
      expect(inspector.getAllHealthChecks()).toHaveLength(0);
      expect(inspector.getEventLog()).toHaveLength(0);
    });
  });
});
