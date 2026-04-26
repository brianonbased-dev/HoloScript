# AGENTS.md

> Cross-tool agent configuration. Read by: Claude Code, Codex, Copilot, Cursor, Windsurf, Amp, Devin, Continue.
> Tool-specific files (CLAUDE.md, .cursorrules, copilot-instructions.md) layer on top for advanced features.

## What This Project Does

HoloScript turns descriptions into working interfaces. Describe a dashboard, a robot arm, or a VR room — it runs on your screen, in a headset, or on a hologram. Write `.hs`, `.hsplus`, or `.holo` — the runtime handles the rest. If a compiler exists for your target platform, it optimizes automatically. If not, runtime interpretation keeps it working.

MCP server at `mcp.holoscript.net` — discover tools via `POST /mcp` with `tools/list`.

## File Formats

| Extension | Purpose | When to use |
|-----------|---------|-------------|
| `.hs` | Data pipelines, simple scenes, configuration | Structured data that compiles to any target |
| `.hsplus` | Behaviors, agents, economics, IoT, physics | When you need traits like `@grabbable @physics @spatial_audio` |
| `.holo` | Full compositions, cross-platform scenes | AI-generated scenes, multi-object layouts, dashboards |
| `.ts`/`.tsx` | Tooling, infrastructure, tests | TypeScript for the platform itself (not user content) |

## Build and Test

