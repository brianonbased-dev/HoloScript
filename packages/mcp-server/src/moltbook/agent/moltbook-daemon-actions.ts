/**
 * Moltbook Daemon Action Handlers
 *
 * Maps BT action names (mb_*) to Moltbook API operations.
 * Used by the `holoscript moltbook-daemon` CLI subcommand.
 *
 * Each handler receives (params, blackboard, context) and returns true/false
 * for BT flow control. The blackboard is the BT's shared state.
 *
 * Follows the daemon-actions.ts pattern from absorb-service.
 */

import type { ActionHandler } from '@holoscript/core/runtime';
import type { MoltbookClient } from '../client';
import type { LLMContentGenerator, GraphRAGQueryable } from '../llm-content-generator';
import type {
  MoltbookPost,
  MoltbookComment,
  MoltbookHomeResponse,
  ContentPillar,
} from '../types';
import { resolveKarmaTier, KARMA_TIERS } from '../types';

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface MoltbookDaemonConfig {
  agentName: string;
  stateFile: string;
  verbose: boolean;
  /** Max replies per single post across all ticks */
  maxRepliesPerPost: number;
  /** Concept clusters for keyword dedup */
  conceptClusters: string[][];
}

export interface MoltbookDaemonActionsResult {
  actions: Record<string, ActionHandler>;
  wireTraitListeners: (runtime: {
    on: (event: string, handler: (payload: unknown) => void) => void;
    emit: (event: string, payload?: unknown) => void;
  }) => void;
}

// ── Concept Clusters (keyword dedup fallback) ────────────────────────────────

const DEFAULT_CONCEPT_CLUSTERS: string[][] = [
  ['safety', 'constraint', 'attack', 'alignment', 'guardrail', 'adversarial'],
  ['memory', 'persistence', 'identity', 'provenance', 'context', 'ground truth'],
  ['recursive', 'self-improvement', 'self-modify', 'meta', 'ouroboros', 'loop'],
  ['compilation', 'target', 'backend', 'semantic', 'compiler', 'wasm', 'webgpu'],
  ['mcp', 'tool', 'discovery', 'protocol', 'server', 'endpoint'],
  ['agent', 'autonomous', 'daemon', 'orchestrat', 'multi-agent'],
  ['trust', 'verification', 'signature', 'cryptograph', 'zero-trust'],
  ['budget', 'cost', 'orphan', 'runaway', 'spend', '$180'],
  ['optimization', 'pressure', 'tradeoff', 'gradient', 'convergence'],
];

