import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface TaskResult {
  ok: boolean;
  taskId: string | null;
  title: string;
  seedPath: string;
  stdout: string;
  stderr: string;
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

function safeRunId(input: unknown): string {
  const value =
    typeof input === 'string' && input.trim()
      ? input.trim()
      : new Date().toISOString().slice(0, 10);
  return (
    value.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 96) || new Date().toISOString().slice(0, 10)
  );
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
  const script = 'C:/Users/josep/.ai-ecosystem/scripts/room-add-tasks.mjs';
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
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
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
  if (!message) throw new Error('Message is required.');

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
  const combined = `${result.stdout}\n${result.stderr}`;
  const taskId = extractTaskId(combined);

  return {
    ok: result.exitCode === 0 || Boolean(taskId),
    taskId,
    title,
    seedPath,
    stdout: result.stdout.slice(-4000),
    stderr: result.stderr.slice(-4000),
    exitCode: result.exitCode,
  };
}

function objectFromQuery(req: NextRequest): Record<string, unknown> {
  return {
    runId: req.nextUrl.searchParams.get('runId'),
    message: req.nextUrl.searchParams.get('message'),
    pageId: req.nextUrl.searchParams.get('pageId'),
    url: req.nextUrl.searchParams.get('url'),
    userAgent: req.nextUrl.searchParams.get('userAgent'),
  };
}

export async function POST(req: NextRequest) {
  try {
    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(await fileTask(raw));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed to file task.' },
      { status: 400 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    if (req.nextUrl.searchParams.get('record') !== '1') {
      return NextResponse.json({ ok: true, ready: true });
    }
    return NextResponse.json(await fileTask(objectFromQuery(req)));
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Failed to file task.' },
      { status: 400 }
    );
  }
}
