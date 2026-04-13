/**
 * Absorb Scanner — Framework scans its own codebase for improvements.
 *
 * Queries the MCP Orchestrator knowledge store for framework-related
 * insights, and scans local source files for TODO/FIXME markers.
 *
 * Does NOT depend on the absorb service being up — the orchestrator's
 * knowledge store is the source of truth (always available).
 */

import { execSync } from 'child_process';
import { resolve } from 'path';

export interface AbsorbScanConfig {
  /** MCP Orchestrator URL (default: production) */
  orchestratorUrl?: string;
  /** MCP API key for orchestrator auth */
  mcpApiKey?: string;
  /** Workspace ID for knowledge queries (default: ai-ecosystem) */
  workspaceId?: string;
  /** Max improvement tasks to generate */
  maxTasks?: number;
  /** Search query for knowledge store */
  searchQuery?: string;
}

export interface ScanResult {
  scanned: boolean;
  filesAnalyzed: number;
  issuesFound: number;
  improvements: ImprovementTask[];
  knowledge: ExtractedKnowledge[];
  error?: string;
}

export interface ImprovementTask {
  title: string;
  description: string;
  priority: number;
  category: 'refactor' | 'test' | 'docs' | 'performance' | 'type-safety';
  file?: string;
  line?: number;
}

export interface ExtractedKnowledge {
  type: 'wisdom' | 'pattern' | 'gotcha';
  content: string;
  domain: string;
  confidence: number;
}

const DEFAULT_ORCHESTRATOR_URL = 'https://mcp-orchestrator-production-45f9.up.railway.app';
const DEFAULT_WORKSPACE_ID = 'ai-ecosystem';

/** Orchestrator knowledge entry shape */
interface KnowledgeEntry {
  id?: string;
  type?: 'wisdom' | 'pattern' | 'gotcha';
  content?: string;
  metadata?: {
    domain?: string;
    confidence?: number;
    source?: string;
  };
}

/**
 * Scan the framework via the MCP Orchestrator knowledge store.
 * Returns improvement tasks + extracted knowledge.
 * Falls back gracefully if the orchestrator is unreachable.
 */
