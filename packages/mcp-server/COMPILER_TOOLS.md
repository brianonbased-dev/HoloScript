# HoloScript MCP Compiler Tools

Model Context Protocol (MCP) integration for HoloScript compilation. Target count via `find packages/core/src -name "*Compiler.ts"` — currently 47.

## Overview

The HoloScript MCP Compiler Tools enable AI agents (Claude, GPT-4, Grok, etc.) to programmatically compile HoloScript compositions to any supported platform via standardized MCP tool calls.

### Key Features

- **47 Export Targets**: Unity, Unreal, URDF, SDF, WebGPU, WASM, R3F, VRChat, Next.js, A2A, and more (verify via `find packages/core/src -name "*Compiler.ts"`)
- **Circuit Breaker Protection**: Automatic fault isolation per target with graceful degradation
- **Job Status Tracking**: Monitor long-running compilations with unique job IDs
- **Streaming Progress**: Real-time progress updates for large compilations (WebSocket upgrade support)
- **Comprehensive Error Reporting**: AI-friendly error messages with suggestions
- **RBAC Integration**: AgentIdentity authentication and permission checks (Phase 1)

## Installation

The compiler tools are included in `@holoscript/mcp-server` v6.0.1+:

```bash
npm install @holoscript/mcp-server
```

## Quick Start

### 1. Start the MCP Server

```bash
holoscript-mcp
# Or via npx
npx @holoscript/mcp-server
```

The server runs on **port 8100** by default.

### 2. Use MCP Tools from AI Agents

#### Example: Compile to Unity

```json
{
  "tool": "compile_to_unity",
  "arguments": {
    "code": "composition \"MyScene\" {\n  environment { skybox: \"nebula\" }\n  object \"cube\" @grabbable {\n    geometry: \"cube\"\n    position: [0, 1, 0]\n  }\n}",
    "options": {
      "namespace": "MyGame",
      "generatePrefabs": true
    }
  }
}
```

**Response**:

```json
{
  "success": true,
  "jobId": "compile_1709234567890_abc123",
  "target": "unity",
  "output": "using UnityEngine;\nnamespace MyGame {\n  public class MyScene : MonoBehaviour { ... }",
  "warnings": [],
  "metadata": {
    "compilationTimeMs": 245,
    "circuitBreakerState": "CLOSED",
    "usedFallback": false,
    "outputSizeBytes": 3456
  }
}
```

#### Example: Compile to URDF for ROS 2

```json
{
  "tool": "compile_to_urdf",
  "arguments": {
    "code": "composition \"Robot\" {\n  object \"base_link\" @physics(mass: 5.0) {\n    geometry: \"box\"\n    size: [0.5, 0.3, 0.2]\n  }\n}",
    "options": {
      "robotName": "my_robot",
      "includeInertial": true
    }
  }
}
```

**Response**:

```json
{
  "success": true,
  "jobId": "compile_1709234567891_def456",
  "target": "urdf",
  "output": "<?xml version=\"1.0\"?>\n<robot name=\"my_robot\">\n  <link name=\"base_link\">...",
  "warnings": [],
  "metadata": {
    "compilationTimeMs": 123,
    "circuitBreakerState": "CLOSED",
    "usedFallback": false,
    "outputSizeBytes": 1234
  }
}
```

## Available Tools

### Core Compilation Tools

#### `compile_holoscript`

**Generic compilation tool supporting all 18+ export targets.**

**Arguments**:

- `code` (string, required): HoloScript composition source code (.holo format)
- `target` (string, required): Export target platform
  - Supported targets: `urdf`, `sdf`, `unity`, `unreal`, `godot`, `vrchat`, `openxr`, `android`, `android-xr`, `ios`, `visionos`, `ar`, `babylon`, `webgpu`, `r3f`, `wasm`, `playcanvas`, `usd`, `usdz`, `dtdl`, `vrr`, `multi-layer`
- `options` (object, optional): Compiler-specific configuration
- `stream` (boolean, optional): Enable streaming progress updates
- `jobId` (string, optional): Custom job ID (auto-generated if not provided)

**Returns**: `CompilationResult`

---

### Convenience Tools (Popular Targets)

#### `compile_to_unity`

Compile HoloScript to Unity Engine C# scripts with prefab generation.

**Arguments**:

- `code` (string, required): HoloScript composition code
- `options` (object, optional):
  - `namespace` (string): C# namespace (default: "HoloScript")
  - `generatePrefabs` (boolean): Generate Unity prefabs (default: true)

**Returns**: `CompilationResult` with Unity C# output

---

#### `compile_to_unreal`

Compile HoloScript to Unreal Engine C++ code with Blueprint support.

**Arguments**:

- `code` (string, required): HoloScript composition code
- `options` (object, optional):
  - `generateBlueprints` (boolean): Generate Blueprint classes (default: true)
  - `targetVersion` (string): Unreal Engine version (default: "5.3")

**Returns**: `CompilationResult` with Unreal C++ output

---

#### `compile_to_urdf`

