/**
 * HoloScript LSP - Context Gatherer
 *
 * Gathers context from the document for AI completions.
 */

import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * Types of completion contexts
 */
export type CompletionContextType =
  | 'trait' // After @ symbol
  | 'property' // Inside object, adding property
  | 'event' // Event handler (on_*)
  | 'comment' // Comment that might be a code gen request
  | 'value' // After : in a property
  | 'general'; // General completion

/**
 * Completion context for AI
 */
export interface CompletionContext {
  type: CompletionContextType;

  /** Current line text before cursor */
  linePrefix: string;

  /** Current line text after cursor */
  lineSuffix: string;

  /** Full line text */
  fullLine: string;

  /** Character that triggered completion */
  triggerCharacter?: string;

  /** Object name if inside an object definition */
  objectName?: string;

  /** Object type (orb, entity, etc.) */
  objectType?: string;

  /** Existing traits on the object */
  existingTraits?: string[];

  /** Existing properties on the object */
  existingProperties?: string[];

  /** If type is 'comment', the comment text */
  comment?: string;

  /** Surrounding code for context */
  surroundingCode?: string;

  /** Surrounding lines as array */
  surroundingLines: string[];

  /** File path */
  filePath?: string;

  /** Current indentation level */
  indentLevel: number;

  /** Line number */
  line: number;

  /** Column number */
  column: number;
}

/**
 * Error context for fix suggestions
 */
export interface ErrorContext extends CompletionContext {
  errorMessage: string;
  errorLine: number;
  errorColumn: number;
}

/**
 * Gathers context from the document for AI completions
 */
export class ContextGatherer {
  /**
   * Gather context for completion
   */
  public gather(
    document: TextDocument,
    position: { line: number; character: number },
    triggerCharacter?: string
  ): CompletionContext {
    const text = document.getText();
    const lines = text.split('\n');
    const currentLine = lines[position.line] || '';

    const linePrefix = currentLine.slice(0, position.character);
    const lineSuffix = currentLine.slice(position.character);

    // Detect context type
    const type = this.detectContextType(linePrefix, triggerCharacter, lines, position.line);

    // Calculate indentation
    const indentLevel = this.getIndentLevel(currentLine);

    // Get surrounding code
    const surroundingLines = this.getSurroundingLines(lines, position.line, 10);
    const surroundingCode = surroundingLines.join('\n');

    // Build context
    const context: CompletionContext = {
      type,
      linePrefix,
      lineSuffix,
      fullLine: currentLine,
      triggerCharacter,
      indentLevel,
      line: position.line,
      column: position.character,
      surroundingCode,
      surroundingLines,
      filePath: document.uri,
    };

    // If inside an object, gather object context
    const objectContext = this.getObjectContext(lines, position.line);
    if (objectContext) {
      context.objectName = objectContext.name;
      context.objectType = objectContext.type;
      context.existingTraits = objectContext.traits;
      context.existingProperties = objectContext.properties;
    }

    // If comment context, extract comment
    if (type === 'comment') {
      context.comment = this.extractComment(linePrefix);
    }

    return context;
  }

  /**
   * Gather context for error fixing
   */
  public gatherErrorContext(
    document: TextDocument,
    error: { message: string; line: number; column: number }
  ): ErrorContext {
    const baseContext = this.gather(document, { line: error.line, character: error.column });

    return {
      ...baseContext,
      errorMessage: error.message,
      errorLine: error.line,
      errorColumn: error.column,
    };
  }

  /**
   * Detect the type of completion context
   */
  private detectContextType(
    linePrefix: string,
    triggerCharacter: string | undefined,
    lines: string[],
    currentLine: number
  ): CompletionContextType {
    const trimmed = linePrefix.trimStart();

    // After @ symbol -> trait completion
    if (triggerCharacter === '@' || trimmed.endsWith('@')) {
      return 'trait';
    }

    // After : -> value completion
    if (trimmed.endsWith(':') || triggerCharacter === ':') {
      return 'value';
    }

    // Comment that looks like a code gen request
    if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
      const comment = trimmed
        .replace(/^\/\/|^#/, '')
        .trim()
        .toLowerCase();
      if (this.isCodeGenComment(comment)) {
        return 'comment';
      }
    }

    // Event handler pattern
    if (/on_?\w*$/.test(trimmed)) {
      return 'event';
    }

    // Inside an object definition -> property completion
    if (this.isInsideObject(lines, currentLine)) {
      return 'property';
    }

    return 'general';
  }

