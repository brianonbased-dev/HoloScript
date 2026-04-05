import { logger } from '../logger';

export interface NetworkUpdate {
  entityId: string;
  senderId: string;
  type: 'property' | 'state' | 'event';
  payload: Record<string, any>;
  timestamp: number;
}

export type UpdateCallback = (update: NetworkUpdate) => void;

/**
 * LocalNetworkAdapter - Syncs state across local browser instances
 */
export class LocalNetworkAdapter {
  private channel: BroadcastChannel | null = null;
  private senderId: string;
  private callbacks: Set<UpdateCallback> = new Set();
  private channelName: string;

  constructor(projectId: string = 'default-project') {
    this.channelName = `holoscript:sync:${projectId}`;
    this.senderId = Math.random().toString(36).substring(2, 11);
  }

  /**
   * Connect to the sync channel
   */
  public connect(): void {
    if (this.channel) return;

    try {
      this.channel = new BroadcastChannel(this.channelName);
      this.channel.onmessage = (event) => {
        const update = event.data as NetworkUpdate;
        if (update.senderId !== this.senderId) {
          this.notify(update);
        }
      };
      logger.info(`[LocalNetworkAdapter] Connected to ${this.channelName} (ID: ${this.senderId})`);
    } catch (error) {
      logger.error(`[LocalNetworkAdapter] Failed to connect: ${error}`);
    }
  }

  /**
   * Disconnect from the sync channel
   */
  public disconnect(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
      logger.info('[LocalNetworkAdapter] Disconnected');
    }
  }

  /**
   * Broadcast a property or state update
   */
  public broadcast(
    entityId: string,
    type: NetworkUpdate['type'],
    payload: Record<string, any>
  ): void {
    if (!this.channel) return;

    const update: NetworkUpdate = {
      entityId,
      senderId: this.senderId,
      type,
      payload,
      timestamp: Date.now(),
    };

    this.channel.postMessage(update);
  }

  /**
   * Subscribe to network updates
   */
  public subscribe(callback: UpdateCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  private notify(update: NetworkUpdate): void {
    for (const callback of this.callbacks) {
      callback(update);
    }
  }

  public getSenderId(): string {
    return this.senderId;
  }
}

export function createLocalNetworkAdapter(projectId?: string): LocalNetworkAdapter {
  return new LocalNetworkAdapter(projectId);
}
