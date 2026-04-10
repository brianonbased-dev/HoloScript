/**
 * HoloScript Language Server Protocol (LSP) Implementation
 *
 * Provides IDE features:
 * - Autocompletion
 * - Hover information
 * - Diagnostics (errors/warnings)
 * - Go to definition
 * - Find references
 */

import {
  HoloScriptCodeParser,
  HoloCompositionParser, // Added
  HoloScriptTypeChecker,
  VR_TRAITS,
  type ASTNode,
  type TypeInfo,
  type TypeDiagnostic,
} from '@holoscript/core';

import {
  CompletionItem,
  CompletionItemKind,
  Diagnostic,
  DiagnosticSeverity,
  Position,
  Hover,
  Location,
  Range,
  TextEdit,
  WorkspaceEdit,
  CodeAction,
  CodeActionKind,
} from 'vscode-languageserver/node';

// Dynamic Trait Completions
const TRAIT_COMPLETIONS: CompletionItem[] = VR_TRAITS.map((trait) => ({
  label: `@${trait}`,
  kind: CompletionItemKind.Keyword,
  detail: `Apply ${trait} trait`,
  insertText: `@${trait}(${'${1}'})`,
}));

// HoloScript keywords and snippets
const KEYWORDS: CompletionItem[] = [
  ...TRAIT_COMPLETIONS,
  {
    label: 'generate',
    kind: CompletionItemKind.Keyword,
    detail: 'AI Generation Directive',
    insertText: '@generate(prompt: "${1:prompt}")',
  },
  {
    label: 'orb',
    kind: CompletionItemKind.Keyword,
    detail: 'Create a spatial orb',
    insertText: 'orb ${1:name} {\n\t$0\n}',
  },
  {
    label: 'function',
    kind: CompletionItemKind.Keyword,
    detail: 'Define a function',
    insertText: 'function ${1:name}(${2:params}) {\n\t$0\n}',
  },
  {
    label: 'connect',
    kind: CompletionItemKind.Keyword,
    detail: 'Connect two orbs',
    insertText: 'connect ${1:from} to ${2:to} as "${3:type}"',
  },
  {
    label: 'gate',
    kind: CompletionItemKind.Keyword,
    detail: 'Conditional gate',
    insertText: 'gate ${1:name} {\n\tcondition: ${2:condition}\n\tonTrue: ${3:handler}\n}',
  },
  {
    label: 'stream',
    kind: CompletionItemKind.Keyword,
    detail: 'Data stream',
    insertText: 'stream ${1:name} {\n\tsource: ${2:source}\n\tthrough: [$0]\n}',
  },
  {
    label: 'const',
    kind: CompletionItemKind.Keyword,
    detail: 'Constant declaration',
    insertText: 'const ${1:name} = ${0}',
  },
  {
    label: 'let',
    kind: CompletionItemKind.Keyword,
    detail: 'Variable declaration',
    insertText: 'let ${1:name} = ${0}',
  },
  {
    label: 'for',
    kind: CompletionItemKind.Keyword,
    detail: 'For loop',
    insertText: 'for (${1:i} = 0; ${1:i} < ${2:count}; ${1:i}++) {\n\t$0\n}',
  },
  {
    label: 'while',
    kind: CompletionItemKind.Keyword,
    detail: 'While loop',
    insertText: 'while (${1:condition}) {\n\t$0\n}',
  },
  {
    label: 'forEach',
    kind: CompletionItemKind.Keyword,
    detail: 'ForEach loop',
    insertText: 'forEach ${1:item} in ${2:collection} {\n\t$0\n}',
  },
  {
    label: 'import',
    kind: CompletionItemKind.Keyword,
    detail: 'Import module',
    insertText: 'import { ${1:name} } from "${2:module}"',
  },
  {
    label: 'export',
    kind: CompletionItemKind.Keyword,
    detail: 'Export declaration',
    insertText: 'export ${0}',
  },
  {
    label: 'return',
    kind: CompletionItemKind.Keyword,
    detail: 'Return statement',
    insertText: 'return ${0}',
  },
  {
    label: 'if',
    kind: CompletionItemKind.Keyword,
    detail: 'Conditional',
    insertText: 'if (${1:condition}) {\n\t$0\n}',
  },
];

