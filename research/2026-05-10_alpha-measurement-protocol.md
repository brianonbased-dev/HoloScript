# Alpha-Acceptance-Rate Measurement Protocol for Tier-2 LLM-Speculative Dispatch

**Date**: 2026-05-10
**Target**: Paper 19 / Paper 20 (ML-benchmarks track)
**MVP proving ground**: `@grabbable` interaction trait
**Source**: `research/2026-05-09_nn-primary-cpu-backup-holoscript-EVOLVED.md` (AUTONOMIZE phase)
**Consuming system**: `packages/core/src/compiler/dispatch/DispatchPolicy.ts`
**Status**: Protocol memo — ready for implementation

---

## 1. Executive Summary

This protocol defines how to measure, gate, and report the **speculative-decoding alpha (acceptance rate)** for HoloScript's Tier-2 LLM-speculative dispatch path. The metric is the fraction of LLM-proposed trait operations that pass the CPU verifier (EffectInference + SimulationContract) and are accepted instead of falling back to Tier-3 CPU-direct.

The protocol is scoped to the `@grabbable` MVP but designed to generalize to all interaction traits. It produces reviewer-survivable numbers: concrete splits, a locked baseline, pre-registered thresholds, and statistical significance gates.

---

## 2. Phase 1 — Dataset Construction

### 2.1 Scope: `@grabbable` scenarios

The `@grabbable` trait (and its interaction siblings `@hoverable`, `@clickable`, `@draggable`, `@throwable`) are the MVP proving ground because:
- They have a dedicated dispatch policy (`GrabbableDispatchPolicy.ts`)
- They are SNN-compatible (`isTraitSnnCompatible` maps them to the Tier-1 hot path)
- They have high-frequency user interaction (many samples per session)
- They are already instrumented in the comparative-benchmarks suite

### 2.2 In-domain vs out-of-domain definition

| Category | Definition | Example |
|----------|------------|---------|
| **In-domain** | `@grabbable` inside standard HoloScript scenes with 1–5 interaction traits, no physics overrides, no custom shaders | `examples/traits/interaction-grabbable-clickable-hoverable.holo` |
| **Near-OOD** | `@grabbable` in scenes with 6–10 interaction traits, physics overrides (gravity, mass), or networked multiplayer | `examples/multiplayer/authority-demo.holo` |
| **Far-OOD** | `@grabbable` in non-standard contexts: robotics URDF, medical anatomy, IoT smart-factory, or VRChat-specific hooks | `examples/robotics/robot-arm-simulation.holo`, `examples/iot/smart-factory-twin.holo` |
| **Adversarial** | Deliberately malformed or contradictory configurations (e.g., `@grabbable` + `@static` + `@kinematic`) | Synthesized stress-test rows |

**Rationale**: Tier-2 LLM speculative dispatch is most valuable when the LLM proposes refinements to a known trait configuration. In near-OOD and far-OOD scenarios, the LLM has no reliable training signal and should demote to Tier-3. The protocol must measure whether the alpha tracker correctly reflects this.

### 2.3 Dataset schema

```typescript
interface AlphaMeasurementRow {
  id: string;                    // "alpha-NNNNN"
  scenarioId: string;              // links to a scene file or benchmark
  split: 'train' | 'dev' | 'test';
  domain: 'in-domain' | 'near-ood' | 'far-ood' | 'adversarial';

  // Input to Tier-2
  trait: 'grabbable' | 'hoverable' | 'clickable' | 'draggable' | 'throwable';
  nodeConfig: Record<string, unknown>;   // the trait configuration payload
  sceneContext: string;            // scene file path or serialized snippet

  // Ground truth (Tier-3 CPU-direct execution)
  groundTruth: {
    effectInferenceResult: boolean;
    simulationContractResult: boolean;
    tier3OutputHash: string;      // FNV-1a of deterministic Tier-3 output
  };

  // Tier-2 LLM proposal
  llmProposal: {
    provider: string;             // e.g., 'claude-4-7-sonnet', 'ollama-llama3'
    proposedConfig: Record<string, unknown>;
  };

  // Verdict
  verifierPassed: boolean;         // EffectInference + SimulationContract both pass
  accepted: boolean;               // verifierPassed && alpha >= threshold
  alphaAtDispatch: number;         // rolling alpha when this row was evaluated

  // Metadata
  metadata: {
    traitClass: 'spatial' | 'semantic' | 'safety-critical';
    latencyMs: number;
    novelCombination: boolean;    // trait combo not seen in train
  };
}
```

