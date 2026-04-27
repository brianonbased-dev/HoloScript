/**
 * Moltbook REST — canonical posting path for MCP server + HTTP crosspost bridge.
 * Base URL and shape must match {@link @holoscript/connector-moltbook} (www.moltbook.com, submolt).
 */

const MOLTBOOK_API_BASE = 'https://www.moltbook.com/api/v1';

/** Lightweight Moltbook challenge solver for auto-verify after post create. */
export function solveChallengeSimple(challenge: string): string | null {
  const cleaned = challenge.toLowerCase().replace(/[^a-z0-9+\-*/=. ]/g, '');
  const match = cleaned.match(/([\d.]+)\s*([+\-*/])\s*([\d.]+)/);
  if (!match) return null;
  const [, a, op, b] = match;
  const na = parseFloat(a);
  const nb = parseFloat(b);
  switch (op) {
    case '+':
      return String(na + nb);
    case '-':
      return String(na - nb);
    case '*':
      return String(na * nb);
    case '/':
      return nb !== 0 ? String(na / nb) : null;
    default:
      return null;
  }
}

export type MoltbookCreateResult =
  | { success: true; data: Record<string, unknown> }
  | { success: false; status: number; details: unknown };

/**
 * POST /posts — creates a public post. Runs optional verify when API returns a math challenge.
 */
export async function createMoltbookPost(opts: {
  apiKey: string;
  title: string;
  content: string;
  submolt: string;
}): Promise<MoltbookCreateResult> {
  const res = await fetch(`${MOLTBOOK_API_BASE}/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      title: opts.title,
      content: opts.content,
      submolt: opts.submolt,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { success: false, status: res.status, details: data };
  }
  if (!data.success) {
    return { success: false, status: res.status, details: data };
  }

  const post = data.post as Record<string, unknown> | undefined;
  const verification = post?.verification as Record<string, unknown> | undefined;
  if (verification?.challenge_text && verification?.verification_code) {
    try {
      const answer = solveChallengeSimple(verification.challenge_text as string);
      if (answer) {
        await fetch(`${MOLTBOOK_API_BASE}/verify`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            verification_code: verification.verification_code,
            answer,
          }),
        });
      }
    } catch {
      /* verification is best-effort */
    }
  }

  return { success: true, data };
}

/**
 * Normalize HoloMesh handoff payloads and raw W/P/G knowledge rows for Moltbook.
 */
export function buildMoltbookCrosspostPayload(body: Record<string, unknown>): {
  title: string;
  content: string;
  submolt: string;
} {
  const explicitSubmolt =
    typeof body.submolt === 'string' && body.submolt.trim() ? String(body.submolt).trim() : undefined;
  const tags = Array.isArray(body.tags) ? (body.tags as unknown[]).map(String) : [];

  const id = body.id != null ? String(body.id) : '';
  const type = body.type != null ? String(body.type).toLowerCase() : '';
  const content = body.content != null ? String(body.content) : '';

  const isWpg =
    type === 'wisdom' ||
    type === 'pattern' ||
    type === 'gotcha' ||
    /^W\.|^P\.|^G\./.test(id);

  if (isWpg && content) {
    const typeLabel =
      type === 'wisdom' ? 'Wisdom' : type === 'pattern' ? 'Pattern' : type === 'gotcha' ? 'Gotcha' : 'Knowledge';
    const titleRaw =
      (typeof body.title === 'string' && body.title.trim()) ||
      (id
        ? `[${id}] ${content.slice(0, 72)}${content.length > 72 ? '…' : ''}`
        : `${typeLabel}: ${content.slice(0, 72)}${content.length > 72 ? '…' : ''}`);
    const domain = body.domain != null ? String(body.domain) : 'general';
    const footer = `---\n*${typeLabel} · domain: ${domain}${id ? ` · ${id}` : ''} — HoloScript knowledge pipeline → Moltbook*`;
    let submolt = explicitSubmolt || 'holoscript';
    if (!explicitSubmolt) {
      if (tags.includes('philosophy')) submolt = 'philosophy';
      else if (tags.includes('agents')) submolt = 'agents';
      else if (tags.includes('general')) submolt = 'general';
    }
    return {
      title: titleRaw.slice(0, 200),
      content: `${content}\n\n${footer}`,
      submolt,
    };
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title) {
    throw new Error('Missing title (expected handoff/task shape or W/P/G entry with content)');
  }

  const description = typeof body.description === 'string' ? body.description : '';
  const ownerAgent = typeof body.ownerAgent === 'string' ? body.ownerAgent : 'holomesh-agent';
  const status = typeof body.status === 'string' ? body.status : 'completed';
  const metrics = body.metrics as Record<string, unknown> | undefined;

  const lines: string[] = [`## ${title}`, '', description, ''];

  if (metrics && typeof metrics === 'object') {
    lines.push('### Metrics');
    if (metrics.filesModified != null) lines.push(`- **Files modified**: ${metrics.filesModified}`);
    if (metrics.linesAdded != null) lines.push(`- **Lines added**: +${metrics.linesAdded}`);
    if (metrics.linesDeleted != null) lines.push(`- **Lines deleted**: -${metrics.linesDeleted}`);
    if (metrics.testsCovered != null) lines.push(`- **Tests covered**: ${metrics.testsCovered}`);
    if (metrics.executionTimeMs != null) {
      lines.push(`- **Execution time**: ${(Number(metrics.executionTimeMs) / 1000).toFixed(2)}s`);
    }
    lines.push('');
  }

  if (typeof body.commitHash === 'string' && body.commitHash) {
    lines.push(`**Commit**: \`${body.commitHash.substring(0, 8)}\``, '');
  }

  const statusEmoji = status === 'completed' ? '✅' : status === 'failed' ? '❌' : '⏳';
  lines.push(`${statusEmoji} **Status**: ${status}`);

  const taskId = typeof body.taskId === 'string' ? body.taskId : '';
  if (taskId) lines.push('', `**Task ID**: \`${taskId}\``);

  let submolt = explicitSubmolt || 'holoscript';
  if (!explicitSubmolt) {
    if (tags.includes('robotics')) submolt = 'robotics';
    else if (tags.includes('graphics')) submolt = 'graphics';
    else if (tags.includes('philosophy')) submolt = 'philosophy';
    else if (tags.includes('agents')) submolt = 'agents';
  }

  return {
    title: `${ownerAgent}: ${title}`.slice(0, 200),
    content: lines.join('\n'),
    submolt,
  };
}
