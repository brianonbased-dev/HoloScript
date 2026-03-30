# HoloScript Packages

Monorepo packages for the HoloScript programming language.

## Core

| Package                                       | Description                                            | License |
| --------------------------------------------- | ------------------------------------------------------ | ------- |
| [`@holoscript/core`](core/)                   | Parser, AST, compilers (33 targets), 3,300+ VR traits  | MIT     |
| [`@holoscript/runtime`](runtime/)             | Browser runtime (Three.js), trait handlers             | MIT     |
| [`@holoscript/std`](std/)                     | Standard library                                       | MIT     |
| [`@holoscript/compiler-wasm`](compiler-wasm/) | Rust/WASM parser (10x faster)                          | MIT     |
| [`@holoscript/holoscript`](holoscript/)       | Umbrella package                                       | MIT     |

## Tools

| Package                               | Description            | License |
| ------------------------------------- | ---------------------- | ------- |
| [`@holoscript/cli`](cli/)             | Command-line interface | MIT     |
| [`@holoscript/linter`](linter/)       | Code linter            | MIT     |
| [`@holoscript/formatter`](formatter/) | Code formatter         | MIT     |
| [`@holoscript/benchmark`](benchmark/) | Performance benchmarks | MIT     |
| [`@holoscript/test`](test/)           | Test utilities         | MIT     |

## Editor Support

| Package                                                         | Description              | License    |
| --------------------------------------------------------------- | ------------------------ | ---------- |
| [`@holoscript/lsp`](lsp/)                                       | Language Server Protocol | ELv2       |
| [`@holoscript/vscode-extension`](vscode-extension/)             | VS Code extension        | MIT        |
| [`@holoscript/intellij`](intellij/)                             | IntelliJ plugin          | MIT        |
| [`@holoscript/neovim`](neovim/)                                 | Neovim plugin            | MIT        |
| [`@holoscript/tree-sitter-holoscript`](tree-sitter-holoscript/) | Tree-sitter grammar      | MIT        |
| [`@holoscript/visual`](visual/)                                 | Visual editor            | Apache-2.0 |

## AI & Integration

| Package                                           | Description                              | License |
| ------------------------------------------------- | ---------------------------------------- | ------- |
| [`@holoscript/mcp-server`](mcp-server/)           | Model Context Protocol server (34 tools) | ELv2    |
| [`@holoscript/partner-sdk`](partner-sdk/)         | Partner API, webhooks, analytics         | MIT     |
| [`@holoscript/python-bindings`](python-bindings/) | Python bindings via WASM                 | MIT     |

## Infrastructure

| Package                                                     | Description           | License |
| ----------------------------------------------------------- | --------------------- | ------- |
| [`@holoscript/adapter-postgres`](adapter-postgres/)         | PostgreSQL adapter    | MIT     |
| [`@holoscript/registry`](registry/)                         | Package registry      | MIT     |
| [`@holoscript/fs`](fs/)                                     | File system utilities | MIT     |
| [`@holoscript/holoscript-component`](holoscript-component/) | Web component         | MIT     |

## Marketplace

| Package                                           | Description                | License |
| ------------------------------------------------- | -------------------------- | ------- |
| [`@holoscript/marketplace-api`](marketplace-api/) | Trait marketplace REST API | MIT     |
| [`@holoscript/marketplace-web`](marketplace-web/) | Trait marketplace web UI   | MIT     |
