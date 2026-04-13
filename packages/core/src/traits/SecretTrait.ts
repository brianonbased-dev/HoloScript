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
 *  secret:delete     { secretId }
 *  secret:deleted    { secretId }
 *  secret:list       {}
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
import { extractPayload } from './TraitTypes';

export interface SecretConfig {
  max_secrets: number;
  auto_expire: boolean;
}

interface SecretState {
  vault: Map<string, SecretBox>;
  lastCleanup: number;
}

interface SecretBox {
  value: string;
  expiresAt: number;
  version: number;
  deletionNonce?: string;
}

export const secretHandler: TraitHandler<SecretConfig> = {
  name: 'secret',
  defaultConfig: { max_secrets: 100, auto_expire: true },

  onAttach(node: HSPlusNode): void {
    const state: SecretState = {
      vault: new Map<string, SecretBox>(),
      lastCleanup: Date.now(),
    };
    (node as any).__secretState = state;
  },
  onDetach(node: HSPlusNode): void {
    delete (node as any).__secretState;
  },

  onUpdate(node: HSPlusNode, config: SecretConfig, context: TraitContext): void {
    const state = (node as any).__secretState as SecretState | undefined;
    if (!state || !config.auto_expire) return;

    const now = Date.now();
    if (now - state.lastCleanup > 60000) {
      state.lastCleanup = now;
      for (const [id, box] of state.vault.entries()) {
        if (box.expiresAt > 0 && now > box.expiresAt) {
          state.vault.delete(id);
          context.emit?.('secret:expired', { secretId: id });
        }
      }
    }
  },

  onEvent(node: HSPlusNode, config: SecretConfig, context: TraitContext, event: TraitEvent): void {
    const state = (node as any).__secretState as SecretState | undefined;
    if (!state) return;

    const payload = extractPayload(event);
    const type = event.type;

    switch (type) {
      case 'secret:store': {
        const id = payload.secretId as string;
        if (!id) return;
        if (state.vault.size >= config.max_secrets && !state.vault.has(id)) {
          context.emit?.('secret:error', { error: 'vault_full', secretId: id });
          break;
        }
        state.vault.set(id, {
          value: payload.value as string,
          expiresAt: (payload.expiresAt as number) ?? 0,
          version: 1,
          deletionNonce: payload.deletionNonce as string | undefined,
        });
        context.emit?.('secret:stored', { secretId: id });
        break;
      }
      case 'secret:retrieve': {
        const id = payload.secretId as string;
        const s = state.vault.get(id);
        if (s && config.auto_expire && s.expiresAt > 0 && Date.now() > s.expiresAt) {
          state.vault.delete(id);
          context.emit?.('secret:result', { secretId: id, value: null, expired: true });
        } else if (s) {
          context.emit?.('secret:result', {
            secretId: id,
            value: s.value,
            version: s.version,
          });
        } else {
          context.emit?.('secret:result', { secretId: id, value: null, found: false });
        }
        break;
      }
      case 'secret:rotate': {
        const id = payload.secretId as string;
        const s = state.vault.get(id);
        const newValue = payload.newValue as string;

        if (!s) {
          context.emit?.('secret:error', { error: 'not_found', secretId: id });
          break;
        }

        if (s.value === newValue) {
          context.emit?.('secret:error', { error: 'redundant_rotation', secretId: id });
          break;
        }

        s.value = newValue;
        s.version++;
        context.emit?.('secret:rotated', { secretId: id, version: s.version });
        break;
      }
      case 'secret:delete': {
        const id = payload.secretId as string;
        const box = state.vault.get(id);
        
        if (!box) {
          context.emit?.('secret:error', { error: 'not_found', secretId: id });
          break;
        }

        // Hardened deletion validation (Requires auth token/nonce or node owner)
        const isOwner = (node as any).owner && payload.caller === (node as any).owner;
        const validNonce = box.deletionNonce && box.deletionNonce === payload.deletionNonce;

        if (!validNonce && !isOwner) {
          context.emit?.('secret:error', { 
            error: 'unauthorized_deletion', 
            secretId: id,
            details: 'Requires valid deletionNonce or node owner authorization'
          });
          break;
        }

        state.vault.delete(id);
        context.emit?.('secret:deleted', { secretId: id });
        break;
      }
      case 'secret:list': {
        const list = Array.from(state.vault.entries()).map(([id, box]) => ({
          secretId: id,
          version: box.version,
          expiresAt: box.expiresAt,
          protected: !!box.deletionNonce,
        }));
        context.emit?.('secret:list_result', { secrets: list });
        break;
      }
    }
  },
};

export default secretHandler;
