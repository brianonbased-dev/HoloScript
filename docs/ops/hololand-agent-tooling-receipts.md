# HoloLand Agent Tooling Receipts

Date: 2026-05-07
Board task: `task_1778186605462_yrbd`

## Fixes

- Root `pnpm exec holoscript` now resolves the workspace CLI before the global npm binary by declaring `@holoscript/cli` at the repo root.
- The CLI now exposes explicit `graph-status` and `impact-analysis` commands backed by `@holoscript/absorb-service/mcp`.
- `suggest` and `generate` use `getDefaultAIAdapter` from `@holoscript/framework/ai`, the canonical export, instead of the stale `@holoscript/core` path.

## Command Receipts

| Route | Command | Receipt |
| --- | --- | --- |
| Local bin resolution | `pnpm exec where.exe holoscript` | `node_modules\.bin\holoscript` and `.CMD` appear before `AppData\Roaming\npm\holoscript`. |
| Help | `pnpm exec holoscript --help` | Prints `HoloScript CLI v7.0.0+46290210a` and lists `graph-status` plus `impact-analysis`. |
| Graph status | `pnpm exec holoscript graph-status --json` | JSON response with `graphRAGReady: true`, fresh disk cache, and cache stats. |
| Suggest | `pnpm exec holoscript suggest "glowing grabbable platform" --json` | Returns `grabbable`, `glowing`, and `collidable` traits. |
| Generate | `pnpm exec holoscript generate "red button" --json` | Returns local HoloScript object code with clickable, hoverable, glowing red button traits. |
| Validate | `pnpm exec holoscript validate examples\lotus-flower\garden.holo` | Validation passed with 2 non-fatal warnings. |
| Compile | `pnpm exec holoscript compile examples\lotus-flower\garden.holo --target threejs -o $env:TEMP\holoscript-cli-receipt-garden.js` | Compilation successful; wrote a 16005-character Three.js output file. |
| Impact analysis | `pnpm exec holoscript impact-analysis "args.ts" --dir packages\cli\src --json` | Absorbed 104 TypeScript files, 2257 symbols, 11270 calls; impact affected 1 file. |
| Direct MCP | `node -e "import('./packages/absorb-service/dist/mcp/index.js').then(async m=>{const r=await m.handleCodebaseTool('holo_graph_status',{}); console.log(JSON.stringify({graphRAGReady:r.graphRAGReady, fresh:r.diskCache?.fresh, totalFiles:r.diskCache?.stats?.totalFiles}, null, 2));}).finally(()=>process.exit(0))"` | Prints `graphRAGReady: true`, `fresh: true`, `totalFiles: 104`. |

## Validation

- `pnpm install --prefer-offline --frozen-lockfile` passed.
- Build chain passed for `@holoscript/llm-provider`, `@holoscript/config`, `@holoscript/framework`, `@holoscript/crdt-spatial`, `@holoscript/snn-webgpu`, `@holoscript/uaal`, `@holoscript/engine`, `@holoscript/mesh`, `@holoscript/core`, `@holoscript/absorb-service`, `@holoscript/platform`, `@holoscript/sdk`, and `@holoscript/cli`.
- `pnpm --filter @holoscript/cli test -- src/__tests__/args-agent-tools.test.ts` passed with 2 tests.
