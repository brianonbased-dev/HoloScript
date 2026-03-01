//! # shader-preview-wgpu
//!
//! Offscreen wgpu render-to-texture pipeline for HoloScript shader preview.
//!
//! Renders user-provided WGSL fragment shaders to an offscreen texture,
//! reads back the pixel data, and encodes it as base64 PNG for transfer
//! to the Tauri frontend via IPC.
//!
//! ## Architecture
//!
//! ```text
//! WGSL Source -> wgpu Pipeline -> Offscreen Texture -> Buffer Readback -> PNG -> Base64
//!                                   (720p target)
//! ```
//!
//! ## Performance Target
//!
//! - Resolution: 1280x720 (720p)
//! - Frame rate: 30 fps (33.3ms per frame budget)
//! - Breakdown: ~2ms render + ~8ms readback + ~5ms encode = ~15ms (50% headroom)

pub mod pipeline;
pub mod encoder;
pub mod error;

pub use pipeline::{ShaderPreviewPipeline, RenderConfig, FrameResult, EncodeMode, BenchmarkResult};
pub use encoder::PngEncoder;
pub use error::PreviewError;
