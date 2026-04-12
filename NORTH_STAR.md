# North Star -- HoloScript

**Role**: Core platform. Language, compilers, traits, MCP server, Studio, renderer.
**Upstream oracle**: `~/.ai-ecosystem/NORTH_STAR.md` (read that for decision trees, workflow patterns, cost thresholds)
**Vault**: `D:/GOLD/` when mounted (Diamond > Platinum > GOLD > knowledge store)

## This project's rules

1. **This is the center.** When in doubt about which repo, it's this one.
2. **Strict TypeScript.** No `any` (use `unknown`). No implicit returns.
3. **dist/index.d.ts is hand-crafted** via `generate-types.mjs` -- not tsc.
4. **Never hardcode domain vocabulary into core.** Plugins are data, not code.
5. **Simulation-first.** Digital twin before physical twin. Every feature.
6. **Sovereign > bridge.** New capabilities go in sovereign compilers only.
7. **Commit to main.** All agents, all changes. Pre-commit hook is the gate.
8. **Stage explicitly.** `git add <file>`, never `git add -A` or `git add .`

## Key paths

- `packages/core/` -- AST, compilers, traits, identity, physics
- `packages/mcp-server/` -- MCP tools + REST + JSON-RPC
- `packages/engine/` -- runtime, GPU compute
- `packages/studio/` -- Next.js universal entry point
- `packages/r3f-renderer/` -- React Three Fiber components
- `packages/plugins/` -- domain plugins (robotics, medical, scientific)

## What to check before asking the user

1. Codebase question? `holo_query_codebase` / `holo_ask_codebase`
2. Architecture question? Read `~/.ai-ecosystem/NORTH_STAR.md` decision trees
3. Hardware target? Read `~/.claude/NORTH_STAR_HARDWARE.md`
4. Still stuck? Make the conservative choice, note what you decided
