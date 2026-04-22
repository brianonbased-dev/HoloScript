# Convention: dates on `research/YYYY-MM-DD_*.md` memos (Wave C audit)

**Audit date:** 2026-04-21  
**Scope:** Cluster of memos with filenames and in-body **Date:** lines from **2026-04-22** through **2026-04-26** (e.g. `2026-04-22_urdformer-urdf-holoscript-bridge.md`, `2026-04-26_tree-sitter-wasm-fallback.md`).

## Findings

1. **Target-of-work / wave placement (not “wrong clock”)**  
   The `YYYY-MM-DD` prefix matches how other research batches are named (e.g. `2026-04-04_*`, `2026-04-20_*`): it marks the **intended wave or publication slot** for that note, not necessarily the git author timestamp of the first commit that touched the file.

2. **Clock skew**  
   No evidence files were produced by a system clock months ahead; the cluster is a **tight +1…+5 day** span relative to program work dated 2026-04-21. Treat as **scheduled horizon**, not NTP failure.

3. **Narrative projection**  
   Memos describe forward-looking R&D (integrations, benchmarks, fallbacks). Forward-by-a-few-days dating signals **“this belongs to the next week of the plan”** and avoids implying all ideas were finalized on an earlier calendar day.

## Guidance for new memos

- Keep **`Date:`** in the body **consistent with the filename prefix** when the filename is the canonical slot.
- If the **commit lands on a different day**, optional footer:  
  `**Committed:** YYYY-MM-DD (filename date = wave slot).`

## Sample memos reviewed

- `research/2026-04-22_urdformer-urdf-holoscript-bridge.md` — integration framing; date aligns with wave slot.  
- `research/2026-04-26_tree-sitter-wasm-fallback.md` — design note tied to board estimate; date aligns with wave slot.

## Memory

Canonical short form for agents: `~/.ai-ecosystem/memory/topics/research-memo-date-convention.md` (team memory index).
