/**
 * SyncTrait.ts
 *
 * Declarative network synchronization for HoloScript+ nodes.
 * Tracks which properties should be synced across the network.
 */

import type { TraitHandler } from '../traits/TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import { NetworkManager } from './NetworkManager';

export interface SyncTraitConfig {
  /** Properties to sync (e.g., ['position', 'rotation', 'scale']) */
  syncProperties: string[];
  /** Sync rate in Hz */
  syncRate: number;
  /** Interpolate received updates */
  interpolate: boolean;
  /** Authority: 'owner' | 'server' | 'shared' */
  authority: string;
  /** Owner peer ID */
  ownerId?: string;
}

const syncTimers = new Map<string, number>();
let sharedNetworkManager: NetworkManager | null = null;

export function setSharedNetworkManager(nm: NetworkManager): void {
  sharedNetworkManager = nm;
}

export const syncTraitHandler: TraitHandler<SyncTraitConfig> = {
  name: 'sync' as any,
  defaultConfig: {
    syncProperties: ['position', 'rotation'],
    syncRate: 20,
    interpolate: true,
    authority: 'owner',
  },

  onAttach(node: HSPlusNode, _config: SyncTraitConfig, _context: any) {
    syncTimers.set(node.id!, 0);
  },

  onDetach(node: HSPlusNode, _config: SyncTraitConfig, _context: any) {
    syncTimers.delete(node.id!);
  },

  onUpdate(node: HSPlusNode, config: SyncTraitConfig, _context: any, delta: number) {
    if (!sharedNetworkManager || !sharedNetworkManager.isConnected()) return;

    const nodeId = node.id!;
    let timer = syncTimers.get(nodeId) || 0;
    timer += delta;

    const interval = 1 / config.syncRate;
    if (timer >= interval) {
      timer -= interval;

      // Gather sync data
      const syncData: Record<string, any> = { nodeId };
      for (const prop of config.syncProperties) {
        if (node.properties && (node.properties as any)[prop] !== undefined) {
          syncData[prop] = (node.properties as any)[prop];
        }
      }

      sharedNetworkManager.broadcast('state_sync', syncData);
    }

    syncTimers.set(nodeId, timer);
  },
};
