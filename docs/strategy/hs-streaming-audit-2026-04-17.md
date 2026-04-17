# `.hs` Streaming / `.holo` Composition Audit — 2026-04-17

**Purpose**: Before recording take-2 of the drug-discovery flagship video, verify what the `.hs` pipeline grammar actually supports today vs what the flagship demo requires.

**Scope**: HoloScript main @ `714ea1f0`. Grepped `examples/pipelines/*.hs`, `examples/*.holo`, `packages/core/src/`, `packages/r3f-renderer/`, `packages/mcp-server/src/`.

**Conclusion**: The flagship pipeline is **3-5 engineering days from shipping** as an `.hs` script. The in-scene protein ribbon rendering is a separate **~1 week track**. Neither blocks the other.

---

## Grammar that exists today (confirmed against real examples)

### Top-level pipeline block

From `examples/pipelines/inventory-sync.hs`, `social-engagement.hs`, `knowledge-compressor.hs`, `deploy-monitor.hs`:

```hs
pipeline "Name" {
  schedule: "cron-string"
  timeout: 30s
  retry: { max: N, backoff: "linear" | "exponential" }
  // stages below
}
```

### Source types confirmed in live examples

| Type | Example | Use for flagship |
|---|---|---|
| `"rest"` | `inventory-sync.hs:10`, `social-engagement.hs:15` | Generic HTTP, not needed |
| `"stream"` | `social-engagement.hs:9` | Streaming endpoints |
| `"mcp"` | `knowledge-compressor.hs:47, 56` | **Bio-research tool calls** ✓ |
| `"filesystem"` | `knowledge-compressor.hs:10, 17` | Reading local files |
| `"webhook"` | `deploy-monitor.hs:49, 58` | Event receivers |

**`type: "mcp"` is the key finding.** Pipeline stages can call any MCP tool directly:
```hs
source KnowledgeDedup {
  type: "mcp"
  server: "mcp-orchestrator"
  tool: "knowledge_query"
  args: { search: "${entry.content}", limit: 3 }
  output: existing
}
```
This is identical to what bio-discovery needs — substitute `bio-research` for `mcp-orchestrator` and `ot__search_entities` / `chembl__target_search` / `chembl__get_bioactivity` for the tool names.

### Transforms, filters, validators, merges

All confirmed in existing examples:
- **Field arrow**: `old.path -> new.path` (inventory-sync.hs:18-23)
- **Array unwrap**: `entries[] -> entry` (knowledge-compressor.hs:39)
- **String ops chained with `:`**: `name -> displayName : trim() : titleCase()` (inventory-sync.hs:21)
- **Filter**: `filter Name { where: expr }` (inventory-sync.hs:27)
- **Validate**: `field : required, type, constraint(...)` (inventory-sync.hs:32-35)
- **Merge**: `from: [A, B], dedup: {...}` (social-engagement.hs:22)
- **Transform with LLM**: `type: "llm", model: "...", prompt: |...|` (knowledge-compressor.hs:27-36)

### Sinks confirmed

| Type | Example | Use for flagship |
|---|---|---|
| `"rest"` | inventory-sync.hs:38 | Posting to HTTP |
| `"webhook"` | inventory-sync.hs:46 | Eventing |
| `"filesystem"` | knowledge-compressor.hs:66 | **Writing audit log** ✓ |
| `"mcp"` | knowledge-compressor.hs:55 | **Knowledge-store graduation** ✓ |

### `.holo` import + pipeline blocks

- `import "./other.holo"` — static composition inclusion (confirmed in `brittney-workspace.holo:85`)
- `pipeline { @pipeline @queue(...) }` inside `.holo` — different primitive, for service architecture layers, not for scene streaming

---

## Gaps identified

### 🟡 Minor extensions (low effort)

| Gap | Severity | Notes | Est. effort |
|---|---|---|---|
| `params {}` block at top of pipeline | Minor | Not seen in the 4 pipeline examples; needed for parameterising the flagship across diseases/targets. Parser probably already handles it — just no example uses it yet. | 2-3 hours |
| `sink type: "holo"` with templated output | Minor | `sink type: "filesystem"` exists; `type: "holo"` may or may not route to the same writer. Needs a one-line parser entry + writer that emits `.holo` syntax instead of JSON/YAML. | 1-2 days |
| `${output.hash}` / `${now()}` helper functions in templates | Minor | Template interpolation exists (`${env.X}` pattern); the helper functions need registration. | Half day |

### 🔴 New primitive required (medium effort)

