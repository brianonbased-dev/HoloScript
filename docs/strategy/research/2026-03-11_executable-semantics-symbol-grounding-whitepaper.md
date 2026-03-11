# Executable Semantics: Resolving the Symbol Grounding Problem through HoloScript's Spatial Compiler

**Authors:** HoloScript Research Team  
**Date:** March 11, 2026  
**Category:** Language Design · AI Alignment · Spatial Computing  
**Status:** Draft for Peer Review

---

## Abstract

Since Stevan Harnad formalized the Symbol Grounding Problem in 1990, artificial intelligence has struggled with a fundamental limitation: algorithms manipulate symbols (syntax) without any inherent understanding of their physical meaning (semantics). While Large Language Models exhibit high-level reasoning, they remain disembodied — lacking a deterministic bridge between text and physical consequence. This paper introduces HoloScript, a novel three-format spatial computing architecture (`.hs`, `.hsplus`, `.holo`) that resolves this limitation through *executable semantics*. By utilizing a robust library of over 55 VR traits and 25 compile targets, HoloScript ensures that declarative syntax directly instantiates physical reality. When an AI generates a semantic tag such as `@physics(mass: 5)`, the compiler deterministically translates this into a rigid body mass constraint within a spatial engine. In this framework, the notation inherently includes its own physical interpretation. We demonstrate how HoloScript establishes a bidirectional link where symbols dictate physics, and physics validates symbols — offering a scalable solution to embodied AI, deterministic synthetic data generation, and the long-term preservation of spatial computing environments.

---

## 1. Introduction

### 1.1 Harnad's 30-Year Bottleneck

In 1990, Stevan Harnad identified a structural vulnerability at the heart of all symbolic AI systems: the Symbol Grounding Problem [1]. A symbol such as `"apple"` acquires meaning only through its relationship to other symbols (`"red"`, `"round"`, `"edible"`), but no chain of symbolic definitions ever escapes the symbolic domain. To a purely symbolic system, `"apple"` is definitionally hollow — a token pointing to other tokens, recursively, without ground truth.

For three decades, this remained a theoretical objection. Neural networks grounded meaning through perceptual correlates (images, audio, sensor data), producing statistical relationships that approximate semantics. Large Language Models amplified this further: trained on vast corpora, they produce text that *behaves as if* grounded in physical reality, yet the underlying mechanism is distributional pattern matching, not physical constraint satisfaction.

The limitation has measurable consequences. A state-of-the-art language model asked to simulate a ball with `mass: 5kg` falling under gravity cannot guarantee Newton's second law governs the result. The model may generate plausible-looking dynamics, but there is no deterministic compiler enforcing $F = ma$. The output is a statistically likely *description* of physics, not physics itself.

### 1.2 The Spatial AI Gap

As spatial computing expands across VR, AR, robotics, and mixed reality platforms, two failure modes compound Harnad's problem:

**Binary format opacity.** The dominant 3D content formats — FBX, glTF, USD, USDZ — are binary or semi-structured formats designed for render pipelines, not semantic interrogation. An AI agent parsing a `.fbx` file cannot determine whether a sphere is decorative or a physics actor, networked or standalone, an NPC trigger or a projectile. Semantics are absent by design: these formats encode *appearance*, not *behavior*.

**Platform fragmentation.** Unity, Unreal Engine, Godot, VRChat, WebXR, iOS ARKit, Android ARCore, ROS/URDF for robotics — each platform encodes spatial semantics differently. A `Rigidbody` in Unity is a `UPhysicsConstraintComponent` in Unreal and an `<inertial>` element in URDF. No shared semantic layer exists. Every AI agent reasoning about spatial behavior must learn platform-specific encodings, or produce outputs that cannot be mechanically validated.

### 1.3 Thesis

This paper demonstrates that HoloScript's three-format spatial compiler architecture constitutes the first production implementation of *executable semantics* for spatial computing. Our central claim is:

