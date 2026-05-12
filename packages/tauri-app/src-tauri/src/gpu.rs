//! GPU adapter detection via wgpu.
//!
//! Probes available GPU adapters and returns structured info matching
//! the `TauriGpuInfo` TypeScript interface in `tauri-bridge.ts`.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub vendor: String,
    pub backend: String,
    pub supports_webgpu: bool,
}

/// Detect GPU adapter info using wgpu.
///
/// Returns the first suitable adapter found, or a fallback indicating no GPU.
pub fn detect_gpu() -> GpuInfo {
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: wgpu::Backends::all(),
        ..Default::default()
    });

    // Try to find the best adapter
    if let Some(adapter) = instance.enumerate_adapters(wgpu::Backends::all()).first() {
        let info = adapter.get_info();
        GpuInfo {
            name: info.name.clone(),
            vendor: format!("{:#06x}", info.vendor),
            backend: format!("{:?}", info.backend),
            supports_webgpu: true, // If wgpu found an adapter, WebGPU is available
        }
    } else {
        // No GPU adapter found — wgpu can enumerate but nothing suitable
        GpuInfo {
            name: "No GPU adapter found".to_string(),
            vendor: "unknown".to_string(),
            backend: "none".to_string(),
            supports_webgpu: false,
        }
    }
}
