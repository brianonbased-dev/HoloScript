# GitHub Copilot Instructions for HoloScript

## ⚠️ CRITICAL: Use MCP Tools First

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

HoloScript is not another framework—it's a paradigm shift:

- **One source → 30+ platforms** (Unity, Unreal, Godot, VRChat, WebGPU, visionOS, iOS, Android, OpenXR, URDF, SDF, DTDL, Babylon, PlayCanvas, WASM, VRR digital twins, AI glasses, neuromorphic chips, A2A agents, and more)
- **50,000 lines → 500 lines** through declarative composition
- **Made for AI**: Agents generate `.holo` files, not JSX components

When asked to build features:

1. **First**: Can this be a `.holo` composition?
2. **Second**: Does it need `.hsplus` for VR traits/networking?
3. **Third**: Is `.hs` sufficient for simple logic?
4. **Last resort**: Only use TypeScript for tooling (parsers, CLI, adapters)

```
❌ WRONG: "I'll create a React component for the UI..."
✅ RIGHT: "I'll define this as a .holo composition with ui objects..."

❌ WRONG: "Let me set up a Next.js app..."
✅ RIGHT: "Let me create a .holo scene that compiles to web..."
```

---

## MCP Tools Reference

### Parsing & Validation

| Tool                  | When to Use               |
| --------------------- | ------------------------- |
| `parse_hs`            | Parse .hs or .hsplus code |
| `parse_holo`          | Parse .holo compositions  |
| `validate_holoscript` | Check for syntax errors   |

### Code Generation

| Tool              | When to Use                          |
| ----------------- | ------------------------------------ |
| `generate_object` | Create objects from natural language |
| `generate_scene`  | Create complete compositions         |
| `suggest_traits`  | Get appropriate VR traits            |

### Documentation

| Tool                   | When to Use                |
| ---------------------- | -------------------------- |
| `list_traits`          | Show available VR traits   |
| `explain_trait`        | Get trait documentation    |
| `get_syntax_reference` | Syntax help for constructs |
| `get_examples`         | Code examples              |
| `explain_code`         | Plain English explanation  |
| `analyze_code`         | Complexity analysis        |

### Brittney AI (Runtime)

| Tool                     | When to Use               |
| ------------------------ | ------------------------- |
| `brittney_explain_scene` | Understand running scenes |
| `brittney_suggest_fix`   | Get fix suggestions       |
| `brittney_auto_fix`      | Auto-fix browser errors   |
| `brittney_ask_question`  | Ask about running app     |

### Codebase Intelligence (Cache-First)

> **Use these before editing TypeScript. Cache-first: `force=false` returns in ~21ms if cache is < 24h old.**

| Tool                    | When to Use                                            |
| ----------------------- | ------------------------------------------------------ |
| `holo_graph_status`     | **First**: check cache freshness before absorbing      |
| `holo_absorb_repo`      | Scan codebase — omit `force` to use cache (~21ms)      |
| `holo_query_codebase`   | Query codebase graph (auto-loads cache if needed)      |
| `holo_impact_analysis`  | Blast radius for a symbol (auto-loads cache)           |
| `holo_detect_changes`   | Compare two git refs — always fresh                    |
| `holo_semantic_search`  | Semantic search (requires Ollama)                      |
| `holo_ask_codebase`     | Natural language questions (requires Ollama)           |

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

| Failed Tool | CLI Equivalent |
| ----------- | -------------- |
| `holo_absorb_repo` | `npx tsx packages/cli/src/cli.ts absorb <dir> --json` |
| `holo_query_codebase` | `npx tsx packages/cli/src/cli.ts query "<question>"` |
| `validate_holoscript` | `npx tsx packages/cli/src/cli.ts parse <file>` |
| `suggest_traits`, `generate_*` | No CLI equivalent — LLM-based only |

5. **Notify user**: `"MCP server is down. Start it: npx tsx packages/mcp-server/src/index.ts"`

---

## Three File Formats

