# Connect External Clients

**One way to link any outside service — Claude Desktop, Claude Code, Cursor, VS Code, Windsurf, Zed, or your own agent — to the HoloScript ecosystem.**

The HoloScript MCP (Model Context Protocol) server exposes the entire ecosystem
tool surface — parse, validate, generate, compile to every target, codebase
intelligence, mesh coordination, x402 settlement — to any MCP-capable client.
This page is the **single source of truth** for connecting one. The config
snippets below are generated from `scripts/connect.mjs`, so they can't drift out
of sync with the live server.

## The connection model (read this once)

| Fact      | Value                                                                                     |
| --------- | ----------------------------------------------------------------------------------------- |
| Endpoint  | `https://mcp.holoscript.net/mcp`                                                          |
| Transport | **Streamable HTTP** (classic SSE is off)                                                  |
| Discovery | `https://mcp.holoscript.net/.well-known/mcp.json` (public, no auth)                       |
| Health    | `https://mcp.holoscript.net/health` (public — live tool count + version)                  |
| Auth      | `Authorization: Bearer <token>` — OAuth 2.1 access token or a production-valid tenant key |

There are two ways a client reaches the server:

1. **Native remote (Streamable HTTP)** — the client connects to the URL
   directly. Used by Cursor, VS Code (Copilot agent mode), Windsurf, Claude
   Code, and most modern agent frameworks.
2. **stdio bridge (`mcp-remote`)** — stdio-only clients (e.g. Claude Desktop's
   config file, Zed) launch the tiny `mcp-remote` npm package, which bridges
   their stdio transport to the hosted HTTP endpoint. No global install — `npx`
   fetches it on demand.

> **Why this guide exists:** connection snippets used to live in four different
> docs in three incompatible shapes. They now all render from one generator, so
> "the config that's in the docs" and "the config that actually works" are the
> same thing.

## Generate your config

The fastest path — let the generator emit the exact snippet for your client:

```bash
# from the HoloScript repo root
node scripts/connect.mjs list                  # see every supported client
node scripts/connect.mjs cursor                # config for one client
node scripts/connect.mjs claude-desktop        # …
node scripts/connect.mjs all                   # every client at once

# options
node scripts/connect.mjs cursor --token=eyJ... # inline a real bearer token
node scripts/connect.mjs cursor --local        # local stdio install instead of hosted
node scripts/connect.mjs cursor --no-auth      # public discovery / read-only only
node scripts/connect.mjs all --json            # machine-readable, pipe-friendly
```

Or run it through pnpm: `pnpm connect cursor`.

The sections below are what the generator produces. Pick your client, paste the
snippet, restart the client.

## Clients

### Claude Desktop

Settings → Developer → Edit Config (`claude_desktop_config.json`). The config
file is stdio-only, so it reaches the hosted server through `mcp-remote`:

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

Restart Claude Desktop after saving. **Pro/Max users** can skip the file entirely
and paste `https://mcp.holoscript.net/mcp` under **Settings → Connectors**.

### Claude Code (CLI)

One command — no file editing:

```bash
claude mcp add --transport http holoscript https://mcp.holoscript.net/mcp \
  --header "Authorization: Bearer ${HOLOSCRIPT_MCP_ACCESS_TOKEN}"
```

Add `--scope project` to share it via a committed `.mcp.json`, or `--scope user`
to make it available in all your repos.

### Cursor

