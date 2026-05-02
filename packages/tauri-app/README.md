# @holoscript/tauri-app

Tauri 2.0 desktop shell for HoloScript Studio.

## What This Provides

- **Native GPU access** via wgpu — shader preview without WebGL overhead
- **Native file system** — open/save HoloScript projects directly on disk
- **Auto-update** — built-in updater via Tauri plugin
- **Offline mode** — Studio runs without network (WASM compiler bundled)
- **Lower resource usage** — no Electron overhead, ~10MB base vs ~200MB Electron

## Architecture

```
┌──────────────────────────────┐
│   HoloScript Studio (React)  │
├──────────────────────────────┤
│   Feature Gate Layer          │
│   ├── isTauri() detection     │
│   ├── detectTauriFeatures()   │
│   └── initBridgeForPlatform() │
├──────────────────────────────┤
│   Tauri Webview (Chromium)    │
│   ├── Custom protocol URLs    │
│   ├── __TAURI__ global        │
│   └── IPC invoke bridge       │
├──────────────────────────────┤
│   Rust Backend (Tauri)        │
│   ├── wgpu GPU adapter        │
│   ├── Native file I/O         │
│   └── Shader preview pipeline │
└──────────────────────────────┘
```

## Prerequisites

- [Rust](https://rustup.rs/) (1.77+)
- Node.js 20+
- pnpm

## Development

```bash
# From the monorepo root:
pnpm --filter @holoscript/tauri-app dev

# Or from this directory:
pnpm dev
```

This starts the Studio Next.js dev server on port 3101 and opens the Tauri window.

## Building

```bash
# Production build:
pnpm --filter @holoscript/tauri-app build

# Debug build (faster, larger binary):
pnpm --filter @holoscript/tauri-app build:debug
```

## IPC Commands

| Command | Args | Returns | Description |
|---------|------|---------|-------------|
| `get_gpu_info` | - | `TauriGpuInfo` | GPU adapter info from wgpu |
| `get_app_version` | - | `string` | App version from Cargo.toml |
| `shader_preview_init` | `width`, `height`, `shader_code?` | `PipelineTimings` | Initialize wgpu shader preview |
| `shader_preview_frame` | `mouse_x`, `mouse_y` | `FrameResult` | Render one frame, return base64 PNG |
| `shader_preview_update` | `shader_code` | `PipelineTimings` | Hot-reload shader source |
| `shader_preview_resize` | `width`, `height` | - | Resize render target |
| `shader_preview_destroy` | - | - | Free GPU resources |
| `shader_preview_benchmark` | `frame_count` | `BenchmarkResult` | Benchmark rendering |
| `save_project` | `path`, `content` | `string` | Save file to disk |
| `load_project` | `path` | `string` | Load file from disk |
| `list_projects` | `directory` | `ProjectMeta[]` | List .holo/.hsplus files |

## See Also

- [Tauri Desktop Integration Guide](../../docs/guides/tauri-desktop.md)
- [tauri-bridge.ts](../studio/src/lib/tauri-bridge.ts) — TypeScript bridge
- [useShaderPreview.ts](../studio/src/components/shader-editor/native-preview/useShaderPreview.ts) — React hook
- [platform-detect.ts](../studio/src/lib/platform-detect.ts) — Runtime feature detection