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
export { useWardrobeStore } from './wardrobeStore';
export { useBuilderStore, snapToGrid, snapPosition } from './builderStore';
export type { BuilderMode, GeometryType, HotbarSlot } from './builderStore';
export { usePanelVisibilityStore } from './panelVisibilityStore';
export type { PanelKey, PanelVisibilityState } from './panelVisibilityStore';
export { usePlayMode } from './playModeStore';
export type { PlayState, GameState, PlayModeState } from './playModeStore';
export { useAgentStore } from './agentStore';
export type { AgentPhase, AgentCycleEntry } from './agentStore';
export { useWorkspaceStore } from './workspaceStore';
export type { Workspace, ProjectDNA, WorkspaceStatus, ProjectKind } from './workspaceStore';
export { usePipelineStore } from './pipelineStore';
export type { PipelineRun, LayerState } from '../recursive/types';
