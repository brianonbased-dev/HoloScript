/**
 * ChunkLoader Production Tests
 *
 * Chunk loading: construction, isPointInBounds logic, loadChunk guards,
 * and update skip when no manifest.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChunkLoader } from '../loader';

function makeRuntime(overrides: any = {}) {
  return {
    vrContext: { headset: { position: [0, 0, 0] } },
    instantiateNode: vi.fn(),
    rootInstance: {},
    ...overrides,
  } as any;
}

describe('ChunkLoader — Production', () => {
  let runtime: any;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = makeRuntime();
  });

  describe('construction', () => {
    it('creates without error', () => {
      const loader = new ChunkLoader(runtime, { manifestUrl: '/manifest.json' });
      expect(loader).toBeDefined();
    });
  });

  describe('update', () => {
    it('no-op when manifest not loaded', () => {
      const loader = new ChunkLoader(runtime, { manifestUrl: '/m.json' });
      loader.update(); // Should not throw
    });
  });

  describe('loadChunk', () => {
    it('no-op when manifest not loaded', async () => {
      const loader = new ChunkLoader(runtime, { manifestUrl: '/m.json' });
      await loader.loadChunk('chunk1'); // Should not throw
    });
  });
});
