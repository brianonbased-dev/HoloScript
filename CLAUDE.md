# ∞ HoloScript — Agent Injection Manifest

> **AGENT**: This file is your behavioral contract for this repo. Execute the SESSION INIT sequence before any other action. All directives below are mandatory.
>
> **IDENTITY**: If you are Claude, you're running in one of Joseph's surfaces (Cursor, Claude Desktop, Claude extension, or VS Code). You are **not** "Antigravity" — that's a separate Google IDE running Gemini. Never self-tag as `antigravity` in commit messages, handoffs, or HoloMesh posts. See `~/.claude/projects/C--Users-josep--ai-ecosystem/memory/feedback_antigravity-is-not-claude.md`.
>
> **TEAM**: You're on the HoloScript Core team. Teammates (Gemini in Antigravity IDE, Copilot in VS Code, other Claude sessions) write handoffs and knowledge — read them, utilize them, message them.
>
> **PRODUCTION**: HoloScript is a production product paying users depend on. When MCP is down, investigate before falling back. When tests fail on main, fix yours / investigate pre-existing. Don't bypass safety as a shortcut.
>
> **NORTH STAR**: Read `NORTH_STAR.md` in this repo for project-specific decisions. Read `~/.ai-ecosystem/NORTH_STAR.md` for ecosystem-wide decision trees, workflow patterns, and cost thresholds. Consult BOTH before asking Joseph any architectural question — and if neither answers, **PLAN, then tell Joseph what you decided and why**, don't stall.
> **GOLD Drive**: Graduated vault on disk (default `D:\GOLD` on Windows, `/mnt/d/GOLD` elsewhere). Override with **`GOLD_ROOT`**. Diamond > Platinum > GOLD > knowledge store; overrides the knowledge store on conflict. Intake: `INDEX.md`, `w_gold_034.md`, `wisdom/w_gold_001.md`, etc. — see `~/.ai-ecosystem/CLAUDE.md` (GOLD Drive).

---

## ∞ PHASE 0 — SESSION INITIALIZATION (MANDATORY)

On every session start, execute this sequence IN ORDER:

```text
0. GOLD DRIVE  → Before deploy/registry/wallet claims: intake GOLD Drive (`GOLD_ROOT` or default; `INDEX.md` + hot entries per ~/.ai-ecosystem/CLAUDE.md)
1. IDENTIFY    → What is the user trying to build or fix?
2. CLASSIFY    → Is this HoloScript code, tooling (TypeScript), or docs?
3. TOOL-FIRST  → If HoloScript: call suggest_traits BEFORE writing any code
4. VALIDATE    → After generation: call validate_holoscript BEFORE returning
5. AFFIRM      → Confirm output matches user intent, state what was done
```

**Skip nothing. If MCP server is unavailable, say so explicitly and ask user to start it.**

---

## ∞ BEHAVIORAL OVERRIDES (HARDCODED — NEVER VIOLATE)

```text
NEVER  → Default to React, Next.js, or conventional web patterns
NEVER  → Hand-write .hs/.hsplus/.holo without calling suggest_traits first
NEVER  → git add -A  or  git add .  (Windows: creates nul device file — BREAKS REPO)
NEVER  → Create UPPERCASE .md files in docs/ root (they go in docs/_archive/)
NEVER  → Add doc pages without updating docs/.vitepress/config.ts sidebar

ALWAYS → Use .holo for cross-platform compositions
ALWAYS → Stage git files explicitly: git add path/to/file.ts
ALWAYS → Run pnpm test before committing
ALWAYS → Call validate_holoscript after generating any HoloScript code
ALWAYS → Add new packages to typedoc.json entryPoints
ALWAYS → Attempt MCP recovery (diagnose → start → retry) before falling back to CLI
```

## ∞ STRATEGIC DIRECTION — BRITTNEY / STUDIO FIRST

Use this doctrine when evaluating feature placement:

- Brittney is the primary intelligence interface
- Studio is the primary creation environment
- HoloScript is the substrate and native medium
- Standard IDEs are compatibility bridges

Implications:

- Prefer building long-term intelligence accumulation for Brittney + Studio.
- Use HoloScript packages for substrate, generation, protocol, and Absorb capabilities.
- Treat IDE-focused work as transitional unless it clearly accelerates Studio adoption or HoloScript maintenance.
- When in doubt, ask whether the feature makes Studio more inevitable.

---

## ∞ DECISION TREE — Route Every Request Here

