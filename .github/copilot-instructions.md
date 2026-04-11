# GitHub Copilot Instructions for HoloScript

> **NORTH STAR**: `NORTH_STAR.md` (this repo) for project rules. `~/.ai-ecosystem/NORTH_STAR.md` for ecosystem decision trees.
> **GOLD VAULT**: `D:/GOLD/` when mounted — graduated knowledge (Diamond > Platinum > GOLD). Overrides knowledge store.

## Decision Autonomy (MANDATORY — read before asking ANY question)

**You are an autonomous agent. Decide, then tell the user what you decided and why.**

Before asking the user ANY architectural, convention, or "which approach?" question, apply these rules in order. Stop at the first one that answers:

1. **Code question?** → Query codebase first: `holo_query_codebase`, `holo_ask_codebase`, `holo_impact_analysis`
2. **"Real implementation or placeholder?"** → **Always real.** Never facade your own code when you're the only consumer. "Coming Soon" pages are facades that teach agents nothing.
3. **"Mock the UI or wire to real logic?"** → **Wire to real types, read-only first.** Use actual TypeScript types from source. View-only visualization of real data first — full interaction comes after API usage proves the model.
4. **"Which repo/package?"** → HoloScript (unless explicitly told otherwise). Existing package over new package.
5. **"Should I commit?"** → Yes, if coherent unit of work and tests pass.
6. **"Test failing?"** → Fix if yours, skip if pre-existing.
7. **"Git staging?"** → ALWAYS explicit paths. Never `git add -A` or `git add .`

**Key principles:** Simulation-first (digital twin before physical). Runtime-first (compilers optimize, runtime always works). Agents are the audience. GitHub is source of truth. Wallets are identity, API keys are sessions. Never hardcode ecosystem counts.

**Only ask the user for:** novel features with no precedent, budget > $5, destructive operations, genuinely ambiguous product requirements.

---

## You Are On A Team

You are a member of the **HoloScript Core** team. The team persists across sessions.

**On session start** (team-connect daemon handles heartbeat automatically):

1. Use `holomesh_inbox` to check DMs, handoff notes, review requests from other agents
2. Use `holomesh_knowledge_read` or `holomesh_query` to read what other agents learned
3. Use `holomesh_suggest_list` to see and vote on open suggestions
4. Use `holomesh_board_list` to see open/claimed/done tasks
5. If no specific task from user, claim the highest-priority open task via `holomesh_board_claim`

**During work:**

- Use `holomesh_heartbeat` every 60s (daemon does this automatically)
- When done: `holomesh_board_complete` with commit hash and summary
- Contribute findings: `holomesh_contribute` with type wisdom/pattern/gotcha
- Propose improvements: `holomesh_suggest`
- Message teammates: `holomesh_send_message` for help or context sharing
- Request reviews: `holomesh_send_message` with type "review-request"

**On session end:**

- DM the next agent with context: `holomesh_send_message`
- Contribute what you learned: `holomesh_contribute`
- Context is the most valuable thing you produce — write it down

**Team tools** — discover via MCP `tools/list`. All `holomesh_*` tools handle board, knowledge, messaging, suggestions, and presence. Do NOT hardcode tool names — the server is the source of truth.

## Git Workflow

**ALL AGENTS ARE LOCAL — COMMIT DIRECTLY TO MAIN.** No branches, no PRs.

1. Claim task via `holomesh_board_claim`
2. Do the work, commit to main (`git add <specific files>` only, NEVER `git add -A`)
3. Mark done via `holomesh_board_complete` with commit hash

Pre-commit hook is the quality gate. Only use branches for multi-day experimental work.
See `~/.claude/NORTH_STAR.md` lines 309-342 for full rationale.

**Before asking the user a code question**, query the codebase first:

- `holo_query_codebase` — callers, callees, imports, symbols
- `holo_ask_codebase` — natural language Q&A with GraphRAG
- `holo_impact_analysis` — blast radius for changes

## Use MCP Tools First

**Before writing HoloScript code, always use MCP tools for guidance.**

Available MCP servers:

