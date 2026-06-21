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
import { groundCitations, annotateGrounding, type GroundingEntry } from './citation-grounding.js';
import { convergeCouncil, renderCouncil } from './council.js';

export interface CognitiveVerbDeps {
  /** The brain's base system prompt to augment. */
  systemPrompt: string;
  /** Parsed `behavior on_task` verbs, in authored order. */
  onTaskActions: OnTaskAction[];
  /** Task being executed (for `plan` goal fallback + logging). */
  task: { id: string; title: string };
  /**
   * Grep the local knowledge JSONL for exact keyword/path matches (fast, direct).
   * Optional — no-op when HOLOSCRIPT_AGENT_LOCAL_KNOWLEDGE_PATH is unset.
   * Runs as stage 1 of rag_query; results injected before Absorb semantic results.
   */
  queryGrep?: (query: string, limit: number) => Promise<KnowledgeEntry[]>;
  /**
   * Direct Absorb GraphRAG query (rag_query W.754 — semantic search).
   * Optional — no-op when HOLOSCRIPT_AGENT_ABSORB_* env vars are absent.
   * Runs as stage 2 of rag_query alongside grep (both inject if they return results).
   */
  queryAbsorb?: (query: string, limit: number) => Promise<KnowledgeEntry[]>;
  /** @deprecated No longer called in rag_query — replaced by grep + Absorb. */
  queryTeamKnowledge?: (query: string, limit: number) => Promise<KnowledgeEntry[]>;
  /** @deprecated No longer called in rag_query — replaced by grep + Absorb. */
  queryCodebase?: (query: string, topK: number) => Promise<Array<{ name: string; file: string; line?: number; type: string; score: number; signature?: string | null }>>;
  /** PRIVATE workspace retrieval (recall). */
  queryPrivateKnowledge: () => Promise<KnowledgeEntry[]>;
  /** One-shot provider planner (plan). Optional — when absent, `plan` is skipped. */
  plan?: (prompt: string) => Promise<string>;
  /**
   * Consult a PEER for the `ask_peer` cognitive verb — agent-to-agent questioning,
   * the reasoning substrate (D.100 keystone: "agents asking agents questions IS
   * reasoning"). Resolves a peer (by `capability` or explicit `peer` handle), asks
   * the question, returns its answer + which peer answered. Optional — when absent,
   * `ask_peer` is skipped (mirrors `plan`). The answer is run through the CITE-by-ID
   * grounding gate before injection, so a confabulating peer is caught structurally
   * regardless of which model answered.
   */
  askPeer?: (
    question: string,
    opts: { capability?: string; peer?: string; lens?: string }
  ) => Promise<{ answer: string; peer: string } | null>;
  /**
   * Resolve the knowledge corpus the grounding gate checks peer citations against
   * (typically the agent's accessible knowledge entries). Optional — when absent,
   * grounding runs against an empty corpus (fail-closed: every citation unverified).
   */
  groundingCorpus?: () => Promise<GroundingEntry[]>;
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
          const sources: string[] = [];
          // Stage 1: grep/direct path search — fast exact keyword match against local JSONL.
          if (deps.queryGrep) {
            const hits = await deps.queryGrep(query, limit);
            if (hits.length > 0) {
              content += `\n\n[Grep results for "${query}"]\n${formatEntries(hits)}`;
              sources.push('grep');
            }
          }
          // Stage 2: Absorb GraphRAG — semantic enrichment (W.754).
          if (deps.queryAbsorb) {
            const absorb = await deps.queryAbsorb(query, limit);
            if (absorb.length > 0) {
              content += `\n\n[Absorb knowledge for "${query}"]\n${formatEntries(absorb)}`;
              sources.push('absorb-graphrag');
            }
          }
          deps.log({ ev: 'on-task-rag-query', taskId: deps.task.id, query, sources, retrieved: sources.length > 0 ? limit : 0 });
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
        case 'ask_peer': {
          if (!deps.askPeer) break;
          const question =
            strField(action.config, 'question', 'q', 'ask', 'of') || deps.task.title;
          const capability = strField(action.config, 'capability', 'cap');
          const peer = strField(action.config, 'peer', 'handle', 'to');
          // Default ON: a peer that cites invented IDs is the exact 4B failure mode
          // (D.100). Brains opt OUT with `require_grounding: false` to keep an
          // answer whose citations don't resolve (e.g. a peer with no shared corpus).
          const requireGrounding =
            action.config.require_grounding !== false &&
            action.config.requireGrounding !== false;
          const result = await deps.askPeer(question, {
            capability: capability || undefined,
            peer: peer || undefined,
          });
          if (!result || !result.answer.trim()) {
            deps.log({ ev: 'on-task-ask-peer', taskId: deps.task.id, question, answered: false });
            break;
          }
          const corpus = deps.groundingCorpus ? await deps.groundingCorpus() : [];
          const grounding = groundCitations(result.answer, corpus);
          // GATE: when grounding is required and the peer cited sources but NONE
          // resolve, the answer is confabulation — reject it (do not inject).
          if (
            requireGrounding &&
            grounding.citations.length > 0 &&
            grounding.grounded.length === 0
          ) {
            deps.log({
              ev: 'on-task-ask-peer',
              taskId: deps.task.id,
              question,
              peer: result.peer,
              answered: true,
              rejected: true,
              citationsConfabulated: grounding.confabulated.length,
            });
            break;
          }
          const annotated = annotateGrounding(result.answer, grounding).slice(0, MAX_INJECTED_CHARS);
          content += `\n\n[Peer answer from ${result.peer} re "${question}"]\n${annotated}`;
          deps.log({
            ev: 'on-task-ask-peer',
            taskId: deps.task.id,
            question,
            peer: result.peer,
            answered: true,
            citationsGrounded: grounding.grounded.length,
            citationsConfabulated: grounding.confabulated.length,
          });
          break;
        }
        case 'council': {
          if (!deps.askPeer) break;
          const question =
            strField(action.config, 'question', 'q', 'ask', 'of') || deps.task.title;
          const capability = strField(action.config, 'capability', 'cap');
          const seats = Math.max(2, Math.min(5, numField(action.config, 'seats', 3)));
          const requireGrounding =
            action.config.require_grounding !== false &&
            action.config.requireGrounding !== false;
          // Diverse lenses make N seats genuinely question from different angles
          // (the adversarial-verify pattern) even on a single node; with a real peer
          // endpoint each seat is also a different sovereign node.
          const LENSES = ['correctness', 'skeptic', 'completeness', 'feasibility', 'risk'];
          const collected: Array<{ peer: string; answer: string }> = [];
          for (let i = 0; i < seats; i++) {
            const lens = LENSES[i % LENSES.length];
            const r = await deps.askPeer(question, { capability: capability || undefined, lens });
            if (r && r.answer.trim()) collected.push({ peer: `${r.peer}/${lens}`, answer: r.answer });
          }
          if (collected.length === 0) {
            deps.log({ ev: 'on-task-council', taskId: deps.task.id, question, seats: 0 });
            break;
          }
          const corpus = deps.groundingCorpus ? await deps.groundingCorpus() : [];
          const conv = convergeCouncil(collected, corpus);
          // GATE: grounding required, nothing verified by ANY seat, yet citations were
          // made → the whole council confabulated. Reject (do not inject).
          if (
            requireGrounding &&
            conv.corroborated.length === 0 &&
            conv.singleSource.length === 0 &&
            conv.confabulated.length > 0
          ) {
            deps.log({
              ev: 'on-task-council',
              taskId: deps.task.id,
              question,
              seats: collected.length,
              rejected: true,
              confabulated: conv.confabulated.length,
            });
            break;
          }
          content += '\n\n' + renderCouncil(question, conv).slice(0, MAX_INJECTED_CHARS * 2);
          deps.log({
            ev: 'on-task-council',
            taskId: deps.task.id,
            question,
            seats: collected.length,
            corroborated: conv.corroborated.length,
            singleSource: conv.singleSource.length,
            confabulated: conv.confabulated.length,
          });
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
