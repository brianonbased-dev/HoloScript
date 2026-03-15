/**
 * SnapshotTrait — v5.1
 *
 * State snapshot capture and restore for compositions.
 *
 * Events:
 *  snapshot:capture   { snapshotId, scope }
 *  snapshot:restore   { snapshotId }
 *  snapshot:captured  { snapshotId, size, timestamp }
 *  snapshot:restored  { snapshotId }
 *  snapshot:list      (command)
 *  snapshot:info      { snapshots[] }
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

export interface SnapshotConfig {
  max_snapshots: number;
  auto_capture_interval_ms: number;
}

export interface SnapshotEntry {
  id: string;
  data: Record<string, unknown>;
  timestamp: number;
  scope: string;
}

export const snapshotHandler: TraitHandler<SnapshotConfig> = {
  name: 'snapshot',
  defaultConfig: { max_snapshots: 20, auto_capture_interval_ms: 0 },

  onAttach(node: any): void {
    node.__snapshotState = { snapshots: new Map<string, SnapshotEntry>(), lastCapture: 0 };
  },
  onDetach(node: any): void { delete node.__snapshotState; },
  onUpdate(): void {},

  onEvent(node: any, config: SnapshotConfig, context: any, event: any): void {
    const state = node.__snapshotState as { snapshots: Map<string, SnapshotEntry>; lastCapture: number } | undefined;
    if (!state) return;
    const eventType = typeof event === 'string' ? event : event.type;

    switch (eventType) {
      case 'snapshot:capture': {
        const id = (event.snapshotId as string) ?? `snap_${Date.now()}`;
        if (state.snapshots.size >= config.max_snapshots) {
          const oldest = state.snapshots.keys().next().value as string;
          state.snapshots.delete(oldest);
        }
        const entry: SnapshotEntry = {
          id,
          data: event.data ?? {},
          timestamp: Date.now(),
          scope: (event.scope as string) ?? 'full',
        };
        state.snapshots.set(id, entry);
        context.emit?.('snapshot:captured', { snapshotId: id, size: JSON.stringify(entry.data).length, timestamp: entry.timestamp });
        break;
      }
      case 'snapshot:restore': {
        const id = event.snapshotId as string;
        const snap = state.snapshots.get(id);
        if (snap) {
          context.emit?.('snapshot:restored', { snapshotId: id, data: snap.data });
        } else {
          context.emit?.('snapshot:error', { error: `Snapshot ${id} not found` });
        }
        break;
      }
      case 'snapshot:list': {
        const list = [...state.snapshots.values()].map(s => ({ id: s.id, timestamp: s.timestamp, scope: s.scope }));
        context.emit?.('snapshot:info', { snapshots: list, count: list.length });
        break;
      }
    }
  },
};

export default snapshotHandler;
