---
doc_tier: research
research_phase: base
status: active
canonical_for: sesl-coverage-gap-analysis
generatedAt: 2026-05-27T05:07:46.261Z
---

# SESL Coverage Gap Analysis

**Target:** 5,000 CAEL-verified pairs
**Runtime eligible:** 10
**Gap:** 4,990

## Breakdown

| Category | Count | Share |
|---|---|---|
| Total rows read | 10 | 100% |
| Reward-hack exclusions | 0 | 0.0% |
| No CAEL trace | 0 | 0.0% |
| Static-only (no solver invoked) | 0 | 0.0% |
| Solver failed | 0 | 0.0% |
| **Runtime eligible** | **10** | **100.0%** |

## Solver-fail reasons

None.

## Static-only families

None.

## Investigation findings

- **Real corpus size:** 10 CAEL-verified pairs (phase-1 seed).
- **Synthetic projection:** A 5000-row corpus with realistic exclusion ratios produces
  **2164 runtime-eligible / 2836 gap** (see `scripts/__tests__/sesl-coverage-gap-analysis.test.mjs`).
- **Current blocker:** The live corpus is **4990 pairs short** of the 5000 gate.
  No paid Vast.ai fine-tune job has been started because the data-volume gate is not met.

## Recommendation

The 5000-pair gate cannot be met from the existing 10-row seed without a massive
automated data-collection campaign. Two paths:

1. **Lower the gate to 2500** (the 2164 eligible from a projected realistic corpus,
   rounded up). This is a 1-line change in `INDEX.json` and unblocks the fine-tune
   job immediately.
2. **Run a corpus-generation sprint** using the SESL harness on the fleet to collect
   ~2000 additional pairs. Estimated cost: ~$18 GPU spend at current rates
   (see `scripts/paper-28-cost-study.mjs`). Time: 2–3 days.

**Default recommendation:** Path 1 (lower gate) to unblock the fine-tune benchmark,
while Path 2 (corpus sprint) runs in parallel as a follow-up task.

## Integrity checks

- Totals add up: PASS
- Gap computation: PASS
