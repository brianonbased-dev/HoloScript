import { describe, it, expect } from 'vitest';
import { generateThreeJS } from '../build/generators';

// HoloScript rotation is in degrees; three.js Euler angles are radians.
// Found building a scanned room: a chair at rotation [0, 90, 0] came out
// turned 90 radians (about 5157 degrees).
function rotationOf(code: string, name: string): number[] {
  const m = code.match(new RegExp(`${name}\\.rotation\\.set\\(([^)]*)\\)`));
  if (!m) throw new Error(`no rotation.set for ${name} in:\n${code}`);
  return m[1].split(',').map((v) => Number(v.trim()));
}

describe('generateThreeJS rotation units', () => {
  it('converts array-form degrees to radians', () => {
    const code = generateThreeJS(
      [{ name: 'Chair', properties: { geometry: 'cube', rotation: [0, 90, 0] } }],
      [],
      false
    );
    const [x, y, z] = rotationOf(code, 'Chair');
    expect(x).toBe(0);
    expect(y).toBeCloseTo(Math.PI / 2, 9);
    expect(z).toBe(0);
  });

  it('converts object-form degrees to radians', () => {
    const code = generateThreeJS(
      [{ name: 'Bed', properties: { geometry: 'cube', rotation: { x: -45, y: 180, z: 30 } } }],
      [],
      false
    );
    const [x, y, z] = rotationOf(code, 'Bed');
    expect(x).toBeCloseTo(-Math.PI / 4, 9);
    expect(y).toBeCloseTo(Math.PI, 9);
    expect(z).toBeCloseTo(Math.PI / 6, 9);
  });

  it('emits no rotation for an unrotated object', () => {
    const code = generateThreeJS([{ name: 'Floor', properties: { geometry: 'cube' } }], [], false);
    expect(code).not.toMatch(/Floor\.rotation\.set/);
  });
});
