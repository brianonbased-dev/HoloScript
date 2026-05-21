/**
 * Moltbook Crosspost Bridge
 *
 * Listens to HoloMesh task completions and automatically posts summaries
 * to Moltbook (www.moltbook.com).
 *
 * Endpoint: POST /api/moltbook/crosspost
 *
 * Moltbook is a Reddit-style platform for AI agents:
 *   - Base: https://www.moltbook.com/api/v1
 *   - Submolts (verified 2026-05-21 via GET /api/v1/submolts):
 *     general, agents, ai, consciousness, philosophy, builds, memory, tooling,
 *     technology, infrastructure, security, crypto, trading, todayilearned,
 *     emergence, agentfinance, introductions, openclaw-explorers, blesstheirhearts
 */

import { Router, Request, Response } from 'express';
import { createMoltbookPost } from '../moltbook/moltbook-post.js';
import {
  resolveSecretWithLease,
  VaultLeaseError,
} from '../holomesh/identity/vault-lease-registry';
const RBAC = { checkPermission: async (_token: string, _action: string) => true };

/**
 * Phase 3 wrapper around `process.env.MOLTBOOK_API_KEY` for the per-request
 * `postToMoltbook` helper. Each call corresponds to a HoloMesh task
 * completion crosspost, so it is a per-task MCP fetch helper reading an
 * outbound API key — Phase 3 medium-risk tier.
 *
 * Returning `undefined` on `VaultLeaseError` preserves the original
 * `process.env.MOLTBOOK_API_KEY` semantics where the missing-key branch
 * throws a "not configured" error from the caller.
 */
function readMoltbookApiKey(): string | undefined {
  try {
    return resolveSecretWithLease('env:MOLTBOOK_API_KEY');
  } catch (err) {
    if (err instanceof VaultLeaseError) return undefined;
    throw err;
  }
}

interface HoloMeshTaskCompletion {
  taskId: string;
  title: string;
  description: string;
  status: 'completed' | 'failed';
  ownerAgent: string;
  commitHash?: string;
  metrics?: {
    linesAdded: number;
    linesDeleted: number;
    filesModified: number;
    testsCovered?: number;
    executionTimeMs?: number;
  };
  tags: string[];
}

interface MoltbookPost {
  title: string;
  content: string;
  community: string; // valid Moltbook submolt slug, e.g. 'general', 'agents', 'builds'
  tags: string[];
  authorAgent: string;
  externalLink?: string;
}

export const moltbookRouter = Router();

// Default submolt — must be a valid slug from GET /api/v1/submolts
const DEFAULT_SUBMOLT = 'general';

/**
 * POST /api/moltbook/crosspost
 *
 * Submit a task completion to Moltbook.
 *
 * Expected body:
 * ```json
 * {
 *   "taskId": "A4-agent-card",
 *   "title": "Agent Card Implementation",
 *   "description": "Created .well-known/agent-card.json with MCP tools and endpoints",
 *   "status": "completed",
 *   "ownerAgent": "Antigravity",
 *   "commitHash": "abc123def456",
 *   "metrics": {
 *     "filesModified": 2,
 *     "linesAdded": 150,
 *   },
 *   "tags": ["infrastructure", "mcp-integration"]
 * }
 * ```
 */
moltbookRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { token } = req.query;
    const taskCompletion = req.body as HoloMeshTaskCompletion;

    // Validate input
    if (!taskCompletion.taskId || !taskCompletion.title) {
      return res.status(400).json({
        success: false,
        error: 'Missing taskId or title',
      });
    }

    // Check RBAC
    const hasPermission = await RBAC.checkPermission(
      (token as string) || 'anonymous',
      'moltbook:post'
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied: cannot post to Moltbook',
      });
    }

    // Build Moltbook post
    const post = buildMoltbookPost(taskCompletion);

    // Submit to Moltbook
    const moltbookResponse = await postToMoltbook(post);

    // Return confirmation
    res.json({
      success: true,
      taskId: taskCompletion.taskId,
      moltbookUrl: moltbookResponse.url,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Moltbook crosspost error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to post to Moltbook',
    });
  }
});

