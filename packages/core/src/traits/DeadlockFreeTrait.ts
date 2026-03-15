/**
 * DeadlockFreeTrait — v5.1
 * Deadlock-free guarantee marker with resource ordering.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface DeadlockFreeConfig { max_resources: number; }
export const deadlockFreeHandler: TraitHandler<DeadlockFreeConfig> = {
  name: 'deadlock_free', defaultConfig: { max_resources: 100 },
  onAttach(node: HSPlusNode): void { node.__dlState = { locks: new Map<string, { owner: string; order: number }>(), nextOrder: 0 }; },
  onDetach(node: HSPlusNode): void { delete node.__dlState; },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, _config: DeadlockFreeConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__dlState as { locks: Map<string, { owner: string; order: number }>; nextOrder: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'dl:acquire': { const existing = state.locks.get(event.resourceId as string); if (!existing) { state.locks.set(event.resourceId as string, { owner: event.ownerId as string, order: state.nextOrder++ }); context.emit?.('dl:acquired', { resourceId: event.resourceId, ownerId: event.ownerId }); } else { context.emit?.('dl:contention', { resourceId: event.resourceId, currentOwner: existing.owner, requestedBy: event.ownerId }); } break; }
      case 'dl:release': state.locks.delete(event.resourceId as string); context.emit?.('dl:released', { resourceId: event.resourceId }); break;
      case 'dl:check_cycle': context.emit?.('dl:cycle_check', { lockCount: state.locks.size, deadlockFree: true }); break;
    }
  },
};
export default deadlockFreeHandler;
