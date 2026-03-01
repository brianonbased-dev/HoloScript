# Installation

Get started with HoloScript in your development environment.

## VS Code Extension

The easiest way to start using HoloScript.

### Install from Marketplace

```bash
ext install holoscript.holoscript-vscode
```

Or search **"HoloScript Enhanced"** in the VS Code extensions marketplace.

### Features Included

- ✅ Syntax highlighting for `.hs`, `.hsplus`, `.holo`
- ✅ IntelliSense and autocomplete
- ✅ Error checking and diagnostics
- ✅ Hover documentation for traits
- ✅ Code snippets
- ✅ Live preview (coming soon)

---

## CLI Tools

For compiling and building HoloScript projects.

### Install via npm

```bash
npm install -g @holoscript/cli
```

### Verify Installation

```bash
holoscript --version
# HoloScript CLI v3.3.0
```

### Basic Commands

```bash
# Create new project
holoscript init my-project

# Validate syntax
holoscript validate scene.holo

# Preview locally
holoscript preview scene.holo

# Compile to target (18+ targets available)
holoscript compile scene.holo --target threejs
holoscript compile scene.holo --target unity
holoscript compile scene.holo --target unreal
holoscript compile scene.holo --target godot
holoscript compile scene.holo --target vrchat
holoscript compile scene.holo --target babylon
holoscript compile scene.holo --target webgpu
holoscript compile scene.holo --target visionos
holoscript compile scene.holo --target androidxr
holoscript compile scene.holo --target urdf       # ROS 2 robotics
holoscript compile scene.holo --target sdf        # Gazebo simulation
holoscript compile scene.holo --target dtdl       # Azure Digital Twins
holoscript compile scene.holo --target wot        # W3C Web of Things
holoscript compile scene.holo --target usda       # OpenUSD

# Watch mode
holoscript watch src/ --target threejs
```

---

## MCP Server (For AI Integration)

Connect AI agents (Claude, GPT, Cursor) to HoloScript.

### Install

```bash
npm install @holoscript/mcp-server
```

### Configure for Claude Desktop

Add to Claude Desktop config (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "holoscript": {
      "command": "npx",
      "args": ["@holoscript/mcp-server"]
    }
  }
}
```

### Available MCP Tools

| Tool                  | Description                      |
| --------------------- | -------------------------------- |
| `generate_object`     | Create objects from descriptions |
| `generate_scene`      | Create complete compositions     |
| `validate_holoscript` | Check code for errors            |
| `suggest_traits`      | Get trait recommendations        |
| `explain_code`        | Get plain English explanation    |
| `compile_scene`       | Compile to any of 18+ targets    |
| `list_traits`         | Browse all 1,800+ traits          |
| `query_scene_graph`   | Inspect scene structure          |
| `parse_holoscript`    | Parse to AST                     |

34+ tools available in total. See [MCP Server Guide](/guides/mcp-server) for full documentation.

See [MCP Server Guide](/guides/mcp-server) for full documentation.

---

## Package Installation

Use HoloScript packages in your projects.

### Core Parser

```bash
npm install @holoscript/core
```

```typescript
import { parse } from '@holoscript/core';

const ast = parse(`
  composition hello {
    message: "Hello World"
  }
`);
```

### Traits Library

```bash
npm install @holoscript/traits
```

```typescript
import { getTraitDefinition, listAllTraits } from '@holoscript/traits';

const grabbable = getTraitDefinition('grabbable');
console.log(grabbable.parameters);
```

### Compiler

```bash
npm install @holoscript/compiler
```

```typescript
import { compile } from '@holoscript/compiler';

const output = compile(holoCode, { target: 'threejs' });
```

---

## Project Setup

### Create New Project

```bash
holoscript init my-vr-game
cd my-vr-game
```

### Project Structure

```
my-vr-game/
├── src/
│   ├── scenes/
│   │   └── main.holo
│   ├── templates/
│   │   └── enemies.hsplus
│   └── assets/
│       ├── models/
│       └── sounds/
├── dist/
├── holoscript.config.json
└── package.json
```

### Configuration

`holoscript.config.json`:

```json
{
  "entry": "src/scenes/main.holo",
  "outDir": "dist",
  "targets": ["threejs", "unity", "godot", "urdf"],
  "assets": {
    "models": "src/assets/models",
    "sounds": "src/assets/sounds"
  },
  "optimization": {
    "minify": true,
    "treeshake": true
  }
}
```

---

## Development Workflow

### 1. Write HoloScript

Create your scene in `.holo`:

```holo
composition "My Scene" {
  environment {
    skybox: "sunset"
  }

  object "Player" {
    @collidable
    position: [0, 1.6, 0]
  }
}
```

### 2. Validate

```bash
holoscript validate src/scenes/main.holo
```

### 3. Preview

```bash
holoscript preview src/scenes/main.holo
```

### 4. Compile

```bash
holoscript compile src/scenes/main.holo --target threejs
```

### 5. Deploy

Output is in `dist/` ready for deployment.

---

## System Requirements

| Requirement | Minimum               |
| ----------- | --------------------- |
| Node.js     | v18+                  |
| VS Code     | v1.85+                |
| RAM         | 4GB                   |
| OS          | Windows, macOS, Linux |

---

## Next Steps

- [Quick Start](/guides/quick-start) - Build your first scene
- [VS Code Guide](/guides/vscode) - Editor features
- [File Formats](/guides/file-formats) - Understanding .hs, .hsplus, .holo
