# Battlecard — Omma (by Spline)

**Last updated**: 2026-07-08
**Threat level**: 🟠 **HIGH** (closest direct rival to Studio found to date)
**Primary risk**: Omma owns the "describe it → interactive 3D/web experience, in-browser, in seconds" creation UX — and markets **native WebGPU + parallel agents**, colliding head-on with two of HoloScript's own headline differentiators.

**Strategic note**: This is the competitor Joseph flagged as "what Studio should look like and how it should work." Treat it as the **Studio north star for creation UX** *and* a BUILD-INTERNAL rival — we do not bridge to a closed creation SaaS; we match its experience and win on the layers it cannot reach (multi-target compilation, open/sovereign, provenance, model-agnostic).

---

## Quick Overview

|              |                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------- |
| **Tagline**  | "Describe it. Omma builds it." / "Turn ideas into interactive experiences with AI"          |
| **Maker**    | **Spline** (established browser 3D-design tool); makers incl. Chris Messina                  |
| **Audience** | Creators, designers, developers, businesses — rapid prototyping of interactive experiences  |
| **Pricing**  | Free plan · Pro **$39/mo** · Enterprise                                                      |
| **Launched** | ~April 2026; Product Hunt #6 day, ~190 upvotes (young, rising, design-brand distribution)    |
| **Builds**   | Websites & web apps · interactive 3D scenes/games · presentations/demos                      |

## Their Pitch

- One natural-language prompt → a **real, running** multi-file project in seconds, no setup/boilerplate.
- **Parallel agents**: a single prompt can fan out **up to 100 agents**, each building its own page — code, images, 3D models, and data processed simultaneously.
- **Native WebGPU** rendering, straight in the browser.
- **Real code, real project**: writes components/hooks/utilities into separate files (React/JSX when needed); open the code explorer and hand-edit anything.
- **Multi-format generation**: images, video, 3D models, PBR materials, music, sound effects.
- **Data into creations**: ingests hundreds of inputs (CSV, JSON, DOC, GLB, OBJ, PNG, SVG, MP4, GLTF) and binds real data into the result.
- **Deploy instantly**: public URL, collaboration link, or custom domain. Responsive/mobile by default.

## How It Works (technical, as disclosed)

- Generates HTML/CSS/JS, with React/JSX when components are needed; produces runnable code with a live preview on a real bundler.
- Prompt fan-out orchestrates many agents in parallel across pages and asset types.
- Output is a **browser web app** — Omma is the runtime *and* the host. No disclosed export to Unity/Unreal/Godot/native/robotics; 3D-export-to-Three.js/Unity was an open user question at launch, not a shipped path.

## Strengths (Be Honest — this is the Studio north star)

1. **Time-to-wow.** One prompt → cinematic, animated 3D/web result in seconds. Studio `/vibe` is beta and slower to first delight.
2. **Inline multi-format asset generation.** Images, video, 3D models, PBR, music, SFX generated *in the same flow*. HoloScript has no comparable inline media-generation surface.
3. **Productized parallel-agent fan-out.** "Fan out up to 100 agents, each builds a page" is a *visible, sold* feature. HoloScript has deeper agent infra (HoloMesh, subagents, negotiation) but has **not** productized creation-time fan-out in Studio.
4. **Data-into-creation binding.** Feed real data, watch it come alive — polished at creation time. HoloScript has `.hs` pipelines but not this creation-moment UX.
5. **One-click deploy** (public URL / custom domain) with mobile-responsive defaults.
6. **Design pedigree + distribution.** Spline's existing creator base and brand seed adoption.
7. **"Real editable code" trust signal.** Multi-file project + code explorer answers the "is this just a toy?" objection.

## Weaknesses

1. **Destination, not source.** Output is a browser web app (HTML/CSS/JS/React). It does **not** compile one intent to many platforms — no Unity/Unreal/Godot/visionOS/OpenXR/robotics/native targets.
2. **Closed SaaS.** Proprietary, Spline-hosted; no self-host, no open license, your project lives on their runtime. Lock-in grows with use.
3. **Framework-specific glue.** The "real code" is React/JSX — exactly the vendor-specific glue HoloScript's thesis says buries portable intent. No typed semantic source that survives a cross-target compile.
4. **No provenance / verification.** No SimulationContract, CAEL hash-chain, unit validation, or replay — fine for landing pages, disqualifying for simulation/scientific/robotics/enterprise digital-twin use.
5. **No domain reach beyond web/design/3D.** No robotics, physics-accurate simulation, neuromorphic, scientific, IoT/digital-twin, or agent-service compilation.
6. **Product, not protocol.** No agent-callable MCP tool surface for *external* agents to build on; you use Omma, other models don't integrate it.
7. **Proprietary orchestration, not model-agnostic.** No open "any frontier model plugs in" story.
8. **Young.** ~3 months old, no reviews at launch, coherence-across-generation-types flagged by early users.

