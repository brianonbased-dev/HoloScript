# HoloScript Language Identity

> **Authority:** canonical language-positioning contract. Founder direction confirmed
> 2026-07-16. Implementation claims remain subordinate to code and receipts.

## Canonical identity

**HoloScript is a general-purpose semantic systems programming language under active
construction.** It is intended to program applications, services, runtimes, compilers,
simulations, agents, devices, operating layers, interfaces, and spatial worlds.

The language uses compiler-visible declarations, traits, effects, state graphs, and
compositions so meaning survives optimization and cross-target lowering. Declarative syntax
is a programming mechanism. It is not a claim that HoloScript is a domain-specific language,
configuration format, asset schema, prompt wrapper, or scene-description layer.

## One language, multiple surfaces

`.hs`, `.hsplus`, and `.holo` are capability surfaces of one language. They currently route
different grammar and runtime strengths, but none is a separate product category:

| Surface | Current strongest lane | Language direction |
| --- | --- | --- |
| `.hs` | Logic, processes, headless programs, and data pipelines | General computation lowered to native and VM execution |
| `.hsplus` | Typed behavior, traits, agents, state, and effects | Reusable systems behavior with explicit effects and resource contracts |
| `.holo` | Whole-system composition, environments, platforms, and orchestration | Programs that bind logic, behavior, resources, deployment, and embodiment |

The compiler may expose an AST or intermediate representation for each surface. That makes
HoloScript useful as an IR; it does not make HoloScript "only an IR" or place TypeScript, Rust,
C++, an engine, or a generated artifact above it as the real implementation language.

## Systems-language acceptance gates

HoloScript earns systems-language closure by owning these capabilities rather than asserting
them in positioning copy:

1. **Resource semantics** — memory, ownership/lifetimes or an equivalent safe model, handles,
   cleanup, bounded allocation, and an explicit unsafe boundary.
2. **Machine contracts** — data layout, alignment, calling conventions, stable ABI surfaces,
   FFI, and target feature detection.
3. **Execution semantics** — concurrency, atomics, effects, scheduling, determinism, failure,
   cancellation, and hardware-facing I/O.
4. **Sovereign lowering** — native code generation and owned VM backends that do not require a
   third-party engine to give a HoloScript program meaning.
5. **Systems tooling** — reproducible builds, package/link semantics, debugging, profiling,
   diagnostics, sanitizer-equivalent checks, and receipt-backed verification.
6. **Progressive self-hosting** — compiler, runtime, standard library, and system services move
   into HoloScript as the language becomes capable of carrying them safely.

Generated C++, TypeScript, Rust, shader code, engine projects, and deployment manifests are
useful bridge outputs. They are not substitutes for these gates.

## Current honesty boundary

The repository already contains real parsers, ASTs, traits, interpreters, runtimes, VM paths,
compiler backends, policy-gated I/O, and provenance machinery. Coverage differs by surface and
target. The native bytecode path is still evolving, direct lowering is incomplete in documented
areas, and systems capabilities such as a stable memory/ABI model and self-hosting are not yet
closed.

Therefore:

- Say **"general-purpose semantic systems programming language under active construction."**
- Name the exact shipped path when claiming execution or portability.
- Name the missing acceptance gate when a path still relies on bootstrap TypeScript, Rust,
  generated C++, or an external runtime.
- Do not solve an implementation gap by shrinking the language identity to the currently easiest
  demo surface.

Implementation reconciliation lives in [`spec-vs-reality-gap.md`](./spec-vs-reality-gap.md).
The strategic architecture bar lives in [`../../NORTH_STAR.md`](../../NORTH_STAR.md).

## Wording contract

Use these forms in current canonical and public surfaces:

- **Primary:** "HoloScript is a general-purpose semantic systems programming language."
- **Qualified current-state form:** "HoloScript is a general-purpose semantic systems
  programming language under active construction."
- **Mechanism:** "HoloScript supports declarative, imperative, reactive, and compositional
  programming surfaces whose semantics remain visible to the compiler."
- **Spatial scope:** "Spatial computing is a first-class domain and execution target, not the
  boundary of the language."
- **IR scope:** "HoloScript source lowers through semantic IR; the language is both an authoring
  language and an executable implementation target."

Do not use these as umbrella definitions:

- "a DSL for VR/AR"
- "a declarative scene language"
- "an asset or world-description format"
- "an IR above the real implementation language"
- "a wrapper around Unity, Unreal, Three.js, TypeScript, Rust, or C++"

Specific internal DSLs may keep the term when it is technically accurate—for example a shader,
query, policy, or intent sublanguage. The prohibition is against reducing HoloScript itself to
one of those sublanguages.
