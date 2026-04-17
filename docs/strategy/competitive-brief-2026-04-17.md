# HoloScript Competitive Brief — 2026-04-17

**Research date**: 2026-04-17 (updated 2026-04-17)
**Scope**: 4 competitive fronts, 16 competitors profiled (8 in depth)
**Status**: Primary strategic document. Refresh quarterly.

**Supporting documents** in `docs/strategy/`:
- `battlecards/babylon-js-9.md`
- `battlecards/nvidia-omniverse.md`
- `battlecards/cursor.md`
- `battlecards/ansys.md`
- `positioning-spatial-sovereignty.md`
- `positioning-verifiable-digital-twin.md`
- `deep-dive-babylon-mcp.md`
- `competitive-monitoring-plan.md`

---

## 1. Executive Summary

HoloScript sits at the intersection of four markets, none of which has a direct competitor at that intersection. The three biggest strategic findings:

1. **The white space is real.** No competitor combines (a) browser-native WebGPU, (b) one-source-to-N-targets compilation, (c) agent-native authoring, and (d) contracted simulation with hash-verified replay. Every competitor wins one or two dimensions; nobody wins all four.

2. **The biggest threat is Babylon.js 9.0 + MCP**, not NVIDIA Omniverse or ANSYS. Microsoft-backed, batteries-included, and a community MCP server is already live. If Babylon makes MCP first-party before HoloScript achieves distribution, "agent-native 3D" becomes Babylon's story. See `deep-dive-babylon-mcp.md`.

3. **The Cavrnus name-collision risk flagged in W.033 was over-stated.** Cavrnus is a Unreal/Unity collaboration plugin, not a platform competitor. Low trademark and phonetic collision. The real category overlap is in AEC digital-twin RFPs — differentiate on architecture, not branding.

**Biggest opportunity**: Claim **"Spatial Sovereignty"** as a positioning narrative. Apple owns "spatial computing" (consumer), NVIDIA owns "Physical AI" / "digital twin" (industrial) — nobody owns browser-native + agent-native + contracted simulation + no vendor lock-in. That's HoloScript's corner. See `positioning-spatial-sovereignty.md`.

**Second biggest opportunity**: Claim **"Verifiable Digital Twin"** as category. The CAE industry has publicly given up on byte-identical reproducibility. HoloScript has it. See `positioning-verifiable-digital-twin.md`.

**Biggest threat**: Cursor + LangGraph could add generic "domain compilers" via MCP-pluggable registry. HoloScript must be the default MCP spatial/simulation server *inside* Cursor and LangGraph — not compete against them.

---

## 2. Four-Front Competitive Landscape

### Front A: Spatial Runtime / 3D Engines

#### Three.js — Deep Profile
- **Tagline:** "JavaScript 3D Library" · MIT, free · Audience: experienced JS devs, creative coders
- **Time-to-wow:** ~5 min
- **2026 news:** WebGPU GA across all browsers (Safari 26 April 2026), r171+ zero-config WebGPU
- **Strengths:** Largest community, smallest bundle (168KB), max flexibility, most Copilot-trainable
- **Weaknesses vs HoloScript:** Low-level primitives (you assemble scene mgmt + asset pipelines + XR plumbing); no editor, no semantic layer, no simulation; fragmented ecosystem (postprocessing, cannon, rapier, drei all separate)

#### A-Frame — Deep Profile
- **Tagline:** "Make WebVR" · MIT, free · Audience: HTML-literate, VR/AR enthusiasts, educators
- **Time-to-wow:** ~30–60s (paste HTML, open browser)
- **Strengths:** Declarative model, Vision Pro distribution moat (Apple-endorsed), largest WebXR community
- **Weaknesses vs HoloScript:** Three.js perf ceiling inherited, no AI/agent story, VR-shaped framing limits non-VR 3D

#### Babylon.js 9.0 — **HIGHEST PRIORITY THREAT**
- Microsoft-backed. Community MCP server lets LLMs manipulate scenes live (March 2026 launch).
- If Babylon makes MCP first-party before HoloScript achieves distribution, "agent-native 3D" becomes their story.
- **Differentiation lever:** Multi-target compilation. Babylon is a single-runtime renderer; HoloScript is a compiler.

#### Others
- **React Three Fiber** — Complementary; HoloScript already has `r3f-renderer`.
- **Unity WebGL** — Losing ground; 20-50MB bundles.

### Front B: Scientific Simulation / FEA / CAE
### Front B: Scientific Simulation / FEA / CAE

