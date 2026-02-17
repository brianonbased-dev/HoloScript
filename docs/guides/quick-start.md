# Quick Start

Get up and running with HoloScript in 5 minutes.

## 1. Install VS Code Extension

```bash
ext install holoscript.holoscript-vscode
```

Or search **"HoloScript Enhanced"** in the VS Code extensions marketplace.

After installing, VS Code will show the **Getting Started** walkthrough automatically!

## 2. Create Your First File

Create a file called `hello.holo`:

```holo
composition "My First Scene" {
  environment {
    skybox: "sunset"
    ambient_light: 0.4
  }

  object "FloatingBox" {
    @grabbable
    @glowing

    position: [0, 1.5, -2]
    color: "#00ffff"

    on_grab: {
      this.glow_intensity = 2.0
    }
  }
}
```

## 3. Preview Your Scene

Press `Ctrl+Shift+V` (or `Cmd+Shift+V` on Mac) to open the 3D preview.

## 4. Explore the Examples

Open the Command Palette (`Ctrl+Shift+P`) and type **"HoloScript: Open Examples"** to browse progressive tutorials:

| #   | Example                              | What You'll Learn                                  |
| --- | ------------------------------------ | -------------------------------------------------- |
| 1   | 1-floating-cyan-box.holo             | Basic scene structure with @grabbable and @glowing |
| 2   | 2-red-cube-teal-button.holo          | VR traits: @throwable, @physics, @clickable        |
| 3   | 3-ball-ramp-with-bouncy-spheres.holo | Physics simulation with @physics and @collidable   |
| 4   | 4-networked-entities.holo            | Multiplayer with @networked and state sync         |
| 5   | 5-color-button-panel.holo            | Interactive UI with multiple clickable buttons     |

## 5. Compile to Target Platform

```bash
# Install CLI
npm install -g @holoscript/cli

# Compile to Three.js (web)
holoscript compile hello.holo --target threejs

# Compile to Unity (C#)
holoscript compile hello.holo --target unity

# Compile to Godot (GDScript)
holoscript compile hello.holo --target godot

# Compile to visionOS (Swift/RealityKit)
holoscript compile hello.holo --target visionos

# Compile to VRChat (UdonSharp)
holoscript compile hello.holo --target vrchat

# Compile to URDF (ROS 2 robotics)
holoscript compile hello.holo --target urdf

# 18+ targets available: unity, unreal, godot, vrchat, threejs,
# babylon, webgpu, visionos, androidxr, urdf, sdf, dtdl, wot, usda...
```

## What's Next?

- [Traits Reference](./traits) - 1,525 traits across 61 categories
- [Compositions](./compositions) - Build complex multi-object scenes
- [Best Practices](./best-practices) - Learn the 10 rules for great VR experiences
- [AI Integration](./ai-agents) - Use MCP server with Claude, GPT, or Brittney
