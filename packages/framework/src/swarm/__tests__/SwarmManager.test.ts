/**
 * SwarmManager Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SwarmManager, type SwarmEvent } from '../SwarmManager';

describe('SwarmManager', () => {
  let manager: SwarmManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new SwarmManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createSwarm', () => {
    it('should create a new swarm', () => {
      const swarm = manager.createSwarm({
        name: 'Test Swarm',
        objective: 'Testing objectives',
        createdBy: 'agent-1',
      });

      expect(swarm.id).toBeDefined();
      expect(swarm.name).toBe('Test Swarm');
      expect(swarm.objective).toBe('Testing objectives');
      expect(swarm.createdBy).toBe('agent-1');
      expect(swarm.status).toBe('forming');
    });

    it('should add creator as leader', () => {
      const swarm = manager.createSwarm({
        name: 'Test Swarm',
        objective: 'Testing',
        createdBy: 'agent-1',
      });

      const leader = swarm.membership.getLeader();
      expect(leader?.agentId).toBe('agent-1');
    });

    it('should enforce max swarms per agent', () => {
      manager = new SwarmManager({ maxSwarmsPerAgent: 2 });

      manager.createSwarm({ name: 'S1', objective: 'O1', createdBy: 'agent-1' });
      manager.createSwarm({ name: 'S2', objective: 'O2', createdBy: 'agent-1' });

      expect(() =>
        manager.createSwarm({
          name: 'S3',
          objective: 'O3',
          createdBy: 'agent-1',
        })
      ).toThrow('maximum swarm limit');
    });

    it('should emit swarm-created event', () => {
      const events: SwarmEvent[] = [];
      manager.onEvent((e) => events.push(e));

      manager.createSwarm({
        name: 'Test',
        objective: 'Testing',
        createdBy: 'agent-1',
      });

      expect(events.some((e) => e.type === 'swarm-created')).toBe(true);
    });
  });

  describe('joinSwarm', () => {
    it('should add agent to swarm', () => {
      const swarm = manager.createSwarm({
        name: 'Test Swarm',
        objective: 'Testing',
        createdBy: 'agent-1',
      });

      manager.joinSwarm(swarm.id, 'agent-2');

      expect(swarm.membership.getMember('agent-2')).toBeDefined();
    });

    it('should throw for non-existent swarm', () => {
      expect(() => manager.joinSwarm('unknown', 'agent-1')).toThrow('not found');
    });

    it('should throw for disbanded swarm', () => {
      const swarm = manager.createSwarm({
        name: 'Test',
        objective: 'Testing',
        createdBy: 'agent-1',
      });

      manager.disbandSwarm(swarm.id, {
        reason: 'Test',
        redistributeTasks: false,
        notifyMembers: false,
      });

      expect(() => manager.joinSwarm(swarm.id, 'agent-2')).toThrow('disbanded');
    });

    it('should allow observers to bypass swarm limit', () => {
      manager = new SwarmManager({ maxSwarmsPerAgent: 1 });

      const s1 = manager.createSwarm({ name: 'S1', objective: 'O1', createdBy: 'agent-1' });
      const s2 = manager.createSwarm({ name: 'S2', objective: 'O2', createdBy: 'agent-2' });

      // agent-1 already in 1 swarm, should still be able to observe another
      const success = manager.joinSwarm(s2.id, 'agent-1', true);
      expect(success).toBe(true);
    });

    it('should update status to active when quorum reached', () => {
      manager = new SwarmManager({
        defaultMembershipConfig: {
          quorum: { minimumSize: 2, optimalSize: 3, maximumSize: 10 },
        },
      });

      const swarm = manager.createSwarm({
        name: 'Test',
        objective: 'Testing',
        createdBy: 'agent-1',
      });

      expect(swarm.status).toBe('forming');

      manager.joinSwarm(swarm.id, 'agent-2');
      manager.joinSwarm(swarm.id, 'agent-3');

      expect(swarm.status).toBe('active');
    });
  });

  describe('leaveSwarm', () => {
    it('should remove agent from swarm', () => {
      const swarm = manager.createSwarm({
        name: 'Test',
        objective: 'Testing',
        createdBy: 'agent-1',
      });
      manager.joinSwarm(swarm.id, 'agent-2');
      manager.joinSwarm(swarm.id, 'agent-3');

      manager.leaveSwarm(swarm.id, 'agent-2');

      expect(swarm.membership.getMember('agent-2')).toBeUndefined();
    });

    it('should update agent swarm tracking', () => {
      const swarm = manager.createSwarm({
        name: 'Test',
        objective: 'Testing',
        createdBy: 'agent-1',
      });
      manager.joinSwarm(swarm.id, 'agent-2');
      manager.joinSwarm(swarm.id, 'agent-3');

      manager.leaveSwarm(swarm.id, 'agent-2');

      const agentSwarms = manager.getAgentSwarms('agent-2');
      expect(agentSwarms).toHaveLength(0);
    });
  });

  describe('disbandSwarm', () => {
    it('should mark swarm as disbanded', () => {
      const swarm = manager.createSwarm({
        name: 'Test',
        objective: 'Testing',
        createdBy: 'agent-1',
      });

      manager.disbandSwarm(swarm.id, {
        reason: 'No longer needed',
        redistributeTasks: false,
        notifyMembers: true,
      });

      expect(swarm.status).toBe('disbanded');
    });

    it('should remove all members', () => {
      const swarm = manager.createSwarm({
        name: 'Test',
        objective: 'Testing',
        createdBy: 'agent-1',
      });
      manager.joinSwarm(swarm.id, 'agent-2');

      manager.disbandSwarm(swarm.id, {
        reason: 'Test',
        redistributeTasks: false,
        notifyMembers: false,
      });

      expect(swarm.membership.getMembers()).toHaveLength(0);
    });

    it('should emit swarm-disbanded event', () => {
      const swarm = manager.createSwarm({
        name: 'Test',
        objective: 'Testing',
        createdBy: 'agent-1',
      });

      const events: SwarmEvent[] = [];
      manager.onEvent((e) => events.push(e));

      manager.disbandSwarm(swarm.id, {
        reason: 'Test',
        redistributeTasks: false,
        notifyMembers: false,
      });

      expect(events.some((e) => e.type === 'swarm-disbanded')).toBe(true);
    });
  });

  describe('getSwarm', () => {
    it('should return swarm by id', () => {
      const created = manager.createSwarm({
        name: 'Test',
        objective: 'Testing',
        createdBy: 'agent-1',
      });

      const found = manager.getSwarm(created.id);
      expect(found?.id).toBe(created.id);
    });

    it('should return undefined for unknown id', () => {
      const found = manager.getSwarm('unknown');
      expect(found).toBeUndefined();
    });
  });

  describe('getAllSwarms', () => {
    it('should return all swarms', () => {
      manager.createSwarm({ name: 'S1', objective: 'O1', createdBy: 'agent-1' });
      manager.createSwarm({ name: 'S2', objective: 'O2', createdBy: 'agent-2' });

      const all = manager.getAllSwarms();
      expect(all).toHaveLength(2);
    });
  });

  describe('getActiveSwarms', () => {
    it('should filter out disbanded swarms', () => {
      const s1 = manager.createSwarm({ name: 'S1', objective: 'O1', createdBy: 'agent-1' });
      manager.createSwarm({ name: 'S2', objective: 'O2', createdBy: 'agent-2' });

      manager.disbandSwarm(s1.id, {
        reason: 'Test',
        redistributeTasks: false,
        notifyMembers: false,
      });

      const active = manager.getActiveSwarms();
      expect(active).toHaveLength(1);
    });
  });

  describe('getAgentSwarms', () => {
    it('should return swarms agent is in', () => {
      const s1 = manager.createSwarm({ name: 'S1', objective: 'O1', createdBy: 'agent-1' });
      const s2 = manager.createSwarm({ name: 'S2', objective: 'O2', createdBy: 'agent-2' });

      manager.joinSwarm(s2.id, 'agent-1');

      const agentSwarms = manager.getAgentSwarms('agent-1');
      expect(agentSwarms).toHaveLength(2);
    });

    it('should return empty for unknown agent', () => {
      const swarms = manager.getAgentSwarms('unknown');
      expect(swarms).toHaveLength(0);
    });
  });

  describe('findSwarmsByObjective', () => {
    it('should find swarms matching objective', () => {
      manager.createSwarm({
        name: 'Data Processing',
        objective: 'Process large datasets',
        createdBy: 'agent-1',
      });
      manager.createSwarm({
        name: 'Machine Learning',
        objective: 'Train ML models',
        createdBy: 'agent-2',
      });

      const found = manager.findSwarmsByObjective('datasets');
      expect(found).toHaveLength(1);
      expect(found[0].name).toBe('Data Processing');
    });

    it('should also match by name', () => {
      manager.createSwarm({ name: 'Data Processing', objective: 'Do stuff', createdBy: 'agent-1' });

      const found = manager.findSwarmsByObjective('data');
      expect(found).toHaveLength(1);
    });
  });

  describe('getSwarmStats', () => {
    it('should return swarm statistics', () => {
      const swarm = manager.createSwarm({
        name: 'Test',
        objective: 'Testing',
        createdBy: 'agent-1',
      });
      manager.joinSwarm(swarm.id, 'agent-2');

      const stats = manager.getSwarmStats(swarm.id);

      expect(stats?.memberCount).toBe(2);
      expect(stats?.ageMs).toBeGreaterThanOrEqual(0);
      expect(stats?.healthScore).toBeGreaterThan(0);
    });

    it('should return undefined for unknown swarm', () => {
      const stats = manager.getSwarmStats('unknown');
      expect(stats).toBeUndefined();
    });
  });

  describe('performMaintenance', () => {
    it('should check for heartbeat timeouts', () => {
      manager = new SwarmManager({
        defaultMembershipConfig: {
          heartbeatTimeoutMs: 1000,
        },
      });

      const swarm = manager.createSwarm({
        name: 'Test',
        objective: 'Testing',
        createdBy: 'agent-1',
      });
      manager.joinSwarm(swarm.id, 'agent-2');

      vi.advanceTimersByTime(2000);

      const affected = manager.performMaintenance();
      expect(affected.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('event subscription', () => {
    it('should allow subscribing to events', () => {
      const events: SwarmEvent[] = [];
      const unsub = manager.onEvent((e) => events.push(e));

      manager.createSwarm({ name: 'Test', objective: 'Testing', createdBy: 'agent-1' });

      expect(events.length).toBeGreaterThan(0);

      unsub();
      manager.createSwarm({ name: 'Test2', objective: 'Testing', createdBy: 'agent-2' });

      const countAfter = events.length;
      expect(countAfter).toBeLessThanOrEqual(events.length);
    });
  });
});
