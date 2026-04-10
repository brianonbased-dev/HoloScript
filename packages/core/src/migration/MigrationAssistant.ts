/**
 * Migration Assistant
 *
 * Sprint 5 Priority 3: Migration Assistant
 *
 * Provides automated code migration for deprecated patterns.
 * Detects deprecated code, generates migration suggestions, and applies fixes.
 *
 * @version 1.0.0
 */

import { DeprecationRegistry, createDeprecationRegistry } from '../deprecation';

/**
 * Migration rule defining how to transform deprecated code
 */
export interface MigrationRule {
  /** Unique rule identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Detailed description */
  description: string;
  /** Pattern to match (regex string or RegExp) */
  pattern: string | RegExp;
  /** Replacement template (can use $1, $2 for capture groups) */
  replacement: string;
  /** Whether this migration is safe to auto-apply */
  autoFix: boolean;
  /** Additional context or notes */
  notes?: string;
  /** Severity level */
  severity: 'required' | 'recommended' | 'optional';
  /** Version this rule was added */
  since?: string;
}

/**
 * Migration suggestion for a specific location
 */
export interface MigrationSuggestion {
  /** Rule that generated this suggestion */
  rule: MigrationRule;
  /** Line number (1-based) */
  line: number;
  /** Column number (1-based) */
  column: number;
  /** Original text matched */
  original: string;
  /** Suggested replacement */
  suggested: string;
  /** The full line for context */
  lineContent: string;
  /** Whether this can be auto-fixed */
  canAutoFix: boolean;
  /** Additional message */
  message?: string;
}

/**
 * Migration result from analyzing source
 */
export interface MigrationResult {
  /** Source file path */
  filePath: string;
  /** Total suggestions found */
  totalSuggestions: number;
  /** Auto-fixable suggestions count */
  autoFixable: number;
  /** Suggestions grouped by severity */
  bySeverity: {
    required: MigrationSuggestion[];
    recommended: MigrationSuggestion[];
    optional: MigrationSuggestion[];
  };
  /** All suggestions */
  suggestions: MigrationSuggestion[];
}

/**
 * Result of applying migrations
 */
export interface ApplyResult {
  /** New source code after migrations */
  source: string;
  /** Number of changes applied */
  changesApplied: number;
  /** List of applied migrations */
  applied: Array<{
    rule: MigrationRule;
    line: number;
    original: string;
    replacement: string;
  }>;
  /** Migrations that couldn't be applied */
  skipped: Array<{
    suggestion: MigrationSuggestion;
    reason: string;
  }>;
}

/**
 * Built-in migration rules
 */
