/**
 * gitBlameService — Spatial Blame for .holo files
 *
 * Queries the Next.js API for git blame data on a given file path and line
 * number. Returns author, commit hash, date, and summary for any symbol
 * in the scene graph.
 *
 * Uses the /api/git/blame route (can shell to `git blame --porcelain`).
 */

export interface BlameEntry {
  line: number;
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: string;
  summary: string;
  filePath: string;
}

export interface BlameResult {
  ok: boolean;
  entries: BlameEntry[];
  error?: string;
  isMock?: boolean;
}

export interface FetchBlameOptions {
  /**
   * Absolute workspace root on the Studio host (must lie under
   * `~/.holoscript/workspaces` per SEC-T06). When omitted or empty, the
   * client skips the API and returns deterministic mock blame only.
   */
  workspacePath?: string;
  /** Path relative to `workspacePath`. */
  filePath: string;
  /** First line to blame (1-indexed). Default 1. */
  startLine?: number;
  /** Last line to blame (1-indexed). Default startLine + 10 when using mock fallback only; API defaults differ. */
  endLine?: number;
}

/**
 * Fetch git blame for a file between startLine and endLine (1-indexed).
 * SEC-T06: requires `workspacePath` for real `/api/git/blame` calls.
 * Without it, returns mock data (no workspace open / offline dev).
 */
export async function fetchBlame(opts: FetchBlameOptions): Promise<BlameResult> {
  const filePath = opts.filePath;
  const startLine = opts.startLine ?? 1;
  const endLine = opts.endLine;
  const workspacePath = opts.workspacePath?.trim() ?? '';

  if (!workspacePath) {
    return getMockBlame(filePath, startLine, endLine ?? startLine + 10);
  }

  try {
    const params = new URLSearchParams({
      workspacePath,
      filePath,
      startLine: String(startLine),
    });
    if (endLine != null) params.set('endLine', String(endLine));

    const res = await fetch(`/api/git/blame?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json as BlameResult;
  } catch {
    return getMockBlame(filePath, startLine, endLine ?? startLine + 10);
  }
}

// ── Mock data for development / no-git environments ───────────────────────────

function getMockBlame(filePath: string, startLine: number, endLine: number): BlameResult {
  const entries: BlameEntry[] = [];
  const authors = [
    { author: 'brian', email: 'brian@holoscript.dev' },
    { author: 'Antigravity', email: 'ai@holoscript.dev' },
    { author: 'jk', email: 'jk@holoscript.dev' },
  ];
  const summaries = [
    'feat: add @breakable physics trait',
    'fix: correct navmesh bounding volume',
    'chore: regenerate trait bindings v5.0',
    'feat: add multiplayer sync to agent node',
  ];

  for (let line = startLine; line <= endLine; line++) {
    const a = authors[line % authors.length];
    const hash = `a${line.toString(16).padStart(7, '0')}`;
    entries.push({
      line,
      hash,
      shortHash: hash.slice(0, 7),
      author: a.author,
      email: a.email,
      date: '2026-03-10',
      summary: summaries[line % summaries.length],
      filePath,
    });
  }
  return { ok: true, entries, isMock: true };
}
