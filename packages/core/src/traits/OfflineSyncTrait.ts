/**
 * OfflineSyncTrait — v5.1
 * Offline-first data synchronization.
 */
import type { TraitHandler } from './TraitTypes';
export interface OfflineSyncConfig { sync_interval_ms: number; }
export const offlineSyncHandler: TraitHandler<OfflineSyncConfig> = {
  name: 'offline_sync' as any, defaultConfig: { sync_interval_ms: 5000 },
  onAttach(node: any): void { node.__syncState = { pending: [] as any[], synced: 0, online: true }; },
  onDetach(node: any): void { delete node.__syncState; },
  onUpdate(): void {},
  onEvent(node: any, _config: OfflineSyncConfig, context: any, event: any): void {
    const state = node.__syncState as { pending: any[]; synced: number; online: boolean } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'sync:queue': state.pending.push(event.payload); context.emit?.('sync:queued', { pending: state.pending.length }); break;
      case 'sync:flush': state.synced += state.pending.length; const count = state.pending.length; state.pending = []; context.emit?.('sync:flushed', { synced: count, totalSynced: state.synced }); break;
      case 'sync:status': state.online = (event.online as boolean) ?? true; context.emit?.('sync:status_changed', { online: state.online, pending: state.pending.length }); break;
    }
  },
};
export default offlineSyncHandler;
