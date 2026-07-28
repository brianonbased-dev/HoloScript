// PathTracerCompiler — SOVEREIGN offline path-traced render target (audit gap #3).
//
// A film-grade still needs global illumination — soft shadows, color bleeding, emissive
// area lights — which the real-time rasterizers (WebGPU / desktop-gpu) don't do. This
// emits a self-contained Rust wgpu COMPUTE program: our OWN GPU path tracer (no Cycles /
// OptiX / third-party renderer). It traces cosine-weighted diffuse bounces against the
// scene's analytic primitives, accumulates many samples per pixel, tonemaps, and writes a
// PNG. Runs on the machine's own GPU (Vulkan/Metal/DX12); verified on Jetson Orin.
//
// Consumes the SAME shared vocabulary as the other targets: every geometry primitive maps
// to a path-traceable shape (sphere/box), materials come from color + emissive, and
// geometry-purpose visibility hides functional geometry. Fifth consumer of one-shape-
// many-domains. Buffer readback (not texture copy) sidesteps the 256-row-alignment rule.

import type { HoloComposition } from '../parser/HoloCompositionTypes';
import { extractRaytraceScene, type RayCamera } from './render-modules/raytrace-scene';

export interface PathTracerOptions {
  width?: number;
  height?: number;
  samples?: number;
  bounces?: number;
}

export class PathTracerCompiler {
  private width: number;
  private height: number;
  private samples: number;
  private bounces: number;

  constructor(opts: PathTracerOptions = {}) {
    this.width = opts.width ?? 800;
    this.height = opts.height ?? 600;
    this.samples = opts.samples ?? 96;
    this.bounces = opts.bounces ?? 5;
  }

  compileProject(composition: HoloComposition): Record<string, string> {
    return { 'Cargo.toml': this.cargoToml(composition), 'src/main.rs': this.compile(composition) };
  }

