# Paper 17 SESL Pairs

This directory is the HoloScript-side Paper 17 SESL pair counter.

## Data Classes

- `fixtures/phase1-seed.jsonl` is a Phase 0 seed fixture: prompt + `.holo` text, not training evidence.
- `phase-1-corpus.jsonl` is the Phase 1 corpus. Count a row as CAEL-verified only when `phase="phase-1"`, `outcome="success"`, and `cael_hash_chain_valid=true`.
- `cael-traces/*.json` stores the content-addressed full CAEL trace for each Phase 1 row.
- `INDEX.json` is the gate summary read by `scripts/mesh-deploy/paper-gate-scheduler.py`.

## Reproduce

```bash
pnpm exec tsx scripts/build-paper17-sesl-phase1-pair.ts
node scripts/measure-sesl-simcontract.mjs --input=research/paper-17-sesl-pairs/phase-1-corpus.jsonl --target-pairs=1 --target-pass-rate=0.6 --json
node scripts/measure-sesl-simcontract.mjs --input=research/paper-17-sesl-pairs/INDEX.json --target-pairs=1 --target-pass-rate=0.6 --json
```

The committed smoke output intentionally clears a one-pair harness check, not the full Paper 17 publication gate. `INDEX.json.gate.gate_gap_cael_verified` remains the production counter for the remaining path to 5,000 CAEL-verified pairs.
