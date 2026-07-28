# HoloShell Failed Provider Export Repair Pressure Test - 2026-06-21

Status: frontier pressure test, not a product implementation.

Workflow chosen: "My account export failed, or only part of the archive downloaded. Recover what is safe, prove what is missing, and show the next retry without losing evidence."

## Source Read

- HoloScript repo contract: `AGENTS.md`, `CLAUDE.md`, `NORTH_STAR.md`
- HoloLand repo contract: `AGENTS.md`, `CLAUDE.md`, `NORTH_STAR.md`
- HoloLand boundary docs: `docs/AGENT_HOLOSCRIPT_TOOLING.md`, `docs/HOLOSCRIPT_SOURCE_CONTRACT.md`, `docs/HOLOLAND_PURPOSE.md`, `docs/specs/HOLOLAND_FRONTIER_NORTH_STAR.md`
- HoloShell source index: `docs/HOLOSHELL_SOURCE_MAP.md`
- Experiment seed: `experiments/holoshell-human-os-frontier/README.md`, `manifest.json`, `idea-seeds.md`
- Existing repair source: `failed-provider-export-repair-room.holo`, `failed-provider-export-repair-policy.hsplus`, `failed-provider-export-repair-pipeline.hs`
- Existing receipt contracts: `packages/framework/src/board/holoshell-provider-export-repair-receipts.ts` and its test
- Adjacent HoloLand slices: `partial-download-recovery-pipeline.hs`, `downloads-import-shelf-pipeline.hs`

## Boundary

HoloScript owns the reusable substrate: receipt versions, provider failure vocabulary, archive evidence contracts, retry policy selection, replay lessons, validators, and future adapters that convert local/provider observations into deterministic receipts.

HoloLand owns the product embodiment: the repair dock, Brittney/NPC language, import shelf, world-visible lesson objects, creator/player controls, and the in-world presentation of safe next actions.

HoloShell owns the local hardware wrapper: local quarantine folders, browser/provider witness capture, filesystem hashing, private path custody, fresh approval gestures, and the human-visible execution lane.

## What Already Exists

The current HoloScript slice is stronger than a sketch:

- The room source gives the human a visible sequence: provider state, partial archive evidence, repair plan, replay lesson, HoloLand repair dock.
- The policy splits operations into silent read-only inspection, guarded repair preparation, and break-glass provider retry.
- The pipeline blocks import and delete while preserving partial archive evidence.
- The framework contract validates failure, archive evidence, repair plan, replay, and pack status.
- The test proves key safety invariants: no account mutation during observation, no raw private data publication, no public absolute paths, fresh user gesture for retry plans, preserved evidence, blocked import/delete/share, and deterministic action routing.

## Pressure-Test Verdict

The workflow is a credible HoloShell Human OS candidate because it transforms a messy ordinary support problem into a state machine a non-developer can inspect. It is not yet a complete Human OS lane because provider reality is still too implicit. The current contract can validate a receipt once one exists, but it does not yet prove that HoloShell can reliably derive that receipt from Google, Microsoft, Apple, browser download state, and local archive evidence without leaking private data.

## Deterministic Experience

1. Select intent: "Repair this export without deleting or importing anything yet."
2. Observe provider state:
   - local-only account label is redacted and hashed
   - provider wait state is normalized
   - link expiry, admin block, cloud handoff, or provider delay is captured
   - no account mutation is performed
3. Freeze local evidence:
   - quarantine existing archive parts
   - record size, hash, completeness, open-test status, executable risk, sensitivity scan status, and missing evidence
   - keep private absolute paths in a local-only receipt
4. Plan repair:
   - choose one deterministic action from existing vocabulary: `wait`, `resume_download`, `re_download_same_link`, `split_product_scope`, `change_archive_size`, `change_delivery_method`, or `manual_provider_ticket`
   - bind the plan to a fresh approval nonce
   - keep import, delete, and share blocked until verification
5. Execute only after approval:
   - retry into quarantine, never over the original evidence
   - require a new receipt when provider state is mutated
6. Verify and replay:
   - verify all required parts before import shelf handoff
   - produce a replay key and plain-language lesson that works even without provider access
7. HoloLand product handoff:
   - world-visible object is a redacted repair lesson and receipt hash
   - raw account data, private file paths, and archive content remain local

## Gap Classification

HoloScript substrate gap:
Provider witness normalization is not yet an implementation surface. The receipt contract accepts `ProviderExportWaitState`, but the Human OS lane needs adapter fixtures that map provider pages, emails, browser download state, cloud handoff states, and local archive observations into `ProviderExportFailureReceipt` plus `PartialArchiveEvidenceReceipt`.

HoloLand product/world gap:
The repair dock is not yet promotion-ready. It needs a small product spec for the exact non-technical controls: "wait", "retry into quarantine", "open support path", "change archive size", "change delivery method", "show lesson", and "send verified file to import shelf."

HoloShell hardware-wrapper gap:
The local quarantine watcher is not yet a reusable command. It should prove read-only scan, private path custody, content hashing, missing part detection, and "no import/delete/share" as an executable local harness.

Multi-agent coordination gap:
The existing policy names lanes, but no handoff envelope proves which surface owned provider observation, local hashing, receipt validation, HoloLand language, and browser/account witness work during a run.

Deterministic UX/receipt gap:
The replay lesson needs one fixture that demonstrates the user can return later and understand the blocked action without reopening the provider account.

## Tracer Bullet

Build one fixture-backed path:

Input:

- redacted provider status fixture: provider waiting, ready link, expired link, admin block, cloud handoff block
- local quarantine fixture: two archive parts present, one missing, one corrupt, no executable launch
- approval fixture: nonce-bound user approval for retry, no hidden automation

Output:

- `ProviderExportFailureReceipt`
- `PartialArchiveEvidenceReceipt`
- `ProviderExportRepairPlanReceipt`
- `ExportRepairReplayReceipt`
- `HoloShellProviderExportRepairReceiptPack`
- one redacted HoloLand repair-dock summary object

Acceptance:

- existing framework validator tests pass
- fixture rejects any public absolute path in the public receipt
- fixture rejects import/delete/share before verification
- retry action is deterministic for each supported failure kind
- replay lesson is readable without provider access
- HoloLand import shelf receives only a verified handoff, never partial private data

## Candidate Board Task

Title: `[holoshell] Implement provider export witness fixture`

Description: Add a fixture-backed HoloShell provider export witness harness that maps redacted provider status and local quarantine observations into the existing provider export repair receipt pack. Start with Google/Takeout-shaped data but keep provider vocabulary generic. Validate with the existing framework provider export repair test plus one fixture command that proves public receipts contain no absolute private paths and block import/delete/share until verification.

## What Remains After This Plan

This plan does not implement provider UI automation, real account login, browser control, archive download, archive extraction, import shelf execution, or HoloLand rendering. It also does not verify live Google, Microsoft, or Apple provider behavior. The next real build step is the fixture-backed witness harness; only after that passes should HoloShell touch live provider accounts or HoloLand import flows.
