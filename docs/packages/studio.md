# Studio — Visual IDE

**Desktop and browser-based visual development environment for HoloScript.** Drag-and-drop scene building, real-time preview, and multi-platform export.

## Overview

HoloScript Studio is a visual IDE for creating 3D worlds without writing code. Exports to any HoloScript format (.holo, .hsplus, .hs) or directly to target platforms (Unity, Godot, WebGPU, etc.).

## Installation

### Desktop (Electron)

```bash
# macOS / Windows / Linux
brew install holoscript-studio
# or download from https://studio.holoscript.dev

# Launch
open -a HoloScriptStudio
```

### Browser

```txt
https://studio.holoscript.dev/  # No installation needed
```

## Quick Start

### Create New Project

1. **Open Studio** → File → New Project
2. **Select template** → Empty, Game, Marketplace
3. **Set target platform** → WebGPU, Godot, Unity, VRChat, etc.
4. **Start building**

### The Workspace

```text
┌─────────────────────────────────────────┐
│ Menu Bar       File  Edit  View  Help    │
├──────────────────────────────────────────┤
│ ┌────────┐ ┌──────────────┐ ┌──────────┐│
│ │ Assets │ │   Viewport   │ │Properties││
│ │        │ │  (3D Preview)│ │          ││
│ │ panel  │ │              │ │ panel    ││
│ └────────┘ └──────────────┘ └──────────┘│
│ ┌──────────────────────────────────────┐ │
│ │ Hierarchy / Timeline                  │ │
│ └──────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

## Building Scenes

### Add Objects

1. Click **Add** button → Choose shape
2. Drag into viewport
3. Position with mouse or properties panel

```text
Shapes Available:
- Primitives: Cube, Sphere, Cylinder, Cone, Plane
- 3D Models: Humanoid, Robot, Vehicle, Building
- VR Objects: Grabbable cube, UI panel, trigger zone
- Advanced: Custom mesh, imported model
```

### Applying Traits

Select object → Click **Traits** panel → Add:

```holoscript
Common Traits:
✓ @grabbable    (Make interactive)
✓ @physics      (Add physics simulation)
✓ @animated     (Allow animations)
✓ @networked    (Multiplayer sync)
✓ @audio        (Sound effects)
```

### Setting Properties

#### Transform

- Position (X, Y, Z)
- Rotation (Yaw, Pitch, Roll)
- Scale (X, Y, Z)

#### Appearance

- Geometry: cube, sphere, etc.
- Material: Color, Emission, Metallic, Roughness
- Texture: Upload image or select preset

**Physics** (if @physics trait)

- Mass: 0-1000 kg
- Restitution: 0-1 (bounciness)
- Friction: 0-1 (grip)

#### Behavior

- Actions: Define triggers and responses
- Animation: Add keyframe animations
- Audio: Attach sound effects

## Scripting

### Visual Logic Editor

1. Select object
2. Click **Actions** tab
3. **Add action** → Choose trigger (OnGrab, OnCollide, etc.)
4. **Add steps** → Drag visual nodes to create flow

```json
[OnGrab] → [Play Sound] → [Emit Particles] → [Change Color]
```

### Code Mode

Switch to code editing:

```holo
composition "Game" {
  template "Player" {
    @grabbable
    @physics

    state { health: 100 }

    action attack(target) {
      target.health -= 20
    }
  }
}
```

## Animation Timeline

Create keyframe animations:

1. Select object
2. Click **Timeline** → **Add Animation**
3. Drag timeline scrubber
4. Set keyframes for:
   - Position
   - Rotation
   - Scale
   - Color
   - Opacity
   - Custom properties

Easing options: Linear, Ease-in, Ease-out, Ease-in-out, Custom curve

## Real-time Preview

### Play Mode

- **Play** button → Test scene in editor
- Physics simulation runs
- Interactions work (grab, point, etc.)
- Network sync simulated
- Audio plays

### VR Preview

- **VR Preview** button → Test on VR headset
- Use hand controllers for interaction
- See exactly how it feels

## Multiplayer Testing

Start **Test Server** to simulate networking:

```yaml

Players:
☐ Player 1 (you)
☐ Player 2 (simulated)
☐ Player 3 (simulated)

Sync Rate: 20 Hz
Network Latency: Normal

```

## Asset Management

### Import Assets

1. **Assets** panel → **+** button
2. Choose file: `.glb`, `.fbx`, `.gltf`, `.png`, `.mp3`, `.mp4`
3. Studio auto-converts to optimal format

### Asset Library

Browse pre-made:

- 3D Models: Characters, vehicles, props
- Animations: Walking, running, gestures
- Audio: Sounds, music, voice
- Textures: Materials, patterns, effects

## Code Generation

### Export to Code

1. **File** → **Export**
2. Choose format:
   - `.holo` — Portable, AI-friendly
   - `.hsplus` — Full programming
   - `.hs` — Classic HoloScript

### Export to Platform

1. **File** → **Export**
2. Choose target:
   - WebGPU, Godot, Unity, Unreal, VRChat
   - iOS, Android, Vision OS, OpenXR

Studio handles all compilation steps automatically.

## Collaboration

### Share Project

1. **File** → **Share**
2. Copy link or send to teammates
3. Others open in browser with:
   - View-only (spectator)
   - Edit (if invited)
   - Admin (if owner)

### Real-time Editing

Multiple users can edit simultaneously:

- Each gets different cursor color
- Changes sync in real-time
- Conflict resolution automatic

### Version Control

**File** → **Version History**

- Automatic saves every 2 minutes
- Restore to any point in time
- Diff view shows changes

## Templates

### Getting Started Templates

```yaml

Templates:

- Empty Scene
- First-Person Shooter
- Multiplayer Arena
- Marketplace Showcase
- VRChat World
- Mobile AR Experience
- Godot Game
- Web Experience

```

Choose template → Start with structured project

## Performance Optimization

### Check Performance

**Tools** → **Performance Monitor**

```yaml

FPS: 60
Memory: 128 MB / 256 MB (50%)
Draw Calls: 45
Triangles: 125,000

```

### Optimization Tips

1. **Reduce polygon count** — Use LOD models
2. **Batch objects** — Combine similar geometry
3. **Use InstancedMesh** — For repeated objects
4. **Remove unused assets** — Studio shows what's not used
5. **Optimize physics** — Mark non-moving objects as static

## Keyboard Shortcuts

```text

R       Rotate tool
W       Move tool
S       Scale tool
P       Toggle play/pause
O       Toggle orbit camera
F       Frame selected
Ctrl+S  Save project
Ctrl+Z  Undo
Ctrl+Y  Redo
Delete  Remove selected

```

## Troubleshooting

### Scene won't preview

1. Check **Console** tab for errors
2. Verify all objects have valid geometry
3. Try **Tools** → **Validate Project**

### Export fails

1. Ensure project is saved
2. Check target platform compatibility
3. Look for missing assets (red indicators)
4. Try **Tools** → **Repair Project**

### Performance slow

1. Reduce object count
2. Lower quality settings
3. Check **Performance Monitor**
4. Use **LOD Generator** for distant objects

## See Also

- [Core Package](../packages/core.md) — Under-the-hood compilation
- [CLI](../packages/cli.md) — Command-line export options
- [Compilers](../compilers/) — Platform-specific export guides
