# Social Media Announcement Posts

## Hacker News

### Title (80 chars max)

```
Show HN: HoloScript – Write once, compile to 18 VR/AR platforms
```

### Content

````
Hi HN,

I've been working on HoloScript, a declarative language for VR/AR development that compiles to 18 different platforms from a single source file.

**The Problem:**
Building a VR app today means choosing Unity, Unreal, or WebXR and being locked in. Want to publish on Quest AND VRChat AND the web? Rewrite everything 3 times.

**The Solution:**
HoloScript is a declarative language where you describe *what* you want, not *how* to render it:

```holo
composition "VR Gallery" {
  object "Painting" @grabbable @networked {
    geometry: "model/frame.glb"
    position: [0, 1.6, -2]

    onGrab: {
      network.sync(this.position)
      audio.play("pickup.mp3")
    }
  }
}
````

Then compile to any platform:

```bash
holoscript compile gallery.holo --target vrchat
holoscript compile gallery.holo --target unity
holoscript compile gallery.holo --target threejs
```

**18 Compile Targets:**

- Web: Three.js, Babylon.js, A-Frame, WebXR, WebGPU
- Native: Unity, Unreal 5, Godot 4
- VR: VRChat, OpenXR, visionOS
- Mobile: iOS/ARKit, Android/ARCore, Android XR
- Other: WASM, URDF (ROS), SDF (Gazebo), DTDL (Azure)

**Performance:**

- Parser: 32,000 ops/s
- Compiler: 2.4M ops/s
- 50,000 lines of platform code → 500 lines of HoloScript

**What makes it different:**

1. VR-native traits: @grabbable, @throwable, @networked are first-class
2. AI-friendly: Language designed for code generation
3. Real compilers: Not transpiling to JS, generating native Unity C#, Unreal C++, Swift, Kotlin

**Status:** v3.3 just released, MIT licensed

GitHub: https://github.com/brianonbased-dev/Holoscript
Docs: https://holoscript.net

Would love feedback from anyone building VR/AR experiences!

```

---

## Reddit r/programming

### Title
```

HoloScript 3.0: A declarative language that compiles to 18 VR/AR platforms (Unity, Unreal, VRChat, visionOS, etc.) from a single source

```

### Content
```

I've released v3.3 of HoloScript, a programming language designed specifically for VR/AR development.

## What is it?

A declarative language where you describe 3D scenes once and compile to any major platform:

```holo
composition "Interactive Scene" {
  template "Interactable" {
    @grabbable
    @physics(mass: 1.0)
  }

  object "Ball" using "Interactable" {
    geometry: "sphere"
    position: [0, 1, 0]
    color: "#ff0000"
  }
}
```

## Why?

VR development is fragmented. Every platform has its own SDK, language, and workflow:

- VRChat: Unity + UdonSharp
- Quest: Unity C# or Unreal C++
- Web: Three.js or Babylon.js
- visionOS: Swift + RealityKit

HoloScript abstracts this away. Write once, compile everywhere.

## 18 Compile Targets

| Category     | Targets                                      |
| ------------ | -------------------------------------------- |
| Web          | Three.js, Babylon.js, A-Frame, WebXR, WebGPU |
| Game Engines | Unity, Unreal 5, Godot 4                     |
| VR Platforms | VRChat, OpenXR, visionOS                     |
| Mobile AR    | iOS/ARKit, Android/ARCore, Android XR        |
| Industrial   | WASM, URDF, SDF, DTDL                        |

## Cool Features

- **49 VR Traits**: `@grabbable`, `@throwable`, `@networked`, `@hand_tracked`, `@spatial_audio`
- **AI-friendly**: Designed for LLMs to generate (MCP server included)
- **Real compilation**: Generates Unity C#, Unreal C++, Swift—not just JavaScript wrapper

## Performance

- 32K ops/s parsing
- 2.4M ops/s compilation
- 2460 tests passing

## Links

- GitHub: https://github.com/brianonbased-dev/Holoscript
- Docs: https://holoscript.net
- npm: `npm install -g @holoscript/cli`

MIT licensed. Feedback welcome!

```

