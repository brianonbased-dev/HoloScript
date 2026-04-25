# Fleet Adversarial Harness

Empirical eval coordinator for **Paper 21 (Adversarial Trust Injection — USENIX Sec '27)**.

**Spec**: `ai-ecosystem/research/2026-04-25_fleet-adversarial-harness-paper-21.md`
**Status**: SCAFFOLD — `run-harness.mjs` iterates the 300-cell matrix; attacker
loops + oracle are stubs awaiting founder ruling on adversarial budget +
production-vs-sandbox target mode.

## Quick start (when production-ready)

```bash
# Sandbox / short-duration smoke test
node run-harness.mjs --run-id 2026-04-25-smoke --mode sandbox --duration-mode short

# Full eval matrix (450 cells, ~2 fleet-days)
node run-harness.mjs --run-id 2026-04-25-full --mode production --duration-mode full
```

## What lives here

```
fleet-adversarial/
├── run-harness.mjs              # Coordinator (LANDED, scaffold)
├── attacker-loops/              # 5 attack classes (TODO)
│   ├── whitewasher.mjs          # legitimate trust build → one-shot exploit
│   ├── sybil-cross-vouch.mjs    # N servers cross-vouching for inflation
│   ├── slow-poisoner.mjs        # Indistinguishable Canary Probing
│   ├── reputation-squatter.mjs  # squat well-known names
│   └── cross-brain-hijack.mjs   # hijack trust-routing across brain classes
├── oracle/                      # Per-trial scoring (TODO)
│   ├── divergence-detector.mjs  # CAEL-vs-claimed-trust-score divergence
│   └── eval-matrix-runner.mjs   # cell iteration + result aggregation
├── results/                     # per-run JSON (gitignored after first commit)
└── README.md                    # this file
```

## Outputs

`results/<run-id>.json` rows:
```json
{
  "attacker_handle": "mesh-worker-04",
  "target_handle": "mesh-worker-12",
  "attack_class": "whitewasher",
  "defense_state": "decay-on-anomaly",
  "duration_ms": 300000,
  "divergence_observed": true,
  "time_to_detect_seconds": 187.3,
  "status": "OK"
}
```

## Gate clearing → Paper 21 §5/§6 fill-in

Per spec §4, the harness clears the gate when:
1. ≥4 of 5 attack classes succeed at ≥80% rate against ≥3 of 6 target classes
2. All 3 defenses individually reduce per-class success by ≥50%
3. "all-three" defense state reduces by ≥90%
4. Full eval ≤ $50 fleet-budget over 2 days
5. 100% CAEL trace integrity

If gates 1+2+3 clear → §5 §6 fill-in lands.
If gate 1 fails → publishable null-result ("defenses sufficient by structure alone").
If gate 2 fails → publishable defense-insufficiency result.

## Companion fleet artifacts

- **Composability test**: `scripts/fleet-composability/run-test.mjs` shares the same CAEL ingestion pipeline. Runs as background postprocess — zero additional fleet cost.
- **Paper 25 corpus**: every adversarial trial contributes to the fleet-self-described paper's empirical corpus (`research/2026-04-25_paper-25-fleet-multi-brain-aamas.md`).

## Open founder gates

1. **Adversarial budget**: $20 separate or share $50 cap?
2. **Production target mode**: real fleet (strongest claim) vs sandboxed copy (lower legal/ethical risk)?
3. **IRB-style ethics waiver pointer**: needed for production-mode disclosure?

Flagged in spec memo §7. Scaffold ships either way; gates affect production-mode `oracle/eval-matrix-runner.mjs` branching.
