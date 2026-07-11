# @holoscript/lsp

Language Server Protocol implementation for HoloScript.

## Installation

```bash
npm install @holoscript/lsp
```

## Features

- 🎯 **Autocomplete** - Intelligent code completion
- 🔍 **Hover** - Documentation on hover
- 📍 **Go to Definition** - Navigate to declarations
- 🔎 **Find References** - Find all usages
- ✏️ **Rename** - Safe symbol renaming
- 🔧 **Code Actions** - Quick fixes and refactors
- 🎨 **Semantic Highlighting** - Rich syntax coloring
- ⚠️ **Diagnostics** - Real-time error reporting

## Usage

### As a Server

```typescript
import { startServer } from '@holoscript/lsp';

startServer({
  connection: createConnection(),
  documents: new TextDocuments(TextDocument),
});
```

### With VS Code

The LSP is bundled with [@holoscript/vscode](https://marketplace.visualstudio.com/items?itemName=holoscript.holoscript-vscode).

### With Neovim

```lua
require('lspconfig').holoscript.setup({
  cmd = { 'holoscript-lsp', '--stdio' },
})
```

## AI Autocomplete

Enable AI-powered suggestions:

```typescript
import { createAutocomplete } from '@holoscript/lsp';

const autocomplete = createAutocomplete({
  provider: 'copilot',
  context: 'vr-game',
});
```

## Package boundary & release posture

`@holoscript/lsp` is the Language Server Protocol backend for HoloScript, built for external editor integrations (VS Code, Neovim, and any other agent framework or agent-family tool that speaks LSP) rather than for one specific bundled editor. The server does not ship an editor — the caller owns the `connection` and `TextDocuments` transport it is started with, and any AI-autocomplete backend (`createAutocomplete({ provider, context })`) is caller-owned: you point it at your own provider id and supply any provider credentials through your own environment variables, never a package default.

The package does not ship founder-local configuration, private workspace paths, or a bundled AI backend. Workspace root, provider keys, and connection transport are all supplied by the operator at start time, not baked into the package.

Operability: the server exposes standard LSP diagnostics/validation over the protocol, so a host editor or CI harness gets the same doctor-style health signal any LSP client already knows how to consume.

Release posture: v0-preview. Known limitations — AI-autocomplete providers beyond the documented example are unverified against this package, and the debug-adapter surface is still evolving. Pin a version in consuming projects; rollback is a plain `npm install @holoscript/lsp@<previous-version>`.

## License

MIT
