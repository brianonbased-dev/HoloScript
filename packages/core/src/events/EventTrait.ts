/**
 * EventTrait.ts
 *
 * Declarative event wiring for HoloScript+ nodes.
 * Nodes can emit and listen to events through the global EventBus.
 */

import type { TraitHandler } from '../traits/TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import { getSharedEventBus } from './EventBus';

export interface EventTraitConfig {
  /** Events this node listens to: { eventName: handlerPropertyName } */
  listen?: Record<string, string>;
  /** Events emitted on lifecycle */
  emitOnAttach?: string;
  emitOnDetach?: string;
}

const nodeListenerIds = new Map<string, number[]>();

export const eventTraitHandler: TraitHandler<EventTraitConfig> = {
  name: 'events',
  defaultConfig: {},

  onAttach(node: HSPlusNode, config: EventTraitConfig, _context: any) {
    const bus = getSharedEventBus();
    const nodeId = node.id!;
    const ids: number[] = [];

    if (config.listen) {
      for (const [event, propName] of Object.entries(config.listen)) {
        const id = bus.on(event, (data) => {
          if (node.properties) {
            (node.properties as Record<string, any>)[propName] = data;
          }
        });
        ids.push(id);
      }
    }

    nodeListenerIds.set(nodeId, ids);

    if (config.emitOnAttach) {
      bus.emit(config.emitOnAttach, { nodeId, type: 'attach' });
    }
  },

  onDetach(node: HSPlusNode, config: EventTraitConfig, _context: any) {
    const bus = getSharedEventBus();
    const nodeId = node.id!;

    const ids = nodeListenerIds.get(nodeId) || [];
    for (const id of ids) bus.off(id);
    nodeListenerIds.delete(nodeId);

    if (config.emitOnDetach) {
      bus.emit(config.emitOnDetach, { nodeId, type: 'detach' });
    }
  },

  onUpdate(_node: HSPlusNode, _config: EventTraitConfig, _context: any, _delta: number) {
    // Event-driven; no per-frame work needed
  },
};
