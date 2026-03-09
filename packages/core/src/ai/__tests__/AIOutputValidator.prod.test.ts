/**
 * AIOutputValidator Production Tests
 * Sprint CLXVI — validateAIOutput, isAISafe, confidence scoring
 */
import { describe, it, expect } from 'vitest';
import { validateAIOutput, isAISafe } from '../AIOutputValidator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lines(n: number): string {
  return Array.from({ length: n }, (_, i) => `const x${i} = ${i};`).join('\n');
}

// ---------------------------------------------------------------------------
// validateAIOutput
// ---------------------------------------------------------------------------

describe('validateAIOutput', () => {
  // --- Basic valid code ---
  describe('valid code', () => {
    it('returns valid=true for empty string', () => {
      const r = validateAIOutput('');
      expect(r.valid).toBe(true);
      expect(r.issues).toHaveLength(0);
    });

    it('returns valid=true for simple safe code', () => {
      const r = validateAIOutput('const x = 1;\nconst y = 2;');
      expect(r.valid).toBe(true);
      expect(r.confidence).toBeGreaterThan(0);
    });

    it('confidence is 1.0 for clean code', () => {
      const r = validateAIOutput('const a = 42;');
      expect(r.confidence).toBe(1.0);
    });

    it('stats.lineCount reflects actual lines', () => {
      const r = validateAIOutput('a\nb\nc');
      expect(r.stats.lineCount).toBe(3);
    });

    it('stats.traitCount counts @decorators', () => {
      const r = validateAIOutput('@Physics\n@Renderable\nconst x = 1;');
      expect(r.stats.traitCount).toBe(2);
    });

    it('stats.dangerousPatternCount is 0 for safe code', () => {
      const r = validateAIOutput('const x = 1;');
      expect(r.stats.dangerousPatternCount).toBe(0);
    });

    it('stats.maxNesting tracks brace depth', () => {
      const r = validateAIOutput('{ { { } } }');
      expect(r.stats.maxNesting).toBe(3);
    });
  });

  // --- Dangerous patterns ---
  describe('dangerous patterns', () => {
    it('flags eval()', () => {
      const r = validateAIOutput('eval("bad code")');
      expect(r.valid).toBe(false);
      expect(r.issues.some((i) => i.rule === 'no-eval')).toBe(true);
    });

    it('flags Function constructor', () => {
      const r = validateAIOutput('const f = Function("return 1")');
      expect(r.valid).toBe(false);
      expect(r.issues.some((i) => i.rule === 'no-function-constructor')).toBe(true);
    });

    it('flags require()', () => {
      const r = validateAIOutput('const fs = require("fs")');
      expect(r.valid).toBe(false);
      expect(r.issues.some((i) => i.rule === 'no-require')).toBe(true);
    });

    it('flags __proto__ access', () => {
      const r = validateAIOutput('obj.__proto__');
      expect(r.valid).toBe(false);
      expect(r.issues.some((i) => i.rule === 'no-proto')).toBe(true);
    });

    it('flags process.* access', () => {
      const r = validateAIOutput('process.exit(0)');
      expect(r.valid).toBe(false);
      expect(r.issues.some((i) => i.rule === 'no-process')).toBe(true);
    });

    it('flags fs.* access', () => {
      const r = validateAIOutput('fs.readFileSync("x")');
      expect(r.valid).toBe(false);
      expect(r.issues.some((i) => i.rule === 'no-fs')).toBe(true);
    });

    it('flags dynamic import()', () => {
      const r = validateAIOutput('import("./foo")');
      expect(r.valid).toBe(false);
      expect(r.issues.some((i) => i.rule === 'no-dynamic-import')).toBe(true);
    });

    it('flags globalThis', () => {
      const r = validateAIOutput('globalThis.x = 1');
      expect(r.valid).toBe(false);
      expect(r.issues.some((i) => i.rule === 'no-globalThis')).toBe(true);
    });

    it('includes line number in issue', () => {
      const r = validateAIOutput('const x = 1;\neval("x")');
      const issue = r.issues.find((i) => i.rule === 'no-eval');
      expect(issue?.line).toBe(2);
    });

    it('does NOT flag if blockDangerousPatterns=false', () => {
      const r = validateAIOutput('eval("x")', { blockDangerousPatterns: false });
      expect(r.valid).toBe(true);
    });

    it('reduces confidence for each dangerous pattern', () => {
      const clean = validateAIOutput('const x = 1;');
      const dirty = validateAIOutput('eval("x")');
      expect(dirty.confidence).toBeLessThan(clean.confidence);
    });
  });

  // --- Max lines ---
  describe('max lines', () => {
    it('flags code exceeding maxLines', () => {
      const r = validateAIOutput(lines(2001));
      expect(r.valid).toBe(false);
      expect(r.issues.some((i) => i.rule === 'max-lines')).toBe(true);
    });

    it('does NOT flag code at maxLines', () => {
      const r = validateAIOutput(lines(2000));
      expect(r.issues.some((i) => i.rule === 'max-lines')).toBe(false);
    });

    it('custom maxLines config applies', () => {
      const r = validateAIOutput(lines(6), { maxLines: 5 });
      expect(r.issues.some((i) => i.rule === 'max-lines')).toBe(true);
    });
  });

  // --- Nesting ---
  describe('nesting depth', () => {
    it('warns for excessive nesting', () => {
      const nested = '{'.repeat(16) + '}'.repeat(16);
      const r = validateAIOutput(nested);
      expect(r.issues.some((i) => i.rule === 'max-nesting')).toBe(true);
      expect(r.issues.find((i) => i.rule === 'max-nesting')?.severity).toBe('warning');
    });

    it('errors for unbalanced braces', () => {
      const r = validateAIOutput('{ {');
      expect(r.issues.some((i) => i.rule === 'balanced-braces')).toBe(true);
      expect(r.issues.find((i) => i.rule === 'balanced-braces')?.severity).toBe('error');
    });

    it('does not warn at exactly maxNesting', () => {
      const nested = '{'.repeat(15) + '}'.repeat(15);
      const r = validateAIOutput(nested);
      expect(r.issues.some((i) => i.rule === 'max-nesting')).toBe(false);
    });
  });

  // --- Allowed traits ---
  describe('allowed traits', () => {
    it('warns for unknown trait when allowedTraits is set', () => {
      const r = validateAIOutput('@Physics @Renderable', { allowedTraits: ['@Renderable'] });
      const issue = r.issues.find((i) => i.rule === 'allowed-traits');
      expect(issue).toBeTruthy();
      expect(issue?.message).toContain('@Physics');
    });

    it('does not warn when trait is in allowed list', () => {
      const r = validateAIOutput('@Renderable', { allowedTraits: ['Renderable'] });
      expect(r.issues.some((i) => i.rule === 'allowed-traits')).toBe(false);
    });

    it('does not check traits if allowedTraits is empty', () => {
      const r = validateAIOutput('@Anything @Custom', { allowedTraits: [] });
      expect(r.issues.some((i) => i.rule === 'allowed-traits')).toBe(false);
    });
  });

  // --- Confidence ---
  describe('confidence scoring', () => {
    it('confidence is clamped to 0 for many errors', () => {
      const code = 'eval("x")\neval("y")\neval("z")\neval("w")';
      const r = validateAIOutput(code);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
    });

    it('warnings reduce confidence less than errors', () => {
      const withWarning = validateAIOutput('{'.repeat(16) + '}'.repeat(16)); // max-nesting warning
      const withError = validateAIOutput('eval("x")'); // dangerous pattern error
      expect(withError.confidence).toBeLessThan(withWarning.confidence);
    });
  });
});

// ---------------------------------------------------------------------------
// isAISafe
// ---------------------------------------------------------------------------

describe('isAISafe', () => {
  it('returns true for valid code', () => {
    expect(isAISafe('const x = 1;')).toBe(true);
  });

  it('returns false for code with eval', () => {
    expect(isAISafe('eval("x")')).toBe(false);
  });

  it('returns false for unbalanced braces', () => {
    expect(isAISafe('{')).toBe(false);
  });

  it('respects custom config', () => {
    expect(isAISafe('eval("x")', { blockDangerousPatterns: false })).toBe(true);
  });
});
