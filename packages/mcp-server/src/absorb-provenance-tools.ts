import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { handleCodebaseTool } from '@holoscript/absorb-service/mcp';

/** Oldest knowledge entry newer than this → staleness `fresh` (vs `stale`). */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

export const absorbProvenanceTools: Tool[] = [
  {
    name: 'absorb_provenance_answer',
    description:
      'Answer a codebase question using Absorb and attach deterministic provenance metadata (evidence hash, orchestrator graph snapshot id, optional CI commit id, staleness, citations + timestamp).',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Natural language question about the codebase.',
        },
        workspaceId: {
          type: 'string',
          description:
            'Orchestrator workspace id for GraphRAG knowledge grounding (default: ai-ecosystem).',
        },
        includeRaw: {
          type: 'boolean',
          description: 'Include the raw absorb response payload for debugging.',
        },
      },
      required: ['question'],
    },
  },
];

export interface ProvenanceEnvelope {
  source: 'absorb-service';
  tool: string;
  generatedAt: number;
  evidenceHash: string;
  citations: Array<{ file?: string; symbol?: string; snippet?: string }>;
  /** Fingerprint of the orchestrator knowledge slice used for GraphRAG grounding. */
  graphSnapshotId: string;
  /** Git commit of the HoloScript deployment/repo when set in CI (VERCEL_GIT_COMMIT_SHA, GITHUB_SHA, GIT_COMMIT). */
  graphCommitId?: string;
  /** Whether grounding knowledge is still within the freshness window. */
  staleness: 'fresh' | 'stale' | 'unknown';
  /** ISO time of the newest knowledge entry in the orchestrator slice (if any). */
  knowledgeAsOf?: string;
}

