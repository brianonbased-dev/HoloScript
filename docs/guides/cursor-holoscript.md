# Cursor + HoloScript Quickstart

**Get HoloScript MCP + compiler working inside Cursor in under 60 seconds.**

Cursor (the AI-first code editor) supports the Model Context Protocol (MCP). Once wired, you can ask Cursor to generate, validate, or explain HoloScript directly in chat while it has full access to the live compilers and tools.

## 1. Add the HoloScript MCP Server

Create or edit `.cursor/mcp.json` (or `.vscode/mcp.json` — Cursor reads both) in your project root:

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

**Auth options (pick one):**

- **Personal / dev**: Use a long-lived `HOLOSCRIPT_MCP_ACCESS_TOKEN` from your HoloScript dashboard or `.env`.
- **Local hardware seat (recommended for grok1 / claude-code / etc.)**: The per-surface resolver (`hooks/lib/holomesh-env.mjs`) automatically picks the correct x402 bearer for your seat (`grok-hardware`, `claudecode`, etc.). Export `HOLOMESH_AGENT_SURFACE` if needed.
- **No token (public discovery only)**: Omit the header for read-only health + tool listing (limited).

Restart Cursor (or the MCP panel) after adding the config.

## 2. Verify It Works

Open Cursor chat and try:

```
@holoscript list available compilers
```

You should see the full live list (babylon, threejs, unity, unreal, vrchat, usdz, webgpu, snn-webgpu, etc.).

Then:

```
Compile this to Babylon and Three.js side-by-side:

composition "Demo Orb" {
  object "Orb" {
    @glowing
    @grabbable
    position: [0, 1.5, -3]
    color: "#8844ff"
  }
}
```

Cursor will call the real `compile_to_babylon` / `compile_to_threejs` tools and return the generated code.

## 3. First Real Compile (60-second time-to-wow)

1. Create a new file `demo.holo` in your project.
2. Paste a small composition.
3. In chat: `Use the HoloScript MCP to compile demo.holo to webgpu and give me the output + any errors.`
4. Cursor will use the live MCP server (no local install required).

## 4. Troubleshooting

| Symptom                        | Fix |
|--------------------------------|-----|
| "MCP server not responding"    | Check `https://mcp.holoscript.net/health` in a browser. Restart Cursor. |
| 401 / auth errors              | Verify the bearer token has `mcp` scope. For local seats, re-run the holomesh-env resolver. |
| "Unknown tool"                 | The server may have rolled; run `@holoscript list tools` to refresh the tool manifest. |
| Slow first response            | First call warms the compiler cache. Subsequent calls are fast. |
| Cursor ignores .cursor/mcp.json| Use `.vscode/mcp.json` instead (Cursor falls back). |

## 5. Recommended Workflow in Cursor

- Keep a `compositions/` folder with your `.holo` and `.hsplus` sources.
- Use Cursor chat for "generate a phone-sleeve VR experience with SNN head tracking".
- Let the MCP tools do the heavy lifting (validation, trait suggestion, cross-target compile).
- Export the best result with the normal `holoscript compile` CLI when you want a local artifact.

## See Also

- Full MCP Server Guide: [docs/guides/mcp-server.md](./mcp-server.md)
- VS Code / Copilot setup (nearly identical): same mcp.json pattern
- Babylon.js target deep-dive: [docs/compilers/babylon.md](../compilers/babylon.md)
- All compilers & targets: [docs/compilers/](../compilers/)

**Win condition**: Every Cursor user can author production HoloScript without ever leaving the IDE.

---

*Local farmable slice for task_1779307138688_gn00 — created by grok1-x402 (2026-05-20).*