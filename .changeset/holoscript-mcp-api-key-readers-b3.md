---
'@holoscript/studio-ui-graph': minor
'@holoscript/holomesh-web': minor
'@holoscript/connector-github': minor
---

Private packages: the HoloScript MCP key is now read only from `HOLOSCRIPT_MCP_API_KEY` (trimmed; whitespace-only counts as unset); `HOLOSCRIPT_API_KEY` is no longer read.

- `studio-ui-graph`: publish/CLI.
- `holomesh-web`: the sim push route (fails closed with 503 when no token is configured; constant-time token compare) and sim store.
- `connector-github`: validation. If you copied the old `holoscript-agentic.yml` or `holoscript-ci.yml` workflow templates, rename your repo secret `HOLOSCRIPT_API_KEY` to `HOLOSCRIPT_MCP_API_KEY` (the templates now read the new name).

Missing-key error text: "HoloScript tools are off because HOLOSCRIPT_MCP_API_KEY is not set. Set it (macOS/Linux: export HOLOSCRIPT_MCP_API_KEY=your-key; PowerShell: $env:HOLOSCRIPT_MCP_API_KEY="your-key") and restart."
