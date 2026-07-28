export const maxDuration = 300;

/**
 * POST /api/workspace/build — run a package.json script (or install) in a
 * workspace clone and return the real output.
 *
 * The "build" half of Brittney's workspace agency (founder directive
 * 2026-06-10). Never executes arbitrary commands: the package manager is
 * derived from the lockfile (constant strings), and the script name must
 * pass a strict charset check AND exist in the workspace's package.json
 * scripts — `install` is the only non-script verb.
 *
 * Body: {
 *   workspacePath: string   absolute path to the workspace clone
 *   script?: string         package.json script name (default "build"),
 *                           or "install" to install dependencies
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

import { corsHeaders } from '../../_lib/cors';
import { resolveWorkspaceFsRoot } from '@/lib/workspace/workspaceFs';

const execFileAsync = promisify(execFile);

const BUILD_TIMEOUT_MS = 240_000;
const MAX_BUFFER_BYTES = 8 * 1024 * 1024;
// Tail-biased clip: build failures live at the END of the output.
const OUTPUT_HEAD_CHARS = 4_000;
const OUTPUT_TAIL_CHARS = 12_000;

const SCRIPT_NAME_RE = /^[A-Za-z0-9:_-]{1,64}$/;

function clipOutput(text: string): { text: string; truncated: boolean } {
  if (text.length <= OUTPUT_HEAD_CHARS + OUTPUT_TAIL_CHARS) {
    return { text, truncated: false };
  }
  return {
    text:
      text.slice(0, OUTPUT_HEAD_CHARS) +
      `\n… (${text.length - OUTPUT_HEAD_CHARS - OUTPUT_TAIL_CHARS} chars omitted) …\n` +
      text.slice(-OUTPUT_TAIL_CHARS),
    truncated: true,
  };
}

function detectPackageManager(workspaceRoot: string): 'pnpm' | 'yarn' | 'npm' {
  if (fs.existsSync(path.join(workspaceRoot, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(workspaceRoot, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export async function POST(req: NextRequest) {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth');
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    workspacePath?: string;
    script?: string;
  } | null;
  if (!body?.workspacePath) {
    return NextResponse.json({ error: 'Required: workspacePath' }, { status: 400 });
  }

  const workspace = resolveWorkspaceFsRoot(body.workspacePath);
  if (!workspace.ok) {
    return NextResponse.json({ error: workspace.error }, { status: workspace.status });
  }
  const root = workspace.resolved;

  const script = (body.script ?? 'build').trim();
  if (!SCRIPT_NAME_RE.test(script)) {
    return NextResponse.json({ error: 'script must match [A-Za-z0-9:_-]{1,64}' }, { status: 400 });
  }

  const packageJsonPath = path.join(root, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return NextResponse.json(
      { error: 'workspace has no package.json — nothing to build here' },
      { status: 400 }
    );
  }

  let scripts: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, unknown>;
    };
    scripts = parsed.scripts ?? {};
  } catch {
    return NextResponse.json(
      { error: 'workspace package.json is not valid JSON' },
      { status: 400 }
    );
  }

  if (script !== 'install' && typeof scripts[script] !== 'string') {
    const available = Object.keys(scripts).slice(0, 20);
    return NextResponse.json(
      {
        error: `package.json has no "${script}" script`,
        availableScripts: available,
      },
      { status: 400 }
    );
  }

  const packageManager = detectPackageManager(root);
  const args = script === 'install' ? ['install'] : ['run', script];

  const startedAt = Date.now();
  let exitCode = 0;
  let stdout = '';
  let stderr = '';
  try {
    // On Windows, package managers are .cmd shims that execFile cannot spawn
    // with shell:false (EINVAL since the CVE-2024-27980 hardening). shell:true
    // is safe here because every argv element is validated: the manager name
    // is a constant derived from the lockfile, and the script name passed the
    // charset check AND exists in package.json scripts.
    const result = await execFileAsync(packageManager, args, {
      cwd: root,
      timeout: BUILD_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER_BYTES,
      windowsHide: true,
      shell: process.platform === 'win32',
      env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
    });
    stdout = result.stdout ?? '';
    stderr = result.stderr ?? '';
  } catch (err) {
    const execErr = err as {
      code?: number | string;
      killed?: boolean;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    stdout = execErr.stdout ?? '';
    stderr = execErr.stderr ?? '';
    if (execErr.killed) {
      stderr += `\n[studio] build timed out after ${BUILD_TIMEOUT_MS / 1000}s and was killed`;
      exitCode = -1;
    } else if (typeof execErr.code === 'number') {
      exitCode = execErr.code;
    } else {
      stderr += `\n[studio] ${execErr.message ?? 'build failed to spawn'}`;
      exitCode = -1;
    }
  }

  const clippedOut = clipOutput(stdout);
  const clippedErr = clipOutput(stderr);

  return NextResponse.json({
    ok: exitCode === 0,
    exitCode,
    packageManager,
    script,
    durationMs: Date.now() - startedAt,
    stdout: clippedOut.text,
    stderr: clippedErr.text,
    truncated: clippedOut.truncated || clippedErr.truncated,
  });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'POST, OPTIONS' }),
  });
}
