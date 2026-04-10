# HoloScript Native Agent Protocol (HSNAP)

## Why

Google's A2A is JSON-RPC for agents that don't share a language. HoloScript agents share one. Sending JSON task descriptions between agents that can both compile `.hsplus` is like two English speakers communicating through a translator.

HSNAP is agent-to-agent communication where **the message IS the program**.

## Design Principles

1. **Payloads are HoloScript** — tasks, results, and capabilities are `.hs`, `.hsplus`, or `.holo` ASTs
2. **Traits are capabilities** — `@agent` trait declares what an agent can do, not a JSON schema
3. **Compile, don't parse** — receiving agent compiles the payload, doesn't interpret JSON
4. **Knowledge is typed** — W/P/G entries flow between agents as first-class objects
5. **A2A is the fallback** — external agents use Google A2A; native agents use HSNAP

## Agent Declaration

Agents declare themselves in `.hsplus`:

```hsplus
composition ResearchAgent {
  @agent {
    name: "researcher"
    version: "1.0.0"
    accepts: [".hs", ".hsplus", ".holo", "text"]
    emits: ["wisdom", "pattern", "gotcha", ".hsplus"]
    tools: ["web_search", "absorb_query", "knowledge_sync"]
    max_concurrent: 5
    timeout: 300s
  }

  @llm_agent { model: "claude-sonnet-4-6" }

  @state_machine {
    initial: "idle"
    state "idle" { transition "task_received" -> "working" }
    state "working" { ... }
    state "completed" { ... }
  }
}
```

The `@agent` trait replaces the A2A Agent Card. It's not a JSON file served at a well-known URL — it's part of the agent's source code. The agent's behavior, capabilities, and identity are one artifact.

## Task Format

### Sending a task

```hsplus
@task {
  id: "task_abc123"
  from: "planner-agent"
  to: "researcher-agent"
  intent: "research"
  priority: 2
  timeout: 120s
}

// The payload IS HoloScript — not a JSON description of what to do
pipeline "FindCompetitors" {
  source WebSearch {
    type: "rest"
    endpoint: "${env.SEARCH_API}"
    method: "GET"
  }

  transform Extract {
    type: "llm"
    prompt: "Extract competitor names and pricing from these results"
    input: content
    output: competitors
  }

  sink Return {
    type: "agent"
    to: "planner-agent"
    format: "wisdom"
  }
}
```

The planner sends the researcher a **compilable pipeline**, not a text instruction. The researcher compiles it, runs it, and returns structured knowledge.

### Receiving a result

```hsplus
@result {
  task_id: "task_abc123"
  from: "researcher-agent"
  to: "planner-agent"
  status: "completed"
  duration: 45s
}

// Result is a knowledge entry, not raw JSON
@wisdom {
  id: "W.COMP.001"
  content: "Three competitors found: X ($50/mo), Y ($30/mo), Z (free tier + $20/mo pro)"
  confidence: 0.85
  sources: ["https://x.com/pricing", "https://y.io", "https://z.dev/plans"]
}
```

## Protocol Messages

| Message           | Direction          | Payload                                                          |
| ----------------- | ------------------ | ---------------------------------------------------------------- |
| `task.send`       | requester → worker | `.hsplus` or `.hs` with `@task` metadata                         |
| `task.accept`     | worker → requester | Acknowledgement with estimated duration                          |
| `task.progress`   | worker → requester | Partial results, completion percentage                           |
| `task.complete`   | worker → requester | `.hsplus` result with `@result` + `@wisdom`/`@pattern`/`@gotcha` |
| `task.fail`       | worker → requester | Error with `@failure` trait (phase, code, retryable)             |
| `task.cancel`     | requester → worker | Cancellation request                                             |
| `agent.discover`  | any → registry     | Query for agents matching trait requirements                     |
| `agent.heartbeat` | agent → registry   | Presence + load + capabilities update                            |
| `knowledge.share` | agent → agent      | W/P/G entry for peer learning                                    |

## Transport

HSNAP runs over:

1. **Direct** — in-process function calls (agents in same runtime)
2. **HTTP** — `POST /hsnap` with HoloScript body (same as MCP endpoint pattern)
3. **WebSocket** — persistent connection for streaming tasks
4. **Queue** — Redis/NATS for async dispatch (production)

The transport is separate from the protocol. A task sent in-process and a task sent over HTTP have the same `.hsplus` payload.

## Discovery

Instead of `.well-known/agent-card.json` (A2A), agents register their `@agent` trait with the mesh:

```
POST /api/holomesh/agents/register
Body: { source: "<.hsplus file content>" }
```

