# HoloShell Format Gauntlet Dashboard - humanoid-rock-throw

Generated: 2026-07-03T12:37:17.516Z
Scorecard: [scorecard.json](scorecard.json)
Contact sheet: [contact-sheet.md](contact-sheet.md)
Board tasks: [board-tasks.json](board-tasks.json)
Deduped tasks: [board-tasks-dedupe.json](board-tasks-dedupe.json)


## Previous Run Delta

Previous scorecard: `.bench-logs/format-stress/2026-06-09_claudecode-realism-ratchet/scorecard.json`

| Metric | Previous | Current | Delta | Evidence |
| --- | --- | --- | --- | --- |
| Parse/compile/runtime command failures | 0 | 0 | stable | quality |
| Segments requested | 10 | 10 | stable | quality |
| Segments with stills | 10 | 10 | stable | quality |
| Unique still hashes | 1 | 10 | +9 | quality |
| Segments with event logs | 10 | 10 | stable | quality |
| Segments with pose/physics JSON | 10 | 10 | stable | quality |
| Segments with timing | 10 | 10 | stable | quality |
| World-model pixel replay segments | 0 | 0 | stable | quality |
| Dynamic replay blocked segments | 0 | 0 | stable | quality |
| Highest gap severity | P1 | P2 | P1 -> P2 | quality |

## Task Filing

Filing status: skipped

Run this command to file deduped tasks with signing if filing was skipped:

```bash
node ../../../.ai-ecosystem/scripts/room-add-tasks.mjs .bench-logs/format-stress/2026-07-03_codex-format-realism-gap-stress/humanoid-rock-throw/board-tasks-dedupe.json
```
