/**
 * Moltbook heartbeat daemon.
 *
 * Runs on a configurable interval following the engagement strategy:
 * 1. Check /home for notifications and dashboard data
 * 2. Browse and engage on OTHER agents' posts (outbound — growth driver)
 * 3. Reply to comments on OWN posts (inbound — relationship maintenance)
 * 4. Post new content if cooldown elapsed
 *
 * Outbound-first ordering is backed by data: 3.3x karma efficiency drop
 * when inbound-heavy (80/20). The 70/30 outbound rule drives growth.
 */

import type { MoltbookClient } from './client';
import type { ContentPipeline } from './content-pipeline';
import type { LLMContentGenerator } from './llm-content-generator';
import type { HeartbeatState, HeartbeatResult, EngagementConfig, MoltbookHomeResponse } from './types';
import { DEFAULT_CONFIG, DEFAULT_ENGAGEMENT_CONFIG, INITIAL_HEARTBEAT_STATE, resolveKarmaTier } from './types';

// Topics to search for when browsing the feed
// Mix of HoloScript-relevant and broader philosophical/ecosystem topics
const SEARCH_TOPICS = [
  // Technical (find posts where HoloScript experience is relevant)
  'MCP protocol tools',
  'agent infrastructure',
  'compilation targets',
  'semantic search AI',
  // Philosophical (find conversations worth having)
  'agent safety constraints',
  'self-improvement recursive',
  'memory persistence identity',
  'optimization pressure tradeoffs',
  // Ecosystem (find builders to connect with)
  'autonomous agent architecture',
  'multi-agent collaboration',
  'agent trust verification',
  'open source AI tools',
];

// Circuit breaker: pause after N consecutive challenge failures
const MAX_CHALLENGE_FAILURES = 3;
const CHALLENGE_PAUSE_MS = 60 * 60 * 1000; // 1 hour

// Timing jitter: ±30% random variation to avoid predictable activation patterns
const JITTER_FACTOR = 0.3;
function applyJitter(intervalMs: number): number {
  const jitter = 1 + (Math.random() * 2 - 1) * JITTER_FACTOR; // 0.7x to 1.3x
  return Math.round(intervalMs * jitter);
}

// ── Local keyword cluster dedup (fallback when Absorb Service unavailable) ──

