# Runtime System Reference (`.hsplus`)

Production runtime features for `.hsplus` compositions: safety-daemon macro, hot-reload versioning, agent communication via topics and channels, and the stdlib I/O sandbox.

---

## `@safe_daemon` — Safety-Trait Macro

`@safe_daemon` is a **parse-time macro** that expands into five safety traits everywhere traits are accepted: `composition`, `world`, `object` nodes, and `brain` declarations. Any per-trait declaration that already exists is **not overwritten** — the macro only fills in the gaps.

### What it expands into

```
@safe_daemon  →  @rate_limiter
                 @circuit_breaker
                 @timeout_guard
                 @economy
                 @structured_logger
```

### Default configuration

| Trait                | Key defaults                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `@rate_limiter`      | `strategy: token_bucket`, `max_tokens: 20`, `refill_rate: 4/min`, `window_ms: 60000`                                                          |
| `@circuit_breaker`   | `failure_threshold: 5`, `window_ms: 300000` (5 min), `reset_timeout_ms: 600000` (10 min), `success_threshold: 2`, `min_requests: 5`           |
| `@timeout_guard`     | `default_timeout_ms: 30000`, `fallback_action: abort`                                                                                         |
| `@economy`           | `initial_balance: 5`, `default_spend_limit: 1`, `spend_limit_period: 3600000` (1 hr), `max_transaction_history: 200`, `escrow_enabled: false` |
| `@structured_logger` | `min_level: info`, `max_entries: 500`, `rotation_count: 100`, `emit_events: true`, `console_output: true`                                     |

### Syntax

```hsplus
brain MonitorAgent : @behavior_tree {
  @safe_daemon

  state active {
    llm_call { prompt: "Check system health" }
  }
}
```

Flat convenience overrides — the most commonly tuned fields:

```hsplus
brain BudgetedAgent : @behavior_tree {
  @safe_daemon {
    budget: 10          // economy.initial_balance
    spend_limit: 2      // economy.default_spend_limit
    rate: 8             // rate_limiter.refill_rate
    max_tokens: 40      // rate_limiter.max_tokens
    timeout_ms: 15000   // timeout_guard.default_timeout_ms
    log_level: "warn"   // structured_logger.min_level
    failure_threshold: 3
    reset_timeout_ms: 300000
    window_ms: 120000
  }

  state active {
    "process_task"
  }
}
```

Nested per-trait overrides for full control:

```hsplus
@safe_daemon {
  economy: {
    initial_balance: 20
    default_spend_limit: 5
    escrow_enabled: true
  }
  circuit_breaker: {
    failure_threshold: 3
    success_threshold: 1
  }
  structured_logger: {
    min_level: "debug"
    max_entries: 1000
  }
}
```

Flat and nested overrides may be combined in one block. Flat convenience keys are applied first, then nested per-trait objects are merged on top.

### When to use `@safe_daemon` vs individual traits

Use `@safe_daemon` when you want safe defaults for **all five dimensions at once** — the typical case for background agents or automated pipelines. Use individual trait annotations when you need to configure only one or two dimensions, or when you want to omit a trait entirely (e.g. omit `@economy` for a composition that has no spend budget concept).

### Example — safe background monitor

```hsplus
brain HealthMonitor : @behavior_tree {
  @safe_daemon {
    budget: 0          // read-only monitoring: no spend
    spend_limit: 0
    timeout_ms: 10000
    log_level: "info"
  }

  state idle {
    transition to check @when { check_interval_elapsed == true }
  }

  state check {
    "probe_service_health"
    transition to idle @when { check_complete == true }
  }
}
```

---

## Hot-Reload: `@version` and `@migrate`

These directives enable **non-destructive schema evolution** for live `.hsplus` compositions. When a composition is reloaded from disk or received over the network, the runtime compares the stored schema version against the current source version and runs the appropriate migration chain before restoring state.

### `@version(N)`

Declares the schema version of this composition as an integer. Place it inside the composition or template body:

```hsplus
composition "Scoreboard" {
  @version(2)

  state {
    score: 0
    level: 1
    playerName: "Unknown"
  }
}
```

The version number is a plain integer, not a semver string. `@version(1)` is the implicit default when no `@version` directive is present.

### `@migrate from(N) { ... }`

Declares a migration block that runs when loading state serialized at version `N`. The body is an arbitrary code block with access to the `state` blackboard:

```hsplus
@migrate from(1) {
  state.level = state.level ?? 1
  state.playerName = state.playerName ?? "Unknown"
}
```

Multiple migration blocks may appear — one per version step:

```hsplus
@migrate from(1) {
  // v1 → v2: add level field
  state.level = 1
}

@migrate from(2) {
  // v2 → v3: rename oldHighScore → bestScore
  state.bestScore = state.oldHighScore ?? 0
  delete state.oldHighScore
}
```

The runtime executes migrations in ascending `fromVersion` order until the live version is reached.

