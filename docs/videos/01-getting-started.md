# Video 1: Getting Started with HoloScript (10 min)

**Target audience:** Complete beginners — developers new to spatial computing
**Goal:** Install HoloScript, write first scene, see it run

---

## Script

### 0:00 — Intro (60s)

> "Welcome to HoloScript — the declarative language for building VR and AR experiences.
> In the next 10 minutes you'll go from zero to a working 3D scene.
> No Unity, no Unreal, no C# — just HoloScript."

**[SCREEN: HoloScript logo animation]**

What we'll cover:
- Installing the CLI
- VS Code setup
- Writing your first orb
- Building and previewing

---

### 1:00 — Installation (60s)

```bash
npm install -g @holoscript/cli
holoscript --version
```

> "One command. That's it. HoloScript is a single npm package."

**[SCREEN: terminal running the commands]**

If you prefer Yarn or pnpm:
```bash
yarn global add @holoscript/cli
pnpm add -g @holoscript/cli
```

---

### 2:00 — VS Code Extension (60s)

> "Open VS Code and search for 'HoloScript' in the Extensions panel."

**[SCREEN: VS Code marketplace showing extension]**

Features you get automatically:
- Syntax highlighting
- Completions for traits and properties
- Inline type errors
- Format on save

---

### 3:00 — Create Your First Project (60s)

```bash
holoscript init my-first-scene
cd my-first-scene
code .
```

**[SCREEN: VS Code opens with project structure]**

Project structure:
```
my-first-scene/
├── src/
│   └── scene.hsplus      ← your main file
├── holoscript.config.json
└── package.json
```

---

### 4:00 — Write Your First Scene (120s)

Open `src/scene.hsplus`:

```hsplus
// My first HoloScript scene
orb "Hello" {
  color: "blue"
  scale: 1.0
  position: [0, 1, -2]
}
```

> "An orb is the basic building block. Think of it like a 3D div.
> It has a color, a scale, and a position in 3D space."

Add a trait:
```hsplus
orb "Hello" {
  color: "blue"
  scale: 1.0
  position: [0, 1, -2]
  @grabbable
}
```

> "The @grabbable trait means users can pick this object up in VR.
> One line — that's all it takes."

---

### 6:00 — Build and Preview (90s)

```bash
holoscript build src/scene.hsplus
holoscript preview
```

**[SCREEN: browser opens with 3D preview]**

> "The preview runs in your browser. You can grab, rotate, and move the orb
> right in the WebXR viewer."

Or try the playground without installing anything:

```
https://holoscript.dev/playground
```

---

### 8:00 — Deploy to a Device (90s)

```bash
holoscript build --target=quest3 src/scene.hsplus
holoscript deploy --device=quest3
```

> "Targeting a Meta Quest 3. HoloScript compiles to the native format
> for each device — you don't change your code."

Other targets:
```bash
--target=visionos    # Apple Vision Pro
--target=webxr       # Any WebXR browser
--target=unity       # Unity C# output
```

---

### 9:30 — Recap and Next Steps (30s)

> "In 10 minutes you:
> ✓ Installed HoloScript
> ✓ Created a 3D scene
> ✓ Added an interactive trait
> ✓ Previewed in the browser"

Next video: **Core Concepts** — properties, templates, and logic blocks.

**[SCREEN: subscribe CTA + playlist link]**

---

## Production Notes

- **B-roll:** Screen recordings at 1440p, terminal font size 20+
- **Captions:** Auto-generated + reviewed for accuracy
- **Code font:** JetBrains Mono
- **Duration target:** 9:30–10:30
- **Thumbnail:** Blue orb on dark background, "Hello World in VR" text
