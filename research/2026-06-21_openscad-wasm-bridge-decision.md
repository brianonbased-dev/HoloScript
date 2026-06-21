# OpenSCAD-WASM Bridge Decision

Date: 2026-06-21
Task: Decide and implement OpenSCAD-WASM bridge as optional precision backend vs sovereign SDF kernel.

## Decision

Do not add an OpenSCAD-WASM bridge now.

Keep the sovereign SDF plus marching-cubes manufacturing lane as the default backend, and expose a precision estimate that lets callers reject or refine a job before fabrication. The bridge becomes warranted only when the requested manufacturing semantics exceed what the SDF lane can honestly certify.

## Evidence

- `packages/engine/src/simulation/manufacturing/__tests__/MarchingCubes.test.ts` verifies analytic sphere volume and area, CSG box-minus-cylinder volume, watertight topology, outward winding, resolution convergence, `scaleFactor`, and boundary behavior.
- `packages/engine/src/simulation/manufacturing/__tests__/ManufacturingLane.e2e.test.ts` verifies a mounting-plate lane from SDF CSG through watertight mesh, printability analysis, STL export/import, and parametric regeneration.
- `POST /api/manufacturing/mesh` now returns `precision.conservativeSurfaceError`, computed from the scaled marching-cubes cell diagonal. That value is a pessimistic gate for mechanical tolerance decisions.

## Bridge Trigger

Implement an optional OpenSCAD-WASM bridge if at least one of these conditions is true:

- A product workflow requires exact CAD semantics such as OpenSCAD source compatibility, exact boolean provenance, fillets, threads, or constructive geometry that must survive as CAD operations rather than sampled surfaces.
- The requested tolerance is tighter than `precision.conservativeSurfaceError` after practical bounds tightening and resolution increases.
- The sovereign SDF lane cannot meet the requested tolerance within acceptable memory, latency, or build-server limits.
- A downstream manufacturing partner requires OpenSCAD or another CAD kernel as an auditable interchange step.

## Non-Goals

- This does not claim the current SDF kernel is an exact CAD kernel.
- This does not claim medical, aerospace, or regulated manufacturing readiness.
- This does not replace final slicer, material, printer, and metrology validation.

## Current Contract

The SDF lane remains sovereign and sufficient for the current manufacturing lane as long as callers treat `precision.conservativeSurfaceError` as the tolerance floor. If a caller needs tighter guarantees, the correct behavior is to refine bounds/resolution or activate the bridge trigger above, not silently overclaim precision.
