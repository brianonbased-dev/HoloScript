---
description: Generate and validate HoloScript code using MCP tools
---

# HoloScript MCP Workflow

This workflow uses the HoloScript MCP server (via mcp-orchestrator mesh) to generate, validate, and refine VR scene code.

## Prerequisites

1. Start the MCP Orchestrator (mesh coordinator):

```bash
cd c:\Users\josep\Documents\GitHub\mcp-orchestrator
npm start
# Runs on http://localhost:5555
```

2. Register HoloScript MCP with the orchestrator:

```bash
curl -X POST http://localhost:5555/servers/register -H "Content-Type: application/json" -d "{\"id\":\"holoscript\",\"name\":\"HoloScript Language\",\"command\":\"npx\",\"args\":[\"tsx\",\"packages/mcp-server/src/index.ts\"],\"workspace\":\"HoloScript\",\"visibility\":\"public\",\"tools\":[\"parse_hs\",\"validate_holoscript\",\"suggest_traits\",\"generate_object\",\"generate_scene\",\"list_traits\",\"explain_trait\"]}"
```

// turbo-all

## Workflow Steps

### 1. Check Orchestrator Health

```bash
curl http://localhost:5555/health
```

### 2. Discover Available Tools

```bash
curl http://localhost:5555/tools/discover
```

### 3. Generate Object

```
Tool: suggest_traits
Input: {
  "description": "a glowing blue crystal floating at eye level that players can grab",
  "format": "hsplus"
}
```

### 4. Validate the Generated Code

Always validate before using:

```
Tool: validate_holoscript
Input: { "code": "<output from step 3>" }
```

### 5. Generate Full Scene

For complete scenes, use `generate_scene`:

```
Tool: generate_scene
Input: {
  "description": "A meditation room with floating crystals, ambient lighting, and calming atmosphere",
  "format": "holo"
}
```

### 6. Parse and Analyze

Optionally analyze the code structure:

```
Tool: analyze_code
Input: { "code": "<your scene code>" }
```

## Example Task: Create Interactive VR Object

**Goal:** Create a grabbable, throwable sword for a VR game.

1. `suggest_traits({ description: "a medieval sword" })`
   → `["@grabbable", "@equippable", "@throwable", "@collidable", "@damaging"]`

2. `generate_object({ description: "a medieval sword with glowing runes that can be grabbed and thrown", format: "hsplus" })`
   → Generated code

3. `validate_holoscript({ code: <generated> })`
   → Verify no errors

4. Save to `assets/sword.hsplus`

## Tool Reference

| Tool | Purpose | When to Use |
|------|---------|-------------|
| `suggest_traits` | Get VR trait recommendations | Before creating objects |
| `generate_object` | NL → single object | Creating individual objects |
| `generate_scene` | NL → full scene | Creating complete environments |
| `validate_holoscript` | Check syntax | Before saving/running code |
| `parse_hs` | Get AST | Programmatic analysis |
| `explain_trait` | Trait documentation | Learning about traits |
| `list_traits` | All available traits | Discovering capabilities |
