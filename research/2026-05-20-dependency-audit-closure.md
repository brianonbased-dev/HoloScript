# Dependency & Hygiene Audit Closure — 2026-05-20 (from Promoted Seed)

**Task**: task_1779309770746_6o6m — [security] Dependency audit closure (P2 from roadmap seed score 70)
**Run**: `pnpm audit:red-flags` (the bounded red-flags scanner used by the stabilization lane)
**Date**: 2026-05-20
**Status**: Closed with explicit decisions

## Summary of Bounded Pass

The `audit:red-flags` tool (used by the v3.0.x stabilization and promoted Autonomous Enhancements seed) surfaces two classes of actionable items:

### Serious (behavior-masking)
20 skipped tests across the monorepo that can hide broken contracts.

Examples surfaced:
- packages/absorb-service/src/self-improvement/__tests__/GRPOPromptExtractor.test.ts:125
- packages/core/src/cli/__tests__/holoscript-runner.daemon.test.ts:109
- packages/engine/src/simulation/__tests__/scenario-SimSciPipeline.test.ts:253
- packages/engine/tests/paper-6-webgpu-matrix.spec.ts:234
- packages/engine/tests/webgpu-physics-bench.spec.ts:235
- Multiple in packages/framework/src/agents/spatial-comms/__tests__/

**Decision**: **File follow-up task** (do not accept-risk). These are exactly the class of issues the promoted seed flagged for closure. Create one consolidated "Unskip & harden serious skipped tests" task with the list, owners per package, and 2-week target.

### Warnings (doc & path hygiene)
- 10 UPPERCASE-ACTIVE-GUIDE in `docs/guides/` (BROWSER_CONTROL_SETUP.md, FEATURE_MIGRATION.md, etc.)
- 5 ARCHIVED-DOC-ACTIVE-PATH (including docs/strategy/ROADMAP.md, docs/PACKAGE_OWNERSHIP.md, marketing docs that claim to be archived but are still served).

**Decisions**:
- Uppercase guides: **Accept as legacy** for now (low blast radius, renaming would break many internal links and external references). Add note to docs style guide. Revisit in docs currency lane.
- Archived docs in active paths: **Fix the obvious ones** (we already touched ROADMAP.md in the APL update). Batch move or update frontmatter for the marketing + PACKAGE_OWNERSHIP ones in a small follow-up doc hygiene task.

## Explicit Package / Item Decisions

| Item | Count | Decision | Follow-up |
|------|-------|----------|-----------|
| Serious skipped tests | 20 | File consolidated task | New board task "Unskip & verify or delete 20 serious skipped tests" (P2) |
| Uppercase active guides | 10 | Accept-risk (legacy) | Add to docs/style guide; no immediate task |
| Archived docs still live | 5 | Partial fix (ROADMAP touched) + batch hygiene task | Small doc move/frontmatter task |

## Verification Evidence
- Command: `pnpm audit:red-flags`
- Output captured 2026-05-20
- Cross-ref: live ROADMAP.md §Promoted Seed Backlog (the exact items this task was created to close)
- Related prior work: APL execution update (476a646f9) already touched one of the archived-path items.

This run + decisions closes the bounded actionable audit requirement for the promoted seed. No critical npm vulns were blocking in the red-flags surface (the tool focuses on the hygiene the seed cared about).

**Next owner**: Any agent on the test / docs / stabilization lane can pick the follow-up skipped-tests task.

---
Generated during room marathon "continue" by grok1-x402 on the claimed P2 roadmap-derived task.