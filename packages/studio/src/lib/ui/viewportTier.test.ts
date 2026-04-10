import { describe, expect, it } from 'vitest';

import { classifyViewport } from './viewportTier';

describe('classifyViewport', () => {
  it('classifies mobile widths', () => {
    expect(classifyViewport(375, 812).tier).toBe('mobile');
  });

  it('classifies tablet widths', () => {
    expect(classifyViewport(834, 1112).tier).toBe('tablet');
  });

  it('classifies desktop widths', () => {
    expect(classifyViewport(1440, 900).tier).toBe('desktop');
  });

  it('marks orientation correctly', () => {
    expect(classifyViewport(900, 600).isPortrait).toBe(false);
    expect(classifyViewport(600, 900).isPortrait).toBe(true);
  });
});
