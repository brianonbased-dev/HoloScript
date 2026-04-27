/**
 * TranslationTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { translationHandler } from '../TranslationTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __i18nState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { fallback_locale: 'en' };

describe('TranslationTrait', () => {
  it('has name "translation"', () => {
    expect(translationHandler.name).toBe('translation');
  });

  it('i18n:load emits i18n:loaded', () => {
    const node = makeNode();
    translationHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    translationHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'i18n:load', locale: 'en', messages: { hello: 'Hello' },
    } as never);
    expect(node.emit).toHaveBeenCalledWith('i18n:loaded', { locale: 'en', keys: 1 });
  });

  it('i18n:translate emits i18n:translated with resolved text', () => {
    const node = makeNode();
    translationHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    translationHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'i18n:load', locale: 'en', messages: { greet: 'Hi' },
    } as never);
    node.emit.mockClear();
    translationHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'i18n:translate', locale: 'en', key: 'greet',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('i18n:translated', { key: 'greet', locale: 'en', text: 'Hi' });
  });
});
