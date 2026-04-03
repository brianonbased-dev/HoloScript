/**
 * North Star Oracle MCP Tool
 *
 * Provides programmatic access to the North Star Oracle — the knowledge layer
 * that prevents IDE agents from stalling and asking the user questions.
 *
 * Combines:
 * - Knowledge store (500+ W/P/G entries via orchestrator)
 * - Decision tree quick answers for common stall causes
 *
 * FREE tool — no credits required.
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// DECISION TREES (inline for zero-latency responses)
// =============================================================================

const DECISION_TREES: Record<string, string> = {
  'new-package':
    "Add to the closest relevant existing package. Only create a new package if it's a standalone service with its own deployment OR shared utilities used by 3+ packages.",
  'commit-timing':
    'Commit after completing a coherent unit of work. Small fix: single commit. Feature (4-10 files): single commit. Large batch (10+ files): MUST split into sectioned commits by topic. NEVER git add -A.',
  'test-failure':
    'If you wrote/modified the test: fix it. If pre-existing failure: check known failures (VRChatCompiler = 2 known). Can fix in <15 min? Fix it. Complex? Note and continue.',
  'mcp-or-cli':
    'Use MCP if reachable (richer, composable). CLI as fallback. Prefer MCP for multi-step workflows; CLI for quick single-file ops.',
  'cache-staleness':
    '<12h fresh. 12-24h OK. 24-48h stale (re-absorb if task depends on it). >48h force refresh. NEVER force:true unless cache corrupt.',
  'todo-priority':
    '1. Security 2. FIXME 3. Blocking 4. Performance regression 5. Tech debt 6. Nice-to-have. Max 3 per cycle.',
  semver:
    "Breaking API change = MAJOR. New feature = MINOR. Bug fix/refactor = PATCH. Don't bump unless releasing.",
  'doc-updates':
    'New public API = always update docs. Internal refactor = no. Bug fix = only if documented behavior affected.',
  'cost-approval': '<$1 auto-approve. $1-5 proceed + mention. $5-20 ASK USER. >$20 ALWAYS ASK.',
  'conflict-resolution':
    'User instruction > project CLAUDE.md > AGENTS.md > global CLAUDE.md > NORTH_STAR.md > memory files > research docs > README.',
  'which-repo': 'Default: HoloScript. Unless explicitly told otherwise.',
  'embedding-provider':
    'ALWAYS use OpenAI embeddings. BM25 is deprecated keyword-only. Ensure OPENAI_API_KEY is in env.',
  'git-staging':
    'ALWAYS explicit file paths. NEVER git add -A or git add . (Windows nul device bug).',
};

// =============================================================================
// KNOWLEDGE STORE QUERY
// =============================================================================

const ORCHESTRATOR_URL =
  process.env.MCP_ORCHESTRATOR_PUBLIC_URL ||
  process.env.MCP_ORCHESTRATOR_URL ||
  'https://mcp-orchestrator-production-45f9.up.railway.app';

const ORACLE_TELEMETRY_PATH =
  process.env.ORACLE_TELEMETRY_PATH || 'C:/Users/Josep/.holoscript/oracle-telemetry.jsonl';

function inferHardwareTarget(
  question: string,
  context: string,
  explicitTarget?: unknown
): string {
  if (typeof explicitTarget === 'string' && explicitTarget.trim()) {
    return explicitTarget.trim().toLowerCase();
  }

  const haystack = `${question} ${context}`.toLowerCase();
  if (haystack.includes('quest') || haystack.includes('mobile') || haystack.includes('android-xr')) {
    return 'mobile-xr';
  }
  if (
    haystack.includes('vision') ||
    haystack.includes('visionos') ||
    haystack.includes('apple vision')
  ) {
    return 'visionos';
  }
  if (haystack.includes('openxr') || haystack.includes('pc vr') || haystack.includes('desktop vr')) {
    return 'desktop-vr';
  }
  if (haystack.includes('edge') || haystack.includes('iot') || haystack.includes('raspberry') || haystack.includes('jetson')) {
    return 'edge-iot';
  }
  return 'unknown';
}

function appendOracleTelemetry(event: Record<string, unknown>): void {
  try {
    const dir = path.dirname(ORACLE_TELEMETRY_PATH);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(ORACLE_TELEMETRY_PATH, `${JSON.stringify(event)}\n`, 'utf-8');
  } catch {
    // Telemetry must never break oracle answers
  }
}

async function queryKnowledgeStore(search: string, limit: number = 5): Promise<any[]> {
  const apiKey = process.env.MCP_API_KEY || process.env.ABSORB_API_KEY;
  if (!apiKey) return [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${ORCHESTRATOR_URL}/knowledge/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mcp-api-key': apiKey,
      },
      body: JSON.stringify({ search, limit, workspace_id: 'ai-ecosystem' }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = (await res.json()) as { results?: unknown[]; entries?: unknown[] };
    return data.results || data.entries || [];
  } catch {
    return [];
  }
}

// =============================================================================
// TOOL DEFINITION
// =============================================================================

export const oracleTools: Tool[] = [
  {
    name: 'holo_oracle_consult',
    description:
      'Consult the North Star Oracle before asking the user a question. ' +
      'Returns decision tree answers for common stalls (package creation, commit timing, test triage, etc.) ' +
      'and queries the knowledge store (500+ W/P/G entries) for deeper context. ' +
      'FREE — no credits required. Call this BEFORE using AskUserQuestion.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        question: {
          type: 'string',
          description:
            'The question you would otherwise ask the user. E.g. "Should I create a new package or add to existing?", "When should I commit?", "This test is failing, what do I do?"',
        },
        context: {
          type: 'string',
          description: "Optional context about what you're working on to improve answer relevance.",
        },
        hardware_target: {
          type: 'string',
          description:
            'Optional hardware target to track oracle effectiveness (e.g. quest3, desktop-vr, mobile-ar, visionos, edge-iot).',
        },
        ide_client: {
          type: 'string',
          description: 'Optional IDE/client source (e.g. vscode, antigravity-ide, cursor).',
        },
      },
      required: ['question'],
    },
  },
];

// =============================================================================
// HANDLER
// =============================================================================

export async function handleOracleTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text: string }> }> {
  if (name !== 'holo_oracle_consult') {
    return { content: [{ type: 'text', text: `Unknown oracle tool: ${name}` }] };
  }

  const question = String(args.question || '').toLowerCase();
  const context = String(args.context || '');
  const hardwareTarget = inferHardwareTarget(question, context, args.hardware_target);
  const ideClient = String(args.ide_client || 'unknown').toLowerCase();
  const results: string[] = [];

  // 1. Check decision trees for instant answers
  const dtMatches: string[] = [];
  for (const [key, answer] of Object.entries(DECISION_TREES)) {
    const keywords = key.split('-');
    if (keywords.some((kw) => question.includes(kw))) {
      dtMatches.push(`**DT [${key}]**: ${answer}`);
    }
  }

  if (dtMatches.length > 0) {
    results.push('## Decision Tree Matches\n' + dtMatches.join('\n\n'));
  }

  // 2. Query knowledge store for deeper context
  const searchTerms = question.length > 10 ? question : `${question} ${context}`;
  const kEntries = await queryKnowledgeStore(searchTerms, 5);

  if (kEntries.length > 0) {
    const formatted = kEntries
      .map(
        (e: any) =>
          `- **[${e.id || e.type}]** ${e.content?.substring(0, 200) || 'No content'}${e.content?.length > 200 ? '...' : ''}`
      )
      .join('\n');
    results.push('## Knowledge Store Results\n' + formatted);
  }

  // 3. Provide guidance
  if (results.length === 0) {
    results.push(
      '## No Oracle Match\n' +
        'The oracle has no direct answer for this question. ' +
        'Make the **conservative choice** (easier to undo) and note what you decided. ' +
        'Only ask the user if this involves: novel features with no precedent, budget >$5, or destructive operations.'
    );
  } else {
    results.push(
      '\n---\n*Oracle answered. Proceed without asking the user unless the answer is insufficient.*'
    );
  }

  appendOracleTelemetry({
    timestamp: new Date().toISOString(),
    tool: 'holo_oracle_consult',
    ideClient,
    hardwareTarget,
    outcome: results.length === 1 && results[0].startsWith('## No Oracle Match') ? 'no_match' : 'answered',
    decisionTreeMatches: dtMatches.length,
    knowledgeMatches: kEntries.length,
    questionPreview: question.slice(0, 200),
  });

  return {
    content: [{ type: 'text', text: results.join('\n\n') }],
  };
}
