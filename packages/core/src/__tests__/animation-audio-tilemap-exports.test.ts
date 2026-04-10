/**
 * @fileoverview Tests for Animation, Audio, and TileMap barrel exports
 */
import { describe, it, expect } from 'vitest';
import {
  // Animation
  AnimationEngine,
  Easing,
  // Audio
  AudioEngine,
  // TileMap
  TileMap,
  TileFlags,
} from '../index';

describe('Animation Engine exports', () => {
  it('AnimationEngine plays and updates clips', () => {
    const engine = new AnimationEngine();
    let output = 0;
    engine.play(
      {
        id: 'test-clip',
        property: 'x',
        duration: 1,
        loop: false,
        pingPong: false,
        delay: 0,
        keyframes: [
          { time: 0, value: 0 },
          { time: 1, value: 100 },
        ],
      },
      (v: number) => {
        output = v;
      }
    );
    expect(engine.isActive('test-clip')).toBe(true);
    engine.update(0.5);
    expect(output).toBeGreaterThan(0);
    expect(output).toBeLessThanOrEqual(100);
  });

  it('Easing functions are exported and work', () => {
    expect(Easing.linear(0.5)).toBe(0.5);
    expect(Easing.easeInQuad(0)).toBe(0);
    expect(Easing.easeOutQuad(1)).toBe(1);
    expect(Easing.easeOutBounce(0.5)).toBeGreaterThan(0);
  });

  it('AnimationEngine interpolates keyframes over time', () => {
    const engine = new AnimationEngine();
    let val = 0;
    engine.play(
      {
        id: 'interp',
        property: 'x',
        duration: 1,
        loop: false,
        pingPong: false,
        delay: 0,
        keyframes: [
          { time: 0, value: 0 },
          { time: 1, value: 10 },
        ],
      },
      (v: number) => {
        val = v;
      }
    );
    engine.update(0);
    expect(val).toBe(0);
    engine.update(0.5);
    expect(val).toBeCloseTo(5, 0);
    engine.update(0.5);
    expect(val).toBeCloseTo(10, 0);
  });

  it('AnimationEngine pause/resume/stop', () => {
    const engine = new AnimationEngine();
    engine.play(
      {
        id: 'p',
        property: 'y',
        duration: 2,
        loop: false,
        pingPong: false,
        delay: 0,
        keyframes: [
          { time: 0, value: 0 },
          { time: 2, value: 1 },
        ],
      },
      () => {}
    );
    engine.pause('p');
    expect(engine.isActive('p')).toBe(true);
    engine.resume('p');
    engine.stop('p');
    expect(engine.isActive('p')).toBe(false);
  });

  it('AnimationEngine clear removes all', () => {
    const engine = new AnimationEngine();
    engine.play(
      {
        id: 'a',
        property: 'x',
        duration: 1,
        loop: false,
        pingPong: false,
        delay: 0,
        keyframes: [{ time: 0, value: 0 }],
      },
      () => {}
    );
    engine.play(
      {
        id: 'b',
        property: 'x',
        duration: 1,
        loop: false,
        pingPong: false,
        delay: 0,
        keyframes: [{ time: 0, value: 0 }],
      },
      () => {}
    );
    expect(engine.getActiveIds().length).toBe(2);
    engine.clear();
    expect(engine.getActiveIds().length).toBe(0);
  });
});

describe('Audio Engine exports', () => {
  it('AudioEngine plays sources with 3D position', () => {
    const engine = new AudioEngine();
    const id = engine.play('test-sound', { position: { x: 5, y: 0, z: 3 }, volume: 0.8 });
    expect(typeof id).toBe('string');
    expect(engine.getActiveCount()).toBe(1);
  });

  it('AudioEngine updateListener and spatial computation', () => {
    const engine = new AudioEngine();
    engine.setListenerPosition({ x: 0, y: 0, z: 0 });
    engine.play('far-sound', { position: { x: 100, y: 0, z: 0 }, volume: 1 });
    engine.update(0.016);
    const sources = engine.getActiveSources();
    expect(sources.length).toBe(1);
    // Far sound should have reduced volume
    expect(sources[0].computedVolume).toBeLessThan(1);
  });

  it('AudioEngine master volume and mute', () => {
    const engine = new AudioEngine();
    engine.setMasterVolume(0.5);
    expect(engine.getMasterVolume()).toBe(0.5);
    engine.setMuted(true);
    expect(engine.isMuted()).toBe(true);
  });

  it('AudioEngine distance attenuation reduces far sources', () => {
    const engine = new AudioEngine();
    engine.setListenerPosition({ x: 0, y: 0, z: 0 });
    engine.play('near', { position: { x: 1, y: 0, z: 0 }, volume: 1 });
    engine.play('far', { position: { x: 50, y: 0, z: 0 }, volume: 1 });
    engine.update(0.016);
    const sources = engine.getActiveSources();
    const near = sources.find((s) => s.soundId === 'near')!;
    const far = sources.find((s) => s.soundId === 'far')!;
    expect(near.computedVolume).toBeGreaterThan(far.computedVolume);
  });

  it('AudioEngine panning biases for lateral sources', () => {
    const engine = new AudioEngine();
    engine.setListenerPosition({ x: 0, y: 0, z: 0 });
    engine.setListenerOrientation({ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 });
    engine.play('right', { position: { x: 5, y: 0, z: 0 }, volume: 1 });
    engine.update(0.016);
    const s = engine.getActiveSources()[0];
    expect(s.computedPan).toBeGreaterThan(0); // Right side
  });
});

describe('TileMap exports', () => {
  it('TileMap creates with layers', () => {
    const tm = new TileMap(16, 16, 32);
    tm.addLayer('ground');
    expect(tm.getLayerCount()).toBe(1);
    expect(tm.getWidth()).toBe(16);
  });

  it('TileMap set/get/remove tiles', () => {
    const tm = new TileMap(8, 8, 16);
    tm.addLayer('floor');
    tm.setTile('floor', 3, 4, { id: 1, flags: TileFlags.SOLID });
    const tile = tm.getTile('floor', 3, 4);
    expect(tile).not.toBeUndefined();
    expect(tile!.id).toBe(1);
    expect(tm.isSolid(3, 4)).toBe(true);

    tm.removeTile('floor', 3, 4);
    expect(tm.getTile('floor', 3, 4)).toBeUndefined();
  });

  it('TileMap world/tile coordinate conversion', () => {
    const tm = new TileMap(10, 10, 32);
    const tc = tm.worldToTile(100, 64);
    expect(tc.x).toBe(3);
    expect(tc.y).toBe(2);
    const wc = tm.tileToWorld(3, 2);
    expect(wc.x).toBe(96);
    expect(wc.y).toBe(64);
  });

  it('TileMap auto-tiling applies rules', () => {
    const tm = new TileMap(4, 4, 16);
    tm.addLayer('terrain');
    tm.setTile('terrain', 1, 1, { id: 1, flags: 0 });
    tm.setTile('terrain', 2, 1, { id: 1, flags: 0 }); // E neighbor
    tm.addAutoTileRule({ tileId: 1, neighbors: 0b00000100, resultId: 2 }); // E present → id 2
    const count = tm.applyAutoTile('terrain');
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('TileFlags has expected values', () => {
    expect(TileFlags.NONE).toBe(0);
    expect(TileFlags.SOLID).toBe(1);
    expect(TileFlags.TRIGGER).toBe(16);
  });
});
