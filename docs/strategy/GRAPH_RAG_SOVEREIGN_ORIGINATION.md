# Graph RAG prompts & synthesis: Sovereign origination context

High-signal **question templates** for continuous Graph RAG evaluation, plus **synthesized answers** aligned to the HoloScript runtime (dual digest semantics, optional x402 tiers, Film3D telemetry). Use this to score retrieval and to catch overclaims in generated prose.

**Related:** [`packages/studio/docs/SOVEREIGN_ORIGINATION_STACK.md`](../../packages/studio/docs/SOVEREIGN_ORIGINATION_STACK.md), [`packages/studio/docs/walkthrough.md`](../../packages/studio/docs/walkthrough.md), `.ai-ecosystem` futurist / COMPRESS docs.

---

## Accuracy guardrails (read before scoring answers)

1. **`GistPublicationManifestV0` carries two digest concepts:** **`provenance_semiring_digest`** (v0 `sha256_canonical_v0`, includes optional **`xr_metrics`** in the canonical payload) and optional **`tropical_semiring_digest`** (3×3 matrix from params). They are **layered**, not replacements; v0 SHA is not “deprecated” by tropical.
2. **x402** is optional in the **type** and default path; deployments may set **`GIST_MANIFEST_REQUIRE_X402`** so the gist-manifest route returns **402** without a receipt.
3. **`binds_composition_to_history`** and similar names are **logical** edges unless your graph schema defines them explicitly in code.

---

## 1. Sovereign origination & provenance core

### Q1: Trace the path from SovereignUserAgent → HoloScriptGraph → ProvenanceSemiring → PublishToCitadelOrMarket. What is the maturity of `binds_composition_to_history`?

**Synthesis:** In code, composition flows through **Studio or headless** execution: **`executeStudioGraph`** / bridge → results may include **`previewHoloScript`** from the node-graph preview path (`nodeGraphPlayPreview` / execution bridge). Publication is **`buildGistPublicationManifest`** (and **`POST /api/publication/gist-manifest`**), optionally with **`tropicalSemiringDigest`** supplied from **`computeTropicalSemiringDigest(doc)`** in `packages/crdt-spatial/src/legalDocumentCrdt.ts`, which folds Loro’s **version vector** into a fixed **3×3** matrix (heuristic fingerprint, not full merge-event tropical algebra over arbitrary ops).

**Maturity:** The **named edge** `binds_composition_to_history` should be treated as a **conceptual** label unless your schema materializes it. **Algebraic** maturity is **partial**: tropical matrix + v0 SHA coexist; formal homomorphism from every CRDT merge to semiring operations is **not** claimed by the current implementation.

### Q2: Compare conceptual ProvenanceSemiring to actual `GistPublicationManifestV0` fields. What is the delta?

**Synthesis:** The manifest exposes **`provenance_semiring_digest`** (`sha256_canonical_v0`) and optional **`tropical_semiring_digest`**. The “delta” from a purely conceptual semiring paper is **closed for shipping artifacts** in the sense that both **binding** (v0 SHA) and **optional matrix** slots exist; the **research delta** remains: proving that the matrix equals a specified min-plus/max-plus merge law over audit-relevant operations.

### Q3: Show nodes/edges from CRDT merge to x402 / Base L2.

**Synthesis (executable path):**  
`Loro` state → **`doc.version().toJSON()`** (and related APIs) → **`computeTropicalSemiringDigest(doc)`** (crdt-spatial) → optional pass into **`buildGistPublicationManifest({ tropicalSemiringDigest, … })`** → **`tropical_semiring_digest`** + optional **`x402_receipt`** on **`GistPublicationManifestV0`** → publish via **`/api/publication/gist-manifest`** (and human commit of JSON as needed).

**Gap:** **Base L2** transaction anchoring is **not** automatically wired; timestamps in receipts are **ISO-level** unless your facilitator pipeline fills chain-specific fields. Treat “BaseL2Timestamp” as **product/integrator** scope unless code explicitly binds a rollup.

