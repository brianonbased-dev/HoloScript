/**
 * AI Output Validator
 *
 * Validates AI-generated HoloScript code before execution.
 * Catches structural errors, dangerous patterns, and excessive complexity.
 *
 * @module ai
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  line?: number;
  rule: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  confidence: number; // 0-1: higher = more confident code is safe/correct
  stats: {
    lineCount: number;
    traitCount: number;
    dangerousPatternCount: number;
    maxNesting: number;
  };
}

export interface ValidatorConfig {
  maxLines: number;
  maxNesting: number;
  maxTraits: number;
  allowedTraits?: string[];
  blockDangerousPatterns: boolean;
}

// =============================================================================
// DANGEROUS PATTERNS
// =============================================================================

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; rule: string; message: string }> = [
  { pattern: /\beval\s*\(/, rule: 'no-eval', message: 'eval() is forbidden in generated code' },
  { pattern: /\bFunction\s*\(/, rule: 'no-function-constructor', message: 'Function constructor is forbidden' },
  { pattern: /\brequire\s*\(/, rule: 'no-require', message: 'require() is forbidden — use imports' },
  { pattern: /\b__proto__\b/, rule: 'no-proto', message: '__proto__ access is forbidden' },
  { pattern: /\bconstructor\s*\[/, rule: 'no-constructor-bracket', message: 'Constructor bracket access is forbidden' },
  { pattern: /\bprocess\s*\./, rule: 'no-process', message: 'process.* is forbidden in sandboxed code' },
  { pattern: /\bchild_process\b/, rule: 'no-child-process', message: 'child_process is forbidden' },
  { pattern: /\bfs\s*\./, rule: 'no-fs', message: 'Direct fs access is forbidden' },
  { pattern: /import\s*\(/, rule: 'no-dynamic-import', message: 'Dynamic import() is forbidden' },
  { pattern: /\bglobalThis\b/, rule: 'no-globalThis', message: 'globalThis access is forbidden' },
];

// =============================================================================
// VALIDATOR
// =============================================================================

const DEFAULT_CONFIG: ValidatorConfig = {
  maxLines: 2000,
  maxNesting: 15,
  maxTraits: 100,
  blockDangerousPatterns: true,
};

/**
 * Validate AI-generated code for safety and correctness.
 */
export function validateAIOutput(code: string, config: Partial<ValidatorConfig> = {}): ValidationResult {
  const cfg: ValidatorConfig = { ...DEFAULT_CONFIG, ...config };
  const issues: ValidationIssue[] = [];
  const lines = code.split('\n');
  const lineCount = lines.length;

  // --- Line count check ---
  if (lineCount > cfg.maxLines) {
    issues.push({
      severity: 'error',
      message: `Code exceeds maximum line count (${lineCount} > ${cfg.maxLines})`,
      rule: 'max-lines',
    });
  }

  // --- Dangerous pattern scan ---
  let dangerousPatternCount = 0;
  if (cfg.blockDangerousPatterns) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const dp of DANGEROUS_PATTERNS) {
        if (dp.pattern.test(line)) {
          dangerousPatternCount++;
          issues.push({
            severity: 'error',
            message: dp.message,
            line: i + 1,
            rule: dp.rule,
          });
        }
      }
    }
  }

  // --- Nesting depth check ---
  let maxNesting = 0;
  let currentNesting = 0;
  for (const line of lines) {
    for (const ch of line) {
      if (ch === '{') { currentNesting++; maxNesting = Math.max(maxNesting, currentNesting); }
      else if (ch === '}') { currentNesting = Math.max(0, currentNesting - 1); }
    }
  }

  if (maxNesting > cfg.maxNesting) {
    issues.push({
      severity: 'warning',
      message: `Excessive nesting depth (${maxNesting} > ${cfg.maxNesting})`,
      rule: 'max-nesting',
    });
  }

  // --- Unbalanced braces ---
  if (currentNesting !== 0) {
    issues.push({
      severity: 'error',
      message: `Unbalanced braces: ${currentNesting} unclosed '{'`,
      rule: 'balanced-braces',
    });
  }

  // --- Trait count extraction ---
  const traitMatches = code.match(/@\w+/g) || [];
  const traitCount = traitMatches.length;

  if (traitCount > cfg.maxTraits) {
    issues.push({
      severity: 'warning',
      message: `Too many traits (${traitCount} > ${cfg.maxTraits})`,
      rule: 'max-traits',
    });
  }

  // --- Allowed traits check ---
  if (cfg.allowedTraits && cfg.allowedTraits.length > 0) {
    const allowed = new Set(cfg.allowedTraits.map(t => t.startsWith('@') ? t : `@${t}`));
    for (const trait of traitMatches) {
      if (!allowed.has(trait)) {
        issues.push({
          severity: 'warning',
          message: `Unknown trait "${trait}" — not in allowed list`,
          rule: 'allowed-traits',
        });
      }
    }
  }

  // --- Confidence scoring ---
  const errorCount = issues.filter(i => i.severity === 'error').length;
  const warningCount = issues.filter(i => i.severity === 'warning').length;
  const confidence = Math.max(0, 1.0 - errorCount * 0.3 - warningCount * 0.1 - dangerousPatternCount * 0.2);

  return {
    valid: errorCount === 0,
    issues,
    confidence: Math.round(confidence * 100) / 100,
    stats: { lineCount, traitCount, dangerousPatternCount, maxNesting },
  };
}

/**
 * Quick check — returns true if code passes all error-level checks.
 */
export function isAISafe(code: string, config?: Partial<ValidatorConfig>): boolean {
  return validateAIOutput(code, config).valid;
}
