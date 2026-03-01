//! Core wgpu render-to-texture pipeline for shader preview.
//!
//! Architecture:
//! 1. Initialize headless wgpu device (no surface/window required)
//! 2. Create offscreen texture as render target
//! 3. Compile user WGSL shader into render pipeline
//! 4. Render fullscreen quad with user shader
//! 5. Copy texture to staging buffer
//! 6. Map buffer and read back pixels
//! 7. Encode as PNG/base64 for frontend delivery

use crate::encoder::PngEncoder;
use crate::error::PreviewError;
use serde::{Deserialize, Serialize};
use std::time::Instant;

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

/// Output encoding mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EncodeMode {
    /// Encode as PNG -> base64 data URI (compatible with <img src>).
    /// ~5ms at 720p in release, produces ~200-500KB per frame.
    PngDataUri,
    /// Encode raw RGBA pixels as base64 (fastest, ~3ms at 720p in release).
    /// Frontend decodes via canvas putImageData.
    /// Produces ~4.9MB base64 per 720p frame.
    RawBase64,
    /// No encoding — just render and readback (for benchmarking).
    None,
}

/// Render configuration for the shader preview pipeline.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderConfig {
    /// Output width in pixels (default: 1280 for 720p).
    pub width: u32,
    /// Output height in pixels (default: 720 for 720p).
    pub height: u32,
    /// Target frames per second for budget calculation.
    pub target_fps: u32,
    /// Whether to encode output as base64 data URI.
    pub encode_base64: bool,
    /// Encoding mode for the output frame data.
    pub encode_mode: EncodeMode,
    /// Whether to warn (not error) on frame budget overrun.
    pub soft_budget: bool,
}

impl Default for RenderConfig {
    fn default() -> Self {
        Self {
            width: 1280,
            height: 720,
            target_fps: 30,
            encode_base64: true,
            encode_mode: EncodeMode::PngDataUri,
            soft_budget: true,
        }
    }
}

impl RenderConfig {
    /// Frame budget in milliseconds.
    pub fn frame_budget_ms(&self) -> f64 {
        1000.0 / self.target_fps as f64
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Frame Result
// ═══════════════════════════════════════════════════════════════════════════════

/// Result of rendering a single frame.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameResult {
    /// Base64-encoded PNG data URI (if encode_mode is PngDataUri).
    pub data_uri: Option<String>,
    /// Base64-encoded raw RGBA pixels (if encode_mode is RawBase64).
    pub raw_pixels_b64: Option<String>,
    /// Raw PNG bytes length (or raw pixel data length).
    pub png_byte_length: usize,
    /// Total frame time in milliseconds.
    pub frame_time_ms: f64,
    /// GPU render time in milliseconds.
    pub render_time_ms: f64,
    /// Buffer readback time in milliseconds.
    pub readback_time_ms: f64,
    /// PNG encode time in milliseconds.
    pub encode_time_ms: f64,
    /// Whether frame met the budget.
    pub within_budget: bool,
    /// Frame number (monotonically increasing).
    pub frame_number: u64,
    /// Resolution rendered.
    pub width: u32,
    pub height: u32,
}

// ═══════════════════════════════════════════════════════════════════════════════
// Timing helper
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PipelineTimings {
    pub init_device_ms: f64,
    pub create_pipeline_ms: f64,
    pub total_init_ms: f64,
}

// ═══════════════════════════════════════════════════════════════════════════════
// Uniform buffer for shader parameters
// ═══════════════════════════════════════════════════════════════════════════════

/// Uniform data passed to every shader: time, resolution, mouse.
#[repr(C)]
#[derive(Debug, Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct ShaderUniforms {
    /// Elapsed time in seconds.
    time: f32,
    /// Frame delta time in seconds.
    delta_time: f32,
    /// Viewport width.
    resolution_x: f32,
    /// Viewport height.
    resolution_y: f32,
    /// Mouse X (normalized 0..1).
    mouse_x: f32,
    /// Mouse Y (normalized 0..1).
    mouse_y: f32,
    /// Frame number as float.
    frame: f32,
    /// Padding to align to 16 bytes.
    _padding: f32,
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default shaders
// ═══════════════════════════════════════════════════════════════════════════════

/// Fullscreen triangle vertex shader (no vertex buffer needed).
const VERTEX_SHADER: &str = r#"
struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    // Fullscreen triangle: 3 vertices cover the entire screen
    // Vertex 0: (-1, -1), Vertex 1: (3, -1), Vertex 2: (-1, 3)
    var out: VertexOutput;
    let x = f32(i32(vertex_index & 1u) * 4 - 1);
    let y = f32(i32(vertex_index >> 1u) * 4 - 1);
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>((x + 1.0) * 0.5, 1.0 - (y + 1.0) * 0.5);
    return out;
}
"#;

