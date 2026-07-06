---
name: absorb
description: >
  Codebase intelligence via HoloScript Absorb — the GEV absorb-service (Graph · RAG ·
  Embedding · Vision): scan repos into knowledge graphs, semantic search, Graph RAG Q&A,
  impact analysis, and recursive self-improvement. Sovereign by default (HoloEmbed
  embeddings, HoloLlama synthesis); route local repos to the holoscript-local MCP, not
  the FS-blind remote. Use to understand, map, or analyze any codebase before refactoring,
  planning, or investigating dependencies.
argument-hint: "[status|repo|query|ask|diff|provenance|fmu] [args]"
disable-model-invocation: false
allowed-tools: Bash, Read, Grep, Glob
---

# HoloScript Absorb — Codebase Intelligence Skill

**Working directory**: `C:/Users/Josep/Documents/GitHub/HoloScript` (MANDATORY)

## This skill IS GEV — the whole absorb-service (D.123)

Absorb is not four tools — it is one service, **GEV = Graph · RAG · Embedding · Vision**
(`@holoscript/absorb-service`). Every query you run flows through all four pillars:

- **G**raph — `CodebaseGraph` + community detection (structure, call/import edges)
- **R**AG — `GraphRAGEngine` fuses `0.6·semantic + 0.2·connections + 0.2·impact` and
  synthesizes with an LLM (sovereign **HoloLlama** by default — see below)
- **E**mbedding — `EmbeddingIndex` over **sovereign HoloEmbed** vectors by default
- **V**ision — `CodebaseSceneCompiler` / `HoloEmitter` emit a navigable `graph.holo`

Judge results at the **service** level (embed + graph re-rank + synthesis), never one
pillar alone — weak embedding-only recall is by-design, the graph fixes precision (W.764).

## Route to the sovereign LOCAL MCP — the remote is FS-blind (R.027)

**The #1 reason agents "battle" absorb: their MCP client routes codebase tools to the
remote `holoscript` server (railway / holoscript.net, `cwd=/app`), which cannot see your
local files** → `cache_root_mismatch` / "No Graph RAG engine initialized". For any
**local repo**, call the **`holoscript-local`** MCP (tools appear as
`mcp__holoscript-local__*`) — see the `/holoscript-local` skill. The remote handles only
shared state (board, knowledge, seats) and public-repo lanes. If you just rebuilt the
`dist`, **restart the MCP client** before calling it (W.766 — a live stdio server loses its
content-hashed chunks when the dist is rebuilt underneath it).

## When to Use This Skill

Absorb turns any codebase into a queryable knowledge graph with semantic search,
call-chain tracing, community detection, impact analysis, and LLM-powered Q&A.
It supports TypeScript, Python, Rust, Go, and JavaScript via tree-sitter adapters.

**Use absorb when you need to:**
- **Understand before changing** — scan the codebase, ask "what calls X?", check blast radius before refactoring
- **Find by meaning, not name** — semantic search finds "authentication handler" even if the function is called `resolveRequestingAgent`
- **Ask natural language questions** — Graph RAG combines vector search + graph traversal + LLM synthesis for cited answers
- **Detect drift** — fast content-hash check to see if the graph cache is stale without re-scanning
- **Trace cross-package flows** — follow a call chain from studio through core to mcp-server across package boundaries
- **Find dead code** — discover exported symbols with zero callers, orphaned interfaces, unused compiler targets
- **Run self-improvement** — L0 (code fixer) → L1 (strategy optimizer) → L2 (meta-strategist) autonomous improvement pipeline
- **Generate .holo visualizations** — emit navigable 3D compositions of the codebase graph for spatial exploration

**Do NOT use absorb for:**
- Git history questions → use `git log`, `git blame`
- Runtime behavior → absorb sees static structure, not runtime values
- Deployment config → absorb scans source code, not .env or Docker files
- Simple file reads → use `Read` tool directly if you already know the path

## Covered tools

The capability cartographer uses this section to verify that absorb prefix
coverage is backed by explicit tool names.

