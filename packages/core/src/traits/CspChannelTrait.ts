/**
 * CspChannelTrait — v5.1
 * CSP channel communication.
 */
import type { TraitHandler } from './TraitTypes';
export interface CspChannelConfig { buffer_size: number; }
export const cspChannelHandler: TraitHandler<CspChannelConfig> = {
  name: 'csp_channel' as any, defaultConfig: { buffer_size: 10 },
  onAttach(node: any): void { node.__cspState = { channels: new Map<string, any[]>() }; },
  onDetach(node: any): void { delete node.__cspState; },
  onUpdate(): void {},
  onEvent(node: any, config: CspChannelConfig, context: any, event: any): void {
    const state = node.__cspState as { channels: Map<string, any[]> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'csp:create': state.channels.set(event.channelId as string, []); context.emit?.('csp:created', { channelId: event.channelId }); break;
      case 'csp:send': { const ch = state.channels.get(event.channelId as string); if (ch && ch.length < config.buffer_size) { ch.push(event.value); context.emit?.('csp:sent', { channelId: event.channelId, bufferUsed: ch.length }); } break; }
      case 'csp:recv': { const ch = state.channels.get(event.channelId as string); const val = ch?.shift(); context.emit?.('csp:received', { channelId: event.channelId, value: val, hasValue: val !== undefined }); break; }
    }
  },
};
export default cspChannelHandler;
