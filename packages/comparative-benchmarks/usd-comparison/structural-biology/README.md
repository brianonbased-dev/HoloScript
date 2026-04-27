# OpenUSD structural-biology schema-plugin (paper-12 comparison companion)

Companion to `packages/plugins/structural-biology-plugin/` on the HoloScript
side. This directory holds the equivalent structural-biology extension authored
as an OpenUSD schema plugin, against a pinned upstream tag.

## Pinned upstream

- Repository: `PixarAnimationStudios/OpenUSD`
- Tag: **`v25.11`**
- Commit: `363a7c8da8d1937072a5f0989e91faf72eb1fa76`
- Released: 2024-10-24 (verified via GitHub Releases)

## Files in this directory (authored, not generated)

| File | What it is |
|------|------------|
| `schema.usda` | Schema authoring file. Input to `usdGenSchema`. |
| `plugInfo.json` | Plugin manifest. USD's `PlugRegistry` reads this to load the schema types. |
| `tokens.h` | Hand-authored representative slice of the C++ token header `usdGenSchema` produces from `schema.usda`. |
| `CMakeLists.txt` | Canonical pxr-style schema-plugin CMake build. |

## Canonical toolchain steps (v25.11)

The pxr docs (`USDDOC/userDocs/howto/code/SchemaCreation.html` in the v25.11
source tree, plus `pxr/usd/usd/usdGenSchema.py` for the codegen entry point)
list the following steps to take a new schema-plugin from authoring to a
loaded shared library that `Usd.Stage` can instantiate prims from:

1. **Author `schema.usda`** — declare classes (concrete typed + API
   schemas), inherit relationships, customData fields like `libraryName`,
   `libraryPrefix`, `tokensPrefix`, and per-class `apiSchemaType`.
2. **Author `plugInfo.json`** — declare each schema type's class alias,
   bases, and `schemaKind` (`concreteTyped`, `singleApplyAPI`, or
   `multipleApplyAPI`).
3. **Run `usdGenSchema schema.usda .`** — produces seven .h/.cpp class
   pairs, the corresponding `wrap*.cpp` Python bindings, `module.cpp`,
   `moduleDeps.cpp`, `tokens.h`, `tokens.cpp`, `__init__.py`, and the final
   `generatedSchema.usda`.
4. **Author `CMakeLists.txt`** — call `pxr_library(...)` with `LIBRARIES`,
   `PUBLIC_HEADERS`, `CPPFILES`, `PYMODULE_CPPFILES`, `PYMODULE_FILES`,
   `RESOURCE_FILES` (must include the generated `generatedSchema.usda` and
   `plugInfo.json`).
5. **Configure with CMake** — `cmake -DCMAKE_PREFIX_PATH=$PXR_USD_LOCATION
   -B build .` (requires Python 3.9+, Boost.Python, TBB, and a C++17
   compiler in addition to the pxr install).
6. **Build with CMake** — `cmake --build build --target install --config
   Release` produces the shared library + installs the resource files into
   the layout `PlugRegistry` expects.
7. **Set `PXR_PLUGINPATH_NAME`** — point USD at the install prefix so
   `PlugRegistry::GetInstance().GetPlugin("usdStructBio")` resolves at
   runtime.
8. **Author host code** — C++ or Python that creates prims of the new schema
   types, applies the API schemas, and writes the stage out as `.usda` or
   `.usdc`.

## Why this dir is the LOC-counted artifact, not a working build

Producing the *generated* outputs of step 3 requires a full pxr toolchain
install (build of `OpenUSD/v25.11` from source with Boost.Python +
TBB + ~6 GB of build artifacts; the upstream README's typical-build-time
quote is 25-45 minutes on a 16-core developer host before any schema-plugin
work begins). The authored files in this directory (steps 1, 2, 4, plus a
representative `tokens.h` slice from step 3) are sufficient for the LOC + step
count comparison the paper makes; reproducing the generated outputs is
documented but not run inside this monorepo's CI.

## Provenance visibility (the paper's central claim)

USD's composition engine sees layers and prims, but a compiled `.usdc`
binary does not preserve "this prim was authored by the
`usdStructBio` schema plugin" through stage flatten. After `Stage.Export()`
to a binary `.usdc`, a downstream consumer can recover prim **type names**
(`Protein`, `Ligand`, `Chain`) but cannot prove the `usdStructBio` plugin
was the source-of-truth — the prim is indistinguishable in hash terms from a
prim of the same type authored by another plugin. The HoloScript-side plugin
fuses the plugin id (`structural-biology@0.0.1`) into the per-residue
provenance anchor and the per-object chain hash, so a downstream verifier
can recover plugin attribution from the artifact alone via
`verifyChain(obj, expectedHash)`. The comparison harness exercises this
property end-to-end and writes the verdict into the artifact.
