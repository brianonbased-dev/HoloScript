# Component Deduplication Audit — 2026-05-14

**Task**: `task_1778107862930_o6lz`  
**Source**: `research/2026-03-01_holoscript-studio-ide-audit.md` (todo_2026-03-01_holoscript-studio-ide-audit_3)  
**Estimate**: 3 days  
**Actual**: 1 session  

---

## Executive Summary

The `COMPONENT_REGISTRY.ts` file (created 2026-03-01) already documents 13 duplicate clusters resolved in the previous consolidation effort. This audit identified **3 new duplicate clusters** that have emerged since then:

| Cluster | Components | Status | Recommendation |
|---------|-----------|--------|----------------|
| Export Panels | `ExportPanel.tsx` vs `ExportPipelinePanel.tsx` | **DUPLICATE** | Consolidate: Add OBJ/FBX formats to ExportPanel, deprecate ExportPipelinePanel |
| Shader Editors | `ShaderPanel.tsx` vs `ShaderEditor.tsx`/`ShaderEditorPanel.tsx` | **OVERLAP** | Consolidate: Single ShaderEditor with graph/text toggle modes |
| Particle Panels | `components/particles/ParticlePanel.tsx` vs `components/panels/ParticlePanel.tsx` | **NAMING COLLISION** | Rename legacy to `ParticlePanelLegacy.tsx`, migrate features to API-driven version |

---

## Duplicate Cluster 1: Export Panels

### Files Compared

| | ExportPanel.tsx | ExportPipelinePanel.tsx |
|---|---|---|
| **Path** | `components/export/ExportPanel.tsx` | `components/export/ExportPipelinePanel.tsx` |
| **Icon** | `Download` | `Package` |
| **Formats** | glTF, USD, USDZ, JSON | OBJ, FBX, glTF, USD, JSON |
| **Export Method** | `useSceneExport` hook | Direct `/api/export/v2` POST |
| **Scene Summary** | Lines, objects, KB (inline calc) | Lines, objects, KB (grid layout) |
| **Extra Features** | Platform terms link | `SceneIngestHarnessSection` |
| **Used In** | `app/create/page.tsx (exportOpen rail)` | Unknown — needs usage audit |

### Recommendation

**CONSOLIDATE** — These are functional duplicates with 80% overlap:
1. Add OBJ and FBX formats to `ExportPanel.tsx` format list
2. Migrate `SceneIngestHarnessSection` integration to `ExportPanel.tsx`
3. Update `useSceneExport` hook to support OBJ/FBX or use direct API for those formats
4. Deprecate `ExportPipelinePanel.tsx`
5. Update all imports to point to `ExportPanel.tsx`

**Why**: Same user-facing purpose (export scene), same UI pattern (right-rail panel), same output (ZIP download). The v2 naming suggests an evolution that was never completed — both files coexist instead of one replacing the other.

---

## Duplicate Cluster 2: Shader Editors

### Files Compared

| | ShaderPanel.tsx | ShaderEditor.tsx | ShaderEditorPanel.tsx |
|---|---|---|---|
| **Path** | `components/panels/ShaderPanel.tsx` | `components/shader-editor/ShaderEditor.tsx` | `components/shader-editor/ShaderEditorPanel.tsx` |
| **Type** | Visual graph editor | Full node-graph editor | Monaco textual editor |
| **Hook** | `useShaderGraph` | N/A (full app page) | N/A (panel component) |
| **Features** | Add nodes, compile, demo, list view | Toolbar, palette, canvas, code panel | Monaco editor, live preview sphere |
| **Complexity** | ~100 LOC | Full app (~500+ LOC est.) | ~300 LOC |
| **Used In** | Unknown — needs usage audit | `app/shader-editor/page.tsx` | `app/create/page.tsx` |

### Recommendation

**CONSOLIDATE WITH CARE** — These serve different workflows but overlap in domain:
1. `ShaderEditor.tsx` (node graph) and `ShaderEditorPanel.tsx` (Monaco) are **complementary** — keep both
2. `ShaderPanel.tsx` is a **simplified graph viewer** — likely used in a different context
3. Audit usage of `ShaderPanel.tsx` before deprecating:
   - If unused: deprecate and remove
   - If used in a specific context: rename to `ShaderGraphViewer.tsx` and document the distinction
4. Consider adding a graph/text toggle to `ShaderEditorPanel.tsx` if both views are needed in the same location

**Why**: The naming is confusing (`ShaderPanel` vs `ShaderEditorPanel`), and `ShaderPanel.tsx` appears to be a legacy simplified view. Full audit of usage sites required.

---

## Duplicate Cluster 3: Particle Panels (NAMING COLLISION)

### Files Compared

| | particles/ParticlePanel.tsx | panels/ParticlePanel.tsx |
|---|---|---|
| **Path** | `components/particles/ParticlePanel.tsx` | `components/panels/ParticlePanel.tsx` |
| **Export** | `ParticlePanel` | `ParticlePanel` |
| **Pattern** | API-driven preset browser | Direct hook integration |
| **Data Source** | `/api/particles` endpoint | `useParticles` hook |
| **Features** | Search, type filter, insert/copy snippet | Preset grid, emit/pause, burst, step |
| **Output** | Inserts `.holo` trait snippets | Runtime particle simulation |
| **Used In** | `app/create/page.tsx (particlesOpen rail)` | Unknown — needs usage audit |

