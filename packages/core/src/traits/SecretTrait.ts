/**
 * SecretTrait — v5.1
 *
 * Secrets vault access with rotation tracking.
 *
 * Events:
 *  secret:store      { secretId, value, expiresAt }
 *  secret:retrieve   { secretId }
 *  secret:result     { secretId, value, expiresAt }
 *  secret:rotate     { secretId, newValue }
 *  secret:rotated    { secretId }
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface SecretConfig {
  max_secrets: number;
  auto_expire: boolean;
}

export const secretHandler: TraitHandler<SecretConfig> = {
  name: 'secret',
  defaultConfig: { max_secrets: 100, auto_expire: true },

  onAttach(node: HSPlusNode): void {
    node.__secretState = {
      vault: new Map<string, { value: string; expiresAt: number; version: number }>(),
    };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__secretState;
  },
  onUpdate(): void {},

  onEvent(node: HSPlusNode, config: SecretConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__secretState as
      | { vault: Map<string, { value: string; expiresAt: number; version: number }> }
      | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'secret:store': {
        if (state.vault.size >= config.max_secrets && !state.vault.has(event.secretId as string))
          break;
        state.vault.set(event.secretId as string, {
          value: event.value as string,
          expiresAt: (event.expiresAt as number) ?? 0,
          version: 1,
        });
        break;
      }
      case 'secret:retrieve': {
        const s = state.vault.get(event.secretId as string);
        if (s && config.auto_expire && s.expiresAt > 0 && Date.now() > s.expiresAt) {
          state.vault.delete(event.secretId as string);
          context.emit?.('secret:result', { secretId: event.secretId, value: null, expired: true });
        } else if (s) {
          context.emit?.('secret:result', {
            secretId: event.secretId,
            value: s.value,
            version: s.version,
          });
        } else {
          context.emit?.('secret:result', { secretId: event.secretId, value: null, found: false });
        }
        break;
      }
      case 'secret:rotate': {
        const s = state.vault.get(event.secretId as string);
        if (s) {
          s.value = event.newValue as string;
          s.version++;
          context.emit?.('secret:rotated', { secretId: event.secretId, version: s.version });
        }
        break;
      }
    }
  },
};

export default secretHandler;
