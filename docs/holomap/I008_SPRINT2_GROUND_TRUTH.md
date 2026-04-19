# I.008 — HoloMap Sprint 2 (ground truth)

**Canonical doc:** This file is the HoloScript-side correction for ecosystem **MEMORY I.008** entries that still describe Sprint 2 as “~10 P0 WGSL shaders” short.

**Last verified:** 2026-04-19 against `packages/core/src/reconstruction/WGSL_GAPS.md`.

## Correct blocker language

The **P0 operator set** required for a first transformer forward pass — fused MHA, paged KV append/lookup, layer norm, stable softmax, GELU, GEMM, RoPE, image patch embed — is **marked `have ✅`** in `WGSL_GAPS.md` with commit hashes (e.g. `f305ad507`, `cff268313`, `b9b3ac2f8`, `8761c7b4e` — re-verify in that file).

**Sprint 2 real blocker:** integrate those kernels into **`HoloMapRuntime.step()`** (replace scaffold placeholders), implement **weight fetch/verify** per **RFC-HoloMap §5.1**, and complete the **first indoor-room acceptance video** run. Remaining P1/P2 rows in `WGSL_GAPS.md` are follow-ons, not the headline P0 shader sprint.

## References

- `packages/core/src/reconstruction/WGSL_GAPS.md`
- `packages/core/src/reconstruction/RFC-HoloMap.md` (§8 Sprint 2)
- `research/2026-04-18_lingbot-map-vs-holoscript*.md` (ai-ecosystem)
