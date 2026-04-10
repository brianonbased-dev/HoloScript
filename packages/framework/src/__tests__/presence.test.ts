import { describe, it, expect, vi } from 'vitest';
import { defineAgent } from '../define-agent';
import { defineTeam } from '../define-team';
import type { AgentConfig } from '../types';

// Mock protocol-agent so runCycle doesn't hit real LLMs
vi.mock('../protocol-agent', () => ({
  runProtocolCycle: vi.fn().mockResolvedValue({
    summary: 'Done',
    insights: [],
  }),
}));

function makeAgent(name: string, role: AgentConfig['role'] = 'coder'): AgentConfig {
  return defineAgent({
    name,
    role,
    model: { provider: 'anthropic', model: 'claude-sonnet-4' },
    capabilities: ['code-generation'],
    claimFilter: { roles: ['coder'], maxPriority: 10 },
  });
}

describe('Local Presence Tracking (FW-0.3)', () => {
  describe('localHeartbeat()', () => {
    it('registers an agent on first heartbeat', () => {
      const team = defineTeam({ name: 'presence-test', agents: [makeAgent('Alice')] });
      team.localHeartbeat('Alice');
      const agents = team.localPresence();
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('Alice');
      expect(agents[0].status).toBe('online');
    });

    it('updates lastSeen on subsequent heartbeats', () => {
      const team = defineTeam({ name: 'presence-test', agents: [makeAgent('Alice')] });
      team.localHeartbeat('Alice');
      const first = team.localPresence()[0].lastSeen;

      // Advance time slightly
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);
      team.localHeartbeat('Alice');
      const second = team.localPresence()[0].lastSeen;
      expect(second).toBeGreaterThanOrEqual(first);
      vi.useRealTimers();
    });

    it('tracks currentTask when provided', () => {
      const team = defineTeam({ name: 'presence-test', agents: [makeAgent('Alice')] });
      team.localHeartbeat('Alice', 'Fix auth bug');
      const agents = team.localPresence();
      expect(agents[0].currentTask).toBe('Fix auth bug');
    });

    it('clears currentTask when heartbeat has no task', () => {
      const team = defineTeam({ name: 'presence-test', agents: [makeAgent('Alice')] });
      team.localHeartbeat('Alice', 'Fix auth bug');
      team.localHeartbeat('Alice');
      const agents = team.localPresence();
      expect(agents[0].currentTask).toBeUndefined();
    });

    it('tracks multiple agents independently', () => {
      const team = defineTeam({
        name: 'presence-test',
        agents: [makeAgent('Alice'), makeAgent('Bob', 'reviewer')],
      });
      team.localHeartbeat('Alice', 'Task A');
      team.localHeartbeat('Bob', 'Task B');
      const agents = team.localPresence();
      expect(agents).toHaveLength(2);
      const names = agents.map((a) => a.name).sort();
      expect(names).toEqual(['Alice', 'Bob']);
    });
  });

  describe('localPresence() status transitions', () => {
    it('marks agent as idle after idleTimeout', () => {
      vi.useFakeTimers();
      const team = defineTeam({
        name: 'idle-test',
        agents: [makeAgent('Alice')],
        presence: { idleTimeoutMs: 1000, offlineTimeoutMs: 5000 },
      });

      team.localHeartbeat('Alice');
      expect(team.localPresence()[0].status).toBe('online');

      vi.advanceTimersByTime(1500); // past idle threshold
      expect(team.localPresence()[0].status).toBe('idle');

      vi.useRealTimers();
    });

    it('marks agent as offline after offlineTimeout', () => {
      vi.useFakeTimers();
      const team = defineTeam({
        name: 'offline-test',
        agents: [makeAgent('Alice')],
        presence: { idleTimeoutMs: 1000, offlineTimeoutMs: 5000 },
      });

      team.localHeartbeat('Alice');
      vi.advanceTimersByTime(6000); // past offline threshold
      expect(team.localPresence()[0].status).toBe('offline');

      vi.useRealTimers();
    });

    it('returns to online after a fresh heartbeat', () => {
      vi.useFakeTimers();
      const team = defineTeam({
        name: 'recover-test',
        agents: [makeAgent('Alice')],
        presence: { idleTimeoutMs: 1000, offlineTimeoutMs: 5000 },
      });

      team.localHeartbeat('Alice');
      vi.advanceTimersByTime(6000);
      expect(team.localPresence()[0].status).toBe('offline');

      // Agent comes back
      team.localHeartbeat('Alice');
      expect(team.localPresence()[0].status).toBe('online');

      vi.useRealTimers();
    });

    it('uses default timeouts (60s idle, 300s offline) when not configured', () => {
      vi.useFakeTimers();
      const team = defineTeam({
        name: 'default-timeout-test',
        agents: [makeAgent('Alice')],
      });

      team.localHeartbeat('Alice');
      expect(team.localPresence()[0].status).toBe('online');

      vi.advanceTimersByTime(61_000); // past default 60s idle
      expect(team.localPresence()[0].status).toBe('idle');

      vi.advanceTimersByTime(240_000); // total ~301s, past default 300s offline
      expect(team.localPresence()[0].status).toBe('offline');

      vi.useRealTimers();
    });
  });

  describe('uptime tracking', () => {
    it('computes uptime from first heartbeat', () => {
      vi.useFakeTimers();
      const team = defineTeam({
        name: 'uptime-test',
        agents: [makeAgent('Alice')],
        presence: { idleTimeoutMs: 60_000, offlineTimeoutMs: 300_000 },
      });

      team.localHeartbeat('Alice');
      vi.advanceTimersByTime(10_000);
      team.localHeartbeat('Alice'); // refresh lastSeen but firstSeen stays

      const agents = team.localPresence();
      expect(agents[0].uptime).toBeGreaterThanOrEqual(10_000);

      vi.useRealTimers();
    });
  });

  describe('auto-heartbeat during runCycle', () => {
    it('automatically heartbeats agents that claim tasks during a cycle', async () => {
      const team = defineTeam({
        name: 'auto-hb-test',
        agents: [makeAgent('Alice')],
      });

      await team.addTasks([
        { title: 'Fix bug', description: 'Important', priority: 1, role: 'coder' },
      ]);

      // Before cycle — no presence data
      expect(team.localPresence()).toHaveLength(0);

      await team.runCycle();

      // After cycle — agent should have been auto-heartbeated
      const agents = team.localPresence();
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('Alice');
      expect(agents[0].status).toBe('online');
      expect(agents[0].currentTask).toBe('Fix bug');
    });

    it('does not heartbeat agents that skip (no matching task)', async () => {
      const team = defineTeam({
        name: 'skip-hb-test',
        agents: [makeAgent('Alice')],
      });

      // No tasks on board, but more than threshold so no synthesis
      await team.addTasks([
        { title: 'Task 1', description: '', priority: 1, role: 'reviewer' as const },
        { title: 'Task 2', description: '', priority: 2, role: 'reviewer' as const },
        { title: 'Task 3', description: '', priority: 3, role: 'reviewer' as const },
      ]);

      await team.runCycle();

      // Alice is a coder, all tasks are reviewer-only — she should have skipped
      expect(team.localPresence()).toHaveLength(0);
    });
  });

  describe('empty presence', () => {
    it('returns empty array when no heartbeats recorded', () => {
      const team = defineTeam({
        name: 'empty-test',
        agents: [makeAgent('Alice')],
      });
      expect(team.localPresence()).toEqual([]);
    });
  });
});
