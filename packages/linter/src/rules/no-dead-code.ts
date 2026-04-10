/**
 * No Dead Code Rule
 *
 * Sprint 5 Priority 1: Dead Code Detection
 *
 * Detects unused orbs, templates, functions, and properties.
 * This is a standalone implementation for the linter package.
 *
 * @version 1.0.0
 */

import type { Rule, RuleContext, LintDiagnostic, Severity } from '../types';

/**
 * Rule options
 */
export interface NoDeadCodeOptions {
  /** Check for unused orbs */
  checkOrbs?: boolean;
  /** Check for unused templates */
  checkTemplates?: boolean;
  /** Check for unused functions */
  checkFunctions?: boolean;
  /** Check for unused properties */
  checkProperties?: boolean;
  /** Ignore patterns (regex strings) */
  ignorePatterns?: string[];
  /** Ignore symbols starting with underscore */
  ignorePrivate?: boolean;
  /** Additional entry point names */
  entryPoints?: string[];
}

const DEFAULT_OPTIONS: NoDeadCodeOptions = {
  checkOrbs: true,
  checkTemplates: true,
  checkFunctions: true,
  checkProperties: false, // Properties often look unused but aren't
  ignorePatterns: [],
  ignorePrivate: true,
  entryPoints: [],
};

interface SymbolInfo {
  name: string;
  type: 'orb' | 'template' | 'function' | 'variable';
  line: number;
  column: number;
}

/**
 * Collect symbol definitions from source
 */
function collectDefinitions(source: string, lines: string[]): SymbolInfo[] {
  const definitions: SymbolInfo[] = [];

  // Orb definitions: orb "Name" { ... }
  const orbRegex = /\borb\s+["']([^"']+)["']/g;
  // Template definitions: template "Name" { ... }
  const templateRegex = /\btemplate\s+["']([^"']+)["']/g;
  // Function definitions: function name(...) { ... }
  const funcRegex = /\bfunction\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
  // Variable definitions: const/let name = ...
  const varRegex = /\b(?:const|let)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;

    // Reset regex lastIndex
    orbRegex.lastIndex = 0;
    templateRegex.lastIndex = 0;
    funcRegex.lastIndex = 0;
    varRegex.lastIndex = 0;

    while ((match = orbRegex.exec(line)) !== null) {
      definitions.push({
        name: match[1],
        type: 'orb',
        line: i + 1,
        column: match.index + 1,
      });
    }

    while ((match = templateRegex.exec(line)) !== null) {
      definitions.push({
        name: match[1],
        type: 'template',
        line: i + 1,
        column: match.index + 1,
      });
    }

    while ((match = funcRegex.exec(line)) !== null) {
      definitions.push({
        name: match[1],
        type: 'function',
        line: i + 1,
        column: match.index + 1,
      });
    }

    while ((match = varRegex.exec(line)) !== null) {
      definitions.push({
        name: match[1],
        type: 'variable',
        line: i + 1,
        column: match.index + 1,
      });
    }
  }

  return definitions;
}

/**
 * Collect symbol references (usages) from source
 */
function collectReferences(source: string): Set<string> {
  const references = new Set<string>();

  // Identifier references - any word followed by . or ( or used in expressions
  const identifierRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\s*[.(]/g;
  // Template usages: using "Name"
  const usingRegex = /\busing\s+["']([^"']+)["']/g;
  // Direct identifier usage in expressions
  const exprRegex = /[=:]\s*([A-Za-z_][A-Za-z0-9_]*)\b/g;
  // Property access: Name.property
  const propAccessRegex = /\b([A-Za-z_][A-Za-z0-9_]*)\.[A-Za-z_]/g;

  let match;

  while ((match = identifierRegex.exec(source)) !== null) {
    references.add(match[1]);
  }

  while ((match = usingRegex.exec(source)) !== null) {
    references.add(match[1]);
  }

  while ((match = exprRegex.exec(source)) !== null) {
    references.add(match[1]);
  }

  while ((match = propAccessRegex.exec(source)) !== null) {
    references.add(match[1]);
  }

  return references;
}

/**
 * Check if a symbol should be ignored
 */
function shouldIgnore(name: string, options: NoDeadCodeOptions): boolean {
  // Ignore private symbols (starting with _)
  if (options.ignorePrivate && name.startsWith('_')) {
    return true;
  }

  // Check ignore patterns
  if (options.ignorePatterns) {
    for (const pattern of options.ignorePatterns) {
      try {
        if (new RegExp(pattern).test(name)) {
          return true;
        }
      } catch {
        // Invalid regex, skip
      }
    }
  }

  // Check entry points
  if (options.entryPoints?.includes(name)) {
    return true;
  }

  return false;
}

/**
 * Format diagnostic message
 */
function formatMessage(symbol: SymbolInfo): string {
  switch (symbol.type) {
    case 'orb':
      return `Orb "${symbol.name}" is defined but never used in the scene`;
    case 'template':
      return `Template "${symbol.name}" is defined but never instantiated`;
    case 'function':
      return `Function "${symbol.name}" is defined but never called`;
    case 'variable':
      return `Variable "${symbol.name}" is defined but never used`;
    default:
      return `"${symbol.name}" appears to be dead code`;
  }
}

/**
 * Get severity based on symbol type
 */
function getSeverity(type: string): Severity {
  switch (type) {
    case 'orb':
    case 'template':
    case 'function':
      return 'warning';
    case 'variable':
      return 'info';
    default:
      return 'warning';
  }
}

/**
 * No Dead Code Rule
 */
export const noDeadCodeRule: Rule = {
  id: 'no-dead-code',
  name: 'No Dead Code',
  description: 'Detect unused orbs, templates, functions, and properties',
  category: 'best-practice',
  defaultSeverity: 'warning',

  check(context: RuleContext): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];

    // Merge options
    const options: NoDeadCodeOptions = {
      ...DEFAULT_OPTIONS,
      ...(context.config as NoDeadCodeOptions),
    };

    // Collect definitions
    const definitions = collectDefinitions(context.source, context.lines);

    // Collect references
    const references = collectReferences(context.source);

    // Find unused definitions
    for (const def of definitions) {
      // Apply type filters
      if (!options.checkOrbs && def.type === 'orb') continue;
      if (!options.checkTemplates && def.type === 'template') continue;
      if (!options.checkFunctions && def.type === 'function') continue;
      if (!options.checkProperties && def.type === 'variable') continue;

      // Check if should be ignored
      if (shouldIgnore(def.name, options)) continue;

      // Check if referenced
      if (!references.has(def.name)) {
        diagnostics.push({
          ruleId: 'no-dead-code',
          message: formatMessage(def),
          severity: getSeverity(def.type),
          line: def.line,
          column: def.column,
        });
      }
    }

    return diagnostics;
  },
};

/**
 * Create rule with custom options
 */
export function createNoDeadCodeRule(options?: NoDeadCodeOptions): Rule {
  return {
    ...noDeadCodeRule,
    check(context: RuleContext): LintDiagnostic[] {
      const mergedContext = {
        ...context,
        config: { ...options, ...context.config },
      };
      return noDeadCodeRule.check(mergedContext);
    },
  };
}

export default noDeadCodeRule;
