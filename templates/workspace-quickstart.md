# HoloScript Workspace Quickstart

> Build production spatial computing platforms and autonomous agent habitats on the AI-Native Spatial OS.

---

## What You Can Build

| Platform Type          | Examples                                  | Time to MVP | Difficulty   |
| ---------------------- | ----------------------------------------- | ----------- | ------------ |
| **VR Social**          | VR social platform, immersive events      | 3-6 months  | Advanced     |
| **Corporate Training** | VR safety training, onboarding simulations| 1-3 months  | Intermediate |
| **Robotics Platform**  | ROS2/Gazebo simulation, digital twin       | 2-4 months  | Advanced     |
| **AR E-Commerce**      | "Try before you buy" furniture app        | 1-2 months  | Beginner     |
| **Digital Twin**       | IoT platform with DTDL output            | 2-4 months  | Intermediate |
| **VR Game**            | Multi-platform game (Unity/Unreal/Web)   | 3-6 months  | Intermediate |

HoloLand, the reference VR social platform, is built entirely on public HoloScript APIs.

---

## 30-Minute Quickstart

### Step 1: Install HoloScript

```bash
npm install -g @holoscript/cli
# or
brew install holoscript
```

### Step 2: Create Your First World

**`my-world.holo`**:

```holo
composition "MyWorld" {
  scene {
    environment {
      skybox: "procedural_sky"
      lighting: "sunset_warm"
      @spatial_audio
    }

    object "SpawnPoint" {
      @spawn_point
      position: [0, 1, 0]
    }

    object "Ground" {
      @physics(type: "static")
      geometry: "plane"
      scale: [100, 1, 100]
      material: {
        color: "#2a5a2a"
        roughness: 0.8
      }
    }

    object "InteractiveCube" {
      @grabbable
      @physics
      @networked
      geometry: "box"
      position: [0, 1.5, -3]
      material: {
        color: "#ff6b6b"
        metalness: 0.5
      }
    }
  }
}
```

### Step 3: Preview Locally

```bash
holoscript preview my-world.holo
```

Opens a browser preview at `http://localhost:3000`.

### Step 4: Add Multiplayer

```typescript
import { parseHoloScript } from '@holoscript/core/parser';
import { getHololandClient, getStreamProtocol } from '@holoscript/core';

const composition = parseHoloScript(myWorldSource);
const client = getHololandClient();

await client.connectToHololand({
  serverUrl: 'wss://my-server.example.com',
  authToken: 'your-auth-token',
});

await client.registerWorld(composition);
await client.joinWorld(composition.metadata.id);

const protocol = getStreamProtocol();
protocol.sendEntityUpdate({
  entityId: 'player-1',
  position: { x: 0, y: 1, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
});
```

### Step 5: Compile to Multiple Targets

```bash
# Compile to Unity C#
holoscript compile my-world.holo --target=unity --output=./unity-export

# Compile to Unreal C++
holoscript compile my-world.holo --target=unreal --output=./unreal-export

# Compile to WebXR (React Three Fiber)
holoscript compile my-world.holo --target=r3f --output=./web-export

# Compile to URDF for robotics
holoscript compile my-world.holo --target=urdf --output=./robot.urdf
```

---

## Platform Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│              YOUR PLATFORM (Application Layer)              │
│  ├─ Branding, UI/UX, Features                              │
│  ├─ Business Logic (users, payments, etc.)                   │
│  └─ Custom Systems (specific to your platform)             │
├─────────────────────────────────────────────────────────────┤
│           PLATFORM SERVICES (Infrastructure)                │
│  ├─ Multiplayer (CRDT, WebRTC, voice chat)               │
│  ├─ Physics (Rapier, Ammo.js)                              │
│  ├─ Rendering (Three.js, Babylon, Unity, Unreal)         │
│  ├─ Storage (worlds, assets, user data)                    │
│  └─ Auth (users, permissions, moderation)                │
├─────────────────────────────────────────────────────────────┤
│         HOLOSCRIPT (AI-Native Spatial OS)                   │
│  ├─ Cognitive (uAAL), Perceptual (SNN), Economic (x402)    │
│  ├─ Parser, Compiler, Runtime                              │
│  ├─ Trait system (verify via `find packages/core/src/traits -name "*.ts" -not -name "*.test.*" | wc -l`) │
│  └─ Multi-target compilation (verify via `find packages/core/src -name "*Compiler.ts" -not -name "CompilerBase*" -not -name "*.test.*" | wc -l`) │
└─────────────────────────────────────────────────────────────┘
```

HoloScript handles spatial computing primitives. You build platform-specific features on top.

---

## Core Systems

### World Management

```typescript
import { parseHoloScript } from '@holoscript/core/parser';
import { getHololandClient } from '@holoscript/core';

class WorldManager {
  async createWorld(holoSource: string, metadata: WorldMetadata) {
    const composition = parseHoloScript(holoSource);
    const client = getHololandClient();
    const worldId = await client.registerWorld({
      ...composition,
      metadata: { ...composition.metadata, ...metadata },
    });
    return worldId;
  }

  async loadWorld(worldId: string) {
    const client = getHololandClient();
    const world = await client.joinWorld(worldId);
    const renderer = new ThreeJSRenderer({ canvas, shadows: true });
    renderer.initialize(world);
    renderer.start();
  }
}
```

### Multiplayer Networking

```typescript
import { getStreamProtocol } from '@holoscript/core';