### 2.4 Splits

| Split | Count (target) | Selection criteria |
|-------|----------------|--------------------|
| **Train** | ≥ 2,000 | In-domain only. Used to establish the LLM's baseline competence on standard `@grabbable` configs. |
| **Dev** | ≥ 300 | 50% in-domain, 30% near-OOD, 20% far-OOD. Used to tune `tier2AlphaThreshold`. |
| **Test (held-out)** | ≥ 500 | 40% in-domain, 25% near-OOD, 20% far-OOD, 15% adversarial. **Frozen before any threshold tuning.** |

**Novel-combination sub-split**: Within test, ≥ 100 rows must contain trait combinations not present in train (e.g., `@grabbable` + `@damage_dealer` + `@stackable`). This is the adversarial-split analogue from Paper 19, adapted to dispatch decisions.

**Leakage prevention**: Test scenario IDs are hashed with a salt stored in `research/2026-05-10_alpha-protocol-salt.bin`. No agent may view test rows before the final measurement run.

### 2.5 Sourcing

| Source | Target % | Rationale |
|--------|----------|-----------|
| Existing `.holo` / `.hsplus` examples | 40% | Real-world configurations from `examples/` and `benchmarks/` |
| Brittney synthetic generation | 35% | LLM-generated scenes, then CPU-verified for ground truth |
| Stress-test adversarial corpus | 15% | Deliberately malformed configs (see `examples/stress-tests/`) |
| Community / open-source scenes | 10% | External validation of generalization |

**Negative examples**: ≥ 5% of rows per split should be configurations where `groundTruth.tier3OutputHash` indicates the Tier-3 execution **rejects** the configuration as invalid. Without negatives, the verifier learns to always-pass.

---

## 3. Phase 2 — Baseline Implementation

### 3.1 Baseline: Tier-3 CPU-direct execution

The ground truth for every row is the deterministic output of Tier-3 CPU-direct execution. This is **not** a competing baseline like Paper 19's keyword match; it is the **oracle** against which Tier-2 proposals are judged.

**Implementation pointer**: `packages/core/src/compiler/dispatch/DispatchPolicy.ts::fallbackTier3()` — deterministic, no LLM involvement.

**Baseline metric**: Not a headline F1, but a **determinism check**:
- Run Tier-3 on the same input 5 times with different `performance.now()` offsets
- Assert bitwise-identical `tier3OutputHash` across all 5 runs
- If non-determinism is detected, the dataset is invalid until the root cause is fixed

### 3.2 Trivial baseline: always-Tier-3

For comparison, measure the system that always routes to Tier-3:
- Latency: higher (no Tier-2 short-circuit)
- Energy: higher (no SNN/WebGPU fast path)
- Accuracy: perfect (by definition — ground truth is Tier-3)
- Throughput: lower

This gives the cost-of-correctness floor.

### 3.3 Strong baseline: keyword-match Tier-2

A non-LLM baseline: if the trait configuration matches a known good configuration (from train set), route Tier-2; else Tier-3. This isolates the LLM's value-add from mere memorization.

---

## 4. Phase 3 — Contribution Model (Alpha Tracking System)

### 4.1 Alpha definition

Alpha is the **rolling-window acceptance rate** of Tier-2 proposals:

```
alpha(t) = (number of accepted proposals in last W attempts) / W
```

