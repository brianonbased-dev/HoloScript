/**
 * OauthTrait — v5.1
 *
 * OAuth 2.0 authorization code / token flow.
 *
 * Events:
 *  oauth:authorize   { provider, scopes, redirectUri }
 *  oauth:callback    { code, state }
 *  oauth:token       { accessToken, refreshToken, expiresIn }
 *  oauth:revoke      { token }
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface OauthConfig {
  providers: string[];
}

export const oauthHandler: TraitHandler<OauthConfig> = {
  name: 'oauth',
  defaultConfig: { providers: ['google', 'github'] },

  onAttach(node: HSPlusNode): void {
    node.__oauthState = { tokens: new Map<string, { provider: string; expiresAt: number }>() };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__oauthState;
  },
  onUpdate(): void {},

  onEvent(node: HSPlusNode, _config: OauthConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__oauthState as { tokens: Map<string, any> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'oauth:authorize':
        context.emit?.('oauth:redirect', {
          provider: event.provider,
          url: `https://${event.provider}/authorize`,
        });
        break;
      case 'oauth:callback': {
        const token = `at_${Date.now()}`;
        state.tokens.set(token, { provider: 'oauth', expiresAt: Date.now() + 3600000 });
        context.emit?.('oauth:token', {
          accessToken: token,
          refreshToken: `rt_${Date.now()}`,
          expiresIn: 3600,
        });
        break;
      }
      case 'oauth:revoke':
        state.tokens.delete(event.token as string);
        context.emit?.('oauth:revoked', { token: event.token });
        break;
    }
  },
};

export default oauthHandler;
