/**
 * Unit tests for visualizer-server — AUDIT-mode coverage
 *
 * Slice 7 helpers. Null-guards are critical: when the visualizer
 * isn't started, calls must no-op rather than throw.
 *
 * **See**: packages/core/src/runtime/visualizer-server.ts (slice 7)
 */

import { describe, it, expect, vi } from 'vitest';
import { broadcast, handleTimeControl } from './visualizer-server';
import { WebSocket } from 'ws';

// ──────────────────────────────────────────────────────────────────
// broadcast
// ──────────────────────────────────────────────────────────────────

describe('broadcast — null-guarded', () => {
  it('no-ops on null wss', () => {
    expect(() => broadcast(null, 'type', { a: 1 })).not.toThrow();
  });

  it('no-ops on undefined wss', () => {
    expect(() => broadcast(undefined, 'type', { a: 1 })).not.toThrow();
  });
});

describe('broadcast — send semantics', () => {
  function makeClient(readyState: number) {
    return { readyState, send: vi.fn() };
  }

  function makeWss(clients: ReturnType<typeof makeClient>[]) {
    return {
      clients: {
        forEach: (fn: (c: ReturnType<typeof makeClient>) => void) => clients.forEach(fn),
      },
    } as never;
  }

  it('sends JSON-stringified {type, payload} to open clients', () => {
    const c = makeClient(WebSocket.OPEN);
    broadcast(makeWss([c]), 'test_event', { foo: 'bar' });
    expect(c.send).toHaveBeenCalledTimes(1);
    expect(c.send).toHaveBeenCalledWith(JSON.stringify({ type: 'test_event', payload: { foo: 'bar' } }));
  });

  it('skips clients whose readyState is not OPEN', () => {
    const open = makeClient(WebSocket.OPEN);
    const connecting = makeClient(WebSocket.CONNECTING);
    const closing = makeClient(WebSocket.CLOSING);
    const closed = makeClient(WebSocket.CLOSED);

    broadcast(makeWss([open, connecting, closing, closed]), 't', {});

    expect(open.send).toHaveBeenCalledTimes(1);
    expect(connecting.send).not.toHaveBeenCalled();
    expect(closing.send).not.toHaveBeenCalled();
    expect(closed.send).not.toHaveBeenCalled();
  });

  it('handles empty client list', () => {
    expect(() => broadcast(makeWss([]), 't', {})).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────
// handleTimeControl
// ──────────────────────────────────────────────────────────────────

describe('handleTimeControl — null-guarded', () => {
  it('no-ops on null timeManager', () => {
    expect(() => handleTimeControl(null, 'play')).not.toThrow();
  });

  it('no-ops on undefined timeManager', () => {
    expect(() => handleTimeControl(undefined, 'pause')).not.toThrow();
  });
});

describe('handleTimeControl — command dispatch', () => {
  function makeTM() {
    return {
      play: vi.fn(),
      pause: vi.fn(),
      togglePause: vi.fn(),
      setTimeScale: vi.fn(),
      setDate: vi.fn(),
    } as never;
  }

  it('play', () => {
    const tm = makeTM();
    handleTimeControl(tm, 'play');
    expect(tm.play).toHaveBeenCalledTimes(1);
  });

  it('pause', () => {
    const tm = makeTM();
    handleTimeControl(tm, 'pause');
    expect(tm.pause).toHaveBeenCalledTimes(1);
  });

  it('toggle', () => {
    const tm = makeTM();
    handleTimeControl(tm, 'toggle');
    expect(tm.togglePause).toHaveBeenCalledTimes(1);
  });

  it('setSpeed — passes numeric value', () => {
    const tm = makeTM();
    handleTimeControl(tm, 'setSpeed', 2.5);
    expect(tm.setTimeScale).toHaveBeenCalledWith(2.5);
  });

  it('setSpeed — ignores non-numeric value', () => {
    const tm = makeTM();
    handleTimeControl(tm, 'setSpeed', 'fast');
    expect(tm.setTimeScale).not.toHaveBeenCalled();
  });

  it('setDate — string → Date', () => {
    const tm = makeTM();
    handleTimeControl(tm, 'setDate', '2025-01-01');
    expect(tm.setDate).toHaveBeenCalledTimes(1);
    expect(tm.setDate.mock.calls[0][0]).toBeInstanceOf(Date);
  });

  it('setDate — number (epoch ms) → Date', () => {
    const tm = makeTM();
    handleTimeControl(tm, 'setDate', 1704067200000);
    expect(tm.setDate).toHaveBeenCalledTimes(1);
    expect(tm.setDate.mock.calls[0][0]).toBeInstanceOf(Date);
  });

  it('setDate — no value → no-op', () => {
    const tm = makeTM();
    handleTimeControl(tm, 'setDate');
    expect(tm.setDate).not.toHaveBeenCalled();
  });

  it('syncRealTime — setDate(now) + setTimeScale(1) + play()', () => {
    const tm = makeTM();
    handleTimeControl(tm, 'syncRealTime');
    expect(tm.setDate).toHaveBeenCalledTimes(1);
    expect(tm.setDate.mock.calls[0][0]).toBeInstanceOf(Date);
    expect(tm.setTimeScale).toHaveBeenCalledWith(1);
    expect(tm.play).toHaveBeenCalledTimes(1);
  });

  it('unknown command — silently ignored', () => {
    const tm = makeTM();
    handleTimeControl(tm, 'hackthegibson');
    expect(tm.play).not.toHaveBeenCalled();
    expect(tm.pause).not.toHaveBeenCalled();
    expect(tm.togglePause).not.toHaveBeenCalled();
    expect(tm.setTimeScale).not.toHaveBeenCalled();
    expect(tm.setDate).not.toHaveBeenCalled();
  });
});
