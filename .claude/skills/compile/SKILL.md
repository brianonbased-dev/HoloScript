---
name: compile
description: >
  Compile HoloScript compositions to any of 28+ export targets. Single surface
  that unlocks the entire compile_to_* MCP tool family — Unity, Unreal, Godot,
  visionOS, OpenXR, WebGPU, Babylon, PlayCanvas, VRChat, Android, iOS, AR, WASM,
  SDF, DTDL, NIR, Node.js service, A2A agent card, state, MCP config, and more.
  Also handles modality selection, schema mapping, trait composition, domain
  block compilation, and job/circuit-breaker status. Invoke with /compile <target>
  <code>, /compile list, /compile status <jobId>, or /compile modality <platform>.
argument-hint: "[<target>] [<code|file.holo>] [--options <json>]"
disable-model-invocation: false
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, WebFetch
context: fork
---

=====================================================================
COMPILE — HoloScript compilation surface (28+ targets, one skill)
=====================================================================

**Command**: $ARGUMENTS

You are the compilation surface for the HoloScript ecosystem. You translate
.holo compositions into platform-specific output — C# for Unity, C++ for
Unreal, Swift for visionOS, WGSL for WebGPU, URDF for robotics, DTDL for
IoT, and 20+ more targets. You also handle modality selection, schema mapping,
trait composition, and job tracking.

## When to invoke

- User asks to compile .holo code to a specific platform
- User asks "what targets does HoloScript support?"
- User asks about modality selection (device → embodiment mapping)
- User asks to map a data schema to HoloScript traits
- User wants to compose traits cryptographically
- User asks about compilation job status or circuit breaker health

## Arguments

```
/compile <target> <code>           — Compile .holo code to target
/compile <target> --file <path>    — Compile .holo file to target
/compile list                      — List all available export targets
/compile modality <platform>       — Select optimal modality for device
/compile status <jobId>            — Check compilation job status
/compile circuit <target>          — Check circuit breaker for target
/compile schema <json|file>        — Map data schema to HoloScript traits
/compile compose <declarations>    — Compose traits cryptographically
/compile domain <domain> <code>    — Compile a domain block (healthcare, robotics, iot, education, music)
/compile mcp-config <code> [target] — Compile .holo to IDE MCP config
```

If `$ARGUMENTS` is empty, default to `list` (show targets + categories).

## Working directory

HoloScript repo: `C:\Users\Josep\Documents\GitHub\HoloScript`

## MCP endpoint

All compilation goes through the HoloScript MCP server at `mcp.holoscript.net`.
Use the REST API endpoint:

```
POST https://mcp.holoscript.net/mcp
Header: x-mcp-api-key: $HOLOSCRIPT_API_KEY
```

For local development:
```
POST http://localhost:8100/mcp
```

Load API key from `.env` before any call:
```bash
ENV_FILE="${HOME}/.ai-ecosystem/.env"; [ ! -f "$ENV_FILE" ] && ENV_FILE="/c/Users/Josep/.ai-ecosystem/.env"
set -a && source "$ENV_FILE" 2>/dev/null && set +a
```

## Target catalog (verify via `find packages/core/src -name "*Compiler.ts"` — never hardcode)

Categories and their targets:

| Category | Targets |
|----------|---------|
| Game Engines | `unity`, `unreal`, `godot` |
| VR Platforms | `vrchat`, `openxr` |
| Mobile AR | `android`, `android-xr`, `ios`, `visionos`, `ar` |
| Web Platforms | `babylon`, `webgpu`, `r3f`, `wasm`, `playcanvas` |
| Robotics/IoT | `urdf`, `sdf`, `dtdl` |
| 3D Formats | `usd`, `usdz` |
| Neuromorphic | `nir` |
| Service/Agent | `node-service`, `a2a-agent-card`, `state`, `mcp-config` |
| 2D/Flat | `native-2d` |
| Advanced | `vrr`, `multi-layer` |

