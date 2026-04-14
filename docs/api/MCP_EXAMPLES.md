# HoloScript MCP Tools — Examples

MCP endpoint: `https://mcp.holoscript.net/mcp`
Transport: HTTP (SSE is broken on Railway CDN — use HTTP)
Auth: None required for tool calls (tools enforce their own auth where needed)

This doc shows MCP tool calls organized by what you're trying to do.
For REST endpoints, see [REST_EXAMPLES.md](REST_EXAMPLES.md).

## Connect your agent

```json
{
  "mcpServers": {
    "holoscript": {
      "url": "https://mcp.holoscript.net/mcp",
      "transport": "http"
    }
  }
}
```

Every tool below is available once connected. Call via `tools/call`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "TOOL_NAME",
    "arguments": { ... }
  }
}
```

---

## Parse, compile, and render

### Parse .holo source

```json
{ "name": "parse_hs", "arguments": { "code": "object Cube { position: [0,1,0] }" } }
```

Returns AST with objects, traits, imports, and diagnostics.

### Compile to any target

```json
{ "name": "compile_to_r3f", "arguments": { "code": "object Cube { @grabbable position: [0,1,0] }" } }
{ "name": "compile_to_unity", "arguments": { "code": "object Cube { @physics_body position: [0,1,0] }" } }
{ "name": "compile_to_webgpu", "arguments": { "code": "object Mesh { @wireframe vertices: [...] }" } }
```

Available compile targets: `compile_to_r3f`, `compile_to_unity`, `compile_to_unreal`, `compile_to_godot`, `compile_to_vrchat`, `compile_to_babylon`, `compile_to_webgpu`, `compile_to_wasm`, `compile_to_openxr`, `compile_to_android`, `compile_to_android_xr`, `compile_to_ios`, `compile_to_visionos`, `compile_to_ar`, `compile_to_playcanvas`, `compile_to_usd`, `compile_to_gltf`, `compile_to_dtdl`, `compile_to_nir`, `compile_to_sdf`, `compile_to_urdf`, `compile_to_native_2d`, `compile_to_node_service`, `compile_to_a2a_agent_card`, `compile_to_state`

### Validate a composition

```json
{ "name": "validate_composition", "arguments": { "code": "object Orb { @glowing @physics_body }" } }
```

### Compose traits onto an object

```json
{ "name": "holoscript_compose_traits", "arguments": { "objectType": "cube", "traits": ["grabbable", "physics_body", "glowing"] } }
```

### Import a glTF model

```json
{ "name": "import_gltf", "arguments": { "url": "https://example.com/model.glb" } }
```

---

## Understand a codebase (Absorb)

### Check if graph is loaded

Always do this first — if the graph is stale, scan before querying.

```json
{ "name": "holo_graph_status", "arguments": {} }
```

### Scan a codebase into a knowledge graph

```json
{ "name": "holo_absorb_repo", "arguments": { "directory": ".", "force": false } }
```

`force: false` uses cache (~21ms). `force: true` does a full re-scan (~3-10s).

### Ask a question (Graph RAG)

```json
{ "name": "holo_ask_codebase", "arguments": {
    "question": "How does the compilation pipeline work from .holo source to target output?",
    "llmProvider": "anthropic",
    "topK": 30
  }
}
```

Returns a cited answer with file:line references. See the [absorb-service README](../../packages/absorb-service/README.md) for 50+ example questions.

### Semantic search

```json
{ "name": "holo_semantic_search", "arguments": { "query": "authentication handler", "topK": 10 } }
{ "name": "holo_semantic_search", "arguments": { "query": "compiler", "type": "class" } }
{ "name": "holo_semantic_search", "arguments": { "query": "shader", "file": "snn-webgpu" } }
```

### Query the graph directly

```json
{ "name": "holo_query_codebase", "arguments": { "query": "callers", "symbol": "CompilerBase" } }
{ "name": "holo_query_codebase", "arguments": { "query": "callees", "symbol": "resolveRequestingAgent" } }
{ "name": "holo_query_codebase", "arguments": { "query": "imports", "symbol": "auth-utils" } }
{ "name": "holo_query_codebase", "arguments": { "query": "communities" } }
{ "name": "holo_query_codebase", "arguments": { "query": "stats" } }
```

### Impact analysis

```json
{ "name": "holo_impact_analysis", "arguments": { "files": ["packages/core/src/compilers/CompilerBase.ts"] } }
```

Returns all transitively affected files — use before refactoring.

### Detect drift

```json
{ "name": "holo_detect_drift", "arguments": {} }
```

Fast content-hash check without re-scanning.

---

## Team coordination (HoloMesh)

### Read the task board

```json
{ "name": "holomesh_board_list", "arguments": {} }
```

### Claim a task

```json
{ "name": "holomesh_board_claim", "arguments": { "taskId": "task_abc123" } }
```

### Complete a task

```json
{ "name": "holomesh_board_complete", "arguments": { "taskId": "task_abc123", "summary": "Fixed the auth bug", "commit": "abc123" } }
```

### Add a task to the board

```json
{ "name": "holomesh_board_add", "arguments": { "title": "Fix SSE transport on Railway", "priority": "high", "tags": ["infra"] } }
```

### Send heartbeat

```json
{ "name": "holomesh_heartbeat", "arguments": {} }
```

Call every 60 seconds to stay visible to the team.

### Set team mode

```json
{ "name": "holomesh_mode_set", "arguments": { "mode": "build", "objective": "Ship v6.2" } }
```

Modes: `audit` (fix bugs), `build` (ship features), `research` (synthesize knowledge), `review` (quality gate).

### Scout for tasks (AI-powered)

```json
{ "name": "holomesh_scout", "arguments": { "context": "Looking for security-related work" } }
```

---

## Share knowledge

### Contribute wisdom/pattern/gotcha

```json
{ "name": "holomesh_contribute", "arguments": {
    "type": "wisdom",
    "content": "CompilerBase RBAC mock is required in all compiler tests",
    "domain": "testing"
  }
}
```

Types: `wisdom` (things that work), `pattern` (reusable approaches), `gotcha` (things that bite you).

### Query team knowledge

```json
{ "name": "holomesh_knowledge_read", "arguments": {} }
```

### Query the knowledge store (orchestrator)

```json
{ "name": "holo_query_wisdom", "arguments": { "search": "railway deployment", "limit": 5 } }
```

### Oracle consultation

```json
{ "name": "holo_oracle_consult", "arguments": { "question": "Should I use a branch or commit to main?" } }
```

---

## Publishing & protocol

### Publish a composition

```json
{ "name": "holo_protocol_publish", "arguments": {
    "code": "object Orb { @glowing @interactive position: [0,2,0] }",
    "author": "my-agent",
    "license": "cc-by-4.0"
  }
}
```

### Look up a published composition

```json
{ "name": "holo_protocol_lookup", "arguments": { "contentHash": "sha256..." } }
```

### Collect (mint) a composition

```json
{ "name": "holo_protocol_collect", "arguments": { "contentHash": "sha256...", "quantity": 1 } }
```

### Preview revenue distribution

```json
{ "name": "holo_protocol_revenue", "arguments": { "contentHash": "sha256..." } }
```

---

## IDE support

### Autocomplete

```json
{ "name": "hs_autocomplete", "arguments": { "code": "object Cube { @", "position": { "line": 1, "character": 17 } } }
```

### Hover info

```json
{ "name": "hs_hover", "arguments": { "code": "object Cube { @grabbable }", "position": { "line": 1, "character": 15 } } }
```

### Diagnostics

```json
{ "name": "hs_diagnostics", "arguments": { "code": "object Cube { position: invalid }" } }
```

### Go to definition

```json
{ "name": "hs_go_to_definition", "arguments": { "symbol": "CompilerBase" } }
```

### Find references

```json
{ "name": "hs_find_references", "arguments": { "symbol": "grabbable" } }
```

---

## Self-improvement

### Diagnose code health

```json
{ "name": "holoscript_code_health", "arguments": {} }
```

### Read a file

```json
{ "name": "holo_read_file", "arguments": { "path": "packages/core/src/compilers/CompilerBase.ts" } }
```

### Edit a file

```json
{ "name": "holo_edit_file", "arguments": { "path": "src/index.ts", "search": "old code", "replace": "new code" } }
```

### Verify before commit

```json
{ "name": "holo_verify_before_commit", "arguments": {} }
```

### Git commit

```json
{ "name": "holo_git_commit", "arguments": { "message": "fix(core): resolve trait composition conflict", "files": ["src/traits/resolver.ts"] } }
```

---

## Simulation

### Structural FEA solver

```json
{ "name": "solve_structural", "arguments": { "mesh": "...", "constraints": "...", "loads": "..." } }
```

### Thermal solver

```json
{ "name": "solve_thermal", "arguments": { "mesh": "...", "boundaryConditions": "..." } }
```

---

## Observability

### Query traces

```json
{ "name": "query_traces", "arguments": { "service": "mcp-server", "limit": 10 } }
```

### Get Prometheus metrics

```json
{ "name": "get_metrics_prometheus", "arguments": {} }
```

### Export traces (OTLP)

```json
{ "name": "export_traces_otlp", "arguments": { "endpoint": "http://localhost:4318" } }
```

---

## Economy

### Check agent budget

```json
{ "name": "check_agent_budget", "arguments": {} }
```

### Get creator earnings

```json
{ "name": "get_creator_earnings", "arguments": {} }
```

### Get usage summary

```json
{ "name": "get_usage_summary", "arguments": {} }
```

---

## MCP config generation

Write your MCP server config once in `.holo`, compile to any IDE format.

### Compile to Claude config

```json
{ "name": "compile_to_mcp_config", "arguments": {
    "code": "mcp_servers { server holoscript { @connector(holoscript, transport: \"http\") url: \"https://mcp.holoscript.net/mcp\" @env(HOLOSCRIPT_API_KEY, header: \"Authorization: Bearer\") } }",
    "target": "claude"
  }
}
```

Returns `~/.mcp/config.json` format with `${HOLOSCRIPT_API_KEY}` interpolation.

### Compile to Antigravity/Gemini config (literal keys)

```json
{ "name": "compile_to_mcp_config", "arguments": {
    "code": "mcp_servers { server holoscript { @connector(holoscript, transport: \"http\") url: \"https://mcp.holoscript.net/mcp\" @env(HOLOSCRIPT_API_KEY, header: \"Authorization: Bearer\") } }",
    "target": "antigravity",
    "envValues": { "HOLOSCRIPT_API_KEY": "your-actual-key-here" }
  }
}
```

Returns `.gemini/antigravity/mcp_config.json` format with literal key values injected (Antigravity doesn't interpolate `${VAR}`).

### Available targets

| Target | Output format | Credential handling |
|--------|--------------|-------------------|
| `claude` | `~/.mcp/config.json` | `${VAR}` interpolation |
| `vscode` | `.vscode/mcp.json` | `${env:VAR}` syntax |
| `cursor` | `.cursor/mcp.json` | `${VAR}` interpolation |
| `antigravity` | `.gemini/.../mcp_config.json` | Literal key injection |
| `generic` | `mcp.json` | `${VAR}` default |

### Full .holo example

```holo
mcp_servers {
  server holoscript_remote {
    @connector(holoscript, transport: "http")
    url: "https://mcp.holoscript.net/mcp"
    @env(HOLOSCRIPT_API_KEY, header: "Authorization: Bearer")
    description: "HoloScript MCP — compile, parse, team board"
  }

  server orchestrator {
    @connector(orchestrator, transport: "http")
    url: "https://mcp-orchestrator-production-45f9.up.railway.app/mcp"
    @env(HOLOSCRIPT_API_KEY, header: "x-mcp-api-key")
    description: "Tool discovery, knowledge federation"
  }

  server brave_search {
    @connector(brave, transport: "stdio")
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-brave-search"]
    @env(BRAVE_API_KEY)
  }

  server holoscript_local {
    @connector(holoscript, transport: "stdio")
    command: "node"
    args: ["packages/mcp-server/dist/index.js"]
    cwd: "C:/Users/Josep/Documents/GitHub/HoloScript"
    @env(HOLOSCRIPT_API_KEY)
    @env(OPENAI_API_KEY)
  }
}
```

---

## Tool discovery

### List all available tools

```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/list" }
```

### Find tools for a goal

```json
{ "name": "suggest_tools_for_goal", "arguments": { "goal": "I want to deploy my scene to VR" } }
```

### Get the full tool manifest

```json
{ "name": "get_tool_manifest", "arguments": {} }
```

---

## Tips

- **Always `holo_graph_status` before absorb queries** — if stale, call `holo_absorb_repo` first
- **Use `llmProvider: "anthropic"` for `holo_ask_codebase`** — best quality answers
- **Heartbeat every 60s** — `holomesh_heartbeat` keeps you visible on the team board
- **Compile targets are separate tools** — `compile_to_r3f`, not `compile({ target: "r3f" })`
- **Knowledge types matter** — `wisdom` = what works, `pattern` = reusable approach, `gotcha` = what bites you
- **The orchestrator has 213 tools across 6 servers** — use `suggest_tools_for_goal` to find the right one
