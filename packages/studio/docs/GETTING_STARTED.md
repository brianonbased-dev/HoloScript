# 🚀 Getting Started with HoloScript Studio

> **Build 3D worlds with natural language. No installation. No coding required.**

HoloScript Studio is an AI-native spatial IDE for the web. In 5 minutes you'll have a working interactive 3D world.

---

## Quick Start (5 minutes)

### 1. Open the Studio

Navigate to **`localhost:3100/create`** (dev) or your deployed URL.

You'll land in **Creator mode** — the simplest, most guided experience.

### 2. Describe Your World

Click the **Brittney** prompt bar at the bottom and type anything:

```
"A cozy coffee shop with warm lighting and jazz music"
"A futuristic space station with neon corridors"
"A D&D dungeon with traps and treasure rooms"
```

Brittney (the AI assistant) generates a HoloScript world definition and populates your scene immediately.

### 3. Explore the 3D Viewport

| Action                 | Result                 |
| ---------------------- | ---------------------- |
| **Left click + drag**  | Orbit camera           |
| **Right click + drag** | Pan                    |
| **Scroll wheel**       | Zoom                   |
| **Click an object**    | Select it              |
| **G**                  | Move selected object   |
| **R**                  | Rotate selected object |
| **S**                  | Scale selected object  |
| **Escape**             | Deselect               |

### 4. Pick a Template (optional)

Click **Assets** → **Templates** tab. Choose from:

- ⚔️ Battle Royale Island
- 🧗 Parkour Tower
- 🕵️ Murder Mystery Mansion
- ☕ Coffee Shop
- 🏰 D&D Dungeon Crawl
- 🎭 Escape Room
- ...and more

Each template loads a fully-wired HoloScript world with game logic, NPCs, and lighting.

### 5. Publish

Click **Publish** in the top-right header to generate a shareable URL. Anyone can view your world in-browser, no install required.

---

## Studio Modes

Switch between modes using the **mode bar** in the header center:

| Mode             | Best For                                     |
| ---------------- | -------------------------------------------- |
| 🎨 **Creator**   | AI-driven scene building, drag-and-drop      |
| 🖌️ **Artist**    | Shader graph editor, materials, VFX          |
| 🎬 **Filmmaker** | Camera paths, cinematic timelines            |
| ⚙️ **Expert**    | Full HoloScript code editor                  |
| 🦴 **Character** | GLB import, skeleton FK, animation recording |

---

## Key Features

### AI Scene Generation (Creator Mode)

Type in plain English. Brittney understands spatial and game concepts:

- **Spatial**: _"Move the fireplace to the left wall"_
- **Game logic**: _"Add 3 zombies that patrol"_
- **Atmosphere**: _"Make it feel like a horror movie"_
- **Iteration**: _"Make the trees taller"_

### Shader Graph Editor (Artist Mode)

Visual node-based shader editor:

1. Switch to **Artist** mode
2. Click **Shader Editor** panel
3. Add nodes from the **Node Library** panel
4. Connect outputs to inputs to build GLSL shaders visually
5. Live preview updates in real-time

**Built-in templates**: Fresnel Rim Light, Normal Mapping, Holographic Display, and more.

### Cinematic Timeline (Filmmaker Mode)

Record camera paths and animate scene objects:

1. Switch to **Filmmaker** mode
2. Position your camera
3. Click **⏺ Record**
4. Move the camera to create keyframes
5. Click **⏹ Stop**
6. Click **▶ Play** to preview the cinematic

### GLB Character Animation (Character Mode)

Import `.glb` files and animate skeletons:

1. Switch to **Character** mode
2. Drag-and-drop a `.glb` file into the viewport
3. Click a bone in the **Skeleton Panel** to select it
4. Use the FK **gizmo** to rotate the bone
5. Click **⏺ Record**, pose bones to animate
6. Clips appear in the **Clip Library** for playback

### HoloScript Language (Expert Mode)

HoloScript is a declarative spatial computing DSL:

```holoscript
world "My World" {
  @setting("forest")
  @skybox("sunset")
  @lighting("warm")

  object "Warrior" {
    @position(0, 0, 0)
    @physics type:"dynamic"
    @game_logic
  }

  npc "Guide" {
    @position(5, 0, 0)
    @role("Friendly")
    @dialogue("Welcome to the forest")
  }

  game_logic {
    @win_condition("reach_finish")
    @timer
  }
}
```

---

## Collaboration

### Multiplayer Editing

1. Click the **👥 Collaboration** button in the header
2. Share the URL — collaborators join in real-time
3. See each user's cursor and selection highlighted
4. Changes sync instantly via CRDT

### VR Mode

Click the **VR** button in the header (requires WebXR-compatible headset):

- **Meta Quest 3**: Full hand tracking + controllers
- **Apple Vision Pro**: Hand tracking (look-and-pinch)
- Navigate in 3D space, grab and move objects with hands

---

## Performance Tips

| Scene Size       | Recommended Settings                 |
| ---------------- | ------------------------------------ |
| < 100 objects    | Any settings, full quality           |
| 100–500 objects  | Normal — no changes needed           |
| 500–1000 objects | Consider LODs, reduce shadow quality |
| 1000+ objects    | Enable instancing, use InstancedMesh |

### Benchmark Your Scene

1. Switch to **Expert** mode
2. Click the **⚡ Benchmark** button in the toolbar
3. Set object count and run a 5-second FPS test
4. **Target**: 60fps @ 1000 objects

---

## Troubleshooting

### Scene won't load

- Clear browser cache (`Ctrl+Shift+R`)
- Check console for errors (`F12`)
- Ensure WebGL2 is enabled (visit `chrome://gpu`)

### AI assistant not responding

- Check the **AI Status** indicator in the header (green = OK)
- Ensure Ollama is running locally: `ollama serve`
- Or set `NEXT_PUBLIC_AI_MODE=cloud` in `.env.local`

### VR button greyed out

- Use a WebXR-compatible browser (Chrome, Edge)
- Connect a supported headset (Quest 3, Vision Pro)
- Ensure HTTPS (WebXR requires secure context)

### Performance is low

- Open **⚡ Benchmark** and test your scene
- Reduce object count or use instancing
- Switch to lower shadow quality in viewport settings

---

## Keyboard Shortcuts

| Shortcut       | Action            |
| -------------- | ----------------- |
| `G`            | Move (grab)       |
| `R`            | Rotate            |
| `S`            | Scale             |
| `Ctrl+Z`       | Undo              |
| `Ctrl+Shift+Z` | Redo              |
| `Ctrl+S`       | Save              |
| `Delete`       | Delete selected   |
| `F`            | Focus on selected |
| `Numpad 0`     | Camera view       |
| `Escape`       | Deselect / cancel |

---

## Next Steps

- 📖 [HoloScript Language Reference](./HOLOSCRIPT_LANGUAGE.md)
- 🎮 [Game Logic Guide](./GAME_LOGIC.md)
- 🌐 [Deployment Guide](./DEPLOYMENT.md)
- 🤝 [Contributing](../../CONTRIBUTING.md)
- 💬 [Discord Community](https://discord.gg/holoscript) _(coming in beta)_

---

_HoloScript Studio — AI-native spatial IDE for the web_  
_v0.1.0 — Beta Launch 2026_
