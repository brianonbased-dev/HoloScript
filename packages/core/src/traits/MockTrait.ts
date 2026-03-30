/**
 * MockTrait — v5.1
 * Mock object/function creation for testing.
 */
import type { TraitHandler } from './TraitTypes';

export interface MockConfig {
  strict: boolean;
}

export const mockHandler: TraitHandler<MockConfig> = {
  name: 'mock',
  defaultConfig: { strict: true },
  onAttach(node: any): void {
    node.__mockState = { mocks: new Map<string, { calls: number; returnValue: unknown }>() };
  },
  onDetach(node: any): void {
    delete node.__mockState;
  },
  onUpdate(): void {},
  onEvent(node: any, _config: MockConfig, context: any, event: any): void {
    const state = node.__mockState as { mocks: Map<string, any> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'mock:create':
        state.mocks.set(event.name as string, { calls: 0, returnValue: event.returns ?? null });
        context.emit?.('mock:created', { name: event.name });
        break;
      case 'mock:call': {
        const m = state.mocks.get(event.name as string);
        if (m) {
          m.calls++;
          context.emit?.('mock:called', {
            name: event.name,
            calls: m.calls,
            returnValue: m.returnValue,
          });
        }
        break;
      }
      case 'mock:verify': {
        const m = state.mocks.get(event.name as string);
        context.emit?.('mock:verified', {
          name: event.name,
          calls: m?.calls ?? 0,
          expected: event.expected ?? 1,
          pass: (m?.calls ?? 0) === (event.expected ?? 1),
        });
        break;
      }
    }
  },
};
export default mockHandler;
