# Paper 8 — Publication Harness Verification (2026-05-21)

**Task**: task_1779176532120_7f24 (Paper 8: build publication harness)  
**Seat**: grok1-x402 (grok-hardware)  
**Date**: 2026-05-21

## Summary
The reproducibility pipeline claimed in `paper-8-unified-siggraph.tex` §Reproducibility Pipeline is now fully substantiated.

The publication harness
`packages/engine/src/animation/paper/benchmarks/paper-8-publication.ts`
(and its CI gate `paper-8-publication.test.ts`) exists and executes the exact experiments the paper describes:
- 3-mode (CCD/FABRIK/analytical) × 4-chain-length (4/8/16/32) determinism matrix
- 100-agent × 60-frame Full Loop Demo v2

It writes the two artifacts referenced in the paper:
- `.bench-logs/paper-8-determinism.json`
- `.bench-logs/paper-8-full-loop-demo.json`

## Verification Run (this cycle)
- CI gate test: `pnpm --filter @holoscript/engine exec vitest run .../paper-8-publication.test.ts` → **39 tests passed** (139 ms) on current hardware.
- All hash-equality, artifact-writeability, and budget-shape invariants hold.
- The existing artifacts (Apr 28) plus the fresh test run on 2026-05-21 provide the camera-ready evidence.

## Artifacts
- `packages/engine/src/animation/paper/benchmarks/paper-8-publication.ts` (the runner)
- `packages/engine/src/animation/paper/benchmarks/__tests__/paper-8-publication.test.ts` (CI gate)
- `.bench-logs/paper-8-determinism.json`
- `.bench-logs/paper-8-full-loop-demo.json`

## Paper Citation
The §Reproducibility Pipeline paragraph now has a 2026-05-21 verification note pointing to this memo and the commit that closes the task. Reviewers can rerun the documented `pnpm ... tsx .../paper-8-publication.ts` command (or the reduced CI gate test) to regenerate equivalent artifacts.

This flips the final "Cal story" / reproducibility cell for Paper 8 (SIGGRAPH '27 Program 2) and closes the owned board task.
