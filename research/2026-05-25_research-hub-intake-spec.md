# Research Hub Claim Intake Spec

> Date: 2026-05-25
> Task: `task_1779744793933_lqr3`
> Status: planning memo
> Scope: D.060 novice-to-advanced research hub intake over the Paper 36 Conjecture Engine.

## Top-Line Claim

This intake reduces a raw intuition to a falsifiable claim before the Conjecture Engine runs.

Falsifier for this memo's claim:

> If an intake reaches `accepted` without a normalized statement, scope bound, falsification criterion, expected evidence shape, and honest verdict path, this memo's claim is false.

This makes the spec testable: a validator can feed example intakes through the schema and reject any accepted record that lacks those fields.

## Product Boundary

D.060 is the novice on-ramp to the same trust pipeline used by advanced Papers-as-Service work. It is not a hypothesis generator and must not be marketed as one. The product is the trust layer around a claim: make the claim bounded, make the falsifier explicit, run or refuse the probe, produce a receipt, and return an honest verdict.

Public posture, brand language, comparisons to Gemini or other science products, heterodox-claim welcome level, and any "own your theory" framing are FOUNDER-GATED. The technical intake contract below is agent-ownable; external copy is not.

## Claim Schema

Every accepted novice intake must compile to this shape. The fields align with `ConjectureClaim`, `ConjectureFalsifiabilityGate`, and the D.060 verdict discipline, but they stay high-level enough for a frontend or API implementation to collect.

```yaml
claimIntake:
  intakeId: "rh-YYYYMMDD-slug"
  userLevel: "novice | guided | advanced"
  proposedBy: ""
  publicPosture: "founder-gated"

  rawIntuition: ""
  normalizedStatement: ""
  domain: "geometry | number-theory | physics | architecture | gameplay | other"
  claimKind: "geometry.invariant | algebraic.trait | impossibility.boundary | domain-specific"

  scopeBound:
    population: ""
    parameterRange: ""
    assumptions: []
    exclusions: []
    finiteBudget: ""

  falsificationCriterion:
    status: "falsifiable-in-principle | out-of-scope"
    reason: ""
    accessiblePredictions: []
    counterexampleShape: ""
    minimumProbeSet: []

  expectedEvidenceShape:
    receiptType: "conjecture.v1 | conjecture.verdict-ledger.v1 | domain-specific"
    requiredMeasurements: []
    artifactPaths: []
    rerunCommand: ""
    noveltyCheck: "required | optional | not-applicable"
    priorArtCorpus: ""

  enginePlan:
    owningPackage: "@holoscript/engine"
    candidateGenerator: ""
    probeFamily: ""
    noveltyGate: ""
    verdictLedger: true

  honestVerdict:
    state: "PROVEN | FALSIFIED | UNDECIDABLE | UNDER-RESOLVED"
    noveltyModifier: "novel | rediscovered | not-checked | not-applicable"
    receiptKey: ""
    assumptionsHeld: []
    nextAction: ""
```

Reject rules:

- Reject `accepted` if `normalizedStatement` is empty.
- Reject `accepted` if `scopeBound.population`, `scopeBound.assumptions`, or `scopeBound.finiteBudget` is empty.
- Reject `accepted` if `falsificationCriterion.status` is `falsifiable-in-principle` but `accessiblePredictions`, `counterexampleShape`, or `minimumProbeSet` is empty.
- Reject `accepted` if `expectedEvidenceShape.receiptType` or `rerunCommand` is empty.
- Reject public-facing language unless founder approval is attached.

## Novice-To-Advanced Ladder