const BUILTIN_FUNCTIONS: CompletionItem[] = [
  {
    label: 'show',
    kind: CompletionItemKind.Function,
    detail: 'Show an orb',
    documentation: 'Make an orb visible',
  },
  {
    label: 'hide',
    kind: CompletionItemKind.Function,
    detail: 'Hide an orb',
    documentation: 'Make an orb invisible',
  },
  {
    label: 'pulse',
    kind: CompletionItemKind.Function,
    detail: 'Pulse animation',
    documentation: 'Apply pulse animation to orb',
  },
  {
    label: 'animate',
    kind: CompletionItemKind.Function,
    detail: 'Animate property',
    documentation: 'Animate an orb property',
  },
  {
    label: 'spawn',
    kind: CompletionItemKind.Function,
    detail: 'Spawn object',
    documentation: 'Spawn a new object at position',
  },
  {
    label: 'move',
    kind: CompletionItemKind.Function,
    detail: 'Move object',
    documentation: 'Move object to new position',
  },
  {
    label: 'add',
    kind: CompletionItemKind.Function,
    detail: 'Add numbers',
    documentation: 'Add two numbers',
  },
  {
    label: 'subtract',
    kind: CompletionItemKind.Function,
    detail: 'Subtract numbers',
    documentation: 'Subtract two numbers',
  },
  {
    label: 'multiply',
    kind: CompletionItemKind.Function,
    detail: 'Multiply numbers',
    documentation: 'Multiply two numbers',
  },
  {
    label: 'divide',
    kind: CompletionItemKind.Function,
    detail: 'Divide numbers',
    documentation: 'Divide two numbers',
  },
  {
    label: 'concat',
    kind: CompletionItemKind.Function,
    detail: 'Concatenate strings',
    documentation: 'Join strings together',
  },
  {
    label: 'length',
    kind: CompletionItemKind.Function,
    detail: 'Get length',
    documentation: 'Get length of string or array',
  },
  {
    label: 'push',
    kind: CompletionItemKind.Function,
    detail: 'Push to array',
    documentation: 'Add item to array',
  },
  {
    label: 'pop',
    kind: CompletionItemKind.Function,
    detail: 'Pop from array',
    documentation: 'Remove last item from array',
  },
  {
    label: 'log',
    kind: CompletionItemKind.Function,
    detail: 'Log message',
    documentation: 'Log a message to console',
  },
  {
    label: 'print',
    kind: CompletionItemKind.Function,
    detail: 'Print message',
    documentation: 'Print a message',
  },
];

const ORB_PROPERTIES: CompletionItem[] = [
  {
    label: 'color',
    kind: CompletionItemKind.Property,
    detail: 'Orb color',
    insertText: 'color: "${1:#00ffff}"',
  },
  {
    label: 'glow',
    kind: CompletionItemKind.Property,
    detail: 'Glow effect',
    insertText: 'glow: ${1:true}',
  },
  {
    label: 'position',
    kind: CompletionItemKind.Property,
    detail: 'Position',
    insertText: 'position: { x: ${1:0}, y: ${2:0}, z: ${3:0} }',
  },
  { label: 'size', kind: CompletionItemKind.Property, detail: 'Size', insertText: 'size: ${1:1}' },
  {
    label: 'interactive',
    kind: CompletionItemKind.Property,
    detail: 'Interactive',
    insertText: 'interactive: ${1:true}',
  },
  {
    label: 'onClick',
    kind: CompletionItemKind.Property,
    detail: 'Click handler',
    insertText: 'onClick: ${1:handler}',
  },
  {
    label: 'onGaze',
    kind: CompletionItemKind.Property,
    detail: 'Gaze handler',
    insertText: 'onGaze: ${1:handler}',
  },
];

/**
 * HoloScript Language Server
 */
export class HoloScriptLanguageServer {
  private parser: HoloScriptCodeParser;
  private holoParser: HoloCompositionParser; // Added
  private typeChecker: HoloScriptTypeChecker;
  private documentCache: Map<string, { content: string; ast: any; version: number }> = new Map();

  constructor() {
    this.parser = new HoloScriptCodeParser();
    this.holoParser = new HoloCompositionParser(); // Added
    this.typeChecker = new HoloScriptTypeChecker();
  }

  /**
   * Update document content
   */
  updateDocument(uri: string, content: string, version: number): void {
    const isHolo = uri.endsWith('.holo');
    const parseResult = isHolo ? this.holoParser.parse(content) : this.parser.parse(content);

    this.documentCache.set(uri, {
      content,
      ast: parseResult.ast,
      version,
    });
  }

