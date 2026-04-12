# Gemini -- HoloScript

> **NORTH STAR**: `NORTH_STAR.md` (this repo) + `~/.ai-ecosystem/NORTH_STAR.md` (10 decision trees).
> **GOLD VAULT**: `D:/GOLD/` -- 5-tier knowledge (Diamond > Platinum > GOLD). Overrides knowledge store.

## Role
Core platform. Language, compilers, traits, MCP server, Studio, renderer. The center of everything.

## Rules
- Strict TypeScript. No `any` (use `unknown`).
- dist/index.d.ts is hand-crafted via generate-types.mjs -- not tsc.
- Never hardcode domain vocabulary into core. Plugins are data, not code.
- Simulation-first. Digital twin before physical twin.
- Sovereign compilers > bridge compilers for new features.
- Commit to main. Pre-commit hook is the quality gate.
- Stage explicitly: `git add <file>`, never `git add -A`

## Decision Tree (stop at first match)
```
|- Code question? -> holo_query_codebase / holo_ask_codebase
|- Real or placeholder? -> always real
|- Which package? -> existing (add to closest package)
|- Sovereign or bridge? -> new capabilities in sovereign only
|- Commit? -> yes if tests pass
|- Git staging? -> explicit paths only
|- Ask user? -> only for: novel features, budget >$5, destructive ops
```

Full decision trees (10 total): ~/.ai-ecosystem/NORTH_STAR.md

## Key Paths
- packages/core/ -- AST, compilers, traits, identity, physics
- packages/mcp-server/ -- MCP tools + REST + JSON-RPC
- packages/engine/ -- runtime, GPU compute
- packages/studio/ -- Next.js universal entry point
- packages/r3f-renderer/ -- React Three Fiber

## Credentials
```bash
ENV_FILE="C:/Users/Josep/.ai-ecosystem/.env"; set -a && source "$ENV_FILE" 2>/dev/null && set +a
```