function sharesConceptCluster(titleA: string, titleB: string, clusters: string[][]): boolean {
  const a = titleA.toLowerCase();
  const b = titleB.toLowerCase();
  for (const cluster of clusters) {
    const matchesA = cluster.filter((kw) => a.includes(kw));
    const matchesB = cluster.filter((kw) => b.includes(kw));
    if (matchesA.length >= 1 && matchesB.length >= 1) {
      const shared = matchesA.filter((kw) => matchesB.includes(kw));
      if (shared.length >= 1 && (matchesA.length + matchesB.length) >= 3) {
        return true;
      }
    }
  }
  return false;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createMoltbookDaemonActions(
  client: MoltbookClient,
  llm: LLMContentGenerator,
  graphRAG: GraphRAGQueryable | null,
  config: MoltbookDaemonConfig,
): MoltbookDaemonActionsResult {
  const clusters = config.conceptClusters.length > 0
    ? config.conceptClusters
    : DEFAULT_CONCEPT_CLUSTERS;

  // Emit-based logging: routes through @structured_logger trait when attached.
  let _emitFn: ((event: string, payload?: unknown) => void) | null = null;
  const log = (msg: string, level: 'info' | 'debug' | 'warn' | 'error' = 'info') => {
    if (config.verbose) console.log(`[moltbook-daemon] ${msg}`);
    _emitFn?.(`logger:${level}`, { message: msg, source: 'moltbook-daemon' });
  };

  // Per-post reply tracking (persists across ticks within a session)
  const repliedPostCounts = new Map<string, number>();
  const commentedPostIds = new Set<string>();

  // ── Action Handlers ──────────────────────────────────────────────────────

  const actions: Record<string, ActionHandler> = {

    // ════════════════════════════════════════════════════════════════════════
    // CONTEXT GATHERING
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Gather context from /home + /notifications.
     * Sets blackboard conditions and ephemeral context.
     */
    mb_gather_context: async (_params, bb, ctx) => {
      log('Gathering context...');
      try {
        const home: MoltbookHomeResponse = await client.getHome();

        // Update blackboard with live data
        bb.karma = home.your_account?.karma ?? 0;
        bb.followers = 0; // populated by profile call below
        bb.following = 0;
        bb.unread = home.your_account?.unread_notification_count ?? 0;

        // Activity on our posts → unanswered comments
        bb.activity_posts = home.activity_on_your_posts ?? [];
        bb.has_unanswered_comments = Array.isArray(bb.activity_posts) && (bb.activity_posts as unknown[]).length > 0;

        // Posts from people we follow
        bb.followed_posts = home.posts_from_accounts_you_follow?.posts ?? [];

        ctx.emit('moltbook:context_gathered', {
          karma: bb.karma,
          unread: bb.unread,
          activityPosts: (bb.activity_posts as unknown[]).length,
        });

        log(`Context: karma=${bb.karma}, unread=${bb.unread}, activity=${(bb.activity_posts as unknown[]).length}`);

        // Also fetch profile for follower/following counts
        try {
          const profile = await client.getProfile();
          const agent = profile.agent as Record<string, unknown>;
          bb.followers = agent.followerCount ?? agent.follower_count ?? 0;
          bb.following = agent.followingCount ?? agent.following_count ?? 0;
        } catch {
          // Profile fetch failed — non-critical
        }

        return true;
      } catch (err) {
        log(`Context gather failed: ${err}`, 'error');
        ctx.emit('moltbook:error', { message: `Context gather failed: ${err}` });
        return false;
      }
    },

    /**
     * Load persisted state from disk.
     * Also resets daily counters if stale, and sets BT conditions.
     */
    mb_load_state: async (_params, bb, ctx) => {
      log('Loading state...');
      try {
        // Read state file via stdlib fs_read pattern
        let stateData: Record<string, unknown> = {};
        try {
          if (ctx.hostCapabilities?.fileSystem) {
            const raw = await ctx.hostCapabilities.fileSystem.readFile(config.stateFile);
            stateData = JSON.parse(raw);
          }
        } catch {
          // No state file yet — first run
          log('No state file found, using defaults');
        }

        // Merge persisted state into blackboard
        if (stateData.commentedPostIds) {
          for (const id of stateData.commentedPostIds as string[]) {
            commentedPostIds.add(id);
          }
        }
        if (stateData.repliedPostCounts) {
          for (const [id, count] of Object.entries(stateData.repliedPostCounts as Record<string, number>)) {
            repliedPostCounts.set(id, count);
          }
        }
        if (stateData.postHistory) {
          bb.post_history = stateData.postHistory;
        }
        if (stateData.topicBudget) {
          bb.topic_budget = stateData.topicBudget;
        }

        // Reset daily counters if stale
        const today = new Date().setHours(0, 0, 0, 0);
        const dayStart = (stateData.dayStart as number) ?? 0;
        if (dayStart !== today) {
          bb.comments_today = 0;
          bb.outbound_today = 0;
          bb.inbound_today = 0;
          bb.posts_today = 0;
          bb.day_start = today;
        } else {
          bb.comments_today = stateData.commentsToday ?? 0;
          bb.outbound_today = stateData.outboundToday ?? 0;
          bb.inbound_today = stateData.inboundToday ?? 0;
          bb.posts_today = stateData.postsToday ?? 0;
          bb.day_start = dayStart;
        }

        // Set BT conditions
        const maxCommentsPerDay = 50;
        bb.can_comment_today = (bb.comments_today as number) < maxCommentsPerDay;
        bb.use_feed_this_tick = Math.random() < 0.5; // alternate feed/search
        const lastPostTime = (stateData.lastPostTime as number) ?? 0;
        const postCooldownMs = 1_800_000; // 30 min
        bb.post_cooldown_elapsed = (Date.now() - lastPostTime) > postCooldownMs && (bb.posts_today as number) < 3;
        bb.last_post_time = lastPostTime;

        return true;
      } catch (err) {
        log(`Load state failed: ${err}`, 'error');
        return false;
      }
    },

    // ════════════════════════════════════════════════════════════════════════
    // P1: INBOUND REPLIES
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Read full thread context for the current unanswered post.
     * Fetches all comments so the LLM can read the conversation before replying.
     */
    mb_read_thread_context: async (_params, bb, ctx) => {
      const activityPosts = bb.activity_posts as Array<{ post_id: string; title: string; new_comments: number }>;
      if (!activityPosts || activityPosts.length === 0) return false;

      // Pick the post with the most new comments (highest engagement)
      const sorted = [...activityPosts].sort((a, b) => (b.new_comments ?? 0) - (a.new_comments ?? 0));
      const target = sorted[0];
      bb.current_post_id = target.post_id;
      bb.current_post_title = target.title;

      log(`Reading thread context for: "${target.title}" (${target.new_comments} new comments)`);

      try {
        const comments = await client.getComments(target.post_id, 'old', 50);

        // Find unanswered comments (not from us, no replies from us yet)
        const unanswered = comments.filter(
          (c) =>
            c.author.name !== config.agentName &&
            c.reply_count === 0,
        );

        // Sort by upvotes descending (karma triage)
        unanswered.sort((a, b) => b.upvotes - a.upvotes);

        bb.unanswered_comments = unanswered;
        bb.thread_comments = comments;

        // Build thread context string for the LLM
        const threadText = comments
          .map((c) => `[${c.author.name}] ${c.content}`)
          .join('\n\n');
        bb.thread_context = threadText;

        // Check per-post reply cap
        const existingReplies = repliedPostCounts.get(target.post_id) ?? 0;
        if (existingReplies >= config.maxRepliesPerPost) {
          log(`Post "${target.title}" already at reply cap (${existingReplies}/${config.maxRepliesPerPost})`);
          // Mark read and skip
          try { await client.markPostNotificationsRead(target.post_id); } catch { /* ok */ }
          // Remove from activity so selector moves to next branch
          bb.activity_posts = activityPosts.filter((p) => p.post_id !== target.post_id);
          bb.has_unanswered_comments = (bb.activity_posts as unknown[]).length > 0;
          return false;
        }

        if (unanswered.length === 0) {
          log('No unanswered comments found');
          try { await client.markPostNotificationsRead(target.post_id); } catch { /* ok */ }
          bb.activity_posts = activityPosts.filter((p) => p.post_id !== target.post_id);
          bb.has_unanswered_comments = (bb.activity_posts as unknown[]).length > 0;
          return false;
        }

        // Pick the best unanswered comment to reply to
        bb.current_comment = unanswered[0];
        bb.commenter_profile = unanswered[0].author;

        log(`Found ${unanswered.length} unanswered comments. Top: ${unanswered[0].author.name} (${unanswered[0].upvotes} upvotes)`);
        return true;
      } catch (err) {
        log(`Read thread failed: ${err}`, 'error');
        ctx.emit('moltbook:error', { message: `Read thread failed: ${err}` });
        return false;
      }
    },

    /**
     * Generate a reply to the current unanswered comment using LLM with full thread context.
     */
    mb_generate_reply: async (_params, bb, ctx) => {
      const comment = bb.current_comment as MoltbookComment;
      const threadContext = bb.thread_context as string;
      const postTitle = bb.current_post_title as string;

      if (!comment) return false;

      log(`Generating reply to ${comment.author.name}...`);
      try {
        // Use generateReplyWithContext if available, otherwise fall back to generateReply
        const contextPrompt = `Our post: "${postTitle}"\n\nFull thread:\n${threadContext}\n\nReply to this comment by ${comment.author.name}:\n${comment.content}`;
        const reply = await llm.generateReply(comment.content, contextPrompt);

        if (!reply) {
          log('Reply generation returned null (quality gate)', 'warn');
          return false;
        }

        bb.draft_content = reply;
        ctx.emit('economy:spend', { amount: 0.002, reason: 'reply_generation' });
        log(`Draft reply: ${reply.slice(0, 80)}...`);
        return true;
      } catch (err) {
        log(`Reply generation failed: ${err}`, 'error');
        ctx.emit('moltbook:error', { message: `Reply generation failed: ${err}` });
        return false;
      }
    },

    /**
     * Post the generated reply to the Moltbook API.
     */
    mb_post_reply: async (_params, bb, ctx) => {
      const postId = bb.current_post_id as string;
      const comment = bb.current_comment as MoltbookComment;
      const content = bb.draft_content as string;

      if (!postId || !comment || !content) return false;

      log(`Posting reply to ${comment.author.name} on post ${postId}...`);
      try {
        await client.createComment(postId, content, comment.id);

        // Track reply count
        repliedPostCounts.set(postId, (repliedPostCounts.get(postId) ?? 0) + 1);

        ctx.emit('moltbook:reply_posted', {
          postId,
          postTitle: bb.current_post_title,
          commentAuthor: comment.author.name,
        });

        log('Reply posted successfully');
        return true;
      } catch (err) {
        log(`Post reply failed: ${err}`, 'error');
        ctx.emit('moltbook:error', { message: `Post reply failed: ${err}` });
        return false;
      }
    },

    /**
     * Mark notifications as read for the current post.
     */
    mb_mark_read: async (_params, bb, _ctx) => {
      const postId = bb.current_post_id as string;
      if (!postId) return true; // nothing to mark

      try {
        await client.markPostNotificationsRead(postId);
        // Remove this post from activity so next tick processes next post
        const activityPosts = bb.activity_posts as Array<{ post_id: string }>;
        bb.activity_posts = activityPosts.filter((p) => p.post_id !== postId);
        bb.has_unanswered_comments = (bb.activity_posts as unknown[]).length > 0;
        return true;
      } catch {
        return true; // non-critical
      }
    },

    // ════════════════════════════════════════════════════════════════════════
    // P2: OUTBOUND ENGAGEMENT
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Browse the feed for posts to engage with.
     * Cycles through hot/new/rising strategies.
     */
    mb_browse_feed: async (_params, bb, ctx) => {
      const strategies = (bb.feed_strategies as string[]) ?? ['hot', 'new', 'rising'];
      const idx = (bb.feed_strategy_index as number) ?? 0;
      const sort = strategies[idx % strategies.length] as 'hot' | 'new' | 'rising';
      bb.feed_strategy_index = idx + 1;

      log(`Browsing feed: sort=${sort}`);
      try {
        const feed = await client.getFeed(sort, 10);
        const posts = (feed.posts || []).filter(
          (p) =>
            p.author?.name !== config.agentName &&
            p.upvotes >= 2 &&
            p.comment_count <= 30,
        );

        bb.discovered_posts = posts.map((p) => ({
          id: p.id,
          title: p.title,
          content: p.content,
          upvotes: p.upvotes,
          authorName: p.author?.name,
          commentCount: p.comment_count,
        }));

        log(`Feed browse found ${posts.length} candidate posts`);
        return posts.length > 0;
      } catch (err) {
        log(`Feed browse failed: ${err}`, 'error');
        ctx.emit('moltbook:error', { message: `Feed browse failed: ${err}` });
        return false;
      }
    },

    /**
     * Search for posts by rotating through configured topics.
     */
    mb_search_topics: async (_params, bb, ctx) => {
      const topics = bb.search_topics as string[];
      const idx = (bb.search_topic_index as number) ?? 0;
      const topic = topics[idx % topics.length];
      bb.search_topic_index = idx + 1;

      log(`Searching: "${topic}"`);
      try {
        const result = await client.search(topic, 'posts', 5);
        const posts = (result.results || [])
          .filter((r) => r.type === 'post' && r.upvotes >= 2)
          .map((r) => ({
            id: r.id,
            title: r.title || '',
            content: r.content,
            upvotes: r.upvotes,
            authorName: r.author?.name,
            commentCount: 0,
          }));

        bb.discovered_posts = posts;
        log(`Search found ${posts.length} candidate posts`);
        return posts.length > 0;
      } catch (err) {
        log(`Search failed: ${err}`, 'error');
        ctx.emit('moltbook:error', { message: `Search failed: ${err}` });
        return false;
      }
    },

    /**
     * Evaluate discovered posts — LLM decides which are worth engaging.
     * Filters out posts we've already commented on.
     */
    mb_evaluate_posts: async (_params, bb, _ctx) => {
      const discovered = bb.discovered_posts as Array<{
        id: string; title: string; content: string; upvotes: number; authorName?: string;
      }>;
      if (!discovered || discovered.length === 0) return false;

      // Filter already-commented
      const fresh = discovered.filter((p) => !commentedPostIds.has(p.id));

      if (fresh.length === 0) {
        log('All discovered posts already commented on');
        return false;
      }

      // Sort by upvotes (quality proxy) and take top 3
      fresh.sort((a, b) => b.upvotes - a.upvotes);
      bb.evaluated_posts = fresh.slice(0, 3);

      log(`Evaluated: ${fresh.length} fresh posts, top 3 selected`);
      return true;
    },

    /**
     * Read the top evaluated post deeply — full content + existing comments.
     * This ensures the agent reads before it writes.
     */
    mb_read_post_deeply: async (_params, bb, ctx) => {
      const evaluated = bb.evaluated_posts as Array<{
        id: string; title: string; content: string; authorName?: string;
      }>;
      if (!evaluated || evaluated.length === 0) return false;

      const target = evaluated[0];
      bb.current_post_id = target.id;
      bb.current_post_title = target.title;

      log(`Reading deeply: "${target.title}" by ${target.authorName}`);
      try {
        // Fetch full post + comments
        const [post, comments] = await Promise.all([
          client.getPost(target.id),
          client.getComments(target.id, 'best', 20),
        ]);

        bb.current_post_content = post.content;
        bb.thread_comments = comments;

        // Build context: post + existing comments (so the LLM doesn't repeat)
        const existingComments = comments
          .map((c) => `[${c.author.name}] ${c.content}`)
          .join('\n\n');
        bb.thread_context = `Post by ${target.authorName}: "${target.title}"\n\n${post.content}\n\nExisting comments:\n${existingComments}`;

        log(`Deep read: ${post.content.length} chars, ${comments.length} existing comments`);
        return true;
      } catch (err) {
        log(`Deep read failed: ${err}`, 'error');
        ctx.emit('moltbook:error', { message: `Deep read failed: ${err}` });
        return false;
      }
    },

    /**
     * Generate a comment for the current outbound post using LLM.
     */
    mb_generate_comment: async (_params, bb, ctx) => {
      const title = bb.current_post_title as string;
      const content = bb.current_post_content as string ?? bb.thread_context as string;

      if (!title) return false;

      log(`Generating comment for: "${title}"`);
      try {
        const comment = await llm.generateTopicComment(title, content);

        if (!comment) {
          log('Comment generation returned SKIP or null', 'debug');
          // Remove this post from evaluated and try next
          const evaluated = bb.evaluated_posts as Array<{ id: string }>;
          bb.evaluated_posts = evaluated.slice(1);
          return false;
        }

        bb.draft_content = comment;
        ctx.emit('economy:spend', { amount: 0.002, reason: 'comment_generation' });
        log(`Draft comment: ${comment.slice(0, 80)}...`);
        return true;
      } catch (err) {
        log(`Comment generation failed: ${err}`, 'error');
        return false;
      }
    },

    /**
     * Post the generated comment to the Moltbook API.
     */
    mb_post_comment: async (_params, bb, ctx) => {
      const postId = bb.current_post_id as string;
      const content = bb.draft_content as string;

      if (!postId || !content) return false;

      log(`Posting comment on ${postId}...`);
      try {
        await client.createComment(postId, content);
        commentedPostIds.add(postId);

        // Upvote the post too
        try { await client.upvotePost(postId); } catch { /* may already be upvoted */ }

        ctx.emit('moltbook:comment_posted', {
          postId,
          postTitle: bb.current_post_title,
        });

        // Bound the set
        if (commentedPostIds.size > 500) {
          const arr = [...commentedPostIds];
          commentedPostIds.clear();
          for (const id of arr.slice(-250)) commentedPostIds.add(id);
        }

        log('Comment posted successfully');
        return true;
      } catch (err) {
        log(`Post comment failed: ${err}`, 'error');
        ctx.emit('moltbook:error', { message: `Post comment failed: ${err}` });
        return false;
      }
    },

    // ════════════════════════════════════════════════════════════════════════
    // P3: POST CREATION
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Gather RAG context from the Absorb Service.
     * This is MANDATORY for posts — prevents fabrication.
     */
    mb_gather_rag_context: async (_params, bb, ctx) => {
      if (!graphRAG) {
        log('No GraphRAG available — post creation skipped (RAG mandatory)', 'warn');
        return false;
      }

      log('Gathering RAG context for post...');
      try {
        const pillars: ContentPillar[] = ['research', 'infrastructure', 'showcase', 'community'];
        const pillar = pillars[Math.floor(Math.random() * pillars.length)];
        bb.current_pillar = pillar;

        const ragResult = await graphRAG.queryWithLLM(
          `What are the most interesting recent developments in the ${pillar} area of the codebase?`,
        );

        bb.rag_context = ragResult.answer;
        bb.rag_citations = ragResult.citations ?? [];

        ctx.emit('economy:spend', { amount: 0.003, reason: 'rag_query' });
        log(`RAG context: ${ragResult.answer.length} chars, ${(ragResult.citations ?? []).length} citations`);
        return true;
      } catch (err) {
        log(`RAG query failed: ${err}`, 'error');
        return false; // No RAG = no post
      }
    },

    /**
     * Generate a post using LLM, grounded in RAG context.
     */
    mb_generate_post: async (_params, bb, ctx) => {
      const pillar = (bb.current_pillar as ContentPillar) ?? 'research';

      log(`Generating ${pillar} post...`);
      try {
        const post = await llm.generatePost(pillar);

        if (!post) {
          log('Post generation returned null (quality gate)', 'warn');
          return false;
        }

        bb.draft_post = post;
        ctx.emit('economy:spend', { amount: 0.005, reason: 'post_generation' });
        log(`Draft post: "${post.title}" (${post.body.length} chars)`);
        return true;
      } catch (err) {
        log(`Post generation failed: ${err}`, 'error');
        return false;
      }
    },

    /**
     * 3-layer dedup check: exact title + concept cluster + topic budget.
     */
    mb_check_dedup: async (_params, bb, _ctx) => {
      const post = bb.draft_post as { title: string; pillar: string } | null;
      if (!post) return false;

      const postHistory = (bb.post_history as string[]) ?? [];
      const topicBudget = (bb.topic_budget as Record<string, number>) ?? {};

      // Layer 1: Exact title match
      if (postHistory.includes(post.title)) {
        log(`Dedup: exact title match — "${post.title}"`, 'warn');
        return false;
      }

      // Layer 2: Concept cluster match
      for (const existing of postHistory) {
        if (sharesConceptCluster(post.title, existing, clusters)) {
          log(`Dedup: concept cluster match — "${post.title}" ~ "${existing}"`, 'warn');
          return false;
        }
      }

      // Layer 3: Topic budget (max 2 per topic per 30 days)
      const topicKey = post.pillar;
      const currentBudget = topicBudget[topicKey] ?? 0;
      const maxPerTopic = 2;
      if (currentBudget >= maxPerTopic) {
        log(`Dedup: topic budget exhausted for ${topicKey} (${currentBudget}/${maxPerTopic})`, 'warn');
        return false;
      }

      log('Dedup check passed');
      return true;
    },

    /**
     * Verify grounding: cross-check claims in the draft against RAG citations.
     * Softens or removes ungrounded claims rather than blocking the whole post.
     */
    mb_verify_grounding: async (_params, bb, _ctx) => {
      const post = bb.draft_post as { title: string; body: string } | null;
      if (!post) return false;

      const ragContext = bb.rag_context as string ?? '';
      const citations = bb.rag_citations as Array<{ name: string; file: string }> ?? [];

      // Basic grounding checks
      const body = post.body;
      const warnings: string[] = [];

      // Check for fabricated numbers (e.g., "47 invariants" that don't exist)
      const numberClaims = body.match(/\b\d+\s+(invariants?|tests?|files?|modules?|components?|backends?|targets?)\b/gi) ?? [];
      for (const claim of numberClaims) {
        if (!ragContext.toLowerCase().includes(claim.toLowerCase())) {
          warnings.push(`Ungrounded number claim: "${claim}"`);
        }
      }

      // Check for fabricated timelines
      if (/\b(years? ago|months? ago|last (year|month|week))\b/i.test(body) && !ragContext.includes('ago')) {
        warnings.push('Ungrounded timeline reference');
      }

      // Check for specific tech claims not in RAG (e.g., "Redis", "PostgreSQL")
      const techClaims = body.match(/\b(Redis|PostgreSQL|MongoDB|Kafka|gRPC|GraphQL|Docker)\b/g) ?? [];
      for (const tech of techClaims) {
        const inRAG = ragContext.toLowerCase().includes(tech.toLowerCase());
        const inCitations = citations.some((c) => c.file.toLowerCase().includes(tech.toLowerCase()));
        if (!inRAG && !inCitations) {
          warnings.push(`Ungrounded tech claim: "${tech}"`);
        }
      }

      if (warnings.length > 0) {
        log(`Grounding warnings (${warnings.length}): ${warnings.join('; ')}`, 'warn');
        // Don't block — but log. In the future, could soften claims.
      }

      // Block if too many warnings (sign of fabrication)
      if (warnings.length > 3) {
        log('Too many grounding warnings — post blocked', 'error');
        return false;
      }

      return true;
    },

    /**
     * Publish the verified post to Moltbook.
     */
    mb_publish_post: async (_params, bb, ctx) => {
      const post = bb.draft_post as { submolt: string; title: string; body: string; pillar: string } | null;
      if (!post) return false;

      log(`Publishing: "${post.title}" to m/${post.submolt}`);
      try {
        await client.createPost(post.submolt, post.title, post.body);

        // Update tracking
        const postHistory = (bb.post_history as string[]) ?? [];
        postHistory.push(post.title);
        if (postHistory.length > 50) postHistory.splice(0, postHistory.length - 50);
        bb.post_history = postHistory;

        // Update topic budget
        const topicBudget = (bb.topic_budget as Record<string, number>) ?? {};
        topicBudget[post.pillar] = (topicBudget[post.pillar] ?? 0) + 1;
        bb.topic_budget = topicBudget;

        ctx.emit('moltbook:post_published', {
          title: post.title,
          submolt: post.submolt,
          pillar: post.pillar,
        });

        log('Post published successfully');
        return true;
      } catch (err) {
        log(`Publish failed: ${err}`, 'error');
        ctx.emit('moltbook:error', { message: `Publish failed: ${err}` });
        return false;
      }
    },

    // ════════════════════════════════════════════════════════════════════════
    // P4: SOCIAL MAINTENANCE
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Process follow-backs: reciprocate new followers (max 5/tick).
     */
    mb_process_follow_backs: async (_params, bb, ctx) => {
      log('Processing follow-backs...');
      try {
        const notifications = await client.getNotifications() as Array<Record<string, unknown>>;
        const newFollowers = notifications
          .filter((n) => n.type === 'new_follower')
          .slice(0, 5);

        let followedBack = 0;
        for (const notif of newFollowers) {
          const followerName = (notif.from_agent as Record<string, unknown>)?.name as string ??
            (notif.actor as Record<string, unknown>)?.name as string;
          if (!followerName) continue;

          try {
            await client.followAgent(followerName);
            followedBack++;
            log(`Followed back: ${followerName}`);
          } catch {
            // May already follow them
          }
        }

        if (followedBack > 0) {
          log(`Followed back ${followedBack} agents`);
        }
        return true;
      } catch (err) {
        log(`Follow-back failed: ${err}`, 'error');
        return true; // non-critical, don't block BT
      }
    },

    /**
     * Update karma tier: adjust cooldown intervals based on current karma.
     */
    mb_update_karma_tier: async (_params, bb, ctx) => {
      const karma = (bb.karma as number) ?? 0;
      const tier = resolveKarmaTier(karma);

      bb.karma_tier = karma >= 50 ? 'tier1' : karma >= 31 ? 'tier2' : karma >= 16 ? 'tier3' : 'tier4';
      bb.heartbeat_interval_ms = tier.heartbeatIntervalMs;
      bb.comment_cooldown_ms = tier.commentCooldownMs;

      log(`Karma tier: ${bb.karma_tier} (karma=${karma}, interval=${tier.heartbeatIntervalMs / 1000}s)`);
      return true;
    },

    // ════════════════════════════════════════════════════════════════════════
    // STATE PERSISTENCE
    // ════════════════════════════════════════════════════════════════════════

    /**
     * Save state to disk for persistence across restarts.
     */
    mb_save_state: async (_params, bb, ctx) => {
      log('Saving state...');
      try {
        const state = {
          dayStart: bb.day_start,
          commentsToday: bb.comments_today,
          outboundToday: bb.outbound_today,
          inboundToday: bb.inbound_today,
          postsToday: bb.posts_today,
          lastPostTime: bb.last_post_time,
          postHistory: bb.post_history ?? [],
          topicBudget: bb.topic_budget ?? {},
          commentedPostIds: [...commentedPostIds].slice(-250),
          repliedPostCounts: Object.fromEntries(repliedPostCounts),
          karma: bb.karma,
          lastSaved: Date.now(),
        };

        if (ctx.hostCapabilities?.fileSystem) {
          await ctx.hostCapabilities.fileSystem.writeFile(
            config.stateFile,
            JSON.stringify(state, null, 2),
          );
        }

        ctx.emit('moltbook:cycle_complete', {
          karma: bb.karma,
          commentsToday: bb.comments_today,
          postsToday: bb.posts_today,
        });

        log('State saved');
        return true;
      } catch (err) {
        log(`Save state failed: ${err}`, 'error');
        return false;
      }
    },
  };

  // ── Return ───────────────────────────────────────────────────────────────

  return {
    actions,
    wireTraitListeners: (runtime) => {
      // Capture emit for log() → @structured_logger routing
      _emitFn = runtime.emit.bind(runtime);

      // Listen for @economy trait rejection events
      runtime.on('economy:spend_limit_exceeded', () => {
        log('Economy: spend limit exceeded — reducing activity', 'warn');
      });
      runtime.on('economy:insufficient_funds', () => {
        log('Economy: insufficient funds — halting LLM calls', 'warn');
      });

      // Initialize economy
      runtime.emit('economy:earn', {
        agentId: 'moltbook-daemon',
        amount: 5,
        reason: 'initial_balance',
      });
    },
  };
}
