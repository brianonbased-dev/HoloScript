# Installation & Setup

Welcome to Lesson 1.2! In this lesson, you'll set up your HoloScript development environment and verify everything is working correctly.

## Prerequisites

Before starting, ensure you have:

- **Node.js** 18.0 or higher
- A code editor (VS Code recommended)
- A VR headset (optional for testing, but recommended)

## Installing HoloScript

### Using npm (Recommended)

```bash
npm install -g @holoscript/cli
```

### Using pnpm

```bash
pnpm add -g @holoscript/cli
```

### Using yarn

```bash
yarn global add @holoscript/cli
```

## Verify Installation

After installation, verify HoloScript is working:

```bash
holoscript --version
# Output: holoscript 1.0.0

holoscript help
# Shows available commands
```

## VS Code Extension

Install the HoloScript VS Code extension for the best development experience:

1. Open VS Code
2. Press `Ctrl+Shift+X` (Cmd+Shift+X on Mac)
3. Search for "HoloScript"
4. Click "Install" on the official extension

### Features Included

- **Syntax highlighting** for `.hs`, `.hsplus`, and `.holo` files
- **IntelliSense** with auto-completion for traits and properties
- **Error diagnostics** showing problems as you type
- **Code formatting** with a single keystroke
- **Hover documentation** for traits and built-in functions

## Create Your First Project

Let's create a new HoloScript project:

```bash
# Create a new directory
mkdir my-first-vr-scene
cd my-first-vr-scene

# Initialize the project
holoscript init

# This creates:
# .
# ├── holoscript.config.json
# ├── package.json
# ├── src/
# │   └── main.holo
# └── assets/
```

## Project Structure

```
my-first-vr-scene/
├── holoscript.config.json   # Project configuration
├── package.json             # npm dependencies
├── src/
│   ├── main.holo            # Entry point
│   └── components/          # Reusable components
└── assets/
    ├── models/              # 3D models (.glb, .gltf)
    ├── textures/            # Images and textures
    └── audio/               # Sound files
```

## Configuration File

The `holoscript.config.json` file contains your project settings:

```json
{
  "name": "my-first-vr-scene",
  "version": "1.0.0",
  "entry": "src/main.holo",
  "targets": ["web", "oculus", "steamvr"],
  "compiler": {
    "strictMode": true,
    "optimizations": true
  },
  "linter": {
    "rules": {
      "no-unused": "warn",
      "require-geometry": "error"
    }
  }
}
```

## Running the Dev Server

Start the development server to see your scene:

```bash
holoscript dev
# ✓ Server running at http://localhost:3000
# ✓ Hot reload enabled
# ✓ WebXR available
```

Open `http://localhost:3000` in a WebXR-compatible browser.

## Connecting Your VR Headset

### Oculus Quest

1. Enable Developer Mode on your Quest
2. Connect via USB or use Air Link
3. Open the Oculus Browser
4. Navigate to `http://your-computer-ip:3000`
5. Click "Enter VR"

### SteamVR

1. Start SteamVR
2. Open a web browser in VR
3. Navigate to `http://localhost:3000`
4. Click "Enter VR"

## Troubleshooting

### "holoscript: command not found"

```bash
# Verify npm global bin is in PATH
npm bin -g
export PATH="$PATH:$(npm bin -g)"
```

### WebXR Not Available

Ensure you're using a compatible browser:

- **Chrome 79+** on Windows/Android
- **Firefox** with WebXR enabled
- **Oculus Browser** on Quest

### Port Already in Use

```bash
holoscript dev --port 3001
```

## Quiz

Test your understanding:

1. What command installs HoloScript globally?
2. Which file types does HoloScript support?
3. What port does the dev server use by default?
4. Where should you put 3D model files?
5. What file is the project configuration stored in?

<details>
<summary>Answers</summary>

1. `npm install -g @holoscript/cli`
2. `.hs`, `.hsplus`, and `.holo`
3. Port 3000
4. `assets/models/`
5. `holoscript.config.json`

</details>

## Next Steps

In the next lesson, you'll create your first VR scene with interactive objects.

---

**Estimated time:** 20 minutes  
**Difficulty:** ⭐ Beginner  
**Next:** [Lesson 1.3 - Your First Scene](./03-first-scene.md)
