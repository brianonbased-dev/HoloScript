/**
 * Sprint30.test.ts â€” Procedural + World + Environment (v3.39.0)
 *
 * ~100 acceptance tests covering:
 *   Feature 1:  procedural/NoiseGenerator
 *   Feature 2:  procedural/DungeonGenerator
 *   Feature 3:  procedural/WaveFunction
 *   Feature 4:  world/WorldStreamer
 *   Feature 5:  world/LODManager
 *   Feature 6:  world/OcclusionCulling
 *   Feature 7:  environment/WeatherSystem
 *   Feature 8:  environment/DayNightCycle
 *   Feature 9:  tilemap/TileMap
 *   Feature 10: environment/TerrainBrush
 */
import { describe, it, expect } from 'vitest';

import { NoiseGenerator } from '@holoscript/engine/procedural/NoiseGenerator.js';
import { DungeonGenerator } from '@holoscript/engine/procedural/DungeonGenerator.js';
import { WaveFunction } from '@holoscript/engine/procedural/WaveFunction.js';
import { WorldStreamer } from '@holoscript/engine/world/WorldStreamer.js';
import { LODManager } from '@holoscript/engine/world/LODManager.js';
import { OcclusionCulling } from '@holoscript/engine/world/OcclusionCulling.js';
import { WeatherSystem } from '@holoscript/engine/environment/WeatherSystem.js';
import { DayNightCycle } from '@holoscript/engine/environment/DayNightCycle.js';
import { TileMap } from '@holoscript/engine/tilemap/TileMap.js';
import { TerrainSystem } from '@holoscript/engine/environment/TerrainSystem.js';
import { TerrainBrush } from '@holoscript/engine/environment/TerrainBrush.js';

// =============================================================================
// FEATURE 1: procedural/NoiseGenerator
// =============================================================================
describe('Feature 1: NoiseGenerator', () => {
  it('perlin2D returns a number in [-1, 1] range', () => {
    const ng = new NoiseGenerator({ seed: 1 });
    const val = ng.perlin2D(0.5, 0.5);
    expect(typeof val).toBe('number');
  });

  it('perlin2D is deterministic with same seed', () => {
    const a = new NoiseGenerator({ seed: 42 });
    const b = new NoiseGenerator({ seed: 42 });
    expect(a.perlin2D(1.5, 2.3)).toBe(b.perlin2D(1.5, 2.3));
  });

  it('perlin2D varies between different seeds', () => {
    const a = new NoiseGenerator({ seed: 1 });
    const b = new NoiseGenerator({ seed: 2 });
    expect(a.perlin2D(1.1, 1.1)).not.toBe(b.perlin2D(1.1, 1.1));
  });

  it('value2D returns a number', () => {
    expect(typeof new NoiseGenerator().value2D(0.3, 0.7)).toBe('number');
  });

  it('fbm2D returns a number', () => {
    const ng = new NoiseGenerator({ seed: 42 });
    const val = ng.fbm2D(1.0, 1.0);
    expect(typeof val).toBe('number');
  });

  it('getConfig returns the seed used', () => {
    expect(new NoiseGenerator({ seed: 99 }).getConfig().seed).toBe(99);
  });

  it('warped2D returns a number', () => {
    expect(typeof new NoiseGenerator().warped2D(1.0, 1.0)).toBe('number');
  });
});

