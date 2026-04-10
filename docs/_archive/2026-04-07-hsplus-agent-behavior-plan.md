# .hsplus agent behavior expansion plan

## Why

`.hsplus` should be the natural home for agent behavior, orchestration, norms, memory wiring, and runtime policy — not just a thin extension with a couple of example files.

## Current gap

- Very few real `.hsplus` examples
- Agent behavior patterns are scattered across TypeScript/runtime code
- There is no canonical library of behavior-first `.hsplus` compositions

## Direction

Treat `.hsplus` as the executable behavior language for:

- agent roles
- tool routing
- memory policies
- norm enforcement
- world + agent coordination
- multi-agent workflows

## High-value example packs to add

### 1. Solo agent behaviors

- planner agent
- tool-using researcher
- moderator with norm checks
- watcher/monitor agent

### 2. Multi-agent coordination

- planner -> executor -> reviewer
- scout -> collector -> synthesizer
- swarm voting / confidence merge

### 3. Governance and norms

- norm enforcement agent
- metanorm escalation workflow
- sanction / appeal behavior loop

### 4. Runtime integration examples

- event bus driven behavior
- memory-backed blackboard coordination
- queue / pipeline / webhook triggered agents

## Suggested folder structure

```text
examples/hsplus/
  agents/
    planner-agent.hsplus
    reviewer-agent.hsplus
    moderator-agent.hsplus
  multi-agent/
    planner-executor-reviewer.hsplus
    swarm-consensus.hsplus
  governance/
    norm-enforcer.hsplus
    appeal-process.hsplus
  runtime/
    webhook-driven-agent.hsplus
    queue-worker-agent.hsplus
```

## Feature priorities

1. Canonical syntax for tool invocation blocks
2. Better state + memory idioms in `.hsplus`
3. First-class behavior tree / policy composition examples
4. Stronger examples for norm/metanorm execution
5. More compile/runtime validation for behavior-specific constructs

## Success criteria

- At least 12 real `.hsplus` example files
- Examples cover solo, multi-agent, governance, runtime-triggered behavior
- Brittney can generate behavior-first `.hsplus` patterns from examples
- Parser/compiler tests protect those constructs from drift

## Immediate next moves

1. Add 4 canonical `.hsplus` agent examples
2. Add parser/runtime tests around those examples
3. Promote one `.hsplus` behavior cookbook page into docs
4. Route agent-generation prompts to prefer `.hsplus` when the user asks for behavior or orchestration
