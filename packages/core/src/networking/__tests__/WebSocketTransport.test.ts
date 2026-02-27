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

  constructor(url: string) {
    this.url = url;
    // Simulate immediate asynchronous connection connection
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
        transport = new WebSocketTransport('local_actor', 'ws://localhost:8080');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
        // @ts-ignore
        delete global.WebSocket;
    });

    it('should connect to the WebSocket server', () => {
        const connected = transport.connect('spatial-engine-server');
        expect(connected).toBe(true);

        // Advance timers to trigger the mock open event
        vi.advanceTimersByTime(20);
        
        // At this point, it should be registered
        const peers = transport.getConnectedPeers();
        expect(peers).toContain('spatial-engine-server');
    });

    it('should intercept send() and route it over the WebSocket directly', () => {
        transport.connect('spatial-engine-server');
        vi.advanceTimersByTime(20); // wait for open
        
        const success = transport.send('spatial-engine-server', 'client_deltas', {
            deltas: [{ id: '123', field: 'x', value: 1.0, time: 0 }]
        });

        expect(success).toBe(true);

        const wsInstance = (transport as any).ws as MockWebSocket;
        expect(wsInstance.sentMessages.length).toBe(1);
        
        const sentJson = JSON.parse(wsInstance.sentMessages[0]);
        expect(sentJson.type).toBe('client_deltas');
        expect(sentJson.payload.deltas[0].field).toBe('x');
    });

    it('should unpack inbound payloads using the onInboundState hook', () => {
        transport.connect('spatial-engine-server');
        vi.advanceTimersByTime(20);

        let receivedPayload = null;
        transport.onInboundState = (payload) => {
            receivedPayload = payload;
        };

        const wsInstance = (transport as any).ws as MockWebSocket;

        // Simulate server broadcasting a WorldStatePayload
        const mockServerPayload = {
            timestamp: 12345,
            agent_updates: [{ id: 'agent-1', x: 10, y: 0, z: 5 }],
            room_updates: []
        };

        if (wsInstance.onmessage) {
            wsInstance.onmessage({ data: JSON.stringify(mockServerPayload) });
        }

        expect(receivedPayload).toBeDefined();
        expect((receivedPayload as any).agent_updates[0].id).toBe('agent-1');
    });
});
