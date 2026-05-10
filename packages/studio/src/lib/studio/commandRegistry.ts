'use client';

import {
  getStudioView,
  STUDIO_VIEW_REGISTRY,
  type StudioViewCommandId,
  type StudioViewId,
} from './viewRegistry';
import {
  usePanelVisibilityStore,
  type PanelVisibilityState,
} from '../stores/panelVisibilityStore';

export type StudioCommandCategory = 'view';

export interface StudioCommandDefinition {
  id: StudioViewCommandId;
  title: string;
  category: StudioCommandCategory;
  viewId: StudioViewId;
}

export const STUDIO_COMMAND_REGISTRY: StudioCommandDefinition[] = STUDIO_VIEW_REGISTRY.map(
  (view) => ({
    id: view.activationCommand,
    title: `Toggle ${view.title}`,
    category: 'view',
    viewId: view.id,
  })
);

export const STUDIO_COMMAND_REGISTRY_BY_ID = Object.fromEntries(
  STUDIO_COMMAND_REGISTRY.map((command) => [command.id, command])
) as Record<StudioViewCommandId, StudioCommandDefinition>;

function capitalize<T extends string>(value: T): Capitalize<T> {
  return (value.charAt(0).toUpperCase() + value.slice(1)) as Capitalize<T>;
}

function toggleFieldName(viewId: StudioViewId): keyof PanelVisibilityState {
  return `toggle${capitalize(viewId)}Open` as keyof PanelVisibilityState;
}

export function getStudioCommand(id: StudioViewCommandId): StudioCommandDefinition {
  return STUDIO_COMMAND_REGISTRY_BY_ID[id];
}

export function runStudioCommand(
  id: StudioViewCommandId,
  state: PanelVisibilityState = usePanelVisibilityStore.getState()
): boolean {
  const command = getStudioCommand(id);
  if (!command) return false;

  const view = getStudioView(command.viewId);
  if (view.exclusiveWith.length > 0) {
    state.toggleExclusive(view.id, view.exclusiveWith);
    return true;
  }

  const toggle = state[toggleFieldName(view.id)];
  if (typeof toggle !== 'function') return false;
  toggle();
  return true;
}
