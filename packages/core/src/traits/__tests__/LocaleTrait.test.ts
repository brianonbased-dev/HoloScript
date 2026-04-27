/**
 * LocaleTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { localeHandler } from '../LocaleTrait';

const makeNode = () => ({
  id: 'n1', traits: new Set<string>(), emit: vi.fn(),
  __localeState: undefined as unknown,
});
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = { default_locale: 'en-US', supported: ['en-US', 'es', 'fr', 'de', 'ja', 'zh'] };

describe('LocaleTrait', () => {
  it('has name "locale"', () => {
    expect(localeHandler.name).toBe('locale');
  });

  it('defaultConfig default_locale="en-US"', () => {
    expect(localeHandler.defaultConfig?.default_locale).toBe('en-US');
  });

  it('onAttach sets current to default_locale', () => {
    const node = makeNode();
    localeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect((node.__localeState as { current: string }).current).toBe('en-US');
  });

  it('locale:set changes locale and emits locale:changed', () => {
    const node = makeNode();
    localeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    localeHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'locale:set', locale: 'fr',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('locale:changed', { from: 'en-US', to: 'fr' });
    expect((node.__localeState as { current: string }).current).toBe('fr');
  });

  it('locale:set emits locale:unsupported for unknown locale', () => {
    const node = makeNode();
    localeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    localeHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'locale:set', locale: 'klingon',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('locale:unsupported', expect.objectContaining({ locale: 'klingon' }));
  });

  it('locale:get emits locale:current', () => {
    const node = makeNode();
    localeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    localeHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'locale:get',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('locale:current', { locale: 'en-US' });
  });
});
