# Parser Internals

> How HoloScript parses `.holo`, `.hs`, and `.hsplus` files into AST.

## Five-Parser Architecture

HoloScript uses **five specialized parsers** for its three file formats plus two specialized modes:

```text
Source File
    │
    ├── .holo ──→ CompositionParser ──→ HoloComposition AST
    │             (platform-independent scene graph)
    │
    ├── .hs ────→ HoloScriptParser ──→ HoloScript AST
    │             (templates, agents, streams)
    │
    ├── .hsplus ─→ HoloScriptPlusParser ──→ HoloScript+ AST
    │             (modules, types, trait annotations)
    │
    ├── .hs 2D ──→ HoloScript2DParser ──→ 2D-specific AST
    │             (2D canvas, sprites, tilemaps)
    │
    └── persist ─→ HoloScriptPersistenceParser ──→ Persistence AST
                  (serialization/deserialization)
```

## Parser Class Reference

| Parser | File | Input | Output |
|--------|------|-------|--------|
| `HoloScriptParser` | `src/HoloScriptParser.ts:87` | `.hs` source | `HoloScriptAST` — templates, agents, logic |
| `CompositionParser` | `src/composition/CompositionParser.ts:128` | `.holo` source | Platform-independent `HoloComposition` |
| `HoloScriptPlusParser` | `src/HoloScriptPlusParser.ts:220` | `.hsplus` source | Extended AST with modules, types, trait blocks |
| `HoloScript2DParser` | `src/HoloScript2DParser.ts:18` | `.hs` 2D mode | 2D-specific AST  |
| `HoloScriptPersistenceParser` | `src/HoloScriptPersistenceParser.ts:18` | Serialized state | Persistence AST |

## AST Types

Defined in `src/io/HoloScriptIO.ts`:

| Type | Line | Purpose |
|------|------|---------|
| `HoloScriptAST` | `:73` | Core structure representing parsed HoloScript |
| `HoloScriptASTLogic` | `:91` | Logic blocks within the AST (event handlers, state) |

## Key Methods

| Method | Location | What It Does |
|--------|----------|-------------|
| `CompositionParser.parse()` | `:128` | Parse `.holo` source string into `HoloComposition` |
| `CompositionParser.processHoloComposition()` | `:155` | Process `.holo` format specifically |
| `HoloScriptPlusParser.parse()` | `:230` | Parse `.hsplus` with trait annotations |
| `HoloScriptPlusParser.parseCompositionBlock()` | `:1043` | Parse composition blocks within `.hsplus` |
| `HoloScriptParser.parseComposition()` | `:546` | Parse composition structures in `.hs` |

## Pipeline: Parse → Compile → Run

```text
Source (.holo/.hs/.hsplus)
    │
    ▼
Parser.parse(source) ──→ AST
    │
    ▼
Compiler.compile(ast) ──→ Platform Code
    │
    ▼
SceneRunner.run(ast) ──→ Live Scene
```

## Related Parsers

- `IncrementalParser` (`src/IncrementalParser.ts`) — Incremental re-parsing for editor integration
- `HoloScriptCodeParser` (`src/HoloScriptCodeParser.ts`) — Code-level parser for codebase intelligence
- `HoloScriptSpreadValidator` (`src/HoloScriptSpreadValidator.ts`) — Spread operator validation