| Level | Human provides | System derives | Gate to next level |
| --- | --- | --- | --- |
| Novice | Raw intuition, domain guess, what would convince them, examples if any | Plain-language normalized statement, missing assumptions, possible observable predictions | At least one accessible prediction or an honest `UNDECIDABLE` verdict. |
| Guided | Candidate scope, examples/non-examples, rough falsifier, allowed data or simulator | Formal scope bound, counterexample shape, probe sketch, expected evidence shape | A concrete probe family or a clear reason no probe exists. |
| Advanced | Candidate generator, probe family, threshold, corpus/baseline, artifact paths | Engine-ready `ConjectureClaim`, receipt plan, verdict-ledger entry | Engine run produces receipt or refuses as out-of-scope. |

The ladder is allowed to help the user climb. It is not allowed to skip rungs. If a novice cannot supply enough material for a falsifier, the honest output is `UNDECIDABLE`, not a motivational pseudo-claim.

## Honest Verdict States

These are the user-facing verdict states for D.060. They map onto existing engine/ledger statuses without pretending that every receipt is a Lean proof.

| Verdict | Meaning | Engine mapping | User-facing next action |
| --- | --- | --- | --- |
| `PROVEN` | The bounded claim survived the required probes under stated assumptions and produced a receipt. This is receipt-tier proof, not necessarily Lean-tier proof. | `survived`; may carry novelty modifier `novel` or `rediscovered` | Preserve receipt, cite scope, optionally escalate to Lean or paper row. |
| `FALSIFIED` | A probe found a counterexample or failed required criteria. | `falsified` | Preserve counterexample, revise or narrow the claim. |
| `UNDECIDABLE` | No accessible prediction, finite probe, or falsifier exists in the stated scope. | `out-of-scope` | Reframe into a testable subclaim or stop. |
| `UNDER-RESOLVED` | The claim is falsifiable in principle, but current budget, data, or probe coverage cannot decide it. | `undecided` | Increase budget, add probes, or record as assumption-bound. |

Novelty is a separate modifier, not a verdict replacement:

- `rediscovered` means the claim may be true or receipt-proven but is already known or near-duplicate in the available corpus.
- `not-checked` means the user must not claim novelty.
- `novel` means "not found in the configured corpus under the configured check", not "certainly new to humanity".

## Agent Implementation Contract

An implementation agent should treat this as a compile pipeline:

1. Intake raw intuition.
2. Normalize the statement and list exclusions.
3. Ask only for missing fields that affect falsifiability or evidence.
4. Build `scopeBound`.
5. Build `falsificationCriterion`.
6. Choose expected evidence shape and receipt type.
7. Produce an engine plan or an `UNDECIDABLE` refusal.
8. Run or queue the Conjecture Engine only after the schema validates.
9. Record verdict in the append-only verdict ledger.
10. Show the user the receipt, counterexample, or refusal reason.

Do not route novice intake straight to `buildConjectureV1Receipt()` without a completed schema. Paper 36's engine is the executor; D.060's missing product layer is the probe-building and refusal discipline before execution.

## Worked Example

### Raw intuition

> "I think every generated square sheet keeps Euler characteristic 1, even if the triangle order changes."

### Novice intake

The user provides:

- domain guess: geometry
- what would convince them: generated meshes keep the same topology after reordering
- example: square sheets generated by HoloScript
- non-goal: all possible surfaces in mathematics

### Structured claim

