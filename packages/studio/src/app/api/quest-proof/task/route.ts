import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { NextRequest, NextResponse } from 'next/server';
import { requireFounder } from '@/lib/api-auth';
import { safeRunId } from '@/lib/questProofCapture';

/** Most of each stream kept while the script runs, and the total after which it is killed. */
export const TASK_OUTPUT_KEEP_BYTES = 8 * 1024;
export const TASK_OUTPUT_KILL_BYTES = 1024 * 1024;

function keepTail(current: string, chunk: string): string {
  const next = current + chunk;
  return next.length > TASK_OUTPUT_KEEP_BYTES ? next.slice(-TASK_OUTPUT_KEEP_BYTES) : next;
}

export const runtime = 'nodejs';

interface TaskResult {
  ok: boolean;
  taskId: string | null;
  title: string;
  exitCode: number | null;
}

function repoRoot(): string {
  let current = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(process.cwd(), '../..');
}

function cleanText(input: unknown, max: number): string {
  return typeof input === 'string' ? input.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function titleFromMessage(message: string): string {
  const firstSentence = message.split(/[.!?\n]/)[0]?.trim() || message;
  const title = firstSentence.slice(0, 120).trim() || 'Headset proof follow-up';
  return `[quest-proof] ${title}`.slice(0, 190);
}

function extractTaskId(output: string): string | null {
  return output.match(/task_[a-zA-Z0-9_]+/)?.[0] ?? null;
}

async function runAddTasks(seedPath: string): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number | null;
}> {
  const aiEcosystemRoot = process.env.AI_ECOSYSTEM_ROOT || path.join(os.homedir(), '.ai-ecosystem');
  const script = path.join(aiEcosystemRoot, 'scripts', 'room-add-tasks.mjs');
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, [script, seedPath], {
      cwd: repoRoot(),
      env: process.env,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
    }, 60000);
    let seen = 0;
    const onChunk = (chunk: Buffer) => {
      seen += chunk.byteLength;
      if (seen > TASK_OUTPUT_KILL_BYTES) child.kill('SIGTERM');
    };
    child.stdout.on('data', (chunk: Buffer) => {
      onChunk(chunk);
      stdout = keepTail(stdout, chunk.toString('utf8'));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      onChunk(chunk);
      stderr = keepTail(stderr, chunk.toString('utf8'));
    });
    child.on('close', (exitCode) => {
      clearTimeout(timeout);
      resolve({ stdout, stderr, exitCode });
    });
  });
}

async function fileTask(raw: Record<string, unknown>): Promise<TaskResult> {
  const runId = safeRunId(raw.runId);
  const message = cleanText(raw.message, 1200);
  if (!message) throw new Error(INVALID);

  const pageId = cleanText(raw.pageId, 160) || 'quest-proof-dashboard';
  const sourceUrl = cleanText(raw.url, 1200);
  const userAgent = cleanText(raw.userAgent, 800);
  const title = titleFromMessage(message);
  const now = new Date().toISOString();
  const description = [
    `Headset message filed from Quest proof dashboard at ${now}.`,
    `Run: ${runId}`,
    `Page: ${pageId}`,
    sourceUrl ? `URL: ${sourceUrl}` : '',
    userAgent ? `User agent: ${userAgent}` : '',
    '',
    `Message: ${message}`,
    '',
    'Expected: convert this headset observation into a concrete fix, repro, proof capture, or follow-up task.',
    'Adoption: affects HoloLand headset proof and HoloShell task capture from live spatial review sessions.',
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 1990);

  const seedDir = path.join(
    repoRoot(),
    '.bench-logs',
    'format-stress',
    runId,
    'quest-proof',
    'task-seeds'
  );
  await mkdir(seedDir, { recursive: true });
  const seedPath = path.join(seedDir, `${Date.now()}-${randomUUID().slice(0, 8)}.json`);
  await writeFile(
    seedPath,
    JSON.stringify(
      {
        tasks: [
          {
            title,
            description,
            priority: 2,
            role: 'platform',
            tags: ['quest-proof', 'format-stress', 'headset-message', 'hololand', 'holoshell'],
          },
        ],
      },
      null,
      2
    ),
    'utf8'
  );

  const result = await runAddTasks(seedPath);
  if (result.exitCode !== 0) {
    // Details stay server-side; the response carries only a generic outcome.
    console.error('[quest-proof/task] add-tasks script exit', result.exitCode, result.stderr.slice(-2000));
  }
  const combined = `${result.stdout}\n${result.stderr}`;
  const taskId = extractTaskId(combined);

  return {
    ok: result.exitCode === 0 || Boolean(taskId),
    taskId,
    title,
    exitCode: result.exitCode,
  };
}

const INVALID = 'Message is required.';

function failure(error: unknown) {
  const known = error instanceof Error && error.message === INVALID;
  if (!known) console.error('[quest-proof/task] failed:', error);
  return NextResponse.json(
    { ok: false, error: known ? INVALID : 'Failed to file task.' },
    { status: known ? 400 : 500 }
  );
}

export async function POST(req: NextRequest) {
  // Writes a seed file and runs a script from the server's ai-ecosystem checkout
  // that files a task on the founder's board: founder-only (401/403, nothing run).
  const auth = await requireFounder(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(await fileTask(raw));
  } catch (error) {
    return failure(error);
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireFounder(req);
  if (auth instanceof NextResponse) return auth;
  if (req.nextUrl.searchParams.get('record') === '1') {
    return NextResponse.json(
      { ok: false, error: 'Filing is POST-only' },
      { status: 405, headers: { Allow: 'POST' } }
    );
  }
  return NextResponse.json({ ok: true, ready: true });
}
