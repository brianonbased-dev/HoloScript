---
name: holoscript-absorb
description: >
  Codebase intelligence via HoloScript Absorb — scan repos into knowledge graphs,
  semantic search, Graph RAG Q&A, impact analysis, and recursive self-improvement.
  Use when you need to understand, map, or analyze any codebase before refactoring,
  planning, or investigating dependencies.
---

# HoloScript Absorb — Codebase Intelligence Skill

**Working directory**: `C:/Users/Josep/Documents/GitHub/HoloScript` (MANDATORY)

## When to Use This Skill

- Before refactoring: scan the codebase to understand impact
- Before architectural decisions: query the knowledge graph
- When investigating dependencies or call chains
- When you need semantic search across a codebase
- When running recursive self-improvement pipelines

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
| MCP Server (122 tools) | `https://mcp.holoscript.net` | None (free tools) |
| Absorb Service | `https://absorb.holoscript.net` | Bearer `ABSORB_API_KEY` |
| MCP Protocol | `POST https://mcp.holoscript.net/mcp` | None |
| Studio (paid ops) | `https://studio.holoscript.net` | Bearer `ABSORB_API_KEY` |
| Orchestrator | `https://mcp-orchestrator-production-45f9.up.railway.app` | `x-mcp-api-key` header |

**Auth**: `ABSORB_API_KEY` from `HoloScript/.env`. Admin/founder tier = all tools free, no rate limits.

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
    → embed (EmbeddingIndex: BM25 / OpenAI / Ollama / Xenova)
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
holoscript self-improve --cycles 10 --commit     # Auto-commit fixes
holoscript self-improve --daemon                 # Continuous until convergence
```

## Embedding Provider (MANDATORY: OpenAI)

**ALWAYS use OpenAI embeddings for best quality.** BM25 is keyword-only and produces poor results for semantic queries. The `OPENAI_API_KEY` is set in `HoloScript/.env` — it's free for the founder tier.

**Required**: Set `EMBEDDING_PROVIDER=openai` or ensure `OPENAI_API_KEY` is in the environment.

Provider priority (auto-detected):
1. `EMBEDDING_PROVIDER` env var (explicit override) — **set to `openai`**
2. `openai` — if `OPENAI_API_KEY` set (**this is what we want**)
3. `ollama` — local, acceptable fallback if OpenAI unavailable
4. `bm25` — keyword-only, **NEVER use for production queries**
5. `xenova` — local WASM transformer, OK for offline

**If you see BM25 being used**: check that `OPENAI_API_KEY` is exported in the current shell. The key lives in `C:/Users/Josep/Documents/GitHub/HoloScript/.env`.

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
     question: "How does the trait registration pipeline work?",
     llmProvider: "anthropic"
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

- **ALWAYS** call `holo_graph_status` before any scan or query operation
- **NEVER** use `force: true` on `holo_absorb_repo` unless `holo_graph_status` says cache is corrupt
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
