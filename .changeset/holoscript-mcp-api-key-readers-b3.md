---
'@holoscript/config': minor
'@holoscript/framework': minor
'@holoscript/absorb-service': minor
'@hololand/platform-services': minor
'@holoscript/marketplace-api': minor
'@holoscript/studio-ui-graph': minor
'@holoscript/holomesh-web': minor
'@holoscript/connector-github': minor
---

BREAKING: the HoloScript MCP key is now read only from `HOLOSCRIPT_MCP_API_KEY` (trimmed; whitespace-only counts as unset). `HOLOSCRIPT_API_KEY` and `MCP_API_KEY` are no longer read, with no alias or fallback. Rename the variable before upgrading.

- `@holoscript/config`: `getMcpApiKey`/`getMcpApiKeyAsync` read only the new name; new exports `MCP_API_KEY_ENV`, `MISSING_MCP_API_KEY_ERROR`, `requireMcpApiKey`. `mcpAuthHeaders` returns `{}` when no key is set. OAuth token errors report the HTTP status only (no body), and a non-JSON token reply throws a fixed message. `REQUIRED_VARS` now lists `HOLOSCRIPT_MCP_API_KEY`, and `validateConfig` treats whitespace-only values as missing.
- `@holoscript/framework`: the absorb scanner, `DEFAULT_MCP_CONFIG` and `Layer3MCP` use the new name; `Layer3MCP` refuses before any request when the key is empty.
- `@holoscript/absorb-service`: `run-self-improve` uses `BRITTNEY_FLEET_RESOLVE_KEY`, then `HOLOSCRIPT_MCP_API_KEY`, and refuses `/serve/resolve` without one. LLM errors carry the HTTP status only.
- `@hololand/platform-services`: the headset-share relay reads `options.apiKey`, then `HOLOSCRIPT_MCP_API_KEY`, then `HOLOMESH_API_KEY` (a separate credential, kept). Upload errors carry the status only.
- `@holoscript/marketplace-api`: `McpProtocolPublisher` does not call out without a key and keeps no response body on failure (`raw: null`).
- Private packages: `studio-ui-graph` publish/CLI, the `holomesh-web` sim push route (fails closed with 503 when no token is configured) and sim store, and `connector-github` validation. `connector-github`: if you copied the old `holoscript-agentic.yml` or `holoscript-ci.yml` workflow templates, rename your repo secret `HOLOSCRIPT_API_KEY` to `HOLOSCRIPT_MCP_API_KEY` (the templates now read the new name).

Missing-key error text: "HoloScript tools are off because HOLOSCRIPT_MCP_API_KEY is not set. Set it (macOS/Linux: export HOLOSCRIPT_MCP_API_KEY=your-key; PowerShell: $env:HOLOSCRIPT_MCP_API_KEY="your-key") and restart."
