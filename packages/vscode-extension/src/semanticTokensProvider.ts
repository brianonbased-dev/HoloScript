/**
 * HoloScript Semantic Tokens Provider - Sprint 2 Priority 7
 *
 * Provides trait-aware semantic highlighting for:
 * - Traits (@grabbable, @physics, etc.)
 * - Keywords (composition, object, template)
 * - Properties and values
 * - State references
 * - Functions and operators
 */

import * as vscode from 'vscode';

// =============================================================================
// TOKEN TYPES AND MODIFIERS
// =============================================================================

/**
 * Semantic token types supported by HoloScript
 */
export const TOKEN_TYPES = [
  'namespace', // composition names
  'class', // object/template names
  'type', // type annotations
  'parameter', // function parameters
  'variable', // variables and state refs
  'property', // object properties
  'function', // functions
  'decorator', // traits (@grabbable)
  'keyword', // keywords
  'string', // string literals
  'number', // numeric literals
  'operator', // operators
  'comment', // comments
  'enumMember', // enum values, constants
] as const;

/**
 * Semantic token modifiers
 */
export const TOKEN_MODIFIERS = [
  'declaration', // definition site
  'definition', // same as declaration
  'readonly', // const values
  'static', // static trait
  'async', // async operations
  'modification', // mutation
  'documentation', // doc comments
  'defaultLibrary', // built-in traits/keywords
] as const;

/**
 * Build the semantic tokens legend for VS Code registration
 */
export const SEMANTIC_TOKENS_LEGEND = new vscode.SemanticTokensLegend(
  [...TOKEN_TYPES],
  [...TOKEN_MODIFIERS]
);

// =============================================================================
// TOKEN MAPPINGS
// =============================================================================

/** HoloScript keywords */
const KEYWORDS = new Set([
  'composition',
  'object',
  'template',
  'spatial_group',
  'environment',
  'state',
  'logic',
  'using',
  'import',
  'from',
  'if',
  'else',
  'for',
  'while',
  'return',
  'spawn',
  'emit',
  'true',
  'false',
  'null',
  'let',
  'const',
  'function',
]);

/** Built-in traits - all 56 registered runtime traits */
const BUILTIN_TRAITS = new Set([
  // Interaction (11)
  'grabbable',
  'throwable',
  'collidable',
  'physics',
  'gravity',
  'trigger',
  'pointable',
  'hoverable',
  'clickable',
  'draggable',
  'scalable',
  // Visual (10)
  'glowing',
  'transparent',
  'spinning',
  'floating',
  'billboard',
  'pulse',
  'animated',
  'look_at',
  'outline',
  'proximity',
  // AI/Behavior (5)
  'behavior_tree',
  'emotion',
  'goal_oriented',
  'perception',
  'memory',
  // Physics (9)
  'cloth',
  'soft_body',
  'fluid',
  'buoyancy',
  'rope',
  'wind',
  'joint',
  'rigidbody',
  'destruction',
  // Extended (11)
  'rotatable',
  'stackable',
  'snappable',
  'breakable',
  'character',
  'patrol',
  'networked',
  'anchor',
  'spatial_audio',
  'reverb_zone',
  'voice_proximity',
  // Advanced (10)
  'teleport',
  'ui_panel',
  'particle_system',
  'weather',
  'day_night',
  'lod',
  'hand_tracking',
  'haptic',
  'portal',
  'mirror',
]);

/** Event handlers */
const EVENT_HANDLERS = new Set([
  'on_click',
  'on_hover',
  'on_enter',
  'on_exit',
  'on_grab',
  'on_release',
  'on_collision',
  'on_trigger',
  'on_update',
]);

/** Property names (commonly used) */
const COMMON_PROPERTIES = new Set([
  'position',
  'rotation',
  'scale',
  'color',
  'opacity',
  'geometry',
  'model',
  'material',
  'texture',
  'skybox',
  'ambient_light',
  'mass',
  'velocity',
  'friction',
  'restitution',
]);

// =============================================================================
// TOKENIZER
// =============================================================================

interface TokenInfo {
  line: number;
  startChar: number;
  length: number;
  tokenType: number;
  tokenModifiers: number;
}

/**
 * Simple tokenizer for HoloScript semantic tokens
 */
