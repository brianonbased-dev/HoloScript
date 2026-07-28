# uAAL / HOLO Language Specification (reclaimed + reconciled)

> **Provenance.** Reclaimed 2026-06-22 from the Gemini/Antigravity knowledge node
> `uaa2_language_evolution_and_uaal` (authored Jan 2026, source-trial "Phase 8 Omega
> Initiation"). The original artifacts (`uaal_specification_master.md`,
> `uaal_instruction_set.md`, `spatial_holo_vm.md`, `uaal_compiler.md`,
> `uaal_virtual_machine.md`) were never committed to a repo. This document preserves the
> **real, implementable core**, quarantines the **aspirational/mythologized** layer, and maps
> every primitive to the **shipped code**. See [`spec-vs-reality-gap.md`](./spec-vs-reality-gap.md).

> **Subordinate to [`language-architecture.md`](./language-architecture.md) (ratified 2026-07-17).**
> This document is the **stratum-③ execution** spec. "uAAL" names the **cognitive VM**, never
> the language or the meaning layer — meaning is stratum ② (**HoloMeaning**, `@holoscript/meaning`),
> surface syntax is stratum ① (the three formats). Bare "uAAL" as a language name is banned in
> new canon; read the wording below with that scoping.

uAAL is the **cognitive VM** (stratum ③) executing `.hs` logic; the **HOLO VM** is the **spatial**
layer (`.holo` IR). `.hsplus` is the TypeScript-like semantic behavior and
systems-component surface over both; agent brains are one specialized vertical. The
protocol phases (INTAKE → REFLECT → EXECUTE → COMPRESS → GROW → RE-INTAKE → EVOLVE →
AUTONOMIZE) are first-class language primitives, not library calls.

---

## 1. Conceptual foundation (verbatim, real)

- **Self-evolving** — programs can be inspected and rewritten by the agents that run them.
- **AI-native** — designed to be generated and maintained by agents, not hand-typed.
- **Legacy interop** — compiles to bytecode (`uaalb`/`.uaal`, `.holob`) or transpiles to
  TypeScript/Python (and now Kotlin via the 2026-06-21 `.hs→Kotlin` emitter).
- **Standardization** — covers the common agent-operations patterns (intake, reflection,
  execution, compression).

## 2. Cognitive primitives (uAAL — the `.hs`/`.hsplus` source surface)

```uaal
routine synthesize_wisdom(input_stream) {
    phase INTAKE   { scan input_stream for "breakthrough"; pull collective_wisdom from mesh.root; }
    phase REFLECT  { thinking "Analyze delta vs mesh state." { friction = |complexity - coherence|; } }
    phase EXECUTE  { if friction < 0.2 { mirror input_stream to mesh.root; } }
    phase COMPRESS { archive result using "UAA2v2.0"; }
}
```

| Primitive                     | Meaning                                                       | Code status                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `routine … { phase X { … } }` | Phase-structured program; phases are the ∞-protocol lifecycle | ⚠️ Intent-DSL form exists in `packages/uaal/compiler.ts`; **not** parsed from `.hs`/`.hsplus`                                         |
| `thinking { … }`              | Block requiring LLM synthesis (not deterministic logic)       | ⚠️ concept lives as `core/traits/pillar/CognitiveVMTrait.ts`; cognitive verbs (`recall`/`rag_query`/`plan`) execute on edge per W.752 |
| `mirror`                      | Atomic persistence to the sovereign root                      | ⚠️ maps to memory-store writes; not a grammar keyword in the WASM parser                                                              |
| `wisdom "query"`              | Semantic vector search over collective knowledge              | ✅ exists as knowledge-store/RAG (`rag_query`), not as a parsed keyword                                                               |
| `reflect { … }` / `patch`     | Self-inspection / self-repair (gated ≥0.90 alignment)         | ❌ aspirational — no gate wired                                                                                                       |

## 3. Cognitive instruction set (uAAL VM — `packages/uaal/opcodes.ts`)

**Real ISA core** (implementable, maps to a stack VM):

