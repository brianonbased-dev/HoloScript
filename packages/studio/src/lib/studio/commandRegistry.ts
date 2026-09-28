'use client';

import {
  getStudioView,
  STUDIO_VIEW_IDS,
  STUDIO_VIEW_REGISTRY,
  type StudioViewCommandId,
  type StudioViewId,
} from './viewRegistry';
import { usePanelVisibilityStore, type PanelVisibilityState } from '../stores/panelVisibilityStore';

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

  const toggle = state[toggleFieldName(view.id)] as (() => void) | undefined;
  if (typeof toggle !== 'function') return false;
  toggle();
  return true;
}

/**
 * The panels a person sees on arriving at /create from a link.
 *
 * The Studio opens viewer-first, with Brittney's chat dock closed. A link can
 * name one view to open with `?view=<id>`; the home page's "Chat with Brittney"
 * is `/create?view=chat`. Opening is idempotent: a view that is already open
 * stays open, where a toggle would have closed it.
 *
 * Until 2026-09-28 the page toggled the named view and then closed the chat
 * dock, so `?view=chat` always arrived with Brittney closed.
 *
 * Returns whether the named view is open afterwards (false when none was named
 * or the name is not a Studio view).
 */
export function openArrivalView(viewParam: string | null): boolean {
  usePanelVisibilityStore.getState().setChatOpen(false);
  if (!viewParam || !STUDIO_VIEW_IDS.includes(viewParam as StudioViewId)) return false;

  const view = getStudioView(viewParam as StudioViewId);
  const openField = `${view.id}Open` as keyof PanelVisibilityState;
  if (usePanelVisibilityStore.getState()[openField] !== true) {
    runStudioCommand(view.activationCommand);
  }
  return usePanelVisibilityStore.getState()[openField] === true;
}