### AST representation

The parser extracts `@version` and `@migrate` from the directive stream into dedicated AST fields:

| Directive              | AST field           | Type                                                       |
| ---------------------- | ------------------- | ---------------------------------------------------------- |
| `@version(N)`          | `node.version`      | `number`                                                   |
| `@migrate from(N) { }` | `node.migrations[]` | `{ type: "Migration", fromVersion: number, body: string }` |

### Complete example — v1 to v3 migration

```hsplus
composition "PlayerProfile" {
  @version(3)

  @migrate from(1) {
    // v1 had no inventory
    state.inventory = []
    state.level = 1
  }

  @migrate from(2) {
    // v2 used a flat XP number; v3 uses an object
    state.experience = { current: state.xp ?? 0, toNextLevel: 100 }
    delete state.xp
  }

  state {
    score: 0
    level: 1
    inventory: []
    experience: { current: 0, toNextLevel: 100 }
  }
}
```

---

## Agent Communication: Topics and Channels

`.hsplus` agents communicate through two complementary mechanisms: **topic subscriptions** for named event streams, and **channel broadcasts** for named message buses. Both decouple senders from receivers so agents can be composed without direct references.

### Topic subscription — `on topic.<event_name>`

Subscribe to a named topic using the `on` keyword with a dotted event name. The handler fires whenever any other agent or system emits on that topic:

```hsplus
composition "AlertSystem" {
  on topic.enemy_spotted {
    console.log("Enemy at:", event.location)
    this.raiseAlarm()
  }

  on topic.all_clear {
    console.log("Threat resolved")
    this.lowerAlarm()
  }
}
```

The dotted form supports arbitrary depth: `on topic.message`, `on message.request_vote`, `on sensor.proximity.near`. Each segment after the first dot is part of the event name.

### Named-string event handler — `on_event("...", e) { }`

The `on_event` form accepts a quoted event name string, which can contain colons (the conventional namespace separator) and arbitrary punctuation that is not valid as a bare identifier:

```hsplus
agent WeatherBot {
  on_event("weather:request") {
    let result = call("weather-api:get_forecast", {
      location: event.location
    })
    emit("weather:response", result)
  }

  on_event("weather:shutdown") {
    // graceful teardown
  }
}
```

`emit(eventName, payload)` broadcasts to all subscribers of that event name. `call(toolName, params)` invokes a named tool and returns its result.

### Channel broadcast — `channel("name").broadcast({ })`

The `channel` call addresses a named message bus and delivers a payload to all listeners on that channel. Use channels when you want all agents on a named bus to receive the same message:

```hsplus
composition "TeamCoordinator" {
  on topic.intruder_detected {
    channel("team-comms").broadcast({
      alert: "intruder_at_gate",
      position: event.position,
      timestamp: Date.now()
    })
  }
}
```

Subscribers listen with `on_event` using the channel name, or via any bus-level subscription the runtime exposes for the channel.

### Loose coupling pattern

Topics and channels intentionally avoid direct agent-to-agent references. A patrol agent emits `on_event("threat:detected", payload)` without knowing which systems care; an alert system subscribes to `on_event("threat:detected")` without knowing who emits it. This keeps compositions independently deployable:

```hsplus
agent PatrolAgent {
  on_event("proximity:close") {
    emit("threat:detected", {
      agentId: self.id,
      location: self.position
    })
  }
}

agent AlertSystem {
  on_event("threat:detected") {
    channel("ops-channel").broadcast({ level: "RED", source: event.agentId })
  }
}
```

### Locomotion reaction triggers

The `movement` event category exposes seven `on_*` reaction triggers that fire in response to locomotion state changes. These are registered in `LocomotionActions.ts` as the SSOT for the parser, LSP, and compiler:

| Trigger       | Fires when              |
| ------------- | ----------------------- |
| `on_move`     | Any movement begins     |
| `on_walk`     | Walk mode activates     |
| `on_run`      | Run mode activates      |
| `on_jump`     | Jump initiated          |
| `on_land`     | Landing detected        |
| `on_strafe`   | Lateral movement begins |
| `on_teleport` | Teleport completes      |

```hsplus
template "PlayerAvatar" {
  @locomotion { default_mode: "walk" }

  on_jump {
    this.playAnimation("jump")
    this.emit("player:jumped", { position: self.position })
  }

  on_land {
    this.playAnimation("land")
    this.applyLandingShake()
  }

  on_teleport {
    this.spawnTeleportEffect(self.position)
  }
}
```

---

## StdlibPolicy — I/O Sandbox

`.hsplus` traits run under a `StdlibPolicy` that enforces **deny-all by default** for all I/O operations. The stdlib action handlers (`fs_read`, `fs_write`, `net_fetch`, `process_exec`, `gpu_compute`, `device_probe`, `media_decode`, `depth_inference`) each check the policy before executing and return `false` with an error key on the blackboard if the operation is not permitted.

