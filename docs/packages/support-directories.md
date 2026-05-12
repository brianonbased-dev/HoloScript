# Support Directories Under `packages/`

The HoloScript monorepo includes a small set of directories under `packages/` that do useful work but do **not** currently ship as standalone package manifests. They are part of the repository's implementation surface, not part of the 59-package published/package.json-backed count used in the main package reference.

Use this page when you are navigating the repo itself and need to understand what these directories are for.

## Support Surface At A Glance

| Directory              | Status                  | Purpose                                         |
| ---------------------- | ----------------------- | ----------------------------------------------- |
| `.perf-metrics/`       | Internal data           | Local or generated performance output           |
| `components/`          | Source library          | Reusable `.holo` scene and gameplay templates   |
| `intellij/`            | IDE integration source  | JetBrains plugin project for HoloScript         |
| `plugins/`             | Extension workspace     | Domain-specific plugin prototypes and previews  |
| `python-bindings/`     | Language binding source | Python package source, examples, and tests      |
| `shader-preview-wgpu/` | Retired historical crate | Native `wgpu` preview prototype; see [Rust Spatial Stack History](./rust-spatial-stack-history.md) |
| `spatial-engine/`      | Retired historical crate | Native spatial/agent prototype; see [Rust Spatial Stack History](./rust-spatial-stack-history.md) |
| `spatial-engine-wasm/` | Retired historical crate | WASM spatial hot-path prototype; see [Rust Spatial Stack History](./rust-spatial-stack-history.md) |

`node_modules/` is intentionally omitted from this reference because it is an installed dependency tree, not a maintained repo surface.

## `.perf-metrics/`

This directory is currently empty in the workspace snapshot and appears to be reserved for local performance artifacts. Treat it as generated or ephemeral data rather than a source package.

Use it for:

- Capturing benchmark output during local runs.
- Comparing performance baselines without polluting published package metadata.
- Keeping profiling artifacts near the rest of the monorepo tooling.

## `components/`

The component library is a curated collection of reusable `.holo` templates. It is organized by gameplay/domain slices instead of npm package boundaries.

Current structure:

- `npcs/` for reusable characters such as warriors, mages, scouts, merchants, and bosses.
- `weapons/` for grab-ready or equip-ready items such as swords, bows, staffs, hammers, and spears.
- `ui/` for spatial HUD and interface templates such as chat, inventory, HUD, health bars, and menus.
- `environmental/` for world objects such as portals, doors, traps, fire, and water.
- `game-systems/` for higher-level systems such as dialogue, quests, achievements, save/load, and crafting.

According to the in-repo README, this library currently documents 25 reusable components. This directory is best understood as content/source material that higher-level packages, demos, or AI tooling can import.

## `intellij/`

This is the JetBrains plugin project for HoloScript language support. It is maintained as a Gradle-based IDE plugin source tree rather than as a Node package.

Key responsibilities:

- Syntax highlighting for `.hs`, `.hsplus`, and `.holo`.
- Code completion, diagnostics, and navigation features.
- Formatting and live templates for common HoloScript patterns.
- LSP-backed advanced language features via `@holoscript/lsp`.

Typical commands from the README:

```bash
cd packages/intellij
./gradlew build
./gradlew runIde
./gradlew test
```

## `plugins/`

This directory groups domain-specific plugin prototypes rather than published plugins. In the current workspace it contains:

- `alphafold-plugin/`
- `medical-plugin/`
- `robotics-plugin/`
- `scientific-plugin/`
- `web-preview/`

These subdirectories appear to be incubator or vertical-specific extensions. Keeping them outside the manifest-backed package count avoids overstating what is published while still preserving their role in the repo's experimental surface.

## `python-bindings/`

This directory contains the Python-facing distribution source for HoloScript, including:

- `holoscript/` package source
- `examples/`
- `tests/`
- `pyproject.toml`
- built artifacts under `dist/`

The README positions it as the Python entry point for parsing, validating, generating, rendering, and sharing HoloScript scenes from Python code. It is better treated as language-binding source and packaging material than as one of the JavaScript/TypeScript workspace packages counted in the monorepo package reference.

## Retired Rust Spatial Stack

`shader-preview-wgpu/`, `spatial-engine/`, and `spatial-engine-wasm/` existed in
early 2026 but are not present in the current tree. Their history and re-entry
bar are documented in [Rust Spatial Stack History](./rust-spatial-stack-history.md).

Do not describe them as current support directories. If one of these surfaces is
needed again, recreate it as a new cargo-checkable workspace member with a
deterministic test and a current product owner.

## How To Interpret These Directories

If you are documenting the public package surface, use the 59 package manifests documented in the main [Package Reference](./index.md).

If you are navigating or contributing to the repo itself, treat the directories on this page as implementation-adjacent support areas:

- some are historical Rust crates recorded for audit continuity,
- some are language-binding or IDE projects,
- some are reusable content libraries,
- some are incubator or generated directories.

That distinction keeps the public docs accurate without hiding important internal structure.
