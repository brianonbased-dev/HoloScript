import { describe, it, expect } from 'vitest';
import { ComputePhysicsCompiler } from './ComputePhysicsCompiler';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

const prop = (key: string, value: unknown) => ({ key, value });
const trait = (name: string, config: Record<string, unknown> = {}) => ({ name, config });
const obj = (
  name: string,
  props: Array<{ key: string; value: unknown }>,
  traits: Array<{ name: string; config?: Record<string, unknown> }> = []
): HoloObjectDecl =>
  ({ type: 'Object', name, properties: props, traits }) as unknown as HoloObjectDecl;
const comp = (objects: HoloObjectDecl[], name = 'Sim'): HoloComposition =>
  ({ type: 'HoloComposition', name, objects }) as HoloComposition;

// bodies/statics literals both share a Rust struct def line; subtract 1 for it.
const bodyCount = (rs: string) => (rs.match(/Body \{ pos: \[/g) || []).length - 1;
const staticCount = (rs: string) => (rs.match(/Aabb \{ mn: \[/g) || []).length - 1;

// Runtime dynamics are verified on real hardware (Jetson Orin/Vulkan → spheres fall,
// collide, settle; positions read back). These lock the emitted-project STRUCTURE.
describe('ComputePhysicsCompiler — sovereign GPU rigid-body simulation', () => {
  it('emits a Cargo project with a compute solver, render pass, and readback', () => {
    const project = new ComputePhysicsCompiler().compileProject(
      comp([obj('B', [prop('mesh', 'sphere')], [trait('rigid_body')])])
    );
    expect(Object.keys(project).sort()).toEqual(['Cargo.toml', 'src/main.rs']);
    const rs = project['src/main.rs'];
    expect(rs).toContain('create_compute_pipeline');
    expect(rs).toContain('@compute @workgroup_size(64)');
    expect(rs).toContain('vel.y += u.gravity * u.dt'); // gravity integration
    expect(rs).toContain('sumR = r + o.pos.w'); // sphere-sphere test
    expect(rs).toContain('clamp(pos, a.mn.xyz, a.mx.xyz)'); // sphere-AABB test
    expect(rs).toContain('create_render_pipeline'); // renders the settled state
    expect(rs).toContain('BODY {} final pos'); // numeric readback proof
  });

  it('turns @rigid_body spheres into dynamic bodies and boxes into static AABBs', () => {
    const rs = new ComputePhysicsCompiler().compile(
      comp([
        obj('Floor', [
          prop('mesh', 'cube'),
          prop('position', [0, 0, 0]),
          prop('scale', [8, 0.4, 8]),
        ]),
        obj(
          'Ball1',
          [prop('mesh', 'sphere'), prop('position', [0, 5, 0])],
          [trait('rigid_body', { mass: 2, restitution: 0.8, friction: 0.3 })]
        ),
        obj('Ball2', [prop('mesh', 'sphere'), prop('position', [1, 6, 0])], [trait('rigid_body')]),
      ])
    );
    expect(bodyCount(rs)).toBe(2); // two dynamic spheres
    expect(staticCount(rs)).toBe(1); // the floor box
    // Ball1 params: restitution 0.8, friction 0.3 in its params vec.
    expect(rs).toContain('params: [0.8, 0.3, 0.0, 0.0]');
    // Ball1 starts at y=5.
    expect(rs).toContain('Body { pos: [0.0, 5.0, 0.0, 0.5]');
  });

  it('a static (non-dynamic) sphere is NOT a rigid body (only @rigid_body spheres move)', () => {
    const rs = new ComputePhysicsCompiler().compile(
      comp([obj('Deco', [prop('mesh', 'sphere'), prop('position', [0, 1, 0])])]) // no rigid_body trait
    );
    expect(bodyCount(rs)).toBe(0);
  });

  it('reads an initial velocity from the object', () => {
    const rs = new ComputePhysicsCompiler().compile(
      comp([
        obj(
          'B',
          [prop('mesh', 'sphere'), prop('velocity', [2, 0, -1])],
          [trait('rigid_body', { mass: 1 })]
        ),
      ])
    );
    // vel vec = velocity.xyz + mass.w
    expect(rs).toContain('vel: [2.0, 0.0, -1.0, 1.0]');
  });

  it('honors steps / dt / gravity options', () => {
    const rs = new ComputePhysicsCompiler({ steps: 300, dt: 0.02, gravity: -20 }).compile(
      comp([obj('B', [prop('mesh', 'sphere')], [trait('rigid_body')])])
    );
    expect(rs).toContain('const STEPS: u32 = 300;');
    expect(rs).toContain('dt: 0.02');
    expect(rs).toContain('gravity: -20.0');
  });
});
