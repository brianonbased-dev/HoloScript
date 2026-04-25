# Fleet-Scale Composability Test

Empirical defense for **W.GOLD.189 (Diamond) — Algebraic Trust (Tropical-Semiring tri-layer framing)**.

**Spec**: `ai-ecosystem/research/2026-04-25_fleet-empirical-composability-w-gold-189.md`
**Status**: SCAFFOLD — `run-test.mjs` runs end-to-end with 31 agents loaded; CAEL
ingestion + tropical-semiring compose are synthetic stubs awaiting wire-up to:
1. `@holoscript/core` SemiringHash module (production tropical min-plus compose)
2. `/api/holomesh/agent/<handle>/audit?tick=<iso>` endpoint (CAEL trace read)

## Quick start

```bash
# Smoke test (2 windows, 60s each, deterministic synthetic CAEL)
node scripts/fleet-composability/run-test.mjs --run-id smoke --tick-windows 2

# Full 24h sweep (4 windows at 00:00, 06:00, 12:00, 18:00 UTC)
node scripts/fleet-composability/run-test.mjs --run-id 2026-04-25-A --tick-windows 4
```

Smoke output (current scaffold):
```
fleet size=31
window 0 ... assoc=FAIL perm=FAIL idem=PASS (5ms)
window 1 ... assoc=FAIL perm=FAIL idem=PASS (7ms)
SUMMARY:
  Associativity:           0/2
  Permutation invariance:  0/2
  Idempotency:             2/2
  Tractability (<10s):     PASS
  Fleet N:                 31
OUTCOME: Case B — algebraic identity has a structural limit at fleet scale
```

## Why the scaffold currently FAILS associativity (this is correct)

The scaffold uses `SHA-256(left || ":" || right)` as `tropicalCompose` for
self-containment. SHA-concat is **deterministic** but NOT **commutative** and
not the true tropical (min,+) semiring W.GOLD.189 references.

Real production:
- `@holoscript/core` SemiringHash uses min-plus on hash field elements
- min-plus IS commutative AND associative → fwd = rev = rand all hold
- Idempotency holds for both stub and production (correctly PASSES on scaffold)

The scaffold's FAIL reveals a useful sub-result: the framing of W.GOLD.189
must distinguish associativity (always true under `@holoscript/core`) from
commutativity (true only because tropical (min,+) is commutative — would not
hold for arbitrary semirings). This distinction is added to the spec memo §3.

## Outputs

`results/<run-id>.json`:
```json
{
  "fleet_n": 31,
  "summary": {
    "associativity_passes": 4,
    "permutation_invariance_passes": 4,
    "idempotency_passes": 4,
    "tractability_pass": true
  },
  "windows": [...]
}
```

## Outcome cases (per spec §4)

- **Case A** (all gates pass): W.GOLD.189 has its strongest empirical defense to date. Lands as Capstone-UIST §sec:eval:fleet `\subsection{Fleet-Scale Composability Test}`.
- **Case B** (gates 2-4 fail at some N): Discovery of a structural limit. Becomes a revision of W.GOLD.189 (F.030 retire-with-archive) OR a standalone short paper.
- **Case C** (gate 5 fails): Composability holds but tractability fails. Engineering paper (PPoPP / SOSP).

All three outcomes ship a deliverable.

## Companion fleet artifacts

- **Adversarial harness**: `scripts/fleet-adversarial/run-harness.mjs` — every adversarial trial generates 31 agents' worth of hash chains. This composability test runs as background postprocess on the same data → zero additional fleet cost.
- **Paper 25 corpus**: composability test results land in `paper-25-fleet-multi-brain-aamas` §6 as one of the flagship empirical artifacts.

## TODO for production wire-up

1. Replace `tropicalCompose` / `idempotentJoin` stubs with imports from `@holoscript/core/semiring-hash`
2. Replace `captureAgentChain` synthetic generator with HoloMesh API call to `/api/holomesh/agent/<handle>/audit?tick=<iso>` (audit producer landed in HS commit `94cc69d73`)
3. Add `--source` flag: `synthetic` (default, scaffold) | `cael` (production)
4. Add `--ground-truth` flag: skip windows where any agent has missing ticks (reproducibility)
