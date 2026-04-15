# HoloDoor (agents) — security guardrails

**HoloDoor** is the in-house replacement for Corridor in this ecosystem: policy files, Claude Code hooks, MCP config validation, optional telemetry to HoloMesh, and team-scoped policy HTTP routes on the HoloScript MCP server.

## Where it lives

- **Source of truth:** the [ai-ecosystem](https://github.com/holoscript/ai-ecosystem) repository (`hooks/holodoor/`, `hooks/lib/holodoor-*.mjs`, `.holodoor/policy.json`).
- **Operator docs:** [HoloDoor README](https://github.com/holoscript/ai-ecosystem/blob/main/hooks/holodoor/README.md) (paths may be under `hooks/holodoor/README.md` in that repo).

## What agents should do

1. Respect **`.holodoor/policy.json`** in the repo (and stricter team policy from HoloMesh when applicable).
2. Do **not** rely on Corridor MCP; do not expect a `corridor` MCP server.
3. For static MCP config checks, run from the ai-ecosystem clone: `npm run holodoor -- validate [path-to-mcp.json]`.
4. Outline a short **plan** before large edits; HoloDoor does not require a separate “plan analysis” MCP tool.

## HoloMesh API (when deployed)

See ai-ecosystem `docs/api/OPENAPI_EXAMPLES.md` (HoloDoor section): `GET/PATCH .../holodoor/policy`, `POST .../holodoor/events`.

## Historical note

Older docs referenced [Corridor MCP](./corridor-mcp.md) for the same intent; that path is deprecated in favor of this document.
