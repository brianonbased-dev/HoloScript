# CAEL trace compression (industrial digital twins) — design outline

**Scope:** Addresses paper-capstone limitation: full JSONL traces at plant scale are storage-heavy (~180 B/entry baseline in prose; linear growth with steps × entities).

## Goals

- **Lossless replay** for dispute resolution (same hashes as uncompressed stream).
- **Bounded memory** for long runs (checkpoint + delta, not full history in RAM).

## Strategies (combine)

1. **Per-field delta encoding** — Float/state vectors as XOR-delta or varint against previous step; identity matrices for static topology.
2. **Checkpoint-and-replay** — Every *k* steps (or *m* MB), store full keyframe + rolling hash; tail = deltas only.
3. **Structural sharing** — Immutable scene graph nodes referenced by ID; log only changed node IDs per tick.
4. **Optional ZSTD** — Compress JSONL chunks after canonicalization (replay: decompress → same canonical bytes → same FNV/SHA per Option C mode).

## Verification

- Round-trip: `decompress(expand(checkpoint + deltas))` byte-identical to golden trace for hash-chain validation.
- Benchmark: bytes on disk vs raw JSONL on representative 10³–10⁶ entity traces.

## Status

Research / future implementation — not shipped in runtime yet.
