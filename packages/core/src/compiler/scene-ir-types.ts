/**
 * Scene IR types — the intermediate representation used by the native renderer.
 *
 * These types were previously co-located with R3FCompiler. They are now stable
 * standalone types so the native runtime and Studio can reference them without
 * depending on any apex-poison compiler class.
 *
 * R3FNode is the scene tree IR that flows from parser → compiler → renderer.
 * The "R3F" name is a historical artifact; the type now represents the generic
 * HoloScript scene intermediate representation (scene-IR).
 */

import type { HSPlusDirective, VRTraitName } from '../types';
import type { AssetMaturity } from '../traits/DraftTrait';

export type { AssetMaturity } from '../traits/DraftTrait';

/**
 * Scene intermediate representation node.
 * Produced by the parser and consumed by the native renderer (r3f-renderer,
 * BrowserRuntime, ImmersiveViewer). Previously named R3FNode — that alias is
 * preserved for backward compatibility.
 */
export interface SceneIRNode {
  type: string;
  id?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Dynamic React component props bag; full `unknown` refactor tracked separately
  props: Record<string, unknown>;
  children?: SceneIRNode[];
  traits?: Map<VRTraitName, Record<string, unknown>>;
  directives?: HSPlusDirective[];
  /**
   * Asset maturity stage in the Draft→Mesh→Simulation pipeline.
   * - 'draft': Geometric primitive (shape-as-pixel), used for blockout AND collision proxy
   * - 'mesh': Imported/generated mesh with LOD, still iterating
   * - 'final': Production-ready asset with full materials and optimized LOD chain
   * Defaults to 'mesh' for backward compatibility.
   */
  assetMaturity?: AssetMaturity;
}

/**
 * Backward-compatibility alias. New code should use SceneIRNode.
 */
export type R3FNode = SceneIRNode;