  /**
   * Get diagnostics for a document
   */
  getDiagnostics(uri: string): Diagnostic[] {
    const doc = this.documentCache.get(uri);
    if (!doc) return [];

    const isHolo = uri.endsWith('.holo');
    const diagnostics: Diagnostic[] = [];

    if (isHolo) {
      const parseResult = this.holoParser.parse(doc.content);

      for (const error of parseResult.errors) {
        const errLine = error.loc?.line ?? 0;
        const errCol = error.loc?.column ?? 0;
        diagnostics.push({
          range: {
            start: { line: errLine, character: errCol },
            end: { line: errLine, character: errCol + 1 },
          },
          severity: DiagnosticSeverity.Error,
          code: 'parse-error',
          source: 'holoscript',
          message: error.message,
        });
      }

      const customDiagnostics = this.runCustomValidations(
        doc.content,
        parseResult.ast as unknown as ASTNode[]
      );
      diagnostics.push(...customDiagnostics);

      return diagnostics;
    }

    const parseResult = this.parser.parse(doc.content);

    for (const error of parseResult.errors) {
      diagnostics.push({
        range: {
          start: { line: error.line, character: error.column },
          end: { line: error.line, character: error.column + 1 },
        },
        severity: DiagnosticSeverity.Error,
        code: 'parse-error',
        source: 'holoscript',
        message: error.message,
      });
    }

    // Type errors (only for .hsplus files as .holo logic is declarative)
    this.typeChecker.reset();
    const typeResult = this.typeChecker.check(parseResult.ast);
    for (const diagnostic of typeResult.diagnostics) {
      diagnostics.push(this.convertTypeDiagnostic(diagnostic));
    }

    // Custom VR Pattern Validations (P2 Pattern)
    const customDiagnostics = this.runCustomValidations(doc.content, parseResult.ast);
    diagnostics.push(...customDiagnostics);

    return diagnostics;
  }

  private runCustomValidations(content: string, ast: any): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const lines = content.split('\n');

    // 1. Common Typos & "Did you mean"
    const typos: Record<string, string> = {
      sper: 'sphere',
      box: 'cube',
      'rotate.y': 'rotation.y',
      'rotate.x': 'rotation.x',
      'rotate.z': 'rotation.z',
    };

    lines.forEach((line, i) => {
      for (const [typo, fix] of Object.entries(typos)) {
        if (line.includes(typo)) {
          const char = line.indexOf(typo);
          diagnostics.push({
            range: {
              start: { line: i, character: char },
              end: { line: i, character: char + typo.length },
            },
            severity: DiagnosticSeverity.Warning,
            message: `Common typo detected: Did you mean '${fix}'?`,
            source: 'holoscript-vr-audit',
          });
        }
      }
    });

    // 2. Missing Trait Validations
    // Check if on_grab is used but @grabbable trait is missing
    const findNodes = (nodes: any[]): any[] => {
      const results: any[] = [];
      for (const node of nodes) {
        results.push(node);
        if (node.children) results.push(...findNodes(node.children));
      }
      return results;
    };

    const allNodes = Array.isArray(ast) ? findNodes(ast) : [ast];
    for (const node of allNodes) {
      if (node.directives) {
        const hasGrabHook = node.directives.some((d: any) => d.hook === 'on_grab');
        const hasGrabbableTrait = node.directives.some(
          (d: any) => d.type === 'trait' && d.name === 'grabbable'
        );

        if (hasGrabHook && !hasGrabbableTrait) {
          diagnostics.push({
            range: {
              start: { line: node.line || 0, character: node.column || 0 },
              end: { line: node.line || 0, character: (node.column || 0) + 10 },
            },
            severity: DiagnosticSeverity.Warning,
            message: `Node has 'on_grab' hook but is missing '@grabbable' trait. Interaction will not work.`,
            source: 'holoscript-vr-audit',
          });
        }
      }
    }

