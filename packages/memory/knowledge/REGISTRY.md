# Knowledge Entry Registry

The sequence authority for the HoloScript knowledge layer, per the
canonical entry format (`packages/memory/ENTRY_FORMAT.md`, §3.3):
read the next sequence number for a category from this file; never
skip a number, never reuse one. Existing IDs are never renumbered —
renumbering creates a different entry.

## Categories

| Category | Type | Sequence state |
|---|---|---|
| BRAIN | W (wisdom) | Legacy random-suffix IDs only (see below); no sequence in use |
| GAPS | G (gotcha) | At 07 |
| ARCH | G (gotcha) | At 016 |

## Entries

| ID | Type | File |
|---|---|---|
| W.BRAIN.0ef71e06 | wisdom | `wisdom/W.BRAIN.0ef71e06.md` |
| W.BRAIN.b06b2233 | wisdom | `wisdom/W.BRAIN.b06b2233.md` |
| G.GAPS.07 | gotcha | `gotchas/G.GAPS.07.md` |
| G.ARCH.016 | gotcha | `gotchas/G.ARCH.016.md` |

The two W.BRAIN entries carry legacy random-suffix IDs produced by
the `@holoscript/memory` ID generator. They remain valid identities
forever; they are not a template for new entries (§3.3).