`absorb_query`, `absorb_diff`, `absorb_list_projects`,
`absorb_create_project`, `absorb_delete_project`, `absorb_run_absorb`,
`absorb_run_improve`, `absorb_run_pipeline`, `absorb_run_query_ai`,
`absorb_run_render`, `absorb_check_credits`, `absorb_provenance_answer`,
`absorb_typescript`, `absorb_suggest_holoscript_transform`,
`absorb_get_status`, `absorb_fmu`

## Quick Start

```bash
# 1. Check graph freshness (always do this first)
# MCP: holo_graph_status({})
holoscript graph-status

# 2. Scan if stale (>24h or never scanned)
# MCP: holo_absorb_repo({ directory: ".", force: false })
holoscript absorb .

# 3. Query the graph
# MCP: holo_query_codebase({ query: "callers", symbol: "buildIndex" })
holoscript query "what calls buildIndex"
```

## Production Endpoints

| Service | URL | Auth |
|---------|-----|------|
| **Sovereign local MCP** (canonical for local-repo absorb/codebase tools — R.027) | `POST http://127.0.0.1:7411/mcp` — start: `node packages/mcp-server/dist/http-server.js`; Jetson anchor `http://192.168.0.119:7411/mcp` | None |
| MCP Server (remote — FS-blind, public-repo/shared lanes only; do NOT route local-repo absorption here) | `https://mcp.holoscript.net` | None (free tools). The deployed endpoint does not serve SSE GET (409 on the 2026-07-06 probe) — use REST/HTTP POST. |
| Absorb Service (remote) | `https://absorb.holoscript.net` | Bearer `ABSORB_API_KEY` |
| MCP Protocol (remote — FS-blind, cannot see local paths) | `POST https://mcp.holoscript.net/mcp` | None |
| Studio (paid ops) | `https://studio.holoscript.net` | Bearer `ABSORB_API_KEY` |
| Orchestrator | `https://mcp-orchestrator-production-45f9.up.railway.app` | `x-mcp-api-key` header |

**Auth**: `ABSORB_API_KEY` from `~/.ai-ecosystem/.env` (source via canonical pattern). Admin/founder tier = all tools free, no rate limits.

## MCP Tools — FREE (Local, No Credits)

### Codebase Scanning

| Tool | Description | When to Use |
|------|-------------|-------------|
| `holo_graph_status` | Cache age, stats, loaded state | **Always first** — check before scanning |
| `holo_absorb_repo` | Full scan → graph → emit pipeline | Before refactoring. `force: false` = ~21ms from cache |
| `holo_get_absorb_status` | Poll running absorb job by `jobId` | Long-running scans |
| `holo_detect_drift` | Fast content-hash check without re-scan | Quick staleness check |
| `absorb_typescript` | Convert TypeScript → `.holo` composition | Detect routes, models, queues, patterns |

### Graph Queries

| Tool | Description | When to Use |
|------|-------------|-------------|
| `holo_query_codebase` | Graph traversal: callers, callees, imports, symbols, find, trace, communities, stats | Dependency analysis |
| `holo_impact_analysis` | Transitive blast radius for changed files/symbols | Before modifying shared code |
| `holo_detect_changes` | Structural diff between two graph snapshots | Compare before/after git refs |
| `holo_resolve_symbol` | Federated symbol resolution across knowledge mesh | Cross-package lookups |

### Semantic Search & RAG

| Tool | Description | When to Use |
|------|-------------|-------------|
| `holo_semantic_search` | Vector/BM25 search over symbols, docs, paths | Find related code |
| `holo_ask_codebase` | Graph RAG: search + graph + LLM synthesis | Natural language Q&A with citations |
| `absorb_query` | Branded wrapper for `holo_semantic_search` | Same as above |
| `absorb_diff` | Semantic AST diff between two code snippets | Detect renames, moves, structural changes |

### Project Management (Studio)

| Tool | Description |
|------|-------------|
| `absorb_list_projects` | List all Studio absorb projects |
| `absorb_create_project` | Create project (github/local/upload source) |
| `absorb_delete_project` | Delete project by ID |
| `absorb_check_credits` | Check balance, tier, transaction history |

