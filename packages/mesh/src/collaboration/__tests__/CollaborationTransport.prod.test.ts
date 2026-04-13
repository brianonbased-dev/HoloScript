/**
 * CollaborationTransport Production Tests
 *
 * Tests binary message encoding/decoding, constructor/config defaults,
 * state management, stats, and handler registration.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  CollaborationTransport,
  encodeSyncMessage,
  decodeSyncMessage,
} from '@holoscript/core';
import type { SyncMessage } from '@holoscript/core';

describe('CollaborationTransport — Production', () => {
  // ─── Message Encoding/Decoding ────────────────────────────────────────────

  it('encode/decode roundtrip preserves message', () => {
    const msg: SyncMessage = {
      type: 'doc-update',
      sessionId: 'sess-1',
      peerId: 'alice',
      filePath: 'zones/main.hsplus',
      data: new Uint8Array([1, 2, 3, 4]),
      timestamp: 1700000000000,
    };
    const encoded = encodeSyncMessage(msg);
    const decoded = decodeSyncMessage(encoded);
    expect(decoded.type).toBe('doc-update');
    expect(decoded.sessionId).toBe('sess-1');
    expect(decoded.peerId).toBe('alice');
    expect(decoded.filePath).toBe('zones/main.hsplus');
    expect(decoded.timestamp).toBe(1700000000000);
    expect(new Uint8Array(decoded.data!)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('encode/decode without optional fields', () => {
    const msg: SyncMessage = {
      type: 'awareness',
      sessionId: 's2',
      peerId: 'bob',
      timestamp: Date.now(),
    };
    const encoded = encodeSyncMessage(msg);
    const decoded = decodeSyncMessage(encoded);
    expect(decoded.type).toBe('awareness');
    expect(decoded.sessionId).toBe('s2');
    expect(decoded.peerId).toBe('bob');
  });

  it('encode/decode with metadata', () => {
    const msg: SyncMessage = {
      type: 'peer-joined',
      sessionId: 's3',
      peerId: 'carol',
      metadata: { role: 'editor', version: 2 },
      timestamp: Date.now(),
    };
    const encoded = encodeSyncMessage(msg);
    const decoded = decodeSyncMessage(encoded);
    expect(decoded.metadata).toEqual({ role: 'editor', version: 2 });
  });

  it('encode produces Uint8Array', () => {
    const msg: SyncMessage = {
      type: 'heartbeat',
      sessionId: 'h1',
      peerId: 'p1',
      timestamp: Date.now(),
    };
    const encoded = encodeSyncMessage(msg);
    expect(encoded).toBeInstanceOf(Uint8Array);
    expect(encoded.length).toBeGreaterThan(0);
  });

  // ─── Constructor/Config ───────────────────────────────────────────────────

  it('constructor with defaults', () => {
    const transport = new CollaborationTransport();
    expect(transport.getState()).toBe('closed');
  });

  it('constructor with custom config', () => {
    const transport = new CollaborationTransport({
      sessionId: 'my-session',
      peerId: 'my-peer',
      heartbeatInterval: 5000,
    });
    expect(transport.getState()).toBe('closed');
  });

  // ─── State & Stats ────────────────────────────────────────────────────────

  it('getStats returns zeroed counters', () => {
    const transport = new CollaborationTransport();
    const stats = transport.getStats();
    expect(stats.state).toBe('closed');
    expect(stats.messagesSent).toBe(0);
    expect(stats.messagesReceived).toBe(0);
    expect(stats.bytesSent).toBe(0);
    expect(stats.bytesReceived).toBe(0);
    expect(stats.reconnectCount).toBe(0);
  });

  // ─── Handler Registration ────────────────────────────────────────────────

  it('onMessage/offMessage registration', () => {
    const transport = new CollaborationTransport();
    const handler = vi.fn();
    transport.onMessage(handler);
    transport.offMessage(handler);
    // Just verifies no errors thrown during registration cycle
  });

  it('onError/offError registration', () => {
    const transport = new CollaborationTransport();
    const handler = vi.fn();
    transport.onError(handler);
    transport.offError(handler);
  });

  it('onStateChange/offStateChange registration', () => {
    const transport = new CollaborationTransport();
    const handler = vi.fn();
    transport.onStateChange(handler);
    transport.offStateChange(handler);
  });
});
