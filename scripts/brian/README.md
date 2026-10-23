# scripts/brian

`brian-import-turntable.mjs`: import report + fixed 8-angle turntable for Brian GLBs, using HoloScript's own paths only.

```
node scripts/brian/brian-import-turntable.mjs --out <dir> [--size 1024] [--skip-render] <file.glb...>
```

- Runs the TypeScript sources unbuilt via Vite SSR (no workspace build).
- Import: `packages/cli/src/importers/gltf-importer.ts` `importGltf`, `GltfMeshExtractor`, and `packages/core/src/assets/HumanoidLoader.ts` (bytes are passed through GLTFLoader.parse, and `self` is polyfilled for Node).
- Render: `renderCharacter()` (the WebGPU path that `CharacterHost.getDrawSpec()` feeds) on a native Dawn device (`webgpu` npm). It writes `<out>/<stem>/<angle>.png` and `<out>/manifest.json`, which records the sha256 of every GLB and PNG and the renderer commit.
- Known gaps, also recorded in the manifest: CharacterHost has no GLB body option (CharacterHost.ts:526-530), and renderCharacter does not sample textures, so renders are untextured.
- PNGs are not committed to this repo.