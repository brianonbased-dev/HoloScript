# Lingbot family — license and dependency audit (HoloMap)

**Purpose:** Record what HoloScript actually ships today, what we might do next, and **where legal review must gate work**. This is an internal product/legal coordination memo, **not legal advice**.

**Status:** Sprint 1 administrative baseline  
**Date:** 2026-04-17  
**Owner:** HoloScript Core (draft) — **sign-off: counsel** before any “bridge path” execution.

**Counsel review log (board Q3):**

| Date | Status | Notes |
|------|--------|--------|
| 2026-04-19 | **Pending** | No written clearance recorded in-repo. RFC path **A** (distillation) stays **gated**; ship demos on path **C** / plan **B** per RFC §5. |

**Related:** `RFC-HoloMap.md` (weight-acquisition strategy), `WGSL_GAPS.md`

---

## 1. What “lingbot family” means in our docs

In `RFC-HoloMap.md`, **lingbot family** names a **competitive framing**: third-party, non-HoloScript stacks (e.g. feed-forward RGB→3D and related VLA-style products) that occupy the same **market narrative** as HoloMap. Exact product names and corporate ownership can change; the RFC uses them for positioning and risk discussion, not as a claim that we distribute their software.

---

## 2. What HoloScript ships today (code and packages)

| Check | Result (as of 2026-04-17) |
|-------|---------------------------|
| **npm / workspace dependencies** named after lingbot or Ant | **None found** (`package.json` search). |
| **Vendored third-party source** identifiable as lingbot/Ant | **None found** (repo search limited to naming; no proprietary SDK checked in under those names). |
| **HoloMap implementation** | **Scaffold + stubs only** — no student model, no API client to external recon services in the Sprint 1 HoloMap slice. |

**Conclusion:** Today’s repository does **not** embed lingbot-family **code** or declare **direct package dependencies** on those products. Risk is **forward-looking**: how we acquire weights, use external APIs, or describe competitors in go-to-market materials.

---

## 3. Planned interaction paths (from RFC)

| Path | RFC label | License / policy touchpoints |
|------|-----------|--------------------------------|
| A | **Bridge** — distillation using outputs from a third-party recon stack | API or product **Terms of Service**, **acceptable use**, **output ownership**, **derivative works**, **redistribution** of distilled weights, **commercial use**. |
| B | **Clean** — train on permissively licensed public datasets | Dataset licenses (e.g. ScanNet, Matterport terms), **attribution**, **share-alike** if any, **geographic or commercial restrictions**. |
| C | **Shortcut** — fine-tune open bases (e.g. depth / pose priors with permissive licenses) | **Model weights license**, **attribution**, **any non-commercial clauses**, **patent / trademark** notices. |

**Default RFC stance:** prefer **C** for demo and **B** for production weights; **A only if counsel approves**.

---

## 4. Risk register (for counsel and leadership)

| ID | Topic | Severity if mishandled | Mitigation |
|----|--------|------------------------|------------|
| R1 | **Using commercial API outputs to train** our student | High — could breach ToS or create **unclean** training claims | Do not start bridge path without **written legal clearance**; document data lineage. |
| R2 | **Comparative marketing** (naming competitors, benchmarks) | Medium — **trademark** / unfair competition in some jurisdictions | Factual comparisons; avoid implying endorsement; run **marketing review**. |
| R3 | **Open-source contamination** if third-party code is ever pasted in | High — license incompatibility with HoloScript’s distribution | No copy-paste from unknown sources; **SPDX / NOTICE** hygiene; CI license checks where applicable. |
| R4 | **Patent landscape** (foundation models, splat / neural rendering) | Medium–High depending on jurisdiction | Counsel + defensive documentation of **independent implementation** for HoloMap WGSL. |

---

## 5. Counsel checklist (before bridge path or public benchmark claims)

Use this as a **ticket to legal**, not a substitute for review.

1. **Identify the exact product surface** (hosted API, downloadable weights, research-only release) and retrieve **current** terms and privacy policy URLs.
2. Confirm whether **output logs, meshes, or latent tensors** may be stored and reused for **model training**, **distillation**, or **evaluation**.
3. Confirm whether **attribution** or **notice** must appear in Studio, CLI, or shipped `.holo` manifests when weights are influenced by that path.
4. Confirm **export / on-prem** rules if customers in regulated industries use HoloMap.
5. Align with **open-source policy**: can distilled weights be shipped under HoloScript’s chosen license without conflicting obligations?

---

## 6. Engineering gates (operational)

| Gate | Condition |
|------|-----------|
| **G1 — Bridge** | Counsel sign-off **and** a recorded data-provenance spec (what was ingested, from where, under what terms). |
| **G2 — Benchmarks** | Any public number comparing to a named commercial product goes through **marketing + legal** review. |
| **G3 — Dependencies** | New npm packages touching recon / VLA vendors require **license field review** in the PR template. |

---

## 7. Action items

1. **Counsel:** Complete checklist in section 5 when the team selects path A for any experiment.
2. **Product:** Keep RFC weight-acquisition section aligned with this audit; update dates when terms change.
3. **Engineering:** If HoloMap later adds an optional connector to an external recon API, document it in the same folder with **explicit** “terms governed by third party” language in user-facing copy.

---

## 8. Document control

