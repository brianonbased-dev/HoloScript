/**
 * MatterpakCompiler tests
 *
 * @see MatterpakCompiler.ts
 */

import { describe, it, expect } from 'vitest';
import { MatterpakCompiler, createMatterpakCompiler } from '../MatterpakCompiler';

const SIMPLE_OBJ = `
# Simple cube OBJ
o Cube
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
v 0 0 1
v 1 0 1
v 1 1 1
v 0 1 1
f 1 2 3 4
f 5 6 7 8
f 1 2 6 5
f 2 3 7 6
f 3 4 8 7
f 4 1 5 8
`;

const SIMPLE_MTL = `
newmtl Wood
Kd 0.6 0.4 0.2
Ns 200
map_Kd wood.jpg

newmtl Glass
Kd 0.9 0.9 1.0
Ns 800
`;

const SIMPLE_XYZ = `
# XYZ point cloud
0.5 0.5 0.5 255 0 0
1.5 0.5 0.5 0 255 0
0.5 1.5 0.5 0 0 255
`;

describe('MatterpakCompiler', () => {
  it('should instantiate with default options', () => {
    const compiler = new MatterpakCompiler();
    expect(compiler.compilerName).toBe('matterpak');
    expect(compiler.version).toBe('1.0.0');
  });

  it('should create via factory', () => {
    const compiler = createMatterpakCompiler({ scale: 2.0 });
    expect(compiler.options.scale).toBe(2.0);
  });

  it('should compile a simple OBJ bundle', () => {
    const compiler = new MatterpakCompiler();
    const result = compiler.compile({
      obj: SIMPLE_OBJ,
    });

    expect(result.success).toBe(true);
    expect(result.composition).toBeDefined();
    expect(result.stats.meshGroups).toBe(1);
    expect(result.stats.vertices).toBe(8);
    expect(result.stats.triangles).toBe(12); // 6 quads triangulated = 12 tris
    expect(result.stats.materials).toBe(0);
    expect(result.stats.rooms).toBe(1);
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('should compile OBJ + MTL bundle', () => {
    const compiler = new MatterpakCompiler();
    const result = compiler.compile({
      obj: SIMPLE_OBJ,
      mtl: SIMPLE_MTL,
    });

    expect(result.success).toBe(true);
    expect(result.stats.materials).toBe(2);
    expect(result.composition!.objects.length).toBeGreaterThan(0);
  });

  it('should compile OBJ + XYZ bundle', () => {
    const compiler = new MatterpakCompiler();
    const result = compiler.compile({
      obj: SIMPLE_OBJ,
      xyz: SIMPLE_XYZ,
    });

    expect(result.success).toBe(true);
    expect(result.stats.pointCount).toBe(3);
    // Point cloud becomes a particle-system object
    const particleObj = result.composition!.objects.find((o) => o.id?.startsWith('pointcloud_'));
    expect(particleObj).toBeDefined();
  });

  it('should center origin by default', () => {
    const compiler = new MatterpakCompiler({ centerOrigin: true });
    const result = compiler.compile({ obj: SIMPLE_OBJ });
    const obj = result.composition!.objects[0];
    // Cube center is at (0.5, 0.5, 0.5); with centerOrigin, it should be shifted
    // The position trait should reflect the centering offset
    expect(obj.position).toBeDefined();
  });

  it('should group as rooms when enabled', () => {
    const compiler = new MatterpakCompiler({ groupAsRooms: true });
    const result = compiler.compile({ obj: SIMPLE_OBJ });
    expect(result.stats.rooms).toBeGreaterThan(0);
    expect(result.composition!.spatialGroups.length).toBeGreaterThan(0);
  });

  it('should handle empty OBJ gracefully', () => {
    const compiler = new MatterpakCompiler();
    const result = compiler.compile({ obj: '' });
    expect(result.success).toBe(true);
    expect(result.stats.vertices).toBe(0);
  });

  it('should handle malformed OBJ without crashing', () => {
    const compiler = new MatterpakCompiler();
    const result = compiler.compile({
      obj: 'v 1 2\n f 1 2\n', // Incomplete vertices / faces
    });
    expect(result.success).toBe(true); // Graceful degradation
  });

  it('should apply scale and rotation options', () => {
    const compiler = new MatterpakCompiler({ scale: 2.0, rotationY: 90 });
    const result = compiler.compile({ obj: SIMPLE_OBJ });
    const obj = result.composition!.objects[0];
    expect(obj.scale).toEqual({ x: 2.0, y: 2.0, z: 2.0 });
    expect(obj.rotation).toEqual({ x: 0, y: 90, z: 0 });
  });

  it('should include lights and camera in composition', () => {
    const compiler = new MatterpakCompiler();
    const result = compiler.compile({ obj: SIMPLE_OBJ });
    expect(result.composition!.lights.length).toBeGreaterThanOrEqual(2);
    expect(result.composition!.camera).toBeDefined();
  });

  it('should include a world block with bounds', () => {
    const compiler = new MatterpakCompiler();
    const result = compiler.compile({ obj: SIMPLE_OBJ });
    expect(result.composition!.worlds).toBeDefined();
    expect(result.composition!.worlds!.length).toBe(1);
    expect(result.composition!.worlds![0].bounds).toBeDefined();
  });
});
