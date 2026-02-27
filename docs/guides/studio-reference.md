# HoloScript Studio - Complete Reference

**Version:** 0.1.0-beta
**Tech Stack:** React 19 + Next.js 15 + Three.js + WebXR
**URL:** [studio.holoscript.net](https://studio.holoscript.net)

---

## Overview

HoloScript Studio is a **web-based IDE** for building VR/AR/XR scenes without writing code. Powered by **Brittney AI**, Studio enables natural language scene generation, real-time collaboration, and one-click publishing.

**Key Features:**
- 🎨 AI-driven scene creation (Brittney assistant)
- 🖌️ Visual shader graph editor
- 🎬 Cinematic camera paths
- 🦴 Character animation editor
- 🤝 Real-time multiplayer editing (CRDT)
- 🚀 One-click publish & share
- 📤 Export to 25+ platforms

---

## Interface Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo] [Creator][Artist][Filmmaker][Expert][Character]    │ Top Bar
│  [New][Open][Save][Publish][VR Mode][Benchmark]           │
├──────────┬──────────────────────────────────────┬──────────┤
│          │                                      │          │
│  Hierarchy│         3D Viewport                 │Properties│ Main Area
│  Panel    │      (WebGL/Three.js Render)       │  Panel   │
│          │                                      │          │
│  [Objects]│      [Transform Gizmos]            │ [Details]│
│  [Assets] │      [Grid & Axes]                 │ [Settings│
│  [Layers] │                                      │  Config] │
│          │                                      │          │
├──────────┴──────────────────────────────────────┴──────────┤
│  💬 Brittney AI │  [Prompt Input Bar]           │ [Send]  │ Bottom Bar
└─────────────────────────────────────────────────────────────┘
```

---

## Top Bar

### Mode Selector

| Icon | Mode | Description | Shortcut |
|------|------|-------------|----------|
| 🎨 | **Creator** | AI scene building, drag-and-drop | `Ctrl+1` |
| 🖌️ | **Artist** | Shader graph, material editor | `Ctrl+2` |
| 🎬 | **Filmmaker** | Camera paths, cinematic timeline | `Ctrl+3` |
| ⚙️ | **Expert** | Code editor (Monaco), debugging | `Ctrl+4` |
| 🦴 | **Character** | Animation editor, skeletal FK | `Ctrl+5` |

### Toolbar Buttons

| Button | Action | Shortcut |
|--------|--------|----------|
| **New** | Create new scene | `Ctrl+N` |
| **Open** | Load scene from file/URL | `Ctrl+O` |
| **Save** | Save scene locally | `Ctrl+S` |
| **Publish** | Generate shareable URL | `Ctrl+P` |
| **VR Mode** | Enter WebXR immersive mode | `V` |
| **Benchmark** | Run performance test (FPS) | `B` |
| **Settings** | Studio preferences | `,` |
| **Help** | Documentation & tutorials | `F1` |

---

## 3D Viewport

### Camera Controls

| Action | Mouse | Touchscreen | VR |
|--------|-------|-------------|-----|
| **Orbit** | Left Click + Drag | 1-Finger Drag | Head Movement |
| **Pan** | Right Click + Drag <br>or Middle Click + Drag | 2-Finger Drag | Controller Stick |
| **Zoom** | Scroll Wheel | Pinch | Controller Trigger |
| **Focus** | Double-Click Object | Double-Tap Object | Look + Trigger |

### Transform Gizmos

With an object selected:

| Key | Gizmo | Action |
|-----|-------|--------|
| `G` | **Move** (Translate) | Drag colored arrows (X=red, Y=green, Z=blue) |
| `R` | **Rotate** | Drag colored circles |
| `S` | **Scale** | Drag colored boxes or center for uniform scale |
| `Esc` | **Cancel** | Reset to original transform |
| `Enter` | **Confirm** | Apply transform |

**Fine Control:**
- `Shift` while dragging = Slow precision mode
- `Ctrl` while dragging = Snap to grid
- `Alt` while dragging = Relative to parent

### Grid & Axes

- **Grid**: XZ plane, 1-unit spacing, fades with distance
- **Axes**: Red (X), Green (Y), Blue (Z)
- **Origin**: Yellow sphere at (0,0,0)

Toggle visibility: `Ctrl+G` (grid), `Ctrl+H` (axes)

### Selection

- **Single Select**: Left-click object
- **Multi-Select**: `Shift` + Click
- **Box Select**: `Ctrl` + Drag
- **Deselect All**: Click empty space or press `Escape`

---

## Brittney AI Panel

### Opening the Panel

- Click **💬** icon (right side)
- Press `Ctrl+B`
- Type `/` in viewport (quick prompt)

### Chat Interface

**Brittney understands:**
- Natural language scene descriptions
- Requests for changes ("make the sky purple")
- Technical questions ("how do I add physics?")
- Debugging ("why isn't my NPC responding?")
- Optimization ("make this faster")

**Example Prompts:**
```
Create a medieval castle with towers and a moat

Add a flying dragon that circles the castle

Make the dragon breathe fire when I click it

Optimize this scene for Quest 2

Export this to Unity with C# scripts
```

### Scene Generator Tab

1. **Describe your scene** in the text area
2. **Select templates** (optional): Battle Royale, Escape Room, D&D Dungeon, etc.
3. Click **Generate**
4. Brittney creates HoloScript code
5. Scene renders in 3D viewport

### Scene Critique Tab

1. Click **Analyze Scene**
2. Brittney evaluates:
   - ✅ What works well
   - ⚠️ Potential issues (performance, usability)
   - 💡 Suggestions for improvement
   - 🎨 Aesthetic recommendations

3. Click suggested changes to apply them

### AI Material Tab

1. Select an object
2. Describe desired material: "holographic blue glass with rainbow reflections"
3. Click **Generate Shader**
4. Preview in real-time
5. Tweak parameters or regenerate

---

## Hierarchy Panel (Left)

### Objects Tree

Displays all scene objects in parent-child hierarchy:

```
📦 Scene
├─ 🌍 Environment
│  ├─ ☀️ DirectionalLight
│  └─ 🌫️ Fog
├─ 📐 Ground
├─ 🏰 Castle
│  ├─ 🗼 Tower1
│  └─ 🗼 Tower2
└─ 🐉 Dragon
   ├─ 🔥 FireBreath (ParticleSystem)
   └─ 🎵 RoarSound
```

### Context Menu (Right-Click)

- **Duplicate**: `Ctrl+D`
- **Delete**: `Delete` or `Backspace`
- **Rename**: `F2`
- **Parent To**: Drag onto another object
- **Unparent**: Drag to root level
- **Hide/Show**: `H` (toggle visibility)
- **Lock/Unlock**: `L` (prevent selection)

### Filters

- **Search**: `Ctrl+F` - Find objects by name
- **Type Filter**: Show only lights, cameras, meshes, etc.
- **Layer Filter**: Show/hide by layer

---

## Properties Panel (Right)

### Transform

- **Position** (X, Y, Z): World-space coordinates
- **Rotation** (X, Y, Z): Euler angles in degrees
- **Scale** (X, Y, Z): Uniform or per-axis

**Reset buttons**: Click ↺ to reset to default (0 for position/rotation, 1 for scale)

### Object Properties

- **Name**: Object identifier (used in code)
- **Type**: Geometry type (box, sphere, cylinder, etc.)
- **Color**: Base color (hex or RGB)
- **Material**: PBR properties (metalness, roughness, emissive)
- **Visible**: Show/hide object
- **Cast Shadow**: Object creates shadows
- **Receive Shadow**: Object receives shadows

### Traits

List of applied traits with configuration:

```
@physics
  ├─ mass: 1.0
  ├─ bounciness: 0.5
  └─ friction: 0.8

@grabbable
  ├─ grab_distance: 0.5
  └─ two_handed: false

@llm_agent
  ├─ model: "claude-3-5-sonnet"
  ├─ temperature: 0.7
  └─ tools: [...]
```

**Add Trait**: Click `+ Add Trait` button, search, configure

**Remove Trait**: Click `X` next to trait name

### State

Custom object state (key-value pairs):

```yaml
state:
  health: 100
  mana: 50
  inventory: []
  is_open: false
```

**Add State**: Click `+ Add State Variable`

---

## Creator Mode 🎨

**Purpose:** AI-assisted scene building for non-programmers

### Features
- **Template Library**: Pre-built scenes (Battle Royale, Coffee Shop, etc.)
- **Object Library**: Drag-and-drop props
- **Brittney Integration**: Natural language commands
- **Real-time Preview**: WYSIWYG editing

### Workflow
1. Start with template or empty scene
2. Describe what you want to Brittney
3. Brittney generates objects
4. Drag to reposition
5. Tweak in Properties panel
6. Publish when done

---

## Artist Mode 🖌️

**Purpose:** Visual shader & material creation

### Shader Graph Editor

**Node-Based Editing:**
- **Input Nodes**: UV, Position, Normal, Time
- **Math Nodes**: Add, Multiply, Lerp, Clamp
- **Texture Nodes**: Sample2D, Cubemap
- **Output Node**: FragColor (RGBA)

**Workflow:**
1. Right-click canvas → Add Node
2. Connect nodes by dragging from output to input
3. Preview updates in real-time
4. Export to GLSL or save as .shader

### Built-In Shader Templates
- Fresnel Rim Light
- Normal Mapping
- Parallax Occlusion Mapping
- Holographic Display
- Toon Shading
- Dissolve Effect

### Keyboard Shortcuts
- `Space`: Open node menu
- `Delete`: Remove selected nodes
- `Ctrl+D`: Duplicate selection
- `Ctrl+G`: Group nodes
- `Ctrl+Shift+D`: Preview shader on selected object

---

## Filmmaker Mode 🎬

**Purpose:** Cinematic camera control & animation

### Camera Path Recording

1. Click **Record Path** button
2. Move camera through scene (orbit, pan, zoom)
3. Click **Stop Recording**
4. Path saved as spline curve

### Timeline Editor

```
┌───────────────────────────────────────────────────┐
│  [Play] [Pause] [Stop]  ⏱️ 00:05.23 / 00:30.00  │
├───────────────────────────────────────────────────┤
│  Camera   ▬▬▬▬▬●▬▬▬▬▬▬▬▬▬▬▬●▬▬▬▬▬▬▬▬▬▬▬     │
│  Light    ▬▬▬▬▬▬▬▬▬●▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬     │
│  Dragon   ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬●▬▬▬▬▬▬▬▬▬▬     │
└───────────────────────────────────────────────────┘
```

**Features:**
- **Keyframe Editing**: Click ● to set keyframes
- **Interpolation**: Linear, Ease-In, Ease-Out, Bezier
- **Playback Speed**: 0.25x to 2x
- **Loop Mode**: Once, Loop, Ping-Pong

### Export Options
- **Video**: MP4 (H.264), WebM
- **Image Sequence**: PNG frames
- **Camera Data**: JSON for external tools

---

## Expert Mode ⚙️

**Purpose:** Direct HoloScript code editing

### Monaco Code Editor

**Features:**
- Syntax highlighting
- Auto-completion (Ctrl+Space)
- Error squiggles
- Multi-cursor editing (Ctrl+Alt+Up/Down)
- Find & Replace (Ctrl+F)
- Go to Definition (F12)
- Formatting (Shift+Alt+F)

### Side-by-Side View

Split view: Code (left) + 3D Preview (right)

Changes in code **update preview in real-time**.

### Debugging Tools
- **Console**: View errors & warnings
- **AST Explorer**: Inspect parsed syntax tree
- **Performance Profiler**: Identify bottlenecks
- **Trait Inspector**: See active traits per object

---

## Character Mode 🦴

**Purpose:** Character animation & rigging

### GLB Import

1. Click **Import Character**
2. Select .glb file with skeleton
3. Character loads with bones visible

### FK (Forward Kinematics) Animation

**Bone Selection:**
- Click bone in viewport
- Or select from bone tree panel

**Rotation Controls:**
- Drag rotation gizmo
- Or use sliders (X, Y, Z rotation)

### Animation Clip Recording

1. Set character to T-pose
2. Click **Record Clip**
3. Animate bones frame-by-frame
4. Click **Stop Recording**
5. Name clip (e.g., "Wave", "Jump", "Sit")

### Animation Library

Save clips to reuse:
- **Play**: Preview animation
- **Export**: Save as .anim file
- **Import**: Load from file

---

## Collaboration

### Real-Time Multi-User Editing

**Start Collaborating:**
1. Click **Share** button
2. Copy invite URL
3. Send to collaborators
4. They join instantly (no signup required)

**Features:**
- **Multi-cursor awareness**: See where others are editing
- **Live sync**: Changes appear in real-time
- **Conflict resolution**: CRDT (Yjs) prevents overwrites
- **Voice chat**: Optional (requires browser permission)

### Presence Indicators

- **Avatar icons**: Show active users in top-right
- **Colored cursors**: Each user has unique color
- **Selection highlights**: See what others selected

---

## VR Mode

### Entering VR

1. Connect VR headset (Quest, Vision Pro, PC VR)
2. Open Studio in VR-capable browser (Chrome, Edge, Firefox Reality)
3. Click **VR Mode** button
4. Grant permission if prompted
5. Put on headset

### VR Controls

**Meta Quest 2/3:**
- **Grip buttons**: Grab objects
- **Triggers**: Select/Activate
- **Thumbsticks**: Move/Rotate camera
- **Hand Tracking**: Pinch to grab (controller-free)

**Apple Vision Pro:**
- **Look + Pinch**: Select objects
- **Pinch + Drag**: Move objects
- **Two-hand pinch + spread**: Scale

**PC VR (Index, Vive):**
- Similar to Quest controls

### In-VR Editing

- **Place objects**: Grab from menu, position in space
- **Transform**: Pinch opposite corners to scale/rotate
- **Delete**: Throw object off-edge or use menu
- **Undo**: Controller shake gesture

---

## Performance

### Benchmark Tool

**Run Test:**
1. Click **Benchmark** button
2. Studio spawns 1000 objects
3. Measures FPS over 10 seconds
4. Displays results: Min/Avg/Max FPS

**Target Performance:**
- **Desktop**: 60 FPS @ 1000 objects
- **Quest 2**: 72 FPS @ 500 objects
- **Quest 3**: 90 FPS @ 750 objects

### Optimization Tools

**Auto-Optimize** (via Brittney):
```
Optimize this scene for Quest 2
```

Brittney will:
- Enable LOD (Level of Detail)
- Use InstancedMesh for duplicates
- Reduce shadow quality
- Simplify geometry
- Enable frustum culling

**Manual Optimization:**
- **LOD**: Add @lod trait with distance thresholds
- **Instancing**: Use `@instanced` for repeated objects
- **Occlusion Culling**: Enable in Settings > Rendering
- **Shadows**: Lower resolution or disable

---

## Export & Publishing

### One-Click Publish

1. Click **Publish**
2. Studio uploads scene to CDN
3. Returns shareable URL: `studio.holoscript.net/s/abc123`
4. Anyone can view (no account needed)

**Privacy Options:**
- **Public**: Listed in gallery
- **Unlisted**: Only accessible via URL
- **Private**: Requires password

### Multi-Platform Export

**Available Targets (25+):**

**Game Engines:**
- Unity (C# MonoBehaviour)
- Unreal (C++ / Blueprint)
- Godot (GDScript)
- VRChat (UdonSharp)

**Web:**
- WebGPU (standalone HTML)
- React Three Fiber (JSX)
- Babylon.js

**Mobile/XR:**
- visionOS (Swift + RealityKit)
- Android XR (Kotlin)
- iOS ARKit (Swift)

**Robotics:**
- URDF (ROS 2)
- SDF (Gazebo)

**IoT:**
- DTDL (Azure Digital Twins)
- WoT (W3C Thing Description)

**Export Process:**
1. Click **Export**
2. Select target platform
3. Configure options (package name, namespace, etc.)
4. Click **Generate**
5. Download .zip file

---

## Keyboard Shortcuts Reference

### Global

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New scene |
| `Ctrl+O` | Open scene |
| `Ctrl+S` | Save scene |
| `Ctrl+P` | Publish |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
| `Ctrl+B` | Toggle Brittney panel |
| `Ctrl+/` | Toggle console |
| `F1` | Help |
| `F11` | Fullscreen |
| `V` | VR Mode |

### Viewport

| Shortcut | Action |
|----------|--------|
| `G` | Move (translate) |
| `R` | Rotate |
| `S` | Scale |
| `Delete` | Delete selected |
| `Ctrl+D` | Duplicate |
| `H` | Hide/Show |
| `F` | Focus on selected |
| `Numpad .` | Frame all |

### Code Editor (Expert Mode)

| Shortcut | Action |
|----------|--------|
| `Ctrl+Space` | Auto-complete |
| `Ctrl+F` | Find |
| `Ctrl+H` | Find & Replace |
| `F12` | Go to Definition |
| `Shift+F12` | Find References |
| `Ctrl+/` | Comment/Uncomment |
| `Shift+Alt+F` | Format Document |

---

## Settings

### General
- **Theme**: Light / Dark / Auto
- **Language**: English, Spanish, French, German, Japanese
- **Auto-Save**: Interval (1min, 5min, 10min)

### Rendering
- **Anti-Aliasing**: None, FXAA, MSAA x2/x4/x8
- **Shadow Quality**: Low, Medium, High, Ultra
- **Post-Processing**: Bloom, SSAO, Color Grading
- **Grid Size**: 0.5, 1, 2, 5 units

### AI (Brittney)
- **Provider**: OpenAI, Anthropic, Google, Custom
- **API Key**: Your key (stored locally)
- **Model**: GPT-4, Claude 3.5, Gemini 1.5
- **Temperature**: 0-1 (creativity)
- **Max Tokens**: 512, 1024, 2048, 4096

### Collaboration
- **Username**: Display name
- **Cursor Color**: Pick color
- **Voice Chat**: Enable/Disable
- **Show Presence**: Show/Hide other users

### Performance
- **FPS Limit**: 30, 60, 90, 120, Unlimited
- **LOD Distance**: Near, Medium, Far
- **Physics Substeps**: 1-10
- **Enable Frustum Culling**: Yes/No

---

## Troubleshooting

### Scene Won't Load
1. Clear cache (Ctrl+Shift+R)
2. Check console for errors (F12)
3. Verify .holo syntax in Expert mode

### Brittney Not Responding
1. Check AI settings (API key, model)
2. Verify internet connection
3. Check provider status page

### VR Mode Not Working
1. Ensure WebXR-capable browser
2. Connect headset before clicking VR
3. Grant browser permissions

### Performance Issues
1. Run benchmark (B key)
2. Enable optimizations (Settings > Performance)
3. Reduce object count or shadows
4. Use LOD trait

### Export Failed
1. Check scene for errors
2. Verify target platform supported
3. Try different export format

---

## Community & Support

- **Discord**: [discord.gg/holoscript](https://discord.gg/holoscript)
- **GitHub**: [github.com/brianonbased-dev/Holoscript](https://github.com/brianonbased-dev/Holoscript)
- **Docs**: [holoscript.net/guides](https://holoscript.net/guides)
- **Studio Feedback**: [feedback.holoscript.net](https://feedback.holoscript.net)

---

**Happy building in Studio!** 🎨✨