/// Default fragment shader — Shadertoy-style gradient with time animation.
pub const DEFAULT_FRAGMENT_SHADER: &str = r#"
struct Uniforms {
    time: f32,
    delta_time: f32,
    resolution_x: f32,
    resolution_y: f32,
    mouse_x: f32,
    mouse_y: f32,
    frame: f32,
    _padding: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let uv = in.uv;
    let t = u.time;

    // Animated gradient — similar to Shadertoy defaults
    let r = 0.5 + 0.5 * cos(t + uv.x * 3.14159);
    let g = 0.5 + 0.5 * cos(t + uv.y * 3.14159 + 2.094);
    let b = 0.5 + 0.5 * cos(t + (uv.x + uv.y) * 1.5708 + 4.189);

    return vec4<f32>(r, g, b, 1.0);
}
"#;

// ═══════════════════════════════════════════════════════════════════════════════
// Pipeline
// ═══════════════════════════════════════════════════════════════════════════════

/// The main shader preview pipeline.
///
/// Manages a headless wgpu device, offscreen render target, and the full
/// render-readback-encode cycle.
pub struct ShaderPreviewPipeline {
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: RenderConfig,

    // Offscreen render target
    render_texture: wgpu::Texture,
    render_texture_view: wgpu::TextureView,

    // Staging buffer for readback
    staging_buffer: wgpu::Buffer,
    padded_bytes_per_row: u32,
    unpadded_bytes_per_row: u32,

    // Render pipeline
    render_pipeline: wgpu::RenderPipeline,

    // Uniform buffer
    uniform_buffer: wgpu::Buffer,
    bind_group: wgpu::BindGroup,

    // State
    frame_number: u64,
    start_time: Instant,
    last_frame_time: Instant,
    init_timings: PipelineTimings,
}

impl ShaderPreviewPipeline {
    /// Initialize the pipeline with default fragment shader.
    pub fn new(config: RenderConfig) -> Result<Self, PreviewError> {
        Self::with_shader(config, DEFAULT_FRAGMENT_SHADER)
    }

