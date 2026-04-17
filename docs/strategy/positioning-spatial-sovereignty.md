# Positioning Narrative — Spatial Sovereignty

**Status**: Draft for founder review
**Purpose**: Claim the unclaimed positioning space between Apple ("spatial computing") and NVIDIA ("Physical AI")
**Primary use**: Homepage headline, pitch deck opener, press positioning

---

## The Gap

Three major terms own the 2026 spatial/3D narrative:

| Term | Owner | Meaning |
|---|---|---|
| **Spatial Computing** | Apple | Consumer XR — "computers you wear" |
| **Physical AI** | NVIDIA | Industrial simulation + robotics — "AI in the physical world" |
| **Spatial Collaboration** | Cavrnus, Spatial.io | Multi-user in existing 3D apps |

None of these cover:
- **Data sovereignty** — your scene is yours, not streamed from their cloud
- **Platform sovereignty** — your scene isn't locked to one vendor's runtime
- **Agent sovereignty** — your content is first-class comprehensible to AI, not wrapped in their API
- **Verification sovereignty** — your simulation can be replayed, audited, and trusted without trusting the vendor

That's HoloScript's corner. It needs a name.

**The name**: **Spatial Sovereignty**.

---

## Core Thesis

> **Spatial Sovereignty**: You own your spatial content the way you own a text file. It's portable, reproducible, AI-comprehensible, and vendor-neutral. No cloud streaming. No RTX floor. No engine lock-in. No "trust us."

---

## The Three-Door Mapping

HoloScript's Spatial Sovereignty manifests as three concrete doors (per W.GOLD.011, Platinum):

### Door 1: The Headless Door (Agents)
- `.holo` files are AST-native, semantic, and hash-verifiable
- MCP + Absorb make them comprehensible to any agent in any IDE
- No API wrapping — agents read the source of truth directly

### Door 2: The Spatial Door (Humans)
- Studio compiles `.holo` to any target: Three.js, R3F, Unity, Unreal, USD
- Browser-native WebGPU path needs no install
- Works on any device with a modern browser

### Door 3: The Economy Door (Creators)
- Ed25519 wallets are identity (W.GOLD.004)
- x402 protocol settles interactions (P.GOLD.004)
- Creators keep custody; platforms are projections

---

## Positioning Statements

### Primary (for homepage + pitch)

> **HoloScript is Spatial Sovereignty.**
>
> Write once in `.holo`, compile to any engine, run in any browser, understand by any agent. Your scene, your runtime, your data — no vendor in between.

### Alternative — shorter

> **Spatial Sovereignty, compiled.**
>
> One source of truth. Every target. Every agent. Browser-native.

### Alternative — against the incumbents

> **Apple owns spatial computing. NVIDIA owns Physical AI. We own what comes after — spatial sovereignty. Your content, your runtime, your agents, no streaming required.**

### For enterprise (AEC / manufacturing)

> **Digital twins without vendor lock-in.**
>
> Omniverse-compatible USD output. Browser-native simulation. Hash-verified replay that works even after your NVIDIA license expires. Spatial Sovereignty for the decade of industrial replay.

### For developers

> **You write 3D scenes as if they were React components. We compile them for every runtime agents and humans actually use. One source. Thirty targets. No engine lock-in.**

### For researchers

> **Your simulation is the paper. Share a URL, anyone can reproduce it — bit-identical, hash-verified, in their browser. The publication and the artifact are the same thing.**

---

## Messaging Pillars

Four pillars support the Spatial Sovereignty claim. Each needs dedicated proof.

### Pillar 1: Source Sovereignty
- `.holo` files are plain text — readable, diffable, version-controlled
- Semantic IR, not serialized runtime state
- One source of truth that every target consumes
- **Proof**: `.holo → Three.js + R3F + Unity + Unreal + USD` flagship demo

### Pillar 2: Runtime Sovereignty
- Browser WebGPU means no install, no RTX floor, no enterprise license
- Compile targets span every major engine — you're never stuck
- Open compile-target specification so third parties can add more
- **Proof**: `npx create-holoscript` 30-second time-to-wow