`.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global). Cursor speaks
remote Streamable HTTP natively:

```json
{
  "mcpServers": {
    "holoscript": {
      "url": "https://mcp.holoscript.net/mcp",
      "headers": {
        "Authorization": "Bearer ${HOLOSCRIPT_MCP_ACCESS_TOKEN}"
      }
    }
  }
}
```

Cursor also reads `.vscode/mcp.json`. Restart the MCP panel after saving. Deeper
walkthrough: [cursor-holoscript.md](./cursor-holoscript.md).

### VS Code (GitHub Copilot, agent mode)

`.vscode/mcp.json` (workspace). Note VS Code uses `servers` and a required
`type` field:

```json
{
  "servers": {
    "holoscript": {
      "type": "http",
      "url": "https://mcp.holoscript.net/mcp",
      "headers": {
        "Authorization": "Bearer ${HOLOSCRIPT_MCP_ACCESS_TOKEN}"
      }
    }
  }
}
```

Requires Copilot agent mode. More: [vscode.md](./vscode.md).

### Windsurf (Codeium)

`~/.codeium/windsurf/mcp_config.json`. Windsurf uses `serverUrl` for remote
servers:

```json
{
  "mcpServers": {
    "holoscript": {
      "serverUrl": "https://mcp.holoscript.net/mcp",
      "headers": {
        "Authorization": "Bearer ${HOLOSCRIPT_MCP_ACCESS_TOKEN}"
      }
    }
  }
}
```

Hit the refresh icon in the Cascade MCP panel after saving.

### Zed

`settings.json` (Zed → Settings). Zed launches MCP servers as a command, so it
uses the `mcp-remote` bridge:

```json
{
  "context_servers": {
    "holoscript": {
      "command": {
        "path": "npx",
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
}
```

### Any other MCP client

- **Remote (Streamable HTTP) clients** — CrewAI, LangGraph, custom agents:
  point them at `https://mcp.holoscript.net/mcp` with the `Authorization`
  header. `node scripts/connect.mjs generic-http`.
- **stdio-only clients** — wrap the endpoint with `mcp-remote`:
  `node scripts/connect.mjs generic-stdio`.

See [agent-mcp-quickstart.md](./agent-mcp-quickstart.md) for framework code
examples (CrewAI, LangGraph).

## Authentication

Pick whichever fits your surface:

- **Personal / dev token** — a long-lived `HOLOSCRIPT_MCP_ACCESS_TOKEN` from your
  HoloScript dashboard or `.env`. Drop it in the `Authorization` header.
- **OAuth 2.1 (recommended for tools that support it)** — the server advertises
  its OAuth config at the discovery URL; clients that support dynamic client
  registration can self-provision. To mint a short-lived token without a UI:

  ```bash
  pnpm --filter @holoscript/mcp-server smoke:auth
  ```

  That registers an OAuth client, exchanges it via `client_credentials`, and
  confirms `tools/list` works with the bearer token.

- **Public discovery only** — omit the header (`--no-auth`) for read-only health
  and tool listing. No tool execution.

## Local install (offline / air-gapped)

Prefer running the server yourself instead of hitting the hosted endpoint? Pass
`--local` to any client to get a stdio config that runs the published package:

```bash
node scripts/connect.mjs claude-desktop --local
```

```json
{
  "mcpServers": {
    "holoscript": { "command": "npx", "args": ["-y", "@holoscript/mcp-server"] }
  }
}
```

## Verify the connection

```bash
# 1. Is the server up? (also prints the live tool count + version)
curl https://mcp.holoscript.net/health

# 2. In your client's chat, ask:
#    "@holoscript list available compilers"
#    You should get the live target list (babylon, threejs, unity, unreal, …).
```

## Trigger CI from your client

Once connected, a client can also kick a HoloCI run via the `holo_ci_dispatch`
tool — useful for validating a commit without a credentialed local seat. The
orchestrator key stays server-side; your Bearer token is enough.

The tool is **safe-by-default**: a call previews the workload and spends nothing
unless you explicitly pass `dryRun: false`, which submits to the GPU fleet and
incurs real spend.

```jsonc
// preview the gates with no spend (default — dryRun is true unless set false):
{ "name": "holo_ci_dispatch", "arguments": { "sha": "<40-hex>", "profile": "full" } }
// actually dispatch the full run (real GPU spend — explicit opt-in):
{ "name": "holo_ci_dispatch", "arguments": { "sha": "<40-hex>", "profile": "full", "dryRun": false } }
```

## Troubleshooting

| Symptom                             | Fix                                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| "MCP server not responding"         | Open `https://mcp.holoscript.net/health` in a browser. Restart the client.                                      |
| `401` / auth errors                 | Confirm the bearer token has the `mcp` / `tools:read` scope. Re-run `smoke:auth` for a fresh one.               |
| "Unknown tool"                      | Server may have rolled. Ask the client to refresh its tool manifest (`@holoscript list tools`).                 |
| Slow first response                 | First call warms the compiler cache; later calls are fast.                                                      |
| Client won't read native remote URL | Use the `mcp-remote` bridge variant: `node scripts/connect.mjs <client>` (Claude Desktop / Zed already use it). |
| Cursor ignores `.cursor/mcp.json`   | Put it in `.vscode/mcp.json` instead — Cursor falls back to it.                                                 |

## See also

- [MCP Server Guide](./mcp-server.md) — full server reference, local install
- [Cursor Quickstart](./cursor-holoscript.md) — Cursor deep-dive
- [Agent MCP Quickstart](./agent-mcp-quickstart.md) — CrewAI / LangGraph examples
- [VS Code](./vscode.md) — Copilot setup
- Source of truth: `scripts/connect.mjs` (run `--self-test` to validate)