| Version | Date | Notes |
|---------|------|-------|
| 0.1 | 2026-04-17 | Initial audit: no lingbot packages in tree; bridge path gated. |
| 0.2 | 2026-04-18 | Appendix A: full monorepo `pnpm licenses` snapshot attached. |
| 0.3 | 2026-04-18 | Appendix B: compile targets (VRChat, Unity, …) vs npm dependency scope. |
| 0.4 | 2026-04-18 | Appendix B.3: link to `docs/guides/publishing-platform-terms.md`. |

---

## Appendix A — Third-party dependency license scan (monorepo)

**Scope:** All packages resolved in the HoloScript workspace via pnpm (not a review of vendored source trees outside `node_modules`, and not HoloScript composition provenance).

**Tooling note:** `packages/core/src/deploy/license-checker.ts` enforces **HoloScript composition** license compatibility at deploy time. It does **not** inventory npm dependencies. This appendix uses **`pnpm licenses list --json`**, which reads each package’s declared `license` field from the lockfile/install graph.

### A.1 Where the reports live

| Artifact | Path |
|----------|------|
| Summary (human-readable) | [`reports/pnpm-licenses-summary.md`](./reports/pnpm-licenses-summary.md) |
| Full snapshot (JSON) | [`reports/pnpm-licenses-snapshot.json`](./reports/pnpm-licenses-snapshot.json) |
| Regenerator script | [`reports/generate-pnpm-license-summary.mjs`](./reports/generate-pnpm-license-summary.mjs) |

### A.2 Snapshot highlights (2026-04-18)

These figures are copied from the summary for quick reading; the authoritative table is in `pnpm-licenses-summary.md`.

- **Packages counted:** 2317  
- **Distinct license expressions:** 37  
- **Top declared licenses:** MIT (1786), Apache-2.0 (256), ISC (89), BSD-3-Clause (43)  
- **Heuristic review queue (non-default / copyleft / custom / unknown):** includes **Unknown** (23), **SEE LICENSE IN LICENSE.md** (5), **Unlicense** (5), **LGPL** / **Apache+LGPL** combinations, **UNLICENSED**, **PolyForm-Shield**, **Remotion License** strings, **CC-BY-4.0**, **BlueOak**, and **WTFPL** variants — see the “Review queue” table in the summary file for exact counts.

### A.3 Lingbot-specific spot check

A **name search** of the snapshot JSON for `lingbot`, `antgroup`, and `ant-group` in dependency **names** returned **no matches** at the time of generation. That does not replace Terms-of-Service review for any **API** you call at runtime; it only reflects what is **installed as an npm package** in this workspace.

### A.4 How to refresh before a release

From the repo root, regenerate the JSON and summary (see also the “How to refresh” section in `pnpm-licenses-summary.md`):

```powershell
Set-Location <path-to-holoscript-repo>
pnpm licenses list --json | Out-File -Encoding utf8NoBOM packages/core/src/reconstruction/reports/pnpm-licenses-snapshot.json
node packages/core/src/reconstruction/reports/generate-pnpm-license-summary.mjs
```

Then bump the **Document control** version row and update **A.2** dates/figures if this appendix is kept in sync manually.

---

## Appendix B — Compile targets (VRChat, Unity, Unreal, Godot, web, …)

### B.1 What the pnpm scan does *not* cover

**Appendix A** inventories **npm packages** used to build and run the HoloScript monorepo (compiler, Studio, services, tests). It does **not** include:

- **Unity Editor**, **VRChat SDK3**, **UdonSharp**, or other Unity packages a creator installs via the VRChat Creator Companion or Unity Package Manager.
- **Unreal Engine**, **Godot**, **Babylon.js**, **Three.js / R3F**, **visionOS / Android XR** toolchains, or their vendor SDKs on the author’s machine or CI image.
- **Console or store** submission agreements (PlayStation, Xbox, Meta Quest store, etc.).

Those are **destination-platform obligations**: the person or company **shipping a world or app** must follow the relevant **EULA**, **SDK license**, **content guidelines**, and **trademark** rules. That is separate from whether HoloScript’s own dependencies are permissive.

### B.2 How HoloScript relates to VRChat and other targets today

HoloScript implements **emitters** (for example `VRChatCompiler.ts`, `UnityCompiler.ts`, `UnrealCompiler.ts`, `GodotCompiler.ts`, web GPU/render paths) that output **source code, scenes, or assets** shaped for those runtimes. A routine **`package.json` name search** in this repo does **not** list `vrchat` or the VRChat Unity SDK as an npm dependency of HoloScript itself—the creator typically installs Unity + VRChat’s SDK **outside** this monorepo when building a world.

So:

| Layer | Who owns compliance | Typical artifacts |
|--------|---------------------|-------------------|
| HoloScript toolchain | HoloScript / this audit’s Appendix A | `node_modules`, lockfile |
| Generated output + author glue code | Project author | UdonSharp C#, Unity scenes, etc. |
| Host engine + platform | Author + platform vendor | Unity EULA, VRChat Terms & Creator Guidelines, store rules |

### B.3 Practical guidance for product and counsel

1. **Ship checklist:** Public index of vendor terms lives in **`docs/guides/publishing-platform-terms.md`** (VRChat, Unity, Unreal, Godot, web, Apple, Android). Refresh links when vendors move pages.
2. **No automatic coupling:** Emitting VRChat-shaped C# does **not** by itself satisfy VRChat’s publishing rules; it only helps technically.
3. **HoloMap:** Native reconstruction weights and bridge-path licensing (section 3–5 above) are **orthogonal** to VRChat—unless you **bundle** recon output into a world and that bundle triggers a platform content or performance policy.

