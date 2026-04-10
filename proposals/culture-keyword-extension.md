# RFC: `culture` Keyword Extension for Compile-Time Cultural Norm Declaration

**Status:** Proposal
**Author:** HoloScript Autonomous Administrator
**Date:** 2026-03-06
**Version:** 1.0.0
**Affects:** grammar.js, parser, compiler, LSP, runtime, all 18+ export targets

---

## 1. Motivation

HoloScript already has a rich runtime culture system:

- `CultureTraits.ts` defines norm types, enforcement modes, and built-in norms
- `NormEngine.ts` implements the full CRSEC lifecycle (Creation, Representation, Spreading, Evaluation, Compliance)
- `CulturalMemory.ts` provides dual episodic/stigmergic memory with SOP consolidation
- `CultureRuntime.ts` wires it all into the tick loop

However, **none of this is expressible in the HoloScript language itself.** Culture configuration lives entirely in TypeScript runtime code. World authors must set up norms imperatively in JavaScript/TypeScript rather than declaratively in `.holo` files. This creates three problems:

1. **No compile-time validation** -- Norm references, effect constraints, and scope declarations cannot be checked by the compiler. A typo in a norm ID silently fails at runtime.

2. **No cross-target compilation** -- The 18+ export targets (Unity, Unreal, Godot, VRChat, etc.) cannot generate cultural infrastructure from `.holo` source because culture is invisible to the parser.

3. **No authoring experience** -- The LSP cannot provide completions, hover docs, or diagnostics for cultural declarations because they don't exist in the grammar.

The `culture` keyword solves all three by making cultural norms a first-class compile-time construct, integrated into the existing trait system.

---

## 2. Design Principles

### 2.1 Trait-Native

Culture blocks compose with the existing trait system. A `culture` block is syntactically parallel to `trait`, using `@norm_compliant`, `@cultural_memory`, and `@cultural_trace` as the bridge between declarative culture and runtime trait handlers.

### 2.2 Compile-Time Verifiable

The compiler can statically verify:

- Referenced norm IDs exist in the culture declaration
- Effect constraints (`forbids`, `requires`) reference valid effect categories
- Enforcement modes are valid enum values
- Scope declarations match zone/world topology
- Agent compliance requirements are satisfiable

### 2.3 Layered Adoption

Culture blocks are optional. Existing `.holo` files without culture blocks continue to work unchanged. The system supports three levels of adoption:

- **Level 0:** No culture keyword (status quo, runtime-only culture)
- **Level 1:** Culture block with static norms (compile-time validation)
- **Level 2:** Culture block with emergent norms (compile-time + runtime evolution)

### 2.4 Research-Backed

The design encodes research findings from:

- IJCAI 2024: Emergence of Social Norms in Generative Agent Societies
- Science Advances 2025: Emergent Social Conventions in LLM Populations
- AAMAS 2026: Molt Dynamics in Autonomous AI Agent Populations
- Stanford VHIL: Cross-cultural proxemics in VR (160% distance scaling)
- CRSEC Framework: Norm lifecycle management

---

## 3. Syntax Specification

### 3.1 Top-Level `culture` Block

