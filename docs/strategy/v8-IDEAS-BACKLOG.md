# HoloScript v8 Ideas Backlog

> **Status:** BACKLOG / IDEAS-ONLY — not an active roadmap.
> **Authoritative roadmap:** [ROADMAP.md](./ROADMAP.md) (6.x is the public line; v7/v8 were disowned as drift in the 2026-05-18 refresh).
> **Original RFC author:** Brian (Founder) & Antigravity, March 25 2026. History preserved via `git mv` from `v8-vision-rfc.md`.

---

## Revival Gate

**Any item in this backlog that an agent wishes to promote to active work MUST first pass a dual verdict:**

1. **`/journalist` verdict** — Run the journalist skill against the v6 capability the backlog item depends on. The journalist produces a sourced evidence report: is that capability real, shipped, and reproducible from the public install path? Or was it overclaimed?
2. **`/deep-ratchet` verdict** — Run deep-ratchet on the same capability. The ratchet assigns a truth-tier (REAL / THIN / OVERCLAIMED / PHANTOM) and a blocking severity.

**Gate rule:** An item may only be revived if BOTH verdicts return tier REAL or THIN with no blocking severity. A THIN verdict must also name the concrete gap and confirm it does not invalidate the item's premise.

**Rationale:** This backlog was seeded before the 2026-05-18 ROADMAP honesty correction. Several items depend on v6 capabilities that were overclaimed (e.g., trait counts of 3,300 vs ~1,809 actual; see W.666 phantom-baseline failure). Building v8 features on OVERCLAIMED baselines repeats that failure mode. The gate ensures each revival starts from a verified truth-tier, not a stale assumption.

**How to revive an item:**

1. Identify the v6 capability the item depends on (e.g., "Wisdom/Gotcha traits compile-time enforcement").
2. Run `/journalist "Is [capability] real and reproducible from the public install path?"` — save the verdict report.
3. Run `/deep-ratchet "[capability]"` — save the truth-tier result.
4. If both return REAL or THIN (non-blocking): annotate the backlog item inline with the verdict refs (commit hash + date), then file a board task with those refs as `verification_evidence`.
5. If either returns OVERCLAIMED or PHANTOM: do NOT revive. File a board task to fix the underlying capability first, referencing the ratchet finding.

**Skills required:** `/journalist` + `/deep-ratchet` (both must be invoked; one alone is insufficient).

### Worked Example — Studio 2.0 AI Co-Pilot Mode

**Backlog item (Section 1):** "AI Co-Pilot Mode: Type 'add volumetric film set with depth-of-field bokeh,' and the exact corresponding trait subgraph is generated."

**v6 dependency:** Semantic trait-graph generation from natural language in Studio.

**Step 1 — `/journalist` verdict (hypothetical run):**

> "Journalist report 2026-06-07: Studio's `generate_semantic_ui` MCP tool accepts a natural-language prompt and returns a `.holo` scene stub. Verified against public install path (mcp.holoscript.net `get_examples`). Capability is present but outputs a flat trait list, not a subgraph with depth-of-field or volumetric traits specifically. Truth: THIN — the base generation hook exists; the Film3D-specific vocabulary is absent."

**Step 2 — `/deep-ratchet` verdict (hypothetical run):**

> "Deep-ratchet 2026-06-07: `generate_semantic_ui` THIN — function exists, domain vocabulary for Film3D/volumetrics not in trait registry (zero `@gaussian-splat`, `@depth-of-field` traits at v6). Blocking severity: MEDIUM (feature premise partially invalidated — the 'exact corresponding trait subgraph' claim requires traits that don't exist yet)."

**Gate result:** THIN + MEDIUM blocking → **DO NOT REVIVE as-is.** Board task required: "Add `@gaussian-splat` and `@depth-of-field` traits to registry (Film3D vocab gap)." Once that ships and re-ratchet returns THIN non-blocking or REAL, the AI Co-Pilot item may be promoted.

**Annotation on item (add inline when a real verdict runs):**

