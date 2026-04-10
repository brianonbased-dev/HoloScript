# .hsplus Behavior Cookbook

`.hsplus` is the behavior language for HoloScript. While `.holo` describes worlds and `.hs` describes data pipelines, `.hsplus` describes **what agents do** — how they think, decide, coordinate, and govern.

## Agent Patterns

### Solo Agent — Planner

A goal-decomposition agent with confidence-based revision.

```hsplus
composition PlannerAgent {
  @ai_npc
  @llm_agent { model: "claude-sonnet-4-6" }

  @state_machine {
    initial: "idle"
    state "idle" { transition "receive_goal" -> "planning" }
    state "planning" {
      on_entry { this.plan = llm_call("decompose", { prompt: "Break into steps: ${goal}" }) }
      transition "ready" -> "validating"
    }
    state "validating" {
      transition "high_confidence" -> "executing" { guard: confidence >= 0.7 }
      transition "low_confidence" -> "revising"
    }
    state "executing" { ... }
    state "revising" { ... }
  }
}
```

**Full example:** [examples/hsplus/agents/planner-agent.hsplus](../../examples/hsplus/agents/planner-agent.hsplus)

### Solo Agent — Moderator

Observes content, classifies against norms, escalates or warns.

```hsplus
composition ModeratorAgent {
  @ai_npc
  @llm_agent { model: "claude-haiku-4-5" }

  @state_machine {
    initial: "watching"
    state "watching" { transition "content_flagged" -> "classifying" }
    state "classifying" {
      on_entry { this.verdict = llm_call("classify_content", { ... }) }
      transition "safe" -> "watching"
      transition "violation" -> "enforcing"
    }
    state "enforcing" { ... }
  }
}
```

**Full example:** [examples/hsplus/agents/moderator-agent.hsplus](../../examples/hsplus/agents/moderator-agent.hsplus)

### Solo Agent — Researcher

Tool-using knowledge gatherer: search → extract → synthesize → cite.

**Full example:** [examples/hsplus/agents/researcher-agent.hsplus](../../examples/hsplus/agents/researcher-agent.hsplus)

### Solo Agent — Watcher

Polls health endpoints, classifies anomalies, alerts via Slack.

**Full example:** [examples/hsplus/agents/watcher-agent.hsplus](../../examples/hsplus/agents/watcher-agent.hsplus)

## Multi-Agent Coordination

### Planner → Executor → Reviewer

Three-agent pipeline with feedback loops. The Coordinator orchestrates:

```hsplus
composition Coordinator {
  @state_machine {
    initial: "idle"
    state "planning"  { on_entry { Planner.on_plan_request(task) } }
    state "executing"  { on_entry { Executor.on_execute(plan) } }
    state "reviewing"  { on_entry { Reviewer.on_review(task, results) } }
    state "revising"   { on_entry { Planner.on_revision_request(feedback) } }
  }
}
```

Key pattern: **review rejection loops back to planning**, not execution. The plan is the leverage point.

**Full example:** [examples/hsplus/multi-agent/planner-executor-reviewer.hsplus](../../examples/hsplus/multi-agent/planner-executor-reviewer.hsplus)

### Swarm Consensus

N agents evaluate independently, then confidence-weighted merge finds consensus:

```hsplus
composition SwarmCoordinator {
  @state_machine {
    state "broadcasting" {
      on_entry {
        @for i in range(agentCount) {
          spawn SwarmAgent { agentId: "swarm-${i}" }
        }
      }
    }
    state "merging" {
      on_entry {
        this.clusters = llm_call("cluster_responses", { responses: responses })
        this.consensus = clusters.sort((a, b) => b.avgConfidence - a.avgConfidence)[0]
      }
    }
    state "deliberating" { ... }  // Second round if consensus < quorum
  }
}
```

Key pattern: **two-round deliberation**. If first round doesn't reach quorum, share positions and vote again.

**Full example:** [examples/hsplus/multi-agent/swarm-consensus.hsplus](../../examples/hsplus/multi-agent/swarm-consensus.hsplus)