export async function scanFramework(config: AbsorbScanConfig = {}): Promise<ScanResult> {
  const orchestratorUrl = config.orchestratorUrl || DEFAULT_ORCHESTRATOR_URL;
  const apiKey = config.mcpApiKey || process.env.HOLOSCRIPT_API_KEY || '';
  const workspaceId = config.workspaceId || DEFAULT_WORKSPACE_ID;
  const maxTasks = config.maxTasks || 20;
  const searchQuery =
    config.searchQuery ||
    'framework improvement opportunities type-safety test-coverage refactoring agents';

  if (!apiKey) {
    return {
      scanned: false,
      filesAnalyzed: 0,
      issuesFound: 0,
      improvements: [],
      knowledge: [],
      error: 'HOLOSCRIPT_API_KEY required for knowledge store query',
    };
  }

  try {
    const queryRes = await fetch(`${orchestratorUrl}/knowledge/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mcp-api-key': apiKey,
      },
      body: JSON.stringify({
        search: searchQuery,
        limit: maxTasks,
        workspace_id: workspaceId,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const improvements: ImprovementTask[] = [];
    const knowledge: ExtractedKnowledge[] = [];
    let filesAnalyzed = 0;

    if (queryRes.ok) {
      const data = (await queryRes.json()) as {
        results?: KnowledgeEntry[];
        entries?: KnowledgeEntry[];
      };
      const entries = data.results || data.entries || [];
      filesAnalyzed = entries.length;

      for (const entry of entries.slice(0, maxTasks)) {
        const content = entry.content || '';
        const entryType = entry.type || 'pattern';
        const domain = entry.metadata?.domain || 'framework';
        const confidence = entry.metadata?.confidence ?? 0.5;

        // Skip gated entries that we can't read
        if (content.includes('[Requires API key')) continue;

        // Gotchas become improvement tasks (things to fix)
        if (entryType === 'gotcha') {
          improvements.push({
            title: content.slice(0, 120),
            description: `Knowledge store gotcha (${domain}): ${content.slice(0, 300)}`,
            priority: 2,
            category: categorizeContent(content),
          });
        }

        // All entries become extracted knowledge
        knowledge.push({
          type: entryType,
          content: content.slice(0, 500),
          domain,
          confidence,
        });
      }
    }

    return {
      scanned: true,
      filesAnalyzed,
      issuesFound: improvements.length,
      improvements,
      knowledge,
    };
  } catch (err) {
    return {
      scanned: false,
      filesAnalyzed: 0,
      issuesFound: 0,
      improvements: [],
      knowledge: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Scan local source files for TODO/FIXME/HACK markers.
 * Returns improvement tasks derived from code comments.
 */
export async function scanTodos(codebasePath: string): Promise<ScanResult> {
  const absPath = resolve(codebasePath);
  const improvements: ImprovementTask[] = [];

  try {
    // Use grep to find TODO/FIXME/HACK across .ts/.tsx files
    // grep returns exit code 1 when no matches (not an error)
    let grepOutput = '';
    try {
      grepOutput = execSync(
        `grep -rn --include="*.ts" --include="*.tsx" -E "(TODO|FIXME|HACK):" "${absPath}"`,
        { encoding: 'utf-8', timeout: 10_000, maxBuffer: 1024 * 1024 }
      );
    } catch (grepErr: unknown) {
      // grep exits 1 when no matches — that's fine
      const execErr = grepErr as { status?: number; stdout?: string };
      if (execErr.status === 1) {
        grepOutput = execErr.stdout || '';
      } else {
        throw grepErr;
      }
    }

    const lines = grepOutput.split('\n').filter(Boolean);

    for (const line of lines) {
      // Format: filepath:linenum:content
      const match = line.match(/^(.+?):(\d+):(.+)$/);
      if (!match) continue;

      const [, filePath, lineStr, content] = match;
      const lineNum = parseInt(lineStr, 10);
      const trimmed = content.trim();

      // Extract the marker type
      const isFixme = trimmed.includes('FIXME');
      const isHack = trimmed.includes('HACK');

      // Extract the comment text after the marker
      const markerMatch = trimmed.match(/(?:TODO|FIXME|HACK):\s*(.+)/);
      const commentText = markerMatch ? markerMatch[1].trim() : trimmed;

      // Relativize path for readability
      const relPath = filePath.replace(absPath, '').replace(/^[\\/]/, '');

      improvements.push({
        title: commentText.slice(0, 120),
        description: `${isFixme ? 'FIXME' : isHack ? 'HACK' : 'TODO'} in ${relPath}:${lineNum}`,
        priority: isFixme ? 1 : isHack ? 2 : 3,
        category: categorizeContent(commentText),
        file: relPath,
        line: lineNum,
      });
    }

    return {
      scanned: true,
      filesAnalyzed: lines.length,
      issuesFound: improvements.length,
      improvements,
      knowledge: [],
    };
  } catch (err) {
    return {
      scanned: false,
      filesAnalyzed: 0,
      issuesFound: 0,
      improvements: [],
      knowledge: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Categorize content into an improvement category based on keywords. */
function categorizeContent(content: string): ImprovementTask['category'] {
  const lower = content.toLowerCase();
  if (lower.includes('test') || lower.includes('coverage') || lower.includes('spec')) return 'test';
  if (lower.includes('perf') || lower.includes('slow') || lower.includes('optim'))
    return 'performance';
  if (lower.includes('doc') || lower.includes('readme') || lower.includes('comment')) return 'docs';
  if (lower.includes('type') || lower.includes('any') || lower.includes('cast'))
    return 'type-safety';
  return 'refactor';
}
