---
'@holoscript/config': major
---

BREAKING: the `HOLOSCRIPT_API_KEY` and `MCP_API_KEY` fallback is removed. The HoloScript MCP key is now read only from `HOLOSCRIPT_MCP_API_KEY` (trimmed; whitespace-only counts as unset), with no alias.

Migration: Set HOLOSCRIPT_MCP_API_KEY instead; there is no fallback.

`getMcpApiKey`/`getMcpApiKeyAsync` read only the new name; new exports `MCP_API_KEY_ENV`, `MISSING_MCP_API_KEY_ERROR`, `requireMcpApiKey`. `mcpAuthHeaders` returns `{}` when no key is set. OAuth token errors report the HTTP status only (no body), and a non-JSON token reply throws a fixed message. `REQUIRED_VARS` now lists `HOLOSCRIPT_MCP_API_KEY`, and `validateConfig` treats whitespace-only values as missing.

Missing-key error text: "HoloScript tools are off because HOLOSCRIPT_MCP_API_KEY is not set. Set it (macOS/Linux: export HOLOSCRIPT_MCP_API_KEY=your-key; PowerShell: $env:HOLOSCRIPT_MCP_API_KEY="your-key") and restart."