#### SimScale — Deep Profile
- **Positioning:** "Engineering AI in the Cloud" · Community free, Professional ~$8–15K/year/seat
- **Audience:** Mid-market mechanical/civil/AEC/HVAC engineers; 500K+ registered users
- **Technical approach:** Server-side HPC compute (OpenFOAM / Code_Aster / CalculiX); browser is thin client only
- **Strengths:** Production-grade solvers, strong CFD, polished UX
- **Weaknesses vs HoloScript:** Not actually browser-native (compute is remote); no deterministic replay or hash-verified provenance; **data must leave premises** (blocks medical/defense/legal)

#### ANSYS (Synopsys-owned) — Deep Profile
- **Positioning:** "Re-Engineering Engineering" · Mechanical Enterprise ~$40K/year/seat; SimAI Premium per-usage
- **Audience:** Fortune 500 aerospace/auto/semicon/defense/medical; dedicated CAE analysts
- **2026 R1 (March 2026):** SimAI restructure, GeomAI (generative design), FreeFlow meshless CFD, NVIDIA Omniverse integration, Synopsys joint safety workflows
- **Strengths:** Deepest physics breadth, regulatory acceptance (FDA, FAA, nuclear), certified validation
- **Weaknesses vs HoloScript:** No browser path; provenance is file-based/manual (no hash-verified replay); AI features are surrogate-based (not contract-verified); price excludes academia/startups

#### Others
- **FEAScript** — OSS JS, 1D/2D only, no GPU
- **SPARSELAB** — Browser FEA via WASM (not WebGPU). No replay.
- **ParaView/Catalyst** — HPC in-situ viz. Adjacent, not competitor.

> **Critical finding:** No vendor ships WebGPU + FEM + browser + hash-verified replay. Novedge's 2026 "DesignOps for CAE" explicitly states the industry has *given up* on byte-identical replay due to solver stochasticity. HoloScript's "Trust by Construction" is category-defining.

### Front C: Spatial AI / Generative 3D
### Front C: Spatial AI / Generative 3D

#### NVIDIA Omniverse — Deep Profile
- **Positioning:** "Develop Physical AI Applications" (re-branded from "metaverse collaboration")
- **Audience:** Enterprise manufacturing, AEC, automotive, robotics; individual devs tolerated not courted
- **Pricing:** Individual free (collab with 1 other); Enterprise $9,000/year; **RTX GPU required (L40 ~$11,300)**
- **Moat:** OpenUSD ecosystem; GPU hardware lock-in; "Physical AI" and "Digital Twin" positioning (ceded "spatial computing" to Apple)
- **2026 launches:** Apple Vision Pro via CloudXR foveated streaming; tightened Isaac Sim coupling
- **Weaknesses vs HoloScript:** Not browser-native; $9K/yr floor locks out indies/education; HoloScript's `.holo → USD` compiler can *consume* their artifacts without adopting their runtime

#### Cavrnus — Name-Collision Assessment
- **What they are:** Drag-and-drop multi-user collaboration plugin for Unreal Engine and Unity. Not a compiler, runtime, or generative platform.
- **Product:** "Cavrnus Spatial Connector" — WebRTC voice/video + state sync SDK for UE5/Unity
- **Verdict:** W.033's "critical" flag was conservative. Phonetic overlap: **low**. Trademark risk: **low**. Category overlap: **medium** (both appear in AEC digital-twin RFPs only). No rebrand needed. They are a layer *below* HoloScript — could theoretically be consumed as a transport.

#### Others
- **Tencent Hunyuan 3D / HY-World 2.0** — Text/image/sketch → 3D meshes, Gaussian splats. Asset generator, not platform. Complementary.
- **Luma AI** — Genie sunset Jan 1, 2026. Pivoted to Gaussian Splat capture + Dream Machine video. Complementary.
- **Spatial.io** — Pivoted to Unity UGC gaming. Omitted from TechTarget's 2026 metaverse roundup — signal of relevance decay.

### Front D: Agentic AI / MCP Platforms
### Front D: Agentic AI / MCP Platforms

#### LangChain / LangGraph — Deep Profile
- **Positioning:** "Agent Orchestration Framework for Reliable AI Agents"
- **Pricing:** OSS free; LangSmith Developer free (5K traces), Plus ~$39/seat + usage, Enterprise BYO-cloud
- **MCP:** First-class consumer + server. LangGraph Server exposes agents as MCP tools. 200+ integrations.
- **Strengths:** Mindshare dominance, mature observability (LangSmith), durable long-running workflows, proven at scale (Klarna, Replit, Elastic)
- **Weaknesses vs HoloScript:** Verbose Python API, steep learning curve, no spatial/simulation semantics
- **Play:** Partnership, not competition. HoloScript MCP plugs into LangGraph; HoloMesh handles multi-agent coordination LangGraph doesn't build.

