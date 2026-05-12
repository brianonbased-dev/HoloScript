//! Shared application state for Tauri IPC handlers.
//!
//! Holds the shader preview pipeline (lazy-initialized on first `shader_preview_init`).
//! All state is behind `Mutex` so multiple IPC calls don't race.

use crate::shader::ShaderPreviewPipeline;
use std::sync::Mutex;

pub struct AppState {
    pub shader_preview: Mutex<Option<ShaderPreviewPipeline>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            shader_preview: Mutex::new(None),
        }
    }
}
