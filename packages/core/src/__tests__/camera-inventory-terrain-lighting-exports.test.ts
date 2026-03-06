/**
 * @fileoverview Tests for CameraController, InventorySystem, TerrainSystem, LightingModel barrel exports
 */
import { describe, it, expect } from 'vitest';
import {
  CameraController,
  InventorySystem,
  TerrainSystem,
  LightingModel,
} from '../index';

describe('CameraController exports', () => {
  it('creates with default config and returns state', () => {
    const cam = new CameraController();
    const state = cam.getState();
    expect(state.fov).toBe(60);
    expect(state.zoom).toBe(1);
    expect(state.position).toBeDefined();
  });

  it('setMode changes camera mode', () => {
    const cam = new CameraController();
    cam.setMode('orbit');
    expect(cam.getMode()).toBe('orbit');
    cam.setMode('free');
    expect(cam.getMode()).toBe('free');
  });

  it('orbit rotation updates position', () => {
    const cam = new CameraController({ mode: 'orbit' });
    cam.setTarget(0, 0, 0);
    const before = cam.getState().position.x;
    cam.rotateOrbit(1, 0);
    cam.update(0.016);
    expect(cam.getState().position.x).not.toBe(before);
  });

  it('zoom clamps within range', () => {
    const cam = new CameraController({ minZoom: 0.5, maxZoom: 3 });
    cam.zoom(10);
    expect(cam.getState().zoom).toBeLessThanOrEqual(3);
    cam.zoom(-10);
    expect(cam.getState().zoom).toBeGreaterThanOrEqual(0.5);
  });

  it('follow mode smoothly approaches target', () => {
    const cam = new CameraController({ mode: 'follow', smoothing: 0.5 });
    cam.setTarget(100, 0, 0);
    cam.update(0.5);
    expect(cam.getState().position.x).toBeGreaterThan(0);
  });
});

describe('InventorySystem exports', () => {
  const sword = { id: 'sword', name: 'Sword', category: 'weapon' as const, rarity: 'common' as const, weight: 3, maxStack: 1, value: 50, properties: {} };
  const potion = { id: 'potion', name: 'Potion', category: 'consumable' as const, rarity: 'common' as const, weight: 0.5, maxStack: 20, value: 10, properties: {} };

  it('adds items and tracks weight', () => {
    const inv = new InventorySystem(10, 50);
    inv.addItem(sword);
    expect(inv.getSlotCount()).toBe(1);
    expect(inv.getCurrentWeight()).toBe(3);
    expect(inv.hasItem('sword')).toBe(true);
  });

  it('stacks stackable items', () => {
    const inv = new InventorySystem(10, 50);
    inv.addItem(potion, 5);
    inv.addItem(potion, 3);
    expect(inv.getItemCount('potion')).toBe(8);
    expect(inv.getSlotCount()).toBe(1); // Stacked in one slot
  });

  it('removeItem removes correct quantity', () => {
    const inv = new InventorySystem(10, 50);
    inv.addItem(potion, 10);
    inv.removeItem('potion', 3);
    expect(inv.getItemCount('potion')).toBe(7);
  });

  it('weight limit prevents over-filling', () => {
    const inv = new InventorySystem(10, 5);
    const result = inv.addItem(sword, 3); // 9kg, over 5kg limit
    expect(result.added).toBeLessThan(3);
    expect(inv.getCurrentWeight()).toBeLessThanOrEqual(5);
  });

  it('sort by rarity works', () => {
    const inv = new InventorySystem(10, 100);
    inv.addItem(sword);
    inv.addItem({ ...potion, rarity: 'legendary' });
    inv.sort('rarity');
    const items = inv.getAllItems();
    expect(items[0].item.rarity).toBe('legendary');
  });
});