| Extension | Purpose                 | Syntax Style                      | Status     |
| --------- | ----------------------- | --------------------------------- | ---------- |
| `.hs`     | Classic HoloScript      | Object-centric (`composition {}`) | ✅ Working |
| `.hsplus` | HoloScript Plus         | Object + VR traits                | ✅ Working |
| `.holo`   | Declarative Composition | Scene-centric (`composition {}`)  | ✅ Working |

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

## 2,000+ Traits — Key Categories

Full reference: [docs/traits/index.md](../docs/traits/index.md) (13+ categories, 2,037 named trait identifiers across 73 semantic domains)

### Interaction

`@grabbable` `@throwable` `@holdable` `@clickable` `@hoverable` `@draggable` `@pointable` `@scalable`

### Physics

`@collidable` `@physics` `@rigid` `@kinematic` `@trigger` `@gravity` `@soft_body`

### Visual

`@glowing` `@emissive` `@transparent` `@reflective` `@animated` `@billboard` `@particle`

### Networking

`@networked` `@synced` `@persistent` `@owned` `@host_only` `@replicated`

### AI & Behavior

`@npc` `@pathfinding` `@llm_agent` `@reactive` `@state_machine` `@crowd`

`@stackable` `@attachable` `@equippable` `@consumable` `@destructible`

### Spatial / AR

`@anchor` `@tracked` `@world_locked` `@hand_tracked` `@eye_tracked` `@plane_detected`

### Audio

`@spatial_audio` `@ambient` `@voice_activated` `@reverb` `@doppler`

### State

`@state` `@reactive` `@observable` `@computed`

### IoT / Digital Twins

`@iot_sensor` `@digital_twin` `@mqtt_bridge` `@telemetry`

### Economics / Web3

`@wallet` `@nft_asset` `@token_gated` `@marketplace` `@zora_coins` `@economy_primitive`

### Security / ZK

`@zero_knowledge_proof` `@zk_private` `@rsa_encrypt` `@vulnerability_scanner` `@audit_log`

### AI Generation

`@stable_diffusion` `@ai_inpainting` `@ai_texture_gen` `@neural_forge` `@diffusion_realtime` `@ai_upscaling`

### Human-in-the-Loop

`@hitl` `@feedback_loop` `@biofeedback`

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

| Package                    | Purpose                                   |
| -------------------------- | ----------------------------------------- |
| `@holoscript/core`           | Parser, AST, 2,000+ traits, 30+ compile targets |
| `@holoscript/mcp-server`     | 65 MCP tools for AI agents                |
| `@holoscript/cli`            | holo build · holo compile · holo validate |
| `@holoscript/runtime`        | Scene execution runtime                   |
| `@holoscript/lsp`            | Language Server Protocol                  |
| `@holoscript/llm-provider`   | OpenAI / Anthropic / Gemini SDK           |
| `@holoscript/partner-sdk`    | Webhooks and analytics                    |
| `@holoscript/agent-protocol` | uAA2++ 7-phase agent lifecycle framework  |
| `@holoscript/uaal`           | Universal Autonomous Agent Language VM    |
| `@holoscript/studio`         | Visual IDE (desktop + browser)            |
| `@holoscript/snn-poc`        | Spiking Neural Network / neuromorphic POC |
| `@holoscript/crdt`           | Conflict-free replicated spatial state    |
| `@holoscript/std`            | HoloScript standard library               |
| `holoscript` (PyPI)          | Python bindings + robotics module         |

> **Note**: `@holoscript/traits` is a separate package (named trait constants).
> Core trait implementations and all 30+ compiler targets live inside `@holoscript/core`.
> A separate `@holoscript/compiler` package exists alongside core.

---

## Configuration

MCP servers are configured in:

- `.vscode/mcp.json` - VS Code
- `.antigravity/mcp.json` - Antigravity IDE
- `.claude/settings.json` - Claude Desktop/Code

See `docs/guides/mcp-server.md` for full setup reference.
