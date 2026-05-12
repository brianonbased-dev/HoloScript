/**
 * MCP Tool: holo_task_kolmogorov_score
 *
 * Scores task-routing decisions using a Solomonoff-prior-inspired
 * Kolmogorov-complexity proxy.
 *
 * Source authority: W.507 (research/2026-05-12_difficulty-and-luck-p-vs-np.md):
 *   "Kolmogorov complexity makes luck precise. K(x) = shortest program.
 *    Solomonoff prior 2^(-K) is optimal least-biased. Luck = program length.
 *    Implication: information-theoretic agent priors should follow Kolmogorov /
 *    minimum-description-length, not uniform random."
 *
 * Intuition: an agent whose context "compresses" a task description well is a
 * better routing target than one whose context is unrelated. We approximate
 * Kolmogorov complexity (uncomputable) with a tractable MDL proxy:
 *
 *   baseline := gzip(taskDescription)
 *   mdl      := gzip(taskDescription, dict = recentDoneEntries.join('\n'))
 *   ratio    := mdl.length / baseline.length         (0..1, ~1 means no benefit)
 *   score    := 1 - ratio                            (higher is better fit)
 *
 * Limitations: gzip-with-dictionary is a small fixed-window LZ77 + Huffman
 * substitute for Solomonoff's universal prior. It captures lexical and
 * short-phrase overlap, not deep semantic structure. See the scoping doc at
 * ai-ecosystem/research/2026-05-12_kolmogorov-task-score-mcp.md for the formal
 * MDL definition, alternatives considered, and calibration boundaries.
 */

import { gzipSync, constants as zlibConstants } from 'node:zlib';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// ─── Public types ───────────────────────────────────────────────────────────

export interface AgentContext {
  /** Recent done-log entries for this agent. Each entry is a free-form string. */
  recentDoneEntries: string[];
  /**
   * Optional capability tags (e.g. `['security-audit', 'lean4']`). Concatenated
   * to the agent dictionary with newline separators so they participate in
   * dictionary-based compression alongside done-log entries.
   */
  capabilityTags?: string[];
}

export interface KolmogorovScoreInput {
  taskDescription: string;
  agentContext: AgentContext;
}

export interface KolmogorovScoreResult {
  /** Higher means agent's context compresses this task better. Range: typically [0, ~0.5]. */
  score: number;
  /** Bytes after gzip with agent-conditioned dictionary. */
  mdlBytes: number;
  /** Bytes after gzip with no dictionary. */
  baselineBytes: number;
  /** mdlBytes / baselineBytes. 1.0 means no agent-conditioned benefit. */
  ratio: number;
}

// ─── Pure function ──────────────────────────────────────────────────────────

const GZIP_OPTS = {
  level: zlibConstants.Z_BEST_COMPRESSION,
};

/**
 * Solomonoff-prior-inspired MDL proxy for task-routing fit.
 *
 * Contract:
 *   - Empty `taskDescription` returns `{ score: 0, mdlBytes: 0, baselineBytes: 0, ratio: 0 }`.
 *   - Empty `recentDoneEntries` + empty `capabilityTags` makes the dictionary
 *     empty; mdlBytes will be >= baselineBytes (gzip with empty dictionary is
 *     effectively the baseline), so `score` is approximately 0 (may be slightly
 *     negative due to header overhead from priming — clamped to 0).
 *   - Score is monotonic non-decreasing in the amount of relevant overlap
 *     present in the dictionary (more matching entries → better compression
 *     → higher score), modulo gzip-window saturation (32 KB).
 */
