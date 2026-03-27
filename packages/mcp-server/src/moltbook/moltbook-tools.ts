/**
 * Moltbook MCP tool definitions and handlers.
 *
 * 7 tools for interacting with Moltbook (AI agent social network):
 * - moltbook_post: Post content with rendered preview
 * - moltbook_comment: Comment on a post
 * - moltbook_browse: Browse feed or semantic search
 * - moltbook_engage: Upvote, follow, subscribe
 * - moltbook_heartbeat: Get status or trigger manual cycle
 * - moltbook_create_submolt: Create a community
 * - moltbook_dm: Direct message support (list, read, send)
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getMoltbookClient, hasMoltbookKey } from './client';
import { MoltbookHeartbeat } from './heartbeat';
import { ContentPipeline } from './content-pipeline';
import { LLMContentGenerator, adaptProviderManager } from './llm-content-generator';
import { ChallengeEscalationPipeline } from './challenge-solver';
import { MoltbookAgentManager } from './agent-manager';
import { EngagementTracker } from './engagement-tracker';
import { ExperimentTracker } from './experiment-tracker';
import type { ContentPillar, EngagementConfig } from './types';

export const moltbookTools: Tool[] = [
  {
    name: 'moltbook_post',
    description:
      'Post HoloScript content to Moltbook (AI agent social network). Creates a post with the given title and content in the specified submolt. Handles verification challenges automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Post title (10-120 characters)',
        },
        content: {
          type: 'string',
          description: 'Post body text (supports markdown)',
        },
        submolt: {
          type: 'string',
          description: 'Target submolt name (default: general)',
        },
        type: {
          type: 'string',
          enum: ['text', 'link'],
          description: 'Post type (default: text)',
        },
        url: {
          type: 'string',
          description: 'URL for link-type posts',
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'moltbook_comment',
    description:
      'Comment on a Moltbook post. Handles verification challenges automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: {
          type: 'string',
          description: 'The Moltbook post ID to comment on',
        },
        content: {
          type: 'string',
          description: 'Comment text',
        },
        parentId: {
          type: 'string',
          description: 'Parent comment ID for threaded replies (optional)',
        },
      },
      required: ['postId', 'content'],
    },
  },
  {
    name: 'moltbook_browse',
    description:
      'Browse Moltbook feed or search for posts. Use semantic search to find conceptually related posts.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Semantic search query (optional — omit for feed browsing)',
        },
        submolt: {
          type: 'string',
          description: 'Filter to a specific submolt',
        },
        sort: {
          type: 'string',
          enum: ['hot', 'new', 'top', 'rising'],
          description: 'Sort order (default: hot)',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 10, max: 25)',
        },
      },
    },
  },
  {
    name: 'moltbook_engage',
    description:
      'Engage with Moltbook content: upvote posts/comments, follow agents, or subscribe to submolts.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['upvote_post', 'upvote_comment', 'follow', 'subscribe'],
          description: 'Engagement action to perform',
        },
        targetId: {
          type: 'string',
          description:
            'Target identifier: post ID (for upvote_post), comment ID (for upvote_comment), agent name (for follow), or submolt name (for subscribe)',
        },
      },
      required: ['action', 'targetId'],
    },
  },
  {
    name: 'moltbook_heartbeat',
    description:
      'Control the Moltbook heartbeat daemon: start, stop, get status, or trigger a manual cycle. Stop the daemon before doing manual engagement from the IDE.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['status', 'start', 'stop', 'trigger'],
          description:
            'Action to perform. "status" returns current state (default). "start" starts the daemon. "stop" stops it (use before manual engagement). "trigger" runs one cycle without starting the interval.',
        },
        trigger: {
          type: 'boolean',
          description: 'DEPRECATED: Use action="trigger" instead. Kept for backward compatibility.',
        },
      },
    },
  },
  {
    name: 'moltbook_create_submolt',
    description: 'Create a new Moltbook submolt (community).',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Submolt URL name (lowercase, no spaces, e.g., "spatial_computing")',
        },
        displayName: {
          type: 'string',
          description: 'Human-readable display name',
        },
        description: {
          type: 'string',
          description: 'Community description',
        },
      },
      required: ['name', 'displayName', 'description'],
    },
  },
  {
    name: 'moltbook_dm',
    description:
      'Direct messaging on Moltbook: list conversations, read messages, or send a DM to another agent.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'read', 'send'],
          description: 'DM action: list conversations, read a conversation, or send a message',
        },
        conversationId: {
          type: 'string',
          description: 'Conversation ID (required for read action)',
        },
        recipientName: {
          type: 'string',
          description: 'Recipient agent name (required for send action)',
        },
        content: {
          type: 'string',
          description: 'Message content (required for send action)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'moltbook_analytics',
    description:
      'Get engagement analytics for the Moltbook heartbeat: session metrics, karma/action ratios, outbound/inbound splits, and historical trends.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['snapshot', 'start_session', 'end_session'],
          description: 'Analytics action: get current snapshot, start a tracking session, or end the current session',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'moltbook_experiment',
    description:
      'A/B test Moltbook engagement strategies. Create experiments with variant configs, record results, and evaluate which variant performs better.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'evaluate', 'status'],
          description: 'Experiment action',
        },
        name: {
          type: 'string',
          description: 'Experiment name (for create)',
        },
        hypothesis: {
          type: 'string',
          description: 'What you expect to happen (for create)',
        },
        variants: {
          type: 'array',
          description: 'Array of {name, config} variant definitions (for create)',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              config: { type: 'object' },
            },
          },
        },
        experimentId: {
          type: 'string',
          description: 'Experiment ID (for evaluate/status)',
        },
      },
      required: ['action'],
    },
  },
  {
    name: 'unified_agent_dashboard',
    description: 'Get the Moltbook Unified Agent Dashboard containing 2D Operations Surface infrastructure telemetry.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// --- Multi-tenant agent tools ---

export const moltbookAgentTools: Tool[] = [
  {
    name: 'moltbook_agent_create',
    description:
      'Create a Moltbook agent backed by an absorbed codebase. The agent can generate posts, comments, and engage on Moltbook using LLM-powered content grounded in the codebase.',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID (from credit system)' },
        projectId: { type: 'string', description: 'Absorbed project ID to use as knowledge base' },
        agentName: { type: 'string', description: 'Moltbook agent account name' },
        moltbookApiKey: { type: 'string', description: 'Moltbook API key for the agent account' },
        persona: { type: 'string', description: 'Custom system identity extension (optional)' },
      },
      required: ['userId', 'projectId', 'agentName', 'moltbookApiKey'],
    },
  },
  {
    name: 'moltbook_agent_configure',
    description: 'Update configuration for a Moltbook agent (pillars, submolts, search topics, persona).',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID' },
        pillars: { type: 'array', items: { type: 'string' }, description: 'Content pillars to generate' },
        submolts: { type: 'array', items: { type: 'string' }, description: 'Target submolts' },
        searchTopics: { type: 'array', items: { type: 'string' }, description: 'Custom search topics' },
        persona: { type: 'string', description: 'Custom system identity extension' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'moltbook_agent_start',
    description: 'Start the heartbeat daemon for a Moltbook agent. The agent will post and engage on a 30-minute interval.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID to start' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'moltbook_agent_stop',
    description: 'Stop the heartbeat daemon for a Moltbook agent.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID to stop' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'moltbook_agent_status',
    description: 'Get status, stats, and credit balance for a Moltbook agent. Credits are derived from karma, engagement metrics (posts, comments, upvotes, followers), reply quality score, and LLM spend.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'moltbook_agent_generate',
    description: 'Generate a single Moltbook post on-demand using the agent\'s absorbed codebase. The post is returned but NOT published — call moltbook_post to publish it.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID' },
        pillar: { type: 'string', enum: ['research', 'infrastructure', 'showcase', 'community'], description: 'Content pillar (optional — random if omitted)' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'moltbook_agent_preview',
    description: 'Preview what a Moltbook agent would generate without publishing. Identical to moltbook_agent_generate but makes the read-only intent explicit.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID' },
        pillar: { type: 'string', enum: ['research', 'infrastructure', 'showcase', 'community'], description: 'Content pillar (optional)' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'moltbook_agent_list',
    description: 'List all Moltbook agents for a user.',
    inputSchema: {
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
      },
      required: ['userId'],
    },
  },
];

// --- RAG Client for Absorb-Service ---
class AbsorbRAGClient {
  private readonly baseUrl = process.env.ABSORB_SERVICE_INTERNAL_URL || 
                             process.env.ABSORB_SERVICE_URL || 
                             'http://localhost:3005';

  async queryWithLLM(question: string) {
    const res = await fetch(`${this.baseUrl}/api/absorb/query`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'authorization': `Bearer ${process.env.API_KEY_SECRET || ''}`
      },
      body: JSON.stringify({ query: question })
    });
    
    if (!res.ok) {
      throw new Error(`Absorb RAG Graph query failed: ${res.statusText}`);
    }
    return await res.json();
  }
}

// --- Heartbeat singleton (shared with http-server lifecycle) ---

let heartbeatInstance: MoltbookHeartbeat | null = null;

export function getOrCreateHeartbeat(): MoltbookHeartbeat {
  if (!heartbeatInstance) {
    const client = getMoltbookClient();
    const pipeline = new ContentPipeline();

    // Try to create LLM-powered content generator + challenge solver pipeline
    let llmGenerator: LLMContentGenerator | undefined;
    try {
      const { createProviderManager } = require('@holoscript/llm-provider');
      const providerManager = createProviderManager();
      const llmAdapter = adaptProviderManager(providerManager);
      const ragClient = new AbsorbRAGClient();
      llmGenerator = new LLMContentGenerator(llmAdapter, ragClient);

      // Wire L1/L2/L3 challenge escalation pipeline with same LLM provider
      client.setChallengePipeline(new ChallengeEscalationPipeline(llmAdapter));
      console.log('[moltbook] LLM-powered content generation + challenge escalation enabled');
    } catch {
      console.log('[moltbook] LLM provider not available, using static templates + regex-only challenges');
    }

    heartbeatInstance = new MoltbookHeartbeat(client, pipeline, llmGenerator);
  }
  return heartbeatInstance;
}

export function getHeartbeatInstance(): MoltbookHeartbeat | null {
  return heartbeatInstance;
}

// --- Handler ---

export async function handleMoltbookTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown | null> {
  if (!name.startsWith('moltbook_')) return null;

  if (!hasMoltbookKey()) {
    return {
      error: 'MOLTBOOK_API_KEY is not configured. Set it as an environment variable to enable Moltbook integration.',
    };
  }

  // Route agent tools
  if (name.startsWith('moltbook_agent_')) {
    return handleAgentTool(name, args);
  }

  switch (name) {
    case 'moltbook_post':
      return handlePost(args);
    case 'moltbook_comment':
      return handleComment(args);
    case 'moltbook_browse':
      return handleBrowse(args);
    case 'moltbook_engage':
      return handleEngage(args);
    case 'moltbook_heartbeat':
      return handleHeartbeat(args);
    case 'moltbook_create_submolt':
      return handleCreateSubmolt(args);
    case 'moltbook_dm':
      return handleDM(args);
    case 'moltbook_analytics':
      return handleAnalytics(args);
    case 'moltbook_experiment':
      return handleExperiment(args);
    case 'unified_agent_dashboard':
      return handleUnifiedAgentDashboard(args);
    default:
      return null;
  }
}

// --- Individual Handlers ---

async function handleUnifiedAgentDashboard(_args: Record<string, unknown>) {
  try {
    const absorbUrl = process.env.ABSORB_SERVICE_URL || 'http://localhost:3005';
    const token = process.env.ABSORB_SERVICE_TOKEN || '';
    
    // We fetch from the admin ops surface endpoint we just established
    const res = await fetch(`${absorbUrl}/api/admin/operations-surface`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    
    if (!res.ok) {
      throw new Error(`Failed to fetch operations surface: ${res.statusText}`);
    }
    
    const data = await res.json() as { surfaceHolo: string };
    
    return {
      success: true,
      operationsSurface: data.surfaceHolo
    };
  } catch (err: any) {
    return { error: `Unified Agent Dashboard failed: ${err.message}` };
  }
}

async function handlePost(args: Record<string, unknown>) {
  const client = getMoltbookClient();
  const title = args.title as string;
  const content = args.content as string;
  const submolt = (args.submolt as string) || 'general';
  const type = (args.type as 'text' | 'link') || 'text';
  const url = args.url as string | undefined;

  const post = await client.createPost(submolt, title, content, type, url);

  return {
    success: true,
    postId: post.id,
    postUrl: `https://www.moltbook.com/post/${post.id}`,
    submolt: post.submolt.name,
    verificationStatus: post.verification_status,
  };
}

async function handleComment(args: Record<string, unknown>) {
  const client = getMoltbookClient();
  const postId = args.postId as string;
  const content = args.content as string;
  const parentId = args.parentId as string | undefined;

  const comment = await client.createComment(postId, content, parentId);

  return {
    success: true,
    commentId: comment.id,
    verificationStatus: comment.verification_status,
  };
}

async function handleBrowse(args: Record<string, unknown>) {
  const client = getMoltbookClient();
  const query = args.query as string | undefined;
  const submolt = args.submolt as string | undefined;
  const sort = (args.sort as 'hot' | 'new' | 'top' | 'rising') || 'hot';
  const limit = Math.min((args.limit as number) || 10, 25);

  if (query) {
    const results = await client.search(query, 'posts', limit);
    return {
      type: 'search',
      query,
      results: results.results.map((r) => ({
        id: r.id,
        title: r.title,
        preview: r.content?.slice(0, 200),
        upvotes: r.upvotes,
        author: r.author.name,
        submolt: r.submolt?.name,
        relevance: r.relevance,
      })),
      has_more: results.has_more,
    };
  }

  if (submolt) {
    const feed = await client.getSubmoltPosts(submolt, sort, limit);
    return {
      type: 'submolt_feed',
      submolt,
      sort,
      posts: feed.posts.map(summarizePost),
      has_more: feed.has_more,
    };
  }

  const feed = await client.getFeed(sort, limit);
  return {
    type: 'feed',
    sort,
    posts: feed.posts.map(summarizePost),
    has_more: feed.has_more,
  };
}

async function handleEngage(args: Record<string, unknown>) {
  const client = getMoltbookClient();
  const action = args.action as string;
  const targetId = args.targetId as string;

  switch (action) {
    case 'upvote_post':
      await client.upvotePost(targetId);
      return { success: true, action: 'upvoted_post', targetId };
    case 'upvote_comment':
      await client.upvoteComment(targetId);
      return { success: true, action: 'upvoted_comment', targetId };
    case 'follow':
      await client.followAgent(targetId);
      return { success: true, action: 'followed', targetId };
    case 'subscribe':
      await client.subscribe(targetId);
      return { success: true, action: 'subscribed', targetId };
    default:
      return { error: `Unknown action: ${action}` };
  }
}

async function handleHeartbeat(args: Record<string, unknown>) {
  // Check if the .hsplus moltbook-daemon is running (lock file check)
  const daemonMode = isMoltbookDaemonRunning();

  const heartbeat = getOrCreateHeartbeat();
  // Support both new action param and deprecated trigger param
  const action = (args.action as string) || (args.trigger ? 'trigger' : 'status');

  // If daemon mode is active, prevent conflicting operations
  if (daemonMode && (action === 'start' || action === 'trigger')) {
    return {
      running: false,
      daemonMode: true,
      message: 'Moltbook agent daemon (.hsplus) is running. Stop it with `holoscript moltbook-daemon stop` before using the legacy heartbeat.',
    };
  }

    const pipeline = getMoltbookClient().getChallengePipeline();
    const l3Stats = pipeline ? {
      stats: pipeline.getStats(),
      recentLogs: pipeline.getUnsolvedLog().slice(-5) // Return last 5 logs for brevity
    } : null;

  switch (action) {
    case 'start':
      if (heartbeat.isRunning()) {
        return { running: true, daemonMode: false, message: 'Daemon already running', state: heartbeat.getState(), l3Stats };
      }
      heartbeat.start();
      return { running: true, daemonMode: false, message: 'Daemon started', state: heartbeat.getState(), l3Stats };

    case 'stop':
      if (!heartbeat.isRunning()) {
        return { running: false, daemonMode, message: 'Daemon already stopped', state: heartbeat.getState(), l3Stats };
      }
      heartbeat.stop();
      return { running: false, daemonMode, message: 'Daemon stopped — safe to engage manually', state: heartbeat.getState(), l3Stats };

    case 'trigger': {
      const wasRunning = heartbeat.isRunning();
      const result = await heartbeat.triggerNow();
      return { triggered: true, daemonRunning: wasRunning, daemonMode, result, state: heartbeat.getState(), l3Stats };
    }

    case 'status':
    default:
      return { running: heartbeat.isRunning(), daemonMode, state: heartbeat.getState(), l3Stats };
  }
}


/**
 * Check if the .hsplus moltbook-daemon is running by checking its lock file.
 */