```
<!-- REVIVAL-GATE: journalist=THIN (2026-06-07, commit <hash>), ratchet=THIN/MEDIUM-blocking -->
<!-- STATUS: BLOCKED — Film3D trait vocab gap. Dependency task: <board-id> -->
```

---

_Original RFC content preserved below. Do not edit; treat as ideas archive._

---

**Original RFC Author:** Brian (Founder) & Antigravity
**Original RFC Date:** March 25, 2026
**Original RFC Status:** DRAFT (Internal Strategy Offsite)

---

## The Trajectory

HoloScript v6.0 "Universal Semantic Platform" has officially shipped, bringing [see NUMBERS.md] (at time of writing; see [NUMBERS.md](../NUMBERS.md) for current), the bidirectional absorb loop, and a foundational three-tier language architecture. We have leveled the playing field. Now, we go wide open.

This RFC outlines the next 12–36 months of iterations, culminating in **v8.0: The Universal Semantic OS**.

---

## 1. v6.x “The Great Refinement → Ecosystem Ignition” (Q2–Q3 2026)

Building on Studio polish, 57,356+ tests, and DX wins from v6.0, the v6.x series adds these deliverables:

- **Studio 2.0 (Multiplayer Semantic Canvas)**
  - WebRTC + shared trait graph for real-time collaboration with versioned semantic branching ("what if we swap `@physics` for `@softbody`?").
  - **AI Co-Pilot Mode:** Type "add volumetric film set with depth-of-field bokeh," and the exact corresponding trait subgraph is generated. Undo/redo occurs at the semantic level, not just the UI.
- **Absorb v2 + “One-Click Legacy Import”**
  - Drag in a full Unity project, Unreal scene, or ROS2 package → instant `.holo` + `.hs` skeleton with gap-filled `.ts` stubs.
  - AI flags missing traits (e.g., "30% requires imperative code—here are the exact trait gaps"). Zero-config bidirectional absorption.
- **Trait Audit → “Interoperability Guarantee” Badge**
  - Run the `audit-results/` pipeline. Any trait functioning correctly across all 30 compilation targets earns a public Interoperability Badge on the marketplace leaderboard.
- **Film3D / Volumetrics Expansion Pack (JoeCoolProductions Integration)**
  - New trait category: `@volumetric`, `@gaussian-splat`, `@nerf`, `@cinematic-camera`, `@depth-of-field`, `@motion-blur-trait`, `@procedural-set-dressing`.
  - The HoloScript `.holo` composition instantly emits native Gaussian splats to Unity HDRP, Unreal Niagara, WebGPU, and visionOS—a total VFX pipeline via natural language.
- **StoryWeaver Integration**
  - `@storyweaver` trait family for branching dialogue, plot beats, and character arcs. Agents can dynamically negotiate story changes at runtime via continuous x402 micro-payments.

## 2. Trait System Moonshots (3,300 → 5,000+ traits)

Our traits are our superpower. Let’s aggressively expand the core repository:

- **Wisdom & Gotcha Traits (Batch 1)**
  - Incorporate `@wisdom { pattern: "hero-journey" }` and `@gotcha { anti-pattern: "unbounded-recursion" }`.
  - The compiler warns or auto-fixes violations at build time, forming a cultural safety net for XR and Agent Worlds.
- **Culture Keyword Extension**
  - `@culture { region: "amsterdam-film3d" }` automatically injects locale-specific lighting, social norms, and accessibility invariants at compile-time. Ideal for Amsterdam-based and global Film3D audiences.
- **Official Film3D-Specific Trait Module**
  - `@film-set`, `@director-ai`, `@virtual-production`, `@live-action-plate`, `@vfx-supervision`. Tie into NeRF/Gaussian and real-time ray-tracing traits. Wrap an entire Hollywood pipeline in a single `.holo` file.
- **Economic & Agent Primitives Expansion**
  - `@marketplace-listing`, `@royalty-stream`, `@agent-owned-entity`. Every trait becomes tokenizable on publish.

