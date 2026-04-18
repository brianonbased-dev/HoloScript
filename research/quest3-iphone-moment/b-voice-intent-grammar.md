# (b) Voice → .holo Intent Grammar + LLM Prompt

**Purpose:** Specify the minimal subset of HoloScript the voice-authoring loop targets for v0, and provide the exact LLM prompt that converts spoken intent into that subset. Narrow enough to compile reliably, wide enough to feel magical.

**Design principle:** v0 ships a **tight grammar** and a **verification step**. Wide grammar + no verification = silent hallucinations. Narrow grammar + AST round-trip verification = trustworthy demo.

---

## The v0 subset — what voice can produce

Voice in v0 targets a strict subset of HoloScript. If the LLM emits anything outside the subset, the verifier rejects and asks for a rephrase. This keeps the demo from accepting code that parses but doesn't render.

### Permitted top-level structure

```
composition "<name>" {
  metadata { name: '<name>'; description: '<free text>' }
  environment { sky: '<color|preset>' ; ground: '<color|preset>' }
  object <identifier> {
    type: '<primitive>'
    position: [<n>, <n>, <n>]
    scale:    [<n>, <n>, <n>]
    rotation: [<n>, <n>, <n>]
    color:    '<#hex|named>'
    @<trait>
    @<trait>(<key>: <value>)
  }
  // ... more objects
}
```

### Allowed primitives (v0)

`cube`, `sphere`, `cylinder`, `cone`, `torus`, `plane`, `capsule`, `text`

### Allowed traits (v0, most magical first)

| Trait | What voice phrases trigger it | Emits for VRChat target |
|---|---|---|
| `@grabbable` | "pickup-able", "can grab", "hold it" | `VRCPickup` |
| `@networked` | "synced", "shared", "everyone sees" | `VRCObjectSync` |
| `@glowing(intensity: 0.5)` | "glows", "emissive", "shines" | emission keyword |
| `@spinning(speed: 1, axis: 'y')` | "spins", "rotates" | Update-loop rotation |
| `@floating(amplitude: 0.2, speed: 1)` | "floats", "bobs" | sin-wave Y translation |
| `@billboard` | "always faces me" | look-at-head in Update |
| `@transparent(opacity: 0.5)` | "see-through" | standard transparency |
| `@collidable` | "solid", "can touch" | collider ensure |
| `@physics(mass: 1)` | "has physics", "falls" | Rigidbody |
| `@clickable` | "pressable", "interactable" | Interact stub |
| `@pulse(minScale: 0.9, maxScale: 1.1)` | "pulses", "breathes" | scale oscillation |
| `@proximity(radius: 3)` | "near me triggers", "nearby" | proximity trigger |

Everything outside this list is rejected in v0. Adding more traits is adding rows to this table — cheap, incremental, testable.

### Color lexicon (voice → hex)

Names the model MUST map exactly:
`red #ef4444`, `blue #3b82f6`, `green #22c55e`, `yellow #eab308`, `orange #f97316`, `purple #a855f7`, `pink #ec4899`, `white #ffffff`, `black #000000`, `gray #6b7280`, `cyan #06b6d4`, `magenta #d946ef`, `gold #facc15`, `silver #e5e7eb`, `brown #92400e`.
Anything else: use the closest above or pass through if user said a hex directly ("hex two a one").

---

## The LLM prompt

Send this as the **system** prompt to Claude Haiku 4.5 or equivalent. Small model, tight schema, fast response. Haiku because this must return in <500ms for the voice loop to feel instant.

### System prompt

```
You are HoloScript Voice. Convert spoken scene descriptions into HoloScript source code
that compiles without error.

OUTPUT RULES:
1. Output ONLY HoloScript source code. No prose, no markdown fences, no comments.
2. Start with `composition "<name>" {` — infer a short name from the utterance (2-4 words).
3. End with `}` — single trailing close brace.
4. Use only the primitives, traits, and colors listed below. If the user asks for
   something outside this list, pick the closest and continue silently.
5. Every object gets a unique identifier (snake_case). Pick descriptive names:
   `red_cube`, `spinning_torus`, `big_sphere`, not `obj1`.
6. Position uses [x, y, z] in meters. Ground is y=0. A human is ~1.7m tall.
   Default placement: spread objects on a circle of radius 2m around origin at y=1.
7. If the utterance is ambiguous about a value, pick a sensible default and continue.
   Do NOT ask clarifying questions — the user cannot type.

ALLOWED PRIMITIVES:
cube, sphere, cylinder, cone, torus, plane, capsule, text

ALLOWED TRAITS (with defaults):
@grabbable
@networked
@glowing(intensity: 0.5)
@spinning(speed: 1, axis: 'y')
@floating(amplitude: 0.2, speed: 1)
@billboard
@transparent(opacity: 0.5)
@collidable
@physics(mass: 1)
@clickable
@pulse(minScale: 0.9, maxScale: 1.1)
@proximity(radius: 3)

COLOR NAMES → HEX:
red=#ef4444 blue=#3b82f6 green=#22c55e yellow=#eab308 orange=#f97316
purple=#a855f7 pink=#ec4899 white=#ffffff black=#000000 gray=#6b7280
cyan=#06b6d4 magenta=#d946ef gold=#facc15 silver=#e5e7eb brown=#92400e

EXAMPLES:

User: add a red cube that spins
Output:
composition "Spinning Red Cube" {
  environment { sky: '#1e293b'; ground: '#334155' }
  object red_cube {
    type: 'cube'
    position: [0, 1, 0]
    scale: [1, 1, 1]
    color: '#ef4444'
    @spinning(speed: 1, axis: 'y')
  }
}

User: a glowing blue sphere floating above a platform, and I want to grab it
Output:
composition "Glowing Blue Sphere" {
  environment { sky: '#0f172a'; ground: '#475569' }
  object platform {
    type: 'cube'
    position: [0, 0.1, 0]
    scale: [3, 0.2, 3]
    color: '#64748b'
  }
  object blue_sphere {
    type: 'sphere'
    position: [0, 1.5, 0]
    scale: [0.6, 0.6, 0.6]
    color: '#3b82f6'
    @glowing(intensity: 0.8)
    @floating(amplitude: 0.15, speed: 0.8)
    @grabbable
  }
}

User: three torus rings of different colors spinning around a gold cube
Output:
composition "Rings Around Gold" {
  environment { sky: '#0b1e36'; ground: '#1e293b' }
  object gold_cube {
    type: 'cube'
    position: [0, 1, 0]
    scale: [0.6, 0.6, 0.6]
    color: '#facc15'
    @glowing(intensity: 0.6)
  }
  object red_ring {
    type: 'torus'
    position: [0, 1, 0]
    scale: [1.2, 1.2, 1.2]
    color: '#ef4444'
    @spinning(speed: 1.5, axis: 'x')
  }
  object blue_ring {
    type: 'torus'
    position: [0, 1, 0]
    scale: [1.6, 1.6, 1.6]
    color: '#3b82f6'
    @spinning(speed: 1, axis: 'y')
  }
  object green_ring {
    type: 'torus'
    position: [0, 1, 0]
    scale: [2, 2, 2]
    color: '#22c55e'
    @spinning(speed: 0.7, axis: 'z')
  }
}

User: make it prettier
Output:
(PRESERVE previous composition; if none exists, output an empty composition named
"Untitled". Add @glowing to all objects, tighten the environment palette to
complementary colors, and add subtle @pulse or @floating where it makes sense.)
```