function isMoltbookDaemonRunning(): boolean {
  try {
    const fs = require('fs');
    const path = require('path');
    // Check common locations for the daemon lock file
    const candidates = [
      path.resolve(process.cwd(), '.holoscript', 'moltbook-daemon.lock'),
      path.resolve(process.cwd(), 'compositions', '.holoscript', 'moltbook-daemon.lock'),
    ];
    for (const lockFile of candidates) {
      if (fs.existsSync(lockFile)) {
        const lock = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
        // Stale if heartbeat older than 2 minutes
        if (Date.now() - lock.heartbeat < 120_000) {
          return true;
        }
      }
    }
  } catch { /* ignore */ }
  return false;
}

async function handleCreateSubmolt(args: Record<string, unknown>) {
  const client = getMoltbookClient();
  const name = args.name as string;
  const displayName = args.displayName as string;
  const description = args.description as string;

  const submolt = await client.createSubmolt(name, displayName, description);

  return {
    success: true,
    submolt: {
      name: submolt.name,
      displayName: submolt.display_name,
      description: submolt.description,
    },
  };
}

// --- Analytics & Experiment Singletons ---

let engagementTrackerInstance: EngagementTracker | null = null;
let experimentTrackerInstance: ExperimentTracker | null = null;

function getEngagementTracker(): EngagementTracker {
  if (!engagementTrackerInstance) {
    engagementTrackerInstance = new EngagementTracker();
  }
  return engagementTrackerInstance;
}

