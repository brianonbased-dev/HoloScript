/**
 * HoloScript I/O — Core Language Serialization
 *
 * Provides the language-level components of .holo import/export:
 * - Core AST type definitions (CoreProgram, CoreWorldDeclaration, etc.)
 * - Simplified fallback parser for legacy .holo format
 * - AST expression evaluation (expressionToValue)
 * - Value formatting utilities
 * - Internal AST types (HoloScriptAST, HoloScriptASTNode)
 *
 * Platform-specific Scene conversion stays in the consuming platform
 * (e.g., Hololand's WorldBuilder provides Scene ↔ AST adapters).
 *
 * @module HoloScriptIO
 */

// =============================================================================
// CORE AST TYPES (from @holoscript/core parser output)
// =============================================================================

export interface CoreParseResult {
  success: boolean;
  program?: CoreProgram;
  errors: Array<{ message: string; line?: number; column?: number }>;
  warnings: Array<{ message: string; line?: number; column?: number }>;
}

export interface CoreProgram {
  type: 'Program';
  body: Array<CoreDeclaration | CoreStatement>;
  sourceType: 'holo' | 'hsplus';
}

export type CoreDeclaration = CoreWorldDeclaration | CoreOrbDeclaration | { type: string };
export type CoreStatement = { type: string };

export interface CoreWorldDeclaration {
  type: 'WorldDeclaration';
  name: string;
  properties: CoreOrbProperty[];
  children: Array<CoreOrbDeclaration | CoreStatement>;
}

export interface CoreOrbDeclaration {
  type: 'OrbDeclaration';
  name: string;
  properties: CoreOrbProperty[];
  children?: CoreOrbDeclaration[];
}

export interface CoreOrbProperty {
  type: 'OrbProperty';
  name: string;
  value: CoreExpression;
}

export type CoreExpression =
  | { type: 'NumberLiteral'; value: number }
  | { type: 'StringLiteral'; value: string }
  | { type: 'BooleanLiteral'; value: boolean }
  | { type: 'NullLiteral' }
  | { type: 'ArrayLiteral'; elements: CoreExpression[] }
  | {
      type: 'ObjectLiteral';
      properties: Array<{
        key: { type: string; name?: string; value?: string };
        value: CoreExpression;
      }>;
    }
  | { type: 'Vec3Literal'; x: CoreExpression; y: CoreExpression; z: CoreExpression }
  | { type: 'ColorLiteral'; value: string }
  | { type: 'Identifier'; name: string }
  | { type: string };

// =============================================================================
// INTERNAL AST TYPES
// =============================================================================

export interface HoloScriptAST {
  composition?: {
    name: string;
    meta?: Record<string, unknown>;
    settings?: Record<string, unknown>;
    assets?: Array<{ type: string; name: string; properties: Record<string, unknown> }>;
    nodes: HoloScriptASTNode[];
    logic?: HoloScriptASTLogic[];
  };
}

export interface HoloScriptASTNode {
  type: string;
  name: string;
  properties: Record<string, unknown>;
  children: HoloScriptASTNode[];
}

export interface HoloScriptASTLogic {
  event: string;
  actions: string[];
  state?: Record<string, unknown>;
}

// =============================================================================
// EXPORT/IMPORT OPTION TYPES
// =============================================================================

export interface HoloScriptExportOptions {
  /** Include comments explaining the structure */
  includeComments?: boolean;
  /** Pretty print with indentation (default: 2 spaces) */
  indent?: number;
  /** Include metadata like timestamps and author */
  includeMetadata?: boolean;
  /** Export visual scripts as HoloScript logic blocks */
  exportScripts?: boolean;
  /** Export asset references */
  exportAssets?: boolean;
}

export interface HoloScriptImportOptions {
  /** Validate structure before importing */
  validate?: boolean;
  /** Merge with existing scene instead of replacing */
  merge?: boolean;
  /** Prefix for imported node IDs (to avoid conflicts) */
  idPrefix?: string;
}

export interface HoloScriptParseResult<TScene = unknown> {
  success: boolean;
  scene?: TScene;
  errors: HoloScriptError[];
  warnings: string[];
}

export interface HoloScriptError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

// =============================================================================
// CORE PARSER BRIDGE
// =============================================================================

// Dynamic import of @holoscript/core parser (loaded at runtime)
let coreParser: { parse: (source: string) => CoreParseResult } | null = null;

/**
 * Try to load the @holoscript/core parser dynamically.
 * Call this function at application startup to enable production-quality parsing.
 */
export async function initHoloScriptParser(): Promise<boolean> {
  if (coreParser) return true;
  try {
    // Dynamic import to avoid build-time resolution issues
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const core = await (Function('return import("@holoscript/core")')() as Promise<any>);
    coreParser = { parse: core.parse };
    return true;
  } catch {
    // Core parser not available, will use fallback
    return false;
  }
}

/**
 * Parse with core parser if available, otherwise return null
 */
