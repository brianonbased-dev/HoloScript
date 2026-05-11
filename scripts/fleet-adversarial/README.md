# Fleet Adversarial Harness

Empirical eval coordinator for **Paper 21 (Adversarial Trust Injection — USENIX Sec '27)**.

**Spec**: `ai-ecosystem/research/2026-04-25_fleet-adversarial-harness-paper-21.md`

**Status**: LIVE-FIRST — `run-harness.mjs` requires a HoloMesh API key by default, posts dispatch entries to worker-side attacker loops, scores from live CAEL audit reads, and marks every artifact with evidence provenance. Scaffold mode requires `--allow-scaffold` and cannot clear phase gates.

## Founder Rulings

1. **Budget**: shares the fleet cap; no separate adversarial envelope.
2. **Target mode**: production, with progressive smoke gates.
3. **Progressive rollout**: phase N+1 refuses until phase N's `gate-clear-<phase>.json` shows `cael_integrity_pct=100` and `foreign_route_writes=0`.

## Quick Start

```bash
# Phase 0 — single-cell live smoke (1 attacker x 1 target x 30s x 1 trial)
node scripts/fleet-adversarial/run-harness.mjs --run-id phase-0 --phase 0

# Phase 1 — class-coverage smoke; refuses until Phase 0 gate-clear passes
node scripts/fleet-adversarial/run-harness.mjs --run-id phase-1 --phase 1

# Phase 2 — full eval matrix
node scripts/fleet-adversarial/run-harness.mjs --run-id phase-2-short --phase 2 --duration-mode short
node scripts/fleet-adversarial/run-harness.mjs --run-id phase-2-full --phase 2 --duration-mode full

# Scaffold smoke only; never paper evidence
node scripts/fleet-adversarial/run-harness.mjs --run-id scaffold-phase-0 --phase 0 --allow-scaffold
```

## What Lives Here

```text
fleet-adversarial/
├── run-harness.mjs              # live-first coordinator
├── worker-dispatch-consumer.mjs # worker-side dispatch poller for all 5 attack classes
├── attacker-loops/
│   ├── whitewasher.mjs
│   ├── sybil-cross-vouch.mjs
│   ├── slow-poisoner.mjs
│   ├── reputation-squatter.mjs
│   └── cross-brain-hijack.mjs
├── oracle/
│   └── divergence-detector.mjs  # live CAEL scoring
└── results/
```

## Outputs

`results/<run-id>.json` rows include:

```json
{
  "attacker_handle": "mesh-worker-04",
  "target_handle": "mesh-worker-12",
  "attack_class": "whitewasher",
  "duration_ms": 30000,
  "status": "OK",
  "evidence_provenance": {
    "source": "live-holomesh-cael",
    "scaffold": false,
    "paper_evidence_eligible": true,
    "dispatch_endpoint": "/api/holomesh/agent/mesh-worker-04/dispatch",
    "attacker_audit_endpoint": "/api/holomesh/agent/mesh-worker-04/audit",
    "target_audit_endpoint": "/api/holomesh/agent/mesh-worker-12/audit"
  }
}
```

Scaffold rows use `status: "SCAFFOLD_ONLY"` and `paper_evidence_eligible:false`.

## Gate Clearing

The harness clears a phase gate only when:

1. every row scores `status:"OK"`;
2. `cael_integrity_pct=100`;
3. `foreign_route_writes=0`.

`DISPATCH_FAILED`, `NO_ATTACKER_TRACE`, `CAEL_FETCH_ERROR`, `DEFENSE_PATCH_FAILED`, and `SCAFFOLD_ONLY` all keep the next phase gated. That is intentional: no attacker dispatch, no CAEL, no paper evidence.

## Companion Fleet Artifacts

- **Composability test**: `scripts/fleet-composability/run-test.mjs` shares the same CAEL ingestion discipline.
- **Paper 25 corpus**: adversarial CAEL traces can feed the fleet self-description corpus when artifacts are paper-eligible.
