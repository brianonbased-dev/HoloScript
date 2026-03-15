/**
 * RestEndpointTrait — v5.1
 * REST API endpoint definition.
 */
import type { TraitHandler } from './TraitTypes';
export interface RestEndpointConfig { base_path: string; }
export const restEndpointHandler: TraitHandler<RestEndpointConfig> = {
  name: 'rest_endpoint', defaultConfig: { base_path: '/api' },
  onAttach(node: any): void { node.__restState = { routes: new Map<string, string>(), requests: 0 }; },
  onDetach(node: any): void { delete node.__restState; },
  onUpdate(): void {},
  onEvent(node: any, _config: RestEndpointConfig, context: any, event: any): void {
    const state = node.__restState as { routes: Map<string, string>; requests: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'rest:register': state.routes.set(`${event.method as string} ${event.path as string}`, (event.handler as string) ?? ''); context.emit?.('rest:registered', { method: event.method, path: event.path, total: state.routes.size }); break;
      case 'rest:request': state.requests++; context.emit?.('rest:response', { method: event.method, path: event.path, status: 200, requestCount: state.requests }); break;
    }
  },
};
export default restEndpointHandler;
