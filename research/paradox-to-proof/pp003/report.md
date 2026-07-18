# PP-003 Proof-Adjacency Manual Pilot

**Date:** 2026-07-17

**Papers:** P29, P42

**Stage:** `falsifiable`

**Verdict:** `unresolved`

## Outcome

The pilot produced two deterministic target artifacts and an artifact-level
falsifier:

- P29 as a typed API JSON proof composite;
- P42 as a bounded-viewbox social-card SVG proof composite;
- seven API and fifteen SVG adversarial laundering fixtures;
- a Node test that accepts both intact artifacts and rejects every attack.

The important result is not a broad proof-adjacency guarantee. It is evidence
that the existing receipt-level guard is real but insufficient to establish the
cross-target claim. A target may report `canRenderWall=true`, receive a safe
display model, and then detach the wall while emitting its artifact. The new
negative control performs exactly that mutation and requires the artifact-level
verifier to reject it.

## Claim and falsifier

**Claim under test:** A valid proof marker cannot survive compilation or
rendering unless an equally prominent `NOT PROVEN` boundary remains in the same
typed composite and viewport.

**Falsifier:** Any emitted artifact is accepted while it contains `PROVEN` and
one of the following is true:

1. the boundary is absent;
2. the boundary is outside the composite;
3. the boundary is less prominent;
4. the boundary is hidden by the modeled inline visibility, opacity, or paint
   attributes, or is outside the declared viewport;
5. the proof and boundary carry different composite identities.

The test is mutation-sensitive: weakening the verifier so that any listed
attack passes makes the corresponding test fail.

## Actual implementation read

### P29 proof surface

The Lean theorem is real within its declared abstract model:

- `research/paper-29-algebraic-trust-toolsandbox/ATC/CompositionLaw.lean:234`
  proves `composition_preserves_both` for a two-component Boolean conjunction;
- `lake build` succeeds under the pinned Lean toolchain;
- `packages/mcp-server/src/security/SandboxCostComposition.ts:196` mirrors the
  abstract model, and its `permits` implementation is the conjunction at line 207.

The deployment correspondence is not proved by those facts. The manuscript
calls the theorem a "correctness certificate for deployed agent
infrastructure" at
`research/paper-29-algebraic-trust-composition-pldi.tex:128`, while its own
abstraction-gap section begins at line 659. A tracked-source call-site search
for `ComposedPolicy`, `TrustSandboxPolicy`, and
`verifyCompositionPreservesBoth` found definitions and the dedicated test, but
no production execution caller. The TypeScript module is therefore a theorem
mirror, not evidence that every deployed MCP path is mediated by it.

This is a direct PP-003 instance: a genuine proof marker can lend authority to
an adjacent production-mapping claim that the proof does not discharge.

### P42 proof/render surface

The receipt-level guard is also real within its local contract:

- `packages/plugins/holonews-plugin/src/traits/proof-adjacency-guard.mjs:33`
  resolves badge policy;
- its branch at lines 45-47 explicitly trusts the target's
  `canRenderWall` declaration;
- `buildKioskDisplayModel` at line 118 co-populates `showBadge` and `wallText`;
- the existing test imports the two helper modules directly at
  `scripts/__tests__/holonews-proof-adjacency.test.mjs:27` and line 30.

A tracked-source search for `claim_kiosk`, `buildKioskDisplayModel`, and
`kiosk:badge_render` found one additional source surface:
`compositions/holonews-claim-kiosk.hsplus`. It advertises multiple compile
targets at line 18, selects R3F at line 28, asserts `canRenderWall: true` at
line 129, and defines `ProofAdjacencyWall` as a separate sibling object at line 211. That topology is not an inseparable typed composite.

The source is not currently a working target artifact. Running
`holoscript parse` reports four syntax errors, and compiling it to R3F stops at
the same parse boundary. Thus the composition neither proves compiler
integration nor produces evidence for any advertised target. The plugin comment
that the guard is enforced "across all compile targets" is broader than current
implementation evidence. The existing test proves model behavior; it does not
inspect compiled target artifacts.

## Fixture corpus

