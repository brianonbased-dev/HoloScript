import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSocketTransport } from '../WebSocketTransport';

// Mock the global WebSocket object
class MockWebSocket {
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((error: any) => void) | null = null;
  readyState = 1;
  sentMessages: string[] = [];

  static OPEN = 1;
  static CLOSED = 3;

  constructor(url: string) {
    this.url = url;
    // Simulate immediate asynchronous connection
    setTimeout(() => {
        if (this.onopen) this.onopen();
    }, 10);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 3;
    if (this.onclose) this.onclose();
  }
}

describe('WebSocketTransport', () => {
    let transport: WebSocketTransport;

    beforeEach(() => {
        vi.useFakeTimers();
        global.WebSocket = MockWebSocket as any;
        transport = new WebSocketTransport({
            serverUrl: 'ws://localhost:8080',
            roomId: 'test-room',
            peerId: 'local_actor',
            maxReconnectAttempts: 10,
            initialBackoffMs: 1000,
            maxBackoffMs: 30000,
            heartbeatIntervalMs: 30000,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        // @ts-ignore
        delete global.WebSocket;
    });

    it('should connect to the WebSocket server', async () => {
        const connectPromise = transport.connect();

        // Advance timers to trigger the mock open event
        vi.advanceTimersByTime(20);

        await connectPromise;

        // At this point, it should be connected
        expect(transport.getIsConnected()).toBe(true);
    });

    it('should send messages over the WebSocket', async () => {
        const connectPromise = transport.connect();
        vi.advanceTimersByTime(20); // wait for open
        await connectPromise;

        transport.sendMessage({
            type: 'state-sync',
            payload: {
                deltas: [{ id: '123', field: 'x', value: 1.0, time: 0 }]
            },
        });

        const wsInstance = (transport as any).ws as MockWebSocket;
        // sentMessages includes the auth message sent on connect + our message
        expect(wsInstance.sentMessages.length).toBeGreaterThanOrEqual(2);

        const lastSent = wsInstance.sentMessages[wsInstance.sentMessages.length - 1];
        const sentJson = JSON.parse(lastSent);
        expect(sentJson.type).toBe('state-sync');
        expect(sentJson.payload.deltas[0].field).toBe('x');
    });

    it('should dispatch inbound messages to registered handlers', async () => {
        const connectPromise = transport.connect();
        vi.advanceTimersByTime(20);
        await connectPromise;

        let receivedPayload: any = null;
        transport.onMessage('state-sync', (msg) => {
            receivedPayload = msg.payload;
        });

        const wsInstance = (transport as any).ws as MockWebSocket;

        // Simulate server broadcasting a state-sync message
        const mockServerPayload = {
            id: 'msg-1',
            type: 'state-sync',
            peerId: 'server',
            roomId: 'test-room',
            timestamp: 12345,
            payload: {
                agent_updates: [{ id: 'agent-1', x: 10, y: 0, z: 5 }],
                room_updates: []
            },
        };

        if (wsInstance.onmessage) {
            wsInstance.onmessage({ data: JSON.stringify(mockServerPayload) });
        }

        expect(receivedPayload).toBeDefined();
        expect(receivedPayload.agent_updates[0].id).toBe('agent-1');
    });
});
