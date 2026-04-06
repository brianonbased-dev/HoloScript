import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerAIAdapter,
  getAIAdapter,
  getDefaultAIAdapter,
  setDefaultAIAdapter,
  listAIAdapters,
  unregisterAIAdapter,
  generateHoloScript,
  explainHoloScript,
  type AIAdapter,
} from '@holoscript/framework/ai';

function mockAdapter(id: string, name = id): AIAdapter {
  return {
    id,
    name,
    isReady: () => true,
  };
}

// The registry uses module-level state, so we need to clean up
function clearRegistry() {
  for (const a of listAIAdapters()) {
    unregisterAIAdapter(a.id);
  }
}

describe('AIAdapter Registry', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('registerAIAdapter stores adapter', () => {
    registerAIAdapter(mockAdapter('test'));
    expect(getAIAdapter('test')).toBeDefined();
  });

  it('first registered becomes default', () => {
    registerAIAdapter(mockAdapter('a'));
    expect(getDefaultAIAdapter()?.id).toBe('a');
  });

  it('setAsDefault overrides default', () => {
    registerAIAdapter(mockAdapter('a'));
    registerAIAdapter(mockAdapter('b'), true);
    expect(getDefaultAIAdapter()?.id).toBe('b');
  });

  it('getAIAdapter returns undefined for missing', () => {
    expect(getAIAdapter('nope')).toBeUndefined();
  });

  it('setDefaultAIAdapter by id', () => {
    registerAIAdapter(mockAdapter('a'));
    registerAIAdapter(mockAdapter('b'));
    expect(setDefaultAIAdapter('a')).toBe(true);
    expect(getDefaultAIAdapter()?.id).toBe('a');
  });

  it('setDefaultAIAdapter returns false for missing', () => {
    expect(setDefaultAIAdapter('nope')).toBe(false);
  });

  it('listAIAdapters returns all', () => {
    registerAIAdapter(mockAdapter('a', 'Alpha'));
    registerAIAdapter(mockAdapter('b', 'Beta'));
    const list = listAIAdapters();
    expect(list).toHaveLength(2);
    expect(list.map((l) => l.id)).toContain('a');
  });

  it('unregisterAIAdapter removes adapter', () => {
    registerAIAdapter(mockAdapter('a'));
    expect(unregisterAIAdapter('a')).toBe(true);
    expect(getAIAdapter('a')).toBeUndefined();
  });

  it('unregisterAIAdapter returns false for missing', () => {
    expect(unregisterAIAdapter('nope')).toBe(false);
  });

  it('unregister default promotes next', () => {
    registerAIAdapter(mockAdapter('a'));
    registerAIAdapter(mockAdapter('b'));
    unregisterAIAdapter('a');
    expect(getDefaultAIAdapter()?.id).toBe('b');
  });

  it('unregister all sets default to null', () => {
    registerAIAdapter(mockAdapter('a'));
    unregisterAIAdapter('a');
    expect(getDefaultAIAdapter()).toBeNull();
  });

  // --- Convenience functions ---
  it('generateHoloScript throws without adapter', async () => {
    await expect(generateHoloScript('test')).rejects.toThrow('No AI adapter registered');
  });

  it('generateHoloScript throws if adapter lacks method', async () => {
    registerAIAdapter(mockAdapter('a'));
    await expect(generateHoloScript('test')).rejects.toThrow('does not support');
  });

  it('explainHoloScript throws without adapter', async () => {
    await expect(explainHoloScript('code')).rejects.toThrow('No AI adapter registered');
  });
});