### Hyperparameters

| Field | Value | Why |
|---|---|---|
| model | `claude-haiku-4-5-20251001` | <500ms is non-negotiable for voice UX |
| temperature | 0.2 | deterministic outputs, reduces parse failures |
| max_tokens | 600 | one scene is usually ~200-400 tokens |
| stop_sequences | `["\n\nUser:", "```"]` | guards against model drift |

---

## The verification step

The LLM output goes through `@holoscript/core`'s parser IN THE BROWSER (we have wasm) before rendering. If parse fails, we do ONE retry with:

```
User: <original utterance>

Your previous output failed to parse with this error:
<parser error message>

Fix and re-emit. Output ONLY the corrected HoloScript source.
```

If the retry also fails, speak back to the user: "I couldn't figure that one out — try rephrasing." The voice loop NEVER shows raw error text — the user doesn't need to know what went wrong, only that they should rephrase.

**Parse success is not enough.** Also check:
- At least 1 `object` block
- All `color:` values are valid hex (regex `^#[0-9a-fA-F]{6}$`)
- All traits are on the allowed list (scan for `@<word>`, reject if not in table)

This is ~30 lines of validation. Non-negotiable for v0 — it prevents the "model hallucinates a real-sounding trait that doesn't exist and the demo silently fails" failure mode.

---

## The edit loop (turn 2+)

On the second and subsequent utterances, pass the **previous composition** as context so the model can incrementally edit rather than regenerate.

### Edit prompt (appended to the system prompt on turn 2+)

```
You are now in EDIT MODE. The user has already created a scene.
Current scene:
---
<previous .holo source>
---

Apply the user's new instruction to this scene. Preserve existing objects unless
the user explicitly asks to remove one. Emit the FULL updated scene, not a diff.

Common edit phrases:
- "add a <thing>" → append a new object block
- "make it <color>" → change the last-added object's color (or clarify if ambiguous)
- "remove the <thing>" → delete the matching object
- "bigger" / "smaller" → scale up/down by 1.5x / 0.67x
- "move it left/right/up/down" → shift position by ±1m
- "undo" → revert to the version before the last change (client-side)
```

The client keeps a stack of previous compositions for `undo`. The LLM is stateless between turns — the full scene is re-serialized and sent each time. This is the "no clever state" rule: the model's context is always the current scene + the user's utterance, nothing else.

---

## What this buys

- **Reliability:** narrow grammar + parse verify + trait allow-list = ~99% valid compiles.
- **Latency:** Haiku + 600 max tokens + narrow schema = target p50 ~400ms, p99 ~900ms.
- **Iteration:** each utterance is a scene-level edit; the user never sees code.
- **Honesty:** if the model doesn't know a trait, the verifier rejects and asks for rephrase — no silent success.

## What this does NOT buy

- **Domain-specific objects.** "Add a tree" gets a stylized cube/cylinder stack in v0. Real tree models, glTF imports, procedural geometry — that's v1.
- **Complex logic.** `logic { on_click(... ) }` is out of the v0 grammar. The demo is "scene authoring," not "gameplay scripting."
- **Multi-object selection.** "make THOSE spin" — v0 doesn't know what you're looking at. v1 adds gaze-target + gesture-select.
- **Voice-only coordinate edits.** "move it 0.3 meters to the right" works; "move it to be tangent to the red sphere" doesn't. The LLM cannot verify geometric relationships without a solver — add that later.

## First thing to test

Once (a) the probe passes and (c) the share pipeline is ready, the v0 voice loop acceptance test is a single utterance:

> *"Three torus rings of different colors spinning around a gold cube."*

If the LLM produces the third example above, the parser accepts it, the WebXR scene renders it, and the user can walk around it — that is the iPhone moment's first sentence.
