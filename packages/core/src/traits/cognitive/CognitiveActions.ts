/**
 * Cognitive Actions — first-class agent-cognition primitives for HoloScript brains.
 *
 * The HoloScript language has long had rich primitives for control-flow and
 * state (sequence/selector/state/transition/@when), but the *cognitive*
 * operations that ARE agent intelligence — calling an LLM, recalling a memory,
 * querying a knowledge base, planning, self-evaluating — were only expressible
 * as opaque free-form action STRINGS dispatched to hand-written TS handlers.
 * Every brain therefore maintained two artifacts: the `.hsplus` behavior and a
 * parallel TS action-handler map. The real cognitive traits (LLMAgentTrait,
 * AgentMemoryTrait, RAGKnowledgeTrait, GoalOrientedTrait) were fully built yet
 * UNREACHABLE from the authoring surface.
 *
 * This module makes those operations first-class:
 *   - A typed {@link HoloCognitiveAction} AST node (parsed inline from a brain state).
 *   - A single source of truth ({@link COGNITIVE_EVENT_MAP}) mapping each
 *     cognitive verb to the EXISTING trait event it dispatches to, and the
 *     completion event it resolves on.
 *   - {@link compileCognitiveDispatch}, which normalizes an authored config block
 *     into the exact payload shape the target trait's event handler reads.
 *
 * No new inference or model is introduced here. This is pure wiring that lets
 * the language reach cognitive traits that already exist and are registered.
 *
 * Verb → trait event contract (verified against trait emit/consume sites):
 *   llm_call  → emit `llm_prompt`     (LLMAgentTrait), resolves on `llm_message`
 *   recall    → emit `memory_recall`  (AgentMemoryTrait), resolves on `memory_recalled`
 *   rag_query → emit `rag_query`      (RAGKnowledgeTrait), resolves on `on_knowledge_retrieved`
 *   plan      → emit `goap_set_state` (GoalOrientedTrait), resolves on `goap_plan_created`
 *   reflect   → emit `llm_prompt`     (LLMAgentTrait self-evaluation), resolves on `llm_message`
 *
 * @version 1.0.0
 */

/** The five first-class cognitive verbs an author can write inline in a brain state. */
export type CognitiveVerb = 'llm_call' | 'recall' | 'rag_query' | 'plan' | 'reflect';

/** Canonical ordered list of cognitive verbs (SSOT for parser/linter/LSP vocabulary). */
export const COGNITIVE_VERBS: readonly CognitiveVerb[] = [
  'llm_call',
  'recall',
  'rag_query',
  'plan',
  'reflect',
] as const;

/** Type guard: is the given identifier one of the cognitive verbs? */
export function isCognitiveVerb(value: string): value is CognitiveVerb {
  return (COGNITIVE_VERBS as readonly string[]).includes(value);
}

/** The `brain` keyword, as an SSOT constant (so the LSP/linter/parser share one definition). */
export const BRAIN_KEYWORD = 'brain' as const;

/** Is the identifier the `brain` keyword? */
export function isBrainKeyword(value: string): boolean {
  return value === BRAIN_KEYWORD;
}

/** Cognitive trait names a brain composition wires (the runtime side of the verbs). */
export const AI_TRAIT_NAMES: readonly string[] = [
  'llm_agent',
  'ai_npc_brain',
  'agent_memory',
  'rag_knowledge',
  'goal_oriented',
  'perception',
  'behavior_tree',
] as const;

/** Levenshtein edit distance (small strings — keyword typo detection). */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * Returns the cognitive verb most similar to `value` within a small edit
 * distance (a typo / near-miss), or undefined. An exact match returns undefined
 * — that's a real verb handled elsewhere, not a typo.
 */
export function nearestCognitiveVerb(value: string): CognitiveVerb | undefined {
  if (isCognitiveVerb(value)) return undefined;
  let best: CognitiveVerb | undefined;
  let bestDist = Infinity;
  for (const verb of COGNITIVE_VERBS) {
    const d = editDistance(value, verb);
    if (d < bestDist) {
      bestDist = d;
      best = verb;
    }
  }
  // Accept only close near-misses (≤2 edits, and the typo isn't trivially short).
  return best && value.length >= 3 && bestDist <= 2 ? best : undefined;
}

