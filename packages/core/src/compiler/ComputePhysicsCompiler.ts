// ComputePhysicsCompiler — SOVEREIGN GPU rigid-body simulation target (physics-sim).
//
// PhysicsColliderCompiler extracts colliders; this adds the missing DYNAMICS: a WGSL
// compute pipeline that steps rigid bodies each frame — gravity + sphere↔sphere and
// sphere↔static-AABB collisions with restitution — entirely on the GPU, then renders the
// settled state. One .holo declaration drives BOTH the render and the simulation (Grok +
// Claude converged on this as the next slice). Our own solver, no third-party physics
// engine. Emits a self-contained Rust wgpu program; verified on the Jetson's Vulkan GPU.
//
// Race-free by double-buffering: each thread READS every body's previous state and WRITES
// only its own next state (gather, not scatter). Dynamic bodies = spheres carrying a
// @rigid_body / dynamic trait; statics = the scene's boxes (floor/walls) as AABBs. Reuses
// the shared geometry-registry + geometry-purpose vocabulary.

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloValue,
  HoloTemplate,
} from '../parser/HoloCompositionTypes';
import { resolveGeometry } from './render-modules/geometry-registry';
import { resolveGeometryRole } from './render-modules/geometry-purpose';
import { resolveSkyboxColor } from './render-modules/skybox-registry';

interface Body {
  pos: [number, number, number];
  radius: number;
  vel: [number, number, number];
  mass: number;
  restitution: number;
  friction: number;
  color: [number, number, number];
}
interface StaticBox {
  min: [number, number, number];
  max: [number, number, number];
  color: [number, number, number];
}

export interface PhysicsSimOptions {
  width?: number;
  height?: number;
  steps?: number;
  dt?: number;
  gravity?: number;
  /** Capture a frame every N sim steps into the output APNG animation (default 2). */
  captureEvery?: number;
  /** APNG playback frame rate (default 30). */
  fps?: number;
}

const DYNAMIC_TRAITS = new Set(['rigid_body', 'rigidbody', 'dynamic', 'physics_body']);

export class ComputePhysicsCompiler {
  private templatesByName: Map<string, HoloTemplate> = new Map();
  private width: number;
  private height: number;
  private steps: number;
  private dt: number;
  private gravity: number;
  private captureEvery: number;
  private fps: number;

  constructor(opts: PhysicsSimOptions = {}) {
    this.width = opts.width ?? 800;
    this.height = opts.height ?? 600;
    this.steps = opts.steps ?? 240;
    this.dt = opts.dt ?? 1 / 60;
    this.gravity = opts.gravity ?? -9.81;
    this.captureEvery = Math.max(1, opts.captureEvery ?? 2);
    this.fps = opts.fps ?? 30;
  }

  compileProject(composition: HoloComposition): Record<string, string> {
    return { 'Cargo.toml': this.cargoToml(composition), 'src/main.rs': this.compile(composition) };
  }

  cargoToml(composition: HoloComposition): string {
    const name = this.sanitizeCrate(String(composition.name ?? 'holo-physics'));
    return [
      '[package]',
      `name = "${name}"`,
      'version = "0.1.0"',
      'edition = "2021"',
      '',
      '[dependencies]',
      'wgpu = "23"',
      'pollster = "0.4"',
      'png = "0.17"',
      'bytemuck = { version = "1", features = ["derive"] }',
      '',
      '[profile.release]',
      'opt-level = 3',
      '',
    ].join('\n');
  }