class MultiplayerSystem {
  private protocol = getStreamProtocol();

  updateLocalPlayer(playerId: string, position: Vector3, rotation: Euler) {
    this.protocol.sendEntityUpdate({
      entityId: playerId,
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
    });
  }
}
```

### Asset Management

```typescript
import { AssetManifest, SmartAssetLoader } from '@holoscript/core';

class AssetSystem {
  private manifest = new AssetManifest('platform-assets');
  private loader = new SmartAssetLoader({ maxConcurrent: 4 });

  async uploadAsset(file: File, metadata: AssetMetadata) {
    const url = await this.cdn.upload(file);
    this.manifest.addAsset({
      id: metadata.id,
      path: url,
      name: metadata.name,
      type: inferAssetType(file.name),
    });
  }

  async loadAssets(assetIds: string[]) {
    return this.loader.loadBatch(assetIds);
  }
}
```

---

## Deployment Paths

| Path | Best For | Trade-offs |
|------|----------|------------|
| **HoloScript Runtime (WebXR)** | Fastest iteration, cross-platform | Limited to WebXR capabilities |
| **Compile to Unity** | Native Quest, iOS, Android, Steam | App store review, slower iteration |
| **Compile to Unreal** | High-fidelity PC VR, PSVR2 | Larger binaries, powerful hardware required |

### WebXR (Fastest)

```bash
npm run build
vercel deploy
```

### Unity (Production Native)

```bash
holoscript compile my-world.holo --target=unity --output=./unity-export
# Open in Unity, build for Android (Quest) or iOS
```

---

## HoloScript Foundation

The HoloScript Foundation is a neutral, community-driven nonprofit governing the AI-Native Spatial OS.

- **No owner advantage** — Even HoloLand uses public APIs only.
- **Community governance** — Major decisions via RFC process.
- **Open ecosystem** — MIT licensed. Build competing platforms freely.

### Governance Snapshot

| Body | Role | Decision Scope |
|------|------|----------------|
| **Board of Directors** | Fiduciary + strategic | Budget, partnerships, ED hiring |
| **Technical Steering Committee (TSC)** | Technical roadmap | RFC approval, compiler priorities, API stability |
| **Community Committee** | Health + events | Code of Conduct, docs, grants, onboarding |

### RFC Process

1. Draft RFC in the RFCs repo
2. Community discussion (2 weeks)
3. TSC review (1 week)
4. Revision
5. Final comment period (1 week)
6. TSC decision (consensus or 2/3 vote)
7. Implementation

All RFCs are public at `github.com/holoscript/rfcs`.

---

## Market Context

HoloScript is positioned across several verticals. Key strategic positioning:

- **Robotics & IoT** — Direct URDF/SDF/DTDL compilation output; no other visual authoring tool fills this gap.
- **Healthcare & Medical Training** — High regulatory barriers create defensible moat; trait system enables haptic feedback authoring without custom physics code.
- **Film & Media** — Native OpenUSD output aligns with industry standardization wave.
- **Architecture (AEC)** — Multi-target compilation eliminates single-platform lock-in.
- **Education** — Built-in xAPI event emission from trait interactions reduces LMS integration work.

### Competitive Differentiation

| Competitor Landscape | HoloScript Angle |
|---------------------|------------------|
| Visualization-focused tools (Forma, Enscape, Twinmotion) | Programmatic scene composition + multi-target export |
| Game engines (Unity, Unreal, Godot) | Unified authoring layer above engines, not replacement |
| Robotics simulators (Isaac, Gazebo) | Visual scene authoring that outputs URDF/SDF/DTDL |
| VR training (Osso VR, ImmersiveTouch) | Trait-level haptic + procedural authoring |

---

## FAQ

**Do I need permission to build a competing platform?**
No. HoloScript is MIT licensed. Build freely.

**Will updates break my platform?**
Semantic versioning guarantees patch/minor compatibility. Major versions are rare and include migration guides.

**Can I mix HoloScript with native code?**
Yes. HoloScript compiles to native code. Mix `.holo` files with hand-written Unity C# or Unreal C++.

**What does HoloScript cost?**
Free. MIT licensed, no royalties, no runtime fees.

---

## Next Steps

1. Run the 30-minute quickstart above.
2. Explore the [examples directory](../examples/quickstart/) for `.holo` snippets.
3. Study HoloLand's architecture as a reference implementation.
4. Join the community on Discord or GitHub Discussions.
5. Build your platform — start small, iterate.

---

## Resources

- **Trait Reference**: See `packages/core/src/traits/` (live inventory).
- **Compiler Targets**: Verify via `find packages/core/src -name "*Compiler.ts" -not -name "CompilerBase*" -not -name "*.test.*"`.
- **Live Metrics**: `docs/NUMBERS.md` — single source of truth for ecosystem counts.
- **Foundation Docs**: `docs/archive/FOUNDATION.md` (full governance detail).
- **Competitive Analysis**: `docs/archive/USE_CASE_RESEARCH_COMPREHENSIVE.md` (full vertical research).

---

_The AI-Native Spatial OS is ready. Build the next platform._

