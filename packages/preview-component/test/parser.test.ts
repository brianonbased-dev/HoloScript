/**
 * Tests for the HoloScript lightweight parser.
 */

import { describe, it, expect } from 'vitest';
import { parseHoloScript } from '../src/engine/parser';
import { resolveColor } from '../src/engine/colors';

describe('parseHoloScript', () => {
  it('should parse a basic orb with geometry and color', () => {
    const result = parseHoloScript(`
      orb mySphere {
        geometry: "sphere"
        color: "cyan"
        position: [0, 1, 0]
      }
    `);

    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].name).toBe('mySphere');
    expect(result.objects[0].geometry).toBe('sphere');
    expect(result.objects[0].position).toEqual([0, 1, 0]);
  });

  it('should parse multiple objects', () => {
    const result = parseHoloScript(`
      orb cube1 {
        geometry: "cube"
        color: "red"
        position: [0, 0, 0]
      }
      orb sphere1 {
        geometry: "sphere"
        color: "blue"
        position: [3, 0, 0]
      }
    `);

    expect(result.objects).toHaveLength(2);
    expect(result.objects[0].name).toBe('cube1');
    expect(result.objects[1].name).toBe('sphere1');
  });

  it('should parse object keyword', () => {
    const result = parseHoloScript(`
      object myBox {
        geometry: "cube"
        color: "gold"
        position: [1, 2, 3]
      }
    `);

    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].name).toBe('myBox');
    expect(result.objects[0].position).toEqual([1, 2, 3]);
  });

  it('should parse scale as array', () => {
    const result = parseHoloScript(`
      orb scaled {
        geometry: "cube"
        scale: [2, 3, 4]
      }
    `);

    expect(result.objects[0].scale).toEqual([2, 3, 4]);
  });

  it('should parse scale as number', () => {
    const result = parseHoloScript(`
      orb scaled {
        geometry: "cube"
        scale: 2.5
      }
    `);

    expect(result.objects[0].scale).toEqual([2.5, 2.5, 2.5]);
  });

  it('should parse rotation and convert degrees to radians', () => {
    const result = parseHoloScript(`
      orb rotated {
        geometry: "cube"
        rotation: [90, 0, 0]
      }
    `);

    const [rx, ry, rz] = result.objects[0].rotation;
    expect(rx).toBeCloseTo(Math.PI / 2, 5);
    expect(ry).toBeCloseTo(0, 5);
    expect(rz).toBeCloseTo(0, 5);
  });

  it('should parse position with object syntax', () => {
    const result = parseHoloScript(`
      orb positioned {
        geometry: "sphere"
        position: [1.5, 2.5, 3.5]
      }
    `);

    expect(result.objects[0].position).toEqual([1.5, 2.5, 3.5]);
  });

  it('should parse material type', () => {
    const result = parseHoloScript(`
      orb glassy {
        geometry: "sphere"
        material: "glass"
        color: "white"
      }
    `);

    expect(result.objects[0].material).toBe('glass');
  });

  it('should parse glow flag', () => {
    const result = parseHoloScript(`
      orb glowing {
        geometry: "sphere"
        glow: true
      }
    `);

    expect(result.objects[0].glow).toBe(true);
  });

  it('should parse animation properties', () => {
    const result = parseHoloScript(`
      orb animated {
        geometry: "cube"
        animate: "spin"
        animSpeed: 2.5
        animAmplitude: 0.5
        animRadius: 3
      }
    `);

    const obj = result.objects[0];
    expect(obj.animate).toBe('spin');
    expect(obj.animSpeed).toBe(2.5);
    expect(obj.animAmplitude).toBe(0.5);
    expect(obj.animRadius).toBe(3);
  });

  it('should parse texture properties', () => {
    const result = parseHoloScript(`
      orb textured {
        geometry: "cube"
        texture: "https://example.com/texture.png"
        textureRepeat: [2, 2]
        textureOffset: [0.5, 0.5]
      }
    `);

    const obj = result.objects[0];
    expect(obj.texture).toBe('https://example.com/texture.png');
    expect(obj.textureRepeat).toEqual([2, 2]);
    expect(obj.textureOffset).toEqual([0.5, 0.5]);
  });

  it('should parse environment skybox', () => {
    const result = parseHoloScript(`
      environment : {
        skybox: "sunset"
      }
      orb test {
        geometry: "cube"
      }
    `);

    expect(result.environment.skybox).toBe('sunset');
  });

  it('should default to cube geometry', () => {
    const result = parseHoloScript(`
      orb noGeo {
        color: "red"
        position: [0, 0, 0]
      }
    `);

    expect(result.objects[0].geometry).toBe('cube');
  });

  it('should parse type property as geometry', () => {
    const result = parseHoloScript(`
      orb typed {
        type: "torus"
        color: "purple"
      }
    `);

    expect(result.objects[0].geometry).toBe('torus');
  });

  it('should return empty result for empty input', () => {
    const result = parseHoloScript('');
    expect(result.objects).toHaveLength(0);
  });

  it('should handle button and slider keywords', () => {
    const result = parseHoloScript(`
      button myBtn {
        geometry: "cube"
        color: "green"
        position: [0, 0, 0]
      }
      slider mySlider {
        geometry: "cylinder"
        color: "blue"
        position: [2, 0, 0]
      }
    `);

    expect(result.objects).toHaveLength(2);
    expect(result.objects[0].name).toBe('myBtn');
    expect(result.objects[1].name).toBe('mySlider');
  });
});

describe('resolveColor', () => {
  it('should resolve named colors', () => {
    expect(resolveColor('red')).toBe(0xe53935);
    expect(resolveColor('blue')).toBe(0x1e88e5);
    expect(resolveColor('cyan')).toBe(0x00acc1);
    expect(resolveColor('gold')).toBe(0xffc107);
  });

  it('should resolve hex strings', () => {
    expect(resolveColor('ff0000')).toBe(0xff0000);
    expect(resolveColor('#00ff00')).toBe(0x00ff00);
    expect(resolveColor("'aabbcc'")).toBe(0xaabbcc);
  });

  it('should be case insensitive', () => {
    expect(resolveColor('Red')).toBe(0xe53935);
    expect(resolveColor('CYAN')).toBe(0x00acc1);
  });

  it('should return default for unknown colors', () => {
    expect(resolveColor('nonexistent')).toBe(0x4a9eff);
    expect(resolveColor(null)).toBe(0x4a9eff);
    expect(resolveColor(undefined)).toBe(0x4a9eff);
  });
});