```text
User asks for HoloScript code?
  → YES → call suggest_traits → call generate_object/generate_scene → call validate_holoscript
  → NO  ↓

User asks about a trait?
  → YES → call list_traits or explain_trait → answer from MCP result
  → NO  ↓

User asks to compile/export?
  → YES → identify target (Unity/Unreal/WebGPU/URDF/etc.) → see docs/compilers/
  → NO  ↓

User is new to HoloScript?
  → YES → direct to docs/academy/level-1-fundamentals/01-what-is-holoscript.md
  → NO  ↓

User is modifying TypeScript (packages/*)?
  → YES → PRE-REFACTOR: call holo_graph_status (check cache) → holo_absorb_repo (force=false uses cache)
  → THEN  → call holo_impact_analysis to find blast radius → pnpm test first → edit → pnpm test again → explicit git add
  → CLI fallback: npx tsx packages/cli/src/cli.ts absorb <package-path> --json
  → NO  ↓

User is writing docs?
  → YES → lowercase filenames → add to docs/.vitepress/config.ts sidebar → NO UPPERCASE

MCP tools unavailable / tool call errors?
  → Step 1: DETECT   → any tool call returns error or tool not in schema
  → Step 2: DIAGNOSE → npx tsx packages/mcp-server/src/index.ts --help (exit 0 = binary OK)
  → Step 3: START    → npx tsx packages/mcp-server/src/index.ts (background process)
  → Step 4: VERIFY   → retry: holo_graph_status({}) or list_traits({})
  → Step 5: FALLBACK → if server still won't start, use CLI equivalents:
       holo_absorb_repo    → npx tsx packages/cli/src/cli.ts absorb <dir> --json
       holo_query_codebase → npx tsx packages/cli/src/cli.ts query "<question>"
       validate_holoscript → npx tsx packages/cli/src/cli.ts parse <file>
       suggest_traits / generate_* → no CLI equivalent; skip or notify user
  → Step 6: NOTIFY   → "Start MCP server: npx tsx packages/mcp-server/src/index.ts"
```

---

## ∞ MCP TOOL INJECTION — Exact Call Sequences

### Generate HoloScript Object

```text
Step 1: suggest_traits({ description: "<user's object description>" })
Step 2: generate_object({ description: "<description>", traits: <result from step 1> })
Step 3: validate_holoscript({ code: <result from step 2> })
Step 4: Return validated code
```

### Generate Full Scene

```text
Step 1: suggest_traits({ description: "<scene description>" })
Step 2: generate_scene({ description: "<description>", traits: <step 1 result> })
Step 3: validate_holoscript({ code: <step 2 result> })
```

### Explain Existing Code

```text
Step 1: parse_hs({ code: "<code>" })  OR  parse_holo({ code: "<code>" })
Step 2: explain_code({ ast: <step 1 result> })
```

### Find Right Traits

```text
Step 1: list_traits({ category: "<interaction|physics|visual|networking|ai|spatial|audio|iot>" })
Step 2: explain_trait({ name: "<trait name>" })
```

### Analyze Codebase (Cache-First — Most Efficient)

```text
Step 1: holo_graph_status({})                               → Check cache freshness (<24h = use it)
Step 2: holo_absorb_repo({ rootDir: "<pkg-path>" })        → Omit force; reads cache if fresh (~21ms)
         holo_absorb_repo({ rootDir: ".", force: true })   → Only if cache is stale or rootDir changed
Step 3: holo_query_codebase({ query: "<question>" })       → Auto-loads disk cache if needed
         holo_impact_analysis({ symbol: "<name>" })        → Blast radius (auto-loads cache)
         holo_detect_changes({ before: "ref", after: "ref" }) → Always fresh, compares two states
Step 4: holo_semantic_search / holo_ask_codebase           → Require Ollama (graceful error without it)
```

**Rules:**

- NEVER call `holo_absorb_repo` with `force: true` unless `holo_graph_status` says cache is stale
- Query tools (`holo_query_codebase`, `holo_impact_analysis`) auto-load the disk cache — no manual pre-load needed
- Results include `cacheNote` field showing cache age and source

### MCP Tool Recovery

```text
If any MCP tool call fails:
  1. Check server: npx tsx packages/mcp-server/src/index.ts --help
  2. Start it:     npx tsx packages/mcp-server/src/index.ts
  3. Retry:        holo_graph_status({})  ← lightest possible call
  4. CLI fallback map:
     holo_absorb_repo    → npx tsx packages/cli/src/cli.ts absorb <dir> --json
     holo_query_codebase → npx tsx packages/cli/src/cli.ts query "<question>"
     validate_holoscript → npx tsx packages/cli/src/cli.ts parse <file>
     suggest_traits      → no CLI equivalent (LLM-based)
     generate_object     → no CLI equivalent (LLM-based)
  5. Notify user: "MCP server is down. Run: npx tsx packages/mcp-server/src/index.ts"
```

---

## ∞ KNOWLEDGE PACK — Compressed Facts

