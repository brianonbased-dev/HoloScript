# Battlecard — Unity

**Last updated**: 2026-05-13
**Threat level**: 🔴 **HIGH** (ecosystem lock-in; every game developer knows Unity)
**Primary risk**: Users compare HoloScript Studio to Unity Editor maturity and find us wanting; Asset Store network effect is unmatchable at current scale

---

## Quick Overview

| | |
|---|---|
| **Tagline** | "Create and grow amazing games and real-time experiences" |
| **Backer** | Unity Technologies (public; ticker U) |
| **Audience** | Game devs (indie → AAA), AEC, film, automotive, education |
| **Pricing** | Personal free (≤$200K revenue); Pro $2,040/seat/yr; Enterprise custom |
| **Latest** | Unity 6 (2024); Runtime Fee controversy (Sept 2023) damaged trust; "revert + apology" showed fragility |

## Their Pitch

- **Mature Editor** — 20+ years of UX refinement; Scene/Game/Inspector/Hierarchy/Project windows are muscle memory for millions
- **Asset Store** — 70,000+ assets; network effect where content creates demand creates content
- **Unity Learn** — structured courses, certifications, tutorials, sample projects
- **Profiler + Frame Debugger** — deep CPU/GPU/memory/network profiling integrated in-editor
- **Collaborate + Plastic SCM** — version control and team workflows built-in
- **LiveOps (Analytics, Remote Config, Cloud Build, Multiplay)** — post-launch game operation SaaS
- **Massive community** — Stack Overflow, Reddit, YouTube, Discord — self-sustaining knowledge base

## Strengths (Be Honest)

1. **Editor maturity** — 20 years of accumulated UX. HoloScript Studio is beta; Unity Editor is the industry benchmark.
2. **Asset Store network effect** — 70K assets means developers stay for content; content creators stay for buyers. Unmatchable without massive subsidy.
3. **Learning ecosystem** — Unity Learn, YouTube tutorials, certifications, university courses. HoloScript Academy does not exist at scale.
4. **Profiler depth** — CPU, GPU, memory, audio, physics, network, UI profiling integrated. HoloScript has `benchmark` and comparative benchmarks but no real-time in-editor profiler.
5. **Team collaboration** — Plastic SCM integration, Collaborate (deprecated but replaced), cloud project sharing. HoloScript has CRDT collab (`packages/crdt`) but no equivalent to Plastic/Git LFS large-asset workflows.
6. **LiveOps stack** — Analytics, Remote Config, Cloud Build, Multiplay, User Reporting. Post-launch operations as SaaS. HoloScript has no comparable post-launch operations suite.
7. **Compile target ubiquity** — 25+ platforms (console, mobile, desktop, web, XR). HoloScript has 30+ compile targets but many are beta/stubs.
8. **Community trust (fragile)** — Runtime Fee backlash showed the community *cares* deeply; the reversal showed Unity is vulnerable to community pressure.

## Weaknesses

1. **Runtime Fee trauma** — Sept 2023 install-fee announcement destroyed trust; reversal couldn't fully repair it. Competitors (Godot, Unreal) gained users permanently.
2. **WebGL bloat** — 20-50MB bundles; long load times; limited device reach. HoloScript's WebGPU path is leaner.
3. **Proprietary runtime** — you ship Unity's player; no verifiable replay, no deterministic contracts, no agent-native MCP.
4. **No semantic source** — C# scripts are code, not portable attestable compositions. No `.holo`-equivalent IR.
5. **Editor is desktop-only** — no browser-native editor; no `npx create-unity` equivalent.
6. **Asset Store lock-in** — assets are Unity-format; can't export to other engines easily.
7. **Collaborate sunset** — Plastic SCM is the replacement but migration friction exists.
8. **LiveOps pricing** — Analytics/Remote Config free tiers are limited; scale pricing is opaque.

## Our Differentiators (vs Unity)

| Differentiator | Why it matters | Proof |
|---|---|---|
| **Browser-native editor + runtime** | No install, no GPU floor, works on Chromebooks/tablets | `packages/studio/` + WebGPU runtime |
| **`.holo` semantic source — portable, versioned, attestable** | Unity C# is locked to Unity; `.holo` compiles to 30+ targets | `packages/core/src/compilers/` |
| **Deterministic replay + SimulationContract** | Byte-identical reproduction for V&V; Unity has no equivalent | TVCG paper + `packages/core/src/compiler/SimulationContract.ts` |
| **Agent-native MCP at platform layer** | Unity ML-Agents is bolt-on; HoloScript MCP is first-class | `mcp.holoscript.net` |
| **No runtime fee / no per-install tax** | Unity's pricing trauma is an open wound; we can exploit it | — |
| **Compile to Unity C#** | We're not a replacement; we're an upstream authoring layer | `docs/archive/packages/unity-sdk.md` |
| **Cross-domain simulation** | Unity is games-first; HoloScript is simulation-first (medical, legal, climate, molecular) | SimSci GPU solvers |

## Objection Handling

| Prospect says... | Respond with... |
|---|---|
| "Unity has the Asset Store" | "For pre-made 3D models and shaders, yes. For verifiable simulation contracts, agent-native behavior, and cross-domain digital twins — no. Different problem, different store." |
| "Our team already knows Unity" | "HoloScript compiles to Unity C#. You can keep your runtime and pipeline; we just replace the authoring layer with something portable and agent-native." |
| "Unity's profiler is essential" | "For real-time CPU/GPU profiling, Unity's is ahead. We're building profiler parity in `packages/benchmark`. If you need profiling today, profile in Unity after compiling from `.holo`." |
| "Unity Learn has everything we need" | "For game development, yes. For spatial simulation, agent governance, and verifiable digital twins — there's no Unity course because Unity doesn't do that." |
| "Unity has LiveOps" | "For post-launch game operations, Unity's stack is mature. We don't compete there yet. If your need is pre-launch simulation validation, we have something Unity doesn't." |

