# VS Code Extension

The HoloScript VS Code extension provides the best development experience for `.hs`, `.hsplus`, and `.holo` files.

## Installation

Install from the VS Code Marketplace:

```
ext install holoscript.holoscript-vscode
```

Or search **"HoloScript Enhanced"** in the Extensions panel.

---

## Features

### Syntax Highlighting

Full syntax highlighting for all HoloScript file types:

- **Blue**: Keywords (`orb`, `composition`, `template`, `object`)
- **Green**: Traits (`@grabbable`, `@physics`, `@networked`)
- **Orange**: Properties and parameters
- **Cyan**: Strings and values
- **Purple**: Functions and actions

### IntelliSense

- **Autocomplete** for traits, properties, and keywords
- **Suggestions** as you type
- Filter by typing the first letters

<!-- ![IntelliSense Demo](/images/intellisense.gif) -->

### Error Checking

Real-time validation shows:

- **Syntax errors**: Missing braces, invalid syntax
- **Unknown traits**: Typos in trait names
- **Invalid values**: Wrong types for properties

Errors appear as red squiggles with hover explanations.

### Hover Documentation

Hover over any trait to see:

- Description
- Parameters and defaults
- Available events
- Usage example

### Code Snippets

Quick templates for common patterns:

| Prefix  | Expands To               |
| ------- | ------------------------ |
| `orb`   | Basic composition object |
| `comp`  | Composition skeleton     |
| `temp`  | Template definition      |
| `obj`   | Object with traits       |
| `grp`   | Spatial group            |
| `env`   | Environment block        |
| `logic` | Logic block              |

Type the prefix and press Tab.

### Formatting

Format your code with:

- `Shift + Alt + F` (Windows/Linux)
- `Shift + Option + F` (macOS)

Or right-click → Format Document.

---

## Commands

Access via Command Palette (`Ctrl/Cmd + Shift + P`):

| Command                                 | Description                     |
| --------------------------------------- | ------------------------------- |
| `HoloScript: Validate File`             | Check current file for errors   |
| `HoloScript: Preview Scene`             | Launch 3D preview (coming soon) |
| `HoloScript: Compile to...`             | Compile to target platform      |
| `HoloScript: Generate from Description` | AI-powered generation           |
| `HoloScript: Suggest Traits`            | Get trait suggestions           |

---

## Settings

Configure in VS Code Settings (`Ctrl/Cmd + ,`):

```json
{
  // Enable/disable features
  "holoscript.validation.enabled": true,
  "holoscript.formatting.enabled": true,
  "holoscript.intellisense.enabled": true,

  // Validation settings
  "holoscript.validation.checkUnknownTraits": true,
  "holoscript.validation.checkDeprecated": true,

  // Formatting settings
  "holoscript.formatting.indentSize": 2,
  "holoscript.formatting.insertSpaces": true,

  // Default target for compilation
  "holoscript.compile.defaultTarget": "threejs"
}
```

---

## File Association

The extension automatically associates:

| Extension | Language ID       |
| --------- | ----------------- |
| `.hs`     | `holoscript`      |
| `.hsplus` | `holoscript-plus` |
| `.holo`   | `holoscript-holo` |

To manually set for a file:

1. Click language indicator in status bar
2. Select "Configure File Association"
3. Choose HoloScript variant

---

## Color Themes

The extension works with any VS Code theme. For best results, themes with good semantic highlighting are recommended:

- One Dark Pro
- Dracula
- GitHub Dark
- Night Owl

### Custom Token Colors

Add to your `settings.json`:

```json
{
  "editor.tokenColorCustomizations": {
    "[Your Theme]": {
      "textMateRules": [
        {
          "scope": "keyword.control.holoscript",
          "settings": { "foreground": "#569CD6" }
        },
        {
          "scope": "entity.name.tag.trait.holoscript",
          "settings": { "foreground": "#4EC9B0" }
        }
      ]
    }
  }
}
```

---

## Keyboard Shortcuts

| Shortcut               | Action               |
| ---------------------- | -------------------- |
| `Ctrl/Cmd + Space`     | Trigger IntelliSense |
| `Ctrl/Cmd + .`         | Quick fixes          |
| `F2`                   | Rename symbol        |
| `F12`                  | Go to definition     |
| `Shift + F12`          | Find all references  |
| `Ctrl/Cmd + Shift + O` | Go to symbol         |

---

## Multi-root Workspaces

The extension works in multi-root workspaces. Each folder can have its own `holoscript.config.json`.

---

## Troubleshooting

### Extension Not Working

1. Check it's enabled: Extensions panel → HoloScript Enhanced → Enable
2. Reload VS Code: `Ctrl/Cmd + Shift + P` → "Reload Window"
3. Check Output panel: View → Output → HoloScript

### IntelliSense Missing

1. Ensure file has correct extension (`.hs`, `.hsplus`, `.holo`)
2. Wait for Language Server to initialize
3. Try: `Ctrl/Cmd + Shift + P` → "Restart Language Server"

### Validation Too Slow

For large files, validation may be slow. Try:

```json
{
  "holoscript.validation.debounceMs": 500
}
```

---

## Report Issues

Found a bug or have a feature request?

1. Go to [GitHub Issues](https://github.com/brianonbased-dev/holoscript/issues)
2. Check if already reported
3. Create new issue with:
   - VS Code version
   - Extension version
   - Steps to reproduce
   - Sample code (if relevant)

---

## Next Steps

- [Quick Start](/guides/quick-start) - Build your first scene
- [File Formats](/guides/file-formats) - Understanding the syntax
- [MCP Server](/guides/mcp-server) - AI integration