/**
 * A typed cognitive operation authored inline in a brain state, e.g.
 *   state thinking {
 *     llm_call { prompt: "What should I do next?", model: "qwen3.5:4b" }
 *     recall   { query: "prior plans", limit: 5 }
 *   }
 */
export interface HoloCognitiveAction {
  kind: 'cognitive';
  verb: CognitiveVerb;
  /** Raw authored config block, e.g. { prompt, model, tools } for llm_call. */
  config: Record<string, unknown>;
}

/** Binding from a cognitive verb to the trait events it requests and completes on. */
export interface CognitiveEventBinding {
  /** Event the EXISTING trait consumes to begin the operation. */
  request: string;
  /** Event the EXISTING trait emits on completion (used for `await` resolution). */
  complete: string;
  /** Trait that owns this operation (discoverability / docs). */
  trait: string;
}

/** Single source of truth: cognitive verb → real trait event contract. */
export const COGNITIVE_EVENT_MAP: Record<CognitiveVerb, CognitiveEventBinding> = {
  // LLMAgentTrait.onEvent consumes `llm_prompt` (reads event.message); emits `llm_message`.
  llm_call: { request: 'llm_prompt', complete: 'llm_message', trait: 'llm_agent' },
  // AgentMemoryTrait.onEvent consumes `memory_recall` (reads event.payload); emits `memory_recalled`.
  recall: { request: 'memory_recall', complete: 'memory_recalled', trait: 'agent_memory' },
  // RAGKnowledgeTrait.onEvent consumes `rag_query` (reads event.question); emits `on_knowledge_retrieved`.
  rag_query: { request: 'rag_query', complete: 'on_knowledge_retrieved', trait: 'rag_knowledge' },
  // GoalOrientedTrait.onEvent consumes `goap_set_state` (reads event.state → selectGoalAndPlan); emits `goap_plan_created`.
  plan: { request: 'goap_set_state', complete: 'goap_plan_created', trait: 'goal_oriented' },
  // reflect composes a self-evaluation LLM turn — dispatches to LLMAgentTrait; no separate trait.
  reflect: { request: 'llm_prompt', complete: 'llm_message', trait: 'llm_agent' },
};

/** Reverse index: trait completion event → cognitive verb (for await resolution). */
export const COGNITIVE_COMPLETE_TO_VERB: Record<string, CognitiveVerb[]> = (() => {
  const out: Record<string, CognitiveVerb[]> = {};
  for (const verb of COGNITIVE_VERBS) {
    const ev = COGNITIVE_EVENT_MAP[verb].complete;
    (out[ev] ||= []).push(verb);
  }
  return out;
})();

/** Read a string-ish field from a config block with fallbacks. */
function str(config: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = config[k];
    if (typeof v === 'string') return v;
  }
  return '';
}

/**
 * Compile an authored cognitive action into the concrete trait event + payload.
 * The payload field names match exactly what each trait's event handler reads,
 * so the emitted event actuates the real trait — not a stub.
 */
export function compileCognitiveDispatch(
  action: HoloCognitiveAction,
  requestId: string,
  owner: unknown
): { event: string; payload: Record<string, unknown> } {
  const c = action.config || {};
  const binding = COGNITIVE_EVENT_MAP[action.verb];
  const base = { node: owner, owner, requestId };

  switch (action.verb) {
    case 'llm_call':
      // LLMAgentTrait reads event.message
      return { event: binding.request, payload: { ...base, message: str(c, 'prompt', 'message') } };

    case 'reflect': {
      // Reflection = a self-evaluation LLM turn over a prior result against criteria.
      const subject = str(c, 'subject', 'of') || 'the previous action result';
      const criteria = str(c, 'criteria', 'scorer') || 'correctness and completeness';
      return {
        event: binding.request,
        payload: { ...base, message: `Reflect on ${subject}. Evaluate it for: ${criteria}.` },
      };
    }

    case 'recall':
      // AgentMemoryTrait reads event.payload = { query, top_k?, tags?, embedding? }
      return {
        event: binding.request,
        payload: {
          ...base,
          payload: {
            query: str(c, 'query'),
            top_k:
              typeof c.top_k === 'number'
                ? c.top_k
                : typeof c.limit === 'number'
                  ? c.limit
                  : undefined,
            tags: Array.isArray(c.tags) ? c.tags : undefined,
            embedding: Array.isArray(c.embedding) ? c.embedding : undefined,
          },
        },
      };

    case 'rag_query':
      // RAGKnowledgeTrait reads event.question
      return {
        event: binding.request,
        payload: { ...base, question: str(c, 'query', 'question') },
      };

    case 'plan': {
      // GoalOrientedTrait reads event.state (Object.assign into worldState → replan)
      const state =
        (c.state as Record<string, unknown>) ??
        (c.worldState as Record<string, unknown>) ??
        (c.beliefs as Record<string, unknown>) ??
        {};
      return { event: binding.request, payload: { ...base, state } };
    }

    default: {
      // Exhaustiveness guard — all verbs handled above.
      const _never: never = action.verb;
      return { event: String(_never), payload: base };
    }
  }
}

