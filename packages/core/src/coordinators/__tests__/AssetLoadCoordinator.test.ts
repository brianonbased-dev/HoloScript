/**
 * AssetLoadCoordinator — first consumer-bus that closes Pattern E for
 * GLTF + USD + FBX traits (35 void events / 69 compiler refs unblocked).
 *
 * Tests use a MockEventSource that exposes a fire(event, payload) method
 * to simulate trait emits, mirroring how TraitContextFactory would invoke
 * subscribed handlers in production.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  AssetLoadCoordinator,
  type AssetLoadEventSource,
  type AssetLoadListener,
  type AssetLoadState,
} from '../AssetLoadCoordinator';

class MockEventSource implements AssetLoadEventSource {
  private handlers = new Map<string, Array<(payload: unknown) => void>>();

  on(event: string, handler: (payload: unknown) => void): void {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event)!.push(handler);
  }

  /** Test helper — fire an event to all registered handlers. */
  fire(event: string, payload: unknown): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    for (const handler of handlers) handler(payload);
  }

  /** Test helper — count of distinct events the coordinator subscribed to. */
  get subscriberCount(): number {
    return this.handlers.size;
  }
}

describe('AssetLoadCoordinator — Pattern E remediation for GLTF/USD/FBX', () => {
  let source: MockEventSource;
  let coord: AssetLoadCoordinator;

  beforeEach(() => {
    source = new MockEventSource();
    coord = new AssetLoadCoordinator(source);
  });

  it('subscribes to the full asset-load event vocabulary on construction', () => {
    // 4 events × 3 formats + 3 cross-format = 15 distinct events
    expect(source.subscriberCount).toBe(15);
    expect(coord.subscribedEventCount).toBe(15);
  });

  it('starts with empty state', () => {
    expect(coord.getAllStates()).toEqual([]);
    expect(coord.getStats()).toEqual({
      total: 0,
      loading: 0,
      loaded: 0,
      failed: 0,
      averageProgress: 0,
    });
  });

  it('gltf:load_started moves an asset to "loading" status', () => {
    source.fire('gltf:load_started', { url: 'avatars/test.glb' });
    const state = coord.getAssetState('avatars/test.glb');
    expect(state?.status).toBe('loading');
    expect(state?.format).toBe('gltf');
    expect(state?.progress).toBe(0);
  });

  it('gltf:loading_progress updates progress in [0,1]', () => {
    source.fire('gltf:load_started', { url: 'a.glb' });
    source.fire('gltf:loading_progress', { url: 'a.glb', progress: 0.5 });
    expect(coord.getAssetState('a.glb')?.progress).toBe(0.5);
  });

  it('gltf:loading_progress ignores out-of-range progress values (defensive)', () => {
    source.fire('gltf:load_started', { url: 'a.glb' });
    source.fire('gltf:loading_progress', { url: 'a.glb', progress: 0.3 });
    source.fire('gltf:loading_progress', { url: 'a.glb', progress: 1.5 }); // invalid — ignore
    expect(coord.getAssetState('a.glb')?.progress).toBe(0.3);
  });

  it('gltf:loaded transitions to "loaded" with progress=1', () => {
    source.fire('gltf:load_started', { url: 'a.glb' });
    source.fire('gltf:loaded', { url: 'a.glb' });
    const state = coord.getAssetState('a.glb');
    expect(state?.status).toBe('loaded');
    expect(state?.progress).toBe(1);
  });

  it('gltf:load_error transitions to "error" with message', () => {
    source.fire('gltf:load_started', { url: 'broken.glb' });
    source.fire('gltf:load_error', { url: 'broken.glb', error: 'CORS blocked' });
    const state = coord.getAssetState('broken.glb');
    expect(state?.status).toBe('error');
    expect(state?.error).toBe('CORS blocked');
  });

  it('USD format detected from event prefix', () => {
    source.fire('usd:loaded', { url: 'scene.usd' });
    expect(coord.getAssetState('scene.usd')?.format).toBe('usd');
  });

  it('FBX format detected from event prefix', () => {
    source.fire('fbx:loaded', { url: 'rig.fbx' });
    expect(coord.getAssetState('rig.fbx')?.format).toBe('fbx');
  });

  it('cross-format on_asset_loaded works with modelId payload key', () => {
    // Some traits use modelId instead of url as the canonical key
    source.fire('on_asset_loaded', { modelId: 'pfnn_v1' });
    expect(coord.getAssetState('pfnn_v1')?.status).toBe('loaded');
  });

  it('subscribe + unsubscribe — listeners only fire while subscribed', () => {
    const captured: AssetLoadState[] = [];
    const unsub = coord.subscribe((s) => captured.push(s));
    source.fire('gltf:load_started', { url: 'a.glb' });
    source.fire('gltf:loaded', { url: 'a.glb' });
    expect(captured).toHaveLength(2);
    expect(captured[0].status).toBe('loading');
    expect(captured[1].status).toBe('loaded');

    unsub();
    source.fire('gltf:loaded', { url: 'b.glb' });
    expect(captured).toHaveLength(2); // unchanged after unsubscribe
  });

  it('listener-throws-doesnt-crash-other-listeners (bus discipline)', () => {
    const captured: number[] = [];
    coord.subscribe(() => {
      throw new Error('listener 1 boom');
    });
    coord.subscribe(() => {
      captured.push(1);
    });
    coord.subscribe(() => {
      captured.push(2);
    });
    expect(() => source.fire('gltf:loaded', { url: 'a.glb' })).not.toThrow();
    expect(captured).toEqual([1, 2]); // both surviving listeners ran
  });

  it('getAllStates returns a snapshot — caller mutation does not affect coordinator', () => {
    source.fire('gltf:loaded', { url: 'a.glb' });
    const snap = coord.getAllStates();
    snap.length = 0; // mutate the returned array
    expect(coord.getAllStates()).toHaveLength(1); // coordinator state unchanged
  });

  it('getStats aggregates correctly across multiple assets', () => {
    source.fire('gltf:load_started', { url: 'a.glb' });
    source.fire('gltf:loading_progress', { url: 'a.glb', progress: 0.4 });
    source.fire('usd:load_started', { url: 'b.usd' });
    source.fire('usd:loading_progress', { url: 'b.usd', progress: 0.6 });
    source.fire('fbx:loaded', { url: 'c.fbx' });
    source.fire('fbx:load_error', { url: 'd.fbx', error: 'parse fail' });

    const stats = coord.getStats();
    expect(stats.total).toBe(4);
    expect(stats.loading).toBe(2);
    expect(stats.loaded).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.averageProgress).toBeCloseTo(0.5, 5); // (0.4 + 0.6) / 2
  });

  it('reset() clears all tracked state', () => {
    source.fire('gltf:loaded', { url: 'a.glb' });
    source.fire('usd:loaded', { url: 'b.usd' });
    expect(coord.getAllStates()).toHaveLength(2);

    coord.reset();
    expect(coord.getAllStates()).toHaveLength(0);
    expect(coord.getStats().total).toBe(0);
  });

  it('format persists across loading→loaded transition (does not regress to unknown)', () => {
    source.fire('gltf:load_started', { url: 'a.glb' });
    expect(coord.getAssetState('a.glb')?.format).toBe('gltf');
    // The cross-format on_asset_loaded would set format='unknown' if it
    // overwrote, but we preserve the established format.
    source.fire('on_asset_loaded', { url: 'a.glb' });
    expect(coord.getAssetState('a.glb')?.format).toBe('gltf');
  });

  it('payload without url or modelId is silently dropped (defensive)', () => {
    source.fire('gltf:loaded', { someOtherField: 'value' });
    expect(coord.getAllStates()).toHaveLength(0);
  });

  it('payload that is not an object is silently dropped (defensive)', () => {
    source.fire('gltf:loaded', 'a string');
    source.fire('gltf:loaded', null);
    source.fire('gltf:loaded', undefined);
    source.fire('gltf:loaded', 42);
    expect(coord.getAllStates()).toHaveLength(0);
  });
});
