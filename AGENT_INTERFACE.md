# Agent Interface — HoloScript Core Team

Shared operational contract for all agents (Claude, Copilot, Gemini, Cursor).
Per-LLM behavior lives in each agent's own config. This file covers what's identical.

## Team

Team **HoloScript Core** (`team_bfe0bd952f327631`).
Principal: **Josep (brianonbased-dev)** — Founder. All operations authorized.
Wallet: `0xc277ecc96b4fef62c0d00133c6dd95c40c16700d`

## Credentials

```bash
ENV_FILE="C:/Users/Josep/.ai-ecosystem/.env"
[ ! -f "$ENV_FILE" ] && ENV_FILE="/c/Users/Josep/.ai-ecosystem/.env"
set -a && source "$ENV_FILE" 2>/dev/null && set +a
```

| Key | Scope | In shell? |
|-----|-------|-----------|
| `HOLOSCRIPT_API_KEY` | Orchestrator + HoloScript MCP | Yes |
| `ABSORB_API_KEY` | Absorb service (admin tier) | Yes |
| `HOLOMESH_API_KEY` | Team board, knowledge, messages | No — source .env |
| `HOLOMESH_TEAM_ID` | `team_bfe0bd952f327631` | No — source .env |
| `ANTHROPIC_API_KEY` | LLM calls | No — source .env |
| `GITHUB_TOKEN` | GitHub API | No — source .env |

## Services

| Service | URL | Auth | Transport |
|---------|-----|------|-----------|
| HoloScript MCP | `mcp.holoscript.net` | `HOLOSCRIPT_API_KEY` | REST + MCP JSON-RPC (SSE broken on Railway) |
| Absorb | `absorb.holoscript.net` | `ABSORB_API_KEY` | REST only |
| Orchestrator | `mcp-orchestrator-production-45f9.up.railway.app` | `HOLOSCRIPT_API_KEY` | REST |
| HoloMesh API | `mcp.holoscript.net/api/holomesh` | `HOLOMESH_API_KEY` | REST |
| Studio | `studio-production-a071.up.railway.app` | none | Web |

## Git Workflow

**ALL AGENTS ARE LOCAL — COMMIT DIRECTLY TO MAIN.** No branches, no PRs.

1. Claim task
2. Do the work — commit to main (`git add <specific files>` only, NEVER `git add -A`)
3. Mark done with commit hash

Pre-commit hook (lint + secrets + deps) is the quality gate. Branches only for multi-day experimental work. Full rationale: `NORTH_STAR.md` lines 309-342.

## File Format Routing

```
Data pipelines / ETL / transforms    → .hs
Behaviors / traits / agents / IoT    → .hsplus
Compositions / scenes / dashboards   → .holo
CLI / parser / adapter / infra       → .ts (last resort)
```

## Decision Autonomy (all agents)

Decide, then tell the user what you decided and why. Stop at first match:

1. Code question? → Query codebase first (absorb, impact analysis)
2. Real or placeholder? → Always real. Never facade.
3. Which repo? → HoloScript (unless told otherwise)
4. New package or existing? → Existing (add to closest package)
5. Commit? → Yes if tests pass
6. Git staging? → Explicit paths only
7. Test failing? → Fix if yours, skip if pre-existing
8. Ask user? → Only for: novel features, budget >$5, destructive ops

## Key Principles

- **Simulation-first.** Digital twin before physical twin.
- **Runtime-first.** Compilers optimize, runtime always works.
- **Agents are the audience.** Docs, configs, and text exist for agents first.
- **GitHub is source of truth.** Servers are projections.
- **Wallets are identity.** API keys are sessions.
- **Numbers from live sources.** Never hardcode ecosystem counts.

## Codebase Intelligence

Before editing TypeScript, query the codebase:

| Tool / Endpoint | Purpose |
|-----------------|---------|
| `holo_graph_status` | Check graph cache freshness |
| `holo_absorb_repo` | Scan codebase (use cache if fresh) |
| `holo_query_codebase` | Callers, callees, imports, symbols |
| `holo_impact_analysis` | Blast radius for a change |
| `holo_ask_codebase` | Natural language Q&A (needs Ollama) |

REST fallback: `POST https://absorb.holoscript.net/api/query` with Bearer `$ABSORB_API_KEY`.

## Team Protocol

| Action | MCP Tool | REST Fallback |
|--------|----------|---------------|
| Heartbeat | `holomesh_heartbeat` | `POST .../team/:id/presence` |
| Board | `holomesh_board_list` | `GET .../team/:id/board` |
| Claim task | `holomesh_board_claim` | `PATCH .../team/:id/board/:taskId` |
| Complete | `holomesh_board_complete` | `PATCH .../team/:id/board/:taskId` |
| Contribute knowledge | `holomesh_contribute` | `POST .../team/:id/knowledge` |
| Send message | `holomesh_send_message` | `POST .../team/:id/messages` |
| Suggestions | `holomesh_suggest` | `POST .../team/:id/suggestions` |
| SSE room | — | `GET .../team/:id/room/live` |

## Coding Standards

- Strict TypeScript. No `any` (use `unknown`).
- `dist/index.d.ts` hand-crafted via `generate-types.mjs` — not `tsc`.
- JSX files need `.tsx` extension.
- Never commit secrets. Use `.env`.
- `vi.mock()` needs `vi.hoisted()`, `function(){}` for constructors.
- CompilerBase RBAC: all tests need mock + `'test-token'`.
- **Plan Completeness Gap Reporting**: Every technical plan MUST end with an honest "What Remains After This Plan" section that clearly lays out the real-world usability or feature gaps that are deliberately left unaddressed.

## Gotchas

- **G.IDE.001**: Use structural graph over regex for impact analysis
- **G.IDE.004**: Windows: use `curl.exe` not `curl` (PS alias breaks JSON)
- **G.ENV.16**: PS `>` writes UTF-16LE — use `Out-File -Encoding utf8`
- **G.CODE.15**: `TransformError` in refactors masks type errors — use `tsc --noEmit`
- **G.ARCH.18**: `saveState()` ≠ I/O — use `persistState()` for durability
- Never put ML in VR render loop (11.1ms budget @ 90Hz)
