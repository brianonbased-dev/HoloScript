# Track 1: Studio Quality DX & Operations Hub Refinement

**Status**: Planning Phase Complete (Absorb Graph Generated)
**Knowledge Graph File**: `packages/studio/knowledge.holo` (UTF-8)

## 1. The Realization: The Operations Pivot

HoloScript Studio is **not** a game engine editor meant to compete with Unity or HoloLand.
It is the **Operations, Governance, and Lifecycle Management Hub** for the spatial web.

If `.holo` files solve the Version Control, Compliance, and Preservation impossibilities, then Studio must be the UI that exposes those solves.

## 2. Execution Blueprint (Phase 1A and 1B)

### Step 1: Spatial Version Control UI (Git for 3D)

- **Target**: `src/components/history/HistoryPanel.tsx` & `src/components/canvas/SceneView.tsx`
- **Action**: Implement "Spatial Blame". When a `.holo` file is loaded from a Git repo, clicking a trait (e.g., `@breakable`) in the UI should query `git blame` and render the commit hash/author who introduced that behavioral contract.
- **Validation**: Ensure `git diff` can be rendered visually inside the 3D canvas (showing the "before" world state as a translucent ghost overlay).

### Step 2: Conformance and Verification Pipelines

- **Target**: `src/components/tools/ConformanceSuite.tsx` (NEW)
- **Action**: Build a UI panel that stops treating the "Play" button as a game launcher, and starts treating it as a **Verification Runner**. Execute property-based testing against the AST (e.g., "Prove all Rigidbodies conform to the gravity standard").
- **Validation**: Ensure the output matches standard CI/CD test runner logs.

### Step 3: Global Error Boundary (Tooling & Auditing)

- **Target**: `src/components/ErrorBoundary.tsx`
- **Action**: Wire the `componentDidCatch` to standard `unified-error-schemas.ts`. Any crash must yield a specific AST path (e.g., "Error in component X at line Y") compatible with FDA 21 CFR Part 11 electronic audit trails.
- **Validation**: Simulate a WebGL crash and assert the audit log writes correctly to disk.

## 3. Deployment Checklist

- [ ] Run `pnpm test` for the Governance and Conformance components.
- [ ] Execute E2E Suite (`undo-history.scenario.ts`, `conformance_runner.scenario.ts`).
- [ ] Document changes in `CHANGELOG.md` under Operations Pivot.
