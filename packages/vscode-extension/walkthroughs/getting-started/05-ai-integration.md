# AI Integration with MCP

HoloScript was designed for AI-first development. Use Claude, GPT, or any MCP-compatible agent to generate code.

## Using with GitHub Copilot

The extension automatically provides context to Copilot:

- Type what you want: `// Create a portal that teleports the player`
- Copilot generates valid HoloScript code

## Using with Claude Desktop

1. Install the MCP server:

```bash
npm install @holoscript/mcp-server
```

2. Add to Claude Desktop settings:

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

3. Ask Claude to create HoloScript scenes naturally:
   > "Create a VR escape room with 3 puzzles"

## MCP Tools Available

Claude and other agents can use these tools:

- `generate_object` - Create objects from descriptions
- `generate_scene` - Create complete compositions
- `suggest_traits` - Get recommended VR traits
- `validate` - Check code for errors
- `list_traits` - Show all 2,000+ available traits

Click **Next** to see next steps!

---

📹 _Video Tutorial: [Coming Soon - AI-Powered VR Development]_
