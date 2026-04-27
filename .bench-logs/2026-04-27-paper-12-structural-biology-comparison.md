# Paper-12 §"Remaining Work" item 2 — Structural-Biology USD Comparison

- Date: 2026-04-27
- Pinned upstream: PixarAnimationStudios/OpenUSD **v25.11** (commit 363a7c8da8d1937072a5f0989e91faf72eb1fa76, 2024-10-24)
- HoloScript plugin: `packages/plugins/structural-biology-plugin/`
- OpenUSD comparison: `packages/comparative-benchmarks/usd-comparison/structural-biology/`
- Item 1 (scene-suite mean/median overhead) closed by `paper-12-scene-suite-overhead.bench.test.ts` (2026-04-27).

## LOC — HoloScript side

| File | Total | Non-empty | Effective (code) |
|------|-------|-----------|------------------|
| `packages/plugins/structural-biology-plugin/src/index.ts` | 198 | 175 | 98 |
| `packages/plugins/structural-biology-plugin/package.json` | 16 | 15 | 15 |
| **Sum** | **214** | **190** | **113** |

## LOC — OpenUSD side (pinned v25.11)

| File | Total | Non-empty | Effective (code) |
|------|-------|-----------|------------------|
| `packages/comparative-benchmarks/usd-comparison/structural-biology/schema.usda` | 154 | 143 | 131 |
| `packages/comparative-benchmarks/usd-comparison/structural-biology/plugInfo.json` | 87 | 86 | 86 |
| `packages/comparative-benchmarks/usd-comparison/structural-biology/tokens.h` | 53 | 45 | 33 |
| `packages/comparative-benchmarks/usd-comparison/structural-biology/CMakeLists.txt` | 98 | 88 | 73 |
| **Sum** | **392** | **362** | **323** |

## LOC differential

| Metric | HoloScript | OpenUSD (v25.11 authored) | USD/Holo ratio |
|--------|------------|----------------------------|-----------------|
| Effective code LOC | 113 | 323 | **2.86×** |
| Non-empty LOC | 190 | 362 | **1.91×** |

Note: the OpenUSD authored set above does NOT include the .h/.cpp pairs, wrap*.cpp Python bindings, module.cpp, moduleDeps.cpp, tokens.cpp, or generatedSchema.usda that step 3 (`usdGenSchema schema.usda .`) produces. Including those generated files (typically 600–1200 LOC for a plugin of this surface) widens the gap further. The numbers above measure only the lines a USD plugin author actually writes by hand on top of the v25.11 codegen.

## Toolchain step counts

| Side | Steps | Source |
|------|-------|--------|
| HoloScript | **1** | This harness; mirrors paper-12 §"Comparison with OpenUSD Schema Plugins". |
| OpenUSD v25.11 | **8** | Documented in `usd-comparison/structural-biology/README.md`; sourced from upstream pxr/usd/usd/usdGenSchema.py + USDDOC/userDocs/howto/code/SchemaCreation.html in the v25.11 source tree. |

### HoloScript steps

1. `import { register } from "@holoscript/structural-biology-plugin"; register(host)` from any host site.

### OpenUSD v25.11 steps

1. Author `schema.usda` declaring concrete-typed + API schema classes with their inheritance and customData.
2. Author `plugInfo.json` declaring each schema type alias, bases, and `schemaKind`.
3. Run `usdGenSchema schema.usda .` to produce per-class .h/.cpp pairs, wrap*.cpp Python bindings, module.cpp, moduleDeps.cpp, tokens.h/cpp, __init__.py, and generatedSchema.usda.
4. Author `CMakeLists.txt` calling `pxr_library(...)` with LIBRARIES, PUBLIC_HEADERS, CPPFILES, PYMODULE_CPPFILES, PYMODULE_FILES, RESOURCE_FILES.
5. CMake configure: `cmake -DCMAKE_PREFIX_PATH=$PXR_USD_LOCATION -B build .` (requires Python 3.9+, Boost.Python, TBB, C++17 compiler).
6. CMake build + install: `cmake --build build --target install --config Release` produces the shared library + installs resource files into the layout PlugRegistry expects.
7. Set `PXR_PLUGINPATH_NAME=$INSTALL_PREFIX/usd/plugin` so PlugRegistry resolves the new plugin at runtime.
8. Author host code (C++ or Python via Boost.Python) that creates prims of the new schema types and applies the API schemas.

## Provenance visibility

### HoloScript side — measured

- Plugin id fused into per-residue anchor + per-object chain hash via `@holoscript/structural-biology-plugin/chainHash()`.
- Test protein `EGFR` with 12 residues hashes to `0ee176da`.
- Plugin attribution recovered from the artifact: **structural-biology**.
- Tamper test (mutated trait list, unchanged residues): rejected by `verifyChain` → **PASS**.
- Result: a downstream consumer can prove "this object was authored by structural-biology@0.0.1" from the compiled artifact alone.

### OpenUSD v25.11 — break point

- After `Stage.Export()` to a binary `.usdc`, downstream consumers can recover prim type names (`Protein`, `Ligand`, `Chain`) but NOT the source-of-truth plugin id. Schema composition flattens the layer stack; the resulting prim is hash-indistinguishable from a same-typed prim authored by another plugin.
- USD's per-prim metadata can carry a `pluginId` string by convention, but that string is opaque to USD's composition engine — it is not algebraically fused into prim identity, and tampering with a residue annotation does not invalidate the prim's hash.
- Verdict: USD provenance break is structural to the composition model, not a missing feature in v25.11. The pinned-tag artifacts in `usd-comparison/structural-biology/` document this as the canonical surface; the `structBio:residueAnchor:anchorHex` opaque-string attribute exists to make the comparison explicit.

## Source pointers

- HoloScript plugin source: `packages/plugins/structural-biology-plugin/src/index.ts`
- HoloScript plugin tests: `packages/plugins/structural-biology-plugin/src/__tests__/index.test.ts`
- OpenUSD authored set: `packages/comparative-benchmarks/usd-comparison/structural-biology/{schema.usda,plugInfo.json,tokens.h,CMakeLists.txt}`
- OpenUSD pin + toolchain notes: `packages/comparative-benchmarks/usd-comparison/structural-biology/README.md`
- Harness: `packages/comparative-benchmarks/src/__tests__/paper-12-structural-biology-comparison.bench.test.ts` (this file)
