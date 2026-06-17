/**
 * On-task cognitive verbs — the edge executor (Phase 2.2).
 *
 * A brain's `behavior on_task { … }` block parses into an ordered sequence of
 * cognitive verbs (brain.ts extractOnTaskActions). The lightweight AgentRunner
 * executes them WITHOUT a @holoscript/core / engine dependency — provider + mesh
 * only — so the edge package keeps its clean publish dep-closure:
 *
 *   - `llm_call { prompt }`   → append the prompt as a domain directive (was the
 *                               only wired verb before this; W.736).
 *   - `rag_query { query }`   → retrieve from TEAM knowledge → inject as context.
 *   - `recall { query }`      → retrieve from the agent's PRIVATE workspace →
 *                               filter by query client-side → inject.
 *   - `plan { goal|prompt }`  → one provider call producing a short plan → inject.
 *
 * Each verb is best-effort: a retrieval/plan failure is logged and skipped, never
 * breaking the tick. The verbs run in authored order and their outputs accumulate
 * onto the system prompt the tool-loop sees. `reflect` is handled separately
 * (post-artifact gate in runner.ts), not here.
 *
 * @module holoscript-agent/cognitive-verbs
 */
import type { KnowledgeEntry } from './holomesh-client.js';
import type { OnTaskAction } from './types.js';

export interface CognitiveVerbDeps {
  /** The brain's base system prompt to augment. */
  systemPrompt: string;
  /** Parsed `behavior on_task` verbs, in authored order. */
  onTaskActions: OnTaskAction[];
  /** Task being executed (for `plan` goal fallback + logging). */
  task: { id: string; title: string };
  /** TEAM knowledge retrieval (rag_query, keyword/semantic). */
  queryTeamKnowledge: (query: string, limit: number) => Promise<KnowledgeEntry[]>;
  /**
   * Codebase GraphRAG semantic search (rag_query Phase 2.3, W.753).
   * Optional — when absent OR it returns [] (graph not loaded), rag_query falls
   * back to team-knowledge search. Wires the in-process HoloEmbed index via the
   * bearer-gated mesh route POST /api/holomesh/codebase/search.
   */
  queryCodebase?: (query: string, topK: number) => Promise<Array<{ name: string; file: string; line?: number; type: string; score: number; signature?: string | null }>>;
  /** PRIVATE workspace retrieval (recall). */
  queryPrivateKnowledge: () => Promise<KnowledgeEntry[]>;
  /** One-shot provider planner (plan). Optional — when absent, `plan` is skipped. */
  plan?: (prompt: string) => Promise<string>;
  /**
   * Embed text for SEMANTIC `recall` (the fleet nomic model). Optional — when absent
   * OR it returns null (no fleet/registry reachable), `recall` falls back to the
   * substring filter. Pairs with `similarity`. (W.753: recall should rank via the
   * semantic stack, not keyword-match the private workspace.)
   */
  embed?: (text: string) => Promise<number[] | null>;
  /** Cosine similarity for ranking recalled entries (required alongside `embed`). */
  similarity?: (a: number[], b: number[]) => number;
  /** Structured logger. */
  log: (ev: Record<string, unknown>) => void;
}

const DEFAULT_LIMIT = 5;
/** Cap injected context so the edge model's num_ctx isn't blown (qwen3:4b). */
const MAX_ENTRY_CHARS = 320;
const MAX_INJECTED_CHARS = 2400;
/** Cap entries embedded per recall so a large private store can't stall a tick. */
const MAX_RECALL_EMBED = 40;

