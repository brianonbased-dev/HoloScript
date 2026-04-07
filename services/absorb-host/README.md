# absorb-service (host)

This folder is the deployable API/MCP host for Absorb (`absorb.holoscript.net`).

## Why this exists next to `packages/absorb-service`

The monorepo intentionally splits Absorb into two layers:

- `packages/absorb-service`: canonical engine/domain logic (scanner, graph, embeddings, credits, pipeline, MCP tool definitions)
- `services/absorb-service`: runtime host (Express routes, auth, webhooks, DB wiring, process lifecycle, deployment config)

## No-duplication contract

To prevent drift between the two folders:

1. Put all reusable Absorb logic in `packages/absorb-service`
2. Keep this service thin (routing, middleware, deployment wiring)
3. If logic is duplicated here, move it into `packages/absorb-service` and import it back

## Quick pointers

- Server entrypoint: `src/server.ts`
- MCP transport handler: `src/mcp-handler.ts`
- Runtime routes: `src/routes/*`
- Package consumed by this service: `@holoscript/absorb-service`

## Local run

- `pnpm --filter absorb-service dev` (service)
- `pnpm --filter @holoscript/absorb-service build` (package)
