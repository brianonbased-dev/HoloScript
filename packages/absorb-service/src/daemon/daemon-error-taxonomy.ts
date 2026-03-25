/**
 * TypeScript Error Taxonomy for Daemon Learning (G.ARCH.002)
 *
 * Maps TypeScript diagnostic codes to semantic failure categories.
 * Enables the daemon to learn *why* fixes fail, not just *that* they fail.
 * Pure module — no side effects, no I/O.
 *
 * Used by:
 *   - daemon-actions.ts (diagnose action → blackboard injection)
 *   - compress_knowledge (semantic wisdom entries)
 *   - systemic pattern detection (aggregation across candidates)
 */

// ── Error Categories ────────────────────────────────────────────────────────

export type ErrorCategory =
  | 'missing_symbol'       // TS2304: Cannot find name
  | 'type_mismatch'        // TS2345: Argument not assignable
  | 'missing_property'     // TS2339: Property does not exist on type
  | 'missing_member'       // TS2741: Property missing in type but required
  | 'wrong_arity'          // TS2554: Expected N arguments, got M
  | 'incompatible_types'   // TS2322: Type X is not assignable to type Y
  | 'import_resolution'    // TS2307: Cannot find module
  | 'generic_constraint'   // TS2344: Type does not satisfy constraint
  | 'null_safety'          // TS2531/TS18047: Object is possibly null/undefined
  | 'abstract_incomplete'  // TS2515: Non-abstract class missing abstract member
  | 'overload_mismatch'    // TS2769: No overload matches this call
  | 'readonly_violation'   // TS2540: Cannot assign to read-only property
  | 'lint_issue'           // Non-TS errors from lint focus
  | 'unknown';

// ── Semantic Error ──────────────────────────────────────────────────────────

export interface SemanticError {
  /** TypeScript error code, e.g. "TS2304" */
  code: string;
  /** Semantic category derived from the error code */
  category: ErrorCategory;
  /** Primary symbol involved (extracted from error message) */
  symbol?: string;
  /** File path where the error occurred */
  file: string;
  /** Line number */
  line?: number;
  /** Original error message */
  message: string;
}

// ── Failure Pattern ─────────────────────────────────────────────────────────

export interface FailurePattern {
  /** Semantic error category */
  category: ErrorCategory;
  /** Total error count in this category */
  count: number;
  /** Unique files affected */
  files: string[];
  /** Unique symbols involved */
  symbols: string[];
  /** One representative error message */
  exemplar: string;
}

// ── Code → Category Map ────────────────────────────────────────────────────

const CODE_TO_CATEGORY: Record<string, ErrorCategory> = {
  'TS2304': 'missing_symbol',
  'TS2305': 'missing_symbol',
  'TS2306': 'import_resolution',
  'TS2307': 'import_resolution',
  'TS2322': 'incompatible_types',
  'TS2339': 'missing_property',
  'TS2344': 'generic_constraint',
  'TS2345': 'type_mismatch',
  'TS2349': 'type_mismatch',
  'TS2352': 'type_mismatch',
  'TS2416': 'type_mismatch',
  'TS2515': 'abstract_incomplete',
  'TS2531': 'null_safety',
  'TS2540': 'readonly_violation',
  'TS2554': 'wrong_arity',
  'TS2555': 'wrong_arity',
  'TS2741': 'missing_member',
  'TS2769': 'overload_mismatch',
  'TS18047': 'null_safety',
  'TS18048': 'null_safety',
};

// ── Public Functions ────────────────────────────────────────────────────────

/** Map a TypeScript error code to a semantic category */
export function categorizeError(code: string): ErrorCategory {
  return CODE_TO_CATEGORY[code] ?? 'unknown';
}

/** Extract the primary symbol name from a TypeScript error message */
export function extractSymbol(message: string): string | undefined {
  const patterns = [
    /Cannot find name '(\w+)'/,
    /Property '(\w+)' does not exist/,
    /Type '(\w+)' is not assignable/,
    /has no exported member '(\w+)'/,
    /Cannot find module '([^']+)'/,
    /Property '(\w+)' is missing/,
    /Argument of type '(\w+)'/,
    /does not satisfy the constraint '(\w+)'/,
  ];
  for (const re of patterns) {
    const m = message.match(re);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

/**
 * Parse a single tsc error line into a SemanticError.
 * Expected format: `path/to/file.ts(42,10): error TS2304: Cannot find name 'Foo'.`
 */
export function parseTscErrorLine(line: string): SemanticError | null {
  const m = line.match(/^(.+?)\((\d+),\d+\):\s*error\s*(TS\d+):\s*(.+)/);
  if (!m) return null;
  const [, file, lineNum, code, message] = m;
  return {
    code,
    category: categorizeError(code),
    symbol: extractSymbol(message),
    file: file.replace(/\\/g, '/'),
    line: parseInt(lineNum, 10),
    message: message.trim(),
  };
}

/**
 * Parse all tsc error lines from combined stdout+stderr output.
 * Returns only successfully parsed errors (skips non-error lines).
 */
export function parseTscOutput(output: string): SemanticError[] {
  return output
    .split('\n')
    .map(parseTscErrorLine)
    .filter((e): e is SemanticError => e !== null);
}

/**
 * Aggregate SemanticErrors into failure patterns, sorted by count descending.
 * Groups by error category, collecting unique files and symbols.
 */
export function aggregatePatterns(errors: SemanticError[]): FailurePattern[] {
  const byCategory = new Map<ErrorCategory, {
    files: Set<string>;
    symbols: Set<string>;
    exemplar: string;
    count: number;
  }>();

  for (const e of errors) {
    const existing = byCategory.get(e.category);
    if (existing) {
      existing.count++;
      existing.files.add(e.file);
      if (e.symbol) existing.symbols.add(e.symbol);
    } else {
      const files = new Set([e.file]);
      const symbols = new Set<string>();
      if (e.symbol) symbols.add(e.symbol);
      byCategory.set(e.category, { files, symbols, exemplar: e.message, count: 1 });
    }
  }

  return [...byCategory.entries()]
    .map(([category, data]) => ({
      category,
      count: data.count,
      files: [...data.files],
      symbols: [...data.symbols],
      exemplar: data.exemplar,
    }))
    .sort((a, b) => b.count - a.count);
}
