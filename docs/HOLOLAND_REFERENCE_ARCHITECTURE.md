# Hololand Reference Architecture

**Purpose**: Prove the "even playing field" strategy—Hololand uses **public HoloScript APIs only**.

---

## Executive Summary

[Hololand](https://github.com/brianonbased-dev/Hololand) is a VR social platform ("Roblox for VR") built entirely on HoloScript. This document provides transparency into Hololand's architecture to prove:

1. ✅ **No privileged APIs**: Hololand uses the same public APIs available to everyone
2. ✅ **You can compete**: Build your own social VR platform with equal access
3. ✅ **Reference implementation**: See how to build production platforms on HoloScript

**TL;DR**: If Hololand can be built with public APIs, so can your platform.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [HoloScript Integration Points](#holoscript-integration-points)
3. [Public APIs Used](#public-apis-used)
4. [Build Your Own Hololand](#build-your-own-hololand)
5. [Source Code Transparency](#source-code-transparency)

---

## Architecture Overview

### Hololand Stack

```
┌──────────────────────────────────────────────────────────────┐
│                      HOLOLAND PLATFORM                        │
│                    (VR Social Application)                    │
├──────────────────────────────────────────────────────────────┤
│  Application Layer (Hololand-Specific)                       │
│  ├─ World System (Plaza, Casino, Museum, etc.)              │
│  ├─ Social Features (Friends, Voice, Parties)               │
│  ├─ Monetization (Creator economy, subscriptions)           │
│  └─ UI/UX (Mobile controls, accessibility, themes)          │
├──────────────────────────────────────────────────────────────┤
│  Platform Services (@hololand/*)                             │
│  ├─ @hololand/multiplayer (CRDT state sync)                 │
│  ├─ @hololand/physics (Rapier integration)                  │
│  ├─ @hololand/renderer (Three.js/Babylon/PlayCanvas)        │
│  ├─ @hololand/core (WebXR, input, audio)                    │
│  └─ 39+ more packages (voice, AR, mobile, etc.)             │
├──────────────────────────────────────────────────────────────┤
│                    HOLOSCRIPT LAYER                           │
│              (PUBLIC APIs - Available to Everyone)            │
│  ├─ @holoscript/core (Parser, Compiler, Runtime)            │
│  ├─ @holoscript/runtime (RuntimeRegistry, Executors)        │
│  └─ @holoscript/traits (1,800+ composable behaviors)        │
└──────────────────────────────────────────────────────────────┘
```

**Key Point**: Everything above the HoloScript layer is Hololand-specific. Everything in the HoloScript layer is **public and available to all platforms**.

---

## HoloScript Integration Points

### 1. World Definition (`.holo` files)

Hololand worlds are authored in HoloScript `.holo` files:

```holo
composition "MainPlaza" {
  scene {
    environment {
      skybox: "procedural_sky"
      lighting: "sunset_warm"
      @spatial_audio
    }

    object "CentralFountain" {
      @physics
      @networked
      @audio_source(clip: "water_fountain.mp3", loop: true)
      geometry: "custom_fountain.glb"
      position: [0, 0, 0]
    }

    object "Portal_Casino" {
      @portal(destination: "Casino", position: [100, 50, 0])
      @glow(color: "#00ff00", intensity: 2.0)
      @teleport
      geometry: "portal_arch.glb"
      position: [10, 0, 5]
    }
  }
}
```

**APIs Used**: Standard HoloScript composition syntax (public)

---

### 2. Runtime Execution

Hololand uses HoloScript's **public runtime layer**:

```typescript
import { parseHoloScript } from '@holoscript/core/parser';
import { RuntimeRegistry } from '@holoscript/core/runtime';
import { ThreeJSRenderer } from '@holoscript/core/runtime/ThreeJSRenderer';

// Parse world definition
const composition = parseHoloScript(mainPlazaSource);

// Execute via HoloScript runtime (public API)
const executor = RuntimeRegistry.execute(composition);

// Render with ThreeJS (public renderer)
const renderer = new ThreeJSRenderer({ canvas, shadows: true });
renderer.initialize(composition);
renderer.start();
```

**APIs Used**:

- `parseHoloScript()` - Public parser
- `RuntimeRegistry.execute()` - Public runtime
- `ThreeJSRenderer` - Public renderer (anyone can use)

---

### 3. Trait System Integration

Hololand uses **standard HoloScript traits**:

```holo
object "Player" {
  @grabbable         // Public trait from @holoscript/traits
  @physics           // Public trait
  @networked         // Public trait (CRDT sync)
  @voice_chat        // Public trait
  @avatar_ik         // Public trait (inverse kinematics)
  @spatial_audio     // Public trait
}
```

**APIs Used**: All traits from `@holoscript/traits` package (public)

---

### 4. Compilation Targets

Hololand can compile worlds to other platforms:

```typescript
import { compileToUnity } from '@holoscript/core/compiler';
import { compileToUnreal } from '@holoscript/core/compiler';

// Compile Hololand world to Unity (public compiler)
const unityCode = compileToUnity(composition, {
  version: '2022.3',
  outputPath: './unity-export',
});

// Compile to Unreal (public compiler)
const unrealCode = compileToUnreal(composition, {
  version: '5.3',
  outputPath: './unreal-export',
});
```

**APIs Used**: Public compilers (`compileToUnity`, `compileToUnreal`, etc.)

---

### 5. Multiplayer State Sync

Hololand multiplayer uses **public HoloScript integration**:

```typescript
import { getStreamProtocol } from '@holoscript/core';

// HoloScript streaming protocol (public)
const protocol = getStreamProtocol();

// Send entity updates (anyone can do this)
protocol.sendEntityUpdate({
  entityId: 'player-1',
  position: { x: 10, y: 0, z: 5 },
  rotation: { x: 0, y: 45, z: 0 },
});

// Subscribe to updates (public API)
protocol.on('entity_update', (data) => {
  updatePlayerPosition(data);
});
```

**APIs Used**: `getStreamProtocol()` - Public streaming protocol

---

## Public APIs Used

### Complete API Surface

Hololand uses **ONLY** these public HoloScript APIs:

| Package               | API                   | Purpose                      | Public?                   |
| --------------------- | --------------------- | ---------------------------- | ------------------------- |
| `@holoscript/core`    | `parseHoloScript()`   | Parse `.holo` files          | ✅ Yes                    |
| `@holoscript/core`    | `compileToUnity()`    | Compile to Unity C#          | ✅ Yes                    |
| `@holoscript/core`    | `compileToUnreal()`   | Compile to Unreal C++        | ✅ Yes                    |
| `@holoscript/core`    | `compileToR3F()`      | Compile to React Three Fiber | ✅ Yes                    |
| `@holoscript/runtime` | `RuntimeRegistry`     | Runtime execution            | ✅ Yes                    |
| `@holoscript/runtime` | `ThreeJSRenderer`     | Three.js rendering           | ✅ Yes                    |
| `@holoscript/runtime` | `RuntimeExecutor`     | Execution interface          | ✅ Yes                    |
| `@holoscript/core`    | `getStreamProtocol()` | Multiplayer protocol         | ✅ Yes                    |
| `@holoscript/core`    | `getHololandClient()` | Connection management        | ✅ Yes (for any platform) |
| `@holoscript/traits`  | All 2,000+ traits     | Composable behaviors         | ✅ Yes                    |

**Verification**: Check `@holoscript/core/package.json` - all exports are public.

---

## Build Your Own Hololand

### Step-by-Step Guide

**1. Create World Definition** (`my-world.holo`)

```holo
composition "MyWorld" {
  scene {
    environment {
      skybox: "space"
      lighting: "dramatic"
    }

    object "SpawnPoint" {
      @spawn_point
      position: [0, 1, 0]
    }

    object "Platform" {
      @physics(type: "static")
      geometry: "plane"
      scale: [100, 1, 100]
    }
  }
}
```

**2. Parse and Execute**

```typescript
import { parseHoloScript } from '@holoscript/core/parser';
import { RuntimeRegistry } from '@holoscript/core/runtime';
import { ThreeJSRenderer } from '@holoscript/core/runtime/ThreeJSRenderer';

// Parse (public API)
const composition = parseHoloScript(myWorldSource);

// Execute (public API)
const executor = RuntimeRegistry.execute(composition);

// Render (public API)
const renderer = new ThreeJSRenderer({ canvas, shadows: true });
renderer.initialize(composition);
renderer.start();
```

**3. Add Multiplayer**

```typescript
import { getStreamProtocol, getHololandClient } from '@holoscript/core';

// Connect to multiplayer server (public API)
const client = getHololandClient();
await client.connectToHololand({
  serverUrl: 'wss://my-server.example.com',
});

// Register world (public API)
await client.registerWorld(composition);

// Join world (public API)
await client.joinWorld(composition.metadata.id);
```

**4. Compile to Unity/Unreal**

```typescript
import { compileToUnity } from '@holoscript/core/compiler';

// Compile to Unity (public API)
const unityCode = compileToUnity(composition, {
  version: '2022.3',
  outputPath: './unity-export',
});

// Deploy to App Store/Steam
```

**Result**: You now have a VR social platform using the **exact same APIs** as Hololand.

---

## Source Code Transparency

### Hololand Repository Structure

```
Hololand/
├── packages/
│   ├── core/                    ← Uses @holoscript/core (public)
│   ├── multiplayer/             ← Uses @holoscript/runtime (public)
│   ├── physics/                 ← Uses @holoscript/runtime (public)
│   ├── renderer/                ← Uses ThreeJSRenderer (public)
│   └── 39+ more packages...     ← All use public HoloScript APIs
│
├── worlds/
│   ├── MainPlaza.holo           ← Standard .holo syntax (public)
│   ├── Casino.holo              ← Standard .holo syntax (public)
│   └── Museum.holo              ← Standard .holo syntax (public)
│
└── docs/
    └── HOLOSCRIPT_INTEGRATION.md  ← API usage documentation
```

### Audit Process

**How to verify "no privileged APIs":**

1. **Clone Hololand**: `git clone https://github.com/brianonbased-dev/Hololand`
2. **Search for imports**: `grep -r "@holoscript" packages/`
3. **Verify public exports**: Check `@holoscript/core/package.json` exports
4. **Run without HoloScript**: Should fail (proves dependency on public APIs)

**Expected Result**: All Hololand imports from `@holoscript/*` are listed in public package.json exports.

---

## API Comparison: Hololand vs. Your Platform

| Feature               | Hololand Uses                  | Your Platform Can Use |
| --------------------- | ------------------------------ | --------------------- |
| **World Parsing**     | `parseHoloScript()`            | ✅ Same API           |
| **Runtime Execution** | `RuntimeRegistry.execute()`    | ✅ Same API           |
| **Rendering**         | `ThreeJSRenderer`              | ✅ Same API           |
| **Traits**            | `@grabbable`, `@physics`, etc. | ✅ Same traits        |
| **Multiplayer**       | `getStreamProtocol()`          | ✅ Same API           |
| **Compilation**       | `compileToUnity()`             | ✅ Same API           |
| **AI Integration**    | Brittney agent (MCP tools)     | ✅ Same tools         |

**Conclusion**: Perfect parity. You have **equal access**.

---

## Competing with Hololand

### What You Need

1. **HoloScript** (public, MIT license)
2. **Server Infrastructure** (deploy your own or use cloud)
3. **UI/UX** (build better experiences than Hololand)
4. **Community** (attract users, creators, developers)

### What You Don't Need

- ❌ **Fork HoloScript** (use it as-is)
- ❌ **Custom APIs** (public APIs are enough)
- ❌ **Permission** (MIT license, build freely)
- ❌ **HoloScript team approval** (compete without asking)

### Differentiators

Hololand competes on:

- **Execution** (user experience, not API lock-in)
- **Community** (network effects, creator economy)
- **Innovation** (new features, better UX)

You can compete by building:

- **Better UX**: Mobile-first, accessibility, performance
- **Different Focus**: Education, corporate training, gaming
- **Vertical Integration**: Industry-specific (healthcare, retail)

---

## Success Stories (Coming Soon)

We're looking for platforms built on HoloScript:

- **Training Platform**: [Your platform here]
- **VR Social**: [Your platform here]
- **Robotics Sim**: [Your platform here]

**Built a platform on HoloScript?** [Submit your story →](mailto:community@holoscript.net)

---

## FAQ

### Does Hololand have access to private HoloScript APIs?

**No.** Hololand is developed in a separate repository (github.com/brianonbased-dev/Hololand) and imports HoloScript via npm (`@holoscript/core`). Only public exports are accessible.

### How can I verify this claim?

**Audit**:

1. Clone both repos (HoloScript + Hololand)
2. Run `npm ls @holoscript/core` in Hololand repo
3. Check `@holoscript/core/package.json` exports
4. Grep Hololand codebase for any `@holoscript/*` imports
5. Verify all imports match public exports

### Can I fork Hololand and build my own?

**Yes!** Hololand is MIT licensed. You can:

- Fork and rebrand
- Customize features
- Deploy your own servers
- Compete directly

### Will HoloScript break Hololand compatibility?

**No.** HoloScript follows semantic versioning:

- **Patch** (3.4.1): Bug fixes, no breaking changes
- **Minor** (3.5.0): New features, backward compatible
- **Major** (4.0.0): Breaking changes (rare, with migration guide)

Hololand updates HoloScript versions like any other platform.

### What if I need a feature Hololand has but I can't access?

**Impossible.** If Hololand uses it, it's a public API. Check:

1. `@holoscript/core/package.json` exports
2. HoloScript documentation
3. Ask on Discord (#api-questions)

If truly missing, submit RFC to add it publicly.

---

## Contributing to Transparency

Help us maintain the "even playing field":

1. **Report Privileged Access**: Found an API Hololand uses that's not public? [Report it](https://github.com/brianonbased-dev/HoloScript/issues)
2. **Audit Regularly**: We publish quarterly audits of Hololand's API usage
3. **Suggest Improvements**: RFC process for new public APIs

**Goal**: 100% transparency, 0% lock-in.

---

## Related Documents

- [HoloScript Roadmap](../ROADMAP.md)
- [Hololand Integration Guide](../docs/integrations/hololand.md)
- [Build Your Own Platform Guide](./BUILD_YOUR_OWN_PLATFORM.md)
- [Foundation Governance](./FOUNDATION.md)

---

**Last Updated**: February 21, 2026
**Next Audit**: May 1, 2026 (quarterly)

---

_This document demonstrates HoloScript's commitment to commons-based governance. If Hololand can be built with public APIs, so can your platform. Compete freely._

© 2026 HoloScript Foundation
