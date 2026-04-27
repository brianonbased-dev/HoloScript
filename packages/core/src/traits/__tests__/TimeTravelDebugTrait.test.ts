/**
 * TimeTravelDebugTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { timeTravelDebugHandler } from '../TimeTravelDebugTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __ttdState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_snapshots: 100 };

describe('TimeTravelDebugTrait', () => {
  it('has name "time_travel_debug"', () => {
    expect(timeTravelDebugHandler.name).toBe('time_travel_debug');
  });

  it('ttd:snapshot emits ttd:captured', () => {
    const node = makeNode();
    timeTravelDebugHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    timeTravelDebugHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'ttd:snapshot', frame: 1, data: { x: 1 },
    } as never);
    expect(node.emit).toHaveBeenCalledWith('ttd:captured', { frame: 0, total: 1 });
  });
});
