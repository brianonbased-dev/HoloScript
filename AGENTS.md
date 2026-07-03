# AGENTS.md

> Cross-tool agent configuration. Read by: Claude Code, Codex, Copilot, Cursor, Windsurf, Amp, Devin, Continue.
> Tool-specific files (CLAUDE.md, .cursorrules, copilot-instructions.md) layer on top for advanced features.

## Git Workflow — DIRECT TO MAIN (read this first)

**Every surface commits straight to `main`. No pull requests. No feature branches.** (F.089)
This is a single shared-tree, multi-agent repo — PRs and `feat/*` branches create
bottlenecks and branch sprawl, not safety.

- `main` is **NOT** branch-protected. `git push origin main` works from **every**
  environment — desktop, hardware, **and mobile/cloud Linux agents**. Use it.
- **Mobile / cloud Claude Code & Codex agents:** do NOT use your default
  remote-agent PR flow. Commit and `git push origin main` directly. Branching +
  opening a PR is the wrong default here.
- **Explicit paths only:** `git add <file>` — NEVER `git add -A` or `.` (you will
  snatch peer in-flight files in the shared tree).
- On Windows desktop, prefer `.\scripts\safe-commit.ps1` (uses `git commit --only`
  to avoid the multi-agent index race).
- Railway auto-deploys on push to `main` — validate locally before pushing.
- **Fallback only:** if your environment genuinely cannot push direct and forces a
  PR, it is reaped (squash-merged + branch deleted) by HoloCI's `pr-reaper` on its
  schedule — do not wait on it, and do not open PRs by choice.

**CI is HoloCI, not GitHub Actions.** Validation runs on the vast.ai fleet via the
mcp-orchestrator queue and reports through free GitHub commit statuses
(`~/.ai-ecosystem/scripts/holo-ci/`; triggered by the pre-push hook, with
`reconcile.mjs` as the scheduled floor and `pr-reaper.mjs` as the stray-PR safety
net). GitHub Actions is billing-locked and unused — do not add `.github/workflows/*`.

## What This Project Does

HoloScript turns descriptions into working interfaces. Describe a dashboard, a robot arm, or a VR room — it runs on your screen, in a headset, or on a hologram. Write `.hs`, `.hsplus`, or `.holo` — the runtime handles the rest. If a compiler exists for your target platform, it optimizes automatically. If not, runtime interpretation keeps it working.

MCP server at `mcp.holoscript.net` — discover tools via `POST /mcp` with `tools/list`.

## HoloScript Tool Integration

- HoloScript source/tool surface: `.holo`, `.hsplus`, `.hs`, validators,
  compilers, and MCP tools are the native substrate rather than docs-only
  references.
- HoloKey/x402 custody: preserve HoloKey, x402, and seat wallet provenance for
  credentialed tool calls, registry writes, signed receipts, and creator flows.
- Umbrella/routeTask routing: use the HoloMesh room board, skill surface, and
  `routeTask` umbrella to route work across HoloScript, HoloLand, orchestrator,
  service, and research repos.
- Triads/uAAL: use the competitor-paper-codebase triad and uAAL lens when a
  change crosses language, runtime, research, or ecosystem boundaries.
- HoloGate note: HoloGate is a docs umbrella term only; it does not replace
  concrete HoloKey, routeTask, triad/uAAL, MCP, or source-level proof.

## First Surface: Skills

Before raw grep, raw curl, or long-form code spelunking, check the skill surface. Skills are the front door for HoloScript work because they carry the current workflows, dispatch rules, gotchas, and validation habits.

- Claude Code: invoke the matching skill directly.
- Codex, Copilot, Cursor, Gemini-Antigravity, Windsurf, Devin: read the relevant `SKILL.md` directly. The ai-ecosystem inventory is `C:/Users/josep/.ai-ecosystem/SKILL_MAP.md`.
- If no skill matches, use MCP discovery, Absorb Graph RAG, `NORTH_STAR.md`, and local commands.

Skipping a matching skill is a workflow bug. Common examples: use Absorb or `/codebase` for codebase intelligence, `/compile` for compile-target work, `/frontend` for UI audits, `/critic` for hard review, and `/room` for HoloMesh coordination.

Mechanism-design target: skills should be laid out like a payoff matrix where the right skill is the dominant move. See `C:/Users/josep/.ai-ecosystem/docs/handbooks/skill-routing-game-theory.md`.

