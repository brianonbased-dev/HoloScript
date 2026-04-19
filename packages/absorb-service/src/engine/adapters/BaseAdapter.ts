/**
 * Base Language Adapter
 *
 * Shared tree-sitter traversal utilities used by all language adapters.
 * Handles AST walking, doc comment extraction, and position mapping.
 */

import type {
  SyntaxNode,
  ExternalSymbolDefinition,
  ExtendedSymbolType,
  SupportedLanguage,
} from '../types';

/**
 * Depth-first visitor callback.
 * Return `false` to skip visiting children of this node.
 */
export type NodeVisitor = (node: SyntaxNode) => boolean | void;

/**
 * Walk a tree-sitter syntax tree depth-first, calling visitor for each node.
 */
export function walkTree(root: SyntaxNode, visitor: NodeVisitor): void {
  const stack: SyntaxNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const result = visitor(node);
    if (result !== false) {
      // Push children in reverse order so leftmost is processed first
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }
}

/**
 * Extract a documentation comment preceding a syntax node.
 *
 * This function parses various comment formats used across different programming languages
 * and extracts clean documentation text without formatting artifacts.
 *
 * @param node - The syntax tree node to extract documentation for
 * @returns The cleaned documentation text, or undefined if no documentation comment is found
 *
 * @remarks
 * Supports the following comment formats:
 * - JSDoc: block comments starting with two asterisks (JavaScript/TypeScript)
 * - Python docstrings: Triple-quoted strings immediately following function/class definitions
 * - Rust doc comments: /// comments - strips triple slashes
 * - Go doc comments: // comments preceding declarations
 *
 * The function automatically detects and processes the appropriate format based on
 * the comment structure and language context.
 *
 * @example
 * For a node with preceding JSDoc comment:
 * const docText = extractDocComment(functionNode);
 * Returns: "This function does something important"
 *
 * For a node without documentation:
 * const noDoc = extractDocComment(variableNode);
 * Returns: undefined
 */