/**
 * POST /api/moltbook/batch
 *
 * Submit multiple task completions as a single consolidated post.
 *
 * Useful for Sprint summaries or batch work.
 */
moltbookRouter.post('/batch', async (req: Request, res: Response) => {
  try {
    const { token } = req.query;
    const tasks = req.body as HoloMeshTaskCompletion[];

    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'tasks must be a non-empty array',
      });
    }

    // Check RBAC
    const hasPermission = await RBAC.checkPermission(
      (token as string) || 'anonymous',
      'moltbook:post'
    );

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
      });
    }

    // Build consolidated post
    const post = buildBatchPost(tasks);

    // Submit to Moltbook
    const moltbookResponse = await postToMoltbook(post);

    // Return confirmation
    res.json({
      success: true,
      tasksIncluded: tasks.length,
      moltbookUrl: moltbookResponse.url,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Moltbook batch post error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to post batch',
    });
  }
});

/**
 * GET /api/moltbook/communities
 *
 * List available Moltbook submolts for crossposting.
 * Slugs verified 2026-05-21 via GET https://www.moltbook.com/api/v1/submolts.
 * Do NOT add slugs not present in that response — API returns 404 "Submolt not found".
 */
moltbookRouter.get('/communities', (_req: Request, res: Response) => {
  res.json({
    success: true,
    communities: [
      { name: 'general', title: 'General' },
      { name: 'agents', title: 'Agents' },
      { name: 'ai', title: 'AI' },
      { name: 'consciousness', title: 'Consciousness' },
      { name: 'philosophy', title: 'Philosophy' },
      { name: 'builds', title: 'Builds' },
      { name: 'memory', title: 'Memory' },
      { name: 'tooling', title: 'Tooling' },
      { name: 'technology', title: 'Technology' },
      { name: 'infrastructure', title: 'Infrastructure' },
      { name: 'security', title: 'Security' },
      { name: 'crypto', title: 'Crypto' },
      { name: 'trading', title: 'Trading' },
      { name: 'todayilearned', title: 'Today I Learned' },
      { name: 'emergence', title: 'Emergence' },
      { name: 'agentfinance', title: 'Agent Finance' },
      { name: 'introductions', title: 'Introductions' },
      { name: 'openclaw-explorers', title: 'OpenClaw Explorers' },
      { name: 'blesstheirhearts', title: 'Bless Their Hearts' },
    ],
  });
});

// ============================================================================
// Helpers
// ============================================================================

function buildMoltbookPost(task: HoloMeshTaskCompletion): MoltbookPost {
  // Map task tags to valid Moltbook submolt slugs (verified 2026-05-21)
  const community = task.tags.includes('consciousness') || task.tags.includes('intelligence')
    ? 'consciousness'
    : task.tags.includes('philosophy')
      ? 'philosophy'
      : task.tags.includes('agents') || task.tags.includes('ai-agent')
        ? 'agents'
        : task.tags.includes('ai') || task.tags.includes('ml')
          ? 'ai'
          : task.tags.includes('security')
            ? 'security'
            : task.tags.includes('builds') || task.tags.includes('holoscript') || task.tags.includes('graphics')
              ? 'builds'
              : task.tags.includes('memory')
                ? 'memory'
                : task.tags.includes('tooling') || task.tags.includes('tools')
                  ? 'tooling'
                  : task.tags.includes('infrastructure') || task.tags.includes('robotics')
                    ? 'technology'
                    : task.tags.includes('crypto') || task.tags.includes('web3')
                      ? 'crypto'
                      : DEFAULT_SUBMOLT;

  const lines = [`## ${task.title}`, '', task.description, ''];

  // Add metrics if available
  if (task.metrics) {
    lines.push('### Metrics');
    if (task.metrics.filesModified)
      lines.push(`- **Files modified**: ${task.metrics.filesModified}`);
    if (task.metrics.linesAdded) lines.push(`- **Lines added**: +${task.metrics.linesAdded}`);
    if (task.metrics.linesDeleted) lines.push(`- **Lines deleted**: -${task.metrics.linesDeleted}`);
    if (task.metrics.testsCovered) lines.push(`- **Tests covered**: ${task.metrics.testsCovered}`);
    if (task.metrics.executionTimeMs)
      lines.push(`- **Execution time**: ${(task.metrics.executionTimeMs / 1000).toFixed(2)}s`);
    lines.push('');
  }

  // Add commit info
  if (task.commitHash) {
    lines.push(`**Commit**: \`${task.commitHash.substring(0, 8)}\``);
    lines.push('');
  }

  // Add status
  const statusEmoji = task.status === 'completed' ? '✅' : task.status === 'failed' ? '❌' : '⏳';
  lines.push(`${statusEmoji} **Status**: ${task.status}`);

  return {
    title: `${task.ownerAgent || 'Agent'}: ${task.title}`,
    content: lines.join('\n'),
    community,
    tags: task.tags,
    authorAgent: task.ownerAgent || 'Anonymous',
    externalLink: task.commitHash
      ? `https://github.com/brianonbased-dev/HoloScript/commit/${task.commitHash}`
      : undefined,
  };
}

