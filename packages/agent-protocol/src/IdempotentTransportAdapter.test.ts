import { describe, it, expect, vi } from 'vitest';
import {
  IdempotentTransportAdapter,
  type A2ATransportLike,
} from './IdempotentTransportAdapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockTransport(fn?: (input: unknown) => Promise<unknown>): A2ATransportLike {
  return {
    send: vi.fn(fn ?? (async () => ({ ok: true }))),
  };
}

function makeFetchFn() {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response('ok', { status: 200 })
  );
}

function makeInput(key = 'key-1', body: Record<string, unknown> = { data: 1 }) {
  return {
    endpointUrl: 'https://example.com/a2a',
    requestBody: body,
    idempotencyKey: key,
    fetchFn: makeFetchFn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IdempotentTransportAdapter', () => {
  // ---- Basic forwarding ----

  it('forwards a fresh request to the base transport', async () => {
    const base = mockTransport();
    const adapter = new IdempotentTransportAdapter(base);

    const input = makeInput();
    const result = await adapter.send(input);

    expect(result).toEqual({ ok: true });
    expect(base.send).toHaveBeenCalledTimes(1);
  });

  // ---- Deduplication ----

  it('returns cached response for duplicate idempotency key', async () => {
    const base = mockTransport(async () => ({ value: 42 }));
    const adapter = new IdempotentTransportAdapter(base);

    const input1 = makeInput('dup-key');
    const input2 = makeInput('dup-key');

    await adapter.send(input1);
    const result = await adapter.send(input2);

    expect(result).toEqual({ value: 42 });
    expect(base.send).toHaveBeenCalledTimes(1); // only called once
  });

  it('does NOT deduplicate different idempotency keys', async () => {
    const base = mockTransport();
    const adapter = new IdempotentTransportAdapter(base);

    await adapter.send(makeInput('key-a'));
    await adapter.send(makeInput('key-b'));

    expect(base.send).toHaveBeenCalledTimes(2);
  });

  // ---- TTL expiration ----

  it('re-sends after TTL expires', async () => {
    let time = 1000;
    const base = mockTransport();
    const adapter = new IdempotentTransportAdapter(base, {
      ttlMs: 5000,
      now: () => time,
    });

    await adapter.send(makeInput('ttl-key'));
    expect(base.send).toHaveBeenCalledTimes(1);

    // Still within TTL
    time = 4000;
    await adapter.send(makeInput('ttl-key'));
    expect(base.send).toHaveBeenCalledTimes(1);

    // Past TTL
    time = 7000;
    await adapter.send(makeInput('ttl-key'));
    expect(base.send).toHaveBeenCalledTimes(2);
  });

  // ---- Idempotency header injection ----

  it('injects the idempotency header into fetch calls', async () => {
    const capturedHeaders: Headers[] = [];
    const base: A2ATransportLike = {
      send: async (input) => {
        // Call the wrapped fetchFn to trigger header injection
        const resp = await input.fetchFn(input.endpointUrl, {
          method: 'POST',
          body: JSON.stringify(input.requestBody),
        });
        return { status: resp.status };
      },
    };

    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedHeaders.push(new Headers(init?.headers));
      return new Response('ok', { status: 200 });
    });

    const adapter = new IdempotentTransportAdapter(base);
    await adapter.send({
      endpointUrl: 'https://example.com/a2a',
      requestBody: { test: true },
      idempotencyKey: 'hdr-key-123',
      fetchFn,
    });

    expect(capturedHeaders.length).toBe(1);
    expect(capturedHeaders[0].get('X-Idempotency-Key')).toBe('hdr-key-123');
  });

  it('uses a custom header name when configured', async () => {
    const capturedHeaders: Headers[] = [];
    const base: A2ATransportLike = {
      send: async (input) => {
        await input.fetchFn(input.endpointUrl, {});
        return {};
      },
    };

    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      capturedHeaders.push(new Headers(init?.headers));
      return new Response('ok');
    });

    const adapter = new IdempotentTransportAdapter(base, {
      idempotencyHeader: 'X-Request-Id',
    });

    await adapter.send({
      endpointUrl: 'https://example.com',
      requestBody: {},
      idempotencyKey: 'custom-hdr',
      fetchFn,
    });

    expect(capturedHeaders[0].get('X-Request-Id')).toBe('custom-hdr');
  });

  // ---- Error handling ----

  it('does NOT cache failed requests, allowing retry', async () => {
    let callCount = 0;
    const base = mockTransport(async () => {
      callCount++;
      if (callCount === 1) throw new Error('network error');
      return { recovered: true };
    });

    const adapter = new IdempotentTransportAdapter(base);
    const input = makeInput('err-key');

    await expect(adapter.send(input)).rejects.toThrow('network error');
    const result = await adapter.send(makeInput('err-key'));

    expect(result).toEqual({ recovered: true });
    expect(base.send).toHaveBeenCalledTimes(2);
  });

  // ---- Concurrent deduplication (inflight coalescing) ----

  it('coalesces concurrent requests with the same key', async () => {
    let resolvePromise: (v: unknown) => void;
    const base = mockTransport(
      () => new Promise((resolve) => { resolvePromise = resolve; })
    );

    const adapter = new IdempotentTransportAdapter(base);

    const p1 = adapter.send(makeInput('coalesce-key'));
    const p2 = adapter.send(makeInput('coalesce-key'));

    // Both should be waiting on the same promise
    resolvePromise!({ coalesced: true });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ coalesced: true });
    expect(r2).toEqual({ coalesced: true });
    expect(base.send).toHaveBeenCalledTimes(1);
  });

  // ---- Cache size limit ----

  it('evicts oldest entries when maxCacheSize is reached', async () => {
    const base = mockTransport(async () => ({ ok: true }));
    const adapter = new IdempotentTransportAdapter(base, { maxCacheSize: 3 });

    await adapter.send(makeInput('k1'));
    await adapter.send(makeInput('k2'));
    await adapter.send(makeInput('k3'));
    expect(adapter.size).toBe(3);

    // Adding a 4th should evict the oldest (k1)
    await adapter.send(makeInput('k4'));
    expect(adapter.size).toBe(3);
    expect(adapter.has('k1')).toBe(false);
    expect(adapter.has('k4')).toBe(true);
  });

  // ---- prune() ----

  it('prune() removes expired entries', async () => {
    let time = 0;
    const base = mockTransport();
    const adapter = new IdempotentTransportAdapter(base, {
      ttlMs: 100,
      now: () => time,
    });

    await adapter.send(makeInput('prune-1'));
    time = 50;
    await adapter.send(makeInput('prune-2'));

    time = 150; // prune-1 expired, prune-2 still alive
    const pruned = adapter.prune();

    expect(pruned).toBe(1);
    expect(adapter.has('prune-1')).toBe(false);
    expect(adapter.has('prune-2')).toBe(true);
  });

  // ---- has() ----

  it('has() returns false for unknown keys', () => {
    const adapter = new IdempotentTransportAdapter(mockTransport());
    expect(adapter.has('unknown')).toBe(false);
  });

  it('has() returns false and cleans up expired keys', async () => {
    let time = 0;
    const adapter = new IdempotentTransportAdapter(mockTransport(), {
      ttlMs: 100,
      now: () => time,
    });

    await adapter.send(makeInput('exp-key'));
    expect(adapter.has('exp-key')).toBe(true);

    time = 200;
    expect(adapter.has('exp-key')).toBe(false);
    expect(adapter.size).toBe(0); // cleaned up
  });

  // ---- clear() ----

  it('clear() empties the cache', async () => {
    const adapter = new IdempotentTransportAdapter(mockTransport());
    await adapter.send(makeInput('c1'));
    await adapter.send(makeInput('c2'));
    expect(adapter.size).toBe(2);

    adapter.clear();
    expect(adapter.size).toBe(0);
  });

  // ---- sendWithStatus() ----

  it('sendWithStatus returns fresh for new requests', async () => {
    const base = mockTransport(async () => ({ fresh: true }));
    const adapter = new IdempotentTransportAdapter(base);

    const result = await adapter.sendWithStatus(makeInput('status-1'));
    expect(result.status).toBe('fresh');
    expect(result.cached).toBe(false);
    expect(result.response).toEqual({ fresh: true });
  });

  it('sendWithStatus returns deduped for cached requests', async () => {
    const base = mockTransport(async () => ({ val: 1 }));
    const adapter = new IdempotentTransportAdapter(base);

    await adapter.send(makeInput('status-2'));
    const result = await adapter.sendWithStatus(makeInput('status-2'));

    expect(result.status).toBe('deduped');
    expect(result.cached).toBe(true);
    expect(result.response).toEqual({ val: 1 });
  });

  it('sendWithStatus returns error status on failure', async () => {
    const base = mockTransport(async () => { throw new Error('boom'); });
    const adapter = new IdempotentTransportAdapter(base);

    const result = await adapter.sendWithStatus(makeInput('status-err'));
    expect(result.status).toBe('error');
    expect(result.cached).toBe(false);
    expect(result.response).toBeInstanceOf(Error);
  });
});
