# @holoscript/uaal

## 8.3.0

### Minor Changes

- Harden the gap-aware resolution in `@holoscript/uaal/semantic` with two additional genuine-gap classes, both derived from the IR structure (no false gaps on determinate input):
  - **Resource contention in `resolveNormStatus`.** Previously only an OPPOSING-force dilemma (one `O`, one `F` on the same `required_act`) was caught. Now a new optional `resource?: string` field on `UAALDeonticNorm` lets two ACTIVE obligations (both force `O`) that lay claim to the same non-empty `resource` — e.g. one ambulance owed to two emergencies — be recognised as jointly unsatisfiable → `unresolvable` / `unprioritized_conflict`, naming both norms and the shared resource. Precedence (via the existing `hasPrecedence` helper) still resolves it, and obligations on different resources do not flag. The original O/F same-act detection is unchanged.
  - **Broader `missing_precondition` in `resolveDischargeable`.** Previously `missing_precondition` fired only for a stated-but-empty `time` constraint. Now, when a composition carries a full affordance query and the object's matching offer `requires` a known capability magnitude that the agent's `body` never supplies, the capability check can only be *defaulted* (not evaluated) — that inexpressible gap is reported as `unresolvable` / `missing_precondition` instead of masquerading as an ordinary affordance block. Conservative: a present-but-insufficient magnitude stays a determinate block and still resolves.

## 8.2.0

### Minor Changes

- Add gap-aware resolution to `@holoscript/uaal/semantic`: `resolveOcclusion`, `resolveNormStatus`, and `resolveDischargeable` return a `UAALResolution` that DERIVES from the IR whether a query is answerable at all — `{status:'resolved', answer}` or `{status:'unresolvable', reason}`. Unlike the committed `recover*` recognisers (which silently coerce a missing `opaque` field to "visible", conflicting norms to the first norm, and a discharge cycle to `dischargeable=false`), these distinguish *unstated* from *false*, a genuine dilemma from a single norm, and a dependency cycle from an ordinary block. Reasons: `underdetermined`, `unprioritized_conflict`, `cyclic_dependency`, `missing_precondition`. Adds the optional `UAALDischargeDependency` edge list to `UAALCompositionIR` so a discharge cycle is expressible. This is the verifier for a model-emitted gap-object (the "three-body disposition"). Determinate IRs still resolve — no false gaps.

## 8.0.10

### Patch Changes

- Add the public `@holoscript/uaal/gate` subpath with the uAAL v2 semantic well-formedness gate: referential integrity, perception-grounding, multi-perspective interiority, and causal acyclicity.
- Add package-level `engines.node >=20` so external installs fail early on unsupported runtimes.

## 8.0.9

### Patch Changes

- Complete the public uAAL semantic harness with the late-five verticals: mereological persistence, narrative tension, cross-graph analogy, presupposition projection, and thematic motif recurrence.

## 8.0.8

### Patch Changes

- Expand `@holoscript/uaal/semantic` with importable uAAL v2 vertical gates for affordance, temporal order, deontic force, commitment, counterfactual necessity, per-modality access, and world composition.

## 8.0.7

### Patch Changes

- Add the `@holoscript/uaal/semantic` subpath with importable uAAL v2 theory-of-mind, telos, and containment recovery gates.

## 8.0.6

### Patch Changes

- c64fc1a: Re-lockstep the changesets `fixed` group after W.669's emergency out-of-band publish-fix republishes desynced its members (core 6.1.3, cli 6.1.1, agent-protocol/snn-webgpu/uaal 6.1.0, holo-vm 6.1.1). On the next `changeset version` this realigns all six fixed-group packages to a single coordinated version (6.1.4), restoring the invariant the `fixed` config requires. No functional code change — version-hygiene reconciliation only.

  NOTE: holo-vm's npm `latest` is stranded on the abandoned 7.0.0 platform line (6.1.x was never published for it); a coordinated 6.1.4 publish does NOT reclaim its `latest` tag. That, plus the broader Class-B stranded-7.0.0 set (benchmark, formatter, linter, lsp, mcp-server, partner-sdk, r3f-renderer, std, visual, wasm), is tracked separately as a deliberate release/dist-tag operation — see the board task on npm publish drift reconciliation.

## 6.1.0

### Changed

- Align release metadata with the HoloScript 6.x line. See the root CHANGELOG for the outward-facing release narrative.

## 6.0.3