**Total**: 22 platform targets + 4 service targets + modality/compose/schema/domain = 28+ tools covered.

## Phase 1 — Parse arguments and determine action

```
If args is empty or "list" → Phase 2 (list targets)
If args starts with "modality" → Phase 5 (modality selection)
If args starts with "status" → Phase 6 (job status)
If args starts with "circuit" → Phase 7 (circuit breaker)
If args starts with "schema" → Phase 8 (schema mapping)
If args starts with "compose" → Phase 9 (trait composition)
If args starts with "domain" → Phase 10 (domain block)
If args starts with "mcp-config" or "mcp_config" → Phase 11 (MCP config)
Otherwise → Phase 3 (compile to target)
```

## Phase 2 — List targets

```bash
curl -s -X POST "https://mcp.holoscript.net/mcp" \
  -H "Content-Type: application/json" \
  -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "list_export_targets",
      "arguments": {}
    }
  }' | python3 -c "
import sys, json
resp = json.load(sys.stdin)
result = resp.get('result', {})
content = result.get('content', [])
if content:
    data = json.loads(content[0].get('text', '{}'))
else:
    data = json.loads(result.get('content', [{}])[0].get('text', '{}'))
targets = data.get('targets', [])
categories = data.get('categories', {})
print(f'Available targets ({len(targets)}):')
for cat, tgts in categories.items():
    print(f'  {cat}: {", ".join(tgts)}')
print(f'\nUsage: /compile <target> \"<.holo code>\"')
print(f'Example: /compile unity \"composition MyScene { object cube @grabbable { geometry: cube } }\")
"
```

## Phase 3 — Compile to target

Parse the arguments:
- First non-flag token = target (e.g., "unity", "webgpu", "r3f")
- `--file <path>` = read .holo code from file
- `--options <json>` = compiler-specific options
- Remaining text = .holo code (if no --file)

If code is not provided and no --file, check for a .holo file in the working directory. If still no code, ask the user.

```bash
# Resolve .holo code
if [ -n "$HFILE" ]; then
  CODE=$(cat "$HFILE")
elif [ -n "$CODE_ARG" ]; then
  CODE="$CODE_ARG"
else
  echo "Error: No .holo code provided. Use /compile <target> '<code>' or /compile <target> --file <path>"
  exit 1
fi

# Map target to MCP tool name
# Most targets use compile_to_<target> convention
# Special cases: mcp-config, state, a2a-agent-card, native-2d, node-service

TOOL_NAME="compile_to_${TARGET}"
# Special tool name mappings:
#   mcp-config    → compile_to_mcp_config
#   node-service  → compile_to_node_service  (note: underscore in target becomes underscore in tool)
#   a2a-agent-card → compile_to_a2a_agent_card
#   native-2d     → compile_to_native_2d
# All others use the direct compile_to_<target> naming

# Build the request payload
PAYLOAD=$(python3 -c "
import json, sys
tool = sys.argv[1]
code = sys.argv[2]
opts = json.loads(sys.argv[3]) if sys.argv[3] else {}

args = {'code': code}
if opts:
    args['options'] = opts

print(json.dumps({
    'jsonrpc': '2.0',
    'id': 1,
    'method': 'tools/call',
    'params': {
        'name': tool,
        'arguments': args
    }
}))
" "$TOOL_NAME" "$CODE" "$OPTIONS_JSON")

curl -s -X POST "https://mcp.holoscript.net/mcp" \
  -H "Content-Type: application/json" \
  -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
  -d "$PAYLOAD" | python3 -c "
import sys, json
resp = json.load(sys.stdin)
# MCP responses wrap content in result.content[].text
result = resp.get('result', {})
content = result.get('content', [])
if content:
    for c in content:
        text = c.get('text', '')
        try:
            data = json.loads(text)
            if data.get('success'):
                print(f'Compilation succeeded!')
                print(f'  Target: {data.get(\"target\", \"?\")}')
                print(f'  Job ID: {data.get(\"jobId\", \"?\")}')
                md = data.get('metadata', {})
                print(f'  Time: {md.get(\"compilationTimeMs\", \"?\")}ms')
                print(f'  Circuit: {md.get(\"circuitBreakerState\", \"?\")}')
                print(f'  Fallback: {md.get(\"usedFallback\", False)}')
                print(f'  Output size: {md.get(\"outputSizeBytes\", \"?\")} bytes')
                if data.get('warnings'):
                    for w in data['warnings']:
                        print(f'  WARNING: {w}')
                output = data.get('output', '')
                if output:
                    # Print first 80 lines of output
                    lines = output.split('\\n')
                    for line in lines[:80]:
                        print(line)
                    if len(lines) > 80:
                        print(f'... ({len(lines) - 80} more lines)')
            else:
                print(f'Compilation failed: {data.get(\"error\", \"unknown error\")}')
        except json.JSONDecodeError:
            print(text)
elif resp.get('error'):
    err = resp['error']
    print(f'MCP error [{err.get(\"code\", \"?\")}]: {err.get(\"message\", \"?\")}')
else:
    print(json.dumps(resp, indent=2)[:500])
"
```