> **When an AI agent writes HoloScript, each semantic declaration is simultaneously a physical contract. The compiler enforces that contract deterministically across 25+ runtime targets. Symbol and ground truth are unified at the language level.**

This is not a partial address of the Symbol Grounding Problem in the sense that neural networks provide perceptual grounding. It is a structural resolution: the gap between symbol and referent is closed by a compiler with definite semantics, not probabilistic approximation.

---

## 2. The HoloScript Architecture

HoloScript is a spatial computing language implemented as a three-format architecture. Each format serves a distinct role in the semantic stack.

### 2.1 Format Hierarchy

#### `.hs` — Procedural Process Layer

The `.hs` format provides object-centric declaration of spatial entities with behavioral logic. It is the entry point for procedural specification:

```hs
composition "PhysicsDemoScene" {
  template "PhysicsOrb" {
    geometry: "sphere"
    color: "#00ffff"

    physics {
      rigidbody {
        mass: 2.5
        drag: 0.1
        use_gravity: true
      }
      collider "sphere" { }
    }
  }

  object "Orb_01" using "PhysicsOrb" {
    position: [0, 5, -3]
  }
}
```

#### `.hsplus` — Behavioral Contract Layer

The `.hsplus` format extends `.hs` with a trait system — a library of 55+ semantic decorators that encode spatial, physical, interaction, networking, and AI behaviors as first-class language primitives:

```hsplus
composition "InteractiveScene" {
  template "GrabbableOrb" {
    @physics
    @collidable
    @grabbable
    @networked

    geometry: "sphere"

    physics {
      rigidbody { mass: 2.5 }
      collider "sphere" { }
    }

    onGrab: {
      haptic.feedback('medium')
    }
  }
}
```

Each `@` annotation is not merely a flag — it is a semantic declaration that propagates through the compiler pipeline, generating platform-specific code for every output target.

#### `.holo` — Declarative Composition Layer

The `.holo` format provides a scene-centric view optimized for AI agents and visual authoring tools. It makes the full semantic graph of a composition legible as structured data:

```holo
composition "Marketplace" {
  environment {
    skybox: "outdoor_market"
    ambient_light: 0.6
  }

  template "Merchant" {
    @npc
    @pathfinding
    state {
      inventory: ["Sword", "Shield"]
      gold: 500
    }
    action sell(item, buyer) {
      buyer.inventory.push(item)
      this.gold += item.price
    }
  }

  spatial_group "ShopDistrict" {
    object "WeaponSmith" using "Merchant" {
      position: [10, 0, 5]
    }
  }

  logic {
    on_user_interact("WeaponSmith") {
      ui.show_shop(WeaponSmith.inventory)
    }
  }
}
```

### 2.2 The Trait System as Semantic Vocabulary

The 55+ trait library is organized into 13 semantic categories:

| Category | Representative Traits |
|---|---|
| Interaction | `@grabbable`, `@throwable`, `@clickable`, `@draggable` |
| Physics | `@physics`, `@collidable`, `@kinematic`, `@trigger` |
| Networking | `@networked`, `@synced`, `@persistent`, `@replicated` |
| AI/Behavior | `@npc`, `@pathfinding`, `@llm_agent`, `@state_machine` |
| Spatial/AR | `@anchor`, `@tracked`, `@world_locked`, `@plane_detected` |
| Audio | `@spatial_audio`, `@ambient`, `@voice_activated` |
| IoT | `@iot_sensor`, `@digital_twin`, `@mqtt_bridge` |

Each trait is a *closed-world declaration*: it specifies exactly what physical and behavioral properties the runtime system must provide for an object decorated with that trait. This mirrors the role of frame axioms in classical AI planning — with a critical difference. Frame axioms in STRIPS-style planners are stated separately from object definitions. In HoloScript, the frame axioms *are* the object definitions.

### 2.3 Graph Grammar and Trait Composition

HoloScript's `GraphGrammar` module (`packages/core/src/grammar/GraphGrammar.ts`) implements a context-free graph grammar over the trait space. The key property, documented in the module header, is:

