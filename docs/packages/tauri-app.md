# Tauri App (Studio Desktop)

**Native desktop application shell for HoloScript Studio, built with Tauri 2.0.**

## Overview

`@holoscript/tauri-app` wraps the Studio web frontend in a native desktop container with GPU acceleration, native file system access, and offline capabilities. The TypeScript bridge layer (`tauri-bridge.ts`) already exists in the Studio package — this package provides the Rust backend that the bridge calls via IPC.

## Architecture

```holoscript
Studio (React/Next.js)
  ├── tauri-bridge.ts         ← Feature detection & IPC invoke
  ├── platform-detect.ts      ← Runtime capability probing
  ├── useShaderPreview.ts     ← wgpu shader preview hook
  └── tauri-shim.d.ts         ← Ambient types for @tauri-apps/api
        │
        │  IPC (invoke)
        ▼
Tauri Rust Backend
  ├── commands.rs              ← IPC command handlers
  ├── gpu.rs                  ← wgpu adapter detection
  ├── shader.rs               ← Headless shader preview pipeline
  └── state.rs                ← Shared app state (Mutex<ShaderPipeline>)
```

## Installation

```bash
# From monorepo root:
pnpm install
cd packages/tauri-app
pnpm tauri dev
```

## Use When

- You need Studio as a native desktop application.
- You want GPU-accelerated shader preview via wgpu (not WebGL).
- You need native file dialogs and direct filesystem access.
- You want offline mode (WASM compiler bundled in Tauri resources).
- You need auto-update distribution for desktop users.

## Key Capabilities

| Feature | IPC Command | Description |
| ------- | ----------- | ----------- |
| GPU Info | `get_gpu_info` | Native wgpu adapter detection |
| App Version | `get_app_version` | Version from Cargo.toml |
| Shader Preview | `shader_preview_init/frame/update/resize/destroy/benchmark` | Headless wgpu render pipeline |
| Save Project | `save_project` | Native file save to disk |
| Load Project | `load_project` | Native file load from disk |
| List Projects | `list_projects` | List .holo/.hsplus files in directory |

## Development

```bash
pnpm dev              # Start Tauri dev (launches Studio dev server + native window)
pnpm build            # Production build (MSI/AppImage/DMG)
pnpm build:debug      # Debug build (faster, larger)
```

## Current Status

**Scaffold** — The Rust backend implements all IPC command signatures with correct types matching the TypeScript interfaces. The wgpu shader preview pipeline is scaffolded (init/destroy lifecycle works; actual rendering TODO). File operations are fully functional.

## See Also

- [Tauri Desktop Integration Guide](../guides/tauri-desktop.md)
- [Studio](./studio.md)
- [Studio Plugin SDK](./studio-plugin-sdk.md)
- [Studio Bridge](./studio-bridge.md)
