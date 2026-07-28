// DesktopGPUCompiler — SOVEREIGN native-desktop GPU target (standalone wgpu, Vulkan/
// Metal/DX12). WebGPU is browser/runtime-bound; this emits a self-contained Rust wgpu
// project that renders the SAME scene offscreen on the machine's own GPU with no
// browser and no third-party engine — the "runs standalone at native perf" gap the
// sovereign-vs-bridge audit named. Verified on real hardware (Jetson Orin, Vulkan).
//
// Division of labor: all matrix math (auto-fit camera view-projection, per-object model)
// is done HERE in TS and emitted as plain f32 constants, so the emitted Rust needs no
// matrix crate — wgpu just uploads them and the WGSL multiplies. Geometry generators are
// emitted as fixed Rust fns (ported 1:1 from the WebGPU path's generators). The wgpu
// host (instance→adapter→device→offscreen texture+depth→per-object draw→readback→PNG) is
// the API verified against wgpu 23.0.1.
//
// Consumes the SAME shared vocabulary as the render/physics/audio targets: geometry-
// registry primitives + geometry-purpose visibility (invisible/functional geometry is
// not drawn). One shape, many domains — now including a native-desktop renderer.

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloValue,
  HoloTemplate,
} from '../parser/HoloCompositionTypes';
import { resolveGeometry, type GeometryPrimitiveKind } from './render-modules/geometry-registry';
import { resolveGeometryRole } from './render-modules/geometry-purpose';
import { resolveSkyboxColor } from './render-modules/skybox-registry';

interface DrawItem {
  model: number[]; // column-major mat4
  color: [number, number, number];
  emissive: [number, number, number];
  geo: GeometryPrimitiveKind;
}

const RENDER_W = 900;
const RENDER_H = 600;

export class DesktopGPUCompiler {
  private templatesByName: Map<string, HoloTemplate> = new Map();

  /** Emit the full Cargo project as a { 'Cargo.toml', 'src/main.rs' } map. */
  compileProject(composition: HoloComposition): Record<string, string> {
    return {
      'Cargo.toml': this.cargoToml(composition),
      'src/main.rs': this.compile(composition),
    };
  }

