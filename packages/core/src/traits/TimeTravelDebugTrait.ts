/**
 * TimeTravelDebugTrait — v5.1
 * Time-travel debugging with state snapshots.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface TimeTravelDebugConfig { max_snapshots: number; }
export const timeTravelDebugHandler: TraitHandler<TimeTravelDebugConfig> = {
  name: 'time_travel_debug' as any, defaultConfig: { max_snapshots: 100 },
  onAttach(node: HSPlusNode): void { node.__ttdState = { snapshots: [] as Array<{ frame: number; data: unknown }>, cursor: -1 }; },
  onDetach(node: HSPlusNode): void { delete node.__ttdState; },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: TimeTravelDebugConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__ttdState as { snapshots: Array<{ frame: number; data: unknown }>; cursor: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'ttd:snapshot': state.snapshots.push({ frame: (event.frame as number) ?? state.snapshots.length, data: event.data }); if (state.snapshots.length > config.max_snapshots) state.snapshots.shift(); state.cursor = state.snapshots.length - 1; context.emit?.('ttd:captured', { frame: state.cursor, total: state.snapshots.length }); break;
      case 'ttd:rewind': state.cursor = Math.max(0, state.cursor - 1); context.emit?.('ttd:rewound', { cursor: state.cursor, data: state.snapshots[state.cursor]?.data }); break;
      case 'ttd:forward': state.cursor = Math.min(state.snapshots.length - 1, state.cursor + 1); context.emit?.('ttd:forwarded', { cursor: state.cursor, data: state.snapshots[state.cursor]?.data }); break;
    }
  },
};
export default timeTravelDebugHandler;