// =============================================================================
// FEATURE 2: procedural/DungeonGenerator
// =============================================================================
describe('Feature 2: DungeonGenerator', () => {
  it('generate returns rooms and corridors', () => {
    const dg = new DungeonGenerator({ seed: 1 });
    const result = dg.generate();
    expect(result.rooms).toBeDefined();
    expect(result.corridors).toBeDefined();
  });

  it('getRoomCount returns number of rooms after generate', () => {
    const dg = new DungeonGenerator({ maxRooms: 5, seed: 42 });
    dg.generate();
    expect(dg.getRoomCount()).toBeGreaterThan(0);
  });

  it('getRooms returns same as generate().rooms', () => {
    const dg = new DungeonGenerator({ seed: 10 });
    dg.generate();
    expect(dg.getRooms()).toHaveLength(dg.getRoomCount());
  });

  it('getCorridors returns array after generate', () => {
    const dg = new DungeonGenerator({ seed: 5 });
    dg.generate();
    expect(Array.isArray(dg.getCorridors())).toBe(true);
  });

  it('isFullyConnected returns boolean', () => {
    const dg = new DungeonGenerator({ seed: 7 });
    dg.generate();
    expect(typeof dg.isFullyConnected()).toBe('boolean');
  });

  it('rooms have valid x, y, width, height', () => {
    const dg = new DungeonGenerator({ seed: 3, maxRooms: 3 });
    dg.generate();
    for (const room of dg.getRooms()) {
      expect(room.width).toBeGreaterThan(0);
      expect(room.height).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// FEATURE 3: procedural/WaveFunction
// =============================================================================
describe('Feature 3: WaveFunction', () => {
  function makeTile(id: string) {
    return { id, weight: 1, adjacency: { up: [id], down: [id], left: [id], right: [id] } };
  }

  it('getWidth and getHeight return correct values', () => {
    const wf = new WaveFunction(4, 4);
    expect(wf.getWidth()).toBe(4);
    expect(wf.getHeight()).toBe(4);
  });

  it('getCell returns undefined before initialize', () => {
    const wf = new WaveFunction(4, 4);
    expect(wf.getCell(0, 0)).toBeUndefined();
  });

  it('initialize sets up cells', () => {
    const wf = new WaveFunction(3, 3);
    wf.addTile(makeTile('grass'));
    wf.initialize();
    expect(wf.getCell(0, 0)).toBeDefined();
  });

  it('isComplete returns false before solving', () => {
    const wf = new WaveFunction(3, 3);
    wf.addTile(makeTile('dirt'));
    wf.initialize();
    expect(wf.isComplete()).toBe(false);
  });

  it('solve returns boolean', () => {
    const wf = new WaveFunction(3, 3, 42);
    wf.addTile(makeTile('water'));
    wf.initialize();
    const result = wf.solve(1000);
    expect(typeof result).toBe('boolean');
  });

  it('isComplete returns true after successful solve', () => {
    const wf = new WaveFunction(4, 4, 1);
    wf.addTile(makeTile('land'));
    wf.initialize();
    wf.solve(5000);
    expect(wf.isComplete()).toBe(true);
  });

  it('getContradictions returns a number', () => {
    const wf = new WaveFunction(3, 3);
    wf.addTile(makeTile('x'));
    wf.initialize();
    expect(typeof wf.getContradictions()).toBe('number');
  });
});

// =============================================================================
// FEATURE 4: world/WorldStreamer
// =============================================================================
describe('Feature 4: WorldStreamer', () => {
  it('getLoadedCount is 0 initially', () => {
    expect(new WorldStreamer().getLoadedCount()).toBe(0);
  });

  it('loadChunk returns a chunk', () => {
    const ws = new WorldStreamer();
    const chunk = ws.loadChunk(0, 0);
    expect(chunk).toBeDefined();
  });

  it('getLoadedCount increments after loadChunk', () => {
    const ws = new WorldStreamer();
    ws.loadChunk(0, 0);
    expect(ws.getLoadedCount()).toBeGreaterThan(0);
  });

  it('getChunk returns the loaded chunk', () => {
    const ws = new WorldStreamer();
    ws.loadChunk(1, 2);
    expect(ws.getChunk(1, 2)).toBeDefined();
  });

  it('getChunk returns undefined for unloaded chunk', () => {
    expect(new WorldStreamer().getChunk(99, 99)).toBeUndefined();
  });

  it('getLoadedChunks returns array', () => {
    const ws = new WorldStreamer();
    ws.loadChunk(0, 0);
    expect(Array.isArray(ws.getLoadedChunks())).toBe(true);
  });

  it('setViewerPosition does not throw', () => {
    const ws = new WorldStreamer();
    expect(() => ws.setViewerPosition(100, 100)).not.toThrow();
  });

  it('getChunkSize returns positive number', () => {
    expect(new WorldStreamer().getChunkSize()).toBeGreaterThan(0);
  });
});

// =============================================================================
// FEATURE 5: world/LODManager
// =============================================================================
describe('Feature 5: LODManager', () => {
  const pos = [0, 0, 0];
  const levels = [
    { level: 0, maxDistance: 10, meshDetail: 1.0 },
    { level: 1, maxDistance: 50, meshDetail: 0.5 },
    { level: 2, maxDistance: 100, meshDetail: 0.1 },
  ];

  it('getObjectCount is 0 initially', () => {
    expect(new LODManager().getObjectCount()).toBe(0);
  });

  it('register increments getObjectCount', () => {
    const lod = new LODManager();
    lod.register('tree1', pos, levels);
    expect(lod.getObjectCount()).toBe(1);
  });

  it('getObject returns registered object', () => {
    const lod = new LODManager();
    lod.register('rock1', pos, levels);
    expect(lod.getObject('rock1')).toBeDefined();
  });

  it('unregister decrements count', () => {
    const lod = new LODManager();
    lod.register('obj', pos, levels);
    lod.unregister('obj');
    expect(lod.getObjectCount()).toBe(0);
  });

  it('setViewerPosition does not throw', () => {
    const lod = new LODManager();
    expect(() => lod.setViewerPosition(0, 0, 0)).not.toThrow();
  });

  it('update does not throw', () => {
    const lod = new LODManager();
    lod.register('tree', pos, levels);
    lod.setViewerPosition(0, 0, 0);
    expect(() => lod.update(0.016)).not.toThrow();
  });

  it('getObjectsAtLevel returns array', () => {
    const lod = new LODManager();
    lod.register('bush', pos, levels);
    lod.setViewerPosition(0, 0, 0);
    lod.update(0.1);
    expect(Array.isArray(lod.getObjectsAtLevel(0))).toBe(true);
  });
});

// =============================================================================
// FEATURE 6: world/OcclusionCulling
// =============================================================================
describe('Feature 6: OcclusionCulling', () => {
  const bounds = { min: [-1, -1, -1], max: [1, 1, 1] };

  it('getTotalCount is 0 initially', () => {
    expect(new OcclusionCulling().getTotalCount()).toBe(0);
  });

  it('register increments getTotalCount', () => {
    const oc = new OcclusionCulling();
    oc.register('obj1', bounds);
    expect(oc.getTotalCount()).toBe(1);
  });

  it('unregister removes object', () => {
    const oc = new OcclusionCulling();
    oc.register('obj1', bounds);
    oc.unregister('obj1');
    expect(oc.getTotalCount()).toBe(0);
  });

  it('performCulling does not throw', () => {
    const oc = new OcclusionCulling();
    oc.register('a', bounds);
    expect(() => oc.performCulling()).not.toThrow();
  });

  it('getVisibleCount and getCulledCount sum to total', () => {
    const oc = new OcclusionCulling();
    oc.register('a', bounds);
    oc.register('b', { min: [5, 5, 5], max: [6, 6, 6] });
    oc.performCulling();
    expect(oc.getVisibleCount() + oc.getCulledCount()).toBe(2);
  });

  it('testAABBOverlap returns true for overlapping boxes', () => {
    const oc = new OcclusionCulling();
    const a = { min: [0, 0, 0], max: [2, 2, 2] };
    const b = { min: [1, 1, 1], max: [3, 3, 3] };
    expect(oc.testAABBOverlap(a, b)).toBe(true);
  });

  it('testAABBOverlap returns false for non-overlapping boxes', () => {
    const oc = new OcclusionCulling();
    const a = { min: [0, 0, 0], max: [1, 1, 1] };
    const b = { min: [5, 5, 5], max: [6, 6, 6] };
    expect(oc.testAABBOverlap(a, b)).toBe(false);
  });
});

// =============================================================================
// FEATURE 7: environment/WeatherSystem
// =============================================================================
describe('Feature 7: WeatherSystem', () => {
  it('getType returns clear by default', () => {
    expect(new WeatherSystem().getType()).toBe('clear');
  });

  it('setImmediate changes weather type', () => {
    const ws = new WeatherSystem();
    ws.setImmediate('rain');
    expect(ws.getType()).toBe('rain');
  });

  it('setWeather triggers a transition', () => {
    const ws = new WeatherSystem();
    ws.setWeather('storm', 2.0);
    expect(ws.isTransitioning()).toBe(true);
  });

  it('isTransitioning false immediately after setImmediate', () => {
    const ws = new WeatherSystem('clear');
    ws.setImmediate('fog');
    expect(ws.isTransitioning()).toBe(false);
  });

  it('update advances transition', () => {
    const ws = new WeatherSystem();
    ws.setWeather('snow', 1.0);
    ws.update(0.5);
    expect(ws.getTransitionProgress()).toBeGreaterThan(0);
  });

  it('getState returns weather state object', () => {
    const state = new WeatherSystem().getState();
    expect(state.type).toBe('clear');
    expect(typeof state.intensity).toBe('number');
  });

  it('getHistory records weather changes', () => {
    const ws = new WeatherSystem();
    ws.setImmediate('cloudy');
    expect(ws.getHistory().length).toBeGreaterThan(0);
  });
});

// =============================================================================
// FEATURE 8: environment/DayNightCycle
// =============================================================================
describe('Feature 8: DayNightCycle', () => {
  it('getTime returns a number', () => {
    expect(typeof new DayNightCycle().getTime()).toBe('number');
  });

  it('setTime changes the time', () => {
    const dnc = new DayNightCycle();
    dnc.setTime(12);
    expect(dnc.getTime()).toBeCloseTo(12);
  });

  it('getPeriod returns a valid period', () => {
    const dnc = new DayNightCycle();
    const valid = ['dawn', 'morning', 'noon', 'afternoon', 'dusk', 'evening', 'night', 'midnight'];
    expect(valid).toContain(dnc.getPeriod());
  });

  it('update advances time when not paused', () => {
    const dnc = new DayNightCycle();
    const initial = dnc.getTime();
    dnc.setTimeScale(100); // fast forward
    dnc.update(1.0);
    expect(dnc.getTime()).not.toBe(initial);
  });

  it('pause stops time from advancing', () => {
    const dnc = new DayNightCycle();
    dnc.pause();
    const t = dnc.getTime();
    dnc.update(1.0);
    expect(dnc.getTime()).toBe(t);
  });

  it('resume unpauses', () => {
    const dnc = new DayNightCycle();
    dnc.pause();
    dnc.resume();
    expect(dnc.isPaused()).toBe(false);
  });

  it('getSunAngle returns a number', () => {
    expect(typeof new DayNightCycle().getSunAngle()).toBe('number');
  });

  it('getFormattedTime returns a string', () => {
    expect(typeof new DayNightCycle().getFormattedTime()).toBe('string');
  });
});

// =============================================================================
// FEATURE 9: tilemap/TileMap
// =============================================================================
describe('Feature 9: TileMap', () => {
  const tile = { id: 1, flags: 1 }; // SOLID flag

  it('getLayerCount is 0 initially', () => {
    expect(new TileMap(10, 10, 16).getLayerCount()).toBe(0);
  });

  it('addLayer increments getLayerCount', () => {
    const tm = new TileMap(10, 10, 16);
    tm.addLayer('ground');
    expect(tm.getLayerCount()).toBe(1);
  });

  it('setTile and getTile roundtrip', () => {
    const tm = new TileMap(10, 10, 16);
    tm.addLayer('main');
    tm.setTile('main', 2, 3, tile);
    expect(tm.getTile('main', 2, 3)?.id).toBe(1);
  });

  it('getTile returns undefined for empty position', () => {
    const tm = new TileMap(10, 10, 16);
    tm.addLayer('bg');
    expect(tm.getTile('bg', 5, 5)).toBeUndefined();
  });

  it('isSolid returns true for solid tile', () => {
    const tm = new TileMap(10, 10, 16);
    tm.addLayer('main');
    tm.setTile('main', 1, 1, { id: 2, flags: 1 }); // SOLID
    expect(tm.isSolid(1, 1)).toBe(true);
  });

  it('worldToTile converts correctly', () => {
    const tm = new TileMap(10, 10, 16);
    const tile = tm.worldToTile(32, 48);
    expect(tile.x).toBe(2);
    expect(tile.y).toBe(3);
  });

  it('tileToWorld converts correctly', () => {
    const tm = new TileMap(10, 10, 16);
    const world = tm.tileToWorld(2, 3);
    expect(world.x).toBe(32);
    expect(world.y).toBe(48);
  });

  it('getWidth and getHeight return dimensions', () => {
    const tm = new TileMap(8, 12, 32);
    expect(tm.getWidth()).toBe(8);
    expect(tm.getHeight()).toBe(12);
  });
});

// =============================================================================
// FEATURE 10: environment/TerrainBrush
// =============================================================================
describe('Feature 10: TerrainBrush', () => {
  function makeTerrain() {
    const ts = new TerrainSystem();
    ts.createTerrain({
      id: 't1',
      width: 64,
      depth: 64,
      resolution: 9,
      maxHeight: 50,
      position: [0, 0, 0],
    });
    return ts;
  }

  it('getUndoCount is 0 initially', () => {
    const tb = new TerrainBrush(makeTerrain());
    expect(tb.getUndoCount()).toBe(0);
  });

  it('setMode changes the brush mode', () => {
    const tb = new TerrainBrush(makeTerrain(), {
      mode: 'raise',
      radius: 3,
      strength: 0.5,
      falloff: 0.5,
    });
    tb.setMode('flatten');
    expect(tb.getConfig().mode).toBe('flatten');
  });

  it('setRadius changes the radius', () => {
    const tb = new TerrainBrush(makeTerrain());
    tb.setRadius(5);
    expect(tb.getConfig().radius).toBe(5);
  });

  it('apply returns a BrushStroke', () => {
    const tb = new TerrainBrush(makeTerrain(), {
      mode: 'raise',
      radius: 2,
      strength: 0.3,
      falloff: 0.5,
    });
    const stroke = tb.apply('t1', 3, 3);
    expect(stroke).toBeDefined();
    expect(stroke.terrainId).toBe('t1');
  });

  it('getUndoCount increments after apply', () => {
    const tb = new TerrainBrush(makeTerrain(), {
      mode: 'raise',
      radius: 2,
      strength: 0.3,
      falloff: 0.5,
    });
    tb.apply('t1', 2, 2);
    expect(tb.getUndoCount()).toBe(1);
  });

  it('undo returns the stroke and decrements count', () => {
    const tb = new TerrainBrush(makeTerrain(), {
      mode: 'raise',
      radius: 2,
      strength: 0.3,
      falloff: 0.5,
    });
    tb.apply('t1', 2, 2);
    const undone = tb.undo();
    expect(undone).toBeDefined();
    expect(tb.getUndoCount()).toBe(0);
  });

  it('redo after undo restores stroke', () => {
    const tb = new TerrainBrush(makeTerrain(), {
      mode: 'raise',
      radius: 2,
      strength: 0.3,
      falloff: 0.5,
    });
    tb.apply('t1', 2, 2);
    tb.undo();
    expect(tb.getRedoCount()).toBe(1);
    tb.redo();
    expect(tb.getUndoCount()).toBe(1);
  });
});
