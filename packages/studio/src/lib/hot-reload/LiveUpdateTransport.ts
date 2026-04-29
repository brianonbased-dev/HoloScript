/**
 * LiveUpdateTransport — Push LiveUpdateProtocol messages between
 * Studio editor and preview renderer.
 *
 * Supports three transports:
 *   1. BroadcastChannel — fastest, same-origin tabs only.
 *   2. WebSocket — cross-origin / server-mediated.
 *   3. EventTarget — in-process fallback (same JS context).
 *
 * @package @holoscript/studio
 */

import {
  type LiveUpdateMessage,
  serializeMessage,
  deserializeMessage,
} from './LiveUpdateProtocol';

export interface Transport {
  /** True when the transport is connected and ready to send. */
  connected: boolean;
  /** Send a message. */
  send(msg: LiveUpdateMessage): void;
  /** Register a message handler. Returns unsubscribe function. */
  onMessage(handler: (msg: LiveUpdateMessage) => void): () => void;
  /** Clean up resources. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// BroadcastChannel transport (same-origin tabs)
// ---------------------------------------------------------------------------

const BROADCAST_CHANNEL_NAME = 'holoscript-live-update';

export class BroadcastChannelTransport implements Transport {
  private channel: BroadcastChannel;
  private handlers = new Set<(msg: LiveUpdateMessage) => void>();
  private _connected = true;

  get connected(): boolean {
    return this._connected;
  }

  constructor() {
    this.channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    this.channel.onmessage = (ev) => {
      const msg = typeof ev.data === 'string' ? deserializeMessage(ev.data) : null;
      if (msg) {
        for (const h of this.handlers) h(msg);
      }
    };
    this.channel.onmessageerror = () => {
      this._connected = false;
    };
  }

  send(msg: LiveUpdateMessage): void {
    if (!this._connected) return;
    this.channel.postMessage(serializeMessage(msg));
  }

  onMessage(handler: (msg: LiveUpdateMessage) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  dispose(): void {
    this._connected = false;
    this.handlers.clear();
    this.channel.close();
  }
}

// ---------------------------------------------------------------------------
// WebSocket transport
// ---------------------------------------------------------------------------

export interface WebSocketTransportOptions {
  url: string;
  reconnect?: boolean;
  reconnectDelayMs?: number;
}

export class WebSocketTransport implements Transport {
  private ws: WebSocket | null = null;
  private handlers = new Set<(msg: LiveUpdateMessage) => void>();
  private options: Required<WebSocketTransportOptions>;
  private _connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  get connected(): boolean {
    return this._connected;
  }

  constructor(options: WebSocketTransportOptions) {
    this.options = {
      reconnect: true,
      reconnectDelayMs: 2000,
      ...options,
    };
    this.connect();
  }

  private connect(): void {
    if (this.disposed) return;
    try {
      this.ws = new WebSocket(this.options.url);
      this.ws.onopen = () => {
        this._connected = true;
      };
      this.ws.onmessage = (ev) => {
        const msg = typeof ev.data === 'string' ? deserializeMessage(ev.data) : null;
        if (msg) {
          for (const h of this.handlers) h(msg);
        }
      };
      this.ws.onclose = () => {
        this._connected = false;
        if (this.options.reconnect && !this.disposed) {
          this.reconnectTimer = setTimeout(() => this.connect(), this.options.reconnectDelayMs);
        }
      };
      this.ws.onerror = () => {
        this._connected = false;
      };
    } catch {
      this._connected = false;
      if (this.options.reconnect && !this.disposed) {
        this.reconnectTimer = setTimeout(() => this.connect(), this.options.reconnectDelayMs);
      }
    }
  }

  send(msg: LiveUpdateMessage): void {
    if (!this._connected || !this.ws) return;
    try {
      this.ws.send(serializeMessage(msg));
    } catch {
      this._connected = false;
    }
  }

  onMessage(handler: (msg: LiveUpdateMessage) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.handlers.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

// ---------------------------------------------------------------------------
// In-process EventTarget transport (same JS context, testing)
// ---------------------------------------------------------------------------

export class EventTargetTransport implements Transport {
  private target = new EventTarget();
  private handlers = new Set<(msg: LiveUpdateMessage) => void>();
  private _connected = true;

  get connected(): boolean {
    return this._connected;
  }

  send(msg: LiveUpdateMessage): void {
    if (!this._connected) return;
    this.target.dispatchEvent(new CustomEvent('msg', { detail: msg }));
  }

  onMessage(handler: (msg: LiveUpdateMessage) => void): () => void {
    const wrapped = (ev: Event) => {
      handler((ev as CustomEvent).detail as LiveUpdateMessage);
    };
    this.target.addEventListener('msg', wrapped);
    this.handlers.add(handler);
    return () => {
      this.target.removeEventListener('msg', wrapped);
      this.handlers.delete(handler);
    };
  }

  dispose(): void {
    this._connected = false;
    this.handlers.clear();
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export interface TransportFactoryOptions {
  /** 'broadcast' | 'websocket' | 'event' */
  kind: 'broadcast' | 'websocket' | 'event';
  /** Required when kind === 'websocket' */
  wsUrl?: string;
}

export function createTransport(options: TransportFactoryOptions): Transport {
  switch (options.kind) {
    case 'broadcast':
      return new BroadcastChannelTransport();
    case 'websocket':
      return new WebSocketTransport({ url: options.wsUrl! });
    case 'event':
      return new EventTargetTransport();
    default:
      throw new Error(`Unknown transport kind: ${(options as TransportFactoryOptions).kind}`);
  }
}
