import { describe, it, expect, beforeEach } from 'vitest';
import { LanguageService } from '../LanguageService';

describe('LanguageService', () => {
  let service: LanguageService;

  beforeEach(() => {
    service = new LanguageService();
  });

  it('constructs with completions and diagnostics providers', () => {
    expect(service.completions).toBeDefined();
    expect(service.diagnostics).toBeDefined();
  });

  it('getHoverInfo returns docs for known symbols', () => {
    const hover = service.getHoverInfo('box');
    expect(hover).not.toBeNull();
    expect(hover!.contents).toContain('box');
    expect(hover!.contents).toContain('3D box primitive');
  });

  it('getHoverInfo returns docs for trait symbols', () => {
    const hover = service.getHoverInfo('@grabbable');
    expect(hover).not.toBeNull();
    expect(hover!.contents).toContain('grabbable');
  });

  it('getHoverInfo returns null for unknown symbols', () => {
    expect(service.getHoverInfo('nonexistent_thing')).toBeNull();
  });

  it('getHoverInfo finds trait docs without @ prefix', () => {
    // The LanguageService checks both `symbol` and `@${symbol}`
    const hover = service.getHoverInfo('grabbable');
    expect(hover).not.toBeNull();
    expect(hover!.contents).toContain('grabbable');
  });

  it('getKnownSymbols returns all documented symbols', () => {
    const symbols = service.getKnownSymbols();
    expect(symbols.length).toBeGreaterThan(0);
    expect(symbols).toContain('box');
    expect(symbols).toContain('sphere');
    expect(symbols).toContain('@grabbable');
    expect(symbols).toContain('@audio');
  });

  it('getCompletions delegates to CompletionProvider', () => {
    const completions = service.getCompletions('b');
    // Should return array (may be empty or populated based on CompletionProvider)
    expect(Array.isArray(completions)).toBe(true);
  });
});
