import { describe, it, expect } from 'vitest';
import { isOnlyBlankSourceError } from './blankSource';
describe('isOnlyBlankSourceError', () => {
  it('true only when every error is HS1001', () => {
    expect(isOnlyBlankSourceError([{ code: 'HS1001' }])).toBe(true);
    expect(isOnlyBlankSourceError([{ code: 'HS1001' }, { code: 'HS0002' }])).toBe(false);
    expect(isOnlyBlankSourceError([])).toBe(false);
    expect(isOnlyBlankSourceError(undefined)).toBe(false);
    expect(isOnlyBlankSourceError(['HS1001'])).toBe(false);
  });
});