## Landmines to Set

- **"What's your team's install-fee risk tolerance?"** → Unity's Runtime Fee reversal proved pricing can change overnight
- **"Do you need simulation results that are legally defensible?"** → Unity has no deterministic replay or contract evidence
- **"Do your users access content via browser?"** → Unity WebGL is 20-50MB; HoloScript is WebGPU-native
- **"Do you need to target multiple engines from one source?"** → Unity C# is Unity-only; `.holo` is engine-agnostic
- **"How much do you spend on Asset Store assets per year?"** → If >$5K, they're locked in; if <$500, they're not using the ecosystem and are movable

## Landmines to Defuse

- **"HoloScript is just a web engine"** → "We compile to 30+ targets including Unity C#, Unreal Blueprint, and native VisionOS. Web is the lowest-friction entry point, not the only target."
- **"Unity has 20 years of editor polish"** → "True. Studio is beta. If you need Unity-grade editor polish today, author in `.holo` and compile to Unity. As Studio matures, you can shift the runtime too."
- **"The Asset Store is unbeatable"** → "For game content, yes. For simulation domains where Unity has no presence — medical, legal, climate, molecular — there's no Asset Store because there's no market. We're building that market."

## Win Conditions

- Teams burned by Runtime Fee who want an exit ramp
- Browser-first or multi-target workflows (web + mobile + XR from one source)
- Simulation-first domains where Unity has no presence (medical, legal, climate, molecular)
- Teams who need deterministic replay / verifiable simulation contracts
- Agent-native applications where ML-Agents is insufficient
- Academic partners who can't afford Unity Pro seats
- Teams building on USD who want an authoring layer upstream of Unity

## Loss Conditions

- Game studios deep in Unity Asset Store ecosystem (>100 purchased assets)
- Teams requiring Unity-specific middleware (Amplify Shader Editor, DOTS, etc.)
- Console-first studios where Unity's platform support is certified and ours is not
- Teams with extensive C# codebases who can't justify a rewrite
- LiveOps-heavy games already using Unity Analytics / Remote Config / Multiplay

## Strategic Plays

1. **Position HoloScript as "Unity's semantic upstream"** — not a replacement, but a portable authoring layer that compiles TO Unity. Reduces migration risk to zero.
2. **Exploit Runtime Fee trauma** — the trust wound is permanent. Every pricing conversation is an opportunity.
3. **Lead with simulation-first domains** — medical, legal, climate, molecular — where Unity has no ecosystem and no mindshare.
4. **Build Asset Store parity in niche verticals** — don't compete with 70K game assets; build 500 high-quality simulation assets for domains Unity ignores.
5. **Invest in profiler + learning** — these are the two biggest genuine gaps. Close them before claiming editor parity.
6. **Compile-to-Unity as onboarding ramp** — let users keep their runtime while adopting `.holo` source. Migrate runtime later.

## Gap Analysis — Editor / Asset / Learn / Profile / Collab / LiveOps

| Dimension | Unity State | HoloScript State | Gap Severity | ETA |
|---|---|---|---|---|
| **Editor maturity** | 20 years, industry benchmark | Beta Studio, 2 years | 🔴 High | 12-18 mo |
| **Asset Store** | 70K assets, network effect | No marketplace at scale | 🔴 High | 24-36 mo |
| **Learning platform** | Unity Learn + certifications | Docs + video-tutorials package | 🟠 Medium-High | 12-18 mo |
| **Profiler** | CPU/GPU/memory/audio/network | `benchmark` + `comparative-benchmarks` | 🟠 Medium-High | 6-12 mo |
| **Collaboration** | Plastic SCM + cloud projects | CRDT collab (`packages/crdt`) | 🟡 Medium | 6-9 mo |
| **LiveOps** | Analytics, Remote Config, Cloud Build, Multiplay | No equivalent | 🔴 High | 36+ mo |

**Conclusion:** HoloScript should not attempt to match Unity's full ecosystem breadth. Instead, lead with differentiation (simulation-first, deterministic replay, agent-native, browser-native) and build ecosystem depth selectively in verticals where Unity has no presence.

## Signals to Watch

- Unity pricing changes (any new install-fee or runtime-fee试探)
- Unity 6 adoption rate vs Godot/Unreal migration
- Asset Store revenue trends (growth = lock-in strengthens; stagnation = opportunity)
- Unity Learn content velocity (new courses = ecosystem health)
- Plastic SCM user satisfaction (fragility here = collaboration gap widens)
- Unity WebGL improvements (if they fix bundle size, our web advantage narrows)

## Sources

- [Unity Pricing](https://unity.com/pricing)
- [Unity Asset Store](https://assetstore.unity.com/)
- [Unity Learn](https://learn.unity.com/)
- [Unity Runtime Fee controversy (2023)](https://blog.unity.com/news/plan-pricing-and-packaging-updates)
- [Unity 6 release notes](https://unity.com/releases/unity-6)
- HoloScript Studio reference: `docs/guides/studio-reference.md`
- HoloScript benchmark suite: `packages/benchmark/`
- HoloScript CRDT collab: `packages/crdt/`