    /// Initialize the pipeline with a custom WGSL fragment shader.
    ///
    /// The fragment shader must define:
    /// - A `Uniforms` struct bound at `@group(0) @binding(0)`
    /// - A `fs_main` entry point returning `@location(0) vec4<f32>`
    pub fn with_shader(config: RenderConfig, fragment_wgsl: &str) -> Result<Self, PreviewError> {
        // Validate resolution
        if config.width == 0
            || config.height == 0
            || config.width > 4096
            || config.height > 4096
        {
            return Err(PreviewError::InvalidResolution {
                width: config.width,
                height: config.height,
            });
        }

        let total_start = Instant::now();

        // ─── Device initialization (headless — no surface) ───────────────
        let device_start = Instant::now();
        let instance = wgpu::Instance::new(&wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            ..Default::default()
        });

        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            force_fallback_adapter: false,
            compatible_surface: None, // Headless — no surface
        }))
        .ok_or(PreviewError::NoAdapter)?;

        log::info!(
            "GPU adapter: {} ({:?})",
            adapter.get_info().name,
            adapter.get_info().backend
        );

        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("HoloScript Shader Preview"),
                required_features: wgpu::Features::empty(),
                required_limits: wgpu::Limits::default(),
                memory_hints: wgpu::MemoryHints::Performance,
            },
            None,
        ))?;

        let device_elapsed = device_start.elapsed().as_secs_f64() * 1000.0;

        // ─── Offscreen texture ───────────────────────────────────────────
        let texture_format = wgpu::TextureFormat::Rgba8UnormSrgb;

        let render_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Shader Preview Render Target"),
            size: wgpu::Extent3d {
                width: config.width,
                height: config.height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: texture_format,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });

        let render_texture_view = render_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // ─── Staging buffer for readback ─────────────────────────────────
        let bytes_per_pixel = 4u32; // RGBA8
        let unpadded_bytes_per_row = config.width * bytes_per_pixel;
        // wgpu requires rows to be aligned to COPY_BYTES_PER_ROW_ALIGNMENT (256)
        let align = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
        let padded_bytes_per_row = (unpadded_bytes_per_row + align - 1) / align * align;
        let buffer_size = (padded_bytes_per_row * config.height) as u64;

        let staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Shader Preview Staging Buffer"),
            size: buffer_size,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        // ─── Uniform buffer ──────────────────────────────────────────────
        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Shader Preview Uniforms"),
            size: std::mem::size_of::<ShaderUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // ─── Bind group layout ───────────────────────────────────────────
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Shader Preview Bind Group Layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Shader Preview Bind Group"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
        });

        // ─── Shader modules ─────────────────────────────────────────────
        let pipeline_start = Instant::now();

        let vertex_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Shader Preview Vertex"),
            source: wgpu::ShaderSource::Wgsl(VERTEX_SHADER.into()),
        });

        let fragment_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Shader Preview Fragment"),
            source: wgpu::ShaderSource::Wgsl(fragment_wgsl.into()),
        });

        // ─── Pipeline layout ─────────────────────────────────────────────
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Shader Preview Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        // ─── Render pipeline ─────────────────────────────────────────────
        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Shader Preview Render Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &vertex_module,
                entry_point: Some("vs_main"),
                buffers: &[], // Fullscreen triangle — no vertex buffer
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &fragment_module,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: texture_format,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None, // No culling for fullscreen triangle
                polygon_mode: wgpu::PolygonMode::Fill,
                unclipped_depth: false,
                conservative: false,
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        let pipeline_elapsed = pipeline_start.elapsed().as_secs_f64() * 1000.0;
        let total_elapsed = total_start.elapsed().as_secs_f64() * 1000.0;

        let init_timings = PipelineTimings {
            init_device_ms: device_elapsed,
            create_pipeline_ms: pipeline_elapsed,
            total_init_ms: total_elapsed,
        };

        log::info!(
            "Pipeline initialized: device={:.1}ms, pipeline={:.1}ms, total={:.1}ms",
            device_elapsed,
            pipeline_elapsed,
            total_elapsed
        );

        let now = Instant::now();

        Ok(Self {
            device,
            queue,
            config,
            render_texture,
            render_texture_view,
            staging_buffer,
            padded_bytes_per_row,
            unpadded_bytes_per_row,
            render_pipeline,
            uniform_buffer,
            bind_group,
            frame_number: 0,
            start_time: now,
            last_frame_time: now,
            init_timings,
        })
    }

    /// Get initialization timings.
    pub fn init_timings(&self) -> &PipelineTimings {
        &self.init_timings
    }

    /// Get the current GPU adapter info as a string.
    pub fn adapter_info(&self) -> String {
        "HoloScript Shader Preview Device".to_string()
    }

    /// Get current config.
    pub fn config(&self) -> &RenderConfig {
        &self.config
    }

    /// Render a single frame and return the result.
    ///
    /// This is the main hot path:
    /// 1. Update uniforms (time, resolution, mouse)
    /// 2. Execute render pass to offscreen texture
    /// 3. Copy texture to staging buffer
    /// 4. Map buffer and read back pixels
    /// 5. Encode to PNG/base64
    pub fn render_frame(
        &mut self,
        mouse_x: f32,
        mouse_y: f32,
    ) -> Result<FrameResult, PreviewError> {
        let frame_start = Instant::now();
        let now = Instant::now();
        let elapsed_secs = now.duration_since(self.start_time).as_secs_f32();
        let delta_secs = now.duration_since(self.last_frame_time).as_secs_f32();
        self.last_frame_time = now;

        // ─── 1. Update uniforms ──────────────────────────────────────────
        let uniforms = ShaderUniforms {
            time: elapsed_secs,
            delta_time: delta_secs,
            resolution_x: self.config.width as f32,
            resolution_y: self.config.height as f32,
            mouse_x,
            mouse_y,
            frame: self.frame_number as f32,
            _padding: 0.0,
        };
        self.queue
            .write_buffer(&self.uniform_buffer, 0, bytemuck::cast_slice(&[uniforms]));

        // ─── 2. Render pass ──────────────────────────────────────────────
        let render_start = Instant::now();
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("Shader Preview Encoder"),
            });

        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Shader Preview Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &self.render_texture_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.0,
                            g: 0.0,
                            b: 0.0,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            render_pass.set_pipeline(&self.render_pipeline);
            render_pass.set_bind_group(0, &self.bind_group, &[]);
            render_pass.draw(0..3, 0..1); // Fullscreen triangle
        }

        // ─── 3. Copy texture to staging buffer ──────────────────────────
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture: &self.render_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: &self.staging_buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(self.padded_bytes_per_row),
                    rows_per_image: Some(self.config.height),
                },
            },
            wgpu::Extent3d {
                width: self.config.width,
                height: self.config.height,
                depth_or_array_layers: 1,
            },
        );

        self.queue.submit(std::iter::once(encoder.finish()));

        let render_elapsed = render_start.elapsed().as_secs_f64() * 1000.0;

        // ─── 4. Map buffer and read back pixels ─────────────────────────
        let readback_start = Instant::now();
        let buffer_slice = self.staging_buffer.slice(..);
        let (sender, receiver) = std::sync::mpsc::channel();

        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = sender.send(result);
        });

        self.device.poll(wgpu::Maintain::Wait);

        receiver
            .recv()
            .map_err(|_| PreviewError::BufferMapping)?
            .map_err(|_| PreviewError::BufferMapping)?;

        let data = buffer_slice.get_mapped_range();
        let pixel_data: Vec<u8> = data.to_vec();
        drop(data);
        self.staging_buffer.unmap();

        let readback_elapsed = readback_start.elapsed().as_secs_f64() * 1000.0;

        // ─── 5. Encode frame data ────────────────────────────────────────
        let encode_start = Instant::now();

        let (data_uri, raw_pixels_b64, byte_length) = match self.config.encode_mode {
            EncodeMode::PngDataUri => {
                let uri = PngEncoder::encode_base64_data_uri(
                    &pixel_data,
                    self.config.width,
                    self.config.height,
                    self.padded_bytes_per_row,
                    self.unpadded_bytes_per_row,
                )?;
                let len = uri.len();
                (Some(uri), None, len)
            }
            EncodeMode::RawBase64 => {
                let raw = PngEncoder::encode_raw_base64(
                    &pixel_data,
                    self.config.width,
                    self.config.height,
                    self.padded_bytes_per_row,
                    self.unpadded_bytes_per_row,
                )?;
                let len = raw.len();
                (None, Some(raw), len)
            }
            EncodeMode::None => {
                (None, None, pixel_data.len())
            }
        };

        let encode_elapsed = encode_start.elapsed().as_secs_f64() * 1000.0;

        // ─── Result ─────────────────────────────────────────────────────
        let frame_elapsed = frame_start.elapsed().as_secs_f64() * 1000.0;
        let within_budget = frame_elapsed <= self.config.frame_budget_ms();

        self.frame_number += 1;

        if !within_budget && !self.config.soft_budget {
            return Err(PreviewError::FrameBudgetExceeded {
                elapsed_ms: frame_elapsed,
                budget_ms: self.config.frame_budget_ms(),
            });
        }

        Ok(FrameResult {
            data_uri,
            raw_pixels_b64,
            png_byte_length: byte_length,
            frame_time_ms: frame_elapsed,
            render_time_ms: render_elapsed,
            readback_time_ms: readback_elapsed,
            encode_time_ms: encode_elapsed,
            within_budget,
            frame_number: self.frame_number,
            width: self.config.width,
            height: self.config.height,
        })
    }

    /// Render a single frame with no mouse input (convenience).
    pub fn render_frame_simple(&mut self) -> Result<FrameResult, PreviewError> {
        self.render_frame(0.5, 0.5)
    }

    /// Resize the render target. Recreates the offscreen texture and staging buffer.
    pub fn resize(&mut self, width: u32, height: u32) -> Result<(), PreviewError> {
        if width == 0 || height == 0 || width > 4096 || height > 4096 {
            return Err(PreviewError::InvalidResolution { width, height });
        }

        self.config.width = width;
        self.config.height = height;

        // Recreate texture
        self.render_texture = self.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Shader Preview Render Target"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8UnormSrgb,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        self.render_texture_view = self
            .render_texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        // Recalculate buffer sizes
        let bytes_per_pixel = 4u32;
        self.unpadded_bytes_per_row = width * bytes_per_pixel;
        let align = wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
        self.padded_bytes_per_row =
            (self.unpadded_bytes_per_row + align - 1) / align * align;
        let buffer_size = (self.padded_bytes_per_row * height) as u64;

        self.staging_buffer = self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Shader Preview Staging Buffer"),
            size: buffer_size,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        Ok(())
    }

    /// Get current frame number.
    pub fn frame_number(&self) -> u64 {
        self.frame_number
    }

    /// Render N frames and collect timing statistics.
    /// Useful for benchmarking and performance validation.
    pub fn benchmark(&mut self, frame_count: u32) -> Result<BenchmarkResult, PreviewError> {
        let mut frame_times = Vec::with_capacity(frame_count as usize);
        let mut render_times = Vec::with_capacity(frame_count as usize);
        let mut readback_times = Vec::with_capacity(frame_count as usize);
        let mut encode_times = Vec::with_capacity(frame_count as usize);
        let mut frames_in_budget = 0u32;

        let benchmark_start = Instant::now();

        for i in 0..frame_count {
            let mouse_x = (i as f32 / frame_count as f32).sin() * 0.5 + 0.5;
            let mouse_y = (i as f32 / frame_count as f32).cos() * 0.5 + 0.5;

            let result = self.render_frame(mouse_x, mouse_y)?;

            frame_times.push(result.frame_time_ms);
            render_times.push(result.render_time_ms);
            readback_times.push(result.readback_time_ms);
            encode_times.push(result.encode_time_ms);

            if result.within_budget {
                frames_in_budget += 1;
            }
        }

        let total_time_ms = benchmark_start.elapsed().as_secs_f64() * 1000.0;

        Ok(BenchmarkResult {
            frame_count,
            total_time_ms,
            avg_frame_ms: frame_times.iter().sum::<f64>() / frame_count as f64,
            min_frame_ms: frame_times.iter().cloned().fold(f64::INFINITY, f64::min),
            max_frame_ms: frame_times.iter().cloned().fold(0.0f64, f64::max),
            p50_frame_ms: percentile(&mut frame_times, 50.0),
            p95_frame_ms: percentile(&mut frame_times, 95.0),
            p99_frame_ms: percentile(&mut frame_times, 99.0),
            avg_render_ms: render_times.iter().sum::<f64>() / frame_count as f64,
            avg_readback_ms: readback_times.iter().sum::<f64>() / frame_count as f64,
            avg_encode_ms: encode_times.iter().sum::<f64>() / frame_count as f64,
            frames_in_budget,
            budget_hit_rate: frames_in_budget as f64 / frame_count as f64,
            effective_fps: frame_count as f64 / (total_time_ms / 1000.0),
            target_fps: self.config.target_fps,
            resolution: (self.config.width, self.config.height),
        })
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Benchmark Result
// ═══════════════════════════════════════════════════════════════════════════════

/// Aggregated benchmark statistics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkResult {
    pub frame_count: u32,
    pub total_time_ms: f64,
    pub avg_frame_ms: f64,
    pub min_frame_ms: f64,
    pub max_frame_ms: f64,
    pub p50_frame_ms: f64,
    pub p95_frame_ms: f64,
    pub p99_frame_ms: f64,
    pub avg_render_ms: f64,
    pub avg_readback_ms: f64,
    pub avg_encode_ms: f64,
    pub frames_in_budget: u32,
    pub budget_hit_rate: f64,
    pub effective_fps: f64,
    pub target_fps: u32,
    pub resolution: (u32, u32),
}

