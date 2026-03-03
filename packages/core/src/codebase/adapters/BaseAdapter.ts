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
 * Extract a doc comment preceding a node.
 * Handles JSDoc (/** ... * /), Python docstrings, Rust /// comments, Go // comments.
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
          return expr.text.replace(/^['"`]{1,3}|['"`]{1,3}$/g, '').trim();
        }
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
  } = {},
): ExternalSymbolDefinition {
  const loc = node.endPosition.row - node.startPosition.row + 1;
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
    loc,
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
  language: SupportedLanguage,
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
