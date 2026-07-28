# Brain Declarations Reference (`.hsplus`)

Complete reference for `brain` declarations in HoloScript's `.hsplus` format.

## Overview

A `brain` is a top-level `.hsplus` construct that defines a named AI agent behavior. It is the primary way to author autonomous NPC intelligence, service agents, and any entity whose behavior is driven by a cognitive architecture rather than scripted logic.

Under the hood, `brain` parses into a `HoloBrainDecl` AST node and is compiled to a set of registered HoloScript traits (`LLMAgentTrait`, `GoalOrientedTrait`, `AgentMemoryTrait`, `RAGKnowledgeTrait`, etc.) that the runtime dispatches events against.

**Identity rule (F.119):** The brain's `name` is the fleet agent's identity anchor. The name must match the registered `HOLOSCRIPT_AGENT_BRAIN` value for the running seat. Do not rename it after the seat is funded — rename the brain registration instead.

## Basic Syntax

```hsplus
brain DragonAI : @behavior_tree {
  @personality aggressive
  @memory_persistence true

  state idle {
    transition to patrol @when { hp > 0.5 }
  }

  state patrol {
    transition to combat @when { enemy_detected == true }
  }

  state combat {
    transition to idle @when { hp <= 0 }
  }
}
```

The general form is:

```
brain <Name> [: @<brainType>] {
  [top-level annotations]
  [state blocks]
}
```

The `: @<brainType>` suffix is optional; it defaults to `@behavior_tree` when omitted.

## Brain Types

| Type          | Annotation       | Description                                                                                                                                |
| ------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Behavior tree | `@behavior_tree` | Hierarchical behavior tree. States map to BT nodes; the runtime traverses them each tick via selector/sequence rules. This is the default. |
| Decision tree | `@decision_tree` | Decision-tree rules. Conditions are evaluated top-to-bottom within each state; the first matching transition fires.                        |
| Neural        | `@neural`        | Neural-backed cognitive architecture. Intended for learned policies; exact dispatch is backend-defined.                                    |
| Scripted      | `@scripted`      | Scripted sequences. States run in authored order; transitions are time- or event-driven.                                                   |

## Top-Level Annotations

These `@` annotations appear directly inside the brain body (before any `state` blocks). All are optional.