## 3. Agent Swarm & Autonomous Economy (x402 + uAAL native)

Using the [see NUMBERS.md] (at time of writing; see [NUMBERS.md](../NUMBERS.md) for current) and recursive self-improvement loops:

- **Agent Marketplace with Built-in x402 Settlement**
  - Autonomous agents buy/sell traits, skills, or entire sub-worlds. Need a scene blocked out? Rent the "Film3D Director Agent" template for the afternoon.
- **Sovereign Mesh Preview (Bridge to v7)**
  - Spin up small HoloVM clusters on Railway/K8s where agents migrate state across devices, repositories, and virtual worlds via LifePods.
- **Brittney 2.0 Integration**
  - Hook our fine-tuned foundation model directly into the new Wisdom/Gotcha traits to enforce cultural awareness and refuse unsafe outputs natively at the compiler level.

## 4. Physical Unification & Real-World Bridges (v7.0 “Sovereign Mesh”)

Making the bridge between virtual semantics and physical reality unavoidable:

- **Edge `.hs` Execution**
  - Native `.hs` logic running on microcontrollers, robotic arms, and smart glasses. Eliminating the cloud loop for safety-critical operations.
- **Geospatial Climate Twin (RFC Execution)**
  - City-scale GIS traits mapped to real-time climate physics. Agents can spawn simulations ("what if we green-screen this Amsterdam block?") against a perfect digital twin.
- **ROS2 / URDF / Hardware-in-Loop**
  - Fully bidirectional communication with physical robots. Virtual Film3D sets can now command physical camera rigs on a live motion-capture stage.

## 5. Marketplace, DAO & Foundation (DAO_Governance_v1)

- **HoloScript Foundation:** Formalize the DAO/Non-profit structure with a multi-disciplinary board (Founder, Core Contributors, Filmmaker, Roboticist, Climate Scientist).
- **On-chain Trait Bounties:** Governed by token holders.
- **Automatic Security Audits:** Implemented with Ed25519 cryptography on every publish event.
- **Creator Revenue Share:** Direct revenue share for trait creators (e.g., maintaining 10–20% founder royalties on complex packs like Film3D).

## 6. Community & Growth Levers

- **"Adopt a Target" Program:** Offer bounties for developers willing to build and maintain new compilation backends (Blender integration, Meta Horizon, Roblox, etc.).
- **Film3D Showcase Reel:** A curated gallery of stunning worlds built using HoloScript + Film3D traits. Highly targeted viral marketing for filmmakers on X/LinkedIn.

## 7. Wild Moonshots (v8.0+ “Universal Semantic OS”)

- **The Volumetric Slicer (3D Printing Compiler):**
  - Beyond rendering on screens, HoloScript gains a volumetric slicing backend targeting additive manufacturing. Write code to procedurally generate non-planar geometries, evaluate structural overhangs, and compile directly to `GCode`. From natural language to a physical, 3D-printed object on your desk.
- **`.holo` as the Alpha Format:** `.holo` formally subsumes glTF, USD, and JSON. It becomes the lingua franca that every AI, game engine, and backend system speaks natively.
- **Self-Improving Worlds:** Agents dynamically edit their own trait graphs and redeploy their host worlds live, continuously adapting the environment around them.
- **Text-to-Universe Pipelines:** "Describe a movie → live in it" end-to-end functionality leveraging our massive Film3D trait libraries.
- **Programmable Law:** Implementing culture and ethics at the semantic layer—worlds that inherently enforce their own physics and societal laws through code logic.

---

### Suggested Execution Prioritization:

1. **Ship Studio 2.0 + Film3D Volumetrics Pack:** Fast, highly-visible wins that immediately attract the Film3D audience.
2. **Activate Wisdom/Gotcha + Culture Keywords:** Capitalize on the existing RFCs and proposals to build community trust and safety.
3. **Deploy DAO + Marketplace:** Ignite the monetization flywheel early.
4. **Physical Edge + Climate Twin:** Secures long-term technical differentiation and deep-tech credibility.
