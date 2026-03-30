# Codebase Intelligence

HoloScript ships two CLI commands that turn any codebase into a queryable knowledge graph:

| Command                       | Purpose                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `holoscript absorb <dir>`     | Scan source files, extract symbols, build a call graph + community structure, emit a `.holo` composition |
| `holoscript query <question>` | Semantic GraphRAG search over an absorbed codebase                                                       |

---

## absorb

Scans a directory of TypeScript, Python, Rust, or Go files and produces a rich knowledge graph.

```bash
# Scan current directory, write spatial .holo composition to stdout
holoscript absorb .

# Write JSON graph to a file
holoscript absorb packages/core --json -o core-graph.json

# Agent-optimized manifest (smaller, structured for LLM consumption)
holoscript absorb . --for-agent

# Shallow scan: manifest + symbol index only (fast)
holoscript absorb . --depth shallow

# Limit to files changed since a git ref or date
holoscript absorb . --since HEAD~10
holoscript absorb . --since "2024-01-01"

# Compute blast-radius for specific files
holoscript absorb . --impact packages/core/src/parser.ts,packages/core/src/compiler.ts
```

### Output

By default `absorb` writes a `.holo` composition that can be loaded in HoloLand for 3D exploration. Use `--json` for programmatic consumption. Use `--for-agent` to get a compact manifest optimised for feeding into an LLM context window.

### Flags

| Flag                            | Description                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| `--for-agent`                   | Emit agent-optimized manifest instead of spatial `.holo`                                     |
| `--depth shallow\|medium\|deep` | Level of detail. `shallow` = manifest+index, `medium` = +public API, `deep` = full (default) |
| `--since <ref>`                 | Limit to files changed since a git ref, commit hash, or ISO date                             |
| `--impact <files>`              | Comma-separated list of files to compute blast-radius for                                    |
| `--json`, `-j`                  | Output as JSON instead of `.holo`                                                            |
| `--output <path>`, `-o`         | Write output to file                                                                         |

---

## query

Performs a Graph-RAG (Retrieval-Augmented Generation) search over a codebase. Each query:

1. Embeds the question using the configured provider
2. Retrieves semantically similar symbols from the index
3. Enriches each result with graph context (callers, callees, impact radius, community)
4. Re-ranks results by a composite score of semantic similarity, connection density, and impact

```bash
# Basic keyword search (BM25, zero deps, default)
holoscript query "what calls buildIndex"

# Semantic search via local WASM model (~25 MB, no API key)
holoscript query "how does the parser handle errors" --provider xenova

# Semantic search via OpenAI (requires OPENAI_API_KEY)
holoscript query "find all authentication middleware" --provider openai

# LLM-synthesised natural-language answer
holoscript query "explain the compiler pipeline" --with-llm --llm openai

# Use Anthropic instead of OpenAI for the LLM step
holoscript query "trace call chain from absorb" --with-llm --llm anthropic

# More results, JSON output for programmatic use
holoscript query "error handlers" --top-k 20 --json
```

### Embedding Providers

The `--provider` flag selects the backend used to embed the query and index symbols.

| Provider      | Flag                | Deps                        | Dim    | Notes                                                              |
| ------------- | ------------------- | --------------------------- | ------ | ------------------------------------------------------------------ |
| BM25          | `--provider bm25`   | None                        | 1024   | Default. Keyword/identifier matching. Fast, zero setup.            |
| Xenova (WASM) | `--provider xenova` | `@huggingface/transformers` | 384    | Semantic. Model downloaded once (~25 MB) and cached.               |
| OpenAI        | `--provider openai` | `openai` package + API key  | 1536   | Highest quality. Requires `OPENAI_API_KEY` env var or `--llm-key`. |
| Ollama        | `--provider ollama` | Running Ollama instance     | varies | Local server. Run `ollama pull nomic-embed-text` first.            |

#### Installing optional providers

```bash
# Xenova WASM (semantic, local)
pnpm add @huggingface/transformers --filter @holoscript/core

# OpenAI
pnpm add openai --filter @holoscript/core
export OPENAI_API_KEY=sk-...

# Ollama (separate install: https://ollama.ai)
ollama pull nomic-embed-text
```

### LLM-synthesised answers (`--with-llm`)

Adding `--with-llm` pipes the top GraphRAG results into an LLM that writes a natural-language answer with citations.

```bash
holoscript query "how does the absorb command build the call graph" \
  --with-llm \
  --llm openai \
  --model gpt-4o-mini
```

LLM backends:

| Backend   | Flag              | Env var             |
| --------- | ----------------- | ------------------- |
| OpenAI    | `--llm openai`    | `OPENAI_API_KEY`    |
| Anthropic | `--llm anthropic` | `ANTHROPIC_API_KEY` |
| Gemini    | `--llm gemini`    | `GEMINI_API_KEY`    |

Use `--llm-key <key>` to pass the API key directly instead of via an environment variable.

### Flags