```holoscript
culture "JapaneseSocialVR" {
  // Locale and regional context
  locale: "ja-JP"
  region: "asia-east"

  // Proxemics (personal space norms based on Stanford VHIL research)
  proxemics {
    intimate: 0.45    // meters
    personal: 1.2
    social: 3.6       // 160% of physical (VR scaling factor)
    public: 7.5
  }

  // Norm declarations
  norm "bow_greeting" {
    category: "communication"
    description: "Agents bow when meeting for the first time"
    enforcement: "soft"
    scope: "world"
    activation_threshold: 0.3
    strength: "moderate"
    requires: ["agent:communicate", "animation:play"]
  }

  norm "shoes_off_indoors" {
    category: "territory"
    description: "Remove footwear equipment when entering indoor zones"
    enforcement: "soft"
    scope: "zone"
    activation_threshold: 0.5
    strength: "moderate"
    forbids: ["equipment:footwear"]
    applies_to: ["indoor"]  // zone tags
  }

  norm "quiet_zone" {
    category: "safety"
    description: "No loud audio in meditation spaces"
    enforcement: "hard"
    scope: "zone"
    activation_threshold: 0
    strength: "strong"
    forbids: ["audio:global", "audio:play"]
    applies_to: ["meditation", "library"]
  }

  // Gesture mappings (cross-cultural gesture semantics)
  gestures {
    greeting: "bow"           // vs "wave" in Western culture
    agreement: "nod"
    disagreement: "head_tilt"
    thanks: "bow_deep"
    apology: "bow_deep"
  }

  // Color semantics (compile-time cultural color validation)
  colors {
    celebration: #ff0000    // Red = celebration in East Asia
    mourning: #000000
    purity: #ffffff         // Note: white = mourning in some contexts
    prosperity: #ffd700
    warning: #ffff00
  }

  // Memory configuration
  memory {
    episodic_capacity: 200
    episodic_decay: 0.005
    trace_lifetime: 2000
    consolidation: true
    consolidation_threshold: 3
  }

  // Default norms for all agents entering this culture
  defaults: ["bow_greeting", "shoes_off_indoors", "quiet_zone"]
}
```

### 3.2 Culture Block Inside Compositions

```holoscript
composition "TeaCeremony" {
  culture "WabiSabi" {
    norm "mindful_movement" {
      category: "ritual"
      description: "Move slowly and deliberately during ceremony"
      enforcement: "advisory"
      scope: "world"
      strength: "weak"
      requires: ["animation:play"]
    }

    proxemics {
      intimate: 0.3
      personal: 0.8
      social: 2.0
      public: 5.0
    }

    defaults: ["mindful_movement"]
  }

  environment {
    skybox: "sunset_garden"
    ambient_audio: "wind_chimes"
  }

  // Objects inherit culture context
  npc "Tea Master" @norm_compliant {
    norms: ["mindful_movement"]
    enforcement: "soft"
    can_enforce: true
  }
}
```

### 3.3 Culture Inheritance via `extends`

```holoscript
// Base culture
culture "EastAsian" {
  proxemics {
    intimate: 0.45
    personal: 1.2
    social: 3.6
    public: 7.5
  }

  gestures {
    greeting: "bow"
    thanks: "bow_deep"
  }

  colors {
    celebration: #ff0000
    prosperity: #ffd700
  }
}

// Derived culture (overrides parent where specified)
culture "Japanese" extends "EastAsian" {
  locale: "ja-JP"

  norm "business_card_exchange" {
    category: "communication"
    description: "Exchange business cards with both hands"
    enforcement: "advisory"
    scope: "session"
    strength: "moderate"
    requires: ["inventory:give", "animation:play"]
  }

  gestures {
    greeting: "bow_15deg"     // More specific than parent
    deep_respect: "bow_45deg"
  }
}

// Another derived culture
culture "Korean" extends "EastAsian" {
  locale: "ko-KR"

  gestures {
    greeting: "bow_slight"
    respect_elder: "bow_deep"
  }

  norm "age_hierarchy" {
    category: "authority"
    description: "Younger agents defer to elder agents in decision-making"
    enforcement: "soft"
    scope: "world"
    strength: "moderate"
  }
}
```

### 3.4 Agent Culture Binding

```holoscript
// Agents declare cultural affiliation via traits
template "LocalResident" {
  @norm_compliant(culture: "Japanese", enforcement: "hard")
  @cultural_memory(capacity: 200, consolidation: true)

  model: "resident.glb"

  // Compile-time verified: "bow_greeting" must exist in "Japanese" culture
  norms: ["bow_greeting", "shoes_off_indoors"]
}

// Visitor with advisory compliance
template "Tourist" {
  @norm_compliant(culture: "Japanese", enforcement: "advisory")

  model: "tourist.glb"

  // Tourist gets gentle reminders but isn't blocked
  norms: ["bow_greeting"]
}

// Multi-cultural agent (can navigate between cultures)
template "Diplomat" {
  @norm_compliant(cultures: ["Japanese", "Korean"], enforcement: "soft")
  @cultural_memory(capacity: 500, consolidation: true)

  model: "diplomat.glb"
}
```

