# Gemini -- HoloScript

> **NORTH STAR**: read `NORTH_STAR.md` in this repo for HoloScript-specific
> decisions. Private fleet, GOLD, and local credential routing live in
> `.ai-ecosystem`, not in this public repo.

## Role

Core platform. Language, compilers, traits, MCP server, Studio, renderer. The center of everything.

> **Any family, one substrate.** Build with HoloScript through the shared MCP surface — the same for every family (Claude/Codex/Copilot/Grok/Gemini). Consume and verify the ecosystem surface before recreating a family-native substitute. See `AGENT_INTERFACE.md` Key Principles + ai-ecosystem `INTENT.md` §3a.

## HoloScript Code Generation (MANDATORY)

**NEVER handwrite `.holo`, `.hsplus`, or `.hs` files directly.** Always use the MCP tool chain:

```text
1. suggest_traits({ description: "..." })
2. generate_object / generate_scene({ description, traits })
3. validate_holoscript({ code })
```

If MCP is unavailable: diagnose → start server → retry. If still down, **skip generation and notify** — do not hand-code. There is no CLI fallback for `suggest_traits` or `generate_*`.

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

For ecosystem-wide decisions, use the current `.ai-ecosystem` contract available
in the local harness.

## Key Paths

- packages/core/ -- AST, compilers, traits, identity, physics
- packages/mcp-server/ -- MCP tools + REST + JSON-RPC
- packages/engine/ -- runtime, GPU compute
- packages/studio/ -- Next.js universal entry point
- packages/r3f-renderer/ -- React Three Fiber

## Credentials

Do not copy local `.env` paths or secrets into this file. Use the harness or the
private `.ai-ecosystem` contract to resolve credentials, then call HoloScript
through MCP or the documented public endpoints.
