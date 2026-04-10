# @holoscript/mcp-server

**Model Context Protocol (MCP) server for HoloScript.** Enables AI agents (Claude, Copilot, Cursor, etc.) to parse, validate, generate, and compile HoloScript code.

## Overview

The MCP server provides AI-friendly tools (inventory is live and versioned via `/health`) that let language models:

- **Parse** HoloScript files into abstract syntax trees
- **Validate** code for errors before generation
- **Generate** complete scenes and objects from descriptions
- **Compile** to registered target platforms
- **Analyze** codebase structure and suggest improvements
- **Extract** traits, patterns, and metadata

This enables AI agents to write production-ready HoloScript code.

## Installation

### Claude Desktop

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "holoscript": {
      "command": "npx",
      "args": ["@holoscript/mcp-server"],
      "disabled": false
    }
  }
}
```

### GitHub Copilot

Add to `.vscode/settings.json`:

```json
{
  "copilot.advanced.mcpServers": [
    {
      "name": "holoscript",
      "command": "npx",
      "args": ["@holoscript/mcp-server"]
    }
  ]
}
```

### Cursor IDE

Add to `.cursor_rules`:

```
# Enable HoloScript MCP Server
MCP_SERVERS: ["holoscript"]
```

### Custom Usage

```typescript
import { startMCPServer } from '@holoscript/mcp-server';

const server = await startMCPServer({
  port: 3000,
  verbose: true,
});
```

## Tools (live inventory)

Verify current tool inventory via:

```bash
curl https://mcp.holoscript.net/health
```

### Parsing & Analysis

| Tool                  | Purpose                              |
| --------------------- | ------------------------------------ |
| `parse_hs`            | Parse `.hs` files into AST           |
| `parse_hsplus`        | Parse `.hsplus` files with VR traits |
| `parse_holo`          | Parse `.holo` composition files      |
| `validate_holoscript` | Check syntax without full parse      |
| `analyze_code`        | Get complexity metrics               |
| `explain_code`        | Describe code in English             |

### Code Generation

| Tool                | Purpose                          |
| ------------------- | -------------------------------- |
| `generate_object`   | Create object from description   |
| `generate_scene`    | Create full composition          |
| `generate_template` | Create reusable template         |
| `suggest_traits`    | Recommend traits for description |
| `list_traits`       | Show available traits            |
| `explain_trait`     | Get trait documentation          |

### Compilation

| Tool                | Purpose                    |
| ------------------- | -------------------------- |
| `compile_holo`      | Compile to specific target |
| `list_compilers`    | Show registered targets    |
| `get_compiler_info` | Details about target       |

### Codebase Intelligence

| Tool              | Purpose                            |
| ----------------- | ---------------------------------- |
| `absorb_repo`     | Scan codebase into knowledge graph |
| `query_codebase`  | Ask questions about code           |
| `find_usages`     | Locate symbol references           |
| `impact_analysis` | Blast radius of changes            |
| `detect_patterns` | Find common patterns               |

## Example: AI Generates a VR Game

**User:** "Create a VR shooter with physics-based projectiles"

**Agent workflow:**

```
1. LLM uses suggest_traits("VR shooter with projectiles")
   → Returns: @grabbable, @throwable, @physics, @collidable, @damaging

2. LLM uses generate_scene("VR shooter with enemy AI")
   → Returns: scene.holo with all objects

3. LLM uses validate_holoscript(scene.holo)
   → Returns: No errors

4. LLM uses compile_holo(scene.holo, target="unity")
   → Returns: Ready-to-import C# + prefabs
```

## Example: Multi-Agent Collaboration

**Agent 1 (Designer):** "I want a marketplace"
→ Uses `generate_scene()` to create layout

**Agent 2 (Backend):** "Generate GraphQL schema"
→ Uses `compile_holo(marketplace.holo, target="graphql")`

**Agent 3 (QA):** "Find bugs"
→ Uses `analyze_code()` on generated marketplace

All agents work with the same `.holo` file.

## MCP Protocol

The server implements the official [Model Context Protocol](https://modelcontextprotocol.io/) specification:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "parse_holo",
    "arguments": {
      "code": "composition \"MyScene\" { object \"Cube\" { @grabbable } }"
    }
  }
}
```

## Tool Reference

### parse_holo

```
Input:
  - code: string (HoloScript code)

Output:
  - ast: AST object
  - diagnostics: Diagnostic[]
  - metadata: { linesOfCode, complexity, traits }
```

### suggest_traits

```
Input:
  - description: string (plain English description)

Output:
  - traits: string[] (recommended @trait names)
  - explanations: { [trait]: why }
```

### generate_object

```
Input:
  - description: string
  - traits: string[] (optional)

Output:
  - code: string (HoloScript object code)
  - template: string (suggested template)
  - confidence: number
```

### compile_holo

```
Input:
  - code: string
  - target: string ("unity" | "godot" | "webgpu" | ...)

Output:
  - code: string (compiled output)
  - language: string
  - files: { [path]: content } (if multi-file)
```

## Best Practices

1. **Always validate** before compiling:

   ```
   validate_holoscript() → compile_holo()
   ```

2. **Suggest traits first** when generating from descriptions:

   ```
   suggest_traits() → generate_object()
   ```

3. **Use analysis** before large changes:

   ```
   impact_analysis() → make changes → run tests
   ```

4. **Cache parsed results** — Don't re-parse same file

5. **Stream tool responses** — Some tools return large outputs

## Troubleshooting

### MCP server won't start

```bash
# Check binary
npx @holoscript/mcp-server --help

# Start with verbose logging
MCP_DEBUG=1 npx @holoscript/mcp-server --verbose
```

### Tools returning errors

Check that input code is valid:

```typescript
// Should parse cleanly first
const validated = await validate_holoscript(code);
if (validated.errors.length > 0) {
  // Fix before other operations
}
```

### Performance

For large codebases, use `absorb_repo` with caching:

```
1. absorb_repo(code, { cache: true })   // Scans + caches
2. query_codebase(question)             // Uses cache
3. find_usages(symbol)                  // Uses cache
```

## See Also

- [CLI tools](./cli.md) — Command-line equivalents
- [Agent example](../examples/ai-agent.md) — Full AI integration example
- [MCP Protocol spec](https://modelcontextprotocol.io/) — Official MCP docs
