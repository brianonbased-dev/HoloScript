import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DirectiveProcessor } from '../DirectiveProcessor';

// Mock TraitBinder
function makeMockTraitBinder(knownTraits: string[]) {
  return { has: (name: string) => knownTraits.includes(name) } as any;
}

describe('DirectiveProcessor', () => {
  let processor: DirectiveProcessor;

  beforeEach(() => {
    processor = new DirectiveProcessor(makeMockTraitBinder(['grabbable', 'audio', 'particles']));
  });

  it('categorizes metadata directives', () => {
    const result = processor.process([{ name: 'version', args: { value: '1.0' } }]);
    expect(result.metadata.length).toBe(1);
    expect(result.metadata[0].category).toBe('metadata');
    expect(result.metadata[0].valid).toBe(true);
  });

  it('categorizes control directives', () => {
    const result = processor.process([
      { name: 'if', args: { condition: 'x > 0' } },
      { name: 'each', args: { items: 'list' } },
    ]);
    expect(result.controls.length).toBe(2);
  });

  it('categorizes hook directives', () => {
    const result = processor.process([
      { name: 'on', args: { event: 'click' } },
      { name: 'emit', args: { event: 'ready' } },
    ]);
    expect(result.hooks.length).toBe(2);
  });

  it('categorizes known trait directives', () => {
    const result = processor.process([{ name: 'grabbable' }]);
    expect(result.traits.length).toBe(1);
    expect(result.traits[0].category).toBe('trait');
  });

  it('marks unknown directives as errors', () => {
    const result = processor.process([{ name: 'nonexistent' }]);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].valid).toBe(false);
    expect(result.errors[0].error).toContain('nonexistent');
  });

  it('processOne handles missing args gracefully', () => {
    const d = processor.processOne({ name: 'version' });
    expect(d.args).toEqual({});
    expect(d.valid).toBe(true);
  });

  it('process handles mixed directives', () => {
    const result = processor.process([
      { name: 'version' },
      { name: 'if' },
      { name: 'on' },
      { name: 'grabbable' },
      { name: 'unknown_thing' },
    ]);
    expect(result.metadata.length).toBe(1);
    expect(result.controls.length).toBe(1);
    expect(result.hooks.length).toBe(1);
    expect(result.traits.length).toBe(1);
    expect(result.errors.length).toBe(1);
  });

  it('validate returns errors for unknown directives only', () => {
    const errors = processor.validate([
      { name: 'version' },
      { name: 'bad_directive' },
      { name: 'grabbable' },
    ]);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('bad_directive');
  });

  it('all metadata directive names are recognized', () => {
    const names = ['version', 'author', 'description', 'tags', 'license', 'deprecated'];
    for (const name of names) {
      const d = processor.processOne({ name });
      expect(d.category).toBe('metadata');
    }
  });

  it('all hook directive names are recognized', () => {
    const names = ['on', 'emit', 'once', 'watch', 'computed', 'effect'];
    for (const name of names) {
      const d = processor.processOne({ name });
      expect(d.category).toBe('hook');
    }
  });
});
