/**
 * NetEventBus — Reliable/unreliable network event channels
 *
 * @version 1.0.0
 */

export type ChannelReliability = 'reliable' | 'unreliable' | 'ordered';

export interface NetChannel {
  id: string;
  reliability: ChannelReliability;
  handlers: Map<string, ((payload: unknown) => void)[]>;
  messageCount: number;
  bytesTransferred: number;
}

export interface NetMessage {
  channel: string;
  event: string;
  payload: unknown;
  senderId: string;
  timestamp: number;
  sequenceId: number;
}

export class NetEventBus {
  private channels: Map<string, NetChannel> = new Map();
  private outbox: NetMessage[] = [];
  private inbox: NetMessage[] = [];
  private sequence: number = 0;
  private maxBatchSize: number;
  private localId: string;

  constructor(localId: string = 'local', maxBatchSize: number = 32) {
    this.localId = localId;
    this.maxBatchSize = maxBatchSize;
  }

  /**
   * Create a channel
   */
  createChannel(id: string, reliability: ChannelReliability = 'reliable'): NetChannel {
    const channel: NetChannel = {
      id,
      reliability,
      handlers: new Map(),
      messageCount: 0,
      bytesTransferred: 0,
    };
    this.channels.set(id, channel);
    return channel;
  }

  /**
   * Subscribe to an event on a channel
   */
  subscribe(channelId: string, event: string, handler: (payload: unknown) => void): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;
    if (!channel.handlers.has(event)) channel.handlers.set(event, []);
    channel.handlers.get(event)!.push(handler);
    return true;
  }

  /**
   * Send a message on a channel
   */
  send(channelId: string, event: string, payload: unknown): boolean {
    const channel = this.channels.get(channelId);
    if (!channel) return false;

    const msg: NetMessage = {
      channel: channelId,
      event,
      payload,
      senderId: this.localId,
      timestamp: Date.now(),
      sequenceId: this.sequence++,
    };

    this.outbox.push(msg);
    channel.messageCount++;
    channel.bytesTransferred += JSON.stringify(payload).length;
    return true;
  }

  /**
   * Receive and dispatch a message
   */
  receive(msg: NetMessage): void {
    this.inbox.push(msg);
    const channel = this.channels.get(msg.channel);
    if (!channel) return;

    const handlers = channel.handlers.get(msg.event);
    if (handlers) {
      for (const h of handlers) {
        try {
          h(msg.payload);
        } catch {
          /* isolate */
        }
      }
    }
  }

  /**
   * Flush outbox and return batch
   */
  flush(): NetMessage[] {
    const batch = this.outbox.splice(0, this.maxBatchSize);
    return batch;
  }

  /**
   * Get outbox size
   */
  getOutboxSize(): number {
    return this.outbox.length;
  }
  getInboxSize(): number {
    return this.inbox.length;
  }
  getChannelCount(): number {
    return this.channels.size;
  }
  getChannel(id: string): NetChannel | undefined {
    return this.channels.get(id);
  }
}