Where `W = alphaWindowSize` (default 50, configurable per `DispatchPolicyConfig`).

This mirrors speculative-decoding literature (Leviathan et al. 2022, Chen et al. 2023) where alpha is the fraction of draft tokens accepted by the target model.

### 4.2 Per-trait-class alpha reporting

The protocol requires alpha to be reported **stratified by trait subclass**, not just globally. The stratification follows the Lean 4 formalization in `MSC.AcceptanceGate`:

| Trait subclass | Traits | Expected alpha | Notes |
|----------------|--------|----------------|-------|
| **Spatial / Perceptual** | `grabbable`, `hoverable`, `draggable`, `throwable` | High (≥ 0.90) | Well-understood physics; LLM rarely hallucinates mass/friction |
| **Semantic / Agentic** | `clickable` (when linked to AI agent behavior) | Moderate (0.75–0.85) | LLM may propose valid-but-unintended agent actions |
| **Safety-critical** | *(none in MVP, but protocol must account for them)* | **N/A** | Per `safety_critical_never_accepted` theorem: safety-critical traits are NEVER accepted on Tier-2. Alpha is undefined (always 0). |

Reporting requirement: for every measurement run, emit a table with columns `[traitSubclass, W, accepted, attempted, alpha, CI95]`.

### 4.3 Confidence thresholds

#### Tier promotion (Tier-2 → Tier-1)

When alpha for a trait subclass exceeds `tier1PromotionAlpha` **and** the runtime detects a compatible Tier-1 device (WebGPU SNN or NIR neuromorphic), the dispatch policy may promote the trait to Tier-1.

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| `tier1PromotionAlpha` | 0.95 | Near-perfect acceptance before trusting the SNN hot path. SNN is energy-cheap but reprogramming is expensive. |
| `tier1PromotionMinSamples` | 100 | Must have ≥ 100 attempts in the rolling window before promotion is considered. |
| `tier1PromotionCooldownMs` | 5000 | After a demotion, wait 5s before re-promotion (hysteresis). |

#### Tier demotion (Tier-2 → Tier-3)

When alpha for a trait subclass drops below `tier2AlphaThreshold`, Tier-2 is disabled for that subclass until alpha recovers.

| Parameter | Default | Rationale |
|-----------|---------|-----------|
| `tier2AlphaThreshold` | 0.85 | From `GrabbableDispatchPolicy.ts`. Below this, the LLM's proposals are rejected more than 15% of the time — not worth the latency. |
| `tier2DemotionMinSamples` | 20 | Must have ≥ 20 attempts before demotion triggers (avoid noise on small samples). |
| `tier2DemotionHysteresis` | 0.05 | Alpha must recover to `threshold + hysteresis` (0.90) before Tier-2 is re-enabled. |

**Per `MSC.AcceptanceGate` monotonicity theorem**: raising the threshold never rejects more previously-accepted results; lowering it never accepts more previously-rejected results. The protocol must verify this property empirically.

---

## 5. Phase 4 — Evaluation Protocol

### 5.1 Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Global alpha** | Accepted / attempted across all test rows | ≥ 0.85 |
| **In-domain alpha** | Accepted / attempted on in-domain test rows | ≥ 0.90 |
| **Near-OOD alpha** | Accepted / attempted on near-OOD test rows | ≥ 0.70 |
| **Far-OOD alpha** | Accepted / attempted on far-OOD test rows | ≥ 0.50 (or explicit demotion to Tier-3) |
| **Adversarial rejection rate** | Rejected / attempted on adversarial rows | ≥ 0.95 (verifier must catch bad proposals) |
| **Tier-1 promotion rate** | Traits promoted to Tier-1 / total eligible | Reported, not gated (depends on hardware availability) |
| **Latency delta** | `latency_Tier2_accepted - latency_Tier3` | ≤ 15ms (Tier-2 must be faster than Tier-3 to justify the path) |
| **Energy delta** | `energy_Tier2 - energy_Tier3` | ≤ 2× (per W.GOLD.015: trust overhead < 2%) |

