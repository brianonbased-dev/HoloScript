import { describe, expect, it, vi } from 'vitest';
import { languageAdapterHandler } from '../LanguageAdapterTrait';
import type { HSPlusNode, TraitContext } from '../TraitTypes';

function fakeContext() {
  return {
    emit: vi.fn(),
    getState: () => ({}),
    setState: vi.fn(),
    getScaleMultiplier: () => 1,
    setScaleContext: vi.fn(),
  } as unknown as TraitContext;
}

describe('languageAdapterHandler', () => {
  it('records language adapter config and emits readiness', () => {
    const node = { type: 'Object', name: 'ruby-adapter' } as HSPlusNode;
    const context = fakeContext();
    const config = {
      language: 'ruby',
      grammarPackage: 'tree-sitter-ruby',
      extensions: ['.rb'],
      symbols: [{ nodeType: 'class', kind: 'class', nameField: 'name' }],
    };

    languageAdapterHandler.onAttach!(node, config, context);

    expect((node as Record<string, unknown>).__languageAdapterTrait).toMatchObject({
      config,
    });
    expect(context.emit).toHaveBeenCalledWith('language_adapter:ready', {
      language: 'ruby',
      extensions: ['.rb'],
      grammarPackage: 'tree-sitter-ruby',
    });
  });

  it('clears stored language adapter state on detach', () => {
    const node = {
      type: 'Object',
      __languageAdapterTrait: { config: {}, registeredAt: Date.now() },
    } as unknown as HSPlusNode;
    const context = fakeContext();

    languageAdapterHandler.onDetach!(node, languageAdapterHandler.defaultConfig!, context);

    expect((node as Record<string, unknown>).__languageAdapterTrait).toBeUndefined();
  });
});
