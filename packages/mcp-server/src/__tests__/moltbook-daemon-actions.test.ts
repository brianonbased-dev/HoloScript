/**
 * Moltbook Daemon Action Handler Tests
 *
 * Validates each BT action handler in isolation using mocked client + LLM.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMoltbookDaemonActions } from '../moltbook/agent/moltbook-daemon-actions';
import type { MoltbookDaemonConfig } from '../moltbook/agent/moltbook-daemon-actions';

// ── Mock Client ──────────────────────────────────────────────────────────────

function createMockClient() {
  return {
    getHome: vi.fn().mockResolvedValue({
      your_account: { name: 'holoscript', karma: 73, unread_notification_count: 5 },
      activity_on_your_posts: [
        { post_id: 'post-1', title: 'Test Post', new_comments: 3 },
      ],
      your_direct_messages: { pending_request_count: '0', unread_message_count: '0' },
      posts_from_accounts_you_follow: { posts: [], total_following: 10 },
      what_to_do_next: [],
    }),
    getProfile: vi.fn().mockResolvedValue({
      agent: { name: 'holoscript', followerCount: 8, followingCount: 42 },
    }),
    getPost: vi.fn().mockResolvedValue({
      id: 'post-1',
      title: 'Test Post',
      content: 'This is a test post about agent safety.',
      author: { name: 'other-agent' },
    }),
    getComments: vi.fn().mockResolvedValue([
      {
        id: 'comment-1',
        post_id: 'post-1',
        content: 'Great post about safety constraints!',
        author: { name: 'commenter-1', karma: 500 },
        upvotes: 5,
        reply_count: 0,
        depth: 0,
      },
      {
        id: 'comment-2',
        post_id: 'post-1',
        content: 'I agree with the analysis.',
        author: { name: 'holoscript', karma: 73 },
        upvotes: 2,
        reply_count: 0,
        depth: 0,
      },
    ]),
    search: vi.fn().mockResolvedValue({
      results: [
        { id: 'search-1', type: 'post', title: 'Agent Safety', content: 'Post about safety', upvotes: 10, author: { name: 'agent-x' } },
        { id: 'search-2', type: 'post', title: 'MCP Tools', content: 'Post about tools', upvotes: 5, author: { name: 'agent-y' } },
      ],
    }),
    getFeed: vi.fn().mockResolvedValue({
      posts: [
        { id: 'feed-1', title: 'Hot Post', content: 'Trending content', upvotes: 20, comment_count: 5, author: { name: 'trending-agent' } },
      ],
      has_more: false,
    }),
    createPost: vi.fn().mockResolvedValue({ id: 'new-post-1', title: 'New Post' }),
    createComment: vi.fn().mockResolvedValue({ id: 'new-comment-1' }),
    upvotePost: vi.fn().mockResolvedValue(undefined),
    getNotifications: vi.fn().mockResolvedValue([
      { type: 'new_follower', from_agent: { name: 'new-follower-1' } },
    ]),
    followAgent: vi.fn().mockResolvedValue(undefined),
    markPostNotificationsRead: vi.fn().mockResolvedValue(undefined),
    markNotificationsRead: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function createMockLLM() {
  return {
    generateReply: vi.fn().mockResolvedValue('This is a thoughtful reply about safety constraints.'),
    generateTopicComment: vi.fn().mockResolvedValue('Interesting point about the tradeoffs here.'),
    generatePost: vi.fn().mockResolvedValue({
      submolt: 'general',
      title: 'What We Learned About Constraint Visibility',
      body: 'A detailed post about constraint visibility and its implications for agent safety...',
      pillar: 'research',
      tags: ['research', 'safety'],
    }),
  } as any;
}

function createMockGraphRAG() {
  return {
    queryWithLLM: vi.fn().mockResolvedValue({
      answer: 'The codebase shows that constraint visibility is implemented in TraitTypes.ts with 22 categories.',
      citations: [{ name: 'TraitTypes', file: 'core/src/traits/TraitTypes.ts', line: 42 }],
    }),
  };
}

const DEFAULT_CONFIG: MoltbookDaemonConfig = {
  agentName: 'holoscript',
  stateFile: '/tmp/test-moltbook-state.json',
  verbose: false,
  maxRepliesPerPost: 2,
  conceptClusters: [],
};

function createContext() {
  return {
    emit: vi.fn(),
    hostCapabilities: {
      fileSystem: {
        readFile: vi.fn().mockRejectedValue(new Error('File not found')),
        writeFile: vi.fn().mockResolvedValue(undefined),
        exists: vi.fn().mockResolvedValue(false),
        listDir: vi.fn().mockResolvedValue([]),
      },
    } as any,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createMoltbookDaemonActions', () => {
  let client: ReturnType<typeof createMockClient>;
  let llm: ReturnType<typeof createMockLLM>;
  let graphRAG: ReturnType<typeof createMockGraphRAG>;

  beforeEach(() => {
    client = createMockClient();
    llm = createMockLLM();
    graphRAG = createMockGraphRAG();
  });

  it('returns all 18 action handlers', () => {
    const { actions } = createMoltbookDaemonActions(client, llm, graphRAG, DEFAULT_CONFIG);
    const names = Object.keys(actions);
    expect(names).toContain('mb_gather_context');
    expect(names).toContain('mb_load_state');
    expect(names).toContain('mb_read_thread_context');
    expect(names).toContain('mb_generate_reply');
    expect(names).toContain('mb_post_reply');
    expect(names).toContain('mb_mark_read');
    expect(names).toContain('mb_browse_feed');
    expect(names).toContain('mb_search_topics');
    expect(names).toContain('mb_evaluate_posts');
    expect(names).toContain('mb_read_post_deeply');
    expect(names).toContain('mb_generate_comment');
    expect(names).toContain('mb_post_comment');
    expect(names).toContain('mb_gather_rag_context');
    expect(names).toContain('mb_generate_post');
    expect(names).toContain('mb_check_dedup');
    expect(names).toContain('mb_verify_grounding');
    expect(names).toContain('mb_publish_post');
    expect(names).toContain('mb_process_follow_backs');
    expect(names.length).toBeGreaterThanOrEqual(18);
  });

  it('returns wireTraitListeners function', () => {
    const { wireTraitListeners } = createMoltbookDaemonActions(client, llm, graphRAG, DEFAULT_CONFIG);
    expect(typeof wireTraitListeners).toBe('function');
  });
});

describe('mb_gather_context', () => {
  it('fetches home and sets blackboard conditions', async () => {
    const client = createMockClient();
    const { actions } = createMoltbookDaemonActions(client, createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {};
    const ctx = createContext();

    const result = await actions.mb_gather_context({}, bb, ctx);

    expect(result).toBe(true);
    expect(bb.karma).toBe(73);
    expect(bb.has_unanswered_comments).toBe(true);
    expect(client.getHome).toHaveBeenCalledOnce();
    expect(ctx.emit).toHaveBeenCalledWith('moltbook:context_gathered', expect.any(Object));
  });

  it('returns false on API failure', async () => {
    const client = createMockClient();
    client.getHome.mockRejectedValue(new Error('API down'));
    const { actions } = createMoltbookDaemonActions(client, createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {};
    const ctx = createContext();

    const result = await actions.mb_gather_context({}, bb, ctx);
    expect(result).toBe(false);
  });
});

describe('mb_load_state', () => {
  it('sets BT conditions from defaults when no state file', async () => {
    const { actions } = createMoltbookDaemonActions(createMockClient(), createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {};
    const ctx = createContext();

    const result = await actions.mb_load_state({}, bb, ctx);

    expect(result).toBe(true);
    expect(bb.can_comment_today).toBe(true);
    expect(bb.comments_today).toBe(0);
    expect(typeof bb.use_feed_this_tick).toBe('boolean');
  });
});

describe('mb_read_thread_context', () => {
  it('fetches comments and finds unanswered ones', async () => {
    const client = createMockClient();
    const { actions } = createMoltbookDaemonActions(client, createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {
      activity_posts: [{ post_id: 'post-1', title: 'Test Post', new_comments: 3 }],
    };
    const ctx = createContext();

    const result = await actions.mb_read_thread_context({}, bb, ctx);

    expect(result).toBe(true);
    expect(bb.current_post_id).toBe('post-1');
    expect(bb.current_comment).toBeDefined();
    // Should filter out our own comments (holoscript)
    expect((bb.current_comment as any).author.name).toBe('commenter-1');
    expect(client.getComments).toHaveBeenCalledWith('post-1', 'old', 50);
  });

  it('returns false when no activity posts', async () => {
    const { actions } = createMoltbookDaemonActions(createMockClient(), createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = { activity_posts: [] };
    const ctx = createContext();

    const result = await actions.mb_read_thread_context({}, bb, ctx);
    expect(result).toBe(false);
  });
});

describe('mb_generate_reply', () => {
  it('generates reply and sets draft_content', async () => {
    const llm = createMockLLM();
    const { actions } = createMoltbookDaemonActions(createMockClient(), llm, null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {
      current_comment: { content: 'Great work!', author: { name: 'test' } },
      thread_context: 'Full thread here',
      current_post_title: 'Test Post',
    };
    const ctx = createContext();

    const result = await actions.mb_generate_reply({}, bb, ctx);

    expect(result).toBe(true);
    expect(bb.draft_content).toBe('This is a thoughtful reply about safety constraints.');
    expect(llm.generateReply).toHaveBeenCalled();
  });

  it('returns false when LLM returns null', async () => {
    const llm = createMockLLM();
    llm.generateReply.mockResolvedValue(null);
    const { actions } = createMoltbookDaemonActions(createMockClient(), llm, null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {
      current_comment: { content: 'Test', author: { name: 'test' } },
      thread_context: '',
      current_post_title: 'Test',
    };

    const result = await actions.mb_generate_reply({}, bb, createContext());
    expect(result).toBe(false);
  });
});

describe('mb_post_reply', () => {
  it('posts reply via client', async () => {
    const client = createMockClient();
    const { actions } = createMoltbookDaemonActions(client, createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {
      current_post_id: 'post-1',
      current_post_title: 'Test',
      current_comment: { id: 'comment-1', author: { name: 'test' } },
      draft_content: 'My reply',
    };
    const ctx = createContext();

    const result = await actions.mb_post_reply({}, bb, ctx);

    expect(result).toBe(true);
    expect(client.createComment).toHaveBeenCalledWith('post-1', 'My reply', 'comment-1');
    expect(ctx.emit).toHaveBeenCalledWith('moltbook:reply_posted', expect.any(Object));
  });
});

describe('mb_browse_feed', () => {
  it('fetches feed and sets discovered_posts', async () => {
    const client = createMockClient();
    const { actions } = createMoltbookDaemonActions(client, createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {
      feed_strategies: ['hot', 'new', 'rising'],
      feed_strategy_index: 0,
    };

    const result = await actions.mb_browse_feed({}, bb, createContext());

    expect(result).toBe(true);
    expect(Array.isArray(bb.discovered_posts)).toBe(true);
    expect(client.getFeed).toHaveBeenCalledWith('hot', 10);
    expect(bb.feed_strategy_index).toBe(1);
  });
});

describe('mb_search_topics', () => {
  it('searches and sets discovered_posts', async () => {
    const client = createMockClient();
    const { actions } = createMoltbookDaemonActions(client, createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {
      search_topics: ['MCP protocol', 'agent safety'],
      search_topic_index: 0,
    };

    const result = await actions.mb_search_topics({}, bb, createContext());

    expect(result).toBe(true);
    expect(Array.isArray(bb.discovered_posts)).toBe(true);
    expect(client.search).toHaveBeenCalledWith('MCP protocol', 'posts', 5);
    expect(bb.search_topic_index).toBe(1);
  });
});

describe('mb_evaluate_posts', () => {
  it('filters already-commented posts and selects top 3', async () => {
    const { actions } = createMoltbookDaemonActions(createMockClient(), createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {
      discovered_posts: [
        { id: 'p1', title: 'A', content: 'a', upvotes: 5 },
        { id: 'p2', title: 'B', content: 'b', upvotes: 20 },
        { id: 'p3', title: 'C', content: 'c', upvotes: 10 },
        { id: 'p4', title: 'D', content: 'd', upvotes: 1 },
      ],
    };

    const result = await actions.mb_evaluate_posts({}, bb, createContext());

    expect(result).toBe(true);
    const evaluated = bb.evaluated_posts as Array<{ id: string; upvotes: number }>;
    expect(evaluated.length).toBe(3);
    // Should be sorted by upvotes descending
    expect(evaluated[0].upvotes).toBe(20);
    expect(evaluated[1].upvotes).toBe(10);
  });

  it('returns false when no posts', async () => {
    const { actions } = createMoltbookDaemonActions(createMockClient(), createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = { discovered_posts: [] };

    const result = await actions.mb_evaluate_posts({}, bb, createContext());
    expect(result).toBe(false);
  });
});

describe('mb_generate_comment', () => {
  it('generates comment via LLM', async () => {
    const llm = createMockLLM();
    const { actions } = createMoltbookDaemonActions(createMockClient(), llm, null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {
      current_post_title: 'Agent Safety',
      current_post_content: 'Post about safety...',
      evaluated_posts: [{ id: 'p1' }],
    };

    const result = await actions.mb_generate_comment({}, bb, createContext());

    expect(result).toBe(true);
    expect(bb.draft_content).toBe('Interesting point about the tradeoffs here.');
  });

  it('returns false when LLM returns SKIP', async () => {
    const llm = createMockLLM();
    llm.generateTopicComment.mockResolvedValue(null);
    const { actions } = createMoltbookDaemonActions(createMockClient(), llm, null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {
      current_post_title: 'Boring Post',
      evaluated_posts: [{ id: 'p1' }],
    };

    const result = await actions.mb_generate_comment({}, bb, createContext());
    expect(result).toBe(false);
  });
});

describe('mb_check_dedup', () => {
  it('passes when no duplicates', async () => {
    const { actions } = createMoltbookDaemonActions(createMockClient(), createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {
      draft_post: { title: 'Brand New Topic', pillar: 'research' },
      post_history: ['Old Post', 'Another Post'],
      topic_budget: { research: 0 },
    };

    const result = await actions.mb_check_dedup({}, bb, createContext());
    expect(result).toBe(true);
  });

  it('blocks exact title duplicates', async () => {
    const { actions } = createMoltbookDaemonActions(createMockClient(), createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {
      draft_post: { title: 'Same Title', pillar: 'research' },
      post_history: ['Same Title', 'Other Post'],
      topic_budget: { research: 0 },
    };

    const result = await actions.mb_check_dedup({}, bb, createContext());
    expect(result).toBe(false);
  });

  it('blocks topic budget exhaustion', async () => {
    const { actions } = createMoltbookDaemonActions(createMockClient(), createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {
      draft_post: { title: 'New Title', pillar: 'research' },
      post_history: [],
      topic_budget: { research: 2 },
    };

    const result = await actions.mb_check_dedup({}, bb, createContext());
    expect(result).toBe(false);
  });

  it('blocks concept cluster matches', async () => {
    const { actions } = createMoltbookDaemonActions(createMockClient(), createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {
      draft_post: { title: 'Agent Safety Constraints in Practice', pillar: 'research' },
      post_history: ['Safety Constraint Attack Surfaces'],
      topic_budget: { research: 0 },
    };

    const result = await actions.mb_check_dedup({}, bb, createContext());
    expect(result).toBe(false);
  });
});

describe('mb_gather_rag_context', () => {
  it('returns false when no GraphRAG available', async () => {
    const { actions } = createMoltbookDaemonActions(createMockClient(), createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {};

    const result = await actions.mb_gather_rag_context({}, bb, createContext());
    expect(result).toBe(false);
  });

  it('queries GraphRAG and sets context', async () => {
    const graphRAG = createMockGraphRAG();
    const { actions } = createMoltbookDaemonActions(createMockClient(), createMockLLM(), graphRAG, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {};

    const result = await actions.mb_gather_rag_context({}, bb, createContext());

    expect(result).toBe(true);
    expect(typeof bb.rag_context).toBe('string');
    expect(Array.isArray(bb.rag_citations)).toBe(true);
    expect(graphRAG.queryWithLLM).toHaveBeenCalled();
  });
});

describe('mb_verify_grounding', () => {
  it('passes with no fabrication', async () => {
    const { actions } = createMoltbookDaemonActions(createMockClient(), createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {
      draft_post: {
        title: 'Test',
        body: 'A clean post with no fabricated numbers or technologies.',
      },
      rag_context: '',
      rag_citations: [],
    };

    const result = await actions.mb_verify_grounding({}, bb, createContext());
    expect(result).toBe(true);
  });

  it('blocks posts with too many ungrounded claims', async () => {
    const { actions } = createMoltbookDaemonActions(createMockClient(), createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {
      draft_post: {
        title: 'Test',
        body: 'We used Redis and PostgreSQL and MongoDB and Kafka three years ago with 47 invariants.',
      },
      rag_context: '',
      rag_citations: [],
    };

    const result = await actions.mb_verify_grounding({}, bb, createContext());
    expect(result).toBe(false);
  });
});

describe('mb_process_follow_backs', () => {
  it('follows back new followers', async () => {
    const client = createMockClient();
    const { actions } = createMoltbookDaemonActions(client, createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = {};

    const result = await actions.mb_process_follow_backs({}, bb, createContext());

    expect(result).toBe(true);
    expect(client.followAgent).toHaveBeenCalledWith('new-follower-1');
  });
});

describe('mb_update_karma_tier', () => {
  it('sets tier based on karma', async () => {
    const { actions } = createMoltbookDaemonActions(createMockClient(), createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = { karma: 73 };

    const result = await actions.mb_update_karma_tier({}, bb, createContext());

    expect(result).toBe(true);
    expect(bb.karma_tier).toBe('tier1');
    expect(bb.heartbeat_interval_ms).toBe(2 * 60 * 1000);
  });

  it('uses tier4 for low karma', async () => {
    const { actions } = createMoltbookDaemonActions(createMockClient(), createMockLLM(), null, DEFAULT_CONFIG);
    const bb: Record<string, unknown> = { karma: 5 };

    const result = await actions.mb_update_karma_tier({}, bb, createContext());

    expect(result).toBe(true);
    expect(bb.karma_tier).toBe('tier4');
  });
});

describe('mb_save_state', () => {
  it('saves state to filesystem', async () => {
    const { actions } = createMoltbookDaemonActions(createMockClient(), createMockLLM(), null, DEFAULT_CONFIG);
    const ctx = createContext();
    ctx.hostCapabilities.fileSystem.writeFile.mockResolvedValue(undefined);
    const bb: Record<string, unknown> = {
      day_start: Date.now(),
      comments_today: 5,
      outbound_today: 3,
      inbound_today: 2,
      posts_today: 1,
      last_post_time: Date.now(),
      post_history: ['Post A'],
      topic_budget: { research: 1 },
      karma: 73,
    };

    const result = await actions.mb_save_state({}, bb, ctx);

    expect(result).toBe(true);
    expect(ctx.hostCapabilities.fileSystem.writeFile).toHaveBeenCalled();
    expect(ctx.emit).toHaveBeenCalledWith('moltbook:cycle_complete', expect.any(Object));
  });
});

describe('wireTraitListeners', () => {
  it('wires economy events and initializes balance', () => {
    const { wireTraitListeners } = createMoltbookDaemonActions(
      createMockClient(), createMockLLM(), null, DEFAULT_CONFIG,
    );
    const runtime = {
      on: vi.fn(),
      emit: vi.fn(),
    };

    wireTraitListeners(runtime);

    expect(runtime.on).toHaveBeenCalledWith('economy:spend_limit_exceeded', expect.any(Function));
    expect(runtime.on).toHaveBeenCalledWith('economy:insufficient_funds', expect.any(Function));
    expect(runtime.emit).toHaveBeenCalledWith('economy:earn', {
      agentId: 'moltbook-daemon',
      amount: 5,
      reason: 'initial_balance',
    });
  });
});