## Our Differentiators (vs Omma)

| Differentiator                       | Why it matters                                                                                  | Proof                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **Multi-target compilation**         | One `.holo` source → 50+ targets. Omma outputs a browser app; we output Unity/Unreal/robotics/XR/native + web | `packages/core/src/compiler/` · `sovereign-targets.ts`               |
| **Portable source is a destination** | Omma *is* the runtime; our source outlives any target and any vendor                            | `.holo`/`.hsplus`/`.hs` → `ExportTarget` union                       |
| **Open + sovereign, no lock-in**     | MIT, self-hostable, your data yours; Omma is closed Spline-hosted SaaS                          | `LICENSE` (MIT) · public MCP endpoint                                |
| **Model-agnostic**                   | Any frontier model plugs in via MCP; Omma is proprietary orchestration                          | `@holoscript/llm-provider` (OpenAI · Anthropic · Gemini)             |
| **Provenance & verification**        | SimulationContract, CAEL hash-chain, unit checks, replay — Omma has none                        | CAEL · SimulationContract evidence path                              |
| **Domain reach**                     | Robotics, simulation, neuromorphic, scientific, digital-twin — Omma is web/design only          | URDF/SDF/MJCF · NIR · USD-physics · DTDL compilers                   |
| **Protocol, not just product**       | External agents build *on* HoloScript via MCP tools; Omma is a closed creation app              | `mcp.holoscript.net` tool surface                                    |

⚠️ **WebGPU is no longer a unique claim.** Omma markets "native WebGPU" too. Stop leading against Omma with the sovereign renderer alone — lead with **multi-target + open + provenance + domain reach**, and treat WebGPU as table stakes.

## Strategic Posture: **BUILD-INTERNAL — Studio matches the UX, wins on the stack below it**

You cannot bridge to a closed creation SaaS. The response is to make Studio's creation experience match Omma's *and* expose the moat Omma structurally lacks.

### What Studio should adopt from Omma (north-star backlog)

1. **Collapse time-to-wow in `/vibe`** — one prompt → running, animated result in seconds, with a code explorer for hand-edits (answers the "real project?" objection).
2. **Inline multi-format asset generation** — wire image/video/3D/PBR/music/SFX generation into the creation flow (route via existing `generate_*` + media tools; fill gaps — see the audio/video compiler gaps in `docs/native-engine-registry.md`).
3. **Productize parallel-agent fan-out in Studio** — surface HoloMesh/subagent infra as a visible "fan out N agents, each builds a page/scene/target" creation feature. This is a *differentiator*: our fan-out can target **different compile targets**, not just different pages, and runs on open, model-agnostic infra.
4. **One-click deploy** — public URL / custom domain from Studio, mobile-responsive by default, on the sovereign WebGPU preview path already wired (`/scene/:id?renderer=webgpu`).
5. **Data-into-creation binding** — creation-moment ingest (`.hs` pipelines + Absorb) surfaced in Studio, not just as a separate pipeline builder.

### How we frame the win

> Omma builds you a beautiful browser app you rent. HoloScript builds you portable, verifiable source you own — that compiles to the browser *and* to Unity, Unreal, robots, headsets, and services, on any model, self-hosted if you want.

## Objection Handling

- **"Omma already does describe-to-3D in the browser, faster."** True today for a browser landing page. Ask where that app goes next — Quest? Unity? a robot? enterprise digital twin with audit receipts? Omma stops at the browser; HoloScript compiles the same intent everywhere and proves it.
- **"Omma has native WebGPU too."** Yes — WebGPU is table stakes now. The question is whether your *source* is portable and open, or locked to one hosted runtime.
- **"Omma writes real, editable code."** So does HoloScript — but React/JSX glue is a destination, not portable intent. Our `.holo` source survives a cross-target compile; their code does not.
- **"Spline has the brand and users."** Real distribution advantage. Our answer is open + multi-target + provenance for the users Omma can't serve (robotics, simulation, enterprise twins) and a creation UX that closes the gap for the ones it can.

## Sources

- https://omma.build/ — product, tagline, builds (web/3D/presentations), data formats, parallel agents
- https://omma.build/docs/getting-started/introduction — fan-out up to 100 agents, HTML/CSS/JS + React/JSX, live preview, deploy (public URL/collab/custom domain)
- https://omma.build/solutions — solutions surface (websites, apps, AI content)
- https://www.producthunt.com/products/omma — maker (Spline), launch (~Apr 2026), traction, "native WebGPU + parallel agents" maker quote
- Internal: `docs/native-engine-registry.md` · `packages/core/src/compiler/sovereign-targets.ts` · `docs/strategy/competitor-gap-matrix.md`
