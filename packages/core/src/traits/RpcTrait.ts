/**
 * RpcTrait — v5.1
 * Remote procedure call handler.
 */
import type { TraitHandler } from './TraitTypes';
export interface RpcConfig { timeout_ms: number; }
export const rpcHandler: TraitHandler<RpcConfig> = {
  name: 'rpc', defaultConfig: { timeout_ms: 5000 },
  onAttach(node: any): void { node.__rpcState = { methods: new Map<string, number>() }; },
  onDetach(node: any): void { delete node.__rpcState; },
  onUpdate(): void {},
  onEvent(node: any, _config: RpcConfig, context: any, event: any): void {
    const state = node.__rpcState as { methods: Map<string, number> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'rpc:register': state.methods.set(event.method as string, 0); context.emit?.('rpc:registered', { method: event.method }); break;
      case 'rpc:call': {
        const count = (state.methods.get(event.method as string) ?? 0) + 1;
        state.methods.set(event.method as string, count);
        context.emit?.('rpc:response', { method: event.method, callCount: count });
        break;
      }
    }
  },
};
export default rpcHandler;