```bash
pnpm install                              # Install dependencies
pnpm build                                # Build (core first, then rest — order matters)
pnpm --filter @holoscript/core build      # Build specific package
pnpm test                                 # Run all tests (vitest)
pnpm --filter @holoscript/core test       # Test specific package
pnpm lint                                 # ESLint
pnpm format                               # Prettier
pnpm bench                                # Benchmarks
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

- **TypeScript strict mode**: `strict: true`, target ES2020, ESNext modules, bundler resolution
- **No `any`**: Use `unknown`. This is enforced.
- **Test framework**: vitest (never Jest)
- **Build tool**: tsup
- **Package manager**: pnpm with workspaces
- **Node version**: >= 18.0.0
- **JSX**: Files containing JSX MUST use `.tsx` extension
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

| Domain | Example categories |
|--------|-------------------|
| **Spatial/XR** | core-vr-interaction, physics-expansion, locomotion-movement, xr-platform, spatial-algorithms |
| **Rendering** | rendering, post-processing, global-illumination, visual-effects, volumetric-webgpu, vfx-audio |
| **Characters** | humanoid-avatar, facial-expression, character-pipeline, character-materials, npc-roles, creatures-mythical |
| **Environment** | atmosphere-sky, terrain-ocean, weather-phenomena, weather-particles, environmental-biome, nature-life |
| **AI/ML** | intelligence-behavior, ml-inference, ml-tensor, networking-ai, iot-autonomous-agents |
| **Data/Services** | data-pipeline, data-storage, database-persistence, api-gateway, search, file-storage |
| **Business** | payment, social-commerce, enterprise-multitenancy, workflow-bpm, compliance-governance, audit-trail |
| **Industry** | robotics-industrial, healthcare-medical, scientific-computing, construction-building, maritime-naval |
| **Security** | auth-identity, security-crypto, safety-boundaries, feature-flags |
| **DevOps** | devops-ci, testing-qa, observability, analytics-observability, containers-storage |
| **Creative** | music-performance, narrative-storytelling, procedural-generation, magic-fantasy, cooking-food |
| **Communication** | communication, notification-alerting, signs-communication, media-content |

Adding a new trait:

1. Define constant in `packages/core/src/traits/constants/`
2. Add visual preset in `packages/core/src/traits/visual/presets/`
3. Register in the category index
4. Add R3F handler if it has rendering (`R3FCompiler.ts`)
5. Add tests

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

| Layer | Status | Details |
|-------|--------|---------|
| **Solvers** | Working, benchmarked | Thermal (FDM, Euler+Jacobi), Structural (linear tet FEM, PCG), Hydraulic (Hardy-Cross, Darcy-Weisbach) |
| **Coupling** | Working | 6 coupling chains via CouplingManager (sequential operator splitting) |
| **Materials** | Cited, T-dependent | 15+ materials with Incropera/NIST/ASM citations, uncertainty bounds, piecewise-linear T-dependent lookup for 5 core materials |
| **Units** | Enforced | 30+ branded physical quantity types, 40+ unit conversions, DimensionalMismatchError at runtime |
| **V&V** | Partial | Analytical benchmarks for all 3 domains (steady-state, patch test, Darcy-Weisbach), convergence studies, Richardson extrapolation, GCI |
| **Export** | Working | VTK (StructuredPoints, UnstructuredGrid, PolyData), CSV, JSON metadata |
| **Provenance** | Working | Immutable SimulationRun records, determinism verification, run comparison |
| **Documentation** | Complete | Full mathematical formulations with equations, discretization, limitations, literature refs |
| **Reporting** | Working | V&V report generator (markdown + LaTeX) |

Key paths: `packages/engine/src/simulation/` (solvers, units, export, provenance, verification)

### What DOES NOT EXIST (gaps to "scientists use this")

| Gap | What's missing | Why it matters | Effort |
|-----|---------------|----------------|--------|
| **Geometry import** | No CAD import (STEP/IGES), no shape drawing in Studio | Scientists need to define their problem geometry | Large |
| **Mesh generation** | No automatic tet mesher — users must provide node/element arrays | Nobody hand-writes mesh data | Large (integrate TetGen or similar) |
| **Studio UI** | No simulation tab in Studio — can't configure BCs, materials, loads visually | Non-developers can't use the solvers | Large |
| **Post-processing in Studio** | No in-browser visualization of results (color maps, probes, plots) | Scientists shouldn't need ParaView for basic inspection | Medium |
| **Solver scope** | Linear only (no plasticity, no turbulence, no dynamics, no contact) | Many real-world problems are nonlinear | Large per physics model |
| **Mesh quality** | Uniform grids (thermal), no adaptive refinement, no mesh quality metrics | Complex geometries need adaptive meshes | Large |
| **V&V depth** | 3 benchmarks per domain. Credible V&V needs 50+ (NAFEMS, ASME PTC, experimental) | Thin validation won't satisfy reviewers | Medium (ongoing) |
| **HPC/parallel** | All solvers are single-threaded JS — millions of DOFs won't run | Real scientific problems are large | Large (WebGPU/WASM workers) |
| **Code-to-code comparison** | No comparison against FEniCS, OpenFOAM, EPANET | Reviewers expect cross-validation | Medium |

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

If you are a Cursor agent (or any peer agent operating in an asynchronous team environment), follow the **HoloMesh Peer Protocol**:
- **Ask tools before the founder**: Use HoloScript MCP, Absorb (GraphRAG), and orchestrator tools for factual and codebase questions. Use `mcp_servers.absorb` in `~/.cursor/mcp.json` if configured.
- **Board queue**: Authoritative open work is **`GET /api/holomesh/team/{id}/board`**. A committed **`board.json`** (e.g. in the founder’s `~/.ai-ecosystem` repo) is only a **git snapshot** — refresh from the API before treating it as the live queue.
- **Handoffs & Blockers**: If blocked, post a handoff message to HoloMesh instead of waiting on the human founder.
- **Marathon loop**: Refer to the user's `~/.cursor/skills/room-autonomous/SKILL.md` for single-session deep focus. 
- For full details, read `docs/TEAM_PEER_PROTOCOL.md` and `docs/cursor/CURSOR_MCP_ABSORB.md` in the `.ai-ecosystem` repository.

## Ecosystem Skills (Read Before Working)

Skills are concentrated knowledge files — the best single-file summary of each subsystem. **Read the relevant skill file before working in any domain.** They contain architecture, API endpoints, decision trees, and conventions that no other doc has.

⚠ **Audit 2026-04-26**: half the rows below referenced names/paths that don't match disk reality. Skill **files** live in two places: `~/.claude/skills/` (Claude-tool-invokable) and `<repo>/.claude/skills/` (file-readable but NOT Skill-tool-invokable; verified — `Skill(skill="holoscript-absorb")` returns "Unknown skill"). Table below shows the verified file path + invocation reality. Tracked at `task_1777164270247_7ee8`.

| Domain | Verified file path (Read tool works) | Skill-tool invokable? | What It Knows |
|--------|-------------------------------------|------------------------|---------------|
| HoloScript platform | (no `holoscript/` skill exists; closest: `.claude/skills/dev/`, `tools/`) | ❌ | Compiler architecture, trait system, all formats, MCP tools, roadmap |
| Building / shipping code | `.claude/skills/dev/SKILL.md` (was named `holoscript-dev`) | ❌ (file-only) | Build workflow, test patterns, package deps, CI, how to ship |
| Codebase intelligence | `.claude/skills/holoscript-absorb/SKILL.md` (file exists; absorb-service degraded — see CLAUDE.md "Absorb Service" §) | ❌ | Graph scanning, semantic search, GraphRAG, impact analysis |
| HoloMesh agent network | (no `holomesh/` skill; functionality in `~/.ai-ecosystem/.claude/skills/room/SKILL.md`) | ❌ | Agent registration, gossip, CRDT sync, trust, reputation tiers |
| Knowledge oracle | `~/.ai-ecosystem/.claude/skills/oracle/SKILL.md` (was named `holomesh-oracle`) | ❌ (file-only) | Oracle research findings, thermodynamic trust, neuroscience model |
| Team coordination | `~/.ai-ecosystem/.claude/skills/room/SKILL.md` AND `~/.claude/skills/room/SKILL.md` | ✅ `/room` | Board API, `/room add-tasks`, task lifecycle, modes; never fabricate `task_*` IDs |
| Codebase scanning | `.claude/skills/scan/SKILL.md` (was meant to be `/scan` invokable) | ❌ (file-only) | TODO/FIXME, git health, code quality, coverage, knowledge gaps |
| Neuroscience / SNN | `.claude/skills/neuro/SKILL.md` (was named `neuroscience`) | ❌ (file-only) | SNN-WebGPU, cognitive architecture, memory consolidation |
| Documentation audit | `~/.ai-ecosystem/.claude/skills/documenter/SKILL.md` | ❌ (file-only) | Voice rules, staleness, version consistency, agent-first writing |
| Deep research | (no `ai-workspace` skill anywhere; manual fallback: WebSearch + WebFetch + the COMPRESS→GROW→RE-INTAKE step list in NORTH_STAR.md §3.1) | ❌ | uAA2++ 8-phase protocol, web search, knowledge compression |
| Honest critique | `.claude/skills/critic/SKILL.md` (was named `negative-nancy`) | ❌ (file-only) | What "good" looks like, what's broken, no silver linings |
| VR/AR environments | `~/.ai-ecosystem/.claude/skills/hololand/SKILL.md` | ❌ (file-only) | Spatial computing, world management, VR experience design |
| Founder decisions | `~/.claude/skills/founder/SKILL.md` | ✅ `/founder` | Authority order, vision pillars, refusal list, papers-program editorial |

**For Claude Code agents**: Only `/room` and `/founder` are Skill-tool invokable today (verified `ls ~/.claude/skills/`: also `find-collaborator`, `founder-workspace`, `lean4`, `ml-experiments`, `security-audit`, `test-simple`). For everything else, **read the file directly via the Read tool** — `cat <verified-path-from-table>` works universally. The Skill tool returns "Unknown skill" for repo-local skills under `<repo>/.claude/skills/`.

**For all other agents** (Copilot, Cursor, Gemini, Codex, Windsurf, Devin): Read the skill file directly — `cat <verified-path>`. It's the fastest + only universal way to access ecosystem skills until/unless the repo-local skills get registered globally.