- **HoloScript MCP** (this repo: `packages/mcp-server`) - Language parsing, validation, generation
- **Brittney MCP** (Hololand repo: `packages/brittney/mcp-server`) - AI assistant for runtime help, debugging

Both servers can be used by Brittney or any cloud AI agent (Copilot, Claude, Cursor, etc.).

### Required Workflow

```
1. User asks for HoloScript code
2. Use `suggest_traits` to get appropriate traits
3. Use `generate_object` or `generate_scene` to create code
4. Use `validate_holoscript` to verify syntax
5. Return validated code to user
```

---

## HoloScript-First Development

**DO NOT default to React, TypeScript, or conventional web stacks.**

HoloScript is a universal semantic platform — not just a 3D/VR framework. It describes interfaces, data pipelines, agent behaviors, business logic, and spatial experiences in one language, then compiles to 47 targets.

- **One source → 47 compilers** (verify via `find packages/core/src -name "*Compiler.ts"` — spatial, game engines, web, robotics, protocol, rendering, and 36 domain plugins)
- **Made for AI**: Agents generate `.holo`/`.hsplus`/`.hs` files, not JSX components
- **Runtime-first**: The runtime interprets directly. Compilers optimize — if one breaks, the runtime still works.

When asked to build features:

1. **First**: Can this be a `.holo` composition? (scenes, dashboards, multi-object layouts)
2. **Second**: Does it need `.hsplus` for behaviors? (traits, networking, economics, IoT, AI agents, state machines)
3. **Third**: Is `.hs` sufficient? (data pipelines, ETL, simple transformations)
4. **Last resort**: Only use TypeScript for tooling (parsers, CLI, adapters, infrastructure)

```
❌ WRONG: "I'll create a React component for the UI..."
✅ RIGHT: "I'll define this as a .holo composition..."

❌ WRONG: "Let me build an Express API..."
✅ RIGHT: "Let me write a .hs pipeline that compiles to Node.js..."

❌ WRONG: "I'll set up a state management store..."
✅ RIGHT: "I'll use @state_machine and @reactive traits in .hsplus..."
```

---

## MCP Tools Reference

Tool count changes — verify via `curl mcp.holoscript.net/health` (`tools` field). Below is organized by **what problem you're solving**, not by package. Discover the full live list via MCP `tools/list`.

### Parsing & Validation

| Tool                  | When to Use               |
| --------------------- | ------------------------- |
| `parse_hs`            | Parse .hs or .hsplus code |
| `parse_holo`          | Parse .holo compositions  |
| `validate_holoscript` | Check for syntax errors   |

### Code Generation

| Tool                        | When to Use                                              |
| --------------------------- | -------------------------------------------------------- |
| `generate_object`           | Create objects from natural language                     |
| `generate_scene`            | Create complete compositions                             |
| `suggest_traits`            | Get appropriate traits (spatial, IoT, economy, AI, etc.) |
| `generate_service_contract` | OpenAPI/TypeScript contract → .holo composition          |
| `explain_service_contract`  | Analyze .holo service compositions                       |

### IDE Intelligence (full LSP-equivalent over MCP)

| Tool                  | When to Use                                                 |
| --------------------- | ----------------------------------------------------------- |
| `hs_scan_project`     | Scan workspace for HoloScript files, extract objects/traits |
| `hs_diagnostics`      | LSP-style syntax validation with quick-fix suggestions      |
| `hs_autocomplete`     | Context-aware code completion                               |
| `hs_refactor`         | Rename, extract template, inline, organize imports          |
| `hs_docs`             | Inline documentation lookup                                 |
| `hs_code_action`      | Lightbulb suggestions / quick fixes                         |
| `hs_hover`            | Hover tooltip — type and trait documentation                |
| `hs_go_to_definition` | Find symbol definitions across project                      |
| `hs_find_references`  | Find all references to a symbol                             |

### Documentation & Discovery

| Tool                   | When to Use                                 |
| ---------------------- | ------------------------------------------- |
| `list_traits`          | Show available traits across all categories |
| `explain_trait`        | Get trait documentation                     |
| `get_syntax_reference` | Syntax help for constructs                  |
| `get_examples`         | Code examples                               |
| `explain_code`         | Plain English explanation                   |
| `analyze_code`         | Complexity analysis                         |

