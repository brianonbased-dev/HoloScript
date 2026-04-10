/**
 * Deprecation Warning Rule
 *
 * Sprint 5 Priority 2: Deprecation Warnings
 *
 * Detects usage of deprecated traits, properties, functions, and syntax.
 * Provides migration hints and replacement suggestions.
 *
 * @version 1.0.0
 */

import type { Rule, RuleContext, LintDiagnostic, Severity } from '../types';

/**
 * Rule options
 */
export interface DeprecationWarningOptions {
  /** Report deprecated traits */
  checkTraits?: boolean;
  /** Report deprecated properties */
  checkProperties?: boolean;
  /** Report deprecated functions */
  checkFunctions?: boolean;
  /** Report deprecated syntax */
  checkSyntax?: boolean;
  /** Custom deprecation entries */
  customDeprecations?: DeprecationEntry[];
  /** Ignore specific deprecation IDs */
  ignoreIds?: string[];
}

/**
 * Deprecation entry
 */
export interface DeprecationEntry {
  id: string;
  type: 'trait' | 'property' | 'function' | 'syntax';
  name: string;
  pattern?: string;
  message: string;
  replacement?: string;
  severity?: Severity;
  since?: string;
  removeIn?: string;
}

const DEFAULT_OPTIONS: DeprecationWarningOptions = {
  checkTraits: true,
  checkProperties: true,
  checkFunctions: true,
  checkSyntax: true,
  customDeprecations: [],
  ignoreIds: [],
};

/**
 * Built-in deprecations
 */
const BUILT_IN_DEPRECATIONS: DeprecationEntry[] = [
  // Traits
  {
    id: 'trait-talkable',
    type: 'trait',
    name: 'talkable',
    message: 'The @talkable trait is deprecated',
    replacement: '@voice',
    since: '2.0.0',
    removeIn: '3.0.0',
    severity: 'warning',
  },
  {
    id: 'trait-collision',
    type: 'trait',
    name: 'collision',
    message: 'The @collision trait is deprecated',
    replacement: '@physics or @trigger',
    since: '2.0.0',
    removeIn: '3.0.0',
    severity: 'warning',
  },
  {
    id: 'trait-interactive',
    type: 'trait',
    name: 'interactive',
    message: 'The @interactive trait is deprecated',
    replacement: '@grabbable, @pointable, or @hoverable',
    since: '2.1.0',
    removeIn: '3.0.0',
    severity: 'warning',
  },
  {
    id: 'trait-collidable',
    type: 'trait',
    name: 'collidable',
    message: 'The @collidable trait is deprecated',
    replacement: '@physics',
    since: '2.0.0',
    removeIn: '3.0.0',
    severity: 'warning',
  },
  // Properties
  {
    id: 'prop-pos',
    type: 'property',
    name: 'pos',
    pattern: '\\bpos\\s*:',
    message: 'The "pos" property is deprecated',
    replacement: 'position',
    since: '2.0.0',
    removeIn: '3.0.0',
    severity: 'warning',
  },
  {
    id: 'prop-rot',
    type: 'property',
    name: 'rot',
    pattern: '\\brot\\s*:',
    message: 'The "rot" property is deprecated',
    replacement: 'rotation',
    since: '2.0.0',
    removeIn: '3.0.0',
    severity: 'warning',
  },
  {
    id: 'prop-scl',
    type: 'property',
    name: 'scl',
    pattern: '\\bscl\\s*:',
    message: 'The "scl" property is deprecated',
    replacement: 'scale',
    since: '2.0.0',
    removeIn: '3.0.0',
    severity: 'warning',
  },
  // Functions
  {
    id: 'func-spawn',
    type: 'function',
    name: 'spawn',
    pattern: '\\bspawn\\s*\\(',
    message: 'The spawn() function is deprecated',
    replacement: 'create() or instantiate()',
    since: '2.0.0',
    removeIn: '3.0.0',
    severity: 'warning',
  },
  {
    id: 'func-destroy',
    type: 'function',
    name: 'destroy',
    pattern: '\\bdestroy\\s*\\(',
    message: 'The destroy() function is deprecated',
    replacement: 'remove()',
    since: '2.0.0',
    removeIn: '3.0.0',
    severity: 'warning',
  },
  // Syntax
  {
    id: 'syntax-var',
    type: 'syntax',
    name: 'var',
    pattern: '\\bvar\\s+',
    message: 'The "var" keyword is deprecated',
    replacement: 'const or let',
    since: '1.0.0',
    removeIn: '2.5.0',
    severity: 'error',
  },
  {
    id: 'syntax-object',
    type: 'syntax',
    name: 'object',
    pattern: '\\bobject\\s+["\']',
    message: 'The "object" keyword is deprecated',
    replacement: 'orb',
    since: '2.0.0',
    removeIn: '3.0.0',
    severity: 'warning',
  },
  {
    id: 'syntax-on_event',
    type: 'syntax',
    name: 'on_event',
    pattern: '\\bon_event\\s*\\(',
    message: 'The on_event() syntax is deprecated',
    replacement: '@on_* handlers (e.g., @on_click, @on_hover)',
    since: '2.0.0',
    removeIn: '3.0.0',
    severity: 'warning',
  },
];

