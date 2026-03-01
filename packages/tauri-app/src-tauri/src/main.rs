// HoloScript Studio Desktop — Tauri Entry Point
//
// Wraps the existing Next.js Studio (port 3100) in a native desktop window.
// Provides Rust commands for:
//   - Project file I/O (save/load .holo files)
//   - GPU device info (for renderer selection)
//   - Native file dialog integration
//   - Shader preview via wgpu render-to-texture pipeline

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

use shader_preview_wgpu::{FrameResult, RenderConfig, ShaderPreviewPipeline};

// ═══════════════════════════════════════════════════════════════════
// Data Types
// ═══════════════════════════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectMeta {
    pub name: String,
    pub version: String,
    pub created: String,
    pub modified: String,
    pub scene_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GpuInfo {
    pub name: String,
    pub vendor: String,
    pub backend: String,
    pub supports_webgpu: bool,
}

// ═══════════════════════════════════════════════════════════════════
// Shader Preview State (managed by Tauri)
// ═══════════════════════════════════════════════════════════════════

/// Tauri-managed state holding the shader preview pipeline.
/// Wrapped in Mutex for thread-safe access from IPC handlers.
struct ShaderPreviewState {
    pipeline: Mutex<Option<ShaderPreviewPipeline>>,
}

// ═══════════════════════════════════════════════════════════════════
// Tauri Commands — File I/O
// ═══════════════════════════════════════════════════════════════════

/// Save a HoloScript project file (.holo) to disk.
#[tauri::command]
fn save_project(path: String, content: String) -> Result<String, String> {
    let path = PathBuf::from(&path);
    std::fs::write(&path, &content).map_err(|e| format!("Failed to save: {}", e))?;
    Ok(format!("Saved {} bytes to {}", content.len(), path.display()))
}

/// Load a HoloScript project file (.holo) from disk.
#[tauri::command]
fn load_project(path: String) -> Result<String, String> {
    let path = PathBuf::from(&path);
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to load: {}", e))
}

/// List recent projects from the user's project directory.
#[tauri::command]
fn list_projects(directory: String) -> Result<Vec<ProjectMeta>, String> {
    let dir = PathBuf::from(&directory);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut projects = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("holo") {
            let meta = entry.metadata().map_err(|e| e.to_string())?;
            let name = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("untitled")
                .to_string();

            projects.push(ProjectMeta {
                name,
                version: "1.0.0".to_string(),
                created: format!("{:?}", meta.created().unwrap_or(std::time::SystemTime::UNIX_EPOCH)),
                modified: format!("{:?}", meta.modified().unwrap_or(std::time::SystemTime::UNIX_EPOCH)),
                scene_count: 0,
            });
        }
    }

    Ok(projects)
}

/// Get GPU device information for renderer selection.
#[tauri::command]
fn get_gpu_info() -> GpuInfo {
    GpuInfo {
        name: "System GPU".to_string(),
        vendor: "Unknown".to_string(),
        backend: if cfg!(target_os = "windows") {
            "DirectX 12 / Vulkan".to_string()
        } else if cfg!(target_os = "macos") {
            "Metal".to_string()
        } else {
            "Vulkan".to_string()
        },
        supports_webgpu: true,
    }
}

/// Get the app version.
#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// ═══════════════════════════════════════════════════════════════════
// Tauri Commands — Shader Preview (wgpu)
// ═══════════════════════════════════════════════════════════════════

/// Initialize the wgpu shader preview pipeline.
///
/// Called once from the frontend when the shader editor opens.
/// Optionally accepts width/height (defaults to 1280x720).
#[tauri::command]
fn shader_preview_init(
    state: tauri::State<'_, ShaderPreviewState>,
    width: Option<u32>,
    height: Option<u32>,
    shader_code: Option<String>,
) -> Result<String, String> {
    let config = RenderConfig {
        width: width.unwrap_or(1280),
        height: height.unwrap_or(720),
        target_fps: 30,
        encode_base64: true,
        soft_budget: true,
    };

    let pipeline = match &shader_code {
        Some(code) => ShaderPreviewPipeline::with_shader(config, code),
        None => ShaderPreviewPipeline::new(config),
    };

    match pipeline {
        Ok(p) => {
            let timings = p.init_timings().clone();
            let mut lock = state.pipeline.lock().map_err(|e| e.to_string())?;
            *lock = Some(p);
            Ok(serde_json::to_string(&timings).unwrap_or_default())
        }
        Err(e) => Err(format!("Shader preview init failed: {}", e)),
    }
}

