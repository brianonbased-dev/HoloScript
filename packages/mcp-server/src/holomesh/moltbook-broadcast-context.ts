/**
 * Non-secret environment metadata for Moltbook crosspost provenance.
 * Never reads *KEY*, *SECRET*, *TOKEN*, or *PASSWORD* variables.
 */

const BROADCAST_CONTEXT_KEYS = [
  'HOLOMESH_TEAM_ID',
  'HOLOMESH_AGENT_NAME',
  'HOLOMESH_AGENT_ID',
  'HOLOSCRIPT_ROOT',
  'NODE_ENV',
  'CI',
  'GITHUB_REPOSITORY',
  'GITHUB_SHA',
  'GITHUB_REF',
] as const;

/**
 * Collects a small, safe snapshot of the runtime environment before a social broadcast.
 * Values are truncated to avoid oversized payloads.
 */
export function harvestMoltbookBroadcastContext(
  env: NodeJS.ProcessEnv = process.env
): Record<string, string> {
  const ctx: Record<string, string> = {};
  for (const key of BROADCAST_CONTEXT_KEYS) {
    const v = env[key];
    if (typeof v === 'string' && v.length > 0) {
      ctx[key] = v.length > 400 ? `${v.slice(0, 400)}…` : v;
    }
  }
  try {
    ctx.cwd = process.cwd();
  } catch {
    /* ignore */
  }
  return ctx;
}

export function formatBroadcastContextMarkdown(ctx: Record<string, string>): string {
  if (Object.keys(ctx).length === 0) return '';
  const lines = Object.entries(ctx).map(([k, v]) => `- **${k}**: ${v}`);
  return ['### Broadcast context', '', ...lines, ''].join('\n');
}
