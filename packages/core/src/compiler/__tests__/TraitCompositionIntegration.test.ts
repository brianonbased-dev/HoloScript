/**
 * Sprint 2 — Trait Composition Integration Tests
 *
 * Tests the full parser → binder → composed-handler pipeline:
 *   parseCompositionDirective / parseCompositionBlock  (HoloScriptPlusParser)
 *   registerComposed                                    (TraitBinder)
 */

import { describe, it, expect, vi } from 'vitest';
import HoloScriptPlusParser from '../../HoloScriptPlusParser';
import { TraitBinder } from '../../runtime/TraitBinder';
import type { TraitHandler } from '../../traits/TraitTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHandler(name: string, defaults: Record<string, unknown> = {}): TraitHandler<any> {
  return {
    name: name as any,
    defaultConfig: defaults,
    onAttach: vi.fn(),
    onDetach: vi.fn(),
    onUpdate: vi.fn(),
    onEvent: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// HoloScriptPlusParser — parseCompositionDirective
// ---------------------------------------------------------------------------

describe('HoloScriptPlusParser.parseCompositionDirective', () => {
  const parser = new HoloScriptPlusParser();

  it('parses a simple 2-source composition line', () => {
    const result = parser.parseCompositionDirective('@turret = @physics + @targeting');
    expect(result).toEqual({
      type: 'trait_composition',
      name: 'turret',
      sources: ['physics', 'targeting'],
    });
  });

  it('parses a 3-source composition line', () => {
    const result = parser.parseCompositionDirective('@boss = @physics + @ai_npc + @shield');
    expect(result).toEqual({
      type: 'trait_composition',
      name: 'boss',
      sources: ['physics', 'ai_npc', 'shield'],
    });
  });

  it('tolerates extra whitespace around operators', () => {
    const result = parser.parseCompositionDirective('@hero  =  @run  +  @jump');
    expect(result?.name).toBe('hero');
    expect(result?.sources).toEqual(['run', 'jump']);
  });

  it('returns null for an @import line', () => {
    expect(parser.parseCompositionDirective('@import @physics from "./physics.hs"')).toBeNull();
  });

  it('returns null for an empty line', () => {
    expect(parser.parseCompositionDirective('')).toBeNull();
  });

  it('returns null for a plain @trait decorator (no equals)', () => {
    expect(parser.parseCompositionDirective('@physics')).toBeNull();
  });

  it('returns null for a non-composition assignment', () => {
    expect(parser.parseCompositionDirective('let x = 10')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// HoloScriptPlusParser — parseCompositionBlock
// ---------------------------------------------------------------------------

describe('HoloScriptPlusParser.parseCompositionBlock', () => {
  const parser = new HoloScriptPlusParser();

  it('extracts all composition lines from a multi-line source', () => {
    const code = [
      '@import @physics from "./physics.hs"',
      '',
      'scene World {',
      '  @turret = @physics + @targeting',
      '  @boss = @physics + @ai_npc + @shield',
      '}',
    ].join('\n');

    const result = parser.parseCompositionBlock(code);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      type: 'trait_composition',
      name: 'turret',
      sources: ['physics', 'targeting'],
    });
    expect(result[1]).toEqual({
      type: 'trait_composition',
      name: 'boss',
      sources: ['physics', 'ai_npc', 'shield'],
    });
  });

  it('returns empty array when no composition lines present', () => {
    const code = 'scene World { cube Player { @physics } }';
    expect(parser.parseCompositionBlock(code)).toHaveLength(0);
  });

  it('handles composition lines at the very start of source', () => {
    const code = '@hero = @run + @jump\nscene World {}';
    const result = parser.parseCompositionBlock(code);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('hero');
  });
});

// ---------------------------------------------------------------------------
// TraitBinder — registerComposed
// ---------------------------------------------------------------------------

describe('TraitBinder.registerComposed', () => {
  it('registers the composed trait and makes it resolvable', () => {
    const binder = new TraitBinder();
    const phys = makeHandler('physics', { gravity: 9.8 });
    const aim = makeHandler('targeting', { range: 50 });
    binder.register('physics', phys);
    binder.register('targeting', aim);

    binder.registerComposed('turret', ['physics', 'targeting']);

    expect(binder.has('turret')).toBe(true);
    const handler = binder.resolve('turret');
    expect(handler).toBeDefined();
    expect(handler!.name).toBe('turret');
  });

  it('merges defaultConfig (right-side wins)', () => {
    const binder = new TraitBinder();
    binder.register('a', makeHandler('a', { speed: 1, color: 'red' }));
    binder.register('b', makeHandler('b', { speed: 5 }));
    binder.registerComposed('ab', ['a', 'b']);

    const h = binder.resolve('ab')!;
    // 'b' overrides speed; 'a' contributes color
    expect(h.defaultConfig).toMatchObject({ speed: 5, color: 'red' });
  });

  it('delegates onAttach to all source handlers in order', () => {
    const binder = new TraitBinder();
    const calls: string[] = [];
    const a = makeHandler('a');
    const b = makeHandler('b');
    (a.onAttach as ReturnType<typeof vi.fn>).mockImplementation(() => calls.push('a'));
    (b.onAttach as ReturnType<typeof vi.fn>).mockImplementation(() => calls.push('b'));
    binder.register('a', a);
    binder.register('b', b);
    binder.registerComposed('ab', ['a', 'b']);

    const handler = binder.resolve('ab')!;
    handler.onAttach!({} as any, {}, {} as any);
    expect(calls).toEqual(['a', 'b']);
  });

  it('delegates onDetach in reverse order', () => {
    const binder = new TraitBinder();
    const calls: string[] = [];
    const a = makeHandler('a');
    const b = makeHandler('b');
    (a.onDetach as ReturnType<typeof vi.fn>).mockImplementation(() => calls.push('a'));
    (b.onDetach as ReturnType<typeof vi.fn>).mockImplementation(() => calls.push('b'));
    binder.register('a', a);
    binder.register('b', b);
    binder.registerComposed('ab', ['a', 'b']);

    binder.resolve('ab')!.onDetach!({} as any, {}, {} as any);
    expect(calls).toEqual(['b', 'a']);
  });

  it('returns warnings for unknown source traits', () => {
    const binder = new TraitBinder();
    binder.register('a', makeHandler('a'));
    const warnings = binder.registerComposed('ab', ['a', 'nonexistent']);
    expect(warnings.some((w) => w.includes('nonexistent'))).toBe(true);
  });

  it('the composed trait can itself be composed with another', () => {
    const binder = new TraitBinder();
    binder.register('a', makeHandler('a', { x: 1 }));
    binder.register('b', makeHandler('b', { y: 2 }));
    binder.registerComposed('ab', ['a', 'b']);

    binder.register('c', makeHandler('c', { z: 3 }));
    binder.registerComposed('abc', ['ab', 'c']);

    const h = binder.resolve('abc')!;
    expect(h.defaultConfig).toMatchObject({ x: 1, y: 2, z: 3 });
  });

  it('does not affect existing handlers when composing', () => {
    const binder = new TraitBinder();
    binder.register('physics', makeHandler('physics'));
    binder.register('ai', makeHandler('ai'));
    binder.registerComposed('enemy', ['physics', 'ai']);

    // Original handlers still resolve correctly
    expect(binder.resolve('physics')).toBeDefined();
    expect(binder.resolve('ai')).toBeDefined();
  });
});
