# HoloScript Repository Structure Reference

**Source**: Canonical HoloScript Monorepo
**Location**: `c:\Users\josep\Documents\GitHub\HoloScript`
**Version**: 3.4.0
**Last Updated**: 2026-02-21

---

## 📦 pnpm Workspaces Monorepo

HoloScript uses pnpm workspaces (verify via `ls packages/`):

```
packages/
├── adapter-postgres          # PostgreSQL adapter for data storage
├── ai-validator              # Hallucination detection (Levenshtein)
├── benchmark                 # Performance benchmarks
├── cli                       # Command-line interface (@holoscript/cli)
├── comparative-benchmarks    # vs Unity/glTF benchmarks
├── compiler-wasm             # WebAssembly compiler
├── components                # Reusable components library
├── core                      # ⭐ Main package (parser + compiler + runtime)
├── formatter                 # Code formatter
├── fs                        # Filesystem utilities
├── holoscript                # Legacy package name
├── holoscript-cdn            # CDN distribution
├── holoscript-component      # Component library
├── intellij                  # IntelliJ IDEA plugin
├── linter                    # Code linter
├── llm-provider              # OpenAI/Anthropic/Gemini SDK (46 tests)
├── lsp                       # Language Server Protocol
├── marketplace-api           # Marketplace backend API
├── marketplace-web           # Marketplace frontend
├── mcp-server                # Model Context Protocol server
├── neovim                    # Neovim plugin
├── partner-sdk               # Partner integration SDK
├── playground                # Web-based playground
├── python-bindings           # ⭐ Python robotics module (48 tests)
├── registry                  # Package registry
├── runtime                   # Runtime execution engine
├── security-sandbox          # vm2 execution sandbox
├── std                       # Standard library
├── studio                    # Visual editor
├── test                      # Test utilities
├── tree-sitter-holoscript    # Tree-sitter grammar
├── unity-sdk                 # Unity Package Manager SDK
├── video-tutorials           # Video tutorial scripts
├── visual                    # Visual components
├── visualizer-client         # Visualizer client
└── vscode-extension          # VS Code extension
```

---

## 🎯 Core Package Structure

**Location**: `packages/core/`

```
core/
├── src/
│   ├── compiler/                  # ⭐ All compiler implementations
│   │   ├── UnityCompiler.ts       # Unity C# export
│   │   ├── UnrealCompiler.ts      # Unreal C++ export
│   │   ├── GodotCompiler.ts       # Godot GDScript export
│   │   ├── BabylonCompiler.ts     # Babylon.js export
│   │   ├── WebGPUCompiler.ts      # WebGPU export
│   │   ├── URDFCompiler.ts        # Robot URDF export
│   │   ├── SDFCompiler.ts         # Gazebo SDF export
│   │   ├── VRChatCompiler.ts      # VRChat Udon export
│   │   ├── AndroidXRCompiler.ts   # Android VR export
│   │   ├── IOSCompiler.ts         # iOS ARKit export
│   │   ├── VisionOSCompiler.ts    # Apple Vision Pro export
│   │   ├── OpenXRCompiler.ts      # OpenXR export
│   │   ├── WASMCompiler.ts        # WebAssembly export
│   │   ├── DTDLCompiler.ts        # Azure Digital Twins export
│   │   ├── PlayCanvasCompiler.ts  # PlayCanvas export
│   │   ├── R3FCompiler.ts         # React Three Fiber export
│   │   ├── USDPhysicsCompiler.ts  # USD scene export
│   │   ├── ARCompiler.ts          # Generic AR export
│   │   ├── VRRCompiler.ts         # VR recording format
│   │   ├── GLTFPipeline.ts        # glTF pipeline
│   │   ├── USDZPipeline.ts        # USDZ pipeline
│   │   ├── BuildCache.ts          # Build caching
│   │   ├── BundleAnalyzer.ts      # Bundle analysis
│   │   ├── IncrementalCompiler.ts # Incremental builds
│   │   └── __tests__/             # Compiler tests
│   │
│   ├── parser/                    # HoloScript parser
│   │   ├── HoloCompositionTypes.ts # Type definitions
│   │   ├── parser.ts              # Main parser
│   │   └── ast.ts                 # AST definitions
│   │
│   ├── runtime/                   # Runtime execution
│   │   ├── engine.ts              # Runtime engine
│   │   ├── renderer.ts            # ThreeJS renderer
│   │   └── state.ts               # State management
│   │
│   ├── type-checker/              # Type checking
│   ├── debugger/                  # Debugger tools
│   └── wot/                       # Web of Things
│
├── package.json                   # Package config
├── tsconfig.json                  # TypeScript config
└── vitest.config.ts               # Test config
```

---

## 🐍 Python Bindings Structure

**Location**: `packages/python-bindings/`

```
python-bindings/
├── holoscript/
│   ├── __init__.py               # Package init
│   ├── robotics.py               # ⭐ Robotics module (URDF/SDF/ROS2)
│   ├── core.py                   # Core bindings
│   └── utils.py                  # Utilities
├── tests/
│   └── test_robotics.py          # 48 robotics tests
├── pyproject.toml                # Python package config (hatchling)
├── README.md                     # Python docs
└── setup.py                      # Setup script
```

