/**
 * ActorTrait — v5.1
 * Actor model message passing.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface ActorConfig { mailbox_size: number; }
export const actorHandler: TraitHandler<ActorConfig> = {
  name: 'actor', defaultConfig: { mailbox_size: 1000 },
  onAttach(node: HSPlusNode): void { node.__actorState = { mailbox: [] as unknown[], processed: 0 }; },
  onDetach(node: HSPlusNode): void { delete node.__actorState; },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: ActorConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__actorState as { mailbox: any[]; processed: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'actor:send': if (state.mailbox.length < config.mailbox_size) { state.mailbox.push(event.message); context.emit?.('actor:received', { from: event.from, queueSize: state.mailbox.length }); } else { context.emit?.('actor:overflow', { mailboxSize: config.mailbox_size }); } break;
      case 'actor:process': { const msg = state.mailbox.shift(); if (msg) { state.processed++; context.emit?.('actor:processed', { message: msg, processed: state.processed }); } break; }
    }
  },
};
export default actorHandler;
