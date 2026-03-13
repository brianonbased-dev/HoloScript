# @holoscript/mcp-server

> **The programmatic bridge** for AI agents to read, write, compile, and transform HoloScript entities — spatial, backend, or anything in between. [Read the V6 Vision →](../../VISION.md)

Model Context Protocol (MCP) server for HoloScript AI assistance. **43+ tools** across 5 categories, including **30+ compilation targets**. Free and open-source.

## Installation

```bash
npm install @holoscript/mcp-server
```

## Configuration

Add to your MCP configuration (Claude Code, Cursor, Copilot, etc.):

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

## Tool Categories (43+ total)

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

## Tool Categories (34 total)

### Core Tools (15) - Parsing, Validation, Generation

| Tool                   | Description                                     |
| ---------------------- | ----------------------------------------------- |
| `parse_hs`             | Parse .hs or .hsplus code into AST              |
| `parse_holo`           | Parse .holo composition files                   |
| `validate_holoscript`  | Validate syntax with AI-friendly error messages |
| `list_traits`          | List all 2,000+ VR traits by category           |
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

## Usage Examples

### With Claude Code

```
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

## License

MIT
