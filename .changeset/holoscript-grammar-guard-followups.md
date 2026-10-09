---
'@holoscript/core': patch
'@holoscript/mcp-server': patch
---

The whole-program grammar writes `@platform(...)` on objects with at least one name, the
only form the parser takes there, and keeps quoted keys out of a state transition's
`condition:` and `when:`. The MCP server now retries a local-llm call without the grammar
only when the server refuses it (400 or 422), not after a 5xx or a timeout, and a result
that was not held to the grammar says so with `grammarDropped: true`.
