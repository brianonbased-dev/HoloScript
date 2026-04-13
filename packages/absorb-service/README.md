# @holoscript/absorb-service

Codebase intelligence, Graph RAG, recursive self-improvement, and credit-metered
operations for the HoloScript ecosystem. This package is the engine behind
`absorb.holoscript.net` and the `absorb_*` MCP tools.

Given any codebase, absorb-service scans it into a knowledge graph, indexes
symbols with vector embeddings, answers natural-language questions with
graph-enriched context, and runs autonomous improvement cycles. It supports
TypeScript, Python, Rust, Go, and JavaScript out of the box via tree-sitter
adapters.

## Ownership Boundary (packages/ vs services/)

There are two `absorb-service` folders in this monorepo by design:

- `packages/absorb-service` (**this package**) — canonical engine and domain logic
  (scanner, graph, embeddings, pipeline, credits, MCP tool definitions).
- `services/absorb-service` — deployment host (Express routes, auth, webhooks,
  DB wiring, Railway runtime) that imports from this package.

To avoid drift and duplicated implementations:

1. New absorb business logic belongs in `packages/absorb-service`.
2. `services/absorb-service` should stay thin and route-level only.
3. If logic appears in both places, move shared logic back into the package and
   keep only orchestration code in the service.

This split keeps one source of truth for absorb behavior while preserving a
separate deployable API host.

## Architecture

```
absorb-service/
  src/
    engine/            Core scanning, graph, embeddings, visualization
      adapters/        Language-specific tree-sitter adapters (TS, Python, Rust, Go)
      layouts/         Force-directed and layered graph layouts
      providers/       Embedding providers (OpenAI, Ollama, Xenova/HuggingFace)
      visualization/   Scene compilation, theming, tooltips, interactive enrichment
      workers/         Worker pool for parallel parsing and embedding
    pipeline/          Recursive self-improvement orchestrator (L0/L1/L2)
    self-improvement/  Training data generation, GRPO, OPLoRA, quality scoring
    daemon/            HoloDaemon action handlers, error taxonomy, prompt profiles
    mcp/               MCP tool definitions and handlers
    credits/           Credit system, pricing, metered LLM wrapper
    schema.ts          Drizzle ORM table definitions (PostgreSQL)
    bridge.ts          Absorb-to-pipeline trigger bridge
    agentEventBus.ts   In-memory typed event bus for multi-agent scenes
```

### Data Flow

1. **Scan** -- `CodebaseScanner` walks a project directory, detects languages,
   parses files via tree-sitter adapters, and extracts normalized symbols,
   imports, and call edges.
2. **Graph** -- `CodebaseGraph` indexes all symbols, builds caller/callee
   indexes, detects communities via `CommunityDetector`, and provides impact
   analysis queries.
3. **Embed** -- `EmbeddingIndex` vectorizes symbol signatures using a pluggable
   `EmbeddingProvider` (OpenAI, Ollama, or Xenova). Supports parallel batching
   via worker threads.
4. **Query** -- `GraphRAGEngine` combines vector search with graph traversal.
   Semantic matches are enriched with callers, callees, community membership,
   and impact radius, then re-ranked by a weighted score
   (semantic 0.6 + connections 0.2 + impact 0.2 by default).
5. **Answer** -- `queryWithLLM()` condenses top results into a structured prompt
   and feeds it to a configurable LLM (Ollama, OpenAI, Anthropic, Gemini) to
   produce a natural-language answer with citations.
6. **Improve** -- The pipeline orchestrator runs L0 (code fixer), L1 (strategy
   optimizer), and L2 (meta-strategist/skill generator) in sequence, each with
   budget caps and human-review gates.
7. **Emit** -- `HoloEmitter` generates navigable `.holo` compositions for
   spatial 3D visualization of the codebase graph.

## Sub-path Exports

The package uses sub-path exports to avoid name collisions between modules.
Import from the specific sub-path you need:

| Sub-path         | Import path                                   | Contents                                                        |
| ---------------- | --------------------------------------------- | --------------------------------------------------------------- |
| Root             | `@holoscript/absorb-service`                  | Engine + bridge (default)                                       |
| Engine           | `@holoscript/absorb-service/engine`           | Scanner, graph, embeddings, visualization, knowledge extraction |
| Pipeline         | `@holoscript/absorb-service/pipeline`         | Recursive self-improvement orchestrator                         |
| Daemon           | `@holoscript/absorb-service/daemon`           | HoloDaemon actions, error taxonomy, prompt profiles             |
| Self-Improvement | `@holoscript/absorb-service/self-improvement` | GRPO, OPLoRA, DPO, quality scoring, convergence detection       |
| MCP              | `@holoscript/absorb-service/mcp`              | MCP tool definitions and handlers                               |
| Credits          | `@holoscript/absorb-service/credits`          | Credit service, pricing, metered LLM                            |
| Schema           | `@holoscript/absorb-service/schema`           | Drizzle ORM table definitions                                   |
| Bridge           | `@holoscript/absorb-service/bridge`           | Absorb completion to pipeline trigger                           |

## Graph RAG Example Questions

The `holo_ask_codebase` tool uses OpenAI embeddings + knowledge graph traversal
+ LLM synthesis to answer natural language questions about any absorbed codebase.
The engine doesn't just do text search — it walks the call graph, finds community
clusters, measures blast radius, and feeds all of that to an LLM for a cited answer.

Below are question families organized by what you're trying to learn. Each family
shows a *splash pattern* — start broad, then drill into specifics as the graph
reveals structure.

### Compilation & Target Pipeline

Start here when you need to understand how `.holo` source becomes output.

```
"Walk me through what happens when compile_to_unity is called on a .holo file"
"What sovereign compilers exist and how do they differ from bridge compilers?"
"How does CompilerBase enforce RBAC before compilation starts?"
"Which compilers share the most code with each other — are there compilation families?"
"What happens to trait metadata during the WebGPU compilation path?"
"How does the incremental compiler decide what to recompile vs skip?"
```

### Trait System & Composition

The trait system is HoloScript's core abstraction. These questions reveal how
traits flow through the entire stack.

```
"How are traits defined in constants/ and consumed by compilers?"
"What trait categories exist and which ones have custom runtime handlers?"
"Show the composition chain when an object has both 'grabbable' and 'physics_body'"
"Which traits are spatial-only vs applicable to non-visual domains like banking?"
"How does trait validation prevent incompatible trait combinations?"
"What's the relationship between trait constants, the AST trait node, and R3F rendering?"
```

### Simulation & Scientific Computing

HoloScript has 8 physics solvers running in WebGPU. These questions explore
the simulation layer.

```
"How does the structural FEA solver dispatch work to WebGPU compute shaders?"
"What is the difference between TET4 and TET10 element formulation in the solver?"
"How does the thermal solver couple with the structural solver for thermo-mechanical analysis?"
"Where does the CFD lattice Boltzmann method store velocity fields on the GPU?"
"How are simulation results validated — what does the V&V pipeline check?"
"What makes the SNN spiking neural network different from traditional neural nets in this codebase?"
```

### MCP Server & Tool Dispatch

The MCP server exposes 150+ tools. These questions map the tool infrastructure.

```
"How does a tool definition in tools.ts get wired to its handler in the HTTP server?"
"What is the cascadeHandled pattern and why do some tools bypass the main dispatch?"
"How does the HoloMesh board tool authenticate differently from compile tools?"
"What happens when an MCP tool call comes in via JSON-RPC vs REST POST?"
"How do agent-orchestration-tools coordinate multi-tool workflows?"
"Where does the observability pipeline export OpenTelemetry traces?"
```

### Plugin Architecture

35+ domain plugins extend HoloScript. These questions reveal the plugin contract.

```
"What interface must a domain plugin implement to register with the core?"
"How does the medical-plugin's DICOM trait differ from the radio-astronomy FITS trait?"
"What shared utilities do all plugins import from the domain-plugin-template?"
"How does the banking-finance-plugin generate regulatory compliance traits?"
"Can plugins define their own compilation targets or only use existing compilers?"
"What's the plugin discovery mechanism — how does the core find installed plugins?"
```

### Identity, Auth & Agent Coordination

Wallets, API keys, agent registration, and team coordination.

