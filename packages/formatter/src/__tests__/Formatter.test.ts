import { describe, it, expect } from 'vitest';
import { HoloScriptFormatter } from '../index';

describe('HoloScriptFormatter', () => {
  const formatter = new HoloScriptFormatter();

  const normalize = (str: string) => str.trim().replace(/\r\n/g, '\n');

  it('normalizes indentation', () => {
    const input = `
composition "Test" {
      object "Cube" {
  position: [0, 0, 0]
      }
}
`;
    // Indentation normalized to 2 spaces
    const expected = `
composition "Test" {
  object "Cube" {
    position: [0, 0, 0]
  }
}
`;
    const result = formatter.format(input);
    expect(normalize(result.formatted)).toBe(normalize(expected));
  });

  it('sorts imports', () => {
    const input = `
import "utils"
import "math"
import "abilities"

composition "Test" {}
`;
    const expected = `
import "abilities"
import "math"
import "utils"

composition "Test" {}
`;
    const result = formatter.format(input);
    expect(normalize(result.formatted)).toBe(normalize(expected));
  });

  it('formats braces (same-line)', () => {
    const input = `
composition "Test"
{
  object "Cube"
  {
  }
}
`;
    const expected = `
composition "Test" {
  object "Cube" {
  }
}
`;
    const result = formatter.format(input);
    expect(normalize(result.formatted)).toBe(normalize(expected));
  });

  it('formats braces (next-line)', () => {
    const nextLineFormatter = new HoloScriptFormatter({ braceStyle: 'next-line' });
    const input = `
composition "Test" {
  object "Cube" {
  }
}
`;
    // We expect indentation to be preserved for the moved braces
    const expected = `
composition "Test"
{
  object "Cube"
  {
  }
}
`;
    const result = nextLineFormatter.format(input);
    expect(normalize(result.formatted)).toBe(normalize(expected));
  });
});
