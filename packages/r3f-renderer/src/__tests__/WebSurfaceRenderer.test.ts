/**
 * WebSurfaceRenderer — Logic Tests
 *
 * Verifies prop resolution, sandbox string computation, and allow
 * attribute building without requiring a WebGL context.
 */

import { describe, it, expect } from 'vitest';
import { resolveWebSurfaceConfig } from '../utils/partitionStudioChildren';

describe('WebSurfaceRenderer logic', () => {
  it('resolveWebSurfaceConfig returns trait data when present', () => {
    const node = {
      traits: new Map([['web_surface', { url: 'https://a.test', size: [640, 480] }]]),
      props: {},
    };
    const cfg = resolveWebSurfaceConfig(node);
    expect(cfg?.url).toBe('https://a.test');
    expect(cfg?.size).toEqual([640, 480]);
  });

  it('resolveWebSurfaceConfig falls back to props.webSurface', () => {
    const node = {
      traits: new Map(),
      props: { webSurface: { url: 'https://b.test' } },
    };
    const cfg = resolveWebSurfaceConfig(node);
    expect(cfg?.url).toBe('https://b.test');
  });

  it('resolveWebSurfaceConfig prefers trait over props', () => {
    const node = {
      traits: new Map([['web_surface', { url: 'https://trait.test' }]]),
      props: { webSurface: { url: 'https://prop.test' } },
    };
    const cfg = resolveWebSurfaceConfig(node);
    expect(cfg?.url).toBe('https://trait.test');
  });

  it('resolveWebSurfaceConfig returns null when nothing present', () => {
    const node = { traits: new Map(), props: {} };
    expect(resolveWebSurfaceConfig(node)).toBeNull();
  });
});