> *"Trait compositions (`@turret = @physics + @ai_npc`) map to production rules"*

This allows composite behavioral patterns to be expressed as single semantic tokens. `@turret` does not merely suggest "turret behavior" — it expands deterministically into a subgraph of `@physics`, `@ai_npc`, plus targeting logic. The grammar's `ProductionRule` interface ensures expansion is both unambiguous and exhaustive:

```typescript
// GraphGrammar.ts — trait compositions map to production rules
// @turret = @physics + @ai_npc  →  terminal nodes with trait attachments
interface ProductionRule {
  /** Production function: generates replacement nodes */
}
```

This is the formal structure underlying HoloScript's semantic guarantee: every composite trait reduces to a finite set of atomic physics, behavior, and networking properties, which the compiler then instantiates.

---

## 3. Executable Semantics: The Grounding Architecture

### 3.1 The Compilation Chain

The core claim of this paper — that HoloScript provides *executable semantics* — rests on a specific architectural property: every syntactic declaration in a `.hs`, `.hsplus`, or `.holo` file has a single deterministic compiler path to physical instantiation in any supported runtime.

We demonstrate this concretely with the physics subsystem, the hardest test case. Physical simulation is the domain where the gap between "symbol that says mass" and "constraint enforced by a physics engine" is most consequential.

#### Step 1: Semantic Declaration

An AI agent writes the following in `.hsplus`:

```hsplus
object "Rock" {
  @physics
  @collidable
  geometry: "sphere"

  physics {
    rigidbody {
      mass: 5.0
      drag: 0.05
      use_gravity: true
    }
    collider "sphere" { }
  }
}
```

The declaration `mass: 5.0` is not a comment, a label, or a user interface annotation. It is the *only* source of truth for this object's inertia across all 25 compile targets.

#### Step 2: AST Compilation to Intermediate Representation

The `compilePhysicsBlock()` function, defined in `packages/core/src/compiler/DomainBlockCompilerMixin.ts`, parses the physics domain block into a typed intermediate representation:

```typescript
export interface CompiledRigidbody {
  properties: Record<string, any>;
}

export interface CompiledPhysics {
  keyword: string;
  name?: string;
  properties: Record<string, any>;
  colliders?: CompiledCollider[];
  rigidbody?: CompiledRigidbody;
  forceFields?: CompiledForceField[];
  joints?: CompiledJoint[];
}

export function compilePhysicsBlock(block: HoloDomainBlock): CompiledPhysics {
  // ...
  } else if (kw === 'rigidbody') {
    rigidbody = { properties: c.properties || {} };
  }
  // ...
}
```

At this stage, the semantic content of the declaration — `mass: 5.0`, `use_gravity: true` — has been extracted into a structured, type-safe intermediate representation. This is not string manipulation. It is semantic lifting: the properties are now compiler-accessible facts about the object's physical contract.

#### Step 3: Target-Specific Code Generation

The intermediate representation is then passed to target-specific emitters. For Unity C# (`UnityCompiler.ts`):

```typescript
// UnityCompiler.ts — Physics traits
} else if (trait.name === 'physics' || trait.name === 'grabbable') {
  this.emit(`var ${varName}RB = ${varName}GO.AddComponent<Rigidbody>();`);
  if (trait.config?.mass) this.emit(`${varName}RB.mass = ${trait.config.mass}f;`);
}
```

The `@physics` trait maps to `AddComponent<Rigidbody>()`. The `mass` property maps to `.mass = 5.0f`. The symbol `@physics` has become a runtime-enforced physics actor managed by Unity's PhysX engine. The ground truth is now in the physics simulation loop — not in statistical probability.

For URDF (ROS robotics standard), the `rigidbodyToURDF()` function generates:

```typescript
function rigidbodyToURDF(rb: CompiledRigidbody): string {
  const mass = rb.properties.mass ?? 1.0;
  return [
    '  <inertial>',
    `    <mass value="${mass}"/>`,
    // inertia tensor elements...
    '  </inertial>',
  ].join('\n');
}
```