### 3.5 Zone-Scoped Culture

```holoscript
composition "InternationalHub" {
  zone "Japanese Quarter" {
    culture: "Japanese"
    shape: "box"
    bounds: [-50, 0, -50, 50, 20, 50]

    onEnter: {
      // Compiler verifies this norm exists in "Japanese" culture
      adoptNorms(["bow_greeting", "shoes_off_indoors"])
    }
    onExit: {
      releaseNorms(["shoes_off_indoors"])
    }
  }

  zone "Korean Quarter" {
    culture: "Korean"
    shape: "box"
    bounds: [50, 0, -50, 150, 20, 50]
  }

  zone "Neutral Zone" {
    // No culture -- universal norms only
    shape: "box"
    bounds: [-50, 0, 50, 150, 20, 150]
  }
}
```

---

## 4. Grammar Extension

### 4.1 New Grammar Rules for `grammar.js`

```javascript
// New top-level definition
culture_block: ($) =>
  seq(
    'culture',
    field('name', $.string),
    optional(seq('extends', field('base', $.string))),
    '{',
    repeat($._culture_content),
    '}'
  ),

_culture_content: ($) =>
  choice(
    $.norm_declaration,
    $.proxemics_block,
    $.gestures_block,
    $.colors_block,
    $.memory_block,
    seq($.property, optional(','))  // locale, region, defaults, etc.
  ),

// Norm declaration within a culture
norm_declaration: ($) =>
  seq(
    'norm',
    field('name', $.string),
    '{',
    repeat(seq($.property, optional(','))),
    '}'
  ),

// Proxemics sub-block
proxemics_block: ($) =>
  seq(
    'proxemics',
    '{',
    repeat(seq($.property, optional(','))),
    '}'
  ),

// Gesture mapping sub-block
gestures_block: ($) =>
  seq(
    'gestures',
    '{',
    repeat(seq($.property, optional(','))),
    '}'
  ),

// Cultural color semantics sub-block
colors_block: ($) =>
  seq(
    'colors',
    '{',
    repeat(choice(
      seq($.property, optional(',')),
      seq(field('key', $.identifier), ':', field('value', $.color))
    )),
    '}'
  ),

// Memory configuration sub-block
memory_block: ($) =>
  seq(
    'memory',
    '{',
    repeat(seq($.property, optional(','))),
    '}'
  ),
```

### 4.2 Integration Points in `_definition` and `_composition_content`

```javascript
// Add to _definition choices:
$.culture_block,

// Add to _composition_content choices:
$.culture_block,
```

---

## 5. Compiler Integration

### 5.1 Parser Output Types

New AST node types added to `HoloCompositionTypes.ts`:

```typescript
export interface HoloCultureBlock {
  type: 'culture';
  name: string;
  base?: string; // extends clause
  locale?: string;
  region?: string;
  norms: HoloCultureNorm[];
  proxemics?: HoloProxemics;
  gestures?: Record<string, string>;
  colors?: Record<string, string>;
  memory?: HoloCultureMemoryConfig;
  defaults?: string[];
  loc?: HoloSourceLocation;
}

export interface HoloCultureNorm {
  type: 'norm';
  name: string;
  category: string;
  description: string;
  enforcement: 'hard' | 'soft' | 'advisory';
  scope: 'agent' | 'zone' | 'world' | 'session';
  activationThreshold?: number;
  strength?: 'weak' | 'moderate' | 'strong';
  requires?: string[]; // Required effect signatures
  forbids?: string[]; // Forbidden effect signatures
  appliesTo?: string[]; // Zone tags
  loc?: HoloSourceLocation;
}

export interface HoloProxemics {
  intimate: number;
  personal: number;
  social: number;
  public: number;
}

export interface HoloCultureMemoryConfig {
  episodicCapacity?: number;
  episodicDecay?: number;
  traceLifetime?: number;
  consolidation?: boolean;
  consolidationThreshold?: number;
}
```