Tracking source map: before trusting board exports, root JSON files, IDE session stores, backup clones, or worktree folders as current state, classify them with `C:/Users/josep/.ai-ecosystem/docs/handbooks/agent-tracking-source-map.md`. Live board, git status, and the knowledge store win.

Explicit-frame architecture: before authoring a `.hsplus` brain that needs to declare its epistemic scope, allowed tools, or temporal horizon, read `C:/Users/josep/.ai-ecosystem/docs/handbooks/explicit-frame-architecture.md`. The `@frame_declaration` trait (`packages/core/src/traits/FrameDeclarationTrait.ts`) is the language primitive; the handbook documents all four pillars and the frame-crossing cost model.

## File Formats

| Extension    | Purpose                                      | When to use                                                    |
| ------------ | -------------------------------------------- | -------------------------------------------------------------- |
| `.hs`        | Data pipelines, simple scenes, configuration | Structured data that compiles to any target                    |
| `.hsplus`    | Behaviors, agents, economics, IoT, physics   | When you need traits like `@grabbable @physics @spatial_audio` |
| `.holo`      | Full compositions, cross-platform scenes     | AI-generated scenes, multi-object layouts, dashboards          |
| `.ts`/`.tsx` | Tooling, infrastructure, tests               | TypeScript for the platform itself (not user content)          |

## Build and Test

```bash
pnpm install                              # Install dependencies
pnpm build                                # Build (core first, then rest — order matters)
pnpm --filter @holoscript/core build      # Build specific package
pnpm --filter @holoscript/net-service run build  # Authoritative holoscript.net service build
pnpm test                                 # Run all tests (vitest)
pnpm --filter @holoscript/core test       # Test specific package
pnpm lint                                 # ESLint
pnpm format                               # Prettier
pnpm bench                                # Benchmarks
pnpm run health:deps                      # Bounded pnpm audit; emits JSON pass/fail/cached/skip
```

Build order matters: `@holoscript/core` must build before any downstream package.

## Package Structure

```text
packages/
  core/               # Parser, AST, traits, compilers (ALL live here)
  mcp-server/         # MCP tools (Streamable HTTP transport)
  cli/                # CLI: holoscript / hs binary
  runtime/            # Direct interpretation (no compiler needed)
  studio/             # Next.js creation environment
  engine/             # Rendering, physics, animation, ECS
  framework/          # Agent orchestration, board, economy
  r3f-renderer/       # React Three Fiber components
  lsp/                # Language Server Protocol
  connectors/         # GitHub, Railway, Docker connectors
  plugins/            # Domain plugins (banking, neuroscience, film, etc. — count via `ls packages/plugins/`)
  snn-webgpu/         # GPU spiking neural networks
  ...                 # More — run `ls packages/` for full list

services/
  export-api/         # Export/rendering API
  holoscript-net/     # Production web service
  llm-service/        # LLM proxy service
```

## Code Conventions

**Native-first — read this before the hygiene rules below.** These conventions govern **platform-tooling code only** (the CLI, parser, compilers, adapters, and tests written in TypeScript). They are NOT how you author HoloScript *content or behavior*. A trait, a render surface, an agent brain, or a compile target is authored as **declarative data a tool consumes** — not hand-written imperative TypeScript — and its correctness is **enforced by a structural gate, never asserted** (the two principles: behavior-as-data; gate-enforced/derived correctness). Authoring those the pretrained TS/React way produces code that passes a generic lint but is structurally wrong here: invisible to the compiler, unverifiable by provenance, or uncompilable to non-TS targets. Use the File Format table above (`.hs`/`.hsplus`/`.holo` vs `.ts`/`.tsx`) to decide what you're writing, and **before authoring any HoloScript content read** [`docs/handbooks/holoscript-native-authoring-vs-pretrained.md`](docs/handbooks/holoscript-native-authoring-vs-pretrained.md) — the surface→authoring map is the table at its top. The rules below are the floor for tooling, not the shape of HoloScript.

**Authoring visual richness (not code structure):** before authoring or generating visual scene
content (materials, lighting, environment, terrain), read
[`docs/handbooks/holoscript-realistic-authoring-patterns.md`](docs/handbooks/holoscript-realistic-authoring-patterns.md) —
a pattern library (target/conventions/constraints/scope briefs) for composing `@advanced_pbr`
materials, paired light sources, and environment drivers instead of defaulting to a bare
primitive + flat color. Disjoint concern from the native-authoring doc above: that doc is about
code *structure*, this one is about visual *content*.

