# Corridor MCP (agents)

Some workspace rules ask agents to run **Corridor** before coding. In Cursor, that only works if the **Corridor MCP server** is registered so `call_mcp_tool` (or the Composer MCP list) exposes a server named `corridor`.

## What we saw locally

- **Symptom:** `call_mcp_tool` with `server: "corridor"` returns **MCP server does not exist** and the Cursor project `mcps/` folder has **no** `corridor` descriptors.
- **Cause:** User-level **`%USERPROFILE%\.cursor\mcp.json`** (or project **`.cursor/mcp.json`**) did not define a `corridor` entry—only other servers (e.g. HoloScript remotes).

## How to enable (official)

1. **Corridor account** and GitHub connection: [app.corridor.dev](https://app.corridor.dev/) — see [Quickstart](https://docs.corridor.dev/getting-started/quickstart).
2. **Cursor / VS Code:** install the **Corridor** extension from the marketplace; sign in; the extension can **auto-configure** MCP for supported setups — see [VS Code / Cursor setup](https://docs.corridor.dev/ide-setup/vscode-cursor).
3. **Custom MCP (any client):** create an API token in [Corridor settings](https://app.corridor.dev/settings), then add to **`mcpServers`** (user `~/.cursor/mcp.json` or project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "corridor": {
      "transport": "http",
      "url": "https://app.corridor.dev/api/mcp?token=YOUR_TOKEN_HERE"
    }
  }
}
```

Replace `YOUR_TOKEN_HERE` with the token from settings. Full detail: [Custom MCP servers](https://docs.corridor.dev/ide-setup/custom-mcp-servers).

## Verify

After reload, Corridor tools should appear under MCP in Cursor. If rules still fail, confirm the server id is exactly **`corridor`** (lowercase) to match rule / skill text.

## Doc index

Corridor publishes an LLM index at [https://docs.corridor.dev/llms.txt](https://docs.corridor.dev/llms.txt) for discovering other pages.