  compile(composition: HoloComposition): string {
    this.templatesByName = new Map(
      (composition.templates ?? []).map((t) => [t.name, t] as [string, HoloTemplate])
    );
    const { bodies, statics } = this.extract(composition);
    const vp = this.viewProjection(bodies, statics);
    const clear = this.clearColor(composition);

    const fmt = (n: number) => {
      const r = Number(n.toFixed(6));
      return Number.isInteger(r) ? `${r}.0` : `${r}`;
    };
    const arr = (a: number[]) => `[${a.map(fmt).join(', ')}]`;

    const bodyRust = bodies
      .map(
        (b) =>
          `    Body { pos: ${arr([...b.pos, b.radius])}, vel: ${arr([...b.vel, b.mass])}, params: ${arr([b.restitution, b.friction, 0, 0])}, color: ${arr([...b.color, 1])} },`
      )
      .join('\n');
    const staticRust = statics
      .map((s) => `    Aabb { mn: ${arr([...s.min, 0])}, mx: ${arr([...s.max, 0])}, color: ${arr([...s.color, 1])} },`)
      .join('\n');

    return `${this.header(composition)}
use pollster::block_on;
use bytemuck::{Pod, Zeroable};

const WIDTH: u32 = ${this.width};
const HEIGHT: u32 = ${this.height};
const STEPS: u32 = ${this.steps};
const CAPTURE_EVERY: u32 = ${this.captureEvery};
const FPS: u16 = ${this.fps};

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Body { pos: [f32; 4], vel: [f32; 4], params: [f32; 4], color: [f32; 4] }
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Aabb { mn: [f32; 4], mx: [f32; 4], color: [f32; 4] }
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct SimU { dt: f32, gravity: f32, nbodies: u32, nstatics: u32 }
#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Uniforms { vp: [[f32; 4]; 4], model: [[f32; 4]; 4], color: [f32; 4] }

const BODIES: &[Body] = &[
${bodyRust}
];
const STATICS: &[Aabb] = &[
${staticRust}
];
const VP: [f32; 16] = ${arr(vp)};
const CLEAR: [f64; 4] = ${arr(clear as unknown as number[]).replace(/f32/g, 'f64')};

${this.geometryRust()}

const SIM_SHADER: &str = r#"
struct Body { pos: vec4<f32>, vel: vec4<f32>, params: vec4<f32>, color: vec4<f32> };
struct Aabb { mn: vec4<f32>, mx: vec4<f32>, color: vec4<f32> };
struct SimU { dt: f32, gravity: f32, nbodies: u32, nstatics: u32 };
@group(0) @binding(0) var<storage, read> bin: array<Body>;
@group(0) @binding(1) var<storage, read_write> bout: array<Body>;
@group(0) @binding(2) var<storage, read> statics: array<Aabb>;
@group(0) @binding(3) var<uniform> u: SimU;

@compute @workgroup_size(64)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u.nbodies) { return; }
  var b = bin[i];
  var pos = b.pos.xyz; var vel = b.vel.xyz; let r = b.pos.w;
  let rest = b.params.x; let fric = b.params.y;
  vel.y += u.gravity * u.dt;
  // sphere <-> sphere (gather: read others' PREVIOUS state, write only self)
  for (var j = 0u; j < u.nbodies; j = j + 1u) {
    if (j == i) { continue; }
    let o = bin[j];
    let d = pos - o.pos.xyz;
    let dist = length(d);
    let sumR = r + o.pos.w;
    if (dist < sumR && dist > 1e-4) {
      let n = d / dist;
      pos = pos + n * (sumR - dist) * 0.5;              // positional split
      let rv = vel - o.vel.xyz;
      let vn = dot(rv, n);
      if (vn < 0.0) { vel = vel - n * vn * (1.0 + rest); } // reflect approaching component
    }
  }
  // sphere <-> static AABB (closest-point test)
  for (var s = 0u; s < u.nstatics; s = s + 1u) {
    let a = statics[s];
    let cp = clamp(pos, a.mn.xyz, a.mx.xyz);
    let d = pos - cp;
    let dist = length(d);
    if (dist < r) {
      var n = vec3<f32>(0.0, 1.0, 0.0);
      if (dist > 1e-4) { n = d / dist; }
      pos = pos + n * (r - dist);
      let vn = dot(vel, n);
      if (vn < 0.0) { vel = vel - n * vn * (1.0 + rest); }
      // tangential friction
      let vt = vel - n * dot(vel, n);
      vel = vel - vt * clamp(fric, 0.0, 1.0);
    }
  }
  pos = pos + vel * u.dt;
  bout[i] = Body(vec4<f32>(pos, r), vec4<f32>(vel, b.vel.w), b.params, b.color);
}
"#;

const RENDER_SHADER: &str = r#"
struct U { vp: mat4x4<f32>, model: mat4x4<f32>, color: vec4<f32> };
@group(0) @binding(0) var<uniform> u: U;
struct VOut { @builtin(position) clip: vec4<f32>, @location(0) n: vec3<f32> };
@vertex fn vs(@location(0) p: vec3<f32>, @location(1) nor: vec3<f32>) -> VOut {
  var o: VOut; let w = u.model * vec4<f32>(p, 1.0);
  o.clip = u.vp * w; o.n = normalize((u.model * vec4<f32>(nor, 0.0)).xyz); return o;
}
@fragment fn fs(i: VOut) -> @location(0) vec4<f32> {
  let L = normalize(vec3<f32>(0.5, 1.0, 0.6));
  let d = max(dot(normalize(i.n), L), 0.0);
  return vec4<f32>(u.color.rgb * (0.2 + 0.8 * d), 1.0);
}
"#;

fn mat(m: &[f32; 16]) -> [[f32; 4]; 4] { [[m[0],m[1],m[2],m[3]],[m[4],m[5],m[6],m[7]],[m[8],m[9],m[10],m[11]],[m[12],m[13],m[14],m[15]]] }
fn model_of(pos: [f32; 3], s: [f32; 3]) -> [f32; 16] { [s[0],0.0,0.0,0.0, 0.0,s[1],0.0,0.0, 0.0,0.0,s[2],0.0, pos[0],pos[1],pos[2],1.0] }

fn main() { block_on(run()); }

async fn run() {
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor { backends: wgpu::Backends::all(), ..Default::default() });
    let adapter = instance.request_adapter(&wgpu::RequestAdapterOptions { power_preference: wgpu::PowerPreference::HighPerformance, force_fallback_adapter: false, compatible_surface: None }).await.expect("no adapter");
    println!("ADAPTER {:?}", adapter.get_info());
    let (device, queue) = adapter.request_device(&wgpu::DeviceDescriptor::default(), None).await.expect("no device");

    // ── Physics compute ──────────────────────────────────────────────────────
    let n = BODIES.len().max(1);
    let body_size = (std::mem::size_of::<Body>() * n) as u64;
    let buf_a = device.create_buffer(&wgpu::BufferDescriptor { label: Some("a"), size: body_size, usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::COPY_SRC, mapped_at_creation: false });
    let buf_b = device.create_buffer(&wgpu::BufferDescriptor { label: Some("b"), size: body_size, usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::COPY_SRC, mapped_at_creation: false });
    queue.write_buffer(&buf_a, 0, bytemuck::cast_slice(BODIES));
    let stat_buf = device.create_buffer(&wgpu::BufferDescriptor { label: Some("stat"), size: (std::mem::size_of::<Aabb>() * STATICS.len().max(1)) as u64, usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    queue.write_buffer(&stat_buf, 0, bytemuck::cast_slice(STATICS));
    let simu = SimU { dt: ${fmt(this.dt)}, gravity: ${fmt(this.gravity)}, nbodies: BODIES.len() as u32, nstatics: STATICS.len() as u32 };
    let simu_buf = device.create_buffer(&wgpu::BufferDescriptor { label: Some("simu"), size: std::mem::size_of::<SimU>() as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    queue.write_buffer(&simu_buf, 0, bytemuck::bytes_of(&simu));

    let sim_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: None, source: wgpu::ShaderSource::Wgsl(SIM_SHADER.into()) });
    let sim_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: None, entries: &[
        wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::COMPUTE, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Storage { read_only: true }, has_dynamic_offset: false, min_binding_size: None }, count: None },
        wgpu::BindGroupLayoutEntry { binding: 1, visibility: wgpu::ShaderStages::COMPUTE, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Storage { read_only: false }, has_dynamic_offset: false, min_binding_size: None }, count: None },
        wgpu::BindGroupLayoutEntry { binding: 2, visibility: wgpu::ShaderStages::COMPUTE, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Storage { read_only: true }, has_dynamic_offset: false, min_binding_size: None }, count: None },
        wgpu::BindGroupLayoutEntry { binding: 3, visibility: wgpu::ShaderStages::COMPUTE, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None },
    ]});
    let sim_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: None, bind_group_layouts: &[&sim_bgl], push_constant_ranges: &[] });
    let sim_pipe = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor { label: None, layout: Some(&sim_pl), module: &sim_shader, entry_point: Some("cs"), compilation_options: Default::default(), cache: None });
    let bind = |src: &wgpu::Buffer, dst: &wgpu::Buffer| device.create_bind_group(&wgpu::BindGroupDescriptor { label: None, layout: &sim_bgl, entries: &[
        wgpu::BindGroupEntry { binding: 0, resource: src.as_entire_binding() },
        wgpu::BindGroupEntry { binding: 1, resource: dst.as_entire_binding() },
        wgpu::BindGroupEntry { binding: 2, resource: stat_buf.as_entire_binding() },
        wgpu::BindGroupEntry { binding: 3, resource: simu_buf.as_entire_binding() },
    ]});
    let bind_ab = bind(&buf_a, &buf_b);
    let bind_ba = bind(&buf_b, &buf_a);

    // ── Render setup (reused every captured frame) ────────────────────────────
    let color_tex = device.create_texture(&wgpu::TextureDescriptor { label: Some("c"), size: wgpu::Extent3d { width: WIDTH, height: HEIGHT, depth_or_array_layers: 1 }, mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2, format: wgpu::TextureFormat::Rgba8UnormSrgb, usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC, view_formats: &[] });
    let color_view = color_tex.create_view(&wgpu::TextureViewDescriptor::default());
    let depth_tex = device.create_texture(&wgpu::TextureDescriptor { label: Some("d"), size: wgpu::Extent3d { width: WIDTH, height: HEIGHT, depth_or_array_layers: 1 }, mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2, format: wgpu::TextureFormat::Depth32Float, usage: wgpu::TextureUsages::RENDER_ATTACHMENT, view_formats: &[] });
    let depth_view = depth_tex.create_view(&wgpu::TextureViewDescriptor::default());
    let r_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: None, source: wgpu::ShaderSource::Wgsl(RENDER_SHADER.into()) });
    let r_bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: None, entries: &[wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::VERTEX_FRAGMENT, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None }] });
    let r_pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: None, bind_group_layouts: &[&r_bgl], push_constant_ranges: &[] });
    let r_pipe = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor { label: None, layout: Some(&r_pl),
        vertex: wgpu::VertexState { module: &r_shader, entry_point: Some("vs"), compilation_options: Default::default(), buffers: &[wgpu::VertexBufferLayout { array_stride: 24, step_mode: wgpu::VertexStepMode::Vertex, attributes: &[wgpu::VertexAttribute { format: wgpu::VertexFormat::Float32x3, offset: 0, shader_location: 0 }, wgpu::VertexAttribute { format: wgpu::VertexFormat::Float32x3, offset: 12, shader_location: 1 }] }] },
        fragment: Some(wgpu::FragmentState { module: &r_shader, entry_point: Some("fs"), compilation_options: Default::default(), targets: &[Some(wgpu::ColorTargetState { format: wgpu::TextureFormat::Rgba8UnormSrgb, blend: None, write_mask: wgpu::ColorWrites::ALL })] }),
        primitive: wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleList, cull_mode: Some(wgpu::Face::Back), ..Default::default() },
        depth_stencil: Some(wgpu::DepthStencilState { format: wgpu::TextureFormat::Depth32Float, depth_write_enabled: true, depth_compare: wgpu::CompareFunction::Less, stencil: Default::default(), bias: Default::default() }),
        multisample: wgpu::MultisampleState::default(), multiview: None, cache: None });
    let sphere_v = gen_sphere(1.0, 16, 16);
    let box_v = gen_cube(1.0);
    let sphere_vbo = device.create_buffer(&wgpu::BufferDescriptor { label: None, size: (sphere_v.len() * 4) as u64, usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    queue.write_buffer(&sphere_vbo, 0, bytemuck::cast_slice(&sphere_v));
    let box_vbo = device.create_buffer(&wgpu::BufferDescriptor { label: None, size: (box_v.len() * 4) as u64, usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    queue.write_buffer(&box_vbo, 0, bytemuck::cast_slice(&box_v));
    let sphere_count = (sphere_v.len() / 6) as u32;
    let box_count = (box_v.len() / 6) as u32;

    // Persistent per-body uniforms (rewritten each frame with the current transform)
    // + fixed static uniforms.
    let mk_ubo = || device.create_buffer(&wgpu::BufferDescriptor { label: None, size: std::mem::size_of::<Uniforms>() as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    let mk_bind = |ubo: &wgpu::Buffer| device.create_bind_group(&wgpu::BindGroupDescriptor { label: None, layout: &r_bgl, entries: &[wgpu::BindGroupEntry { binding: 0, resource: ubo.as_entire_binding() }] });
    let mut body_ubos: Vec<wgpu::Buffer> = Vec::new();
    let mut body_binds: Vec<wgpu::BindGroup> = Vec::new();
    for _ in 0..BODIES.len() { let u = mk_ubo(); let b = mk_bind(&u); body_ubos.push(u); body_binds.push(b); }
    let mut static_ubos: Vec<wgpu::Buffer> = Vec::new();
    let mut static_binds: Vec<wgpu::BindGroup> = Vec::new();
    for s in STATICS.iter() {
        let c = [(s.mn[0]+s.mx[0])*0.5, (s.mn[1]+s.mx[1])*0.5, (s.mn[2]+s.mx[2])*0.5];
        let sz = [(s.mx[0]-s.mn[0]).max(0.001), (s.mx[1]-s.mn[1]).max(0.001), (s.mx[2]-s.mn[2]).max(0.001)];
        let u = mk_ubo();
        queue.write_buffer(&u, 0, bytemuck::bytes_of(&Uniforms { vp: mat(&VP), model: mat(&model_of(c, sz)), color: s.color }));
        let b = mk_bind(&u); static_ubos.push(u); static_binds.push(b);
    }
    let _ = (&static_ubos,);

    let unpadded = WIDTH * 4;
    let align = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
    let bpr = ((unpadded + align - 1) / align) * align;
    let pos_read = device.create_buffer(&wgpu::BufferDescriptor { label: None, size: body_size, usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ, mapped_at_creation: false });

    // ── Simulate + capture EVERY frame (the motion, not just the settle) ──────
    let mut frames: Vec<Vec<u8>> = Vec::new();
    let mut last: Vec<Body> = BODIES.to_vec();
    for step in 0..STEPS {
        let mut enc = device.create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
        {
            let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: None });
            cp.set_pipeline(&sim_pipe);
            cp.set_bind_group(0, if step % 2 == 0 { &bind_ab } else { &bind_ba }, &[]);
            cp.dispatch_workgroups(((BODIES.len() as u32) + 63) / 64, 1, 1);
        }
        let cur = if step % 2 == 0 { &buf_b } else { &buf_a };
        enc.copy_buffer_to_buffer(cur, 0, &pos_read, 0, body_size);
        queue.submit(Some(enc.finish()));

        if step % CAPTURE_EVERY == 0 || step == STEPS - 1 {
            {
                let slice = pos_read.slice(..);
                let (tx, rx) = std::sync::mpsc::channel();
                slice.map_async(wgpu::MapMode::Read, move |r| tx.send(r).unwrap());
                device.poll(wgpu::Maintain::Wait);
                rx.recv().unwrap().unwrap();
                last = bytemuck::cast_slice::<u8, Body>(&slice.get_mapped_range()).to_vec();
            }
            pos_read.unmap();
            for (i, b) in last.iter().enumerate() {
                let r = b.pos[3];
                queue.write_buffer(&body_ubos[i], 0, bytemuck::bytes_of(&Uniforms { vp: mat(&VP), model: mat(&model_of([b.pos[0], b.pos[1], b.pos[2]], [r*2.0, r*2.0, r*2.0])), color: b.color }));
            }
            let pix = device.create_buffer(&wgpu::BufferDescriptor { label: None, size: (bpr * HEIGHT) as u64, usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ, mapped_at_creation: false });
            let mut e = device.create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
            {
                let mut rp = e.begin_render_pass(&wgpu::RenderPassDescriptor { label: None,
                    color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: &color_view, resolve_target: None, ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color { r: CLEAR[0], g: CLEAR[1], b: CLEAR[2], a: 1.0 }), store: wgpu::StoreOp::Store } })],
                    depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment { view: &depth_view, depth_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(1.0), store: wgpu::StoreOp::Store }), stencil_ops: None }),
                    timestamp_writes: None, occlusion_query_set: None });
                rp.set_pipeline(&r_pipe);
                for i in 0..BODIES.len() { rp.set_bind_group(0, &body_binds[i], &[]); rp.set_vertex_buffer(0, sphere_vbo.slice(..)); rp.draw(0..sphere_count, 0..1); }
                for b in static_binds.iter() { rp.set_bind_group(0, b, &[]); rp.set_vertex_buffer(0, box_vbo.slice(..)); rp.draw(0..box_count, 0..1); }
            }
            e.copy_texture_to_buffer(
                wgpu::ImageCopyTexture { texture: &color_tex, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
                wgpu::ImageCopyBuffer { buffer: &pix, layout: wgpu::ImageDataLayout { offset: 0, bytes_per_row: Some(bpr), rows_per_image: Some(HEIGHT) } },
                wgpu::Extent3d { width: WIDTH, height: HEIGHT, depth_or_array_layers: 1 });
            queue.submit(Some(e.finish()));
            {
                let slice = pix.slice(..);
                let (tx, rx) = std::sync::mpsc::channel();
                slice.map_async(wgpu::MapMode::Read, move |r| tx.send(r).unwrap());
                device.poll(wgpu::Maintain::Wait);
                rx.recv().unwrap().unwrap();
                let data = slice.get_mapped_range();
                let mut frame = Vec::with_capacity((unpadded * HEIGHT) as usize);
                for row in 0..HEIGHT { let st = (row * bpr) as usize; frame.extend_from_slice(&data[st..st + unpadded as usize]); }
                frames.push(frame);
            }
        }
    }

    for (i, b) in last.iter().enumerate() {
        println!("BODY {} final pos [{:.3}, {:.3}, {:.3}] vel_y {:.3}", i, b.pos[0], b.pos[1], b.pos[2], b.vel[1]);
    }

    // ── Encode the MOTION as an animated PNG (APNG) — frame-by-frame proof ─────
    let file = std::fs::File::create("out.png").unwrap();
    let mut encoder = png::Encoder::new(std::io::BufWriter::new(file), WIDTH, HEIGHT);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    encoder.set_animated(frames.len() as u32, 0).unwrap();
    encoder.set_frame_delay(1, FPS).unwrap();
    let mut writer = encoder.write_header().unwrap();
    for f in &frames { writer.write_image_data(f).unwrap(); }
    writer.finish().unwrap();
    println!("WROTE out.png (APNG, {} frames, {} bodies, {} statics, {} steps)", frames.len(), BODIES.len(), STATICS.len(), STEPS);
}
`;
  }

