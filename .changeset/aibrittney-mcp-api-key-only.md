---
'@holoscript/aibrittney': minor
---

BREAKING: aibrittney reads the MCP key from `HOLOSCRIPT_MCP_API_KEY` only. The `HOLOSCRIPT_API_KEY` and `MCP_API_KEY` fallbacks are gone, and a whitespace-only value counts as unset. With no key, tool calls send nothing and return an error naming `HOLOSCRIPT_MCP_API_KEY`. OAuth register/token errors now show only the HTTP status, never the server response body. Move your key to `HOLOSCRIPT_MCP_API_KEY`.
