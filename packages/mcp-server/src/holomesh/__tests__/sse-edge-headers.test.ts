import { describe, it, expect } from 'vitest';
import type http from 'http';
import { applyEdgeSafeSseHeaders } from '../sse-edge-headers';

describe('applyEdgeSafeSseHeaders', () => {
  it('sets anti-buffering and no-store headers for SSE through CDNs', () => {
    const headers: Record<string, string | number> = {};
    const res = {
      setHeader(name: string, value: string | number) {
        headers[name.toLowerCase()] = value;
      },
    } as http.ServerResponse;

    applyEdgeSafeSseHeaders(res);

    expect(headers['cache-control']).toContain('no-store');
    expect(headers['cdn-cache-control']).toContain('no-store');
    expect(headers['x-accel-buffering']).toBe('no');
    expect(headers['surrogate-control']).toBe('no-store');
    expect(headers['x-content-type-options']).toBe('nosniff');
  });
});
