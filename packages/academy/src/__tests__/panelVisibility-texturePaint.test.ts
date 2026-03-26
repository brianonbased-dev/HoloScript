// @vitest-environment jsdom
/**
 * Tests for panelVisibilityStore — texturePaint panel key (Sprint 13 P2)
 */

import { describe, it, expect, beforeEach } from 'vitest';

const { usePanelVisibilityStore } = await import('@/lib/stores');

describe('panelVisibilityStore — texturePaint', () => {
  beforeEach(() => {
    usePanelVisibilityStore.getState().closeAll();
  });

  it('texturePaintOpen defaults to false', () => {
    expect(usePanelVisibilityStore.getState().texturePaintOpen).toBe(false);
  });

  it('setTexturePaintOpen(true) opens it', () => {
    usePanelVisibilityStore.getState().setTexturePaintOpen(true);
    expect(usePanelVisibilityStore.getState().texturePaintOpen).toBe(true);
  });

  it('toggleTexturePaintOpen flips state', () => {
    usePanelVisibilityStore.getState().toggleTexturePaintOpen();
    expect(usePanelVisibilityStore.getState().texturePaintOpen).toBe(true);
    usePanelVisibilityStore.getState().toggleTexturePaintOpen();
    expect(usePanelVisibilityStore.getState().texturePaintOpen).toBe(false);
  });

  it('closeAll closes texturePaint', () => {
    usePanelVisibilityStore.getState().setTexturePaintOpen(true);
    usePanelVisibilityStore.getState().closeAll();
    expect(usePanelVisibilityStore.getState().texturePaintOpen).toBe(false);
  });

  it('openExclusive opens only the target panel', () => {
    usePanelVisibilityStore.getState().setTexturePaintOpen(true);
    usePanelVisibilityStore.getState().openExclusive('chat');
    expect(usePanelVisibilityStore.getState().texturePaintOpen).toBe(false);
    expect(usePanelVisibilityStore.getState().chatOpen).toBe(true);
  });
});