function tokenize(text: string): TokenInfo[] {
  const tokens: TokenInfo[] = [];
  const lines = text.split('\n');

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    let pos = 0;

    while (pos < line.length) {
      // Skip whitespace
      const wsMatch = line.slice(pos).match(/^[ \t]+/);
      if (wsMatch) {
        pos += wsMatch[0].length;
        continue;
      }

      // Single-line comment
      if (line.slice(pos).startsWith('//')) {
        tokens.push({
          line: lineIndex,
          startChar: pos,
          length: line.length - pos,
          tokenType: TOKEN_TYPES.indexOf('comment'),
          tokenModifiers: 0,
        });
        break;
      }

      // Multi-line comment start (simplified - doesn't track across lines)
      if (line.slice(pos).startsWith('/*')) {
        const endPos = line.indexOf('*/', pos + 2);
        const len = endPos >= 0 ? endPos + 2 - pos : line.length - pos;
        tokens.push({
          line: lineIndex,
          startChar: pos,
          length: len,
          tokenType: TOKEN_TYPES.indexOf('comment'),
          tokenModifiers: 0,
        });
        pos += len;
        continue;
      }

      // Trait (@identifier or @identifier(...))
      const traitMatch = line.slice(pos).match(/^@([a-zA-Z_][a-zA-Z0-9_]*)/);
      if (traitMatch) {
        const traitName = traitMatch[1];
        const isBuiltin = BUILTIN_TRAITS.has(traitName);
        tokens.push({
          line: lineIndex,
          startChar: pos,
          length: traitMatch[0].length,
          tokenType: TOKEN_TYPES.indexOf('decorator'),
          tokenModifiers: isBuiltin ? 1 << TOKEN_MODIFIERS.indexOf('defaultLibrary') : 0,
        });
        pos += traitMatch[0].length;
        continue;
      }

      // String literal
      const stringMatch = line.slice(pos).match(/^"(?:[^"\\]|\\.)*"|^'(?:[^'\\]|\\.)*'/);
      if (stringMatch) {
        tokens.push({
          line: lineIndex,
          startChar: pos,
          length: stringMatch[0].length,
          tokenType: TOKEN_TYPES.indexOf('string'),
          tokenModifiers: 0,
        });
        pos += stringMatch[0].length;
        continue;
      }

      // Number literal (including negative, decimal, hex)
      const numberMatch = line.slice(pos).match(/^-?(?:0x[0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?)/);
      if (numberMatch) {
        tokens.push({
          line: lineIndex,
          startChar: pos,
          length: numberMatch[0].length,
          tokenType: TOKEN_TYPES.indexOf('number'),
          tokenModifiers: 0,
        });
        pos += numberMatch[0].length;
        continue;
      }

      // Identifier or keyword
      const identMatch = line.slice(pos).match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
      if (identMatch) {
        const word = identMatch[0];
        let tokenType: number;
        let modifiers = 0;

        if (KEYWORDS.has(word)) {
          tokenType = TOKEN_TYPES.indexOf('keyword');
          modifiers = 1 << TOKEN_MODIFIERS.indexOf('defaultLibrary');
        } else if (word === 'composition' || word === 'namespace') {
          tokenType = TOKEN_TYPES.indexOf('namespace');
          modifiers = 1 << TOKEN_MODIFIERS.indexOf('declaration');
        } else if (word === 'object' || word === 'template') {
          tokenType = TOKEN_TYPES.indexOf('class');
          modifiers = 1 << TOKEN_MODIFIERS.indexOf('declaration');
        } else if (EVENT_HANDLERS.has(word)) {
          tokenType = TOKEN_TYPES.indexOf('function');
          modifiers = 1 << TOKEN_MODIFIERS.indexOf('defaultLibrary');
        } else if (COMMON_PROPERTIES.has(word)) {
          tokenType = TOKEN_TYPES.indexOf('property');
          modifiers = 0;
        } else {
          // Check context: is this after a colon (property value) or standalone?
          const prevChar = pos > 0 ? line[pos - 1] : '';
          const colonBefore = line.slice(0, pos).trim().endsWith(':');

          if (colonBefore) {
            tokenType = TOKEN_TYPES.indexOf('variable');
          } else {
            // Check if followed by colon (property name)
            const afterIdent = line.slice(pos + word.length).trimStart();
            if (afterIdent.startsWith(':')) {
              tokenType = TOKEN_TYPES.indexOf('property');
            } else {
              tokenType = TOKEN_TYPES.indexOf('variable');
            }
          }
        }

        tokens.push({
          line: lineIndex,
          startChar: pos,
          length: word.length,
          tokenType,
          tokenModifiers: modifiers,
        });
        pos += word.length;
        continue;
      }

      // Operators
      const opMatch = line.slice(pos).match(/^(?:=>|->|&&|\|\||[+\-*/%<>=!&|^~?:])/);
      if (opMatch) {
        tokens.push({
          line: lineIndex,
          startChar: pos,
          length: opMatch[0].length,
          tokenType: TOKEN_TYPES.indexOf('operator'),
          tokenModifiers: 0,
        });
        pos += opMatch[0].length;
        continue;
      }

      // Skip other characters (brackets, punctuation)
      pos++;
    }
  }

  return tokens;
}

// =============================================================================
// SEMANTIC TOKENS PROVIDER
// =============================================================================

/**
 * Provides semantic tokens for HoloScript files
 */
export class HoloScriptSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
  /**
   * Provide semantic tokens for the entire document
   */
  provideDocumentSemanticTokens(
    document: vscode.TextDocument,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SemanticTokens> {
    const text = document.getText();
    const tokens = tokenize(text);

    const builder = new vscode.SemanticTokensBuilder(SEMANTIC_TOKENS_LEGEND);

    for (const tok of tokens) {
      builder.push(tok.line, tok.startChar, tok.length, tok.tokenType, tok.tokenModifiers);
    }

    return builder.build();
  }
}

/**
 * Provides semantic tokens for a range (for large files)
 */
export class HoloScriptSemanticTokensRangeProvider
  implements vscode.DocumentRangeSemanticTokensProvider
{
  /**
   * Provide semantic tokens for a specific range
   */
  provideDocumentRangeSemanticTokens(
    document: vscode.TextDocument,
    range: vscode.Range,
    _token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.SemanticTokens> {
    // Get text for the range plus some context
    const startLine = Math.max(0, range.start.line - 5);
    const endLine = Math.min(document.lineCount - 1, range.end.line + 5);

    const rangeWithContext = new vscode.Range(
      new vscode.Position(startLine, 0),
      new vscode.Position(endLine, document.lineAt(endLine).text.length)
    );

    const text = document.getText(rangeWithContext);
    const tokens = tokenize(text);

    const builder = new vscode.SemanticTokensBuilder(SEMANTIC_TOKENS_LEGEND);

    // Adjust line numbers back to document coordinates
    for (const tok of tokens) {
      const docLine = tok.line + startLine;

      // Only include tokens within the requested range
      if (docLine >= range.start.line && docLine <= range.end.line) {
        builder.push(docLine, tok.startChar, tok.length, tok.tokenType, tok.tokenModifiers);
      }
    }

    return builder.build();
  }
}
