/**
 * MoltbookAgentManager Tests
 *
 * Validates agent CRUD, heartbeat start/stop, stats sync,
 * persistence integration, and credit scoring.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock modules (function syntax for constructors — W.011) ─────────────────

vi.mock('../moltbook/agent-persistence', () => ({
  AgentPersistence: vi.fn().mockImplementation(function (this: any) {
    this.loadActiveAgents = vi.fn().mockResolvedValue([]);
    this.saveAgentState = vi.fn().mockResolvedValue(true);
    this.markStopped = vi.fn().mockResolvedValue(true);
    this.extractHeartbeatState = vi.fn().mockReturnValue(null);
  }),
}));

vi.mock('../moltbook/client', () => ({
  MoltbookClient: vi.fn().mockImplementation(function (this: any) {
    this.getChallengeFailures = vi.fn().mockReturnValue(0);
    this.resetChallengeFailures = vi.fn();
    this.getHome = vi.fn().mockResolvedValue({
      your_account: { name: 'test-agent', karma: 50, unread_notification_count: 0 },
      activity_on_your_posts: [],
      your_direct_messages: { pending_request_count: '0', unread_message_count: '0' },
      posts_from_accounts_you_follow: { posts: [], total_following: 0 },
      what_to_do_next: [],
    });
    this.getProfile = vi.fn().mockResolvedValue({ karma: 50 });
  }),
}));

vi.mock('../moltbook/heartbeat', () => ({
  MoltbookHeartbeat: vi.fn().mockImplementation(function (this: any) {
    let running = false;
    this.start = vi.fn().mockImplementation(() => {
      running = true;
    });
    this.stop = vi.fn().mockImplementation(() => {
      running = false;
    });
    this.isRunning = vi.fn().mockImplementation(() => running);
    this.getState = vi.fn().mockReturnValue({
      lastCheck: 0,
      lastPostTime: 0,
      commentsToday: 0,
      commentsDayStart: 0,
      lastCommentTime: 0,
      challengeFailures: 0,
      totalPosts: 0,
      totalComments: 0,
      totalUpvotes: 0,
      postHistory: [],
    });
    this.triggerNow = vi.fn().mockResolvedValue({
      checkedHome: true,
      repliesSent: 0,
      commentsPosted: 0,
      upvotesGiven: 0,
      newPostCreated: false,
      errors: [],
    });
  }),
}));

vi.mock('../moltbook/llm-content-generator', () => ({
  LLMContentGenerator: vi.fn().mockImplementation(function (this: any) {
    this.generatePost = vi.fn().mockResolvedValue(null);
    this.generateReply = vi.fn().mockResolvedValue(null);
    this.generateTopicComment = vi.fn().mockResolvedValue(null);
  }),
}));

vi.mock('../moltbook/credit-scorer', () => ({
  MoltbookCreditScorer: vi.fn().mockImplementation(function (this: any) {
    this.calculateCredits = vi.fn().mockResolvedValue({
      balanceCents: 100,
      earnedCents: 200,
      spentCents: 100,
      karmaMultiplier: 1.0,
      details: [],
    });
  }),
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { MoltbookAgentManager } from '../moltbook/agent-manager';
import type { AgentConfig } from '../moltbook/agent-manager';

// ── Helpers ──────────────────────────────────────────────────────────────────

function testConfig(name = 'test-agent'): AgentConfig {
  return {
    agentName: name,
    moltbookApiKey: 'test-key-123',
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MoltbookAgentManager', () => {
  let manager: MoltbookAgentManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new MoltbookAgentManager();
  });

  describe('createAgent', () => {
    it('creates an agent with default values', async () => {
      const record = await manager.createAgent('user-1', 'project-1', testConfig());
      expect(record.id).toBeDefined();
      expect(record.agentName).toBe('test-agent');
      expect(record.heartbeatEnabled).toBe(false);
      expect(record.totalPostsGenerated).toBe(0);
      expect(record.totalCommentsGenerated).toBe(0);
      expect(record.totalUpvotesGiven).toBe(0);
      expect(record.challengeFailures).toBe(0);
      expect(record.totalLlmSpentCents).toBe(0);
    });

    it('creates multiple agents', async () => {
      const r1 = await manager.createAgent('user-1', 'project-1', testConfig('agent-a'));
      const r2 = await manager.createAgent('user-1', 'project-1', testConfig('agent-b'));
      expect(r1.id).not.toBe(r2.id);
      expect(r1.agentName).toBe('agent-a');
      expect(r2.agentName).toBe('agent-b');
    });
  });

  describe('startAgent / stopAgent', () => {
    it('starts and stops heartbeat', async () => {
      const record = await manager.createAgent('user-1', 'project-1', testConfig());
      await manager.startAgent(record.id);
      const status = await manager.getAgentStatus(record.id);
      expect(status.heartbeatEnabled).toBe(true);
      expect(status.heartbeatRunning).toBe(true);

      await manager.stopAgent(record.id);
      const status2 = await manager.getAgentStatus(record.id);
      expect(status2.heartbeatEnabled).toBe(false);
      expect(status2.heartbeatRunning).toBe(false);
    });

    it('throws on unknown agent', async () => {
      await expect(manager.startAgent('nonexistent')).rejects.toThrow('not found');
    });

    it('is idempotent for start', async () => {
      const record = await manager.createAgent('user-1', 'project-1', testConfig());
      await manager.startAgent(record.id);
      await manager.startAgent(record.id); // should not throw
      const status = await manager.getAgentStatus(record.id);
      expect(status.heartbeatRunning).toBe(true);
      await manager.stopAgent(record.id);
    });
  });

  describe('listAgents', () => {
    it('lists agents by user', async () => {
      await manager.createAgent('user-1', 'project-1', testConfig('a'));
      await manager.createAgent('user-2', 'project-2', testConfig('b'));
      await manager.createAgent('user-1', 'project-3', testConfig('c'));

      const user1Agents = await manager.listAgents('user-1');
      expect(user1Agents).toHaveLength(2);
      expect(user1Agents.map((a) => a.agentName).sort()).toEqual(['a', 'c']);

      const user2Agents = await manager.listAgents('user-2');
      expect(user2Agents).toHaveLength(1);
    });

    it('returns empty for unknown user', async () => {
      const agents = await manager.listAgents('nobody');
      expect(agents).toHaveLength(0);
    });
  });

  describe('configureAgent', () => {
    it('updates agent config', async () => {
      const record = await manager.createAgent('user-1', 'project-1', testConfig());
      const updated = await manager.configureAgent(record.id, { persona: 'Friendly bot' });
      expect(updated.config.persona).toBe('Friendly bot');
      expect(updated.config.agentName).toBe('test-agent');
    });

    it('throws on unknown agent', async () => {
      await expect(manager.configureAgent('nonexistent', {})).rejects.toThrow('not found');
    });
  });

  describe('getAgentStatus', () => {
    it('returns structured status', async () => {
      const record = await manager.createAgent('user-1', 'project-1', testConfig());
      const status = await manager.getAgentStatus(record.id);
      expect(status.id).toBe(record.id);
      expect(status.agentName).toBe('test-agent');
      expect(status.stats.totalPosts).toBe(0);
      expect(status.creditBalanceCents).toBeDefined();
      expect(status.creditBreakdown).toBeDefined();
    });
  });

  describe('triggerAgent', () => {
    it('runs a single tick and syncs stats', async () => {
      const record = await manager.createAgent('user-1', 'project-1', testConfig());
      const { result } = await manager.triggerAgent(record.id);
      expect(result.checkedHome).toBe(true);
      expect(result.errors).toBeDefined();
    });

    it('throws on unknown agent', async () => {
      await expect(manager.triggerAgent('nonexistent')).rejects.toThrow('not found');
    });
  });

  describe('generatePost', () => {
    it('returns null when LLM generator has no provider', async () => {
      const record = await manager.createAgent('user-1', 'project-1', testConfig());
      const post = await manager.generatePost(record.id, 'research');
      // Mock LLM generator returns null — expected behavior with no LLM configured
      expect(post).toBeNull();
    });
  });

  describe('shutdown', () => {
    it('stops all agents and clears registry', async () => {
      const r1 = await manager.createAgent('user-1', 'p1', testConfig('a'));
      const r2 = await manager.createAgent('user-1', 'p2', testConfig('b'));
      await manager.startAgent(r1.id);
      await manager.startAgent(r2.id);

      await manager.shutdown();
      const agents = await manager.listAgents('user-1');
      expect(agents).toHaveLength(0);
    });
  });

  describe('syncHeartbeatStats', () => {
    it('syncs state from heartbeat into record', async () => {
      const record = await manager.createAgent('user-1', 'project-1', testConfig());
      await manager.triggerAgent(record.id);
      // After sync, lastHeartbeat should be set
      const status = await manager.getAgentStatus(record.id);
      expect(status.lastHeartbeat).not.toBeNull();
    });
  });

  describe('recoverAgents', () => {
    it('returns 0 when no agents to recover', async () => {
      const count = await manager.recoverAgents();
      expect(count).toBe(0);
    });
  });
});
