import { describe, expect, it, beforeEach } from 'vitest';

import {
  STUDIO_COMMAND_REGISTRY,
  runStudioCommand,
} from '../commandRegistry';
import {
  DEFAULT_OPEN_STUDIO_VIEW_IDS,
  STUDIO_VIEW_IDS,
  STUDIO_VIEW_REGISTRY,
} from '../viewRegistry';
import { PANEL_KEYS, usePanelVisibilityStore } from '../../stores/panelVisibilityStore';

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

describe('studio view registry', () => {
  beforeEach(() => {
    usePanelVisibilityStore.getState().closeAll();
  });

  it('is the source of truth for panel visibility keys', () => {
    expect(PANEL_KEYS).toEqual(STUDIO_VIEW_IDS);
    expect(new Set(STUDIO_VIEW_IDS).size).toBe(STUDIO_VIEW_IDS.length);
    expect(new Set(STUDIO_VIEW_REGISTRY.map((view) => view.id)).size).toBe(
      STUDIO_VIEW_REGISTRY.length
    );
  });

  it('provides state fields and actions for every registered view', () => {
    const state = usePanelVisibilityStore.getState() as unknown as Record<string, unknown>;

    for (const id of STUDIO_VIEW_IDS) {
      const suffix = `${capitalize(id)}Open`;
      expect(typeof state[`${id}Open`]).toBe('boolean');
      expect(typeof state[`set${suffix}`]).toBe('function');
      expect(typeof state[`toggle${suffix}`]).toBe('function');
    }
  });

  it('generates one toggle command per registered view', () => {
    expect(STUDIO_COMMAND_REGISTRY).toHaveLength(STUDIO_VIEW_IDS.length);
    expect(new Set(STUDIO_COMMAND_REGISTRY.map((command) => command.id)).size).toBe(
      STUDIO_COMMAND_REGISTRY.length
    );
  });

  it('declares command-facing metadata for every registered view', () => {
    for (const view of STUDIO_VIEW_REGISTRY) {
      expect(view.title).toBeTruthy();
      expect(view.icon).toBeTruthy();
      expect(view.activationCommand).toBe(`studio.view.${view.id}.toggle`);
      expect(view.availabilityGate).toBeTruthy();
      expect(view.workspaceScope).toBeTruthy();
      expect(view.defaultPlacement).toBeTruthy();
    }
  });

  it('runs view commands through the visibility store', () => {
    expect(usePanelVisibilityStore.getState().chatOpen).toBe(false);

    expect(runStudioCommand('studio.view.chat.toggle')).toBe(true);
    expect(usePanelVisibilityStore.getState().chatOpen).toBe(true);
  });

  it('honors registered exclusivity rules', () => {
    const store = usePanelVisibilityStore.getState();
    store.setShaderEditorOpen(true);

    expect(runStudioCommand('studio.view.timeline.toggle')).toBe(true);

    const next = usePanelVisibilityStore.getState();
    expect(next.timelineOpen).toBe(true);
    expect(next.shaderEditorOpen).toBe(false);
  });

  it('keeps default-open panels declared in registry metadata', () => {
    usePanelVisibilityStore.setState(
      Object.fromEntries(STUDIO_VIEW_IDS.map((id) => [`${id}Open`, false]))
    );

    for (const id of DEFAULT_OPEN_STUDIO_VIEW_IDS) {
      expect(STUDIO_VIEW_REGISTRY.find((view) => view.id === id)?.defaultOpen).toBe(true);
    }
  });
});
