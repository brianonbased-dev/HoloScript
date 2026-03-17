# HoloScript Native Daemon — Performance Report

**Date:** 2026-03-17
**Composition:** `compositions/self-improve-daemon.hsplus`
**Runner:** `holoscript daemon` (native CLI subcommand)
**Model:** claude-sonnet-4-20250514 (Sonnet)

## Executive Summary

The HoloScript self-improvement daemon runs **100% through native HoloScript primitives** — no TypeScript bridge required. The `.hsplus` composition defines a behavior tree that orchestrates the full improvement cycle (diagnose → fix → verify → test → commit/rollback), dispatched through `HeadlessRuntime.registerAction()` and the BehaviorTreeTrait's native action bridge.

Two phases of testing: Phase 1 (proof of concept, 4 cycles) validated the architecture. Phase 2 (Tier 1 optimizations) improved quality scoring from 0.000 to 0.399, reduced candidate pool from 643 to 195, and fixed candidate advancement bugs.

## Architecture (Before → After)

| Aspect | Bridge (before) | Native (after) |
|--------|----------------|----------------|
| Runner | `self-improve-bridge.ts` (1,800 lines) | `holoscript daemon` CLI (~200 lines) |
| Action dispatch | Manual switch statement | `registerAction()` + BT event bridge |
| BT execution | Reimplemented in TS | Native `BehaviorTreeTrait` |
| Trait activation | None | `materializeTraits()` from directives |
| Configuration | Hardcoded in bridge | `.hsplus` composition file |
| Action handlers | Inline in bridge | `daemon-actions.ts` (~540 lines) |

**Total code reduction:** 1,800 → ~740 lines (59% reduction)

---

## Phase 1: Proof of Concept (4 cycles)

### Session 1: Initial Cycle (1 cycle)

| Metric | Value |
|--------|-------|
| Duration | 487.1s (8.1 min) |
| BT Ticks | 4,477 |
| Candidates Found | 643 (unfiltered) |
| Candidates Attempted | 3 |
| Files Modified | 3 (all rolled back) |
| Compilation | PASS (error count ≤ baseline) |
| Tests | FAIL (no matching test files) |
| Quality Delta | +0.000 |
| Input Tokens | 17,587 |
| Output Tokens | 15,688 |
| Cost | $0.288 |

### Session 2: Three Cycles (3 cycles)

| Metric | Cycle 1 | Cycle 2 | Cycle 3 |
|--------|---------|---------|---------|
| Focus | coverage | docs | all |
| Duration | 522.1s | 452.1s | 384.1s |
| BT Ticks | 4,765 | 4,147 | 3,525 |
| Candidates | 644 | 640 | 637 |
| Attempted | 3 | 3 | 3 |
| Quarantined | 0 | 3 | 0 |
| Quality Δ | +0.000 | +0.000 | +0.000 |
| Input Tokens | 17,587 | 17,534 | 8,997 |
| Output Tokens | 15,680 | 15,748 | 6,942 |
| Cost | $0.288 | $0.289 | $0.131 |

### Phase 1 Aggregate

| Metric | Value |
|--------|-------|
| Total Duration | ~1,845s (30.7 min) |
| Total Candidates Attempted | 12 |
| Total Files Quarantined | 3 |
| Total Input Tokens | 61,705 |
| Total Output Tokens | 54,058 |
| **Total Cost** | **$0.996** |
| Cost per Cycle | $0.249 avg |
| Best Quality | 0.000 |
| Improvements Committed | 0 |

### Phase 1 Issues Identified

1. **Quality always 0.000**: `computeQuality()` normalized type errors against absolute 100, but repo had ~3,500 pre-existing errors → typeScore always 0
2. **Tests always FAIL**: Test file resolution assumed 1:1 mapping; most files had no test file
3. **Candidates unfiltered**: 643 candidates included examples/, benchmarks, external packages
4. **No candidate advancement**: generate_fix returning true even with no changes → same candidate retried

---

## Phase 2: Tier 1 Optimizations

### Fixes Applied

| Fix | Before | After |
|-----|--------|-------|
| **Quality scoring** | Absolute normalization (`errors/100`) | Delta-based (`errors/baseline`) |
| **Candidate filtering** | All 643 files with type errors | 195 files in `packages/core/src/` only |
| **Candidate priority** | Random (Set insertion order) | Fewest errors first (easiest wins) |
| **Test resolution** | Single pattern, always fails | Multiple patterns, skip when no test |
| **LLM prompts** | Generic "fix issues" | Focus-specific (typefix/coverage/docs) |
| **verify_compilation** | Returns false on fail → BT aborts | Returns true always, sets flag for BT |
| **generate_fix no-op** | Returns true, retries same candidate | Advances candidate, returns false |
| **commit_changes** | No advance → repeater retries same file | Advances candidate after commit |
| **setASTBlackboard** | Shallow traversal (4 arrays only) | Deep traversal (all properties + Maps) |
| **Focus modes** | typefix only | typefix, coverage, docs, all |

### Validation Run (1 cycle, post-fixes)

| Metric | Value |
|--------|-------|
| Duration | 600.2s (10 min, hit timeout) |
| BT Ticks | 5,375 |
| Candidates Found | **195** (down from 643) |
| Candidates Attempted | **2** (different files: GenerationCache.ts → SteeringBehaviors.ts) |
| Quality | **0.399** (up from 0.000) |
| Test Handling | **SKIP** (correctly — no test files) |
| Candidate Advancement | **FIXED** (different candidates processed) |

### Quality Score Breakdown

