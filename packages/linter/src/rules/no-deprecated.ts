/**
 * no-deprecated rule
 *
 * Sprint 5: Deprecation Warnings
 *
 * Lint rule that checks files for deprecated symbol usage.
 * Standalone implementation for the linter package.
 */

export interface DeprecationEntry {
  name: string;
  kind: 'trait' | 'template' | 'property' | 'composition';
  message: string;
  deprecatedIn?: string;
  removedIn?: string;
  replacement?: string;
}

export interface DeprecationWarning {
  entry: DeprecationEntry;
  filePath: string;
  line: number;
  column: number;
  usageLine: string;
}

export interface DeprecationRegistryLike {
  register(entry: DeprecationEntry): void;
  scanForUsages(source: string, filePath: string): DeprecationWarning[];
  formatWarning(warning: DeprecationWarning): string;
}

/**
 * Minimal DeprecationRegistry for the linter.
 * For full functionality, use the registry from @holoscript/core analysis module.
 */
export class LinterDeprecationRegistry implements DeprecationRegistryLike {
  private entries: Map<string, DeprecationEntry> = new Map();

  register(entry: DeprecationEntry): void {
    this.entries.set(entry.name, entry);
  }

  scanForUsages(source: string, filePath: string): DeprecationWarning[] {
    const warnings: DeprecationWarning[] = [];
    const lines = source.split('\n');
    const atSymbolRegex = /@(\w+)/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      atSymbolRegex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = atSymbolRegex.exec(line)) !== null) {
        const symbolName = match[1];
        const entry = this.entries.get(symbolName);
        if (entry) {
          warnings.push({
            entry,
            filePath,
            line: i + 1,
            column: match.index + 1,
            usageLine: line,
          });
        }
      }
    }

    return warnings;
  }

  formatWarning(warning: DeprecationWarning): string {
    const { entry, filePath, line, column, usageLine } = warning;
    let msg = `[DEPRECATED] ${filePath}:${line}:${column} - @${entry.name}: ${entry.message}`;
    if (entry.replacement) msg += ` (Use ${entry.replacement} instead)`;
    if (entry.deprecatedIn) msg += ` [since ${entry.deprecatedIn}]`;
    if (entry.removedIn) msg += ` [removed in ${entry.removedIn}]`;
    msg += `\n  ${usageLine.trim()}`;
    return msg;
  }
}

export class NoDeprecatedRule {
  private registry: DeprecationRegistryLike;

  constructor(registry?: DeprecationRegistryLike) {
    this.registry = registry ?? new LinterDeprecationRegistry();
  }

  /**
   * Register built-in HoloScript deprecated items.
   */
  registerBuiltins(): void {
    const builtins: DeprecationEntry[] = [
      {
        name: 'clickable',
        kind: 'trait',
        message: 'The @clickable trait is deprecated',
        replacement: '@interactive',
        deprecatedIn: '2.0',
        removedIn: '3.0',
      },
      {
        name: 'talkable',
        kind: 'trait',
        message: 'The @talkable trait is deprecated',
        replacement: '@voice',
        deprecatedIn: '2.0',
        removedIn: '3.0',
      },
      {
        name: 'collidable',
        kind: 'trait',
        message: 'The @collidable trait is deprecated',
        replacement: '@physics',
        deprecatedIn: '2.0',
        removedIn: '3.0',
      },
      {
        name: 'legacyTemplate',
        kind: 'template',
        message: 'legacyTemplate is deprecated',
        replacement: 'modernTemplate',
        deprecatedIn: '2.1',
        removedIn: '3.0',
      },
    ];

    for (const entry of builtins) {
      this.registry.register(entry);
    }
  }

  /**
   * Check files for deprecated usage.
   * files: Map<filePath, source content>
   */
  check(files: Map<string, string>): DeprecationWarning[] {
    const allWarnings: DeprecationWarning[] = [];

    for (const [filePath, source] of files) {
      const warnings = this.registry.scanForUsages(source, filePath);
      allWarnings.push(...warnings);
    }

    return allWarnings;
  }

  /**
   * Format all warnings as a report string.
   */
  formatReport(warnings: DeprecationWarning[]): string {
    if (warnings.length === 0) {
      return 'No deprecation warnings found.';
    }

    const lines: string[] = [
      `Found ${warnings.length} deprecation warning${warnings.length === 1 ? '' : 's'}:`,
      '',
    ];

    for (const warning of warnings) {
      lines.push(this.registry.formatWarning(warning));
      lines.push('');
    }

    return lines.join('\n');
  }
}

export default NoDeprecatedRule;
