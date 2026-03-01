//! Error types for the shader preview pipeline.

use thiserror::Error;

#[derive(Error, Debug)]
pub enum PreviewError {
    #[error("GPU adapter not found: no suitable GPU backend available")]
    NoAdapter,

    #[error("GPU device request failed: {0}")]
    DeviceRequest(#[from] wgpu::RequestDeviceError),

    #[error("Shader compilation failed: {0}")]
    ShaderCompilation(String),

    #[error("Texture readback failed: buffer mapping error")]
    BufferMapping,

    #[error("PNG encoding failed: {0}")]
    PngEncode(String),

    #[error("Pipeline not initialized — call init() first")]
    NotInitialized,

    #[error("Invalid resolution: {width}x{height} (max 4096x4096)")]
    InvalidResolution { width: u32, height: u32 },

    #[error("Frame budget exceeded: {elapsed_ms:.1}ms > {budget_ms:.1}ms")]
    FrameBudgetExceeded { elapsed_ms: f64, budget_ms: f64 },
}