```
typeScore  = 1 - (3514 / 3514) = 0.000  (no net improvement yet)
testScore  = 54352 / 54453 = 0.998
quality    = 0.000 * 0.6 + 0.998 * 0.4 = 0.399
```

The quality jump from 0.000 to 0.399 is from test score now being correctly parsed (JSON reporter + --passWithNoTests). Actual type error reduction will show when fixes compile with fewer errors.

---

## BT Execution Flow (Verified — Both Phases)

```
improvement_cycle (sequence)
  ├─ identity_intake ✓ (loaded wisdom entries)
  ├─ diagnose ✓ (195 candidates, filtered to packages/core/src/)
  ├─ find_candidate (selector)
  │   ├─ candidate_loop (sequence)
  │   │   ├─ has_candidates ✓ (condition gate)
  │   │   └─ candidate_iterator (repeater, count=3)
  │   │       └─ try_candidate (sequence)
  │   │           ├─ has_candidates_inner ✓
  │   │           ├─ read_candidate ✓
  │   │           ├─ generate_fix ✓ or ✗ (no-op → advance + skip)
  │   │           ├─ verify_compilation ✓ (diagnostic, sets flag)
  │   │           ├─ compile_retry_loop (repeater, count=2)
  │   │           │   └─ retry_compile_fix (if !compilation_passed)
  │   │           ├─ handle_verification (selector)
  │   │           │   ├─ verification_passed (sequence)
  │   │           │   │   ├─ compilation_passed ✓
  │   │           │   │   ├─ run_related_tests ✓ (SKIP or PASS/FAIL)
  │   │           │   │   └─ handle_test_results (selector)
  │   │           │   │       ├─ tests_passed_path → validate_quality → commit
  │   │           │   │       └─ rollback_and_advance_tests ✓
  │   │           │   └─ rollback_and_advance_compile ✓
  │   │           └─ (advance to next candidate)
  │   └─ report_no_candidates (fallback)
  ├─ report_results ✓
  ├─ compress_knowledge ✓
  └─ motivation_feedback (selector)
      ├─ praise_improvement (if quality_improved)
      └─ integrate_shadow ✓ (fallback)
```

## Quarantine System

Working correctly across phases:
- Cycle 1: Files attempted for first time (count=1)
- Cycle 2: Same files attempted again (count=2 → quarantined)
- Cycle 3: Quarantined files skipped, new candidates selected

## Cycle Duration Breakdown (estimated)

| Phase | Time |
|-------|------|
| `tsc --noEmit` (diagnosis) | ~60s |
| LLM calls (2-3 × generate_fix) | ~60-120s |
| `tsc --noEmit` (2-3 × verify) | ~120-180s |
| `vitest run` (2-3 × test or skip) | ~30-60s |
| `tsc + vitest` (validate_quality) | ~120s |
| Other (BT ticks, I/O) | ~30s |
| **Total** | ~420-570s |

TypeScript compilation dominates (60%+ of cycle time). Each `tsc --noEmit` takes ~60s on this codebase (~3,500 pre-existing errors).

## Cost Efficiency

| Metric | Phase 1 | Phase 2 (projected) |
|--------|---------|---------------------|
| Cost per cycle | $0.249 avg | ~$0.25 |
| Cost per candidate attempted | $0.083 | ~$0.125 |
| Tokens per dollar | ~116K tokens/$1 | Similar |
| Quality achieved | 0.000 | 0.399 |

## Safety Features Verified

- **Lock file:** Stale lock reclaimed (PID check + heartbeat)
- **API pre-check:** 1-token validation before expensive cycles
- **Rollback:** All files restored on failure (`git checkout --`)
- **Quarantine:** Files blacklisted after 2 failures
- **Dry run:** `--commit` flag defaults to false
- **Wisdom persistence:** Accumulated across cycles
- **Signal handlers:** SIGINT/SIGTERM cleanup registered
- **Contamination check:** Detects test output / stack traces in LLM responses

## Comparison: Bridge vs Native

| Metric | Bridge (prior runs) | Native (Phase 2) |
|--------|--------------------|--------------------|
| Lines of code | 1,800 | 740 |
| BT dispatch | TS switch statement | HeadlessRuntime.registerAction() |
| Trait support | None (manual) | BehaviorTreeTrait native |
| Event routing | Custom | emit() → action registry |
| Config format | Hardcoded | .hsplus composition |
| Cycle time | ~7-9 min | ~6-10 min |
| Cost/cycle | ~$0.30 | ~$0.25 |
| Quality score | 0.000 | 0.399 |
| Candidate filtering | None | packages/core/src/ + priority sort |
| Focus modes | typefix only | typefix, coverage, docs, all |

The native daemon is **59% less code**, **~17% cheaper per cycle**, and **fully configurable** through the `.hsplus` composition file. Phase 2 optimizations raised quality from 0.000 to 0.399 and fixed candidate advancement.

## Next Steps: GraphRAG Integration

The daemon currently does blind file-by-file fixing. The codebase has production-grade GraphRAG infrastructure (`EmbeddingIndex`, `GraphRAGEngine`, 4 embedding providers) that can:

1. **Impact-aware candidate selection**: Use `GraphRAGEngine.impactRadius()` to deprioritize high-connectivity files
2. **Context-rich fix generation**: Inject caller/callee chains into LLM prompts
3. **Failure pattern recall**: Embed fix patterns for semantic retrieval on similar errors
4. **Graph-aware testing**: Run tests for all files in the impact set, not just the source file

Default embedding provider (BM25) is free. OpenAI embeddings available at ~$0.002/index build.