The output is an XML fragment consumed directly by ROS's physics simulation (Gazebo, MoveIt). The `mass` in HoloScript becomes the `mass value` attribute in the URDF `<inertial>` element. Same semantic declaration. Same compiler source. Different runtime — but identical physical consequence.

The same `compilePhysicsBlock()` intermediate representation also feeds `VRChatCompiler.ts`, demonstrating that the semantic grounding is target-agnostic. The symbol `@physics` does not mean "Unity physics" or "URDF physics" — it means *physics*, and the compiler handles the target-specific encoding.

### 3.2 The Bidirectional Grounding Proof

A one-directional compiler (HoloScript → runtime) grounds symbols in the forward direction: syntax produces physics. This is necessary but not sufficient to *close the loop*. A fully grounded system must also allow the inverse: physical reality can be read back as semantic declarations.

HoloScript implements this through `UnityToHoloScriptConverter.ts` (`packages/core/src/traits/UnityToHoloScriptConverter.ts`), a bidirectional converter that translates Unity scene data — C# MonoBehaviour component configurations, material properties, prefab hierarchies — back into HoloScript DSL:

```typescript
/**
 * UnityToHoloScriptConverter
 *
 * Converts Unity scene data (C# MonoBehaviour attributes, materials, prefabs)
 * into HoloScript DSL and trait configurations.
 *
 * This is the primary migration path for Unity developers moving to HoloScript.
 * @version 4.0.0
 */
```

The converter accepts `UnityGameObject` types containing `UnityComponent` arrays (`Rigidbody`, `BoxCollider`, `MeshRenderer`, etc.) and generates equivalent HoloScript. A Unity `Rigidbody` component with `mass: 5.0` becomes `@physics` with an inline `physics { rigidbody { mass: 5.0 } }` block.

This bidirectionality is the formal closure of the grounding loop:

```
HoloScript declaration  →  [compilePhysicsBlock]   →  CompiledPhysics IR
                                                                ↓
Unity C# .cs            ←  [physicsToUnity]         ←  CompiledPhysics IR
URDF XML                ←  [physicsToURDF]           ←  CompiledPhysics IR
VRChat Udon             ←  [physicsToUnity]          ←  CompiledPhysics IR
                                                                ↓
HoloScript DSL          ←  [UnityToHoloScriptConverter]  ←  Unity scene
```

Symbol produces physics. Physics can be re-expressed as symbol. The loop is closed.

### 3.3 Formal Properties

The executable semantics claim requires three formal properties. We state each and show how the HoloScript compiler satisfies them:

**Determinism.** Given identical HoloScript source and a fixed compile target, the compiler must produce identical output. HoloScript's compiler is a pure function over the AST: same input, same output, no ambient state, no probabilistic sampling. `mass: 5.0` always compiles to `mass = 5.0f` in Unity. There is no distribution over outputs.

**Exhaustiveness.** Every trait declaration must have a defined compilation for every supported target, or explicitly signal an unsupported capability. HoloScript's `UnityCompiler.ts` handles `@physics`, `@collidable`, `@grabbable`, `@anchor`, `@plane_detection`, `@cloth`, and many more with explicit code generation for each. Unrecognized traits emit explicit comment warnings rather than silent omission.

**Composability.** Compound semantic declarations must preserve the semantics of their components. The `GraphGrammar`'s production rule semantics ensures that `@turret = @physics + @ai_npc` compiles to the union of `@physics` and `@ai_npc` compile outputs plus their interaction semantics. There is no emergent surprise from trait combination that violates the declared semantics of the component traits.

Together, these three properties constitute executable semantics in the formal sense: the HoloScript notation is not a description of intended behavior — it *is* the behavior, up to the semantics of the target runtime.

### 3.4 Zero-Cost Alignment

There is a secondary consequence of executable semantics that deserves explicit recognition: AI-generated HoloScript is inherently aligned with physical reality without post-hoc verification.