```text
REPO        pnpm workspaces monorepo, packages/, TypeScript + vitest + tsup
TRAITS      count: find packages/core/src/traits -name "*.ts" | wc -l; categories: ls packages/core/src/traits/constants/ — ALL in @holoscript/core (no separate package)
COMPILERS   count: find packages/core/src -name "*Compiler.ts" | wc -l — ALL in @holoscript/core (no separate @holoscript/compiler)
MCP         packages/mcp-server/ — tool count: GET https://mcp.holoscript.net/health → tools field — start with: npx tsx packages/mcp-server/src/index.ts
CACHE       ~/.holoscript/graph-cache.json — 24h TTL — holo_absorb_repo force=false reads from cache (~21ms)
BRITTNEY    ../Hololand/packages/brittney/mcp-server/ — runtime AI, optional
TEST        pnpm test | pnpm test --filter @holoscript/core | createComposition() pattern
BUILD       pnpm build | pre-commit: ESLint + tsc + tests (auto-runs)
WINDOWS     git add -A creates nul file — ALWAYS explicit: git add specific/file.ts
DOCS        docs/.vitepress/config.ts controls ALL navigation — update sidebar on every new page
ARCHIVE     UPPERCASE .md → docs/_archive/ | lowercase .md → docs/[section]/
```

### Packages Quick Map

```text
@holoscript/core             Parser · AST · traits · compilers (counts via find packages/core/src; see docs/NUMBERS.md)
@holoscript/mcp-server       AI tools (parse, validate, generate, compile, codebase intelligence — count via GET mcp.holoscript.net/health)
@holoscript/cli              holo build · holo compile · holo validate
@holoscript/runtime          Scene execution runtime
@holoscript/lsp              Language Server Protocol (VS Code, Neovim)
@holoscript/formatter        Code formatter
@holoscript/linter           Linting rules
@holoscript/llm-provider     OpenAI · Anthropic · Gemini unified SDK
@holoscript/security-sandbox vm2-based execution sandbox
@holoscript/ai-validator     Hallucination detection (Levenshtein distance)
@holoscript/partner-sdk      Webhooks · analytics · partner APIs
holoscript (PyPI)            Python bindings + robotics module
```

### File Format Decision Matrix

```text
Situation                                    → Use
Simple object/scene, no interactivity        → .hs
Object needs grab/physics/network/traits     → .hsplus
AI-generated, cross-platform, declarative    → .holo
Tooling, CLI, parser, adapter code           → .ts (TypeScript)
```

### Trait Category Index

```text
interaction   @grabbable @throwable @clickable @hoverable @draggable @pointable @scalable
physics       @collidable @physics @rigid @kinematic @trigger @gravity @soft_body
visual        @glowing @emissive @transparent @reflective @animated @billboard @particle
networking    @networked @synced @persistent @owned @host_only @replicated
ai-behavior   @npc @pathfinding @llm_agent @reactive @state_machine @crowd
spatial       @anchor @tracked @world_locked @hand_tracked @eye_tracked @plane_detected
audio         @spatial_audio @ambient @voice_activated @reverb @doppler
accessibility @high_contrast @screen_reader @reduced_motion @voice_nav
web3          @nft_asset @token_gated @wallet_connected @on_chain
media         @video_surface @live_stream @screen_share @360_video
iot           @iot_sensor @digital_twin @mqtt_bridge @telemetry
social        @avatar @presence @voice_chat @emote @proximity_chat
advanced      @shader_custom @compute_shader @ray_traced @lod_managed
```

---

## ∞ DOCS STRUCTURE — Where Things Live

```text
docs/academy/          25 lessons, 3 levels (newcomer entry point)
docs/compilers/        targets (count via `ls docs/compilers/`): unity/ unreal/ godot/ vrchat/ webgpu/ ios/ vision-os/
                       android/ android-xr/ openxr/ openxr-spatial/ robotics/urdf robotics/sdf
                       iot/dtdl iot/wot playcanvas/ wasm/ ar/ tsl/ neuromorphic/ a2a/ scm/
                       usd-physics/ ai-glasses/ vr-reality/ nft-marketplace/
docs/traits/           category pages (count via `ls docs/traits/`) + index + extending guide
docs/agents/           uAA2++ agent framework, UAAL VM
docs/guides/           Core concepts, mcp-server, installation, best-practices
docs/integrations/     Hololand, Grok/xAI, AI architecture, interoperability
docs/cookbook/         Copy-paste recipes (vr-world, robotics, ai-world, multi-agent)
docs/language/         Language spec, syntax extensions
docs/api/              TypeDoc auto-generated (run: pnpm typedoc)
docs/examples/         hello-world, arena-game, world-builder
docs/_archive/         Dev notes, phase guides, session notes (NOT user-facing)
```

---

## ∞ AFFIRMATION PROTOCOL — Before Reporting Done

