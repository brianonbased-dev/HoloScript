//! Tauri IPC command handlers.
//!
//! Each function maps 1:1 to a `tauri::command` invoked from the frontend
//! via `window.__TAURI__.invoke(cmd, args)`. The TypeScript bridge in
//! `tauri-bridge.ts` and `useShaderPreview.ts` call these commands.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::State;

use crate::gpu;
use crate::shader::{BenchmarkResult, FrameResult, PipelineTimings, ShaderPreviewPipeline};
use crate::state::AppState;

// ═══════════════════════════════════════════════════════════════════
// GPU & App Info
// ═══════════════════════════════════════════════════════════════════

/// Get native GPU adapter info via wgpu.
/// Returns `TauriGpuInfo` matching the TypeScript interface.
#[tauri::command]
pub fn get_gpu_info() -> gpu::GpuInfo {
    gpu::detect_gpu()
}

/// Get the app version from Cargo.toml.
#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// ═══════════════════════════════════════════════════════════════════
// Shader Preview Pipeline
// ═══════════════════════════════════════════════════════════════════

/// Initialize the wgpu shader preview pipeline.
///
/// Creates a headless render surface at the given dimensions.
/// Returns `PipelineTimings` as JSON string (matching TypeScript interface).
#[tauri::command]
pub fn shader_preview_init(
    state: State<'_, AppState>,
    width: u32,
    height: u32,
    shader_code: Option<String>,
) -> Result<String, String> {
    let start = std::time::Instant::now();

    let pipeline = ShaderPreviewPipeline::new(width, height);
    let init_device_ms = start.elapsed().as_secs_f64() * 1000.0;

    let create_pipeline_start = std::time::Instant::now();
    // TODO: Create wgpu device + render pipeline from shader_code
    // This is the scaffold; full wgpu init happens when wiring the renderer.
    let _shader_source = shader_code; // Used when wgpu pipeline is wired
    let create_pipeline_ms = create_pipeline_start.elapsed().as_secs_f64() * 1000.0;

    let total_init_ms = start.elapsed().as_secs_f64() * 1000.0;

    let timings = PipelineTimings {
        init_device_ms,
        create_pipeline_ms,
        total_init_ms,
    };

    // Store the pipeline in shared state
    *state.shader_preview.lock().map_err(|e| e.to_string())? = Some(pipeline);

    serde_json::to_string(&timings).map_err(|e| e.to_string())
}

/// Render a single frame and return as base64 PNG data URI.
///
/// Called in a requestAnimationFrame loop from the frontend.
/// Returns `FrameResult` as JSON string.
#[tauri::command]
pub fn shader_preview_frame(
    state: State<'_, AppState>,
    mouse_x: f64,
    mouse_y: f64,
) -> Result<String, String> {
    let mut guard = state.shader_preview.lock().map_err(|e| e.to_string())?;

    let pipeline = match guard.as_mut() {
        Some(p) => p,
        None => return Err("Shader preview not initialized".to_string()),
    };

    pipeline.frame_number += 1;
    let _ = (mouse_x, mouse_y); // Used for interactive shaders

    // TODO: Actual wgpu render + PNG readback + base64 encode
    // For now, return a placeholder frame result indicating the pipeline is alive.
    let result = FrameResult {
        data_uri: None, // No rendered frame yet — scaffold returns null
        png_byte_length: 0,
        frame_time_ms: 0.0,
        render_time_ms: 0.0,
        readback_time_ms: 0.0,
        encode_time_ms: 0.0,
        within_budget: true,
        frame_number: pipeline.frame_number,
        width: pipeline.width,
        height: pipeline.height,
    };

    serde_json::to_string(&result).map_err(|e| e.to_string())
}

/// Hot-reload the shader source without destroying the pipeline.
///
/// Returns updated `PipelineTimings` as JSON string.
#[tauri::command]
pub fn shader_preview_update(
    state: State<'_, AppState>,
    shader_code: String,
) -> Result<String, String> {
    let guard = state.shader_preview.lock().map_err(|e| e.to_string())?;

    let pipeline = match guard.as_ref() {
        Some(p) => p,
        None => return Err("Shader preview not initialized".to_string()),
    };

    // TODO: Recreate the render pipeline with the new WGSL source
    let _ = shader_code; // Used when wgpu pipeline is wired

    let timings = PipelineTimings {
        init_device_ms: 0.0,
        create_pipeline_ms: 0.0,
        total_init_ms: 0.0,
    };

    serde_json::to_string(&timings).map_err(|e| e.to_string())
}

