/**
 * @holoscript/playground acceptance tests
 * Covers: encodeState(), decodeState(), pushState(), readState()
 *         from sharing/url-encoder.ts
 *
 * Environment: Node (btoa/atob available in Node 18+).
 * CompressionStream may be absent; encoder falls back to v0 (plain base64).
 */
import { describe, it, expect } from 'vitest';
import { encodeState, decodeState, type PlaygroundState } from '../src/sharing/url-encoder';

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// encodeState
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('encodeState', () => {
  it('is a function', () => {
    expect(typeof encodeState).toBe('function');
  });

  it('returns a Promise', () => {
    const result = encodeState({ source: 'cube {}' });
    expect(result).toBeInstanceOf(Promise);
  });

  it('resolves to a non-empty string', async () => {
    const hash = await encodeState({ source: 'cube {}' });
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('starts with "#"', async () => {
    const hash = await encodeState({ source: 'sphere {}' });
    expect(hash.startsWith('#')).toBe(true);
  });

  it('contains version prefix (v0 or v1)', async () => {
    const hash = await encodeState({ source: 'cone {}' });
    expect(hash).toMatch(/^#v[01]\//);
  });

  it('encodes source successfully', async () => {
    const state: PlaygroundState = { source: 'cube { @color(red) }' };
    const hash = await encodeState(state);
    expect(hash.length).toBeGreaterThan(5);
  });

  it('encodes state with optional example field', async () => {
    const hash = await encodeState({ source: 'sphere {}', example: 'bouncing-ball' });
    expect(hash).toMatch(/^#v[01]\//);
  });

  it('encodes state with version field', async () => {
    const hash = await encodeState({ source: 'torus {}', version: 2 });
    expect(hash).toMatch(/^#v[01]\//);
  });

  it('different sources produce different hashes', async () => {
    const h1 = await encodeState({ source: 'cube {}' });
    const h2 = await encodeState({ source: 'sphere {}' });
    expect(h1).not.toBe(h2);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// decodeState
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('decodeState', () => {
  it('is a function', () => {
    expect(typeof decodeState).toBe('function');
  });

  it('returns a Promise', () => {
    const result = decodeState('#v0/abc');
    expect(result).toBeInstanceOf(Promise);
  });

  it('returns null for empty hash', async () => {
    expect(await decodeState('')).toBeNull();
  });

  it('returns null for malformed hash (no slash)', async () => {
    expect(await decodeState('#v0noSlash')).toBeNull();
  });

  it('returns null for unknown version prefix', async () => {
    expect(await decodeState('#v99/abc')).toBeNull();
  });

  it('returns null for garbage payload', async () => {
    // Invalid base64 â†’ JSON parse fails â†’ returns null
    expect(await decodeState('#v0/!!!invalid!!!')).toBeNull();
  });

  it('round-trips source correctly', async () => {
    const original: PlaygroundState = { source: 'cube { @color(red) }' };
    const hash = await encodeState(original);
    const decoded = await decodeState(hash);
    expect(decoded).not.toBeNull();
    expect(decoded!.source).toBe(original.source);
  });

  it('round-trips source + example field', async () => {
    const original: PlaygroundState = { source: 'sphere {}', example: 'orb' };
    const hash = await encodeState(original);
    const decoded = await decodeState(hash);
    expect(decoded!.source).toBe('sphere {}');
    expect(decoded!.example).toBe('orb');
  });

  it('decoded state has required source field as string', async () => {
    const hash = await encodeState({ source: 'test code' });
    const decoded = await decodeState(hash);
    expect(typeof decoded!.source).toBe('string');
  });

  it('handles large source without error', async () => {
    const source = 'cube { @color(red) }\n'.repeat(100);
    const hash = await encodeState({ source });
    const decoded = await decodeState(hash);
    expect(decoded!.source).toBe(source);
  });
});