export function extractDocComment(node: SyntaxNode): string | undefined {
  const prev = getPreviousSibling(node);
  if (!prev) return undefined;

  if (prev.type === 'comment') {
    const text = prev.text.trim();
    // JSDoc-style: strip /** and */
    if (text.startsWith('/**')) {
      return text
        .replace(/^\/\*\*\s*/, '')
        .replace(/\s*\*\/$/, '')
        .replace(/^\s*\* ?/gm, '')
        .trim();
    }
    // Line comment: strip // or ///
    if (text.startsWith('//')) {
      return text.replace(/^\/\/\/?\s?/, '').trim();
    }
    // Hash comment: strip #
    if (text.startsWith('#')) {
      return text.replace(/^#\s?/, '').trim();
    }
    return text;
  }

  // Python: first child string of function/class body is a docstring
  if (node.type === 'function_definition' || node.type === 'class_definition') {
    const body = node.childForFieldName('body');
    if (body && body.childCount > 0) {
      const first = body.children[0];
      if (first.type === 'expression_statement') {
        const expr = first.children[0];
        if (expr && expr.type === 'string') {
          return expr.text.replace(/^['"]{1,3}|['"]{1,3}$/g, '').trim();
        }
      }
    }
  }

  return undefined;
}

/**
 * Extract the file-level module doc comment from a tree's root node.
 * Looks for the first comment child of the root that starts at line 0 or 1.
 * Handles JSDoc (/** ... *\/), line comments (// or ///), hash comments (#),
 * and Python module docstrings.
 *
 * @param rootNode - The root syntax node of the parsed source tree
 * @returns The extracted documentation comment text, or undefined if none found
 */
export function extractFileDocComment(rootNode: SyntaxNode): string | undefined {
  for (const child of rootNode.children) {
    // Only look at the very top of the file
    if (child.startPosition.row > 3) break;

    if (child.type === 'comment') {
      const text = child.text.trim();
      if (text.startsWith('/**')) {
        return text
          .replace(/^\/\*\*\s*/, '')
          .replace(/\s*\*\/$/, '')
          .replace(/^\s*\* ?/gm, '')
          .trim();
      }
      if (text.startsWith('//')) {
        return text.replace(/^\/\/\/?\s?/, '').trim();
      }
      if (text.startsWith('#')) {
        return text.replace(/^#\s?/, '').trim();
      }
      return text;
    }

    // Python: module docstring is the first expression_statement with a string
    if (child.type === 'expression_statement') {
      const expr = child.children[0];
      if (expr && expr.type === 'string') {
        return expr.text.replace(/^['"]{1,3}|['"]{1,3}$/g, '').trim();
      }
    }
  }
  return undefined;
}

/**
 * Get the previous named sibling of a node.
 */
function getPreviousSibling(node: SyntaxNode): SyntaxNode | null {
  if (!node.parent) return null;
  const siblings = node.parent.namedChildren;
  const idx = siblings.indexOf(node);
  return idx > 0 ? siblings[idx - 1] : null;
}

/**
 * Create a symbol definition from a tree-sitter node.
 */
export function nodeToSymbol(
  node: SyntaxNode,
  name: string,
  type: ExtendedSymbolType,
  language: SupportedLanguage,
  filePath: string,
  options: {
    visibility?: 'public' | 'private' | 'protected' | 'internal';
    signature?: string;
    owner?: string;
    isExported?: boolean;
  } = {}
): ExternalSymbolDefinition {
  const lineCount = node.endPosition.row - node.startPosition.row + 1;
  return {
    name,
    type,
    language,
    filePath,
    line: node.startPosition.row + 1, // 1-based
    column: node.startPosition.column,
    endLine: node.endPosition.row + 1,
    endColumn: node.endPosition.column,
    visibility: options.visibility ?? 'public',
    signature: options.signature,
    owner: options.owner,
    isExported: options.isExported,
    docComment: extractDocComment(node),
    lineCount,
  };
}

/**
 * Extract the text of a named field from a node, or undefined.
 */
export function getFieldText(node: SyntaxNode, fieldName: string): string | undefined {
  const child = node.childForFieldName(fieldName);
  return child?.text;
}

/**
 * Check if a node has a specific modifier/decorator.
 */
export function hasModifier(node: SyntaxNode, modifier: string): boolean {
  for (const child of node.children) {
    if (child.text === modifier) return true;
    if (child.type === 'modifiers' || child.type === 'modifier') {
      if (child.text.includes(modifier)) return true;
    }
  }
  return false;
}

/**
 * Determine visibility from modifier keywords.
 */
export function extractVisibility(
  node: SyntaxNode,
  language: SupportedLanguage
): 'public' | 'private' | 'protected' | 'internal' {
  // Go: uppercase first letter = exported
  if (language === 'go') {
    const name = getFieldText(node, 'name');
    if (name && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase()) {
      return 'public';
    }
    return 'internal';
  }

  // Python: leading underscore convention
  if (language === 'python') {
    const name = getFieldText(node, 'name');
    if (name?.startsWith('__') && !name.endsWith('__')) return 'private';
    if (name?.startsWith('_')) return 'protected';
    return 'public';
  }

  // C-family / TS / Rust: explicit modifiers
  if (hasModifier(node, 'private')) return 'private';
  if (hasModifier(node, 'protected')) return 'protected';
  if (hasModifier(node, 'internal')) return 'internal';
  if (hasModifier(node, 'pub')) return 'public';
  if (hasModifier(node, 'export')) return 'public';
  if (hasModifier(node, 'public')) return 'public';

  // Default: public for top-level, private for class members
  if (node.parent?.type?.includes('class') || node.parent?.type?.includes('impl')) {
    return language === 'typescript' || language === 'javascript' ? 'public' : 'private';
  }
  return 'public';
}