| Flag              | Description                                                       |
| ----------------- | ----------------------------------------------------------------- |
| `--provider <b>`  | Embedding backend: `bm25` (default), `xenova`, `openai`, `ollama` |
| `--top-k <n>`     | Number of results to return (default: 10)                         |
| `--with-llm`      | Synthesise a natural-language answer from the top results         |
| `--llm <adapter>` | LLM backend for `--with-llm`: `openai`, `anthropic`, `gemini`     |
| `--llm-key <key>` | API key for the LLM (overrides env vars)                          |
| `--model <name>`  | Model override for embedding or LLM backend                       |
| `--json`, `-j`    | Machine-readable output                                           |

---

## EmbeddingProvider API

You can use the provider system programmatically in your own code:

```typescript
import {
  createEmbeddingProvider,
  BM25EmbeddingProvider,
  XenovaEmbeddingProvider,
  EmbeddingIndex,
  GraphRAGEngine,
} from '@holoscript/core';

// Factory — picks backend from options
const provider = await createEmbeddingProvider({ provider: 'xenova' });

// Or instantiate directly
const bm25 = new BM25EmbeddingProvider(); // zero deps
const xenova = new XenovaEmbeddingProvider(); // WASM semantics
// const openai = new OpenAIEmbeddingProvider('sk-...'); // cloud
// const ollama = new OllamaEmbeddingProvider();         // local server

// Build an index
const index = new EmbeddingIndex({ provider });
await index.addSymbols(symbols);

// Query
const results = await index.search('what calls buildIndex', 10);
```

### Using a custom LLM provider

`GraphRAGEngine` accepts any adapter that satisfies the minimal `LLMProvider` interface,
which is structurally compatible with `ILLMProvider` from `@holoscript/llm-provider`:

```typescript
import { GraphRAGEngine, LLMProvider } from '@holoscript/core';
import { OpenAIProvider } from '@holoscript/llm-provider';

const llm: LLMProvider = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY });
const engine = new GraphRAGEngine(graph, index, { llmProvider: llm });

const answer = await engine.queryWithLLM('explain the compiler pipeline');
console.log(answer.answer);
console.log(answer.citations);
```

---

## How it works

### absorb pipeline

```
Source files
    │
    ▼
Symbol extraction (TSMorph / tree-sitter)
    │  names, signatures, doc comments, file:line
    ▼
Call graph construction
    │  caller → callee edges
    ▼
Community detection (Louvain)
    │  groups related files into modules
    ▼
.holo composition  ──┬──  JSON graph
                     │
                     └──  Agent manifest
```

### query pipeline

```
Question string
    │
    ▼
Embed via EmbeddingProvider
    │
    ▼
k-NN search over EmbeddingIndex (cosine similarity)
    │
    ▼
Graph enrichment (callers, callees, impact radius, community)
    │
    ▼
Re-rank by composite score
       semantic × 0.6 + connections × 0.2 + impact × 0.2
    │
    ▼
Optional: LLM synthesis (--with-llm)
    │
    ▼
Ranked results (or LLMAnswer with citations)
```

---

## Performance & Scalability

HoloScript's absorb pipeline includes **enterprise-grade optimizations** for large codebases (10K+ files, 100K+ symbols):

**Key Features:**

- **Incremental Absorb** — Only re-scans changed files (30-60x faster)
- **Worker Thread Parallelization** — Multi-core parsing and embedding (4-8x faster)
- **Real-time Progress Streaming** — Per-file and per-batch progress events
- **Git Hook Auto-Absorb** — Automatic background re-absorb on commit

### Incremental Absorb (Automatic)

Absorb automatically detects changes using git and only re-scans modified files:

```bash
# First run: full scan (~60s for 5000 files)
holoscript absorb .

# Subsequent runs: incremental (~1-2s for 10 changed files)
holoscript absorb .
```

**How it works:**

- Stores graph snapshot + git commit hash in `.holoscript-graph-cache.json`
- On next absorb: compares current HEAD with cached commit
- Only re-scans added/modified/deleted files
- Updates graph incrementally (patch operation, not full rebuild)

**Performance:**

- Full scan: ~60s for 5000 files
- Incremental: <2s for typical commits (10-20 files)
- **30-60x speedup** for active development workflows

### Worker Thread Parallelization (Automatic)

Tree-sitter parsing and embedding generation run in parallel using worker threads:

```bash
# Automatic on multi-core systems
holoscript absorb .

# Console output shows worker pool initialization:
# [CodebaseScanner] Worker pool initialized with 6 threads
# [EmbeddingIndex] Worker pool initialized with 4 threads for parallel embeddings
```

**Performance impact:**

| Operation                    | Sequential | Parallel (4 cores) | Parallel (8 cores) | Speedup         |
| ---------------------------- | ---------- | ------------------ | ------------------ | --------------- |
| **Parsing** (1000 files)     | 20s        | 5s                 | 3s                 | **4-8x faster** |
| **Embeddings** (10K symbols) | 47s        | 12s                | 6s                 | **4-8x faster** |

**Configuration:**

- Automatically detects CPU cores and creates `min(cores - 2, 8)` workers
- Gracefully falls back to sequential if workers unavailable (browsers, WASM)
- No configuration needed — just works