impl std::fmt::Display for BenchmarkResult {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(f, "=== Shader Preview Benchmark ===")?;
        writeln!(
            f,
            "Resolution: {}x{} @ {} fps target",
            self.resolution.0, self.resolution.1, self.target_fps
        )?;
        writeln!(
            f,
            "Frames: {} in {:.1}ms ({:.1} effective fps)",
            self.frame_count, self.total_time_ms, self.effective_fps
        )?;
        writeln!(f, "--- Frame Time ---")?;
        writeln!(
            f,
            "  avg={:.2}ms  min={:.2}ms  max={:.2}ms",
            self.avg_frame_ms, self.min_frame_ms, self.max_frame_ms
        )?;
        writeln!(
            f,
            "  p50={:.2}ms  p95={:.2}ms  p99={:.2}ms",
            self.p50_frame_ms, self.p95_frame_ms, self.p99_frame_ms
        )?;
        writeln!(f, "--- Breakdown ---")?;
        writeln!(
            f,
            "  render={:.2}ms  readback={:.2}ms  encode={:.2}ms",
            self.avg_render_ms, self.avg_readback_ms, self.avg_encode_ms
        )?;
        writeln!(
            f,
            "Budget: {}/{} frames ({:.1}%)",
            self.frames_in_budget,
            self.frame_count,
            self.budget_hit_rate * 100.0
        )?;
        writeln!(
            f,
            "VERDICT: {}",
            if self.budget_hit_rate >= 0.95 {
                "PASS - Meets 720p@30fps target"
            } else {
                "FAIL - Below 720p@30fps target"
            }
        )
    }
}

