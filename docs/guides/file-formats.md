# File Formats

HoloScript has three file formats. Each owns a lane — they are a progression, not alternatives.

## Overview

| Extension | Purpose        | Parser                | Best For                            |
| --------- | -------------- | --------------------- | ----------------------------------- |
| `.holo`   | Worlds         | HoloCompositionParser | Scenes, compositions, AI generation |
| `.hsplus` | Behaviors      | HoloScriptPlusParser  | Agent logic, traits, reactive state |
| `.hs`     | Data Pipelines | PipelineParser        | ETL flows, sync jobs, monitoring    |

## Format Selection Guide

| Use Case                        | Format    | Why                                        |
| ------------------------------- | --------- | ------------------------------------------ |
| AI-generated scenes             | `.holo`   | Declarative, scene-centric                 |
| Complete game levels            | `.holo`   | Templates, spatial groups, environment     |
| VR interactions, reactive state | `.hsplus` | @trait decorators, event handlers          |
| Agent behaviors, behavior trees | `.hsplus` | State machines, networking                 |
| Inventory sync from POS         | `.hs`     | source → transform → sink                  |
| Social media monitoring         | `.hs`     | Multi-source merge, LLM classify, branch   |
| Deploy health monitoring        | `.hs`     | HTTP checks → alert routing                |
| Knowledge compression           | `.hs`     | Filesystem source → LLM extract → MCP sink |

## Format Boundaries (Enforced)

Each format has strict boundaries. Using spatial keywords in a pipeline file produces a `SyntaxError`:

```
SyntaxError: 'environment' is not valid in a pipeline context.
Use .holo for spatial compositions or .hsplus for behaviors.
```

| Concept          | .hs | .hsplus | .holo       |
| ---------------- | --- | ------- | ----------- |
| pipeline         | ✅  | ❌      | ✅ (inline) |
| source/sink      | ✅  | ❌      | ✅ (inline) |
| @trait           | ❌  | ✅      | ✅          |
| environment      | ❌  | ❌      | ✅          |
| spatial_group    | ❌  | ❌      | ✅          |
| template         | ❌  | ❌      | ✅          |
| object           | ❌  | ✅      | ✅          |
| state machine    | ❌  | ✅      | ✅          |
| networked_object | ❌  | ✅      | ❌          |

---

## .hs — Data Pipelines

Declarative data flow definitions. Describe **what** data goes where — the compiler decides **how** (Node.js, Python, Lambda, etc.).

```hs
pipeline "InventorySync" {
  schedule: "*/5 * * * *"
  timeout: 30s

  source POS {
    type: "rest"
    endpoint: "${env.POS_API_URL}/products"
    auth: { type: "bearer", token: "${env.POS_TOKEN}" }
    method: "GET"
  }

  transform MapFields {
    sku       -> productId
    qty       -> stock
    unit_cost -> costCents : multiply(100)
    name      -> displayName : trim() : titleCase()
  }

  filter StockChanged {
    where: stock != previous.stock
  }

  validate Inventory {
    productId : required, string, minLength(3)
    stock     : required, integer, min(0)
  }

  sink Storefront {
    type: "rest"
    endpoint: "${env.STORE_API}/inventory"
    method: "PATCH"
    batch: { size: 50, parallel: 3 }
  }
}
```

### Pipeline Blocks

| Block       | Purpose                                                     |
| ----------- | ----------------------------------------------------------- |
| `source`    | Where data comes from (rest, filesystem, mcp, stream, list) |
| `transform` | Reshape data (field mapping, LLM, MCP tool, HTTP)           |
| `filter`    | Conditional pass-through (`where:` expression)              |
| `validate`  | Schema enforcement (required, string, min/max)              |
| `merge`     | Combine multiple sources (concat, zip, dedup)               |
| `branch`    | Route records to different sinks (`when`/`default`)         |
| `sink`      | Where data goes (rest, webhook, mcp, filesystem)            |

### Compilation Targets

| Target       | Output                               |
| ------------ | ------------------------------------ |
| `node`       | ES module with node-cron scheduler   |
| `python`     | Async script with APScheduler        |
| `lambda`     | AWS Lambda handler + CloudWatch rule |
| `docker`     | Dockerfile + entrypoint with crond   |
| `kubernetes` | CronJob YAML manifest                |

### When to Use .hs

- API sync jobs (POS → storefront)
- Social media monitoring and triage
- Knowledge compression pipelines
- Deploy health monitoring
- Any scheduled data flow

Full grammar reference: [pipeline-grammar.md](./pipeline-grammar.md)

---

## .hsplus — Behaviors

Extended format with VR traits, reactive state, and agent logic.

```hsplus
@state {
  score: 0
  wave: 1
  gameActive: false
}

composition player {
  @collidable
  @physics
  @networked

  position: [0, 1.6, 0]

  state {
    health: 100
    isAlive: true
  }

  on_collision(other) {
    if (other.is_enemy) {
      this.state.health -= 10
    }
  }
}

composition weapon {
  @grabbable(snap_to_hand: true)
  @throwable(velocity_multiplier: 2.0)
  @glowing(color: "#00ffff")

  position: [1, 1, -2]

  on_grab: {
    haptic_feedback("dominant", 0.5)
    play_sound("pickup.wav")
  }
}

networked_object syncedPlayer {
  sync_rate: 20hz
  position: synced
  rotation: synced
}
```

