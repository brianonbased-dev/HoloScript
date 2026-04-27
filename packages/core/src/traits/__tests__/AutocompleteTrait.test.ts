/**
 * AutocompleteTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { autocompleteHandler } from '../AutocompleteTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __acState: undefined as unknown,
});

const defaultConfig = { max_suggestions: 10, min_chars: 2 };

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('AutocompleteTrait — metadata', () => {
  it('has name "autocomplete"', () => {
    expect(autocompleteHandler.name).toBe('autocomplete');
  });

  it('defaultConfig values', () => {
    expect(autocompleteHandler.defaultConfig?.max_suggestions).toBe(10);
    expect(autocompleteHandler.defaultConfig?.min_chars).toBe(2);
  });
});

describe('AutocompleteTrait — lifecycle', () => {
  it('onAttach initializes empty terms array', () => {
    const node = makeNode();
    autocompleteHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__acState as { terms: string[] };
    expect(state.terms).toEqual([]);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    autocompleteHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    autocompleteHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__acState).toBeUndefined();
  });
});

describe('AutocompleteTrait — onEvent', () => {
  it('ac:add_term appends a term and emits ac:term_added', () => {
    const node = makeNode();
    autocompleteHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    autocompleteHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'ac:add_term', term: 'hello',
    } as never);
    const state = node.__acState as { terms: string[] };
    expect(state.terms).toContain('hello');
    expect(node.emit).toHaveBeenCalledWith('ac:term_added', { term: 'hello', total: 1 });
  });

  it('ac:suggest returns matching terms', () => {
    const node = makeNode();
    autocompleteHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    ['apple', 'application', 'apex', 'banana'].forEach((term) => {
      autocompleteHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
        type: 'ac:add_term', term,
      } as never);
    });
    node.emit.mockClear();
    autocompleteHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'ac:suggest', query: 'ap',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('ac:suggestions', expect.objectContaining({
      query: 'ap',
      suggestions: expect.arrayContaining(['apple', 'application', 'apex']),
    }));
  });

  it('ac:suggest returns empty for query shorter than min_chars', () => {
    const node = makeNode();
    autocompleteHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    autocompleteHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'ac:add_term', term: 'abc',
    } as never);
    node.emit.mockClear();
    autocompleteHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'ac:suggest', query: 'a',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('ac:suggestions', { suggestions: [] });
  });

  it('ac:suggest respects max_suggestions', () => {
    const node = makeNode();
    const cfg = { max_suggestions: 3, min_chars: 1 };
    autocompleteHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    ['aa', 'ab', 'ac', 'ad', 'ae'].forEach((term) => {
      autocompleteHandler.onEvent!(node as never, cfg, makeCtx(node) as never, {
        type: 'ac:add_term', term,
      } as never);
    });
    node.emit.mockClear();
    autocompleteHandler.onEvent!(node as never, cfg, makeCtx(node) as never, {
      type: 'ac:suggest', query: 'a',
    } as never);
    const call = node.emit.mock.calls.find((c) => c[0] === 'ac:suggestions');
    expect((call![1] as { suggestions: string[] }).suggestions).toHaveLength(3);
  });

  it('ac:suggest is case-insensitive', () => {
    const node = makeNode();
    autocompleteHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    autocompleteHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'ac:add_term', term: 'TypeScript',
    } as never);
    node.emit.mockClear();
    autocompleteHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'ac:suggest', query: 'ty',
    } as never);
    const call = node.emit.mock.calls.find((c) => c[0] === 'ac:suggestions');
    expect((call![1] as { suggestions: string[] }).suggestions).toContain('TypeScript');
  });
});
