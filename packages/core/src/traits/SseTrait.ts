/**
 * SseTrait — v5.1
 *
 * Server-Sent Events endpoint with client tracking.
 *
 * Events:
 *  sse:broadcast   { event, data }
 *  sse:connect     { clientId }
 *  sse:disconnect  { clientId }
 *  sse:sent        { event, clientCount }
 *  sse:status      { clients, totalBroadcasts }
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface SseConfig {
  max_clients: number;
  keepalive_ms: number;
}

export const sseHandler: TraitHandler<SseConfig> = {
  name: 'sse',
  defaultConfig: { max_clients: 1000, keepalive_ms: 30000 },

  onAttach(node: HSPlusNode): void {
    node.__sseState = { clients: new Set<string>(), totalBroadcasts: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__sseState;
  },
  onUpdate(): void {},

  onEvent(node: HSPlusNode, config: SseConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__sseState as { clients: Set<string>; totalBroadcasts: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'sse:connect':
        if (state.clients.size < config.max_clients) {
          state.clients.add(event.clientId as string);
        }
        break;
      case 'sse:disconnect':
        state.clients.delete(event.clientId as string);
        break;
      case 'sse:broadcast':
        state.totalBroadcasts++;
        context.emit?.('sse:sent', { event: event.event, clientCount: state.clients.size });
        break;
      case 'sse:get_status':
        context.emit?.('sse:status', {
          clients: state.clients.size,
          totalBroadcasts: state.totalBroadcasts,
        });
        break;
    }
  },
};

export default sseHandler;
