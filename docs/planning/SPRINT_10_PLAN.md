# Sprint 10 Plan — Data-Driven from `holoscript absorb`

**Absorb run**: `holoscript absorb packages/studio --json`
**Date**: 2026-03-10

---

## Codebase Snapshot

| Layer             | Files   | LOC         | Symbols      |
| ----------------- | ------- | ----------- | ------------ |
| `src/components/` | 300     | 64,775      | 2,991        |
| `src/hooks/`      | 105     | 14,020      | 421          |
| `src/app/`        | 65      | 10,504      | 39,373       |
| `src/features/`   | 5       | 2,533       | 192          |
| **Total Studio**  | **853** | **190,311** | **11,889**   |
| Imports           | —       | —           | 2,133 edges  |
| Calls             | —       | —           | 47,706 edges |

---

## Key Architectural Findings

### 🔴 Central Nervous System: `@/lib/stores`

- Imported by **139 files** — more than any other internal module
- Changing anything in `@/lib/stores` has potential blast radius of **~40% of the codebase**
- **Action**: Before any state refactor, run `holoscript absorb --impact src/lib/stores.ts`

### 🔴 God Component: `StudioHeader.tsx`

- 738 LOC, **50 symbols** — highest symbol density of any UI file
- Entry point for all panel navigation, mode switching, toolbar actions
- **Action**: Any Sprint 10 UI addition (e.g., Verify button wiring) goes here — already mapped

### 🟡 Most-Imported External Packages

| Package             | Import count | Risk                |
| ------------------- | ------------ | ------------------- |
| `react`             | 395          | Stable              |
| `lucide-react`      | 175          | Low — icon lib      |
| `vitest`            | 150          | Test-only           |
| `@/lib/stores`      | 139          | **HIGH — internal** |
| `@holoscript/core`  | 83           | Medium — external   |
| `three`             | 41           | Medium — 3D engine  |
| `@/lib/shaderGraph` | 13           | Medium — we own it  |

### 🟡 Top Source Files by LOC (non-test)

| LOC | Symbols | File                                                        |
| --- | ------- | ----------------------------------------------------------- |
| 964 | 8       | `src/lib/memeTemplates.ts` — data-only, low risk            |
| 849 | 62      | `src/lib/urbanFarmPlanner.ts` — 62 symbols, high complexity |
| 785 | 7       | `src/lib/sceneTemplates.ts` — data-only                     |
| 752 | 15      | `src/lib/mock-generator.ts` — test helper                   |
| 738 | 50      | `src/components/StudioHeader.tsx` — **critical UI hub**     |

---

## Sprint 10 Execution Plan (Absorb-Informed)

### Priority 1 — StudioHeader: Conformance Verify Button

**Why first**: absorb shows StudioHeader.tsx is already the 738-LOC hub with 50 symbols. Any new Studio entrypoint belongs here. ConformanceSuitePanel tests are already passing — this is a wiring task only.

**Files touched**:

- `src/components/StudioHeader.tsx` (+1 Verify button → panel trigger)
- `src/components/panels/ConformanceSuitePanel.tsx` (no changes needed)

**Blast risk**: StudioHeader imports `@/lib/stores` — low risk since we're adding, not modifying state.

---

### Priority 2 — Spatial Blame Feature

**Why second**: The `versionControl/` component dir exists (found in component inventory) but contains no Blame logic. git blame is a pure read operation with zero `@/lib/stores` coupling.

**Files touched**:

- `src/components/versionControl/` → new `SpatialBlameOverlay.tsx`
- `src/components/history/HistoryPanel.tsx` (blame trigger)
- `src/features/versionControl/gitBlameService.ts` (new)

**Blast risk**: New files only — absorb shows `HistoryPanel.tsx` has minimal import fan-out.

---

### Priority 3 — Asset Auto-Snap (Artist DX)

**Why third**: `AssetDropProcessor.tsx` is already open in the editor and is the only file in `src/components/assets/` that handles drop events. Adding floor-snap + context detection is self-contained.

**Files touched**:

- `src/components/assets/AssetDropProcessor.tsx` (add floor snap logic)
- `src/hooks/useDragSnap.ts` (new)

**Blast risk**: `AssetDropProcessor` imports `three` (41 importers across Studio) — contained.

---

### Priority 4 — `@/lib/stores` Audit (Risk Reduction Before Any State Work)

**Why now**: With 139 importers, we should audit the store shape before Sprint 10 adds more state (Agent Monitor, Economic Primitives panels). A messy store will cascade.

**Action**: Run absorb impact analysis:

```bash
node packages/cli/dist/cli.js absorb packages/studio --impact src/lib/stores.ts --json
```

Audit store slices, identify any duplicate state, document the surface before adding new slices.

---

### Priority 5 — Agent Monitor Panel (v5.0 Gap)

**Why fifth**: New panel — no existing code to break. After the stores audit, we know exactly where to add the agent state slice.

**Files touched**:

- `src/components/ai/AgentMonitorPanel.tsx` (new)
- `src/hooks/useAgentMonitor.ts` (new)
- `src/lib/stores.ts` (new `agentMonitor` slice — after audit)

---

### Priority 6 — Simplified Material Panel

**Why sixth**: `src/components/materials/` exists. Absorb shows `@/lib/shaderGraph` imported 13x — our locally-owned module that we already hardened this sprint (DFS cycle detection, ports[], category).

**Files touched**:

- `src/components/materials/SimpleMaterialPanel.tsx` (new)
- `src/hooks/useSimpleMaterial.ts` (new, reuses `useShaderGraph`)

---

## Absorb-Derived Risks to Avoid

| Risk                                 | What absorb told us                     | Mitigation                                                   |
| ------------------------------------ | --------------------------------------- | ------------------------------------------------------------ |
| `@/lib/stores` refactor              | 139 importers — blast radius ~350 files | Run impact analysis first, touch store last                  |
| `StudioHeader.tsx` changes           | 50 symbols, 738 LOC — highly coupled    | Add only, never remove or rename                             |
| `@holoscript/core` interface changes | 83 importers                            | Pin version, use local adapters (as we did with ShaderGraph) |
| New state slices                     | Store coupling compounds                | Audit existing slices before adding                          |

---

## Pre-Sprint Checklist (Absorb Protocol)

- [x] Run `holoscript absorb packages/studio --json` → `knowledge.holo`
- [x] Identify module communities (5: root, e2e, public, scripts, src)
- [x] Map highest-coupling modules (`@/lib/stores` 139x)
- [x] Find God Components (`StudioHeader.tsx` 50 sym)
- [ ] Run `--impact` before touching `@/lib/stores`
- [ ] Run `--detect-changes` after each major feature to verify blast radius
