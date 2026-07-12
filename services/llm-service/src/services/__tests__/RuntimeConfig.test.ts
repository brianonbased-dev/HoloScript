import { describe, expect, it } from 'vitest';
import { parseServicePort } from '../RuntimeConfig.js';

describe('parseServicePort', () => {
  it('accepts a bounded integer TCP port and the default', () => {
    expect(parseServicePort(undefined)).toBe(8000);
    expect(parseServicePort('7411')).toBe(7411);
  });

  it.each(['8000junk', '1.5', '0', '65536', '-1', 'named-pipe'])(
    'rejects malformed port %s',
    (value) => {
      expect(() => parseServicePort(value)).toThrow('Service port');
    }
  );
});
