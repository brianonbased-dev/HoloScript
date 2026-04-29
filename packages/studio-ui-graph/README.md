# @holoscript/studio-ui-graph

TSX → `.holo` emitter for Studio. Walks `src/app/**/page.tsx`, follows JSX imports recursively, produces a HoloScript scene representation of Studio's UI page/component graph.

The bridge that gives 393 TSX components the same agent-readable structure that HoloScript scenes have always had — without rewriting Studio.

## Why it exists

Studio is a 42k-LOC, 60-route, 393-component Next.js app. Agents working on it can't see the structure without reading 393 files. HoloScript was built to be the queryable scene format; until now, Studio bypassed it entirely. This package emits a `.holo` from the TSX so all the existing HoloScript GraphRAG tooling (`holo_query_codebase`, `holo_visualize_flow`, `holo_design_graph`, `holo_get_node_connections`, `holo_semantic_scene_graph`, `holo_parse_to_graph`) starts working on Studio.

## Usage

```bash
pnpm --filter @holoscript/studio-ui-graph build
node packages/studio-ui-graph/dist/cli.js
# default output: packages/studio/.holo/studio.ui.holo
```

```bash
holoscript-studio-ui-graph --root packages/studio --output packages/studio/.holo/studio.ui.holo
```

| Flag | Default |
|---|---|
| `--root` / `-r` | `packages/studio` |
| `--output` / `-o` | `<root>/.holo/studio.ui.holo` |
| `--quiet` / `-q` | progress on stderr by default |

## Output shape (v0.1)

```holo
scene Studio {
  page agents { @route("/agents") @file("packages/studio/src/app/agents/page.tsx")
    AgentList { @file("packages/studio/src/components/agents/AgentList.tsx") @reused_in([agents_id]) }
    HeaderActions { @file("packages/studio/src/components/header/HeaderActions.tsx") @reused_in([create, marketplace]) }
  }
  page agents_id { @route("/agents/[id]") @file("packages/studio/src/app/agents/[id]/page.tsx")
    ...
  }

  // Components used by ≥2 pages — candidates for the panels/ tier
  shared_component HeaderActions { @reused_in([agents, create, marketplace]) }
  shared_component InspectorTabs { @reused_in([agent_detail, character, coordinator]) }
}
```

Each `page` block is one `page.tsx`. Each component node is one TSX file reachable by following named/default JSX imports. `@reused_in([...])` flags cross-page reuse — the panels graveyard and the panels worth pulling out are right there.

## Roadmap

| Milestone | Scope | Status |
|---|---|---|
| v0.1 | Pages + component trees + reuse map | ✅ shipped |
| v0.2 | Zustand `@uses_stores([…])` detection | ✅ shipped |
| v0.3 | API/SSE detection — `@calls_apis([…])` for `fetch`, `useSWR`, `EventSource`, `axios` | ✅ shipped |
| v0.4 | Dynamic + `React.lazy` import following + JSX-aware project options (closes the empty-tree bug) | ✅ shipped |
| v0.5 | `--watch` mode (debounced 300ms on `src/**/*.ts{,x}`) | ✅ shipped |
| v0.6 | Mermaid serializer (`--format mermaid`) — markdown-fenced flowchart TD with one subgraph per page | ✅ shipped |
| v0.7 | In-Studio viewer page at `/dev/ui-graph` — server-rendered summary table + per-page rollups | ✅ shipped |
| **v1.0** | **`publish` subcommand** — POSTs the `.holo` to the MCP orchestrator's `/knowledge/sync` endpoint as a `pattern` entry under id `studio-ui-graph`. Any agent on the mesh can now query Studio UI structure via `/knowledge/query`. | **✅ shipped** |
| v1.1+ | Native absorb-service ingest (`POST /api/absorb/holo`) so the .holo lands in the GraphRAG store directly, not just the knowledge-store | open |
| v1.2+ | Per-page Mermaid output split into individual files (the single 97 KB Mermaid is too big for some renderers) | open |

## Live in production (verified 2026-04-29)

The graph is published to the MCP orchestrator's knowledge store as `id=studio-ui-graph` (workspace `ai-ecosystem`, type `pattern`). Verify via:

```bash
curl -X POST https://mcp-orchestrator-production-45f9.up.railway.app/knowledge/query \
  -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"search":"page agents shared_component","workspace_id":"ai-ecosystem"}'
```

Re-publish after regenerating:

```bash
node packages/studio-ui-graph/dist/cli.js generate
node packages/studio-ui-graph/dist/cli.js publish
```

## Limitations (intentionally)

- **Built-in HTML tags** (`<div>`, `<button>`, etc.) are skipped — we only track PascalCase imported components.
- **Locally-defined components** within a single TSX file are not separately listed — only imported components become tree nodes.
- **Conditional / dynamic imports** (`React.lazy`, `dynamic(() => import(...))`) are missed in this pass.
- **maxDepth = 6** by default to keep the graph tractable for very deep trees.

These are deliberate v0.1 cuts. The architecture lets each be lifted in a follow-up milestone without touching the emit/route layers.

## Architecture

```
src/
├── cli.ts        argv + main pipeline
├── routes.ts     find page.tsx, derive routes & ids (handles route groups, dynamic segments)
├── tree.ts       ts-morph-backed JSX-import walker, alias-aware
└── emit.ts       .holo serializer + reuse-map analysis
```

Single dependency: `ts-morph`. No `@holoscript/core` import — the emitter writes `.holo` text directly so this package can run on any clone without core being built first.