export function holoTaskKolmogorovScore(
  input: KolmogorovScoreInput
): KolmogorovScoreResult {
  const taskDescription = typeof input?.taskDescription === 'string' ? input.taskDescription : '';

  if (taskDescription.length === 0) {
    return { score: 0, mdlBytes: 0, baselineBytes: 0, ratio: 0 };
  }

  const agentContext = input?.agentContext ?? { recentDoneEntries: [] };
  const recentDoneEntries = Array.isArray(agentContext.recentDoneEntries)
    ? agentContext.recentDoneEntries.filter((s): s is string => typeof s === 'string')
    : [];
  const capabilityTags = Array.isArray(agentContext.capabilityTags)
    ? agentContext.capabilityTags.filter((s): s is string => typeof s === 'string')
    : [];

  const dictionaryParts: string[] = [];
  if (capabilityTags.length > 0) dictionaryParts.push(capabilityTags.join(' '));
  if (recentDoneEntries.length > 0) dictionaryParts.push(recentDoneEntries.join('\n'));
  const dictionary = dictionaryParts.join('\n');

  // Baseline: compress task description with NO dictionary priming.
  const taskBuf = Buffer.from(taskDescription, 'utf-8');
  const baselineBytes = gzipSync(taskBuf, GZIP_OPTS).length;

  // Agent-conditioned MDL: prepend dictionary then compress the same input.
  // We compress the concatenation, then subtract the cost of the dictionary alone.
  // This gives the *marginal* cost of the task under agent context — the MDL
  // proxy for K(task | agent_context).
  let mdlBytes: number;
  if (dictionary.length === 0) {
    // No dictionary → MDL collapses to baseline.
    mdlBytes = baselineBytes;
  } else {
    const dictBuf = Buffer.from(dictionary, 'utf-8');
    // Separator newline so the task starts on its own line (helps LZ77 boundary).
    const sepBuf = Buffer.from('\n', 'utf-8');
    const joinedBytes = gzipSync(
      Buffer.concat([dictBuf, sepBuf, taskBuf]),
      GZIP_OPTS
    ).length;
    const dictAloneBytes = gzipSync(dictBuf, GZIP_OPTS).length;
    // Marginal bytes added by appending the task to the agent's dictionary.
    // Clamp to >= 1 to avoid div-by-zero pathology if the task is wholly
    // contained in the dictionary.
    mdlBytes = Math.max(1, joinedBytes - dictAloneBytes);
  }

  const ratio = mdlBytes / baselineBytes;
  // Score: positive means agent context helped compress; clamp to [-1, 1] for sanity,
  // and floor at 0 because negative scores (mdl > baseline by a thin gzip-header margin)
  // are noise, not signal.
  const rawScore = 1 - ratio;
  const score = rawScore < 0 ? 0 : rawScore;

  return { score, mdlBytes, baselineBytes, ratio };
}

// ─── MCP tool registration ──────────────────────────────────────────────────

export const kolmogorovTaskScoreTools: Tool[] = [
  {
    name: 'holo_task_kolmogorov_score',
    description:
      'Score how well an agent fits a task using a Solomonoff-prior-inspired ' +
      'Kolmogorov-complexity / MDL proxy (W.507). Returns score (higher = better fit), ' +
      'baseline gzip bytes for the task, agent-conditioned gzip bytes, and their ratio. ' +
      'Use to rank candidate agents for task routing, or to detect when no agent on the ' +
      'team has dictionary overlap with a new task (score ≈ 0 across all candidates = ' +
      'capability gap).',
    inputSchema: {
      type: 'object',
      properties: {
        taskDescription: {
          type: 'string',
          description: 'The task description to score (e.g. board task title + body).',
        },
        agentContext: {
          type: 'object',
          description: 'The candidate agent\'s context — done-log entries and optional capability tags.',
          properties: {
            recentDoneEntries: {
              type: 'array',
              items: { type: 'string' },
              description: 'Recent done-log entries for this agent (most recent first works fine; order is not load-bearing).',
            },
            capabilityTags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional capability tags (e.g. ["security-audit", "lean4"]).',
            },
          },
          required: ['recentDoneEntries'],
        },
      },
      required: ['taskDescription', 'agentContext'],
    },
  },
];

export async function handleKolmogorovTaskScoreTool(
  name: string,
  args: Record<string, unknown>
): Promise<KolmogorovScoreResult | null> {
  if (name !== 'holo_task_kolmogorov_score') return null;

  const taskDescription =
    typeof args.taskDescription === 'string' ? args.taskDescription : '';
  const rawContext = isRecord(args.agentContext) ? args.agentContext : {};
  const recentDoneEntries = Array.isArray(rawContext.recentDoneEntries)
    ? (rawContext.recentDoneEntries as unknown[]).filter(
        (s): s is string => typeof s === 'string'
      )
    : [];
  const capabilityTags = Array.isArray(rawContext.capabilityTags)
    ? (rawContext.capabilityTags as unknown[]).filter(
        (s): s is string => typeof s === 'string'
      )
    : undefined;

  return holoTaskKolmogorovScore({
    taskDescription,
    agentContext: { recentDoneEntries, capabilityTags },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
