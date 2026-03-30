# HoloScript Enhanced

Language support for HoloScript+ - a declarative language for spatial computing and XR development.

## Features

- **Syntax Highlighting** for `.holo`, `.hs`, and `.hsplus` files
- **3,300+ VR Traits** - Built-in traits for XR interactions across 114 categories
- **IntelliSense** - Autocomplete for traits, objects, and properties
- **Hover Documentation** - Trait and keyword documentation on hover
- **Semantic Tokens** - Rich syntax coloring (15 token types, 6 modifiers)
- **LSP Integration** - Full Language Server Protocol support via `@holoscript/lsp`
- **3D Preview** - Live preview panel for `.holo` files
- **AI Agent API** - 10+ commands for AI-assisted scene generation
- **MCP Orchestrator** - Integration with MCP mesh orchestrator
- **Debugger** - Built-in debug adapter for HoloScript
- **Smart Asset Editor** - Custom editor for `.hsa` files
- **Getting Started Walkthrough** - 6-step onboarding for new users

## Supported Syntax

### Primitives

`orb`, `sphere`, `cube`, `box`, `cylinder`, `cone`, `plane`, `mesh`, `avatar`, `light`, `camera`, `scene`, `group`, `text`, `panel`, `button`, `slider`, `zone`

### VR Traits (3,300+ across 114 categories, highlights below)

**Interaction:** `@grabbable`, `@throwable`, `@hoverable`, `@clickable`, `@draggable`, `@pointable`, `@collidable`, `@physics`, `@gravity`, `@trigger`, `@teleport`

**Visual:** `@glowing`, `@transparent`, `@spinning`, `@floating`, `@billboard`, `@pulse`, `@animated`, `@look_at`, `@outline`, `@particle_system`

**AI/Behavior:** `@behavior_tree`, `@emotion`, `@goal_oriented`, `@perception`, `@memory`

**Physics:** `@cloth`, `@soft_body`, `@fluid`, `@buoyancy`, `@rope`, `@wind`, `@joint`, `@rigidbody`, `@destruction`

**Extended:** `@scalable`, `@rotatable`, `@stackable`, `@snappable`, `@breakable`, `@character`, `@patrol`, `@networked`, `@anchor`, `@spatial_audio`, `@reverb_zone`

**Advanced:** `@voice_proximity`, `@ui_panel`, `@weather`, `@day_night`, `@lod`, `@hand_tracking`, `@haptic`, `@portal`, `@mirror`, `@recordable`

### Control Flow

`@if`, `@else`, `@for`, `@forEach`, `@while`

## Example

```holoscript
composition "Interactive Demo" {
  object "InteractiveBox" @grabbable @throwable @hoverable {
    geometry: "cube"
    position: [0, 1, -2]
    size: 0.5
    color: "#3498db"
  }

  object "NPC" @character @perception @emotion {
    geometry: "mesh"
    position: [2, 0, -3]
  }
}
```

## AI Agent Commands

The extension provides AI agent commands accessible via the command palette:

- `holoscript.agent.createFile` - Generate a new HoloScript file
- `holoscript.agent.generateObject` - Generate an object from description
- `holoscript.agent.analyzeScene` - Analyze scene structure
- `holoscript.agent.insertCode` - Insert code at cursor
- `holoscript.agent.addTrait` - Add traits to selected object
- `holoscript.agent.listTraits` - List available traits
- `holoscript.agent.validate` - Validate current file
- `holoscript.agent.status` - Check extension status

## Keyboard Shortcuts

| Shortcut       | Action               |
| -------------- | -------------------- |
| `Ctrl+Shift+V` | Open Preview to Side |
| `Ctrl+K V`     | Open Preview         |

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "HoloScript Enhanced"
4. Click Install

## Links

- [HoloScript Documentation](https://github.com/brianonbased-dev/holoscript)
- [Report Issues](https://github.com/brianonbased-dev/holoscript/issues)

## License

MIT
