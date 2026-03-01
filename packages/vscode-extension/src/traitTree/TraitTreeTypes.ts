/**
 * TraitTreeTypes - Data model for the Trait Composition Tree sidebar view.
 *
 * Defines the node types, property override tracking, and diamond inheritance
 * warning structures used by both the analyzer and the tree data provider.
 *
 * @module TraitTreeTypes
 * @version 1.0.0
 */

// =============================================================================
// SOURCE LOCATION
// =============================================================================

/**
 * A position within a source file, used for click-to-navigate.
 */
export interface TraitSourceLocation {
  /** File path (absolute or workspace-relative) */
  filePath: string;
  /** 1-based line number */
  line: number;
  /** 0-based column */
  column: number;
}

// =============================================================================
// PROPERTY TRACKING
// =============================================================================

/**
 * Represents a single property on a trait, tracking where it was
 * originally defined and whether it has been overridden.
 */
export interface TraitProperty {
  /** Property key name */
  key: string;
  /** Stringified value */
  value: string;
  /** Type annotation (if available) */
  type?: string;
  /** The trait that originally defined this property */
  origin: string;
  /** True if this property overrides a parent's value */
  isOverride: boolean;
  /** The parent value that was overridden (if isOverride) */
  overriddenValue?: string;
  /** The trait whose value was overridden */
  overriddenFrom?: string;
  /** Source location of this property declaration */
  location?: TraitSourceLocation;
}

// =============================================================================
// DIAMOND INHERITANCE
// =============================================================================

/**
 * A diamond inheritance warning emitted when two or more traits in
 * a composition share a common ancestor via different paths.
 */
export interface DiamondWarning {
  /** The shared ancestor trait name */
  sharedAncestor: string;
  /** The paths that lead to the shared ancestor (e.g., [['A', 'Base'], ['B', 'Base']]) */
  paths: string[][];
  /** Human-readable warning message */
  message: string;
  /** Severity: 'warning' for informational, 'error' for unresolvable conflicts */
  severity: 'warning' | 'error';
}

// =============================================================================
// TRAIT TREE NODE
// =============================================================================

/**
 * The kind of node in the trait composition tree.
 *
 * - `root`       : The top-level composition (e.g., `@turret = @physics + @ai_npc`)
 * - `trait`       : A trait definition (`trait Clickable extends Interactable { ... }`)
 * - `property`    : A property within a trait
 * - `category`    : A grouping node (e.g., "Properties", "Events", "Overrides")
 * - `warning`     : A diamond inheritance or conflict warning
 * - `composition` : A composition expression (`@turret = @physics + @targeting`)
 */
export type TraitTreeNodeKind =
  | 'root'
  | 'trait'
  | 'property'
  | 'category'
  | 'warning'
  | 'composition';

/**
 * A single node in the trait composition tree.
 * This is the core data model consumed by the TreeDataProvider.
 */
export interface TraitTreeNode {
  /** Unique ID for this node (used by VS Code TreeView) */
  id: string;
  /** Display label */
  label: string;
  /** Secondary description (shown after the label) */
  description?: string;
  /** Tooltip text (shown on hover) */
  tooltip?: string;
  /** Node kind (determines icon and behavior) */
  kind: TraitTreeNodeKind;
  /** Child nodes */
  children: TraitTreeNode[];
  /** Source location for click-to-navigate */
  location?: TraitSourceLocation;
  /** Properties (only for 'trait' nodes) */
  properties?: TraitProperty[];
  /** Diamond warnings (only for 'root' or 'composition' nodes) */
  diamondWarnings?: DiamondWarning[];
  /** The trait's parent/base name (only for 'trait' nodes with extends) */
  extends?: string;
  /** Full ancestry chain from parent to root */
  ancestors?: string[];
  /** Icon identifier (VS Code ThemeIcon name) */
  iconId?: string;
  /** Context value for VS Code menus */
  contextValue?: string;
}

// =============================================================================
// ANALYSIS RESULT
// =============================================================================

/**
 * The complete result of analyzing a HoloScript file for trait composition.
 */
export interface TraitCompositionAnalysis {
  /** All trait definitions found in the file/workspace */
  traits: Map<string, TraitTreeNode>;
  /** Composition expressions found (@name = @a + @b) */
  compositions: TraitTreeNode[];
  /** Root nodes for the tree view (top-level traits without parents + compositions) */
  roots: TraitTreeNode[];
  /** All diamond warnings detected */
  diamondWarnings: DiamondWarning[];
  /** Parse errors that occurred during analysis */
  errors: string[];
}
