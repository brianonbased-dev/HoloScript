import { describe, it, expect } from 'vitest';
import { DesktopGPUCompiler } from './DesktopGPUCompiler';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

const prop = (key: string, value: unknown) => ({ key, value });
const obj = (name: string, props: Array<{ key: string; value: unknown }>): HoloObjectDecl =>
  ({ type: 'Object', name, properties: props, traits: [] }) as unknown as HoloObjectDecl;
const comp = (objects: HoloObjectDecl[], name = 'Scene'): HoloComposition =>
  ({ type: 'HoloComposition', name, objects }) as HoloComposition;

// Runtime rendering is verified on real hardware (Jetson Orin / Vulkan → out.png).
// These lock the emitted-project STRUCTURE so it can't silently drift.
describe('DesktopGPUCompiler — sovereign native-desktop GPU (wgpu) target', () => {
  it('emits a complete Cargo project (Cargo.toml + src/main.rs)', () => {
    const project = new DesktopGPUCompiler().compileProject(
      comp([obj('A', [prop('mesh', 'cube')])])
    );
    expect(Object.keys(project).sort()).toEqual(['Cargo.toml', 'src/main.rs']);
    expect(project['Cargo.toml']).toContain('wgpu = "23"');
    expect(project['Cargo.toml']).toContain('pollster');
    expect(project['Cargo.toml']).toContain('png');
    expect(project['Cargo.toml']).toContain('bytemuck');
    // crate name sanitized from the composition name
    expect(project['Cargo.toml']).toContain('name = "scene"');
  });

  it('emits a real wgpu host: instance/adapter/device, WGSL, offscreen render, PNG readback', () => {
    const rs = new DesktopGPUCompiler().compile(comp([obj('A', [prop('mesh', 'cube')])]));
    expect(rs).toContain('wgpu::Instance::new(wgpu::InstanceDescriptor');
    expect(rs).toContain('request_adapter');
    expect(rs).toContain('create_render_pipeline');
    expect(rs).toContain('const SHADER: &str');
    expect(rs).toContain('@vertex fn vs');
    expect(rs).toContain('@fragment fn fs');
    // padded-row readback (256-alignment) + PNG encode
    expect(rs).toContain('COPY_BYTES_PER_ROW_ALIGNMENT');
    expect(rs).toContain('png::Encoder::new');
  });

  it('extracts one draw item per VISIBLE object with model matrix + color', () => {
    const rs = new DesktopGPUCompiler().compile(
      comp([
        obj('Ball', [
          prop('mesh', 'sphere'),
          prop('position', [1, 2, 3]),
          prop('color', '#ff0000'),
        ]),
        obj('Box', [prop('mesh', 'cube'), prop('scale', [2, 2, 2])]),
      ])
    );
    const objCount = (rs.match(/geo: "/g) || []).length; // one per object literal (not the struct def)
    expect(objCount).toBe(2);
    // sphere geo tag + red color (1,0,0,1) + translation in the model's last column.
    expect(rs).toContain('geo: "sphere"');
    expect(rs).toContain('color: [1.0, 0.0, 0.0, 1.0]');
    expect(rs).toContain('1.0, 2.0, 3.0, 1.0'); // model translation row
  });

  it('does NOT draw functional/invisible geometry (shared geometry-purpose vocabulary)', () => {
    const rs = new DesktopGPUCompiler().compile(
      comp([
        obj('Wall', [prop('mesh', 'cube')]),
        obj('Hidden', [prop('mesh', 'sphere'), prop('purpose', 'collision')]),
      ])
    );
    expect((rs.match(/geo: "/g) || []).length).toBe(1); // only the visible wall
    expect(rs).not.toContain('geo: "sphere"');
  });

  it('resolves geometry through the SAME registry render uses (panel→box, pillar→cylinder)', () => {
    const rs = new DesktopGPUCompiler().compile(
      comp([obj('P', [prop('mesh', 'panel')]), obj('C', [prop('mesh', 'pillar')])])
    );
    // panel aliases to box (default cube gen), pillar to cylinder
    expect(rs).toContain('geo: "cylinder"');
    // the emitted gen() dispatch + Rust generators exist
    expect(rs).toContain('fn gen_cylinder(');
    expect(rs).toContain('fn gen_torus(');
  });

  it('honors the environment skybox as the clear color (named palette)', () => {
    const scene = {
      type: 'HoloComposition',
      name: 'Ocean',
      environment: { type: 'Environment', properties: [prop('skybox', 'deep_machine_ocean')] },
      objects: [obj('A', [prop('mesh', 'cube')])],
    } as HoloComposition;
    const rs = new DesktopGPUCompiler().compile(scene);
    // deep_machine_ocean = #052430 → ~[0.0196, 0.1412, 0.1882]
    expect(rs).toContain('const CLEAR: [f64; 4] = [0.0196');
  });
});