| Gap | Severity | Notes | Est. effort |
|---|---|---|---|
| **AlphaFold MCP tool wrapper** | Blocker for automated structure fetch | `packages/plugins/alphafold-plugin/` has the trait definitions + a prediction config surface (`AlphaFoldPredictionConfig`), but **no MCP tool binding**. Need to expose `alphafold_fetch_structure(uniprot)` and `alphafold_predict(sequence)` at `mcp.holoscript.net`. | **1-2 days** |

### 🔴 Separate track (not blocking pipeline)

| Gap | Severity | Notes | Est. effort |
|---|---|---|---|
| **`@protein_structure` → ribbon mesh in r3f-renderer** | Blocks visible protein in scene | Grep of `packages/r3f-renderer/` for `protein_structure` returned **zero matches**. The trait exists in `alphafold-plugin` as data but the renderer has no code path to turn `pdb_data` into a rendered 3D mesh. This is why the screenshot was a cube-on-grid: the .holo file had the trait, the renderer silently ignored it. Fix: integrate [Mol* viewer](https://molstar.org/) (MIT-licensed, JS) and wire the trait to a Mol*-backed component. | **1 week** |
| HUD overlay traits for in-scene citations | Nice-to-have for narration | No `@hud`, `@overlay`, or `@label_2d` trait found. For the video this can be done in post-production (text overlay during editing). | 3-5 days (deferred) |
| Progressive scene animation triggered by pipeline events | Only needed if we want the "assemble in front of viewer" variant | No event-driven animation primitive. Post-production sequencing is easier for take-2. | Deferred |

### 🚫 Explicitly NOT found

| Primitive I expected | Not found | Implication |
|---|---|---|
| `stream .holo from source(...)` | Not in grammar | The "streaming `.holo` chunks" model I sketched in my earlier message **does not exist as a primitive**. Data streams in; the `.holo` emits once at the end. |
| `emit: .holo { ... }` mid-pipeline | Not in grammar | Sinks are end-of-pipeline, not mid-stage. |
| `animate: dock(...)` on sinks | Not in grammar | Animation lives in `.holo` traits, not in `.hs` sinks. |

**Implication**: my "streaming upgrade" framing from the previous message was **partially speculative**. The grammar supports `source type: "stream"` for ingesting streaming data, but not for progressively emitting `.holo` chunks to a viewer. The flagship demo should therefore be framed as *"pipeline executes → produces a verifiable .holo → renderer loads it"* — with the pipeline execution itself (terminal + tool calls streaming) as the narrative anchor of the video.

---

## Recommended critical path

### Track A — Pipeline-level flagship (3-5 days, unblocks the verifiable story)

1. **Ship the drug-discovery-flagship.hs** (done this session at `examples/pipelines/drug-discovery-flagship.hs`)
2. **Build AlphaFold MCP tool wrapper** — expose `packages/plugins/alphafold-plugin` at `mcp.holoscript.net`. New `alphafold_fetch_structure(uniprot)` + `alphafold_predict(sequence)` endpoints.
3. **Add `sink type: "holo"`** if it isn't already — one parser entry + one writer that respects `.holo` syntax. Verify against the `.holo` spec in `packages/core/src/parser/`.
4. **Add `${output.hash}` helper** — content-hash of the emitted file post-write.
5. **Add `params {}` block support** if missing.
6. **Run the pipeline end-to-end** against the live `bio-research` MCP server. Capture the terminal output + the emitted `.holo` file.
7. **Record the take-2 flagship video** using the pipeline execution + hash-match story (Option B from prior message).

### Track B — Visible protein (1 week, parallel)

8. **Integrate Mol*** in `packages/r3f-renderer/`. Create a `<ProteinStructure>` component that takes `pdb_data` + `plddt_per_residue` and renders ribbon mesh + confidence-colored surface.
9. **Wire `@protein_structure` trait compilation** from `packages/core/src/compilers/` (R3FCompiler) to emit the new component.
10. **Re-render the flagship .holo** — same file, now shows the actual protein.
11. **Record take-3** with full visible biology. This becomes the homepage flagship.

Tracks A and B are independent. A ships the *"verifiable pipeline"* narrative. B upgrades the *visual* of the same narrative. Ship A first, replace the video when B lands.

---

## Outcome

- `.hs` streaming-as-primitive does not exist, but `.hs` pipelines calling MCP tools **do**, and that is sufficient for the flagship.
- The flagship `.hs` is written (`examples/pipelines/drug-discovery-flagship.hs`) with every line annotated ✅ / 🟡 / 🔴.
- Critical path to a shippable pipeline video: 3-5 days.
- Critical path to a visually compelling homepage flagship: ~1 week + Track A.
- The cube-on-grid issue is explained: r3f-renderer silently drops `@protein_structure` traits because the component isn't wired. Low-risk fix, well-scoped.
