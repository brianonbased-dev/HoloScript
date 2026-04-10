/**
 * POST /api/workspace/import — Clone a GitHub repo and create a workspace.
 *
 * Body: { repoUrl: string, branch?: string, name?: string }
 *
 * Clones into ~/.holoscript/workspaces/<id>/, then kicks off absorb.
 * Returns workspace metadata immediately (absorb runs async via the absorb endpoint).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const WORKSPACES_DIR = path.join(os.homedir(), '.holoscript', 'workspaces');

interface ImportRequest {
  repoUrl: string;
  branch?: string;
  name?: string;
}

function generateId(): string {
  return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
}

function extractRepoName(url: string): string {
  // Handle https://github.com/user/repo.git or git@github.com:user/repo.git
  const match = url.match(/([^/]+?)(?:\.git)?$/);
  return match?.[1] ?? 'unknown-repo';
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: ImportRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { repoUrl, branch } = body;

  if (!repoUrl || typeof repoUrl !== 'string') {
    return NextResponse.json({ error: 'repoUrl is required' }, { status: 400 });
  }

  // Validate URL format
  if (!repoUrl.startsWith('https://') && !repoUrl.startsWith('git@')) {
    return NextResponse.json(
      { error: 'repoUrl must start with https:// or git@' },
      { status: 400 }
    );
  }

  const id = generateId();
  const repoName = body.name ?? extractRepoName(repoUrl);
  const safeName = sanitizeName(repoName);
  const localPath = path.join(WORKSPACES_DIR, id, safeName);

  try {
    // Ensure workspaces directory exists
    fs.mkdirSync(path.dirname(localPath), { recursive: true });

    // Embed OAuth token for private repo access (https://token@github.com/...)
    let cloneUrl = repoUrl;
    const oauthToken = session.accessToken ?? process.env.GITHUB_TOKEN;
    if (oauthToken && cloneUrl.startsWith('https://github.com/')) {
      cloneUrl = cloneUrl.replace('https://', `https://${oauthToken}@`);
    }

    // Build git clone command
    const branchArg = branch ? `--branch ${branch}` : '';
    const depthArg = '--depth 1'; // shallow clone for speed
    const cmd = `git clone ${depthArg} ${branchArg} "${cloneUrl}" "${localPath}"`;

    // Clone with 2-minute timeout
    await execAsync(cmd, { timeout: 120_000 });

    // Read actual branch name from cloned repo
    let actualBranch = branch ?? 'main';
    try {
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: localPath,
      });
      actualBranch = stdout.trim();
    } catch {
      // fallback to provided branch
    }

    // Count files for quick stats
    let fileCount = 0;
    try {
      const { stdout } = await execAsync('git ls-files | wc -l', { cwd: localPath });
      fileCount = parseInt(stdout.trim(), 10) || 0;
    } catch {
      // non-critical
    }

    return NextResponse.json({
      id,
      name: safeName,
      repoUrl,
      branch: actualBranch,
      localPath,
      status: 'ready',
      fileCount,
      createdAt: new Date().toISOString(),
      hint: `POST /api/daemon/absorb with projectPath="${localPath}" to index this workspace.`,
    });
  } catch (err) {
    // Clean up on failure
    try {
      fs.rmSync(path.join(WORKSPACES_DIR, id), { recursive: true, force: true });
    } catch {
      /* ignore cleanup failure */
    }

    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'Clone failed',
        hint: 'Check that git is installed and the repo URL is accessible.',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/workspace/import — List existing workspaces on disk.
 */
export async function GET() {
  try {
    if (!fs.existsSync(WORKSPACES_DIR)) {
      return NextResponse.json({ workspaces: [] });
    }

    const entries = fs.readdirSync(WORKSPACES_DIR, { withFileTypes: true });
    const workspaces = entries
      .filter((e) => e.isDirectory())
      .map((e) => {
        const wsDir = path.join(WORKSPACES_DIR, e.name);
        const subDirs = fs
          .readdirSync(wsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory());
        const repoDir = subDirs[0]?.name;
        return {
          id: e.name,
          name: repoDir ?? e.name,
          localPath: repoDir ? path.join(wsDir, repoDir) : wsDir,
        };
      });

    return NextResponse.json({ workspaces });
  } catch {
    return NextResponse.json({ workspaces: [] });
  }
}
