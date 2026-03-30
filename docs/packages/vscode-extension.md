# @holoscript/vscode

**HoloScript language support for Visual Studio Code.** Syntax highlighting, IntelliSense, real-time error checking, and one-click compilation.

## Installation

1. Open VS Code
2. Go to **Extensions** (Ctrl+Shift+X)
3. Search for "HoloScript"
4. Click **Install** on the official Hololand extension

Or from terminal:

```bash
code --install-extension Hololand.holoscript
```

## Features

### Syntax Highlighting

HoloScript code is beautifully colored:

- **Keywords** (composition, template, object, @traits) in blue
- **Strings** in orange
- **Numbers** in green
- **Comments** in gray

```holo
composition "MyScene" {         # ← Blue keyword
  template "Player" {           # ← Blue keyword
    @grabbable                  # ← Magenta trait
    geometry: "humanoid"        # ← Orange string
  }

  object "Hero" using "Player" {
    position: [0, 1, 0]        # ← Green numbers
  }
}
```

### IntelliSense (Code Completion)

**Auto-complete** as you type:

```holo
object "Sword" {
  @|                           # ← Type @ to see all traits
    @grabbable
    @throwable
    @damaging
    @tracer
    ...
```

- **Trait suggestions** with descriptions
- **Property hints** based on context
- **Object name** completion
- **Template** suggestions

### Go to Definition

Jump to where things are defined:

```holo
object "Hero" using "Player"
                     ↑
           Ctrl+Click to jump to Player template definition
```

### Find All References

See everywhere a symbol is used:

```
Ctrl+Shift+F on "Player"
→ Shows all objects using Player template
→ All files where Player is referenced
```

### Diagnostics

Real-time error detection:

```holo
object "Cube" {
  @unknonw_trait    ✗ Error: Trait not found
  geometr: "box"    ✗ Error: Property 'geometr' not found (did you mean 'geometry'?)
  position: [0, 1]  ✗ Error: Position requires 3 values, got 2
}
```

**Quick Fix** (Ctrl+.):

```
@unknonw_trait    ← Click lightbulb or Ctrl+.
                     Select "Did you mean @grabbable?"
```

### Formatting

**Format on save** or manually:

```
Shift+Alt+F   ← Auto-format entire file
```

**Before:**

```holo
object"Messy"{@grabbable geometry:"box"position:[0,1,0]}
```

**After:**

```holo
object "Messy" {
  @grabbable
  geometry: "box"
  position: [0, 1, 0]
}
```

### Hover Information

Hover over traits to see documentation:

```holo
@grabbable
   ↓ Hover here
┌─────────────────────────────────────┐
│ @grabbable                          │
│ Category: interaction               │
│ Makes object grabable by hand       │
│ Platforms: VR, AR, Web              │
│ See: Interaction traits reference   │
└─────────────────────────────────────┘
```

### Problem Panel

All errors and warnings in one place:

```
Terminal menu → Problems
Shows all issues across the entire workspace
Click to navigate to location
```

## Commands

Access via **Command Palette** (Ctrl+Shift+P):

| Command                          | Description                            |
| -------------------------------- | -------------------------------------- |
| `HoloScript: Compile to Unity`   | Compile current file to Unity C#       |
| `HoloScript: Compile to Godot`   | Compile current file to Godot GDScript |
| `HoloScript: Compile to WebGPU`  | Compile current file to WebGPU         |
| `HoloScript: Preview Scene`      | Open 3D preview of scene               |
| `HoloScript: Format Document`    | Format current file                    |
| `HoloScript: Lint`               | Check for errors                       |
| `HoloScript: Generate Scene`     | AI generates scene from prompt         |
| `HoloScript: Open Documentation` | Browse HoloScript docs                 |

## Settings

Open **Settings** (Ctrl+,) and search "HoloScript":

```json
{
  // Formatting
  "[holoscript]": {
    "editor.defaultFormatter": "Hololand.holoscript",
    "editor.formatOnSave": true,
    "editor.tabSize": 2
  },

  // LSP
  "holoscript.lsp.trace": "verbose",
  "holoscript.lsp.enabled": true,

  // Compiler
  "holoscript.compiler.defaultTarget": "webgpu",
  "holoscript.compiler.optimizationLevel": "balanced",

  // Preview
  "holoscript.preview.enabled": true,
  "holoscript.preview.defaultBackground": "checkerboard",

  // AI
  "holoscript.ai.enabled": true,
  "holoscript.ai.model": "gpt-4"
}
```

## Keybindings

Add custom shortcuts in VS Code:

```json
[
  {
    "key": "ctrl+alt+c",
    "command": "holoscript.compile",
    "when": "editorLangId == holoscript"
  },
  {
    "key": "ctrl+alt+p",
    "command": "holoscript.preview",
    "when": "editorLangId == holoscript"
  }
]
```

## File Support

VS Code recognizes three HoloScript formats:

- **`.hs`** — Classic HoloScript
- **`.hsplus`** — HoloScript Plus (VR traits, networking)
- **`.holo`** — Declarative compositions (AI-friendly)

Syntax highlighting and IntelliSense work on all three.

## Troubleshooting

### Extension not showing up

1. Check VS Code version (1.75+)
2. Try reinstalling:
   ```
   Extensions → Uninstall → Reload
   Then install again
   ```

### No IntelliSense

1. Check Language Server is running (bottom right status bar)
2. Check for errors in output panel:
   ```
   View → Output → HoloScript LSP
   ```
3. Try restarting VS Code

### Slow IntelliSense

1. Large files might be slow to parse
2. Disable trace if verbose:
   ```json
   {
     "holoscript.lsp.trace": "off"
   }
   ```

### Formatting not working

```
Ctrl+Shift+P → "Format Document"
Or check if default formatter is set:
```

```json
{
  "[holoscript]": {
    "editor.defaultFormatter": "Hololand.holoscript"
  }
}
```

## Ecosystem

HoloScript extension integrates with:

- **Hololand Studio** — Exported scenes auto-sync
- **GitHub** — PR previews of 3D scenes
- **VS Code AI** — Copilot integration for code generation
- **Remote Development** — SSH and containers supported

## See Also

- [LSP package](./lsp.md) — Language server details
- [CLI tools](./cli.md) — Command-line compiler
- [Getting Started](../guides/quickstart.md) — First steps