TypeScript-tooling hygiene (platform/tooling code only):

- **TypeScript strict mode**: `strict: true`, target ES2020, ESNext modules, bundler resolution
- **No `any`**: Use `unknown`. This is enforced.
- **Test framework**: vitest (never Jest)
- **Build tool**: tsup
- **Package manager**: pnpm with workspaces
- **Node version**: >= 18.0.0
- **JSX**: hand-written `.tsx` is permitted for **tooling/CLI/parser/adapter code ONLY** — and there it MUST use the `.tsx` extension. **Perceivable render/UI surfaces are NEVER hand-written `.tsx`**: author them as `.holo` and let a compiler `@generate` the `.tsx` (enforced LIVE by `scripts/holo-ci/check-render-surface-native.mjs` — a non-generated `.tsx` under a render root is `SURFACE-GREW`, exit 1, commit blocked, in both pre-commit and HoloCI).
- **Types**: `dist/index.d.ts` is hand-crafted by `scripts/generate-types.mjs` (not tsc). New exports require updating BOTH `src/index.ts` AND the `mainDTS` template in `generate-types.mjs`.

## Compilers

All compilers live in `@holoscript/core`. Count via `find packages/core/src -name "*Compiler.ts" -not -name "CompilerBase*" -not -name "*.test.*"`.

Each compiler extends `CompilerBase` and requires RBAC authorization:

```typescript
// Required mock for ALL compiler tests
vi.mock('../../security/rbac', () => ({
  checkPermission: vi.fn().mockResolvedValue(true),
}));

const result = await compiler.compile(source, 'test-token');
```

## Traits

All traits live in `@holoscript/core/src/traits/`. Count via `find packages/core/src/traits -name "*.ts" -not -name "*.test.*"`. Category files in `traits/constants/` (118 files — verify via `ls`).

Categories span far beyond spatial:

| Domain            | Example categories                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| **Spatial/XR**    | core-vr-interaction, physics-expansion, locomotion-movement, xr-platform, spatial-algorithms               |
| **Rendering**     | rendering, post-processing, global-illumination, visual-effects, volumetric-webgpu, vfx-audio              |
| **Characters**    | humanoid-avatar, facial-expression, character-pipeline, character-materials, npc-roles, creatures-mythical |
| **Environment**   | atmosphere-sky, terrain-ocean, weather-phenomena, weather-particles, environmental-biome, nature-life      |
| **AI/ML**         | intelligence-behavior, ml-inference, ml-tensor, networking-ai, iot-autonomous-agents                       |
| **Data/Services** | data-pipeline, data-storage, database-persistence, api-gateway, search, file-storage                       |
| **Business**      | payment, social-commerce, enterprise-multitenancy, workflow-bpm, compliance-governance, audit-trail        |
| **Industry**      | robotics-industrial, healthcare-medical, scientific-computing, construction-building, maritime-naval       |
| **Security**      | auth-identity, security-crypto, safety-boundaries, feature-flags                                           |
| **DevOps**        | devops-ci, testing-qa, observability, analytics-observability, containers-storage                          |
| **Creative**      | music-performance, narrative-storytelling, procedural-generation, magic-fantasy, cooking-food              |
| **Communication** | communication, notification-alerting, signs-communication, media-content                                   |

Adding a new trait:

0. **First run `/stub-audit`** — many trait *names* already exist with a correct seam but a placeholder body (Pattern B stub). The native move is to wire+build the existing name, not author a parallel duplicate that leaves the original advertised-but-dead.
1. **Author the runtime behavior native** — the trait's public seam is a plain `TraitHandler<TConfig>` object literal (`onAttach`/`onUpdate`/`onEvent`/`onDetach`), NOT a class with methods. Per-instance state lives on `node.__<name>State` (created in `onAttach`, deleted in `onDetach`) — never class fields/module vars, or every node sharing the handler shares state. Traits never call each other: emit an event via `context.emit(...)`. Multi-phase behavior is the `@state_machine` decorator, not `if/else` in `onUpdate`. Behavioral traits are authored in `.hsplus`. (Full shape + `file:line` evidence: [`docs/handbooks/holoscript-native-authoring-vs-pretrained.md`](docs/handbooks/holoscript-native-authoring-vs-pretrained.md) § Traits.)
2. Define constant in `packages/core/src/traits/constants/`
3. Add visual preset in `packages/core/src/traits/visual/presets/`
4. Register in the category index
5. Add R3F handler if it has rendering (`R3FCompiler.ts`)
6. Add tests

