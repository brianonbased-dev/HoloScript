# HoloScript VSCode Extension

Adds full **HoloScript** language support to Visual Studio Code.

## Features

| Feature | Status |
|---|---|
| Syntax highlighting (`.holo`, `.holoscript`, `.hs+`) | ✅ |
| Semantic code completion (traits, properties) | ✅ via `@holoscript/lsp` |
| Hover documentation (68KB trait docs) | ✅ via `@holoscript/lsp` |
| Diagnostics / error squiggles | ✅ via `@holoscript/lsp` |
| Debug Adapter Protocol (breakpoints, watch) | ✅ via `HoloScriptDebugSession` |
| HoloScript Dark theme | ✅ |

## Requirements

- Visual Studio Code ^1.85.0
- Node.js 18+ (for the LSP server)

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `holoscript.trace.server` | `off` | LSP trace level: off/messages/verbose |
| `holoscript.server.path` | `` | Custom LSP server path (leave empty for bundled) |
| `holoscript.playground.url` | `http://localhost:3000/playground` | Playground URL for the Open Playground command |

## Commands

- **HoloScript: Restart Language Server** — restart the LSP if it gets stuck
- **HoloScript: Open Playground** — opens the HoloScript web playground in your browser

## Development

```bash
npm install
npm run compile
# Press F5 in VSCode to launch Extension Development Host
```

## Publishing

```bash
npm run package     # creates .vsix
npm run publish     # publishes to marketplace (requires VSCE_PAT)
```
