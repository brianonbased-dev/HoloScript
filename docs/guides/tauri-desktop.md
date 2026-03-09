# Tauri Desktop Integration Guide

HoloScript Studio runs as a native desktop application via [Tauri 2.0](https://v2.tauri.app/), providing GPU-accelerated rendering, native file system access, and shader preview via wgpu. This guide documents the feature detection system that gates capabilities based on the runtime environment.

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

## Feature Detection

### Quick Detection (Synchronous)

Use `isTauri()` for fast synchronous checks in render paths:

```typescript
import { isTauri } from '@holoscript/studio/platform';

if (isTauri()) {
  // Running in Tauri desktop shell
  showNativeMenuBar();
} else {
  // Running in browser
  showWebMenuBar();
}
```

This checks for `window.__TAURI__`, which Tauri injects into the webview context.

### Full Feature Detection (Async)

Use `detectTauriFeatures()` to probe all native capabilities:

```typescript
import { detectTauriFeatures } from '@holoscript/studio/platform';

const features = await detectTauriFeatures();

console.log(features);
// {
//   isTauri: true,
//   gpuInfo: { name: 'NVIDIA GeForce RTX 4070', vendor: 'NVIDIA', backend: 'Vulkan', supports_webgpu: true },
//   appVersion: '0.1.0',
//   hasNativeShaderPreview: true,
//   hasNativeFileSystem: true,
//   wasmUrl: '/wasm/holoscript.js'
// }
```

In browser mode, this returns minimal defaults:

```typescript
// Browser result:
// {
//   isTauri: false,
//   gpuInfo: null,
//   appVersion: null,
//   hasNativeShaderPreview: false,
//   hasNativeFileSystem: false,
//   wasmUrl: '/wasm/holoscript.js'
// }
```

### Feature Gates Return Type

```typescript
interface TauriFeatureGates {
  isTauri: boolean;
  gpuInfo: TauriGpuInfo | null;
  appVersion: string | null;
  hasNativeShaderPreview: boolean;
  hasNativeFileSystem: boolean;
  wasmUrl: string;
}

interface TauriGpuInfo {
  name: string; // e.g. 'NVIDIA GeForce RTX 4070'
  vendor: string; // e.g. 'NVIDIA'
  backend: string; // e.g. 'Vulkan', 'Metal', 'DX12'
  supports_webgpu: boolean; // true if wgpu adapter supports WebGPU
}
```

## WASM URL Resolution

The WASM module URL is resolved differently based on runtime:

| Environment | URL                   | Source                   |
| ----------- | --------------------- | ------------------------ |
| Browser     | `/wasm/holoscript.js` | `public/wasm/` directory |
| Tauri       | `/wasm/holoscript.js` | Tauri resource bundle    |

Both environments use the same relative URL because Tauri 2.0 serves the frontend dist directory (which includes `public/wasm/`) at the root via its custom protocol.

```typescript
import { resolveWasmUrl } from '@holoscript/studio/platform';

const url = resolveWasmUrl();
// Always returns '/wasm/holoscript.js' in current implementation
// Future: may return tauri://localhost/wasm/... for resource bundles
```

## Compiler Bridge Integration

The `initBridgeForPlatform()` function configures the `CompilerBridge` with Tauri-aware settings:

```typescript
import { CompilerBridge, detectPlatform } from '@holoscript/studio/platform';
import { initBridgeForPlatform } from '@holoscript/studio/platform';

const bridge = new CompilerBridge();
const caps = await detectPlatform();
await initBridgeForPlatform(bridge, caps);

// In Tauri: always loads 'holoscript-runtime' world (desktop has more memory)
// In browser: uses platform-detect recommendation (may use smaller worlds)
```

### GPU-Enhanced Platform Capabilities

```typescript
import { detectPlatform, enhancePlatformWithTauri } from '@holoscript/studio/platform';

const caps = await detectPlatform();
const enhanced = await enhancePlatformWithTauri(caps);

// enhanced.hasWebGPU is now informed by native wgpu adapter
// enhanced.recommendedWorld is 'holoscript-runtime' for desktop
```

## Native File Operations

Tauri provides native file system access via IPC commands.

### Save Project

```typescript
import { saveProjectNative } from '@holoscript/studio/platform';

const result = await saveProjectNative('/home/user/projects/scene.holo', holoScriptSource);
if (result.success) {
  console.log(result.message); // 'Saved successfully'
} else {
  console.error(result.message); // Error description
}
```

### Load Project

```typescript
import { loadProjectNative } from '@holoscript/studio/platform';

const result = await loadProjectNative('/home/user/projects/scene.holo');
if (result.success) {
  editor.setValue(result.content!);
}
```

### List Projects

```typescript
import { listProjectsNative } from '@holoscript/studio/platform';

const projects = await listProjectsNative('/home/user/projects');
projects.forEach((p) => {
  console.log(`${p.name} v${p.version} (${p.scene_count} scenes)`);
});
```

**Browser Fallback:** All native file operations return graceful fallbacks when not in Tauri:

- `saveProjectNative` returns `{ success: false, message: 'Not in Tauri context' }`
- `loadProjectNative` returns `{ success: false, message: 'Not in Tauri context' }`
- `listProjectsNative` returns `[]`

## Conditional UI Patterns

### Showing Native-Only Features

```tsx
import { isTauri, detectTauriFeatures } from '@holoscript/studio/platform';

function ToolBar() {
  const [features, setFeatures] = useState<TauriFeatureGates | null>(null);

  useEffect(() => {
    detectTauriFeatures().then(setFeatures);
  }, []);

  return (
    <div>
      {/* Always available */}
      <button onClick={handleSave}>Save</button>

      {/* Tauri-only: native shader preview */}
      {features?.hasNativeShaderPreview && (
        <button onClick={handleShaderPreview}>GPU Preview</button>
      )}

      {/* Tauri-only: GPU info display */}
      {features?.gpuInfo && (
        <span>
          {features.gpuInfo.name} ({features.gpuInfo.backend})
        </span>
      )}
    </div>
  );
}
```

### Platform-Aware File Operations

```tsx
function SaveButton({ source }: { source: string }) {
  const handleSave = async () => {
    if (isTauri()) {
      // Native save dialog via Tauri
      const path = await tauriDialog.save({
        filters: [{ name: 'HoloScript', extensions: ['holo', 'hsplus'] }],
      });
      if (path) await saveProjectNative(path, source);
    } else {
      // Browser download fallback
      const blob = new Blob([source], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'scene.holo';
      a.click();
    }
  };

  return <button onClick={handleSave}>Save Project</button>;
}
```

## Tauri IPC Commands

The Rust backend exposes these IPC commands (defined in `packages/tauri-app/src-tauri/main.rs`):

| Command                  | Args              | Returns              | Description                     |
| ------------------------ | ----------------- | -------------------- | ------------------------------- |
| `get_gpu_info`           | -                 | `TauriGpuInfo`       | GPU adapter info from wgpu      |
| `get_app_version`        | -                 | `string`             | App version from Cargo.toml     |
| `shader_preview_init`    | `width`, `height` | -                    | Initialize wgpu shader preview  |
| `shader_preview_destroy` | -                 | -                    | Destroy shader preview pipeline |
| `save_project`           | `path`, `content` | `string`             | Save file to disk               |
| `load_project`           | `path`            | `string`             | Load file from disk             |
| `list_projects`          | `directory`       | `TauriProjectMeta[]` | List project files in directory |

## Testing

The Tauri bridge module provides a cache reset function for testing:

```typescript
import { _resetTauriCache } from '@holoscript/studio/platform';

beforeEach(() => {
  _resetTauriCache();
});
```

In test environments (jsdom), `isTauri()` returns `false` since `window.__TAURI__` is not present. All native operations return their browser fallback values.

## Requirements

- **Tauri 2.0** (v2.x)
- **Rust** with wgpu support
- **Node.js 20+** (build tooling)
- **pnpm** (workspace dependency management)

## Troubleshooting

### WASM Not Loading in Tauri

Ensure the WASM files are included in Tauri's resource bundle. Check `tauri.conf.json`:

```json
{
  "bundle": {
    "resources": ["../packages/studio/public/wasm/**"]
  }
}
```

### GPU Info Returns Null

If `gpuInfo` is null even in Tauri, check that:

1. The `get_gpu_info` IPC command is registered in `main.rs`.
2. wgpu can enumerate GPU adapters on the system.
3. GPU drivers are up to date.

### Native File Operations Fail

Ensure Tauri permissions are configured in `capabilities/default.json`:

```json
{
  "permissions": [
    "core:default",
    "dialog:allow-save",
    "dialog:allow-open",
    "fs:allow-read",
    "fs:allow-write"
  ]
}
```
