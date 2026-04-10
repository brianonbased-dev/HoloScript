import { describe, bench, beforeAll } from 'vitest';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';
import { ParseCache } from '../parser/ParseCache';

const LARGE_PROGRAM = Array.from(
  { length: 500 },
  (_, i) => `
orb orb${i} {
  name: "Orb${i}"
  position: [${i}, 0, 0]
  @grabbable
}
`
).join('\n');

const MODIFIED_PROGRAM = LARGE_PROGRAM.replace('orb orb250', 'orb orb250_modified');

describe('Incremental Parsing Performance', () => {
  let parser: HoloScriptPlusParser;
  let cache: ParseCache;

  beforeAll(() => {
    parser = new HoloScriptPlusParser();
    cache = new ParseCache();
    // Warm up cache
    parser.parseIncremental(LARGE_PROGRAM, cache);
  });

  bench('full parse (500 orbs)', () => {
    parser.parse(LARGE_PROGRAM);
  });

  bench('incremental parse (no changes)', () => {
    parser.parseIncremental(LARGE_PROGRAM, cache);
  });

  bench('incremental parse (single orb change)', () => {
    parser.parseIncremental(MODIFIED_PROGRAM, cache);
  });
});