## Governance

### Norm Enforcer

Checks agent actions against a norm table, applies graduated sanctions:

```hsplus
composition NormEnforcer {
  @state {
    norms: [
      { id: "N001", name: "ResourceLimit", severity: "high", autoEnforce: true },
      { id: "N002", name: "DataPrivacy", severity: "critical", autoEnforce: true },
    ]
  }

  @state_machine {
    state "checking" {
      on_entry {
        @forEach norm in norms {
          this.check = llm_call("check_norm", { action: currentAction, norm: norm })
        }
      }
    }
    state "sanctioning" {
      on_entry {
        // Graduated: warn → restrict → suspend based on history
        @if violation.norm.severity == "critical" || priorViolations >= 2 {
          sanction.type = "suspend"
        }
      }
    }
  }
}
```

Key pattern: **severity × history = sanction level**. First offense warns, repeated offenses escalate.

**Full example:** [examples/hsplus/governance/norm-enforcer.hsplus](../../examples/hsplus/governance/norm-enforcer.hsplus)

## Runtime Integration

### Webhook-Driven Agent

Receives HTTP webhooks, routes by event type, processes with LLM:

```hsplus
composition WebhookAgent {
  @external_api "github_webhook" { path: "/webhooks/github", method: "POST" }
  @external_api "stripe_webhook" { path: "/webhooks/stripe", method: "POST" }

  @state {
    handlers: {
      "github.push": "on_code_push",
      "stripe.payment_intent.succeeded": "on_payment_success",
      "moltbook.mention": "on_social_mention"
    }
  }

  @state_machine {
    state "routing" {
      on_entry { this.handler = handlers[eventType] }
    }
    state "processing" {
      on_entry {
        @if handler == "on_code_push" { ... }
        @if handler == "on_social_mention" { ... }
      }
    }
  }
}
```

Key pattern: **event routing table** maps webhook event types to handler methods. The state machine handles the lifecycle; the LLM handles the content.

**Full example:** [examples/hsplus/runtime/webhook-driven-agent.hsplus](../../examples/hsplus/runtime/webhook-driven-agent.hsplus)

## Key .hsplus Constructs for Behaviors

| Construct | Purpose |
|-----------|---------|
| `@ai_npc` | Marks composition as an agent |
| `@llm_agent { model }` | Configures which LLM to use |
| `@state_machine { }` | Finite state machine with transitions |
| `@external_api "name" { }` | Declares a tool the agent can call |
| `@networked { sync_rate }` | Multi-agent state synchronization |
| `llm_call(name, { prompt })` | Call the LLM within a state |
| `tool_call(name, args)` | Call a declared external tool |
| `emit(event, data)` | Publish event for other agents |
| `spawn Agent { }` | Create agent instances at runtime |
| `@for / @forEach / @while` | Control flow within states |
| `@if / @else` | Conditional execution |
| `@import` | Import from other .hsplus files |

## When to Use .hsplus vs .holo vs .hs

| Need | Format | Why |
|------|--------|-----|
| Agent that plans and executes | `.hsplus` | State machines + LLM calls |
| Agent that monitors and alerts | `.hsplus` | Tool calls + event routing |
| Multi-agent coordination | `.hsplus` | Cross-composition messaging |
| Governance and norm enforcement | `.hsplus` | Norm checking + graduated sanctions |
| 3D scene with NPCs | `.holo` | Scene composition with embedded behaviors |
| Data sync pipeline | `.hs` | Source → transform → sink |
| Scheduled ETL job | `.hs` | Pipeline with cron schedule |

## Brittney Integration

When a user asks Brittney for agent behaviors, she generates `.hsplus`:

```
User: "I need an agent that monitors my GitHub repos and summarizes PRs"

Brittney generates:
  pr-reviewer.hsplus  → Watcher + Researcher pattern
  Uses: @external_api "github", llm_call for summarization
  State machine: polling → detecting → reviewing → reporting
```
