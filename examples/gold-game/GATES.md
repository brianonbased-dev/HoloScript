# THE GOLD GAME — Gate Ledger (single source of truth)

> **This file is authoritative for gate status.** Do not reconstruct gate status from
> commit messages, receipts, or memory — read this ledger and re-derive it live with
> `node examples/gold-game/verify-all.mjs`. Reconstructing status ad-hoc is what caused
> two false "done" reports (the Oasis-vs-flagship conflation). See "Why this file exists".

## The one rule that prevents the drift

There are **two tracks** that share gate numbers. **An Oasis Gate-N PASS NEVER satisfies a
flagship Gate-N.** They are different games. Only the **flagship** counts as "the GOLD game."

| Track | What it is | Where |
|-------|------------|-------|
| **flagship** (canonical) | the GOLD knowledge-curation system turned into a game; play-actions are real vault curation ops | `gold-vault-game.holo` + this directory |
| **oasis (fixture, retired)** | abstract compass demo; kept ONLY as the cited proof that the AI↔human connection *mechanics* are real | `connection-mechanics-proof/` |

## Flagship gates (the canonical ladder)

| Gate | Name | Status | Verifier (re-derive) | Receipt | Landed commit |
|------|------|--------|----------------------|---------|---------------|
| 0 | parse clean | **PASS** | `parseHolo(gold-vault-game.holo)` (run via verify-all) | `GOLD-VAULT-gate0-receipt.json` | `6b281ecdd` |
| 1 | R3F Drive render | **PASS\*** | artifact `drive-build/index.html` + headless render (manual) | `GOLD-VAULT-gate1-receipt.json` + `GATE-1-drive-render.png` | `6b281ecdd` |
| 2 | curation graduate verb | **PASS** | `node gate-2-graduate-verify.cjs` (10/10) | `GATE-2-graduate-receipt.json` | `6b281ecdd` |
| 3 | curation co-session (AI↔human, real graduate verb) | **PASS** | `tsx gate-3-curation-verify.mjs` (15/15) | `GATE-3-CURATION-cosession-receipt.json` | `62024addc` |
| 4 | content / world evolution (CausalWorldModel do-calculus unlock + NPC memory across sessions) | **PASS** | `tsx gate-4-causal-memory-verify.mjs` (14/14) | `GATE-4-CAUSAL-MEMORY-receipt.json` | _this commit_ |
| 5a | trained curation policy (learned, beats hand-authored heuristic) | **PASS** | `tsx gate-5a-trained-policy-verify.mjs` (8/8; top-1 1.00 vs heuristic 0.65 vs random 0.25) | `GATE-5A-TRAINED-POLICY-receipt.json` | _this commit_ |
| 5b | live human-operator session | **PASS** | real device capture (Quest 3 OculusBrowser, immersive-vr, controller tracked, 180 frames; operator code JIEH-IVBH confirmed) | `GATE-5BC-immersive-session.json` | _this commit_ |
| 5c | Quest projection via `/embodied` | **PASS** | immersive-vr session on Quest 3 over WebXR (https tunnel); flat render `GATE-5C-quest-projection.png` | `GATE-5BC-immersive-session.json` + `GATE-5BC-DEVICE-SESSION-receipt.json` | _this commit_ |
| 6 | interactive VR via REAL HoloGate (entry portal/menu + grab/say intents validated against HoloDoor scope = curate in-headset) | **PASS** | `tsx gate-6-hologate-verify.mjs` (10/10; genuine validatePortalIntent gates grab across drive-avatar/read-only/mutate-zone) | `GATE-6-HOLOGATE-receipt.json` | `8677bea54`+ |
| 7 | whole-stack conformance sweep (the kitchen sink — one .holo through HoloScript's real compilers/surfaces) | **PASS** | `tsx gate-7-conformance-verify.mjs` (8/8; 17/24 compilers REAL, 0 FAIL, no fake green) | `GATE-7-CONFORMANCE-receipt.json` | `0bcc334cd` |
| 8 | multi-agent mesh + economy (3 real AI curators + human; D.040 sovereign traits doing real work) | **PASS** | `tsx gate-8-mesh-economy-verify.mjs` (11/11; real Economy/Reputation/Agenda handlers, $0.50/day ceiling fires, 3 denial re-plans) | `GATE-8-MESH-ECONOMY-receipt.json` | _prev commit_ |
| 9 | Twin-Earth identity / permission / safety (per-entrant governance over the mesh) | **PASS** | `tsx gate-9-twin-earth-verify.mjs` (11/11; real twin_earth_* handlers — admission rejects malformed, permission gates the verb, safety envelope blocks destructive action) | `GATE-9-TWIN-EARTH-receipt.json` | `2cdf3a779` |
| 10 | HoloGraph + HoloEmbed (real vault lineage constellation as the playable structure) | **PASS** | `tsx gate-10-holograph-verify.mjs` (8/8; genuine 768-dim HoloEmbedEncoder, exact-by-construction graph recall 1.0, semantic retrieval) | `GATE-10-HOLOGRAPH-receipt.json` | `12a753109` |
| 11 | quantum-inspired curation (real QuantumInspiredTrait sharpens graduate/defer decisions) | **PASS** | `tsx gate-11-quantum-verify.mjs` (11/11; genuine quantumInspiredHandler, CPU-inspired fallback, deterministic; real-QPU is the separate /quantum-lab VQE track) | `be38f5ef1` |
| 12 | multi-physics solver (real StructuralSolver TET4 FEM over the vault keystone) | **PASS** | `tsx gate-12-solvers-verify.mjs` (5/5; genuine StructuralSolverAdapter, von-Mises stress under load, deterministic digest) | `GATE-12-SOLVERS-receipt.json` (`f46b930b1`) |
| 13 | hologram — real multiview quilt light-field of the vault world | **PASS** | `tsx gate-13-hologram-verify.mjs` (7/7; SHIPPED QuiltCompiler → 48-view 8x6 quilt for 16inch Looking Glass, all 8 vault objects projected into every view, cross-view parallax, deterministic digest) | `dca091918`/rebased `6a54f0891` |
| 14 | The Archivist — dialogue + quest arc (verdict driven by accumulated reputation) | **PASS** | `tsx gate-14-archivist-dialogue-verify.mjs` (7/7; real DialogueTrait v2.0.0 + ReputationLedger; sends back 4× then ratifies when trust crosses 0.55, opens HoloQuest; reputation→dialogue wire closed) | `e02daa661` |
| 15 | interactive controls — keyboard/pointer play OUTSIDE VR (shared 3D + 2D scheme) | **PASS** | `tsx gate-15-controls-verify.mjs` (9/9; shared `gold-game-controls.mjs` pure scheme wired into both builds; deterministic Bronze→Gold→Diamond traversal + graduate-on-keypress via HoloGate) | `GATE-15-CONTROLS-receipt.json` | _this commit_ |
| 16 | audio layer — the Vault soundscape via REAL GodotCompiler (spatial AudioStreamPlayer3D + acoustic traits) | **PASS** | `tsx gate-16-audio-verify.mjs` (8/8; `gold-vault-audio.holo` → real GodotCompiler emits 4 AudioStreamPlayer3D (graduation cue, spire shimmer, collision clang, Archivist presence) + 4 AudioStreamPlayer (ambient bed + per-tier music); @audio_material metal/glass + @audio_occlusion + @audio_portal attach; audio-graph digest reproduces) | `GATE-16-AUDIO-receipt.json` | _this commit_ |
| 17 | NETCODE co-presence — two-participant agreement on shared vault state (REAL @holoscript/mesh, not a mock) | **PASS** | `tsx gate-17-netcode-verify.mjs` (9/9; genuine EntityAuthority lock denies the both-graduate-the-same-entry conflict — `requestTransfer=null`, no double-graduate; ReplicationManager delta broadcast + `applyRemoteUpdate` converges both clients to identical vault state + lock history; NetworkInterpolation buffers remote curator pose; agreement digest reproduces twice via real `computeStateDigest`) | `GATE-17-NETCODE-receipt.json` | `a5925daed` |
| 18 | true Loro CRDT convergence — concurrent vault edits merge commutatively (real loro-crdt) | **PASS** | `tsx gate-18-loro-crdt-verify.mjs` (7/7; genuine loro-crdt LoroDoc; two replicas edit concurrently with no shared clock then converge — no lost update, same-key conflict resolves deterministically, commutative, deterministic; closes the Loro gap Gate 17 flagged) | `GATE-18-LORO-CRDT-receipt.json` | _this commit_ |

> Honest scope on 5b/5c: proven = a real human operated a true immersive-vr session of the projected GOLD game on a Quest 3. NOT yet proven (now Gate 6): in-headset *interaction* — there is no start menu and no way to act on the world yet, because the build is a passive WebXR render that does not go through **HoloGate** (the multi-entrant portal/intent layer). Gate 6 wires HoloGate so the headset session becomes playable.

`*` Gate 1 is artifact/receipt-backed; the full WebGL render is headless/manual (needs a browser), so the runner checks the committed artifact exists rather than re-rendering.

## Modalities (one `.holo` → many devices — D.007)

The flagship `gold-vault-game.holo` is the single source; it renders in multiple modalities,
each built by walking the *identical* parsed scene (proven by a shared `sceneDigest`).

| Modality | Status | Builder | Artifact | Receipt |
|----------|--------|---------|----------|---------|
| 3D (R3F / three.js Drive build) | **PASS** | `node drive-build.mjs` | `drive-build/index.html` | `GOLD-VAULT-gate1-receipt.json` |
| retro 2D (HTML5 canvas, pixel/scanline) | **PASS** | `tsx gold-2d-build.mjs` | `2d-build/index.html` + `2d-build/GOLD-2D-render.png` | `GOLD-VAULT-2D-receipt.json` |

Cross-modality proof: `tsx modality-verify.mjs` (10/10) — same `.holo` → one `sceneDigest`
(`b1cb9df0…` via the real `computeStateDigest`); both builds exist and embed that scene; 2D is
a pixel canvas (no WebGL), 3D is WebGL. Full pixel render verified by opening `index.html`
(2D headless render captured at `2d-build/GOLD-2D-render.png`, 0 console errors).

## Conformance sweep — the kitchen sink (micro-HoloLand)

Gate 7 throws HoloScript's whole stack at the ONE `gold-vault-game.holo` and records honestly
what works (`tsx gate-7-conformance-verify.mjs`; receipt `GATE-7-CONFORMANCE-receipt.json`).
Snapshot: **33 surfaces — 20 REAL, 0 FAIL, 13 SKIP; 17/24 compilers REAL.**

- **REAL compilers (one `.holo` → these targets):** ThreeJS, Babylon, Godot, Unity, Unreal, OpenXR, VisionOS, iOS, Android, AndroidXR, AR, MultiLayer, USDPhysics, SDF, TSL, URDF, DTDL — plus parse, trait-composition (D.040 library), and the SimulationContract digest.
- **FAIL: none.** (The 4 prior FAILs were resolved: AR + MultiLayer needed constructor options; TraitComposition needed `{name, components[]}` decls; HolobCompiler reclassified to SKIP — it needs the optional `@holoscript/holo-vm` package built/linked, not a code fix.)
- **SKIP → the deepening tracks (each becomes its own gate):** multi-physics solvers · HoloMesh multi-agent · Twin-Earth identity/safety · quantum (`@quantumInspired`) · holograms (MV-HEVC/quilt) · HoloGraph/HoloEmbed; plus compilers needing a build/link or not in the published dist (Holob → `@holoscript/holo-vm`; GaussianSplatting, USDZExport, PlayCanvas, NIR, PhoneSleeveVR, A2AAgentCard).

This is breadth-first by design: it proves how much of HoloScript one artifact already flows through, and the FAIL/SKIP rows ARE the kitchen-sink roadmap.

## Deployment (movable Drive build — founder-ratified)

The whole game lives on the **D: drive at `D:/GOLD-GAME/`** so it's portable (plug in → double-click → runs offline on any machine):
- `D:/GOLD-GAME/index.html` — launcher menu (pick **3D / VR** or **Retro 2D**)
- `D:/GOLD-GAME/3d/index.html` — interactive WebXR build (Gate 6: Enter VR → grab gems → HoloGate-validated graduate)
- `D:/GOLD-GAME/2d/index.html` — retro 2D build
- `D:/GOLD-GAME/GOLD-GAME-Server.exe` — optional live-vault-count server

Source of truth is `examples/gold-game/` (this dir); the Drive is a deployed copy (regenerated by `drive-build.mjs` + `gold-2d-build.mjs`, then copied to `D:/GOLD-GAME/`).

## Oasis fixture (retired — connection-mechanics proof only)

| Gate | Name | Status | Verifier | Receipt | Digest provenance |
|------|------|--------|----------|---------|-------------------|
| 3 | compass co-session (mechanics proof) | **PASS** | `tsx connection-mechanics-proof/gate-3-verify.mjs` (12/12) | `connection-mechanics-proof/GATE-3-cosession-receipt.json` | `sharedWorldDigest=a4c1072b…` / `wmrDigest=d7ee5d31…` (orig commit `7cf8ef3eb`) |

Oasis Gate 0/1/2 were uncited scaffolding — **retired** (founder-approved 2026-05-22); recover from git history if needed.

## Canonical records

- GOLD vault: **W.GOLD.537** (`D:/GOLD/wisdom/w_gold_537.md`)
- Team knowledge: `W.team.1779434394145.lhq` (mechanics) + `W.team.1779436746889.kg7` (flagship Gate 3)

## Re-derive everything

```
node examples/gold-game/verify-all.mjs    # prints this table live; exit 0 iff all runnable gates PASS
```

## Why this file exists

Before this ledger, gate status was scattered across commit messages, eight receipt JSONs, a
GOLD entry, and two knowledge entries. Each marathon cycle reconstructed status from scratch
and reconstructed it wrong — twice mapping the Oasis compass Gate 3 onto the flagship's
curation Gate 3 and reporting an unbuilt gate as "done". The fix is structural: one ledger,
one runner, one hard cross-track rule. Read the ledger; trust the runner; never let an Oasis
PASS satisfy a flagship gate.
