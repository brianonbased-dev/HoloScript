import { describe, it, expect } from 'vitest';
import { PathTracerCompiler } from './PathTracerCompiler';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

const prop = (key: string, value: unknown) => ({ key, value });
const obj = (name: string, props: Array<{ key: string; value: unknown }>): HoloObjectDecl =>
  ({ type: 'Object', name, properties: props, traits: [] }) as unknown as HoloObjectDecl;
const comp = (objects: HoloObjectDecl[], name = 'Scene', environment?: unknown): HoloComposition =>
  ({ type: 'HoloComposition', name, objects, environment }) as HoloComposition;

// Runtime GI is verified on real hardware (Jetson Orin/Vulkan → Cornell box PNG with
// colour bleeding + soft shadows). These lock the emitted-project STRUCTURE.
describe('PathTracerCompiler — sovereign offline GPU path tracer', () => {
  it('emits a Cargo project with an optimized profile and the compute deps', () => {
    const project = new PathTracerCompiler().compileProject(comp([obj('A', [prop('mesh', 'sphere')])]));
    expect(Object.keys(project).sort()).toEqual(['Cargo.toml', 'src/main.rs']);
    expect(project['Cargo.toml']).toContain('wgpu = "23"');
    expect(project['Cargo.toml']).toContain('opt-level = 3');
    expect(project['Cargo.toml']).toContain('bytemuck');
  });

  it('emits a real compute path tracer: cosine GI, sphere/box intersection, tonemap+PNG', () => {
    const rs = new PathTracerCompiler().compile(comp([obj('A', [prop('mesh', 'sphere')])]));
    expect(rs).toContain('create_compute_pipeline');
    expect(rs).toContain('@compute @workgroup_size(8, 8, 1)');
    expect(rs).toContain('fn trace(');
    expect(rs).toContain('fn cosine_dir(');
    expect(rs).toContain('fn hit_sphere(');
    expect(rs).toContain('fn hit_box(');
    // accumulation, buffer readback (NOT texture copy → no 256-align), reinhard tonemap
    expect(rs).toContain('copy_buffer_to_buffer');
    expect(rs).toContain('powf(1.0 / 2.2)');
    expect(rs).toContain('png::Encoder::new');
  });

  it('maps geometry to path-traceable primitives via the shared registry (sphere→0, cube→box AABB)', () => {
    const rs = new PathTracerCompiler().compile(
      comp([
        obj('Ball', [prop('mesh', 'sphere'), prop('position', [0, 1, 0]), prop('scale', [2, 2, 2])]),
        obj('Wall', [prop('mesh', 'cube'), prop('position', [0, 0, -3]), prop('scale', [4, 4, 0.2])]),
      ])
    );
    const primCount = (rs.match(/Prim \{ kind: \[/g) || []).length - 1; // minus the struct def
    expect(primCount).toBe(2);
    // sphere → kind 0, center [0,1,0], radius 0.5*max(scale)=1.0 in the a.w lane
    expect(rs).toContain('Prim { kind: [0.0, 0.0, 0.0, 0.0], a: [0.0, 1.0, 0.0, 1.0]');
    // cube → kind 1 (box), AABB min/max from position±scale/2
    expect(rs).toContain('Prim { kind: [1.0, 0.0, 0.0, 0.0], a: [-2.0, -2.0, -3.1');
  });

  it('turns an emissive object into an area light (nonzero emissive, scaled by intensity)', () => {
    const rs = new PathTracerCompiler().compile(
      comp([obj('Lamp', [prop('mesh', 'sphere'), prop('emissive', '#ffffff'), prop('emissiveIntensity', 8)])])
    );
    // emissive white * 8 → [8,8,8]
    expect(rs).toContain('emissive: [8.0, 8.0, 8.0, 0.0]');
  });

  it('does NOT path-trace functional/invisible geometry (shared geometry-purpose vocab)', () => {
    const rs = new PathTracerCompiler().compile(
      comp([obj('Shown', [prop('mesh', 'sphere')]), obj('Collider', [prop('mesh', 'cube'), prop('purpose', 'collision')])])
    );
    expect((rs.match(/Prim \{ kind: \[/g) || []).length - 1).toBe(1); // only the visible sphere
  });

  it('honors sample/bounce/resolution options', () => {
    const rs = new PathTracerCompiler({ samples: 256, bounces: 8, width: 1024, height: 768 }).compile(
      comp([obj('A', [prop('mesh', 'sphere')])])
    );
    expect(rs).toContain('const SAMPLES: u32 = 256u;');
    expect(rs).toContain('const BOUNCES: u32 = 8u;');
    expect(rs).toContain('const WIDTH: u32 = 1024;');
    expect(rs).toContain('const HEIGHT: u32 = 768;');
  });
});
