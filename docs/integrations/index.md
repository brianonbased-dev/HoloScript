# Integrations

HoloScript integrates with AI systems, platforms, and external services.

## Available Integrations

| Integration     | File                                                | Description                                                |
| --------------- | --------------------------------------------------- | ---------------------------------------------------------- |
| MCP Server      | [mcp-server](/guides/mcp-server)                    | 34 AI tools for Claude, Cursor, and MCP-compatible clients |
| AI Agents       | [ai-agents](/guides/ai-agents)                      | AI-generated scene composition                             |
| Grok/X AI       | [grok.md](/integrations/grok)                       | Grok model integration                                     |
| Hololand        | [hololand.md](/integrations/hololand)               | Hololand platform deployment                               |
| AI Architecture | [ai-architecture.md](/integrations/ai-architecture) | System architecture for AI integration                     |
| AI Use Cases    | [ai-use-cases.md](/integrations/ai-use-cases)       | Industry use cases with AI                                 |
| Python Bindings | [python-bindings](/guides/python-bindings)          | Use HoloScript from Python                                 |
| Partner SDK     | Partner SDK                                         | Webhooks, analytics, and partner APIs                      |

## MCP Server (AI Integration)

The HoloScript MCP Server provides **34 tools** for AI assistants:

```bash
# Install globally
npm install -g @holoscript/mcp-server

# Add to Claude Desktop
{
  "mcpServers": {
    "holoscript": {
      "command": "holoscript-mcp"
    }
  }
}
```

See [MCP Server Guide](/guides/mcp-server) for full setup.

## Hololand Platform

HoloScript is the application layer for [Hololand](https://github.com/brianonbased-dev/Hololand), an optional deployment platform that provides:

- Hosting and CDN
- Brittney AI assistant (generates HoloScript from voice/text)
- Additional platform adapters

See [Hololand Integration Guide](/integrations/hololand) for details.
