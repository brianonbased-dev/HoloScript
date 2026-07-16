# Agent MCP Quickstart: HoloScript Language and Systems Tools

Connect any AI agent (Claude, Cursor, Windsurf, CrewAI) to the tool surface for the **HoloScript general-purpose semantic systems programming language**. Agents can parse, validate, run, inspect, and compile programs spanning services, agents, simulations, devices, spatial compositions, and economic protocols across registered backends. Discover the live tool and target inventory instead of copying counts.

## 1. Connect to the Hosted MCP Server

Most modern AI agents can connect to HoloScript tools via the hosted Model Context Protocol (MCP) server.

- **Discovery URL**: `https://mcp.holoscript.net/.well-known/mcp.json`
- **Hosted Endpoint**: `https://mcp.holoscript.net/mcp`
- **Authentication**: Requires `Authorization: Bearer <OAuth access_token>` for direct `POST /mcp` calls. Use OAuth discovery/registration when your MCP client supports it; legacy `HOLOSCRIPT_API_KEY`/tenant keys only work if they are provisioned in production.

> **Connecting a specific client?** See **[Connect External Clients](./connect-external-clients.md)**
> — the single source of truth for Claude Desktop, Cursor, VS Code, Windsurf,
> Zed, and generic configs (generated from `scripts/connect.mjs`, so they never
> drift). This page focuses on agent frameworks.
>
> **Running Claude Code as an internal HoloMesh worker?** Use
> **[Claude Code Agent Quickstart](./claude-code-agent-quickstart.md)** for the
> MCP + Absorb + board-claim + validation closeout loop.

### Example: Claude Desktop / AI IDE Configuration

Claude Desktop's config file is stdio-only, so it reaches the hosted server
through the `mcp-remote` bridge. Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "holoscript": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://mcp.holoscript.net/mcp",
        "--header",
        "Authorization: Bearer ${HOLOSCRIPT_MCP_ACCESS_TOKEN}"
      ]
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

- **`parse_hs` / `parse_holo`**: Understand semantic traits.
- **`generate_object`**: Text-to-HoloScript (HSPlus/Holo).
- **`compile_holoscript`**: Deploy to registered export targets; verify the live
  target inventory via `docs/NUMBERS.md`.
- **`x402_facilitator`**: Autonomous on-chain settlement for agent interactions.

---

**Ready to go?** Start exploring the [Trait Reference](../traits/index.md) or check the [System Status](https://mcp.holoscript.net/health).
