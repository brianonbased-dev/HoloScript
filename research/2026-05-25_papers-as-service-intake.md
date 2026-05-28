# Papers-as-Service Intake Template

> Date: 2026-05-25
> Task: `task_1779744793933_czw8`
> Status: planning memo
> Scope: D.032 Papers-as-Service intake and F.037 paper-supporting infrastructure as product infrastructure.

## Purpose

Papers-as-Service should not be a writing service that decorates unproven claims. It is an intake contract that converts an external R&D claim into five linked legs:

1. claim capture
2. falsifiable spec
3. implementation seam
4. measurement plus receipt
5. dual ship as product feature plus paper row

The platform value is the chain, not any one leg. A claim without code is consulting. Code without measurement is a demo. Measurement without receipts is a report. A paper row without a shipped or reproducible product path is prose. Papers-as-Service has to reject partial chains by construction.

## Structural Invariant

An intake with a missing leg is rejected.

No agent may silently demote a missing leg into a weaker artifact such as "research-only", "product-only", "benchmark-only", or "paper-only". The only valid statuses are:

| Status | Meaning |
| --- | --- |
| `draft` | Customer claim has been captured, but the five legs are not complete yet. |
| `rejected-incomplete` | One or more required legs is missing; the intake cannot enter build. |
| `accepted` | All five legs have owners, artifact paths, and acceptance gates. |
| `measured` | The implementation ran and produced the named benchmark plus receipt. |
| `dual-shipped` | Product surface and paper row both landed with evidence links. |

## Five-Leg Template

Use this template for every incoming customer claim. Empty strings, `TBD`, and "not applicable" fail validation unless a founder-approved exception names the replacement leg.

```yaml
intakeId: "pas-YYYYMMDD-slug"
customer:
  organization: ""
  contact: ""
  authorizationScope: ""
  confidentialityTier: "public | customer-confidential | private"

leg1_claim_capture:
  rawCustomerClaim: ""
  normalizedClaim: ""
  claimOwner: ""
  excludedClaims: []
  customerSuccessDefinition: ""
  sourceArtifacts:
    - pathOrUrl: ""
      digestOrReceipt: ""
  acceptanceGate: "Claim is bounded to one measurable statement."

leg2_falsifiable_spec:
  minimumClaimScope: ""
  falsifier:
    whatWouldDisproveIt: ""
    externalPriorArtOrBaseline: ""
    baselineVersionOrDigest: ""
  testableHypothesis: ""
  requiredInputs: []
  requiredOutputs: []
  acceptanceGate: "Spec states pass/fail criteria before implementation starts."

leg3_implementation_seam:
  owningPackage: ""
  owningPaths: []
  productSurface: ""
  implementationPlan: ""
  nonGoals: []
  buildTaskId: ""
  acceptanceGate: "A named HoloScript package owns the runtime seam."

leg4_measurement_receipt:
  benchmarkName: ""
  harnessCommand: ""
  metric: ""
  threshold: ""
  receiptType: ""
  evidenceEnvelopePath: ""
  rerunCommand: ""
  acceptanceGate: "Benchmark result and receipt are reproducible from a named command."

leg5_dual_ship:
  productFeature: ""
  productArtifactPath: ""
  paperMatrixRow: ""
  paperArtifactPath: ""
  reviewerVisibleEvidence: []
  acceptanceGate: "The same evidence supports a usable feature and a paper row."
```

## Leg Requirements

| Leg | Required fields | Reject if |
| --- | --- | --- |
| Claim capture | raw claim, normalized claim, authorization scope, source artifact | Claim is broad enough that any demo could satisfy it. |
| Falsifiable spec | minimum scope, baseline or prior-art class, disproof condition, pass/fail criteria | The agent cannot name what would make the claim false. |
| Implementation seam | owning package, owning paths, product surface, build task | The claim is routed to "docs" without a package that can execute it. |
| Measurement plus receipt | benchmark command, metric, threshold, receipt type, evidence envelope path | The result cannot be rerun or does not produce a durable receipt. |
| Dual ship | product artifact, paper matrix row, paper artifact, reviewer-visible evidence | The work ships only as product or only as publication prose. |

## Agent Flow

1. Create a `draft` intake using the schema above.
2. Normalize the customer's language into one bounded claim, then list excluded claims.
3. Fill the falsifier before assigning implementation work.
4. Pick the package that owns the runtime seam. If no package owns it, open a build task for the seam before measurement starts.
5. Pick the benchmark and receipt type. If no receipt type exists, route through the receipt capability registry before running the benchmark.
6. Name the paper matrix row that will receive the evidence. If the row does not exist, add a row or write an explicit deferral before implementation starts.
7. Reject the intake if any leg lacks an owner, artifact path, or acceptance gate.
8. Move to `accepted` only when all five legs are complete.
9. Move to `measured` only after the benchmark command and receipt exist.
10. Move to `dual-shipped` only when both the product artifact and paper artifact cite the same evidence.

## Worked Example

Customer claim:

