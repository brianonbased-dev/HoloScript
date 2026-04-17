# Battlecard — ANSYS (Synopsys-owned, 2026 R1)

**Last updated**: 2026-04-17
**Threat level**: 🟡 **MEDIUM** (different price/audience tier; the narrative threat is AI-native simulation framing)
**Primary risk**: SimAI + GeomAI (2026 R1) eat the "AI-native simulation" narrative before HoloScript establishes "contract-verified" as a superior claim

**Strategic note**: Don't fight ANSYS in regulated aerospace/nuclear. Fight in emerging verticals where replay matters more than 40-year certification.

---

## Quick Overview

| | |
|---|---|
| **Tagline** | "Re-Engineering Engineering" |
| **Backer** | Synopsys (acquisition closed 2025) |
| **Audience** | Fortune 500 aerospace / automotive / semiconductor / defense / medical device |
| **Pricing** | Mechanical Enterprise ~$40K/year/seat; Fluent similar; HPC packs extra; SimAI Premium per-usage SaaS |
| **Latest** | 2026 R1 (March 11, 2026) |

## Their Pitch (2026 R1)

- **AI-powered simulation**: SimAI Pro, SimAI Premium, **GeomAI** (generative design)
- **Silicon-to-system fusion** with Synopsys portfolio
- **Digital twins via NVIDIA Omniverse** (AVxcelerate for autonomous vehicles)
- **FreeFlow** meshless CFD expansion
- **End-to-end functional safety** (medini analyze + VC Functional Safety Manager)

## Strengths (Be Honest)

1. **Deepest physics breadth in industry** — nonlinear, contact, explicit dynamics, EM, fatigue, crash
2. **Regulatory acceptance** — FDA, FAA, nuclear certification; decades of validation
3. **Synopsys fusion unique** — silicon + mechanical workflow nobody else has
4. **GeomAI is real generative-design progress** — shipped 2026 R1, not vaporware
5. **NVIDIA Omniverse integration** (AVxcelerate) — joint digital-twin story
6. **Scale**: 10K+ cores, every major HPC cluster
7. **Enterprise sales machinery** + installed base = inertia

## Weaknesses

1. **No browser-native path** — workstation + license server required
2. **$40K/year/seat floor** — excludes academia, startups, non-enterprise research
3. **Provenance is file-based and manual** — Workbench project archives, not hash-verified replay
4. **Solver + viewer are different applications** (Mechanical vs CFD-Post vs EnSight)
5. **AI is surrogate-based, not contract-verified** — SimAI predicts from trained surrogates; HoloScript's contract enforces correctness bounds at runtime
6. **Cannot ship a simulation as a URL** — customer needs install + license
7. **Silo-ed with Synopsys transition** — enterprise teams worried about product roadmap changes
8. **The industry has "given up" on byte-identical replay** (per Novedge 2026 DesignOps piece) — ANSYS sits in that consensus; HoloScript breaks it

## Our Differentiators (vs ANSYS)

| Differentiator | Why it matters | Proof |
|---|---|---|
| **Browser-native WebGPU simulation** | Zero install, anywhere, any device | TVCG paper benchmarks, NAFEMS LE1 at 1.5% |
| **Hash-verified deterministic replay** | Court-admissible, FDA-auditable | SimulationContract 6 guarantees |
| **Solver + renderer share same object** | Trust by Construction (Tier 3) vs ANSYS Tier 1 (discipline) | W.GOLD.013 |
| **Contract-verified AI** (not surrogate) | Correctness bounds enforced, not predicted | paper-benchmarks.test.ts, `<2%` overhead |
| **Free-to-prototype** | No license procurement delay | — |
| **Ship simulation as URL** | Customer clicks link, runs replay | Browser + deterministic |
| **Cross-domain** | Physics + molecular + agent + cellular in one IR | `.holo` semantic layer |

## Objection Handling

