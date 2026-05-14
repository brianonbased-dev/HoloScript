# Shared-Sort Multiview Foveated Gaussian Splatting: Sublinear Scaling for Collaborative VR

**Date:** 2026-05-12
**Class:** runtime-instinct
**Status:** seed
**Repository:** HoloScript
**Source context:** docs/archive/P043_MULTIVIEW_FOVEATED_GS_PAPER.md
**Archive score:** 46
**Archive signals:** future:3, phase:8, future work:3, runtime:2, vr:27, ar:1

## What Might Be Valuable

- Cuts 5 entirely (re-numbers 65, 76, 87); drops contribution 4 from 1.3. - Rewrites 65 (Implementation Notes) to reflect the substrate as actually shipped on 2026-05-12: GaussianBudgetAnalyzer wires estimateMultiUserCost via the userCount parameter; MultiviewGaussianRendererTrait is a real class with view-Map, foveation config, and centroid-shared-sort preprocess() returning visibility bitmasks; WebcamGazeTrait produces fovealcenter inputs from any RGB camera. Compiler WGSL emit branch remains future work. - Replaces "Antigravity Research" byline with the real HoloScript Project affiliation. - Re-labels 4.3 projected-scaling rows 4 as "Projected pending measurement"; reframes the Quest 3 narrative as desktop-validated with mobile-pending; flips the eye-tracking limitation into a webcam-runnable demo claim. - Disambiguates Radl/Steiner SIGGRAPH 2024 references.

## Why Not Now

This came from an archive. Treat it as historical, incomplete, or superseded until a current owner verifies the idea against today's HoloScript/HoloLand direction.

## Smallest Next Experiment

Open the source archive, extract one current claim or feature idea, and decide whether it should become a build task, research artifact, paper row, or remain dormant.

## Reopen Trigger

Reopen when current roadmap, paper work, HoloLand product planning, runtime cleanup, or tool development touches the same theme.

## Do Not Preserve

Do not revive the archived implementation wholesale. Preserve the idea only if it survives current source contracts, product direction, and validation requirements.

## Links

- docs/archive/P043_MULTIVIEW_FOVEATED_GS_PAPER.md
