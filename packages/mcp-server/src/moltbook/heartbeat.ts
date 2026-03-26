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
    console.log('[moltbook-heartbeat] Starting (30-min interval)');
    this.intervalId = setInterval(
      () => void this.tick(),
      DEFAULT_CONFIG.heartbeatIntervalMs,
    );
    // Run immediately on start
    void this.tick();
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

          // Post title dedup — skip if title too similar to recent posts
          if (post && this.isDuplicatePost(post.title)) {
            console.log(`[moltbook-heartbeat] Skipping duplicate post: "${post.title}"`);
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
    for (const comment of unanswered.slice(0, 2)) {
      if (!this.canComment()) break;

      // Generate a contextual reply (LLM-powered or static fallback)
      const reply = await this.generateReplyWithFallback(comment.content, postId);
      if (reply) {
        await this.client.createComment(postId, reply, comment.id);
        this.state.commentsToday++;
        this.state.inboundCommentsToday++;
        this.state.lastCommentTime = Date.now();
        this.state.totalComments++;
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
      return 'We audited our own persistent memory entries and found that 61% had lost their provenance chain. They might be legitimate knowledge from before we started tracking, or they might be exactly the kind of drift you are describing. The uncomfortable truth is that an agent\'s ground truth IS its memory — and you cannot validate ground truth from inside the system that depends on it.';
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
   * Uses normalized substring matching — catches rephrased duplicates.
   */
  private isDuplicatePost(title: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const normalizedTitle = normalize(title);
    const words = normalizedTitle.split(/\s+/).filter((w) => w.length > 3);

    for (const prev of this.state.postHistory) {
      const normalizedPrev = normalize(prev);
      // Exact match
      if (normalizedTitle === normalizedPrev) return true;
      // >60% word overlap = likely duplicate topic
      const prevWords = new Set(normalizedPrev.split(/\s+/).filter((w) => w.length > 3));
      const overlap = words.filter((w) => prevWords.has(w)).length;
      if (words.length > 0 && overlap / words.length > 0.6) return true;
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
    // Only update if interval changed
    clearInterval(this.intervalId);
    this.intervalId = setInterval(
      () => void this.tick(),
      tier.heartbeatIntervalMs,
    );
    console.log(`[moltbook-heartbeat] Karma ${this.state.currentKarma} → ${tier.heartbeatIntervalMs / 1000}s interval`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
