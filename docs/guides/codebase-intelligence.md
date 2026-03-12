# Codebase Intelligence

HoloScript ships two CLI commands that turn any codebase into a queryable knowledge graph:

| Command | Purpose |
|---------|---------|
| `holoscript absorb <dir>` | Scan source files, extract symbols, build a call graph + community structure, emit a `.holo` composition |
| `holoscript query <question>` | Semantic GraphRAG search over an absorbed codebase |

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

| Flag | Description |
|------|-------------|
| `--for-agent` | Emit agent-optimized manifest instead of spatial `.holo` |
| `--depth shallow\|medium\|deep` | Level of detail. `shallow` = manifest+index, `medium` = +public API, `deep` = full (default) |
| `--since <ref>` | Limit to files changed since a git ref, commit hash, or ISO date |
| `--impact <files>` | Comma-separated list of files to compute blast-radius for |
| `--json`, `-j` | Output as JSON instead of `.holo` |
| `--output <path>`, `-o` | Write output to file |

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

| Provider | Flag | Deps | Dim | Notes |
|----------|------|------|-----|-------|
| BM25 | `--provider bm25` | None | 1024 | Default. Keyword/identifier matching. Fast, zero setup. |
| Xenova (WASM) | `--provider xenova` | `@huggingface/transformers` | 384 | Semantic. Model downloaded once (~25 MB) and cached. |
| OpenAI | `--provider openai` | `openai` package + API key | 1536 | Highest quality. Requires `OPENAI_API_KEY` env var or `--llm-key`. |
| Ollama | `--provider ollama` | Running Ollama instance | varies | Local server. Run `ollama pull nomic-embed-text` first. |

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

| Backend | Flag | Env var |
|---------|------|---------|
| OpenAI | `--llm openai` | `OPENAI_API_KEY` |
| Anthropic | `--llm anthropic` | `ANTHROPIC_API_KEY` |
| Gemini | `--llm gemini` | `GEMINI_API_KEY` |

Use `--llm-key <key>` to pass the API key directly instead of via an environment variable.

### Flags

| Flag | Description |
|------|-------------|
| `--provider <b>` | Embedding backend: `bm25` (default), `xenova`, `openai`, `ollama` |
| `--top-k <n>` | Number of results to return (default: 10) |
| `--with-llm` | Synthesise a natural-language answer from the top results |
| `--llm <adapter>` | LLM backend for `--with-llm`: `openai`, `anthropic`, `gemini` |
| `--llm-key <key>` | API key for the LLM (overrides env vars) |
| `--model <name>` | Model override for embedding or LLM backend |
| `--json`, `-j` | Machine-readable output |

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
const bm25 = new BM25EmbeddingProvider();        // zero deps
const xenova = new XenovaEmbeddingProvider();    // WASM semantics
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
