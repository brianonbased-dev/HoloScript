# Brittney Tool Diet: Mode-Scoped Registry Verification

Date: 2026-06-21
Board task: task_1781123525299_4uhh

## Result

Brittney's default provider-facing tool surface is now mode-scoped for small-model turns:

- Scene prompts expose scene/editing tools, not board or workspace tools.
- Board/team prompts expose board/ecosystem tools, not scene tools.
- Workspace/repo prompts expose local workspace and codebase tools.
- CSV/data/mapping prompts expose data migration and target-selection tools.
- Each default mode list is capped at 11 direct tools; the route appends `find_tools`, so the provider sees at most 12 default tools.
- `find_tools` can still retrieve tools from the broader full catalog when enabled, avoiding the old "tool wall" without dumping the full registry into the first round.

This keeps the small local-model picker away from the historical full-registry failure while preserving workspace agency and board filing through explicit mode routing.

## Files

- `packages/studio/src/lib/brittney/toolTiers.ts`
- `packages/studio/src/app/api/brittney/route.ts`
- `packages/studio/src/lib/brittney/__tests__/toolTiers.test.ts`
- `packages/studio/src/app/api/brittney/write-through.test.ts`

## Historical Failure Evidence

Read local benchmark receipt:

`packages/studio/src/__benchmarks__/brittney-vs-baselines/results/20260610T203030/results.md`

Relevant facts from that run:

- Tasks: F01-F10 (`fable5-dimension`)
- Configs: `brittney-prod`, `fable5-ultracode`
- Brittney-prod completion: 0/10
- Brittney-prod objects created: 0 on every F task
- Brittney-prod mean tool rounds: 0.00
- This is the run cited in `toolTiers.ts` as the full-registry failure mode.

Later June 10 receipts showed some partial recovery, but still only 1/10 completion in the sampled F01-F10 runs. They are historical context, not today's success proof.

## Validation

Passed:

```powershell
pnpm --filter @holoscript/studio exec vitest run src/lib/brittney/__tests__/toolTiers.test.ts src/lib/brittney/__tests__/toolCatalog.test.ts src/app/api/brittney/write-through.test.ts
```

Result: 3 files passed, 30 tests passed.

Passed:

```powershell
pnpm --filter @holoscript/studio exec tsx src/__benchmarks__/brittney-vs-baselines/run.ts --dry-run --configs brittney-prod --tasks F01,F02,F03,F04,F05,F06,F07,F08,F09,F10 --trials 1 --budget 0
```

Result: selected 10 fable5-dimension tasks, 1 config, 1 trial, 10 cells, no LLM calls.

Attempted:

```powershell
pnpm --filter @holoscript/studio run typecheck
```

Result: failed on pre-existing package-wide errors outside this patch, including missing declarations for `@holoscript/core/parameter-envelope`, unrelated native panel type errors, missing `@holoscript/studio-plugin-sdk/sandbox` declarations, and missing reconstruction exports used by `native-camera-live-scan.ts`.

## Remaining Gate

A live paid F01-F10 before/after quality comparison was not run today. The benchmark harness requires model credentials and the full run is explicitly spend-gated by `HARNESS_FOUNDER_GO=1`; today's no-spend validation proves task selection plus the implementation invariants that prevent the default full-registry exposure.
