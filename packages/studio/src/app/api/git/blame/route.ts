/**
 * GET /api/git/blame
 *
 * Query params:
 *   filePath  — path to the file (relative to cwd or absolute)
 *   startLine — first line to blame (default 1)
 *   endLine   — last line to blame (default startLine + 50)
 *
 * Shells to `git blame --porcelain -L startLine,endLine <filePath>`
 * Returns BlameResult JSON.
 */

import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execFileAsync = promisify(execFile);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('filePath');
  const startLine = parseInt(searchParams.get('startLine') ?? '1', 10);
  const endLine = parseInt(searchParams.get('endLine') ?? String(startLine + 50), 10);

  if (!filePath) {
    return NextResponse.json({ ok: false, error: 'filePath is required', entries: [] }, { status: 400 });
  }

  const absPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

  try {
    const { stdout } = await execFileAsync('git', [
      'blame',
      '--porcelain',
      '-L', `${startLine},${endLine}`,
      absPath,
    ]);

    const entries = parsePorcelain(stdout, absPath);
    return NextResponse.json({ ok: true, entries });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg, entries: [], isMock: false }, { status: 200 });
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
    }
    else if (line.startsWith('summary ')) current.summary = line.slice(8);
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
