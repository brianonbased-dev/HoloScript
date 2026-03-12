# @/lib/stores Audit — Sprint 10

> Generated: 2026-03-10 · HoloScript Studio `packages/studio/src/lib/stores/`

## Store Inventory

| Store | File | Size | Exporters via barrel | Unique importers | Risk |
|---|---|---|---|---|---|
| `useSceneStore` | `sceneStore.ts` | 61 L | ✅ | **72** | 🔴 Critical |
| `useSceneGraphStore` | `sceneGraphStore.ts` | 178 L | ✅ | **40** | 🔴 High |
| `useEditorStore` | `editorStore.ts` | 94 L | ✅ | **31** | 🟡 High |
| `useCharacterStore` | `characterStore.ts` | 145 L | ✅ | **23** | 🟡 Medium |
| `usePanelVisibilityStore` | `panelVisibilityStore.ts` | 218 L | ✅ | **1** | 🟢 Low |
| `useBuilderStore` | `builderStore.ts` | 147 L | ✅ | **5** | 🟢 Low |
| `useAIStore` | `aiStore.ts` | 37 L | ✅ | **4** | 🟢 Low |
| `usePlayMode` | `playModeStore.ts` | 238 L | ❌ (direct import) | **4** | 🟢 Low |

**Note:** `usePlayMode` is NOT exported from `index.ts` — components import directly from `playModeStore`. This is a minor inconsistency.

---

## Slice Catalogue

### `useSceneStore` 🔴 (72 importers)
**Owns:** HoloScript source code, compiled R3F tree, parse errors, scene metadata.

| Field | Type | Purpose |
|---|---|---|
| `code` | `string` | Raw HoloScript source |
| `r3fTree` | `R3FNode \| null` | Compiled render tree |
| `errors` | `{message, line?}[]` | Parse/compile errors |
| `metadata` | `SceneMetadata` | id, name, timestamps |
| `isDirty` | `boolean` | Unsaved changes flag |

**Safe to extend:** Yes — append new fields to `SceneMetadata` or add `compilationStats`. Do **not** restructure `code`/`r3fTree` without auditing all 72 consumers.

**Risk area:** `setCode` always sets `isDirty: true` and mutates metadata timestamp — any optimization of this hot path affects all editors.

---

### `useSceneGraphStore` 🔴 (40 importers)
**Owns:** Scene node tree, transient Three.js refs, material mutations.

| Field | Type | Purpose |
|---|---|---|
| `nodes` | `SceneNode[]` | All scene objects |
| `nodeRefs` | `Record<id, Object3D>` | Live Three.js refs (not serialized) |

**Actions:** `addNode`, `removeNode`, `moveNode`, `updateNodeTransform`, `updateNode`, `addTrait`, `removeTrait`, `setTraitProperty`, `setNodeRef`, `applyTransientTransform`, `applyTransientMaterial`

**Safe to extend:** New fields on `SceneNode` are safe. Adding new action methods is safe. `nodes` array mutation pattern (map/filter) is consistent.

**Risk area:** `applyTransientTransform` — mutates Three.js objects **and** Zustand state in one set() call. Side effects are invisible to React devtools.

**Risk area:** `nodeRefs` — raw `any` typed; growth of this map is never cleaned up when nodes are removed.

> **Recommendation:** Add cleanup in `removeNode` to also delete `nodeRefs[id]`.

---

### `useEditorStore` 🟡 (31 importers)
**Owns:** UI mode state, gizmo mode, panel booleans, spatial blame tooltip.

| Field | Type | Purpose |
|---|---|---|
| `studioMode` | `StudioMode` | creator / artist / filmmaker / expert / character / scenarios |
| `gizmoMode` | `GizmoMode` | translate / rotate / scale |
| `artMode` | `ArtMode` | none / sketch / paint / generative |
| `showGovernancePanel`, `showConformancePanel` | `boolean` | Right-rail panel toggles |
| `spatialBlameTooltip` | `{visible, x, y, content}` | Blame overlay state |
| `selectedObjectId/Name` | `string \| null` | Scene selection |

