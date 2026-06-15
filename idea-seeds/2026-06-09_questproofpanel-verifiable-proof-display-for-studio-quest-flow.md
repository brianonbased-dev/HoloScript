# QuestProofPanel — verifiable proof display for Studio quest completion flow

**Date:** 2026-06-09
**Class:** deleted-work
**Status:** seed
**Repository:** HoloScript
**Source context:** packages/studio/src/components/quest/QuestProofPanel.tsx (removed/renamed, flagged by holo-ci/render-surface SURFACE-SHRANK, workload ci-875511b2-mq78b1y3)

## What Might Be Valuable

A Studio panel that displays verifiable proof artifacts when a user completes a HoloLand quest — receipts, attestations, or on-chain references that the quest outcome is real. This connects D.057 (regulated verifiable orchestration, receipt IS the product) to the HoloLand quest UX. A proof panel that can render a `FairnessReceipt` or a `cael-ci-v1`-style receipt in a human-readable Studio component is a missing UI bridge between the verification substrate and the user-facing surface.

## Why Not Now

The file was removed (renamed or moved) and its exact replacement location is unknown. The quest proof system it depended on may not be fully wired. Filing a fix for the allowlist staleness is the immediate action; the product idea needs the underlying receipt rendering pipeline to be stable first.

## Smallest Next Experiment

Confirm whether QuestProofPanel was renamed (check git log for the path) or truly deleted. If renamed, update the allowlist. If deleted: wire a 30-line `<ReceiptCard>` component that renders a `FairnessReceipt` JSON as a simple read-only panel in Studio — no quest integration yet, just the display surface.

## Reopen Trigger

When D.057 verifiable orchestration receipts need a Studio UI surface, or when HoloLand quest completion requires a proof display for parent/teacher verification.

## Do Not Preserve

The original component's exact structure — focus on the proof-display pattern, not the quest-flow coupling.

## Links

- CI gate: holo-ci/render-surface, workload ci-875511b2-mq78b1y3, sha 875511b2
- Direction: D.057 (regulated verifiable orchestration), D.079 (HoloLand family surface)