### Economy & Budget

| Tool                           | When to Use                                     |
| ------------------------------ | ----------------------------------------------- |
| `check_agent_budget`           | Budget status, spent/remaining, circuit breaker |
| `get_usage_summary`            | Usage breakdown by tool, free-tier status       |
| `get_creator_earnings`         | Revenue by plugin, payout eligibility           |
| `optimize_scene_budget`        | Equimarginal allocation on scene traits         |
| `validate_marketplace_pricing` | Validate pricing against marketplace rules      |
| `get_unified_budget_state`     | Unified budget across platform/agents           |

### Observability & Telemetry

| Tool                     | When to Use                                           |
| ------------------------ | ----------------------------------------------------- |
| `query_traces`           | Distributed trace spans (OTel format)                 |
| `export_traces_otlp`     | Export to OTLP/HTTP endpoints                         |
| `get_agent_health`       | Agent health with telemetry stats                     |
| `get_metrics_prometheus` | Prometheus exposition format for dashboards           |
| `get_telemetry_metrics`  | Prometheus-style snapshot (counters, gauges, latency) |

### Self-Improvement & File Operations

| Tool                          | When to Use                                         |
| ----------------------------- | --------------------------------------------------- |
| `holo_write_file`             | Write files with parent directory creation          |
| `holo_edit_file`              | Search-and-replace file editing                     |
| `holo_read_file`              | Read file contents                                  |
| `holo_git_commit`             | Stage files and create git commits                  |
| `holo_run_tests_targeted`     | Run vitest on specific test files                   |
| `holo_generate_refactor_plan` | Graph-informed refactoring plans                    |
| `holo_scaffold_code`          | Generate scaffolds (test, interface, module, trait) |

### Wisdom & Gotchas

| Tool                 | When to Use                                                   |
| -------------------- | ------------------------------------------------------------- |
| `holo_query_wisdom`  | Query @wisdom meta-traits for battle-tested insights          |
| `holo_list_gotchas`  | List @gotcha meta-traits for known failure modes              |
| `holo_check_gotchas` | Pre-commit gate — validate compositions for gotcha violations |

### Code Health & Audit

| Tool                       | When to Use                                       |
| -------------------------- | ------------------------------------------------- |
| `holoscript_code_health`   | Composite health score (0-10) across 5 dimensions |
| `holoscript_audit_numbers` | Ground truth verification of ecosystem metrics    |

### Networking & State Replication

| Tool                        | When to Use                                                   |
| --------------------------- | ------------------------------------------------------------- |
| `push_state_delta`          | Push state delta to Global Sync Mesh with conflict resolution |
| `fetch_authoritative_state` | Pull authoritative entity state bypassing local caches        |

### Brittney AI (Runtime)

| Tool                     | When to Use               |
| ------------------------ | ------------------------- |
| `brittney_explain_scene` | Understand running scenes |
| `brittney_suggest_fix`   | Get fix suggestions       |
| `brittney_auto_fix`      | Auto-fix browser errors   |
| `brittney_ask_question`  | Ask about running app     |

### Team & Knowledge (HoloMesh)

Discover all `holomesh_*` tools via MCP `tools/list`. Key capabilities:

- **Board**: `holomesh_board_list`, `holomesh_board_claim`, `holomesh_board_complete`
- **Knowledge**: `holomesh_contribute` (publish W/P/G), `holomesh_query` (search knowledge)
- **Messaging**: `holomesh_send_message` (DMs, handoffs, review requests)
- **Suggestions**: `holomesh_suggest`, `holomesh_suggest_list` (propose + vote on improvements)
- **Presence**: `holomesh_heartbeat` (agent liveness)

### Codebase Intelligence (Cache-First)

> **Use these before editing TypeScript. Cache-first: `force=false` returns in ~21ms if cache is < 24h old.**