**Overlap warning:** `showGovernancePanel` + `showConformancePanel` are here, but 44 other panels live in `usePanelVisibilityStore`. There are two systems managing panel visibility.

> **Recommendation:** Migrate `showGovernancePanel` + `showConformancePanel` into `usePanelVisibilityStore` as `governance` + `conformance` panel keys. This is a future cleanup; it requires updating 2 importers (`editorStore`, `create/page.tsx`).

---

### `useCharacterStore` 🟡 (23 importers)
**Owns:** Character rig, recording, morph targets, skin, wardrobe.

**Safe to extend:** Add new `panelMode` values, new wardrobe slots, new morph target properties. The `equippedItems: Partial<Record<WardrobeSlot, WardrobeItem>>` pattern is extensible.

**Risk area:** `setGlbUrl` resets bone/animation state as side effect — any importer that sets glbUrl must accept bone/animation state clearing.

---

### `usePanelVisibilityStore` 🟢 (1 direct importer)
**Owns:** 44 panel open/closed booleans via `PanelKey` union type.

Generated pattern: each key gets `${key}Open`, `set${Key}Open()`, `toggle${Key}Open()`.

**Safe to extend:** Add new `PanelKey` union members. The factory pattern auto-generates all 3 members. No importer refactoring needed.

> **For P5 (Agent Monitor Panel):** Add `'agentMonitor'` to `PanelKey`. Zero-refactor cost.

---

### `useBuilderStore` 🟢 (5 importers)
**Owns:** Grid snap toggle, grid size, builder mode, hotbar slots.

`snapToGrid()` + `snapPosition()` are pure functions exported alongside the store — now also consumed by `useDragSnap` (P3).

**Safe to extend:** New hotbar shapes, new builder modes.

---

### `useAIStore` 🟢 (4 importers)
**Owns:** AI inference status, Ollama status, model name, prompt history.

Small and focused. **Safe to extend** with agent cycle state — but see P5 recommendation below for why a separate `agentStore` is better.

---

### `usePlayMode` 🟢 (4 importers)
**Owns:** Play state machine, game state (score/lives/level), scene snapshot for revert.

**Inconsistency:** Not exported from `index.ts` barrel — importers use `from '@/lib/stores/playModeStore'` directly.

> **Recommendation:** Add to `index.ts` export. Low risk (4 files, same import just path changes).

---

## Duplication Risks

| Risk | Location | Severity |
|---|---|---|
| Two panel visibility systems | `editorStore` (governance + conformance) vs `panelVisibilityStore` (44 others) | Medium |
| `usePlayMode` not in barrel | Direct imports bypass `@/lib/stores` | Low |
| `nodeRefs` memory leak | `removeNode` doesn't clean `nodeRefs[id]` | Low-Medium |
| `sceneStore.setCode` side effects | Timestamp + isDirty mutation on every keystroke (hot path) | Low |

---

## Safe Extension Points for P5 & P6

### P5: Agent Monitor Panel
- **Do:** Add `'agentMonitor'` to `PanelKey` in `panelVisibilityStore.ts`
- **Do:** Create new `agentStore.ts` (separate slice, low blast radius)
- **Don't:** Extend `useAIStore` — different ownership domain

### P6: Simple Material Panel
- **Do:** Call `useSceneGraphStore.applyTransientMaterial()` — already supports material writes
- **Do:** Call `useSceneGraphStore.setTraitProperty()` for persistence
- **Don't:** Add new top-level state to `sceneGraphStore` for material — use node traits

---

## Recommendations Summary

1. **Add `usePlayMode` to `index.ts`** — trivial, removes inconsistency
2. **Fix `nodeRefs` leak in `removeNode`** — one-line fix, prevents memory bloat in large scenes
3. **Future:** Migrate `showGovernancePanel/showConformancePanel` from `editorStore` → `panelVisibilityStore`
4. **Future:** Consider debouncing `sceneStore.setCode` to reduce re-render frequency on hot path