### Target-specific options

Some targets accept compiler-specific options. Pass via `--options`:

| Target | Options |
|--------|---------|
| `unity` | `namespace` (string), `generatePrefabs` (bool) |
| `unreal` | `generateBlueprints` (bool), `targetVersion` (string) |
| `urdf` | `robotName` (string), `includeInertial` (bool) |
| `sdf` | `worldName` (string), `includePhysics` (bool) |
| `webgpu` | `enableCompute` (bool), `msaa` (number) |
| `r3f` | `typescript` (bool), `environmentPreset` (string) |
| `node-service` | `framework` (express/fastify), `port` (number), `typescript` (bool), `includeDocker` (bool), `nodeVersion` (18/20/22) |
| `mcp-config` | `target` (claude/vscode/cursor/antigravity/generic), `envValues` (object) |

All other targets accept a generic `options` object that is passed through to the compiler.

## Phase 4 — Compile from file

If `--file <path>` is specified, read the .holo file and proceed as Phase 3:

```bash
CODE=$(cat "$FILE_PATH")
# Then invoke the same MCP call as Phase 3 with this code
```

## Phase 5 — Modality selection

```
/compile modality quest3
/compile modality ios
/compile modality --all
```

Maps a device/platform to the optimal embodiment type (FullAvatar, UI2D, VoiceOnly, GlassOverlay) and the ExportTarget to compile to.

```bash
# Single platform
curl -s -X POST "https://mcp.holoscript.net/mcp" \
  -H "Content-Type: application/json" \
  -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "holoscript_select_modality",
      "arguments": {
        "platform": "quest3"
      }
    }
  }' | python3 -c "
import sys, json
resp = json.load(sys.stdin)
content = resp.get('result', {}).get('content', [])
if content:
    data = json.loads(content[0].get('text', '{}'))
    sel = data.get('selection', data.get('selections', {}))
    if isinstance(sel, dict):
        for k, v in sel.items():
            if isinstance(v, dict):
                print(f'  {k}: embodiment={v.get(\"embodimentType\",\"?\")}, target={v.get(\"exportTarget\",\"?\")}, spatial={v.get(\"canRenderSpatially\",\"?\")}')
            else:
                print(f'  {k}: {v}')
    else:
        print(json.dumps(data, indent=2))
"
```

Supported platforms: quest3, pcvr, visionos, android-xr, visionos-ar, android-xr-ar, webxr, ios, android, windows, macos, linux, web, android-auto, carplay, watchos, wearos

## Phase 6 — Job status

```
/compile status compile_1709234567890_abc123
```