Compile HoloScript to URDF (Unified Robot Description Format) for ROS 2 / Gazebo.

**Arguments**:

- `code` (string, required): HoloScript composition code
- `options` (object, optional):
  - `robotName` (string): Robot name (default: "holoscript_robot")
  - `includeInertial` (boolean): Include inertial properties (default: true)

**Returns**: `CompilationResult` with URDF XML output

---

#### `compile_to_sdf`

Compile HoloScript to SDF (Simulation Description Format) for Gazebo.

**Arguments**:

- `code` (string, required): HoloScript composition code
- `options` (object, optional):
  - `worldName` (string): World name (default: "holoscript_world")
  - `includePhysics` (boolean): Include physics engine config (default: true)

**Returns**: `CompilationResult` with SDF XML output

---

#### `compile_to_webgpu`

Compile HoloScript to WebGPU rendering code with WGSL shaders.

**Arguments**:

- `code` (string, required): HoloScript composition code
- `options` (object, optional):
  - `enableCompute` (boolean): Enable compute shaders (default: true)
  - `msaa` (number): MSAA sample count (default: 4)

**Returns**: `CompilationResult` with WebGPU JavaScript + WGSL output

---

#### `compile_to_r3f`

Compile HoloScript to React Three Fiber (R3F) JSX components.

**Arguments**:

- `code` (string, required): HoloScript composition code
- `options` (object, optional):
  - `typescript` (boolean): Generate TypeScript (default: true)
  - `environmentPreset` (string): Environment preset ("sunset", "dawn", "night", etc.)

**Returns**: `CompilationResult` with R3F JSX/TSX output

---

### Job Tracking & Metadata Tools

#### `get_compilation_status`

Get status of a compilation job by job ID.

**Arguments**:

- `jobId` (string, required): Job ID returned from `compile_holoscript`

**Returns**: `CompilationStatusResult`

```json
{
  "jobId": "compile_1709234567890_abc123",
  "status": "completed",
  "progress": 100,
  "result": { ... },
  "startedAt": 1709234567890,
  "completedAt": 1709234568135
}
```

---

#### `list_export_targets`

List all available HoloScript export targets with categories.

**Arguments**: None

**Returns**:

```json
{
  "targets": ["urdf", "sdf", "unity", "unreal", ...],
  "categories": {
    "Game Engines": ["unity", "unreal", "godot"],
    "VR Platforms": ["vrchat", "openxr"],
    "Mobile AR": ["android", "android-xr", "ios", "visionos", "ar"],
    "Web Platforms": ["babylon", "webgpu", "r3f", "wasm", "playcanvas"],
    "Robotics/IoT": ["urdf", "sdf", "dtdl"],
    "3D Formats": ["usd", "usdz"],
    "Advanced": ["vrr", "multi-layer"]
  }
}
```

---

#### `get_circuit_breaker_status`

Get circuit breaker status for a specific export target.

**Arguments**:

- `target` (string, required): Export target to check

**Returns**: `CircuitBreakerStatusResult`

```json
{
  "target": "unity",
  "state": "CLOSED",
  "failureCount": 0,
  "successCount": 42,
  "totalRequests": 42,
  "failureRate": 0.0,
  "lastError": null,
  "timeInDegradedMode": 0,
  "canRetry": true
}
```

## Type Definitions

### `CompilationResult`

```typescript
interface CompilationResult {
  success: boolean;
  jobId: string;
  target: ExportTarget;
  output?: string;
  error?: string;
  warnings?: string[];
  metadata: {
    compilationTimeMs: number;
    circuitBreakerState: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    usedFallback: boolean;
    outputSizeBytes?: number;
  };
}
```

### `CompilationStatusResult`

```typescript
interface CompilationStatusResult {
  jobId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number; // 0-100
  result?: CompilationResult;
  startedAt: number;
  completedAt?: number;
}
```

### `CircuitBreakerStatusResult`

```typescript
interface CircuitBreakerStatusResult {
  target: ExportTarget;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  successCount: number;
  totalRequests: number;
  failureRate: number;
  lastError: string | null;
  timeInDegradedMode: number;
  canRetry: boolean;
}
```

## Circuit Breaker Pattern

The MCP server uses a circuit breaker pattern to protect against cascading failures across export targets.

### Circuit States

1. **CLOSED** (Normal Operation)
   - All requests pass through to compiler
   - Failures are tracked within time window

2. **OPEN** (Circuit Tripped)
   - Requests fail fast with error message
   - Fallback to reference implementation (if available)
   - Automatically attempts recovery after timeout

3. **HALF_OPEN** (Testing Recovery)
   - Limited requests allowed to test if target is recovered
   - Successful requests close circuit
   - Failed requests re-open circuit

### Configuration

Default circuit breaker configuration:

- **Failure Threshold**: 5 consecutive failures within window
- **Failure Window**: 10 minutes
- **Half-Open Timeout**: 2 minutes
- **Success Threshold**: 3 consecutive successes to fully close

### Monitoring

Use `get_circuit_breaker_status` to monitor:

