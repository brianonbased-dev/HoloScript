import { describe, it, expect } from 'vitest';
import { parsePeerRegistry, resolvePeer, type PeerEntry } from '../peer-registry.js';

describe('parsePeerRegistry', () => {
  it('parses a valid JSON array, dropping entries without baseUrl', () => {
    const raw = JSON.stringify([
      {
        handle: 'laptop',
        baseUrl: 'http://192.168.0.23:11434',
        model: 'qwen3:4b-instruct',
        capabilities: ['hardware'],
      },
      { handle: 'bad' }, // no baseUrl → dropped
    ]);
    const reg = parsePeerRegistry(raw);
    expect(reg).toHaveLength(1);
    expect(reg[0].handle).toBe('laptop');
  });

  it('returns [] for empty, malformed, or non-array input', () => {
    expect(parsePeerRegistry(undefined)).toEqual([]);
    expect(parsePeerRegistry('')).toEqual([]);
    expect(parsePeerRegistry('not json')).toEqual([]);
    expect(parsePeerRegistry('{"baseUrl":"x"}')).toEqual([]); // object, not array
  });
});

describe('resolvePeer', () => {
  const reg: PeerEntry[] = [
    { handle: 'jetson', baseUrl: 'http://jetson:11434', capabilities: ['edge', 'inference'] },
    { handle: 'laptop', baseUrl: 'http://laptop:11434', capabilities: ['hardware', 'inference'] },
    { handle: 'fleet', baseUrl: 'http://fleet:11434', capabilities: ['inference'] },
  ];

  it('returns null for an empty registry (→ caller falls back)', () => {
    expect(resolvePeer([], { capability: 'hardware' })).toBeNull();
  });

  it('filters by capability', () => {
    expect(resolvePeer(reg, { capability: 'hardware' })?.handle).toBe('laptop');
  });

  it('returns null when the requested capability is offered by no peer', () => {
    // don't route a "quantum" question to an unrelated peer — fail to the fallback chain
    expect(resolvePeer(reg, { capability: 'quantum' })).toBeNull();
  });

  it('round-robins by seat across the peers that match the capability', () => {
    const opt = { capability: 'inference' as const };
    expect(resolvePeer(reg, { ...opt, seat: 0 })?.handle).toBe('jetson');
    expect(resolvePeer(reg, { ...opt, seat: 1 })?.handle).toBe('laptop');
    expect(resolvePeer(reg, { ...opt, seat: 2 })?.handle).toBe('fleet');
    expect(resolvePeer(reg, { ...opt, seat: 3 })?.handle).toBe('jetson'); // wraps
  });

  it('with no capability, any peer is a candidate (capability-agnostic diversity)', () => {
    expect(resolvePeer(reg, { seat: 1 })?.handle).toBe('laptop');
  });
});