#### Cursor / Composer 2 — Deep Profile
- **Positioning:** "The best way to code with AI" — agent-native IDE
- **Pricing:** Hobby free · Pro $20/mo · Teams ~$40/user/mo · Enterprise
- **2026 launches:** Cursor 3 (April), Composer 2 RL-trained every ~5h on real usage, Background Agents, Design Mode, Bugbot Learned Rules, **MCP GA (Apr 8)**, Canvases (Apr 15)
- **MCP:** Best-in-class client/host. Drove MCP's 200+ server adoption via marketplace.
- **Strengths:** RL-on-real-usage moat, fastest dev time-to-wow, MCP marketplace breadth
- **Weaknesses vs HoloScript:** IDE-bound (no headless/API story), no simulation/3D/spatial primitives, agents siloed per-user
- **Play:** Submit HoloScript to Cursor MCP marketplace. Be the spatial/simulation plug, not a competitor.

#### Others
- **CrewAI** — Role-delegation. 40% Fortune 500 claim. Thin on durability vs LangGraph.
- **AutoGen** — Maintenance mode; folded into Microsoft Agent Framework (Semantic Kernel merger).
- **GitHub Copilot Workspace** — GA early 2026. Locked to GitHub issue workflow.
- **Replit Agent** — Zero-setup for non-devs. Sandbox-bound.

> **Critical finding:** No agent-native spatial/3D/simulation platform exists. HoloScript's white space is genuine.

---

## 3. Messaging Comparison Matrix

| Dimension | **HoloScript** | Three.js | A-Frame | SimScale | ANSYS | NVIDIA | LangGraph | Cursor |
|---|---|---|---|---|---|---|---|---|
| **Primary tagline** | (draft) "Spatial Sovereignty" | "JS 3D Library" | "Make WebVR" | "Engineering AI in Cloud" | "Re-Engineering Eng" | "Develop Physical AI" | "Agent Orchestration" | "Best way to code with AI" |
| **Target buyer** | Devs + agents + scientists | JS devs | HTML-literate creators | Mid-market engineers | Fortune 500 CAE | Enterprise robotics | ML/platform teams | Pro developers |
| **Key differentiator** | Semantic IR + agent + sim + browser | Flexibility + community | VR via HTML + Vision Pro | Cloud UX | Physics breadth + regulation | USD + GPU moat | Stateful graph + observability | RL-on-usage + MCP breadth |
| **Tone/voice** | Engineer + futurist | Pragmatic, terse | Warm, beginner | Corporate cloud | Industrial authority | Enterprise aspirational | Dev-pragmatic | Slick IC-dev |
| **Core value prop** | One source, N targets, provenance | Low-level control | Democratize WebXR | No install, scale on demand | Deepest physics | Build Physical AI | Production agents | Code faster with AI |

---

## 4. Content Gap Analysis

### Topics competitors cover that HoloScript doesn't (yet)

| Topic | Owner | Gap / Opportunity |
|---|---|---|
| "Physical AI" | NVIDIA | Co-opt: "Physical AI runs on HoloScript's `.holo` + contracts" |
| "Digital Twin" | NVIDIA, ANSYS | Own **"Verifiable Digital Twin"** subcategory |
| "WebGPU for the web" | Three.js | Own **"WebGPU + semantic + simulation"** (next layer) |
| "Agent-native coding" | Cursor | Claim **"Agent-native building"** — beyond code |
| "Agent orchestration" | LangGraph | Partnership, not fight — HoloScript as MCP server |
| "Spatial collaboration" | Cavrnus, Spatial.io | Own **"CRDT-native multi-agent collaboration"** |

### Topics HoloScript covers that competitors don't

| Topic | Why it matters |
|---|---|
| **Trust by Construction** (TVCG) | Category-defining claim |
| **CAEL** (hash-verified agent provenance) | No competitor has this |
| **Tropical semirings for provenance** | Novel technical story |
| **Dumb Glass architecture** (Platinum) | Inverts framework paradigm |
| **Two Doors** (Absorb + HoloMesh — Platinum) | Only platform that splits human + agent entry cleanly |
| **Compile-once, render-everywhere** | Nobody in 3D has this |
| **Browser WebGPU + FEM + replay** | Genuinely uncontested |