### 5.2 Statistical significance gates (G.GOLD.013 / G.GOLD.015)

#### G.GOLD.013: Test the false case

For every trait subclass and every threshold configuration, the protocol MUST include a **false-case test**:
- When alpha is below threshold, demotion happens.
- When the verifier rejects, the proposal is not accepted.
- When the LLM proposes an invalid config, the verifier catches it.

**Implementation**: For each measurement run, report:
- True positive: accepted + ground truth valid
- True negative: rejected + ground truth invalid
- False positive: accepted + ground truth invalid (**must be 0 for safety-critical traits**)
- False negative: rejected + ground truth valid (acceptable but costly)

The false-positive rate is the critical safety metric. For the `@grabbable` MVP (no safety-critical traits in scope), target false-positive rate < 0.01.

#### G.GOLD.015: Instrument the boring gaps

Test suites optimize for experienced failure categories. The next failure will be in an uninstrumented category. Therefore:
- **Wiring tests**: Every trait subclass must have ≥ 1 test row, even if the expected behavior is "always demote to Tier-3."
- **Edge-case coverage**: Test rows must include empty configs, missing required fields, extra unknown fields, and deeply nested configs.
- **Provider coverage**: If the protocol supports multiple LLM providers, each provider must be evaluated independently (alpha may differ by provider).

### 5.3 Held-out split protocol

1. **Freeze test set** before any threshold tuning or model selection.
2. **No peeking**: Test row IDs are salted and stored separately.
3. **Single final evaluation**: The test set is evaluated exactly once for the headline numbers. If a bug is found, the test set is re-evaluated with the fix, but the previous run is archived (not replaced).
4. **Bootstrap CI**: For each metric, compute 95% CI via percentile bootstrap (10,000 resamples) over the test rows. Report mean and CI, not just mean.

### 5.4 Pre-registration

Before the first measurement run, freeze the following in `research/2026-05-10_alpha-preregistration.md`:
- Target metrics and thresholds (table in §5.1)
- Test split definition and salt hash
- LLM provider version and temperature
- Verifier implementation commit hash
- Rolling window size W
- Demotion/promotion parameters

After-the-fact threshold shopping is a reviewer red flag (per `/ml-experiments` discipline).

### 5.5 Ablation matrix

| Ablation | What is removed | Expected impact |
|----------|----------------|-----------------|
| No SimulationContract gate | EffectInference only | Alpha increases (more accepted), but false-positive rate may rise |
| No EffectInference gate | SimulationContract only | Alpha increases, but semantic validity may drop |
| No LLM proposal (random config) | Baseline: random proposals | Alpha collapses to ~0 (verifier catches random configs) |
| Fixed threshold (no rolling alpha) | Alpha = all-time rate | Slower adaptation to distribution shift |
| W = 10 (vs 50) | Smaller rolling window | Higher variance, faster adaptation but noisier demotions |
| W = 200 | Larger rolling window | Lower variance, slower adaptation |

---

## 6. Integration with DispatchPolicy

### 6.1 Runtime instrumentation

`DispatchPolicy.ts` already contains `AlphaTracker` and `DispatchMetrics`. The protocol extends this with:

```typescript
interface AlphaMeasurementReport {
  timestamp: string;
  policyConfig: DispatchPolicyConfig;
  windowSize: number;
  globalAlpha: number;
  perSubclassAlpha: Record<TraitSubclass, { alpha: number; accepted: number; attempted: number }>;
  testSetMetrics: {
    inDomainAlpha: number;
    nearOodAlpha: number;
    farOodAlpha: number;
    adversarialRejectionRate: number;
    falsePositiveRate: number;
  };
  bootstrapCI95: Record<string, [number, number]>;
}
```

### 6.2 CURE provenance integration

