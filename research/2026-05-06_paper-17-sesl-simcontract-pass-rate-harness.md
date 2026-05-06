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

**TL;DR:** Paper 17 now has a SimContract pass-rate measurement harness at `scripts/measure-sesl-simcontract.mjs`. It counts only explicit SimContract evidence fields and refuses to equate static corpus success with contract success. The current Phase 0 corpus at `C:/Users/josep/.ai-ecosystem/research/paper-17-sesl-corpus/phase-0-corpus.jsonl` has 7,692 records but 0 measurable SimContract pairs, so the current pass-rate ceiling is "not computable yet" rather than a fake 100% or 0% pass rate.

- **W --** A paper gate is only real when the measurement field names the proof source; static seed-pair success is not SimContract success.
- **P --** Measure `simContractCheck`, `sim_contract_passed`, or per-mutation SimContract fields first, then report volume and pass-rate gates separately.
- **G --** Treating `outcome=success` as a SimContract pass would silently promote Phase 0 seed data into Phase 1 evidence.

**Evidence:** `scripts/measure-sesl-simcontract.mjs`; `research/paper-17-sesl-pairs/fixtures/simcontract-measurement-smoke.ndjson`; local Phase 0 corpus measurement run.

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

The paired Phase 0 manifest reports `total_pairs: 7692` and `cael_verified_pairs: 0` at `C:/Users/josep/.ai-ecosystem/research/paper-17-sesl-corpus/manifest.json`. The existing pair INDEX reports `pairs_collected: 0` and `pass_rate: null` at `C:/Users/josep/.ai-ecosystem/research/paper-17-sesl-pairs/INDEX.json`.

## Ceiling

The current ceiling is not "below 60%" yet. It is "not computable from Phase 0." The corpus has enough static seed records to feed Phase 1, but none of those records carry a SimulationContract pass/fail proof field. The harness therefore reports:

- `measuredPairs=0`
- `passRate=null`
- `gateCleared=false`
- `ceiling.kind=phase0-static-corpus`

This is the correct paper-gate state. The next corpus collection pass must emit one of the explicit SimContract fields listed above before Paper 17 can claim a pass rate.

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
  - `research/paper-17-sesl-pairs/fixtures/simcontract-measurement-smoke.ndjson`
  - `research/2026-05-06_paper-17-sesl-simcontract-pass-rate-harness.md`
- Verification:
  - `node --check scripts/measure-sesl-simcontract.mjs`
  - `node scripts/measure-sesl-simcontract.mjs --input=research/paper-17-sesl-pairs/fixtures/simcontract-measurement-smoke.ndjson --target-pairs=4 --target-pass-rate=0.6 --json`
  - `node scripts/measure-sesl-simcontract.mjs --input=C:/Users/josep/.ai-ecosystem/research/paper-17-sesl-corpus/phase-0-corpus.jsonl --json`

### Next action

Wire the Phase 1 SESL generator so each emitted pair includes `simContractCheck.passed` or per-mutation `sim_contract_passed` values. Then rerun this harness against the Phase 1 JSONL corpus and update the paper gate.