function strField(config: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = config[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function numField(config: Record<string, unknown>, key: string, fallback: number): number {
  const v = config[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function formatEntries(entries: KnowledgeEntry[]): string {
  let out = '';
  for (const e of entries) {
    const line = `- ${(e.content ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ENTRY_CHARS)}`;
    if (out.length + line.length > MAX_INJECTED_CHARS) break;
    out += (out ? '\n' : '') + line;
  }
  return out;
}

/**
 * Execute a brain's on_task cognitive verbs and return the augmented system
 * prompt the tool-loop should use. Pure-ish: all I/O is injected via deps.
 */
export async function augmentWithOnTaskCognition(deps: CognitiveVerbDeps): Promise<string> {
  let content = deps.systemPrompt;
  if (!deps.onTaskActions || deps.onTaskActions.length === 0) return content;

  for (const action of deps.onTaskActions) {
    try {
      switch (action.verb) {
        case 'llm_call': {
          const prompt = strField(action.config, 'prompt');
          if (prompt) {
            content += `\n\n[Brain on_task directive]\n${prompt}`;
            deps.log({ ev: 'on-task-llm-call', taskId: deps.task.id, promptLen: prompt.length });
          }
          break;
        }
        case 'rag_query': {
          const query = strField(action.config, 'query', 'q') || deps.task.title;
          const limit = numField(action.config, 'limit', DEFAULT_LIMIT);
          // Phase 2.3 (W.753): try codebase GraphRAG (in-process HoloEmbed via the mesh bearer
          // route) first — returns ranked symbols (name/file/score). Falls back to team-knowledge
          // search when the graph isn't loaded or the dep isn't wired.
          let mode = 'team-knowledge';
          let injected = '';
          if (deps.queryCodebase) {
            const symbols = await deps.queryCodebase(query, limit);
            if (symbols.length > 0) {
              mode = 'codebase-graphrag';
              const lines = symbols
                .slice(0, limit)
                .map(
                  (s) =>
                    `- ${s.name} (${s.type}) ${s.file}${s.line != null ? `:${s.line}` : ''}` +
                    (s.signature ? ` — ${s.signature.slice(0, 80)}` : '') +
                    ` [score:${s.score.toFixed(2)}]`
                )
                .join('\n');
              injected = `\n\n[Codebase search for "${query}"]\n${lines}`;
            }
          }
          if (!injected) {
            // Fallback: team knowledge store (already semantic via HoloEmbed ranking, bb28ecc25).
            const entries = await deps.queryTeamKnowledge(query, limit);
            if (entries.length > 0) {
              injected = `\n\n[Retrieved knowledge for "${query}"]\n${formatEntries(entries)}`;
            }
          }
          if (injected) content += injected;
          deps.log({ ev: 'on-task-rag-query', taskId: deps.task.id, query, mode, retrieved: injected ? limit : 0 });
          break;
        }
        case 'recall': {
          const query = strField(action.config, 'query', 'q');
          const limit = numField(action.config, 'limit', DEFAULT_LIMIT);
          const all = await deps.queryPrivateKnowledge();
          let matched: KnowledgeEntry[] | null = null;
          let mode = 'substring';
          // SEMANTIC recall (W.753): rank the private workspace by embedding-cosine
          // when an embed route resolves. Best-effort — any miss (no embed dep, fleet
          // unreachable, null vectors) drops to the substring filter below; never breaks the tick.
          if (deps.embed && deps.similarity && query && all.length > 0) {
            const qv = await deps.embed(query);
            if (qv) {
              const scored: Array<{ e: KnowledgeEntry; score: number }> = [];
              for (const e of all.slice(0, MAX_RECALL_EMBED)) {
                const ev = await deps.embed(e.content ?? '');
                if (ev) scored.push({ e, score: deps.similarity(qv, ev) });
              }
              if (scored.length > 0) {
                scored.sort((a, b) => b.score - a.score);
                matched = scored.slice(0, limit).map((s) => s.e);
                mode = 'semantic';
              }
            }
          }
          if (!matched) {
            const needle = query.toLowerCase();
            matched = (
              needle
                ? all.filter((e) => `${e.id ?? ''} ${e.content ?? ''}`.toLowerCase().includes(needle))
                : all
            ).slice(0, limit);
          }
          if (matched.length > 0) {
            content += `\n\n[Recalled memory${query ? ` for "${query}"` : ''}]\n${formatEntries(matched)}`;
          }
          deps.log({ ev: 'on-task-recall', taskId: deps.task.id, query, recalled: matched.length, mode });
          break;
        }
        case 'plan': {
          if (!deps.plan) break;
          const goal = strField(action.config, 'goal', 'prompt', 'of') || deps.task.title;
          const planText = await deps.plan(
            `Produce a short numbered plan (max 6 steps) to accomplish this task. Be concrete and specific to the goal; do not execute it.\n\nGoal: ${goal}`
          );
          const trimmed = planText.trim().slice(0, MAX_INJECTED_CHARS);
          if (trimmed) {
            content += `\n\n[Plan]\n${trimmed}`;
            deps.log({ ev: 'on-task-plan', taskId: deps.task.id, planLen: trimmed.length });
          }
          break;
        }
        // `reflect` is handled post-artifact in runner.ts, not here.
        default:
          break;
      }
    } catch (err) {
      deps.log({
        ev: 'on-task-verb-error',
        taskId: deps.task.id,
        verb: action.verb,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return content;
}
