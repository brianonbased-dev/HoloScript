/**
 * Tests for DAPHotReloadAdapter
 *
 * Covers: AttachConnection, HotReloadManager, TraitVariableInspector,
 *         PerformanceTimeline, ConditionalBreakpointEvaluator, and barrel exports.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock WebSocket (vi.hoisted so the factory can reference it)
// ---------------------------------------------------------------------------
const { MockWebSocket } = vi.hoisted(() => {
  class MockWebSocket {
    url: string;
    onopen: ((this: MockWebSocket) => void) | null = null;
    onmessage: ((this: MockWebSocket, ev: { data: string }) => void) | null = null;
    onclose: ((this: MockWebSocket) => void) | null = null;
    onerror: ((this: MockWebSocket, ev: { type: string }) => void) | null = null;
    sent: string[] = [];
    closed = false;

    constructor(url: string) {
      this.url = url;
    }

    send(data: string): void {
      this.sent.push(data);
    }

    close(): void {
      this.closed = true;
    }

    // Helpers for tests to trigger callbacks
    _triggerOpen(): void {
      this.onopen?.call(this);
    }
    _triggerMessage(data: string): void {
      this.onmessage?.call(this, { data });
    }
    _triggerClose(): void {
      this.onclose?.call(this);
    }
    _triggerError(type = 'error'): void {
      this.onerror?.call(this, { type });
    }
  }
  return { MockWebSocket };
});

// Expose MockWebSocket as the global WebSocket so AttachConnection can use it.
vi.stubGlobal('WebSocket', MockWebSocket);

import {
  AttachConnection,
  HotReloadManager,
  TraitVariableInspector,
  PerformanceTimeline,
  ConditionalBreakpointEvaluator,
} from '../DAPHotReloadAdapter';

import type {
  AttachConfig,
  HotReloadEvent,
  TraitVariableInfo,
  PerformanceFrame,
  DAPAttachMessage,
} from '../DAPHotReloadAdapter';

// ==========================================================================
// AttachConnection
// ==========================================================================
describe('AttachConnection', () => {
  let conn: AttachConnection;

  beforeEach(() => {
    conn = new AttachConnection();
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Clear any pending requests before disconnect to avoid unhandled rejections
    const pendingMap = (conn as unknown as { pendingRequests: Map<number, { reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> }> }).pendingRequests;
    if (pendingMap) {
      for (const [, pending] of pendingMap) {
        clearTimeout(pending.timeout);
      }
      pendingMap.clear();
    }
    // Now safe to disconnect without unhandled rejections
    const ws = (conn as unknown as { ws: unknown }).ws;
    if (ws) {
      (ws as { close: () => void }).close();
    }
    vi.useRealTimers();
  });

  // 1 - initial state
  it('starts in a disconnected state', () => {
    expect(conn.connected).toBe(false);
  });

  // 2 - successful connect (no auth token)
  it('connects via WebSocket and sets connected = true', async () => {
    const config: AttachConfig = { host: 'localhost', port: 9229 };
    const connectPromise = conn.connect(config);

    // The constructor was called synchronously; grab the instance
    const ws = (conn as unknown as { ws: InstanceType<typeof MockWebSocket> }).ws;
    expect(ws).toBeTruthy();
    expect(ws.url).toBe('ws://localhost:9229/debug');

    // Simulate the server accepting the connection
    ws._triggerOpen();

    const result = await connectPromise;
    expect(result).toBe(true);
    expect(conn.connected).toBe(true);
  });

  // 3 - connect with auth token sends authenticate message
  it('sends an authenticate request when a token is provided', async () => {
    const config: AttachConfig = { host: 'localhost', port: 9229, token: 'secret-123' };
    const connectPromise = conn.connect(config);
    const ws = (conn as unknown as { ws: InstanceType<typeof MockWebSocket> }).ws;

    // Open fires, which triggers send('authenticate', ...)
    ws._triggerOpen();

    // The authenticate request should now be sitting in ws.sent
    expect(ws.sent.length).toBe(1);
    const authMsg: DAPAttachMessage = JSON.parse(ws.sent[0]);
    expect(authMsg.type).toBe('request');
    expect(authMsg.command).toBe('authenticate');
    expect(authMsg.body).toEqual({ token: 'secret-123' });

    // Respond with success so the connect promise resolves
    ws._triggerMessage(JSON.stringify({
      type: 'response',
      id: authMsg.id,
      success: true,
      body: { ok: true },
    }));

    const result = await connectPromise;
    expect(result).toBe(true);
  });

  // 4 - connection timeout
  it('rejects with timeout error when connection takes too long', async () => {
    const config: AttachConfig = { host: 'localhost', port: 9229, timeout: 500 };
    const connectPromise = conn.connect(config);

    // Advance past the timeout without triggering onopen
    vi.advanceTimersByTime(600);

    await expect(connectPromise).rejects.toThrow('Connection timeout after 500ms');
  });

  // 5 - WebSocket error during connect
  it('rejects on WebSocket error', async () => {
    const config: AttachConfig = { host: 'localhost', port: 9229 };
    const connectPromise = conn.connect(config);
    const ws = (conn as unknown as { ws: InstanceType<typeof MockWebSocket> }).ws;

    ws._triggerError('connection-refused');

    await expect(connectPromise).rejects.toThrow('WebSocket error: connection-refused');
    expect(conn.connected).toBe(false);
  });

  // 6 - message ID incrementing on send
  it('increments message IDs on successive sends', async () => {
    const config: AttachConfig = { host: 'localhost', port: 9229 };
    const connectPromise = conn.connect(config);
    const ws = (conn as unknown as { ws: InstanceType<typeof MockWebSocket> }).ws;
    ws._triggerOpen();
    await connectPromise;

    // Fire two sends (don't await -- we just want the serialized messages)
    conn.send('getState');
    conn.send('evaluate');

    expect(ws.sent.length).toBe(2);
    const msg1: DAPAttachMessage = JSON.parse(ws.sent[0]);
    const msg2: DAPAttachMessage = JSON.parse(ws.sent[1]);
    expect(msg2.id).toBe(msg1.id + 1);
  });

  // 7 - send throws when not connected
  it('throws when sending while disconnected', async () => {
    await expect(conn.send('test')).rejects.toThrow('Not connected');
  });

  // 8 - event listener registration and dispatch
  it('dispatches events to registered listeners', async () => {
    const config: AttachConfig = { host: 'localhost', port: 9229 };
    const connectPromise = conn.connect(config);
    const ws = (conn as unknown as { ws: InstanceType<typeof MockWebSocket> }).ws;
    ws._triggerOpen();
    await connectPromise;

    const handler = vi.fn();
    conn.on('hotReload', handler);

    // Simulate an inbound event message
    ws._triggerMessage(JSON.stringify({
      type: 'event',
      id: 0,
      command: 'hotReload',
      body: { file: 'scene.hs' },
    }));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ file: 'scene.hs' });
  });

  // 9 - disconnect cleans up
  it('cleans up WebSocket and pending requests on disconnect', async () => {
    const config: AttachConfig = { host: 'localhost', port: 9229 };
    const connectPromise = conn.connect(config);
    const ws = (conn as unknown as { ws: InstanceType<typeof MockWebSocket> }).ws;
    ws._triggerOpen();
    await connectPromise;

    // Create a pending request
    const sendPromise = conn.send('longRunning');
    conn.disconnect();

    expect(conn.connected).toBe(false);
    expect(ws.closed).toBe(true);
    await expect(sendPromise).rejects.toThrow('Disconnecting');
  });

  // 10 - sendEvent is fire-and-forget
  it('sendEvent sends a one-way message without creating pending request', async () => {
    const config: AttachConfig = { host: 'localhost', port: 9229 };
    const connectPromise = conn.connect(config);
    const ws = (conn as unknown as { ws: InstanceType<typeof MockWebSocket> }).ws;
    ws._triggerOpen();
    await connectPromise;

    conn.sendEvent('log', { msg: 'hello' });

    expect(ws.sent.length).toBe(1);
    const msg: DAPAttachMessage = JSON.parse(ws.sent[0]);
    expect(msg.type).toBe('event');
    expect(msg.command).toBe('log');
  });

  // 11 - response handling resolves pending request
  it('resolves pending request when a success response arrives', async () => {
    const config: AttachConfig = { host: 'localhost', port: 9229 };
    const connectPromise = conn.connect(config);
    const ws = (conn as unknown as { ws: InstanceType<typeof MockWebSocket> }).ws;
    ws._triggerOpen();
    await connectPromise;

    const sendPromise = conn.send('getVariables');
    const sentMsg: DAPAttachMessage = JSON.parse(ws.sent[0]);

    ws._triggerMessage(JSON.stringify({
      type: 'response',
      id: sentMsg.id,
      success: true,
      body: { vars: ['x', 'y'] },
    }));

    const result = await sendPromise;
    expect(result).toEqual({ vars: ['x', 'y'] });
  });

  // 12 - error response rejects pending request
  it('rejects pending request when an error response arrives', async () => {
    const config: AttachConfig = { host: 'localhost', port: 9229 };
    const connectPromise = conn.connect(config);
    const ws = (conn as unknown as { ws: InstanceType<typeof MockWebSocket> }).ws;
    ws._triggerOpen();
    await connectPromise;

    const sendPromise = conn.send('badCommand');
    const sentMsg: DAPAttachMessage = JSON.parse(ws.sent[0]);

    ws._triggerMessage(JSON.stringify({
      type: 'response',
      id: sentMsg.id,
      success: false,
      error: 'Unknown command',
    }));

    await expect(sendPromise).rejects.toThrow('Unknown command');
  });

  // 13 - onclose rejects all pending and emits disconnected
  it('rejects all pending requests and emits disconnected on close', async () => {
    const config: AttachConfig = { host: 'localhost', port: 9229 };
    const connectPromise = conn.connect(config);
    const ws = (conn as unknown as { ws: InstanceType<typeof MockWebSocket> }).ws;
    ws._triggerOpen();
    await connectPromise;

    const disconnectedHandler = vi.fn();
    conn.on('disconnected', disconnectedHandler);

    const p1 = conn.send('a');
    const p2 = conn.send('b');

    ws._triggerClose();

    await expect(p1).rejects.toThrow('Connection closed');
    await expect(p2).rejects.toThrow('Connection closed');
    expect(conn.connected).toBe(false);
    expect(disconnectedHandler).toHaveBeenCalledTimes(1);
  });
});

// ==========================================================================
// HotReloadManager
// ==========================================================================
describe('HotReloadManager', () => {
  let mgr: HotReloadManager;

  beforeEach(() => {
    mgr = new HotReloadManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    mgr.dispose();
    vi.useRealTimers();
  });

  it('is enabled by default', () => {
    expect(mgr.enabled).toBe(true);
  });

  it('ignores file changes when disabled', () => {
    mgr.enabled = false;
    const handler = vi.fn();
    mgr.setReloadHandler(handler);

    mgr.registerFile('scene.hs', 'original');
    mgr.fileChanged('scene.hs', 'changed');
    vi.advanceTimersByTime(500);

    expect(handler).not.toHaveBeenCalled();
  });

  it('debounces rapid file changes and fires handler once', () => {
    const handler = vi.fn();
    mgr.setReloadHandler(handler);
    mgr.registerFile('scene.hs', 'v1');

    mgr.fileChanged('scene.hs', 'v2');
    mgr.fileChanged('scene.hs', 'v3');
    mgr.fileChanged('scene.hs', 'v4');

    // None fired yet (within debounce window)
    expect(handler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);

    // Should have fired once for scene.hs with v4 content
    expect(handler).toHaveBeenCalledTimes(1);
    const event: HotReloadEvent = handler.mock.calls[0][0];
    expect(event.filePath).toBe('scene.hs');
    expect(event.success).toBe(true);
  });

  it('skips reload when content is unchanged', () => {
    const handler = vi.fn();
    mgr.setReloadHandler(handler);
    mgr.registerFile('scene.hs', 'same');

    mgr.fileChanged('scene.hs', 'same');
    vi.advanceTimersByTime(400);

    expect(handler).not.toHaveBeenCalled();
  });

  it('validates source and reports unbalanced braces', () => {
    const handler = vi.fn();
    mgr.setReloadHandler(handler);
    mgr.registerFile('broken.hs', '');

    mgr.fileChanged('broken.hs', 'object "Cube" { @physics {');
    vi.advanceTimersByTime(400);

    expect(handler).toHaveBeenCalledTimes(1);
    const event: HotReloadEvent = handler.mock.calls[0][0];
    expect(event.success).toBe(false);
    expect(event.errors).toBeDefined();
    expect(event.errors!.some(e => e.includes('unclosed brace'))).toBe(true);
  });

  it('extracts affected object names from source', () => {
    const handler = vi.fn();
    mgr.setReloadHandler(handler);
    mgr.registerFile('scene.hs', '');

    const src = `object "Cube" { }\nobject "Sphere" { }\ntemplate "EnemyBase" { }`;
    mgr.fileChanged('scene.hs', src);
    vi.advanceTimersByTime(400);

    const event: HotReloadEvent = handler.mock.calls[0][0];
    expect(event.success).toBe(true);
    expect(event.affectedObjects).toContain('Cube');
    expect(event.affectedObjects).toContain('Sphere');
    expect(event.affectedObjects).toContain('template:EnemyBase');
  });

  it('enforces minimum debounce of 50ms', () => {
    mgr.debounceMs = 10;
    expect(mgr.debounceMs).toBe(50);
  });

  it('tracks reload history and supports getRecentReloads', () => {
    const handler = vi.fn();
    mgr.setReloadHandler(handler);

    mgr.registerFile('a.hs', '');
    mgr.fileChanged('a.hs', 'object "A" { }');
    vi.advanceTimersByTime(400);

    mgr.fileChanged('a.hs', 'object "A2" { }');
    vi.advanceTimersByTime(400);

    const history = mgr.getHistory();
    expect(history.length).toBe(2);

    const recent = mgr.getRecentReloads(1);
    expect(recent.length).toBe(1);
    expect(recent[0].affectedObjects).toContain('A2');
  });

  it('clears history', () => {
    mgr.registerFile('a.hs', '');
    mgr.fileChanged('a.hs', 'v2');
    vi.advanceTimersByTime(400);

    mgr.clearHistory();
    expect(mgr.getHistory().length).toBe(0);
  });
});

// ==========================================================================
// TraitVariableInspector
// ==========================================================================
describe('TraitVariableInspector', () => {
  const inspector = new TraitVariableInspector();

  it('extracts traits from @ prefixed properties', () => {
    const traits = inspector.extractTraitVariables('obj1', {
      '@physics': { mass: 2.0, friction: 0.5 },
      '@grabbable': { snapToHand: true },
      color: 'red',
    }, ['physics']);

    expect(traits.length).toBe(2);
    const physics = traits.find(t => t.traitName === 'physics');
    expect(physics).toBeDefined();
    expect(physics!.active).toBe(true);
    expect(physics!.config).toEqual({ mass: 2.0, friction: 0.5 });

    const grabbable = traits.find(t => t.traitName === 'grabbable');
    expect(grabbable).toBeDefined();
    expect(grabbable!.active).toBe(false);
  });

  it('extracts traits from trait_ prefixed properties', () => {
    const traits = inspector.extractTraitVariables('obj2', {
      trait_audio: { volume: 0.8 },
    });

    expect(traits.length).toBe(1);
    expect(traits[0].traitName).toBe('audio');
  });

  it('extracts traits from a traits map', () => {
    const traits = inspector.extractTraitVariables('obj3', {
      traits: { glow: { intensity: 1.5 }, spin: { rpm: 30 } },
    }, ['glow']);

    expect(traits.length).toBe(2);
    const glow = traits.find(t => t.traitName === 'glow');
    expect(glow!.active).toBe(true);
  });

  it('wraps non-object trait values in { value: ... }', () => {
    const traits = inspector.extractTraitVariables('obj4', {
      '@simple': 42,
    });

    expect(traits[0].config).toEqual({ value: 42 });
  });

  it('formats traits for debugger with active/inactive prefix', () => {
    const traitInfo: TraitVariableInfo[] = [
      { traitName: 'physics', objectId: 'obj1', config: { mass: 2 }, active: true, lastUpdate: 1000 },
      { traitName: 'audio', objectId: 'obj1', config: { vol: 0.5 }, active: false, lastUpdate: 1000 },
    ];
    const vars = inspector.formatForDebugger(traitInfo);

    expect(vars.has('@physics [active]')).toBe(true);
    expect(vars.has('@audio [inactive]')).toBe(true);

    const physicsObj = vars.get('@physics [active]') as Record<string, unknown>;
    expect(physicsObj['__status']).toBe('active');
    expect(physicsObj['mass']).toBe(2);
  });
});

// ==========================================================================
// PerformanceTimeline
// ==========================================================================
describe('PerformanceTimeline', () => {
  let timeline: PerformanceTimeline;

  beforeEach(() => {
    timeline = new PerformanceTimeline(100);
  });

  const makeFrame = (n: number, ms: number, traits: Record<string, number> = {}): PerformanceFrame => ({
    frameNumber: n,
    frameTimeMs: ms,
    traitTimes: traits,
    activeObjects: 10,
    memoryBytes: 1024 * 1024 * 50,
  });

  it('does not record frames when not started', () => {
    timeline.recordFrame(makeFrame(1, 16));
    expect(timeline.getRecentFrames().length).toBe(0);
  });

  it('records frames after start and stops on stop', () => {
    timeline.start();
    expect(timeline.recording).toBe(true);

    timeline.recordFrame(makeFrame(1, 16));
    timeline.recordFrame(makeFrame(2, 17));
    timeline.stop();
    timeline.recordFrame(makeFrame(3, 18)); // should be ignored

    expect(timeline.getRecentFrames().length).toBe(2);
  });

  it('calculates average frame time', () => {
    timeline.start();
    timeline.recordFrame(makeFrame(1, 10));
    timeline.recordFrame(makeFrame(2, 20));
    timeline.recordFrame(makeFrame(3, 30));

    expect(timeline.getAverageFrameTime()).toBe(20);
  });

  it('returns 0 average when no frames recorded', () => {
    expect(timeline.getAverageFrameTime()).toBe(0);
  });

  it('evicts oldest frames when exceeding maxFrames', () => {
    timeline = new PerformanceTimeline(3);
    timeline.start();
    timeline.recordFrame(makeFrame(1, 10));
    timeline.recordFrame(makeFrame(2, 20));
    timeline.recordFrame(makeFrame(3, 30));
    timeline.recordFrame(makeFrame(4, 40));

    const frames = timeline.getRecentFrames(10);
    expect(frames.length).toBe(3);
    expect(frames[0].frameNumber).toBe(2); // frame 1 was evicted
  });

  it('identifies hottest traits by average time', () => {
    timeline.start();
    timeline.recordFrame(makeFrame(1, 16, { physics: 5, audio: 2 }));
    timeline.recordFrame(makeFrame(2, 16, { physics: 7, audio: 1 }));

    const hottest = timeline.getHottestTraits(2);
    expect(hottest.length).toBe(2);
    expect(hottest[0].trait).toBe('physics');
    expect(hottest[0].avgMs).toBe(6); // (5+7)/2
  });

  it('detects frame time spikes', () => {
    timeline.start();
    // 4 normal frames at 10ms, then 1 spike at 30ms
    for (let i = 0; i < 4; i++) timeline.recordFrame(makeFrame(i, 10));
    timeline.recordFrame(makeFrame(5, 30));

    const spikes = timeline.detectSpikes(2.0);
    expect(spikes.length).toBe(1);
    expect(spikes[0].frameNumber).toBe(5);
  });

  it('produces a summary string', () => {
    timeline.start();
    timeline.recordFrame(makeFrame(1, 16, { physics: 4 }));
    timeline.recordFrame(makeFrame(2, 16, { physics: 6 }));

    const summary = timeline.getSummary();
    expect(summary).toContain('Performance Summary');
    expect(summary).toContain('Avg frame time');
    expect(summary).toContain('@physics');
  });

  it('returns a fallback message when no data recorded', () => {
    expect(timeline.getSummary()).toBe('No performance data recorded.');
  });

  it('exports JSON with frame data', () => {
    timeline.start();
    timeline.recordFrame(makeFrame(1, 16));

    const json = timeline.exportJSON();
    const parsed = JSON.parse(json);
    expect(parsed.frameCount).toBe(1);
    expect(parsed.frames.length).toBe(1);
  });

  it('clears all recorded data', () => {
    timeline.start();
    timeline.recordFrame(makeFrame(1, 16));
    timeline.clear();

    expect(timeline.getRecentFrames().length).toBe(0);
  });
});

// ==========================================================================
// ConditionalBreakpointEvaluator
// ==========================================================================
describe('ConditionalBreakpointEvaluator', () => {
  const evaluator = new ConditionalBreakpointEvaluator();

  it('evaluates simple numeric comparisons', () => {
    expect(evaluator.evaluate('5 > 3', {}).result).toBe(true);
    expect(evaluator.evaluate('2 >= 2', {}).result).toBe(true);
    expect(evaluator.evaluate('1 < 0', {}).result).toBe(false);
  });

  it('resolves @trait.property from context', () => {
    const ctx = { '@physics': { mass: 10 } };
    expect(evaluator.evaluate('@physics.mass > 5', ctx).result).toBe(true);
    expect(evaluator.evaluate('@physics.mass < 5', ctx).result).toBe(false);
  });

  it('resolves state.property from context', () => {
    const ctx = { state: { score: 150, combo_count: 4 } };
    expect(evaluator.evaluate('state.score >= 100', ctx).result).toBe(true);
  });

  it('handles && and || operators', () => {
    const ctx = { state: { score: 150, combo_count: 4 } };
    expect(evaluator.evaluate('state.score >= 100 && state.combo_count > 3', ctx).result).toBe(true);
    expect(evaluator.evaluate('state.score < 50 || state.combo_count > 3', ctx).result).toBe(true);
    expect(evaluator.evaluate('state.score < 50 && state.combo_count < 3', ctx).result).toBe(false);
  });

  it('resolves this.property and array indexing', () => {
    const ctx = { position: [1, -2, 3] };
    expect(evaluator.evaluate('this.position[1] < 0', ctx).result).toBe(true);
  });

  it('rejects expressions with unsafe characters', () => {
    const result = evaluator.evaluate('x; process.exit()', {});
    expect(result.result).toBe(false);
    expect(result.error).toContain('Unsafe characters');
  });

  it('handles boolean literals', () => {
    expect(evaluator.evaluate('true', {}).result).toBe(true);
    expect(evaluator.evaluate('false', {}).result).toBe(false);
  });

  it('handles negation with !', () => {
    expect(evaluator.evaluate('!false', {}).result).toBe(true);
    expect(evaluator.evaluate('!true', {}).result).toBe(false);
  });
});

// ==========================================================================
// Barrel exports (index.ts)
// ==========================================================================
describe('dap/index barrel exports', () => {
  it('re-exports AttachConnection class from the barrel', async () => {
    const barrel = await import('../index');
    expect(barrel.AttachConnection).toBe(AttachConnection);
  });
});