  /**
   * Check if a comment looks like a code generation request
   */
  private isCodeGenComment(comment: string): boolean {
    const codeGenIndicators = [
      'create',
      'make',
      'add',
      'generate',
      'implement',
      'todo:',
      'TODO:',
      'FIXME:',
      'implement:',
      'add:',
      'should',
      'when',
      'needs to',
      'must',
    ];

    return codeGenIndicators.some((indicator) =>
      comment.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  /**
   * Check if cursor is inside an object definition
   */
  private isInsideObject(lines: string[], currentLine: number): boolean {
    let braceCount = 0;

    for (let i = currentLine; i >= 0; i--) {
      const line = lines[i];
      // Count braces (simplified - doesn't handle strings)
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      // If we've closed more than opened, we're not inside
      if (braceCount < 0) {
        return false;
      }

      // If we find an object definition with positive brace count
      if (braceCount > 0 && /\b(orb|entity|object|cube|sphere|plane|group)\s+\w+\s*{/.test(line)) {
        return true;
      }
    }

    return braceCount > 0;
  }

  /**
   * Get context about the current object
   */
  private getObjectContext(
    lines: string[],
    currentLine: number
  ): {
    name: string;
    type: string;
    traits: string[];
    properties: string[];
  } | null {
    let braceCount = 0;
    let objectLine = -1;

    // Find the object definition line
    for (let i = currentLine; i >= 0; i--) {
      const line = lines[i];
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      const objectMatch = line.match(/\b(orb|entity|object|cube|sphere|plane|group)\s+(\w+)\s*{/);
      if (objectMatch && braceCount > 0) {
        objectLine = i;
        break;
      }
    }

    if (objectLine < 0) {
      return null;
    }

    // Parse object definition
    const objectDef = lines[objectLine];
    const match = objectDef.match(/\b(orb|entity|object|cube|sphere|plane|group)\s+(\w+)/);
    if (!match) {
      return null;
    }

    const [, type, name] = match;

    // Collect traits and properties from object body
    const traits: string[] = [];
    const properties: string[] = [];
    let depth = 0;

    for (let i = objectLine; i < lines.length && i <= currentLine; i++) {
      const line = lines[i];
      depth += (line.match(/{/g) || []).length;
      depth -= (line.match(/}/g) || []).length;

      if (depth <= 0) break;

      // Extract traits
      const traitMatches = line.matchAll(/@(\w+)/g);
      for (const tm of traitMatches) {
        traits.push(tm[1]);
      }

      // Extract properties
      const propMatch = line.match(/^\s*(\w+):/);
      if (propMatch) {
        properties.push(propMatch[1]);
      }
    }

    return { name, type, traits, properties };
  }

  /**
   * Extract comment text from line
   */
  private extractComment(linePrefix: string): string {
    const match = linePrefix.match(/(?:\/\/|#)\s*(.+)$/);
    return match ? match[1].trim() : '';
  }

  /**
   * Get surrounding lines for context
   */
  private getSurroundingLines(lines: string[], currentLine: number, range: number): string[] {
    const start = Math.max(0, currentLine - range);
    const end = Math.min(lines.length, currentLine + range);
    return lines.slice(start, end);
  }

  /**
   * Get indentation level of a line
   */
  private getIndentLevel(line: string): number {
    const match = line.match(/^(\s*)/);
    if (!match) return 0;

    const spaces = match[1];
    // Count as 2-space indentation
    return Math.floor(spaces.length / 2);
  }
}
