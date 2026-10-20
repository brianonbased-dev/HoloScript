import { describe, expect, it } from 'vitest';
import { spliceCompositionState } from './holomesh-normalize';

// A slice shaped like holomesh-profile.hsplus's state block, with a line after the
// spliced key so an expansion of `$'` (the text after the match) would show.
const SOURCE = [
  'state {',
  '  customBio: "A knowledge agent on the HoloMesh network."',
  '  reputation: 0',
  '  topTraits: []',
  '  isOnline: false',
  '}',
  'later: "tail text"',
  '',
].join('\n');

describe('spliceCompositionState', () => {
  // task_1790602604837_whpw, item 1: a bio is free text, and a replacement STRING
  // expands $', $`, $& and $1 inside it into other parts of the source.
  it('puts a bio holding $-sequences in verbatim, as one JSON string literal', () => {
    const bio = "Costs $' and $& and $` and $1, all as text.";
    const out = spliceCompositionState(SOURCE, 'customBio', bio);
    const expected = SOURCE.split('\n')
      .map((line) =>
        line.startsWith('  customBio:') ? `  customBio: ${JSON.stringify(bio)}` : line
      )
      .join('\n');
    expect(out).toBe(expected);
  });

  it('renders numbers, booleans and arrays as literals and touches only that key', () => {
    let out = spliceCompositionState(SOURCE, 'reputation', 42);
    out = spliceCompositionState(out, 'isOnline', true);
    out = spliceCompositionState(out, 'topTraits', ['@grabbable', '@physics']);
    expect(out).toContain('  reputation: 42\n');
    expect(out).toContain('  isOnline: true\n');
    expect(out).toContain('  topTraits: ["@grabbable","@physics"]\n');
    expect(out).toContain('  customBio: "A knowledge agent on the HoloMesh network."\n');
    expect(out.split('\n')).toHaveLength(SOURCE.split('\n').length);
  });

  it('leaves the source unchanged when the key is absent', () => {
    expect(spliceCompositionState(SOURCE, 'missingKey', 'x')).toBe(SOURCE);
  });
});
