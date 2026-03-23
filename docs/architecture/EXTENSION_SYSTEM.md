# Extension System Architecture

> Disambiguating "extensions" in HoloScript — four distinct meanings, one codebase.

## The Four Extension Systems

The word "extension" appears in four distinct contexts in HoloScript. This document clarifies each:

### 1. Plugin Extensions (`ExtensionRegistry`)

The plugin system for community and first-party extensions.

| Class | File | Purpose |
|-------|------|---------|
| `ExtensionRegistry` | `src/extensions/ExtensionRegistry.ts:7` | Register and load plugin extensions |
| `ExtensionInterface` | `src/extensions/ExtensionInterface.ts:4` | Extension lifecycle (`ExtensionContext`) |
| `ExtensionRegistry.loadExtension()` | `:17` | Dynamic extension loading |

```typescript
import { ExtensionRegistry } from '@holoscript/core';

const registry = new ExtensionRegistry();
await registry.loadExtension('my-plugin', context);
```

**Use case**: Adding new trait categories, custom compilers, tool integrations.

---

### 2. File Extensions (LSP Import Resolution)

The Language Server uses file extensions to resolve imports.

| Symbol | File | Purpose |
|--------|------|---------|
| `EXTENSIONS` | `src/lsp/ImportResolver.ts:148` | Ordered list of supported file extensions |
| `ImportResolver.getExtension()` | `:263` | Resolve file extension from import path |

Supported resolution order: `.holo`, `.hs`, `.hsplus`, `.ts`, `.js`

**Use case**: Editor auto-imports, Go-to-Definition, LSP completions.

---

### 3. glTF Extensions (3D Format)

glTF 2.0 extensions for advanced 3D features.

| Symbol | File | Purpose |
|--------|------|---------|
| `isExtensionRequired()` | `src/compiler/gltf/extensions.ts:438` | Check if a glTF extension is needed |
| `GLTFTrait.getRequiredExtensions()` | `src/traits/GLTFTrait.ts:230` | List glTF extensions needed by a trait |

Examples: `KHR_materials_unlit`, `KHR_draco_mesh_compression`, `EXT_mesh_gpu_instancing`

**Use case**: Determining which glTF extensions to include in exported `.glb` files.

---

### 4. OpenXR/Platform Extensions

Platform-specific capability extensions.

| Symbol | File | Purpose |
|--------|------|---------|
| `requiredExtensions` | `src/compiler/OpenXRSpatialEntitiesCompiler.ts:265` | OpenXR extensions needed for spatial entities |

Examples: `XR_FB_spatial_entity`, `XR_META_spatial_entity_mesh`

**Use case**: Declaring which OpenXR/platform extensions a scene requires.

---

## Summary

| System | Entry Point | When to Use |
|--------|-------------|-------------|
| **Plugin** | `ExtensionRegistry` | Adding functionality to HoloScript |
| **File** | `ImportResolver.EXTENSIONS` | LSP/editor file resolution |
| **glTF** | `GLTFTrait.getRequiredExtensions()` | 3D export format |
| **OpenXR** | `Compiler.requiredExtensions` | Platform capabilities |

When contributing code that touches "extensions", be explicit about which system you mean. Use the full class name (e.g., `ExtensionRegistry` vs `GLTFTrait.requiredExtensions`) to avoid ambiguity.
