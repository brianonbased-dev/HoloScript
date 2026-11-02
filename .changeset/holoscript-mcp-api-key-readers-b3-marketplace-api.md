---
'@holoscript/marketplace-api': major
---

BREAKING: the `HOLOSCRIPT_API_KEY` fallback is removed. The HoloScript MCP key is now read only from `HOLOSCRIPT_MCP_API_KEY` (trimmed; whitespace-only counts as unset), with no alias.

Migration: Set HOLOSCRIPT_MCP_API_KEY instead; there is no fallback.

`McpProtocolPublisher` does not call out without a key and keeps no response body on failure (`raw: null`).

Missing-key error text: "HoloScript tools are off because HOLOSCRIPT_MCP_API_KEY is not set. Set it (macOS/Linux: export HOLOSCRIPT_MCP_API_KEY=your-key; PowerShell: $env:HOLOSCRIPT_MCP_API_KEY="your-key") and restart."
