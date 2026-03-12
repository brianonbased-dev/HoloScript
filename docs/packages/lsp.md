# @holoscript/lsp

**Language Server Protocol implementation for HoloScript.** Provides IDE support for VS Code, Neovim, and other LSP-compatible editors.

## Overview

The LSP server enables IDE features for HoloScript files:

- **Syntax highlighting** — Color code language constructs
- **Code completion** — Autocomplete traits, keywords, object names
- **Diagnostics** — Real-time error and warning reporting
- **Go to definition** — Jump to template/object definitions
- **Find references** — See where objects/traits are used
- **Rename** — Safely rename symbols across files
- **Formatting** — Auto-format code on save
- **Hover info** — See trait documentation on hover

## Installation

### VS Code

Install the [HoloScript VS Code extension](https://marketplace.visualstudio.com/items?itemName=Hololand.holoscript):

```bash
code --install-extension Hololand.holoscript
```

Or search for "HoloScript" in the VS Code extensions marketplace.

### Neovim

Install the [holoscript.nvim](https://github.com/hololand/holoscript.nvim) plugin:

```lua
-- Using packer
use 'hololand/holoscript.nvim'

-- Using lazy.nvim
{ 'hololand/holoscript.nvim' }
```

Then configure LSP:

```lua
require('lspconfig').holoscript.setup({})
```

### Manual Setup

For other editors, start the LSP server manually:

```bash
npx @holoscript/lsp --stdio
# or in a TCP socket
npx @holoscript/lsp --socket 9999
```

Then configure your editor to connect to this LSP server.

## Configuration

### VS Code (settings.json)

```json
{
  "holoscript.lsp.enabled": true,
  "holoscript.lsp.trace": {
    "server": "verbose"
  },
  "holoscript.format.enabled": true,
  "holoscript.format.indentSize": 2,
  "holoscript.lint.enabled": true,
  "holoscript.lint.strictMode": false,
  "[holoscript]": {
    "editor.defaultFormatter": "Hololand.holoscript",
    "editor.formatOnSave": true,
    "editor.tabSize": 2
  }
}
```

### Neovim (init.lua)

```lua
local lsp = vim.lsp
local capabilities = vim.lsp.protocol.make_client_capabilities()

require('lspconfig').holoscript.setup {
  capabilities = capabilities,
  on_attach = function(client, bufnr)
    -- Your key mappings and settings
    vim.keymap.set('n', '<leader>gd', vim.lsp.buf.definition, { buffer = bufnr })
    vim.keymap.set('n', '<leader>gr', vim.lsp.buf.references, { buffer = bufnr })
    vim.keymap.set('n', '<leader>rn', vim.lsp.buf.rename, { buffer = bufnr })
  end,
  settings = {
    holoscript = {
      lsp = { trace = 'verbose' },
      format = { indentSize = 2 },
      lint = { strictMode = false }
    }
  }
}
```

## Features

### Code Completion

When you type, the LSP server suggests:

```holo
object "My|"  ← Typing here triggers suggestions
  @|           ← Type @ to see trait suggestions
```

**Completion includes:**
- Trait names (with descriptions)
- Object names in scope
- Keywords (composition, template, object, etc.)
- Built-in functions
- Property names
- Type hints

### Diagnostics

Errors and warnings appear inline as you type:

```holo
object "Cube" {
  @unknown_trait    ✗ Error: Unknown trait '@unknown_trait'
  geometr: "box"    ✗ Error: Property 'geometr' not found (did you mean 'geometry'?)
}
```

**Quick fixes** (press Ctrl+. in VS Code):

```holo
@unknown_trait    ← Hover, press Ctrl+., select "Did you mean @grabbable?"
```

### Go to Definition

Jump to where something is defined:

```holo
object "Hero" using "Player"
                    ↗ Ctrl+Click to jump to Player template
```

### Find References

See all usages of a symbol:

```holo
template "Sword" { }
       ↑ Ctrl+Shift+F to see all references
       
object "Weapon1" using "Sword"
object "Weapon2" using "Sword"   ← All shown in results
```

### Rename

Safely refactor symbols:

```holo
template "Player" { }        ← Right-click, "Rename Symbol"
                               Type new name everywhere safely
```

### Hover Information

Hover over traits to see documentation:

```holo
@grabbable  ← Hover to see:
            ┌─────────────────────┐
            │ @grabbable          │
            │ Category: interaction
            │ Description: ...    │
            │ Platforms: all      │
            └─────────────────────┘
```

### Formatting

Format code on save or manually:

```bash
# VS Code: Shift+Alt+F  (or right-click → Format Document)
# Neovim: :LspFormat or your configured keybinding
```

**Before:**
```holo
object "Messy"{@grabbable
geometry:"box" position:[0,1,0]}
```

**After:**
```holo
object "Messy" {
  @grabbable
  geometry: "box"
  position: [0, 1, 0]
}
```

## Troubleshooting

### LSP not starting

**VS Code:**
```json
{
  "holoscript.lsp.trace.server": "verbose"
}
```
Then check the "HoloScript LSP" output channel.

**Neovim:**
```lua
vim.lsp.set_log_level('debug')
-- Check logs at ~/.local/share/nvim/lsp.log
```

### Syntax highlighting not working

**VS Code:** Ensure you have the HoloScript extension installed:
```bash
code --install-extension Hololand.holoscript
```

**Neovim:** Install a tree-sitter parser or use built-in regex highlights:
```lua
require('nvim-treesitter.configs').setup {
  ensure_installed = { 'holoscript' }
}
```

### Completion not showing

1. Ensure LSP is running (check status in editor)
2. Try <Ctrl+Space> or <Ctrl+X><Ctrl+O> to manually trigger
3. Check `holoscript.lsp.trace` is set to see what's happening

### Slow performance

Reduce trace verbosity:

```json
{
  "holoscript.lsp.trace.server": "off"
}
```

Enable incremental parsing:

```json
{
  "holoscript.lsp.incremental": true
}
```

## API (for CLI/Programmatic Use)

```typescript
import { startLSPServer, createLSPClient } from '@holoscript/lsp';

// Start server
const server = await startLSPServer({ 
  port: 9999 
});

// Or create client to existing server
const client = createLSPClient({ 
  port: 9999 
});

// Use LSP methods
const definitions = await client.goToDefinition(
  'myfile.holo',
  { line: 5, character: 10 }
);

const completions = await client.getCompletions(
  'myfile.holo',
  { line: 3, character: 5 }
);
```

## See Also

-[VS Code Extension](./vscode-extension.md) — Full editor integration
- [CLI](./cli.md) — Command-line tools
- [Neovim Setup](https://github.com/hololand/holoscript.nvim) — Neovim plugin
