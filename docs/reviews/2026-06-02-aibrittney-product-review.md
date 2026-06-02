# <sup>AI</sup>Brittney / HoloScript — Strategic Product Review

**Date:** 2026-06-02
**Author:** Claude (Opus) — commissioned step-back review
**Scope:** Whole-repo audit. 77 packages, 7 services, 54 plugins, ~1,200 files of
research/experiments/idea-seeds, the board, the agent-coordination machinery, and
the live surfaces (Studio, MCP, Hololand). "No stone unturned" was the brief.
**Method:** Four parallel deep sweeps (package alive/dead, experimental dirs,
Studio/Hololand maturity, agent-direction/health) plus direct inspection of
aiBrittney, the README, NORTH_STAR, and the git history.

> This is a strategic review, not a daily code review. It is deliberately blunt.
> The numbers below are from in-repo evidence (board.json, git log, file counts);
> where a figure comes from a single automated read it is flagged.

---

## 1. The one-sentence diagnosis

**You don't have a product that hasn't been used — you have a *substrate* that's
real, a *toolbox* (Studio) that's a live advanced-beta, a *CLI* (aiBrittney)
sitting in a corner, and 20+ half-sketched verticals — and no single coherent
thing a person (you, or a family) can open and *use*.** That's why it hasn't
been used. Not because it's unfinished, but because "it" was never narrowed to
one thing.

The struggle you're feeling isn't a quality problem in the code. The
load-bearing code is genuinely good. It's a **focus problem that has hardened
into a maintenance problem**: the surface area got so large that agent energy
now goes into keeping the machine alive instead of moving one product forward.

---

## 2. What you actually have (honest inventory)

### The real, load-bearing core (≈50% of maintained code)

A handful of packages carry everything and are actively developed:

- `@holoscript/core` — parser, AST, compilers, traits (30+ dependents)
- `@holoscript/engine` — rendering, physics, ECS (~10 dependents)
- `@holoscript/framework` — agent orchestration (~13 dependents)
- `@holoscript/llm-provider`, `@holoscript/mesh`, `@holoscript/platform`,
  `@holoscript/mcp-server` — the connective tissue
- `@holoscript/studio` — **live in production at holoscript.studio (Railway)**

These are real. 19 production-grade packages, ~30 more substantial. This is a
genuine semantic-compilation platform with a working `describe → render →
deploy` loop. **Do not lose sight of this — it's the asset.**

### Studio — live, but a toolbox not a product

- Real and deployed. The `/vibe → export → deploy` path actually works: describe
  a scene in English, see it render in 3D, get a shareable URL. No login needed
  for the playground.
- But: **76 pages, 504 components, 172 API routes, three competing navigation
  systems, 248/~1000 files carrying TODO/stub/mock markers.** An in-repo audit
  (2026-05-10) calls it *"structurally overloaded."* The `/create` IDE is
  powerful and impenetrable — great for a developer, unusable by a family.
- Verdict: **advanced beta, 70–80% technically there; the gap is product
  clarity and UX, not capability.**

### aiBrittney — a developer CLI, isolated, and *not* the product the doctrine claims

- `@holoscript/aibrittney` is **v0.1.1**: a competent local-Ollama REPL with
  opt-in MCP tool-calling. It requires installing Ollama, pulling a 4.7 GB
  model, and setting MCP keys.
- Outside its own package it appears in **13 files — almost all docs, reviews,
  branding, and the lockfile.** It is wired into nothing.
- **There are two Brittneys.** Studio has its *own* Brittney
  (`packages/studio/src/lib/brittney/`, Claude-SDK-backed, scene-gen) that is
  unrelated to the `aibrittney` package. The "primary intelligence interface"
  is split across two unconnected implementations, neither of which is a
  family-facing product.

### The 54-plugin / 20+-vertical sprawl — aspiration, not capability

- 54 domain plugins (robotics, medical, aerospace, quantum, banking, civic,
  film-vfx, …) spanning 20+ verticals.
