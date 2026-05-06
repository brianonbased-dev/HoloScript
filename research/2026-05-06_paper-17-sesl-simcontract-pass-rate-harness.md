---
doc_tier: research
research_phase: base
status: active
last_verified: 2026-05-06
canonical_for: paper-17-sesl-simcontract-pass-rate-harness
supersedes: ""
extends: ""
---

### Machine summary (uAA2 COMPRESS)

**TL;DR:** Paper 17 now has a SimContract pass-rate measurement harness at `scripts/measure-sesl-simcontract.mjs` and a Phase 1 CAEL pair generator at `scripts/build-paper17-sesl-phase1-pair.ts`. Static Phase 0 seed success is still not contract success: the local Phase 0 corpus has 7,692 seed records, while the HoloScript Phase 1 path now contains 1 CAEL-verified `(prompt, .holo, cael_trace, score)` training tuple and reports it separately through `research/paper-17-sesl-pairs/INDEX.json`.

- **W --** A paper gate is only real when the measurement field names the proof source; static seed-pair success is not SimContract success.
- **P --** Measure `simContractCheck`, `sim_contract_passed`, or per-mutation SimContract fields first, then report volume and pass-rate gates separately.
- **G --** Treating `outcome=success` as a SimContract pass would silently promote Phase 0 seed data into Phase 1 evidence.

**Evidence:** `scripts/measure-sesl-simcontract.mjs`; `scripts/build-paper17-sesl-phase1-pair.ts`; `research/paper-17-sesl-pairs/phase-1-corpus.jsonl`; `research/paper-17-sesl-pairs/INDEX.json`; local Phase 0 corpus measurement run.

---

# Paper 17 SESL -- SimContract Pass-Rate Harness

## Source

- **Board task**: `task_1777932178900_kdc0`
- **Title**: `[paper-17-sesl] SimContract pass-rate measurement harness (Phase 1 gate 2)`
- **Acceptance**: build the SimContract-against-corpus pass-rate harness; target >=60% pass rate or documented ceiling.
- **Output requested**: `scripts/measure-sesl-simcontract.mjs` plus research memo.

## Harness Contract

The harness reads either a JSONL corpus or an INDEX-style JSON summary. For JSONL records it counts a pair as measurable only when it carries one of these explicit proof fields:

| Field shape | Interpretation |
|-------------|----------------|
| `simContractCheck.passed` | Direct pair-level SimulationContract result |
| `sim_contract_passed` or `simContractPassed` | Direct pair-level boolean result |
| `verification.simContractCheck.result` | Pair-level `pass` or `fail` result |
| `scene_mutations[].sim_contract_passed` | Per-mutation results; a pair passes only if every measured mutation passes |

It does not count `outcome=success` as a SimContract pass. That outcome can mean "static seed pair accepted into Phase 0 corpus," which is not the Phase 1 gate.

For Paper 17 volume, the harness now also reports `counts.caelVerifiedPairs` and `gate.paper17GateCleared`. This is intentionally separate from the SimContract pass-rate gate: a row is CAEL-verified only when it has trace evidence such as `cael_hash_chain_valid=true` or `cael_trace.hashChain.valid=true`.

## Phase 1 CAEL-Verified Smoke Harness

Command:

```bash
pnpm exec tsx scripts/build-paper17-sesl-phase1-pair.ts
```

The command consumes `research/paper-17-sesl-pairs/fixtures/phase1-seed.jsonl`, runs the deterministic `CAELRecorder` smoke solver, verifies the SHA-256 `cael.v1` hash chain, scores the row, and writes:

| Artifact | Purpose |
|----------|---------|
| `research/paper-17-sesl-pairs/phase-1-corpus.jsonl` | Phase 1 training row with `(prompt, .holo, cael_trace, score)` |
| `research/paper-17-sesl-pairs/cael-traces/<hash>.json` | Full content-addressed CAEL trace |
| `research/paper-17-sesl-pairs/INDEX.json` | Gate summary read by the paper scheduler |

Observed local result on 2026-05-06:

```json
{
  "pairs_collected": 1,
  "cael_verified_pairs": 1,
  "measured_pairs": 1,
  "passed": 1,
  "pass_rate": 1,
  "gate_gap_cael_verified": 4999
}
```

This clears the reproducible Phase 1 emission path. It does not clear the full publication gate yet; the remaining volume target is 4,999 additional CAEL-verified pairs.

## Smoke Fixture

The committed smoke corpus has five records:

| Pair class | Count | Measured? |
|------------|------:|-----------|
| Direct pass | 1 | yes |
| Per-mutation pass | 1 | yes |
| Result-string pass | 1 | yes |
| Per-mutation fail | 1 | yes |
| Static unmeasured seed | 1 | no |

Command:

```bash
node scripts/measure-sesl-simcontract.mjs --input=research/paper-17-sesl-pairs/fixtures/simcontract-measurement-smoke.ndjson --target-pairs=4 --target-pass-rate=0.6 --json
```

Expected gate result:

```json
{
  "measuredPairs": 4,
  "passed": 3,
  "failed": 1,
  "passRate": 0.75,
  "gateCleared": true
}
```

## Phase 0 Corpus Measurement

Command:

```bash
node scripts/measure-sesl-simcontract.mjs --input=C:/Users/josep/.ai-ecosystem/research/paper-17-sesl-corpus/phase-0-corpus.jsonl --json
```

Observed local result on 2026-05-06:

```json
{
  "totalRecords": 7692,
  "measuredPairs": 0,
  "passed": 0,
  "failed": 0,
  "unmeasuredPairs": 7692,
  "passRate": null,
  "gateCleared": false
}
```

The paired Phase 0 manifest originally reported `total_pairs: 7692` and `cael_verified_pairs: 0` at `C:/Users/josep/.ai-ecosystem/research/paper-17-sesl-corpus/manifest.json`. That remains the correct interpretation for existing Apr-May benchmark runs. The HoloScript Phase 1 path is now the separate verified-pair counter.

## Ceiling

The current ceiling is not "below 60%" yet. It is "not computable from Phase 0." The corpus has enough static seed records to feed Phase 1, but none of those records carry a SimulationContract pass/fail proof field. The harness therefore reports:

- `measuredPairs=0`
- `passRate=null`
- `gateCleared=false`
- `ceiling.kind=phase0-static-corpus`

This was the correct Phase 0 paper-gate state. Paper 17 can now claim that the Phase 1 emission path exists, while still reporting the production corpus as 1 / 5,000 CAEL-verified pairs.

## Closeout

### W -- one wisdom

A paper gate is only real when the measurement field names the proof source. Static seed-pair success is not SimulationContract success.

### P -- one reusable pattern

Measure contract pass rate from explicit `simContractCheck` or per-mutation contract fields, then report volume and pass-rate gates separately. This keeps a healthy pass rate from hiding a low sample count.

### G -- one gotcha

Treating `outcome=success` as a SimContract pass would silently promote Phase 0 seed data into Phase 1 evidence. Tell: the pass-rate code reads `outcome` but never reads `simContractCheck`. Fix: leave the pair unmeasured until the harness emits contract proof.

### Evidence path

- Artifact(s):
  - `scripts/measure-sesl-simcontract.mjs`
  - `scripts/build-paper17-sesl-phase1-pair.ts`
  - `research/paper-17-sesl-pairs/phase-1-corpus.jsonl`
  - `research/paper-17-sesl-pairs/INDEX.json`
  - `research/paper-17-sesl-pairs/cael-traces/`
  - `research/paper-17-sesl-pairs/fixtures/simcontract-measurement-smoke.ndjson`
  - `research/paper-17-sesl-pairs/fixtures/phase1-seed.jsonl`
  - `research/2026-05-06_paper-17-sesl-simcontract-pass-rate-harness.md`
- Verification:
  - `pnpm exec tsx scripts/build-paper17-sesl-phase1-pair.ts`
  - `node --check scripts/measure-sesl-simcontract.mjs`
  - `node scripts/measure-sesl-simcontract.mjs --input=research/paper-17-sesl-pairs/phase-1-corpus.jsonl --target-pairs=1 --target-pass-rate=0.6 --json`
  - `node scripts/measure-sesl-simcontract.mjs --input=research/paper-17-sesl-pairs/INDEX.json --target-pairs=1 --target-pass-rate=0.6 --json`
  - `node scripts/measure-sesl-simcontract.mjs --input=research/paper-17-sesl-pairs/fixtures/simcontract-measurement-smoke.ndjson --target-pairs=4 --target-pass-rate=0.6 --json`
  - `node scripts/measure-sesl-simcontract.mjs --input=C:/Users/josep/.ai-ecosystem/research/paper-17-sesl-corpus/phase-0-corpus.jsonl --json`

### Next action

Scale the Phase 1 SESL generator from the smoke fixture to the full Phase 0 seed corpus. Preserve the same row fields (`simContractCheck`, `cael_trace`, `cael_hash_chain_valid`, and `score`) so fleet audits can count real verified pairs from `INDEX.json.gate.cael_verified_pairs`.
