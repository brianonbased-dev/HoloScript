# WCAG 3.x timeline + XR alignment — HoloScript accessibility traits

**Board:** `task_1776394509341_irnd`  
**Source audit:** `2026-03-09_holoscript-impossible-doors-breakthrough-analysis.md`

## WCAG 3.0 — public status (snapshot)

- **Specification:** [W3C Accessibility Guidelines (WCAG) 3.0](https://www.w3.org/TR/wcag-3.0/) — **Working Draft** (spec evolves; check TR date on the page you cite in papers).
- **Relationship to WCAG 2:** W3C positions WCAG 3 as **not a drop-in replacement** for 2.x in the near term — **both coexist** while WCAG 3 matures; legal/compliance text still often references **2.x** until adopting bodies update.
- **Implication for HoloScript:** ship **WCAG 2.2–oriented** behavior where customers require compliance *today*; use WCAG 3 **outcome** language for **forward-looking** XR research narrative.

## XR + “emerging standards”

Internal research capture (WISDOM **S.020**): WCAG 3 emphasizes **outcomes**; XR needs **spatial focus order**, **motion minimization**, and **equivalent non-visual modes** — map traits to **machine-checkable** rules where possible.

See: `benchmarks/cross-compilation/WISDOM.md` (section **S.020**).

## HoloScript anchors (existing code)

| Concern | Location | Notes |
|---------|----------|--------|
| Reduced motion / vestibular safety | `packages/core/src/traits/MotionReducedTrait.ts` | Emit / register / restore hooks for motion policy |
| Accessibility trait constants | `packages/core/src/traits/constants/accessibility.ts`, `accessibility-extended.ts` | Vocabulary for manifests + tooling |
| Dwell / gaze UX (privacy-aware) | `packages/core/src/traits/SpatialInputTraits.ts` | Dwell progress without raw gaze exfiltration |
| Studio / runtime context | `packages/core/src/traits/TraitTypes.ts` (`accessibility` on context) | Wire for inspectors / validators |

## Next steps (when productized)

1. **Lint rules** — one Vitest or CLI rule per outcome (e.g. minimum spatial target size at default camera FOV) — cite WCAG 3 **draft** section IDs explicitly.
2. **Docs** — single “Accessibility (web + XR)” page linking traits → WCAG 2.x mapping + WCAG 3 **draft** forward map.
3. **Legal review** — any “WCAG 3 certified” claim needs counsel; “aligned with draft outcomes” is safer.