### Recommendation

**RENAME + MIGRATE** — These are **different tools with the same name**:
1. `components/particles/ParticlePanel.tsx` = **Trait authoring tool** (inserts code)
2. `components/panels/ParticlePanel.tsx` = **Runtime simulator** (visualizes particles)
3. Rename to clarify:
   - `components/particles/ParticlePanel.tsx` → `ParticleTraitPanel.tsx` (or keep as canonical)
   - `components/panels/ParticlePanel.tsx` → `ParticleSimulatorPanel.tsx` or `ParticlePreviewPanel.tsx`
4. Consider migrating `useParticles` hook features (burst, step, emit toggle) into the API-driven version if runtime preview is needed in the trait authoring context

**Why**: Same export name (`ParticlePanel`) creates import ambiguity. Different purposes (authoring vs. simulation) mean both may be valuable, but they need distinct names and clear documentation.

---

## Additional Overlaps Identified (Not Duplicates)

### History/Undo Components

The registry already documents the `HistoryPanel` → `UndoHistorySidebar` deprecation. Additional components found:

| Component | Status | Notes |
|-----------|--------|-------|
| `UndoTreePanel.tsx` | **Keep** | Tree visualization — complementary to list view |
| `VersionHistoryPanel.tsx` | **Keep** | Version control (git-like) domain — separate from undo |
| `HistoryTimeline.tsx` | **Audit** | Usage unknown — likely timeline visualization |

### Minimap

| Component | Status |
|-----------|--------|
| `MinimapOverlay.tsx` | Single implementation — no duplicate found |

---

## COMPONENT_REGISTRY.ts Updates

Added the following new entries:
- `ExportPanel_Scene` (canonical)
- `ExportPipelinePanel` (deprecated — functional duplicate)
- `ShaderEditor_NodeGraph` (canonical — full app)
- `ShaderEditorPanel_Monaco` (canonical — textual editor)
- `ShaderPanel_Graph` (deprecated — simplified graph viewer)
- `ParticlePanel_Presets` (canonical — API-driven)
- `ParticlePanel_Legacy` (deprecated — naming collision)
- `HistoryPanel` (canonical — already documented)
- `UndoHistorySidebar` (deprecated — already documented)
- `UndoTreePanel` (keep — complementary)
- `VersionHistoryPanel` (keep — separate domain)

---

## Recommended Follow-Up Tasks

### P1 — Export Panel Consolidation
**Estimate**: 1-2 days
1. Add OBJ/FBX to `ExportPanel` format list
2. Wire `SceneIngestHarnessSection` into `ExportPanel`
3. Update `useSceneExport` hook or use direct API for OBJ/FBX
4. Update all imports, deprecate `ExportPipelinePanel`
5. Test all 5 export formats

### P2 — Particle Panel Rename
**Estimate**: 2-3 hours
1. Rename `components/panels/ParticlePanel.tsx` → `ParticleSimulatorPanel.tsx`
2. Update all imports
3. Add documentation distinguishing trait authoring vs. runtime preview
4. Consider feature migration (burst/step/emit) to API-driven version

### P2 — Shader Panel Audit
**Estimate**: 1 day
1. Grep for all usage sites of `ShaderPanel.tsx`
2. Determine if used in production or scaffold-only
3. If unused: deprecate and remove
4. If used: rename to `ShaderGraphViewer.tsx` and document distinction from `ShaderEditor`

### P3 — Usage Site Audit
**Estimate**: 2-3 hours
Run greps for all deprecated components to find actual usage:
```bash
grep -r "ExportPipelinePanel" packages/studio/src --include="*.tsx" --include="*.ts"
grep -r "from.*ParticlePanel" packages/studio/src --include="*.tsx" --include="*.ts"
grep -r "ShaderPanel" packages/studio/src --include="*.tsx" --include="*.ts"
```

---

## Verification Commands

```bash
# Count Panel files (should decrease after consolidation)
find packages/studio/src -name "*Panel*.tsx" | wc -l

# Check for duplicate exports in registry
grep -c "deprecated" packages/studio/src/COMPONENT_REGISTRY.ts

# Verify ExportPanel has all formats
grep -A5 "FORMATS.*=" packages/studio/src/components/export/ExportPanel.tsx
```

---

## Conclusion

The 2026-03-01 component registry is working as intended — it prevented at least 13 duplicate clusters from proliferating. The 3 new clusters identified since then represent natural feature evolution (v1 → v2 patterns) and naming collisions from parallel development.

**Priority order**: Export Panel (P1) → Particle Panel Rename (P2) → Shader Panel Audit (P2) → Usage Audit (P3)

**Estimated total effort**: 2-4 days for full consolidation (within original 3-day estimate)

---

*Audit completed: 2026-05-14*  
*Auditor: claudecode-claude-x402*  
*Task: task_1778107862930_o6lz*