  // ── extraction ─────────────────────────────────────────────────────────────
  private extract(composition: HoloComposition): { bodies: Body[]; statics: StaticBox[] } {
    const bodies: Body[] = [];
    const statics: StaticBox[] = [];
    const add = (obj: HoloObjectDecl, off: number[]) => {
      const role = resolveGeometryRole({ purpose: this.findProp(obj, 'purpose'), visible: this.findProp(obj, 'visible'), traitNames: (obj.traits ?? []).map((t) => t.name) });
      if (role.visible) {
        const mesh = String(this.findProp(obj, 'geometry') ?? this.findProp(obj, 'mesh') ?? this.findProp(obj, 'type') ?? 'cube');
        const kind = resolveGeometry(mesh).kind;
        const pos = this.vec3(this.findProp(obj, 'position'), [0, 0, 0]);
        const p: [number, number, number] = [pos[0] + off[0], pos[1] + off[1], pos[2] + off[2]];
        const s = this.scaleOf(obj);
        const color = this.colorOf(obj);
        const traitNames = (obj.traits ?? []).map((t) => t.name.toLowerCase());
        const rb = (obj.traits ?? []).find((t) => DYNAMIC_TRAITS.has(t.name.toLowerCase()));
        const isDynamic = traitNames.some((t) => DYNAMIC_TRAITS.has(t)) || this.findProp(obj, 'dynamic') === true;
        if (isDynamic && (kind === 'sphere' || kind === 'torus')) {
          const cfg = (rb?.config ?? {}) as Record<string, unknown>;
          const radius = 0.5 * Math.max(s[0], s[1], s[2]);
          const vel = this.vec3(this.findProp(obj, 'velocity'), [0, 0, 0]);
          bodies.push({
            pos: p,
            radius,
            vel,
            mass: Number(cfg.mass ?? 1),
            restitution: Number(cfg.restitution ?? 0.6),
            friction: Number(cfg.friction ?? 0.2),
            color,
          });
        } else {
          // static AABB (box/plane/etc.); a static sphere is skipped (v1 statics are boxes).
          if (kind !== 'sphere' && kind !== 'torus') {
            const hy = kind === 'plane' ? 0.05 : Math.abs(s[1]) * 0.5;
            const hx = Math.abs(s[0]) * 0.5;
            const hz = Math.abs(s[2]) * 0.5;
            statics.push({ min: [p[0] - hx, p[1] - hy, p[2] - hz], max: [p[0] + hx, p[1] + hy, p[2] + hz], color });
          }
        }
      }
      if (obj.children) for (const c of obj.children) add(c, off);
    };
    for (const o of composition.objects ?? []) add(o, [0, 0, 0]);
    const scenes = (composition as unknown as { scenes?: Array<{ objects?: HoloObjectDecl[] }> }).scenes;
    for (const sc of scenes ?? []) for (const o of sc.objects ?? []) add(o, [0, 0, 0]);
    const walk = (g: HoloSpatialGroup, parent: number[]) => {
      const gp = g.properties?.find((pp) => pp.key === 'position')?.value;
      const [gx, gy, gz] = Array.isArray(gp) ? (gp as number[]) : [0, 0, 0];
      const o2 = [parent[0] + gx, parent[1] + gy, parent[2] + gz];
      for (const o of g.objects ?? []) add(o, o2);
      for (const sub of g.groups ?? []) walk(sub, o2);
    };
    for (const g of composition.spatialGroups ?? []) walk(g, [0, 0, 0]);
    return { bodies, statics };
  }