/// Compute percentile from a mutable slice (sorts in place).
fn percentile(data: &mut Vec<f64>, pct: f64) -> f64 {
    if data.is_empty() {
        return 0.0;
    }
    data.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = ((pct / 100.0) * (data.len() - 1) as f64).round() as usize;
    data[idx.min(data.len() - 1)]
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_config_defaults() {
        let config = RenderConfig::default();
        assert_eq!(config.width, 1280);
        assert_eq!(config.height, 720);
        assert_eq!(config.target_fps, 30);
        assert!((config.frame_budget_ms() - 33.33).abs() < 0.1);
    }

    #[test]
    fn test_invalid_resolution() {
        let config = RenderConfig {
            width: 0,
            height: 720,
            ..Default::default()
        };
        let result = ShaderPreviewPipeline::new(config);
        assert!(result.is_err());

        let config = RenderConfig {
            width: 5000,
            height: 720,
            ..Default::default()
        };
        let result = ShaderPreviewPipeline::new(config);
        assert!(result.is_err());
    }

    #[test]
    fn test_percentile() {
        let mut data = vec![1.0, 2.0, 3.0, 4.0, 5.0];
        assert_eq!(percentile(&mut data, 50.0), 3.0);
        assert_eq!(percentile(&mut data, 0.0), 1.0);
        assert_eq!(percentile(&mut data, 100.0), 5.0);
    }

    // NOTE: GPU-dependent tests require a real GPU adapter.
    // They are gated behind #[ignore] and run with:
    //   cargo test -- --ignored
    #[test]
    #[ignore = "Requires GPU adapter"]
    fn test_render_single_frame() {
        let config = RenderConfig {
            width: 256,
            height: 256,
            encode_base64: true,
            ..Default::default()
        };
        let mut pipeline = ShaderPreviewPipeline::new(config).expect("Pipeline init failed");
        let result = pipeline.render_frame_simple().expect("Render failed");
        assert!(result.data_uri.is_some());
        assert!(result.data_uri.unwrap().starts_with("data:image/png;base64,"));
        assert!(result.frame_time_ms > 0.0);
    }

    #[test]
    #[ignore = "Requires GPU adapter"]
    fn test_benchmark_720p_30fps() {
        let config = RenderConfig::default();
        let mut pipeline = ShaderPreviewPipeline::new(config).expect("Pipeline init failed");
        let bench = pipeline.benchmark(90).expect("Benchmark failed"); // 3 seconds worth
        println!("{}", bench);
        assert!(
            bench.budget_hit_rate >= 0.90,
            "Budget hit rate {:.1}% below 90% threshold",
            bench.budget_hit_rate * 100.0
        );
    }
}
