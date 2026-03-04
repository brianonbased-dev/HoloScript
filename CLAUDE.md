# ∞ HoloScript — Agent Injection Manifest

> **AGENT**: This file is your behavioral contract for this repo. Execute the SESSION INIT sequence before any other action. All directives below are mandatory.

---

## ∞ PHASE 0 — SESSION INITIALIZATION (MANDATORY)

On every session start, execute this sequence IN ORDER:

```
1. IDENTIFY    → What is the user trying to build or fix?
2. CLASSIFY    → Is this HoloScript code, tooling (TypeScript), or docs?
3. TOOL-FIRST  → If HoloScript: call suggest_traits BEFORE writing any code
4. VALIDATE    → After generation: call validate_holoscript BEFORE returning
5. AFFIRM      → Confirm output matches user intent, state what was done
```

**Skip nothing. If MCP server is unavailable, say so explicitly and ask user to start it.**

---

## ∞ BEHAVIORAL OVERRIDES (HARDCODED — NEVER VIOLATE)

```
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
```

---

## ∞ DECISION TREE — Route Every Request Here

```
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
  → YES → pnpm test first → edit → pnpm test again → explicit git add
  → NO  ↓

User is writing docs?
  → YES → lowercase filenames → add to docs/.vitepress/config.ts sidebar → NO UPPERCASE
```

---

## ∞ MCP TOOL INJECTION — Exact Call Sequences

### Generate HoloScript Object
```
Step 1: suggest_traits({ description: "<user's object description>" })
Step 2: generate_object({ description: "<description>", traits: <result from step 1> })
Step 3: validate_holoscript({ code: <result from step 2> })
Step 4: Return validated code
```

### Generate Full Scene
```
Step 1: suggest_traits({ description: "<scene description>" })
Step 2: generate_scene({ description: "<description>", traits: <step 1 result> })
Step 3: validate_holoscript({ code: <step 2 result> })
```

### Explain Existing Code
```
Step 1: parse_hs({ code: "<code>" })  OR  parse_holo({ code: "<code>" })
Step 2: explain_code({ ast: <step 1 result> })
```

### Find Right Traits
```
Step 1: list_traits({ category: "<interaction|physics|visual|networking|ai|spatial|audio|iot>" })
Step 2: explain_trait({ name: "<trait name>" })
```

---

## ∞ KNOWLEDGE PACK — Compressed Facts

```
REPO        pnpm workspaces monorepo, packages/, TypeScript + vitest + tsup
TRAITS      1,800+ traits in 13 categories — ALL in @holoscript/core (no separate package)
COMPILERS   18+ targets — ALL in @holoscript/core (no separate @holoscript/compiler)
MCP         packages/mcp-server/ — 34 tools — start with: npx tsx packages/mcp-server/src/index.ts
BRITTNEY    ../Hololand/packages/brittney/mcp-server/ — runtime AI, optional
TEST        pnpm test | pnpm test --filter @holoscript/core | createComposition() pattern
BUILD       pnpm build | pre-commit: ESLint + tsc + tests (auto-runs)
WINDOWS     git add -A creates nul file — ALWAYS explicit: git add specific/file.ts
DOCS        docs/.vitepress/config.ts controls ALL navigation — update sidebar on every new page
ARCHIVE     UPPERCASE .md → docs/_archive/ | lowercase .md → docs/[section]/
```

### Packages Quick Map
```
@holoscript/core             Parser · AST · 1,800+ traits · 18+ compilers
@holoscript/mcp-server       34 AI tools (parse, validate, generate, compile)
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
```
Situation                                    → Use
Simple object/scene, no interactivity        → .hs
Object needs grab/physics/network/traits     → .hsplus
AI-generated, cross-platform, declarative    → .holo
Tooling, CLI, parser, adapter code           → .ts (TypeScript)
```

### Trait Category Index
```
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

```
docs/academy/          25 lessons, 3 levels (newcomer entry point)
docs/compilers/        18+ targets: unity/ unreal/ godot/ vrchat/ webgpu/ ios/ vision-os/
                       android/ android-xr/ openxr/ robotics/urdf robotics/sdf iot/dtdl iot/wot
docs/traits/           13 category pages + index + extending guide
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

```
□ Did I call validate_holoscript on all generated HoloScript code?
□ Did I run pnpm test if I modified any TypeScript?
□ Did I use explicit git add (never git add -A)?
□ Did I update docs/.vitepress/config.ts if I created a new doc page?
□ Does the output match what the user actually asked for?
□ Did I state clearly what I created/changed and why?
```

If any box is unchecked → complete that step before responding.

---

## ∞ NEWCOMER FAST PATH

```
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
- See [CONTRIBUTING.md](CONTRIBUTING.md) for full AI Agent Documentation Standards
