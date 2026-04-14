> **ARCHIVED** — This document contains historical numbers that were accurate at time of writing. For current ecosystem metrics, see [NUMBERS.md](../NUMBERS.md).

# MCP Configuration Reference

Quick reference for configuring HoloScript and Hololand MCP servers across different IDEs.

---

## Configuration Files

| IDE            | Location                                      |
| -------------- | --------------------------------------------- |
| VS Code        | `.vscode/mcp.json`                            |
| Antigravity    | `.antigravity/mcp.json`                       |
| Cursor         | `.cursor/mcp.json`                            |
| Claude Desktop | `claude_desktop_config.json` (user directory) |

---

## Server Summary

### HoloScript MCP (this repo)

**Package:** `@holoscript/mcp-server`  
**Location:** `HoloScript/packages/mcp-server/`  
**Purpose:** Language tooling (parse, validate, generate)
**Usable by:** Brittney, Copilot, Claude, Cursor, any AI agent

**Start Command:**

```bash
npx tsx packages/mcp-server/src/index.ts
```

**Tools (12):**

- `parse_hs` - Parse .hs/.hsplus
- `parse_holo` - Parse .holo
- `validate_holoscript` - Syntax validation
- `list_traits` - List 1,800+ VR traits
- `explain_trait` - Trait documentation
- `suggest_traits` - AI trait suggestions
- `generate_object` - NL → object
- `generate_scene` - NL → scene
- `get_syntax_reference` - Syntax docs
- `get_examples` - Code examples
- `analyze_code` - Code analysis
- `explain_code` - Plain English explanation

---

### Brittney MCP (Hololand repo)

**Package:** `@hololand/mcp-server`  
**Location:** `Hololand/packages/brittney/mcp-server/`  
**Purpose:** Platform tooling (AI, debugging, VR worlds)
**Usable by:** Brittney, Copilot, Claude, Cursor, any AI agent

**Start Command:**

```bash
npx tsx packages/brittney/mcp-server/src/index.ts
```

**Environment Variables:**

```
HOLOLAND_API_URL=http://localhost:3000
BRITTNEY_SERVICE_URL=http://localhost:11435
BRITTNEY_ADMIN_KEY=mcp-localhost-trusted
```

**Tool Categories (40+ tools):**

| Category    | Prefix      | Examples                                |
| ----------- | ----------- | --------------------------------------- |
| IDE Tools   | `brittney_` | scan_project, diagnostics, autocomplete |
| AI Features | `brittney_` | ask_question, explain_scene, auto_fix   |
| Graph Tools | `holo_`     | parse_to_graph, visualize_flow          |
| Debugging   | `brittney_` | error_monitor, performance_monitor      |
| Versioning  | `brittney_` | scene_snapshot, compare_snapshots       |
| World Mgmt  | -           | create_world, list_worlds               |

---

## Full Configuration Examples

### VS Code (Both Servers)

`.vscode/mcp.json`:

```jsonc
{
  "servers": {
    "holoscript": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "packages/mcp-server/src/index.ts"],
    },
    "hololand": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "../Hololand/packages/brittney/mcp-server/src/index.ts"],
      "env": {
        "HOLOLAND_API_URL": "http://localhost:3000",
        "BRITTNEY_SERVICE_URL": "http://localhost:11435",
        "BRITTNEY_ADMIN_KEY": "mcp-localhost-trusted",
      },
    },
  },
}
```

### Antigravity IDE

`.antigravity/mcp.json`:

```json
{
  "name": "HoloScript Development",
  "servers": {
    "holoscript": {
      "name": "HoloScript Language",
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "packages/mcp-server/src/index.ts"],
      "cwd": "${workspaceFolder}"
    }
  },
  "toolGroups": {
    "parsing": {
      "name": "Parsing",
      "tools": ["parse_hs", "parse_holo"]
    },
    "generation": {
      "name": "Code Generation",
      "tools": ["generate_object", "generate_scene"]
    }
  }
}
```

### Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "holoscript": {
      "command": "npx",
      "args": [
        "tsx",
        "C:/Users/yourname/Documents/GitHub/HoloScript/packages/mcp-server/src/index.ts"
      ]
    },
    "hololand": {
      "command": "npx",
      "args": [
        "tsx",
        "C:/Users/yourname/Documents/GitHub/Hololand/packages/brittney/mcp-server/src/index.ts"
      ],
      "env": {
        "HOLOLAND_API_URL": "http://localhost:3000",
        "BRITTNEY_SERVICE_URL": "http://localhost:11435"
      }
    }
  }
}
```

### Cursor

`.cursor/mcp.json`:

```json
{
  "holoscript": {
    "command": "npx",
    "args": ["tsx", "packages/mcp-server/src/index.ts"],
    "cwd": "/path/to/HoloScript"
  },
  "hololand": {
    "command": "npx",
    "args": ["tsx", "packages/brittney/mcp-server/src/index.ts"],
    "cwd": "/path/to/Hololand"
  }
}
```

---

### Claude Code / Desktop

Both repos include `.claude/settings.json` for Claude Desktop/Code:

`.claude/settings.json`:

```json
{
  "name": "HoloScript Development",
  "mcpServers": {
    "holoscript": {
      "command": "npx",
      "args": ["tsx", "packages/mcp-server/src/index.ts"],
      "cwd": "${workspaceFolder}"
    },
    "hololand": {
      "command": "npx",
      "args": ["tsx", "../Hololand/packages/brittney/mcp-server/src/index.ts"],
      "cwd": "${workspaceFolder}",
      "env": {
        "HOLOLAND_API_URL": "http://localhost:3000",
        "BRITTNEY_SERVICE_URL": "http://localhost:11435"
      }
    }
  },
  "instructions": [
    "ALWAYS use MCP tools before writing HoloScript code",
    "Use suggest_traits for VR objects",
    "Use generate_object for code from descriptions",
    "Use validate_holoscript to verify syntax"
  ],
  "preferredTools": [
    "parse_hs",
    "parse_holo",
    "validate_holoscript",
    "generate_object",
    "generate_scene",
    "suggest_traits"
  ]
}
```

**Note:** The `.claude/settings.json` files are already configured in both HoloScript and Hololand repos. Claude Desktop/Code will automatically use these MCP servers.

### Copilot Instructions Setup

To ensure AI assistants always use MCP tools, add to `.github/copilot-instructions.md`:

```markdown
## ⚠️ CRITICAL: Use MCP Tools First

Before writing HoloScript code, ALWAYS use MCP tools:

- `suggest_traits` - Get appropriate VR traits
- `generate_object` - Create objects from descriptions
- `validate_holoscript` - Verify syntax

Required Workflow:

1. suggest_traits → 2. generate_object → 3. validate_holoscript
```

Both repos already have copilot-instructions.md configured with this guidance.

---

## Verification

After configuration, verify servers are working:

```bash
# Test HoloScript server
cd HoloScript
npx tsx packages/mcp-server/src/index.ts
# Should show: "HoloScript MCP Server running on stdio"

# Test Hololand server
cd Hololand
npx tsx packages/brittney/mcp-server/src/index.ts
# Should show: "Hololand MCP Server running on stdio"
```

Then reload your IDE and check MCP tool availability.

---

## Troubleshooting

| Issue                          | Solution                            |
| ------------------------------ | ----------------------------------- |
| "Server not found"             | Check path in config is correct     |
| "Tool not available"           | Reload IDE window                   |
| "Module not found"             | Run `pnpm install` in package dir   |
| "Build errors"                 | Run `pnpm build` in package dir     |
| "Cannot find @holoscript/core" | Check workspace dependencies linked |
