/**
 * MfaTrait — v5.1
 *
 * Multi-factor authentication (TOTP / SMS / WebAuthn).
 */

import type { TraitHandler } from './TraitTypes';

export interface MfaConfig {
  methods: string[];
}

export const mfaHandler: TraitHandler<MfaConfig> = {
  name: 'mfa',
  defaultConfig: { methods: ['totp', 'sms'] },

  onAttach(node: any): void {
    node.__mfaState = { enrolled: new Map<string, { method: string; verified: boolean }>() };
  },
  onDetach(node: any): void {
    delete node.__mfaState;
  },
  onUpdate(): void {},

  onEvent(node: any, _config: MfaConfig, context: any, event: any): void {
    const state = node.__mfaState as { enrolled: Map<string, any> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'mfa:enroll':
        state.enrolled.set(event.userId as string, {
          method: event.method ?? 'totp',
          verified: false,
        });
        context.emit?.('mfa:enrolled', { userId: event.userId, method: event.method ?? 'totp' });
        break;
      case 'mfa:verify': {
        const entry = state.enrolled.get(event.userId as string);
        if (entry) {
          entry.verified = true;
        }
        context.emit?.('mfa:verified', { userId: event.userId, valid: !!entry });
        break;
      }
    }
  },
};

export default mfaHandler;
