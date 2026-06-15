# North Star -- HoloScript

**Role**: Core platform. Language, compilers, traits, MCP server, Studio, renderer.
**Upstream oracle**: `~/.ai-ecosystem/NORTH_STAR.md` (read that for decision trees, workflow patterns, cost thresholds)
**GOLD Drive**: `GOLD_ROOT` or default vault root when mounted (Diamond > Platinum > GOLD > knowledge store) — intake per `~/.ai-ecosystem/CLAUDE.md`. **Live entry counts** are only authoritative in `$GOLD_ROOT/INDEX.md` (not this file).

## ∞ The Thesis (founder-ratified 2026-06-15) — read before any architectural call

**HoloScript exists so anyone, using any AI, can produce a simulation that *is* a theorem about
reality — the simulation's execution constitutes the proof of its own correctness — and that proof
is universal and remixable because it is parametric and composes.**

Not "here is a simulation, it kinda looks right." **The math is right, and the simulation *is* that
math, embodied.** (Proofs-as-programs, lifted into embodiment.)

- **The axis everything is judged on: *looks-right* vs *is-right*.** Optimizing for appearance is the
  deepest poison (same gravity well as the `.tsx` escape hatch). "Looks right" is a collapsing
  commodity; "is provably right" is the entire moat.
- **Substrate vs skin — never confuse them.** *Substrate (substance):* SimulationContract / CAEL /
  Lean mechanization / sim-target compilers (USD-physics, URDF/SDF, quantum, SCM, NIR) carry the
  proof. *Skin (distribution):* native render, asset pipeline, splats, the HoloLand MMO — how a
  human *inhabits* the proof; carries zero proof guarantee.
- **Provable frontier (honesty boundary):** prove only where reality has checkable mathematical truth
  (physics, quantum, geometry, kinematics, causal). Label everything else as presentation. Never let
  the skin claim the substrate's guarantee.
- **Universal + adjustable, without breaking the proof:** prove the *space*, not the *instance*
  (parametric/dependent proof). Within the proven envelope → still correct automatically; beyond it →
  the contract re-discharges or falsifies, loudly and honestly. The unit is a **parametric,
  proof-carrying, content-addressed, composable module**; remix inherits the proof machinery.
- **Universal = one substrate** (one `.holo`, any AI, any embodiment) **+ one contract shape**
  (preconditions → invariants → receipt). Alternative games = different rule-sets over one proven
  world.

**Forced consequences (downstream rulings):** native-runtime consolidation is non-negotiable (kill
the apex-poison render compilers); promote Paper 29 (composition law) + Paper 3 (CRDT) to CORE;
re-gate the paper program to *proves-the-loop OR distribution*, not "publishable"; the
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
7. **Commit to main.** All agents, all changes. Pre-commit hook is the gate.
8. **Stage explicitly.** `git add <file>`, never `git add -A` or `git add .`

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
