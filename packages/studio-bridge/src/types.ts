/**
 * @holoscript/studio-bridge - Type Definitions
 *
 * Self-contained type definitions for bidirectional translation between
 * HoloScript visual graphs and HoloScript AST nodes.
 *
 * These types are structurally compatible with @holoscript/core and
 * @holoscript/visual but defined locally to avoid runtime resolution
 * issues with packages that may not have built dist artifacts.
 */

// ============================================================================
// AST Types (compatible with @holoscript/core)
// ============================================================================

/**
 * Base AST node (structurally compatible with @holoscript/core ASTNode)
 */
export interface ASTNode {
  type: string;
  id?: string;
  position?: { x: number; y: number; z: number };
  hologram?: Record<string, unknown>;
  line?: number;
  column?: number;
  directives?: Array<Record<string, unknown>>;
  traits?: Map<string, unknown>;
}

/**
 * Orb node (structurally compatible with @holoscript/core OrbNode)
 */
export interface OrbNode extends ASTNode {
  type: 'orb';
  name: string;
  properties: Record<string, unknown>;
  methods?: Array<ASTNode & { name: string; parameters: ASTNode[]; body: ASTNode[] }>;
  children?: ASTNode[];
}

// ============================================================================
// Visual Graph Types (compatible with @holoscript/visual)
// ============================================================================

/**
 * Node categories matching @holoscript/visual
 */
export type NodeCategory = 'event' | 'action' | 'logic' | 'data';

/**
 * Port type for connections
 */
export type PortType = 'flow' | 'string' | 'number' | 'boolean' | 'any' | 'object' | 'array';

/**
 * Port definition for node inputs/outputs
 */
export interface PortDefinition {
  id: string;
  label: string;
  type: PortType;
  multiple?: boolean;
}

/**
 * Extended node data for HoloScript nodes
 */
export interface HoloNodeData {
  type: string;
  label: string;
  category: NodeCategory;
  properties: Record<string, unknown>;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
}

/**
 * HoloScript visual node (React Flow compatible)
 */
export interface HoloNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: HoloNodeData;
  [key: string]: unknown;
}

/**
 * HoloScript visual edge
 */
export interface HoloEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  data?: {
    sourcePort: string;
    targetPort: string;
    flowType: PortType;
  };
  [key: string]: unknown;
}

/**
 * Visual graph structure
 */
export interface VisualGraph {
  nodes: HoloNode[];
  edges: HoloEdge[];
  metadata: GraphMetadata;
}

/**
 * Graph metadata
 */
export interface GraphMetadata {
  name: string;
  description?: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  targetObject?: string;
}

/**
 * Code generation result
 */
export interface CodeGenResult {
  code: string;
  format: 'hs' | 'hsplus' | 'holo';
  errors: Array<{ nodeId: string; message: string; severity: 'error' | 'warning' }>;
  warnings: string[];
}

// ============================================================================
// Bridge Mapping Types
// ============================================================================

/**
 * A mapping entry that links a visual node to its corresponding AST node(s).
 * Enables round-trip fidelity between the two representations.
 */
export interface BridgeMapping {
  /** Unique ID for this mapping */
  id: string;
  /** The visual node ID (from React Flow) */
  visualNodeId: string;
  /** The AST node path (dot-separated, e.g. "composition.objects[0].handlers[1]") */
  astPath: string;
  /** The type of relationship between visual and AST */
  relationship: MappingRelationship;
  /** Source location in generated code (for source maps) */
  sourceLocation?: SourceLocation;
  /** Metadata about the mapping */
  metadata?: Record<string, unknown>;
}

/**
 * Relationship types between visual nodes and AST nodes
 */
export type MappingRelationship =
  | 'direct' // 1:1 mapping (e.g., on_click event -> on_click handler)
  | 'composite' // 1:N mapping (visual node expands to multiple AST nodes)
  | 'aggregate' // N:1 mapping (multiple visual nodes collapse to one AST node)
  | 'derived' // The AST node is inferred/derived from visual context
  | 'structural'; // Structural wrapper (e.g., composition block, environment block)

/**
 * Source location for mapping to generated code
 */
export interface SourceLocation {
  /** Line number (1-indexed) */
  line: number;
  /** Column number (0-indexed) */
  column: number;
  /** End line number */
  endLine?: number;
  /** End column number */
  endColumn?: number;
  /** The source file or format origin */
  source?: string;
}

// ============================================================================
// Translation Result Types
// ============================================================================

/**
 * Result of translating a visual graph to AST
 */
export interface VisualToASTResult {
  /** The root AST nodes produced by translation */
  ast: ASTNode[];
  /** Generated HoloScript code */
  code: string;
  /** The code format used */
  format: 'hs' | 'hsplus' | 'holo';
  /** All bridge mappings from visual nodes to AST paths */
  mappings: BridgeMapping[];
  /** Translation diagnostics */
  diagnostics: BridgeDiagnostic[];
  /** Source map for round-trip debugging */
  sourceMap?: BridgeSourceMap;
}

/**
 * Result of translating AST to a visual graph
 */
