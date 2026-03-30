import { NetworkTransport, NetworkMessage, TransportConfig } from './NetworkTransport';

export class SpatialWebSocketTransport extends NetworkTransport {
  private ws: WebSocket | null = null;
  private url: string;
  private isConnected: boolean = false;

  constructor(
    localId: string,
    url: string = 'ws://127.0.0.1:8080',
    config?: Partial<TransportConfig>
  ) {
    super(localId, config);
    this.url = url;
  }

  connect(peerId: string): boolean {
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.isConnected = true;
        super.connect(peerId); // Register backend as a peer
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // The server broadcasts WorldStatePayloads
          // We dispatch a wildcard message so StateSynchronizer can unpack it
          const message: NetworkMessage = {
            id: Math.floor(Math.random() * 1000000), // temp
            channel: 0,
            type: 'world_state',
            payload: data,
            timestamp: Date.now(),
            senderId: 'server',
            size: event.data.length,
          };

          // Access protected/private method from super if needed, or re-implement deliver logic here
          // Here, we'll temporarily queue it natively, then trigger handlers
          // Assuming we have an accessible way to trigger handlers. Since the base class is private,
          // we'll trigger an internal Event or rely on `onMessage` listeners attached to this instance

          // For now, since `deliverMessage` is private in `NetworkTransport.ts`,
          // we'll push it into the messageQueue and trigger wildly through a custom interface
          // Or instead, we can expose a protected `deliverLocalMessage` on the base class.
          // Given we can't easily change base class without side effects, we can override `update`
          // or maintain our own handler queue.

          // Actually, looking at `StateSynchronizer.ts`, it doesn't currently use `NetworkTransport` for inbound processing
          // Let's create an EventEmitter pattern or just expose a callback.

          if (this.onInboundState) {
            this.onInboundState(data);
          }
        } catch (e) {}
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        super.disconnect(peerId);
      };

      this.ws.onerror = (error) => {};

      return true;
    } catch (e) {
      return false;
    }
  }

  disconnect(peerId: string): boolean {
    if (this.ws) {
      this.ws.close();
    }
    return super.disconnect(peerId);
  }

  // Override send to push over the actual WebSocket instead of simulated loops
  send(peerId: string, type: string, payload: Record<string, unknown>, channel = 0): boolean {
    if (!this.isConnected || !this.ws) return false;

    try {
      // Frame standard network messages
      const payloadStr = JSON.stringify({ type, payload });
      this.ws.send(payloadStr);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Custom Callback for direct JSON payloads
  public onInboundState?: (payload: any) => void;
}