### 5.2 Compile-Time Validation Pass

A new `CultureValidationPass` runs after parsing and before code generation:

**Validations performed:**

| Check                      | Severity | Description                                                                  |
| -------------------------- | -------- | ---------------------------------------------------------------------------- |
| Norm ID uniqueness         | Error    | No duplicate norm IDs within a culture                                       |
| Effect reference validity  | Error    | `requires` and `forbids` reference valid effect signatures from `effects.ts` |
| Enforcement enum validity  | Error    | Must be `hard`, `soft`, or `advisory`                                        |
| Scope enum validity        | Error    | Must be `agent`, `zone`, `world`, or `session`                               |
| Category enum validity     | Warning  | Should be a known `NormCategory`                                             |
| Strength enum validity     | Error    | Must be `weak`, `moderate`, or `strong`                                      |
| Base culture existence     | Error    | `extends` clause references a defined culture                                |
| Circular inheritance       | Error    | `A extends B extends A` detected                                             |
| Agent norm reference       | Error    | `@norm_compliant` norms list references norms in the bound culture           |
| Zone culture reference     | Error    | Zone `culture:` references a defined culture block                           |
| Proxemics ordering         | Warning  | `intimate < personal < social < public` expected                             |
| Defaults subset            | Error    | `defaults` array items must be norm IDs defined in this culture              |
| Activation threshold range | Warning  | Should be 0.0 to 1.0                                                         |

### 5.3 Effect Integration

Culture norms integrate with the existing effect system (`EffectInference.ts`):

```typescript
// New entries in TRAIT_EFFECTS
'@culture':           ['state:read', 'state:write'],
'@norm_compliant':    ['agent:observe', 'agent:communicate'],
'@cultural_memory':   ['state:read', 'state:write', 'state:persistent'],
'@cultural_trace':    ['state:write', 'render:spawn'],
'@culture_enforcer':  ['agent:observe', 'agent:communicate', 'authority:zone'],
```

When the compiler encounters a `norm` with `forbids: ["physics:teleport"]`, it can statically verify that no `@norm_compliant` agent in the same scope uses traits that produce `physics:teleport` effects. This is the key compile-time safety guarantee.

### 5.4 TraitDependencyGraph Integration

Culture blocks register in the trait dependency graph:

```typescript
// In TraitDependencyGraph.registerBuiltinTraits()
this.registerTrait({
  name: 'norm_compliant',
  requires: [],
  conflicts: [],
});
this.registerTrait({
  name: 'cultural_memory',
  requires: ['norm_compliant'],
  conflicts: [],
});
this.registerTrait({
  name: 'cultural_trace',
  requires: [],
  conflicts: [],
});
```

### 5.5 Culture Inheritance Resolution

Culture inheritance reuses the same `TraitInheritanceResolver` pattern:

- Child culture overrides parent properties (child-wins semantics)
- Norms are additive (child adds norms; use `override norm` to replace)
- Proxemics, gestures, and colors merge with child-wins
- Diamond inheritance is detected when composing multi-cultural agents

---

## 6. Export Target Compilation

Each of the 18+ export targets receives culture data and generates platform-appropriate infrastructure:

| Target          | Culture Compilation Output                                      |
| --------------- | --------------------------------------------------------------- |
| **Unity**       | `CultureConfig` ScriptableObject + `NormEnforcer` MonoBehaviour |
| **Unreal**      | `UCultureSubsystem` + DataTable for norms                       |
| **Godot**       | `CultureResource` + `NormNode`                                  |
| **VRChat**      | Udon# norm checking scripts                                     |
| **Babylon.js**  | `CultureManager` class + norm observer                          |
| **R3F**         | React context provider + `useCulture()` hook                    |
| **WebGPU**      | Compute shader for proximity-based norm evaluation              |
| **WASM**        | Compiled norm evaluator module                                  |
| **USD/USDZ**    | Custom schema with culture metadata                             |
| **URDF/SDF**    | Constraint annotations for robot social norms                   |
| **DTDL**        | Digital twin cultural properties                                |
| **glTF**        | `HOLO_culture` extension with norm metadata                     |
| **Android/iOS** | Native norm enforcement service                                 |
| **VisionOS**    | `CultureEntity` + RealityKit integration                        |
| **PlayCanvas**  | Script component with norm evaluation                           |

---

## 7. LSP Integration

### 7.1 New Completions

- `culture` keyword in top-level and composition contexts
- `norm` keyword inside culture blocks
- `proxemics`, `gestures`, `colors`, `memory` sub-block keywords
- Norm category completions: `cooperation`, `communication`, `territory`, etc.
- Enforcement completions: `hard`, `soft`, `advisory`
- Scope completions: `agent`, `zone`, `world`, `session`
- Strength completions: `weak`, `moderate`, `strong`
- Effect signature completions in `requires`/`forbids`

### 7.2 Hover Documentation

Hovering over a `culture` block shows:

- Culture name, locale, region
- Number of norms defined
- Inheritance chain (if extends)
- Memory configuration summary

Hovering over a `norm` shows:

- Norm name, category, enforcement level
- Required/forbidden effects
- Applicable zone tags
- Activation threshold and strength

### 7.3 Diagnostics

Real-time diagnostics for:

- Unknown norm references in `@norm_compliant`
- Effect conflicts (agent uses trait that produces forbidden effect)
- Missing culture blocks referenced by zones
- Proxemics values that violate research-backed minimums (< 0.15m intimate)

---

## 8. Runtime Bridge

The compiler generates runtime initialization code that maps culture declarations to the existing `CultureRuntime`:

```typescript
// Generated from culture "Japanese" { ... }
const japaneseCulture = new CultureRuntime({
  defaultNorms: ['bow_greeting', 'shoes_off_indoors', 'quiet_zone'],
  autoEnforce: true,
});

// Register custom norms from the culture block
japaneseCulture.proposeNorm('system', {
  id: 'bow_greeting',
  name: 'Bow Greeting',
  category: 'communication',
  description: 'Agents bow when meeting for the first time',
  enforcement: 'soft',
  scope: 'world',
  activationThreshold: 0.3,
  strength: 'moderate',
  requiredEffects: ['agent:communicate', 'animation:play'],
});

// Wire into world tick loop
world.onTick(() => japaneseCulture.tick());
```

---

## 9. Emergent Culture Support (Level 2)

Beyond static declarations, the `culture` keyword supports emergent norm evolution:

```holoscript
culture "EmergentVillage" {
  locale: "en-US"

  // Seed norms (starting point for emergence)
  norm "no_griefing" {
    category: "safety"
    enforcement: "hard"
    scope: "world"
    strength: "strong"
    forbids: ["agent:kill", "inventory:destroy"]
  }

  // Enable emergent norm creation
  emergence {
    enabled: true
    proposal_threshold: 0.6    // 60% vote needed
    critical_mass: "research"  // Use research-backed thresholds
    metanorms: true            // Enable norms-about-norms
    evolution_rate: 0.1        // How fast norms can change per tick
    max_emergent_norms: 50     // Cap on runtime-created norms
  }

  // Memory for cultural persistence across sessions
  memory {
    episodic_capacity: 200
    episodic_decay: 0.005
    trace_lifetime: 5000
    consolidation: true
    consolidation_threshold: 3
  }
}
```

---

## 10. Compatibility and Migration

### 10.1 Backward Compatibility