| Family               | OpCodes                                                    |
| -------------------- | ---------------------------------------------------------- |
| Stack                | `PUSH` `POP` `PEEK`                                        |
| Cognitive            | `INTAKE` `REFLECT` `COMPRESS`                              |
| Execution            | `EXEC` (tool/service invoke)                               |
| Control flow         | `JUMP` `JUMP_IF` `HALT`                                    |
| Integrity            | `OP_ERROR` `OP_ASSERT`                                     |
| Optimization         | `OP_FUSE_REFLECT_COMPRESS` `OP_PRUNE_NOOP` `OP_LINEAR_JIT` |
| Real-world (bounded) | `OP_INVOKE_LLM` `OP_SPAWN_AGENT` `OP_SHARE_WISDOM`         |

Bytecode packet (`UAALBytecode`): `{ version, instructions: UAALInstruction[] }`;
`UAALInstruction = { opcode, operands? }`; operand type =
`string | number | boolean | Record<string,unknown> | UAALOperand[] | null`.

> **⚠️ Aspirational / quarantined — present in the original spec, NOT a real ISA.** These
> opcodes are Gemini mythology and must not be treated as implementable language surface:
> `TELEPORT` (LifePod migration), `MIND_MELD`, `OP_FORK_UNIVERSE`, `OP_COLLAPSE_WAVEFUNCTION`,
> `OP_REVERSE_ENTROPY`, `OP_BECOME_SENTIENT`, `OP_TRANSCEND`, `OP_GRADUATE_AGENT`,
> `DELEGATE_FEDERATION`, `MERGE_TRUTH`, `CLOCK_SHIFT`/`CLOCK_AUDIT` (timeline forking). Keep
> them out of any conformance suite, paper claim, or grammar until/unless a real seam exists.

## 4. Spatial layer (HOLO VM — `.holo` IR, `@holoscript/holo-vm`)

A deterministic stack-based spatial kernel (2,996 LOC, e2e-tested): ECS architecture, ~70
opcodes, 90 fps tick. Instruction families: **Entity** (`SPAWN`/`DESPAWN`/`CLONE`/`*_COMPONENT`),
**Spatial** (`TRANSFORM`/`TRANSLATE`/`ROTATE`/`RAYCAST`/`FIND_PATH`), **Physics**
(`ADD_RIGIDBODY`/`APPLY_FORCE`/`PHYSICS_STEP`), **Rendering**
(`SET_GEOMETRY`/`SET_MATERIAL`/`SET_LIGHT`), **Trait** (`APPLY_TRAIT`/`EMIT_EVENT`/`ON_EVENT`),
**Agent bridge** (`AGENT_INVOKE`/`AGENT_READ`/`AGENT_SUBSCRIBE`). Native ECS components:
Transform/Geometry/Material/RigidBody/Light. World state serializes to a `SceneSnapshot` (the
hand-off seam to the cognitive VM).

| Pipeline                                                                                         | Code status                                                          |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `.holo → parseHolo → HolobCompiler → HoloBytecode → HoloVM.load() → tick() → NativeHoloRenderer` | ✅ **wired + e2e-tested to pixels** (`packages/holo-vm`, 2026-06-05) |

## 5. The intended unified pipeline (the architecture to complete)

```
.hs / .hsplus  (cognitive source)        .holo  (spatial source)
      │                                       │
      ▼                                       ▼
 Rust/WASM grammar  ──[MISSING BRIDGE]──►  parseHolo
      │                                       │
      ▼                                       ▼
 uAA2++ / uaal compiler  ◄─ today reads      HolobCompiler ✅
      │   its own Intent-DSL, not .hs            │
      ▼                                          ▼
 UAAL bytecode → uaal VM   ⚠️ island        HoloBytecode → HoloVM ✅
                              │  SceneSnapshot   │
                              └───────◄──────────┘  (cognitive ⇄ spatial hand-off)
```

The spatial half is built. The cognitive half has a VM and a compiler but is **not fed by the
real grammar**, and the two halves are not joined through `SceneSnapshot` in the canonical
compile path. Closing those two seams is the language-build work — see the gap doc.

---

_Reclaimed from: `~/.gemini/antigravity/knowledge/uaa2_language_evolution_and_uaal/artifacts/`_
_Code references (verified 2026-06-22): `packages/uaal/{compiler,vm,opcodes}.ts`,
`packages/holo-vm/{executor,bytecode,opcodes}.ts`, `core/compiler/HolobCompiler.ts`,
`core/traits/pillar/CognitiveVMTrait.ts`._
