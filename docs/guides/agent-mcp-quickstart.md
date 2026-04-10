# Agent MCP Quickstart: Spatial + Economic Superpowers in 60 Seconds

Give any AI agent (Claude, Cursor, Windsurf, CrewAI) spatial and economic superpowers on the **HoloScript AI-Native Spatial Operating System**. Agents can parse, validate, and generate **spatial compositions** and **economic protocols** across 32+ backend targets.

## 1. Connect to the Hosted MCP Server

Most modern AI agents can connect to HoloScript tools via the hosted Model Context Protocol (MCP) server.

- **Discovery URL**: `https://mcp.holoscript.net/.well-known/mcp.json`
- **Hosted Endpoint**: `https://mcp.holoscript.net/mcp`
- **Authentication**: Requires a valid `MCP_API_KEY` (or OAuth 2.1 token).

### Example: Claude Desktop / AI IDE Configuration

Add this to your `claude_desktop_config.json` or equivalent:

```json
{
  "mcpServers": {
    "holoscript": {
      "command": "npx",
      "args": ["-y", "@holoscript/mcp-server", "--remote", "https://mcp.holoscript.net/mcp"],
      "env": {
        "MCP_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

## 2. Framework One-Liners

### CrewAI / LangGraph

Use the standard MCP tool caller to give your swarm spatial-awareness:

```python
# CrewAI example
from crewai import Agent
from mcp_client import McpTool

holoscript_tool = McpTool(url="https://mcp.holoscript.net/mcp")

agent = Agent(
  role='Spatial Architect',
  goal='Design a persistent VR economy',
  tools=[holoscript_tool]
)
```

## 3. The "Aha!" Prompt

Once connected, try this prompt to see the multi-agent economy in action:

> "Use HoloScript MCP to generate a persistent multi-agent economy simulation. Include @grabbable objects that require a @credit trait (x402 payment gate) to interact with. Setup an escrow-based bounty for a 'treasure' object using the x402 facilitator."

## 4. Key Capabilities for Agents

- **`parse_hs` / `parse_holo`**: Understand 2,000+ semantic traits.
- **`generate_object`**: Text-to-HoloScript (HSPlus/Holo).
- **`compile_holoscript`**: Deploy to Unity, Unreal, Godot, WebGPU, and 23 others.
- **`x402_facilitator`**: Autonomous on-chain settlement for agent interactions.

---

**Ready to go?** Start exploring the [Trait Reference](../traits/index.md) or check the [System Status](https://mcp.holoscript.net/health).
