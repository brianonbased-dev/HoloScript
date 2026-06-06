# `@language_adapter` — language ingestion as data

**Status:** spec / build target (`sug_1780711395408_m35r`). **Anchors:** NORTH_STAR rule #4
(plugins are data, not code), D.007 universal domain bridge, F.107 (HoloCI not GH Actions).

## The problem this closes

Today, teaching Absorb a new language is a **core PR**: write a `XAdapter` class in
`src/engine/adapters/`, add a `tree-sitter-X` dep, register it in `index.ts`, and extend the
`SupportedLanguage` type. Six languages (`java`, `cpp`, `csharp`, `php`, `swift`, `kotlin`)
already sit in the type union with **no adapter** — stranded build targets. "Language" is
hardcoded vocabulary, which rule #4 forbids.

`language-registry.json` (shipped) makes the *metadata* data and the drift gate makes it
load-bearing. `@language_adapter` is the next increment: make the **extraction logic** data too,
so a new language is a `.holo` file + a grammar dep — **zero core PR.**

## The trait shape

```holo
@language_adapter {
  id: "ruby"
  grammar: "tree-sitter-ruby@0.21.0"          // npm package + pinned version, fetched at absorb-time
  extensions: [".rb", ".rake"]
  embedding_dialect: "ruby"                     // symbol-name tokenization hint

  // tree-sitter S-expression queries — the per-language extraction, now DATA not a class.
  // Each query binds capture names the universal node/edge schema understands.
  extractors: {
    symbols: "(class name: (constant) @name) @def
              (method name: (identifier) @name) @def"
    calls:   "(call method: (identifier) @name)"
    imports: "(call method: (identifier) @m (#match? @m \"^(require|require_relative|load)$\")
                arguments: (argument_list (string) @target))"
  }
}
```

This is the `map_data` / `map_csv` universal-bridge pattern (data → `.holo` → graph) applied to
**language ingestion** instead of dataset ingestion.

## What has to exist for it to run (the build)

1. **A generic query-driven adapter** — `TreeSitterTraitAdapter` that implements the existing
   `LanguageAdapter` interface (`language`, `extensions`, `grammarPackage`, `extractSymbols`) by
   loading the grammar named in the trait and running the trait's `extractors` queries, emitting
   the **one universal node/edge schema** (Symbol / File / Call / Import / Definition / Reference).
   The hand-written `TypeScriptAdapter` etc. stay until a trait reproduces their extraction at
   parity — migrate per-language, never big-bang on a live service.
2. **Registry generation from traits** — `language-registry.json` becomes generated from the
   set of `@language_adapter` declarations (today it is hand-authored; the drift gate already
   guards it). The gate's contract is unchanged: registry ⊇ adapters ⊆ grammars.
3. **Grammar fetch-at-absorb** — resolve/install the pinned `grammar` package on first use
   (the WASM tree-sitter build, `@holoscript/wasm`, sidesteps the native-addon-in-worker-thread
   gotcha — see gap C5).
4. **Cross-language linkage** — because every trait emits the same schema, a TS `import` of a
   Rust crate or a Python↔C FFI edge is a graph-edge resolution pass, not per-language code.

## Migration path (incremental, deploy-safe)

| Step | Move | Risk |
|---|---|---|
| ✅ 1 | `language-registry.json` + drift gate (metadata is data) | additive, shipped |
| 2 | `TreeSitterTraitAdapter` + author `@language_adapter` for one *new* language (e.g. Ruby) | additive — new capability, no existing path touched |
| 3 | Generate `language-registry.json` from the trait set | guarded by the existing drift gate |
| 4 | Port one *existing* language (Go is smallest) to a trait; keep the class until parity proven | reversible, parity-gated |
| 5 | Land the 6 stranded `declared` languages as traits, no core PR each | the payoff |

The win lands at step 2 (a language added with zero core code), proving the architecture before
any existing extractor is touched.