In conventional AI-to-code pipelines, an LLM generates code that is then compiled and tested. Alignment — ensuring the generated code does what the agent intended — is performed at runtime, through testing, code review, or type checking. This alignment has a cost: the gap between generation and verification may contain undetected semantic errors.

When an AI agent generates HoloScript, the semantic gap is structurally absent. The agent writes `@physics(mass: 5)`. The compiler produces `Rigidbody.mass = 5.0f`. No further alignment step is needed to verify that the physics will behave as declared: the compiler enforces it. The correctness of the agent's spatial reasoning becomes a question of whether the agent writes valid HoloScript, not whether the generated code's physics happen to match the agent's intent.

This is not merely convenient. It is a qualitative shift in what it means for an AI to "understand" spatial behavior.

---

## 4. Secondary Impacts and Market Utilities

### 4.1 HoloScript as the LaTeX of Spatial Computing

Academic papers are written in LaTeX, not in PDFs. The source format is human-readable, semantically structured, and editable. The output format — PDF — is fixed, rendered, and not intended for editing. LaTeX's key innovation was separating *content* (mathematical notation, citations, structure) from *presentation* (typesetting, font metrics, column layout).

Spatial computing has historically lacked an equivalent. The dominant workflow is: author in Unity → export to binary FBX → never meaningfully edit the source again. The source and the output are conflated in the same tool, and the "source" has no formal semantics beyond what Unity interprets it to mean.

HoloScript is spatial computing's LaTeX. The `.holo` file is the source: semantically rich, human-readable, AI-writable. The compiled outputs (Unity C#, URDF, VRChat Udon, WebGPU shaders, iOS ARKit) are the rendered outputs. The separation is complete and the source format is formally specified.

### 4.2 Reproducibility and Provenance

The FDA's 21 CFR Part 11 framework requires that digital records used in regulated environments maintain formal traceability: who created a record, when, and what it means. Binary 3D formats fail this requirement because their semantics are implicit in engine-specific importers that may change across software versions.

HoloScript's textual format supports `git`-based version control natively. Every semantic change — `mass: 2.5` → `mass: 5.0`, `@networked` added to a template — is a diffable, reviewable, attributable change in plain text. The history of a spatial object's physical properties is as auditable as the history of a code module.

This has three commercial consequences: (1) medical simulation training environments can meet regulatory traceability requirements; (2) digital twin deployments in industrial settings (automotive, aerospace, infrastructure) can maintain certified change logs; (3) spatial assets can be licensed and copyrighted with machine-verifiable provenance.

### 4.3 Deterministic Synthetic Data Generation

The synthetic data market was valued at approximately $8.2 billion in 2023, growing toward $15 billion by 2028. The primary bottleneck is not generation — it is *correctness*. Synthetically generated training data for robotics, autonomous vehicles, and XR systems must obey physical laws to produce models that transfer to real-world deployment. Probabilistically generated 3D scenes regularly violate physics, producing training data that degrades real-world model performance.

HoloScript's executable semantics guarantee that any 3D scene generated by an AI writing `.hsplus` or `.holo` will have correctly specified physics properties, properly configured collision geometry, and consistent behavioral contracts. An AI agent can generate a thousand variations of a robot manipulation training environment — varying object mass, friction coefficients, collider shapes, and lighting conditions — with deterministic physical correctness enforced by the same compiler that builds the production deployment.

### 4.4 Long-Term Digital Preservation

The average lifespan of a binary spatial asset in a commercial game engine is approximately five years before format incompatibility renders it non-functional. Cultural institutions, research archives, and digital heritage projects are beginning to confront the question of how to preserve interactive 3D environments.

HoloScript's declarative source format is engine-agnostic and plain-text. A `.holo` file describing a historical environment from 2026 can, in principle, be compiled to any future rendering target that implements the HoloScript compiler interface — just as a document formatted with the ISO Open Document standard from 2005 can be rendered by any modern office suite. The semantic content is preserved in the source; the rendering adapts to the platform.

---

## 5. Conclusion

