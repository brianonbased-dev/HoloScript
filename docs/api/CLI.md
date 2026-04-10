# @holoscript/cli Reference

Command-line interface for HoloScript development.

## Installation

```bash
npm install -g @holoscript/cli
# or
pnpm add -g @holoscript/cli
```

## Commands

### holoscript init

Initialize a new HoloScript project.

```bash
holoscript init <project-name>

# Options
holoscript init my-project --template vr     # VR starter template
holoscript init my-project --template ar     # AR starter template
holoscript init my-project --template game   # Game template
```

### holoscript compile

Compile .holo files to target platform.

```bash
holoscript compile <input> [options]

# Examples
holoscript compile scene.holo --target threejs
holoscript compile scene.holo --target unity --output ./build
holoscript compile src/*.holo --target vrchat --optimize
```

#### Options

| Option                | Short | Description                |
| --------------------- | ----- | -------------------------- |
| `--target <platform>` | `-t`  | Target platform (required) |
| `--output <dir>`      | `-o`  | Output directory           |
| `--optimize`          |       | Enable optimizations       |
| `--minify`            |       | Minify output              |
| `--sourcemap`         |       | Generate source maps       |
| `--watch`             | `-w`  | Watch for changes          |

#### Targets

| Target      | Platform       | Output                |
| ----------- | -------------- | --------------------- |
| `threejs`   | Three.js       | JavaScript module     |
| `babylon`   | Babylon.js     | JavaScript module     |
| `aframe`    | A-Frame        | HTML + components     |
| `webxr`     | WebXR          | JavaScript module     |
| `webgpu`    | WebGPU         | JavaScript + WGSL     |
| `unity`     | Unity          | C# scripts + prefabs  |
| `unreal`    | Unreal 5       | C++ actors            |
| `godot`     | Godot 4        | GDScript + scenes     |
| `vrchat`    | VRChat         | UdonSharp + prefabs   |
| `visionos`  | visionOS       | Swift + RealityKit    |
| `openxr`    | OpenXR         | C++ application       |
| `ios`       | iOS/ARKit      | Swift + ARKit         |
| `android`   | Android/ARCore | Kotlin + ARCore       |
| `androidxr` | Android XR     | Kotlin + Jetpack XR   |
| `wasm`      | WebAssembly    | WAT + bindings        |
| `urdf`      | ROS URDF       | XML robot description |
| `sdf`       | Gazebo SDF     | XML simulation        |
| `dtdl`      | Azure DTDL     | JSON digital twin     |

### holoscript validate

Validate HoloScript files without compiling.

```bash
holoscript validate <input>

# Examples
holoscript validate scene.holo
holoscript validate src/**/*.holo --strict
```

### holoscript format

Format HoloScript files.

```bash
holoscript format <input> [options]

# Examples
holoscript format scene.holo
holoscript format src/**/*.holo --write
holoscript format . --check  # Check without writing
```

### holoscript watch

Watch files and recompile on changes.

```bash
holoscript watch <input> --target <platform>

# Examples
holoscript watch src/*.holo --target threejs --output dist
```

### holoscript serve

Start development server with hot reload.

```bash
holoscript serve [options]

# Examples
holoscript serve                    # Serve current directory
holoscript serve --port 8080        # Custom port
holoscript serve --open             # Open browser
```

### holoscript export

Export to specific format.

```bash
holoscript export <input> --format <format>

# Formats: gltf, glb, usd, usda, usdz, fbx
holoscript export scene.holo --format glb
```

### holoscript import

Import from other formats to .holo.

```bash
holoscript import <input> --output <file>

# Supported: gltf, glb, vrm, fbx, obj
holoscript import model.glb --output scene.holo
```

### holoscript lsp

Start the Language Server Protocol server.

```bash
holoscript lsp

# Usually started by editor extensions automatically
```

### holoscript repl

Interactive HoloScript REPL.

```bash
holoscript repl

> composition Test { position: [0, 1, 0] }
AST: { type: "orb", name: "Test", ... }
```

### Additional Commands

The CLI includes 32+ commands for package management, registry, deployment, and code tools. For the full command reference, see [`packages/cli/README.md`](../../packages/cli/README.md).

Key commands not covered above:

- **Codebase Intelligence:** `absorb`, `query` — scan any codebase and query it with GraphRAG ([full guide →](/guides/codebase-intelligence))
- **Package Management:** `add`, `remove`, `list`, `pack`, `unpack`
- **Registry:** `publish`, `login`, `logout`, `whoami`, `access`, `org`, `token`
- **Code Tools:** `traits`, `suggest`, `generate`, `templates`, `inspect`, `diff`
- **Deployment:** `deploy`, `monitor`, `wot-export`
- **Runtime:** `run`, `headless`

---

## Configuration

### holoscript.config.js

Project configuration file.

```javascript
export default {
  // Source files
  include: ['src/**/*.holo', 'src/**/*.hsplus'],
  exclude: ['node_modules'],

  // Default compile target
  target: 'threejs',

  // Output directory
  outDir: 'dist',

  // Compiler options
  compiler: {
    optimize: true,
    minify: false,
    sourcemap: true,
  },

  // Dev server
  server: {
    port: 3000,
    open: true,
    hot: true,
  },

  // Plugins
  plugins: ['@holoscript/plugin-physics', '@holoscript/plugin-audio'],
};
```

---

## Environment Variables

| Variable            | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `HOLOSCRIPT_TARGET` | Default compile target                                      |
| `HOLOSCRIPT_DEV`    | Enable dev mode logging                                     |
| `HOLOSCRIPT_CACHE`  | Cache directory (default: `node_modules/.cache/holoscript`) |

---

## Exit Codes

| Code | Meaning               |
| ---- | --------------------- |
| 0    | Success               |
| 1    | Compile error         |
| 2    | Validation error      |
| 3    | File not found        |
| 4    | Invalid configuration |

---

## Examples

### Build for production

```bash
holoscript compile src/main.holo \
  --target threejs \
  --output dist \
  --optimize \
  --minify \
  --sourcemap
```

### Multi-target build

```bash
# Build for multiple platforms
for target in threejs unity vrchat; do
  holoscript compile src/main.holo --target $target --output dist/$target
done
```

### CI/CD integration

```yaml
# GitHub Actions
- name: Build HoloScript
  run: |
    npm install -g @holoscript/cli
    holoscript compile src/*.holo --target threejs --output dist
```

---

## See Also

- [Core API Reference](./CORE_API.md)
- [Getting Started Guide](../guides/GETTING_STARTED.md)
- [Platform Compilers](../guides/PLATFORM_COMPILERS.md)
