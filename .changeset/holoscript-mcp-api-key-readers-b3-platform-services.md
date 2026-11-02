---
'@hololand/platform-services': major
---

BREAKING: the `HOLOSCRIPT_API_KEY` fallback is removed. The HoloScript MCP key is now read only from `HOLOSCRIPT_MCP_API_KEY` (trimmed; whitespace-only counts as unset), with no alias.

Migration: Set HOLOSCRIPT_MCP_API_KEY instead; there is no fallback.

The headset-share relay reads `options.apiKey`, then `HOLOSCRIPT_MCP_API_KEY`, then `HOLOMESH_API_KEY` (a separate credential, kept). Upload errors carry the status only.

Missing-key error text: "HoloScript tools are off because HOLOSCRIPT_MCP_API_KEY is not set. Set it (macOS/Linux: export HOLOSCRIPT_MCP_API_KEY=your-key; PowerShell: $env:HOLOSCRIPT_MCP_API_KEY="your-key") and restart."