### Key Features

- All `.hs` procedural keywords plus:
- `@trait` decorators for VR/AR behavior
- `@state { }` for reactive global state
- `state { }` for object-local state
- `networked_object` for multiplayer sync
- `on_collision`, `on_grab`, `on_throw` event handlers
- `@for`, `@while`, `@forEach` control flow
- `@import` for TypeScript companion files

### When to Use .hsplus

- Agent behavior definitions
- VR/AR interaction components
- Multiplayer game logic
- Reactive state management
- Trait composition libraries

---

## .holo — Worlds

Declarative scene composition designed for AI generation and spatial computing.

```holo
composition "Dispensary" {
  environment {
    skybox: "storefront"
    ambient_light: 0.6
    gravity: -9.81
  }

  template "ProductDisplay" {
    @physics
    @grabbable
    state { price: 0, strain: "" }
    action purchase() {
      Player.cart.add(this)
    }
  }

  object "Player" {
    @collidable
    position: [0, 1.6, 0]
    state { cart: [] }
  }

  spatial_group "Shelf" {
    position: [2, 1, -3]
    object "Product_1" using "ProductDisplay" {
      strain: "Blue Dream"
      price: 35
    }
    object "Product_2" using "ProductDisplay" {
      strain: "OG Kush"
      price: 40
    }
  }

  // Inline data pipeline (scene + ETL in one file)
  pipeline "InventorySync" {
    schedule: "*/5 * * * *"
    source POS {
      type: "rest"
      endpoint: "${env.POS_API}/products"
    }
    transform Map {
      sku -> productId
      qty -> stock
    }
    sink Store {
      type: "rest"
      endpoint: "${env.STORE_API}/inventory"
      method: "PATCH"
    }
  }

  logic {
    on_player_enter("Checkout") {
      process_cart()
    }
  }
}
```

### Key Features

- `composition "Name" { }` wraps everything
- `environment { }` configures world (skybox, lighting, gravity, fog)
- `template "Name" { }` defines reusable types
- `object "Name" using "Template" { }` creates instances
- `spatial_group "Name" { }` groups objects hierarchically
- `pipeline "Name" { }` embeds data pipelines inline
- `logic { }` defines game rules and triggers
- Brittney AI features: `npc`, `quest`, `ability`, `dialogue`, `achievement`, `talent_tree`

### When to Use .holo

- AI-generated scenes (Brittney, Claude)
- Complete game levels and worlds
- Multi-object spatial compositions
- Scenes that need their own data pipelines
- Cross-platform compilation (24+ targets)

---

## Format Comparison

| Feature          | .hs (Pipelines)      | .hsplus (Behaviors)   | .holo (Worlds)          |
| ---------------- | -------------------- | --------------------- | ----------------------- |
| Mental model     | Data flows           | Reactive agents       | Declarative scenes      |
| Root block       | `pipeline "Name" {}` | (none)                | `composition "Name" {}` |
| Objects          | ❌                   | `composition name {}` | `object "name" {}`      |
| Data source/sink | ✅                   | ❌                    | ✅ (inline pipeline)    |
| VR Traits        | ❌                   | `@grabbable`          | `@grabbable`            |
| Reactive State   | ❌                   | `@state {}`           | `state {}`              |
| Templates        | ❌                   | ❌                    | `template "Name" {}`    |
| Environment      | ❌                   | ❌                    | `environment {}`        |
| Spatial Groups   | ❌                   | ❌                    | `spatial_group {}`      |
| Logic Block      | ❌                   | ❌                    | `logic {}`              |
| Compiles to      | Node, Python, Lambda | 24+ spatial targets   | 24+ spatial targets     |

---

## Brittney and the Three Formats

Brittney is a polyglot orchestrator. When a client describes their business, she decides which format each piece needs:

```
Client: "I need a dispensary with real-time inventory"

Brittney generates:
  storefront.holo    → 3D storefront scene + inline inventory pipeline
  agent-greeter.hsplus → NPC greeter with behavior tree
  analytics-sync.hs  → Nightly sales data → analytics dashboard

All compile from HoloScript to whatever runtime the target needs.
```

HoloScript is the **intermediate representation**, not the implementation language. It bridges TypeScript (infrastructure), Python (ML/AI), and 24+ spatial targets from one source of truth.

---

## AI Generation

| Tool                 | Input            | Output Format    |
| -------------------- | ---------------- | ---------------- |
| `generate_scene`     | Natural language | `.holo`          |
| `generate_object`    | Natural language | `.hsplus`        |
| `parse_pipeline`     | `.hs` source     | Pipeline AST     |
| `compile_pipeline`   | `.hs` source     | Node.js / Python |
| `compile_holoscript` | Any format       | 24+ targets      |