  cargoToml(composition: HoloComposition): string {
    const name = this.sanitizeCrate(String(composition.name ?? 'holo-pathtrace'));
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
    const {
      prims,
      camera: cam,
      sky,
    } = extractRaytraceScene(composition, {
      width: this.width,
      height: this.height,
    });

    const fmt = (n: number) => {
      const r = Number(n.toFixed(6));
      return Number.isInteger(r) ? `${r}.0` : `${r}`;
    };
    const v4 = (a: number[]) => `[${a.map(fmt).join(', ')}]`;

    const primRust = prims
      .map(
        (p) =>
          `    Prim { kind: ${v4([p.kind, 0, 0, 0])}, a: ${v4(p.a)}, b: ${v4(p.b)}, albedo: ${v4([...p.albedo, 0])}, emissive: ${v4([...p.emissive, 0])} },`
      )
      .join('\n');
    const camInit = this.camInitRust(cam);
    const skyLit = this.skyLiteralRust(sky);

    return `${this.header(composition)}
use pollster::block_on;
use bytemuck::{Pod, Zeroable};

const WIDTH: u32 = ${this.width};
const HEIGHT: u32 = ${this.height};
const SAMPLES: u32 = ${this.samples};
const BOUNCES: u32 = ${this.bounces};

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Prim { kind: [f32; 4], a: [f32; 4], b: [f32; 4], albedo: [f32; 4], emissive: [f32; 4] }

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Cam { eye: [f32; 4], fwd: [f32; 4], right: [f32; 4], up: [f32; 4], params: [f32; 4], dims: [f32; 4] }

const PRIMS: &[Prim] = &[
${primRust}
];

const SHADER: &str = r#"
const SAMPLES: u32 = ${this.samples}u;
const BOUNCES: u32 = ${this.bounces}u;
struct Prim { kind: vec4<f32>, a: vec4<f32>, b: vec4<f32>, albedo: vec4<f32>, emissive: vec4<f32> };
struct Cam { eye: vec4<f32>, fwd: vec4<f32>, right: vec4<f32>, up: vec4<f32>, params: vec4<f32>, dims: vec4<f32> };
@group(0) @binding(0) var<storage, read> prims: array<Prim>;
@group(0) @binding(1) var<uniform> cam: Cam;
@group(0) @binding(2) var<storage, read_write> out: array<vec4<f32>>;

var<private> rng_state: u32;
fn rand() -> f32 {
  rng_state = rng_state * 747796405u + 2891336453u;
  var w = ((rng_state >> ((rng_state >> 28u) + 4u)) ^ rng_state) * 277803737u;
  w = (w >> 22u) ^ w;
  return f32(w) / 4294967295.0;
}

fn hit_sphere(ro: vec3<f32>, rd: vec3<f32>, c: vec3<f32>, r: f32, tmax: f32) -> f32 {
  let oc = ro - c;
  let b = dot(oc, rd);
  let cc = dot(oc, oc) - r * r;
  let disc = b * b - cc;
  if (disc < 0.0) { return -1.0; }
  let s = sqrt(disc);
  var t = -b - s;
  if (t < 0.001) { t = -b + s; }
  if (t < 0.001 || t > tmax) { return -1.0; }
  return t;
}
fn hit_box(ro: vec3<f32>, rd: vec3<f32>, mn: vec3<f32>, mx: vec3<f32>, tmax: f32) -> f32 {
  let inv = 1.0 / rd;
  let t0 = (mn - ro) * inv;
  let t1 = (mx - ro) * inv;
  let tsmall = min(t0, t1);
  let tbig = max(t0, t1);
  let tn = max(max(tsmall.x, tsmall.y), tsmall.z);
  let tf = min(min(tbig.x, tbig.y), tbig.z);
  if (tf < tn || tf < 0.001) { return -1.0; }
  var t = tn;
  if (t < 0.001) { t = tf; }
  if (t > tmax) { return -1.0; }
  return t;
}
fn box_normal(p: vec3<f32>, mn: vec3<f32>, mx: vec3<f32>) -> vec3<f32> {
  let c = (mn + mx) * 0.5;
  let d = (mx - mn) * 0.5;
  let rel = (p - c) / d;
  let ax = abs(rel);
  if (ax.x > ax.y && ax.x > ax.z) { return vec3<f32>(sign(rel.x), 0.0, 0.0); }
  if (ax.y > ax.z) { return vec3<f32>(0.0, sign(rel.y), 0.0); }
  return vec3<f32>(0.0, 0.0, sign(rel.z));
}

// Cosine-weighted hemisphere sample around n.
fn cosine_dir(n: vec3<f32>) -> vec3<f32> {
  let u1 = rand(); let u2 = rand();
  let r = sqrt(u1); let theta = 6.2831853 * u2;
  let x = r * cos(theta); let y = r * sin(theta); let z = sqrt(max(0.0, 1.0 - u1));
  var t = vec3<f32>(1.0, 0.0, 0.0);
  if (abs(n.x) > 0.9) { t = vec3<f32>(0.0, 1.0, 0.0); }
  let b1 = normalize(cross(t, n));
  let b2 = cross(n, b1);
  return normalize(b1 * x + b2 * y + n * z);
}

fn trace(ro_in: vec3<f32>, rd_in: vec3<f32>, sky: vec3<f32>) -> vec3<f32> {
  var ro = ro_in; var rd = rd_in;
  var throughput = vec3<f32>(1.0, 1.0, 1.0);
  var radiance = vec3<f32>(0.0, 0.0, 0.0);
  let n_prims = u32(cam.dims.w);
  for (var bounce = 0u; bounce < BOUNCES; bounce = bounce + 1u) {
    var best = 1e30; var hit_i = -1;
    for (var i = 0u; i < n_prims; i = i + 1u) {
      let pr = prims[i];
      var t = -1.0;
      if (pr.kind.x < 0.5) { t = hit_sphere(ro, rd, pr.a.xyz, pr.a.w, best); }
      else { t = hit_box(ro, rd, pr.a.xyz, pr.b.xyz, best); }
      if (t > 0.0 && t < best) { best = t; hit_i = i32(i); }
    }
    if (hit_i < 0) { radiance = radiance + throughput * sky; break; }
    let pr = prims[u32(hit_i)];
    let p = ro + rd * best;
    var n: vec3<f32>;
    if (pr.kind.x < 0.5) { n = normalize(p - pr.a.xyz); }
    else { n = box_normal(p, pr.a.xyz, pr.b.xyz); }
    if (dot(n, rd) > 0.0) { n = -n; }
    radiance = radiance + throughput * pr.emissive.xyz;
    throughput = throughput * pr.albedo.xyz;
    ro = p + n * 0.001;
    rd = cosine_dir(n);
    // Russian-roulette-free: fixed bounces; small throughput fades naturally.
  }
  return radiance;
}

@compute @workgroup_size(8, 8, 1)
fn cs(@builtin(global_invocation_id) gid: vec3<u32>) {
  let w = u32(cam.dims.x); let h = u32(cam.dims.y);
  if (gid.x >= w || gid.y >= h) { return; }
  let idx = gid.y * w + gid.x;
  rng_state = (gid.x * 1973u + gid.y * 9277u + u32(cam.dims.z) * 26699u) | 1u;
  let tanf = cam.params.x; let aspect = cam.params.y;
  var acc = vec3<f32>(0.0, 0.0, 0.0);
  for (var s = 0u; s < SAMPLES; s = s + 1u) {
    let jx = rand(); let jy = rand();
    let px = (2.0 * (f32(gid.x) + jx) / f32(w) - 1.0) * tanf * aspect;
    let py = (1.0 - 2.0 * (f32(gid.y) + jy) / f32(h)) * tanf;
    let dir = normalize(cam.fwd.xyz + cam.right.xyz * px + cam.up.xyz * py);
    acc = acc + trace(cam.eye.xyz, dir, SKYCOLOR);
  }
  out[idx] = vec4<f32>(acc / f32(SAMPLES), 1.0);
}
"#;

fn main() { block_on(run()); }

async fn run() {
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor { backends: wgpu::Backends::all(), ..Default::default() });
    let adapter = instance.request_adapter(&wgpu::RequestAdapterOptions { power_preference: wgpu::PowerPreference::HighPerformance, force_fallback_adapter: false, compatible_surface: None }).await.expect("no adapter");
    println!("ADAPTER {:?}", adapter.get_info());
    let (device, queue) = adapter.request_device(&wgpu::DeviceDescriptor::default(), None).await.expect("no device");

    let prim_buf = device.create_buffer(&wgpu::BufferDescriptor { label: Some("prims"), size: (std::mem::size_of::<Prim>() * PRIMS.len().max(1)) as u64, usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    queue.write_buffer(&prim_buf, 0, bytemuck::cast_slice(PRIMS));

    let cam = ${camInit};
    let cam_buf = device.create_buffer(&wgpu::BufferDescriptor { label: Some("cam"), size: std::mem::size_of::<Cam>() as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
    queue.write_buffer(&cam_buf, 0, bytemuck::bytes_of(&cam));

    let px_count = (WIDTH * HEIGHT) as u64;
    let out_buf = device.create_buffer(&wgpu::BufferDescriptor { label: Some("out"), size: px_count * 16, usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC, mapped_at_creation: false });
    let read_buf = device.create_buffer(&wgpu::BufferDescriptor { label: Some("read"), size: px_count * 16, usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ, mapped_at_creation: false });

    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("pt"), source: wgpu::ShaderSource::Wgsl(SHADER.replace("SKYCOLOR", ${skyLit}).into()) });
    let bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor { label: None, entries: &[
        wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::COMPUTE, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Storage { read_only: true }, has_dynamic_offset: false, min_binding_size: None }, count: None },
        wgpu::BindGroupLayoutEntry { binding: 1, visibility: wgpu::ShaderStages::COMPUTE, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None },
        wgpu::BindGroupLayoutEntry { binding: 2, visibility: wgpu::ShaderStages::COMPUTE, ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Storage { read_only: false }, has_dynamic_offset: false, min_binding_size: None }, count: None },
    ]});
    let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: None, bind_group_layouts: &[&bgl], push_constant_ranges: &[] });
    let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor { label: None, layout: Some(&pl), module: &shader, entry_point: Some("cs"), compilation_options: Default::default(), cache: None });
    let bind = device.create_bind_group(&wgpu::BindGroupDescriptor { label: None, layout: &bgl, entries: &[
        wgpu::BindGroupEntry { binding: 0, resource: prim_buf.as_entire_binding() },
        wgpu::BindGroupEntry { binding: 1, resource: cam_buf.as_entire_binding() },
        wgpu::BindGroupEntry { binding: 2, resource: out_buf.as_entire_binding() },
    ]});

    let mut enc = device.create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
    {
        let mut cp = enc.begin_compute_pass(&wgpu::ComputePassDescriptor { label: None, timestamp_writes: None });
        cp.set_pipeline(&pipeline);
        cp.set_bind_group(0, &bind, &[]);
        cp.dispatch_workgroups((WIDTH + 7) / 8, (HEIGHT + 7) / 8, 1);
    }
    enc.copy_buffer_to_buffer(&out_buf, 0, &read_buf, 0, px_count * 16);
    queue.submit(Some(enc.finish()));

    let slice = read_buf.slice(..);
    let (tx, rx) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |r| tx.send(r).unwrap());
    device.poll(wgpu::Maintain::Wait);
    rx.recv().unwrap().unwrap();
    let data = slice.get_mapped_range();
    let floats: &[f32] = bytemuck::cast_slice(&data);

    // Tonemap (Reinhard) + gamma 2.2 → 8-bit RGBA.
    let mut pixels = Vec::with_capacity((px_count * 4) as usize);
    for i in 0..(px_count as usize) {
        for c in 0..3 {
            let v = floats[i * 4 + c];
            let m = v / (1.0 + v);
            let g = m.powf(1.0 / 2.2);
            pixels.push((g.clamp(0.0, 1.0) * 255.0) as u8);
        }
        pixels.push(255u8);
    }
    let file = std::fs::File::create("out.png").unwrap();
    let w = std::io::BufWriter::new(file);
    let mut encoder = png::Encoder::new(w, WIDTH, HEIGHT);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().unwrap();
    writer.write_image_data(&pixels).unwrap();
    println!("WROTE out.png ({} prims, {} samples, {} bounces)", PRIMS.len(), SAMPLES, BOUNCES);
}
`;
  }

