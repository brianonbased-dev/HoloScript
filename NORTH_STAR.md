# North Star -- HoloScript

**Role**: General-purpose semantic systems programming language and its sovereign compiler/runtime stack.
**Upstream oracle**: `~/.ai-ecosystem/NORTH_STAR.md` (read that for decision trees, workflow patterns, cost thresholds)
**No local STRATEGY.md or SYSTEM_MAP.md**: ratified-directions and system-map content live upstream at `~/.ai-ecosystem/STRATEGY.md` and `~/.ai-ecosystem/SYSTEM_MAP.md` — cross-repo citations naming those files unqualified mean the ai-ecosystem repo, not this one.
**GOLD Drive**: `GOLD_ROOT` or default vault root when mounted (Diamond > Platinum > GOLD > knowledge store) — intake per `~/.ai-ecosystem/CLAUDE.md`. **Live entry counts** are only authoritative in `$GOLD_ROOT/INDEX.md` (not this file).

## Language identity — load-bearing

**HoloScript is a general-purpose semantic systems programming language under active construction.**
It is not a spatial DSL, scene notation, asset format, prompt wrapper, or transpiler front end. Its
declarative composition model is one way to express programs; it does not limit what programs may
own. The language target includes applications, services, runtimes, compilers, simulations, agents,
devices, operating layers, and worlds.

Systems-language claims are earned structurally. The language must progressively own:

- memory, resource, lifetime, and unsafe-boundary semantics;
- data layout, calling conventions, ABI stability, and FFI;
- concurrency, effects, determinism, and hardware-facing I/O;
- sovereign native code generation, VM execution, debugging, and profiling;
- enough compiler, runtime, and standard-library implementation to self-host in stages.

Until each layer is proven, say what is implemented and name the gap. Generating C++, TypeScript,
Rust, engine projects, or deployment manifests is bridge evidence, not proof that HoloScript already
owns the underlying systems layer. Canonical wording and acceptance gates live in
[`docs/spec/language-identity.md`](docs/spec/language-identity.md).

## ∞ The Thesis (founder-ratified 2026-06-15) — read before any architectural call

**HoloScript exists so anyone, using any AI, can produce a simulation that _is_ a theorem about
reality — the simulation's execution constitutes the proof of its own correctness — and that proof
is universal and remixable because it is parametric and composes.**

**Storefront:** this thesis is the window. Local merchandising (purpose index, greeter,
proven vs not) is [`docs/storefront/local.md`](docs/storefront/local.md). GitHub `README.md`
becomes the public V1 door only after [`docs/storefront/github-v1-gate.md`](docs/storefront/github-v1-gate.md).

Not "here is a simulation, it kinda looks right." **The math is right, and the simulation _is_ that
math, embodied.** (Proofs-as-programs, lifted into embodiment.)

- **The axis everything is judged on: _looks-right_ vs _is-right_.** Optimizing for appearance is the
  deepest poison (same gravity well as the `.tsx` escape hatch). "Looks right" is a collapsing
  commodity; "is provably right" is the entire moat.
- **Substrate vs skin — never confuse them.** _Substrate (substance):_ SimulationContract / CAEL /
  Lean mechanization / sim-target compilers (USD-physics, URDF/SDF, quantum, SCM, NIR) carry the
  proof. _Skin (distribution):_ native render, asset pipeline, splats, the HoloLand MMO — how a
  human _inhabits_ the proof; carries zero proof guarantee.
- **Provable frontier (honesty boundary):** prove only where reality has checkable mathematical truth
  (physics, quantum, geometry, kinematics, causal). Label everything else as presentation. Never let
  the skin claim the substrate's guarantee.
- **Universal + adjustable, without breaking the proof:** prove the _space_, not the _instance_
  (parametric/dependent proof). Within the proven envelope → still correct automatically; beyond it →
  the contract re-discharges or falsifies, loudly and honestly. The unit is a **parametric,
  proof-carrying, content-addressed, composable module**; remix inherits the proof machinery.
- **Universal = one substrate** (one `.holo`, any AI, any embodiment) **+ one contract shape**
  (preconditions → invariants → receipt). Alternative games = different rule-sets over one proven
  world.

**Forced consequences (downstream rulings):** native-runtime consolidation is non-negotiable (kill
the apex-poison render compilers); promote Paper 29 (composition law) + Paper 3 (CRDT) to CORE;
re-gate the paper program to _proves-the-loop OR distribution_, not "publishable"; the
SimulationContract must carry its own valid-parameter envelope so "did my adjustment stay true?" is
a question the substrate answers. Full doctrine + reasoning:
[`research/2026-06-15_simulation-as-proof-doctrine.md`](research/2026-06-15_simulation-as-proof-doctrine.md).

## This project's rules

1. **This is the center.** When in doubt about which repo, it's this one.
2. **Strict TypeScript.** No `any` (use `unknown`). No implicit returns.
3. **dist/index.d.ts is hand-crafted** via `generate-types.mjs` -- not tsc.
4. **Never hardcode domain vocabulary into core.** Plugins are data, not code.
5. **Simulation-first.** Digital twin before physical twin. Every feature.
6. **Sovereign > bridge.** New capabilities go in sovereign compilers only.
7. **Systems-language ratchet.** Never constrain the language to scenes, descriptions, or external-runtime wrappers; move semantics and execution into owned language/runtime layers.
8. **Commit to main.** All agents, all changes. Pre-commit hook is the gate.
9. **Stage explicitly.** `git add <file>`, never `git add -A` or `git add .`

## Key paths

- `packages/core/` -- AST, compilers, traits, identity, physics
- `packages/mcp-server/` -- MCP tools + REST + JSON-RPC
- `packages/engine/` -- runtime, GPU compute
- `packages/studio/` -- Next.js universal entry point
- `packages/r3f-renderer/` -- React Three Fiber components
- `packages/plugins/` -- domain plugins (robotics, medical, scientific)

## What to check before asking the user

1. Codebase question? `holo_query_codebase` / `holo_ask_codebase`
2. Architecture question? Read `~/.ai-ecosystem/NORTH_STAR.md` decision trees
3. Hardware target? Read `~/.claude/NORTH_STAR_HARDWARE.md`
4. Still stuck? Make the conservative choice, note what you decided
