# Migration Notice

This package (`@holoscript/hololand-platform`) is **HoloLand domain code** that was
identified during the HoloScript-to-HoloLand boundary audit (commit `3118545b6`,
2026-05-12) as living in the wrong repository.

## Audit Finding

- **Location:** `HoloScript/packages/hololand-platform/`
- **Expected location:** `HoloLand/packages/platform/` (or equivalent)
- **Expected name:** `@hololand/platform`

## Modules affected

- `src/world/frontier-shard-zero.ts`
- `src/world/byzantineWorldConsensus.ts`
- `src/world/causal.ts`
- `src/creator/kiosk.ts` + `template-pipeline.ts`
- `src/device-lab/index.ts` + `cli.ts`
- `src/collaboration/blockoutCRDT.ts`
- `src/memory/affective.ts`

## Action required

Move this entire package to the HoloLand repo, rename the package to
`@hololand/platform`, update workspace references, and remove it from
`HoloScript/packages/hololand-platform/`.

**Do not add new HoloLand-specific features here.** Any new work should happen
in the HoloLand repo.
