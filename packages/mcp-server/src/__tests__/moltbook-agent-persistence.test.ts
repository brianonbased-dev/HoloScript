/**
 * AgentPersistence Tests
 *
 * Validates REST-based persistence layer: loading active agents,
 * saving state, marking stopped, and extracting heartbeat state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentPersistence } from '../moltbook/agent-persistence';
import type { PersistedAgent } from '../moltbook/agent-persistence';
import { INITIAL_HEARTBEAT_STATE } from '../moltbook/types';

// ── Mock fetch ──────────────────────────────────────────────────────────────

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeAgent(overrides: Partial<PersistedAgent> = {}): PersistedAgent {
  return {
    id: 'agent-1',
    userId: 'user-1',
    projectId: 'project-1',
    agentName: 'test-agent',
    moltbookApiKey: 'key-***',
    config: {},
    heartbeatEnabled: true,
    lastHeartbeat: null,
    totalPostsGenerated: 5,
    totalCommentsGenerated: 10,
    totalUpvotesGiven: 20,
    challengeFailures: 0,
    totalLlmSpentCents: 100,
    createdAt: '2026-03-25T00:00:00.000Z',
    updatedAt: '2026-03-25T00:00:00.000Z',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('AgentPersistence', () => {
  let persistence: AgentPersistence;

  beforeEach(() => {
    persistence = new AgentPersistence({ absorbServiceUrl: 'http://localhost:3005' });
  });

  describe('loadActiveAgents', () => {
    it('returns agents with heartbeatEnabled=true', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          agents: [
            makeAgent({ id: 'a1', heartbeatEnabled: true }),
            makeAgent({ id: 'a2', heartbeatEnabled: false }),
            makeAgent({ id: 'a3', heartbeatEnabled: true }),
          ],
        }),
      });

      const agents = await persistence.loadActiveAgents();
      expect(agents).toHaveLength(2);
      expect(agents.map((a) => a.id)).toEqual(['a1', 'a3']);
    });

    it('returns empty array on fetch failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      const agents = await persistence.loadActiveAgents();
      expect(agents).toEqual([]);
    });

    it('returns empty array on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const agents = await persistence.loadActiveAgents();
      expect(agents).toEqual([]);
    });

    it('calls the correct URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ agents: [] }),
      });
      await persistence.loadActiveAgents();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3005/api/absorb/moltbook',
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
  });

  describe('saveAgentState', () => {
    it('sends PATCH with state and stats', async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const state = { ...INITIAL_HEARTBEAT_STATE, totalPosts: 5, postHistory: ['Title A'] };
      const ok = await persistence.saveAgentState('agent-1', state, {
        totalPostsGenerated: 5,
        totalCommentsGenerated: 10,
        totalUpvotesGiven: 20,
        challengeFailures: 0,
        totalLlmSpentCents: 100,
      });

      expect(ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3005/api/absorb/moltbook/agent-1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('returns false on failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 });
      const ok = await persistence.saveAgentState('agent-1', INITIAL_HEARTBEAT_STATE, {
        totalPostsGenerated: 0,
        totalCommentsGenerated: 0,
        totalUpvotesGiven: 0,
        challengeFailures: 0,
        totalLlmSpentCents: 0,
      });
      expect(ok).toBe(false);
    });
  });

  describe('markStopped', () => {
    it('sends PATCH with heartbeatEnabled=false', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const ok = await persistence.markStopped('agent-1', INITIAL_HEARTBEAT_STATE);
      expect(ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3005/api/absorb/moltbook/agent-1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"heartbeatEnabled":false'),
        }),
      );
    });

    it('returns false on network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const ok = await persistence.markStopped('agent-1', INITIAL_HEARTBEAT_STATE);
      expect(ok).toBe(false);
    });
  });

  describe('extractHeartbeatState', () => {
    it('extracts state from config JSONB', () => {
      const agent = makeAgent({
        config: { heartbeatState: { ...INITIAL_HEARTBEAT_STATE, totalPosts: 7 } },
      });
      const state = persistence.extractHeartbeatState(agent);
      expect(state).not.toBeNull();
      expect(state!.totalPosts).toBe(7);
    });

    it('returns null when no heartbeatState in config', () => {
      const agent = makeAgent({ config: {} });
      const state = persistence.extractHeartbeatState(agent);
      expect(state).toBeNull();
    });

    it('returns null for empty config', () => {
      const agent = makeAgent({ config: {} });
      const state = persistence.extractHeartbeatState(agent);
      expect(state).toBeNull();
    });
  });
});