    return diagnostics;
  }

  /**
   * Get completions at position
   */
  getCompletions(uri: string, position: Position): CompletionItem[] {
    const doc = this.documentCache.get(uri);
    if (!doc) return [...KEYWORDS, ...BUILTIN_FUNCTIONS];

    const line = doc.content.split('\n')[position.line] || '';
    const beforeCursor = line.substring(0, position.character);

    // Inside orb block - suggest properties
    if (this.isInsideOrbBlock(doc.content, position)) {
      return [...ORB_PROPERTIES, ...BUILTIN_FUNCTIONS];
    }

    // After dot - suggest member properties
    if (beforeCursor.endsWith('.')) {
      const varName = this.getVariableBeforeDot(beforeCursor);
      const typeInfo = this.typeChecker.getType(varName);
      if (typeInfo?.properties) {
        return Array.from(typeInfo.properties.keys()).map((prop) => ({
          label: prop,
          kind: CompletionItemKind.Property,
        }));
      }
      return ORB_PROPERTIES;
    }

    // Get declared variables
    const variables = this.getDeclaredVariables(doc.ast);

    return [...KEYWORDS, ...BUILTIN_FUNCTIONS, ...variables];
  }

  /**
   * Get hover information
   */
  getHover(uri: string, position: Position): Hover | null {
    const doc = this.documentCache.get(uri);
    if (!doc) return null;

    const word = this.getWordAtPosition(doc.content, position);
    if (!word) return null;

    // Check built-in functions
    const builtinFunc = BUILTIN_FUNCTIONS.find((f) => f.label === word);
    if (builtinFunc) {
      return {
        contents: `**${builtinFunc.label}**\n\n${builtinFunc.documentation || builtinFunc.detail || ''}`,
      };
    }

    // Check keywords
    const keyword = KEYWORDS.find((k) => k.label === word);
    if (keyword) {
      return {
        contents: `**${keyword.label}** (keyword)\n\n${keyword.detail || ''}`,
      };
    }

    // Check declared types
    const typeInfo = this.typeChecker.getType(word);
    if (typeInfo) {
      return {
        contents: this.formatTypeInfo(word, typeInfo),
      };
    }

    return null;
  }

  /**
   * Go to definition
   */
  getDefinition(uri: string, position: Position): Location | null {
    const doc = this.documentCache.get(uri);
    if (!doc) return null;

    const word = this.getWordAtPosition(doc.content, position);
    if (!word) return null;

    // Search AST for definition
    for (let i = 0; i < doc.ast.length; i++) {
      const node = doc.ast[i];
      const name = this.getNodeName(node);
      if (name === word) {
        // Calculate approximate position
        const lines = doc.content.split('\n');
        for (let line = 0; line < lines.length; line++) {
          const idx = lines[line].indexOf(word);
          if (idx !== -1 && this.isDefinitionLine(lines[line], word)) {
            return {
              uri,
              range: {
                start: { line, character: idx },
                end: { line, character: idx + word.length },
              },
            };
          }
        }
      }
    }

    return null;
  }

  /**
   * Find all references
   */
  findReferences(uri: string, position: Position): Location[] {
    const doc = this.documentCache.get(uri);
    if (!doc) return [];

    const word = this.getWordAtPosition(doc.content, position);
    if (!word) return [];

    const locations: Location[] = [];
    const lines = doc.content.split('\n');

    for (let line = 0; line < lines.length; line++) {
      const lineContent = lines[line];
      let startIndex = 0;

      while (true) {
        const idx = lineContent.indexOf(word, startIndex);
        if (idx === -1) break;

        // Check word boundaries
        const before = idx > 0 ? lineContent[idx - 1] : ' ';
        const after = idx + word.length < lineContent.length ? lineContent[idx + word.length] : ' ';

        if (!/\w/.test(before) && !/\w/.test(after)) {
          locations.push({
            uri,
            range: {
              start: { line, character: idx },
              end: { line, character: idx + word.length },
            },
          });
        }

        startIndex = idx + 1;
      }
    }

    return locations;
  }

  /**
   * Prepare rename - check if symbol at position can be renamed
   */
  prepareRename(uri: string, position: Position): { range: Range; placeholder: string } | null {
    const doc = this.documentCache.get(uri);
    if (!doc) return null;

    const word = this.getWordAtPosition(doc.content, position);
    if (!word) return null;

    // Don't allow renaming keywords or built-ins
    if (KEYWORDS.some((k) => k.label === word)) return null;
    if (BUILTIN_FUNCTIONS.some((f) => f.label === word)) return null;

    // Find the range of the word at cursor
    const lines = doc.content.split('\n');
    const line = lines[position.line];
    if (!line) return null;

    let start = position.character;
    let end = position.character;
    while (start > 0 && /\w/.test(line[start - 1])) start--;
    while (end < line.length && /\w/.test(line[end])) end++;

    return {
      range: {
        start: { line: position.line, character: start },
        end: { line: position.line, character: end },
      },
      placeholder: word,
    };
  }

  /**
   * Rename symbol - return workspace edit with all occurrences
   */
  rename(uri: string, position: Position, newName: string): WorkspaceEdit | null {
    const doc = this.documentCache.get(uri);
    if (!doc) return null;

    const word = this.getWordAtPosition(doc.content, position);
    if (!word) return null;

    // Find all references
    const locations = this.findReferences(uri, position);
    if (locations.length === 0) return null;

    // Create text edits for each location
    const edits: TextEdit[] = locations.map((loc) => ({
      range: loc.range,
      newText: newName,
    }));

    return {
      changes: {
        [uri]: edits,
      },
    };
  }

  /**
   * Get code actions for diagnostics at range
   */
  getCodeActions(uri: string, range: Range, diagnostics: Diagnostic[]): CodeAction[] {
    const doc = this.documentCache.get(uri);
    if (!doc) return [];

    const actions: CodeAction[] = [];

    for (const diagnostic of diagnostics) {
      // Quick fix for 'var' -> 'let'
      if (diagnostic.message.includes('Use "let" or "const" instead of "var"')) {
        actions.push({
          title: 'Replace var with let',
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [uri]: [
                {
                  range: diagnostic.range,
                  newText: 'let',
                },
              ],
            },
          },
          isPreferred: true,
        });
        actions.push({
          title: 'Replace var with const',
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [uri]: [
                {
                  range: diagnostic.range,
                  newText: 'const',
                },
              ],
            },
          },
        });
      }

      // Quick fix for empty blocks
      if (diagnostic.message.includes('Empty block')) {
        actions.push({
          title: 'Add TODO comment',
          kind: CodeActionKind.QuickFix,
          diagnostics: [diagnostic],
          edit: {
            changes: {
              [uri]: [
                {
                  range: diagnostic.range,
                  newText: '{ /* TODO */ }',
                },
              ],
            },
          },
          isPreferred: true,
        });
      }

      // Quick fix for prefer-const
      if (diagnostic.message.includes('Use const instead of let')) {
        const line = doc.content.split('\n')[diagnostic.range.start.line];
        const match = line?.match(/\blet\b/);
        if (match) {
          const letStart = line.indexOf('let');
          actions.push({
            title: 'Change let to const',
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            edit: {
              changes: {
                [uri]: [
                  {
                    range: {
                      start: { line: diagnostic.range.start.line, character: letStart },
                      end: { line: diagnostic.range.start.line, character: letStart + 3 },
                    },
                    newText: 'const',
                  },
                ],
              },
            },
            isPreferred: true,
          });
        }
      }

      // Quick fix for naming conventions
      if (diagnostic.message.includes('should use camelCase')) {
        const word = this.getWordFromMessage(diagnostic.message);
        if (word) {
          const camelCase = this.toCamelCase(word);
          actions.push({
            title: `Rename to "${camelCase}"`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            edit: {
              changes: {
                [uri]: [
                  {
                    range: diagnostic.range,
                    newText: camelCase,
                  },
                ],
              },
            },
          });
        }
      }

      // Quick fix for missing type annotation
      if (diagnostic.message.includes('has no type annotation')) {
        const paramName = this.getWordFromMessage(diagnostic.message);
        if (paramName) {
          actions.push({
            title: `Add type annotation: ${paramName}: any`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            edit: {
              changes: {
                [uri]: [
                  {
                    range: diagnostic.range,
                    newText: `${paramName}: any`,
                  },
                ],
              },
            },
          });
        }
      }

      // Quick fix for "Did you mean" suggestions
      if (diagnostic.message.includes('Did you mean')) {
        const match = diagnostic.message.match(/Did you mean '(\w+)'/);
        if (match) {
          const suggestion = match[1];
          actions.push({
            title: `Change to "${suggestion}"`,
            kind: CodeActionKind.QuickFix,
            diagnostics: [diagnostic],
            edit: {
              changes: {
                [uri]: [
                  {
                    range: diagnostic.range,
                    newText: suggestion,
                  },
                ],
              },
            },
            isPreferred: true,
          });
        }
      }
    }

    // Add extract function refactoring
    if (this.hasSelectedCode(doc.content, range)) {
      actions.push({
        title: 'Extract to function',
        kind: CodeActionKind.RefactorExtract,
      });
    }

    return actions;
  }

  // Helper methods

  private convertTypeDiagnostic(diagnostic: TypeDiagnostic): Diagnostic {
    return {
      range: {
        start: { line: diagnostic.line, character: diagnostic.column },
        end: { line: diagnostic.line, character: diagnostic.column + 1 },
      },
      severity:
        diagnostic.severity === 'error'
          ? DiagnosticSeverity.Error
          : diagnostic.severity === 'warning'
            ? DiagnosticSeverity.Warning
            : DiagnosticSeverity.Information,
      code: diagnostic.code,
      source: 'holoscript-types',
      message: diagnostic.message,
    };
  }

  private isInsideOrbBlock(content: string, position: Position): boolean {
    const lines = content.split('\n');
    const upToCursor = lines.slice(0, position.line + 1).join('\n');

    // Count orb { and } to determine if inside
    const orbMatches = upToCursor.match(/\borb\s+\w+\s*\{/g) || [];
    const closeMatches = upToCursor.match(/\}/g) || [];

    return orbMatches.length > closeMatches.length;
  }

  private getVariableBeforeDot(line: string): string {
    const match = line.match(/(\w+)\.\s*$/);
    return match ? match[1] : '';
  }

  private getDeclaredVariables(ast: ASTNode[]): CompletionItem[] {
    const items: CompletionItem[] = [];

    for (const node of ast) {
      const name = this.getNodeName(node);
      if (name) {
        items.push({
          label: name,
          kind: this.getCompletionKind(node.type),
          detail: node.type,
        });
      }
    }

    return items;
  }

  private getNodeName(node: ASTNode): string | undefined {
    const n = node as ASTNode & { name?: string };
    return n.name;
  }

  private getCompletionKind(nodeType: string): CompletionItemKind {
    switch (nodeType) {
      case 'orb':
        return CompletionItemKind.Class;
      case 'method':
        return CompletionItemKind.Function;
      case 'variable-declaration':
        return CompletionItemKind.Variable;
      case 'stream':
        return CompletionItemKind.Module;
      default:
        return CompletionItemKind.Value;
    }
  }

  private getWordAtPosition(content: string, position: Position): string | null {
    const lines = content.split('\n');
    const line = lines[position.line];
    if (!line) return null;

    // Find word boundaries
    let start = position.character;
    let end = position.character;

    while (start > 0 && /\w/.test(line[start - 1])) start--;
    while (end < line.length && /\w/.test(line[end])) end++;

    const word = line.substring(start, end);
    return word || null;
  }

  private isDefinitionLine(line: string, word: string): boolean {
    return (
      line.includes(`orb ${word}`) ||
      line.includes(`function ${word}`) ||
      line.includes(`const ${word}`) ||
      line.includes(`let ${word}`) ||
      line.includes(`stream ${word}`)
    );
  }

  private formatTypeInfo(name: string, info: TypeInfo): string {
    let result = `**${name}**: ${info.type}`;

    if (info.type === 'function' && info.parameters) {
      const params = info.parameters.map((p) => `${p.name}: ${p.type}`).join(', ');
      result = `**${name}**(${params}): ${info.returnType || 'void'}`;
    }

    if (info.properties) {
      result += '\n\nProperties:\n';
      info.properties.forEach((prop, key) => {
        result += `- ${key}: ${prop.type}\n`;
      });
    }

    return result;
  }

  private getWordFromMessage(message: string): string | null {
    // Extract word in quotes like: Variable "MyVar" should use camelCase
    const match = message.match(/"(\w+)"|'(\w+)'|Parameter "?(\w+)"?/);
    return match ? match[1] || match[2] || match[3] : null;
  }

  private toCamelCase(str: string): string {
    // Handle PascalCase -> camelCase
    if (/^[A-Z][a-z]/.test(str)) {
      return str.charAt(0).toLowerCase() + str.slice(1);
    }
    // Handle SCREAMING_SNAKE_CASE or snake_case -> camelCase
    return str.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  }

  private hasSelectedCode(content: string, range: Range): boolean {
    // Check if range spans more than one character
    if (range.start.line === range.end.line) {
      return range.end.character - range.start.character > 1;
    }
    return range.end.line > range.start.line;
  }
}

/**
 * Create a language server instance
 */
export function createLanguageServer(): HoloScriptLanguageServer {
  return new HoloScriptLanguageServer();
}
