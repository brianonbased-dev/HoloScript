import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { handleCodebaseTool } from '@holoscript/absorb-service/mcp';

export const absorbProvenanceTools: Tool[] = [
  {
    name: 'absorb_provenance_answer',
    description:
      'Answer a codebase question using Absorb and attach deterministic provenance metadata (evidence hash + citations + timestamp).',
    inputSchema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Natural language question about the codebase.',
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

export async function handleAbsorbProvenanceTool(
  name: string,
  args: Record<string, unknown>,
  resolver?: (question: string) => Promise<unknown>
): Promise<unknown | null> {
  if (name !== 'absorb_provenance_answer') return null;

  const question = typeof args.question === 'string' ? args.question.trim() : '';
  if (!question) throw new Error('question is required');

  const raw = resolver
    ? await resolver(question)
    : await handleCodebaseTool('holo_ask_codebase', { question });

  const citations = extractCitations(raw);
  const answer = extractAnswer(raw);
  const generatedAt = Date.now();

  const evidenceHash = fnv1a(
    JSON.stringify(
      canonical({
        question,
        answer,
        citations,
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
  };

  return {
    success: true,
    question,
    answer,
    provenance: envelope,
    ...(args.includeRaw === true ? { raw } : {}),
  };
}
