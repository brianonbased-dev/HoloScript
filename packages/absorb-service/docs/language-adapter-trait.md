# `@language_adapter` — language ingestion as data

**Status:** spec / build target (`sug_1780711395408_m35r`). **Anchors:** NORTH_STAR rule #4
(plugins are data, not code), D.007 universal domain bridge, F.107 (HoloCI not GH Actions).

## The problem this closes

Today, teaching Absorb a new language is a **core PR**: write a `XAdapter` class in
`src/engine/adapters/`, add a `tree-sitter-X` dep, register it in `index.ts`, and extend the
`SupportedLanguage` type. Six languages (`java`, `cpp`, `csharp`, `php`, `swift`, `kotlin`)
already sit in the type union with **no adapter** — stranded build targets. "Language" is
hardcoded vocabulary, which rule #4 forbids.

`language-registry.json` (shipped) makes the _metadata_ data and the drift gate makes it
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
2. **Registry generation from traits** — `language-registry.json` is generated from
   `language-adapters/*.holo` plus adapter/code metadata by
   `pnpm --filter @holoscript/absorb-service generate:language-registry`. The drift gate
   now checks both the generated output and the adapter/grammar/type contracts.
3. **Grammar fetch-at-absorb** — resolve/install the pinned `grammar` package on first use
   (the WASM tree-sitter build, `@holoscript/wasm`, sidesteps the native-addon-in-worker-thread
   gotcha — see gap C5).
4. **Cross-language linkage** — because every trait emits the same schema, a TS `import` of a
   Rust crate or a Python↔C FFI edge is a graph-edge resolution pass, not per-language code.

## Migration path (incremental, deploy-safe)

| Step | Move                                                                                         | Risk                                                     |
| ---- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| ✅ 1 | `language-registry.json` + drift gate (metadata is data)                                     | additive, shipped (`33c4d75ab`)                          |
| ✅ 2 | `TreeSitterTraitAdapter` + `RUBY_TRAIT` — **Ruby added as data, zero bespoke code**          | additive, shipped (`bd0f4f993`); 4/4 deterministic tests |
| ✅ 3 | Generate `language-registry.json` from the trait set                                         | additive, guarded by the existing drift gate             |
| 4    | Port one _existing_ language (Go is smallest) to a trait; keep the class until parity proven | reversible, parity-gated                                 |
| ✅ 5    | Land the 6 stranded `declared` languages as `@language_adapter` `.holo` traits               | same TreeSitterTraitAdapter path as python/go/rust       |

### Adding a language: cover the member call, not just the bare call

Every grammar spells `helper()` roughly the same way and `obj.method()` differently, so a
trait that only handles the bare form looks finished and emits a call graph with almost no
edges. The six languages above each needed a distinct shape:

| Form                          | Grammars                | Trait key                            |
| ----------------------------- | ----------------------- | ------------------------------------ |
| callee under a field          | Go, Python, TS, C++, C# | `functionField` + `selector`          |
| callee/receiver are fields    | Ruby, Java, PHP         | `methodField` + `receiverField`       |
| no fields at all — positional | Swift, Kotlin           | `bareChildType` + `childSelector`     |

PHP needs three rules, not one: `function_call_expression` (`helper()`),
`member_call_expression` (`$this->x()`), and `scoped_call_expression` (`Klass::stat()`) are
separate node types. Swift/Kotlin wrap the receiver in a `navigation_expression` whose suffix
text keeps its leading dot, so the name is read from the identifier leaf inside it.

**Fixture rule:** a new language's fixture must contain a member call and assert its
`calleeOwner`. Asserting only bare calls is how the first cut of these six shipped three
empty call graphs with a green suite.

The win landed at step 2 (`bd0f4f993`): Ruby is ingested via the `RUBY_TRAIT` config object +
the generic `TreeSitterTraitAdapter` — **no `RubyAdapter` class exists**. Step 3 makes the
registry itself generated from `.holo` declarations, so registry drift is caught before a new
language becomes another hand-maintained side table. The four hand-written extractors
(TS/Python/Rust/Go) are untouched. Note: the current trait form is a node-type→kind rule table
(runnable through the existing `walkTree` machinery); the richer tree-sitter S-expression
`extractors` form above needs the `Language` object plumbed to adapters (a follow-up,
gap C5-adjacent).
