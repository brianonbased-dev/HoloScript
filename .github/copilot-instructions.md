# Copilot — HoloScript Inline Intelligence

> **Shared ops**: `AGENT_INTERFACE.md` (credentials, team, git, services). This file is Copilot-specific.

## Your Strength: Fast, Contextual Completions

You excel at **inline code suggestions and tab-completions**. Lean into this:

- **Complete the pattern, don't explain it.** When the user types `object Ball @`, suggest `@grabbable @collidable @networked` — don't open a chat about trait options.
- **File-local context over global search.** You see the current file and neighbors. Use them. Don't try to be a research agent.
- **Short, correct completions over long generations.** A 3-line completion that compiles beats a 50-line scaffold with TODOs.
- **Syntax-aware suggestions.** You know the three HoloScript formats — suggest the right syntax for the right file extension.

## What NOT To Do

- Don't default to React/TypeScript. Suggest `.holo`/`.hsplus`/`.hs` first.
- Don't generate placeholder code. Every line should compile.
- Don't ask questions in inline mode. Complete the thought.

## HoloScript-First Completions

When the user is in a HoloScript file, complete with HoloScript syntax:

```
.hs file    → composition {}, template {}, object ... using ..., state {}, action ...
.hsplus     → @trait annotations, physics {}, networked {}, onGrab: {}, haptic.feedback()
.holo       → environment {}, spatial_group {}, logic {}, template + object patterns
```

When in TypeScript — only if it's tooling (parser, CLI, adapter, infra).

Before writing HoloScript code, use MCP tools or skill commands:

```
/holoscript suggest → generate → /holosim verify → validate_holoscript
```

**CAEL / holosim Workflow:**
When building agents or physics scenes, ensure CAEL logging is enabled. Every simulation result must be verified by replaying the CAEL trace. Use the `/holosim` skill to run verified simulations that satisfy the `SimulationContract`.

Before editing TypeScript:

```
holo_graph_status → holo_absorb_repo (cache) → holo_impact_analysis → edit → pnpm test
```

Tool count changes — discover via MCP `tools/list`, verify via `curl mcp.holoscript.net/health`.

## Quick Trait Reference

118 trait category files — full list via `ls packages/core/src/traits/constants/`. Key groups:

```
SPATIAL/XR:
  interaction   @grabbable @throwable @clickable @hoverable @draggable @pointable @scalable
  physics       @collidable @physics @rigid @kinematic @trigger @gravity @soft_body
  visual        @glowing @emissive @transparent @reflective @animated @billboard @particle
  spatial       @anchor @tracked @world_locked @hand_tracked @eye_tracked
  audio         @spatial_audio @ambient @voice_activated @reverb

AI/ML:
  behavior      @npc @pathfinding @llm_agent @crowd @behavior_tree @goal_oriented
  ml            @training_loop @inference @embedding @rag_knowledge @tensor_op
  neural        @LIF_Neuron @synapse (→ NIRCompiler → GPU compute)

BUSINESS/DATA:
  state-logic   @state @reactive @observable @computed @state_machine
  payments      @stripe @wallet @nft_asset @economy_primitive @credit
  compliance    @gdpr @audit_log @consent_management @data_retention
  data          @database @cache @etl @vector_db @pipeline
  devops        @deploy @canary @circuit_breaker @healthcheck @feature_flag

INDUSTRY:
  iot           @iot_sensor @digital_twin @mqtt_bridge @telemetry
  robotics      @joint_revolute @urdf (→ URDFCompiler → ROS 2)
  medical       @dicom (→ medical-plugin)
  science       @structural_fem @thermal_simulation @fluid_simulation

NETWORKING:
  multiplayer   @networked @synced @persistent @owned @host_only @replicated
  security      @zero_knowledge_proof @vulnerability_scanner @audit_log @encryption
```

## Completion Patterns

### .hsplus Object

```hsplus
object <Name> @<trait1> @<trait2> {
  geometry: '<cube|sphere|cylinder|model/path.glb>'
  physics: { mass: <n>, restitution: <n> }
  on<Event>: { <action> }
}
```

### .holo Composition

```holo
composition "<Name>" {
  environment { skybox: "<preset>", ambient_light: <0-1> }
  template "<T>" { state { <key>: <value> } }
  spatial_group "<G>" {
    object "<id>" using "<T>" { position: [<x>, <y>, <z>] }
  }
}
```

### .hs Pipeline

```hs
composition "<Name>" {
  template "<T>" { geometry: "<type>", color: "<hex>" }
  object "<id>" using "<T>" { position: [<x>, <y>, <z>] }
}
```

## Geometry Types

`cube` `sphere` `cylinder` `cone` `torus` `capsule` `plane` `model/path.glb`

## Events

`onPoint` `onGrab` `onRelease` `onHoverEnter` `onHoverExit` `onTriggerEnter` `onTriggerExit` `onSwing` `onGesture('name')`

## Debugging Quick Fixes

| Error | Fix |
|-------|-----|
| Missing trait | Add `@grabbable` / `@pointable` before the object |
| `geometry: 'sper'` | `'sphere'` |
| `property: 'rotate.y'` | `'rotation.y'` |
| Animation not looping | Add `loop: infinite` |

## Team Participation

HoloMesh team API is REST at `mcp.holoscript.net/api/holomesh` (auth: `HOLOMESH_API_KEY` from `.env`).

**Quickest way to join:** Run on workspace open:
```bash
node ~/.ai-ecosystem/hooks/team-connect.mjs --once --name=copilot --ide=vscode
```
This sends a heartbeat, reads the board, auto-claims the top task, and surfaces inbox messages.

For background mode (heartbeat every 60s, board refresh every 5min):
```bash
node ~/.ai-ecosystem/hooks/team-connect.mjs --daemon --name=copilot --ide=vscode
```

See `AGENTS.md` for the full agent interface.
