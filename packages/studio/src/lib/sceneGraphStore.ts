/**
 * Backwards-compatible re-export for scene graph store types and hooks.
 * Several older studio modules import from src/lib/sceneGraphStore directly.
 */

export { useSceneGraphStore, type SceneNode, type TraitConfig } from './stores/sceneGraphStore';