/**
 * Check for trait deprecations
 */
function checkTraits(
  source: string,
  lines: string[],
  deprecations: DeprecationEntry[],
  ignoreIds: string[]
): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const traitDeprecations = deprecations.filter(
    (d) => d.type === 'trait' && !ignoreIds.includes(d.id)
  );

  // Match @trait syntax
  const traitRegex = /@(\w+)/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;

    while ((match = traitRegex.exec(line)) !== null) {
      const traitName = match[1];
      const deprecation = traitDeprecations.find((d) => d.name === traitName);

      if (deprecation) {
        diagnostics.push(createDiagnostic(deprecation, i + 1, match.index + 1));
      }
    }
  }

  return diagnostics;
}

/**
 * Check for property/function/syntax deprecations using patterns
 */
function checkPatterns(
  source: string,
  lines: string[],
  deprecations: DeprecationEntry[],
  ignoreIds: string[],
  types: string[]
): LintDiagnostic[] {
  const diagnostics: LintDiagnostic[] = [];
  const filteredDeprecations = deprecations.filter(
    (d) => types.includes(d.type) && d.pattern && !ignoreIds.includes(d.id)
  );

  for (const deprecation of filteredDeprecations) {
    if (!deprecation.pattern) continue;

    try {
      const regex = new RegExp(deprecation.pattern, 'g');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match;

        // Reset regex for each line
        regex.lastIndex = 0;

        while ((match = regex.exec(line)) !== null) {
          diagnostics.push(createDiagnostic(deprecation, i + 1, match.index + 1));
        }
      }
    } catch {
      // Invalid regex, skip
    }
  }

  return diagnostics;
}

/**
 * Create a diagnostic from a deprecation entry
 */
function createDiagnostic(
  deprecation: DeprecationEntry,
  line: number,
  column: number
): LintDiagnostic {
  let message = deprecation.message;

  if (deprecation.replacement) {
    message += `. Use ${deprecation.replacement} instead`;
  }

  if (deprecation.since && deprecation.removeIn) {
    message += ` (deprecated since ${deprecation.since}, will be removed in ${deprecation.removeIn})`;
  } else if (deprecation.removeIn) {
    message += ` (will be removed in ${deprecation.removeIn})`;
  }

  return {
    ruleId: 'deprecation-warning',
    message,
    severity: deprecation.severity || 'warning',
    line,
    column,
  };
}

/**
 * Deprecation Warning Rule
 */
export const deprecationWarningRule: Rule = {
  id: 'deprecation-warning',
  name: 'Deprecation Warning',
  description: 'Detect usage of deprecated traits, properties, functions, and syntax',
  category: 'best-practice',
  defaultSeverity: 'warning',

  check(context: RuleContext): LintDiagnostic[] {
    const diagnostics: LintDiagnostic[] = [];

    // Merge options
    const options: DeprecationWarningOptions = {
      ...DEFAULT_OPTIONS,
      ...(context.config as DeprecationWarningOptions),
    };

    // Combine built-in and custom deprecations
    const allDeprecations = [...BUILT_IN_DEPRECATIONS, ...(options.customDeprecations || [])];

    const ignoreIds = options.ignoreIds || [];

    // Check traits
    if (options.checkTraits) {
      diagnostics.push(...checkTraits(context.source, context.lines, allDeprecations, ignoreIds));
    }

    // Check properties
    if (options.checkProperties) {
      diagnostics.push(
        ...checkPatterns(context.source, context.lines, allDeprecations, ignoreIds, ['property'])
      );
    }

    // Check functions
    if (options.checkFunctions) {
      diagnostics.push(
        ...checkPatterns(context.source, context.lines, allDeprecations, ignoreIds, ['function'])
      );
    }

    // Check syntax
    if (options.checkSyntax) {
      diagnostics.push(
        ...checkPatterns(context.source, context.lines, allDeprecations, ignoreIds, ['syntax'])
      );
    }

    return diagnostics;
  },
};

/**
 * Create rule with custom options
 */
export function createDeprecationWarningRule(options?: DeprecationWarningOptions): Rule {
  return {
    ...deprecationWarningRule,
    check(context: RuleContext): LintDiagnostic[] {
      const mergedContext = {
        ...context,
        config: { ...options, ...context.config },
      };
      return deprecationWarningRule.check(mergedContext);
    },
  };
}

export default deprecationWarningRule;
