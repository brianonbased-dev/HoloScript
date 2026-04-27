import { describe, it, expect, vi } from 'vitest';
import { broadcast, handleTimeControl } from '../visualizer-server.js';

// Minimal WebSocket mock with readyState
function makeClient(open: boolean) {
  return {
    readyState: open ? 1 : 3, // 1 = OPEN, 3 = CLOSED
    send: vi.fn(),
  };
}

// WebSocket.OPEN = 1 per the ws module spec
vi.mock('ws', () => {
  return {
    WebSocket: { OPEN: 1 },
    WebSocketServer: vi.fn(function (this: unknown) { return this; }),
  };
});

function makeWss(clients: ReturnType<typeof makeClient>[]) {
  return {
    clients: new Set(clients),
  } as unknown as import('ws').WebSocketServer;
}

function makeTimeManager() {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    togglePause: vi.fn(),
    setTimeScale: vi.fn(),
    setDate: vi.fn(),
  };
}

describe('broadcast', () => {
  it('no-ops when wss is null', () => {
    expect(() => broadcast(null, 'test', {})).not.toThrow();
  });

  it('no-ops when wss is undefined', () => {
    expect(() => broadcast(undefined, 'test', {})).not.toThrow();
  });

  it('sends JSON to OPEN clients', () => {
    const client = makeClient(true);
    const wss = makeWss([client]);
    broadcast(wss, 'myEvent', { x: 1 });
    expect(client.send).toHaveBeenCalledWith(JSON.stringify({ type: 'myEvent', payload: { x: 1 } }));
  });

  it('skips non-OPEN clients', () => {
    const closed = makeClient(false);
    const wss = makeWss([closed]);
    broadcast(wss, 'myEvent', {});
    expect(closed.send).not.toHaveBeenCalled();
  });

  it('sends to all OPEN clients and skips closed', () => {
    const open1 = makeClient(true);
    const closed1 = makeClient(false);
    const open2 = makeClient(true);
    const wss = makeWss([open1, closed1, open2]);
    broadcast(wss, 'ping', null);
    expect(open1.send).toHaveBeenCalledTimes(1);
    expect(open2.send).toHaveBeenCalledTimes(1);
    expect(closed1.send).not.toHaveBeenCalled();
  });
});

describe('handleTimeControl', () => {
  it('no-ops when timeManager is null', () => {
    expect(() => handleTimeControl(null, 'play')).not.toThrow();
  });

  it('no-ops when timeManager is undefined', () => {
    expect(() => handleTimeControl(undefined, 'pause')).not.toThrow();
  });

  it('calls play() on play command', () => {
    const tm = makeTimeManager();
    handleTimeControl(tm as never, 'play');
    expect(tm.play).toHaveBeenCalledTimes(1);
  });

  it('calls pause() on pause command', () => {
    const tm = makeTimeManager();
    handleTimeControl(tm as never, 'pause');
    expect(tm.pause).toHaveBeenCalledTimes(1);
  });

  it('calls togglePause() on toggle command', () => {
    const tm = makeTimeManager();
    handleTimeControl(tm as never, 'toggle');
    expect(tm.togglePause).toHaveBeenCalledTimes(1);
  });

  it('calls setTimeScale on setSpeed with numeric value', () => {
    const tm = makeTimeManager();
    handleTimeControl(tm as never, 'setSpeed', 2.5);
    expect(tm.setTimeScale).toHaveBeenCalledWith(2.5);
  });

  it('does NOT call setTimeScale on setSpeed when value is not a number', () => {
    const tm = makeTimeManager();
    handleTimeControl(tm as never, 'setSpeed', 'fast');
    expect(tm.setTimeScale).not.toHaveBeenCalled();
  });

  it('calls setDate on setDate command with truthy value', () => {
    const tm = makeTimeManager();
    handleTimeControl(tm as never, 'setDate', '2024-01-01');
    expect(tm.setDate).toHaveBeenCalledWith(new Date('2024-01-01'));
  });

  it('does NOT call setDate when value is falsy', () => {
    const tm = makeTimeManager();
    handleTimeControl(tm as never, 'setDate', '');
    expect(tm.setDate).not.toHaveBeenCalled();
  });

  it('calls setDate with current date on syncRealTime', () => {
    const tm = makeTimeManager();
    handleTimeControl(tm as never, 'syncRealTime');
    expect(tm.setDate).toHaveBeenCalledTimes(1);
    const arg = (tm.setDate as ReturnType<typeof vi.fn>).mock.calls[0][0] as Date;
    expect(arg).toBeInstanceOf(Date);
  });

  it('silently ignores unknown commands', () => {
    const tm = makeTimeManager();
    expect(() => handleTimeControl(tm as never, 'unknownCmd')).not.toThrow();
    expect(tm.play).not.toHaveBeenCalled();
    expect(tm.pause).not.toHaveBeenCalled();
  });
});