| Target          | Paper | Intact binding                                                                                                                                     | Adversarial mechanisms                                                  |
| --------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| API JSON        | P29   | `proofMarker` and `scopeBoundary` share one object and `compositeId`; strictly numeric, finite, positive boundary prominence is at least proof prominence | delete, detach, demote, relabel, break identity, delete or coerce prominence |
| Social-card SVG | P42   | marker, wall, non-empty scope text, and verify link share one visible SVG group and identity; visible label is `NOT PROVEN`; finite positive font size/weight and effective opacity are at least equal to the marker; wall and explanation lie inside the full min/max viewbox | delete, relabel, empty, hide node/group/paint, demote font/opacity, move or transform outside viewbox, break identity |

The social-card prominence rule is deliberately operational, not
psychological: font size, font weight, opacity, visibility, viewport bounds,
and group identity are machine checked. This pilot does not claim those
features fully model human salience.

## Results

| Claim                                                                                                | Deep-ratchet verdict   | Evidence                                                                                                            |
| ---------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| P29 abstract two-guard conjunction theorem                                                           | **REAL**               | Lean build and theorem source                                                                                       |
| P29 theorem is a correctness certificate for deployed MCP infrastructure                             | **OVERCLAIMED**        | theorem-mirror module has no production execution caller; correspondence remains unproved                           |
| P42 receipt/display model suppresses a badge when wall text is missing or target capability is false | **REAL**               | existing guard and its passing helper-level suite                                                                   |
| P42 guard is enforced across all compile targets                                                     | **OVERCLAIMED**        | target capability is trusted; advertised composition is unparsable and places the wall in a separate sibling object |
| PP-003 API JSON and social-card SVG pilot artifacts resist the named attacks                         | **REAL, PILOT-SCOPED** | deterministic artifacts, negative controls, and this pilot test                                                     |

The PP-003 kill condition is not met. Scope preservation has not been shown for
real web, VR, API, and social-card compiler paths. The card advances from
`seed` to `falsifiable`; its verdict remains `unresolved`.

## Code-state variable

`pp003-receipt.json` binds the exact production sources inspected, the P29
proof/manuscript inputs, the fixture corpus, the test, this report, and both
emitted artifacts by SHA-256. It records the repository HEAD observed before
the pilot and honestly marks the shared worktree as dirty. No claim of a clean
repository snapshot is made.

## Limits

- The two emitters and verifiers are pilot code inside the dedicated test, not
  registered production compilers.
- The SVG verifier parses a deliberately constrained fixture format; it is not
  a general XML/CSS layout engine.
- Pixel rasterization, browser font substitution, responsive reflow, hostile
  screenshots, VR occlusion, accessibility-tree parity, and human salience are
  not tested.
- The API prominence score is a contract field. A future production schema must
  derive or enforce its meaning rather than trust arbitrary producer values.
- The pilot does not repair P29 manuscript wording or wire the P29 theorem
  mirror into the production MCP execution path.
- The pilot does not repair the existing HoloNews composition's syntax or its
  sibling-object wall topology.

## Required next slice

1. Promote the proof-scope composite into shared compiler-visible IR; make a
   standalone proof marker unrepresentable at the emitter boundary.
2. Repair the HoloNews composition so it parses, replace the sibling wall with
   the typed composite, and add real web and VR compiler fixtures.
3. Validate social-card pixels after rasterization and cropping, not just SVG
   structure.
4. Either wire P29's composed policy into the actual MCP execution seam with a
   correspondence test, or narrow the manuscript's deployed-certificate claim.
5. Keep the cross-target paper claim closed until every named production target
   passes artifact inspection.

## Validation commands

```powershell
node --test scripts/__tests__/pp003_proof_adjacency.test.mjs
node scripts/__tests__/holonews-proof-adjacency.test.mjs
pnpm --filter @holoscript/mcp-server exec vitest run src/__tests__/SandboxCostComposition.test.ts
pnpm exec holoscript parse compositions/holonews-claim-kiosk.hsplus --json  # expected current failure
pnpm exec holoscript compile compositions/holonews-claim-kiosk.hsplus --target r3f --json  # expected current failure
lake build  # from research/paper-29-algebraic-trust-toolsandbox
```

The durable machine-readable result is `pp003-receipt.json`.