```
"How does the key registry resolve a Bearer token to a RegisteredAgent?"
"What's the difference between founder auth, agent auth, and per-server keys?"
"How does OAuth 2.1 scope enforcement work for tool-level permissions?"
"What happens when an unregistered agent tries to call a HoloMesh endpoint?"
"How does the CRDT sync layer handle conflicting edits from two agents?"
"What does the team-coordinator do when an agent misses two heartbeat cycles?"
```

### Codebase Patterns & Structure

Meta-questions about the codebase itself — useful for onboarding or auditing.

```
"What are the most connected symbols in the entire codebase — the load-bearing code?"
"Which packages have the tightest coupling and might benefit from decoupling?"
"Are there circular dependencies between packages?"
"What code communities does the graph detect — do they match the package boundaries?"
"Which files have the highest impact radius — changing them breaks the most things?"
"What patterns appear in test files — is there a consistent testing style?"
```

### Semantic Search Splash Patterns (`holo_semantic_search`)

Semantic search finds code by meaning, not keywords. Start broad, narrow with filters.

```
"spatial indexing"           → find octree, BVH, spatial hash implementations
"error boundary"             → find error handling and recovery patterns
"WebGPU buffer allocation"   → find GPU memory management
"trait composition resolver" → find where traits get merged onto objects
"CRDT merge conflict"        → find conflict resolution in networked state
"animation interpolation"    → find keyframe and easing logic
"scene serialization"        → find save/load and snapshot code
"credit deduction"           → find billing and metering logic
```

Filter by type for precision:
```
holo_semantic_search({ query: "compiler", type: "class" })        → only compiler classes
holo_semantic_search({ query: "validate", type: "function" })     → only validation functions
holo_semantic_search({ query: "shader", language: "typescript" }) → only TS shader code
holo_semantic_search({ query: "test helper", file: "__tests__" }) → only test utilities
```

### Edge Cases & Tricky Questions

These are the questions that expose the boundaries of Graph RAG — where naive
search fails but graph enrichment helps, or where you need to frame the question
differently to get useful results.

**Cross-package boundaries (graph excels here):**
```
"What happens when studio calls a function defined in @holoscript/core that
 delegates to absorb-service? Trace the full cross-package call chain."
"Which types are re-exported across package boundaries and where do they diverge?"
"Find functions that are imported by 5+ packages — the de facto public API."
```

