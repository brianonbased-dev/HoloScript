# WCAG 3.0 timeline, XR, and HoloScript accessibility traits

**Date:** 2026-04-22  
**Scope:** Answer the board question: how might HoloScript’s accessibility-related traits align as **W3C Accessibility Guidelines (WCAG) 3.0** evolves, including **XR** expectations.

## Where WCAG 3.0 stands

- WCAG 3.0 is under active development at W3C (see the current **Working Draft** and publication history at [W3C / WCAG 3.0](https://www.w3.org/TR/wcag-3.0/) and the [WAI news on WCAG 3](https://www.w3.org/WAI/news/)). Drafts have been published across 2024–2026; **normative stability** and a full **conformance model** are still being refined.
- WCAG 3 uses a different structure from 2.x (e.g. **outcomes**, **assertions**, **holistic** scoring in some proposals). Teams should expect **migration guidance** from W3C as the spec matures—not a simple rename of “AA” checks.

## WCAG 3 is not the only relevant standard for XR

- **3D on the web** and **WebXR** raise questions (focus, motion, spatial audio, vestibular comfort) that overlap but are not fully covered by **document-centric** web guidance.
- W3C and community work on **XR accessibility** (user needs, authoring, platform APIs) continues in parallel. Treat **WCAG 2.2** as the today-baseline for web **regulatory** conversations in many jurisdictions until counsel updates your policy; use **WCAG 3 drafts** for **forward-looking** product design.

## Implication for HoloScript

1. **Trait design:** Prefer traits that name **user outcomes** (e.g. “reduced motion,” “clear focus path,” “equivalent audio for spatial events”) and map them internally to testable checks; avoid hard-coding only “2.1 AA” strings in user-facing text if the model will shift.
2. **Version pins:** In docs and LSP help, **pin** the WCAG version you tested against (e.g. “evaluated against WCAG 2.2 Level A/AA for web surfaces”) and add a short **when WCAG 3** note when publishing public claims.
3. **XR-specific:** For headset / WebXR features, add **headset comfort** and **safety** requirements next to “accessibility” in acceptance criteria; reference emerging XR a11y notes where applicable.

## References

- W3C WCAG 3.0 (draft): https://www.w3.org/TR/wcag-3.0/  
- W3C WAI, WCAG 3 timeline and news: https://www.w3.org/WAI/  

*This is engineering orientation, not legal or compliance advice.*
