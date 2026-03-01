/**
 * Tests for @holoscript/collab-server
 *
 * Covers: server creation, health endpoint, WebSocket rooms,
 * message relaying, ping filtering, room isolation, disconnect cleanup,
 * onRoomChange callback, and error resilience.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { createCollabServer } from '../index';
import WebSocket from 'ws';
import http from 'node:http';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Connect a WS client to a given room on the server port */
function connectClient(port: number, room = 'default'): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/collab?room=${room}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/** Wait for the next message on a WS client */
function nextMessage(ws: WebSocket, timeoutMs = 2000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for message')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

/** HTTP GET helper */
function httpGet(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${port}${path}`, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      res.on('end', () => resolve({ status: res.statusCode!, body }));
    }).on('error', reject);
  });
}

/** Close a WebSocket and wait for it to fully disconnect */
function closeClient(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) { resolve(); return; }
    ws.on('close', () => resolve());
    ws.close();
  });
}

/** Small delay */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Tests ────────────────────────────────────────────────────────────────────

// Use a dynamic port range to avoid conflicts between parallel tests
let portCounter = 15_000;
function nextPort() { return portCounter++; }

describe('createCollabServer', () => {
  const servers: ReturnType<typeof createCollabServer>[] = [];
  const clients: WebSocket[] = [];

  afterEach(async () => {
    // Close all clients first
    await Promise.all(clients.map(closeClient));
    clients.length = 0;

    // Then close all servers
    await Promise.all(
      servers.map(
        (s) => new Promise<void>((resolve) => {
          s.wss.close(() => {
            s.httpServer.close(() => resolve());
          });
        })
      )
    );
    servers.length = 0;
  });

  function track<T extends WebSocket>(ws: T): T { clients.push(ws); return ws; }

  function createServer(opts: Parameters<typeof createCollabServer>[0] = {}) {
    const port = opts.port ?? nextPort();
    const s = createCollabServer({ ...opts, port });
    servers.push(s);
    return { ...s, port };
  }

  // ── Server lifecycle ─────────────────────────────────────────────────────

  it('should create and return httpServer + wss', () => {
    const { httpServer, wss } = createServer();
    expect(httpServer).toBeDefined();
    expect(wss).toBeDefined();
    expect(httpServer).toBeInstanceOf(http.Server);
  });

  it('should listen on the specified port', async () => {
    const port = nextPort();
    createServer({ port });
    await delay(50); // let server bind

    const { status } = await httpGet(port, '/health');
    expect(status).toBe(200);
  });

  // ── Health endpoint ──────────────────────────────────────────────────────

  it('should return health status with empty rooms', async () => {
    const { port } = createServer();
    await delay(50);

    const { status, body } = await httpGet(port, '/health');
    expect(status).toBe(200);

    const json = JSON.parse(body);
    expect(json.status).toBe('ok');
    expect(json.rooms).toEqual({});
  });

  it('should report connected clients in health response', async () => {
    const { port } = createServer();
    await delay(50);

    const ws = track(await connectClient(port, 'room-a'));
    await delay(50);

    const { body } = await httpGet(port, '/health');
    const json = JSON.parse(body);
    expect(json.rooms['room-a']).toBe(1);

    ws; // referenced for linting
  });

  it('should return 404 for unknown HTTP routes', async () => {
    const { port } = createServer();
    await delay(50);

    const { status, body } = await httpGet(port, '/unknown');
    expect(status).toBe(404);
    expect(body).toBe('Not found');
  });

  // ── WebSocket connections ────────────────────────────────────────────────

  it('should accept WebSocket connections', async () => {
    const { port } = createServer();
    await delay(50);

    const ws = track(await connectClient(port));
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  it('should default to "default" room when no room param given', async () => {
    const onRoomChange = vi.fn();
    const { port } = createServer({ onRoomChange });
    await delay(50);

    track(await connectClient(port)); // no room param → uses 'default'
    await delay(50);

    expect(onRoomChange).toHaveBeenCalledWith('default', 1);
  });

  it('should connect to a specific room via query param', async () => {
    const onRoomChange = vi.fn();
    const { port } = createServer({ onRoomChange });
    await delay(50);

    track(await connectClient(port, 'my-room'));
    await delay(50);

    expect(onRoomChange).toHaveBeenCalledWith('my-room', 1);
  });

  // ── Message relaying ─────────────────────────────────────────────────────

  it('should relay messages to other peers in the same room', async () => {
    const { port } = createServer();
    await delay(50);

    const sender = track(await connectClient(port, 'chat'));
    const receiver = track(await connectClient(port, 'chat'));
    await delay(50);

    const msgPromise = nextMessage(receiver);
    sender.send(JSON.stringify({ type: 'cursor', x: 10, y: 20 }));

    const received = await msgPromise;
    expect(received.type).toBe('cursor');
    expect(received.x).toBe(10);
    expect(received.y).toBe(20);
  });

  it('should NOT echo messages back to the sender', async () => {
    const { port } = createServer();
    await delay(50);

    const sender = track(await connectClient(port, 'echo-test'));
    const receiver = track(await connectClient(port, 'echo-test'));
    await delay(50);

    const senderSpy = vi.fn();
    sender.on('message', senderSpy);

    const msgPromise = nextMessage(receiver);
    sender.send(JSON.stringify({ type: 'join', userId: 'u1' }));

    await msgPromise; // receiver got it
    await delay(100);

    expect(senderSpy).not.toHaveBeenCalled();
  });

  it('should broadcast to all peers (multi-client)', async () => {
    const { port } = createServer();
    await delay(50);

    const sender = track(await connectClient(port, 'multi'));
    const recv1 = track(await connectClient(port, 'multi'));
    const recv2 = track(await connectClient(port, 'multi'));
    await delay(50);

    const p1 = nextMessage(recv1);
    const p2 = nextMessage(recv2);
    sender.send(JSON.stringify({ type: 'cursor', userId: 's1', x: 5 }));

    const [msg1, msg2] = await Promise.all([p1, p2]);
    expect(msg1.type).toBe('cursor');
    expect(msg2.type).toBe('cursor');
  });

  // ── Ping filtering ──────────────────────────────────────────────────────

  it('should NOT relay ping messages', async () => {
    const { port } = createServer();
    await delay(50);

    const sender = track(await connectClient(port, 'ping-test'));
    const receiver = track(await connectClient(port, 'ping-test'));
    await delay(50);

    const receiverSpy = vi.fn();
    receiver.on('message', receiverSpy);

    // Send a ping (should be swallowed)
    sender.send(JSON.stringify({ type: 'ping', userId: 'u1' }));
    await delay(200);

    expect(receiverSpy).not.toHaveBeenCalled();

    // Send a normal message (should be relayed)
    const msgPromise = nextMessage(receiver);
    sender.send(JSON.stringify({ type: 'cursor', userId: 'u1' }));
    const msg = await msgPromise;
    expect(msg.type).toBe('cursor');
  });

  // ── Malformed messages ──────────────────────────────────────────────────

  it('should ignore malformed (non-JSON) messages', async () => {
    const { port } = createServer();
    await delay(50);

    const sender = track(await connectClient(port, 'bad-msg'));
    const receiver = track(await connectClient(port, 'bad-msg'));
    await delay(50);

    const receiverSpy = vi.fn();
    receiver.on('message', receiverSpy);

    // Send invalid JSON
    sender.send('this is not json{{{');
    await delay(200);

    expect(receiverSpy).not.toHaveBeenCalled();
  });

  // ── Room isolation ──────────────────────────────────────────────────────

  it('should NOT relay messages across different rooms', async () => {
    const { port } = createServer();
    await delay(50);

    const clientA = track(await connectClient(port, 'room-1'));
    const clientB = track(await connectClient(port, 'room-2'));
    await delay(50);

    const spyB = vi.fn();
    clientB.on('message', spyB);

    clientA.send(JSON.stringify({ type: 'cursor', room: '1' }));
    await delay(200);

    expect(spyB).not.toHaveBeenCalled();
  });

  // ── Disconnect & cleanup ─────────────────────────────────────────────────

  it('should clean up empty rooms when all clients disconnect', async () => {
    const onRoomChange = vi.fn();
    const { port } = createServer({ onRoomChange });
    await delay(50);

    const ws = track(await connectClient(port, 'temp-room'));
    await delay(50);

    expect(onRoomChange).toHaveBeenCalledWith('temp-room', 1);

    await closeClient(ws);
    clients.splice(clients.indexOf(ws), 1); // remove from tracking
    await delay(100);

    expect(onRoomChange).toHaveBeenCalledWith('temp-room', 0);

    // Health should show no rooms
    const { body } = await httpGet(port, '/health');
    const json = JSON.parse(body);
    expect(json.rooms['temp-room']).toBeUndefined();
  });

  it('should decrement room size on disconnect but keep room if peers remain', async () => {
    const onRoomChange = vi.fn();
    const { port } = createServer({ onRoomChange });
    await delay(50);

    const ws1 = track(await connectClient(port, 'shared'));
    const ws2 = track(await connectClient(port, 'shared'));
    await delay(50);

    await closeClient(ws1);
    clients.splice(clients.indexOf(ws1), 1);
    await delay(100);

    // Room should still exist with 1 peer
    const { body } = await httpGet(port, '/health');
    const json = JSON.parse(body);
    expect(json.rooms['shared']).toBe(1);

    ws2; // referenced
  });

  // ── onRoomChange callback ────────────────────────────────────────────────

  it('should fire onRoomChange on join and leave', async () => {
    const onRoomChange = vi.fn();
    const { port } = createServer({ onRoomChange });
    await delay(50);

    const ws = track(await connectClient(port, 'cb-test'));
    await delay(50);

    expect(onRoomChange).toHaveBeenCalledWith('cb-test', 1);

    await closeClient(ws);
    clients.splice(clients.indexOf(ws), 1);
    await delay(100);

    expect(onRoomChange).toHaveBeenCalledWith('cb-test', 0);
    expect(onRoomChange).toHaveBeenCalledTimes(2);
  });

  // ── Multiple rooms concurrently ──────────────────────────────────────────

  it('should handle multiple rooms simultaneously', async () => {
    const { port } = createServer();
    await delay(50);

    const a1 = track(await connectClient(port, 'alpha'));
    const a2 = track(await connectClient(port, 'alpha'));
    const b1 = track(await connectClient(port, 'beta'));
    const b2 = track(await connectClient(port, 'beta'));
    await delay(50);

    // Send from alpha room
    const alphaPromise = nextMessage(a2);
    const betaSpy = vi.fn();
    b1.on('message', betaSpy);
    b2.on('message', betaSpy);

    a1.send(JSON.stringify({ type: 'cursor', room: 'alpha' }));

    const alphaMsg = await alphaPromise;
    expect(alphaMsg.type).toBe('cursor');

    await delay(200);
    expect(betaSpy).not.toHaveBeenCalled(); // beta room unaffected
  });

  // ── Health with multiple rooms ────────────────────────────────────────────

  it('should report all rooms in health endpoint', async () => {
    const { port } = createServer();
    await delay(50);

    track(await connectClient(port, 'room-x'));
    track(await connectClient(port, 'room-x'));
    track(await connectClient(port, 'room-y'));
    await delay(50);

    const { body } = await httpGet(port, '/health');
    const json = JSON.parse(body);
    expect(json.rooms['room-x']).toBe(2);
    expect(json.rooms['room-y']).toBe(1);
  });
});
