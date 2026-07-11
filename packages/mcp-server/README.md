# @holoscript/mcp-server

> **The programmatic bridge** for AI agents to read, write, compile, and transform HoloScript entities — spatial, backend, or anything in between. [Read the V6 Vision →](../../docs/reference/VISION.md)

Model Context Protocol (MCP) server for HoloScript AI assistance. Tool/target counts via `curl mcp.holoscript.net/health` (changes as deploys evolve), including sovereign + bridge compilation targets, team board tools, and agent fleet tools. Free and open-source.

## Installation

```bash
npm install @holoscript/mcp-server
```

## Hosted Server

A live instance is available at **`https://mcp.holoscript.net`** — no local server required.
Health and discovery endpoints are public; raw `POST /mcp` calls require an
OAuth 2.1 access token or a production-valid legacy tenant key.

```bash
# Health check
curl https://mcp.holoscript.net/health

# REST API
curl https://mcp.holoscript.net/api/health
curl -X POST https://mcp.holoscript.net/api/render -H "Content-Type: application/json" \
  -d '{"code": "composition \"T\" { object \"C\" { geometry: \"cube\" } }"}'
curl -X POST https://mcp.holoscript.net/api/share -H "Content-Type: application/json" \
  -d '{"code": "...", "title": "My Scene", "platform": "x"}'

# MCP protocol
TOKEN="$(curl -s -X POST https://mcp.holoscript.net/oauth/register \
  -H "Content-Type: application/json" \
  -d '{"client_name":"docs-smoke","redirect_uris":[],"scope":"tools:read","token_endpoint_auth_method":"client_secret_post"}' \
  | node -e "let b='';process.stdin.on('data',c=>b+=c).on('end',async()=>{const c=JSON.parse(b);const r=await fetch('https://mcp.holoscript.net/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'client_credentials',client_id:c.client_id,client_secret:c.client_secret,scope:'tools:read'})});const t=await r.json();process.stdout.write(t.access_token||'')})")"
curl -X POST https://mcp.holoscript.net/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## Configuration

### Option 1: Remote (hosted)

Use the hosted MCP server — no local installation needed:

```json
{
  "mcpServers": {
    "holoscript": {
      "url": "https://mcp.holoscript.net/mcp",
      "headers": {
        "Authorization": "Bearer ${HOLOSCRIPT_MCP_ACCESS_TOKEN}"
      }
    }
  }
}
```

If your MCP client supports OAuth discovery, point it at
`https://mcp.holoscript.net/mcp` and let it complete registration/token exchange.
For manual smoke tests, run `pnpm --filter @holoscript/mcp-server smoke:auth`.

### Option 2: Local (npx)

Run the server locally via stdio:

```json
{
  "mcpServers": {
    "holoscript": {
      "command": "npx",
      "args": ["@holoscript/mcp-server"]
    }
  }
}
```

### Option 3: Local HTTP server

Run the Streamable HTTP server locally:

```bash
npx -p @holoscript/mcp-server holoscript-mcp-http --size small --port 3000
```

Server sizing controls body limits, Postgres pool size, public/OAuth rate
buckets, and the advertised tool/cache/memory envelope. The default profile is
`standard`, preserving the hosted server's existing defaults.

Use-case profiles:

- `laptop`: founder laptop or HoloShell local agent tooling.
- `jetson`: owned-metal Jetson edge node.
- `vast`: single Vast.ai GPU worker or render/inference utility node.
- `fleet`: hosted coordinator or multi-worker fleet gateway.

Legacy generic profiles remain valid: `tiny`, `small`, `standard`, `large`,
and `xlarge`.

| Setting                               | Values                                                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| `MCP_SERVER_SIZE`                     | `tiny`, `small`, `standard`, `large`, `xlarge`, `laptop`, `jetson`, `vast`, `fleet` |
| `MCP_REQUEST_BODY_MAX_BYTES`          | Maximum JSON/form request body in bytes                                             |
| `MCP_POSTGRES_POOL_MAX`               | Maximum shared Postgres pool connections                                            |
| `OAUTH_RATE_LIMIT`                    | OAuth endpoint requests per minute                                                  |
| `PUBLIC_ANON_RATE_LIMIT`              | Public anonymous endpoint requests per minute                                       |
| `HOLOSCRIPT_CONSUMER_GEN_RATE_LIMIT`  | Anonymous generation requests per minute                                            |
| `HOLOSCRIPT_CONSUMER_GEN_DAILY_QUOTA` | Anonymous generation requests per day                                               |
| `MCP_MAX_CONCURRENT_TOOL_CALLS`       | Advertised concurrent tool-call envelope                                            |
| `MCP_TOOL_TIMEOUT_MS`                 | Advertised per-tool timeout budget                                                  |
| `MCP_CACHE_MAX_ENTRIES`               | Advertised cache entry budget                                                       |
| `MCP_MEMORY_BUDGET_MB`                | Advertised memory budget                                                            |

