/**
 * GdprTrait — v5.1
 * GDPR data subject rights management.
 */
import type { TraitHandler } from './TraitTypes';
export interface GdprConfig { retention_days: number; }
export const gdprHandler: TraitHandler<GdprConfig> = {
  name: 'gdpr' as any, defaultConfig: { retention_days: 365 },
  onAttach(node: any): void { node.__gdprState = { requests: new Map<string, { type: string; status: string }>() }; },
  onDetach(node: any): void { delete node.__gdprState; },
  onUpdate(): void {},
  onEvent(node: any, _config: GdprConfig, context: any, event: any): void {
    const state = node.__gdprState as { requests: Map<string, any> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'gdpr:access': state.requests.set(event.requestId as string, { type: 'access', status: 'pending' }); context.emit?.('gdpr:access_requested', { requestId: event.requestId, subjectId: event.subjectId }); break;
      case 'gdpr:delete': state.requests.set(event.requestId as string, { type: 'erasure', status: 'pending' }); context.emit?.('gdpr:erasure_requested', { requestId: event.requestId, subjectId: event.subjectId }); break;
      case 'gdpr:export': state.requests.set(event.requestId as string, { type: 'portability', status: 'pending' }); context.emit?.('gdpr:export_requested', { requestId: event.requestId }); break;
    }
  },
};
export default gdprHandler;
