# tree-sitter-holoscript

Tree-sitter grammar for [HoloScript](https://holoscript.net) - the VR scene description language.

## Features

- Full HoloScript syntax support (`.hs`, `.hsplus`, `.holo`)
- Syntax highlighting queries
- Indentation queries
- Local variable scoping queries
- Works with Zed, Helix, Neovim, Emacs, and more

## Installation

### npm (for Node.js)

```bash
npm install tree-sitter-holoscript
```

### Neovim (via nvim-treesitter)

Add to your nvim-treesitter configuration:

```lua
local parser_config = require("nvim-treesitter.parsers").get_parser_configs()
parser_config.holoscript = {
  install_info = {
    url = "https://github.com/brianonbased-dev/HoloScript",
    files = {"src/parser.c"},
    branch = "main",
    location = "packages/tree-sitter-holoscript",
  },
  filetype = "holoscript",
}

vim.filetype.add({
  extension = {
    hs = "holoscript",
    hsplus = "holoscript",
    holo = "holoscript",
  },
})
```

### Helix

Add to `languages.toml`:

```toml
[[language]]
name = "holoscript"
scope = "source.holoscript"
injection-regex = "^(holoscript|holo|hs)$"
file-types = ["hs", "hsplus", "holo"]
comment-token = "//"
indent = { tab-width = 2, unit = "  " }
roots = ["package.json", "holoscript.config.json"]

[[grammar]]
name = "holoscript"
source = { git = "https://github.com/brianonbased-dev/HoloScript", subpath = "packages/tree-sitter-holoscript" }
```

### Zed

Zed has native tree-sitter support. Add an extension or configure manually:

```json
{
  "languages": {
    "HoloScript": {
      "grammar": "holoscript",
      "path_suffixes": ["hs", "hsplus", "holo"]
    }
  }
}
```

## Usage

### Node.js

```javascript
const Parser = require('tree-sitter');
const HoloScript = require('tree-sitter-holoscript');

const parser = new Parser();
parser.setLanguage(HoloScript);

const sourceCode = `
composition "My Scene" {
  object "Cube" @grabbable {
    geometry: "cube"
    color: "#ff0000"
  }
}
`;

const tree = parser.parse(sourceCode);
console.log(tree.rootNode.toString());
// (source_file
//   (composition
//     name: (string)
//     (object
//       name: (string)
//       (trait_inline name: (identifier))
//       (property key: (identifier) value: (string))
//       (property key: (identifier) value: (color)))))
```

### WebAssembly

```javascript
const Parser = require('web-tree-sitter');

(async () => {
  await Parser.init();
  const parser = new Parser();
  const HoloScript = await Parser.Language.load('tree-sitter-holoscript.wasm');
  parser.setLanguage(HoloScript);

  const tree = parser.parse('object "Cube" @grabbable {}');
  console.log(tree.rootNode.toString());
})();
```

## Query Files

### Syntax Highlighting

The `queries/highlights.scm` file provides syntax highlighting for:

- Keywords (`composition`, `template`, `object`, etc.)
- Traits (`@grabbable`, `@networked`, etc.)
- Properties
- Types
- Comments
- Literals (numbers, strings, colors)

### Indentation

The `queries/indents.scm` file provides automatic indentation for:

- Composition/template/object blocks
- Control flow statements
- Array and object literals

### Locals

The `queries/locals.scm` file provides:

- Scope detection
- Variable definitions
- Reference resolution

## Supported Syntax

| Construct       | Description                | Example                          |
| --------------- | -------------------------- | -------------------------------- |
| `composition`   | Main scene container       | `composition "Scene" { }`        |
| `world`         | Alternative container      | `world "Game" { }`               |
| `template`      | Reusable object definition | `template "Enemy" { }`           |
| `object`        | Scene instance             | `object "Cube" { }`              |
| `entity`        | Alternative object syntax  | `entity "Player" { }`            |
| `@trait`        | VR traits                  | `@grabbable @networked`          |
| `state { }`     | Object state               | `state { health: 100 }`          |
| `physics: { }`  | Physics properties         | `physics: { mass: 1 }`           |
| `networked { }` | Network sync               | `networked { position: synced }` |
| `timeline { }`  | Animations                 | `timeline { 0: animate... }`     |
| `action`        | Custom actions             | `action attack(target) { }`      |
| `onEvent:`      | Event handlers             | `onGrab: { }`                    |

## Development

```bash
# Install dependencies
npm install

# Generate parser from grammar
npm run build

# Run tests
npm test

# Build WASM
npm run build:wasm
```

## Related

- [HoloScript](https://holoscript.net) - VR scene description language
- [VS Code Extension](https://marketplace.visualstudio.com/items?itemName=holoscript.holoscript) - Full IDE support
- [@holoscript/lsp](../lsp) - Language Server Protocol implementation

## License

MIT
