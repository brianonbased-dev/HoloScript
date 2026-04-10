import { describe, it, expect } from 'vitest';
import { validateAIOutput, isAISafe } from '@holoscript/framework/ai';

describe('validateAIOutput', () => {
  // Clean code
  it('valid code passes', () => {
    const result = validateAIOutput('const x = 1;\nconst y = 2;\n');
    expect(result.valid).toBe(true);
    expect(result.issues.length).toBe(0);
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  // Line count
  it('detects excessive line count', () => {
    const code = Array(3000).fill('const x = 1;').join('\n');
    const result = validateAIOutput(code);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'max-lines')).toBe(true);
  });

  it('custom maxLines overrides default', () => {
    const code = Array(50).fill('x').join('\n');
    const result = validateAIOutput(code, { maxLines: 10 });
    expect(result.valid).toBe(false);
  });

  // Dangerous patterns
  it('detects eval()', () => {
    const result = validateAIOutput('eval("alert(1)")');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'no-eval')).toBe(true);
  });

  it('detects Function constructor', () => {
    const result = validateAIOutput('new Function("return 1")');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'no-function-constructor')).toBe(true);
  });

  it('detects require()', () => {
    const result = validateAIOutput('const fs = require("fs")');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'no-require')).toBe(true);
  });

  it('detects __proto__', () => {
    const result = validateAIOutput('obj.__proto__.x = 1');
    expect(result.valid).toBe(false);
  });

  it('detects process.', () => {
    const result = validateAIOutput('process.exit(1)');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'no-process')).toBe(true);
  });

  it('detects dynamic import()', () => {
    const result = validateAIOutput('const m = import("evil")');
    expect(result.valid).toBe(false);
  });

  it('detects globalThis', () => {
    const result = validateAIOutput('globalThis.x = 1');
    expect(result.valid).toBe(false);
  });

  it('blockDangerousPatterns=false skips checks', () => {
    const result = validateAIOutput('eval("1")', { blockDangerousPatterns: false });
    expect(result.valid).toBe(true);
  });

  // Nesting
  it('warns on excessive nesting', () => {
    const code = '{'.repeat(20) + '}'.repeat(20);
    const result = validateAIOutput(code);
    expect(result.issues.some((i) => i.rule === 'max-nesting')).toBe(true);
  });

  it('custom maxNesting overrides default', () => {
    const code = '{ { { } } }';
    const result = validateAIOutput(code, { maxNesting: 2 });
    expect(result.issues.some((i) => i.rule === 'max-nesting')).toBe(true);
  });

  // Unbalanced braces
  it('detects unbalanced braces', () => {
    const result = validateAIOutput('{ { }');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'balanced-braces')).toBe(true);
  });

  // Traits
  it('counts traits', () => {
    const result = validateAIOutput('@animate @physics @grabbable');
    expect(result.stats.traitCount).toBe(3);
  });

  it('warns on too many traits', () => {
    const code = Array(200).fill('@trait').join(' ');
    const result = validateAIOutput(code);
    expect(result.issues.some((i) => i.rule === 'max-traits')).toBe(true);
  });

  it('warns on disallowed traits', () => {
    const result = validateAIOutput('@physics @animate', { allowedTraits: ['physics'] });
    expect(result.issues.some((i) => i.rule === 'allowed-traits')).toBe(true);
  });

  // Confidence scoring
  it('confidence drops with errors', () => {
    const clean = validateAIOutput('const x = 1;');
    const dirty = validateAIOutput('eval("1")');
    expect(clean.confidence).toBeGreaterThan(dirty.confidence);
  });

  // Stats
  it('stats include line count and nesting', () => {
    const result = validateAIOutput('a\nb\nc');
    expect(result.stats.lineCount).toBe(3);
    expect(result.stats.maxNesting).toBe(0);
  });

  it('reports line numbers for dangerous patterns', () => {
    const result = validateAIOutput('const x = 1;\neval("2");\nconst y = 3;');
    const evalIssue = result.issues.find((i) => i.rule === 'no-eval')!;
    expect(evalIssue.line).toBe(2);
  });
});

describe('isAISafe', () => {
  it('returns true for safe code', () => {
    expect(isAISafe('const x = 1;')).toBe(true);
  });

  it('returns false for dangerous code', () => {
    expect(isAISafe('eval("1")')).toBe(false);
  });
});