  cargoToml(composition: HoloComposition): string {
    const name = this.sanitizeCrate(String(composition.name ?? 'holo-scene'));
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
      'opt-level = 1',
      '',
    ].join('\n');
  }

  compile(composition: HoloComposition): string {
    this.templatesByName = new Map(
      (composition.templates ?? []).map((t) => [t.name, t] as [string, HoloTemplate])
    );
    const items = this.collectDrawItems(composition);
    const clear = this.clearColor(composition);
    const vp = this.viewProjection(items);

    const fmt = (n: number) => {
      const r = Number(n.toFixed(6));
      return Number.isInteger(r) ? `${r}.0` : `${r}`;
    };
    const arr = (a: number[]) => `[${a.map(fmt).join(', ')}]`;

    const objectsRust = items
      .map(
        (it) =>
          `    Obj { model: ${arr(it.model)}, color: ${arr([...it.color, 1])}, emissive: ${arr([...it.emissive, 0])}, geo: "${it.geo}" },`
      )
      .join('\n');

    return `${this.headerComment(composition)}
use pollster::block_on;
use bytemuck::{Pod, Zeroable};

const WIDTH: u32 = ${RENDER_W};
const HEIGHT: u32 = ${RENDER_H};

#[repr(C)]
#[derive(Clone, Copy, Pod, Zeroable)]
struct Uniforms { vp: [[f32; 4]; 4], model: [[f32; 4]; 4], color: [f32; 4], emissive: [f32; 4] }

struct Obj { model: [f32; 16], color: [f32; 4], emissive: [f32; 4], geo: &'static str }

const VP: [f32; 16] = ${arr(vp)};
const CLEAR: [f64; 4] = ${arr(clear as unknown as number[]).replace(/f32/g, 'f64')};

const OBJECTS: &[Obj] = &[
${objectsRust}
];

${this.geometryRust()}

fn gen(geo: &str) -> Vec<f32> {
    match geo {
        "sphere" => gen_sphere(0.5, 16, 16),
        "plane" => gen_plane(1.0, 1.0),
        "cylinder" => gen_cylinder(0.5, 1.0, 16),
        "cone" => gen_cone(0.5, 1.0, 16),
        "torus" => gen_torus(0.5, 0.15, 16, 32),
        _ => gen_cube(1.0),
    }
}

const SHADER: &str = r#"
struct U { vp: mat4x4<f32>, model: mat4x4<f32>, color: vec4<f32>, emissive: vec4<f32> };
@group(0) @binding(0) var<uniform> u: U;
struct VOut { @builtin(position) clip: vec4<f32>, @location(0) n: vec3<f32> };
@vertex fn vs(@location(0) pos: vec3<f32>, @location(1) nor: vec3<f32>) -> VOut {
  var o: VOut;
  let w = u.model * vec4<f32>(pos, 1.0);
  o.clip = u.vp * w;
  o.n = normalize((u.model * vec4<f32>(nor, 0.0)).xyz);
  return o;
}
@fragment fn fs(i: VOut) -> @location(0) vec4<f32> {
  let L = normalize(vec3<f32>(1.0, 2.0, 1.5));
  let d = max(dot(normalize(i.n), L), 0.0);
  let lit = u.color.rgb * (0.15 + d);
  return vec4<f32>(lit + u.emissive.rgb, 1.0);
}
"#;

fn main() { block_on(run()); }

async fn run() {
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor { backends: wgpu::Backends::all(), ..Default::default() });
    let adapter = instance
        .request_adapter(&wgpu::RequestAdapterOptions { power_preference: wgpu::PowerPreference::HighPerformance, force_fallback_adapter: false, compatible_surface: None })
        .await
        .expect("no wgpu adapter");
    println!("ADAPTER {:?}", adapter.get_info());
    let (device, queue) = adapter.request_device(&wgpu::DeviceDescriptor::default(), None).await.expect("no device");

    let color_tex = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("color"), size: wgpu::Extent3d { width: WIDTH, height: HEIGHT, depth_or_array_layers: 1 },
        mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Rgba8UnormSrgb,
        usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC, view_formats: &[],
    });
    let color_view = color_tex.create_view(&wgpu::TextureViewDescriptor::default());
    let depth_tex = device.create_texture(&wgpu::TextureDescriptor {
        label: Some("depth"), size: wgpu::Extent3d { width: WIDTH, height: HEIGHT, depth_or_array_layers: 1 },
        mip_level_count: 1, sample_count: 1, dimension: wgpu::TextureDimension::D2,
        format: wgpu::TextureFormat::Depth32Float, usage: wgpu::TextureUsages::RENDER_ATTACHMENT, view_formats: &[],
    });
    let depth_view = depth_tex.create_view(&wgpu::TextureViewDescriptor::default());

    let bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
        label: Some("bgl"),
        entries: &[wgpu::BindGroupLayoutEntry { binding: 0, visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
            ty: wgpu::BindingType::Buffer { ty: wgpu::BufferBindingType::Uniform, has_dynamic_offset: false, min_binding_size: None }, count: None }],
    });
    let pl = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor { label: Some("pl"), bind_group_layouts: &[&bgl], push_constant_ranges: &[] });
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor { label: Some("shader"), source: wgpu::ShaderSource::Wgsl(SHADER.into()) });
    let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("pipe"), layout: Some(&pl),
        vertex: wgpu::VertexState { module: &shader, entry_point: Some("vs"), compilation_options: Default::default(),
            buffers: &[wgpu::VertexBufferLayout { array_stride: 24, step_mode: wgpu::VertexStepMode::Vertex,
                attributes: &[wgpu::VertexAttribute { format: wgpu::VertexFormat::Float32x3, offset: 0, shader_location: 0 },
                              wgpu::VertexAttribute { format: wgpu::VertexFormat::Float32x3, offset: 12, shader_location: 1 }] }] },
        fragment: Some(wgpu::FragmentState { module: &shader, entry_point: Some("fs"), compilation_options: Default::default(),
            targets: &[Some(wgpu::ColorTargetState { format: wgpu::TextureFormat::Rgba8UnormSrgb, blend: None, write_mask: wgpu::ColorWrites::ALL })] }),
        primitive: wgpu::PrimitiveState { topology: wgpu::PrimitiveTopology::TriangleList, cull_mode: Some(wgpu::Face::Back), ..Default::default() },
        depth_stencil: Some(wgpu::DepthStencilState { format: wgpu::TextureFormat::Depth32Float, depth_write_enabled: true, depth_compare: wgpu::CompareFunction::Less, stencil: Default::default(), bias: Default::default() }),
        multisample: wgpu::MultisampleState::default(), multiview: None, cache: None,
    });

    // Per-object vertex + uniform buffers.
    let mut vbos = Vec::new();
    let mut binds = Vec::new();
    let mut counts = Vec::new();
    for obj in OBJECTS {
        let verts = gen(obj.geo);
        counts.push((verts.len() / 6) as u32);
        let vbo = device.create_buffer(&wgpu::BufferDescriptor { label: None, size: (verts.len() * 4) as u64, usage: wgpu::BufferUsages::VERTEX | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        queue.write_buffer(&vbo, 0, bytemuck::cast_slice(&verts));
        let u = Uniforms { vp: mat(&VP), model: mat(&obj.model), color: obj.color, emissive: obj.emissive };
        let ubo = device.create_buffer(&wgpu::BufferDescriptor { label: None, size: std::mem::size_of::<Uniforms>() as u64, usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST, mapped_at_creation: false });
        queue.write_buffer(&ubo, 0, bytemuck::bytes_of(&u));
        let bind = device.create_bind_group(&wgpu::BindGroupDescriptor { label: None, layout: &bgl, entries: &[wgpu::BindGroupEntry { binding: 0, resource: ubo.as_entire_binding() }] });
        vbos.push(vbo); binds.push(bind);
    }

    // copy_texture_to_buffer requires bytes_per_row aligned to 256 — pad, strip later.
    let unpadded_bpr = WIDTH * 4;
    let align = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
    let bytes_per_row = ((unpadded_bpr + align - 1) / align) * align;
    let output = device.create_buffer(&wgpu::BufferDescriptor { label: Some("out"), size: (bytes_per_row * HEIGHT) as u64, usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ, mapped_at_creation: false });

    let mut enc = device.create_command_encoder(&wgpu::CommandEncoderDescriptor::default());
    {
        let mut rp = enc.begin_render_pass(&wgpu::RenderPassDescriptor {
            label: Some("main"),
            color_attachments: &[Some(wgpu::RenderPassColorAttachment { view: &color_view, resolve_target: None,
                ops: wgpu::Operations { load: wgpu::LoadOp::Clear(wgpu::Color { r: CLEAR[0], g: CLEAR[1], b: CLEAR[2], a: 1.0 }), store: wgpu::StoreOp::Store } })],
            depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment { view: &depth_view,
                depth_ops: Some(wgpu::Operations { load: wgpu::LoadOp::Clear(1.0), store: wgpu::StoreOp::Store }), stencil_ops: None }),
            timestamp_writes: None, occlusion_query_set: None,
        });
        rp.set_pipeline(&pipeline);
        for i in 0..OBJECTS.len() {
            rp.set_bind_group(0, &binds[i], &[]);
            rp.set_vertex_buffer(0, vbos[i].slice(..));
            rp.draw(0..counts[i], 0..1);
        }
    }
    enc.copy_texture_to_buffer(
        wgpu::ImageCopyTexture { texture: &color_tex, mip_level: 0, origin: wgpu::Origin3d::ZERO, aspect: wgpu::TextureAspect::All },
        wgpu::ImageCopyBuffer { buffer: &output, layout: wgpu::ImageDataLayout { offset: 0, bytes_per_row: Some(bytes_per_row), rows_per_image: Some(HEIGHT) } },
        wgpu::Extent3d { width: WIDTH, height: HEIGHT, depth_or_array_layers: 1 },
    );
    queue.submit(Some(enc.finish()));

    let slice = output.slice(..);
    let (tx, rx) = std::sync::mpsc::channel();
    slice.map_async(wgpu::MapMode::Read, move |r| tx.send(r).unwrap());
    device.poll(wgpu::Maintain::Wait);
    rx.recv().unwrap().unwrap();
    let data = slice.get_mapped_range();

    // Strip the per-row padding back to tight WIDTH*4 rows for the PNG.
    let mut pixels = Vec::with_capacity((unpadded_bpr * HEIGHT) as usize);
    for row in 0..HEIGHT {
        let start = (row * bytes_per_row) as usize;
        pixels.extend_from_slice(&data[start..start + unpadded_bpr as usize]);
    }

    let file = std::fs::File::create("out.png").unwrap();
    let w = std::io::BufWriter::new(file);
    let mut encoder = png::Encoder::new(w, WIDTH, HEIGHT);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().unwrap();
    writer.write_image_data(&pixels).unwrap();
    println!("WROTE out.png ({} objects)", OBJECTS.len());
}

// Column-major [f32;16] -> [[f32;4];4] as wgpu/WGSL expects (column-major columns).
fn mat(m: &[f32; 16]) -> [[f32; 4]; 4] {
    [[m[0], m[1], m[2], m[3]], [m[4], m[5], m[6], m[7]], [m[8], m[9], m[10], m[11]], [m[12], m[13], m[14], m[15]]]
}
`;
  }

  // ── scene extraction (shared vocabulary) ─────────────────────────────────────
  private collectDrawItems(composition: HoloComposition): DrawItem[] {
    const items: DrawItem[] = [];
    const add = (obj: HoloObjectDecl, off: number[]) => {
      const role = resolveGeometryRole({
        purpose: this.findProp(obj, 'purpose'),
        visible: this.findProp(obj, 'visible'),
        traitNames: (obj.traits ?? []).map((t) => t.name),
      });
      if (role.visible) {
        const mesh = String(
          this.findProp(obj, 'geometry') ??
            this.findProp(obj, 'mesh') ??
            this.findProp(obj, 'type') ??
            'cube'
        );
        const geo = resolveGeometry(mesh).kind;
        const pos = this.vec3(this.findProp(obj, 'position'), [0, 0, 0]);
        const scale = this.scaleOf(obj);
        const model = [
          scale[0],
          0,
          0,
          0,
          0,
          scale[1],
          0,
          0,
          0,
          0,
          scale[2],
          0,
          pos[0] + off[0],
          pos[1] + off[1],
          pos[2] + off[2],
          1,
        ];
        items.push({ model, color: this.colorOf(obj), emissive: this.emissiveOf(obj), geo });
      }
      if (obj.children) for (const c of obj.children) add(c, off);
    };
    for (const o of composition.objects ?? []) add(o, [0, 0, 0]);
    const scenes = (composition as unknown as { scenes?: Array<{ objects?: HoloObjectDecl[] }> })
      .scenes;
    for (const s of scenes ?? []) for (const o of s.objects ?? []) add(o, [0, 0, 0]);
    const walk = (g: HoloSpatialGroup, parent: number[]) => {
      const gp = g.properties?.find((p) => p.key === 'position')?.value;
      const [gx, gy, gz] = Array.isArray(gp) ? (gp as number[]) : [0, 0, 0];
      const o2 = [parent[0] + gx, parent[1] + gy, parent[2] + gz];
      for (const o of g.objects ?? []) add(o, o2);
      for (const sub of g.groups ?? []) walk(sub, o2);
    };
    for (const g of composition.spatialGroups ?? []) walk(g, [0, 0, 0]);
    return items;
  }

  private clearColor(composition: HoloComposition): [number, number, number, number] {
    const env = composition.environment;
    const props: Record<string, unknown> = {};
    for (const p of env?.properties ?? []) props[p.key] = p.value;
    const bg = props.background || props.skybox || '#05070d';
    const c =
      typeof bg === 'string' && bg.startsWith('#')
        ? this.hexColor(bg)
        : resolveSkyboxColor(String(bg));
    return [c[0], c[1], c[2], 1];
  }

  // Auto-fit view-projection (mirrors the WebGPU auto-fit): honor a declared camera,
  // else frame the scene bounds. Returns a column-major mat4 (WGSL clip z in [0,1]).
  private viewProjection(items: DrawItem[]): number[] {
    let fov = 60,
      near = 0.1,
      far = 1000;
    let eye = [4, 3, 6];
    let target = [0, 0, 0];
    // (Declared-camera parsing is handled by callers of the render path; the desktop
    // MVP auto-fits from bounds so any scene frames without a camera.)
    const pts = items.map((it) => [it.model[12], it.model[13], it.model[14]]);
    if (pts.length > 0) {
      const min = [Infinity, Infinity, Infinity];
      const max = [-Infinity, -Infinity, -Infinity];
      for (const p of pts)
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i], p[i]);
          max[i] = Math.max(max[i], p[i]);
        }
      const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
      let radius = 1;
      for (const p of pts)
        radius = Math.max(
          radius,
          Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]) + 1.5
        );
      const fovRad = (fov * Math.PI) / 180;
      const dist = (radius / Math.sin(fovRad / 2)) * 1.1;
      const dl = Math.hypot(0.35, 0.45, 1);
      eye = [
        center[0] + (0.35 / dl) * dist,
        center[1] + (0.45 / dl) * dist,
        center[2] + (1 / dl) * dist,
      ];
      target = center;
      far = Math.max(far, dist + radius * 2 + 10);
    }
    const aspect = RENDER_W / RENDER_H;
    const f = 1 / Math.tan((fov * Math.PI) / 180 / 2);
    const ri = 1 / (near - far);
    const proj = [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, far * ri, -1, 0, 0, near * far * ri, 0];
    const view = this.lookAt(eye, target, [0, 1, 0]);
    return this.mul(proj, view);
  }

  private lookAt(eye: number[], target: number[], up: number[]): number[] {
    const zx = eye[0] - target[0],
      zy = eye[1] - target[1],
      zz = eye[2] - target[2];
    const zl = Math.hypot(zx, zy, zz) || 1;
    const fz = [zx / zl, zy / zl, zz / zl];
    const xx = up[1] * fz[2] - up[2] * fz[1],
      xy = up[2] * fz[0] - up[0] * fz[2],
      xz = up[0] * fz[1] - up[1] * fz[0];
    const xl = Math.hypot(xx, xy, xz) || 1;
    const rx = [xx / xl, xy / xl, xz / xl];
    const uy = [
      fz[1] * rx[2] - fz[2] * rx[1],
      fz[2] * rx[0] - fz[0] * rx[2],
      fz[0] * rx[1] - fz[1] * rx[0],
    ];
    return [
      rx[0],
      uy[0],
      fz[0],
      0,
      rx[1],
      uy[1],
      fz[1],
      0,
      rx[2],
      uy[2],
      fz[2],
      0,
      -(rx[0] * eye[0] + rx[1] * eye[1] + rx[2] * eye[2]),
      -(uy[0] * eye[0] + uy[1] * eye[1] + uy[2] * eye[2]),
      -(fz[0] * eye[0] + fz[1] * eye[1] + fz[2] * eye[2]),
      1,
    ];
  }
  private mul(a: number[], b: number[]): number[] {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++)
        o[c * 4 + r] =
          a[0 * 4 + r] * b[c * 4 + 0] +
          a[1 * 4 + r] * b[c * 4 + 1] +
          a[2 * 4 + r] * b[c * 4 + 2] +
          a[3 * 4 + r] * b[c * 4 + 3];
    return o;
  }

  // ── small helpers ────────────────────────────────────────────────────────────
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
    if (typeof c === 'string' && c.startsWith('#')) return this.hexColor(c);
    return [0.8, 0.8, 0.8];
  }
  private emissiveOf(obj: HoloObjectDecl): [number, number, number] {
    const e = this.findProp(obj, 'emissive');
    if (typeof e === 'string' && e.startsWith('#')) return this.hexColor(e);
    return [0, 0, 0];
  }
  private hexColor(hex: string): [number, number, number] {
    const h = hex.slice(1);
    return [
      Number((parseInt(h.substring(0, 2), 16) / 255).toFixed(4)),
      Number((parseInt(h.substring(2, 4), 16) / 255).toFixed(4)),
      Number((parseInt(h.substring(4, 6), 16) / 255).toFixed(4)),
    ];
  }
  private sanitizeCrate(name: string): string {
    const s = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return s || 'holo-scene';
  }
  private headerComment(composition: HoloComposition): string {
    return `// @generated by HoloScript DesktopGPUCompiler — sovereign native-desktop GPU (wgpu).\n// Source: ${String(composition.name ?? 'composition')}. Renders offscreen to out.png on the machine's own GPU.\n// Run: cargo run --release`;
  }

  // Geometry generators ported 1:1 from the WebGPU path (interleaved pos3+norm3).
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
    for (n, v) in faces.iter() {
        for &idx in &[0usize,1,2,0,2,3] { let p = v[idx]; o.extend_from_slice(&[p[0],p[1],p[2],n[0],n[1],n[2]]); }
    }
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
}
fn gen_plane(w: f32, d: f32) -> Vec<f32> {
    let x = w*0.5; let z = d*0.5;
    vec![-x,0.0,-z,0.0,1.0,0.0, x,0.0,-z,0.0,1.0,0.0, x,0.0,z,0.0,1.0,0.0, -x,0.0,-z,0.0,1.0,0.0, x,0.0,z,0.0,1.0,0.0, -x,0.0,z,0.0,1.0,0.0]
}
fn gen_cylinder(radius: f32, height: f32, segments: u32) -> Vec<f32> {
    let segs = segments.max(3); let hy = height*0.5; let mut o = Vec::new();
    for i in 0..segs {
        let t0 = 2.0*std::f32::consts::PI*i as f32/segs as f32; let t1 = 2.0*std::f32::consts::PI*(i+1) as f32/segs as f32;
        let (c0,s0)=(t0.cos(),t0.sin()); let (c1,s1)=(t1.cos(),t1.sin());
        let b0=[radius*c0,-hy,radius*s0,c0,0.0,s0]; let t0v=[radius*c0,hy,radius*s0,c0,0.0,s0];
        let b1=[radius*c1,-hy,radius*s1,c1,0.0,s1]; let t1v=[radius*c1,hy,radius*s1,c1,0.0,s1];
        for v in [b0,b1,t1v,b0,t1v,t0v] { o.extend_from_slice(&v); }
    }
    o
}
fn gen_cone(radius: f32, height: f32, segments: u32) -> Vec<f32> {
    let segs = segments.max(3); let hy = height*0.5; let mut o = Vec::new();
    for i in 0..segs {
        let t0 = 2.0*std::f32::consts::PI*i as f32/segs as f32; let t1 = 2.0*std::f32::consts::PI*(i+1) as f32/segs as f32;
        let (c0,s0)=(t0.cos(),t0.sin()); let (c1,s1)=(t1.cos(),t1.sin());
        let apex=[0.0,hy,0.0,0.0,1.0,0.0]; let b0=[radius*c0,-hy,radius*s0,c0,0.3,s0]; let b1=[radius*c1,-hy,radius*s1,c1,0.3,s1];
        for v in [b0,b1,apex] { o.extend_from_slice(&v); }
    }
    o
}
fn gen_torus(radius: f32, tube: f32, rad_seg: u32, tub_seg: u32) -> Vec<f32> {
    let rr = rad_seg.max(3); let tt = tub_seg.max(3); let mut o = Vec::new();
    let p = |ri: u32, ti: u32| -> [f32;6] {
        let u = 2.0*std::f32::consts::PI*ri as f32/rr as f32; let v = 2.0*std::f32::consts::PI*ti as f32/tt as f32;
        let (cu,su)=(u.cos(),u.sin()); let (cv,sv)=(v.cos(),v.sin());
        [(radius+tube*cv)*cu, tube*sv, (radius+tube*cv)*su, cv*cu, sv, cv*su]
    };
    for ri in 0..rr { for ti in 0..tt {
        let a=p(ri,ti); let b=p(ri+1,ti); let c=p(ri+1,ti+1); let d=p(ri,ti+1);
        for v in [a,b,c,a,c,d] { o.extend_from_slice(&v); }
    }}
    o
}`;
  }
}
