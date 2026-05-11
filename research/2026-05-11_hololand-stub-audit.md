# HoloLand Stub Package Audit — D.040 Pre-Condition

> Date: 2026-05-11
> Auditor: claude1
> Scope: `@hololand/*` packages in `HoloScript` monorepo
> Task: `task_1778460967995_m7xr`

## Executive Summary

**Pre-condition status: NOT MET.**

Only **1 of the expected `@hololand/*` packages** exists in the `HoloScript` monorepo. The remaining expected packages are **completely missing** (no directory, no `package.json`, no source).

## Liveness Findings

### Live Package (1)

| Package | Directory | Typecheck | Tests | Build | Docs |
|---------|-----------|-----------|-------|-------|------|
| `@hololand/react-agent-sdk` | `packages/react-agent-sdk/` | ✅ clean | ✅ 11/11 pass | `tsup` configured | README, Storybook, examples |

**Verdict: LIVE.** Fully scaffolded with source (`src/`), tests (`src/__tests__/`), build pipeline, type declarations, Storybook stories, and migration guides. No gaps.

### Missing Packages (expected per docs, not exhaustive)

Sources: `.claude/settings.local.json` build commands + `docs/guides/FEATURE_MIGRATION.md` migration targets.

| Package | Expected Location | Status |
|---------|-----------------|--------|
| `@hololand/playcanvas-adapter` | `packages/playcanvas-adapter/` | ❌ Missing |
| `@hololand/babylon-adapter` | `packages/babylon-adapter/` | ❌ Missing |
| `@hololand/vrchat-export` | `packages/vrchat-export/` | ❌ Missing |
| `@hololand/brittney-service` | `packages/brittney-service/` | ❌ Missing |
| `@hololand/accessibility` | `packages/accessibility/` | ❌ Missing |
| `@hololand/audio` | `packages/audio/` | ❌ Missing |
| `@hololand/voice` | `packages/voice/` | ❌ Missing |
| `@hololand/network` | `packages/network/` | ❌ Missing |
| `@hololand/renderer` | `packages/renderer/` | ❌ Missing |
| `@hololand/lod` | `packages/lod/` | ❌ Missing |
| `@hololand/streaming` | `packages/streaming/` | ❌ Missing |
| `@hololand/world` | `packages/world/` | ❌ Missing |
| `@hololand/animation` | `packages/animation/` | ❌ Missing |
| `@hololand/haptics` | `packages/haptics/` | ❌ Missing |
| `@hololand/navigation` | `packages/navigation/` | ❌ Missing |
| `@hololand/portals` | `packages/portals/` | ❌ Missing |
| `@hololand/pcg` | `packages/pcg/` | ❌ Missing |
| `@hololand/ai` | `packages/ai/` | ❌ Missing |
| `@hololand/three-adapter` | `packages/three-adapter/` | ❌ Missing |
| `@hololand/unity-adapter` | `packages/unity-adapter/` | ❌ Missing |

**Verification method:**
1. `find packages/ -name package.json | xargs grep '"@hololand/'` → only `react-agent-sdk` matched.
2. `pnpm-workspace.yaml` contains no `@hololand/*` entries.
3. Root `package.json` workspaces: `packages/*` and `packages/plugins/*` — no `hololand` directories found.

## Recommendation

D.040 cannot proceed until the missing `@hololand/*` stub packages are scaffolded. A stub package in this repo is defined as:

- `package.json` with correct `@hololand/<name>` name
- `src/index.ts` with a minimal exported contract
- `__tests__/index.test.ts` with at least one smoke test
- `tsconfig.json` + `vitest.config.ts`
- Listed in `pnpm-workspace.yaml` (if applicable)

**Next action:** File a follow-up task to scaffold the missing 16+ stubs, or update the D.040 plan to acknowledge this dependency gap.
