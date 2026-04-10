import type { ISignalingBridge, NeuralSignalPayload } from '@holoscript/core';
import { sendMessage, getInbox, markRead } from './messaging.js';

const SIGNAL_PREFIX = '__NEURAL_SIGNAL__:';

/**
 * HoloMeshSignaler
 *
 * Implements the ISignalingBridge interface using HoloMesh's A2A messaging layer.
 * Enables establishing WebRTC RTCPeerConnections over the mesh without a dedicated
 * WebSocket signaling server, bridging Pillar 2 (Neural Streaming) with the HoloMesh Gossip layer.
 */
export class HoloMeshSignaler implements ISignalingBridge {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private signalHandler: ((payload: NeuralSignalPayload) => void) | null = null;

  constructor(
    public readonly localAgentId: string,
    public readonly localAgentName: string,
    public readonly targetPeerId: string,
    private pollRateMs: number = 500
  ) {}

  /**
   * Registers a callback to receive incoming SDP offers, answers, and ICE candidates.
   * Starts the inbox polling loop to check for __NEURAL_SIGNAL__ messages.
   */
  public onReceiveSignal(handler: (payload: NeuralSignalPayload) => void): void {
    this.signalHandler = handler;
    this.startPolling();
  }

  /**
   * Dispatches a signaling payload over the HoloMesh A2A messaging pipeline.
   */
  public async sendSignal(payload: NeuralSignalPayload): Promise<void> {
    try {
      const content = `${SIGNAL_PREFIX}${JSON.stringify(payload)}`;
      sendMessage(this.localAgentId, this.localAgentName, this.targetPeerId, content);
      // console.log(`[HoloMeshSignaler] Sent out-of-band signal`, { to: this.targetPeerId, type: payload.type });
    } catch (err) {
      console.error(`[HoloMeshSignaler] Failed to send signal to ${this.targetPeerId}`, err);
      throw err;
    }
  }

  /**
   * Polls the inbox for unread messages matching the target peer ID and the signal prefix.
   */
  private startPolling(): void {
    if (this.pollingInterval) return;

    this.pollingInterval = setInterval(() => {
      if (!this.signalHandler) return;

      const unreadMessages = getInbox(this.localAgentId, true);

      for (const msg of unreadMessages) {
        if (msg.fromAgent === this.targetPeerId && msg.content.startsWith(SIGNAL_PREFIX)) {
          // Parse the signal
          try {
            const rawJson = msg.content.substring(SIGNAL_PREFIX.length);
            const payload = JSON.parse(rawJson) as NeuralSignalPayload;

            // Mark read so we don't process it again
            markRead(msg.id, this.localAgentId);

            // Pass to the transport layer
            this.signalHandler(payload);
          } catch (e) {
            console.warn(
              `[HoloMeshSignaler] Failed to parse incoming signal from ${this.targetPeerId}`,
              e
            );
          }
        }
      }
    }, this.pollRateMs);
  }

  /**
   * Stops polling the inbox.
   */
  public destroy(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.signalHandler = null;
  }
}
