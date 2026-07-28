# Cognitive Verbs Reference (`.hsplus`)

Complete reference for the five built-in cognitive verbs available inside `brain` state declarations.

## Overview

Cognitive verbs are the five built-in operations that make agent brains intelligent. They appear inline inside `brain` state blocks and dispatch to real cognitive trait implementations — no hand-written TypeScript handlers needed.

Each cognitive verb compiles to a `HoloCognitiveAction` AST node with a typed config block. The runtime dispatches each node to the exact trait event its implementation consumes, using `compileCognitiveDispatch` from `packages/core/src/traits/cognitive/CognitiveActions.ts`.

## Quick Reference

| Verb        | Dispatches to            | Resolves on              | Required trait   |
| ----------- | ------------------------ | ------------------------ | ---------------- |
| `llm_call`  | `llm_prompt`             | `llm_message`            | `@llm_agent`     |
| `recall`    | `memory_recall`          | `memory_recalled`        | `@agent_memory`  |
| `rag_query` | `rag_query`              | `on_knowledge_retrieved` | `@rag_knowledge` |
| `plan`      | `goap_set_state`         | `goap_plan_created`      | `@goal_oriented` |
| `reflect`   | `llm_prompt` (self-eval) | `llm_message`            | `@llm_agent`     |

## Syntax

All cognitive verbs use the same block syntax inside a `brain` state:

```hsplus
state my_state {
  verb_name { key: value, key2: value2 }
  transition to next_state @when { condition }
}
```

Verbs in a state body execute in declaration order. Multiple verbs in a single state are allowed; transitions may test the results of any of them.

## `llm_call` — Call an LLM

Sends a prompt to the agent's language model (LLMAgentTrait). The response surfaces as `llm_response` context for subsequent state evaluation and transition guards.

```hsplus
state assess_situation {
  llm_call {
    prompt: "You are a guard captain. A disturbance was detected at {{ context.location }}. Should you investigate or raise an alarm?"
    temperature: 0.3
    max_tokens: 200
  }
  transition to investigate @when { llm_response contains "investigate" }
  transition to alarm       @when { llm_response contains "alarm" }
}
```

**Config fields:**

| Field         | Type   | Description                                                                                                       |
| ------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| `prompt`      | string | The prompt text; <code v-pre>{{ context.field }}</code> interpolates runtime context. Also accepted as `message`. |
| `temperature` | float  | Sampling temperature (0.0–1.0).                                                                                   |
| `max_tokens`  | int    | Maximum response length in tokens.                                                                                |
| `system`      | string | Optional system message override.                                                                                 |

**Dispatch detail:** the compiler maps `prompt` to the `message` field that `LLMAgentTrait.onEvent` reads on the `llm_prompt` event.

## `recall` — Retrieve from Agent Memory

Queries the agent's persistent memory store (AgentMemoryTrait). Use this to retrieve past experiences, entity knowledge, or prior decisions the agent has explicitly stored.

```hsplus
state check_memory {
  recall { query: "enemy weaknesses", limit: 5 }
  recall { query: "patrol incidents at {{ context.current_location }}" }
  transition to attack @when { memory.enemy_is_fire_weak == true }
}
```

**Config fields:**

| Field       | Type     | Description                                                                             |
| ----------- | -------- | --------------------------------------------------------------------------------------- |
| `query`     | string   | Natural language query for the memory store.                                            |
| `limit`     | int      | Max number of memories to retrieve. Alias for `top_k`. Default: implementation-defined. |
| `top_k`     | int      | Same as `limit`; `limit` takes precedence if both are present.                          |
| `tags`      | string[] | Filter memories by tag array.                                                           |
| `embedding` | float[]  | Vector embedding for similarity search; omit to use text retrieval.                     |

**Dispatch detail:** the compiler produces a nested `payload` object (`{ query, top_k, tags, embedding }`) on the `memory_recall` event, matching the exact shape `AgentMemoryTrait.onEvent` reads.

## `rag_query` — Query a Knowledge Base

Queries a retrieval-augmented generation knowledge store (RAGKnowledgeTrait). Suited for factual lookups, lore retrieval, protocol checks, or any read against a named document collection.

```hsplus
state policy_check {
  rag_query {
    query: "What is the protocol for civilian contact?"
    collection: "guard_protocols"
    top_k: 3
  }
  transition to execute_protocol @when { knowledge.protocol_found == true }
  transition to improvise        @when { knowledge.protocol_found == false }
}
```

**Config fields:**

| Field        | Type   | Description                                       |
| ------------ | ------ | ------------------------------------------------- |
| `query`      | string | The retrieval query. Also accepted as `question`. |
| `collection` | string | Named knowledge collection to query.              |
| `top_k`      | int    | Number of results to retrieve. Default: 3.        |