export function parseWithCoreParser(source: string): CoreParseResult | null {
  if (!coreParser) return null;
  try {
    return coreParser.parse(source);
  } catch {
    return null;
  }
}

// =============================================================================
// EXPRESSION → VALUE CONVERSION
// =============================================================================

/**
 * Convert AST Expression to JavaScript value
 */
export function expressionToValue(expr: CoreExpression): unknown {
  switch (expr.type) {
    case 'NumberLiteral':
      return (expr as { type: 'NumberLiteral'; value: number }).value;

    case 'StringLiteral':
      return (expr as { type: 'StringLiteral'; value: string }).value;

    case 'BooleanLiteral':
      return (expr as { type: 'BooleanLiteral'; value: boolean }).value;

    case 'NullLiteral':
      return null;

    case 'ArrayLiteral':
      return (expr as { type: 'ArrayLiteral'; elements: CoreExpression[] }).elements.map(
        expressionToValue
      );

    case 'ObjectLiteral': {
      const obj: Record<string, unknown> = {};
      const objExpr = expr as {
        type: 'ObjectLiteral';
        properties: Array<{
          key: { type: string; name?: string; value?: string };
          value: CoreExpression;
        }>;
      };
      for (const prop of objExpr.properties) {
        const key = prop.key.type === 'Identifier' ? prop.key.name || '' : prop.key.value || '';
        obj[key] = expressionToValue(prop.value);
      }
      return obj;
    }

    case 'Vec3Literal': {
      const v3 = expr as {
        type: 'Vec3Literal';
        x: CoreExpression;
        y: CoreExpression;
        z: CoreExpression;
      };
      return [expressionToValue(v3[0]), expressionToValue(v3[1]), expressionToValue(v3[2])];
    }

    case 'ColorLiteral':
      return (expr as { value: string }).value;

    case 'Identifier':
      return (expr as { type: 'Identifier'; name: string }).name;

    default:
      return null;
  }
}

// =============================================================================
// PROGRAM → INTERNAL AST CONVERSION
// =============================================================================

/**
 * Convert @holoscript/core Program AST to internal AST format
 */
export function programToInternalAST(program: CoreProgram): HoloScriptAST {
  const ast: HoloScriptAST = {};

  for (const node of program.body) {
    if (node.type === 'WorldDeclaration') {
      const world = node as CoreWorldDeclaration;
      ast.composition = {
        name: world.name,
        nodes: [],
        meta: {},
        settings: extractWorldSettings(world.properties),
      };

      for (const child of world.children) {
        if (child.type === 'OrbDeclaration') {
          ast.composition.nodes.push(orbToASTNode(child as CoreOrbDeclaration));
        }
      }
    }
  }

  return ast;
}

/**
 * Extract world settings from OrbProperty array
 */
export function extractWorldSettings(properties: CoreOrbProperty[]): Record<string, unknown> {
  const settings: Record<string, unknown> = {};

  for (const prop of properties) {
    const value = expressionToValue(prop.value);

    switch (prop.name) {
      case 'light':
      case 'ambient':
        settings.ambient_light = { color: '#404040', intensity: 0.5 };
        break;
      case 'background':
        settings.skybox = value;
        break;
      case 'gravity':
        settings.physics = { enabled: true, gravity: value };
        break;
      default:
        settings[prop.name] = value;
    }
  }

  return settings;
}

/**
 * Convert OrbDeclaration to internal AST node
 */
export function orbToASTNode(orb: CoreOrbDeclaration): HoloScriptASTNode {
  const properties: Record<string, unknown> = {};
  let nodeType = 'object';

  for (const prop of orb.properties) {
    const value = expressionToValue(prop.value);

    switch (prop.name) {
      case 'geometry':
        properties.mesh = value;
        if (value === 'light' || value === 'spotlight' || value === 'pointlight') {
          nodeType = 'light';
        }
        break;
      case 'position':
        properties.position = value;
        break;
      case 'rotation':
        properties.rotation = value;
        break;
      case 'scale':
        properties.scale = typeof value === 'number' ? [value, value, value] : value;
        break;
      case 'color':
        properties.color = value;
        break;
      case 'traits':
        properties.traits = value;
        break;
      default:
        properties[prop.name] = value;
    }
  }

  const children: HoloScriptASTNode[] = [];
  if (orb.children) {
    for (const child of orb.children) {
      children.push(orbToASTNode(child));
    }
  }

  if (properties.mesh === 'camera' || orb.name.toLowerCase().includes('camera')) {
    nodeType = 'camera';
  } else if (properties.mesh === 'audio' || orb.name.toLowerCase().includes('audio')) {
    nodeType = 'audio';
  } else if (children.length > 0) {
    nodeType = 'spatial_group';
  }

  return { type: nodeType, name: orb.name, properties, children };
}

// =============================================================================
// SIMPLIFIED PARSER (Fallback for legacy .holo format)
// =============================================================================

interface ParsedBlock {
  type: string;
  name: string;
  content: string;
  children: ParsedBlock[];
}