  private camInitRust(c: RayCamera): string {
    const f = (n: number) => {
      const r = Number(n.toFixed(6));
      return Number.isInteger(r) ? `${r}.0f32` : `${r}f32`;
    };
    const v = (a: number[], w: number) => `[${f(a[0])}, ${f(a[1])}, ${f(a[2])}, ${f(w)}]`;
    return `Cam { eye: ${v(c.eye, 0)}, fwd: ${v(c.fwd, 0)}, right: ${v(c.right, 0)}, up: ${v(c.up, 0)}, params: [${f(c.tanf)}, ${f(c.aspect)}, 1.0f32, ${f(c.nprims)}], dims: [${f(this.width)}, ${f(this.height)}, 1.0f32, ${f(c.nprims)}] }`;
  }

  private skyLiteralRust(s: [number, number, number]): string {
    const f = (n: number) => {
      const r = Number(n.toFixed(5));
      return Number.isInteger(r) ? `${r}.0` : `${r}`;
    };
    return `"vec3<f32>(${f(s[0])}, ${f(s[1])}, ${f(s[2])})"`;
  }

  private sanitizeCrate(name: string): string {
    const s = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return s || 'holo-pathtrace';
  }
  private header(composition: HoloComposition): string {
    return `// @generated by HoloScript PathTracerCompiler — sovereign offline GPU path tracer (wgpu compute).\n// Source: ${String(composition.name ?? 'composition')}. Cosine-weighted GI, emissive area lights → out.png.\n// Run: cargo run --release`;
  }
}