**Dispatch detail:** the compiler maps `query` to the `question` field on the `rag_query` event that `RAGKnowledgeTrait.onEvent` reads.

## `plan` — GOAP Planning

Triggers an A\*-planning pass via GoalOrientedTrait. Updates the agent's world-state beliefs and triggers the planner to find the optimal action sequence toward a goal declared with `@goal` on the enclosing brain.

```hsplus
brain HunterAI : @behavior_tree {
  @goal { name: "captureTarget", desiredState: { target_captured: true }, priority: 1 }

  state engage {
    plan {
      state: { target_spotted: true, weapon_ready: true }
    }
    transition to execute_plan @when { plan.ready == true }
    transition to wait         @when { plan.ready == false }
  }
}
```

**Config fields:**

| Field   | Type   | Description                                                                                       |
| ------- | ------ | ------------------------------------------------------------------------------------------------- |
| `state` | object | World-state key/value pairs to merge before planning. Also accepted as `worldState` or `beliefs`. |

The planner `Object.assign`s these entries into the current world state and replans. Goals are declared separately with `@goal` on the brain — `plan` does not select or change goals.

**Dispatch detail:** the compiler maps `state`/`worldState`/`beliefs` (checked in that order) to the `state` field on the `goap_set_state` event that `GoalOrientedTrait.onEvent` reads.

## `reflect` — Self-Evaluation

Sends a structured self-evaluation prompt to the agent's language model (LLMAgentTrait). Instructs the LLM to assess a named subject against stated criteria, rather than answering an open question. Resolves on the same `llm_message` event as `llm_call`.

```hsplus
state post_combat {
  reflect {
    of: "the combat sequence"
    criteria: "Did I minimise collateral damage and achieve the objective?"
  }
  transition to idle   @when { reflection.complete == true }
  transition to re_plan @when { reflection.complete == false }
}
```

**Config fields:**

| Field      | Type   | Description                                                                                                                                       |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `of`       | string | The subject to reflect on (e.g. `"the previous plan"`). Also accepted as `subject`. Defaults to `"the previous action result"`.                   |
| `criteria` | string | Evaluation criteria or question (e.g. `"correctness and completeness"`). Also accepted as `scorer`. Defaults to `"correctness and completeness"`. |

**Dispatch detail:** the compiler constructs the message `"Reflect on <subject>. Evaluate it for: <criteria>."` and emits it as `llm_prompt`. `reflect` does not accept a raw `prompt` field — use `llm_call` for free-form prompts.

## Using Multiple Verbs in One State

Verbs in a state body execute in declaration order. You can chain memory retrieval, knowledge lookup, and reasoning in a single state before branching:

```hsplus
state threat_response {
  recall    { query: "threats matching {{ context.threat_type }}", limit: 3 }
  rag_query { query: "protocol for {{ context.threat_type }}", collection: "protocols" }
  llm_call  {
    prompt: "Given memory and protocol context: should I engage or report? Threat: {{ context.threat_description }}"
    temperature: 0.2
  }
  plan { state: { threat_identified: true } }

  transition to execute @when { plan.ready == true }
  transition to report  @when { llm_response contains "report" }
  transition to idle    @when { default }
}
```

## Required Traits

Each cognitive verb requires the corresponding trait to be active on the brain's entity. Declare traits at the `brain` level (or on the parent object) with the `@` prefix:

```hsplus
brain FullCognitionAgent : @behavior_tree {
  @llm_agent     { model: "qwen3:4b", provider: "local-llm" }
  @agent_memory  { persistence: true }
  @rag_knowledge { collection: "world_knowledge" }
  @goal_oriented

  // States may now use all five cognitive verbs
}
```

If a verb is used without its required trait active, the runtime emits the trait event and it goes unhandled — no compile error, silent no-op. Ensure the trait is declared.

**Full cognitive trait name list** (for `AI_TRAIT_NAMES` introspection): `llm_agent`, `ai_npc_brain`, `agent_memory`, `rag_knowledge`, `goal_oriented`, `perception`, `behavior_tree`.

## Typo Detection

The language server performs Levenshtein near-miss detection on unknown identifiers that appear in brain state bodies. A typo within 2 edits of a known verb (e.g. `recal`, `llm_cal`, `paln`) produces a diagnostic suggesting the correct verb.

## Related References

- [State & Actions Reference](./reference-hsplus-state) — state management outside brains, `transition`, `@when`
- [Event Handlers Reference](./reference-hsplus-events) — lifecycle, collision, input, VR events
- [Templates & Decorators Reference](./reference-hsplus-templates) — `@goal`, `@llm_agent`, trait decorators
- [Modules & Imports Reference](./reference-hsplus-modules) — sharing brains across files