CLI flags map to the same environment variables:

```bash
holoscript-mcp-http --size vast --max-concurrent-tools 8 --tool-timeout-ms 120000
```

The active profile and resolved numeric limits are returned by `GET /health` and
`GET /api/health`.

## Tool Categories

### Compiler Tools (9) - NEW - Export to Any Platform

| Tool                         | Description                                       |
| ---------------------------- | ------------------------------------------------- |
| `compile_holoscript`         | Compile to any target (Unity, URDF, WebGPU, etc.) |
| `compile_to_unity`           | Compile to Unity C# with prefab generation        |
| `compile_to_unreal`          | Compile to Unreal C++ with Blueprints             |
| `compile_to_urdf`            | Compile to URDF for ROS 2 / Gazebo                |
| `compile_to_sdf`             | Compile to SDF for Gazebo simulation              |
| `compile_to_webgpu`          | Compile to WebGPU with WGSL shaders               |
| `compile_to_r3f`             | Compile to React Three Fiber JSX                  |
| `get_compilation_status`     | Track compilation job progress                    |
| `list_export_targets`        | List all 30+ export targets with categories       |
| `get_circuit_breaker_status` | Check circuit breaker health per target           |

**Supported Export Targets (30+):**

- **Game Engines**: Unity, Unreal, Godot
- **VR Platforms**: VRChat, OpenXR
- **Mobile AR**: Android, Android XR, iOS, visionOS, Generic AR
- **Web Platforms**: Babylon.js, WebGPU, React Three Fiber, WASM, PlayCanvas
- **Robotics/IoT**: URDF, SDF, DTDL (Azure Digital Twins)
- **3D Formats**: USD, USDZ
- **Advanced**: VRR, Multi-Layer

See [COMPILER_TOOLS.md](./COMPILER_TOOLS.md) for detailed documentation.

## Core Tool Categories

Total tool count via `curl mcp.holoscript.net/health` (changes with each deploy).

### Core Tools (15) - Parsing, Validation, Generation

| Tool                   | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `parse_hs`             | Parse .hs or .hsplus code into AST              |
| `parse_holo`           | Parse .holo composition files                   |
| `validate_holoscript`  | Validate syntax with AI-friendly error messages |
| `list_traits`          | List all 3,300+ VR traits by category           |
| `explain_trait`        | Get detailed trait documentation                |
| `suggest_traits`       | Suggest traits from natural language            |
| `generate_object`      | Generate objects from descriptions              |
| `generate_scene`       | Generate complete compositions                  |
| `get_syntax_reference` | Syntax documentation lookup                     |
| `get_examples`         | Code examples for common patterns               |
| `explain_code`         | Plain English code explanation                  |
| `analyze_code`         | Complexity and best-practice analysis           |
| `render_preview`       | Generate preview images/GIFs                    |
| `create_share_link`    | Create shareable playground links               |
| `convert_format`       | Convert between .hs, .hsplus, .holo             |

### Graph Understanding Tools (6) - Visual Architecture

| Tool                        | Description                                  |
| --------------------------- | -------------------------------------------- |
| `holo_parse_to_graph`       | Parse .holo into graph (nodes, edges, flows) |
| `holo_visualize_flow`       | ASCII flow diagram of event/action chains    |
| `holo_get_node_connections` | All connections for a specific node          |
| `holo_design_graph`         | Design graph architecture from description   |
| `holo_diff_graphs`          | Compare two .holo files as graph diffs       |
| `holo_suggest_connections`  | Suggest missing connections and flows        |

### IDE Tools (9) - Editor Integration

| Tool                  | Description                                    |
| --------------------- | ---------------------------------------------- |
| `hs_scan_project`     | Scan workspace for all HoloScript files/assets |
| `hs_diagnostics`      | LSP-style diagnostics with quick fixes         |
| `hs_autocomplete`     | Context-aware completions (traits, properties) |
| `hs_refactor`         | Rename, extract template, organize imports     |
| `hs_docs`             | Inline documentation for traits/keywords       |
| `hs_code_action`      | Position-aware code actions (lightbulb)        |
| `hs_hover`            | Hover information (tooltips)                   |
| `hs_go_to_definition` | Find symbol definitions across files           |
| `hs_find_references`  | Find all references to a symbol                |

### Brittney-Lite AI Tools (4) - Free AI Assistant

| Tool                  | Description                                    |
| --------------------- | ---------------------------------------------- |
| `hs_ai_explain_error` | Human-friendly error explanations with fixes   |
| `hs_ai_fix_code`      | Automatically fix broken HoloScript code       |
| `hs_ai_review`        | Code review for performance, traits, structure |
| `hs_ai_scaffold`      | Generate production-ready project scaffolding  |

### Tool Discovery + Batch Execution (NEW)

