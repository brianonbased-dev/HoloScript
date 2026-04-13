import { ISignalingBridge, NeuralSignalPayload } from './NeuralStreamingTransport.js';

/**
 * Concrete implementation of ISignalingBridge using a dedicated WebSocket connection.
 * Communicates with the WebRTCSignalingServer hosted on the mcp-server.
 */
export class WebSocketSignaler implements ISignalingBridge {
  public targetPeerId: string;
  private ws: WebSocket | null = null;
  private receiveHandler: ((payload: NeuralSignalPayload) => void) | null = null;
  private isConnected = false;
  private queuedSignals: NeuralSignalPayload[] = [];
  private endpointUrl: string;
  private localPeerId: string;

  constructor(endpointUrl: string, localPeerId: string, targetPeerId: string) {
    this.endpointUrl = endpointUrl;
    this.localPeerId = localPeerId;
    this.targetPeerId = targetPeerId;
  }

  public async connect(): Promise<void> {
    if (this.isConnected) return;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.endpointUrl);

      this.ws.onopen = () => {
        this.isConnected = true;

        // Identify ourselves to the signaling server
        this.ws?.send(
          JSON.stringify({
            type: 'identify',
            peerId: this.localPeerId,
          })
        );

        // Flush any queued signals
        for (const signal of this.queuedSignals) {
          this.ws?.send(
            JSON.stringify({
              type: 'signal',
              targetId: this.targetPeerId,
              sourceId: this.localPeerId,
              payload: signal,
            })
          );
        }
        this.queuedSignals = [];
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data.toString());
          if (data.type === 'signal' && data.payload) {
            // Ensure the signal is from our target peer to prevent crossed streams
            if (data.sourceId === this.targetPeerId && this.receiveHandler) {
              this.receiveHandler(data.payload as NeuralSignalPayload);
            }
          }
        } catch (err) {
          console.error('[WebSocketSignaler] Failed to parse incoming signal', err);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[WebSocketSignaler] WebSocket error', err);
        reject(err);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        console.warn('[WebSocketSignaler] WebSocket disconnected');
      };
    });
  }

  public onReceiveSignal(handler: (payload: NeuralSignalPayload) => void): void {
    this.receiveHandler = handler;
  }

  public async sendSignal(payload: NeuralSignalPayload): Promise<void> {
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.queuedSignals.push(payload);
      // Try to connect if we haven't already
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this.connect().catch((err) =>
          console.error('[WebSocketSignaler] Auto-connect failed', err)
        );
      }
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: 'signal',
        targetId: this.targetPeerId,
        sourceId: this.localPeerId,
        payload,
      })
    );
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}
