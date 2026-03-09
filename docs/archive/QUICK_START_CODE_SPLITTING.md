# Quick Start: HoloScript Code Splitting

## v3.42.0+ - Dynamic Compiler Loading

**🎯 TL;DR**: Import specific compilers instead of the whole bundle. Save 50-60% bundle size!

---

## ⚡ Quick Migration (30 seconds)

### Before (❌ Old - 20MB)

```typescript
import { VRRCompiler } from '@holoscript/core';
```

### After (✅ New - 8MB)

```typescript
import { VRRCompiler } from '@holoscript/core/compiler/vrr';
```

**That's it!** 60% smaller bundle. 🎉

---

## 📦 All Compilers (Cheat Sheet)

```typescript
// VR/AR/XR
import { VRRCompiler } from '@holoscript/core/compiler/vrr';
import { ARCompiler } from '@holoscript/core/compiler/ar';
import { MultiLayerCompiler } from '@holoscript/core/compiler/multi-layer';
import { OpenXRCompiler } from '@holoscript/core/compiler/openxr';
import { VRChatCompiler } from '@holoscript/core/compiler/vrchat';

// Game Engines
import { UnityCompiler } from '@holoscript/core/compiler/unity';
import { UnrealCompiler } from '@holoscript/core/compiler/unreal';
import { GodotCompiler } from '@holoscript/core/compiler/godot';
import { BabylonCompiler } from '@holoscript/core/compiler/babylon';
import { R3FCompiler } from '@holoscript/core/compiler/r3f';
import { PlayCanvasCompiler } from '@holoscript/core/compiler/playcanvas';

// Platforms
import { AndroidCompiler } from '@holoscript/core/compiler/android';
import { AndroidXRCompiler } from '@holoscript/core/compiler/android-xr';
import { IOSCompiler } from '@holoscript/core/compiler/ios';
import { VisionOSCompiler } from '@holoscript/core/compiler/visionos';

// Low-Level
import { WASMCompiler } from '@holoscript/core/compiler/wasm';
import { WebGPUCompiler } from '@holoscript/core/compiler/webgpu';

// Specialized
import { DTDLCompiler } from '@holoscript/core/compiler/dtdl';
import { URDFCompiler } from '@holoscript/core/compiler/urdf';
import { USDPhysicsCompiler } from '@holoscript/core/compiler/usd-physics';
import { SDFCompiler } from '@holoscript/core/compiler/sdf';
import { StateCompiler } from '@holoscript/core/compiler/state';
import { TraitCompositionCompiler } from '@holoscript/core/compiler/trait-composition';
import { IncrementalCompiler } from '@holoscript/core/compiler/incremental';
```

---

## 🚀 Pro Tip: Dynamic Loading

Load compilers only when needed:

```typescript
async function getCompiler(type: string) {
  switch (type) {
    case 'unity':
      return (await import('@holoscript/core/compiler/unity')).UnityCompiler;
    case 'unreal':
      return (await import('@holoscript/core/compiler/unreal')).UnrealCompiler;
    // ... add more as needed
  }
}

// Usage
const CompilerClass = await getCompiler('unity');
const compiler = new CompilerClass();
```

**Benefit**: Even smaller initial bundle!

---

## 📊 Bundle Size Impact

| Users Load  | Before | After | Savings    |
| ----------- | ------ | ----- | ---------- |
| 1 compiler  | 20 MB  | 8 MB  | **60%** ✨ |
| 2 compilers | 20 MB  | 10 MB | **50%** 🎯 |
| 5 compilers | 20 MB  | 13 MB | **35%** 💪 |

---

## ✅ Core Imports (Unchanged)

These still work the same:

```typescript
import { HoloScriptParser } from '@holoscript/core/parser';
import { HoloScriptRuntime } from '@holoscript/core/runtime';
import { HoloScriptTypeChecker } from '@holoscript/core/type-checker';
```

---

## 🆘 Need Help?

- **Full Guide**: [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)
- **Troubleshooting**: [MIGRATION_GUIDE.md#troubleshooting](MIGRATION_GUIDE.md#troubleshooting)
- **Issues**: https://github.com/brianonbased-dev/Holoscript/issues

---

**Updated**: 2026-02-26 | **Version**: v3.42.0+