/**
 * Simplified parser for legacy .holo format.
 * Used when @holoscript/core parser is not available or doesn't recognize the format.
 */
export function parseHoloScriptSimplified(source: string): HoloScriptAST {
  const ast: HoloScriptAST = {};

  // Remove comments
  const cleanSource = source.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  // Find composition block
  const compositionMatch = cleanSource.match(/composition\s+"([^"]+)"\s*\{/);
  if (!compositionMatch) {
    return ast;
  }

  const compositionName = compositionMatch[1];
  ast.composition = {
    name: compositionName,
    nodes: [],
  };

  const blocks = extractBlocks(cleanSource);

  for (const block of blocks) {
    if (block.type === 'meta') {
      ast.composition.meta = parseProperties(block.content);
    } else if (block.type === 'settings') {
      ast.composition.settings = parseProperties(block.content);
    } else if (block.type === 'assets') {
      ast.composition.assets = parseAssetBlock(block.content);
    } else if (block.type === 'logic') {
      ast.composition.logic = parseLogicBlock(block.content);
    } else if (
      block.type === 'spatial_group' ||
      block.type === 'object' ||
      HOLO_NODE_TYPES.has(block.type)
    ) {
      ast.composition.nodes.push(parseNodeBlock(block));
    }
  }

  return ast;
}

/** Known HoloScript node type keywords */
const HOLO_NODE_TYPES = new Set([
  'empty',
  'object',
  'light',
  'camera',
  'audio',
  'trigger',
  'spawn_point',
  'spatial_group',
  'prefab',
  'entity',
  'npc',
]);

/**
 * Extract top-level blocks from source
 */
function extractBlocks(source: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let currentBlock: ParsedBlock | null = null;
  let startIndex = 0;

  // Skip the composition block header
  const compositionStart = source.indexOf('{');
  if (compositionStart === -1) return blocks;

  let i = compositionStart + 1;
  let depth = 0;

  while (i < source.length) {
    const char = source[i];

    if (char === '{') {
      if (depth === 0) {
        const beforeBrace = source.slice(startIndex, i).trim();
        const typeMatch = beforeBrace.match(/(\w+)\s*(?:"([^"]+)")?\s*$/);
        if (typeMatch) {
          currentBlock = {
            type: typeMatch[1],
            name: typeMatch[2] || '',
            content: '',
            children: [],
          };
        }
      }
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && currentBlock) {
        currentBlock.content = source.slice(startIndex, i);
        blocks.push(currentBlock);
        currentBlock = null;
        startIndex = i + 1;
      }
    }

    if (depth === 0 && !currentBlock) {
      startIndex = i;
    }

    i++;
  }

  return blocks;
}

// =============================================================================
// VALUE PARSING UTILITIES
// =============================================================================

/**
 * Parse properties from a block content string
 */
export function parseProperties(content: string): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    const valueStr = trimmed.slice(colonIndex + 1).trim();
    props[key] = parseValue(valueStr);
  }

  return props;
}

/**
 * Parse a value string into the appropriate JavaScript type
 */
export function parseValue(valueStr: string): unknown {
  const clean = valueStr.replace(/,\s*$/, '').trim();

  if (clean === 'true') return true;
  if (clean === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(clean)) return parseFloat(clean);

  if (clean.startsWith('[') && clean.endsWith(']')) {
    const inner = clean.slice(1, -1);
    return inner.split(',').map((v) => parseValue(v.trim()));
  }

  if (
    (clean.startsWith('"') && clean.endsWith('"')) ||
    (clean.startsWith("'") && clean.endsWith("'"))
  ) {
    return clean.slice(1, -1);
  }

  return clean;
}

/**
 * Parse assets block (simplified)
 */
function parseAssetBlock(
  _content: string
): Array<{ type: string; name: string; properties: Record<string, unknown> }> {
  return [];
}

/**
 * Parse logic block
 */
function parseLogicBlock(content: string): HoloScriptASTLogic[] {
  const logic: HoloScriptASTLogic[] = [];
  const eventRegex = /(\w+)\s*\{([^}]*)\}/g;
  let match;

  while ((match = eventRegex.exec(content)) !== null) {
    logic.push({
      event: match[1],
      actions: match[2]
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l),
    });
  }

  return logic;
}

/**
 * Parse a node block (object, spatial_group, etc.)
 */
function parseNodeBlock(block: ParsedBlock): HoloScriptASTNode {
  const properties = parseProperties(block.content);
  return {
    type: block.type,
    name: block.name,
    properties,
    children: [],
  };
}

// =============================================================================
// FORMAT/ESCAPE UTILITIES
// =============================================================================

/**
 * Escape a string for .holo format output
 */
export function escapeHoloString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Format a JavaScript value as a .holo value literal
 */
export function formatHoloValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return `"${escapeHoloString(value)}"`;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return `[${value.map(formatHoloValue).join(', ')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([k, v]) => `${k}: ${formatHoloValue(v)}`)
      .join(', ');
    return `{ ${entries} }`;
  }
  return String(value);
}
