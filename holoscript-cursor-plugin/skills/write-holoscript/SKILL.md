---
name: write-holoscript
description: Write or edit HoloScript .holo scene files using the composition, template and object pattern accepted by HoloScript's parser. Use when creating or changing .holo, .hsplus or .hs files.
---

# Write HoloScript

## When to use

- Creating a new `.holo` scene.
- Adding objects, templates, traits or state to an existing scene.
- Converting legacy `orb` blocks to the composition pattern.

## Where the syntax comes from

Every example below is copied from `SYNTAX_DOCS` in
`packages/mcp-server/src/documentation.ts` of the HoloScript repository
(https://github.com/brianonbased-dev/HoloScript). Those exact examples are parsed
through the production parser by
`packages/mcp-server/src/__tests__/syntax-reference-conformance.test.ts`, which is
the guard named in `docs/spec/holoscript-grammar-ssot.md`. That is the only claim
this skill makes: these forms are the ones that test parses. Anything not shown
here may or may not parse; check it against the repository before presenting it
as valid.

## Instructions

1. Start every `.holo` scene with one top-level `composition "<Scene Name>" { ... }`.
2. Put shared looks and behavior in a `template "<Name>" { ... }`; give traits
   (`@grabbable`, `@glowing`) and properties (`geometry`, `color`) there.
3. Place instances with `object "<Name>" using "<Template>" { position: [x, y, z] }`.
4. Use `state { ... }` for per-object values and `action name(params) { ... }`
   for behavior inside a template.
5. Group objects with `spatial_group "<Name>" { ... }`, scene-wide settings with
   `environment { ... }`, and event handlers with `logic { ... }`.
6. Do not write new `orb` blocks; they are legacy.

## Examples (from SYNTAX_DOCS)

Composition with a template and an object:

```holo
composition "MyScene" {
  template "SphereTemplate" {
    @grabbable @glowing
    geometry: "sphere"
    color: "#00ffff"
  }

  object "MySphere" using "SphereTemplate" {
    position: [0, 1, 0]
  }
}
```

Template with state and an action:

```holo
template "Enemy" {
  geometry: "model/enemy.glb"

  state {
    health: 100
    damage: 10
  }

  action takeDamage(amount) {
    health -= amount
    if (health <= 0) destroy()
  }
}
```

Complete scene with environment, a spatial group and logic:

```holo
composition "Forest Clearing" {
  environment {
    skybox: "forest"
    ambient_light: 0.4
  }

  spatial_group "Trees" {
    object "Oak_1" { position: [-3, 0, -5] }
    object "Oak_2" { position: [3, 0, -4] }
  }

  logic {
    on_player_enter() {
      audio.play("forest-ambience.mp3")
    }
  }
}
```
