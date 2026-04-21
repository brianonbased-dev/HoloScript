# Tree-sitter in the browser: native vs WebAssembly (fallback design note)

**Date:** 2026-04-26  
**Scope:** Studio / IDE path from the board item **“Tree-Sitter WASM Fallback”** (audit estimate ~3 days). This memo frames options without implementing a parser swap.

## Why Tree-sitter in Studio

- **Incremental** re-parsing for `.hs` / `.hsplus` / `.holo` enables syntax-aware highlighting, outline, and cheap structural edits—when the **grammar** and **bindings** are available.

## Native (Node, desktop) vs WASM (browser)

- **Node / Electron / CLI:** can load **`.node` native** bindings; fastest, simplest in dev, not portable to **pure browser** Studio tabs.
- **WASM build:** compiles the parser C library + Tree-sitter runtime to **one** or **per-language** `.wasm` assets. Works in the browser, larger download, and **main-thread** costs unless offloaded to a **Worker** (copy costs for source edits).

## Fallback ladder (recommended)

1. **Primary (online):** WASM grammar for HoloScript languages, served from the same version pin as the CLI parser (hash or semver in `package.json`).
2. **Degraded: regex / lightweight lexer** for huge files or if WASM init fails (clear UI: “structural features limited”).
3. **Optional future:** `WebAssembly.instantiateStreaming` with **shared** grammar cache; **one** worker pool for all open documents.

## Risk checklist

- **Version skew:** grammar WASM must match the compiler/parser version the project expects (surface “parser mismatch” in UI).  
- **Memory:** re-parse on every keystroke → debounce; cap file size for full AST.  
- **Security:** only load **same-origin** or **SRI** `@holoscript` distributed WASM.  
- **SSR / Vitest:** follow existing patterns (namespace imports) so SSR test runs do not trip Vite’s synthetic imports.

## Outcome of this task

- Engineering can split **WASM packaging + worker + debounce** into implementation tickets; this note is the **agreed fallback semantics**.

## Related

- `packages/core` parser / Tree-sitter wiring as implemented over time (verify in-tree paths before coding).
