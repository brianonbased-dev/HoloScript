/**
 * @holoscript/core Developer Experience
 *
 * REPL, better error formatting, interactive mode
 */

import * as readline from 'readline';

/** Error object with optional location and suggestion */
interface HoloScriptError {
  message: string;
  location?: { line: number; column: number };
  suggestion?: string;
  token?: string;
  errors?: HoloScriptError[];
}

/** Parser interface for REPL */
interface REPLParser {
  parse(code: string): { ast: unknown; errors?: HoloScriptError[]; warnings?: unknown[] };
}

/** Runtime interface for REPL */
interface REPLRuntime {
  execute(ast: unknown): Promise<unknown>;
}

/**
 * Enhanced error formatter
 */
export class ErrorFormatter {
  /**
   * Format error with source context and helpful visual indicators
   *
   * @param error - The error object containing message, location, and suggestion
   * @param sourceCode - Optional source code to show contextual error location
   * @returns Formatted error string with visual cues and source context
   *
   * @example
   * ```typescript
   * const formatted = ErrorFormatter.formatError({
   *   message: "Unexpected token",
   *   location: { line: 5, column: 12 },
   *   suggestion: "Try adding a semicolon"
   * }, sourceCode);
   * ```
   */
  static formatError(error: HoloScriptError, sourceCode?: string): string {
    const { message, location, suggestion, token: _token } = error;

    let formatted = `\n❌ Error: ${message}\n`;

    if (location) {
      formatted += `   at line ${location.line}, column ${location.column}\n`;

      if (sourceCode) {
        const lines = sourceCode.split('\n');
        const errorLine = lines[location.line - 1];

        if (errorLine) {
          formatted += `\n   ${location.line} | ${errorLine}\n`;
          formatted += `     | ${' '.repeat(location.column - 1)}^\n`;
        }
      }
    }

    if (suggestion) {
      formatted += `\n💡 Suggestion: ${suggestion}\n`;
    }

    return formatted;
  }

  /**
   * Format multiple errors with summary and limit display to first 5
   *
   * @param errors - Array of error objects to format
   * @returns Formatted string with error count summary and individual error details
   */
  static formatErrors(errors: HoloScriptError[]): string {
    if (errors.length === 0) return '';

    let formatted = `\n❌ Found ${errors.length} error${errors.length !== 1 ? 's' : ''}:\n`;

    for (let i = 0; i < Math.min(errors.length, 5); i++) {
      formatted += this.formatError(errors[i]);
    }

    if (errors.length > 5) {
      formatted += `\n... and ${errors.length - 5} more error${errors.length - 5 !== 1 ? 's' : ''}\n`;
    }

    return formatted;
  }

  /**
   * Format success message
   */
  static formatSuccess(message: string, details?: unknown): string {
    let formatted = `\n✅ ${message}\n`;

    if (details) {
      if (typeof details === 'object') {
        formatted += JSON.stringify(details, null, 2) + '\n';
      } else {
        formatted += `${details}\n`;
      }
    }

    return formatted;
  }

  /**
   * Format help text
   */
  static formatHelp(): string {
    return `
HoloScript+ REPL v1.0.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Commands:
  help          - Show this help message
  clear         - Clear the screen
  vars          - List all variables
  types         - List all types
  profile       - Show performance profile
  exit          - Exit REPL

Shortcuts:
  .create orb#name    - Create orb
  .position x y z     - Set position
  .property key val   - Set property

Examples:
  > orb#myOrb { position: [0, 0, 0] }
  > myOrb.position = [1, 1, 1]
  > match state { "idle" => { ... } }

For more info, visit: https://github.com/brianonbased-dev/holoscript
`.trim();
  }
}

/**
 * Interactive REPL
 */
export class HoloScriptREPL {
  private rl: readline.Interface;
  private variables: Map<string, unknown> = new Map();
  private types: Map<string, unknown> = new Map();
  private history: string[] = [];
  private parser: REPLParser;
  private runtime: REPLRuntime;

