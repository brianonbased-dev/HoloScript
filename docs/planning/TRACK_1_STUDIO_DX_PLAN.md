# Track 1: Studio Quality & DX Refinement Plan

**Status**: Planning Phase Complete (Absorb Graph Generated)
**Knowledge Graph File**: `packages/studio/knowledge.holo` (UTF-8)

## 1. Context from AST Graph

A structural analysis of `packages/studio/src/components` via `holoscript absorb` reveals 64 deeply coupled module communities. Key observations:

- **Transform Bottlenecks**: `src/components/transform/TransformPanel.tsx` and `MultiTransformPanel.tsx` are strongly coupled to the React re-render cycle, contributing to Gizmo desyncing.
- **Rendering Artifacts**: Asset drops (`AssetDropProcessor.tsx`) do not currently preload materials with `post_processing_block` awareness, causing lighting mismatches.

## 2. Execution Blueprint (Phase 1A and 1B)

### Step 1: Material and Lighting Pre-Warm (Artifacts)

- **Target**: `packages/studio/src/components/assets/AssetDropProcessor.tsx`
- **Action**: Implement a material-pass during `loadGLTFFromBuffer` to force `envMapIntensity` and PBR shadows to initialize _before_ mounting to the scene graph.
- **Validation**: Studio tests must verify zero z-fighting on default GLB drops.

### Step 2: Gizmo and Transform Synchronization

- **Target**: `src/components/transform/TransformPanel.tsx` & Editor State Hooks
- **Action**: Migrate transform mutations off the React main thread to a transient `zustand` store or an immediate `three.js` proxy object to eliminate the 1-frame latency causing Gizmo detachment.
- **Validation**: Implement a Playwright E2E test dragging a `Scale` gizmo 100 units rapidly to ensure 0-frame desync.

### Step 3: Global Error Boundary (Tooling)

- **Target**: `src/components/ErrorBoundary.tsx`
- **Action**: Wire the `componentDidCatch` to standard `unified-error-schemas.ts`. Any crash in the 3D canvas must yield a specific AST path (e.g., "Error in component X at line Y").

## 3. Deployment Checklist

- [ ] Run `pnpm test` for Studio.
- [ ] Execute E2E Suite (`undo-history.scenario.ts`, `sketch-mode.scenario.ts`).
- [ ] Document changes in `CHANGELOG.md` under V1-V5 Refinement.