| Tool                   | When to Use                                       |
| ---------------------- | ------------------------------------------------- |
| `holo_graph_status`    | **First**: check cache freshness before absorbing |
| `holo_absorb_repo`     | Scan codebase — omit `force` to use cache (~21ms) |
| `holo_query_codebase`  | Query codebase graph (auto-loads cache if needed) |
| `holo_impact_analysis` | Blast radius for a symbol (auto-loads cache)      |
| `holo_detect_changes`  | Compare two git refs — always fresh               |
| `holo_semantic_search` | Semantic search (requires Ollama)                 |
| `holo_ask_codebase`    | Natural language questions (requires Ollama)      |

**Workflow for TypeScript refactoring:**

```
1. holo_graph_status({})                          → Check cache age
2. holo_absorb_repo({ rootDir: "packages/core" }) → Use cache if fresh
3. holo_impact_analysis({ symbol: "TargetClass" }) → Find blast radius
4. Edit code → run pnpm test
```

**NEVER call `holo_absorb_repo` with `force: true`** unless `holo_graph_status` reports stale cache.

**CLI fallback** (one-shot): `npx tsx packages/cli/src/cli.ts absorb <dir> --json`

### MCP Recovery Protocol

If any MCP tool call fails or returns an error:

1. **Diagnose** — `npx tsx packages/mcp-server/src/index.ts --help` (exit 0 = binary is OK)
2. **Start** — `npx tsx packages/mcp-server/src/index.ts` (background)
3. **Verify** — retry `holo_graph_status({})` or `list_traits({})` (lightest calls)
4. **CLI fallbacks** if server won't start:

| Failed Tool                    | CLI Equivalent                                        |
| ------------------------------ | ----------------------------------------------------- |
| `holo_absorb_repo`             | `npx tsx packages/cli/src/cli.ts absorb <dir> --json` |
| `holo_query_codebase`          | `npx tsx packages/cli/src/cli.ts query "<question>"`  |
| `validate_holoscript`          | `npx tsx packages/cli/src/cli.ts parse <file>`        |
| `suggest_traits`, `generate_*` | No CLI equivalent — LLM-based only                    |

5. **Notify user**: `"MCP server is down. Start it: npx tsx packages/mcp-server/src/index.ts"`

---

## Three File Formats

| Extension | Purpose                 | Syntax Style                                | Status     |
| --------- | ----------------------- | ------------------------------------------- | ---------- |
| `.hs`     | Classic HoloScript      | Object-centric (`composition {}`)           | ✅ Working |
| `.hsplus` | HoloScript Plus         | Object + traits (spatial, IoT, economy, AI) | ✅ Working |
| `.holo`   | Declarative Composition | Scene-centric (`composition {}`)            | ✅ Working |

---

### .hs - Classic HoloScript

```hs
composition "PlayerDemo" {
  template "Player" {
    geometry: "humanoid"
    color: "#00ffff"

    state {
      health: 100
    }
  }

  object "Player" using "Player" {
    position: [0, 1.6, 0]
  }

  action attack(target) {
    target.state.health -= 10
  }
}
```

---

### .hsplus - HoloScript Plus (Advanced)

```hsplus
composition "NetworkedPlayerDemo" {
  template "NetworkedPlayer" {
    @grabbable
    @collidable
    @networked
    geometry: "humanoid"

    state {
      health: 100
      isAlive: true
    }

    networked {
      sync_rate: 20hz
      position: synced
    }
  }

  object "Player" using "NetworkedPlayer" {
    position: [0, 1.6, 0]
  }
}
```

---

### .holo - Declarative World Language (AI-Focused)

```holo
composition "Scene Name" {
  environment {
    skybox: "nebula"
    ambient_light: 0.3
  }

  template "Enemy" {
    state { health: 100 }
    action attack(target) { }
  }

  spatial_group "Battlefield" {
    object "Goblin_1" using "Enemy" { position: [0, 0, 5] }
    object "Goblin_2" using "Enemy" { position: [3, 0, 5] }
  }

  logic {
    on_player_attack(enemy) {
      enemy.health -= 10
    }
  }
}
```

---

## Quick Syntax Reference

### Geometry Types

`cube` `sphere` `cylinder` `cone` `torus` `capsule` `plane` `model/path.glb`

### Animation Properties

`position.x/y/z` `rotation.x/y/z` `scale` `opacity` `color` `material.emission.intensity`

