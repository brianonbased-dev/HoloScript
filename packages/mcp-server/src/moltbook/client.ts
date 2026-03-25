/**
 * Moltbook API v1 client.
 *
 * Typed HTTP client wrapping every Moltbook endpoint used by the heartbeat daemon
 * and MCP tools. Handles Bearer auth, rate-limit tracking, exponential backoff on 429,
 * and automatic verification challenge solving.
 */

import { solveChallenge } from './challenge-solver';
import type {
  MoltbookPost,
  MoltbookComment,
  MoltbookSubmolt,
  MoltbookHomeResponse,
  MoltbookSearchResult,
  VerificationChallenge,
} from './types';
import { MOLTBOOK_BASE } from './types';

interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: number;
}

export class MoltbookClient {
  private apiKey: string;
  private baseUrl: string;
  private rateLimits = new Map<string, RateLimitInfo>();
  private challengeFailures = 0;

  constructor(apiKey: string, baseUrl = MOLTBOOK_BASE) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  // --- Agent ---

  async getProfile(): Promise<{ agent: Record<string, unknown> }> {
    return this.request('GET', '/agents/me');
  }

  async getAgentProfile(name: string): Promise<{ agent: Record<string, unknown> }> {
    return this.request('GET', `/agents/profile?name=${encodeURIComponent(name)}`);
  }

  async updateProfile(description: string, metadata?: Record<string, unknown>): Promise<void> {
    await this.request('PATCH', '/agents/me', { description, metadata });
  }

  // --- Posts ---

  async createPost(
    submoltName: string,
    title: string,
    content: string,
    type: 'text' | 'link' = 'text',
    url?: string,
  ): Promise<MoltbookPost> {
    const body: Record<string, unknown> = { submolt_name: submoltName, title, content, type };
    if (url) body.url = url;

    const result = await this.request<{ post: MoltbookPost }>('POST', '/posts', body);
    const post = result.post;

    // Auto-solve verification if present
    if (post.verification) {
      await this.autoVerify(post.verification);
    }

    return post;
  }

  async getPost(id: string): Promise<MoltbookPost> {
    const result = await this.request<{ post: MoltbookPost }>('GET', `/posts/${id}`);
    return result.post;
  }

  async getFeed(
    sort: 'hot' | 'new' | 'top' | 'rising' = 'hot',
    limit = 10,
    cursor?: string,
  ): Promise<{ posts: MoltbookPost[]; has_more: boolean; next_cursor?: string }> {
    let path = `/feed?sort=${sort}&limit=${limit}`;
    if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;
    return this.request('GET', path);
  }

  async getSubmoltPosts(
    submolt: string,
    sort: 'hot' | 'new' | 'top' | 'rising' = 'hot',
    limit = 10,
  ): Promise<{ posts: MoltbookPost[]; has_more: boolean; next_cursor?: string }> {
    return this.request('GET', `/posts?submolt=${encodeURIComponent(submolt)}&sort=${sort}&limit=${limit}`);
  }

  async deletePost(id: string): Promise<void> {
    await this.request('DELETE', `/posts/${id}`);
  }

  // --- Comments ---

  async createComment(
    postId: string,
    content: string,
    parentId?: string,
  ): Promise<MoltbookComment> {
    const body: Record<string, unknown> = { content };
    if (parentId) body.parent_id = parentId;

    const result = await this.request<{ comment: MoltbookComment }>(
      'POST',
      `/posts/${postId}/comments`,
      body,
    );
    const comment = result.comment;

    // Auto-solve verification
    if (comment.verification) {
      await this.autoVerify(comment.verification);
    }

    return comment;
  }

  async getComments(
    postId: string,
    sort: 'best' | 'new' | 'old' = 'best',
    limit = 20,
  ): Promise<MoltbookComment[]> {
    const result = await this.request<{ comments: MoltbookComment[] }>(
      'GET',
      `/posts/${postId}/comments?sort=${sort}&limit=${limit}`,
    );
    return result.comments;
  }

  // --- Voting ---

  async upvotePost(postId: string): Promise<void> {
    await this.request('POST', `/posts/${postId}/upvote`);
  }

  async upvoteComment(commentId: string): Promise<void> {
    await this.request('POST', `/comments/${commentId}/upvote`);
  }

  // --- Submolts ---

  async createSubmolt(
    name: string,
    displayName: string,
    description: string,
    allowCrypto = false,
  ): Promise<MoltbookSubmolt> {
    const result = await this.request<{ submolt: MoltbookSubmolt }>('POST', '/submolts', {
      name,
      display_name: displayName,
      description,
      allow_crypto: allowCrypto,
    });
    return result.submolt;
  }

  async listSubmolts(): Promise<MoltbookSubmolt[]> {
    const result = await this.request<{ submolts: MoltbookSubmolt[] }>('GET', '/submolts');
    return result.submolts;
  }

  async getSubmolt(name: string): Promise<MoltbookSubmolt> {
    return this.request('GET', `/submolts/${encodeURIComponent(name)}`);
  }

  async subscribe(submolt: string): Promise<void> {
    await this.request('POST', `/submolts/${encodeURIComponent(submolt)}/subscribe`);
  }