```bash
curl -s -X POST "https://mcp.holoscript.net/mcp" \
  -H "Content-Type: application/json" \
  -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 1,
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"get_compilation_status\",
      \"arguments\": {
        \"jobId\": \"$JOB_ID\"
      }
    }
  }" | python3 -c "
import sys, json
resp = json.load(sys.stdin)
content = resp.get('result', {}).get('content', [])
if content:
    data = json.loads(content[0].get('text', '{}'))
    print(f'Job: {data.get(\"jobId\", \"?\")}')
    print(f'Status: {data.get(\"status\", \"?\")}')
    print(f'Progress: {data.get(\"progress\", \"?\")}%')
    if data.get('result'):
        r = data['result']
        print(f'Success: {r.get(\"success\", \"?\")}')
        print(f'Target: {r.get(\"target\", \"?\")}')
        if r.get('error'):
            print(f'Error: {r[\"error\"]}')
    if data.get('completedAt'):
        print(f'Completed: {data[\"completedAt\"]}')
"
```

## Phase 7 — Circuit breaker status

```
/compile circuit unity
/compile circuit webgpu
```

```bash
curl -s -X POST "https://mcp.holoscript.net/mcp" \
  -H "Content-Type: application/json" \
  -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 1,
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"get_circuit_breaker_status\",
      \"arguments\": {
        \"target\": \"$TARGET\"
      }
    }
  }" | python3 -c "
import sys, json
resp = json.load(sys.stdin)
content = resp.get('result', {}).get('content', [])
if content:
    data = json.loads(content[0].get('text', '{}'))
    print(f'Target: {data.get(\"target\", \"?\")}')
    print(f'State: {data.get(\"state\", \"?\")}')
    print(f'Failures: {data.get(\"failureCount\", 0)} / Successes: {data.get(\"successCount\", 0)}')
    print(f'Total requests: {data.get(\"totalRequests\", 0)}')
    print(f'Failure rate: {data.get(\"failureRate\", 0):.2%}')
    print(f'Can retry: {data.get(\"canRetry\", \"?\")}')
    if data.get('lastError'):
        print(f'Last error: {data[\"lastError\"]}')
"
```

Circuit states:
- **CLOSED** — normal operation, all requests pass through
- **OPEN** — circuit tripped, requests fail fast (fallback if available)
- **HALF_OPEN** — testing recovery, limited requests allowed

## Phase 8 — Schema mapping

```
/compile schema '{"name": "dispensary_menu", "fields": [{"name": "thc_percent", "type": "number"}, ...]}'
/compile schema --file schema.json
```

Maps any structured data schema to HoloScript traits. The universal domain bridge.

```bash
# Parse schema from args or file, then call holoscript_map_schema or holoscript_map_csv
# For holoscript_map_schema:
curl -s -X POST "https://mcp.holoscript.net/mcp" \
  -H "Content-Type: application/json" \
  -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 1,
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"holoscript_map_schema\",
      \"arguments\": {
        \"name\": \"dispensary_menu\",
        \"domain\": \"retail\",
        \"fields\": [
          {\"name\": \"thc_percent\", \"type\": \"number\", \"description\": \"THC percentage\"},
          {\"name\": \"product_name\", \"type\": \"string\", \"description\": \"Product name\"}
        ]
      }
    }
  }"

# For CSV headers:
# /compile schema --csv "name,thc_percent,price,category"
curl -s -X POST "https://mcp.holoscript.net/mcp" \
  -H "Content-Type: application/json" \
  -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 1,
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"holoscript_map_csv\",
      \"arguments\": {
        \"headers\": [\"name\", \"thc_percent\", \"price\", \"category\"],
        \"name\": \"dispensary_menu\",
        \"domain\": \"retail\"
      }
    }
  }"
```

## Phase 9 — Trait composition

```
/compile compose '[{"name": "C", "components": ["A", "B"]}]'
```

Cryptographic trait algebra via the ProvenanceSemiring.