| Prospect says... | Respond with... |
|---|---|
| "ANSYS is FDA-certified" | "For 40 years of existing workflows, yes. For new submissions where byte-identical replay is the evidence, FDA is actively interested in our approach. We're in conversations with medical device teams now." |
| "ANSYS has more physics breadth" | "True — we don't compete in nonlinear aerospace crash. We compete in emerging domains: molecular, surgical, legal, education, AV replay. Different fights." |
| "SimAI and GeomAI already bring AI to simulation" | "They bring *surrogate* AI — predict from training data, with confidence scores. We bring *contracted* AI — enforce correctness bounds, hash-verified replay. Their trust is statistical; ours is algebraic." |
| "ANSYS has Omniverse integration" | "Their Omniverse integration is AVxcelerate for AV validation. We integrate differently: `.holo → USD → any USD consumer including Omniverse`. We're USD-upstream; they're an Omniverse application." |
| "We're locked into ANSYS for compliance reasons" | "Then HoloScript is your *next* simulation, not your *current* one. Our wedge is the domain ANSYS doesn't serve — your team's emerging problems: replayable demos for juries, browser-shared FEA for reviewers, agents-in-simulation for research." |

## Landmines to Set

- **"Do any of your simulations need to be replayable by non-ANSYS users (regulators, juries, partners)?"** → ANSYS can't
- **"Do you have use cases where a simulation is the evidence, not just an input to evidence?"** → ANSYS has no court-admissible replay
- **"Do your agents / LLMs need to read simulation state?"** → ANSYS MCP story doesn't exist
- **"How long is your typical license procurement cycle?"** → Months. HoloScript: zero.
- **"Do you support academic researchers or early-career engineers?"** → They're locked out of ANSYS

## Landmines to Defuse

- **"HoloScript doesn't have ANSYS's validation library"** → "We have the NAFEMS benchmarks all passing and a peer-reviewed paper (IEEE TVCG 2026). For your regulated workflows, ANSYS is fine — for your emerging ones, we offer a guarantee ANSYS can't."
- **"We need HPC scale"** → "We target browser + laptop + workstation first. If your workflow needs 10K cores, we partner; we don't replace."
- **"Our engineers know ANSYS"** → "Keep them there. Use HoloScript for the workflows ANSYS doesn't serve: regulatory replay, cross-team sharing, agent integration, education."

## Strategic Plays

1. **Do NOT fight in regulated aerospace, nuclear, or defense** — ANSYS wins every time
2. **DO fight in**:
   - **Legal forensic simulation** (byte-identical replay = court admissibility)
   - **Surgical planning** (privacy-sensitive, no cloud egress)
   - **Education** (ANSYS licensing is a nightmare)
   - **Drug discovery / molecular FEA** (pharma reproducibility crisis)
   - **Autonomous vehicle replay** (exact tick reproduction vs statistical testing)
   - **Climate policy communication** (click-to-replay models)
3. **Publish the "contract-verified vs surrogate" piece** — frames SimAI as the weaker tier
4. **Target ANSYS blind spots**: academia, indies, startups, small medical device teams
5. **Integrate with ANSYS output** — `.holo` can consume ANSYS results files; be complementary for joint workflows

## Win Conditions

- Emerging verticals (legal, medical startups, AV replay, education, climate)
- Teams needing deterministic replay as evidence
- Browser-first workflows
- Agent-integrated simulation
- Cross-team / cross-organization sharing
- Budget-constrained research (universities, grants)

## Loss Conditions

- Regulated aerospace / nuclear / defense with 40-year ANSYS workflows
- Teams needing 10K-core HPC scale
- FEA domains we don't yet cover (complex contact, crash, explicit dynamics)
- Organizations where ANSYS is a compliance line-item

## Signals to Watch

- **ANSYS 2026 R2 / R3 release notes** — SimAI and GeomAI feature velocity
- **Synopsys transition** — org changes, product sunset/merge announcements
- **ANSYS + NVIDIA co-branded announcements** — Omniverse tightening
- **FDA / FAA statements on AI-in-simulation trust models** — regulatory shift
- **Academic licensing changes** — any free-tier expansion that would close our education wedge

## Sources

- [Ansys 2026 R1 Release Highlights](https://www.ansys.com/products/release-highlights)
- [Synopsys launches Ansys 2026 R1](https://news.synopsys.com/2026-03-11-Synopsys-Launches-Ansys-2026-R1-to-Re-Engineer-Engineering-with-Joint-Solutions-and-AI-Powered-Products)
- [Ansys GeomAI + SimAI 2026 R1](https://www.ansys.com/blog/introducing-ansys-geomai-software)
- [Ansys Discovery 2026 R1 What's New](https://www.ansys.com/blog/whats-new-ansys-discovery-2026-r1)
- [Novedge: DesignOps for CAE](https://novedge.com/blogs/design-news/continuous-integration-for-design-operationalizing-designops-for-cad-cae-and-documentation)
