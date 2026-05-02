//! Headless wgpu shader preview pipeline.
//!
//! Manages a wgpu device + render pipeline for live shader preview.
//! The TypeScript side calls `shader_preview_init` to create the pipeline,
//! then `shader_preview_frame` in a requestAnimationFrame loop for live preview,
//! and `shader_preview_destroy` on unmount.
//!
//! This module provides a scaffold — full wgpu rendering is wired step-by-step
//! as shader WGSL sources are provided by the frontend.

use serde::Serialize;
use std::time::Instant;

/// Pipeline initialization timings, matching `PipelineTimings` in TypeScript.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PipelineTimings {
    pub init_device_ms: f64,
    pub create_pipeline_ms: f64,
    pub total_init_ms: f64,
}

/// Frame render result, matching `FrameResult` in TypeScript.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FrameResult {
    pub data_uri: Option<String>,
    pub png_byte_length: usize,
    pub frame_time_ms: f64,
    pub render_time_ms: f64,
    pub readback_time_ms: f64,
    pub encode_time_ms: f64,
    pub within_budget: bool,
    pub frame_number: u32,
    pub width: u32,
    pub height: u32,
}

/// Benchmark result, matching `BenchmarkResult` in TypeScript.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
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
    pub resolution: [u32; 2],
}

/// Shader preview pipeline state.
///
/// Holds the wgpu device, queue, and render resources.
/// Initialized by `shader_preview_init`, destroyed by `shader_preview_destroy`.
pub struct ShaderPreviewPipeline {
    pub width: u32,
    pub height: u32,
    pub frame_number: u32,
    pub initialized_at: Instant,
    // wgpu resources are added incrementally as the pipeline matures:
    // - device: wgpu::Device
    // - queue: wgpu::Queue
    // - render_pipeline: wgpu::RenderPipeline
    // - texture: wgpu::Texture (render target)
    // - shader_module: wgpu::ShaderModule (WGSL source)
    //
    // These will be Option<T> fields added as each IPC command is implemented.
    // For now, the pipeline tracks dimensions and frame count.
}

impl ShaderPreviewPipeline {
    pub fn new(width: u32, height: u32) -> Self {
        Self {
            width,
            height,
            frame_number: 0,
            initialized_at: Instant::now(),
        }
    }
}