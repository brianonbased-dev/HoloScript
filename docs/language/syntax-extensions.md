# HoloScript Syntax Extensions (Parser v2.1)

The HoloScript parser has been evolved to support "Wild HoloScript" patterns found in the ecosystem, bridging the gap between declarative HoloScript and imperative TypeScript.

## 1. Composition Syntax (`.holo`)

The `.holo` format uses `composition` as the top-level container, wrapping all scene content including environment, templates, objects, and behaviors.

```holo
composition "Scene Name" {
  environment {
    skybox: "preset"
    ambient_light: 0.4
    gravity: [0, -9.81, 0]
  }

  // State object with actions
  object "GameState" {
    state {
      score: 0
      level: 1
    }

    action add_score(points) {
      state.score += points
    }
  }

  // Reusable template with collision handler
  template "Bumper" {
    @physics
    @collidable

    geometry: "cylinder"
    state { points: 100 }

    on_collision(ball) {
      GameState.add_score(state.points)
      flash_color("#ffffff", 100ms)
    }
  }

  // Object instance using template
  object "Bumper1" using "Bumper" {
    position: [0, 0.5, 0]
    glow_color: "#ff00ff"
  }

  // Input bindings
  on_key_down("space") { Player.jump() }

  // UI panels with data binding
  panel "HUD" {
    position: "top-center"
    text "Score" { bind: GameState.state.score }
  }
}
```

### Key `.holo` Features

| Feature         | Syntax                                   | Purpose                         |
| --------------- | ---------------------------------------- | ------------------------------- |
| **Environment** | `environment { ... }`                    | Scene settings, physics, skybox |
| **Templates**   | `template "Name" { ... }`                | Reusable object blueprints      |
| **Objects**     | `object "Name" using "Template" { ... }` | Instances with overrides        |
| **State**       | `state { prop: value }`                  | Reactive state blocks           |
| **Actions**     | `action name(args) { ... }`              | Callable functions              |
| **Collisions**  | `on_collision(other) { ... }`            | Physics event handlers          |
| **Input**       | `on_key_down("key") { ... }`             | Keyboard bindings               |
| **Panels**      | `panel "Name" { ... }`                   | UI definitions                  |
| **Triggers**    | `trigger "event_name"`                   | Emit named events               |

## 2. Hybrid Code Blocks (`.hsplus`)

You can now embed raw TypeScript logic seamlessly within proper HoloScript structures. The parser validates the container structure but treats the inner body as raw code.

Supported blocks: `module`, `script`, `struct`, `enum`, `class`, `interface`.

```hsplus
// Valid in .hsplus
module PhysicsSystem {
  // Raw TypeScript allowed here
  import { Vector3 } from 'three';

  export class Gravity {
    apply(body: RigidBody) {
       body.velocity.y -= 9.8;
    }
  }
}
```

## 2. Arrow Functions

Inline event handlers and reactive logic now support modern Arrow Function syntax.

```holoscript
button#submit {
  text: "Submit"
  // Arrow function with block
  @on_click: () => {
     api.submit();
  }
  // Single expression arrow
  @on_hover: val => tooltip.show(val)
}
```

## 3. Natural Language Connections

Declarative graph connections can be expressed in natural language.

```holoscript
// Connect nodes
connect SourceNode to TargetNode

// Connect with edge type
connect PlayerState to HUD as "updates"
```

## 4. Advanced Directives & Traits

Directives now support block configuration and inline usage.

```holoscript
// Directive Block
@manifest("Level1") {
   version: "1.0"
   assets: [...]
}

// Inline Directive Value
model: @asset("hero-model")
```

## 5. Flexible Member Access

Standard dot-notation is supported in property values.

```holoscript
// Dotted access
target: Agent.config.personality.type

// Call expressions
value: calculate_offset(10, 20)
```

## Standardization Guide

To ensure your `.hsplus` files are compatible with the v2.1 Parser:

1. **Wrap Top-Level Code**: If you have raw TypeScript imports or logic at the top level, wrap them in a `module Name { ... }` block.
2. **Use Structs for Types**: Use `struct Name { ... }` for type definitions where possible, or `interface` (now supported).
3. **Prefer Arrow Functions**: Use `() => { }` for logic callbacks instead of legacy string interpolation.
