# Research tracker — GraphRAG self-understanding (ICSE Oct 2026)

**Board:** `task_1776383022431_jn19`  
**Venue:** ICSE (Oct 2026) — *living draft, pre-submission*  
**Checklist discipline:** `docs/paper-program/D011_FOUR_GATE_CHECKLIST.md` · `docs/NUMBERS.md`.

## D.011 criteria — status (rolling)

| Criterion | Notes |
|-----------|--------|
| Run the product like a user (Studio, MCP, absorb pipeline) | Sign-off before narrative freeze; include one **absorb → query** loop with real project. |
| Refresh benchmarks (hardware + code drift) | GraphRAG hot paths: embed index build time, `absorb_query` latency — log dated runs. |
| Recorded full-loop demo | Show MCP or CLI: ingest → GraphRAG question → symbol/trace answer; store artifact hash. |
| Absorb re-run as models / embedders change | Re-embed + diff search quality when `EmbeddingIndex` provider or dimensions change. |
| Preempt reviewers (coverage of “self-understanding”) | Tie claims to **`GraphRAGEngine`** behavior (semantic + graph fan-out), not generic “AI understands repo” rhetoric. |

## Codebase anchors (systems, not marketing)

| Component | Path | Role |
|-----------|------|------|
| GraphRAG engine | `packages/absorb-service/src/engine/GraphRAGEngine.ts` | Vector search + graph traversal + optional LLM answer |
| MCP GraphRAG tools | `packages/absorb-service/src/mcp/graph-rag-tools.ts` | Tool surface wired into `packages/mcp-server/src/tools.ts` (`graphRagTools`) |
| Self-improve loop (GraphRAG-driven) | `packages/absorb-service/src/self-improvement/SelfImproveCommand.ts` | Queries GraphRAG for untested / low-coverage symbols |
| MCP registration | `packages/mcp-server/src/tools.ts` | Imports `graphRagTools` from `@holoscript/absorb-service/mcp` |
| Product docs | `packages/absorb-service/README.md` | Query / engine overview |

## Paper posture (draft)

- **“Self-understanding”** = **retrieval + structure**: explicit separation of embedding recall vs call-graph expansion vs re-ranking weights (`GraphRAGOptions`).
- Any **LLM summarization** step must be labeled optional and evaluated separately from structural retrieval precision/recall.

## Next steps (child tasks when funded)

1. ICSE — benchmark table: index build + query p50/p99 with fixed corpus revision.
2. ICSE — reproducible demo script (commands only, no manual UI).
3. Close this tracker when a `docs/paper-program/*` draft cites this file.