### Real-Time Progress Streaming (MCP/Studio)

When using the MCP server or Studio, absorb provides **real-time progress events** via Server-Sent Events (SSE):

```bash
# Via MCP streaming endpoint
curl -N -X POST https://mcp.holoscript.net/api/daemon/absorb/stream \
  -H "Content-Type: application/json" \
  -d '{"projectPath":"/path/to/repo"}'

# Server-Sent Events (SSE) output:
data: {"type":"start","jobId":"absorb-123"}
data: {"type":"progress","phase":"scanning","progress":15,"filesProcessed":150,"totalFiles":1000}
data: {"type":"progress","phase":"analyzing","progress":70}
data: {"type":"progress","phase":"Embedding batch 50/313 (1600 symbols)","progress":85}
data: {"type":"complete","stats":{...},"progress":100}
```

**Features:**

- Per-file progress during scanning (10-70%)
- Per-batch progress during embedding (80-95%)
- ~313 progress events for 10K symbols (instead of just 1)
- Studio UI shows real-time progress bars

### Git Hook Auto-Absorb (Optional)

Automatically re-absorb after every git commit with **zero overhead**:

```bash
# Install post-commit hook (one-time setup)
holoscript setup-hooks
# ✓ HoloScript auto-absorb hook installed
#   Location: .git/hooks/post-commit
#   Studio URL: http://localhost:3000

# Now every commit triggers incremental absorb in background
git commit -m "Update authentication handler"
# (Hook runs in background, never blocks commit)
```

**Safety features:**

- **Non-blocking**: Runs in background subprocess (`&`)
- **Fast health check**: 1-second timeout to verify Studio is running
- **Silent failures**: If Studio offline, hook exits gracefully
- **Smart caching**: If no code changes within 5 minutes, returns cached result (<10ms)
- **Zero commit overhead**: <50ms health check, absorb happens after commit completes

**Typical workflow:**

1. Make code changes → 2. Commit → 3. Hook triggers → 4. Incremental absorb (~1s) → 5. Studio refreshes

### Embedding Provider Performance

| Provider          | Speed (10K symbols)               | Quality            | Requirements                              |
| ----------------- | --------------------------------- | ------------------ | ----------------------------------------- |
| **BM25**          | **Instant** (<1s)                 | Good for keywords  | None (built-in)                           |
| **Xenova (WASM)** | 25s                               | Good for semantics | `@huggingface/transformers` (~25MB model) |
| **Ollama**        | 30s                               | Excellent          | Ollama server running locally             |
| **OpenAI**        | 12s (parallel) / 47s (sequential) | Excellent          | API key + `openai` package                |

**OpenAI parallelization:**

- Processes 4-8 batches concurrently via worker threads
- Reduces embedding time from 47s → 6-12s
- Cost unchanged: ~$0.006 per 10K symbols (text-embedding-3-small)

### Scaling Recommendations

| Codebase Size               | Full Absorb | Incremental | Best Embedding Provider   |
| --------------------------- | ----------- | ----------- | ------------------------- |
| **Small** (<1K files)       | <10s        | <1s         | BM25 or Xenova            |
| **Medium** (1-5K files)     | 30-60s      | 1-2s        | OpenAI (with workers)     |
| **Large** (5-10K files)     | 2-3min      | 2-5s        | OpenAI (with workers)     |
| **Enterprise** (10K+ files) | 5-10min     | 5-10s       | Ollama (local, unlimited) |

### Monitoring Performance

Enable detailed logging to monitor performance:

```bash
# Set debug logging
export DEBUG=holoscript:*

# Run absorb
holoscript absorb . --force

# Console output shows timing for each phase:
# [CodebaseScanner] Scan complete in 15234ms (1234 files)
# [EmbeddingIndex] batch 50/313 (1600 symbols indexed) [PARALLEL]
# [EmbeddingIndex] Index built in 12456ms
```

### Configuration Files

Absorb settings are stored in:

- **`.holoscript-graph-cache.json`** — Graph snapshot + git metadata (for incremental)
- **`.holoscript/absorb-state.json`** — Last absorb timestamp and stats
- **`.git/hooks/post-commit`** — Auto-absorb hook (if installed)

### Troubleshooting

**Problem**: Absorb is slow even for small changes

**Solutions:**

1. Check if cache is stale: `rm .holoscript-graph-cache.json` and re-absorb
2. Verify workers are active: Look for "Worker pool initialized" in logs
3. Use `--force` to bypass incremental (diagnose caching issues)

**Problem**: Workers not being used

**Solutions:**

1. Check Node.js version (requires v12+)
2. Verify worker files exist: `ls node_modules/@holoscript/core/dist/codebase/workers/`
3. Check console for "Worker threads unavailable" warning

**Problem**: Git hook not triggering

**Solutions:**

1. Verify hook is executable: `ls -la .git/hooks/post-commit`
2. Check Studio is running: `curl http://localhost:3000/api/health`
3. Review hook logs: `cat .holoscript/absorb-state.json.log`

---

## MCP Integration

The absorb and query commands are also available as MCP (Model Context Protocol) tools for AI agents:
