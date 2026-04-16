# HoloScript Compiler Targets Reference

**Source**: HoloScript Repository v6.0.0 (Canonical)
**Location**: `c:\Users\josep\Documents\GitHub\HoloScript`
**Last Updated**: 2026-03-30

---

## 33 Supported Compile Targets (24 registered dialects, 29 ExportTargets)

### Game Engines ✅ Stable
| Compiler | File | Output | Status |
|----------|------|--------|--------|
| **Unity** | `UnityCompiler.ts` | C# scripts + scene | ✅ Stable |
| **Unreal Engine 5** | `UnrealCompiler.ts` | C++ header + source | ✅ Stable |
| **Godot** | `GodotCompiler.ts` | GDScript | ✅ Stable |

### VR/AR Platforms ✅ Stable
| Compiler | File | Output | Status |
|----------|------|--------|--------|
| **VRChat (Udon)** | `VRChatCompiler.ts` | Udon# scripts | ✅ Stable |
| **OpenXR** | `OpenXRCompiler.ts` | OpenXR application | ✅ Stable |
| **Quest/Android** | `AndroidXRCompiler.ts` | Android VR app | ✅ Stable |
| **iOS (ARKit)** | `IOSCompiler.ts` | Swift ARKit app | ✅ Stable |
| **VisionOS** | `VisionOSCompiler.ts` | VisionOS spatial app | ✅ Stable |
| **Generic AR** | `ARCompiler.ts` | AR application | ✅ Stable |

### Web Platforms ✅ Stable
| Compiler | File | Output | Status |
|----------|------|--------|--------|
| **Babylon.js** | `BabylonCompiler.ts` | Babylon scene | ✅ Stable |
| **WebGPU** | `WebGPUCompiler.ts` | WebGPU renderer | ✅ Stable |
| **React Three Fiber** | `R3FCompiler.ts` | R3F components | ✅ Stable |
| **WebAssembly** | `WASMCompiler.ts` | WASM module | ✅ Stable |
| **PlayCanvas** | `PlayCanvasCompiler.ts` | PlayCanvas scene | ✅ Stable |

### Robotics & Simulation ✅ Stable
| Compiler | File | Output | Status |
|----------|------|--------|--------|
| **URDF** | `URDFCompiler.ts` | Robot URDF XML | ✅ Stable |
| **SDF** | `SDFCompiler.ts` | Gazebo SDF XML | ✅ Stable |
| **USD Physics** | `USDPhysicsCompiler.ts` | USD scene | ✅ Stable |
| **USDZ** | `USDZPipeline.ts` | AR Quick Look | ✅ Stable |

### IoT & Industry ✅ Stable
| Compiler | File | Output | Status |
|----------|------|--------|--------|
| **DTDL (Azure Digital Twins)** | `DTDLCompiler.ts` | JSON-LD model | ✅ Stable |

### Intermediate Formats
| Format | File | Purpose |
|--------|------|---------|
| **glTF** | `GLTFPipeline.ts` | 3D asset interchange |
| **VRR** | `VRRCompiler.ts` | VR recording format |

---

## 🐍 Python Bindings (Robotics Module)

**Location**: `packages/python-bindings/holoscript/robotics.py`
**PyPI Package**: `holoscript` (with robotics module)

### Available Functions

```python
from holoscript.robotics import (
    export_urdf,
    export_sdf,
    generate_ros2_launch,
    export_gazebo_world
)
```

#### `export_urdf(holo_code, robot_name, ...)`
**Parameters**:
- `holo_code: str` - HoloScript composition code
- `robot_name: str = "holoscript_robot"` - Robot name for URDF
- `include_visual: bool = True` - Include visual elements
- `include_collision: bool = True` - Include collision geometry
- `include_inertial: bool = True` - Include inertial properties

**Returns**: `URDFExportResult` with:
- `success: bool`
- `urdf_content: str`
- `robot_name: str`
- `link_count: int`
- `joint_count: int`
- `errors: List[str]`
- `warnings: List[str]`

#### `export_sdf(holo_code, world_name, ...)`
**Parameters**:
- `holo_code: str` - HoloScript composition code
- `world_name: str = "holoscript_world"` - World name for SDF

**Returns**: `SDFExportResult`

#### `generate_ros2_launch(config_path, package_name, ...)`
**Parameters**:
- `config_path: str` - Path to configuration YAML
- `package_name: str = "holoscript_scene"` - ROS2 package name

**Returns**: `ROSLaunchResult` with Python launch file content

### Robotics Trait Mappings

HoloScript traits → URDF/SDF equivalents:

| Trait | URDF Element | SDF Element |
|-------|--------------|-------------|
| `@physics` | `<inertial>` | `<inertial>` |
| `@collidable` | `<collision>` | `<collision>` |
| `@static` | fixed joint | `static="true"` |
| `@sensor` | Gazebo plugin | `<sensor>` |
| `@grabbable` | Comment hint | Comment hint |

### Geometry Mappings

| HoloScript | URDF | SDF |
|------------|------|-----|
| `cube` | `<box>` | `<box>` |
| `sphere` | `<sphere>` | `<sphere>` |
| `cylinder` | `<cylinder>` | `<cylinder>` |
| `plane` | `<box>` | `<plane>` |
| `mesh` | `<mesh>` | `<mesh>` |

---

## 🏗️ Package Structure

```
HoloScript/
├── packages/
│   ├── core/                     # Main compiler + parser
│   │   ├── src/compiler/         # All compiler implementations
│   │   ├── src/parser/           # HoloScript parser
│   │   └── src/runtime/          # Runtime execution
│   ├── python-bindings/          # Python robotics module
│   ├── cli/                      # Command-line interface
│   ├── unity-sdk/                # Unity Package Manager SDK
│   ├── llm-provider/             # OpenAI/Anthropic/Gemini SDK
│   ├── ai-validator/             # Hallucination detection
│   ├── security-sandbox/         # vm2 execution sandbox
│   ├── comparative-benchmarks/   # vs Unity/glTF benchmarks
│   ├── mcp-server/               # Model Context Protocol server
│   ├── lsp/                      # Language Server Protocol
│   ├── vscode-extension/         # VS Code integration
│   └── [38 total packages]
├── examples/                     # 9 real-world examples
├── docs/                         # Full documentation
└── samples/                      # Compiled sample outputs
```

---

## 🚀 Build Commands

**From repository root** (`c:\Users\josep\Documents\GitHub\HoloScript`):

```bash
# Build all packages
pnpm build

# Build in parallel
pnpm build:parallel

# Run tests
pnpm test

# Run with coverage
pnpm test:coverage

# Development mode (watch)
pnpm dev

# Lint
pnpm lint

# Format code
pnpm format

# Run benchmarks
pnpm benchmark

# Generate API docs
pnpm docs:api
```

---

## 📊 Repository Statistics

- **Version**: 3.4.0
- **Packages**: 38 total
- **Compile Targets**: 18+
- **VR Traits**: 1,800+
- **Visual Traits**: 600+
- **Robotics Traits**: 213
- **Test Coverage**: ~80% (Codecov)
- **License**: MIT
- **Package Manager**: pnpm 8.12.0
- **Node Version**: >=18.0.0

---

## 🔗 Key Files

| File | Purpose |
|------|---------|
| `packages/core/src/compiler/UnityCompiler.ts` | Unity C# export |
| `packages/core/src/compiler/UnrealCompiler.ts` | Unreal C++ export |
| `packages/core/src/compiler/URDFCompiler.ts` | Robot URDF export |
| `packages/core/src/compiler/SDFCompiler.ts` | Gazebo SDF export |
| `packages/python-bindings/holoscript/robotics.py` | Python API |
| `packages/core/src/parser/HoloCompositionTypes.ts` | Type definitions |

---

*Canonical reference from HoloScript repository v3.42.0*
*Location: c:\Users\josep\Documents\GitHub\HoloScript*
*Updated: 2026-02-21*