/// Resize the render target.
#[tauri::command]
pub fn shader_preview_resize(
    state: State<'_, AppState>,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let mut guard = state.shader_preview.lock().map_err(|e| e.to_string())?;

    let pipeline = match guard.as_mut() {
        Some(p) => p,
        None => return Err("Shader preview not initialized".to_string()),
    };

    // TODO: Recreate render target texture at new dimensions
    pipeline.width = width;
    pipeline.height = height;

    Ok(())
}

/// Destroy the shader preview pipeline and free GPU resources.
#[tauri::command]
pub fn shader_preview_destroy(state: State<'_, AppState>) -> Result<(), String> {
    let mut guard = state.shader_preview.lock().map_err(|e| e.to_string())?;
    // Drop the pipeline — wgpu resources are freed when the struct drops
    *guard = None;
    Ok(())
}

/// Run a benchmark: render N frames and return timing statistics.
///
/// Returns `BenchmarkResult` as JSON string.
#[tauri::command]
pub fn shader_preview_benchmark(
    state: State<'_, AppState>,
    frame_count: u32,
) -> Result<String, String> {
    let guard = state.shader_preview.lock().map_err(|e| e.to_string())?;

    let pipeline = match guard.as_ref() {
        Some(p) => p,
        None => return Err("Shader preview not initialized".to_string()),
    };

    // TODO: Actual benchmark loop rendering frame_count frames
    // For now return a scaffold result
    let result = BenchmarkResult {
        frame_count,
        total_time_ms: 0.0,
        avg_frame_ms: 0.0,
        min_frame_ms: 0.0,
        max_frame_ms: 0.0,
        p50_frame_ms: 0.0,
        p95_frame_ms: 0.0,
        p99_frame_ms: 0.0,
        avg_render_ms: 0.0,
        avg_readback_ms: 0.0,
        avg_encode_ms: 0.0,
        frames_in_budget: 0,
        budget_hit_rate: 0.0,
        effective_fps: 0.0,
        target_fps: 30,
        resolution: [pipeline.width, pipeline.height],
    };

    serde_json::to_string(&result).map_err(|e| e.to_string())
}

// ═══════════════════════════════════════════════════════════════════
// Native File Operations
// ═══════════════════════════════════════════════════════════════════

/// Project metadata for listing, matching `TauriProjectMeta` in TypeScript.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMeta {
    pub name: String,
    pub version: String,
    pub created: String,
    pub modified: String,
    pub scene_count: u32,
}

/// Save a HoloScript project to a native file path.
///
/// Returns a success message or error description.
#[tauri::command]
pub fn save_project(path: String, content: String) -> Result<String, String> {
    let file_path = Path::new(&path);

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    fs::write(file_path, &content).map_err(|e| format!("Failed to write file: {}", e))?;

    Ok("Saved successfully".to_string())
}

/// Load a HoloScript project from a native file path.
///
/// Returns the file content as a string.
#[tauri::command]
pub fn load_project(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// List HoloScript projects in a directory.
///
/// Returns project metadata for each `.holo` or `.hsplus` file found.
#[tauri::command]
pub fn list_projects(directory: String) -> Result<String, String> {
    let dir = Path::new(&directory);

    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", directory));
    }

    let mut projects: Vec<ProjectMeta> = Vec::new();

    let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        // Only list .holo and .hsplus files
        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext != "holo" && ext != "hsplus" {
            continue;
        }

        let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata: {}", e))?;

        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let modified = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs().to_string())
            .unwrap_or_default();

        let created = metadata
            .created()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs().to_string())
            .unwrap_or_default();

        // Parse version from file content (look for version header)
        // For now, default to "1.0.0" — full version parsing happens when we
        // read the file header
        let version = "1.0.0".to_string();

        // Scene count requires parsing the file — stub to 0 for directory listing
        let scene_count = 0u32;

        projects.push(ProjectMeta {
            name,
            version,
            created,
            modified,
            scene_count,
        });
    }

    // Sort by modification time (most recent first)
    projects.sort_by(|a, b| b.modified.cmp(&a.modified));

    serde_json::to_string(&projects).map_err(|e| e.to_string())
}