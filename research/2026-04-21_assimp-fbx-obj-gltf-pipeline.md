# Assimp for FBX / OBJ → glTF: server-side vs WebAssembly

**Date:** 2026-04-21  
**Scope:** Research note for HoloScript’s geometric pipeline and asset import story (complements `ModelImporter` in `packages/core/src/assets/ModelImporter.ts`).

## What Assimp is

[Open Asset Import Library (Assimp)](https://github.com/assimp/assimp) is a C++20 library that reads many 3D formats (including FBX, OBJ, Collada, glTF) and exposes a single scene graph (meshes, materials, cameras, lights, animation). It is the common choice when you need **one** conversion path for heterogeneous artist exports.

## When you need it

- **FBX** is common in DCC tools; it is not a first-class web format. A conversion step to **glTF 2.0** (or a narrow internal format) is normal for runtime and for Three/Babylon-style viewers.
- **OBJ** is simple but has no PBR or rigging; Assimp is still useful for batch OBJ → glTF when materials are MTL-based.
- **glTF** is already a good runtime target. Assimp is optional if your pipeline is glTF-only.

## Option A: Server-side (native) conversion

**How it works:** Run Assimp on a build machine, in CI, or in a small API service. Input = uploaded FBX/OBJ; output = `.gltf`/`.glb` + sidecars.

**Integration patterns:**

- **Subprocess** to a CLI built on Assimp (e.g. `assimp` command-line) or a thin Node/Rust/Go wrapper.
- **Microservice** (Docker) with a queue for heavy files; return signed URLs to converted assets.
- **CI**: convert on check-in; store only glTF in the repo or asset CDN.

**Pros:** Full feature coverage vs WASM builds, easier debugging, can use `assimp`’s importers and exporters on x64/ARM with fewer Emscripten quirks.

**Cons:** Infra and auth for uploads, virus scanning, and file-size limits; not suitable for “convert entirely in the browser” without a server.

## Option B: WebAssembly in the browser

**How it works:** Assimp (or a subset) is compiled with Emscripten. Community packages typically wrap a WASM binary and expose a JS API (e.g. load buffer → parse → scene). Search terms: `assimpjs`, “assimp emscripten.”

**Pros:** No server round-trip for small files; can run in a **Web Worker** to avoid blocking the main thread.

**Cons:**

- **Bundle size** is large; cold start and memory are real costs on mobile and VR.
- **Threading** in WASM is constrained by cross-origin isolation (COOP/COEP) if you want shared memory; many stacks stay single-threaded.
- Exporters and some importers are trimmed or differ from native; **validation** against known golden assets is required.

**Fit for HoloScript Studio:** use WASM only for *small* drag-and-drop probes; default heavy FBX to **server** conversion and cache glTF by content hash.

## Option C: “Not Assimp”

- DCC-specific exporters (Blender glTF, Maya plugins) for teams that can standardize.
- Format-specific libraries (dedicated FBX readers) are rare in permissive form; Assimp remains the default “kitchen sink” choice.

## Recommendation (2026-04-21)

1. **Primary path:** server or CI **native Assimp** (or DCC glTF export) → glTF 2.0 in storage. Align with `ModelImporter`’s glTF path as the supported runtime.
2. **Optional:** WASM only for a **capped** size (e.g. &lt; 10–20 MB) and worker offload; do not block Studio on full parity with native.
3. **Rig/animation:** treat FBX animation as a separate QA bucket; add golden tests when you wire conversion into `HumanoidLoader` / VRM flows.

## References

- Assimp: https://github.com/assimp/assimp  
- glTF: https://www.khronos.org/gltf/  
- `packages/core/src/assets/ModelImporter.ts` — current TypeScript import surface and format routing.

## Follow-ups (engineering, not this note)

- Define max upload size, timeout, and a job status API for “Converting…” UX (aligns with Studio geometric pipeline busy states).
- Add one **golden** FBX → glTF sample in `packages/core` tests once a converter service exists.