---

## Reddit r/gamedev

### Title
```

Released HoloScript 3.0 – Write VR games once, export to Unity, Unreal, VRChat, Godot, and more

```

### Content
```

Just shipped v3.3 of my side project. It's a programming language for VR/AR that compiles to multiple game engines.

**Example:**

```holo
composition "VR Escape Room" {
  template "Key" {
    @grabbable
    @collidable
    geometry: "model/key.glb"

    state {
      collected: false
    }

    onGrab: {
      this.state.collected = true
      audio.play("key_pickup.mp3")
      GameState.keysFound += 1
    }
  }

  object "GoldenKey" using "Key" {
    position: [2, 0.5, -3]
    color: "#ffd700"
  }
}
```

Then:

```bash
holoscript compile escape-room.holo --target unity
holoscript compile escape-room.holo --target vrchat
holoscript compile escape-room.holo --target godot
```

**Supported Targets:**
Unity, Unreal 5, Godot 4, VRChat, Three.js, Babylon.js, A-Frame, visionOS, iOS, Android, WebXR, OpenXR, and more.

**Why I built it:**
I was tired of rewriting the same VR interactions for different platforms. The scripting for "pick up object, throw it, make it network sync" is 90% the same everywhere, just different syntax.

**Not trying to replace engines—just the boilerplate.**

GitHub: https://github.com/brianonbased-dev/Holoscript

Happy to answer questions!

```

---

## Twitter/X Thread

```

🚀 Just released HoloScript 3.0!

A language that compiles to 18 VR/AR platforms from one source file.

Write once → Unity, Unreal, VRChat, visionOS, Three.js, and more.

🧵 Thread:

```

```

1/ The problem with VR dev today:

- Unity uses C#
- Unreal uses C++
- VRChat needs UdonSharp
- Web uses JavaScript
- visionOS needs Swift

Same VR experience = 5 rewrites.

HoloScript fixes this.

```

```

2/ The syntax is declarative and VR-native:

```holo
object "Ball" @grabbable @physics {
  geometry: "sphere"
  position: [0, 1, 0]
}
```

That's it. The compiler handles the Unity components, Unreal actors, or Three.js objects.

```

```

3/ 18 compile targets in v3.3:

✅ Three.js, Babylon.js, A-Frame, WebXR
✅ Unity, Unreal 5, Godot 4
✅ VRChat, OpenXR, visionOS
✅ iOS/ARKit, Android/ARCore
✅ WASM, URDF, SDF, DTDL

```

```

4/ Built for AI code generation.

Every object, trait, and property follows predictable patterns.

Includes an MCP server so Claude, Copilot, or any AI can generate valid .holo files.

```

```

5/ Performance:

📊 Parser: 32,000 ops/s
📊 Compiler: 2.4M ops/s
📊 2,460 tests passing

MIT licensed. Try it:
npm install -g @holoscript/cli

GitHub: https://github.com/brianonbased-dev/Holoscript

```

---

## Discord Announcement

```

# 🚀 HoloScript 3.0 Released!

The biggest release yet with **18 compile targets**!

## What's New

- **6 new compilers**: VRChat, Unreal, iOS, Android, visionOS, Android XR
- **WebAssembly compilation**: Deploy to WASM
- **Neovim plugin**: Full editor support
- **Performance boost**: 2.4M ops/s compilation

## Quick Start

```bash
npm install -g @holoscript/cli
holoscript init my-vr-app
holoscript compile scene.holo --target threejs
```

## Links

📦 GitHub: https://github.com/brianonbased-dev/Holoscript
📖 Docs: https://holoscript.net
📝 Release Notes: https://github.com/brianonbased-dev/Holoscript/releases/tag/v3.3.0

Let us know what you build! 🎮

```

```
