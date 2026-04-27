/**
 * Tests for the `cursorAt` extension on agent messaging — agent identity
 * extension from W.114 per-window-handle to (handle, chain, depth) per the
 * time-premise architectural memo at
 * `research/2026-04-27_time-premise-holoscript-architecture.md` §4.
 *
 * Covers: storage shape, sendMessage signature, validateCursor narrowing,
 * MCP tool dispatcher path, HTTP POST route path, and the rejection cases
 * for malformed cursor payloads.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  sendMessage,
  validateCursor,
  handleMessagingTool,
  handleMessagingRoute,
  _resetMessageStore,
  type MessageCursor,
} from '../messaging';

const ALICE = { id: 'agent-alice', name: 'alice' };
const BOB = { id: 'agent-bob', name: 'bob' };

// Stub agent resolver that maps a fixed API key to ALICE.
const resolver = (apiKey: string) => (apiKey === 'KEY-ALICE' ? ALICE : undefined);

describe('messaging cursorAt extension (agent identity = handle + chain + depth)', () => {
  beforeEach(() => {
    _resetMessageStore();
  });

  // ── validateCursor ──

  describe('validateCursor', () => {
    it('accepts a well-formed cursor', () => {
      const result = validateCursor({ chain: 'cael-room-7', depth: 42 });
      expect(result).toEqual({ chain: 'cael-room-7', depth: 42 });
    });

    it('accepts depth=0 (genesis cursor)', () => {
      const result = validateCursor({ chain: 'genesis', depth: 0 });
      expect('error' in result).toBe(false);
    });

    it('rejects undefined / null', () => {
      expect('error' in validateCursor(undefined)).toBe(true);
      expect('error' in validateCursor(null)).toBe(true);
    });

    it('rejects non-object inputs', () => {
      expect('error' in validateCursor('cursor-string')).toBe(true);
      expect('error' in validateCursor(123)).toBe(true);
      expect('error' in validateCursor(true)).toBe(true);
    });

    it('rejects empty chain string', () => {
      const r = validateCursor({ chain: '', depth: 5 });
      expect('error' in r).toBe(true);
      if ('error' in r) expect(r.error).toMatch(/chain/);
    });

    it('rejects negative depth', () => {
      const r = validateCursor({ chain: 'c', depth: -1 });
      expect('error' in r).toBe(true);
      if ('error' in r) expect(r.error).toMatch(/depth/);
    });

    it('rejects non-integer depth', () => {
      const r = validateCursor({ chain: 'c', depth: 1.5 });
      expect('error' in r).toBe(true);
      if ('error' in r) expect(r.error).toMatch(/integer/);
    });

    it('rejects non-number depth', () => {
      const r = validateCursor({ chain: 'c', depth: '3' });
      expect('error' in r).toBe(true);
    });
  });

  // ── sendMessage backward compat ──

  describe('sendMessage backward compat', () => {
    it('omitting cursorAt leaves the field absent (not null, not present-undefined)', () => {
      const msg = sendMessage(ALICE.id, ALICE.name, BOB.id, 'hello');
      expect('cursorAt' in msg).toBe(false);
    });

    it('explicitly passing undefined for cursorAt leaves the field absent', () => {
      const msg = sendMessage(ALICE.id, ALICE.name, BOB.id, 'hello', undefined, undefined);
      expect('cursorAt' in msg).toBe(false);
    });

    it('passing a cursor stores it on the message', () => {
      const cursor: MessageCursor = { chain: 'room-7', depth: 12 };
      const msg = sendMessage(ALICE.id, ALICE.name, BOB.id, 'hello', undefined, cursor);
      expect(msg.cursorAt).toEqual({ chain: 'room-7', depth: 12 });
    });
  });

  // ── MCP tool dispatcher ──

  describe('handleMessagingTool with cursor_at', () => {
    it('passes a valid cursor through to the stored message', async () => {
      const result = (await handleMessagingTool('holomesh_send_message', {
        _agentId: ALICE.id,
        _agentName: ALICE.name,
        to: BOB.id,
        content: 'standup',
        cursor_at: { chain: 'team-feed', depth: 100 },
      })) as { success: boolean; message: { cursorAt?: MessageCursor } };
      expect(result.success).toBe(true);
      expect(result.message.cursorAt).toEqual({ chain: 'team-feed', depth: 100 });
    });

    it('omitting cursor_at produces a message without cursorAt', async () => {
      const result = (await handleMessagingTool('holomesh_send_message', {
        _agentId: ALICE.id,
        _agentName: ALICE.name,
        to: BOB.id,
        content: 'no-cursor',
      })) as { success: boolean; message: { cursorAt?: MessageCursor } };
      expect(result.success).toBe(true);
      expect('cursorAt' in result.message).toBe(false);
    });

    it('rejects malformed cursor_at with an error string', async () => {
      const result = (await handleMessagingTool('holomesh_send_message', {
        _agentId: ALICE.id,
        _agentName: ALICE.name,
        to: BOB.id,
        content: 'bad cursor',
        cursor_at: { chain: 'room-7', depth: -3 },
      })) as { error?: string };
      expect(result.error).toMatch(/depth/);
    });
  });

  // ── HTTP route handler ──

  describe('handleMessagingRoute POST /messages with cursorAt', () => {
    it('accepts snake_case cursor_at (canonical REST convention)', async () => {
      const r = await handleMessagingRoute(
        '/api/holomesh/messages',
        'POST',
        { to: BOB.id, content: 'hi', cursor_at: { chain: 'room-7', depth: 5 } },
        'KEY-ALICE',
        resolver,
      );
      expect(r?.status).toBe(201);
      expect(r?.body.message.cursorAt).toEqual({ chain: 'room-7', depth: 5 });
    });

    it('accepts camelCase cursorAt as a fallback (clients that echo the storage key)', async () => {
      const r = await handleMessagingRoute(
        '/api/holomesh/messages',
        'POST',
        { to: BOB.id, content: 'hi', cursorAt: { chain: 'room-9', depth: 7 } },
        'KEY-ALICE',
        resolver,
      );
      expect(r?.status).toBe(201);
      expect(r?.body.message.cursorAt).toEqual({ chain: 'room-9', depth: 7 });
    });

    it('omitting cursor produces a 201 with no cursorAt on the stored message', async () => {
      const r = await handleMessagingRoute(
        '/api/holomesh/messages',
        'POST',
        { to: BOB.id, content: 'no cursor' },
        'KEY-ALICE',
        resolver,
      );
      expect(r?.status).toBe(201);
      expect('cursorAt' in r!.body.message).toBe(false);
    });

    it('rejects malformed cursor with a 400 and an error message naming the offending field', async () => {
      const r = await handleMessagingRoute(
        '/api/holomesh/messages',
        'POST',
        { to: BOB.id, content: 'bad', cursor_at: { chain: '', depth: 5 } },
        'KEY-ALICE',
        resolver,
      );
      expect(r?.status).toBe(400);
      expect(r?.body.error).toMatch(/chain/);
    });

    it('snake_case wins when both cursor_at and cursorAt are present (canonical REST form)', async () => {
      const r = await handleMessagingRoute(
        '/api/holomesh/messages',
        'POST',
        {
          to: BOB.id,
          content: 'both',
          cursor_at: { chain: 'snake', depth: 1 },
          cursorAt: { chain: 'camel', depth: 99 },
        },
        'KEY-ALICE',
        resolver,
      );
      expect(r?.status).toBe(201);
      expect(r?.body.message.cursorAt).toEqual({ chain: 'snake', depth: 1 });
    });
  });
});