- **~4 commits across ALL 54 in six months. Zero cross-plugin dependencies.
  Zero external consumers.** Each is an isolated ~800–1200 LOC template
  expansion.
- Verdict: these represent every direction the product *wishes* to support.
  They are sketches waiting for an owner, not an ecosystem.

### The experimental layer — disciplined, but it's 3–4 products in parallel

The `experiments/`, `compositions/`, `research/`, `idea-seeds/`, `memory/`,
`proposals/` dirs (~1,200 files) are well-curated (idea-seeds even has a
TRIAGE.md with reopen triggers). But read together they reveal you are
prototyping **3–4 distinct product directions at once**:

1. **HoloShell** — deterministic local-machine OS automation for non-technical
   users (the closest thing to a "family" product in the whole repo).
2. **HoloMesh** — a decentralized agent knowledge network + public discovery
   surface ("MySpace for agents").
3. **Domain verticals** — geospatial climate, DAO governance, real estate, etc.
4. **Autonomous agent orchestration** — brain archetypes, self-improvement
   daemons.

Plus **13+ academic papers in flight.** The ambition is extraordinary. The
focus is absent.

---

## 3. How it all *actually* comes together (the honest map)

It mostly doesn't — yet. Here's the real graph:

```
  CORE (real) ──> ENGINE/FRAMEWORK (real) ──> STUDIO (live, overloaded toolbox)
     │                                              │
     │                                              ├─ Brittney #1 (Claude SDK, scene-gen) ── lives only inside Studio
     │
     ├──> 54 PLUGINS ............ isolated, 0 consumers, dormant
     ├──> aiBrittney CLI ........ isolated, 13 external mentions, Ollama-only
     ├──> HoloMesh / HoloShell .. compositions + experiments, no product surface
     └──> 13+ papers, ~1,200 research files
```

The substrate connects to Studio. Almost nothing else connects to anything.
The verticals, the CLI, the mesh, and the experiments are **spokes with no hub**
— each plausible, none load-bearing, none reaching a user.

The "how it comes together" *story* exists (the README pitch is excellent), but
the *wiring* doesn't. A reader of the README is promised a unified platform; a
reader of the dependency graph finds one strong core, one live toolbox, and a
field of disconnected prototypes.

---

## 4. Why agents keep losing direction (you're right, and here's the mechanism)

This is structural, not a model problem:

- **Coordination ritual outweighs the work.** ~1,133 lines across **six
  overlapping behavioral-contract docs** (CLAUDE.md, AGENTS.md,
  AGENT_INTERFACE.md, NORTH_STAR.md, GEMINI.md, .cursorrules) + **~9,126 lines
  of skill docs** + a mandatory 6-step session-init ritual + GOLD-drive intake +
  knowledge-sync. An agent spends its first chunk of every session reading
  *how to behave* before it can ask *what to build*.
- **The board points away from the product.** ~**81% of board effort is
  maintenance/CI/TODO-debt/knowledge-hygiene; ~19% advances product.** The
  doctrine says "Brittney + Studio first," yet the board has ~1 Brittney task
  and **0 Studio-product tasks.** Stated direction and allocated work disagree —
  so each agent re-derives direction from scratch and drifts.