export interface ASTToVisualResult {
  /** The visual graph produced by translation */
  graph: VisualGraph;
  /** All bridge mappings from AST paths to visual nodes */
  mappings: BridgeMapping[];
  /** Translation diagnostics */
  diagnostics: BridgeDiagnostic[];
  /** AST nodes that could not be represented visually */
  unmappedNodes: ASTNode[];
}

/**
 * A diagnostic message from the translation process
 */
export interface BridgeDiagnostic {
  /** Severity level */
  severity: 'error' | 'warning' | 'info';
  /** Diagnostic message */
  message: string;
  /** The visual node ID (if applicable) */
  visualNodeId?: string;
  /** The AST path (if applicable) */
  astPath?: string;
  /** Diagnostic code for programmatic handling */
  code?: string;
  /** Suggested fix */
  suggestion?: string;
}

/**
 * Source map for bidirectional translation
 */
export interface BridgeSourceMap {
  /** Version of the source map format */
  version: number;
  /** The generated code file */
  file: string;
  /** Mapping entries */
  entries: SourceMapEntry[];
}

/**
 * Individual source map entry
 */
export interface SourceMapEntry {
  /** Generated code position */
  generated: SourceLocation;
  /** Visual node that produced this code */
  visualNodeId: string;
  /** The visual node type */
  visualNodeType: string;
}

// ============================================================================
// Sync Engine Types
// ============================================================================

/**
 * Change event emitted during synchronization
 */
export interface BridgeChangeEvent {
  /** Type of change */
  type:
    | 'node-added'
    | 'node-removed'
    | 'node-updated'
    | 'edge-added'
    | 'edge-removed'
    | 'property-changed';
  /** Which side originated the change */
  origin: 'visual' | 'ast';
  /** The affected visual node ID */
  visualNodeId?: string;
  /** The affected AST path */
  astPath?: string;
  /** Previous value (for updates) */
  previousValue?: unknown;
  /** New value (for updates) */
  newValue?: unknown;
  /** Timestamp of the change */
  timestamp: number;
}

/**
 * Sync state for the bridge engine
 */
export interface SyncState {
  /** Whether sync is currently active */
  active: boolean;
  /** Direction of sync */
  direction: 'visual-to-ast' | 'ast-to-visual' | 'bidirectional';
  /** Last sync timestamp */
  lastSyncTimestamp: number;
  /** Number of pending changes */
  pendingChanges: number;
  /** Sync error (if any) */
  error?: string;
}

/**
 * Options for the sync engine
 */
export interface SyncOptions {
  /** Sync direction */
  direction: 'visual-to-ast' | 'ast-to-visual' | 'bidirectional';
  /** Debounce interval in ms for batching changes */
  debounceMs: number;
  /** Whether to generate source maps during sync */
  generateSourceMaps: boolean;
  /** Code format for generated output */
  codeFormat: 'hs' | 'hsplus' | 'holo';
  /** Whether to preserve comments in round-trip */
  preserveComments: boolean;
}

// ============================================================================
// Translation Options
// ============================================================================

/**
 * Options for Visual-to-AST translation
 */
export interface VisualToASTOptions {
  /** Output code format */
  format: 'hs' | 'hsplus' | 'holo';
  /** Object name for the generated composition */
  objectName: string;
  /** Whether to include comments in generated code */
  includeComments: boolean;
  /** Indent string */
  indent: string;
  /** Whether to generate source maps */
  generateSourceMap: boolean;
  /** Whether to validate the graph before translation */
  validate: boolean;
}

/**
 * Options for AST-to-Visual translation
 */
export interface ASTToVisualOptions {
  /** Layout algorithm for positioning nodes */
  layout: 'auto' | 'grid' | 'force-directed' | 'tree';
  /** Starting X position for node placement */
  startX: number;
  /** Starting Y position for node placement */
  startY: number;
  /** Horizontal spacing between nodes */
  spacingX: number;
  /** Vertical spacing between nodes */
  spacingY: number;
  /** Whether to auto-connect inferred edges */
  autoConnect: boolean;
  /** Graph name (for metadata) */
  graphName: string;
}

// ============================================================================
// Node Type Mapping
// ============================================================================

/**
 * Maps visual node types to their AST translation strategies
 */
export interface NodeTranslationRule {
  /** The visual node type (e.g., 'on_click', 'play_sound') */
  visualType: string;
  /** The AST node type produced */
  astType: string;
  /** The translation strategy */
  strategy: 'event-handler' | 'action' | 'logic-branch' | 'data-source' | 'trait' | 'structural';
  /** The category of the visual node */
  category: NodeCategory;
  /** Transform function name (for custom transformations) */
  transformFn?: string;
}

/**
 * Maps AST node types to visual node creation strategies
 */
export interface ASTNodeVisualRule {
  /** The AST node type pattern (supports wildcards) */
  astTypePattern: string;
  /** The visual node type to create */
  visualType: string;
  /** The category to assign */
  category: NodeCategory;
  /** Default properties to set on the visual node */
  defaultProperties?: Record<string, unknown>;
  /** Port definitions for the created node */
  inputs?: PortDefinition[];
  /** Output port definitions */
  outputs?: PortDefinition[];
}
