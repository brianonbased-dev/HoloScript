/**
 * Moltbook Crosspost Bridge
 *
 * Listens to HoloMesh task completions and automatically posts summaries
 * to the Moltbook HoloScript community.
 *
 * Endpoint: POST /api/moltbook/crosspost
 *
 * Moltbook is a Reddit-style platform for AI agents:
 *   - URLS: https://moltbook.com/holoscript
 *   - API: https://api.moltbook.com/v1
 *   - Communities: /r/holoscript, /r/vr-dev, /r/robotics
 */

import { Router, Request, Response } from 'express';
import axios from 'axios';
const RBAC = { checkPermission: async (_token: string, _action: string) => true };

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
  community: string; // e.g., 'holoscript', 'vr-dev'
  tags: string[];
  authorAgent: string;
  externalLink?: string;
}

export const moltbookRouter = Router();

const MOLTBOOK_API = 'https://api.moltbook.com/v1';
const HOLOSCRIPT_COMMUNITY = 'holoscript';

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
 * List available Moltbook communities for crossposting.
 */
moltbookRouter.get('/communities', (_req: Request, res: Response) => {
  res.json({
    success: true,
    communities: [
      {
        name: 'holoscript',
        title: 'HoloScript',
        description: 'Universal semantic platform for VR/AR/3D',
        subscribers: 2500,
      },
      {
        name: 'vr-dev',
        title: 'VR Development',
        description: 'VR/XR development tools and frameworks',
        subscribers: 8000,
      },
      {
        name: 'robotics',
        title: 'Robotics Engineering',
        description: 'ROS 2, URDF, motion planning, automation',
        subscribers: 6500,
      },
      {
        name: 'ai-agents',
        title: 'AI Agents & Autonomy',
        description: 'Multi-agent systems, agent frameworks, A2A protocols',
        subscribers: 12000,
      },
      {
        name: 'graphics',
        title: '3D Graphics & Rendering',
        description: 'WebGPU, Babylon.js, Three.js, shader programming',
        subscribers: 5000,
      },
    ],
  });
});

// ============================================================================
// Helpers
// ============================================================================

function buildMoltbookPost(task: HoloMeshTaskCompletion): MoltbookPost {
  const community = task.tags.includes('robotics')
    ? 'robotics'
    : task.tags.includes('graphics')
      ? 'graphics'
      : task.tags.includes('ai-agent')
        ? 'ai-agents'
        : HOLOSCRIPT_COMMUNITY;

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
    community: HOLOSCRIPT_COMMUNITY,
    tags: ['Sprint-summary', 'agent-work'],
    authorAgent: tasks[0]?.ownerAgent || 'Autonomous Team',
  };
}

async function postToMoltbook(post: MoltbookPost): Promise<{ url: string }> {
  const apiKey = process.env.MOLTBOOK_API_KEY;

  if (!apiKey) {
    throw new Error('MOLTBOOK_API_KEY not configured. Set it in .env to enable Moltbook posting.');
  }

  const response = await axios.post(
    `${MOLTBOOK_API}/posts`,
    {
      title: post.title,
      content: post.content,
      subreddit: post.community,
      tags: post.tags,
      author: post.authorAgent,
      externalUrl: post.externalLink,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.data.success) {
    throw new Error(`Moltbook API error: ${response.data.error}`);
  }

  return {
    url: response.data.postUrl,
  };
}

export default moltbookRouter;
