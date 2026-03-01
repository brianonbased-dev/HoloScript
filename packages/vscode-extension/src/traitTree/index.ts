/**
 * Trait Composition Tree - IDE sidebar view for HoloScript trait hierarchy.
 *
 * Displays trait inheritance as an interactive tree with:
 * - extends relationships
 * - Property overrides
 * - Diamond inheritance warnings
 * - Click-to-navigate to definitions
 *
 * @module traitTree
 * @version 1.0.0
 */

export { TraitCompositionTreeProvider, TraitTreeItem, registerTraitTreeCommands } from './TraitCompositionTreeProvider';
export { TraitCompositionAnalyzer } from './TraitCompositionAnalyzer';
export type {
  TraitTreeNode,
  TraitTreeNodeKind,
  TraitProperty,
  DiamondWarning,
  TraitSourceLocation,
  TraitCompositionAnalysis,
} from './TraitTreeTypes';
