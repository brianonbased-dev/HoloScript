# HoloScript Feature Migration Guide

> Historical migration reference: this page intentionally includes legacy package names to document old-to-new mappings during the HoloScript/Hololand split.

## Overview

Starting in January 2026, HoloScript underwent an architectural refactoring to separate **language concerns** from **runtime/platform concerns**. This document explains what moved, why, and how to update your projects.

## The Split

### HoloScript (Language Layer)

- **Focus**: Declarative syntax, parser, compiler, traits system
- **Stays in**: `@holoscript/*` packages
- **Repo**: [HoloScript](https://github.com/brianonbased-dev/HoloScript)
- **Version**: 2.1.0+

### Hololand (Runtime & Platform Layer)

- **Focus**: Rendering, physics, audio, networking, platform adapters
- **Moved to**: `@hololand/*` packages
- **Repo**: [Hololand](https://github.com/brianonbased-dev/Hololand)
- **Version**: 1.0.0+

## Features That Migrated

### Audio Features

| Former Location             | New Location      | Migration Type | Impact                                   |
| --------------------------- | ----------------- | -------------- | ---------------------------------------- |
| `@holoscript/spatial-audio` | `@hololand/audio` | Merged         | Traits unchanged; implementation moved   |
| `@holoscript/voice`         | `@hololand/voice` | Moved          | Use `@voice_recognition` trait as before |

**Traits remain the same:**

- `@spatial_audio` — 3D positional audio
- `@ambisonics` — Ambisonic spatial audio
- `@hrtf` — Head-related transfer function
- `@reverb_zone` — Acoustic reverb simulation
- `@audio_occlusion` — Environmental audio filtering
- `@voice_recognition` — Voice input processing

**Update your imports:**

```typescript
// OLD (deprecated)
import { SpatialAudio } from '@holoscript/spatial-audio';

// NEW
import { SpatialAudio } from '@hololand/audio';
```

### Networking & State Sync

| Former Location           | New Location        | Migration Type | Impact                        |
| ------------------------- | ------------------- | -------------- | ----------------------------- |
| `@holoscript/network`     | `@hololand/network` | Merged         | Traits unchanged              |
| `@holoscript/multiplayer` | `@hololand/network` | Merged         | Unified under network package |
| `@holoscript/state-sync`  | `@hololand/network` | Merged         | CRDT sync moved               |

**Traits remain the same:**

- `@networked` — Object syncs across network
- `@synced` — Specific properties sync
- `@persistent` — State persists between sessions
- `@owned` — Has network ownership
- `@host_only` — Host-only modification
- `@co_located` — Local multiplayer support
- `@remote_presence` — Remote player avatars
- `@shared_world` — Shared world state

**Update your imports:**

```typescript
// OLD (deprecated)
import { MultiplayerManager } from '@holoscript/multiplayer';
import { StateSyncEngine } from '@holoscript/state-sync';

// NEW (unified)
import { NetworkManager, CRDTSync } from '@hololand/network';
```

### Rendering & Graphics

| Former Location   | New Location         | Migration Type | Impact                        |
| ----------------- | -------------------- | -------------- | ----------------------------- |
| `@holoscript/gpu` | `@hololand/renderer` | Merged         | GPU compute remains available |
| `@holoscript/lod` | `@hololand/lod`      | Moved          | LOD system unified            |

**Traits remain the same:**

- `@compute` — GPU compute shader
- `@gpu_particle` — GPU particles
- `@gpu_physics` — GPU physics simulation
- `@gpu_buffer` — GPU memory buffer

### Asset Loading & Streaming

| Former Location         | New Location          | Migration Type | Impact                 |
| ----------------------- | --------------------- | -------------- | ---------------------- |
| `@holoscript/streaming` | `@hololand/streaming` | Moved          | Asset pipeline unified |

**Traits remain the same:**

- `@gaussian_splat` — Gaussian splat rendering
- `@nerf` — Neural radiance field
- `@volumetric_video` — Volumetric video playback
- `@photogrammetry` — Photogrammetry models

### Physics & Animation

| Former Location              | New Location          | Migration Type | Impact                 |
| ---------------------------- | --------------------- | -------------- | ---------------------- |
| `@holoscript/physics-joints` | `@hololand/world`     | Merged         | Physics engine unified |
| `@holoscript/ik`             | `@hololand/animation` | Merged         | IK solvers moved       |

**Traits remain the same:**

- `@physics` — Rigidbody physics
- `@collidable` — Collision detection
- `@rigidbody` — RigidBody configuration
- `@joint` — Physics joints (hinge, fixed, etc.)
- `@cloth` — Cloth simulation
- `@fluid` — Fluid dynamics
- `@soft_body` — Soft body physics
- `@destruction` — Destructible objects
- `@ik` — Inverse kinematics
- `@skeleton` — Skeletal animation
- `@body` — Body tracking

### Accessibility & Haptics

| Former Location             | New Location              | Migration Type | Impact                         |
| --------------------------- | ------------------------- | -------------- | ------------------------------ |
| `@holoscript/accessibility` | `@hololand/accessibility` | Moved          | Accessibility features unified |
| `@holoscript/haptics`       | `@hololand/haptics`       | Moved          | Haptic feedback moved          |

**Traits remain the same:**

- `@accessible` — Accessibility compliance
- `@alt_text` — Alternative text descriptions
- `@spatial_audio_cue` — Audio accessibility cues
- `@sonification` — Data sonification
- `@subtitle` — Subtitle support
- `@haptic` — Haptic feedback

### Spatial & Navigation

| Former Location          | New Location           | Migration Type | Impact                        |
| ------------------------ | ---------------------- | -------------- | ----------------------------- |
| `@holoscript/navigation` | `@hololand/navigation` | Moved          | Navigation systems            |
| `@holoscript/portals`    | `@hololand/portals`    | Moved          | Portal/teleportation          |
| `@holoscript/pcg`        | `@hololand/pcg`        | Moved          | Procedural content generation |

**Traits remain the same:**

- `@plane_detection` — Plane detection (ARKit, ARCore)
- `@mesh_detection` — Mesh detection
- `@anchor` — Spatial anchor
- `@persistent_anchor` — Persistent spatial anchor
- `@navigation_mesh` — NavMesh for pathfinding
- `@portal_entrance` — Portal entry point
- `@portal_exit` — Portal exit point

### AI & LLM

| Former Location   | New Location   | Migration Type | Impact                |
| ----------------- | -------------- | -------------- | --------------------- |
| `@holoscript/llm` | `@hololand/ai` | Merged         | LLM inference unified |

**Traits remain the same:**

- `@llm_agent` — LLM-powered agent
- `@behavior_tree` — Behavior tree AI
- `@goal_oriented` — Goal-based AI
- `@memory` — Agent memory/context
- `@perception` — Agent perception system

## Migration Checklist

### Step 1: Update Package Imports

Replace all imports from `@holoscript/*` runtime packages with `@hololand/*`:

```bash
# Before
npm install @holoscript/spatial-audio @holoscript/network @holoscript/streaming

# After
npm install @hololand/audio @hololand/network @hololand/streaming
```

### Step 2: Update Import Statements

```typescript
// OLD
import { SpatialAudioEngine } from '@holoscript/spatial-audio';
import { NetworkManager } from '@holoscript/network';
import { StreamingManager } from '@holoscript/streaming';

// NEW
import { SpatialAudioEngine } from '@hololand/audio';
import { NetworkManager } from '@hololand/network';
import { StreamingManager } from '@hololand/streaming';
```

### Step 3: Update Configuration

If you're using MCP or Claude, update your configuration files:

```json
{
  "mcpServers": {
    "holoscript": {
      "command": "npx",
      "args": ["@holoscript/mcp-server"]
    },
    "hololand": {
      "command": "npx",
      "args": ["@hololand/mcp-server"]
    }
  }
}
```

### Step 4: Verify .holo and .hsplus Files

**Good news**: Your `.holo` and `.hsplus` files don't need changes! All traits continue to work:

```hsplus
orb@shared {
  @grabbable
  @networked        // Still works — now backed by @hololand/network
  @spatial_audio    // Still works — now backed by @hololand/audio
  @glowing

  position: [0, 1, -2]
  color: "#00ffff"
}
```

### Step 5: Test Your Application

Run your application with the new runtime packages:

```bash
npm install
npm run build
npm run dev
```

## Common Issues & Solutions

### Issue: "Cannot find module '@holoscript/spatial-audio'"

**Solution**: Update your import:

```typescript
import { SpatialAudio } from '@hololand/audio';
```

### Issue: "NetworkManager is not exported from '@holoscript/network'"

**Solution**: Import from the unified Hololand network package:

```typescript
import { NetworkManager, CRDTSync } from '@hololand/network';
```

### Issue: Traits not working in compiled output

**Ensure**:

1. You're using HoloScript 2.1.0+ for language/parsing
2. You're using Hololand 1.0.0+ runtime adapters
3. Both packages are installed: `npm install @holoscript/core @hololand/renderer`

### Issue: "my-runtime-adapter is not compatible"

**Solution**: Check if your adapter was migrated:

- `@holoscript/three-adapter` → `@hololand/three-adapter`
- `@holoscript/babylon-adapter` → `@hololand/babylon-adapter`
- `@holoscript/unity-adapter` → `@hololand/unity-adapter`
- `@holoscript/vrchat-export` → `@hololand/vrchat-export`

Update your package.json and imports accordingly.

## Architecture Diagram

```text
┌─────────────────────┐
│     Your App        │
└──────────┬──────────┘
           │
     ┌─────┴─────┐
     │           │
┌────▼─────┐  ┌─▼──────────┐
│HoloScript │  │  Hololand  │
│ (Language)│  │  (Runtime) │
├───────────┤  ├────────────┤
│ @holo /*  │  │@hololand/*│
│Core: 2.1  │  │Core: 1.0   │
│CLI: 2.1   │  │Audio       │
│Runtime: 2.1│ │Network     │
│Traits: 157 │ │Renderer    │
│Parser      │ │Physics     │
└───────────┘  └────────────┘
```

## Support & Questions

- **HoloScript Issues**: [GitHub Issues (HoloScript repo)](https://github.com/brianonbased-dev/HoloScript/issues)
- **Hololand Issues**: [GitHub Issues (Hololand repo)](https://github.com/brianonbased-dev/Hololand/issues)
- **Documentation**: See [docs/integration/](../integration/) for integration guides

## Phased Deprecation Timeline

| Phase            | Timeline     | Action                                     |
| ---------------- | ------------ | ------------------------------------------ |
| **Announcement** | Jan 2026     | Packages migrated; old packages deprecated |
| **Warning**      | Feb-Mar 2026 | npm warnings when using old packages       |
| **Removal**      | Apr 2026+    | Old packages removed from npm              |

**Recommendation**: Update your projects by **March 2026** to avoid disruption.

## FAQ

**Q: Do I need to rewrite my .holo files?**  
A: No. Your `.holo` and `.hsplus` files work unchanged.

**Q: Will my traits still work?**  
A: Yes. All 157 traits continue to work exactly as documented.

**Q: Can I mix HoloScript 2.0 and Hololand packages?**  
A: Not recommended. Use HoloScript 2.1+ with Hololand 1.0+.

**Q: Where did the MCP server go?**  
A: The `@holoscript/mcp-server` is still in the HoloScript repo. A separate `@hololand/mcp-server` is available for runtime features.

**Q: Can I use Hololand without HoloScript?**  
A: Technically yes, but Hololand is optimized for HoloScript-compiled code. Using Hololand directly requires more manual setup.
