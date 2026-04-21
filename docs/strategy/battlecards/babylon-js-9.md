# Battlecard — Babylon.js 9.0

**Last updated**: 2026-04-17
**Threat level**: 🔴 **HIGH** (most time-sensitive of the four)
**Primary risk**: First-party MCP support would cement "agent-native 3D" as Babylon's story before HoloScript achieves distribution

---

## Quick Overview

| | |
|---|---|
| **Tagline** | "Powerful, Beautiful, Simple, Open" |
| **Backer** | Microsoft |
| **Audience** | Web devs + game devs wanting a batteries-included 3D engine |
| **Pricing** | Open source (Apache 2.0). Free. |
| **Latest release** | 9.0 (March 2026) |

## Their Pitch

- Full batteries-included 3D engine (editor, inspector, materials, physics)
- OpenPBR material standard built in
- Geospatial rendering, improved nav mesh + crowd agents, animation retargeting
- **Community MCP server exposes scenes to Claude/GPT for live manipulation** — the most direct AI-agent story of any 3D engine competitor

## Strengths (Be Honest)

1. **Editor + inspector out of the box** — HoloScript Studio is newer, less polished
2. **Microsoft distribution** — gets featured in Windows Dev Blog, Visual Studio demos, Azure examples
3. **OpenPBR adoption** — industry-standard material pipeline HoloScript doesn't yet match
4. **Geospatial + nav mesh** — real features HoloScript hasn't shipped
5. **Community MCP server exists today** — lets LLMs inspect/manipulate scenes live. This is the narrative lead.
6. **Time-to-wow ~2-3 min** via Playground + inspector
7. **Massive documentation + tutorials**

## Weaknesses

1. **Single-runtime engine** — Babylon renders via Babylon. No "compile to Three.js / R3F / Unity / Unreal" story. They're a destination, not an IR.
2. **No semantic layer** — shapes and materials, not meaning. No `@physics(mass:5)` traits that survive across targets.
3. **MCP story is community-contributed, not first-party** — vulnerable to a clean HoloScript first-party pitch
4. **No simulation/FEA capability** — just rendering physics
5. **No provenance / replay / contract architecture** — nothing like Trust by Construction
6. **Desktop/web only** — no cross-device compile target list
7. **Microsoft lock-in narrative** — Linux/Apple-skeptical audiences notice
8. **Bundle size** — larger than Three.js, similar to HoloScript

## Our Differentiators (vs Babylon)

| Differentiator | Why it matters | Proof |
|---|---|---|
| **Compile once, render anywhere** | One `.hs` file → Three.js + R3F + Unity + Unreal + USD + glTF | `packages/core/src/compilers/` — 30+ compile targets |
| **First-party MCP with 215+ tools** | Agent-native is architecture, not a plugin | mcp.holoscript.net `/health` |
| **Semantic IR, not a runtime** | Agents reason over `.holo` AST; Babylon agents reason over JS scene graph | Executable Semantics whitepaper |
| **Contracted simulation (`<2%` overhead)** | Trust by Construction — FEA with hash-verified replay | TVCG paper (submitted 2026-04-12) |
| **Browser WebGPU for simulation** | FEA in the browser; Babylon can't do this | paper-benchmarks.test.ts |
| **Provenance semirings (Tropical algebra)** | Algebraic trust composition nobody else has | W.GOLD.037 (semiring strategies; tropical is one resolution path) |

## Objection Handling

| Prospect says... | Respond with... |
|---|---|
| "Babylon has an MCP server too" | "Community plugin vs core capability. Ours ships 215+ MCP tools on day one. Their MCP is a scene inspector; ours is a platform — Absorb + HoloMesh + contracted simulation all exposed as tools." |
| "Babylon has a better inspector" | "True today. But you're comparing a 3D scene inspector to a language. `.holo` compiles to Babylon too — use their inspector and our IR if you want." |
| "Microsoft backs Babylon — that's enterprise-safe" | "Backing doesn't help if you need simulation, provenance, or cross-engine output. Babylon is a destination. HoloScript is a source that reaches every destination including Babylon." |
| "Babylon 9.0 has OpenPBR" | "Great. Our OpenPBR compile target consumes the same standard. This is not a moat — it's a shared baseline." |
| "Babylon is simpler to learn" | "For one scene on one engine, yes. For one scene on five engines, or a scene plus a simulation plus agent tooling, HoloScript is orders of magnitude simpler." |

## Landmines to Set

Questions to ask prospects early:

- **"Do you need your scene on more than one engine?"** → Babylon can't
- **"Do you need to share scenes with AI agents, not just users?"** → Babylon's MCP is scene inspection only
- **"Do you need simulation with verifiable replay?"** → Babylon has no simulation story
- **"Does your team use Three.js, R3F, or Unity alongside Babylon?"** → HoloScript unifies; Babylon doesn't
- **"Is your content going into a certified workflow (medical, legal, regulated)?"** → Babylon has no provenance

## Landmines to Defuse

Questions Babylon advocates might plant:

- **"Does HoloScript have a visual editor?"** → "Studio is the IDE; it's newer than Babylon's inspector but it's growing fast and integrates with every compile target." (Honest answer — our gap.)
- **"Does HoloScript have OpenPBR?"** → "Yes, via compile targets that support it. It's a standard, not a moat."
- **"How mature is HoloScript?"** → "103 days, 2,219 commits, IEEE TVCG paper submitted. Mature *enough* where it matters — physics correctness, V&V benchmarks, type safety."

## Win Conditions (deals we win against Babylon)

- Multi-engine / multi-target shops
- Teams with simulation or scientific computing
- Agent-native / MCP-first architectures
- Regulated industries needing provenance
- Teams building *their own* platform on top of an IR

## Loss Conditions (deals we lose to Babylon)

- Pure rendering / game engine use cases where single-engine is fine
- Heavy editor/inspector needs and the team is small
- Microsoft-stack shops where Babylon familiarity is a plus
- "Give me a working 3D app tomorrow" timelines where HoloScript hasn't shipped `npx create-holoscript` yet

## Urgent Actions (next 30 days)

1. **Ship `npx create-holoscript` with 30-sec time-to-wow** — removes the biggest advantage Babylon has today
2. **Publish a flagship multi-target demo**: same `.holo` → Babylon + Three.js + Unity + Unreal side by side
3. **Release a Babylon compile target** if not already first-class, to cement "HoloScript compiles TO Babylon; Babylon doesn't compile to anything"
4. **Submit HoloScript MCP to Cursor marketplace** — agent users will compare via MCP server quality, not 3D engine quality

## Signals to Watch

- Babylon MCP promotion from community to first-party (would accelerate threat)
- Microsoft Build 2026 Babylon announcements (early May)
- Babylon 9.x minor releases — track for MCP, agent, or provenance features
- Babylon forum + Discord mentions of "MCP", "agent", "provenance"

## Sources

- [Announcing Babylon.js 9.0 (Windows Dev Blog)](https://blogs.windows.com/windowsdeveloper/2026/03/26/announcing-babylon-js-9-0/)
- [Babylon.js 9.0 OpenPBR + engine updates](https://blogs.windows.com/windowsdeveloper/2026/04/02/part-3-babylon-js-9-0-openpbr-and-additional-engine-updates/)
- [MCP for Babylon — forum thread](https://forum.babylonjs.com/t/mcp-for-babylon-let-ai-agents-control-your-scene/62756)
- [Welcome to Babylon.js 9.0 — Medium](https://babylonjs.medium.com/welcome-to-babylon-js-9-0-c3edc9ee6428)
