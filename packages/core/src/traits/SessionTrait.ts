/**
 * SessionTrait — v5.1
 *
 * Session create / destroy / refresh with TTL.
 */

import type { TraitHandler } from './TraitTypes';

export interface SessionConfig { ttl_ms: number; max_sessions: number; }

export const sessionHandler: TraitHandler<SessionConfig> = {
  name: 'session',
  defaultConfig: { ttl_ms: 86400000, max_sessions: 1000 },

  onAttach(node: any): void { node.__sessionState = { sessions: new Map<string, { userId: string; expiresAt: number }>() }; },
  onDetach(node: any): void { delete node.__sessionState; },
  onUpdate(): void {},

  onEvent(node: any, config: SessionConfig, context: any, event: any): void {
    const state = node.__sessionState as { sessions: Map<string, any> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'session:create': {
        if (state.sessions.size >= config.max_sessions) break;
        const sid = `sess_${Date.now()}`;
        state.sessions.set(sid, { userId: event.userId, expiresAt: Date.now() + config.ttl_ms });
        context.emit?.('session:created', { sessionId: sid, userId: event.userId });
        break;
      }
      case 'session:validate': {
        const s = state.sessions.get(event.sessionId as string);
        const valid = s && Date.now() < s.expiresAt;
        context.emit?.('session:validated', { sessionId: event.sessionId, valid: !!valid });
        break;
      }
      case 'session:destroy':
        state.sessions.delete(event.sessionId as string);
        context.emit?.('session:destroyed', { sessionId: event.sessionId });
        break;
    }
  },
};

export default sessionHandler;
