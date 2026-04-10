import { describe, it, expect } from 'vitest';
import { validateAIOutput, isAISafe, ValidationResult } from '../ai/AIOutputValidator';

// =============================================================================
// SAFE CODE
// =============================================================================

describe('AIOutputValidator — safe code', () => {
  it('accepts clean HoloScript code', () => {
    const code = `
      object "Player" {
        @grabbable { physics: true }
        @networked { sync: "position" }
        position: { x: 0, y: 1, z: 0 }
      }
    `;
    const result = validateAIOutput(code);
    expect(result.valid).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.stats.dangerousPatternCount).toBe(0);
  });

  it('passes isAISafe shortcut for clean code', () => {
    expect(isAISafe('object "Box" { @pressable {} }')).toBe(true);
  });
});

// =============================================================================
// DANGEROUS PATTERNS
// =============================================================================

describe('AIOutputValidator — dangerous patterns', () => {
  it('rejects eval()', () => {
    const result = validateAIOutput('const x = eval("1+1");');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'no-eval')).toBe(true);
  });

  it('rejects require()', () => {
    const result = validateAIOutput('const fs = require("fs");');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'no-require')).toBe(true);
  });

  it('rejects __proto__ access', () => {
    const result = validateAIOutput('obj.__proto__.polluted = true;');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'no-proto')).toBe(true);
  });

  it('rejects process.env', () => {
    const result = validateAIOutput('const key = process.env.SECRET;');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'no-process')).toBe(true);
  });

  it('rejects dynamic import()', () => {
    const result = validateAIOutput('const mod = import("malicious");');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'no-dynamic-import')).toBe(true);
  });

  it('counts multiple dangerous patterns', () => {
    const code = `
      eval("x");
      require("fs");
      process.exit(1);
    `;
    const result = validateAIOutput(code);
    expect(result.stats.dangerousPatternCount).toBe(3);
    expect(result.confidence).toBeLessThan(0.5);
  });
});

// =============================================================================
// STRUCTURAL CHECKS
// =============================================================================

describe('AIOutputValidator — structural checks', () => {
  it('detects unbalanced braces', () => {
    const result = validateAIOutput('object "X" { name: "broken"');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'balanced-braces')).toBe(true);
  });

  it('warns on excessive nesting', () => {
    // 20 levels deep
    const code = '{'.repeat(20) + '}'.repeat(20);
    const result = validateAIOutput(code, { maxNesting: 10 });
    expect(result.issues.some((i) => i.rule === 'max-nesting')).toBe(true);
    expect(result.stats.maxNesting).toBe(20);
  });

  it('rejects code exceeding max line count', () => {
    const code = Array(3001).fill('// line').join('\n');
    const result = validateAIOutput(code, { maxLines: 3000 });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.rule === 'max-lines')).toBe(true);
  });
});

// =============================================================================
// TRAIT VALIDATION
// =============================================================================

describe('AIOutputValidator — trait checks', () => {
  it('counts traits in code', () => {
    const code = '@grabbable {} @networked {} @pressable {}';
    const result = validateAIOutput(code);
    expect(result.stats.traitCount).toBe(3);
  });

  it('warns on unknown traits when allowedTraits is set', () => {
    const code = '@grabbable {} @evil_trait {}';
    const result = validateAIOutput(code, { allowedTraits: ['grabbable', 'pressable'] });
    expect(
      result.issues.some((i) => i.rule === 'allowed-traits' && i.message.includes('evil_trait'))
    ).toBe(true);
  });

  it('warns when trait count exceeds max', () => {
    const traits = Array.from({ length: 101 }, (_, i) => `@trait${i} {}`).join('\n');
    const result = validateAIOutput(traits, { maxTraits: 100 });
    expect(result.issues.some((i) => i.rule === 'max-traits')).toBe(true);
  });
});

// =============================================================================
// CONFIDENCE SCORING
// =============================================================================

describe('AIOutputValidator — confidence', () => {
  it('gives high confidence to clean code', () => {
    const result = validateAIOutput('object "Safe" { @pressable {} }');
    expect(result.confidence).toBe(1.0);
  });

  it('degrades confidence with warnings', () => {
    const code = '{'.repeat(20) + '}'.repeat(20);
    const result = validateAIOutput(code, { maxNesting: 10 });
    expect(result.confidence).toBeLessThan(1.0);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('floors confidence at 0 with many errors', () => {
    const code = ['eval("a");', 'eval("b");', 'eval("c");', 'eval("d");', 'eval("e");'].join('\n');
    const result = validateAIOutput(code);
    expect(result.confidence).toBe(0);
  });
});
