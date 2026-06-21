# HoloScript Format Realism Ratchet - 2026-06-21

Automation ID: `stress-holoscript-format-realism-gaps`
Task: `task_1781055801438_udvs`
Agent: `codex-hardware`

## Flagship

Active flagship remains `two-agent-handoff-catch`.

Current run:
`.bench-logs/format-stress/2026-06-21_codex-format-realism-ratchet/two-agent-handoff-catch/scorecard.json`

Previous comparable run:
`.bench-logs/format-stress/2026-05-22_claudecode-realism-ratchet/flagship-segments/scorecard.json`

## Commands

- `node scripts/holoshell-format-gauntlet.mjs .bench-logs/format-stress/task_1779027507934_fjsg_completion/two-agent-handoff-catch-manifest.json --date 2026-06-21_codex-format-realism-ratchet --no-open --skip-file-tasks --skip-duplicate-search --json`
- `node --check scripts/format-stress-segmented-capture.mjs`
- `node scripts/__tests__/format-stress-segmented-capture.test.mjs`

The dashboard run used quality evidence, not `--dry-run`.

## Delta

| Metric | Previous | Current | Delta |
| --- | ---: | ---: | --- |
| Parse/compile/runtime command failures | 0 | 0 | stable |
| Segments requested | 10 | 10 | stable |
| Segments with stills | 10 | 10 | stable |
| Unique still hashes | 10 | 10 | stable |
| Segments with event logs | 10 | 10 | stable |
| Segments with pose/physics JSON | 10 | 10 | stable |
| Segments with timing | 10 | 10 | stable |
| World-model pixel replay segments | 0 | 0 | stable |
| Dynamic replay blocked segments | 0 | 0 | stable |
| Highest gap severity | P2 | P2 | stable |

Additional current scorecard details:

- `segmentsWithLiveSegmentScreenshot`: 9
- `headlessRuntimeSceneObjects`: 63
- `headlessRuntimeTemplates`: 15
- `falseGreenRisk`: `none-detected`
- `staticCopySegments`: 0
- `placeholderStillSegments`: 0
- `worldModelReplay.predicateViolationCount`: 0

## Verdict

No new severe format-realism gap surfaced in this run.

The flagship stayed stable against the May 22 baseline: all segments still produce distinct visual evidence, event logs, pose/physics JSON, timing receipts, and no parser/compile/runtime command failures. Highest severity remains P2 because physical target-device proof is still outside this run.

## Task Filing

No new tasks were filed.

The runner generated ten generic per-segment "dynamic evidence" task seeds, but the scorecard did not regress and those seeds do not represent a new blocker from this run. Exact-title live board lookup found no exact duplicates, but filing all ten would inflate the board without adding a sharper next action. Existing P2 work remains the better next target: physical target-device/WebXR frame receipts for the flagship.

## Artifacts

- `two-agent-handoff-catch/dashboard-report.md`
- `two-agent-handoff-catch/contact-sheet.md`
- `two-agent-handoff-catch/scorecard.json`
- `two-agent-handoff-catch/segment-receipts.json`
- `two-agent-handoff-catch/still-evidence.json`
- `two-agent-handoff-catch/visual-uniqueness-audit.json`
- `two-agent-handoff-catch/events/`
- `two-agent-handoff-catch/pose-physics/`
- `two-agent-handoff-catch/segment-scenes/`
- `two-agent-handoff-catch/stills/`

## Validation

- `node --check scripts/format-stress-segmented-capture.mjs` passed.
- `node scripts/__tests__/format-stress-segmented-capture.test.mjs` passed with 56 assertions.
- Artifact JSON parsed during the dashboard run; scorecard has zero command failures.
