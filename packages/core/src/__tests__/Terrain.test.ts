import { describe, it, expect } from 'vitest';
import { TerrainSystem } from '@holoscript/engine/environment/TerrainSystem';
import {
  EnvironmentManager,
  PRESET_SUNNY_DAY,
  PRESET_NIGHT,
  ALL_PRESETS,
} from '@holoscript/engine/environment/EnvironmentPresets';
import { TerrainBrush } from '@holoscript/engine/environment/TerrainBrush';

describe('Cycle 106: Terrain & Environment System', () => {
  // -------------------------------------------------------------------------
  // TerrainSystem
  // -------------------------------------------------------------------------

  it('should create procedural terrain with heightmap', () => {
    const system = new TerrainSystem();
    const id = system.createTerrain({
      id: 'test_terrain',
      width: 100,
      depth: 100,
      resolution: 33,
      maxHeight: 20,
      position: [0, 0, 0],
    });

    expect(id).toBe('test_terrain');
    const terrain = system.getTerrain('test_terrain');
    expect(terrain).toBeDefined();
    expect(terrain!.heightmap.length).toBe(33 * 33);
    expect(terrain!.chunks.length).toBeGreaterThan(0);
  });

  it('should sample height with bilinear interpolation', () => {
    const system = new TerrainSystem();
    const res = 5;
    const heightmap = new Float32Array(res * res).fill(0.5);
    heightmap[2 * res + 2] = 1.0; // Center peak

    system.createFromHeightmap(
      {
        id: 'flat_terrain',
        width: 10,
        depth: 10,
        resolution: res,
        maxHeight: 10,
        position: [0, 0, 0],
      },
      heightmap
    );

    // Center of terrain
    const h = system.getHeightAt('flat_terrain', 5, 5);
    expect(h).toBeGreaterThan(0);

    // Outside terrain
    const hOut = system.getHeightAt('flat_terrain', -5, -5);
    expect(hOut).toBe(0);
  });

  it('should compute surface normals', () => {
    const system = new TerrainSystem();
    system.createTerrain({
      id: 'normal_terrain',
      width: 100,
      depth: 100,
      resolution: 33,
      maxHeight: 10,
      position: [0, 0, 0],
    });

    const normal = system.getNormalAt('normal_terrain', 50, 50);
    expect(normal[1]).toBeGreaterThan(0); // Should point mostly up
    // Normal should be roughly unit length
    const len = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
    expect(len).toBeCloseTo(1, 1);
  });

  it('should provide physics collider interface', () => {
    const system = new TerrainSystem();
    system.createTerrain({
      id: 'collider_terrain',
      width: 100,
      depth: 100,
      resolution: 33,
      maxHeight: 10,
      position: [0, 0, 0],
    });

    const collider = system.getCollider('collider_terrain');
    expect(collider).not.toBeNull();
    expect(typeof collider!.getHeightAt).toBe('function');
    expect(typeof collider!.getNormalAt).toBe('function');

    const h = collider!.getHeightAt(50, 50);
    expect(h).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------------
  // EnvironmentPresets
  // -------------------------------------------------------------------------

  it('should load and switch presets', () => {
    const mgr = new EnvironmentManager();
    expect(mgr.getEnvironment().id).toBe('sunny_day');

    mgr.setPreset('night');
    expect(mgr.getEnvironment().id).toBe('night');

    expect(mgr.getPresetIds()).toHaveLength(ALL_PRESETS.length);
  });

  it('should update sun position from time of day', () => {
    const mgr = new EnvironmentManager(PRESET_SUNNY_DAY);

    mgr.setTimeOfDay(6); // Sunrise
    const sunriseSun = mgr.getEnvironment().skybox.sunPosition!;

    mgr.setTimeOfDay(12); // Noon
    const noonSun = mgr.getEnvironment().skybox.sunPosition!;

    // Sun should be higher at noon than sunrise
    expect(noonSun[1]).toBeGreaterThan(sunriseSun[1]);
  });

  it('should manage weather and update fog', () => {
    const mgr = new EnvironmentManager();

    mgr.setWeather('rain', 0.8);
    const weather = mgr.getWeather();
    expect(weather.type).toBe('rain');
    expect(weather.intensity).toBe(0.8);

    const fog = mgr.getEnvironment().fog;
    expect(fog.density).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // TerrainBrush
  // -------------------------------------------------------------------------

  it('should raise terrain with brush', () => {
    const system = new TerrainSystem();
    const res = 33;

    // Create flat terrain
    const heightmap = new Float32Array(res * res).fill(0.5);
    system.createFromHeightmap(
      {
        id: 'brush_terrain',
        width: 100,
        depth: 100,
        resolution: res,
        maxHeight: 10,
        position: [0, 0, 0],
      },
      heightmap
    );

    const brush = new TerrainBrush(system, { mode: 'raise', radius: 3, strength: 0.5 });
    const stroke = brush.apply('brush_terrain', 16, 16);

    expect(stroke.affectedCells.length).toBeGreaterThan(0);
    // Center should have been raised
    const centerCell = stroke.affectedCells.find((c) => c[0] === 16 && c[2] === 16);
    expect(centerCell).toBeDefined();
    expect(centerCell!.newHeight).toBeGreaterThan(centerCell!.oldHeight);
  });

  it('should support undo/redo for brush strokes', () => {
    const system = new TerrainSystem();
    const res = 17;
    const heightmap = new Float32Array(res * res).fill(0.5);
    system.createFromHeightmap(
      {
        id: 'undo_terrain',
        width: 50,
        depth: 50,
        resolution: res,
        maxHeight: 10,
        position: [0, 0, 0],
      },
      heightmap
    );

    const brush = new TerrainBrush(system, { mode: 'raise', radius: 2, strength: 0.8 });
    brush.apply('undo_terrain', 8, 8);

    // Height changed
    const terrainData = system.getTerrain('undo_terrain')!;
    const raisedHeight = terrainData.heightmap[8 * res + 8];
    expect(raisedHeight).toBeGreaterThan(0.5);

    // Undo
    brush.undo();
    const undoneHeight = terrainData.heightmap[8 * res + 8];
    expect(undoneHeight).toBeCloseTo(0.5, 5);

    // Redo
    brush.redo();
    const redoneHeight = terrainData.heightmap[8 * res + 8];
    expect(redoneHeight).toBeCloseTo(raisedHeight, 5);
  });
});