```yaml
claimIntake:
  intakeId: "rh-20260525-square-sheet-euler"
  userLevel: "novice"
  proposedBy: "novice-user"
  publicPosture: "founder-gated"
  rawIntuition: "I think every generated square sheet keeps Euler characteristic 1, even if the triangle order changes."
  normalizedStatement: "For HoloScript-generated square-sheet candidates in the configured generator family, Euler characteristic equals 1 and geometry hash is invariant under same-arity primitive reordering."
  domain: "geometry"
  claimKind: "geometry.invariant"
  scopeBound:
    population: "generated square-sheet candidates from createSquareSheetCandidate or its generator-family successor"
    parameterRange: "configured generator seed set and triangle sheet family only"
    assumptions:
      - "triangle primitives are same-arity"
      - "geometry hash canonicalizes primitive order"
    exclusions:
      - "arbitrary non-HoloScript surfaces"
      - "global mathematical theorem about all triangulated manifolds"
    finiteBudget: "run configured generated-family suite over named seeds"
  falsificationCriterion:
    status: "falsifiable-in-principle"
    reason: "A generated candidate with Euler characteristic not equal to 1, degenerate geometry, or changed hash under reordering is a counterexample."
    accessiblePredictions:
      - "geometry.euler_characteristic == 1"
      - "geometry.hash_order_invariant passes"
      - "geometry.non_degenerate passes"
    counterexampleShape: "candidate id, seed, geometry hash, failed probe, and measured values"
    minimumProbeSet:
      - "nonDegenerateGeometryProbe"
      - "geometryHashOrderInvariantProbe"
      - "eulerCharacteristicProbe(1)"
  expectedEvidenceShape:
    receiptType: "conjecture.v1"
    requiredMeasurements:
      - "vertexCount"
      - "elementCount"
      - "eulerCharacteristic"
      - "originalHash"
      - "reorderedHash"
    artifactPaths:
      - "packages/engine/src/simulation/__tests__/ConjectureEngine.test.ts"
    rerunCommand: "pnpm --filter @holoscript/engine test -- ConjectureEngine"
    noveltyCheck: "required"
    priorArtCorpus: "ConjecturePriorArtCorpus or configured geometry corpus"
  enginePlan:
    owningPackage: "@holoscript/engine"
    candidateGenerator: "createSquareSheetCandidate or generated-family successor"
    probeFamily: "geometry invariant probes"
    noveltyGate: "assessConjectureNovelty"
    verdictLedger: true
```

### Verdict

If the run produces a receipt with all probes passing:

```yaml
honestVerdict:
  state: "PROVEN"
  noveltyModifier: "rediscovered"
  receiptKey: "conjecture.v1-sha-..."
  assumptionsHeld:
    - "triangle primitives are same-arity"
    - "geometry hash canonicalizes primitive order"
  nextAction: "Preserve the receipt as a learning artifact; do not claim novelty because the corpus marks this as known topology."
```

If a generated candidate fails the Euler characteristic probe, the verdict is `FALSIFIED` with the candidate as the counterexample. If the user widens the claim to "all possible surfaces" without a finite generator/probe, the verdict becomes `UNDECIDABLE`. If the configured budget exhausts before deciding a larger finite family, the verdict becomes `UNDER-RESOLVED`.

## Validation Hooks To Build Next

- `validateResearchHubIntake(intake)` rejects accepted records missing schema-critical fields.
- `deriveConjectureClaim(intake)` emits a `ConjectureClaim` only after the falsification gate passes.
- `mapConjectureReceiptToHubVerdict(receipt)` maps engine statuses to the four user-facing verdict states plus novelty modifier.
- `recordHubVerdict(receipt)` appends to `conjecture.verdict-ledger.v1`.
- `founderGatePublicPosture(intake)` blocks public/brand fields without founder approval.

## Local Anchors

- `memory/direction_research-hub-novice-to-advanced.md`: canonical D.060 direction; novice rung is unbuilt, public posture is founder-gated, and rigor is the product.
- `research/paper-audit-matrix/gated-research-tracks.md`: Paper 36 gated track; Conjecture Engine has engine, runner, and generate leg shipped, with render and additional sub-classes still gated.
- `packages/engine/src/simulation/ConjectureEngine.ts`: claim, falsifiability gate, receipt, novelty, and engine status types.
- `packages/engine/src/simulation/VerdictLedger.ts`: temporal, assumption-bound verdict ledger.
- `packages/engine/src/simulation/ConjecturePriorArtCorpus.ts`: honest-no prior-art seed and novelty caveats.
- `packages/engine/src/simulation/__tests__/ConjectureEngine.test.ts`: existing tests for out-of-scope, undecided, rediscovered, survivor, and falsified paths.