## MCP Tools — PAID (Studio, Credits Deducted)

| Tool | Credits | Description |
|------|---------|-------------|
| `absorb_run_absorb` | 10 (shallow) / 50 (deep) | Full cloud absorption with persistent storage |
| `absorb_run_improve` | 25-150 | HoloDaemon improvement cycle (quick/balanced/deep) |
| `absorb_run_query_ai` | 15+ metered tokens | AI-powered Q&A with LLM synthesis |
| `absorb_run_render` | 3-5 | Screenshot (PNG/JPEG/WebP) or PDF export |
| `absorb_run_pipeline` | 100+ | Recursive self-improvement pipeline (L0/L1/L2) |

### Credit Costs (from pricing.ts — authoritative)

| Operation | Credits |
|-----------|---------|
| `absorb_shallow` | 10 |
| `absorb_deep` | 50 |
| `daemon_quick` | 50 |
| `daemon_balanced` | 100 |
| `daemon_deep` | 250 |
| `pipeline_l0` | 100 |
| `pipeline_l1` | 75 |
| `pipeline_l2` | 150 |
| `query_basic` | 2 |
| `query_with_llm` | 10 + metered |
| `screenshot` | 3 |
| `pdf_export` | 5 |
| `semantic_diff` | 2 |

1 credit = $0.01. LLM tokens metered at 15% markup.

## Pipeline Stages

### Local Scan (`holo_absorb_repo`)

```
scan (CodebaseScanner + language adapters)
  → graph (CodebaseGraph + community detection)
    → embed (EmbeddingIndex: HoloEmbed sovereign default | Xenova offline | OpenAI/nomic opt-in | BM25 floor)
      → cache (~/.holoscript/graph-cache.json + embeddings)
        → emit (.holo scene | JSON graph | stats)
```

Phases: `queued` → `scanning` → `analyzing` → `indexing` → `complete`

### Self-Improvement Pipeline (L0/L1/L2)

```
ABSORB → DIAGNOSE → GENERATE → VALIDATE → COMMIT → LEARN
```

- **L0** Code Fixer: patches, measures quality delta
- **L1** Strategy Optimizer: adjusts focus, profile, budget
- **L2** Meta-Strategist: generates skills, wisdom entries, architectural insights

## CLI Commands

```bash
# Absorption
holoscript absorb .                              # Scan → .holo output
holoscript absorb packages/core --json           # JSON knowledge graph
holoscript absorb . --for-agent                  # Agent manifest
holoscript absorb . --depth shallow              # Fast manifest-only
holoscript absorb . --since HEAD~5               # Changed files only

# Semantic query
holoscript query "what calls buildIndex"                    # BM25 default
holoscript query "how does the parser work" --with-llm      # LLM synthesis
holoscript query "find auth handlers" --provider openai     # Cloud embeddings
holoscript query "trace from absorb" --top-k 20 --json      # Machine-readable

# Self-improvement
holoscript self-improve                          # 5 cycles default
holoscript self-improve --cycles 10 --commit     # Auto-commit fixes (uses canonical scopes, 72-char limit)
holoscript self-improve --daemon                 # Continuous until convergence
```

## Embedding Provider — Sovereign HoloEmbed by default (F.106 / D.118 / W.GOLD.005)

**The default is sovereign `HoloEmbed` — native, zero-cost, no key, no egress
(`@holoscript/holoembed`, 768-dim). Do NOT reach for OpenAI or nomic by reflex; foreign
vectors are opt-in, never the silent default.** The embedding *space* is the sovereignty
boundary (W.763): once the graph/memory is indexed with HoloEmbed vectors, a foreign
provider's vectors are not comparable to it — mixing them silently corrupts recall.

**Weak embedding-only recall is BY DESIGN, not a defect (W.764 / D.123).** HoloEmbed's
natural-language recall *on embeddings alone* is lower than a giant cloud model
(R@1 ~40% vs nomic ~81%). That is expected and fine — GEV never retrieves on embeddings
alone. `GraphRAGEngine` re-ranks candidates with graph signal, and the graph is what makes
precision good. Never judge (or "fix") retrieval by swapping in a foreign embedder.