  constructor(parser: REPLParser, runtime: REPLRuntime) {
    this.parser = parser;
    this.runtime = runtime;

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      history: this.history,
      historySize: 100,
    });
  }

  /**
   * Start REPL
   */
  async start(): Promise<void> {
    console.debug('\n🥽 HoloScript+ REPL v1.0.0');
    console.debug('Type "help" for commands, "exit" to quit\n');

    await this.repl();
  }

  /**
   * Main REPL loop
   */
  private async repl(): Promise<void> {
    const prompt = () => {
      this.rl.question('> ', async (input) => {
        try {
          const trimmed = input.trim();

          if (!trimmed) {
            prompt();
            return;
          }

          // Handle commands
          if (trimmed.startsWith('.')) {
            this.handleCommand(trimmed);
            prompt();
            return;
          }

          // Handle built-in commands
          switch (trimmed.toLowerCase()) {
            case 'help':
              console.debug(ErrorFormatter.formatHelp());
              prompt();
              return;

            case 'clear':
              console.clear();
              prompt();
              return;

            case 'vars':
              this.showVariables();
              prompt();
              return;

            case 'types':
              this.showTypes();
              prompt();
              return;

            case 'profile':
              this.showProfile();
              prompt();
              return;

            case 'exit':
              this.rl.close();
              console.debug('\n👋 Goodbye!\n');
              return;
          }

          // Parse and execute
          const result = await this.evaluate(trimmed);

          if (result !== undefined && result !== null) {
            this.displayResult(result);
          }
        } catch (error: unknown) {
          console.error(ErrorFormatter.formatError(error as HoloScriptError));
        }

        prompt();
      });
    };

    prompt();
  }

  /**
   * Handle dot commands
   */
  private handleCommand(command: string): void {
    const parts = command.slice(1).split(' ');
    const cmd = parts[0];

    switch (cmd) {
      case 'create':
        console.debug(`Creating: ${parts.slice(1).join(' ')}`);
        break;

      case 'position':
        console.debug(`Position: x=${parts[1]}, y=${parts[2]}, z=${parts[3]}`);
        break;

      case 'property':
        console.debug(`Property: ${parts[1]} = ${parts[2]}`);
        break;

      default:
        console.debug(`Unknown command: .${cmd}`);
    }
  }

  /**
   * Evaluate HoloScript code
   */
  private async evaluate(code: string): Promise<unknown> {
    try {
      const parseResult = this.parser.parse(code);

      if (parseResult.errors && parseResult.errors.length > 0) {
        throw {
          message: 'Parse error',
          errors: parseResult.errors,
        };
      }

      const result = await this.runtime.execute(parseResult.ast);
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Show variables
   */
  private showVariables(): void {
    if (this.variables.size === 0) {
      console.debug('No variables defined');
      return;
    }

    console.debug('\n📦 Variables:');
    for (const [name, value] of this.variables) {
      console.debug(`  ${name}: ${this.formatValue(value)}`);
    }
    console.debug();
  }

  /**
   * Show types
   */
  private showTypes(): void {
    if (this.types.size === 0) {
      console.debug('No custom types defined');
      return;
    }

    console.debug('\n🏷️  Types:');
    for (const [name, type] of this.types) {
      console.debug(`  ${name}: ${JSON.stringify(type)}`);
    }
    console.debug();
  }

  /**
   * Show performance profile
   */
  private showProfile(): void {
    console.debug('\n⏱️  Performance Profile:');
    console.debug('  (Profiling data would be displayed here)');
    console.debug();
  }

  /**
   * Display result
   */
  private displayResult(result: unknown): void {
    const formatted = this.formatValue(result);
    console.debug(`=> ${formatted}`);
  }

  /**
   * Format value for display
   */
  private formatValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'number') return `${value}`;
    if (typeof value === 'boolean') return `${value}`;
    if (Array.isArray(value)) {
      return `[ ${value.map((v: unknown) => this.formatValue(v)).join(', ')} ]`;
    }
    if (typeof value === 'object' && value !== null) {
      const pairs = Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${this.formatValue(v)}`)
        .join(', ');
      return `{ ${pairs} }`;
    }
    return String(value);
  }
}

/**
 * Create and start REPL
 */
export async function startREPL(parser: REPLParser, runtime: REPLRuntime): Promise<void> {
  const repl = new HoloScriptREPL(parser, runtime);
  await repl.start();
}

/**
 * Hot reload watcher for development
 */
export class HotReloadWatcher {
  private watchers: Map<string, boolean> = new Map();

  /**
   * Watch file for changes
   */
  watch(filePath: string, callback: () => Promise<void>): void {
    // Using basic fs.watch (production would use chokidar)
    const fs = require('fs');

    fs.watchFile(filePath, { interval: 1000 }, async () => {
      try {
        console.debug(`\n🔄 Reloading: ${filePath}`);
        await callback();
        console.debug('✅ Reload complete\n');
      } catch (error: unknown) {
        console.error(ErrorFormatter.formatError(error as HoloScriptError));
      }
    });

    this.watchers.set(filePath, true);
  }

  /**
   * Stop watching
   */
  unwatch(filePath: string): void {
    const fs = require('fs');
    fs.unwatchFile(filePath);
    this.watchers.delete(filePath);
  }

  /**
   * Stop all watchers
   */
  clear(): void {
    const fs = require('fs');
    for (const filePath of this.watchers.keys()) {
      fs.unwatchFile(filePath);
    }
    this.watchers.clear();
  }
}

/**
 * Source map generator
 */
export class SourceMapGenerator {
  private mappings: Array<{
    generatedLine: number;
    generatedColumn: number;
    sourceLine: number;
    sourceColumn: number;
    name?: string;
  }> = [];

  /**
   * Add mapping
   */
  addMapping(
    generatedLine: number,
    generatedColumn: number,
    sourceLine: number,
    sourceColumn: number,
    name?: string
  ): void {
    this.mappings.push({
      generatedLine,
      generatedColumn,
      sourceLine,
      sourceColumn,
      name,
    });
  }

  /**
   * Generate source map
   */
  generate(sourceFile: string, generatedFile: string): Record<string, unknown> {
    return {
      version: 3,
      file: generatedFile,
      sourceRoot: '',
      sources: [sourceFile],
      sourcesContent: [],
      mappings: this.encodeMappings(),
      names: [],
    };
  }

  /**
   * Encode mappings in VLQ format
   */
  private encodeMappings(): string {
    // Simplified VLQ encoding
    return this.mappings
      .map((m) => `${m.generatedLine}:${m.generatedColumn}->${m.sourceLine}:${m.sourceColumn}`)
      .join(';');
  }
}