function fnv1a(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `absorb-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

function canonical(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => canonical(v));
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj).sort()) out[k] = canonical(obj[k]);
  return out;
}

function toSafeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function extractCitations(raw: unknown): ProvenanceEnvelope['citations'] {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as Record<string, unknown>;

  const direct = obj.citations;
  if (Array.isArray(direct)) {
    return direct.slice(0, 20).map((c) => {
      if (!c || typeof c !== 'object') return {};
      const co = c as Record<string, unknown>;
      return {
        file: typeof co.file === 'string' ? co.file : undefined,
        symbol: typeof co.symbol === 'string' ? co.symbol : undefined,
        snippet: typeof co.snippet === 'string' ? co.snippet : undefined,
      };
    });
  }

  const chunks = obj.results;
  if (Array.isArray(chunks)) {
    return chunks.slice(0, 20).map((r) => {
      if (!r || typeof r !== 'object') return {};
      const ro = r as Record<string, unknown>;
      return {
        file: typeof ro.path === 'string' ? ro.path : typeof ro.file === 'string' ? ro.file : undefined,
        symbol: typeof ro.symbol === 'string' ? ro.symbol : undefined,
        snippet: typeof ro.snippet === 'string' ? ro.snippet : undefined,
      };
    });
  }

  return [];
}

function extractAnswer(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return toSafeString(raw);
  const obj = raw as Record<string, unknown>;
  if (typeof obj.answer === 'string') return obj.answer;
  if (typeof obj.response === 'string') return obj.response;
  if (typeof obj.summary === 'string') return obj.summary;
  return toSafeString(raw);
}

interface OrchestratorKnowledgeRow {
  id?: string;
  type?: string;
  content?: string;
  created_at?: string;
  metadata?: { provenanceHash?: string; domain?: string };
}

function resolveGraphCommitId(): string | undefined {
  const v =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.GIT_COMMIT ||
    process.env.COMMIT_SHA;
  return typeof v === 'string' && v.length >= 7 ? v : undefined;
}

/**
 * Queries the MCP orchestrator knowledge store (same path as absorb-scanner / framework KnowledgeStore remote mode).
 */
export async function fetchOrchestratorGraphContext(
  search: string,
  workspaceId?: string
): Promise<{
  graphSnapshotId: string;
  staleness: 'fresh' | 'stale' | 'unknown';
  knowledgeAsOf?: string;
}> {
  const apiKey = process.env.HOLOMESH_API_KEY || process.env.HOLOSCRIPT_API_KEY || '';
  if (!search.trim() || !apiKey) {
    return { graphSnapshotId: fnv1a(`${search}|no-orchestrator`), staleness: 'unknown' };
  }

  const baseUrl = (
    process.env.MCP_ORCHESTRATOR_URL || 'https://mcp-orchestrator-production-45f9.up.railway.app'
  ).replace(/\/$/, '');
  const ws = workspaceId || process.env.HOLOSCRIPT_WORKSPACE_ID || 'ai-ecosystem';

  try {
    const res = await fetch(`${baseUrl}/knowledge/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-mcp-api-key': apiKey,
      },
      body: JSON.stringify({
        search: search.slice(0, 500),
        limit: 20,
        workspace_id: ws,
      }),
      signal: AbortSignal.timeout(12_000),
    });

    if (!res.ok) {
      return { graphSnapshotId: fnv1a(`${search}|query-${res.status}`), staleness: 'unknown' };
    }

    const data = (await res.json()) as { results?: OrchestratorKnowledgeRow[]; entries?: OrchestratorKnowledgeRow[] };
    const rows = data.results || data.entries || [];
    if (rows.length === 0) {
      return {
        graphSnapshotId: fnv1a(`${ws}|empty|${search}`),
        staleness: 'unknown',
      };
    }

    const now = Date.now();
    const fingerprints = rows
      .map((r) => {
        const id = r.id || '';
        const ph = r.metadata?.provenanceHash || '';
        const created = r.created_at || '';
        return `${id}|${ph}|${created}`;
      })
      .sort();
    const graphSnapshotId = fnv1a(`${ws}|${fingerprints.join(';')}`);

    const times = rows
      .map((r) => {
        const t = r.created_at ? Date.parse(r.created_at) : NaN;
        return Number.isFinite(t) ? t : now;
      })
      .sort((a, b) => a - b);
    const oldest = times[0]!;
    const newest = times[times.length - 1]!;

    const staleness: 'fresh' | 'stale' = now - oldest > STALE_AFTER_MS ? 'stale' : 'fresh';

    return {
      graphSnapshotId,
      staleness,
      knowledgeAsOf: new Date(newest).toISOString(),
    };
  } catch {
    return { graphSnapshotId: fnv1a(`${search}|orchestrator-error`), staleness: 'unknown' };
  }
}

export async function handleAbsorbProvenanceTool(
  name: string,
  args: Record<string, unknown>,
  resolver?: (question: string) => Promise<unknown>
): Promise<unknown | null> {
  if (name !== 'absorb_provenance_answer') return null;

  const question = typeof args.question === 'string' ? args.question.trim() : '';
  if (!question) throw new Error('question is required');

  const workspaceId = typeof args.workspaceId === 'string' ? args.workspaceId.trim() : undefined;

  const raw = resolver
    ? await resolver(question)
    : await handleCodebaseTool('holo_ask_codebase', { question });

  const citations = extractCitations(raw);
  const answer = extractAnswer(raw);
  const generatedAt = Date.now();

  const orch = await fetchOrchestratorGraphContext(question, workspaceId);
  const graphCommitId = resolveGraphCommitId();

  const evidenceHash = fnv1a(
    JSON.stringify(
      canonical({
        question,
        answer,
        citations,
        graphSnapshotId: orch.graphSnapshotId,
        staleness: orch.staleness,
        knowledgeAsOf: orch.knowledgeAsOf,
        graphCommitId: graphCommitId ?? null,
        raw,
      })
    )
  );

  const envelope: ProvenanceEnvelope = {
    source: 'absorb-service',
    tool: 'holo_ask_codebase',
    generatedAt,
    evidenceHash,
    citations,
    graphSnapshotId: orch.graphSnapshotId,
    graphCommitId,
    staleness: orch.staleness,
    knowledgeAsOf: orch.knowledgeAsOf,
  };

  return {
    success: true,
    question,
    answer,
    provenance: envelope,
    ...(args.includeRaw === true ? { raw } : {}),
  };
}