### Pillar 3: Agent Sovereignty
- MCP server exposes 215+ tools; agents use the platform natively
- Absorb gives agents GraphRAG-powered codebase intelligence
- HoloMesh coordinates agents without centralized platform
- **Proof**: Live demo of Claude / GPT compiling `.holo` via MCP tools

### Pillar 4: Verification Sovereignty
- Trust by Construction — solver + renderer share hash-verified same object
- Deterministic replay — any simulation reproducible bit-identical
- Provenance semirings — algebraic trust composition (W.GOLD.037, W.GOLD.044)
- **Proof**: IEEE TVCG paper, NAFEMS LE1 at 1.5% error, CAEL hash chains

---

## Who This Appeals To (Audience Map)

| Segment | Why Spatial Sovereignty resonates | Primary competitor they're escaping |
|---|---|---|
| **Medical device teams** | Data can't leave premises; audit trails must be byte-identical | SimScale (cloud egress), ANSYS (licensing) |
| **Legal forensics** | Simulations as court-admissible evidence | Nobody serves this — green field |
| **Academic researchers** | Locked out of Omniverse + ANSYS by price | NVIDIA Omniverse, ANSYS |
| **Climate / policy** | Models must be reproducible by non-modelers | Black-box HPC models |
| **Indie XR creators** | Apple Vision Pro apps without Apple Store approval | WebXR limitations |
| **Multi-engine shops** | Same scene across Unity + Unreal + web | Engine-specific runtimes |
| **Agent-first startups** | Spatial content that agents can read | LangChain tool wrapping |

---

## What NOT to Say

Avoid these framings (they dilute the narrative):

- ❌ "HoloScript is a 3D engine" → Babylon/Three.js fight we don't want
- ❌ "HoloScript is a CAE tool" → ANSYS fight we don't want
- ❌ "HoloScript is a digital twin platform" → NVIDIA fight we don't want
- ❌ "HoloScript is AI-powered" → Every company says this
- ❌ "HoloScript is the metaverse" → Dead term
- ✅ "HoloScript is **Spatial Sovereignty**" → Unclaimed; requires explanation; invites curiosity

---

## Call to Action Variants

For marketing pages, each pillar maps to a CTA:

| Page | CTA | Destination |
|---|---|---|
| Homepage | "Try Spatial Sovereignty" | `npx create-holoscript` one-liner |
| Enterprise | "Get a Verifiable Digital Twin demo" | Book intro call |
| Researchers | "Publish a replayable simulation" | TVCG paper + starter template |
| Developers | "Ship to every runtime from one source" | GitHub + playground |
| Agent builders | "Give your agents a comprehensible world" | MCP server docs |

---

## Risk / Counter-Positioning

**Risk**: "Sovereignty" is a loaded word with political connotations. Some audiences may find it off-putting.

**Counter**: It's used extensively in data sovereignty (GDPR, Schrems II), digital sovereignty (EU policy), and wallet sovereignty (crypto). The audiences who *would* react negatively are mostly not our target. The audiences we want (sovereign-minded builders, data-responsible enterprises, research-publishing scientists) respond positively to the term.

**Fallback positioning** if "Sovereignty" tests poorly:
- **"Spatial IR"** (Intermediate Representation) — accurate but too technical for non-compiler audiences
- **"Spatial Source"** — emphasizes the "source of truth" angle but weaker than sovereignty
- **"Portable Spatial"** — descriptive, weaker than sovereignty

---

## Next Steps

1. **Validate with 5 target prospects** — show homepage draft, ask what they'd call it
2. **A/B test homepage headline** — "Spatial Sovereignty" vs "Compile once, render anywhere"
3. **Register `spatial-sovereignty.net` / `.org`** as defensive domain (cheap, preempt squatters)
4. **Publish founding manifesto** — 1500-word piece on holoscript.net explaining the term and its architecture
5. **Coin the term in the next press release** — IEEE TVCG acceptance or next major launch