**PyPI Package**: `holoscript`
**Build System**: hatchling
**Python Version**: >=3.8

---

## 📊 Test Structure

HoloScript uses **vitest** for testing across all packages.

### Test Organization
```
packages/core/src/compiler/__tests__/
├── UnityCompiler.test.ts
├── UnrealCompiler.test.ts
├── BabylonCompiler.test.ts
├── URDFCompiler.test.ts
├── VRChatCompiler.test.ts
├── WASMCompiler.test.ts
├── ExportTargets.e2e.test.ts    # ⭐ E2E tests covering export targets (verify via `pnpm test`)
└── [more test files]
```

### Test Commands
```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific package tests
pnpm --filter @holoscript/core test

# Watch mode
pnpm test:watch
```

### Test Coverage
- **Target**: 80% (Codecov threshold)
- **Current**: ~80% achieved
- **E2E Tests**: covering export targets (verify via `pnpm test`)

---

## 🔧 Build System

### TypeScript Compilation
- **Bundler**: tsup (fast esbuild-based)
- **Targets**: ESM + CJS + TypeScript definitions
- **Incremental**: Supported via BuildCache.ts

### Build Outputs
```
packages/*/dist/
├── index.js          # ESM build
├── index.cjs         # CommonJS build
└── index.d.ts        # TypeScript definitions
```

### Pre-commit Hooks
**Automatically runs**:
1. ESLint check
2. TypeScript type check
3. vitest tests
4. Format check (Prettier)

**Note**: Pre-commit hook sometimes creates parallel commits (Windows git issue)

---

## 🌐 Examples Directory

**Location**: `examples/`

### General Examples
```
examples/general/
├── vr-training-simulation/       # Corporate VR training
├── ar-furniture-preview/         # E-commerce AR
├── virtual-art-gallery/          # Museums & culture
└── vr-game-demo/                 # Gaming
```

### Specialized Examples
```
examples/specialized/
├── robotics/                     # ⭐ ROS2/Gazebo robot arm
├── iot/                          # IoT digital twin (Azure DTDL)
├── multiplayer/                  # Collaborative VR
├── unity-quest/                  # Quest 2/3 optimization
└── vrchat/                       # VRChat world with Udon#
```

**Total**: 9 complete examples
**Documentation**: `examples/INDEX.md`

---

## 📚 Documentation Structure

**Location**: `docs/`

```
docs/
├── getting-started/
│   ├── quickstart.md             # 5-minute tutorial
│   ├── installation.md           # Installation guide
│   └── first-scene.md            # First scene guide
├── architecture/
│   ├── README.md                 # Architecture overview
│   ├── compiler.md               # Compiler design
│   └── runtime.md                # Runtime design
├── api/                          # Generated TypeDoc API docs
├── guides/                       # Feature guides
└── .vitepress/                   # VitePress config
```

### Documentation Commands
```bash
# Generate API docs
pnpm docs:api

# Watch mode
pnpm docs:api:watch

# Generate JSON
pnpm docs:api:json
```

---

## 🔐 Security & Quality Tools

### Security
- **Snyk**: Vulnerability scanning (A+ rating)
- **CodeQL**: GitHub security analysis
- **Security Sandbox**: `packages/security-sandbox/` (vm2-based)

### Code Quality
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **TypeScript**: Type safety
- **jscpd**: Duplicate code detection
- **madge**: Circular dependency detection
- **depcheck**: Unused dependency detection
- **syncpack**: Version sync across packages

### Audit Commands
```bash
# Security audit
pnpm audit

# CI audit (fails on high/critical)
pnpm --filter @holoscript/core run audit:ci

# Check duplicates
pnpm run duplicate:check

# Check circular dependencies
pnpm run circular:check
```

---

## 🚀 Deployment Artifacts

### npm Packages
- Published to npm with `@holoscript/*` scope
- Public access
- Synchronized versions via `scripts/sync-versions.js`

### Unity Package Manager
- Distributed via GitHub URL
- Path: `?path=/packages/unity-sdk`
- Unity version: 2022.3+ or Unity 6

### PyPI Package
- Package name: `holoscript`
- Includes robotics module
- OIDC trusted publishing workflow

### Compiled Samples
**Location**: `samples/compiled/`
- Unity C# examples
- Unreal C++ examples
- Godot GDScript examples
- URDF robot models

---

## 🎯 Key Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Root workspace config |
| `pnpm-workspace.yaml` | pnpm workspaces config |
| `vitest.workspace.ts` | Test workspace config |
| `tsconfig.json` | Root TypeScript config |
| `typedoc.json` | API docs config |
| `codecov.yml` | Code coverage config (80% threshold) |
| `.github/workflows/security.yml` | Snyk + CodeQL workflow |
| `.github/workflows/publish-pypi.yml` | PyPI publish workflow |

---

## 📈 Repository Metrics

- **Total Packages**: 38
- **Lines of Code**: ~150,000+
- **Test Files**: 200+
- **Examples**: 9 complete
- **Contributors**: Brian X Base Team
- **License**: MIT
- **Stars**: Growing (open source)
- **Issues**: Tracked on GitHub

---

*Canonical reference from HoloScript v3.42.0 monorepo*
*pnpm workspaces • packages • export targets (see NUMBERS.md)*
*Updated: 2026-02-21*
