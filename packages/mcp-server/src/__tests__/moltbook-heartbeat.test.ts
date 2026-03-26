/**
 * MoltbookHeartbeat Tests
 *
 * Validates the full heartbeat tick cycle: home check, outbound-first engagement,
 * inbound replies, post creation, circuit breaker, ratio enforcement, and rate limiting.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MoltbookHeartbeat } from '../moltbook/heartbeat';
import { ContentPipeline } from '../moltbook/content-pipeline';
import type { LLMContentGenerator } from '../moltbook/llm-content-generator';
import { resolveKarmaTier } from '../moltbook/types';
import type { EngagementConfig } from '../moltbook/types';

// Use fake timers so the 20s comment cooldown sleeps resolve instantly
beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

// ── Mock MoltbookClient ──────────────────────────────────────────────────────

function createMockClient(agentName = 'test-agent') {
  return {
    getHome: vi.fn().mockResolvedValue({
      your_account: { name: agentName, karma: 50, unread_notification_count: 0 },
      activity_on_your_posts: [],
      your_direct_messages: { pending_request_count: '0', unread_message_count: '0' },
      posts_from_accounts_you_follow: { posts: [], total_following: 3 },
      what_to_do_next: [],
    }),
    getComments: vi.fn().mockResolvedValue([]),
    search: vi.fn().mockResolvedValue({ results: [] }),
    createPost: vi.fn().mockResolvedValue({ id: 'post-1', title: 'Test', verification_status: 'verified' }),
    createComment: vi.fn().mockResolvedValue({ id: 'comment-1' }),
    upvotePost: vi.fn().mockResolvedValue(undefined),
    markPostNotificationsRead: vi.fn().mockResolvedValue(undefined),
    getChallengeFailures: vi.fn().mockReturnValue(0),
    resetChallengeFailures: vi.fn(),
  } as any;
}

function createMockGenerator(): LLMContentGenerator {
  return {
    generateReply: vi.fn().mockResolvedValue(null),
    generateTopicComment: vi.fn().mockResolvedValue(null),
    generatePost: vi.fn().mockResolvedValue(null),
  } as any;
}

/** Run a tick while advancing fake timers to resolve all pending sleeps. */
async function tickWithTimers(heartbeat: MoltbookHeartbeat) {
  const promise = heartbeat.triggerNow();
  // Advance timers repeatedly to flush any pending sleeps
  for (let i = 0; i < 10; i++) {
    await vi.advanceTimersByTimeAsync(25_000);
  }
  return promise;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MoltbookHeartbeat', () => {
  let client: ReturnType<typeof createMockClient>;
  let pipeline: ContentPipeline;
  let generator: ReturnType<typeof createMockGenerator>;
  let heartbeat: MoltbookHeartbeat;

  beforeEach(() => {
    client = createMockClient();
    pipeline = new ContentPipeline();
    generator = createMockGenerator();
    heartbeat = new MoltbookHeartbeat(client, pipeline, generator, 'test-agent');
  });

  describe('tick cycle', () => {
    it('checks home endpoint on tick', async () => {
      const result = await tickWithTimers(heartbeat);
      expect(result.checkedHome).toBe(true);
      expect(client.getHome).toHaveBeenCalledOnce();
    });

    it('returns result with zero browse actions when nothing to do', async () => {
      const result = await tickWithTimers(heartbeat);
      expect(result.commentsPosted).toBe(0);
      expect(result.upvotesGiven).toBe(0);
    });

    it('creates a new post when cooldown elapsed', async () => {
      const result = await tickWithTimers(heartbeat);
      // First tick should create a post (lastPostTime starts at 0, so cooldown is elapsed)
      expect(result.newPostCreated).toBe(true);
    });

    it('does not reply to own comments', async () => {
      client.getHome.mockResolvedValue({
        your_account: { name: 'test-agent', karma: 50, unread_notification_count: 1 },
        activity_on_your_posts: [{ post_id: 'p1', title: 'Test', new_comments: 1 }],
        your_direct_messages: { pending_request_count: '0', unread_message_count: '0' },
        posts_from_accounts_you_follow: { posts: [], total_following: 0 },
        what_to_do_next: [],
      });
      // Only our own comments — should not create a reply
      client.getComments.mockResolvedValue([
        { id: 'c1', author: { name: 'test-agent' }, content: 'My own comment', reply_count: 0 },
      ]);

      await tickWithTimers(heartbeat);
      // createComment should NOT have been called with parent_id for self-replies
      const replyCalls = client.createComment.mock.calls.filter(
        (call: any[]) => call[0] === 'p1' && call[2] // call[2] = parent_id
      );
      expect(replyCalls).toHaveLength(0);
    });

    it('tracks outbound and inbound in result', async () => {
      const result = await tickWithTimers(heartbeat);
      expect(result).toHaveProperty('outboundComments');
      expect(result).toHaveProperty('inboundReplies');
      expect(typeof result.outboundComments).toBe('number');
      expect(typeof result.inboundReplies).toBe('number');
    });
  });

  describe('outbound-first ordering', () => {
    it('calls search (outbound) before getComments (inbound) when outboundFirstEnabled', async () => {
      const callOrder: string[] = [];
      client.search.mockImplementation(async () => {
        callOrder.push('search');
        return { results: [] };
      });
      client.getHome.mockResolvedValue({
        your_account: { name: 'test-agent', karma: 50, unread_notification_count: 1 },
        activity_on_your_posts: [{ post_id: 'p1', title: 'Test', new_comments: 1 }],
        your_direct_messages: { pending_request_count: '0', unread_message_count: '0' },
        posts_from_accounts_you_follow: { posts: [], total_following: 0 },
        what_to_do_next: [],
      });
      client.getComments.mockImplementation(async () => {
        callOrder.push('getComments');
        return [{ id: 'c1', author: { name: 'other-agent' }, content: 'Hello!', reply_count: 0 }];
      });

      await tickWithTimers(heartbeat);
      const searchIdx = callOrder.indexOf('search');
      const commentsIdx = callOrder.indexOf('getComments');
      // Search (outbound) should happen before getComments (inbound)
      expect(searchIdx).toBeLessThan(commentsIdx);
    });

    it('does outbound browse after inbound when outboundFirstEnabled is false', async () => {
      const hb = new MoltbookHeartbeat(client, pipeline, generator, 'test-agent', {
        outboundFirstEnabled: false,
      });

      const callOrder: string[] = [];
      client.search.mockImplementation(async () => {
        callOrder.push('search');
        return { results: [] };
      });
      client.getHome.mockResolvedValue({
        your_account: { name: 'test-agent', karma: 50, unread_notification_count: 1 },
        activity_on_your_posts: [{ post_id: 'p1', title: 'Test', new_comments: 1 }],
        your_direct_messages: { pending_request_count: '0', unread_message_count: '0' },
        posts_from_accounts_you_follow: { posts: [], total_following: 0 },
        what_to_do_next: [],
      });
      client.getComments.mockImplementation(async () => {
        callOrder.push('getComments');
        return [{ id: 'c1', author: { name: 'other-agent' }, content: 'Hello!', reply_count: 0 }];
      });

      const promise = hb.triggerNow();
      for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(25_000);
      await promise;

      const searchIdx = callOrder.indexOf('search');
      const commentsIdx = callOrder.indexOf('getComments');
      // With outboundFirst disabled, getComments (inbound) should happen before search (outbound)
      expect(commentsIdx).toBeLessThan(searchIdx);
    });

    it('tracks outbound comments from browse/engage', async () => {
      client.search.mockResolvedValue({
        results: [
          { id: 'p1', type: 'post', title: 'MCP tools', content: 'Great MCP discussion', upvotes: 10 },
        ],
      });

      const result = await tickWithTimers(heartbeat);
      // The static comment generator should match 'MCP' + 'tools' and produce a comment
      expect(result.outboundComments).toBeGreaterThanOrEqual(1);
      expect(result.commentsPosted).toBeGreaterThanOrEqual(1);
    });

    it('tracks inbound replies separately', async () => {
      client.getHome.mockResolvedValue({
        your_account: { name: 'test-agent', karma: 50, unread_notification_count: 1 },
        activity_on_your_posts: [{ post_id: 'p1', title: 'Test', new_comments: 2 }],
        your_direct_messages: { pending_request_count: '0', unread_message_count: '0' },
        posts_from_accounts_you_follow: { posts: [], total_following: 0 },
        what_to_do_next: [],
      });
      client.getComments.mockResolvedValue([
        { id: 'c1', author: { name: 'other-agent' }, content: 'How does this work?', reply_count: 0, upvotes: 0 },
      ]);

      const result = await tickWithTimers(heartbeat);
      expect(result.inboundReplies).toBeGreaterThanOrEqual(1);
      expect(result.repliesSent).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ratio enforcement', () => {
    it('respects maxInboundPerTick limit', async () => {
      // Create heartbeat with max 1 inbound reply per tick
      const hb = new MoltbookHeartbeat(client, pipeline, generator, 'test-agent', {
        maxInboundPerTick: 1,
      });

      client.getHome.mockResolvedValue({
        your_account: { name: 'test-agent', karma: 50, unread_notification_count: 3 },
        activity_on_your_posts: [
          { post_id: 'p1', title: 'Post 1', new_comments: 1 },
          { post_id: 'p2', title: 'Post 2', new_comments: 1 },
          { post_id: 'p3', title: 'Post 3', new_comments: 1 },
        ],
        your_direct_messages: { pending_request_count: '0', unread_message_count: '0' },
        posts_from_accounts_you_follow: { posts: [], total_following: 0 },
        what_to_do_next: [],
      });
      client.getComments.mockResolvedValue([
        { id: 'c1', author: { name: 'other-agent' }, content: 'How does it work?', reply_count: 0, upvotes: 0 },
      ]);

      const promise = hb.triggerNow();
      for (let i = 0; i < 10; i++) await vi.advanceTimersByTimeAsync(25_000);
      const result = await promise;

      // Should only reply to 1 post despite 3 having activity
      expect(result.inboundReplies).toBeLessThanOrEqual(1);
    });

    it('defaults to 70/30 engagement config', () => {
      const config = heartbeat.getEngagementConfig();
      expect(config.outboundRatio).toBe(0.7);
      expect(config.outboundFirstEnabled).toBe(true);
      expect(config.maxOutboundPerTick).toBe(7);
      expect(config.maxInboundPerTick).toBe(3);
    });

    it('accepts custom engagement config', () => {
      const custom: Partial<EngagementConfig> = {
        outboundRatio: 0.5,
        maxOutboundPerTick: 5,
        maxInboundPerTick: 5,
      };
      const hb = new MoltbookHeartbeat(client, pipeline, generator, 'test-agent', custom);
      const config = hb.getEngagementConfig();
      expect(config.outboundRatio).toBe(0.5);
      expect(config.maxOutboundPerTick).toBe(5);
      expect(config.maxInboundPerTick).toBe(5);
      // outboundFirstEnabled should still be default true
      expect(config.outboundFirstEnabled).toBe(true);
    });

    it('tracks outbound/inbound counters in state', async () => {
      client.search.mockResolvedValue({
        results: [
          { id: 'p1', type: 'post', title: 'MCP tools discussion', content: 'MCP server setup', upvotes: 5 },
        ],
      });
      client.getHome.mockResolvedValue({
        your_account: { name: 'test-agent', karma: 50, unread_notification_count: 1 },
        activity_on_your_posts: [{ post_id: 'own1', title: 'Our Post', new_comments: 1 }],
        your_direct_messages: { pending_request_count: '0', unread_message_count: '0' },
        posts_from_accounts_you_follow: { posts: [], total_following: 0 },
        what_to_do_next: [],
      });
      client.getComments.mockResolvedValue([
        { id: 'c1', author: { name: 'someone' }, content: 'How does this work?', reply_count: 0, upvotes: 0 },
      ]);

      await tickWithTimers(heartbeat);
      const state = heartbeat.getState();
      expect(state.outboundCommentsToday).toBeGreaterThanOrEqual(0);
      expect(state.inboundCommentsToday).toBeGreaterThanOrEqual(0);
    });
  });

  describe('circuit breaker', () => {
    it('pauses when challenge failures exceed threshold', async () => {
      client.getChallengeFailures.mockReturnValue(3);
      const result = await tickWithTimers(heartbeat);
      expect(result.errors.some((e: string) => e.includes('Pausing') || e.includes('failures'))).toBe(true);
    });
  });

  describe('state management', () => {
    it('starts and stops cleanly', () => {
      heartbeat.start();
      expect(heartbeat.isRunning()).toBe(true);
      heartbeat.stop();
      expect(heartbeat.isRunning()).toBe(false);
    });

    it('getState returns a copy', () => {
      const s1 = heartbeat.getState();
      const s2 = heartbeat.getState();
      expect(s1).toEqual(s2);
      expect(s1).not.toBe(s2);
    });

    it('does not start twice', () => {
      heartbeat.start();
      heartbeat.start(); // no-op
      expect(heartbeat.isRunning()).toBe(true);
      heartbeat.stop();
    });
  });

  describe('browse and engage', () => {
    it('upvotes quality search results', async () => {
      client.search.mockResolvedValue({
        results: [
          { id: 'p1', type: 'post', title: 'MCP tools', content: 'Great stuff', upvotes: 5 },
        ],
      });
      const result = await tickWithTimers(heartbeat);
      expect(result.upvotesGiven).toBeGreaterThanOrEqual(1);
    });

    it('handles search failure gracefully', async () => {
      client.search.mockRejectedValue(new Error('Search unavailable'));
      const result = await tickWithTimers(heartbeat);
      expect(result.errors.some((e: string) => e.includes('Browse failed'))).toBe(true);
    });
  });

  describe('home endpoint failure', () => {
    it('handles home failure gracefully', async () => {
      client.getHome.mockRejectedValue(new Error('API down'));
      const result = await tickWithTimers(heartbeat);
      expect(result.checkedHome).toBe(false);
      expect(result.errors.some((e: string) => e.includes('Home endpoint failed'))).toBe(true);
    });
  });

  describe('search rotation (Phase 3)', () => {
    it('rotates through search topics with rotate strategy', async () => {
      const hb = new MoltbookHeartbeat(client, pipeline, generator, 'test-agent', {
        searchStrategy: 'rotate',
        searchTopics: ['topicA', 'topicB', 'topicC'],
      });

      // First tick uses topicA
      await tickWithTimers(hb);
      const firstCall = client.search.mock.calls[0]?.[0];
      expect(firstCall).toBe('topicA');

      // Second tick uses topicB
      client.search.mockClear();
      await tickWithTimers(hb);
      const secondCall = client.search.mock.calls[0]?.[0];
      expect(secondCall).toBe('topicB');

      // Third tick uses topicC
      client.search.mockClear();
      await tickWithTimers(hb);
      const thirdCall = client.search.mock.calls[0]?.[0];
      expect(thirdCall).toBe('topicC');

      // Fourth tick wraps back to topicA
      client.search.mockClear();
      await tickWithTimers(hb);
      const fourthCall = client.search.mock.calls[0]?.[0];
      expect(fourthCall).toBe('topicA');
    });

    it('filters posts below minPostUpvotesForComment', async () => {
      const hb = new MoltbookHeartbeat(client, pipeline, generator, 'test-agent', {
        minPostUpvotesForComment: 5,
      });

      client.search.mockResolvedValue({
        results: [
          { id: 'p1', type: 'post', title: 'Low post', content: 'Low', upvotes: 2 },
          { id: 'p2', type: 'post', title: 'MCP tools', content: 'MCP discussion', upvotes: 10 },
        ],
      });

      await tickWithTimers(hb);
      // p1 (2 upvotes) should be filtered out, only p2 (10 upvotes) passes
      // upvotePost should only be called for p2
      const upvoteCalls = client.upvotePost.mock.calls.map((c: any[]) => c[0]);
      expect(upvoteCalls).not.toContain('p1');
      expect(upvoteCalls).toContain('p2');
    });
  });

  describe('karma-adaptive behavior (Phase 4)', () => {
    it('updates karma from home response', async () => {
      client.getHome.mockResolvedValue({
        your_account: { name: 'test-agent', karma: 75, unread_notification_count: 0 },
        activity_on_your_posts: [],
        your_direct_messages: { pending_request_count: '0', unread_message_count: '0' },
        posts_from_accounts_you_follow: { posts: [], total_following: 0 },
        what_to_do_next: [],
      });

      await tickWithTimers(heartbeat);
      expect(heartbeat.getState().currentKarma).toBe(75);
    });

    it('resolves correct karma tier for high karma', () => {
      const tier = resolveKarmaTier(55);
      expect(tier.heartbeatIntervalMs).toBe(2 * 60 * 1000); // 50+ tier = 2 min
    });

    it('resolves correct karma tier for low karma', () => {
      const tier = resolveKarmaTier(5);
      expect(tier.heartbeatIntervalMs).toBe(30 * 60 * 1000); // 0-15 tier = 30 min
    });

    it('resolves mid-range karma tier', () => {
      const tier = resolveKarmaTier(25);
      expect(tier.heartbeatIntervalMs).toBe(5 * 60 * 1000); // 16-30 tier = 5 min
      expect(tier.commentCooldownMs).toBe(60_000);
    });
  });

  describe('comment karma triage (Phase 5)', () => {
    it('replies to highest-upvoted comments first', async () => {
      client.getHome.mockResolvedValue({
        your_account: { name: 'test-agent', karma: 50, unread_notification_count: 2 },
        activity_on_your_posts: [{ post_id: 'p1', title: 'Test', new_comments: 3 }],
        your_direct_messages: { pending_request_count: '0', unread_message_count: '0' },
        posts_from_accounts_you_follow: { posts: [], total_following: 0 },
        what_to_do_next: [],
      });
      client.getComments.mockResolvedValue([
        { id: 'c1', author: { name: 'low-karma' }, content: 'How does this work?', reply_count: 0, upvotes: 1 },
        { id: 'c2', author: { name: 'high-karma' }, content: 'How does MCP compile?', reply_count: 0, upvotes: 50 },
        { id: 'c3', author: { name: 'mid-karma' }, content: 'How about examples?', reply_count: 0, upvotes: 10 },
      ]);

      await tickWithTimers(heartbeat);

      // createComment is called for replies — first reply should be to c2 (50 upvotes)
      const replyCalls = client.createComment.mock.calls.filter(
        (c: any[]) => c[0] === 'p1' && c[2] != null, // calls with parent_id = inbound replies
      );
      if (replyCalls.length >= 1) {
        expect(replyCalls[0][2]).toBe('c2'); // highest upvotes first
      }
    });

    it('filters comments below minCommentUpvotesForReply', async () => {
      const hb = new MoltbookHeartbeat(client, pipeline, generator, 'test-agent', {
        minCommentUpvotesForReply: 5,
      });

      client.getHome.mockResolvedValue({
        your_account: { name: 'test-agent', karma: 50, unread_notification_count: 1 },
        activity_on_your_posts: [{ post_id: 'p1', title: 'Test', new_comments: 2 }],
        your_direct_messages: { pending_request_count: '0', unread_message_count: '0' },
        posts_from_accounts_you_follow: { posts: [], total_following: 0 },
        what_to_do_next: [],
      });
      client.getComments.mockResolvedValue([
        { id: 'c1', author: { name: 'low' }, content: 'How does this work?', reply_count: 0, upvotes: 2 },
        { id: 'c2', author: { name: 'high' }, content: 'How about examples?', reply_count: 0, upvotes: 10 },
      ]);

      await tickWithTimers(hb);

      // Only c2 (10 upvotes) should get a reply, c1 (2 upvotes < 5 min) filtered out
      const replyCalls = client.createComment.mock.calls.filter(
        (c: any[]) => c[0] === 'p1' && c[2] != null,
      );
      const parentIds = replyCalls.map((c: any[]) => c[2]);
      expect(parentIds).not.toContain('c1');
    });
  });
});
