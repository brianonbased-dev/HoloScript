---
'@holoscript/framework': major
---

BREAKING: the `HOLOSCRIPT_API_KEY` fallback is removed. The HoloScript MCP key is now read only from `HOLOSCRIPT_MCP_API_KEY` (trimmed; whitespace-only counts as unset), with no alias.

Migration: Set HOLOSCRIPT_MCP_API_KEY instead; there is no fallback.

The absorb scanner, `DEFAULT_MCP_CONFIG` and `Layer3MCP` use the new name; `Layer3MCP` refuses before any request when the key is empty, and its HTTP errors report the numeric status only.

Missing-key error text: "HoloScript tools are off because HOLOSCRIPT_MCP_API_KEY is not set. Set it (macOS/Linux: export HOLOSCRIPT_MCP_API_KEY=your-key; PowerShell: $env:HOLOSCRIPT_MCP_API_KEY="your-key") and restart."
