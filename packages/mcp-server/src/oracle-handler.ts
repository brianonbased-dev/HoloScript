/**
 * North Star Oracle Handler (local to mcp-server)
 *
 * Inlined to avoid cross-package import issues. Combines decision trees
 * with knowledge store queries to answer agent questions.
 */

const TREES: Record<string, string> = {
  'package': 'Add to the closest relevant existing package. Only create a new package if standalone service or shared by 3+ packages.',
  'commit': 'Commit after coherent unit. 10+ files: MUST split into sectioned commits by topic. NEVER git add -A.',
  'test': 'Fix if yours, skip if pre-existing (VRChatCompiler = known). Can fix in <15 min? Fix. Complex? Note and continue.',
  'mcp': 'Use MCP if reachable (richer). CLI as fallback.',
  'cache': '<12h fresh. 12-24h OK. 24-48h stale. >48h force refresh. NEVER force:true unless corrupt.',
  'todo': '1.Security 2.FIXME 3.Blocking 4.Performance 5.Tech-debt 6.Nice-to-have. Max 3/cycle.',
  'version': 'Breaking=MAJOR. New feature=MINOR. Bug fix=PATCH. Don\'t bump unless releasing.',
  'doc': 'New public API=always. Internal refactor=no. Bug fix=only if documented behavior affected.',
  'cost': '<$1 auto. $1-5 proceed+mention. $5-20 ASK. >$20 ALWAYS ASK.',
  'conflict': 'User > project CLAUDE.md > AGENTS.md > global CLAUDE.md > NORTH_STAR.md > memory > research > README.',
  'repo': 'Default: HoloScript. Unless explicitly told otherwise.',
  'embedding': 'ALWAYS OpenAI. BM25 deprecated. Ensure OPENAI_API_KEY in env.',
  'git': 'ALWAYS explicit file paths. NEVER git add -A or git add .',
};

export async function handleOracleConsult(
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const question = String(args.question || '').toLowerCase();
  const context = String(args.context || '');
  const results: string[] = [];

  // Match decision trees
  const dtMatches: string[] = [];
  for (const [key, answer] of Object.entries(TREES)) {
    if (question.includes(key)) dtMatches.push(`**[${key}]**: ${answer}`);
  }
  if (dtMatches.length > 0) results.push('## Decision Tree Matches\n' + dtMatches.join('\n\n'));

  // Query knowledge store
  const apiKey = process.env.MCP_API_KEY || process.env.ABSORB_API_KEY;
  if (apiKey) {
    try {
      const url = process.env.MCP_ORCHESTRATOR_PUBLIC_URL || 'https://mcp-orchestrator-production-45f9.up.railway.app';
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${url}/knowledge/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mcp-api-key': apiKey },
        body: JSON.stringify({ search: `${question} ${context}`.trim(), limit: 5, workspace_id: 'ai-ecosystem' }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.ok) {
        const data = await res.json() as any;
        const entries = data.results || data.entries || [];
        if (entries.length > 0) {
          results.push('## Knowledge Store\n' + entries.map((e: any) =>
            `- **[${e.id || e.type}]** ${String(e.content || '').substring(0, 200)}`
          ).join('\n'));
        }
      }
    } catch { /* timeout or network */ }
  }

  if (results.length === 0) {
    results.push('## No Oracle Match\nMake the conservative choice (easier to undo) and note what you decided.');
  } else {
    results.push('\n---\n*Oracle answered. Proceed without asking the user.*');
  }
  return { content: [{ type: 'text', text: results.join('\n\n') }] };
}
