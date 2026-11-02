---
'@holoscript/absorb-service': major
---

BREAKING: the `HOLOSCRIPT_API_KEY` fallback is removed. The HoloScript MCP key is now read only from `HOLOSCRIPT_MCP_API_KEY` (trimmed; whitespace-only counts as unset), with no alias.

Migration: Set HOLOSCRIPT_MCP_API_KEY instead; there is no fallback.

`run-self-improve` uses `BRITTNEY_FLEET_RESOLVE_KEY`, then `HOLOSCRIPT_MCP_API_KEY`, and refuses `/serve/resolve` without one. LLM errors carry the HTTP status only.

Missing-key error text: "HoloScript tools are off because HOLOSCRIPT_MCP_API_KEY is not set. Set it (macOS/Linux: export HOLOSCRIPT_MCP_API_KEY=your-key; PowerShell: $env:HOLOSCRIPT_MCP_API_KEY="your-key") and restart."
