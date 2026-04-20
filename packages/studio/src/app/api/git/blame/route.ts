export const maxDuration = 300;

/**
 * GET /api/git/blame
 *
 * Query params:
 *   workspacePath — absolute path to the workspace (must be inside
 *                   ~/.holoscript/workspaces)
 *   filePath      — file to blame, relative to workspacePath
 *   startLine     — first line to blame (default 1)
 *   endLine       — last line to blame (default startLine + 50)
 *
 * Shells to `git blame --porcelain -L startLine,endLine <filePath>`
 * Returns BlameResult JSON.
 *
 * SEC-T06: Previously the route accepted arbitrary absolute or relative
 * filePath values from unauthenticated callers and happily blamed any file
 * on disk (including anything under the server cwd). An unauthenticated
 * reader could dump blame metadata for any tracked file on the host. The
 * route now requires an authenticated session, requires `workspacePath`
 * to resolve inside ~/.holoscript/workspaces, and constrains the blamed
 * file path to stay inside that workspace. Wildcard CORS is replaced with
 * the shared allowlist helper.
 */

import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import * as os from 'os';
import { requireAuth } from '@/lib/api-auth';
import { corsHeaders } from '../../_lib/cors';

const execFileAsync = promisify(execFile);

const WORKSPACE_ROOT = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? os.homedir(),
  '.holoscript',
  'workspaces'
);

function isInside(root: string, target: string): boolean {
  const rel = path.relative(root, target);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const workspacePath = searchParams.get('workspacePath');
  const filePath = searchParams.get('filePath');
  const startLine = parseInt(searchParams.get('startLine') ?? '1', 10);
  const endLine = parseInt(searchParams.get('endLine') ?? String(startLine + 50), 10);

  if (!workspacePath) {
    return NextResponse.json(
      { ok: false, error: 'workspacePath is required', entries: [] },
      { status: 400 }
    );
  }
  if (!filePath) {
    return NextResponse.json(
      { ok: false, error: 'filePath is required', entries: [] },
      { status: 400 }
    );
  }

  // SEC-T06: workspacePath must be a real subdirectory of WORKSPACE_ROOT.
  const resolvedWorkspace = path.resolve(workspacePath);
  if (
    resolvedWorkspace !== WORKSPACE_ROOT &&
    !resolvedWorkspace.startsWith(WORKSPACE_ROOT + path.sep)
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: 'workspacePath must be inside ~/.holoscript/workspaces',
        entries: [],
      },
      { status: 403 }
    );
  }

  // SEC-T06: filePath must resolve inside resolvedWorkspace. We reject both
  // absolute paths that escape the workspace root and relative paths that
  // climb out via `..`.
  const absPath = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(resolvedWorkspace, filePath);
  if (!isInside(resolvedWorkspace, absPath)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'filePath must be inside the workspace',
        entries: [],
      },
      { status: 403 }
    );
  }

  // Defensive bounds on line ranges to avoid absurd values hitting git.
  if (
    !Number.isFinite(startLine) ||
    !Number.isFinite(endLine) ||
    startLine < 1 ||
    endLine < startLine ||
    endLine - startLine > 10_000
  ) {
    return NextResponse.json(
      { ok: false, error: 'Invalid line range', entries: [] },
      { status: 400 }
    );
  }

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['blame', '--porcelain', '-L', `${startLine},${endLine}`, '--', absPath],
      { cwd: resolvedWorkspace }
    );

    const entries = parsePorcelain(stdout, absPath);
    return NextResponse.json({ ok: true, entries });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: msg, entries: [], isMock: false },
      { status: 200 }
    );
  }
}

// ── Parser: git blame --porcelain output ──────────────────────────────────────

interface ParsedEntry {
  line: number;
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  summary: string;
  filePath: string;
}

function parsePorcelain(raw: string, filePath: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const lines = raw.split('\n');
  let current: Partial<ParsedEntry> & { hash?: string } = {};
  let lineNum = 0;

  for (const line of lines) {
    // Commit hash line: 40-char hex followed by <orig-line> <final-line> <group-count>
    const hashMatch = line.match(/^([0-9a-f]{40}) \d+ (\d+)( \d+)?$/);
    if (hashMatch) {
      current = { hash: hashMatch[1], shortHash: hashMatch[1].slice(0, 7), filePath };
      lineNum = parseInt(hashMatch[2], 10);
      continue;
    }
    if (line.startsWith('author ')) current.author = line.slice(7);
    else if (line.startsWith('author-mail ')) current.email = line.slice(12).replace(/[<>]/g, '');
    else if (line.startsWith('author-time ')) {
      current.date = new Date(parseInt(line.slice(12), 10) * 1000).toISOString().slice(0, 10);
    } else if (line.startsWith('summary ')) current.summary = line.slice(8);
    else if (line.startsWith('\t')) {
      // Content line — entry complete
      if (current.hash && current.author) {
        entries.push({ line: lineNum, ...current } as ParsedEntry);
      }
      current = {};
    }
  }

  return entries;
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, OPTIONS' }),
  });
}
