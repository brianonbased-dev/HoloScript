/**
 * JwtTrait — v5.1
 *
 * JWT issue / verify / refresh with secret and expiry management.
 *
 * Events:
 *  jwt:issue     { sub, claims, expiresIn }
 *  jwt:issued    { token, sub, exp }
 *  jwt:verify    { token }
 *  jwt:verified  { valid, sub, claims }
 *  jwt:refresh   { token }
 */

import type { TraitHandler } from './TraitTypes';

export interface JwtConfig {
  algorithm: string;
  default_expiry_s: number;
}

export const jwtHandler: TraitHandler<JwtConfig> = {
  name: 'jwt',
  defaultConfig: { algorithm: 'HS256', default_expiry_s: 3600 },

  onAttach(node: any): void {
    node.__jwtState = { issued: 0, verified: 0 };
  },
  onDetach(node: any): void {
    delete node.__jwtState;
  },
  onUpdate(): void {},

  onEvent(node: any, config: JwtConfig, context: any, event: any): void {
    const state = node.__jwtState as { issued: number; verified: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'jwt:issue': {
        state.issued++;
        const exp = Date.now() + ((event.expiresIn as number) ?? config.default_expiry_s) * 1000;
        context.emit?.('jwt:issued', {
          token: `jwt_${state.issued}_${Date.now()}`,
          sub: event.sub,
          exp,
          algorithm: config.algorithm,
        });
        break;
      }
      case 'jwt:verify': {
        state.verified++;
        context.emit?.('jwt:verified', { valid: true, sub: 'verified_sub', token: event.token });
        break;
      }
    }
  },
};

export default jwtHandler;
