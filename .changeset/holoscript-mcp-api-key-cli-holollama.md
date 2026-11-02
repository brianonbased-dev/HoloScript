---
'@holoscript/cli': minor
'@holoscript/holollama': minor
---

`HOLOSCRIPT_MCP_API_KEY` is now the MCP key name. A whitespace-only value counts as unset.

- `@holoscript/cli` (`holoscript setup-mcp`): `HOLOSCRIPT_API_KEY` is deprecated. If `HOLOSCRIPT_MCP_API_KEY` is set it wins; otherwise `HOLOSCRIPT_API_KEY` still works and prints a warning on stderr naming the variable (never its value). The alias will be removed in a later 9.0 (breaking). With neither set, `setup-mcp` exits 1 with an error naming `HOLOSCRIPT_MCP_API_KEY`. The existing `setup-mcp <key>` argument still works, but the env var is preferred.
- `@holoscript/holollama`: read-only bridge receipts now default `apiKeyEnv` to `HOLOSCRIPT_MCP_API_KEY` (override with `--api-key-env`), and the ai-ecosystem-basic `.env.example` lists only `HOLOSCRIPT_MCP_API_KEY`. No alias.
- The in-repo `generate_with_brittney` script reads `HOLOSCRIPT_MCP_API_KEY` only and exits 1 before any request when it is unset.

Move your key to `HOLOSCRIPT_MCP_API_KEY`.
