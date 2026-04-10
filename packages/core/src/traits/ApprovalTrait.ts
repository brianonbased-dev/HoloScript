/**
 * ApprovalTrait — v5.1
 * Human-in-the-loop approval gate.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface ApprovalConfig {
  timeout_ms: number;
}

export const approvalHandler: TraitHandler<ApprovalConfig> = {
  name: 'approval',
  defaultConfig: { timeout_ms: 86400000 },
  onAttach(node: HSPlusNode): void {
    node.__approvalState = { requests: new Map<string, { status: string; requestedAt: number }>() };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__approvalState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    _config: ApprovalConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__approvalState as { requests: Map<string, any> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'approval:request':
        state.requests.set(event.requestId as string, {
          status: 'pending',
          requestedAt: Date.now(),
        });
        context.emit?.('approval:requested', { requestId: event.requestId });
        break;
      case 'approval:approve': {
        const r = state.requests.get(event.requestId as string);
        if (r) r.status = 'approved';
        context.emit?.('approval:approved', { requestId: event.requestId });
        break;
      }
      case 'approval:reject': {
        const r = state.requests.get(event.requestId as string);
        if (r) r.status = 'rejected';
        context.emit?.('approval:rejected', { requestId: event.requestId, reason: event.reason });
        break;
      }
    }
  },
};
export default approvalHandler;