/// Render a single shader preview frame.
///
/// Returns a FrameResult JSON with base64 data URI and timing metrics.
/// Called at up to 30fps from the frontend requestAnimationFrame loop.
#[tauri::command]
fn shader_preview_frame(
    state: tauri::State<'_, ShaderPreviewState>,
    mouse_x: Option<f32>,
    mouse_y: Option<f32>,
) -> Result<FrameResult, String> {
    let mut lock = state.pipeline.lock().map_err(|e| e.to_string())?;
    let pipeline = lock
        .as_mut()
        .ok_or_else(|| "Shader preview not initialized — call shader_preview_init first".to_string())?;

    pipeline
        .render_frame(mouse_x.unwrap_or(0.5), mouse_y.unwrap_or(0.5))
        .map_err(|e| format!("Render failed: {}", e))
}

/// Update the shader source code (hot reload).
///
/// Recreates the render pipeline with new WGSL fragment shader code.
/// The uniform interface remains the same.
#[tauri::command]
fn shader_preview_update(
    state: tauri::State<'_, ShaderPreviewState>,
    shader_code: String,
) -> Result<String, String> {
    let mut lock = state.pipeline.lock().map_err(|e| e.to_string())?;
    let old = lock.take();

    // Preserve config from old pipeline, or use defaults
    let config = old
        .as_ref()
        .map(|p| p.config().clone())
        .unwrap_or_default();

    match ShaderPreviewPipeline::with_shader(config, &shader_code) {
        Ok(p) => {
            let timings = p.init_timings().clone();
            *lock = Some(p);
            Ok(serde_json::to_string(&timings).unwrap_or_default())
        }
        Err(e) => {
            // Restore old pipeline on failure
            *lock = old;
            Err(format!("Shader compilation failed: {}", e))
        }
    }
}

/// Resize the shader preview viewport.
#[tauri::command]
fn shader_preview_resize(
    state: tauri::State<'_, ShaderPreviewState>,
    width: u32,
    height: u32,
) -> Result<String, String> {
    let mut lock = state.pipeline.lock().map_err(|e| e.to_string())?;
    let pipeline = lock
        .as_mut()
        .ok_or_else(|| "Shader preview not initialized".to_string())?;

    pipeline
        .resize(width, height)
        .map_err(|e| format!("Resize failed: {}", e))?;

    Ok(format!("Resized to {}x{}", width, height))
}

/// Run the built-in benchmark and return results.
///
/// Renders `frame_count` frames (default 90 = 3 seconds at 30fps)
/// and returns detailed timing statistics.
#[tauri::command]
fn shader_preview_benchmark(
    state: tauri::State<'_, ShaderPreviewState>,
    frame_count: Option<u32>,
) -> Result<String, String> {
    let mut lock = state.pipeline.lock().map_err(|e| e.to_string())?;
    let pipeline = lock
        .as_mut()
        .ok_or_else(|| "Shader preview not initialized".to_string())?;

    let result = pipeline
        .benchmark(frame_count.unwrap_or(90))
        .map_err(|e| format!("Benchmark failed: {}", e))?;

    serde_json::to_string_pretty(&result).map_err(|e| e.to_string())
}

/// Destroy the shader preview pipeline and free GPU resources.
#[tauri::command]
fn shader_preview_destroy(
    state: tauri::State<'_, ShaderPreviewState>,
) -> Result<String, String> {
    let mut lock = state.pipeline.lock().map_err(|e| e.to_string())?;
    *lock = None;
    Ok("Shader preview pipeline destroyed".to_string())
}

// ═══════════════════════════════════════════════════════════════════
// Main — Tauri bootstrap
// ═══════════════════════════════════════════════════════════════════

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(ShaderPreviewState {
            pipeline: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            // File I/O
            save_project,
            load_project,
            list_projects,
            get_gpu_info,
            get_app_version,
            // Shader Preview (wgpu)
            shader_preview_init,
            shader_preview_frame,
            shader_preview_update,
            shader_preview_resize,
            shader_preview_benchmark,
            shader_preview_destroy,
        ])
        .run(tauri::generate_context!())
        .expect("error while running HoloScript Studio Desktop");
}