- **No closed quality loop.** **363 failing tests** (the priority-1 "reduce
  363 → <100" task has been *claimed but uncompleted for 49 days*), 367
  TODO/FIXME markers, 1,117 knowledge entries pending dedup. GitHub Actions (25
  workflows) were archived; accumulated `.d.ts`/fixture debris blocked *all*
  commits, forcing routine `--no-verify` — which also silently skipped the
  secret-scanning gate. The gate that was supposed to enforce quality became the
  thing agents route around.
- **Maintenance-to-feature ratio in the history:** the last ~200 commits run
  **52 `fix` to 12 `feat`** (>4:1), 87 of 93 recent commits authored by one
  agent identity, in bursts. The machine is being maintained, not advanced.

The compounding effect: heavy ritual + a maintenance-shaped board + a broken
quality loop means every agent session is absorbed by the *machine*, and the
*product* never gets a turn. That is exactly the "losing a sense of direction"
you're describing.

---

## 5. What's genuinely strong (protect these)

- The **core compiler/trait/AST platform** is real engineering with real depth.
- **Studio's `describe → render → deploy` loop works and is live.** This is the
  one thing closest to "a person could use it tomorrow."
- The **research discipline** (idea-seeds triage, paper gates, receipts/provenance)
  is unusually rigorous for a project this size.
- The **MCP/agent-tooling surface** is a legitimate differentiator.

You have not wasted the time. You've built a substrate most teams never reach.
The problem is purely that it was never pointed at one user.

---

## 6. Recommendation — pick the spine, starve the rest

You don't need to build more. You need to **choose one product, wire the
existing pieces into it, and put everything else into explicit hibernation.**

**The strongest candidate spine already exists:**
**Studio's `/vibe` path + the Studio Brittney (Claude SDK) as the single
intelligence interface, aimed at one concrete first user.**

Concretely, in priority order:

1. **Name the one user and the one job.** "A family member opens a URL and
   makes/shares a 3D thing by describing it." If HoloShell ("operate my
   computer safely by description") is the real dream, name *that* instead — but
   pick one, and write it at the top of NORTH_STAR.md as the only thing that
   matters this quarter.
2. **Collapse the two Brittneys into one.** Decide: Studio-Brittney (Claude,
   hosted, the product) is canonical; aiBrittney-CLI (Ollama, local, dev tool)
   is a developer convenience or gets archived. Stop maintaining both as "the
   interface."
3. **Make `/vibe` the front door.** Hide `/create`'s 50 panels behind an
   "advanced" toggle. One nav. A guided first-run. Templates. This is UX work on
   code that already works — the highest-leverage product move available.
4. **Fix the quality loop before adding anything.** Triage the 363 failing
   tests (pre-existing vs. new), un-break the pre-commit gate so `--no-verify`
   isn't routine, and re-arm secret scanning. A green, trustworthy gate is what
   lets agents move fast without drifting.
5. **Re-shape the board to the spine.** Target ≥40% of tasks on the chosen
   product. Move the 54 plugins, HoloMesh, the verticals, and the experimental
   product-directions into an explicit `hibernated/` status with reopen triggers
   (you already do this well in idea-seeds — extend it).
6. **Cut the agent ritual in half.** Collapse the 6 behavioral-contract docs to
   **one** canonical decision tree. The session-init ritual should be ~3 lines:
   *what's the one product, what's its state, what's the next product task.*

The thesis in one line: **the path to "used by a family" is not more building —
it's narrowing Studio's working loop into one front door and pointing every
agent at it.**

---

## What Remains After This Plan (completeness gap)

Per the contributing contract, here is what this review deliberately does **not**
resolve:

- **It doesn't choose the spine for you.** Studio-`/vibe` is my recommendation,
  but HoloShell is a defensible "family" product too. That call is yours and is
  not made here.
- **No code was changed.** The 363 failing tests, the broken pre-commit gate,
  the two-Brittney split, and Studio's `/create` overload are all still exactly
  as described. This is a map, not a fix.
- **No hibernation was performed.** The 54 plugins and parallel product
  directions are still live in the tree; nothing was archived or down-scoped.
- **The end-user accessibility gap is unaddressed:** there is still no
  family-friendly onboarding, no content-safety layer, and auth is not
  production-hardened — all required before a real non-technical user.
- **Verticals' true depth wasn't individually validated** beyond LOC, commit
  recency, and dependency counts; a plugin classified "dormant" here could hold
  a gem worth promoting.
- **Live-surface health (mcp.holoscript.net, deploy pipeline) was not probed**
  in this pass; "live" reflects deployment config and prior probes, not a fresh
  end-to-end test.