/**
 * A behavior-tree node that dispatches a cognitive verb. This is a STRUCTURAL
 * match for the `'cognitive'` case of BehaviorTreeTrait's internal `BTNode`
 * (`{ type:'cognitive', verb, config, await?, result_key? }`) — defined here, not
 * imported, so the cognitive module stays free of a runtime-trait dependency.
 */
export interface CognitiveBTNode {
  type: 'cognitive';
  verb: CognitiveVerb;
  config: Record<string, unknown>;
  /** Block (BT returns `running`) until the trait completion event resolves. */
  await?: boolean;
  /** Blackboard key to receive the completion payload. */
  result_key?: string;
  /** Optional display name. */
  name?: string;
}

/**
 * Bridge a brain state's parsed cognitive actions into executable cognitive
 * behavior-tree nodes — the missing link (Phase 2.1) between the PARSE side and
 * the EXECUTE side of the cognitive language surface:
 *
 *   PARSE   `state { llm_call {…}; recall {…} }`
 *           → `brainState.cognitiveActions: HoloCognitiveAction[]`
 *             (HoloScriptPlusParser populates this; today it reaches no runtime)
 *   BRIDGE  this function → `CognitiveBTNode[]`
 *   EXECUTE `BehaviorTreeTrait.tickCognitive` ticks each node and calls
 *           {@link compileCognitiveDispatch}, emitting the real trait event.
 *
 * `await` and `result_key` are lifted from each action's config when present
 * (`config.await: boolean`; `config.result_key | result | into: string`) so the
 * authored block controls blocking + where the completion payload lands — exactly
 * the fields `tickCognitive` reads. Non-cognitive / malformed entries are skipped
 * (the parser only ever emits `{kind:'cognitive', …}` here, but the guard keeps
 * the bridge total).
 */
export function cognitiveActionsToBTNodes(
  actions: readonly HoloCognitiveAction[] | undefined
): CognitiveBTNode[] {
  if (!actions || actions.length === 0) return [];
  const out: CognitiveBTNode[] = [];
  for (const a of actions) {
    if (!a || a.kind !== 'cognitive' || !isCognitiveVerb(a.verb)) continue;
    const config = a.config ?? {};
    const node: CognitiveBTNode = { type: 'cognitive', verb: a.verb, config };
    if (config.await === true) node.await = true;
    const rk = config.result_key ?? config.result ?? config.into;
    if (typeof rk === 'string') node.result_key = rk;
    out.push(node);
  }
  return out;
}

/**
 * Materialize a brain state's cognitive actions into a behavior-tree root that the
 * engine's `behaviorTreeHandler` executes — wrapping {@link cognitiveActionsToBTNodes}
 * in a `sequence` so the verbs dispatch in authored order. This is the engine-side
 * half of the Phase 2.1 wiring: the parsed `state { recall {…}; llm_call {…} }`
 * surface becomes a runnable tree (the runtime attaches a `behavior_tree` trait with
 * this root and ticks it → each verb reaches its real trait via
 * {@link compileCognitiveDispatch}). Returns `undefined` when there are no cognitive
 * actions (no behavior tree to run). Use as `{ ...root, tick_rate, restart_on_complete }`
 * for the `behaviorTreeHandler` config.
 */
export function cognitiveActionsToBehaviorTree(
  actions: readonly HoloCognitiveAction[] | undefined
): { root: { type: 'sequence'; name: string; children: CognitiveBTNode[] } } | undefined {
  const children = cognitiveActionsToBTNodes(actions);
  if (children.length === 0) return undefined;
  return { root: { type: 'sequence', name: 'brain_cognition', children } };
}