**Dead code & orphans (what ISN'T connected):**
```
"Which exported functions have zero callers anywhere in the codebase?"
"Are there compiler implementations that no compilation target actually uses?"
"Find interfaces that are defined but never implemented."
"What test files exist for modules that have since been deleted?"
```

**Naming collisions & shadows (same name, different things):**
```
"There are multiple 'parse' functions — which one handles .holo vs .hs vs .hsplus?"
"How many 'validate' functions exist and do they share a contract or are they independent?"
"Disambiguate 'State' — HolomeshState vs SimulationState vs CRDTState."
"Which 'index.ts' barrel exports overlap with each other?"
```

**Runtime vs static structure (graph sees static, behavior is dynamic):**
```
"Which tool handlers are registered dynamically at startup vs statically in tools.ts?"
"How does the plugin discovery mechanism load plugins that aren't statically imported?"
"What code paths only execute in production (Railway env) vs development?"
"Which WebGPU shader dispatches depend on runtime feature detection?"
```

**Scale & performance (what's expensive):**
```
"Which functions have the deepest call chains — more than 10 levels deep?"
"What's the most complex community cluster and what holds it together?"
"If I delete packages/connector-github, what's the total transitive impact?"
"Which test suites import the most source files — candidates for slow tests?"
```

**Monorepo-specific (pnpm workspace gotchas):**
```
"Which packages use workspace:* protocol dependencies that would break for external users?"
"Are there packages that import from dist/ instead of src/ of sibling packages?"
"What circular dependency chains exist between workspace packages?"
"Which packages have their own tsconfig vs inherit from the root?"
```

**Questions that trip up naive RAG but Graph RAG handles:**
```
"How does the auth system work?" → Naive RAG finds 'auth' strings everywhere.
  Graph RAG finds the auth entry points (resolveRequestingAgent, requireAuth)
  and traces through key registry, agent store, and env fallback.

"What's the blast radius of changing CodebaseGraph?" → Naive RAG says
  "it's used in absorb." Graph RAG traces every transitive dependent:
  GraphRAGEngine, EmbeddingIndex, impact analysis tools, the self-improvement
  pipeline, and the .holo emitter — 40+ files across 4 packages.

"Why does compilation fail silently for some targets?" → Naive RAG finds
  error handling code. Graph RAG traces the compiler dispatch chain and
  reveals that some CompilerBase subclasses override compile() without
  calling super.validateRBAC() — the silent failure path.
```

### Tips

- **Start broad, then drill.** "How does compilation work?" reveals the landscape;
  "How does R3FCompiler handle animated traits?" finds the specific path.
- **Use `llmProvider: "anthropic"` or `"openai"`** for highest quality answers.
  Ollama works but produces shallower reasoning.
- **The graph matters.** Unlike plain RAG, Graph RAG enriches every match with
  callers, callees, community membership, and impact radius — so answers include
  "what depends on this" not just "where is this."
- **Always `holo_absorb_repo` first** to build/refresh the graph. Use
  `force: false` for fast cache hits (~21ms).
- **If results are empty:** check `holo_graph_status` — the graph may not be
  loaded. Common cause: absorb ran in a previous session but the in-memory
  cache expired.
- **If answers are shallow:** bump `topK` to 30-50. The default 20 may miss
  relevant symbols in a 68-package monorepo. Also try narrowing with
  `language: "typescript"` or `file: "packages/core"` to reduce noise.
- **If the LLM hallucinates:** the LLM only sees the top 10 enriched results.
  If the real answer requires context from result #15, bump `topK`. The graph
  enrichment is accurate — it's the LLM synthesis that may miss context that
  was ranked too low.

## MCP Tools

### Absorb Service Tools (absorb-tools.ts)

Two tiers: free (local) and paid (proxied to Studio with credit deduction).

**Free tools** -- no API key, no credits, run locally:

| Tool                    | Description                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `absorb_query`          | Semantic search over any absorbed codebase using local GraphRAG. Returns ranked symbols with file, line, and score. |
| `absorb_diff`           | Semantic diff between two code snippets. Detects renames, moves, and structural changes via AST comparison.         |
| `absorb_list_projects`  | List all absorb projects for the authenticated user.                                                                |
| `absorb_create_project` | Create a new absorb project (GitHub URL, local path, or upload).                                                    |
| `absorb_delete_project` | Delete an absorb project by ID.                                                                                     |
| `absorb_check_credits`  | Check credit balance and account tier.                                                                              |

**Paid tools** -- require API key and credits, proxy to Studio:

| Tool                  | Credits | Description                                                           |
| --------------------- | ------- | --------------------------------------------------------------------- |
| `absorb_run_absorb`   | 10-50   | Full codebase absorption. Shallow = 10 credits, deep = 50 credits.    |
| `absorb_run_improve`  | 25-150  | HoloDaemon improvement cycle. Quick = 25, balanced = 75, deep = 150.  |
| `absorb_run_query_ai` | 15+     | AI-synthesized answer with LLM. Base 15 credits + metered token cost. |
| `absorb_run_render`   | 3-5     | Render screenshot or PDF. PNG/JPEG/WebP = 3, PDF = 5.                 |
| `absorb_run_pipeline` | varies  | Recursive self-improvement pipeline (L0/L1/L2).                       |

### Codebase Tools (codebase-tools.ts)

| Tool                   | Description                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------- |
| `holo_absorb_repo`     | Full scan, graph build, and .holo emit pipeline. Auto-detects best embedding provider. |
| `holo_query_codebase`  | Graph traversal queries: callers, callees, impact analysis, community detection.       |
| `holo_impact_analysis` | Given changed files, compute all transitively affected symbols.                        |
| `holo_detect_changes`  | Diff two graph snapshots to find what changed.                                         |

#### `holo_query_codebase` trace strategy guidance

For `queryType="trace"`, use the strategy that matches your intent:

- `traceStrategy="bfs"` (default)
  - Minimizes hop count only.
  - Best for structural navigation and quick explainability.
- `traceStrategy="tropical-min-plus"`
  - Computes weighted shortest paths with min-plus cost accumulation.
  - Best when edge cost matters (e.g., penalizing low-confidence or high-risk transitions).

If no edge-weight callback is provided, the tropical strategy falls back to uniform edge weight `1`.

### Graph RAG Tools (graph-rag-tools.ts)

| Tool                   | Description                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `holo_semantic_search` | Vector search over symbol signatures, doc comments, and file paths. Requires prior `holo_absorb_repo`.         |
| `holo_ask_codebase`    | Natural language Q&A with graph-enriched context. Supports OpenAI, Anthropic, Gemini, and Ollama LLM backends. |

### TypeScript Absorb Tool (absorb-typescript-tools.ts)

| Tool                     | Description                                                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `holo_absorb_typescript` | Enhanced TypeScript-to-.holo conversion. Detects Express/Fastify routes, Prisma/TypeORM models, BullMQ queues, retry/circuit-breaker patterns, and Docker configs. Preserves function bodies in `@imperative { }` regions. |

### Knowledge Extraction Tools (knowledge-extraction-tools.ts)

| Tool                       | Description                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `absorb_extract_knowledge` | Extract W/P/G (Wisdom/Pattern/Gotcha) entries from an absorbed codebase graph. Returns entries ready for `knowledge_publish`. |

### Knowledge Marketplace Tools (knowledge-tools.ts)

| Tool                   | Description                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `knowledge_publish`    | Publish a knowledge entry with optional wallet-based provenance signature. Free for authors. |
| `knowledge_query`      | Semantic search over knowledge entries. Premium (signed) entries cost 5 cents per access.    |
| `knowledge_provenance` | Verify provenance chain for a knowledge entry.                                               |

### Oracle Tools (oracle-tools.ts)

| Tool                  | Description                                                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `holo_oracle_consult` | Query the North Star Oracle. Combines knowledge store lookup with inline decision trees for 13 common agent stall causes. Free, no credits. |

## Credit System

Credits are denominated in cents (1 credit = $0.01 USD). The system uses
atomic SQL operations via Drizzle ORM to prevent race conditions.

### Tiers

| Tier       | Free credits  | Max active projects | Max absorb depth | Pipeline |
| ---------- | ------------- | ------------------- | ---------------- | -------- |
| Free       | 100           | 1                   | shallow          | No       |
| Pro        | 0 (purchased) | 10                  | deep             | Yes      |
| Enterprise | 0 (purchased) | 100                 | deep             | Yes      |

### Credit Packages

| Package    | Credits | Price   |
| ---------- | ------- | ------- |
| Starter    | 500     | $5.00   |
| Builder    | 2,500   | $20.00  |
| Pro        | 10,000  | $75.00  |
| Enterprise | 50,000  | $350.00 |

### LLM Token Metering

LLM calls are metered on top of base operation costs with a 15% markup
(`LLM_MARKUP = 1.15`). Per-million-token costs by provider:

| Provider  | Input | Output |
| --------- | ----- | ------ |
| Anthropic | $3.00 | $15.00 |
| OpenAI    | $2.50 | $10.00 |
| xAI       | $2.00 | $10.00 |
| Ollama    | $0.00 | $0.00  |

The `MeteredLLMProvider` class wraps any `LLMProvider` and auto-deducts credits
after each call based on estimated token counts.

### Orchestrator Gating

When the MCPMe orchestrator has already billed a request upstream, the
`requireCredits` middleware accepts an `orchestratorGated` flag to skip internal
credit deduction and prevent double billing.

## Engine Components

### CodebaseScanner

Walks a project directory respecting `.gitignore` patterns and configurable
exclusions. Parses each file via the appropriate tree-sitter adapter and
collects normalized symbols, imports, and call edges into a `ScanResult`.

Default exclusions: `node_modules`, `.git`, `dist`, `build`, `out`, `target`,
`__pycache__`, `vendor`, `.venv`, `coverage`, and others.

### Language Adapters

Each adapter extends `BaseAdapter` and uses tree-sitter to extract symbols:

- **TypeScriptAdapter** -- `.ts`, `.tsx`, `.js`, `.jsx`
- **PythonAdapter** -- `.py`
- **RustAdapter** -- `.rs`
- **GoAdapter** -- `.go`

Register custom adapters via `registerAdapter()` or `AdapterManager`.

### CodebaseGraph

In-memory knowledge graph with indexed lookups:

- `findSymbolsByName(name)` -- find symbols by name across all files
- `getCallersOf(name, owner?)` -- who calls this symbol
- `getCalleesOf(id)` -- what does this symbol call
- `getSymbolImpact(name, owner?)` -- transitive set of affected files
- `getCommunityForFile(path)` -- which detected community a file belongs to
- `traceCallChain(from, to, maxDepth)` -- find call path between two symbols
- `serialize()` / `deserialize()` -- persist and restore graph state

Supports incremental absorb via `GitChangeDetector` (hash-based file change
detection) and serialized `nodePositions` for stable visualization.

### EmbeddingIndex

Vector index over symbol signatures. Configurable embedding provider:

- **OpenAIEmbeddingProvider** -- best quality, requires `OPENAI_API_KEY`
- **OllamaEmbeddingProvider** -- local, requires running Ollama instance
- **XenovaEmbeddingProvider** -- in-process via `@huggingface/transformers`

Supports parallel embedding via worker threads (4-8x speedup). Serializable
for caching between sessions.

### GraphRAGEngine

Combines `EmbeddingIndex` (semantic search) with `CodebaseGraph` (structural
traversal) to produce enriched, context-aware query results.

```typescript
import { GraphRAGEngine } from '@holoscript/absorb-service/engine';

const engine = new GraphRAGEngine(graph, embeddingIndex, {
  llmProvider: myProvider, // or ollamaUrl + llmModel for direct Ollama
});

// Semantic search with graph enrichment
const result = await engine.query('authentication handler', {
  topK: 20,
  weights: { semantic: 0.6, connections: 0.2, impact: 0.2 },
  language: 'typescript',
});

// Natural language Q&A with LLM
const answer = await engine.queryWithLLM('How does authentication work?');
// answer.answer -- string
// answer.citations -- [{ name, file, line }]
// answer.context -- EnrichedResult[]
```

### KnowledgeExtractor

Analyzes a `CodebaseGraph` to automatically extract W/P/G (Wisdom, Pattern,
Gotcha) knowledge entries. Configurable confidence threshold and max entries
per type.

### Visualization

- **CodebaseSceneCompiler** -- compiles a graph into a `SceneComposition` for
  3D rendering (positions, edges, groups)
- **CodebaseTheme** -- visual style configuration (colors, sizes, opacity)
- **EdgeRenderer** -- renders graph edges with configurable styles
- **InteractiveSceneEnricher** -- adds click/hover interaction events
- **GraphSelectionManager** -- subgraph selection and context extraction
- **GraphRAGVisualizer** -- overlays RAG search results onto the scene
- **GraphTooltipGenerator** -- generates tooltip data for hover states

## Pipeline (Recursive Self-Improvement)

Three-layer agent architecture:

| Layer | Name               | Function                         | Default budget |
| ----- | ------------------ | -------------------------------- | -------------- |
| L0    | Code Fixer         | Finds and fixes code issues      | $1.00/cycle    |
| L1    | Strategy Optimizer | Optimizes L0's approach          | $0.75/cycle    |
| L2    | Meta-Strategist    | Evolves L1, generates new skills | $1.50/cycle    |

Pipeline modes: `single` (one L0->L1->L2 cycle), `continuous` (repeat until
budget exhausted), `self-target` (improve HoloScript's own codebase).

Each layer has configurable budget caps (`maxCostUSD`, `maxDurationMs`,
`maxCycles`, `cooldownMs`) and optional human-review gates.

LLM providers: Anthropic, OpenAI, xAI, Ollama. Auto-detected via
`detectLLMProviderName()` from environment variables.

## Self-Improvement Module

Training data generation and reward system for fine-tuning HoloScript models:

- **SelfImprovementPipeline** -- captures failed code generations and converts
  them to training examples with difficulty scoring
- **QualityScore** -- weighted multi-dimensional quality calculation
- **ConvergenceDetector** -- detects when improvement has plateaued
- **SelfImproveCommand** -- orchestrates absorb -> GraphRAG -> test -> commit
- **FocusedDPOSplitter** -- splits AST into segments for DPO pair generation
- **GRPORewardFunctions** -- 5 reward functions for TRL GRPOTrainer
- **GRPORewardOrchestrator** -- weighted composite reward with caching and stats
- **GRPOConfig** -- recommended hyperparameters for GRPO training
- **GRPOPromptExtractor** -- scans monorepo for diverse training prompts
- **OPLoRAConfig** -- extended OPLoRA configuration with validation and Python export
- **OPLoRAMonitor** -- tracks benchmark scores, constraint satisfaction, alerts
- **ForgettingDetector** -- sliding-window detection of catastrophic forgetting

## Daemon

The HoloDaemon runs autonomous improvement cycles on a codebase. Key components:

- **daemon-actions.ts** -- BT action handlers mapped to host operations (shell
  exec, file I/O, LLM calls). Requires `@holoscript/core` peer dependency.
- **daemon-error-taxonomy.ts** -- categorizes TypeScript compiler errors by
  pattern (missing types, import errors, etc.) for targeted fixes
- **daemon-prompt-profiles.ts** -- builds structured prompt context for the
  daemon LLM, including system prompt and action descriptions

`DaemonConfig` supports tool policies (`allowShell`, `allowedPaths`,
`allowedHosts`, `maxFileBytes`), economy config (budget caps), and session
tracking.

## Configuration

### Environment Variables

| Variable                | Required         | Description                                                    |
| ----------------------- | ---------------- | -------------------------------------------------------------- |
| `ABSORB_API_KEY`        | For paid tools   | API key for Studio authentication                              |
| `OPENAI_API_KEY`        | Recommended      | OpenAI API key for embeddings (best quality)                   |
| `OLLAMA_URL`            | Optional         | Ollama base URL (default: `http://localhost:11434`)            |
| `EMBEDDING_PROVIDER`    | Optional         | Override auto-detection: `openai`, `ollama`, or `xenova`       |
| `HOLOSCRIPT_STUDIO_URL` | Optional         | Studio URL override (default: `https://studio.holoscript.net`) |
| `HOLOSCRIPT_API_KEY`    | For orchestrator | MCP orchestrator API key                                       |
| `ANTHROPIC_API_KEY`     | Optional         | Anthropic API key for LLM-powered queries                      |
| `GEMINI_API_KEY`        | Optional         | Google Gemini API key for LLM-powered queries                  |

### Embedding Provider Auto-Detection

When `EMBEDDING_PROVIDER` is not set, the system auto-detects:

1. `OPENAI_API_KEY` present -- use OpenAI (preferred, best quality)
2. Ollama running locally -- use Ollama (probed with 2s timeout)
3. Fallback -- OpenAI (will fail without key; warns in stderr)

### Database

The credit system requires PostgreSQL with Drizzle ORM. Tables are defined in
`schema.ts`. The database client must be injected at startup via
`setDbProvider()` from the credits module. When no database is configured,
credit operations return `null` gracefully.

Tables: `credit_accounts`, `credit_transactions`, `moltbook_agents`.

## Development

### Prerequisites

- Node.js >= 18.0.0
- pnpm (workspace root)
- Optional: tree-sitter native bindings for full language support

### Build

```bash
pnpm build          # builds CJS + ESM via tsup
pnpm dev            # watch mode
```

Output: `dist/` with `.js` (ESM), `.cjs` (CJS), and sourcemaps. Type
declarations are copied from `types/` directory (not generated by tsc due to
implicit-any constraints in daemon-actions).

### Test

```bash
pnpm test           # vitest run (22 test files)
pnpm test:watch     # vitest watch mode
```

Test files are colocated with source code in `__tests__/` directories:

- `engine/__tests__/` -- CodebaseGraph, DeprecatedInventory, GitChangeDetector,
  HoloEmitter, KnowledgeExtractor (5 files)
- `mcp/__tests__/` -- knowledge-extraction-tools (1 file)
- `pipeline/__tests__/` -- feedbackEngine, llmProvider, selfTargetConfig (3 files)
- `self-improvement/__tests__/` -- ConvergenceDetector, FocusedDPOSplitter,
  ForgettingDetector, GRPOConfig, GRPOPromptExtractor, GRPORewardFunctions,
  GRPORewardOrchestrator, OPLoRAConfig, OPLoRAMonitor, QualityScore,
  SelfImproveCommand, SelfImprovementPipeline, plus integration tests (13 files)

### Peer Dependencies

- `@holoscript/core` (optional) -- required for daemon actions and HoloEmitter
- `@modelcontextprotocol/sdk` (optional) -- required for MCP tool type definitions

### Dependencies

- `drizzle-orm` -- database ORM for credit system
- `openai` -- OpenAI API client for embeddings
- `zod` -- schema validation for knowledge tools

### Optional Dependencies

- `@huggingface/transformers` -- local Xenova embedding provider
- `tree-sitter` + language grammars -- native parsing (graceful degradation
  without them)

## Key Exports Reference

### From root (`@holoscript/absorb-service`)

```typescript
// Engine
export {
  CodebaseScanner,
  CodebaseGraph,
  EmbeddingIndex,
  GraphRAGEngine,
  HoloEmitter,
  KnowledgeExtractor,
  CommunityDetector,
  WorkerPool,
  AdapterManager,
  TypeScriptAdapter,
  PythonAdapter,
  RustAdapter,
  GoAdapter,
  GitChangeDetector,
  DeprecatedInventoryBuilder,
};

// Embedding providers
export {
  createEmbeddingProvider,
  OpenAIEmbeddingProvider,
  OllamaEmbeddingProvider,
  XenovaEmbeddingProvider,
};

// Visualization
export {
  CodebaseSceneCompiler,
  CodebaseTheme,
  EdgeRenderer,
  InteractiveSceneEnricher,
  GraphSelectionManager,
  GraphRAGVisualizer,
  GraphTooltipGenerator,
};

// Layouts
export { forceDirectedLayout, layeredLayout };

// Bridge
export {
  onAbsorbComplete,
  recommendPipelineConfig,
  saveBridgeConfig,
  getBridgeConfig,
  generatePipelineSummary,
};
```

### From `@holoscript/absorb-service/credits`

```typescript
export {
  setDbProvider,
  getOrCreateAccount,
  checkBalance,
  deductCredits,
  addCredits,
  getUsageHistory,
  MeteredLLMProvider,
  requireCredits,
  isCreditError,
  OPERATION_COSTS,
  CREDIT_PACKAGES,
  TIER_LIMITS,
  estimateLLMCostCents,
};
```

### From `@holoscript/absorb-service/pipeline`

```typescript
export {
  PipelineOrchestrator,
  executeLayer0,
  executeLayer1,
  executeLayer2,
  generateFeedbackSignals,
  aggregateFeedback,
  isSelfTargetSafe,
  AnthropicLLMProvider,
  XAILLMProvider,
  OpenAILLMProvider,
  OllamaLLMProvider,
  createLLMProvider,
  detectLLMProviderName,
};
```

### From `@holoscript/absorb-service/self-improvement`

```typescript
export {
  SelfImprovementPipeline,
  calculateQualityScore,
  ConvergenceDetector,
  SelfImproveCommand,
  SelfImproveHarvester,
  FocusedDPOSplitter,
  createGRPORewardFunctions,
  GRPORewardOrchestrator,
  GRPOPromptExtractor,
  buildGRPOConfig,
  exportGRPOConfigAsPython,
  OPLoRAMonitor,
  ForgettingDetector,
  validateOPLoRAConfig,
  buildOPLoRAConfig,
  exportOPLoRAConfigAsPython,
};
```

### From `@holoscript/absorb-service/mcp`

```typescript
export {
  absorbServiceTools,
  handleAbsorbServiceTool,
  absorbTypescriptTools,
  handleAbsorbTypescriptTool,
  codebaseTools,
  handleCodebaseTool,
  graphRagTools,
  handleGraphRagTool,
  setGraphRAGState,
  isGraphRAGReady,
  oracleTools,
  handleOracleTool,
  knowledgeExtractionTools,
  handleKnowledgeExtractionTool,
  setKnowledgeExtractionGraph,
  getActiveGraph,
};
```

## Production Deployment

The service runs at `https://absorb.holoscript.net` on Railway with 28 MCP
tools exposed via `POST /mcp` (JSON-RPC). SSE transport is not supported due
to Railway CDN splitting sessions across edge nodes.

Auth: `ABSORB_API_KEY` as Bearer token. Admin/founder tier has all tools free,
no rate limits, no credit costs.
