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

## Fixing failing tests — root cause, not regex sweep

**Never generate bulk regex-transform scripts (`fix-*.cjs`, `fix-*.js`, `patch-*.sh`, etc.) as a response to failing tests.** This pattern has already burned us: a cluster of five `fix-physics*.cjs` scripts accumulated in `packages/core/` trying to rewrite `toEqual([x,y,z])` → `toEqual({x,y,z})`. None were committed, none were run, and if they had been run they would have masked a real type-contract divergence (`IVector3` declared as tuple in `core-types/src/physics.ts`, runtime returning hybrid object).

**Before any test-file edit, answer:**

1. **Is the test wrong, or is the code wrong?** If the type says one thing and the runtime returns another, at least one is wrong. Fix the divergence; do not rewrite the test to match whichever side is easier.
2. **Is there a single consumer fix, or N test rewrites?** A consumer fix (update the type, update the implementation) is usually 1–3 files. A regex sweep across dozens of tests is usually fighting a symptom. Prefer the smaller, typed fix.
3. **Does your fix break any other assertions in the same file?** Run the whole test file after every edit. If fixing one case breaks another, you're patching symptoms.

**Rules:**

- No `.cjs` / `.js` / `.sh` helper scripts left in `packages/*/` directories. If a transformation is truly one-shot, run it and delete it in the same session; do not leave the script.
- No escalating filename patterns (`fix-foo.ts`, `fix-foo-v2.ts`, `fix-foo-final.ts`, `fix-foo-surgical.ts`). Iteration in filenames is a tell that understanding is missing. Stop and re-read the type contract.
- If the same regex fails multiple times with variants, the regex is not the fix — the type contract or the runtime is misaligned.
- Tests that assert specific shapes (`toEqual`, `toStrictEqual`) are a LOAD-BEARING contract, not a formatting preference. Changing their expected-value format without changing the declared type breaks type-checking.

**When you see `toEqual([x, y, z])` vs runtime returning `{x, y, z}`:**

Check in this order, stopping at the first fix that works:

1. Does `core-types/src/physics.ts` declare the returned type as tuple or object? Whichever side disagrees with the declaration is the bug.
2. Does a normalization shim exist (`normalizeIVector3`, `vec3FromArray`)? If yes, is it being applied at every producer?
3. Only then: update the test assertions, ONCE, in a single PR, alongside the type change — not in a regex sweep ahead of it.

## When to pause and hand off

If you find yourself generating a third script to fix the same class of failure, stop. File a task on the HoloMesh board with a clear "type contract X diverges from runtime Y" description and let Claude Code orchestrate the fix. You are the inline-completion strength; Claude is the root-cause-debugging strength. Use the division.

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