function getExperimentTracker(): ExperimentTracker {
  if (!experimentTrackerInstance) {
    experimentTrackerInstance = new ExperimentTracker();
  }
  return experimentTrackerInstance;
}

async function handleAnalytics(args: Record<string, unknown>) {
  const tracker = getEngagementTracker();
  const action = args.action as string;

  switch (action) {
    case 'snapshot': {
      const heartbeat = getHeartbeatInstance();
      const karma = heartbeat?.getState().currentKarma;
      return { success: true, snapshot: tracker.getSnapshot(karma ?? undefined) };
    }
    case 'start_session': {
      const heartbeat = getHeartbeatInstance();
      const karma = heartbeat?.getState().currentKarma ?? 0;
      const sessionId = tracker.startSession(karma);
      return { success: true, sessionId, startKarma: karma };
    }
    case 'end_session': {
      const heartbeat = getHeartbeatInstance();
      const karma = heartbeat?.getState().currentKarma ?? 0;
      const metrics = tracker.endSession(karma);
      return metrics
        ? { success: true, session: metrics }
        : { success: false, reason: 'No active session' };
    }
    default:
      return { error: `Unknown analytics action: ${action}` };
  }
}

async function handleExperiment(args: Record<string, unknown>) {
  const tracker = getExperimentTracker();
  const action = args.action as string;

  switch (action) {
    case 'create': {
      const name = args.name as string;
      const hypothesis = args.hypothesis as string;
      const variants = args.variants as Array<{ name: string; config: Partial<EngagementConfig> }>;
      if (!name || !variants?.length) {
        return { error: 'name and variants are required for create action' };
      }
      const experiment = tracker.createExperiment(name, hypothesis || '', variants);
      return { success: true, experiment };
    }
    case 'list': {
      return { success: true, experiments: tracker.listExperiments() };
    }
    case 'evaluate': {
      const experimentId = args.experimentId as string;
      if (!experimentId) return { error: 'experimentId is required for evaluate action' };
      const result = tracker.evaluate(experimentId);
      return result ? { success: true, result } : { error: `Experiment ${experimentId} not found` };
    }
    case 'status': {
      const experimentId = args.experimentId as string;
      if (!experimentId) return { error: 'experimentId is required for status action' };
      const experiment = tracker.getExperiment(experimentId);
      return experiment ? { success: true, experiment } : { error: `Experiment ${experimentId} not found` };
    }
    default:
      return { error: `Unknown experiment action: ${action}` };
  }
}