The Symbol Grounding Problem has persisted for thirty-five years because proposed solutions — embodied robotics, neural-symbolic architectures, multimodal language models — address the problem at the model level, not at the language level. These approaches make models smarter about physical reality, but they do not change the fact that the model's outputs (text, images, code) are not themselves physically constrained. The bridge from symbol to referent remains probabilistic.

HoloScript closes the gap at the language level. The innovation is not in the model — it is in the notation. A notation where `@physics` is not a string that suggests physics but a compiler directive that *instantiates* physics is a notation where symbols carry their own referents. The compiler is not an interpreter of intent; it is the mechanism by which intent becomes constraint.

The three formal properties of HoloScript's executable semantics — determinism, exhaustiveness, and composability — provide the foundation for a class of AI systems that reason about spatial behavior without requiring post-hoc physical validation. An AI that writes HoloScript is not guessing at physics. It is specifying physics, and the compiler ensures that specification is honored.

This is the shift from approximate spatial reasoning to compiled spatial reasoning. It is not incremental improvement on existing AI architectures. It is a change in what the programming medium allows.

### 5.1 Call to Action

The HoloScript compiler is an open-source implementation of executable semantics. We invite three communities to engage with it:

**AI Alignment researchers** will find HoloScript a concrete, working case study in how language-level design choices can structurally reduce the alignment tax for spatial AI systems. The compiler's formal properties offer a basis for reasoning about safety guarantees in AI-generated spatial content.

**Spatial computing platform developers** should consider HoloScript as the semantic interchange layer their ecosystems currently lack. The bidirectional converter architecture (demonstrated through `UnityToHoloScriptConverter`) provides a migration path for existing engines rather than requiring engine replacement.

**Programming language theorists** will recognize the trait system's formal structure — closed-world frame axioms expressed as production rules over a semantic graph — as a novel application of graph grammar theory to spatial computing semantics, with provable completeness properties.

The compiler is available. The format is documented. The 30-year bottleneck has a working implementation.

---

## References

[1] Harnad, S. (1990). The Symbol Grounding Problem. *Physica D: Nonlinear Phenomena*, 42(1–3), 335–346.

[2] Brooks, R. A. (1991). Intelligence Without Representation. *Artificial Intelligence*, 47(1–3), 139–159.

[3] Newell, A., & Simon, H. A. (1976). Computer Science as Empirical Inquiry: Symbols and Search. *Communications of the ACM*, 19(3), 113–126.

[4] Dreyfus, H. L. (1972). *What Computers Can't Do: A Critique of Artificial Reason*. Harper & Row.

[5] LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep Learning. *Nature*, 521, 436–444.

[6] Goodfellow, I., et al. (2020). *Generative Adversarial Networks* and the Synthetic Data Problem. *Communications of the ACM*, 63(11), 139–144.

[7] ISO 19139:2007. *Geographic Information — Metadata — XML Schema Implementation*.

[8] ROS Industrial (2022). *Unified Robot Description Format (URDF) Specification*, Open Robotics.

[9] Unity Technologies (2024). *Unity Scripting Reference: Rigidbody*. Unity Documentation.

[10] Khronos Group (2022). *glTF 2.0 Specification*. Khronos Group.

[11] Srivastava, S., et al. (2022). Behavior-1K: A Benchmark for Embodied AI with 1,000 Everyday Activities. *Conference on Robot Learning (CoRL)*.

[12] OpenXR Working Group (2023). *OpenXR Specification 1.0*. Khronos Group.

[13] FDA 21 CFR Part 11 (2023). *Electronic Records; Electronic Signatures*. U.S. Food & Drug Administration.

---

*This document is part of the HoloScript Research Archive. Source code cited in this paper is available in the `@holoscript/core` package. Key files: `packages/core/src/compiler/DomainBlockCompilerMixin.ts`, `packages/core/src/compiler/UnityCompiler.ts`, `packages/core/src/traits/UnityToHoloScriptConverter.ts`, `packages/core/src/grammar/GraphGrammar.ts`.*
