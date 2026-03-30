/**
 * ConsentManagementTrait — v5.1
 * Consent collection and tracking.
 */
import type { TraitHandler } from './TraitTypes';
export interface ConsentManagementConfig {
  required_consents: string[];
}
export const consentManagementHandler: TraitHandler<ConsentManagementConfig> = {
  name: 'consent_management',
  defaultConfig: { required_consents: ['analytics', 'marketing'] },
  onAttach(node: any): void {
    node.__consentState = { consents: new Map<string, Map<string, boolean>>() };
  },
  onDetach(node: any): void {
    delete node.__consentState;
  },
  onUpdate(): void {},
  onEvent(node: any, _config: ConsentManagementConfig, context: any, event: any): void {
    const state = node.__consentState as
      | { consents: Map<string, Map<string, boolean>> }
      | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'consent:grant': {
        const userId = event.userId as string;
        if (!state.consents.has(userId)) state.consents.set(userId, new Map());
        state.consents.get(userId)!.set(event.purpose as string, true);
        context.emit?.('consent:granted', { userId, purpose: event.purpose });
        break;
      }
      case 'consent:revoke': {
        state.consents.get(event.userId as string)?.set(event.purpose as string, false);
        context.emit?.('consent:revoked', { userId: event.userId, purpose: event.purpose });
        break;
      }
      case 'consent:check': {
        const granted =
          state.consents.get(event.userId as string)?.get(event.purpose as string) ?? false;
        context.emit?.('consent:status', { userId: event.userId, purpose: event.purpose, granted });
        break;
      }
    }
  },
};
export default consentManagementHandler;