- Failure rates per target
- Time spent in degraded mode
- Last error messages
- Retry availability

## Streaming Progress (WebSocket Upgrade)

For long-running compilations, enable streaming progress:

```json
{
  "tool": "compile_holoscript",
  "arguments": {
    "code": "...",
    "target": "unity",
    "stream": true
  }
}
```

The server will upgrade to WebSocket and send progress events:

```json
{ "type": "progress", "jobId": "...", "progress": 30, "message": "Parsing composition..." }
{ "type": "progress", "jobId": "...", "progress": 60, "message": "Generating C# classes..." }
{ "type": "progress", "jobId": "...", "progress": 100, "message": "Compilation complete" }
{ "type": "result", "result": { ... } }
```

## AgentIdentity RBAC (Phase 1)

All compilation tools integrate with AgentIdentity authentication:

1. **Authentication**: Agents must provide JWT token in MCP headers
2. **Permission Checks**: `holoscript.compile.<target>` permissions required
3. **Rate Limiting**: Per-agent compilation quotas
4. **Audit Logging**: All compilation requests logged with agent ID

Example MCP header:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
X-Agent-ID: claude-code-agent-001
```

## Error Handling

### Common Errors

#### Parse Errors

```json
{
  "success": false,
  "error": "Failed to parse composition: Unexpected token 'objet' at line 3. Did you mean 'object'?",
  "metadata": { ... }
}
```

#### Compilation Errors

```json
{
  "success": false,
  "error": "Unity compiler error: Trait '@grabbable' requires physics component",
  "metadata": { ... }
}
```

#### Circuit Breaker Errors

```json
{
  "success": false,
  "error": "Circuit breaker OPEN for target 'unity'. Fallback unavailable. Retry after 120 seconds.",
  "metadata": {
    "circuitBreakerState": "OPEN",
    "usedFallback": false
  }
}
```

## Example Client Implementations

### TypeScript Client

```typescript
import { MCPClient } from '@modelcontextprotocol/sdk/client';

const client = new MCPClient({ serverUrl: 'http://localhost:8100' });

const result = await client.callTool('compile_to_unity', {
  code: `
    composition "MyScene" {
      object "cube" @grabbable {
        geometry: "cube"
        position: [0, 1, 0]
      }
    }
  `,
  options: { namespace: 'MyGame' },
});

console.log(result.output); // Unity C# code
```

### Python Client

```python
from mcp_sdk import MCPClient

client = MCPClient(server_url='http://localhost:8100')

result = client.call_tool('compile_to_urdf', {
    'code': '''
        composition "Robot" {
            object "base_link" @physics(mass: 5.0) {
                geometry: "box"
                size: [0.5, 0.3, 0.2]
            }
        }
    ''',
    'options': {'robotName': 'my_robot'}
})

print(result['output'])  # URDF XML
```

## Best Practices

### 1. Use Specific Target Tools When Possible

Prefer `compile_to_unity` over `compile_holoscript` with `target: "unity"` for better type safety.

### 2. Monitor Circuit Breaker Health

Regularly check `get_circuit_breaker_status` for targets you use frequently.

### 3. Handle Streaming for Large Compilations

Enable `stream: true` for compilations > 1000 lines of code or complex scenes.

### 4. Track Job IDs

Store job IDs to resume interrupted compilations or debug failures.

### 5. Validate Before Compiling

Use `validate_holoscript` tool before compilation to catch syntax errors early.

## Troubleshooting

### Server Not Responding

```bash
# Check if server is running
curl http://localhost:8100/health

# Expected response:
{"status": "ok", "version": "6.0.1"}
```

### Circuit Breaker Always OPEN

Reset circuit breaker via admin tool:

```json
{
  "tool": "reset_circuit_breaker",
  "arguments": { "target": "unity" }
}
```

### Compilation Timeout

Increase timeout in MCP client:

```typescript
const result = await client.callTool('compile_holoscript', args, {
  timeout: 60000, // 60 seconds
});
```

## Roadmap

### Phase 2: Enhanced Features (Q2 2026)

- [ ] Batch compilation API (`batch_compile_holoscript`)
- [ ] Compilation caching with content-addressable storage
- [ ] Incremental compilation support
- [ ] Source map generation for debugging
- [ ] Optimization hints and recommendations

### Phase 3: Advanced Integration (Q3 2026)

- [ ] WebSocket server for streaming progress
- [ ] GraphQL API for complex queries
- [ ] Compilation queue with priority scheduling
- [ ] Multi-target batch export
- [ ] Custom compiler plugin system

## Support

- **Documentation**: https://holoscript.dev/docs/mcp-compiler
- **API Reference**: https://holoscript.dev/api/mcp
- **GitHub**: https://github.com/brianonbased-dev/Holoscript
- **Discord**: https://discord.gg/holoscript

## License

MIT License - see LICENSE file for details.

---

**HoloScript MCP Compiler Tools v1.0.0**
_Empowering AI agents to compile spatial computing experiences to any platform._
