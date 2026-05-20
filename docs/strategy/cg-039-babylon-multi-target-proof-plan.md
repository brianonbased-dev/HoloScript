# CG-039 Response: Multi-Target Web 3D Proof Plan

**Threat (from competitor-gap-matrix.json, 2026-05-18)**  
Babylon.js (Microsoft) community is moving toward an MCP server for "agent-native 3D". If they own the narrative and distribution channel first, HoloScript loses the semantic-layer story for web + WebXR + agent tooling.

**HoloScript Reality (already shipped)**  
The same `.holo` / `.hsplus` source compiles to **multiple** production 3D runtimes today via the IR + dedicated compilers:

- `--target babylon` → Babylon.js (TypeScript + full WebXR, Havok physics, Inspector, HoloLens)
- `--target threejs` → Three.js / React Three Fiber (default web target, largest ecosystem)
- `--target unity` → Unity C# + prefabs
- `--target unreal` → Unreal C++ + Blueprints

**Existing Evidence (no new code required for this slice)**

| Target       | Compiler Implementation                  | Positioning Doc                  | Notes |
|--------------|------------------------------------------|----------------------------------|-------|
| Babylon.js   | `packages/core/src/compiler/BabylonCompiler.ts` + test | `docs/compilers/babylon.md`     | Full trait mapping, WebXR, physics, glow |
| Three.js     | `threeJsCompiler`                        | `docs/compilers/three-js.md`    | Default, Vite dev server, R3F |
| Unity        | UnityCompiler                            | `docs/compilers/unity.md`       | Prefabs, 2021+ |
| Unreal       | UnrealCompiler                           | `docs/compilers/unreal.md`      | USD export path also works |

Additional assets: `packages/video-tutorials/src/data/compilers/babylon.ts` + rendered walkthrough video.

**Recommended Positioning (the counter-narrative)**  
"HoloScript is the semantic IR that compiles *to* Babylon.js (and Three.js, Unity, Unreal, Godot, WebGPU, USD, VRChat, ...). Use Babylon for its excellent renderer and tooling; use HoloScript for the agent-native, multi-target, receipt-verified layer above it."

This turns the threat into a co-existence story and keeps the high ground on "agent-native 3D".

**Local Farmable Slice Delivered (this commit)**  
- This plan document (explicit path only).  
- Cross-references all four web/3D compiler docs and the real BabylonCompiler implementation.  
- No founder spend, no external posting, no demotion of the broader needed response (marketplace submission, flagship side-by-side demo, create-holoscript 30s wow, Cursor MCP).

**Next (split, not demoted)**  
- Founder-gated or marketing-surface: actual public post, Cursor marketplace submission, live multi-target demo site.  
- Builder follow-up: small side-by-side example composition that truly emits to all four in one pass (if not already trivial via the MultiLayerCompiler / ExportManager).

**Verification Evidence**  
- This file: `docs/strategy/cg-039-babylon-multi-target-proof-plan.md`  
- Confirmed real compilers: `packages/core/src/compiler/BabylonCompiler.ts`, `threeJsCompiler`, UnityCompiler, UnrealCompiler  
- Docs live at `docs/compilers/{babylon,three-js,unity,unreal}.md`  
- Task closed with explicit-path commit only.

**Done when (satisfied)**  
Commit on main with the exact file above + references. No scope creep into posting or spend.

---

*Farm slice for task_1779307138688_4dtl — grok1-x402 (local hardware executor, 2026-05-20).*