### Biggest format gap
**Flagship multi-target demo video** — one 60-second clip of `.holo` compiling to 5 targets simultaneously. Converts the multi-target story from claim to proof.

---

## 5. Opportunities

### Positioning gaps to exploit

1. **"Spatial Sovereignty"** — Green field term. See `positioning-spatial-sovereignty.md`.
2. **"Verifiable Digital Twin"** — Subcategory of "digital twin" that incumbents can't claim. See `positioning-verifiable-digital-twin.md`.
3. **"Agent-native building"** — Broader than Cursor's "agent-native coding."
4. **"One source, N targets"** — Unclaimed in 3D/spatial.
5. **"The browser floor"** — Omniverse $9K+RTX, ANSYS $40K+workstation, SimScale cloud-required. Only HoloScript is paste-URL-runs-everywhere.

### Audience segments being underserved
- **Medical device teams** (privacy-sensitive) — blocked by SimScale cloud egress, ANSYS licensing
- **Legal forensics** (byte-identical replay as evidence) — nobody serves
- **Academic researchers** — priced out of Omniverse + ANSYS
- **Climate / policy** — needs reproducibility by non-modelers
- **Indie XR creators** — A-Frame owns beginner, Babylon intermediate; HoloScript middle-layer with semantics

---

## 6. Threats

| Threat | From | Severity | Mitigation |
|---|---|---|---|
| Babylon.js 9.0 + first-party MCP | Babylon | **High** | Ship `npx create-holoscript` + multi-target demo. See `deep-dive-babylon-mcp.md`. |
| Cursor adds "domain compilers" via MCP | Cursor | High | Be default spatial/simulation MCP inside Cursor. Don't compete. |
| LangGraph adds spatial primitives | LangChain | Medium | Position HoloScript MCP as LangGraph-compatible. |
| ANSYS GeomAI + SimAI eat "AI-native simulation" | ANSYS | Medium | "Surrogate confidence ≠ contract trust" counter-narrative. |
| USD becomes digital-twin standard, HoloScript becomes "just a USD producer" | NVIDIA | Medium | Position as *upstream* of USD. `.holo → USD`. |
| Apple Vision Pro × A-Frame dominates WebXR | Apple × A-Frame | Medium | WebXR compile target quality + A-Frame partnership. |
| Generative 3D commoditizes authored content | Tencent, Luma | Low | Position as verification/deployment layer. |
| Industry consensus deterministic replay is impossible | CAE industry | Low-Medium | TVCG paper as counter-evidence. |

---

## 7. Recommended Actions

### Quick wins (this week)

1. ~~Rename W.033 Cavrnus flag from "critical" to "low-trademark, medium-category"~~ — covered in `battlecards/` implicitly; update the memory entry separately
2. **Create flagship multi-target demo video** — one `.holo` → 5 targets side by side
3. **Claim "Spatial Sovereignty" positioning page** on holoscript.net
4. **Audit SEO (W.035)** — fix sitemap.xml + meta descriptions
5. **Publish brief snippets** to knowledge store (graduated as W.057 — W.060 below)

### Strategic moves (next 30–90 days)

6. **Ship `npx create-holoscript` with 30-second time-to-wow**
7. **Position HoloScript MCP as default spatial/sim server in Cursor and LangGraph**
8. **Publish "Verifiable Digital Twin" category piece**
9. **Target legal forensic simulation as first named vertical**
10. **A-Frame ecosystem engagement** (Diego Marcos, WebXR community)
11. **Academic outreach** — 3-5 universities teaching CAE or WebXR
12. **"Agents don't want APIs — they want comprehensible worlds"** thesis — blog + talk

### Competitor-specific plays
- **vs Babylon.js**: Lead with multi-target. Ship npx create.
- **vs NVIDIA Omniverse**: "Omniverse for everyone else" — free, browser, no GPU floor.
- **vs ANSYS**: Don't fight regulated aerospace. Fight emerging verticals where replay matters.
- **vs Cursor**: Partnership. HoloScript MCP inside Cursor.
- **vs LangGraph**: Partnership. HoloScript MCP + HoloMesh coordination.

---

## Follow-up

- Supporting docs cross-referenced above
- Knowledge store graduation: W.057–W.060 (see MEMORY.md and `.ai-ecosystem/`)
- Monitoring cadence defined in `competitive-monitoring-plan.md`
- Next full refresh: **2026-07-17**