---

## 2. Film3D XR & physical grounding

### Q4: Occlusion / gaze metrics vs provenance state vector?

**Synthesis:** **`Film3dXrMetricsBridge`** (with throttled sampling / worker relay) feeds **`hitTestCount`**, **`occlusionProofAcquired`**, and related fields into **`xr_metrics`** on the manifest path. By default these metrics **do not** write back into the **Loro** document’s merge history. They **do** affect **`provenance_semiring_digest`** (v0) when **`xr_metrics`** is included in **`buildGistPublicationManifest`**. They do **not** by themselves change **`computeTropicalSemiringDigest`** unless application code merges them into that computation.

**Net:** **Passive / sidecar relative to CRDT ticks**; **not** sidecar to the v0 digest when `xr_metrics` is present.

### Q5: Director end-to-end path in WebXR; gaps?

**Synthesis:** **`NodeGraphPanel`** → **Run XR** toggles **`WebXRViewer`** with **`previewHoloScript`** when available → session + **`Film3dXrMetricsBridge`** → manifest build may attach **`xr_metrics`**.

**Gap:** Proves **device/session** signals and **bundling** into manifest metadata; it does **not** prove that **generated HoloScript** was **parametrically** driven by occlusion/gaze unless the compiler path consumes those signals.

---

## 3. Economic sovereignty & adoption

### Q6: Is x402 optional or mandatory? Trace the effect.

**Synthesis:** **`x402_receipt`** is **optional** on the manifest type. **Deployment policy:** when **`GIST_MANIFEST_REQUIRE_X402`** is set, the **gist-manifest** route can **reject** requests without a non-empty receipt (**HTTP 402**). Narratives about “weak economy door” should acknowledge **tiered** enforcement, not only type-level optionality.

### Q7: Top single points of failure for non-founder sovereign proof?

**Synthesis (risk framing, not bug list):**

1. **XR telemetry** without hardware attestation → spoofable **`xr_metrics`** in principle.
2. **Optional economic anchor** when policy does not require x402.
3. **Identity binding:** tropical matrix from Loro peers is **not** a substitute for **DID / wallet** linkage unless integrated elsewhere.

---

## 4. Strategic & forward-looking

### Q8: Smallest changes to make Film3D story “more executable” (impact / effort)?

1. **High impact / policy:** Enforce x402 on chosen tiers via **`GIST_MANIFEST_REQUIRE_X402`** (and product UX), not necessarily by throwing inside **`buildGistPublicationManifest`** for every caller.
2. **High impact / medium effort:** Persist **`xr_metrics`** (or summaries) into a **Loro map** during session/sync if you need **causal** binding to CRDT ticks.
3. **Medium / high effort:** Real **L2** anchoring on gist finalize via your payment / facilitator stack.

### Q9: Three discrepancies between “strong evidentiary” vision and runtime?

**Synthesis:**

1. **Algebra vs cryptography:** Matrix + SHA bind **artifacts**; they do not alone constitute legal inventorship or chain-of-custody without process and counsel.
2. **Proxies vs platform:** **`stdio-proxy`** filters **child env**; the **host** OS and container story remain part of the trust boundary.
3. **Observation vs generation:** WebXR can observe **capabilities**; proving **semantic** use in generated output needs explicit pipeline hooks.

### Q10: Emergent relationships from embeddings?

**Synthesis:** Treat **max-plus / commutative** narratives as **threat-model hypotheses** until you specify adversaries, merge policies, and conflict visibility in Loro. “Provenance dominance” via spam is **not** established as a theorem from the current code paths alone—flag for **red-team** and formalization, not as fact.

---

## Maintenance

When runtime behavior changes (new Loro hooks, new manifest fields, new env flags), update **Accuracy guardrails** and the affected Q&A blocks so Graph RAG evaluators do not reward stale prose.
