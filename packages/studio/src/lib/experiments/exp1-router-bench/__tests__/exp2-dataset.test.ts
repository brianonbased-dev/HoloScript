import { describe, it, expect } from 'vitest';

import { generateDataset, toJsonl } from '../exp2/generateDataset';

describe('EXP-2 dataset generator', () => {
  it('is deterministic for a fixed seed (reproducible corpus)', () => {
    const a = generateDataset(100, 7);
    const b = generateDataset(100, 7);
    expect(toJsonl(a)).toBe(toJsonl(b));
  });

  it('every example has a system+user+assistant triple', () => {
    for (const ex of generateDataset(200)) {
      expect(ex.messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant']);
    }
  });

  it('the assistant target parses to a set_trait_property mutation matching meta.expected', () => {
    for (const ex of generateDataset(300)) {
      const target = JSON.parse(ex.messages[2].content) as { tool: string; input: Record<string, unknown> };
      expect(target.tool).toBe('set_trait_property');
      expect(target.input.trait_name).toBe(ex.meta.trait);
      expect(target.input.property_value).toBe(ex.meta.expected);
      expect(Number.isFinite(ex.meta.expected)).toBe(true);
    }
  });

  it('the user message does NOT leak the numeric bound (the model must internalise it)', () => {
    for (const ex of generateDataset(200)) {
      // The user prompt is plain NL + scene (current value only) — no "[min, max]" range.
      expect(ex.messages[1].content).not.toMatch(/\[\s*-?\d/);
    }
  });

  it('emits valid JSONL (one parseable object per line)', () => {
    const lines = toJsonl(generateDataset(50)).trim().split('\n');
    expect(lines.length).toBe(50);
    for (const line of lines) expect(() => JSON.parse(line)).not.toThrow();
  });
});
