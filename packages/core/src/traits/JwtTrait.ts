/**
 * JwtTrait — v5.1
 *
 * JWT issue / verify / refresh with secret and expiry management using jose.
 *
 * Events:
 *  jwt:issue     { sub, claims, expiresIn }
 *  jwt:issued    { token, sub, exp }
 *  jwt:verify    { token }
 *  jwt:verified  { valid, sub, claims, error? }
 *  jwt:refresh   { token }
 */

import type { TraitHandler } from './TraitTypes';
import { SignJWT, jwtVerify } from 'jose';

export interface JwtConfig {
  algorithm: string;
  default_expiry_s: number;
  secret?: string;
}

export const jwtHandler: TraitHandler<JwtConfig> = {
  name: 'jwt',
  defaultConfig: { algorithm: 'HS256', default_expiry_s: 3600, secret: 'default-insecure-secret' },

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
    const secretKey = new TextEncoder().encode(config.secret || 'default-insecure-secret');

    switch (t) {
      case 'jwt:issue': {
        state.issued++;
        const exp = Math.floor(Date.now() / 1000) + ((event.expiresIn as number) ?? config.default_expiry_s);
        
        new SignJWT(event.claims || {})
          .setProtectedHeader({ alg: config.algorithm })
          .setSubject(event.sub || 'anonymous')
          .setExpirationTime(exp)
          .sign(secretKey)
          .then((token) => {
            if (context && context.emit) {
              context.emit('jwt:issued', {
                token,
                sub: event.sub,
                exp: exp * 1000,
                algorithm: config.algorithm,
              });
            }
          })
          .catch((err) => {
            console.error('[jwt:issue] failed', err);
          });
        break;
      }
      case 'jwt:verify': {
        state.verified++;
        jwtVerify(event.token, secretKey)
          .then((result) => {
            if (context && context.emit) {
              context.emit('jwt:verified', { 
                valid: true, 
                sub: result.payload.sub, 
                token: event.token,
                claims: result.payload
              });
            }
          })
          .catch((err) => {
            if (context && context.emit) {
              context.emit('jwt:verified', { 
                valid: false, 
                error: err.message, 
                token: event.token 
              });
            }
          });
        break;
      }
    }
  },
};

export default jwtHandler;
