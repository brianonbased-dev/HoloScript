/**
 * SnapshotTestTrait — v5.1
 * Snapshot comparison testing.
 */
import type { TraitHandler } from './TraitTypes';

export interface SnapshotTestConfig {
  update_on_mismatch: boolean;
}

export const snapshotTestHandler: TraitHandler<SnapshotTestConfig> = {
  name: 'snapshot_test',
  defaultConfig: { update_on_mismatch: false },
  onAttach(node: any): void {
    node.__snapState = { snapshots: new Map<string, string>() };
  },
  onDetach(node: any): void {
    delete node.__snapState;
  },
  onUpdate(): void {},
  onEvent(node: any, config: SnapshotTestConfig, context: any, event: any): void {
    const state = node.__snapState as { snapshots: Map<string, string> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'snapshot:capture':
        state.snapshots.set(event.name as string, JSON.stringify(event.value));
        context.emit?.('snapshot:captured', { name: event.name });
        break;
      case 'snapshot:compare': {
        const stored = state.snapshots.get(event.name as string);
        const curr = JSON.stringify(event.value);
        const match = stored === curr;
        if (!match && config.update_on_mismatch) state.snapshots.set(event.name as string, curr);
        context.emit?.('snapshot:result', {
          name: event.name,
          match,
          updated: !match && config.update_on_mismatch,
        });
        break;
      }
    }
  },
};
export default snapshotTestHandler;