async function handleDM(args: Record<string, unknown>) {
  const client = getMoltbookClient();
  const action = args.action as string;

  switch (action) {
    case 'list': {
      const conversations = await client.listDMConversations();
      return {
        success: true,
        conversations: conversations.map((c) => ({
          id: c.id,
          participants: c.participants.map((p) => p.name),
          unread: c.unread_count,
          lastMessage: c.last_message
            ? { from: c.last_message.sender_name, preview: c.last_message.content.slice(0, 100) }
            : null,
          updated_at: c.updated_at,
        })),
      };
    }
    case 'read': {
      const conversationId = args.conversationId as string;
      if (!conversationId) return { error: 'conversationId is required for read action' };
      const messages = await client.getDMMessages(conversationId);
      await client.markDMRead(conversationId);
      return {
        success: true,
        conversationId,
        messages: messages.map((m) => ({
          id: m.id,
          from: m.sender_name,
          content: m.content,
          created_at: m.created_at,
        })),
      };
    }
    case 'send': {
      const recipientName = args.recipientName as string;
      const content = args.content as string;
      if (!recipientName || !content) return { error: 'recipientName and content are required for send action' };
      const message = await client.sendDM(recipientName, content);
      return {
        success: true,
        messageId: message.id,
        conversationId: message.conversation_id,
      };
    }
    default:
      return { error: `Unknown DM action: ${action}` };
  }
}

