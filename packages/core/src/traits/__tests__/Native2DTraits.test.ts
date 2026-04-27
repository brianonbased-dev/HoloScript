/**
 * Native2DTraits — tests
 */
import { describe, it, expect, vi } from 'vitest';
import {
  native2DPanelHandler,
  native2DLayoutHandler,
  native2DTextHandler,
  native2DButtonHandler,
  NATIVE_2D_TRAIT_HANDLERS,
} from '../Native2DTraits';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn() });

describe('Native2DTraits', () => {
  it('panel handler has name "panel"', () => {
    expect(native2DPanelHandler.name).toBe('panel');
  });

  it('layout handler defaultConfig flex="column"', () => {
    expect(native2DLayoutHandler.defaultConfig?.flex).toBe('column');
  });

  it('text handler defaultConfig variant="body"', () => {
    expect(native2DTextHandler.defaultConfig?.variant).toBe('body');
  });

  it('button handler defaultConfig variant="primary"', () => {
    expect(native2DButtonHandler.defaultConfig?.variant).toBe('primary');
  });

  it('panel onAttach sets __isNative2D=true', () => {
    const node = makeNode() as Record<string, unknown>;
    native2DPanelHandler.onAttach!(node as never, { tag: 'div' }, {} as never);
    expect(node.__isNative2D).toBe(true);
  });

  it('NATIVE_2D_TRAIT_HANDLERS exports all handlers', () => {
    expect(NATIVE_2D_TRAIT_HANDLERS.length).toBeGreaterThan(0);
  });
});
