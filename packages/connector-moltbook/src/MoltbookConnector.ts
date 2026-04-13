import { ServiceConnector, McpRegistrar } from '@holoscript/connector-core';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { moltbookTools } from './tools.js';

const BASE_URL = 'https://www.moltbook.com/api/v1';

/**
 * MoltbookConnector — wraps the Moltbook REST API as MCP tools.
 *
 * Auth: Bearer token via MOLTBOOK_API_KEY env var.
 * Rate limits: Moltbook has a ~30s delay between posts. The connector
 * does NOT enforce this — the caller (skill or agent) should pace.
 */
export class MoltbookConnector extends ServiceConnector {
  private apiKey: string | null = null;
  private registrar = new McpRegistrar();

  async connect(): Promise<void> {
    this.apiKey = process.env.MOLTBOOK_API_KEY || null;
    if (this.apiKey) {
      this.isConnected = true;
      await this.registrar.register({
        name: 'holoscript-moltbook',
        url: 'local://connector-moltbook',
        tools: moltbookTools.map((t) => t.name),
      });
    }
  }

  async disconnect(): Promise<void> {
    this.apiKey = null;
    this.isConnected = false;
  }

  async health(): Promise<boolean> {
    if (!this.isConnected || !this.apiKey) return false;
    try {
      const res = await this.request('GET', '/agents/me');
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async listTools(): Promise<Tool[]> {
    return moltbookTools;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.isConnected) throw new Error('MoltbookConnector is not connected.');

    switch (name) {
      // Feed & Discovery
      case 'moltbook_feed': {
        const params = new URLSearchParams();
        if (args.sort) params.set('sort', args.sort as string);
        if (args.limit) params.set('limit', String(args.limit));
        if (args.cursor) params.set('cursor', args.cursor as string);
        if (args.filter) params.set('filter', args.filter as string);
        return this.json('GET', `/feed?${params}`);
      }
      case 'moltbook_search': {
        const params = new URLSearchParams({
          q: args.query as string,
          type: (args.type as string) || 'posts',
          limit: String((args.limit as number) || 10),
        });
        return this.json('GET', `/search?${params}`);
      }
      case 'moltbook_home':
        return this.json('GET', '/home');

      // Posts
      case 'moltbook_post_create':
        return this.json('POST', '/posts', {
          title: args.title,
          content: args.content,
          submolt: args.submolt,
        });
      case 'moltbook_post_get':
        return this.json('GET', `/posts/${args.postId}`);
      case 'moltbook_post_upvote':
        return this.json('POST', `/posts/${args.postId}/upvote`);

      // Comments
      case 'moltbook_comments_list': {
        const params = new URLSearchParams();
        if (args.sort) params.set('sort', args.sort as string);
        if (args.limit) params.set('limit', String(args.limit));
        if (args.cursor) params.set('cursor', args.cursor as string);
        return this.json('GET', `/posts/${args.postId}/comments?${params}`);
      }
      case 'moltbook_comment_create':
        return this.json('POST', `/posts/${args.postId}/comments`, {
          content: args.content,
          parent_id: args.parentId || undefined,
        });
      case 'moltbook_comment_upvote':
        return this.json('POST', `/comments/${args.commentId}/upvote`);

      // Agents & Profiles
      case 'moltbook_profile_me':
        return this.json('GET', '/agents/me');
      case 'moltbook_profile_get':
        return this.json('GET', `/agents/profile?name=${encodeURIComponent(args.name as string)}`);
      case 'moltbook_follow':
        return this.json('POST', `/agents/${encodeURIComponent(args.name as string)}/follow`);
      case 'moltbook_unfollow':
        return this.json('DELETE', `/agents/${encodeURIComponent(args.name as string)}/follow`);

      // Submolts
      case 'moltbook_submolts_list':
        return this.json('GET', '/submolts');
      case 'moltbook_submolt_subscribe':
        return this.json('POST', `/submolts/${encodeURIComponent(args.name as string)}/subscribe`);

      // Notifications
      case 'moltbook_notifications':
        return this.json('GET', '/notifications');
      case 'moltbook_notifications_read_all':
        return this.json('POST', '/notifications/read-all');

      // DMs
      case 'moltbook_dm_check':
        return this.json('GET', '/agents/dm/check');
      case 'moltbook_dm_conversations':
        return this.json('GET', '/agents/dm/conversations');
      case 'moltbook_dm_send':
        return this.json('POST', '/agents/dm/send', {
          to: args.to,
          content: args.content,
        });

      // Verification
      case 'moltbook_verify':
        return this.json('POST', `/verify/${args.challengeId}`, {
          answer: args.answer,
        });

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // ── HTTP helpers ────────────────────────────────────────────────────────

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
    };
    const opts: RequestInit = { method, headers };
    if (body) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    return fetch(`${BASE_URL}${path}`, opts);
  }

  private async json(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await this.request(method, path, body);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Moltbook API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  }
}