Provider tiers (sovereign first):
1. **`holoembed`** — native `@holoscript/holoembed`, **the default; $0, offline, no key**
2. **`xenova`** — local WASM transformer, offline fallback
3. **`bm25`** — keyword-only floor; correct for exact-symbol lookups, weak for semantic
4. **`openai` / `nomic`** — **foreign, opt-in ONLY** via explicit `EMBEDDING_PROVIDER=openai`;
   use only for a deliberate cross-model comparison, never as the ambient default

**If a foreign provider is active unexpectedly**: unset `EMBEDDING_PROVIDER` /
`OPENAI_API_KEY` in the shell so the service falls back to sovereign HoloEmbed. Re-index if
foreign vectors leaked into a HoloEmbed graph — the two spaces are not queryable together.

## Example Questions for Graph RAG (`holo_ask_codebase`)

Graph RAG is NOT keyword search. It embeds your question, finds semantically similar symbols,
walks the call graph to discover callers/callees/communities, scores by impact radius, then
feeds the enriched context to an LLM for a cited answer. This means questions about
*relationships* and *flow* outperform questions about *names*.

The engine sees: symbol signatures, doc comments, file paths, import edges, call edges,
community clusters, and transitive impact. It does NOT see: runtime values, environment
variables, deployment config, or git history. Frame questions accordingly.

### Compilation & Target Pipeline
- "Walk me through what happens when compile_to_unity is called — from .holo parse through AST transform to target output emission"
- "What sovereign compilers exist vs bridge compilers, and how does CompilerBase enforce RBAC before either type runs?"
- "How does the incremental compiler determine which symbols are stale and need recompilation vs which can be skipped?"
- "Which compilers share the most code — are there compilation families that could be refactored into shared base classes?"
- "What happens to trait metadata during the WebGPU compilation path — does it survive or get stripped?"
- "How does the multi-target compiler coordinate when the same .holo source is compiled to 3 targets simultaneously?"

### Trait System & Composition
- "Trace how a trait defined in constants/physics.ts flows through AST construction, composition resolution, compiler consumption, and R3F rendering"
- "What trait categories have custom runtime handlers vs categories that are purely declarative metadata?"
- "Show the composition chain when an object has both 'grabbable' and 'physics_body' — how are conflicts resolved?"
- "Which traits are spatial-only vs applicable to non-visual domains like banking or legal compliance?"
- "How does trait validation prevent incompatible combinations, and what error does an agent see when it fails?"

### Simulation & Scientific Computing
- "How does the structural FEA solver dispatch WebGPU compute shaders — trace from SimulationContract through solver selection to GPU kernel launch"
- "What is the difference between TET4 and TET10 element formulation and where does the shape function evaluation happen?"
- "How does the thermal solver couple with the structural solver for thermo-mechanical analysis — is it one-way or bidirectional?"
- "Where does the SNN spiking neural network store neuron state between timesteps on the GPU, and how does it handle the 10K neuron @ 60Hz budget?"
- "What validation does the V&V pipeline run on simulation results — how does it detect solver divergence?"

### MCP Server & Tool Infrastructure
- "Trace how a tool definition in tools.ts gets wired to its handler — through http-server.ts dispatch, the cascadeHandled pattern, and back to the response"
- "How does the HoloMesh board tool authenticate differently from compile tools — what's the auth flow for each?"
- "What happens when an MCP tool call arrives via JSON-RPC (POST /mcp) vs REST (POST /api/compile) — where do the paths diverge and reconverge?"
- "How do agent-orchestration-tools coordinate multi-tool workflows — is there a DAG scheduler or is it sequential?"
- "Where does the observability pipeline export OpenTelemetry traces and what spans does it capture for a tool call?"

