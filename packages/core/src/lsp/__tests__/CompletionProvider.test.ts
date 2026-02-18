import { describe, it, expect, beforeEach } from 'vitest';
import { CompletionProvider } from '../CompletionProvider';

describe('CompletionProvider', () => {
  let provider: CompletionProvider;

  beforeEach(() => {
    provider = new CompletionProvider();
  });

  it('returns node types when prefix is empty', () => {
    const items = provider.getCompletions({ prefix: '' });
    const labels = items.map(i => i.label);
    expect(labels).toContain('box');
    expect(labels).toContain('sphere');
    expect(labels).toContain('panel');
  });

  it('returns traits and directives on @ trigger', () => {
    const items = provider.getCompletions({ prefix: '', triggerChar: '@' });
    const kinds = new Set(items.map(i => i.kind));
    expect(kinds.has('trait')).toBe(true);
    expect(kinds.has('directive')).toBe(true);
  });

  it('filters traits by prefix after @', () => {
    const items = provider.getCompletions({ prefix: '@grab' });
    expect(items.some(i => i.label === 'grabbable')).toBe(true);
    expect(items.every(i => i.label.startsWith('grab') || i.kind !== 'trait')).toBe(true);
  });

  it('returns property completions for colon context', () => {
    const items = provider.getCompletions({ prefix: 'pos:' });
    expect(items.some(i => i.kind === 'property')).toBe(true);
  });

  it('returns property completions for dot context', () => {
    const items = provider.getCompletions({ prefix: 'mat.col' });
    const props = items.filter(i => i.kind === 'property');
    expect(props.some(i => i.label === 'color')).toBe(true);
  });

  it('general search returns all matching items', () => {
    const items = provider.getCompletions({ prefix: 'box' });
    expect(items.some(i => i.label === 'box')).toBe(true);
  });

  it('registerTrait adds custom completion', () => {
    const before = provider.totalCompletions;
    provider.registerTrait({ label: 'myCustomTrait', kind: 'trait', detail: 'Custom' });
    expect(provider.totalCompletions).toBe(before + 1);
  });

  it('custom traits appear in @ completions', () => {
    provider.registerTrait({ label: 'custom', kind: 'trait', detail: 'Custom' });
    const items = provider.getCompletions({ prefix: '@cus' });
    expect(items.some(i => i.label === 'custom')).toBe(true);
  });

  it('totalCompletions counts all categories', () => {
    expect(provider.totalCompletions).toBeGreaterThan(20); // traits + directives + types + properties
  });
});