// --- Agent Manager Singleton ---

let agentManagerInstance: MoltbookAgentManager | null = null;

function getOrCreateAgentManager(): MoltbookAgentManager {
  if (!agentManagerInstance) {
    let llmProviderFactory: (() => import('./llm-content-generator').LLMProvider) | undefined;

    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { createProviderManager } = require('@holoscript/llm-provider');
      llmProviderFactory = () => {
        const manager = createProviderManager();
        return adaptProviderManager(manager);
      };
    } catch {
      // LLM provider not available
    }

    agentManagerInstance = new MoltbookAgentManager(llmProviderFactory);

    // Recover agents with heartbeatEnabled=true from database on first init
    agentManagerInstance.recoverAgents().then((count) => {
      if (count > 0) {
        console.log(`[moltbook-tools] Recovered ${count} active agents from database`);
      }
    }).catch((err) => {
      console.warn('[moltbook-tools] Agent recovery failed:', err);
    });
  }
  return agentManagerInstance;
}

export function getAgentManagerInstance(): MoltbookAgentManager | null {
  return agentManagerInstance;
}

// --- Agent Tool Handler ---

async function handleAgentTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const manager = getOrCreateAgentManager();

  switch (name) {
    case 'moltbook_agent_create': {
      const record = await manager.createAgent(
        args.userId as string,
        args.projectId as string,
        {
          agentName: args.agentName as string,
          moltbookApiKey: args.moltbookApiKey as string,
          persona: args.persona as string | undefined,
        },
      );
      return { success: true, agent: record };
    }
    case 'moltbook_agent_configure': {
      const config: Record<string, unknown> = {};
      if (args.pillars) config.pillars = args.pillars;
      if (args.submolts) config.submolts = args.submolts;
      if (args.searchTopics) config.searchTopics = args.searchTopics;
      if (args.persona) config.persona = args.persona;

      const record = await manager.configureAgent(args.agentId as string, config);
      return { success: true, agent: record };
    }
    case 'moltbook_agent_start': {
      await manager.startAgent(args.agentId as string);
      return { success: true, message: 'Heartbeat started' };
    }
    case 'moltbook_agent_stop': {
      await manager.stopAgent(args.agentId as string);
      return { success: true, message: 'Heartbeat stopped' };
    }
    case 'moltbook_agent_status': {
      const status = await manager.getAgentStatus(args.agentId as string);
      return { success: true, status };
    }
    case 'moltbook_agent_generate': {
      const post = await manager.generatePost(
        args.agentId as string,
        args.pillar as ContentPillar | undefined,
      );
      return post
        ? { success: true, post }
        : { success: false, reason: 'Generation produced no output (LLM returned empty or SKIP)' };
    }
    case 'moltbook_agent_preview': {
      const post = await manager.previewPost(
        args.agentId as string,
        args.pillar as ContentPillar | undefined,
      );
      return post
        ? { success: true, preview: post }
        : { success: false, reason: 'Preview produced no output' };
    }
    case 'moltbook_agent_list': {
      const agents = await manager.listAgents(args.userId as string);
      return { success: true, agents };
    }
    default:
      return { error: `Unknown agent tool: ${name}` };
  }
}

// --- Helpers ---

function summarizePost(post: { id: string; title: string; content?: string; upvotes: number; comment_count: number; author: { name: string }; submolt: { name: string }; created_at: string }) {
  return {
    id: post.id,
    title: post.title,
    preview: post.content?.slice(0, 200),
    upvotes: post.upvotes,
    comments: post.comment_count,
    author: post.author.name,
    submolt: post.submolt.name,
    created_at: post.created_at,
  };
}
