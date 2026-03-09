/**
 * AssetStreamer Tests
 *
 * Tests the AssetStreamer registry functions, enum values, and interface contracts:
 * - registerAssetStreamer / getAssetStreamer
 * - assetStreamerRegistry Map behavior
 * - StreamPriority enum values
 * - Mock streamer creation and method validation
 * - Edge cases (overwrite, missing, dispose)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StreamPriority,
  assetStreamerRegistry,
  registerAssetStreamer,
  getAssetStreamer,
} from '../AssetStreamer';
import type { AssetStreamer, AssetStreamRequest, StreamStatus } from '../AssetStreamer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockAssetStreamer(overrides?: Partial<AssetStreamer>): AssetStreamer {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    requestAsset: vi.fn(),
    cancelRequest: vi.fn(),
    getStatus: vi.fn().mockReturnValue(undefined),
    purgeAssets: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

function createStreamRequest(overrides?: Partial<AssetStreamRequest>): AssetStreamRequest {
  return {
    id: 'asset-1',
    url: 'https://cdn.example.com/mesh.glb',
    type: 'mesh',
    priority: StreamPriority.IMMEDIATE,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// StreamPriority enum
// ---------------------------------------------------------------------------

describe('StreamPriority', () => {
  it('IMMEDIATE has value 0', () => {
    expect(StreamPriority.IMMEDIATE).toBe(0);
  });

  it('PREDICTIVE_HIGH has value 1', () => {
    expect(StreamPriority.PREDICTIVE_HIGH).toBe(1);
  });

  it('PREDICTIVE_LOW has value 2', () => {
    expect(StreamPriority.PREDICTIVE_LOW).toBe(2);
  });

  it('BACKGROUND has value 3', () => {
    expect(StreamPriority.BACKGROUND).toBe(3);
  });

  it('priorities are ordered (lower value = higher priority)', () => {
    expect(StreamPriority.IMMEDIATE).toBeLessThan(StreamPriority.PREDICTIVE_HIGH);
    expect(StreamPriority.PREDICTIVE_HIGH).toBeLessThan(StreamPriority.PREDICTIVE_LOW);
    expect(StreamPriority.PREDICTIVE_LOW).toBeLessThan(StreamPriority.BACKGROUND);
  });
});

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('AssetStreamer — registry', () => {
  beforeEach(() => {
    assetStreamerRegistry.clear();
  });

  it('assetStreamerRegistry starts empty (after clear)', () => {
    expect(assetStreamerRegistry.size).toBe(0);
  });

  it('registerAssetStreamer adds streamer to registry', () => {
    const streamer = createMockAssetStreamer();
    registerAssetStreamer('default', streamer);
    expect(assetStreamerRegistry.has('default')).toBe(true);
  });

  it('getAssetStreamer retrieves a registered streamer', () => {
    const streamer = createMockAssetStreamer();
    registerAssetStreamer('cdn', streamer);
    expect(getAssetStreamer('cdn')).toBe(streamer);
  });

  it('getAssetStreamer returns undefined for unregistered name', () => {
    expect(getAssetStreamer('nonexistent')).toBeUndefined();
  });

  it('registering with same name overwrites the previous streamer', () => {
    const s1 = createMockAssetStreamer();
    const s2 = createMockAssetStreamer();
    registerAssetStreamer('shared', s1);
    registerAssetStreamer('shared', s2);
    expect(getAssetStreamer('shared')).toBe(s2);
    expect(getAssetStreamer('shared')).not.toBe(s1);
  });

  it('multiple streamers can be registered independently', () => {
    const primary = createMockAssetStreamer();
    const secondary = createMockAssetStreamer();
    registerAssetStreamer('primary', primary);
    registerAssetStreamer('secondary', secondary);

    expect(getAssetStreamer('primary')).toBe(primary);
    expect(getAssetStreamer('secondary')).toBe(secondary);
    expect(assetStreamerRegistry.size).toBe(2);
  });

  it('assetStreamerRegistry is a standard Map', () => {
    expect(assetStreamerRegistry).toBeInstanceOf(Map);
  });
});

// ---------------------------------------------------------------------------
// Mock streamer — initialize
// ---------------------------------------------------------------------------

describe('AssetStreamer — initialize', () => {
  it('initialize with default config', async () => {
    const streamer = createMockAssetStreamer();
    await streamer.initialize({});
    expect(streamer.initialize).toHaveBeenCalledWith({});
  });

  it('initialize with workerPoolSize', async () => {
    const streamer = createMockAssetStreamer();
    await streamer.initialize({ workerPoolSize: 4 });
    expect(streamer.initialize).toHaveBeenCalledWith({ workerPoolSize: 4 });
  });

  it('initialize with memoryLimitMB', async () => {
    const streamer = createMockAssetStreamer();
    await streamer.initialize({ memoryLimitMB: 512 });
    expect(streamer.initialize).toHaveBeenCalledWith({ memoryLimitMB: 512 });
  });

  it('initialize with full config', async () => {
    const streamer = createMockAssetStreamer();
    const config = { workerPoolSize: 8, memoryLimitMB: 1024 };
    await streamer.initialize(config);
    expect(streamer.initialize).toHaveBeenCalledWith(config);
  });

  it('initialize resolves successfully', async () => {
    const streamer = createMockAssetStreamer();
    await expect(streamer.initialize({})).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Mock streamer — requestAsset
// ---------------------------------------------------------------------------

describe('AssetStreamer — requestAsset', () => {
  it('requestAsset with mesh type', () => {
    const streamer = createMockAssetStreamer();
    const request = createStreamRequest({ type: 'mesh' });
    streamer.requestAsset(request);
    expect(streamer.requestAsset).toHaveBeenCalledWith(request);
  });

  it('requestAsset with texture type', () => {
    const streamer = createMockAssetStreamer();
    const request = createStreamRequest({
      id: 'tex-1',
      url: 'https://cdn.example.com/texture.ktx2',
      type: 'texture',
      priority: StreamPriority.PREDICTIVE_HIGH,
    });
    streamer.requestAsset(request);
    expect(streamer.requestAsset).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'texture' })
    );
  });

  it('requestAsset with audio type', () => {
    const streamer = createMockAssetStreamer();
    const request = createStreamRequest({
      id: 'sfx-1',
      url: 'https://cdn.example.com/sound.ogg',
      type: 'audio',
      priority: StreamPriority.BACKGROUND,
    });
    streamer.requestAsset(request);
    expect(streamer.requestAsset).toHaveBeenCalledWith(expect.objectContaining({ type: 'audio' }));
  });

  it('requestAsset with script type', () => {
    const streamer = createMockAssetStreamer();
    const request = createStreamRequest({
      id: 'script-1',
      url: 'https://cdn.example.com/module.hs',
      type: 'script',
      priority: StreamPriority.IMMEDIATE,
    });
    streamer.requestAsset(request);
    expect(streamer.requestAsset).toHaveBeenCalledWith(expect.objectContaining({ type: 'script' }));
  });

  it('requestAsset with optional size and compression', () => {
    const streamer = createMockAssetStreamer();
    const request = createStreamRequest({
      size: 1024 * 1024,
      compression: 'draco',
    });
    streamer.requestAsset(request);
    expect(streamer.requestAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        size: 1024 * 1024,
        compression: 'draco',
      })
    );
  });

  it('requestAsset with meshopt compression', () => {
    const streamer = createMockAssetStreamer();
    const request = createStreamRequest({ compression: 'meshopt' });
    streamer.requestAsset(request);
    expect(streamer.requestAsset).toHaveBeenCalledWith(
      expect.objectContaining({ compression: 'meshopt' })
    );
  });

  it('requestAsset with no compression', () => {
    const streamer = createMockAssetStreamer();
    const request = createStreamRequest({ compression: 'none' });
    streamer.requestAsset(request);
    expect(streamer.requestAsset).toHaveBeenCalledWith(
      expect.objectContaining({ compression: 'none' })
    );
  });

  it('requestAsset with each priority level', () => {
    const streamer = createMockAssetStreamer();
    const priorities = [
      StreamPriority.IMMEDIATE,
      StreamPriority.PREDICTIVE_HIGH,
      StreamPriority.PREDICTIVE_LOW,
      StreamPriority.BACKGROUND,
    ];
    for (const priority of priorities) {
      streamer.requestAsset(createStreamRequest({ id: `p-${priority}`, priority }));
    }
    expect(streamer.requestAsset).toHaveBeenCalledTimes(4);
  });
});

// ---------------------------------------------------------------------------
// Mock streamer — cancelRequest
// ---------------------------------------------------------------------------

describe('AssetStreamer — cancelRequest', () => {
  it('cancelRequest by id', () => {
    const streamer = createMockAssetStreamer();
    streamer.cancelRequest('asset-1');
    expect(streamer.cancelRequest).toHaveBeenCalledWith('asset-1');
  });

  it('cancelRequest for non-existent id does not throw', () => {
    const streamer = createMockAssetStreamer();
    expect(() => streamer.cancelRequest('unknown')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Mock streamer — getStatus
// ---------------------------------------------------------------------------

describe('AssetStreamer — getStatus', () => {
  it('getStatus returns undefined for unknown asset', () => {
    const streamer = createMockAssetStreamer();
    expect(streamer.getStatus('unknown')).toBeUndefined();
  });

  it('getStatus returns queued status', () => {
    const status: StreamStatus = {
      id: 'asset-1',
      progress: 0,
      state: 'queued',
    };
    const streamer = createMockAssetStreamer({
      getStatus: vi.fn().mockReturnValue(status),
    });
    expect(streamer.getStatus('asset-1')).toEqual(status);
  });

  it('getStatus returns loading status with progress', () => {
    const status: StreamStatus = {
      id: 'asset-1',
      progress: 0.5,
      state: 'loading',
    };
    const streamer = createMockAssetStreamer({
      getStatus: vi.fn().mockReturnValue(status),
    });
    const result = streamer.getStatus('asset-1');
    expect(result?.progress).toBe(0.5);
    expect(result?.state).toBe('loading');
  });

  it('getStatus returns decompressing status', () => {
    const status: StreamStatus = {
      id: 'asset-1',
      progress: 0.9,
      state: 'decompressing',
    };
    const streamer = createMockAssetStreamer({
      getStatus: vi.fn().mockReturnValue(status),
    });
    expect(streamer.getStatus('asset-1')?.state).toBe('decompressing');
  });

  it('getStatus returns ready status', () => {
    const status: StreamStatus = {
      id: 'asset-1',
      progress: 1,
      state: 'ready',
    };
    const streamer = createMockAssetStreamer({
      getStatus: vi.fn().mockReturnValue(status),
    });
    const result = streamer.getStatus('asset-1');
    expect(result?.progress).toBe(1);
    expect(result?.state).toBe('ready');
  });

  it('getStatus returns error status with error message', () => {
    const status: StreamStatus = {
      id: 'asset-1',
      progress: 0.3,
      state: 'error',
      error: 'Network timeout',
    };
    const streamer = createMockAssetStreamer({
      getStatus: vi.fn().mockReturnValue(status),
    });
    const result = streamer.getStatus('asset-1');
    expect(result?.state).toBe('error');
    expect(result?.error).toBe('Network timeout');
  });
});

// ---------------------------------------------------------------------------
// Mock streamer — purgeAssets
// ---------------------------------------------------------------------------

describe('AssetStreamer — purgeAssets', () => {
  it('purgeAssets with distance threshold and player position', () => {
    const streamer = createMockAssetStreamer();
    streamer.purgeAssets(100, [50, 0, 50]);
    expect(streamer.purgeAssets).toHaveBeenCalledWith(100, [50, 0, 50]);
  });

  it('purgeAssets with zero threshold', () => {
    const streamer = createMockAssetStreamer();
    streamer.purgeAssets(0, [0, 0, 0]);
    expect(streamer.purgeAssets).toHaveBeenCalledWith(0, [0, 0, 0]);
  });

  it('purgeAssets with large distance', () => {
    const streamer = createMockAssetStreamer();
    streamer.purgeAssets(10000, [500, 10, 500]);
    expect(streamer.purgeAssets).toHaveBeenCalledWith(10000, [500, 10, 500]);
  });
});

// ---------------------------------------------------------------------------
// Mock streamer — dispose
// ---------------------------------------------------------------------------

describe('AssetStreamer — dispose', () => {
  it('dispose is callable', () => {
    const streamer = createMockAssetStreamer();
    streamer.dispose();
    expect(streamer.dispose).toHaveBeenCalledTimes(1);
  });

  it('dispose can be called multiple times', () => {
    const streamer = createMockAssetStreamer();
    streamer.dispose();
    streamer.dispose();
    expect(streamer.dispose).toHaveBeenCalledTimes(2);
  });
});
