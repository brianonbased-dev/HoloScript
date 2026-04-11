/**
 * DeprecationRegistry
 *
 * Sprint 5: Deprecation Warnings
 *
 * Tracks deprecated symbols and checks for their usage in source text.
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

export class DeprecationRegistry {
  private entries: Map<string, DeprecationEntry> = new Map();

  register(entry: DeprecationEntry): void {
    this.entries.set(entry.name, entry);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  get(name: string): DeprecationEntry | undefined {
    return this.entries.get(name);
  }

  getAll(): DeprecationEntry[] {
    return Array.from(this.entries.values());
  }

  clear(): void {
    this.entries.clear();
  }

  /**
   * Scan source text for usages of deprecated symbols.
   * Looks for @symbolName patterns where symbolName is registered as deprecated.
   */
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

  /**
   * Parse @deprecated annotations from source text.
   * Finds patterns like:
   *   @deprecated("Use X instead")
   *   @deprecated("Use X instead", since: "2.3", until: "3.0")
   * and extracts the symbol name from the next non-empty line.
   */
  static parseAnnotations(source: string): DeprecationEntry[] {
    const entries: DeprecationEntry[] = [];
    const lines = source.split('\n');

    // Match @deprecated("message") with optional since/until
    const annotationRegex =
      /@deprecated\(\s*"([^"]+)"(?:\s*,\s*since:\s*"([^"]*)")?(?:\s*,\s*until:\s*"([^"]*)")?/;

    for (let i = 0; i < lines.length; i++) {
      const annotMatch = annotationRegex.exec(lines[i]);
      if (!annotMatch) continue;

      const message = annotMatch[1];
      const deprecatedIn = annotMatch[2] || undefined;
      const removedIn = annotMatch[3] || undefined;

      // Find the next non-empty line to get the symbol name
      let symbolLine = '';
      for (let j = i + 1; j < lines.length; j++) {
        const candidate = lines[j].trim();
        if (candidate.length > 0) {
          symbolLine = candidate;
          break;
        }
      }

      if (!symbolLine) continue;

      // Parse kind and name from symbol line
      // Patterns: "trait Foo", "template Foo", "property foo", "@Foo"
      const kindNameMatch = /^(?:(trait|template|property|composition)\s+)?@?(\w+)/.exec(
        symbolLine
      );
      if (!kindNameMatch) continue;

      const rawKind = kindNameMatch[1] as DeprecationEntry['kind'] | undefined;
      const name = kindNameMatch[2];
      const kind: DeprecationEntry['kind'] = rawKind ?? 'trait';

      // Extract replacement hint from message ("Use X instead")
      let replacement: string | undefined;
      const replacementMatch = /[Uu]se\s+(\S+)\s+instead/.exec(message);
      if (replacementMatch) {
        replacement = replacementMatch[1];
      }

      entries.push({ name, kind, message, deprecatedIn, removedIn, replacement });
    }

    return entries;
  }

  /**
   * Format a warning as a human-readable string with context.
   */
  formatWarning(warning: DeprecationWarning): string {
    const { entry, filePath, line, column, usageLine } = warning;
    let msg = `[DEPRECATED] ${filePath}:${line}:${column} - @${entry.name}: ${entry.message}`;

    if (entry.replacement) {
      msg += ` (Use ${entry.replacement} instead)`;
    }

    if (entry.deprecatedIn) {
      msg += ` [since ${entry.deprecatedIn}]`;
    }

    if (entry.removedIn) {
      msg += ` [removed in ${entry.removedIn}]`;
    }

    msg += `\n  ${usageLine.trim()}`;

    return msg;
  }
}

/**
 * NoDeprecatedRule
 *
 * Lint rule that checks files for deprecated symbol usage.
 */
export class NoDeprecatedRule {
  private registry: DeprecationRegistry;

  constructor(registry?: DeprecationRegistry) {
    this.registry = registry ?? new DeprecationRegistry();
  }

  /**
   * Register built-in HoloScript deprecated items.
   */
  registerBuiltins(): void {
    this.registry.register({
      name: 'clickable',
      kind: 'trait',
      message: 'The @clickable trait is deprecated',
      replacement: '@interactive',
      deprecatedIn: '2.0',
      removedIn: '3.0',
    });

    this.registry.register({
      name: 'talkable',
      kind: 'trait',
      message: 'The @talkable trait is deprecated',
      replacement: '@voice',
      deprecatedIn: '2.0',
      removedIn: '3.0',
    });

    this.registry.register({
      name: 'collidable',
      kind: 'trait',
      message: 'The @collidable trait is deprecated',
      replacement: '@physics',
      deprecatedIn: '2.0',
      removedIn: '3.0',
    });

    this.registry.register({
      name: 'legacyTemplate',
      kind: 'template',
      message: 'legacyTemplate is deprecated',
      replacement: 'modernTemplate',
      deprecatedIn: '2.1',
      removedIn: '3.0',
    });
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