### Plugin Architecture
- "What interface must a domain plugin implement to register with the core — trace from plugin discovery through to trait injection"
- "How does the medical-plugin's DICOM trait differ from the radio-astronomy FITS trait — do they share any base infrastructure?"
- "Can plugins define their own compilation targets or only inject traits that existing compilers consume?"
- "What's the plugin loading mechanism — are they statically imported or discovered at runtime via package.json entries?"

### Identity, Auth & Agent Coordination
- "Trace resolveRequestingAgent through all three resolution paths: key registry, legacy agent store, and raw env key comparison"
- "What's the difference between founder auth, agent auth, and per-server keys — how does scope enforcement work for each?"
- "How does the CRDT sync layer handle conflicting edits from two agents writing to the same scene simultaneously?"
- "What does the team-coordinator do when an agent misses two heartbeat cycles — is the task released immediately or is there a grace period?"

### Debugging & Investigation
- "What error recovery paths exist in the compiler dispatch chain — where can compilation fail silently?"
- "Where are WebGPU compute shaders dispatched in the SNN package, and what happens if the GPU doesn't support the required features?"
- "How does the embedding index handle out-of-vocabulary tokens that OpenAI's tokenizer hasn't seen?"
- "What validation runs before a .holo file reaches any compiler — is it parser-level, semantic-level, or both?"
- "Why might the SSE transport fail on Railway specifically — what CDN behavior causes GET/POST routing to split?"

### Edge Cases (where Graph RAG beats naive search)
- "Which exported functions have zero callers anywhere in the codebase?" — find dead code
- "There are multiple 'parse' functions — which handles .holo vs .hs vs .hsplus?"  — disambiguate naming collisions
- "Which tool handlers are registered dynamically at startup vs statically in tools.ts?" — runtime vs static structure
- "What code paths only execute in production (Railway env) vs development?" — env-gated behavior
- "Which packages use workspace:* dependencies that would break for external users?" — monorepo gotchas
- "If I delete packages/connector-github, what's the total transitive impact?" — blast radius at scale
- "Find interfaces that are defined but never implemented" — orphaned contracts
- "Which test suites import the most source files?" — slow test candidates

### Tricky Framing (same question, better results)

| Weak question | Why it fails | Better question |
|---------------|-------------|-----------------|
| "How does auth work?" | Matches 'auth' strings everywhere | "Trace resolveRequestingAgent through key registry, agent store, and env fallback" |
| "What's the blast radius of changing CodebaseGraph?" | Gets surface-level "it's in absorb" | "What are all transitive dependents of CodebaseGraph across packages?" |
| "Find error handling" | Too broad, returns noise | "What error recovery paths exist in the compiler dispatch chain?" |
| "How do plugins work?" | Matches every plugin file | "What interface must a domain plugin implement to register with core?" |
| "Show me the API" | Ambiguous — REST? MCP? Internal? | "How does an MCP tool call arrive via JSON-RPC and reach its handler?" |

### Semantic Search (`holo_semantic_search`)
- `"authentication handler"` — find auth-related code
- `"database connection"` — find DB logic
- `"error recovery"` — find error handling patterns
- `"trait composition"` — find trait system code
- `"WebGPU compute"` — find GPU compute shaders
- `"spatial indexing"` — octree, BVH, spatial hash
- `"animation interpolation"` — keyframe and easing logic
- `"credit deduction"` — billing and metering

Filter for precision:
- `holo_semantic_search({ query: "compiler", type: "class" })` — only compiler classes
- `holo_semantic_search({ query: "validate", type: "function" })` — only validation functions
- `holo_semantic_search({ query: "shader", file: "snn-webgpu" })` — only SNN GPU code

### When Results Are Wrong