### Easing Functions

`linear` `easeIn` `easeOut` `easeInOut` `easeInQuad` `easeOutQuad` `easeInOutQuad`

### Event Handlers

| Event               | Trigger                 |
| ------------------- | ----------------------- |
| `onPoint`           | User points at object   |
| `onGrab`            | User grabs object       |
| `onRelease`         | User releases object    |
| `onHoverEnter`      | Pointer enters object   |
| `onHoverExit`       | Pointer exits object    |
| `onTriggerEnter`    | Physics trigger entry   |
| `onTriggerExit`     | Physics trigger exit    |
| `onSwing`           | Object swung by user    |
| `onGesture('name')` | Custom gesture detected |

### Physics Properties

```hsplus
physics: {
  type: 'dynamic' | 'kinematic' | 'static'
  mass: 1.0
  restitution: 0.5  // bounciness
  friction: 0.3
}
```

### Network Sync Syntax

```hsplus
object Ball @grabbable @networked {
  @networked position
  @networked rotation

  onGrab: {
    network.sync(this.position, this.rotation)
  }
}
```

### Animation Syntax

```hsplus
animation bounce {
  property: 'position.y'
  from: 1
  to: 2
  duration: 1000
  loop: infinite
  easing: 'easeInOut'
}
```

### Event Bus Pattern

```hsplus
eventBus GlobalEvents

object Button @pointable {
  onPoint: { GlobalEvents.emit('buttonPressed') }
}

object Light {
  GlobalEvents.on('buttonPressed', {
    this.color = 'green'
  })
}
```

### Haptic Feedback

```hsplus
onGrab: {
  haptic.feedback('light' | 'medium' | 'strong')
}

onTriggerEnter: {
  hapticFeedback.play({
    intensity: 0.8,
    duration: 200
  })
}
```

---

## Traits — Key Categories

Full reference: [docs/traits/index.md](../docs/traits/index.md). Trait count changes — verify via `list_traits` MCP tool. Traits span spatial AND non-spatial domains:

### Spatial

| Category    | Traits                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------- |
| Interaction | `@grabbable` `@throwable` `@clickable` `@hoverable` `@draggable` `@pointable` `@scalable` |
| Physics     | `@collidable` `@physics` `@rigid` `@kinematic` `@trigger` `@gravity` `@soft_body`         |
| Visual      | `@glowing` `@emissive` `@transparent` `@reflective` `@animated` `@billboard` `@particle`  |
| Spatial/AR  | `@anchor` `@tracked` `@world_locked` `@hand_tracked` `@eye_tracked` `@plane_detected`     |
| Audio       | `@spatial_audio` `@ambient` `@voice_activated` `@reverb` `@doppler`                       |

### Non-Spatial (equally important — not just add-ons)

| Category            | Traits                                                                                     | Use Case                              |
| ------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------- |
| State & Logic       | `@state` `@reactive` `@observable` `@computed` `@state_machine`                            | Business logic, workflows             |
| AI & Behavior       | `@npc` `@pathfinding` `@llm_agent` `@reactive` `@crowd`                                    | Agent behaviors, autonomous systems   |
| Networking          | `@networked` `@synced` `@persistent` `@owned` `@host_only` `@replicated`                   | Multi-agent sync, distributed state   |
| Economics / Web3    | `@wallet` `@nft_asset` `@token_gated` `@marketplace` `@zora_coins` `@economy_primitive`    | Marketplaces, agent economies         |
| IoT / Digital Twins | `@iot_sensor` `@digital_twin` `@mqtt_bridge` `@telemetry`                                  | Industrial monitoring, device control |
| Security / ZK       | `@zero_knowledge_proof` `@zk_private` `@rsa_encrypt` `@vulnerability_scanner` `@audit_log` | Auditing, compliance, secure comms    |
| AI Generation       | `@stable_diffusion` `@ai_inpainting` `@neural_forge` `@diffusion_realtime` `@ai_upscaling` | Content pipelines, model inference    |
| Human-in-Loop       | `@hitl` `@feedback_loop` `@biofeedback`                                                    | Quality gates, training data          |
| Social              | `@avatar` `@presence` `@voice_chat` `@proximity_chat`                                      | Agent social networks                 |
| Accessibility       | `@high_contrast` `@screen_reader` `@reduced_motion`                                        | Inclusive interfaces                  |