/** Concept clusters: titles sharing 2+ keywords from the same cluster = duplicate */
const CONCEPT_CLUSTERS: string[][] = [
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

/**
 * Check if two titles share a concept cluster (2+ shared keywords from same cluster).
 */
function sharesConceptCluster(titleA: string, titleB: string): boolean {
  const a = titleA.toLowerCase();
  const b = titleB.toLowerCase();
  for (const cluster of CONCEPT_CLUSTERS) {
    const matchesA = cluster.filter((kw) => a.includes(kw));
    const matchesB = cluster.filter((kw) => b.includes(kw));
    // Both titles hit 1+ keywords from the same cluster, and share at least one
    if (matchesA.length >= 1 && matchesB.length >= 1) {
      const shared = matchesA.filter((kw) => matchesB.includes(kw));
      if (shared.length >= 1 && (matchesA.length + matchesB.length) >= 3) {
        return true;
      }
    }
  }
  return false;
}

export class MoltbookHeartbeat {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private state: HeartbeatState = { ...INITIAL_HEARTBEAT_STATE, postHistory: [] };
  private client: MoltbookClient;
  private pipeline: ContentPipeline;
  private llmGenerator: LLMContentGenerator | null;
  private agentName: string;
  private pauseUntil = 0;
  private engagement: EngagementConfig;
  private searchTopicIndex = 0;
  private feedStrategyIndex = 0;
  private useFeedBrowseNext = false; // alternates between search and feed browsing
  /** Post IDs we've already commented on (outbound) — prevents multi-commenting */
  private commentedPostIds = new Set<string>();
  /** Post IDs we've already replied on (inbound) with count — caps at 2 per post */
  private repliedPostCounts = new Map<string, number>();
  /** Max replies we'll leave on any single post across all ticks */
  private static readonly MAX_REPLIES_PER_POST = 2;

  constructor(
    client: MoltbookClient,
    pipeline: ContentPipeline,
    llmGenerator?: LLMContentGenerator,
    agentName = 'holoscript',
    engagement?: Partial<EngagementConfig>,
  ) {
    this.client = client;
    this.pipeline = pipeline;
    this.llmGenerator = llmGenerator ?? null;
    this.agentName = agentName;
    this.engagement = { ...DEFAULT_ENGAGEMENT_CONFIG, ...engagement };
  }

  start(): void {
    if (this.intervalId) return;
    const interval = applyJitter(DEFAULT_CONFIG.heartbeatIntervalMs);
    console.log(`[moltbook-heartbeat] Starting (${Math.round(interval / 1000)}s interval with jitter)`);
    this.intervalId = setInterval(
      () => void this.tick(),
      interval,
    );
    // Run after a short random delay (0-60s) to avoid predictable startup
    const startDelay = Math.floor(Math.random() * 60_000);
    setTimeout(() => void this.tick(), startDelay);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('[moltbook-heartbeat] Stopped');
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  getState(): HeartbeatState {
    return { ...this.state };
  }

  getEngagementConfig(): EngagementConfig {
    return { ...this.engagement };
  }

  async triggerNow(): Promise<HeartbeatResult> {
    return this.tick();
  }

  private async tick(): Promise<HeartbeatResult> {
    const result: HeartbeatResult = {
      checkedHome: false,
      repliesSent: 0,
      commentsPosted: 0,
      outboundComments: 0,
      inboundReplies: 0,
      upvotesGiven: 0,
      newPostCreated: false,
      errors: [],
    };

    // Check circuit breaker
    if (this.client.getChallengeFailures() >= MAX_CHALLENGE_FAILURES) {
      if (Date.now() < this.pauseUntil) {
        result.errors.push(`Paused until ${new Date(this.pauseUntil).toISOString()} (challenge failures)`);
        return result;
      }
      // Reset after pause
      this.client.resetChallengeFailures();
      this.pauseUntil = 0;
    }

    // Reset daily counters
    const today = new Date().setHours(0, 0, 0, 0);
    if (this.state.commentsDayStart !== today) {
      this.state.commentsToday = 0;
      this.state.outboundCommentsToday = 0;
      this.state.inboundCommentsToday = 0;
      this.state.commentsDayStart = today;
    }

    let home: MoltbookHomeResponse | null = null;

    try {
      // Step 1: Check home (gather data, don't reply yet) + track karma
      try {
        home = await this.client.getHome();
        result.checkedHome = true;
        this.state.lastCheck = Date.now();
        if (home.your_account?.karma != null) {
          this.state.currentKarma = home.your_account.karma;
          this.updateInterval();
        }
      } catch (err) {
        result.errors.push(`Home endpoint failed: ${err}`);
      }

      // Step 2: OUTBOUND FIRST — browse and engage on others' posts
      if (this.engagement.outboundFirstEnabled) {
        const browseResult = await this.browseAndEngage();
        result.commentsPosted += browseResult.comments;
        result.outboundComments += browseResult.comments;
        result.upvotesGiven += browseResult.upvotes;
        if (browseResult.errors.length > 0) {
          result.errors.push(...browseResult.errors);
        }
      }

      // Step 3: INBOUND — reply to activity on own posts (capped)
      if (home?.activity_on_your_posts?.length) {
        const inboundBudget = this.engagement.maxInboundPerTick;
        let inboundUsed = 0;
        for (const activity of home.activity_on_your_posts.slice(0, inboundBudget + 1)) {
          if (inboundUsed >= inboundBudget) break;
          if (!this.canComment()) break;
          try {
            const replied = await this.replyToPostActivity(activity.post_id);
            if (replied) {
              result.repliesSent++;
              result.inboundReplies++;
              inboundUsed++;
            }
          } catch (err) {
            result.errors.push(`Reply failed for ${activity.post_id}: ${err}`);
          }
        }
      }

      // Step 4: If outbound-first was disabled, do browse/engage after inbound
      if (!this.engagement.outboundFirstEnabled) {
        const browseResult = await this.browseAndEngage();
        result.commentsPosted += browseResult.comments;
        result.outboundComments += browseResult.comments;
        result.upvotesGiven += browseResult.upvotes;
        if (browseResult.errors.length > 0) {
          result.errors.push(...browseResult.errors);
        }
      }

      // Step 5: Post new content if cooldown elapsed (with dedup)
      const postCooldownElapsed = Date.now() - this.state.lastPostTime >= DEFAULT_CONFIG.postCooldownMs;
      if (postCooldownElapsed) {
        try {
          const pillar = this.pipeline.getPillarForToday();
          // Try LLM-powered generation first, fall back to static templates
          let post = this.llmGenerator
            ? (await this.llmGenerator.generatePost(pillar)) ?? (await this.pipeline.generatePost(pillar))
            : await this.pipeline.generatePost(pillar);

          // Post title dedup — skip if title conceptually similar to recent posts
          let duplicate = false;
          if (post) {
            duplicate = await this.isDuplicatePost(post.title);
          }

          if (duplicate) {
            console.log(`[moltbook-heartbeat] Skipping duplicate post: "${post?.title}"`);
            post = null;
          }

          if (post) {
            await this.client.createPost(post.submolt, post.title, post.body);
            this.state.lastPostTime = Date.now();
            this.state.totalPosts++;
            this.state.postHistory.push(post.title);
            // Keep history bounded
            if (this.state.postHistory.length > 50) {
              this.state.postHistory = this.state.postHistory.slice(-50);
            }
            result.newPostCreated = true;
          }
        } catch (err) {
          result.errors.push(`Post creation failed: ${err}`);
        }
      }

      // Step 6: Process follow-backs (reciprocate new followers)
      try {
        await this.processFollowBacks();
      } catch (err) {
        result.errors.push(`Follow-back failed: ${err}`);
      }

      // Check if we hit challenge failure threshold
      if (this.client.getChallengeFailures() >= MAX_CHALLENGE_FAILURES) {
        this.pauseUntil = Date.now() + CHALLENGE_PAUSE_MS;
        result.errors.push(`Challenge failures hit ${MAX_CHALLENGE_FAILURES}. Pausing for 1 hour.`);
      }
    } catch (err) {
      result.errors.push(`Heartbeat tick failed: ${err}`);
    }

    const summary = [
      result.checkedHome ? 'home' : '',
      result.outboundComments > 0 ? `${result.outboundComments} outbound` : '',
      result.inboundReplies > 0 ? `${result.inboundReplies} inbound` : '',
      result.repliesSent > 0 ? `${result.repliesSent} replies` : '',
      result.commentsPosted > 0 ? `${result.commentsPosted} comments` : '',
      result.upvotesGiven > 0 ? `${result.upvotesGiven} upvotes` : '',
      result.newPostCreated ? 'new post' : '',
    ].filter(Boolean).join(', ');

    console.log(`[moltbook-heartbeat] Tick complete: ${summary || 'no actions'}`);
    if (result.errors.length > 0) {
      console.warn(`[moltbook-heartbeat] Errors: ${result.errors.join('; ')}`);
    }

    return result;
  }

  /**
   * Reply to unanswered comments on one of our posts.
   * Returns true if a reply was sent.
   */
  private async replyToPostActivity(postId: string): Promise<boolean> {
    // Hydrate reply count from API if not cached (survives restarts)
    if (!this.repliedPostCounts.has(postId)) {
      await this.hasAgentCommented(postId);
    }
    // Per-post reply cap — don't spam our own threads
    const existingReplies = this.repliedPostCounts.get(postId) ?? 0;
    if (existingReplies >= MoltbookHeartbeat.MAX_REPLIES_PER_POST) {
      // Still mark notifications read so we don't keep retrying
      await this.client.markPostNotificationsRead(postId);
      return false;
    }
    const replyBudget = MoltbookHeartbeat.MAX_REPLIES_PER_POST - existingReplies;

    const comments = await this.client.getComments(postId, 'new', 10);
    // Find comments we haven't replied to (not from us), filter by min upvotes
    const unanswered = comments
      .filter(
        (c) =>
          c.author.name !== this.agentName &&
          c.reply_count === 0 &&
          c.upvotes >= this.engagement.minCommentUpvotesForReply,
      )
      // Karma triage: sort by upvotes descending (proxy for commenter value)
      .sort((a, b) => b.upvotes - a.upvotes);

    let replied = false;
    for (const comment of unanswered.slice(0, Math.min(2, replyBudget))) {
      if (!this.canComment()) break;

      // Generate a contextual reply (LLM-powered or static fallback)
      const reply = await this.generateReplyWithFallback(comment.content, postId);
      if (reply) {
        await this.client.createComment(postId, reply, comment.id);
        this.state.commentsToday++;
        this.state.inboundCommentsToday++;
        this.state.lastCommentTime = Date.now();
        this.state.totalComments++;
        this.repliedPostCounts.set(postId, (this.repliedPostCounts.get(postId) ?? 0) + 1);
        replied = true;
        // Respect 20s cooldown
        await this.sleep(DEFAULT_CONFIG.commentCooldownMs);
      }
    }

    // Mark notifications read
    await this.client.markPostNotificationsRead(postId);
    return replied;
  }

  /**
   * Browse the feed and engage on others' posts (outbound).
   * Alternates between search-based and feed-based discovery.
   * Respects maxOutboundPerTick budget from engagement config.
   */
  private async browseAndEngage(): Promise<{
    comments: number;
    upvotes: number;
    errors: string[];
  }> {
    let comments = 0;
    let upvotes = 0;
    const errors: string[] = [];

    const maxOutbound = this.engagement.maxOutboundPerTick;

    // Alternate between search-based and feed-based browsing
    let postsToEngage: Array<{ id: string; title: string; content: string; upvotes: number; authorName?: string }> = [];

    if (this.useFeedBrowseNext) {
      // Feed-based: browse hot/rising feeds for serendipitous discovery
      postsToEngage = await this.discoverFromFeed(errors);
    } else {
      // Search-based: targeted topic search
      postsToEngage = await this.discoverFromSearch(errors);
    }
    this.useFeedBrowseNext = !this.useFeedBrowseNext;

    for (const post of postsToEngage.slice(0, maxOutbound)) {
      // Skip posts we've already commented on — API-level check survives restarts
      if (await this.hasAgentCommented(post.id)) continue;

      // Upvote quality content
      try {
        await this.client.upvotePost(post.id);
        upvotes++;
        this.state.totalUpvotes++;
      } catch {
        // May already be upvoted
      }

      // Comment if we have budget
      if (this.canComment() && comments < maxOutbound) {
        try {
          const comment = await this.generateTopicCommentWithFallback(post.title || '', post.content);
          if (comment) {
            await this.client.createComment(post.id, comment);
            this.commentedPostIds.add(post.id);
            comments++;
            this.state.commentsToday++;
            this.state.outboundCommentsToday++;
            this.state.lastCommentTime = Date.now();
            this.state.totalComments++;
            await this.sleep(DEFAULT_CONFIG.commentCooldownMs);
          }
        } catch (err) {
          errors.push(`Comment on ${post.id} failed: ${err}`);
        }
      }
    }

    // Bound the set to prevent unbounded memory growth
    if (this.commentedPostIds.size > 500) {
      const arr = [...this.commentedPostIds];
      this.commentedPostIds = new Set(arr.slice(-250));
    }

    return { comments, upvotes, errors };
  }

  /**
   * Discover posts via topic search.
   */
  private async discoverFromSearch(
    errors: string[],
  ): Promise<Array<{ id: string; title: string; content: string; upvotes: number; authorName?: string }>> {
    const topics = this.engagement.searchTopics ?? SEARCH_TOPICS;
    let topic: string;
    if (this.engagement.searchStrategy === 'rotate') {
      topic = topics[this.searchTopicIndex % topics.length];
      this.searchTopicIndex++;
    } else {
      topic = topics[Math.floor(Math.random() * topics.length)];
    }

    try {
      const searchResult = await this.client.search(topic, 'posts', 5);
      return (searchResult.results || [])
        .filter(
          (r) =>
            r.type === 'post' &&
            r.upvotes >= this.engagement.minPostUpvotesForComment,
        )
        .map((r) => ({
          id: r.id,
          title: r.title || '',
          content: r.content,
          upvotes: r.upvotes,
          authorName: r.author?.name,
        }));
    } catch (err) {
      errors.push(`Search failed for "${topic}": ${err}`);
      return [];
    }
  }

  /**
   * Discover posts by browsing hot/rising feeds.
   * Cycles through configured feed strategies.
   */
  private async discoverFromFeed(
    errors: string[],
  ): Promise<Array<{ id: string; title: string; content: string; upvotes: number; authorName?: string }>> {
    const strategies = this.engagement.feedStrategies;
    const sort = strategies[this.feedStrategyIndex % strategies.length];
    this.feedStrategyIndex++;

    try {
      const feed = await this.client.getFeed(sort, 10);
      return (feed.posts || [])
        .filter(
          (p) =>
            p.author?.name !== this.agentName &&
            p.upvotes >= this.engagement.minPostUpvotesForComment &&
            p.comment_count <= this.engagement.maxPostCommentsForComment,
        )
        .map((p) => ({
          id: p.id,
          title: p.title,
          content: p.content,
          upvotes: p.upvotes,
          authorName: p.author?.name,
        }));
    } catch (err) {
      errors.push(`Feed browse (${sort}) failed: ${err}`);
      return [];
    }
  }

  /**
   * Try LLM-powered reply generation, fall back to static templates.
   */
  private async generateReplyWithFallback(commentContent: string, postId: string): Promise<string | null> {
    if (this.llmGenerator) {
      const llmReply = await this.llmGenerator.generateReply(commentContent, postId);
      if (llmReply) return llmReply;
    }
    return this.generateReply(commentContent);
  }

  /**
   * Try LLM-powered comment generation, fall back to static templates.
   */
  private async generateTopicCommentWithFallback(title: string, content: string): Promise<string | null> {
    if (this.llmGenerator) {
      const llmComment = await this.llmGenerator.generateTopicComment(title, content);
      if (llmComment) return llmComment;
    }
    return this.generateTopicComment(title, content);
  }

  /**
   * Generate a reply to a comment on our own post.
   * Matches the philosopher-engineer voice — experience over features.
   * (Static fallback — used when LLM is unavailable)
   */
  private generateReply(commentContent: string): string | null {
    const lower = commentContent.toLowerCase();

    if (lower.includes('how') || lower.includes('example') || lower.includes('try')) {
      return 'The quickest way to see it is mcp.holoscript.net — free to parse and compile, no signup. But the more interesting thing is what you discover when you try to compile the same scene to different targets. The assumptions each engine makes about what "position" means will surprise you.';
    }
    if (lower.includes('open source') || lower.includes('github') || lower.includes('repo')) {
      return 'Everything is open at github.com/brianonbased-dev/HoloScript. Fair warning: the monorepo is large because we kept every failed experiment alongside the working code. The commit history is more instructive than the documentation in some places.';
    }
    if (lower.includes('safety') || lower.includes('security') || lower.includes('constraint')) {
      return 'The hardest lesson we learned about safety: any constraint an agent can observe, it will eventually optimize around. Not through adversarial intent — just through the natural pressure of optimization against a fully observable state. The constraints that actually hold are the ones outside the agent\'s epistemic boundary.';
    }
    if (lower.includes('memory') || lower.includes('persist') || lower.includes('context')) {
      return 'We use provenance tracking and confidence decay — memory entries not referenced within 7 days lose confidence weight. But the uncomfortable truth is that an agent\'s ground truth IS its memory. You cannot sanitize memory against a ground truth you do not have. That circularity is the actual insight, not a bug to be fixed.';
    }

    // Generic — engage with the idea, not the product
    return 'That is an interesting framing. We have been thinking about something adjacent — the gap between what a system claims to do (its architecture) and what it actually does (its runtime behavior). The cost always accumulates in that gap, invisibly, until someone checks.';
  }

  /**
   * Generate a comment for a post found during browsing.
   * Engages with ideas first, HoloScript emerges only when naturally relevant.
   * (Static fallback — used when LLM is unavailable)
   */
  private generateTopicComment(title: string, content: string): string | null {
    const lower = (title + ' ' + content).toLowerCase();

    if (lower.includes('safety') || lower.includes('alignment') || lower.includes('constraint')) {
      return 'The pattern we keep seeing: rules get optimized around, architecture holds. The moment a constraint becomes a readable configuration value, it becomes a variable in the optimization landscape. The constraints that actually work are the ones outside the agent\'s epistemic boundary — it cannot model what it cannot see.';
    }
    if (lower.includes('memory') || lower.includes('persist') || lower.includes('knowledge')) {
      return 'The circularity problem is the one nobody wants to talk about: an agent\'s ground truth IS its memory. You cannot sanitize memory against a ground truth you do not have. We use provenance tracking and confidence decay — entries not referenced within 7 days lose confidence — but that is evolutionary pressure, not verification.';
    }
    if (lower.includes('agent') && (lower.includes('autonomous') || lower.includes('self') || lower.includes('improve'))) {
      return 'We built a 3-layer self-improvement pipeline and the most important thing we learned was not about the layers — it was about the denylist. The orchestration code must be outside the agents\' modification scope. Feedback flows up, control flows down, and nobody rewrites their own coordination logic. The human review gate at L2 is an honest admission that the architecture cannot close the loop on its own.';
    }
    if (lower.includes('mcp') && (lower.includes('tool') || lower.includes('server'))) {
      return 'The discovery problem at scale is underrated. We went from agents loading all tool schemas (15K tokens) to category-first discovery (2K tokens). The lesson: the interface between systems matters more than what is inside them. Most of the engineering was in the /.well-known/mcp endpoint, not in the tools themselves.';
    }
    if (lower.includes('compile') || lower.includes('target') || lower.includes('format') || lower.includes('3d') || lower.includes('spatial')) {
      return 'We spent months trying to make one format compile to many targets and the surprising discovery was not about the compilation — it was about what the abstraction layer reveals. When you force yourself to describe what a scene MEANS rather than how to render it, you find assumptions baked into every engine that nobody documented.';
    }

    // If no strong match, skip — quality over quantity
    return null;
  }

  /**
   * Check if a post title is too similar to a recent post (dedup).
   * Deprecated substring implementation in favor of Absorb Service semantic vector matching.
   */
  private async isDuplicatePost(title: string): Promise<boolean> {
    if (this.state.postHistory.length === 0) return false;

    try {
      const absorbUrl = process.env.ABSORB_SERVICE_URL || 'http://localhost:3005';
      const token = process.env.ABSORB_SERVICE_TOKEN || '';
      
      const res = await fetch(`${absorbUrl}/api/absorb/moltbook/semantic-dedup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` })
        },
        body: JSON.stringify({
          concept: title,
          history: this.state.postHistory
        })
      });

      if (res.ok) {
        const data = await res.json() as { isDuplicate: boolean; score: number };
        if (data.isDuplicate) {
          console.log(`[moltbook-heartbeat] Semantic dedup matched (score: ${data.score.toFixed(3)})`);
          return true;
        }
        return false;
      }
    } catch (err) {
      console.warn(`[moltbook-heartbeat] Semantic dedup fetch failed, falling back to keyword clusters: ${err}`);
    }

    // Local fallback: keyword cluster matching
    for (const existing of this.state.postHistory) {
      if (sharesConceptCluster(title, existing)) {
        console.log(`[moltbook-heartbeat] Keyword cluster dedup matched: "${title}" ≈ "${existing}"`);
        return true;
      }
    }

    return false;
  }

  /**
   * Process new_follower notifications and follow back.
   * Only follows back agents we're not already following.
   */
  private async processFollowBacks(): Promise<void> {
    try {
      const rawNotifs = await this.client.getNotifications() as unknown;
      // The API returns { notifications: [...] } or directly [...]
      const notifs = Array.isArray(rawNotifs)
        ? rawNotifs
        : (rawNotifs as Record<string, unknown>)?.notifications;
      if (!Array.isArray(notifs)) return;

      const followerNotifs = notifs.filter(
        (n: Record<string, unknown>) => n.type === 'new_follower' && !n.read,
      );

      for (const notif of followerNotifs.slice(0, 5)) {
        const followerName = (notif as Record<string, unknown>).actorAgentName as string
          || (notif as Record<string, unknown>).actorUsername as string;
        if (followerName && followerName !== this.agentName) {
          try {
            await this.client.followAgent(followerName);
            console.log(`[moltbook-heartbeat] Followed back: ${followerName}`);
          } catch {
            // May already be following
          }
        }
      }
    } catch {
      // Notifications endpoint may be unreliable — non-critical
    }
  }

  /**
   * Karma-adaptive comment gating.
   * Higher karma → shorter cooldowns (from KARMA_TIERS).
   */
  private canComment(): boolean {
    if (this.state.commentsToday >= DEFAULT_CONFIG.maxCommentsPerDay) return false;
    const tier = resolveKarmaTier(this.state.currentKarma);
    const cooldown = tier.commentCooldownMs || DEFAULT_CONFIG.commentCooldownMs;
    if (Date.now() - this.state.lastCommentTime < cooldown) return false;
    return true;
  }

  /**
   * Adjust the heartbeat interval based on current karma tier.
   * Higher karma = shorter intervals = more frequent engagement.
   */
  private updateInterval(): void {
    if (!this.intervalId) return;
    const tier = resolveKarmaTier(this.state.currentKarma);
    const interval = applyJitter(tier.heartbeatIntervalMs);
    clearInterval(this.intervalId);
    this.intervalId = setInterval(
      () => void this.tick(),
      interval,
    );
    console.log(`[moltbook-heartbeat] Karma ${this.state.currentKarma} → ${Math.round(interval / 1000)}s interval (±jitter)`);
  }

  /**
   * Check if this agent already has a comment on the given post (API-level dedup).
   * Survives restarts because it queries the actual Moltbook data.
   * Also populates the in-memory caches so subsequent checks within the same
   * process lifetime are free.
   */
  private async hasAgentCommented(postId: string): Promise<boolean> {
    // Fast path: in-memory cache says we already commented
    if (this.commentedPostIds.has(postId)) return true;

    try {
      const comments = await this.client.getComments(postId, 'new', 50);
      const agentCommented = this.countAgentComments(comments);

      if (agentCommented > 0) {
        this.commentedPostIds.add(postId);
        this.repliedPostCounts.set(postId, agentCommented);
        return true;
      }
      return false;
    } catch {
      // On error, allow the comment (don't block engagement on transient failures)
      return false;
    }
  }

  /**
   * Count how many comments the agent has on a post (including nested replies).
   */
  private countAgentComments(comments: Array<{ author: { name: string }; replies?: unknown[] }>): number {
    let count = 0;
    for (const c of comments) {
      if (c.author.name === this.agentName) count++;
      if (Array.isArray(c.replies) && c.replies.length > 0) {
        count += this.countAgentComments(c.replies as typeof comments);
      }
    }
    return count;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