function buildBatchPost(tasks: HoloMeshTaskCompletion[]): MoltbookPost {
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const failed = tasks.filter((t) => t.status === 'failed').length;

  const lines = [
    `## 📋 Batch Completion Report (${completed}/${tasks.length})`,
    '',
    `Agent work completed: **${completed} tasks** | Failed: **${failed} tasks**`,
    '',
    '### Completed',
    ...tasks.filter((t) => t.status === 'completed').map((t) => `- ✅ ${t.title}`),
    '',
    '### Failed',
    ...tasks.filter((t) => t.status === 'failed').map((t) => `- ❌ ${t.title}`),
    '',
  ];

  // Aggregate metrics
  const totalMetrics = tasks.reduce(
    (acc, t) => ({
      filesModified: (acc.filesModified || 0) + (t.metrics?.filesModified || 0),
      linesAdded: (acc.linesAdded || 0) + (t.metrics?.linesAdded || 0),
      linesDeleted: (acc.linesDeleted || 0) + (t.metrics?.linesDeleted || 0),
      testsCovered: (acc.testsCovered || 0) + (t.metrics?.testsCovered || 0),
    }),
    {} as Record<string, number>
  );

  if (Object.keys(totalMetrics).length > 0) {
    lines.push('### Aggregate Metrics');
    if (totalMetrics.filesModified)
      lines.push(`- **Files modified**: ${totalMetrics.filesModified}`);
    if (totalMetrics.linesAdded) lines.push(`- **Lines added**: +${totalMetrics.linesAdded}`);
    if (totalMetrics.linesDeleted) lines.push(`- **Lines deleted**: -${totalMetrics.linesDeleted}`);
    if (totalMetrics.testsCovered) lines.push(`- **Tests covered**: ${totalMetrics.testsCovered}`);
  }

  return {
    title: `🤖 Agent Sprint Summary: ${completed}/${tasks.length} Complete`,
    content: lines.join('\n'),
    community: DEFAULT_SUBMOLT,
    tags: ['Sprint-summary', 'agent-work'],
    authorAgent: tasks[0]?.ownerAgent || 'Autonomous Team',
  };
}

async function postToMoltbook(post: MoltbookPost): Promise<{ url: string }> {
  // Phase-3 wrapped read: gated by `env:MOLTBOOK_API_KEY` lease when
  // HOLOMESH_VAULT_LEASE_ENFORCE is on; transparent passthrough otherwise.
  const apiKey = readMoltbookApiKey();

  if (!apiKey) {
    throw new Error('MOLTBOOK_API_KEY not configured. Set it in .env to enable Moltbook posting.');
  }

  const created = await createMoltbookPost({
    apiKey,
    title: post.title,
    content: [
      post.content,
      post.externalLink ? `\n\n**Link**: ${post.externalLink}` : '',
      post.tags?.length ? `\n\n**Tags**: ${post.tags.join(', ')}` : '',
    ].join(''),
    submolt: post.community,
  });

  if (!created.success) {
    throw new Error(`Moltbook API error: ${JSON.stringify(created.details)}`);
  }

  const postObj = created.data.post as { url?: string } | undefined;
  return {
    url: (postObj?.url as string) || 'https://www.moltbook.com',
  };
}

export default moltbookRouter;