describe('TerrainSystem exports', () => {
  it('creates terrain with procedural generation', () => {
    const ts = new TerrainSystem();
    const id = ts.createTerrain({ id: 'test', width: 32, depth: 32, resolution: 8, maxHeight: 10, position: { x: 0, y: 0, z: 0 } });
    expect(typeof id).toBe('string');
    expect(ts.getTerrainIds().length).toBe(1);
  });

  it('getHeightAt returns interpolated height', () => {
    const ts = new TerrainSystem();
    const id = ts.createTerrain({ id: 'h', width: 16, depth: 16, resolution: 4, maxHeight: 5, position: { x: 0, y: 0, z: 0 } }, { seed: 42 });
    const h = ts.getHeightAt(id, 8, 8);
    expect(typeof h).toBe('number');
  });

  it('setHeightAt modifies heightmap', () => {
    const ts = new TerrainSystem();
    const res = 8;
    const id = ts.createTerrain({ id: 'edit', width: 32, depth: 32, resolution: res, maxHeight: 10, position: { x: 0, y: 0, z: 0 } });
    const gx = 3, gz = 3;
    // Heights are normalized [0,1] in TerrainSystem
    ts.setHeightAt(id, gx, gz, 0.75);
    const t = ts.getTerrain(id);
    expect(t).toBeDefined();
    expect(t!.heightmap[gz * res + gx]).toBeCloseTo(0.75);
  });

  it('getCollider returns collider interface', () => {
    const ts = new TerrainSystem();
    const id = ts.createTerrain({ id: 'col', width: 16, depth: 16, resolution: 4, maxHeight: 5, position: { x: 0, y: 0, z: 0 } });
    const collider = ts.getCollider(id);
    expect(collider).not.toBeNull();
    expect(typeof collider!.getHeightAt(8, 8)).toBe('number');
  });

  it('removeTerrain cleans up', () => {
    const ts = new TerrainSystem();
    const id = ts.createTerrain({ id: 'del', width: 8, depth: 8, resolution: 4, maxHeight: 5, position: { x: 0, y: 0, z: 0 } });
    expect(ts.removeTerrain(id)).toBe(true);
    expect(ts.getTerrainIds().length).toBe(0);
  });
});

describe('LightingModel exports', () => {
  it('adds directional/point/spot lights', () => {
    const lm = new LightingModel();
    lm.addLight({ id: 'sun', type: 'directional' });
    lm.addLight({ id: 'lamp', type: 'point', position: { x: 5, y: 3, z: 0 } });
    lm.addLight({ id: 'flash', type: 'spot', spotAngle: 30 });
    expect(lm.getLightCount()).toBe(3);
  });

  it('enableLight toggles lights', () => {
    const lm = new LightingModel();
    lm.addLight({ id: 'l1', type: 'point' });
    expect(lm.getLight('l1')!.enabled).toBe(true);
    lm.enableLight('l1', false);
    expect(lm.getLight('l1')!.enabled).toBe(false);
  });

  it('calculateAttenuation falls off with distance', () => {
    const lm = new LightingModel();
    lm.addLight({ id: 'p', type: 'point', position: { x: 0, y: 0, z: 0 }, range: 10 });
    const near = lm.calculateAttenuation('p', { x: 1, y: 0, z: 0 });
    const far = lm.calculateAttenuation('p', { x: 8, y: 0, z: 0 });
    expect(near).toBeGreaterThan(far);
  });

  it('setAmbient updates ambient config', () => {
    const lm = new LightingModel();
    lm.setAmbient({ intensity: 0.8, useHemisphere: true });
    const amb = lm.getAmbient();
    expect(amb.intensity).toBe(0.8);
    expect(amb.useHemisphere).toBe(true);
  });

  it('getShadowCasters returns only shadow-casting lights', () => {
    const lm = new LightingModel();
    lm.addLight({ id: 's1', type: 'directional', castShadow: true });
    lm.addLight({ id: 's2', type: 'point', castShadow: false });
    const casters = lm.getShadowCasters();
    expect(casters.length).toBe(1);
    expect(casters[0].id).toBe('s1');
  });
});
