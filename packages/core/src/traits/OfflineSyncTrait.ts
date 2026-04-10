/**
 * OfflineSyncTrait — v5.1
 * Offline-first data synchronization.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface OfflineSyncConfig {
  sync_interval_ms: number;
}
export interface SyncItem {
  type: string;
  payload?: unknown;
  timestamp?: number;
}
export const offlineSyncHandler: TraitHandler<OfflineSyncConfig> = {
  name: 'offline_sync',
  defaultConfig: { sync_interval_ms: 5000 },
  onAttach(node: HSPlusNode): void {
    node.__syncState = { pending: [] as SyncItem[], synced: 0, online: true };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__syncState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    _config: OfflineSyncConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__syncState as
      | { pending: SyncItem[]; synced: number; online: boolean }
      | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'sync:queue':
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        state.pending.push(event.payload as SyncItem);
        context.emit?.('sync:queued', { pending: state.pending.length });
        break;
      case 'sync:flush':
        state.synced += state.pending.length;
        const count = state.pending.length;
        state.pending = [];
        context.emit?.('sync:flushed', { synced: count, totalSynced: state.synced });
        break;
      case 'sync:status':
        state.online = (event.online as boolean) ?? true;
        context.emit?.('sync:status_changed', {
          online: state.online,
          pending: state.pending.length,
        });
        break;
    }
  },
};
export default offlineSyncHandler;