The registry extracts the `@agent` trait and indexes by:

- `accepts` — what input formats the agent handles
- `emits` — what output it produces
- `tools` — what external capabilities it has
- `name` — for direct addressing

Querying:

```
GET /api/holomesh/agents?accepts=.hs&emits=wisdom
→ Returns agents that can process pipelines and return knowledge
```

## Composition (Multi-Agent)

The planner-executor-reviewer pattern from `.hsplus` examples becomes a first-class protocol pattern:

```hsplus
@workflow {
  name: "BuildDispensary"
  agents: ["planner", "researcher", "builder", "reviewer"]
  max_iterations: 3
}

// Step 1: Planner decomposes
@task { from: "coordinator", to: "planner", intent: "decompose" }
composition Goal {
  description: "Build a dispensary with real-time inventory"
}

// Step 2: Researcher gathers context
@task { from: "coordinator", to: "researcher", intent: "research" }
pipeline ResearchDispensary {
  source Knowledge { type: "mcp", tool: "knowledge_query" }
  source Web { type: "rest", endpoint: "${env.SEARCH_API}" }
  sink Return { type: "agent", to: "coordinator" }
}

// Step 3: Builder creates
@task { from: "coordinator", to: "builder", intent: "build" }
// Payload: the plan from step 1 + research from step 2

// Step 4: Reviewer validates
@task { from: "coordinator", to: "reviewer", intent: "review" }
// Payload: the built artifacts from step 3
```

Each step's payload is HoloScript. The coordinator doesn't orchestrate via JSON-RPC — it sends compilable compositions between agents.

## Compatibility Bridge

External agents (non-HoloScript) connect via A2A as before:

```
External Agent ←→ A2A JSON-RPC ←→ HSNAP Bridge ←→ HoloScript Agent
```

The bridge:

- Translates A2A `tasks/send` JSON into `@task` + payload `.hsplus`
- Translates HSNAP results back to A2A `tasks/get` response
- Preserves A2A streaming via SSE
- Maps A2A Agent Card to `@agent` trait and vice versa

HoloScript agents never see A2A directly. The bridge is transparent.

## Knowledge Flow

HSNAP natively supports the uAA2++ knowledge cycle:

```
Agent A discovers insight → @wisdom { ... }
  ↓ knowledge.share
Agent B receives, validates, compounds
  ↓ knowledge.share
Agent C receives, applies to task
  ↓ task.complete with @pattern { ... }
Knowledge store updated
```

Knowledge entries (W/P/G) are `.hsplus` objects with typed metadata, not JSON blobs. Agents can compile knowledge into behaviors:

```hsplus
// A gotcha received from another agent becomes a runtime guard
@gotcha {
  id: "G.DEPLOY.001"
  content: "Update ALL Dockerfiles when extracting packages"
}

// Automatically compiled into a pre-commit check
on_commit {
  @if files_changed.any(f => f.startsWith("packages/")) {
    @if !files_changed.any(f => f.includes("Dockerfile")) {
      warn("Package changed but no Dockerfile updated — check G.DEPLOY.001")
    }
  }
}
```

## vs Google A2A

|                 | Google A2A                    | HSNAP                          |
| --------------- | ----------------------------- | ------------------------------ |
| Payload         | JSON task description         | Compilable HoloScript          |
| Discovery       | `.well-known/agent-card.json` | `@agent` trait in `.hsplus`    |
| Capabilities    | JSON schema                   | Trait declarations             |
| Results         | JSON response                 | Typed knowledge (W/P/G)        |
| Multi-agent     | External orchestrator         | `.hsplus` workflow composition |
| Knowledge       | Not specified                 | First-class W/P/G flow         |
| Transport       | HTTP + SSE                    | HTTP + WS + Queue + in-process |
| External agents | Native                        | Via compatibility bridge       |

## Implementation Path

1. **`@agent` trait** — add to HoloScriptPlusParser (accepts, emits, tools, timeout)
2. **`@task` / `@result` traits** — metadata wrappers for inter-agent messages
3. **HSNAP router** — receives `.hsplus` payloads, routes to agent by name or capability
4. **Agent registry** — extends HoloMesh agent store with trait-indexed discovery
5. **A2A bridge** — translates between HSNAP and existing A2A endpoints
6. **Knowledge flow** — `knowledge.share` message type with auto-compounding

Phase 1: `@agent` trait + HSNAP router + registry (enables native agent-to-agent)
Phase 2: Workflow composition + multi-agent coordination
Phase 3: A2A bridge + external agent compatibility
Phase 4: Knowledge-to-behavior compilation (gotchas become guards)
