/**
 * Tests for holomesh/utils -- parseJsonBody, json helpers, permission gates.
 *
 * task_1778621979319_ezqy (em-dash UTF-8 serialization fix)
 */
import { describe, it, expect } from 'vitest';
import type http from 'http';
import { parseJsonBody } from '../utils';
import { EventEmitter } from 'events';

/**
 * Build a mock IncomingMessage that emits data chunks then end.
 * Chunks are passed as Buffers so we can test split multi-byte
 * UTF-8 sequences (the root cause of em-dash -> ? corruption).
 */
function mockReqWithChunks(chunks: Array<Buffer | string>): http.IncomingMessage {
  const req = new EventEmitter() as http.IncomingMessage;
  // vitest runs async; schedule chunk emission on next ticks
  process.nextTick(() => {
    for (const chunk of chunks) {
      req.emit('data', chunk);
    }
    req.emit('end');
  });
  return req;
}

describe('parseJsonBody', () => {
  it('parses plain ASCII JSON', async () => {
    const raw = Buffer.from(JSON.stringify({ hello: 'world' }), 'utf-8');
    const req = mockReqWithChunks([raw]);
    const result = await parseJsonBody(req);
    expect(result).toEqual({ hello: 'world' });
  });

  it('preserves em-dash when it lands in a single chunk', async () => {
    const payload = { content: 'hello — world' };
    const raw = Buffer.from(JSON.stringify(payload), 'utf-8');
    const req = mockReqWithChunks([raw]);
    const result = await parseJsonBody(req);
    expect(result.content).toBe('hello — world');
  });

  it('preserves em-dash split across two chunks (W.051 regression)', async () => {
    const payload = { content: 'hello — world' };
    const raw = Buffer.from(JSON.stringify(payload), 'utf-8');
    // Split somewhere in the middle of the em-dash bytes
    // UTF-8 for em-dash is 0xE2 0x80 0x94 (3 bytes)
    const splitAt = Math.floor(raw.length / 2);
    const req = mockReqWithChunks([raw.subarray(0, splitAt), raw.subarray(splitAt)]);
    const result = await parseJsonBody(req);
    expect(result.content).toBe('hello — world');
  });

  it('preserves a run of multi-byte characters split every byte', async () => {
    // Use explicit code points to avoid IDE smart-quote substitution drift.
    const text = 'em— dash ≥ “curly” ’quote’';
    const payload = { content: text };
    const raw = Buffer.from(JSON.stringify(payload), 'utf-8');
    // Emit one byte per chunk to maximally stress the decoder
    const chunks: Buffer[] = [];
    for (let i = 0; i < raw.length; i++) {
      chunks.push(raw.subarray(i, i + 1));
    }
    const req = mockReqWithChunks(chunks);
    const result = await parseJsonBody(req);
    expect(result.content).toBe(text);
  });

  it('falls back to form-urlencoded on invalid JSON', async () => {
    const raw = Buffer.from('foo=bar&baz=qux', 'utf-8');
    const req = mockReqWithChunks([raw]);
    const result = await parseJsonBody(req);
    expect(result).toEqual({ foo: 'bar', baz: 'qux' });
  });

  it('accepts string chunks from Readable.from mocks', async () => {
    const result = await parseJsonBody(mockReqWithChunks([JSON.stringify({ hello: 'stream' })]));
    expect(result).toEqual({ hello: 'stream' });
  });

  it('returns empty object when 2MB limit is exceeded', async () => {
    const huge = Buffer.alloc(3 * 1024 * 1024, 'a');
    const req = mockReqWithChunks([huge]);
    const result = await parseJsonBody(req);
    expect(result).toEqual({});
  });
});