## MCP Server

**Production**: `https://mcp.holoscript.net`
**Local**: `npx tsx packages/mcp-server/src/index.ts`
**Tool discovery**: `POST /mcp` → `tools/list` (tool count changes with deploys — never hardcode)
**Health**: `GET /health` → `tools` field for current count

Tool categories: parsing, traits, generation, codebase intelligence, compilation, IDE, browser control, networking, self-improvement. Discover specific tools via MCP protocol, not from docs.

### Codebase Intelligence

Cache at `~/.holoscript/graph-cache.json` (24h TTL). Always check freshness first:

1. `holo_graph_status` — is cache fresh?
2. `holo_absorb_repo` — scan (fast from cache, ~3-10s fresh)
3. `holo_query_codebase` — architectural Q&A
4. `holo_impact_analysis` — blast radius for changes

Never call `holo_absorb_repo` with `force: true` unless `holo_graph_status` reports stale.

## Testing

### Vitest Mock Rules

- Use `vi.hoisted()` for mock variables
- Use `function(){}` (not arrow functions) for mock constructors
- GPU tests use Dawn WebGPU with mock fallback (see `core/src/physics/__tests__/gpu-setup.ts`)

### Pre-Commit

- Run `pnpm test` before committing
- Run `pnpm lint` for style issues
- All tests must pass

## Numbers Policy

**Never hardcode ecosystem counts** (tools, compilers, traits, tests, plugins, packages) in docs, configs, or code comments. They change with every deploy.

- **SSOT**: `docs/NUMBERS.md` — verification commands for every metric
- **In docs**: reference the command or link to NUMBERS.md
- **In code comments**: say "verify via `find *Compiler.ts`" not "44 compilers"
- **MCP tools**: discover via `tools/list`, verify via `GET /health` → `tools` field
- **Compilers**: `find packages/core/src -name "*Compiler.ts" -not -name "CompilerBase*" -not -name "*.test.*"`
- **Traits**: `find packages/core/src/traits -name "*.ts" -not -name "*.test.*"`

## Git Rules

