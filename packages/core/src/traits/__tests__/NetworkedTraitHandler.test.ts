/**
 * NetworkedTraitHandler — tests (metadata only, handler imports external deps)
 */
import { describe, it, expect } from 'vitest';
import { networkedHandler } from '../NetworkedTraitHandler';

describe('NetworkedTraitHandler', () => {
  it('has name "networked"', () => {
    expect(networkedHandler.name).toBe('networked');
  });

  it('defaultConfig has syncRate', () => {
    expect(typeof networkedHandler.defaultConfig?.syncRate).toBe('number');
  });
});
