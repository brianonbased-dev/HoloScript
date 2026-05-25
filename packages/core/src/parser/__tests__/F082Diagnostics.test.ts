import { describe, expect, it } from 'vitest';
import { parseHolo } from '../HoloCompositionParser';

describe('F.082 parser diagnostics', () => {
  it('names expected composition-body tokens on unexpected syntax', () => {
    const result = parseHolo(`composition "Test" { = }`);
    const message = result.errors.map((error) => error.message).join('\n');

    expect(message).toContain('Unexpected token: EQUALS');
    expect(message).toContain('Expected one of: environment, state, logic');
    expect(message).toContain('identifier/property');
  });

  it('names expected timeline tokens on unexpected syntax', () => {
    const result = parseHolo(`timeline "Bad" { nope }`);
    const message = result.errors.map((error) => error.message).join('\n');

    expect(message).toContain('Unexpected token in timeline: IDENTIFIER');
    expect(message).toContain('Expected one of: autoplay, loop, numeric timestamp');
  });
});
