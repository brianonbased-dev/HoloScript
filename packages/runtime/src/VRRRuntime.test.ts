/**
 * VRRRuntime — execution coverage aligned with `VRRCompiler` generated bundles.
 * @see packages/core/src/compiler/VRRCompiler.ts
 *
 * Import `.ts` explicitly so Vitest resolves current source (`.js` can bind to stale analysis output).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VRRRuntime, type VRRRuntimeOptions } from './VRRRuntime.ts';

function baseOptions(overrides: Partial<VRRRuntimeOptions> = {}): VRRRuntimeOptions {
  return {
    twin_id: 'test_twin',
    geo_center: { lat: 33.4484, lng: -112.074 },
    apis: {},
    multiplayer: { enabled: false, max_players: 8, tick_rate: 20 },
    state_persistence: { client: 'localstorage', server: '' },
    ...overrides,
  };
}

describe('VRRRuntime', () => {
  let vrr: VRRRuntime;

  beforeEach(() => {
    vrr = new VRRRuntime(baseOptions());
  });

  afterEach(() => {
    vrr.dispose();
  });

  describe('initialization & geo (zero-copy center)', () => {
    it('exposes options and returns the same geo_center reference from getGeoCenter()', () => {
      const center = vrr.options.geo_center;
      expect(vrr.getGeoCenter()).toBe(center);
      expect(vrr.getGeoCenter().lat).toBe(33.4484);
    });

    it('geoToSceneCoords maps relative to geo_center', () => {
      const p = vrr.geoToSceneCoords(33.45, -112.08);
      expect(p).toMatchObject({ x: expect.any(Number), y: 0, z: expect.any(Number) });
    });
  });

  describe('tick() — compiler animate() hook', () => {
    it('increments frame count and runs subscribers', () => {
      const fn = vi.fn();
      const unsub = vrr.onTick(fn);
      expect(vrr.getTickFrame()).toBe(0);
      vrr.tick();
      expect(vrr.getTickFrame()).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);
      unsub();
      vrr.tick();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('state: persistState / getState (quest hooks)', () => {
    it('getState returns value after persistState (memory path)', async () => {
      await vrr.persistState('quest_progress_q1', { step: 1 });
      expect(vrr.getState('quest_progress_q1')).toEqual({ step: 1 });
    });
  });

  describe('syncToServer overload (layer_shift compiler)', () => {
    it('accepts (key, payload) when server URL is set', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(null, { status: 200 })
      );
      const srv = new VRRRuntime(
        baseOptions({ state_persistence: { client: 'localstorage', server: 'https://supa.test' } })
      );
      await srv.syncToServer('layer_state', { a: 1 });
      expect(fetchSpy).toHaveBeenCalled();
      const [url, init] = fetchSpy.mock.calls[0];
      expect(String(url)).toContain('/rest/v1/vrr_sync');
      const parsed = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
      expect(parsed).toMatchObject({
        key: 'layer_state',
        twin_id: 'test_twin',
        payload: { a: 1 },
      });
      fetchSpy.mockRestore();
      srv.dispose();
    });
  });

  describe('getIndexedDB (layer persistence facade)', () => {
    it('put/get round-trip in node (memory fallback)', async () => {
      const db = await vrr.getIndexedDB('hololand_layers_test');
      await db.put('layer_state', { ok: true });
      const v = await db.get('layer_state');
      expect(v).toEqual({ ok: true });
    });
  });

  describe('layer shift & paywall stubs', () => {
    it('registerLayerShift + transitionToLayer + inventory helpers', () => {
      vrr.registerLayerShift({
        id: 'p1',
        from: 'ar',
        to: 'vrr',
        price: 0,
        persist_state: true,
      });
      vrr.transitionToLayer('vrr');
      expect(vrr.getCurrentLayer()).toBe('vrr');
      vrr.restoreQuestProgress({ q1: { done: true } } as unknown as Record<string, unknown>);
      expect(vrr.getAllQuestProgress().q1).toEqual({ done: true });
      vrr.restorePlayerInventory({ oat_milk: 2 });
      expect(vrr.getPlayerInventory().oat_milk).toBe(2);
    });

    it('unlockContent / getPaymentAddress / spawnNPCCrowd', () => {
      vrr.unlockContent('menu_vip');
      expect(vrr.isContentUnlocked('menu_vip')).toBe(true);
      expect(vrr.getPaymentAddress('vip')).toMatch(/^0x[0-9a-f]{40}$/);
      expect(() => vrr.spawnNPCCrowd({ x: 0, y: 0, z: 0 }, 5)).not.toThrow();
    });

    it('spawnNPCCrowd invokes hooks.onNpcCrowdSpawn and records memoryState', () => {
      const onNpcCrowdSpawn = vi.fn();
      const v2 = new VRRRuntime(baseOptions({ hooks: { onNpcCrowdSpawn } }));
      v2.spawnNPCCrowd([1, 2, 3], 8);
      expect(onNpcCrowdSpawn).toHaveBeenCalledWith({
        position: { x: 1, y: 2, z: 3 },
        count: 8,
      });
      expect(v2.getState('npc_crowd:last')).toMatchObject({
        position: { x: 1, y: 2, z: 3 },
        count: 8,
      });
      v2.dispose();
    });

    it('requirePayment delegates to payments.verifyPayment when set', async () => {
      const verifyPayment = vi.fn().mockResolvedValue(true);
      const v2 = new VRRRuntime(baseOptions({ payments: { verifyPayment } }));
      await expect(
        v2.requirePayment({ price: 2, asset: 'USDC', network: 'base' })
      ).resolves.toBe(true);
      expect(verifyPayment).toHaveBeenCalledWith({ price: 2, asset: 'USDC', network: 'base' });
      v2.dispose();
    });

    it('requirePayment resolves in dev when no verifier (warns once)', async () => {
      const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(vrr.requirePayment({ price: 1, asset: 'USDC', network: 'base' })).resolves.toBe(
        true
      );
      expect(w).toHaveBeenCalled();
      w.mockRestore();
    });
  });

  describe('createQuestHub (VRRCompiler @quest_hub)', () => {
    it('fires registered callbacks via simulate* helpers', () => {
      const hub = vrr.createQuestHub({
        business_id: 'brew',
        quests: [{ id: 'latte' }],
      });
      const start = vi.fn();
      const step = vi.fn();
      const done = vi.fn();
      hub.onQuestStart(start);
      hub.onStepComplete(step);
      hub.onQuestComplete(done);
      hub.simulateQuestStart('latte');
      hub.simulateStepComplete('latte', 0);
      hub.simulateQuestComplete('latte', { coupon: 'x' });
      expect(start).toHaveBeenCalledWith({ id: 'latte' });
      expect(step).toHaveBeenCalledWith({ id: 'latte' }, 0);
      expect(done).toHaveBeenCalledWith({ id: 'latte' }, { coupon: 'x' });
    });
  });

  describe('createPaywall (VRRCompiler @x402_paywall)', () => {
    it('exposes verify when on402 is provided', async () => {
      const p = vrr.createPaywall({
        content_id: 'c1',
        price: 5,
        asset: 'USDC',
        network: 'base',
        on402: async () => ({ status: 402, headers: { 'X-Payment-Required': 'true' } }),
      });
      await expect(p.verify?.()).resolves.toBe(true);
    });
  });

  describe('createWeatherSync / createEventSync handles', () => {
    it('createWeatherSync wires onUpdate to syncWeather', async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            properties: { forecast: 'https://api.weather.gov/forecast' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            properties: {
              periods: [
                {
                  temperature: 72,
                  probabilityOfPrecipitation: { value: 10 },
                  windSpeed: '5 mph',
                  shortForecast: 'Sunny',
                },
              ],
            },
          }),
          { status: 200 }
        )
      );
      vi.stubGlobal('fetch', fetchMock);

      const w = new VRRRuntime(baseOptions());
      const sync = w.createWeatherSync({
        provider: 'weather.gov',
        refresh: '5_minutes',
        location: w.getGeoCenter(),
      });
      const cb = vi.fn();
      sync.onUpdate(cb);
      await new Promise((r) => setTimeout(r, 50));
      expect(fetchMock).toHaveBeenCalled();
      w.dispose();
      vi.unstubAllGlobals();
    });
  });

  describe('createBusinessHub', () => {
    it('returns hasItem/getInventory surface', () => {
      const hub = vrr.createBusinessHub('shop', () => {});
      expect(hub.business_id).toBe('shop');
      expect(hub.getInventory()).toBeNull();
      expect(hub.hasItem('x')).toBe(false);
    });
  });

  describe('dynamic generative assets (late-binding)', () => {
    it('lateBindGenerativeAsset defaults to browser+headset and infers mesh/splat kinds', () => {
      const meshBinding = vrr.lateBindGenerativeAsset({
        nodeId: 'world-1',
        url: 'https://cdn.example.com/world.glb',
      });
      expect(meshBinding.kind).toBe('mesh');
      expect(meshBinding.targets).toEqual(['browser', 'headset']);

      const splatBinding = vrr.lateBindGenerativeAsset({
        nodeId: 'world-1',
        url: 'https://cdn.example.com/world.splat',
      });
      expect(splatBinding.kind).toBe('splat');
      expect(vrr.getGenerativeAssets('world-1')).toHaveLength(2);
    });

    it('registerGeneratedAssetEvent creates both mesh and splat bindings', () => {
      const created = vrr.registerGeneratedAssetEvent({
        nodeId: 'node-77',
        generationId: 'gen-77',
        assetUrl: 'https://assets/world.obj',
        pointCloudUrl: 'https://assets/world.spz',
        targets: ['headset'],
      });

      expect(created).toHaveLength(2);
      expect(created[0].targets).toEqual(['headset']);
      expect(vrr.getGenerativeAsset('gen-77_mesh')?.kind).toBe('mesh');
      expect(vrr.getGenerativeAsset('gen-77_splat')?.kind).toBe('splat');
    });

    it('notifies subscribers and supports clearing bindings', () => {
      const onBound = vi.fn();
      const unsub = vrr.onGenerativeAssetBound(onBound);

      const b = vrr.lateBindGenerativeAsset({
        assetId: 'asset-clear',
        nodeId: 'n-clear',
        url: 'https://cdn.example.com/live.stream',
      });

      expect(onBound).toHaveBeenCalledWith(
        expect.objectContaining({ assetId: 'asset-clear', kind: 'neural_stream' })
      );
      expect(vrr.clearGenerativeAsset(b.assetId)).toBe(true);
      expect(vrr.getGenerativeAsset('asset-clear')).toBeUndefined();

      unsub();
    });
  });

  describe('error boundaries', () => {
    it('toggleARMode(true) throws when ar_mode is missing', async () => {
      await expect(vrr.toggleARMode(true)).rejects.toThrow(/AR options not configured/);
    });
  });
});
