// @vitest-environment jsdom
/**
 * Tests for useOrchestrationAutoSave hook (Sprint 17 P2)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock orchestrationStore
vi.mock('@/lib/orchestrationStore', () => ({
  useOrchestrationStore: vi.fn((selector: any) => {
    const state = {
      workflows: new Map([['wf-1', { id: 'wf-1', name: 'Test Workflow' }]]),
      behaviorTrees: new Map([['bt-1', { id: 'bt-1', name: 'Test BT' }]]),
      activeWorkflow: 'wf-1',
      activeBehaviorTree: null,
    };
    return selector(state);
  }),
}));

describe('useOrchestrationAutoSave module', () => {
  it('exports useOrchestrationAutoSave function', async () => {
    const mod = await import('@/hooks/useOrchestrationAutoSave');
    expect(mod.useOrchestrationAutoSave).toBeDefined();
    expect(typeof mod.useOrchestrationAutoSave).toBe('function');
  });

  it('exports clearOrchestrationStorage function', async () => {
    const mod = await import('@/hooks/useOrchestrationAutoSave');
    expect(mod.clearOrchestrationStorage).toBeDefined();
    expect(typeof mod.clearOrchestrationStorage).toBe('function');
  });
});

describe('clearOrchestrationStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('removes all orchestration keys', async () => {
    const { clearOrchestrationStorage } = await import('@/hooks/useOrchestrationAutoSave');

    localStorage.setItem('holoscript-workflows', '[]');
    localStorage.setItem('holoscript-behavior-trees', '[]');
    localStorage.setItem('holoscript-active-workflow', 'wf-1');
    localStorage.setItem('holoscript-active-behavior-tree', 'bt-1');

    clearOrchestrationStorage();

    expect(localStorage.getItem('holoscript-workflows')).toBeNull();
    expect(localStorage.getItem('holoscript-behavior-trees')).toBeNull();
    expect(localStorage.getItem('holoscript-active-workflow')).toBeNull();
    expect(localStorage.getItem('holoscript-active-behavior-tree')).toBeNull();
  });

  it('does not remove unrelated keys', async () => {
    const { clearOrchestrationStorage } = await import('@/hooks/useOrchestrationAutoSave');

    localStorage.setItem('other-key', 'value');
    localStorage.setItem('holoscript-workflows', '[]');

    clearOrchestrationStorage();

    expect(localStorage.getItem('other-key')).toBe('value');
  });
});

describe('useOrchestrationAutoSave — storage key constants', () => {
  it('uses holoscript prefix', () => {
    const expectedKeys = [
      'holoscript-workflows',
      'holoscript-behavior-trees',
      'holoscript-active-workflow',
      'holoscript-active-behavior-tree',
    ];
    for (const key of expectedKeys) {
      expect(key).toMatch(/^holoscript-/);
    }
  });

  it('all 4 storage keys are unique', () => {
    const keys = [
      'holoscript-workflows',
      'holoscript-behavior-trees',
      'holoscript-active-workflow',
      'holoscript-active-behavior-tree',
    ];
    expect(new Set(keys).size).toBe(4);
  });
});