| Tool                     | Purpose                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `get_tool_manifest`      | Return machine-readable tool manifest with categories, tags, and input/output schemas |
| `suggest_tools_for_goal` | Recommend best tools for a natural-language goal + suggested bundles                  |
| `batch_tool_call`        | Execute multiple tool calls in one request with per-call success/error results        |

#### Discover tools for a goal

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "suggest_tools_for_goal",
    "arguments": {
      "goal": "parse, validate, and compile this scene to r3f",
      "maxSuggestions": 8
    }
  }
}
```

#### Parse + validate + compile in one call

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "batch_tool_call",
    "arguments": {
      "stopOnError": true,
      "calls": [
        { "name": "parse_hs", "args": { "code": "object Cube { geometry: \"cube\" }" } },
        { "name": "validate_holoscript", "args": { "code": "object Cube { geometry: \"cube\" }" } },
        {
          "name": "compile_holoscript",
          "args": {
            "code": "composition \"Demo\" { object \"Cube\" { geometry: \"cube\" } }",
            "target": "r3f"
          }
        }
      ]
    }
  }
}
```

The `batch_tool_call` response includes `results[]` (per call) and a `summary` with totals, failures, and whether execution stopped early.

## Usage Examples

### With Claude Code

```text
"Create a VR scene with a grabbable ball and physics"
# Claude uses generate_scene + suggest_traits automatically

"Fix this HoloScript code: composition ball { @graable }"
# Claude uses hs_ai_fix_code -> corrects @graable to @grabbable

"Show me the architecture of this .holo file"
# Claude uses holo_parse_to_graph + holo_visualize_flow
```

### Programmatic Usage

```typescript
import { tools, handleTool } from '@holoscript/mcp-server';

// Parse code
const result = await handleTool('parse_hs', {
  code: 'composition Ball @grabbable { position: [0, 1, 0] }',
});

// Get graph structure
const graph = await handleTool('holo_parse_to_graph', {
  code: 'composition "Scene" { ... }',
});

// AI code review
const review = await handleTool('hs_ai_review', {
  code: myHoloCode,
  focus: 'performance',
});
```

## Premium: Hololand MCP

For advanced features, use the Hololand MCP server (premium):

- Live browser context visibility via Brittney
- AI-powered debugging with full runtime context
- One-shot generate & inject into running app
- Real-time error monitoring with auto-fix
- Performance guard with AI optimization
- Session recording & replay
- Batch agent operations

See [@hololand/mcp-server](https://github.com/brianonbased-dev/Hololand) for details.

## Package boundary & release posture

**Consumer audience.** `@holoscript/mcp-server` is the HoloScript MCP tool server —
a standalone MCP endpoint that exposes HoloScript's parse / validate / generate /
compile and codebase-intelligence tools to external agents and agent frameworks.
It is written for **external consumers and operators** running their own MCP host:
you point an MCP client (Claude, Cursor, any MCP-capable agent) at this server, or
you embed the tool handlers in your own service. It is not tied to any single
deployment.

**Caller-owned configuration (bring your own).** This package ships **no**
credentials and **no** operator-specific defaults. You supply everything through
environment variables (or a secrets broker / HoloKey vault):

- **Workspace** — `HOLOMESH_WORKSPACE` / `HOLO_MEMORY_WORKSPACE` select the
  knowledge/mesh workspace. When unset, the server falls back to the neutral
  `default` workspace, never a maintainer's private workspace.
- **Orchestrator & endpoints** — `MCP_ORCHESTRATOR_URL` /
  `MCP_ORCHESTRATOR_PUBLIC_URL` point the mesh/knowledge routes at your
  orchestrator.
- **Memory store** — `HOLO_MEMORY_SOT_HOST`, `HOLO_MEMORY_SOT_PORT`
  (defaults to the standard Postgres port `5432`), `HOLO_MEMORY_SOT_DB`,
  `HOLO_MEMORY_SOT_USER`, and the `MEMORY_SVC_PASSWORD` secret configure the
  optional sovereign memory backend.
- **API keys** — `HOLOSCRIPT_API_KEY` / `HOLOMESH_API_KEY` and any provider keys
  for optional inference are read from your environment.

**Package boundary.** This package **does not ship founder-local or
maintainer-local state** — no private database, no private workspace, no host
paths, no wallet material, and no baked-in secrets. Any reference to a specific
workspace, host, or endpoint is an *example* or an env-driven fallback, **not the
package default**. If a value is required for your deployment, it is your
responsibility to provide it via env/secrets.

**Release posture.** This is a **v0-preview** release. Expect the tool surface,
schemas, and configuration keys to change between minor versions. Known
limitations: the full tool catalog assumes companion HoloScript packages and (for
some tools) a reachable orchestrator or memory backend; tools whose backends are
not configured degrade to a no-op or an explicit error rather than failing the
whole server. Validate the specific tools you depend on against your own
environment before relying on them in production.

## License

MIT — see [LICENSE](./LICENSE).
