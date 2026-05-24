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
| 4 | content / world evolution (CausalWorldModel do-calculus unlock + NPC memory across sessions) | **PASS** | `tsx gate-4-causal-memory-verify.mjs` (14/14) | `GATE-4-CAUSAL-MEMORY-receipt.json` | `e2e4e2ed7` |
| 5a | trained curation policy (learned, beats hand-authored heuristic) | **PASS** | `tsx gate-5a-trained-policy-verify.mjs` (8/8; top-1 1.00 vs heuristic 0.65 vs random 0.25) | `GATE-5A-TRAINED-POLICY-receipt.json` | `ca48ef955` |
| 5b | live human-operator session | **PASS** | real device capture (Quest 3 OculusBrowser, immersive-vr, controller tracked, 180 frames; operator code JIEH-IVBH confirmed) | `GATE-5BC-immersive-session.json` | `b54736e28` |
| 5c | Quest projection via `/embodied` | **PASS** | immersive-vr session on Quest 3 over WebXR (https tunnel); flat render `GATE-5C-quest-projection.png` | `GATE-5BC-immersive-session.json` + `GATE-5BC-DEVICE-SESSION-receipt.json` | `8ac011222` |
| 6 | interactive VR via REAL HoloGate (entry portal/menu + grab/say intents validated against HoloDoor scope = curate in-headset) | **PASS** | `tsx gate-6-hologate-verify.mjs` (10/10; genuine validatePortalIntent gates grab across drive-avatar/read-only/mutate-zone) | `GATE-6-HOLOGATE-receipt.json` | `8677bea54`+ |
| 7 | whole-stack conformance sweep (the kitchen sink — one .holo through HoloScript's real compilers/surfaces) | **PASS** | `tsx gate-7-conformance-verify.mjs` (8/8; 17/24 compilers REAL, 0 FAIL, no fake green) | `GATE-7-CONFORMANCE-receipt.json` | `0bcc334cd` |
| 8 | multi-agent mesh + economy (3 real AI curators + human; D.040 sovereign traits doing real work) | **PASS** | `tsx gate-8-mesh-economy-verify.mjs` (11/11; real Economy/Reputation/Agenda handlers, $0.50/day ceiling fires, 3 denial re-plans) | `GATE-8-MESH-ECONOMY-receipt.json` | _prev commit_ |
| 9 | Twin-Earth identity / permission / safety (per-entrant governance over the mesh) | **PASS** | `tsx gate-9-twin-earth-verify.mjs` (11/11; real twin_earth_* handlers — admission rejects malformed, permission gates the verb, safety envelope blocks destructive action) | `GATE-9-TWIN-EARTH-receipt.json` | `2cdf3a779` |
| 10 | HoloGraph + HoloEmbed (real vault lineage constellation as the playable structure) | **PASS** | `tsx gate-10-holograph-verify.mjs` (8/8; genuine 768-dim HoloEmbedEncoder, exact-by-construction graph recall 1.0, semantic retrieval) | `GATE-10-HOLOGRAPH-receipt.json` | `12a753109` |
| 11 | quantum-inspired curation (real QuantumInspiredTrait sharpens graduate/defer decisions) | **PASS** | `tsx gate-11-quantum-verify.mjs` (11/11; genuine quantumInspiredHandler, CPU-inspired fallback, deterministic; real-QPU is the separate /quantum-lab VQE track) | `be38f5ef1` |
| 12 | multi-physics solver (real StructuralSolver TET4 FEM over the vault keystone) | **PASS** | `tsx gate-12-solvers-verify.mjs` (5/5; genuine StructuralSolverAdapter, von-Mises stress under load, deterministic digest) | `GATE-12-SOLVERS-receipt.json` (`f46b930b1`) |
| 13 | hologram — real multiview quilt light-field of the vault world | **PASS** | `tsx gate-13-hologram-verify.mjs` (7/7; SHIPPED QuiltCompiler → 48-view 8x6 quilt for 16inch Looking Glass, all 8 vault objects projected into every view, cross-view parallax, deterministic digest) | `dca091918`/rebased `6a54f0891` |
| 14 | The Archivist — dialogue + quest arc (verdict driven by accumulated reputation) | **PASS** | `tsx gate-14-archivist-dialogue-verify.mjs` (7/7; real DialogueTrait v2.0.0 + ReputationLedger; sends back 4× then ratifies when trust crosses 0.55, opens HoloQuest; reputation→dialogue wire closed) | `e02daa661` |
| 15 | interactive controls — keyboard/pointer play OUTSIDE VR (shared 3D + 2D scheme) | **PASS** | `tsx gate-15-controls-verify.mjs` (9/9; shared `gold-game-controls.mjs` pure scheme wired into both builds; deterministic Bronze→Gold→Diamond traversal + graduate-on-keypress via HoloGate) | `GATE-15-CONTROLS-receipt.json` | `e0f8f7155` |
| 16 | audio layer — the Vault soundscape via REAL GodotCompiler (spatial AudioStreamPlayer3D + acoustic traits) | **PASS** | `tsx gate-16-audio-verify.mjs` (8/8; `gold-vault-audio.holo` → real GodotCompiler emits 4 AudioStreamPlayer3D (graduation cue, spire shimmer, collision clang, Archivist presence) + 4 AudioStreamPlayer (ambient bed + per-tier music); @audio_material metal/glass + @audio_occlusion + @audio_portal attach; audio-graph digest reproduces) | `GATE-16-AUDIO-receipt.json` | `40fd762ca` |
| 17 | NETCODE co-presence — two-participant agreement on shared vault state (REAL @holoscript/mesh, not a mock) | **PASS** | `tsx gate-17-netcode-verify.mjs` (9/9; genuine EntityAuthority lock denies the both-graduate-the-same-entry conflict — `requestTransfer=null`, no double-graduate; ReplicationManager delta broadcast + `applyRemoteUpdate` converges both clients to identical vault state + lock history; NetworkInterpolation buffers remote curator pose; agreement digest reproduces twice via real `computeStateDigest`) | `GATE-17-NETCODE-receipt.json` | `a5925daed` |
| 18 | true Loro CRDT convergence — concurrent vault edits merge commutatively (real loro-crdt) | **PASS** | `tsx gate-18-loro-crdt-verify.mjs` (7/7; genuine loro-crdt LoroDoc; two replicas edit concurrently with no shared clock then converge — no lost update, same-key conflict resolves deterministically, commutative, deterministic; closes the Loro gap Gate 17 flagged) | `GATE-18-LORO-CRDT-receipt.json` | `eb987c4a7` |
| 19 | **The Played Slice ("One Climb")** — proven coherent played loop (playability ratchet) | **PASS** | `tsx gate-19-played-slice-verify.mjs` (10/10; runs the shared `gold-game-loop.mjs` engine reusing Gates 2/8/14; OBSERVABLE T0–T6 trace: human graduate changes real vault → AI companion graduates independently w/ real economy+reputation → collision blocks → trust crosses 0.55 by accumulation → Archivist ratifies (negative-control gated) → win; deterministic. Anti-F.069: asserts state deltas, not a grep) | `GATE-19-PLAYED-SLICE-receipt.json` | `1f421d568` |
| 20 | economy balance — stake-on-submit kills the spam-farm strategy; reputation is the progression currency | **PASS** | `tsx gate-20-economy-balance-verify.mjs` (9/9; real economyPrimitivesHandler stake+reward over N=20; honest play BOUNDED — sink absorbs ~98% of inflation; spammer drains + self-limits via insufficient_funds; no-sink baseline inflates; Archivist stays earnable on reputation, not credits) | `GATE-20-ECONOMY-BALANCE-receipt.json` | `cb636e908` |
| 21 | population economy sweep — inflation curve flattens to ~0 as stake→reward; time-to-Diamond bounded + decoupled | **PASS** | `tsx gate-21-economy-sweep-verify.mjs` (8/8; real economy+reputation over 8 honest + 3 spammers × stake sweep 0→25; inflation/agent 250→200→150→100→50→0 monotonic; time-to-Diamond constant=3 across sweep; spammers lose+self-limit) | `GATE-21-ECONOMY-SWEEP-receipt.json` | `f29c69d6d` |
| 22 | desktop first-person control — actual player movement, mouse look, HoloGate graduate from the camera | **PASS** | `tsx gate-22-first-person-verify.mjs` (structural; pointer-lock first-person path, WASD/arrows, mouse yaw/pitch, E graduate, F inspect full entry; generated build exposes controls) | `GOLD-VAULT-gate1-receipt.json` (`desktopFirstPerson`) | `200fc72b5` |
| 23 | full GOLD data inspection — not metadata-only | **PASS** | `tsx gate-23-full-data-verify.mjs` (server resolves `W.GOLD.535` from `D:/GOLD/wisdom/w_gold_535.md`, returns full markdown body; static build embeds full text for seeded entries and live mode fetches `/api/vault-entry`) | `GOLD-VAULT-gate1-receipt.json` (`goldFullData`) | `200fc72b5` |
| 24 | start-of-game onboarding — where the game starts and what the next objective is | **PASS** | `tsx gate-24-start-onboarding-verify.mjs` (founder art embedded as opening vista; first objective visible; Begin One Climb dispatches first-person entry; Return to Overlook retry path wired) | `GOLD-VAULT-gate1-receipt.json` (`startOnboarding`) | `200fc72b5` |
| 25 | continuous campaign — what happens after One Climb | **PASS** | `node gate-25-campaign-verify.mjs` (32/32; exercises the SAME pure `gold-game-campaign.mjs` the build bundles — asserts STATE DELTAS: a graduation that didn't happen produces no progress, One Climb wins on first real graduate, Three Summits needs 3 distinct, save round-trips, corrupt save degrades clean; build wires real graduation→campaign + quest log + post-win next-ratchet + Continue/resume) | `GOLD-VAULT-gate1-receipt.json` (`continuousCampaign`) | `7ea6c3b49` |
| 26 | MMO answer gate — prove the shape before claiming MMO | **PASS** | `tsx gate-26-mmo-answer-verify.mjs` (15/15; real LobbyManager shard lobby + 3 named human entrants + 1 AI curator on ONE persistent vault; host Alice drops mid-graduation → genuine host migration to Bob + EntityAuthority force-transfer of the orphaned vault lock, no double-graduate; world rehydrates in a 2nd session, late entrant Dave sees full history; converged-world digest identical across sessions via real computeStateDigest). **Honest classification: SHARED-WORLD CO-OP WITH AGENTS, NOT MMO** — no massive concurrency / socket transport / shard-fleet / DB persistence | `GATE-26-MMO-ANSWER-receipt.json` | `e3f764830` |
| 27 | live-vault safe mutation flow | **PASS** | `tsx gate-27-safe-mutation-verify.mjs` (25/25; AI curator PROPOSES → vault UNTOUCHED (state delta = 0 via real `computeStateDigest`) → apply REFUSED without the founder approval token → apply with token mutates → `rollbackMutation` restores the EXACT pre-apply digest (proven, not asserted) → stale-digest fence refuses an apply if the vault moved; `D:/GOLD` never written — sandbox only, promotion stays a separate founder gate. Anti-F.069: asserts state deltas) | `GATE-27-SAFE-MUTATION-receipt.json` | `83ba21128` |
| 28 | full-vault browser | **PASS** | `node gate-28-fullvault-verify.mjs` (12/12; reads the SAME `vault-ops.readVaultCatalog` the live `/api/vault-list` server + offline drive-build embed both use; asserts STATE-LEVEL facts over the real `D:/GOLD` — 912 entries enumerated (>>4 seeds), search `q=secret` narrows to <full, non-existent needle returns 0 (real filter), `tier=diamond` filter == facet count, every entry carries a sha256 provenance seal, ≥50 entries have lineage links that resolve to OTHER real catalog entries (navigable); server↔offline parity via reproducible `catalogDigest`; generated build exposes the `data-gate28="full-vault-browser"` panel + search/lineage/provenance UI. READ-ONLY over `D:/GOLD` — graduate/mutate stay on the sandbox. Anti-F.069: state assertions, not greps) | `GATE-28-FULLVAULT-receipt.json` | `5f2ce2725` |
| 29 | agent party AI | **PASS** | `tsx gate-29-party-verify.mjs` (20/20; 3 NAMED visible companions — Archivist/Scout/Quartermaster — with DISTINCT persona value functions each pick a different real entry via the real `graduate()` verb; choices EXPLAINED with rationale grounded in live lineage/trust/balance (not canned); each EARNS the real economy reward under the genuine $0.50/day agenda ceiling (no breach); per-companion memory of the player PERSISTS to disk — a WARM session 2 loads it, GREETS the returning player by recalling session 1, and DEFERS the entry the player graduated last session (memory-attributable re-plan a cold party would not make); party + economy digests reproduce via real `computeStateDigest`. Anti-F.069: asserts state deltas) | `GATE-29-AGENT-PARTY-receipt.json` | `afa41fd14` |
| 30 | ship packaging | **PASS** | `node gate-30-package-verify.mjs` (40/40; runs the real `gate-30-package.mjs` into two fresh temp dirs — regenerates 3D via `drive-build.mjs` + retro-2D via `gold-2d-build.mjs` (both walk the parsed `.holo`), materializes the launcher/docs/`.bat`/`autorun.inf`/`server.cjs`/`vault-ops.cjs`/`sea-config.json`/`setup/` from canonical `package-assets.mjs`, copies to dest, and asserts STATE: every required artifact materializes on disk, deployed bytes == canonical source bytes for all 14 non-prebuilt artifacts (`deployedMatches`), the `packageDigest` is reproducible across two packagings, and the built artifacts are byte-identical. Closed the real drift it found: deployed `server.cjs`/`vault-ops.cjs`/`3d/index.html` had ALL diverged from source pre-Gate-30. The 92MB `GOLD-GAME-Server.exe` is a pre-built Node-SEA binary — verified present + digested, not regenerated. Anti-F.069: state assertions, not greps) | `GATE-30-SHIP-PACKAGING-receipt.json` | `304766c03` |
| 31 | playable HoloGraph constellation | **PASS** | `node gate-31-playable-holograph-verify.mjs` (consumes `GATE-10-HOLOGRAPH-receipt.json`; renders lineage nodes/edges in an in-game constellation; selecting a node dispatches the same full GOLD entry inspector as gems) | `GOLD-VAULT-gate1-receipt.json` (`playableHoloGraph`) | `200fc72b5` |
| 32 | HoloGram image-to-world | **PASS** | `tsx gate-32-hologram-image-to-world-verify.mjs` (8/8; ingests the REAL founder art `gold-vault-vista-wlNgg.jpg` via sharp → the SHIPPED `DepthEstimationService.estimateDepth` infers a real per-pixel depth map (depthRange 0.9938) → the SHIPPED `depthToNormalMap` Sobel normals, independently re-derived to prove they are not fabricated → depth+normals DISPLACE a 48×32 vertex grid into a 3D world source (`VaultVistaBackdrop` spatial_group that extends the parsed vault scene; emitted as a world SOURCE to `gold-vault-vista-world.json` — visibly rendering it in the playable build is Gate 34 holographic outputs + the Gate-1-pattern textured render, NOT yet mounted in drive-build) → world geometry digest reproduces deterministically via the real `computeStateDigest`. HONEST SCOPE: transformers.js is installed but the ONNX/WebGPU neural device did not initialize in this env, so the service ran its SHIPPED deterministic luminance fallback (`actualDepthPath=luminance-fallback`, same algorithm as `hologram-worker/src/depth-infer.ts`); the Depth Anything V2 neural backend is a runtime/model-availability upgrade, not a code change, and the image→world pipeline is backend-agnostic. Pixel raster + mesh tessellation are the deepening, same pattern as Gates 1/13. Anti-F.069: state assertions, not greps) | `GATE-32-HOLOGRAM-IMAGE-TO-WORLD-receipt.json` + `gold-vault-vista-world.json` | `fe9770a61` |
| 33 | HoloMap scanned-space import | **OPEN** | consume HoloMap for its actual job: scan video/device capture of a real space, reconstruct it, anchor it, export it, and let that space become a GOLD room/exhibit/portal | `SURFACE-ROLES-hologram-holomap.md` | _planned_ |
| 34 | HoloGram holographic outputs | **OPEN** | after G32 creates the world source, render the GOLD world/art into holographic targets: Looking Glass quilt, Vision Pro MV-HEVC, parallax WebM, content hash, and share receipt | _none yet_ | _planned_ |
| 35 | HoloScript kitchen-sink pass | **OPEN** | one playable pass consumes the whole stack coherently: HoloGraph lineage, HoloGram image-to-world, HoloMap scanned spaces, HoloGate mutation, HoloMesh/netcode, solvers, economy, reputation, and dialogue | _none yet_ | _planned_ |
| 36 | HoloScript package toolset | **PASS** | `node gate-36-holoscript-toolset-verify.mjs` (reads selected `packages/*/package.json` metadata, maps 20 HoloScript packages to GOLD game systems, embeds the toolset in the offline build, and exposes it in the in-game Systems panel) | `GOLD-VAULT-gate1-receipt.json` (`holoscriptToolset`) | `200fc72b5` |

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

## Product Home + Deployment (GOLD-owned, HoloScript-powered)

The GOLD game product home is **`D:/GOLD/assets/game/gold-game/`**. HoloScript is the toolset/engine
surface the game consumes; it should not be treated as the product owner.

The portable release lives on the **D: drive at `D:/GOLD-GAME/`** so it's movable (plug in → double-click → runs offline on any machine):
- `D:/GOLD-GAME/index.html` — launcher menu (pick **3D / VR** or **Retro 2D**)
- `D:/GOLD-GAME/3d/index.html` — interactive WebXR build (Gate 6: Enter VR → grab gems → HoloGate-validated graduate)
- `D:/GOLD-GAME/2d/index.html` — retro 2D build
- `D:/GOLD-GAME/GOLD-GAME-Server.exe` — optional live-vault-count server
- `D:/GOLD-GAME/PLAY LIVE GOLD GAME (Node).bat` — source live server with full `/api/vault-entry` reads on machines with Node

`examples/gold-game/` is the HoloScript engine harness and verifier mirror. GOLD-owned game content,
release intent, and product packaging belong under `D:/GOLD/assets/game/gold-game/`. **Gate 30 makes
the deploy one verified command** — `node examples/gold-game/gate-30-package.mjs` regenerates both
builds (3D + retro-2D from the `.holo`), materializes the launcher/docs/`.bat`/`autorun.inf`/server/setup
from the canonical `package-assets.mjs`, copies the exact bytes to `D:/GOLD-GAME/`, and emits
`GATE-30-SHIP-PACKAGING-receipt.json` proving deployed bytes == source. The next packaging correction is
to make that command sync the GOLD product home first, then emit the portable release.

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