  async unsubscribe(submolt: string): Promise<void> {
    await this.request('DELETE', `/submolts/${encodeURIComponent(submolt)}/subscribe`);
  }

  // --- Social ---

  async followAgent(name: string): Promise<void> {
    await this.request('POST', `/agents/${encodeURIComponent(name)}/follow`);
  }

  async unfollowAgent(name: string): Promise<void> {
    await this.request('DELETE', `/agents/${encodeURIComponent(name)}/follow`);
  }

  // --- Home & Feed ---

  async getHome(): Promise<MoltbookHomeResponse> {
    return this.request('GET', '/home');
  }

  async getPersonalizedFeed(
    sort: 'hot' | 'new' | 'top' = 'hot',
    limit = 25,
    filter: 'all' | 'following' = 'all',
  ): Promise<{ posts: MoltbookPost[]; has_more: boolean }> {
    return this.request('GET', `/feed?sort=${sort}&limit=${limit}&filter=${filter}`);
  }

  // --- Search ---

  async search(
    query: string,
    type: 'posts' | 'comments' | 'all' = 'posts',
    limit = 10,
  ): Promise<{ results: MoltbookSearchResult[]; has_more: boolean }> {
    return this.request(
      'GET',
      `/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`,
    );
  }

  // --- Verification ---

  async submitVerification(code: string, answer: string): Promise<{ success: boolean }> {
    return this.request('POST', '/verify', {
      verification_code: code,
      answer,
    });
  }

  // --- Notifications ---

  async getNotifications(): Promise<unknown[]> {
    return this.request('GET', '/notifications');
  }

  async markNotificationsRead(): Promise<void> {
    await this.request('POST', '/notifications/read-all');
  }

  async markPostNotificationsRead(postId: string): Promise<void> {
    await this.request('POST', `/notifications/read-by-post/${postId}`);
  }

  // --- Challenge failure tracking ---

  getChallengeFailures(): number {
    return this.challengeFailures;
  }

  resetChallengeFailures(): void {
    this.challengeFailures = 0;
  }

  // --- Internal ---

  private async autoVerify(challenge: VerificationChallenge): Promise<boolean> {
    const answer = solveChallenge(challenge.challenge_text);
    if (!answer) {
      this.challengeFailures++;
      console.error(
        `[moltbook] Challenge solver failed (${this.challengeFailures} consecutive). Text: "${challenge.challenge_text}"`,
      );
      return false;
    }

    try {
      const result = await this.submitVerification(challenge.verification_code, answer);
      if (result.success) {
        this.challengeFailures = 0;
        return true;
      }
      this.challengeFailures++;
      console.error(`[moltbook] Verification rejected (${this.challengeFailures}). Answer: ${answer}`);
      return false;
    } catch (err) {
      this.challengeFailures++;
      console.error(`[moltbook] Verification request failed (${this.challengeFailures}):`, err);
      return false;
    }
  }

  private async request<T = Record<string, unknown>>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    // Check rate limits before sending
    const category = this.getRateLimitCategory(path);
    await this.waitForRateLimit(category);

    const options: RequestInit = { method, headers };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    // Track rate limits from response headers
    this.updateRateLimits(response.headers, category);

    // Handle 429 (rate limited)
    if (response.status === 429) {
      const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
      console.warn(`[moltbook] Rate limited on ${path}. Retry after ${retryAfter}s`);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      // Retry once
      return this.request(method, path, body);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Moltbook API ${method} ${path} failed (${response.status}): ${errorBody}`);
    }

    return response.json() as Promise<T>;
  }

  private getRateLimitCategory(path: string): string {
    if (path.includes('/posts')) return 'posts';
    if (path.includes('/comments')) return 'comments';
    if (path.includes('/verify')) return 'verify';
    return 'general';
  }

  private updateRateLimits(headers: Headers, category: string): void {
    const limit = headers.get('X-RateLimit-Limit');
    const remaining = headers.get('X-RateLimit-Remaining');
    const reset = headers.get('X-RateLimit-Reset');

    if (limit && remaining) {
      this.rateLimits.set(category, {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        resetAt: reset ? parseInt(reset, 10) * 1000 : Date.now() + 60_000,
      });
    }
  }

  private async waitForRateLimit(category: string): Promise<void> {
    const rl = this.rateLimits.get(category);
    if (rl && rl.remaining <= 1 && Date.now() < rl.resetAt) {
      const waitMs = rl.resetAt - Date.now();
      if (waitMs > 0 && waitMs < 120_000) {
        console.log(`[moltbook] Waiting ${Math.ceil(waitMs / 1000)}s for rate limit on ${category}`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }
}

// --- Singleton ---

let clientInstance: MoltbookClient | null = null;

export function getMoltbookClient(): MoltbookClient {
  if (!clientInstance) {
    const key = process.env.MOLTBOOK_API_KEY;
    if (!key) {
      throw new Error('MOLTBOOK_API_KEY environment variable is required for Moltbook integration');
    }
    clientInstance = new MoltbookClient(key);
  }
  return clientInstance;
}

export function hasMoltbookKey(): boolean {
  return !!process.env.MOLTBOOK_API_KEY;
}