| Annotation            | Value type                         | Description                                                                                                                                |
| --------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `@personality`        | string                             | Behavioral archetype communicated to LLM-backed traits. Examples: `aggressive`, `cautious`, `neutral`, `friendly`.                         |
| `@faction_alignment`  | string                             | Faction membership. Two-word alignments use underscores: `true_neutral`, `lawful_good`. Examples: `rebels`, `empire`, `neutral_guild`.     |
| `@memory_persistence` | boolean                            | When `true`, `AgentMemoryTrait` stores memories across sessions. When `false` or omitted, memories are session-scoped only.                |
| `@flee_threshold`     | float (0.0–1.0)                    | HP fraction below which the agent flees. The runtime emits a flee trigger when `hp / max_hp < flee_threshold`. Default if omitted: `0.25`. |
| `@patrol_speed`       | float or string                    | Movement speed multiplier used during patrol states. Passed to the locomotion trait.                                                       |
| `@waypoints`          | array of strings                   | Ordered list of waypoint names for patrol routes. The locomotion trait advances through them in sequence.                                  |
| `@preferred_ability`  | `{ name, when? }`                  | Default ability to activate, with an optional `@when` condition guard. When the condition is met (or omitted), the named ability fires.    |
| `@goal`               | `{ name, desiredState, priority }` | Declarative GOAP goal (see [GOAP Goals](#goap-goals)). Repeatable.                                                                         |
| `@escalation`         | `{ on, action }`                   | Escalation condition (see [Escalation Conditions](#escalation-conditions)). Repeatable.                                                    |
| `@provider_policy`    | `{ prefer, fallback, requires }`   | Load-time LLM provider hint (see [Provider Policy](#provider-policy)).                                                                     |

### Examples

```hsplus
brain GuardAI : @behavior_tree {
  @personality cautious
  @faction_alignment city_watch
  @memory_persistence true
  @flee_threshold 0.15
  @patrol_speed 1.5
  @waypoints ["gate", "market", "tower"]
  @preferred_ability "shield_bash" @when { enemy_close == true }

  state idle { }
}
```

## GOAP Goals

`@goal` declares a planning objective for the `GoalOrientedTrait`, which runs an A\* search over the agent's world model to find an action sequence that produces the `desiredState`.

```hsplus
brain HunterAI : @behavior_tree {
  @goal { name: "kill_target", desiredState: { target_dead: true }, priority: 1 }
  @goal { name: "survive", desiredState: { hp_above_20pct: true }, priority: 2 }

  state hunting {
    plan { goal: "kill_target" }
    transition to retreat @when { hp < 0.2 }
  }

  state retreat {
    plan { goal: "survive" }
    transition to hunting @when { hp > 0.5 }
  }
}
```

**Fields:**

| Field          | Type    | Required | Description                                                                                |
| -------------- | ------- | -------- | ------------------------------------------------------------------------------------------ |
| `name`         | string  | yes      | Identifier for the goal; referenced in `plan { goal: "..." }` cognitive actions.           |
| `desiredState` | object  | no       | Key-value world-state properties the planner must achieve.                                 |
| `priority`     | integer | no       | Higher numbers are planned first when goals conflict. Defaults to undefined (no priority). |

Multiple `@goal` annotations are supported; they are collected into the `goals[]` array in the order they appear.

## Escalation Conditions

`@escalation` declares an auditable condition that triggers a named action. These compile to `LLMAgentTrait`'s `EscalationCondition[]` and are designed for regulated or safety-critical agent contexts where human-in-the-loop handoffs must be traceable.

```hsplus
brain MedicalAgent : @decision_tree {
  @escalation { on: "patient_critical", action: "summon_human_doctor" }
  @escalation { on: "uncertainty > 0.8", action: "defer_to_supervisor" }
  @escalation { on: "diagnosis_conflict", action: "request_second_opinion" }

  state assessment {
    llm_call { prompt: "Assess patient vitals: {{ context.vitals }}" }
    transition to critical @when { patient_critical == true }
  }

  state critical {
    "emergency_protocol"
  }
}
```

**Fields:**

| Field    | Type   | Required | Description                                                                                    |
| -------- | ------ | -------- | ---------------------------------------------------------------------------------------------- |
| `on`     | string | yes      | Condition expression or event name that triggers the escalation.                               |
| `action` | string | yes      | Named action to fire when the condition is met. Defaults to `"notify"` if the field is absent. |

## Provider Policy

`@provider_policy` is a load-time hint that the sovereign-first LLM resolver reads when wiring the brain to a model backend. It does not override the resolver's core logic — it communicates preferences.

```hsplus
brain LocalAgent : @behavior_tree {
  @provider_policy { prefer: "local-llm", fallback: "anthropic", requires: "tool_calls" }

  state active {
    llm_call { prompt: "What is the highest-priority task?" }
  }
}
```

**Fields:**

| Field      | Type   | Description                                                                    |
| ---------- | ------ | ------------------------------------------------------------------------------ |
| `prefer`   | string | Backend identifier to prefer (`"local-llm"`, `"anthropic"`, `"openai"`, etc.). |
| `fallback` | string | Backend to use when the preferred one is unavailable.                          |
| `requires` | string | Capability the selected model must support (e.g. `"tool_calls"`, `"vision"`).  |

All three fields are optional. The resolver proceeds normally when `@provider_policy` is absent.

## State Declarations

A `state` block defines one node in the agent's state machine. Brains can have any number of states.

```hsplus
state idle {
  // Transition to another state when a condition evaluates to true each tick
  transition to patrol @when { threat_level == 0 }
  transition to combat @when { threat_level > 0.5 }

  // Free-form action strings — dispatched to registered trait event handlers
  "scan_surroundings"
  "maintain_position"
}
```

**State body elements (in any order):**

| Element          | Form                                       | Description                                                                                                                                                                             |
| ---------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transition       | `transition to <state> [@when { <expr> }]` | Schedules a state switch. The `@when` guard is evaluated each tick; the first matching transition fires. When `@when` is omitted the transition fires unconditionally on the next tick. |
| Action string    | `"action_name"` or bare identifier phrase  | A free-form string dispatched to the trait event bus. Handlers registered against the brain's traits receive it.                                                                        |
| Cognitive action | `llm_call { ... }` etc.                    | First-class typed cognitive operations (see [Cognitive Actions in States](#cognitive-actions-in-states)).                                                                               |
| Trait annotation | `@trait_name { ... }`                      | An inline trait attached to this state only.                                                                                                                                            |

**State names** are arbitrary identifiers. There is no reserved `initial` state; the first `state` block listed is treated as the entry point by the runtime.

### Transition Conditions

`@when` accepts a single expression using the following operators:

- Comparison: `==`, `!=`, `<`, `>`, `<=`, `>=`
- Logical: `&&`, `||`, `!`
- Values: numeric literals, string literals, boolean literals, identifier references into the agent's world state

```hsplus
state patrol {
  transition to combat  @when { enemy_detected == true && hp > 0.3 }
  transition to retreat @when { hp <= 0.3 }
  transition to idle    @when { shift_active == false }
}
```

## Cognitive Actions in States

The five first-class cognitive verbs can be written inline inside any `state` body. Each verb dispatches to the real cognitive trait that already exists on the brain, rather than routing through an opaque action string.

| Verb        | Trait dispatched to                          | Resolves on              |
| ----------- | -------------------------------------------- | ------------------------ |
| `llm_call`  | `LLMAgentTrait` (`llm_prompt` event)         | `llm_message`            |
| `recall`    | `AgentMemoryTrait` (`memory_recall` event)   | `memory_recalled`        |
| `rag_query` | `RAGKnowledgeTrait` (`rag_query` event)      | `on_knowledge_retrieved` |
| `plan`      | `GoalOrientedTrait` (`goap_set_state` event) | `goap_plan_created`      |
| `reflect`   | `LLMAgentTrait` (self-evaluation prompt)     | `llm_message`            |

```hsplus
state threat_assessment {
  llm_call { prompt: "Analyze the threat: {{ context.threat_description }}" }
  recall { query: "enemy tactics" }
  transition to combat  @when { threat_confirmed == true }
  transition to patrol  @when { threat_confirmed == false }
}
```

**`llm_call` config fields:**

| Field         | Description                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `prompt`      | The prompt string sent to the LLM. Supports <code v-pre>{{ context.field }}</code> interpolation from the agent's runtime context. |
| `system`      | Optional system-level instruction prepended to the prompt.                                                                         |
| `temperature` | Optional float passed to the model.                                                                                                |

**`recall` config fields:**

| Field   | Description                                                  |
| ------- | ------------------------------------------------------------ |
| `query` | The semantic query sent to `AgentMemoryTrait` for retrieval. |
| `limit` | Optional integer capping how many memories are returned.     |

**`rag_query` config fields:**

| Field        | Description                                                         |
| ------------ | ------------------------------------------------------------------- |
| `query`      | The query sent to `RAGKnowledgeTrait` for knowledge-base retrieval. |
| `collection` | Optional named collection to scope the search.                      |

**`plan` config fields:**

| Field     | Description                                                                |
| --------- | -------------------------------------------------------------------------- |
| `goal`    | The goal name (matching a `@goal` annotation on the brain) to plan toward. |
| `context` | Optional additional world-state facts to inject before planning.           |

**`reflect` config fields:**

| Field    | Description                                   |
| -------- | --------------------------------------------- |
| `prompt` | The self-evaluation question sent to the LLM. |

For the full cognitive verbs reference, see [`./reference-hsplus-cognitive`](./reference-hsplus-cognitive).

## `@safe_daemon` Composite Trait

Brains can attach `@safe_daemon` as a single convenience annotation that expands at parse time into five safety traits: `@rate_limiter`, `@circuit_breaker`, `@timeout_guard`, `@economy`, and `@structured_logger`. Existing per-trait declarations are not overwritten.

```hsplus
brain AutomatedAgent : @behavior_tree {
  @safe_daemon {
    budget: 5
    spend_limit: 1
    timeout_ms: 30000
    log_level: "info"
  }

  state active {
    llm_call { prompt: "Process the next task" }
  }
}
```

Per-trait overrides use nested objects:

```hsplus
@safe_daemon {
  economy: { initial_balance: 10, default_spend_limit: 2 }
  circuit_breaker: { failure_threshold: 3 }
}
```

## Complete Example

A full guard-captain brain demonstrating all features:

```hsplus
brain GuardCaptainBrain : @behavior_tree {
  @personality cautious
  @memory_persistence true
  @flee_threshold 0.1
  @patrol_speed 2.0
  @waypoints ["gate", "market", "tower", "square"]
  @goal { name: "secure_perimeter", desiredState: { perimeter_clear: true }, priority: 1 }
  @escalation { on: "intruder_confirmed", action: "raise_alarm" }
  @provider_policy { prefer: "local-llm", fallback: "anthropic" }

  state idle {
    transition to patrol @when { shift_active == true }
  }

  state patrol {
    "advance_to_waypoint"
    recall { query: "recent incidents at current_location" }
    transition to investigate @when { anomaly_detected == true }
    transition to idle        @when { shift_active == false }
  }

  state investigate {
    llm_call { prompt: "Assess threat at {{ context.location }}" }
    plan { goal: "secure_perimeter" }
    transition to combat  @when { threat_confirmed == true }
    transition to patrol  @when { threat_confirmed == false }
  }

  state combat {
    reflect { prompt: "Is my tactical approach working?" }
    transition to flee   @when { hp < flee_threshold }
    transition to patrol @when { threat_eliminated == true }
  }

  state flee {
    "emergency_retreat"
    transition to idle @when { safe_distance_reached == true }
  }
}
```

## Usage in `.holo`

Brains defined in `.hsplus` are attached to entities in `.holo` compositions using the `@brain` annotation:

```holoscript
npc "GuardCaptain" {
  @brain GuardCaptainBrain
  position: [0, 1, -15]
}
```

Multiple NPCs can share the same brain declaration; each instance gets its own runtime state:

```holoscript
npc "Guard1" {
  @brain GuardCaptainBrain
  position: [0, 1, -5]
}

npc "Guard2" {
  @brain GuardCaptainBrain
  position: [10, 1, -5]
}
```

## Parser Behavior Notes

- **Default brain type:** `@behavior_tree` is used when the `: @<type>` suffix is omitted.
- **Free-form actions:** Any identifier phrase inside a state body that does not match a cognitive verb or `transition` keyword is collected as a free-form action string. These reach the trait event bus as-is.
- **Typo detection:** The parser warns on near-miss cognitive verb names (e.g. `recal` triggers a `did you mean 'recall'?` warning) and consumes the block to keep braces balanced.
- **Trait annotations in states:** `@trait_name { ... }` inside a state body attaches a trait scoped to that state only, separate from the brain-level `traits` record.
- **Comments:** Both `//` line comments and `/* */` block comments are supported inside brain bodies.

## Next Steps

- [Cognitive Verbs Reference](./reference-hsplus-cognitive) — full config schema for each verb
- [State & Actions Reference](./reference-hsplus-state) — reactive state, actions, watchers
- [Templates & Decorators Reference](./reference-hsplus-templates) — `@safe_daemon` and other decorator patterns