> "Our custom HoloScript trait implementation behaves the same as our reference implementation across generated scenes."

### Leg 1 - Claim Capture

| Field | Value |
| --- | --- |
| Raw claim | Customer says their custom trait implementation matches their reference implementation across generated scenes. |
| Normalized claim | For generated scene inputs under seed set `S`, the customer trait implementation and reference implementation produce equivalent normalized outputs under oracle `O`. |
| Excluded claims | No claim of mathematical equivalence for all possible inputs. No performance claim. No claim about unrelated traits. |
| Authorization scope | Customer supplies both implementations and allows HoloScript to run seeded differential tests in a private workspace. |
| Acceptance gate | Claim is one measurable statement: no divergence under the agreed generator, oracle, seed set, and iteration count. |

### Leg 2 - Falsifiable Spec

| Field | Value |
| --- | --- |
| Minimum scope | 1,000 generated scene inputs, deterministic seed `42`, one customer trait, one reference implementation. |
| Falsifier | A single minimized counterexample where oracle-normalized outputs differ rejects the claim. |
| Baseline | Customer reference implementation plus HoloScript `TwinTestHarness` equivalence oracle. |
| Hypothesis | `runTwinTest()` reports `passed: true` for all generated inputs under the chosen oracle. |
| Acceptance gate | Pass/fail threshold is declared before implementation: zero divergences in 1,000 iterations. |

### Leg 3 - Implementation Seam

| Field | Value |
| --- | --- |
| Owning package | `@holoscript/core` |
| Owning paths | `packages/core/src/testing/TwinTestHarness.ts`; customer-specific test fixture under `packages/core/src/testing/customer/` or equivalent private workspace path. |
| Product surface | Papers-as-Service differential-test intake that can package a customer claim into a runnable twin test. |
| Build task | Create or reuse a board task that wires the customer fixture into the core twin-test harness. |
| Acceptance gate | The claim has an executable seam in `@holoscript/core`, not a prose-only analysis path. |

### Leg 4 - Measurement Plus Receipt

| Field | Value |
| --- | --- |
| Benchmark | `customer-trait-twin-equivalence` |
| Harness command | `pnpm --filter @holoscript/core test -- TwinTestHarness` with the customer fixture enabled. |
| Metric | Divergence count and minimized counterexample digest. |
| Threshold | `divergences == 0` over 1,000 generated inputs. |
| Receipt type | Twin-test report plus evidence envelope manifest. |
| Evidence envelope | `docs/public/evidence/customer-trait-twin-envelope.json` or a customer-private equivalent. |
| Acceptance gate | The receipt records seed, command, package revision, fixture digest, result digest, and rerun command. |

### Leg 5 - Dual Ship

| Field | Value |
| --- | --- |
| Product feature | Papers-as-Service can ingest a customer equivalence claim and produce a runnable twin-test evidence package. |
| Product artifact | Test fixture, receipt, and intake record linked from the customer workspace or private artifact store. |
| Paper matrix row | `docs/research-ops/prod-replica-paper-matrix.md` row: `11 - Trait / rendering inference`. |
| Paper artifact | Paper 11 appendix or memo section citing the evidence envelope and the exact claim scope. |
| Reviewer-visible evidence | Intake record, test command, evidence envelope, minimized-counterexample policy, and result digest. |
| Acceptance gate | The same twin-test receipt supports both the shipped customer feature and the Paper 11 evidence row. |

Result:

```yaml
status: accepted
why: "All five legs are complete and point to one package, one benchmark, one receipt, and one paper row."
nextStep: "Run measurement, attach receipt, then move to measured."
```

## Validation Hooks To Build Next

This memo is a template, but the intended implementation should add mechanical checks:

- A schema validator that rejects `accepted` if any leg has missing `owner`, `artifactPath`, or `acceptanceGate`.
- A board-posting helper that refuses to create a build task until leg 2 and leg 3 are complete.
- A receipt helper that queries `holo_query_receipts` for a candidate receipt type before measurement starts.
- A paper-matrix helper that asserts `paperMatrixRow` names an existing row or records a deferral memo.
- A final dual-ship check that compares product and paper artifact links to ensure they cite the same evidence envelope.

## Local Anchors

- `SURFACES.md`: Papers-as-Service is currently a designed surface, not a live verified endpoint.
- `docs/paper-program/readme.md`: paper-grade claims require exact scope, implementation or reproducibility, evidence envelope, and baseline comparison.
- `docs/research-ops/prod-replica-paper-matrix.md`: paper rows must map to production-replica code paths, GPU/LLM profile, and agent surface.
- `docs/paper-program/evidence-envelope-manifests.md`: evidence envelopes bind environment, hardware tier, seed, command, artifacts, and rerun command.
- `packages/core/src/testing/TwinTestHarness.ts`: F.037 anchor for differential testing as both product infrastructure and paper infrastructure.
- `packages/mcp-server/src/receipt-query-tools.ts`: receipt capability query surface that unblocks Papers-as-Service receipt verification.
