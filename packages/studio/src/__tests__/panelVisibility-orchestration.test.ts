// @vitest-environment jsdom
/**
 * Tests for panelVisibilityStore orchestration keys (Sprint 15 P5)
 */

import { describe, it, expect, beforeEach } from 'vitest';

const { usePanelVisibilityStore } = await import('@/lib/stores/panelVisibilityStore');

const orchestrationKeys = [
  'mcpConfig',
  'agentWorkflow',
  'behaviorTree',
  'agentEnsemble',
  'eventMonitor',
  'toolCallGraph',
  'marketplace',
  'pluginManager',
  'cloudDeploy',
  'publish',
  'examples',
  'tutorial',
  'hotkeyOverlay',
  'prompts',
] as const;

function reset() {
  usePanelVisibilityStore.getState().closeAll();
}

describe('panelVisibilityStore — orchestration keys', () => {
  beforeEach(reset);

  it('all orchestration keys default to false', () => {
    const state = usePanelVisibilityStore.getState();
    for (const key of orchestrationKeys) {
      expect((state as any)[`${key}Open`]).toBe(false);
    }
  });

  it('each key has a working toggle', () => {
    for (const key of orchestrationKeys) {
      const toggleName = `toggle${key.charAt(0).toUpperCase() + key.slice(1)}Open`;
      const fieldName = `${key}Open`;
      (usePanelVisibilityStore.getState() as any)[toggleName]();
      expect((usePanelVisibilityStore.getState() as any)[fieldName]).toBe(true);
      (usePanelVisibilityStore.getState() as any)[toggleName]();
      expect((usePanelVisibilityStore.getState() as any)[fieldName]).toBe(false);
    }
  });

  it('each key has a working setter', () => {
    for (const key of orchestrationKeys) {
      const setterName = `set${key.charAt(0).toUpperCase() + key.slice(1)}Open`;
      const fieldName = `${key}Open`;
      (usePanelVisibilityStore.getState() as any)[setterName](true);
      expect((usePanelVisibilityStore.getState() as any)[fieldName]).toBe(true);
      (usePanelVisibilityStore.getState() as any)[setterName](false);
      expect((usePanelVisibilityStore.getState() as any)[fieldName]).toBe(false);
    }
  });

  it('closeAll resets all orchestration keys', () => {
    // Open a few
    for (const key of orchestrationKeys.slice(0, 5)) {
      (usePanelVisibilityStore.getState() as any)[`set${key.charAt(0).toUpperCase() + key.slice(1)}Open`](true);
    }
    usePanelVisibilityStore.getState().closeAll();
    const state = usePanelVisibilityStore.getState();
    for (const key of orchestrationKeys) {
      expect((state as any)[`${key}Open`]).toBe(false);
    }
  });

  it('openExclusive opens only the target panel', () => {
    usePanelVisibilityStore.getState().openExclusive('mcpConfig');
    const state = usePanelVisibilityStore.getState();
    expect(state.mcpConfigOpen).toBe(true);
    expect(state.agentWorkflowOpen).toBe(false);
    expect(state.behaviorTreeOpen).toBe(false);
  });
});
