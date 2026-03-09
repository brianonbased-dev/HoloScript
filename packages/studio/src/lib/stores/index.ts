// ─── Barrel Export ──────────────────────────────────────────────────────────
// Re-exports all domain stores so existing `from '@/lib/stores'` imports keep working.

export { useSceneStore } from './sceneStore';
export { useAIStore } from './aiStore';
export { useSceneGraphStore } from './sceneGraphStore';
export type { TraitConfig, SceneNode } from './sceneGraphStore';
export { useEditorStore } from './editorStore';
export type { GizmoMode, ArtMode, StudioMode } from './editorStore';
export { useCharacterStore } from './characterStore';
export type { WardrobeSlot, WardrobeItem } from './characterStore';
export { useBuilderStore, snapToGrid, snapPosition } from './builderStore';
export type { BuilderMode, GeometryType, HotbarSlot } from './builderStore';
export { usePanelVisibilityStore } from './panelVisibilityStore';
export type { PanelKey, PanelVisibilityState } from './panelVisibilityStore';
