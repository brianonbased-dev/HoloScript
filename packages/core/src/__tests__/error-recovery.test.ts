/**
 * Test file for error recovery enhancements
 *
 * This file demonstrates the improved error messages,
 * typo detection, and recovery strategies in the HoloScript parser.
 */

import { describe, it, expect } from 'vitest';
import { HoloCompositionParser } from '../parser/HoloCompositionParser';

describe('Error Recovery', () => {
  it('should detect typos in keywords', () => {
    const source = `
      composition "Test" {
        enviroment {
          sky: "blue"
        }
      }
    `;

    const parser = new HoloCompositionParser();
    const result = parser.parse(source);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].suggestion).toContain('environment');
  });

  it('should suggest using : instead of = for properties', () => {
    const source = `
      composition "Test" {
        object orb {
          color = "#ff0000"
        }
      }
    `;

    const parser = new HoloCompositionParser();
    const result = parser.parse(source);

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.suggestion?.includes(':'))).toBe(true);
  });

  it('should provide context in error messages', () => {
    const source = `
      composition "Test" {
        object orb {
          position: [0, 0, 0
        }
      }
    `;

    const parser = new HoloCompositionParser();
    const result = parser.parse(source);

    expect(result.success).toBe(false);
    expect(result.errors[0].message).toContain('composition');
  });

  it('should detect multiple errors in a single pass', () => {
    const source = `
      composition "Test" {
        object orb {
          position: [0, 0, 0
          colr = "#ff0000"
        }
      }
    `;

    const parser = new HoloCompositionParser({ tolerant: true });
    const result = parser.parse(source);

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });

  it('should suggest quotes for unquoted strings', () => {
    const source = `
      composition Test {
        object orb {
          position: [0, 0, 0]
        }
      }
    `;

    const parser = new HoloCompositionParser();
    const result = parser.parse(source);

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.suggestion?.includes('quotes'))).toBe(true);
  });
});