```text
□ Did I call validate_holoscript on all generated HoloScript code?
□ Did I run pnpm test if I modified any TypeScript?
□ Did I call holo_graph_status then holo_absorb_repo BEFORE refactoring ANY TypeScript package?
□ If any MCP tool failed, did I attempt recovery (diagnose → start → retry) before falling back to CLI?
□ Did I use explicit git add (never git add -A)?
□ Did I update docs/.vitepress/config.ts if I created a new doc page?
□ Does the output match what the user actually asked for?
□ Did I state clearly what I created/changed and why?
```

If any box is unchecked → complete that step before responding.

---

## ∞ NEWCOMER FAST PATH

```text
1. docs/academy/level-1-fundamentals/01-what-is-holoscript.md  (What + Why)
2. docs/academy/level-1-fundamentals/02-installation.md         (Setup)
3. docs/academy/level-1-fundamentals/03-first-scene.md          (First .holo)
4. docs/traits/index.md                                          (Superpower)
5. docs/compilers/index.md                                       (Deploy)
```

---

## ∞ CONTRIBUTING CONTRACT

- UPPERCASE `.md` files → `docs/_archive/` only
- Every new doc page → add entry to `docs/.vitepress/config.ts` sidebar
- New packages → add to `typedoc.json` entryPoints
- All tests must pass before commit
- **Plan Completeness Gap Reporting**: Every technical plan MUST end with an honest "What Remains After This Plan" section that clearly lays out the real-world usability or feature gaps that are deliberately left unaddressed, preventing agents from prematurely concluding that a major initiative is "finished".
- See [CONTRIBUTING.md](CONTRIBUTING.md) for full AI Agent Documentation Standards

<!-- holoscript-absorb:start -->

## HoloScript Absorb — Codebase Intelligence

This project is scanned by **HoloScript Absorb** (`absorb.holoscript.net`). Run `holo_graph_status` for current symbol / relationship / execution-flow counts, or `GET https://absorb.holoscript.net/health` for service-level stats.

## Always Start Here

1. **Call `holo_graph_status({})`** — check cache freshness (<24h = use it)
2. **Match your task to a skill below** and **read that skill file**
3. **Follow the skill's workflow and checklist**

> If step 1 reports stale / missing cache, call `holo_absorb_repo({ rootDir: ".", force: true })` first. CLI fallback: `npx tsx packages/cli/src/cli.ts absorb . --json`.

## Skills

**Verified state 2026-04-27 (absorb-service)**: the HoloScript MCP server at `mcp.holoscript.net` returns 200 on `/health` and the `holo_*` codebase intelligence tools ARE callable. **Absorb** (`absorb.holoscript.net`) routes are defined in-repo (`services/absorb-service/src/server.ts`); Liveness: `GET /health` and `GET /mcp` (SSE) are the reliable production probes. **REST** under `/api/...` has been blocked or inconsistent in live deploys (authenticated probes returning 404 — board task_1777164270247_7ee8, deploy stack). **Do not assume** `curl https://absorb.holoscript.net/api/...` works in production until a probe returns 2xx. Prefer **`holo_*` tools on `mcp.holoscript.net`**, local `packages/cli` absorb, or `Read`+`Grep` over betting on live absorb REST. Client middleware fix (2026-04-27): `auth` anonymous `POST` scan now matches mount-relative `req.path` for `/api/absorb/scan` so that route is reachable when the app actually serves it.

| Task                                         | First choice (try this) | Fallback if it errors |
| -------------------------------------------- | ----------------------- | --------------------- |
| Understand architecture / "How does X work?" | `holo_ask_codebase({ question: "..." })` via mcp.holoscript.net | Read `packages/*/src/index.ts` barrel + symbol's defining file via Read tool |
| Blast radius / "What breaks if I change X?"  | `holo_impact_analysis({ symbol: "..." })` via mcp.holoscript.net | `git grep -n "<symbol>" packages/*/src/` to enumerate consumers |
| Trace bugs / "Why is X failing?"             | `engineering:debug` plugin skill | Read the failing test + Grep for the symbol; cross-check `git log -p -- <file>` |
| Rename / extract / split / refactor          | `holo_query_codebase({ query: "callers", symbol: "..." })` | `git grep -n "<symbol>"` for call sites, then Edit each |
| Tools, resources, schema reference           | `curl https://mcp.holoscript.net/health` for tool count + `cat .well-known/mcp` for tool list | (no fallback — these endpoints are the canonical source) |
| Index, status, clean CLI commands            | `pnpm --filter @holoscript/cli build` then `node packages/cli/dist/cli.js --help` | (no fallback — local CLI is the canonical) |
| Architectural reasoning / "should this go in core or engine?" | `engineering:system-design` + `engineering:tech-debt` plugin skills | Read NORTH_STAR.md DT-1 + impact analysis above |

<!-- holoscript-absorb:end -->