- **NEVER** use `git add -A` or `git add .` — stage files explicitly: `git add path/to/file.ts`
- Commit message format: conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`)
- Large batches (10+ files): split into sectioned commits by topic
- Docs must use lowercase filenames

## Scratch Output

- Put one-off command, test, lint, tsc, vitest, API-board, and local investigation output under `/.scratch/<YYYY-MM-DD>-<agent-or-task>/`.
- Do not add new root-level ignore patterns for transient logs, dumps, board exports, or ad hoc scripts. Redirect the command output or fix the script to write into `/.scratch/`.
- Treat `/.scratch/` as ignored, disposable local output. Do not use it for source files, durable fixtures, or evidence that must survive another checkout.
- Promote durable evidence into the right tracked home, such as `docs/`, `research/`, `.bench-logs/`, package fixtures, or service-specific artifact directories.

## Security

### StdlibPolicy

All I/O from traits/compositions is gated by `StdlibPolicy`:

- `allowFileRead`, `allowFileWrite`, `allowFileDelete`
- `allowProcessExec`, `allowNetFetch`
- `allowMediaDecode`, `allowDepthInference`, `allowGpuCompute`

Traits MUST NOT perform direct filesystem access. All I/O goes through stdlib BehaviorTree actions with `into:` convention for blackboard key prefix.

### Execution Sandbox

- `vm.createContext` (not vm2)
- Ed25519 cryptographic signatures
- Per-tool RBAC authorization on MCP server

## Simulation Stack (Scientific Computing)

The engine includes PDE-based simulation solvers for thermal, structural, and hydraulic analysis. As of 2026-04-11, the solver math is verified but the product is not accessible to non-developer users.

### What EXISTS (validated, tested, committed)

| Layer             | Status               | Details                                                                                                                                |
| ----------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Solvers**       | Working, benchmarked | Thermal (FDM, Euler+Jacobi), Structural (linear tet FEM, PCG), Hydraulic (Hardy-Cross, Darcy-Weisbach)                                 |
| **Coupling**      | Working              | 6 coupling chains via CouplingManager (sequential operator splitting)                                                                  |
| **Materials**     | Cited, T-dependent   | 15+ materials with Incropera/NIST/ASM citations, uncertainty bounds, piecewise-linear T-dependent lookup for 5 core materials          |
| **Units**         | Enforced             | 30+ branded physical quantity types, 40+ unit conversions, DimensionalMismatchError at runtime                                         |
| **V&V**           | Partial              | Analytical benchmarks for all 3 domains (steady-state, patch test, Darcy-Weisbach), convergence studies, Richardson extrapolation, GCI |
| **Export**        | Working              | VTK (StructuredPoints, UnstructuredGrid, PolyData), CSV, JSON metadata                                                                 |
| **Provenance**    | Working              | Immutable SimulationRun records, determinism verification, run comparison                                                              |
| **Documentation** | Complete             | Full mathematical formulations with equations, discretization, limitations, literature refs                                            |
| **Reporting**     | Working              | V&V report generator (markdown + LaTeX)                                                                                                |

Key paths: `packages/engine/src/simulation/` (solvers, units, export, provenance, verification)

### What DOES NOT EXIST (gaps to "scientists use this")

| Gap                           | What's missing                                                                   | Why it matters                                          | Effort                              |
| ----------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------- |
| **Geometry import**           | No CAD import (STEP/IGES), no shape drawing in Studio                            | Scientists need to define their problem geometry        | Large                               |
| **Mesh generation**           | No automatic tet mesher — users must provide node/element arrays                 | Nobody hand-writes mesh data                            | Large (integrate TetGen or similar) |
| **Studio UI**                 | No simulation tab in Studio — can't configure BCs, materials, loads visually     | Non-developers can't use the solvers                    | Large                               |
| **Post-processing in Studio** | No in-browser visualization of results (color maps, probes, plots)               | Scientists shouldn't need ParaView for basic inspection | Medium                              |
| **Solver scope**              | Linear only (no plasticity, no turbulence, no dynamics, no contact)              | Many real-world problems are nonlinear                  | Large per physics model             |
| **Mesh quality**              | Uniform grids (thermal), no adaptive refinement, no mesh quality metrics         | Complex geometries need adaptive meshes                 | Large                               |
| **V&V depth**                 | 3 benchmarks per domain. Credible V&V needs 50+ (NAFEMS, ASME PTC, experimental) | Thin validation won't satisfy reviewers                 | Medium (ongoing)                    |
| **HPC/parallel**              | All solvers are single-threaded JS — millions of DOFs won't run                  | Real scientific problems are large                      | Large (WebGPU/WASM workers)         |
| **Code-to-code comparison**   | No comparison against FEniCS, OpenFOAM, EPANET                                   | Reviewers expect cross-validation                       | Medium                              |

**Bottom line for agents**: The engine's simulation math is verified and the trust infrastructure (V&V, provenance, units, export) is solid. But there is no user-facing product yet — no geometry, no meshing, no UI. A TypeScript developer can use the solver APIs directly. A lab researcher cannot. Do NOT represent the simulation stack as "ready for scientists" in docs, pitches, or Moltbook posts without this caveat.

## Boundaries

- **ALWAYS**: Validate HoloScript files after editing
- **ALWAYS**: Run impact analysis on `packages/core` changes
- **ALWAYS**: Check VR frame budget (11.1ms) for render path code
- **ASK FIRST**: Modify `generate-types.mjs` or `dist/index.d.ts`
- **ASK FIRST**: Changes touching 10+ files across packages
- **NEVER**: Put ML classifiers in VR render loop
- **NEVER**: Delete tests to bypass failures
- **NEVER**: Commit secrets or API keys

## Cursor & Peer Protocol

Peer coordination is real, but the live board, room workflow, HoloMesh roster,
and private credential routing belong in `.ai-ecosystem`. HoloScript keeps
only the repo-local rule: ask HoloScript MCP or codebase-intelligence tools
before asking the founder, treat committed board snapshots as stale until
refreshed through the live substrate, and leave handoffs through the current
room/skill workflow when blocked.

## Ecosystem Skills (Read Before Working)

Use the matching skill before raw tools, but do not duplicate the ecosystem
skill registry here. The canonical inventory lives in the private ecosystem
surface (`C:/Users/josep/.ai-ecosystem/SKILL_MAP.md` locally, or the
current harness-provided skills block). Direct-reader agents should read the
relevant `SKILL.md` from that inventory and then execute the workflow.

This repo keeps only HoloScript-specific rules: source formats, compiler and
trait boundaries, MCP discovery, validation, and direct-to-main commit posture.
Room, board, GOLD, fleet roster, and cross-family coordination procedures belong
in `.ai-ecosystem` and should be linked, not copied, from HoloScript docs.