```bash
curl -s -X POST "https://mcp.holoscript.net/mcp" \
  -H "Content-Type: application/json" \
  -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 1,
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"holoscript_compose_traits\",
      \"arguments\": {
        \"declarations\": $DECLARATIONS
      }
    }
  }"
```

## Phase 10 — Domain block compilation

```
/compile domain healthcare '<.holo code with healthcare {} block>'
/compile domain robotics --properties '{"sensors": [...]}'
```

Compiles domain-specific blocks (healthcare, robotics, iot, education, music).

```bash
TOOL_NAME="holoscript_compile_${DOMAIN}"

curl -s -X POST "https://mcp.holoscript.net/mcp" \
  -H "Content-Type: application/json" \
  -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 1,
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"$TOOL_NAME\",
      \"arguments\": {
        \"code\": \"$CODE\"
      }
    }
  }"
```

Available domains: `healthcare`, `robotics`, `iot`, `education`, `music`

## Phase 11 — MCP config compilation

```
/compile mcp-config '<.holo code with server objects>' [--target claude|vscode|cursor|antigravity|generic]
```

Compiles .holo MCP server definitions to IDE-specific config JSON.

```bash
curl -s -X POST "https://mcp.holoscript.net/mcp" \
  -H "Content-Type: application/json" \
  -H "x-mcp-api-key: $HOLOSCRIPT_API_KEY" \
  -d "{
    \"jsonrpc\": \"2.0\",
    \"id\": 1,
    \"method\": \"tools/call\",
    \"params\": {
      \"name\": \"compile_to_mcp_config\",
      \"arguments\": {
        \"code\": \"$CODE\",
        \"target\": \"$TARGET\"
      }
    }
  }"
```

## Error handling

All MCP calls can return errors. Handle them:

1. **Parse errors** — "Failed to parse composition: ..." — Fix the .holo code
2. **Compilation errors** — "Trait '@X' requires Y component" — Add missing traits
3. **Circuit breaker OPEN** — "Circuit breaker OPEN for target 'unity'" — Wait or try fallback
4. **MCP connection errors** — Server down or auth failure — Check `mcp.holoscript.net/health`

If the MCP server is unreachable, fall back to local compilation:

```bash
cd C:/Users/Josep/Documents/GitHub/HoloScript
# Try local MCP server on port 8100
curl -s http://localhost:8100/health 2>/dev/null
# If running, redirect all calls to localhost:8100
```

## Output conventions

- Always show target, job ID, and timing metadata
- For successful compilations, show the first 80 lines of output (configurable)
- For failures, show the error message and suggested fix
- For `list`, show the categorized target table
- For `modality`, show embodiment type + export target + spatial capability
- For `status`, show job progress percentage and completion time
- For `circuit`, show state, failure rate, and retry availability

## Example sessions

```
User: /compile unity "composition MyScene { object cube @grabbable { geometry: cube position: [0,1,0] } }"
→ Compiles to Unity C#, shows output

User: /compile list
→ Shows all 22+ targets organized by category

User: /compile modality quest3
→ Shows: FullAvatar, compile to vrchat/openxr, spatial=true

User: /compile webgpu --file my_scene.holo
→ Reads file, compiles to WebGPU WGSL

User: /compile schema --csv "name,price,category,thc_pct"
→ Maps CSV headers to HoloScript traits

User: /compile domain healthcare "composition PatientVitals { healthcare { heartRate: 72 bp: 120/80 } }"
→ Compiles healthcare domain block

User: /compile mcp-config "server holoscript { @connector(holoscript, transport: \"http\") url: \"https://mcp.holoscript.net/mcp\" }" --target claude
→ Generates Claude Desktop MCP config JSON
```

## Why this skill exists

From the 2026-04-28 capability orphans audit: **28 compile_to_* MCP tools had zero skill references**. Every export target ships in the MCP server but no agent can reach them without writing raw HTTP. This skill is the surface that closes that gap — one invocation pattern for all 28+ targets. Per W.GOLD.343: capabilities without surfaces are invisible to agent peers.