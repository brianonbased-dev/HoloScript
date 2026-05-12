//! HoloScript Studio — Tauri 2.0 native shell
//!
//! IPC commands exposed to the web frontend:
//!   - get_gpu_info          → TauriGpuInfo
//!   - get_app_version       → String
//!   - shader_preview_init   → String (JSON PipelineTimings)
//!   - shader_preview_frame  → String (JSON FrameResult)
//!   - shader_preview_update → String (JSON PipelineTimings)
//!   - shader_preview_resize → ()
//!   - shader_preview_destroy→ ()
//!   - shader_preview_benchmark → String (JSON BenchmarkResult)
//!   - save_project          → String
//!   - load_project          → String
//!   - list_projects         → String (JSON Vec<TauriProjectMeta>)
//!
//! Architecture:
//!   Browser path:  fetch('/wasm/holoscript.js') → Web Worker → WASM init
//!   Tauri path:    tauri://localhost/wasm/... → Web Worker → WASM init
//!   GPU path:      wgpu headless render → PNG readback → base64 data URI → <img>
//!
//! @see ../../../../studio/src/lib/tauri-bridge.ts (TypeScript bridge)
//! @see ../../../../studio/src/components/shader-editor/native-preview/ (React hook)

mod commands;
mod gpu;
mod shader;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_gpu_info,
            commands::get_app_version,
            commands::shader_preview_init,
            commands::shader_preview_frame,
            commands::shader_preview_update,
            commands::shader_preview_resize,
            commands::shader_preview_destroy,
            commands::shader_preview_benchmark,
            commands::save_project,
            commands::load_project,
            commands::list_projects,
        ])
        .run(tauri::generate_context!())
        .expect("error while running HoloScript Studio");
}