  private viewProjection(bodies: Body[], statics: StaticBox[]): number[] {
    const pts: number[][] = [];
    for (const b of bodies) pts.push(b.pos);
    for (const s of statics) pts.push([(s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2, (s.min[2] + s.max[2]) / 2]);
    let eye = [6, 5, 10];
    let target = [0, 0, 0];
    const fov = 55;
    if (pts.length > 0) {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (const p of pts) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
      const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
      let radius = 2;
      for (const p of pts) radius = Math.max(radius, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) + 2);
      const dist = (radius / Math.sin((fov * Math.PI) / 180 / 2)) * 1.2;
      const dl = Math.hypot(0.3, 0.4, 1);
      eye = [c[0] + (0.3 / dl) * dist, c[1] + (0.4 / dl) * dist, c[2] + (1 / dl) * dist];
      target = c;
    }
    const aspect = this.width / this.height;
    const f = 1 / Math.tan((fov * Math.PI) / 180 / 2);
    const far = 2000;
    const near = 0.1;
    const ri = 1 / (near - far);
    const proj = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far * ri, -1, 0, 0, near * far * ri, 0];
    const view = this.lookAt(eye, target);
    return this.mul(proj, view);
  }
  private lookAt(eye: number[], target: number[]): number[] {
    const zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    const zl = Math.hypot(zx, zy, zz) || 1;
    const fz = [zx / zl, zy / zl, zz / zl];
    const up = [0, 1, 0];
    const xx = up[1] * fz[2] - up[2] * fz[1], xy = up[2] * fz[0] - up[0] * fz[2], xz = up[0] * fz[1] - up[1] * fz[0];
    const xl = Math.hypot(xx, xy, xz) || 1;
    const rx = [xx / xl, xy / xl, xz / xl];
    const uy = [fz[1] * rx[2] - fz[2] * rx[1], fz[2] * rx[0] - fz[0] * rx[2], fz[0] * rx[1] - fz[1] * rx[0]];
    return [rx[0], uy[0], fz[0], 0, rx[1], uy[1], fz[1], 0, rx[2], uy[2], fz[2], 0, -(rx[0] * eye[0] + rx[1] * eye[1] + rx[2] * eye[2]), -(uy[0] * eye[0] + uy[1] * eye[1] + uy[2] * eye[2]), -(fz[0] * eye[0] + fz[1] * eye[1] + fz[2] * eye[2]), 1];
  }
  private mul(a: number[], b: number[]): number[] {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[0 * 4 + r] * b[c * 4 + 0] + a[1 * 4 + r] * b[c * 4 + 1] + a[2 * 4 + r] * b[c * 4 + 2] + a[3 * 4 + r] * b[c * 4 + 3];
    return o;
  }
  private clearColor(composition: HoloComposition): [number, number, number, number] {
    const env = composition.environment;
    const props: Record<string, unknown> = {};
    for (const p of env?.properties ?? []) props[p.key] = p.value;
    const bg = props.background || props.skybox || '#0a0e14';
    const c = typeof bg === 'string' && bg.startsWith('#') ? this.hexColor(bg) : resolveSkyboxColor(String(bg));
    return [c[0], c[1], c[2], 1];
  }

  // ── helpers ─────────────────────────────────────────────────────────────────
  private findProp(obj: HoloObjectDecl, key: string): HoloValue | undefined {
    const own = obj.properties?.find((p) => p.key === key)?.value;
    if (own !== undefined) return own as HoloValue;
    if (obj.template) {
      const tpl = this.templatesByName.get(obj.template);
      const fromT = tpl?.properties?.find((p) => p.key === key)?.value;
      if (fromT !== undefined) return fromT as HoloValue;
    }
    return undefined;
  }
  private vec3(v: unknown, fb: [number, number, number]): [number, number, number] {
    return Array.isArray(v) && v.length >= 3 ? [Number(v[0]), Number(v[1]), Number(v[2])] : fb;
  }
  private scaleOf(obj: HoloObjectDecl): [number, number, number] {
    const s = this.findProp(obj, 'scale') ?? this.findProp(obj, 'size');
    if (Array.isArray(s) && s.length >= 3) return [Number(s[0]), Number(s[1]), Number(s[2])];
    if (typeof s === 'number') return [s, s, s];
    return [1, 1, 1];
  }
  private colorOf(obj: HoloObjectDecl): [number, number, number] {
    const c = this.findProp(obj, 'color');
    return typeof c === 'string' && c.startsWith('#') ? this.hexColor(c) : [0.8, 0.8, 0.8];
  }
  private hexColor(hex: string): [number, number, number] {
    const h = hex.slice(1);
    return [Number((parseInt(h.substring(0, 2), 16) / 255).toFixed(4)), Number((parseInt(h.substring(2, 4), 16) / 255).toFixed(4)), Number((parseInt(h.substring(4, 6), 16) / 255).toFixed(4))];
  }
  private sanitizeCrate(name: string): string {
    const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'holo-physics';
  }
  private header(composition: HoloComposition): string {
    return `// @generated by HoloScript ComputePhysicsCompiler — sovereign GPU rigid-body sim (wgpu compute).\n// Source: ${String(composition.name ?? 'composition')}. Steps gravity + collisions on the GPU, captures every frame → animated APNG (out.png).\n// Run: cargo run --release`;
  }
  private geometryRust(): string {
    return `fn gen_cube(s: f32) -> Vec<f32> {
    let h = s * 0.5;
    let faces: [([f32;3],[[f32;3];4]);6] = [
        ([0.0,0.0,1.0],[[-h,-h,h],[h,-h,h],[h,h,h],[-h,h,h]]),
        ([0.0,0.0,-1.0],[[h,-h,-h],[-h,-h,-h],[-h,h,-h],[h,h,-h]]),
        ([1.0,0.0,0.0],[[h,-h,h],[h,-h,-h],[h,h,-h],[h,h,h]]),
        ([-1.0,0.0,0.0],[[-h,-h,-h],[-h,-h,h],[-h,h,h],[-h,h,-h]]),
        ([0.0,1.0,0.0],[[-h,h,h],[h,h,h],[h,h,-h],[-h,h,-h]]),
        ([0.0,-1.0,0.0],[[-h,-h,-h],[h,-h,-h],[h,-h,h],[-h,-h,h]]),
    ];
    let mut o = Vec::new();
    for (n, v) in faces.iter() { for &idx in &[0usize,1,2,0,2,3] { let p = v[idx]; o.extend_from_slice(&[p[0],p[1],p[2],n[0],n[1],n[2]]); } }
    o
}
fn gen_sphere(radius: f32, lat: u32, lon: u32) -> Vec<f32> {
    let rings = lat.max(3); let segs = lon.max(3); let mut o = Vec::new();
    let p = |ri: u32, si: u32| -> [f32;6] {
        let phi = std::f32::consts::PI * ri as f32 / rings as f32;
        let theta = 2.0 * std::f32::consts::PI * si as f32 / segs as f32;
        let nx = phi.sin()*theta.cos(); let ny = phi.cos(); let nz = phi.sin()*theta.sin();
        [nx*radius, ny*radius, nz*radius, nx, ny, nz]
    };
    for ri in 0..rings { for si in 0..segs {
        let a=p(ri,si); let b=p(ri+1,si); let c=p(ri+1,si+1); let d=p(ri,si+1);
        for v in [a,b,c,a,c,d] { o.extend_from_slice(&v); }
    }}
    o
}`;
  }
}