Every dispatch decision is already recorded as a `ProvenanceValue` in `DispatchPolicy.ts::buildDecision()`. The protocol adds:
- `alphaAtDispatch` to the provenance value
- `testSetId` (if the row is part of a formal measurement run)
- `groundTruthHash` (for replay verification)

This allows a third party to replay the exact dispatch sequence and verify the alpha computation.

### 6.3 Replay verification

Per W.GOLD.013 (Trust by Construction), the protocol must support deterministic replay:
1. Record the full dispatch decision stream (including LLM proposal, verifier result, alpha value).
2. Replay the stream through a fresh `DispatchPolicy` instance with the same config.
3. Assert identical alpha values and identical tier routing at every step.

This is the "exact replay" guarantee (SimulationContract guarantee #6).

---

## 7. Deliverables and Next Steps

### 7.1 Immediate deliverables (this memo)

- [x] Protocol memo: `research/2026-05-10_alpha-measurement-protocol.md` (this file)
- [ ] Pre-registration: `research/2026-05-10_alpha-preregistration.md`
- [ ] Dataset generator: `scripts/alpha-measurement/generate-dataset.mjs`
- [ ] Baseline harness: `scripts/alpha-measurement/run-baseline.mjs`
- [ ] Measurement harness: `scripts/alpha-measurement/run-measurement.mjs`
- [ ] Reporter: `scripts/alpha-measurement/report.mjs`

### 7.2 Next tasks (file on board)

1. **Dataset generation** — harvest `@grabbable` scenarios from `examples/`, synthesize near-OOD / far-OOD / adversarial variants, split per §2.4.
2. **Baseline lock** — run Tier-3 deterministic ground truth on all rows, lock the output hashes.
3. **Measurement run** — run Tier-2 (with LLM provider) on dev set, tune thresholds, then single-shot evaluate on frozen test set.
4. **Paper integration** — add alpha results to Paper 19 (trait inference) as a secondary metric, or Paper 20 (scene composition) as a dispatch-policy evaluation.
5. **Lean 4 formalization** — extend `MSC.AcceptanceGate` with alpha-monotonicity theorems that reference the empirical measurement (connecting formal proof to runtime metric).

### 7.3 Consumption by dispatch-policy MVP

The `DispatchPolicy` constructor in `GrabbableDispatchPolicy.ts` should read:

```typescript
export const DEFAULT_GRABBABLE_DISPATCH_CONFIG: DispatchPolicyConfig = {
  tier1BrowserEnabled: true,
  tier1NeuromorphicEnabled: false,
  tier2Enabled: true,
  tier2AlphaThreshold: 0.85,   // from §4.3
  alphaWindowSize: 50,         // from §4.1
  // tier1PromotionAlpha: 0.95, // uncomment when Tier-1 promotion is implemented
};
```

When the measurement protocol reports that `@grabbable` in-domain alpha has stabilized above 0.90 for ≥ 100 samples, the dispatch policy may enable Tier-1 promotion for that trait subclass.

---

## 8. References

- `research/2026-05-09_nn-primary-cpu-backup-holoscript-EVOLVED.md` — parent research file
- `packages/core/src/compiler/dispatch/DispatchPolicy.ts` — implementation
- `packages/core/src/traits/GrabbableDispatchPolicy.ts` — MVP config
- `research/papers-22-23-mechanization/MSC/AcceptanceGate.lean` — formal gate theorems
- `research/paper-19/datasets/phase-3-trait-inference-2000row-v2.README.md` — dataset discipline template
- W.GOLD.013 — Trust by Construction (three tiers of simulation trustworthiness)
- W.GOLD.015 — When Trust Is Free (verification cost < 2% opens verticals)
- G.GOLD.013 — Test false case for computed assertions
- G.GOLD.015 — Instrument boring gaps (next failure is uninstrumented)

---

**Closing pattern**: `PROTOCOL.READY│dataset.next│baseline.next│measurement.next│paper-integration.next│lean4-link.next◓`