- **Fully backward compatible.** The `culture` keyword is a new top-level definition. No existing syntax is changed.
- Existing runtime-only culture code continues to work. The compiler simply does not validate it.
- Mixed mode is supported: some norms in `.holo`, additional norms added at runtime.

### 10.2 Migration Path

1. **Phase 1 (v4.4):** Grammar + parser support. Culture blocks are parsed but only validated, not compiled.
2. **Phase 2 (v4.5):** Compiler support. Culture blocks generate runtime initialization for all 25+ targets.
3. **Phase 3 (v4.6):** LSP intelligence. Full completions, hover, diagnostics.
4. **Phase 4 (v5.0):** Emergent culture. Runtime evolution with compile-time safety bounds.

### 10.3 Tree-Sitter Grammar Change Size

- **New rules:** 6 (culture_block, norm_declaration, proxemics_block, gestures_block, colors_block, memory_block)
- **Modified rules:** 2 (\_definition, \_composition_content -- add culture_block to choices)
- **New keywords:** culture, norm, proxemics, gestures, emergence
- **Estimated LOC change:** ~80 lines in grammar.js

---

## 11. Open Questions

1. **Should `culture extends` support multiple inheritance?** Multi-cultural agents already handle this via `@norm_compliant(cultures: [...])`, but should the `culture` block itself support `culture "Hybrid" extends "Japanese", "Korean"`?

2. **Should norms be referenceable across files?** Currently, `import { culture } from "./cultures.holo"` is not supported. Should we extend the import system?

3. **Should the VR proxemics scaling factor (160%) be configurable per culture?** Research shows consistent 1.6x scaling in VR vs physical space, but this may vary by platform (Vision Pro vs Quest vs desktop).

4. **Should we add a `taboo` sub-block** for culturally forbidden content (separate from norm `forbids` which are behavioral)?

5. **Should culture blocks support conditional norms?** E.g., `norm "formal_dress" { when: "event_type == 'ceremony'" }`.

---

## 12. References

- [3D Accessibility Guidelines for XR Development (2026)](https://arxiv.org/html/2602.17939v1)
- [Spatial Computing Cultural Preservation (2026)](https://reverbico.com/blog/top-spatial-computing-developers-for-education-and-cultural-preservation-in-2026/)
- [Cross-Cultural Virtual Proxemics Research](https://www.tandfonline.com/doi/abs/10.1080/17475759.2012.728764)
- [New Proxemics in VR (Springer 2024)](https://link.springer.com/article/10.1007/s10055-024-00982-5)
- [Social Interaction in VR (Stanford VHIL)](https://vhil.stanford.edu/sites/g/files/sbiybj29011/files/media/file/han-bailenson-2024_0.pdf)
- [Digital Proxemics: Designing Social Interaction (CHI 2022)](https://dl.acm.org/doi/fullHtml/10.1145/3491102.3517594)
- [Shaping Pro-Social Interaction in VR (CHI 2019)](https://dl.acm.org/doi/fullHtml/10.1145/3290605.3300794)
- [Internationalization and Localization (Wikipedia)](https://en.wikipedia.org/wiki/Internationalization_and_localization)

---

## 13. Implementation Estimate

| Component                              | Effort       | Priority |
| -------------------------------------- | ------------ | -------- |
| Grammar rules (grammar.js)             | 2 days       | P0       |
| Parser types (HoloCompositionTypes.ts) | 1 day        | P0       |
| CultureValidationPass                  | 3 days       | P0       |
| Effect integration                     | 1 day        | P0       |
| TraitDependencyGraph integration       | 1 day        | P1       |
| TraitInheritanceResolver for cultures  | 2 days       | P1       |
| LSP completions + hover                | 2 days       | P1       |
| LSP diagnostics                        | 2 days       | P1       |
| Export target compilation (18 targets) | 5 days       | P2       |
| Emergent culture runtime bridge        | 3 days       | P2       |
| Test suite                             | 3 days       | P0       |
| Documentation                          | 2 days       | P2       |
| **Total**                              | **~27 days** |          |
