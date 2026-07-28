'use client';

import { useMemo, type ComponentType } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePanelVisibilityStore } from '@/lib/stores';
import {
  STUDIO_VIEW_IDS,
  STUDIO_VIEW_REGISTRY_BY_ID,
  type StudioViewId,
} from '@/lib/studio/viewRegistry';
import { VIEW_COMPONENTS } from '@/lib/studio/viewRegistry.components';
import type { RightRailPanelDescriptor } from '@/components/panels/RightRailPanelHost';

type ViewKey = keyof typeof VIEW_COMPONENTS;

/**
 * VIEW_COMPONENTS panels that mount in the right rail, where VIEW_COMPONENTS
 * points to the same component already used by the warehouse.
 * Excludes: non-right-rail panels (timeline/shaderEditor → bottom-panel,
 * cloudDeploy/mcpConfig/pluginManager → top-overlay), and panels where
 * VIEW_COMPONENTS points to an auto-generated native stub rather than the
 * hand-crafted panel (agentMonitor → native/agentMonitor.native ≠ ai/AgentMonitorPanel).
 */
const RAIL_KEYS: ViewKey[] = [
  'history',
  'aiMaterial',
  'share',
  'repl',
  'registry',
  'export',
  'multiplayer',
  'snapshots',
  'assetLib',
  'templateGallery',
  'audio',
  'exportV2',
  'keyframes',
  'particles',
  'lod',
  'parametricSliders',
  'printabilityReport',
  'simParams',
  'simRunReport',
  'gameParams',
  'gameGateLedger',
  'avatarParams',
  'avatarRigLedger',
  'plugins',
  'sandboxedPlugins',
];

const RAIL_WIDTHS: Partial<Record<ViewKey, 'resizable' | number>> = {
  plugins: 320,
  sandboxedPlugins: 320,
  printabilityReport: 288,
  simRunReport: 288,
  gameGateLedger: 288,
  avatarRigLedger: 288,
};

const RAIL_CLASSNAMES: Partial<Record<ViewKey, string>> = {};

/** Extra props for VIEW_COMPONENTS panels that need more than onClose. */
export type RegistryPanelExtraProps = Partial<Record<ViewKey, Record<string, unknown>>>;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Wires the compile-view-registry.ts → VIEW_COMPONENTS pipeline into the live
 * RightRailPanelHost. For each right-rail panel registered via `@slot` in its
 * .holo file, this hook derives the descriptor automatically (open state from
 * panelVisibilityStore, component from VIEW_COMPONENTS, title from the view
 * registry). Accepts `extraProps` for panels that need props beyond onClose,
 * and merges with a `manual` list for panels not yet in VIEW_COMPONENTS.
 * The combined output is sorted by STUDIO_VIEW_IDS registry order so visual
 * stacking matches the declared panel sequence.
 */
export function useRightRailDescriptors(
  extraProps: RegistryPanelExtraProps = {},
  manual: RightRailPanelDescriptor[] = []
): RightRailPanelDescriptor[] {
  const openStates = usePanelVisibilityStore(
    useShallow((s) => {
      const store = s as unknown as Record<string, boolean>;
      return Object.fromEntries(RAIL_KEYS.map((id) => [id, store[`${id}Open`] ?? false])) as Record<
        ViewKey,
        boolean
      >;
    })
  );

  return useMemo(() => {
    const registry: RightRailPanelDescriptor[] = RAIL_KEYS.map((id) => {
      const Component = VIEW_COMPONENTS[id] as ComponentType<
        { onClose?: () => void } & Record<string, unknown>
      >;
      const onClose = () => {
        const store = usePanelVisibilityStore.getState() as unknown as Record<
          string,
          (v: boolean) => void
        >;
        store[`set${capitalize(id)}Open`]?.(false);
      };
      const title = STUDIO_VIEW_REGISTRY_BY_ID[id as StudioViewId]?.title;

      return {
        id,
        open: openStates[id] ?? false,
        width: RAIL_WIDTHS[id] ?? 'resizable',
        errorLabel: title,
        containerClassName: RAIL_CLASSNAMES[id],
        content: <Component onClose={onClose} {...(extraProps[id] ?? {})} />,
      } satisfies RightRailPanelDescriptor;
    });

    const all = [...registry, ...manual];

    return all.sort((a, b) => {
      const ai = STUDIO_VIEW_IDS.indexOf(a.id as StudioViewId);
      const bi = STUDIO_VIEW_IDS.indexOf(b.id as StudioViewId);
      return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi);
    });
  }, [openStates, extraProps, manual]);
}
