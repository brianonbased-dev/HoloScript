/**
 * WatcherTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { watcherHandler } from '../WatcherTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __watcherState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = {
  watch_type: 'event' as const, patterns: [], debounce_ms: 200, recursive: false, auto_start: false,
};

describe('WatcherTrait', () => {
  it('has name "watcher"', () => {
    expect(watcherHandler.name).toBe('watcher');
  });

  it('onAttach sets inactive state when auto_start is false', () => {
    const node = makeNode();
    watcherHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect((node.__watcherState as { active: boolean }).active).toBe(false);
  });
});
