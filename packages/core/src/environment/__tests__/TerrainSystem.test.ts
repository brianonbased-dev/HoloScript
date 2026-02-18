import { describe, it, expect, beforeEach } from 'vitest';
import { TerrainSystem } from '../TerrainSystem';

describe('TerrainSystem', () => {
  let ts: TerrainSystem;
  const cfg = { id: 't1', width: 100, depth: 100, resolution: 32, maxHeight: 50, position: { x: 0, y: 0, z: 0 } };

  beforeEach(() => {
    ts = new TerrainSystem();
  });

  it('creates terrain procedurally', () => {
    const id = ts.createTerrain(cfg);
    expect(id).toBe('t1');
    expect(ts.getTerrainIds()).toContain('t1');
  });

  it('creates terrain from heightmap', () => {
    const hm = new Float32Array(32 * 32).fill(0.5);
    const id = ts.createFromHeightmap(cfg, hm);
    expect(id).toBe('t1');
  });

  it('getHeightAt returns interpolated height', () => {
    const hm = new Float32Array(32 * 32).fill(0.5);
    ts.createFromHeightmap(cfg, hm);
    const h = ts.getHeightAt('t1', 50, 50);
    expect(h).toBeCloseTo(25, 0); // 0.5 * maxHeight=50 => 25
  });

  it('getHeightAt returns 0 for unknown terrain', () => {
    expect(ts.getHeightAt('nope', 0, 0)).toBe(0);
  });

  it('getNormalAt returns a vector', () => {
    const hm = new Float32Array(32 * 32).fill(0.5);
    ts.createFromHeightmap(cfg, hm);
    const n = ts.getNormalAt('t1', 50, 50);
    expect(n).toBeDefined();
    expect(n.y).toBeGreaterThan(0); // flat terrain → normal points up
  });

  it('setHeightAt modifies heightmap', () => {
    const hm = new Float32Array(32 * 32).fill(0.5);
    ts.createFromHeightmap(cfg, hm);
    ts.setHeightAt('t1', 16, 16, 1.0);
    const data = ts.getTerrain('t1')!;
    expect(data.heightmap[16 * 32 + 16]).toBe(1.0);
  });

  it('getCollider returns interface for existing terrain', () => {
    const hm = new Float32Array(32 * 32).fill(0.3);
    ts.createFromHeightmap(cfg, hm);
    const collider = ts.getCollider('t1');
    expect(collider).not.toBeNull();
    expect(collider!.getHeightAt(50, 50)).toBeCloseTo(15, 0);
  });

  it('getCollider returns null for missing terrain', () => {
    expect(ts.getCollider('nope')).toBeNull();
  });

  it('setLayers and getLayers', () => {
    ts.createTerrain(cfg);
    const layers = [{ id: 'grass', texture: 'grass.png', tiling: 10, minHeight: 0, maxHeight: 0.3, minSlope: 0, maxSlope: 30 }];
    ts.setLayers('t1', layers);
    expect(ts.getLayers('t1')).toEqual(layers);
  });

  it('removeTerrain removes it', () => {
    ts.createTerrain(cfg);
    expect(ts.removeTerrain('t1')).toBe(true);
    expect(ts.getTerrainIds()).not.toContain('t1');
  });

  it('getDefaultLayers returns standard layers', () => {
    const defaults = ts.getDefaultLayers();
    expect(defaults.length).toBeGreaterThan(0);
    expect(defaults[0].id).toBeDefined();
  });

  it('getChunks returns generated chunks', () => {
    ts.createTerrain(cfg);
    const chunks = ts.getChunks('t1');
    expect(chunks.length).toBeGreaterThan(0);
  });
});