const BUILT_IN_RULES: MigrationRule[] = [
  // Trait migrations
  {
    id: 'migrate-talkable-to-voice',
    name: 'Migrate @talkable to @voice',
    description: 'Replace deprecated @talkable trait with @voice',
    pattern: /@talkable\b/g,
    replacement: '@voice',
    autoFix: true,
    severity: 'required',
    since: '2.0.0',
  },
  {
    id: 'migrate-collision-to-physics',
    name: 'Migrate @collision to @physics/@trigger',
    description: 'Replace deprecated @collision trait with @physics or @trigger',
    pattern: /@collision\b(?!\s*\()/g,
    replacement: '@physics',
    autoFix: false, // Needs manual review to choose between @physics and @trigger
    severity: 'required',
    notes: 'Consider using @trigger if only detecting collisions without physics response',
    since: '2.0.0',
  },
  {
    id: 'migrate-interactive-to-specific',
    name: 'Migrate @interactive to specific traits',
    description: 'Replace deprecated @interactive with @grabbable, @pointable, or @hoverable',
    pattern: /@interactive\b/g,
    replacement: '@grabbable @pointable @hoverable',
    autoFix: false, // Multiple replacement options
    severity: 'required',
    notes: 'Choose appropriate traits based on interaction needs',
    since: '2.1.0',
  },
  {
    id: 'migrate-collidable-to-physics',
    name: 'Migrate @collidable to @physics',
    description: 'Replace deprecated @collidable trait with @physics',
    pattern: /@collidable\b/g,
    replacement: '@physics',
    autoFix: true,
    severity: 'required',
    since: '2.0.0',
  },

  // Property migrations
  {
    id: 'migrate-pos-to-position',
    name: 'Migrate pos to position',
    description: 'Replace deprecated "pos" property with "position"',
    pattern: /\bpos\s*:/g,
    replacement: 'position:',
    autoFix: true,
    severity: 'required',
    since: '2.0.0',
  },
  {
    id: 'migrate-rot-to-rotation',
    name: 'Migrate rot to rotation',
    description: 'Replace deprecated "rot" property with "rotation"',
    pattern: /\brot\s*:/g,
    replacement: 'rotation:',
    autoFix: true,
    severity: 'required',
    since: '2.0.0',
  },
  {
    id: 'migrate-scl-to-scale',
    name: 'Migrate scl to scale',
    description: 'Replace deprecated "scl" property with "scale"',
    pattern: /\bscl\s*:/g,
    replacement: 'scale:',
    autoFix: true,
    severity: 'required',
    since: '2.0.0',
  },

  // Function migrations
  {
    id: 'migrate-spawn-to-create',
    name: 'Migrate spawn() to create()',
    description: 'Replace deprecated spawn() function with create()',
    pattern: /\bspawn\s*\(/g,
    replacement: 'create(',
    autoFix: true,
    severity: 'required',
    since: '2.0.0',
  },
  {
    id: 'migrate-destroy-to-remove',
    name: 'Migrate destroy() to remove()',
    description: 'Replace deprecated destroy() function with remove()',
    pattern: /\bdestroy\s*\(/g,
    replacement: 'remove(',
    autoFix: true,
    severity: 'required',
    since: '2.0.0',
  },

  // Syntax migrations
  {
    id: 'migrate-var-to-let',
    name: 'Migrate var to let/const',
    description: 'Replace deprecated "var" keyword with "let" or "const"',
    pattern: /\bvar\s+/g,
    replacement: 'let ',
    autoFix: true,
    severity: 'required',
    notes: 'Consider using "const" if variable is never reassigned',
    since: '1.0.0',
  },
  {
    id: 'migrate-object-to-orb',
    name: 'Migrate object keyword to orb',
    description: 'Replace deprecated "object" keyword with "orb"',
    pattern: /\bobject\s+([\"'])/g,
    replacement: 'orb $1',
    autoFix: true,
    severity: 'required',
    since: '2.0.0',
  },
  {
    id: 'migrate-on_event-to-handler',
    name: 'Migrate on_event() to @on_* handlers',
    description: 'Replace deprecated on_event() syntax with @on_* handlers',
    pattern: /on_event\s*\(\s*["'](\w+)["']\s*,\s*/g,
    replacement: '@on_$1 ',
    autoFix: false, // Requires restructuring code block
    severity: 'required',
    notes: 'Handler body needs to be restructured to @on_* block syntax',
    since: '2.0.0',
  },

  // Recommended migrations
  {
    id: 'use-template-literals',
    name: 'Use template literals',
    description: 'Replace string concatenation with template literals',
    pattern: /["']([^"']*?)["']\s*\+\s*(\w+)\s*\+\s*["']([^"']*?)["']/g,
    replacement: '`$1${$2}$3`',
    autoFix: false, // May not always be appropriate
    severity: 'recommended',
  },
  {
    id: 'use-const-for-constants',
    name: 'Use const for constants',
    description: 'Use const instead of let for variables that are never reassigned',
    pattern: /\blet\s+([A-Z_][A-Z0-9_]*)\s*=/g,
    replacement: 'const $1 =',
    autoFix: true,
    severity: 'recommended',
    notes: 'Variables in SCREAMING_CASE are typically constants',
  },
];

/**
 * Migration Assistant class
 */
export class MigrationAssistant {
  private rules: Map<string, MigrationRule> = new Map();
  private deprecationRegistry: DeprecationRegistry;

  constructor(options: { includeBuiltIn?: boolean } = {}) {
    this.deprecationRegistry = createDeprecationRegistry();

    // Load built-in rules by default
    if (options.includeBuiltIn !== false) {
      for (const rule of BUILT_IN_RULES) {
        this.rules.set(rule.id, rule);
      }
    }
  }

  /**
   * Register a custom migration rule
   */
  registerRule(rule: MigrationRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Unregister a rule by ID
   */
  unregisterRule(id: string): boolean {
    return this.rules.delete(id);
  }

  /**
   * Get all registered rules
   */
  getRules(): MigrationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get a rule by ID
   */
  getRule(id: string): MigrationRule | undefined {
    return this.rules.get(id);
  }

  /**
   * Analyze source code for migration opportunities
   */
  analyze(source: string, filePath = 'input.holo'): MigrationResult {
    const lines = source.split('\n');
    const suggestions: MigrationSuggestion[] = [];

    for (const rule of this.rules.values()) {
      const regex =
        typeof rule.pattern === 'string'
          ? new RegExp(rule.pattern, 'g')
          : new RegExp(rule.pattern.source, rule.pattern.flags);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match;

        // Reset regex for each line
        regex.lastIndex = 0;

        while ((match = regex.exec(line)) !== null) {
          const original = match[0];
          const suggested = original.replace(regex, rule.replacement);

          suggestions.push({
            rule,
            line: i + 1,
            column: match.index + 1,
            original,
            suggested,
            lineContent: line,
            canAutoFix: rule.autoFix,
            message: rule.notes,
          });

          // Reset again after replacement to prevent infinite loops
          regex.lastIndex = match.index + 1;
        }
      }
    }

    // Sort by line number
    suggestions.sort((a, b) => a.line - b.line || a.column - b.column);

    // Group by severity
    const bySeverity = {
      required: suggestions.filter((s) => s.rule.severity === 'required'),
      recommended: suggestions.filter((s) => s.rule.severity === 'recommended'),
      optional: suggestions.filter((s) => s.rule.severity === 'optional'),
    };

    return {
      filePath,
      totalSuggestions: suggestions.length,
      autoFixable: suggestions.filter((s) => s.canAutoFix).length,
      bySeverity,
      suggestions,
    };
  }

  /**
   * Apply auto-fixable migrations to source code
   */
  applyAutoFixes(source: string, options: { onlyRequired?: boolean } = {}): ApplyResult {
    const lines = source.split('\n');
    const applied: ApplyResult['applied'] = [];
    const skipped: ApplyResult['skipped'] = [];

    // Get applicable rules
    const applicableRules = Array.from(this.rules.values()).filter(
      (rule) => rule.autoFix && (!options.onlyRequired || rule.severity === 'required')
    );

    // Apply migrations line by line
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      for (const rule of applicableRules) {
        const regex =
          typeof rule.pattern === 'string'
            ? new RegExp(rule.pattern, 'g')
            : new RegExp(rule.pattern.source, rule.pattern.flags);

        let match;
        regex.lastIndex = 0;

        while ((match = regex.exec(lines[i])) !== null) {
          const original = match[0];
          const newLine = line.replace(regex, rule.replacement);

          if (newLine !== line) {
            applied.push({
              rule,
              line: i + 1,
              original,
              replacement: rule.replacement,
            });
            line = newLine;
          }

          // Reset to prevent infinite loops
          regex.lastIndex = 0;
          break; // Re-check line from start with new content
        }
      }

      lines[i] = line;
    }

    return {
      source: lines.join('\n'),
      changesApplied: applied.length,
      applied,
      skipped,
    };
  }

  /**
   * Apply specific migrations by rule ID
   */
  applyRules(source: string, ruleIds: string[]): ApplyResult {
    const lines = source.split('\n');
    const applied: ApplyResult['applied'] = [];
    const skipped: ApplyResult['skipped'] = [];

    for (const ruleId of ruleIds) {
      const rule = this.rules.get(ruleId);
      if (!rule) {
        continue;
      }

      const regex =
        typeof rule.pattern === 'string'
          ? new RegExp(rule.pattern, 'g')
          : new RegExp(rule.pattern.source, rule.pattern.flags);

      for (let i = 0; i < lines.length; i++) {
        let match;
        regex.lastIndex = 0;

        while ((match = regex.exec(lines[i])) !== null) {
          const original = match[0];
          const newLine = lines[i].replace(regex, rule.replacement);

          if (newLine !== lines[i]) {
            applied.push({
              rule,
              line: i + 1,
              original,
              replacement: rule.replacement,
            });
            lines[i] = newLine;
          }

          // Reset to prevent infinite loops
          regex.lastIndex = 0;
          break;
        }
      }
    }

    return {
      source: lines.join('\n'),
      changesApplied: applied.length,
      applied,
      skipped,
    };
  }

  /**
   * Generate a migration report
   */
  generateReport(result: MigrationResult): string {
    const lines: string[] = [];

    lines.push(`Migration Report for ${result.filePath}`);
    lines.push('='.repeat(50));
    lines.push('');
    lines.push(`Total suggestions: ${result.totalSuggestions}`);
    lines.push(`Auto-fixable: ${result.autoFixable}`);
    lines.push('');

    if (result.bySeverity.required.length > 0) {
      lines.push('## Required Migrations');
      lines.push('');
      for (const s of result.bySeverity.required) {
        lines.push(`- Line ${s.line}: ${s.rule.name}`);
        lines.push(`  Original: ${s.original}`);
        lines.push(`  Suggested: ${s.suggested}`);
        if (s.message) {
          lines.push(`  Note: ${s.message}`);
        }
        lines.push('');
      }
    }

    if (result.bySeverity.recommended.length > 0) {
      lines.push('## Recommended Migrations');
      lines.push('');
      for (const s of result.bySeverity.recommended) {
        lines.push(`- Line ${s.line}: ${s.rule.name}`);
        lines.push(`  Original: ${s.original}`);
        lines.push(`  Suggested: ${s.suggested}`);
        lines.push('');
      }
    }

    if (result.bySeverity.optional.length > 0) {
      lines.push('## Optional Migrations');
      lines.push('');
      for (const s of result.bySeverity.optional) {
        lines.push(`- Line ${s.line}: ${s.rule.name}`);
        lines.push(`  Original: ${s.original}`);
        lines.push(`  Suggested: ${s.suggested}`);
        lines.push('');
      }
    }

    if (result.totalSuggestions === 0) {
      lines.push('No migrations needed. Code is up to date!');
    }

    return lines.join('\n');
  }

  /**
   * Check if source needs migration
   */
  needsMigration(source: string): boolean {
    const result = this.analyze(source);
    return result.totalSuggestions > 0;
  }

  /**
   * Get migration summary statistics
   */
  getSummary(source: string): {
    needsMigration: boolean;
    requiredCount: number;
    recommendedCount: number;
    optionalCount: number;
    autoFixableCount: number;
  } {
    const result = this.analyze(source);
    return {
      needsMigration: result.totalSuggestions > 0,
      requiredCount: result.bySeverity.required.length,
      recommendedCount: result.bySeverity.recommended.length,
      optionalCount: result.bySeverity.optional.length,
      autoFixableCount: result.autoFixable,
    };
  }
}

/**
 * Create a new migration assistant
 */
export function createMigrationAssistant(
  options: { includeBuiltIn?: boolean } = {}
): MigrationAssistant {
  return new MigrationAssistant(options);
}

/**
 * Quick analyze helper
 */
export function analyzeMigrations(source: string, filePath = 'input.holo'): MigrationResult {
  const assistant = createMigrationAssistant();
  return assistant.analyze(source, filePath);
}

/**
 * Quick auto-fix helper
 */
export function autoFixMigrations(
  source: string,
  options: { onlyRequired?: boolean } = {}
): ApplyResult {
  const assistant = createMigrationAssistant();
  return assistant.applyAutoFixes(source, options);
}

export default MigrationAssistant;
