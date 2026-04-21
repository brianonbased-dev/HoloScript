# CAEL traces as SNN training curriculum (paper-0c) — design outline

**Scope:** Turn contract-grounded CAEL execution traces into spike-based training data without breaking the hash / replay story from paper-0c and the capstone.

## Goals

- **Fidelity:** Spike sequences should remain replay-checkable against the same canonical step boundaries as JSONL CAEL traces (or an explicitly documented lossy encoding).
- **Curriculum:** Start from synthetic spike templates and short traces; graduate to checkpointed + delta-compressed industrial traces (see `memory/cael-trace-compression-outline.md`).
- **Efficiency:** Target neuromorphic or SNN runtimes where spike count and timing matter, not just final scalar rewards.

## Pipeline (sketch)

1. **Trace normalization** — Canonical ordering of entities, actions, and digests per CAEL step (same basis as hashing).
2. **Event → spike encoding** — Per-step features (state deltas, discrete actions) mapped to spike trains or address-event streams; separate “teacher” alignment from deployment SNN width.
3. **Curriculum stages** — (A) synthetic CAEL-like episodes, (B) compressed real traces with held-out validation, (C) full-replay stress with hash verification on decoded steps.
4. **Downstream probes** — Short-horizon prediction or control tasks that consume SNN outputs but still log contract-compatible digests when interfacing with CAEL.

## Verification

- **Replay:** Decoded SNN path or parallel shadow run produces step digests matching golden CAEL hashes within the stated encoding (lossless vs bounded-loss).
- **Ablations:** Random curriculum vs CAEL-ordered curriculum; spike budget vs accuracy.

## Status

Research outline — implementation and benchmarks are future work.
