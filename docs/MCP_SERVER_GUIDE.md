# HoloScript MCP Server Guide

Model Context Protocol (MCP) server for HoloScript language tooling. Enables AI agents to parse, validate, and generate HoloScript code.

---

## Quick Start

### VS Code / GitHub Copilot

Configuration at `.vscode/mcp.json` is already set up. Reload VS Code to activate.

### Antigravity IDE

Configuration at `.antigravity/mcp.json` is already set up.

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "holoscript": {
      "command": "npx",
      "args": [
        "tsx",
        "C:/Users/yourname/Documents/GitHub/HoloScript/packages/mcp-server/src/index.ts"
      ]
    }
  }
}
```

---

## Available Tools

### Parsing

| Tool         | Input                | Output                         |
| ------------ | -------------------- | ------------------------------ |
| `parse_hs`   | `.hs`/`.hsplus` code | AST (Abstract Syntax Tree)     |
| `parse_holo` | `.holo` composition  | AST with composition structure |

**Example:**

```
parse_hs({ code: "composition player { @grabbable position: [0, 1, 0] }" })
```

### Validation

| Tool                  | Input               | Output                            |
| --------------------- | ------------------- | --------------------------------- |
| `validate_holoscript` | Any HoloScript code | Errors/warnings with line numbers |

**Example:**

```
validate_holoscript({ code: "composition test { @unknownTrait }" })
→ { valid: false, errors: [{ line: 1, message: "Unknown trait: @unknownTrait" }] }
```

### Traits

| Tool             | Input               | Output                          |
| ---------------- | ------------------- | ------------------------------- |
| `list_traits`    | Category (optional) | All 1,800+ VR traits            |
| `explain_trait`  | Trait name          | Full documentation with example |
| `suggest_traits` | Object description  | Recommended traits              |

**Example:**

```
suggest_traits({ description: "a sword that can be picked up" })
→ ["@grabbable", "@equippable", "@collidable"]
```

### Code Generation

| Tool              | Input             | Output                       |
| ----------------- | ----------------- | ---------------------------- |
| `generate_object` | Description       | HoloScript object definition |
| `generate_scene`  | Scene description | Complete `.holo` composition |

**Example:**

```
generate_object({ description: "a glowing blue crystal", format: "hsplus" })
→ "composition crystal { @glowing(intensity: 0.8) color: \"#0066ff\" position: [0, 1, -2] }"
```

### Documentation

| Tool                   | Input                       | Output                         |
| ---------------------- | --------------------------- | ------------------------------ |
| `get_syntax_reference` | Topic (orb, template, etc.) | Syntax documentation           |
| `get_examples`         | Pattern name                | Example code                   |
| `explain_code`         | HoloScript code             | Plain English explanation      |
| `analyze_code`         | HoloScript code             | Stats, complexity, suggestions |

---

## Best Practices

### 1. Use the Right Parser

| File Type               | Parser Tool  |
| ----------------------- | ------------ |
| `.hs` (classic)         | `parse_hs`   |
| `.hsplus` (with traits) | `parse_hs`   |
| `.holo` (composition)   | `parse_holo` |

### 2. Validate Before Executing

Always validate code before sending to runtime:

```
1. validate_holoscript(code)
2. If errors → show to user
3. If valid → execute
```

### 3. Use Trait Suggestions

When creating interactive objects:

```
1. User describes object
2. suggest_traits({ description }) → get relevant traits
3. generate_object with traits
```

### 4. Provide Context for Better Generation

More specific descriptions yield better code:

```
❌ "create an orb"
✅ "create a glowing blue composition at player height that can be grabbed with one hand"
```

---

## Extending the MCP Server

### Adding a New Tool

1. Add tool definition to `tools` array in `src/index.ts`:

```typescript
{
  name: 'my_new_tool',
  description: 'What it does and when to use it',
  inputSchema: {
    type: 'object',
    properties: {
      myParam: { type: 'string', description: 'What this param does' }
    },
    required: ['myParam']
  }
}
```

2. Add handler in `handleTool` switch:

```typescript
case 'my_new_tool': {
  const result = doSomething(args.myParam as string);
  return JSON.stringify(result, null, 2);
}
```

3. Rebuild: `pnpm build`

### Adding Training Examples

Add to `holoscript-mcp-training.jsonl`:

```jsonl
{
  "messages": [
    {
      "role": "user",
      "content": "What does my_new_tool do?"
    },
    {
      "role": "assistant",
      "content": "",
      "tool_calls": [
        {
          "name": "my_new_tool",
          "arguments": {
            "myParam": "example"
          }
        }
      ]
    }
  ]
}
```

---

## Troubleshooting

### Server won't start

```bash
# Check for syntax errors
pnpm build

# Run directly to see errors
npx tsx packages/mcp-server/src/index.ts
```

### Tools not showing in IDE

1. Verify `.vscode/mcp.json` or `.antigravity/mcp.json` exists
2. Reload IDE window
3. Check IDE MCP settings are enabled

### Tool returns errors

Check input matches schema:

- Required fields provided?
- Types correct (string vs number)?
- Enums valid?

---

## Related Servers

### Brittney MCP (`Hololand/packages/brittney/mcp-server`)

For VR platform features, use the Brittney MCP server in the Hololand repo:

- `brittney_*` tools for AI assistance
- `holo_*` tools for graph visualization
- Browser debugging tools
- World management

**Both servers can be used by Brittney or any cloud AI agent (Copilot, Claude, Cursor, etc.).**

Cross-reference config in `.vscode/mcp.json` includes both servers.

---

## Changelog

- **v1.0.0** (2026-01-25)
  - Initial release
  - 12 tools: parse, validate, generate, trait docs
  - VS Code, Antigravity, Claude Desktop support
