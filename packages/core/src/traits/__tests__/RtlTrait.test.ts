/**
 * RtlTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { rtlHandler } from '../RtlTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __rtlState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { rtl_locales: ['ar', 'he', 'fa', 'ur'] };

describe('RtlTrait', () => {
  it('has name "rtl"', () => {
    expect(rtlHandler.name).toBe('rtl');
  });

  it('rtl:check emits rtl:result with rtl=true for Arabic', () => {
    const node = makeNode();
    rtlHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    rtlHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'rtl:check', locale: 'ar-SA',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('rtl:result', { locale: 'ar-SA', rtl: true });
  });
});