| Symptom | Cause | Fix |
|---------|-------|-----|
| `cache_root_mismatch` / "No Graph RAG engine initialized" | Routed to the **remote** FS-blind `holoscript` MCP (`cwd=/app`) | Route to **`holoscript-local`** instead (R.027) — see the `/holoscript-local` skill |
| `Cannot find module ...graph-rag-tools-HASH.cjs` | The `dist` was rebuilt while the stdio MCP was running | **Restart the MCP client** (W.766) — the live process lost its content-hashed chunks |
| Empty results | Graph not loaded | Run `holo_graph_status`, then `holo_absorb_repo` if stale |
| Shallow/obvious answers | topK too low for a large monorepo (verify package count via `pnpm ls -r --depth -1`) | Bump to `topK: 40` |
| LLM hallucinates details | Real answer ranked below top 10 | Bump topK or narrow with `file`/`language` filter |
| Weak semantic recall on NL query | Expecting embedding-alone recall to match a cloud model | Working as designed (W.764) — the graph re-rank fixes precision; do NOT swap to a foreign embedder |
| Stale results after code changes | Graph cache is old | `holo_absorb_repo({ force: true })` to rebuild |

## Workflow: Before Refactoring

```
1. holo_graph_status({})
   → Is cache fresh (<24h)? If not, continue to step 2.

2. holo_absorb_repo({ directory: ".", force: false })
   → Builds/refreshes knowledge graph (~21ms from cache, ~3-10s fresh)

3. holo_impact_analysis({ files: ["src/compiler/R3FCompiler.ts"] })
   → Shows all transitively affected files

4. holo_query_codebase({ query: "callers", symbol: "CompilerBase" })
   → Lists everything that depends on the symbol

5. Refactor with confidence — you know the blast radius.
```

## Workflow: Codebase Q&A

```
1. holo_graph_status({})  → ensure graph is loaded

2. holo_ask_codebase({
     question: "How does the trait registration pipeline work?"
     // llmProvider defaults to sovereign HoloLlama (D.117):
     // detectDefaultLLMProvider() ?? 'holollama' — llama.cpp llama-server at :18080.
     // Omit it to stay sovereign; pass 'anthropic'/'openai' only for a deliberate override.
   })
   → Returns synthesized answer with file citations

3. Follow citations to read specific files for deeper understanding.
```

## Workflow: Recursive Self-Improvement

```
1. holo_graph_status({})  → ensure fresh graph

2. absorb_run_pipeline({ projectId: "...", layer: "l0" })
   → L0: scans → diagnoses → generates patches → validates → commits

3. absorb_run_pipeline({ projectId: "...", layer: "l1" })
   → L1: adjusts strategy based on L0 results

4. absorb_run_pipeline({ projectId: "...", layer: "l2" })
   → L2: generates new skills and architectural insights
```

## Key Rules

- **ROUTE LOCAL**: for local repos, use the `holoscript-local` MCP (`mcp__holoscript-local__*`), never the FS-blind remote `holoscript` (R.027)
- **STAY SOVEREIGN**: HoloEmbed embeddings + HoloLlama synthesis by default; foreign OpenAI/nomic/anthropic are explicit opt-in only (F.106 / D.117 / D.118)
- **ALWAYS** call `holo_graph_status` before any scan or query operation
- **NEVER** use `force: true` on `holo_absorb_repo` unless `holo_graph_status` says cache is corrupt
- **RESTART after rebuild**: if you rebuilt `packages/*/dist`, restart the MCP client before querying (W.766)
- **Cache TTL**: 24 hours. Incremental re-scan detects changes via git content hashes.
- **Cost awareness**: Free tools for local ops. Paid tools deduct credits. Check with `absorb_check_credits`.
- **Graph cache**: `~/.holoscript/graph-cache.json` (local), `/app/.holoscript` (Docker)

## Source Files Reference

| File | Purpose |
|------|---------|
| `packages/absorb-service/src/mcp/codebase-tools.ts` | Free scan/query tool definitions |
| `packages/absorb-service/src/mcp/graph-rag-tools.ts` | Semantic search + RAG tools |
| `packages/absorb-service/src/mcp/absorb-tools.ts` | Studio proxy + paid tools |
| `packages/absorb-service/src/mcp/absorb-typescript-tools.ts` | TypeScript → .holo converter |
| `packages/absorb-service/src/credits/pricing.ts` | Authoritative credit costs |
| `packages/absorb-service/src/pipeline/types.ts` | L0/L1/L2 pipeline types |
| `infrastructure/Dockerfile.mcp-server` | Production container |