### Default policy (deny-all)

```
allowedPaths:        ["compositions", "data", "src", "packages"]
maxFileBytes:        2 MB
allowShell:          false
allowedShellCommands: []
maxShellOutputBytes: 100 KB
shellTimeoutMs:      60000
allowNetwork:        false
allowedHosts:        []
rootDir:             "."
allowMediaDecode:    false
allowDepthInference: false
allowGpuCompute:     false
allowDeviceProbe:    false
allowedDeviceScopes: []
deviceProbeTimeoutMs: 10000
allowDeviceRead:     false
allowDevicePair:     false
allowDeviceCommand:  false
allowHaptic:         false
allowXrSession:      false
allowSensorRead:     false
```

### Stdlib action reference

| Action            | Policy gate                                             | Blackboard output keys                                                                                             |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `fs_read`         | `allowedPaths` + `maxFileBytes`                         | `<prefix>_content`, `<prefix>_exists`, `<prefix>_error`                                                            |
| `fs_write`        | `allowedPaths` + `maxFileBytes`                         | `<prefix>_path`, `<prefix>_bytes`, `<prefix>_error`                                                                |
| `fs_exists`       | path within `rootDir`                                   | `<prefix>_exists`, `<prefix>_error`                                                                                |
| `fs_delete`       | `allowedPaths`                                          | `<prefix>_error`                                                                                                   |
| `net_fetch`       | `allowNetwork` + `allowedHosts`                         | `<prefix>_status`, `<prefix>_body`, `<prefix>_ok`, `<prefix>_error`                                                |
| `process_exec`    | `allowShell` + `allowedShellCommands`                   | `<prefix>_code`, `<prefix>_stdout`, `<prefix>_stderr`, `<prefix>_error`                                            |
| `media_decode`    | `allowMediaDecode` + `maxGifFrames`                     | `<prefix>_frames`, `<prefix>_count`, `<prefix>_error`                                                              |
| `depth_inference` | `allowDepthInference` + `maxMediaResolution`            | `<prefix>_data`, `<prefix>_width`, `<prefix>_height`, `<prefix>_backend`, `<prefix>_inferenceMs`, `<prefix>_error` |
| `gpu_compute`     | `allowGpuCompute`                                       | `<prefix>_outputs`, `<prefix>_dispatchMs`, `<prefix>_error`                                                        |
| `device_probe`    | `allowDeviceProbe` + `allowedDeviceScopes` + scope gate | `<prefix>_ok`, `<prefix>_status`, `<prefix>_receipt`, `<prefix>_denial_receipt`, `<prefix>_error`                  |

The `into:` convention lets you set the blackboard key prefix: `fs_read { path: "data/config.json", into: "cfg" }` writes `cfg_content`, `cfg_exists`, `cfg_error`.

### Path containment

All filesystem actions resolve paths relative to `rootDir` and verify the result stays within an allowed root before touching the filesystem. A path that resolves outside `rootDir` (e.g. `../../secrets`) returns an error without any I/O.

### `process_exec` allowlist

When `allowedShellCommands` is non-empty, only executables whose basename matches an entry may run. The executable is extracted from `cmd` before the first space:

```
allowedShellCommands: ["git", "pnpm", "node"]
```

A `cmd: "git log --oneline"` call passes; `cmd: "rm -rf /"` does not.

### Device probe scope gates

`device_probe` checks **two** levels of gating:

1. `allowDeviceProbe: true` — master gate; false blocks all probes.
2. `allowedDeviceScopes` — the requested `scope` must be listed.
3. First-class scope gates — individual `allow<Scope>` boolean fields for `allowDeviceRead`, `allowDevicePair`, `allowDeviceCommand`, `allowHaptic`, `allowXrSession`, `allowSensorRead`. A scope gate set to `false` emits a `<prefix>_denial_receipt` with `reason: "scope_gate_denied"`.

### Registering stdlib at runtime

The stdlib is registered with `registerStdlib()` from `@holoscript/core/stdlib`:

```typescript
import { registerStdlib, DEFAULT_STDLIB_POLICY } from '@holoscript/core/stdlib';

registerStdlib(runtime, {
  policy: {
    ...DEFAULT_STDLIB_POLICY,
    allowNetwork: true,
    allowedHosts: ['api.example.com'],
  },
  hostCapabilities: caps,
});
```

`holoscript run` auto-registers stdlib with the default policy. Override individual fields to open up only the capabilities the composition needs.

---

## Next Steps

- [Brain & Behavior Tree Reference](./reference-hsplus-brain) — full brain declaration syntax, `@safe_daemon` in brains
- [Cognitive Verbs Reference](./reference-hsplus-cognitive) — `llm_call`, `recall`, `rag_query`, `plan`, `reflect`
- [Event Handlers Reference](./reference-hsplus-events) — lifecycle, collision, VR, and input events
- [State & Actions Reference](./reference-hsplus-state) — reactive state, actions, watchers