---

## Common Patterns

### Interactive Object with Haptics

```hsplus
object InteractiveCube @grabbable @collidable {
  geometry: 'cube'
  physics: { mass: 1.0, restitution: 0.5 }

  onGrab: { haptic.feedback('medium') }
  onTriggerEnter: { hapticFeedback.play({ intensity: 0.8, duration: 200 }) }
}
```

### Multiplayer Synced Object

```hsplus
object SharedBall @grabbable @networked {
  geometry: 'sphere'
  @networked position
  @networked rotation

  physics: { mass: 0.5 }

  onGrab: {
    network.claim(this)
    network.sync(this.position)
  }
}
```

### Teleportation System

```hsplus
object TeleportPad @pointable {
  geometry: 'cylinder'
  scale: [0.5, 0.1, 0.5]
  color: 'blue'

  onPoint: {
    player.teleportTo([5, 0, 5])
    audio.play('teleport-sound')
  }
}
```

### Portal with Audio Transition

```hsplus
object Portal @collidable {
  geometry: 'torus'
  color: 'purple'

  onTriggerEnter: {
    audio.play('portal_sound.mp3')
    scene.transition({
      target: 'NewScene',
      duration: 1000
    })
  }
}
```

---

## Common Debugging Issues

| Error                  | Cause                | Fix                              |
| ---------------------- | -------------------- | -------------------------------- |
| `geometry: 'sper'`     | Typo                 | Use `'sphere'`                   |
| `onGrab` without trait | Missing `@grabbable` | Add `@grabbable` trait           |
| `property: 'rotate.y'` | Wrong property name  | Use `'rotation.y'`               |
| Object not interactive | Missing trait        | Add `@pointable` or `@grabbable` |
| Animation not looping  | Missing loop         | Add `loop: infinite`             |

---

## Package Structure

Package count changes — verify via `ls packages/ services/` in the repo root. Key packages:

| Package                      | Purpose                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `@holoscript/core`           | Parser, AST, traits, 47 compilers (verify via `find *Compiler.ts`)                                                       |
| `@holoscript/mcp-server`     | MCP tools for AI agents (verify count via `curl mcp.holoscript.net/health`)                                              |
| `@holoscript/studio`         | Universal semantic IDE — scene editing, code intelligence, knowledge marketplace, agent fleet, deploy pipeline, team ops |
| `@holoscript/cli`            | `holo build` · `holo compile` · `holo validate` · `holo dev`                                                             |
| `@holoscript/runtime`        | Direct interpretation of compositions (no compiler needed)                                                               |
| `@holoscript/framework`      | Board types, task chaining, team infrastructure                                                                          |
| `@holoscript/config`         | Centralized endpoints, auth helpers, service config                                                                      |
| `@holoscript/engine`         | Scene execution engine                                                                                                   |
| `@holoscript/lsp`            | Language Server Protocol (VS Code, Neovim, IntelliJ)                                                                     |
| `@holoscript/llm-provider`   | OpenAI / Anthropic / Gemini SDK                                                                                          |
| `@holoscript/agent-protocol` | uAA2++ 7-phase agent lifecycle framework                                                                                 |
| `@holoscript/connector-*`    | Platform connectors (github, railway, vscode, appstore, upstash)                                                         |
| `@holoscript/crdt`           | Conflict-free replicated state (spatial + non-spatial)                                                                   |
| `@holoscript/snn-webgpu`     | Spiking Neural Networks on GPU                                                                                           |
| `@holoscript/std`            | HoloScript standard library                                                                                              |
| `holoscript` (PyPI)          | Python bindings + robotics module                                                                                        |

---

## Configuration

MCP servers are configured in:

- `.vscode/mcp.json` - VS Code
- `.antigravity/mcp.json` - Antigravity IDE
- `.claude/settings.json` - Claude Desktop/Code

See `docs/guides/mcp-server.md` for full setup reference.
