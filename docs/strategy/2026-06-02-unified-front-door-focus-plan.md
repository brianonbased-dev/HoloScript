# Focus Plan — The Unified Front Door

**Date:** 2026-06-02
**Author:** Claude (Opus), at founder's direction
**Companion to:** `docs/reviews/2026-06-02-aibrittney-product-review.md`
**Founder framing (verbatim intent):** *"Users sign into GitHub, they see all
their repos — or just their `.ai-ecosystem` repo. They have access to all these
features. There needs to be a point to all of it. Instead of focusing on one
user we are targeting multiple vertices. We have wizards to be universal for
users. The whole system should be intuitive and utilize everything we have to
offer."*

> **Reframe from the review.** The review recommended narrowing to one spine.
> The founder corrected that: the goal is **not** to cut the breadth — it's to
> give the breadth a **point** through one intuitive, wizard-guided front door.
> This plan adopts that correction. The thesis becomes: **assemble the front
> door that already exists in pieces, so the whole platform finally has a single
> intuitive way in — and every vertical becomes a destination the wizard can
> reach.**

---

## 1. The vision as one sentence and one flow

**One sentence:** A user signs into GitHub, sees their repos, and Brittney +
wizards walk them into *anything the platform can do* — without needing to know
HoloScript, the CLI, or which of 77 packages does what.

**One flow (the spine this plan builds):**

```
  Sign in with GitHub
        │
        ▼
  See your repos  ──────────────►  (or just your .ai-ecosystem repo)
        │
        ▼
  Pick a repo / start fresh  ──►  Project DNA classification (what is this?)
        │
        ▼
  Brittney asks: "what do you want to do?"  ── the universal wizard hub
        │
        ├─► build / describe a scene        (Studio /vibe — already works)
        ├─► understand & improve this repo   (absorb daemon — engine exists)
        ├─► compile to a target              (CompileTargetGrid — exists)
        ├─► publish / share                  (marketplace, deploy — exist)
        └─► explore a vertical               (the 54 plugins as destinations)
        │
        ▼
  It actually does the thing, intuitively, and you can ship it back to GitHub.
```

Every box in that flow **already has code.** None of them are connected into a
single path. This plan connects them.

---

## 2. What already exists (the parts in the pile)

This is the critical, encouraging fact: **the front door's machinery is ~85%
built and ~0% assembled into one intuitive flow** (corrected from a first-pass
~70% estimate — see the gap ledger in §2.5 for the measured breakdown).

| Piece the vision needs | Status in repo | Evidence |
|---|---|---|
| GitHub sign-in | Exists, not production-hardened | `app/api/auth/[...nextauth]`, `app/auth`, `components/auth` |
| "See your repos" API | **Real** (127 lines) | `app/api/github/repos/route.ts`, `connector-github` |
| Repo-pick wizard step | Built, **orphaned** | `Step0ChooseRepo.tsx`, `Step1SelectBranch.tsx` |
| Import-a-repo wizard | Built, **wired into 0 pages** | `ImportRepoWizard.tsx` |
| Workspace creation wizard | Built, **wired into 0 pages** | `WorkspaceCreationWizard.tsx` |
| First-run / onboarding wizard | Built, mostly orphaned | `FirstRunWizard`, `QuickStartWizard`, `OnboardingWizard` |
| Brittney as the guide | **Exists, live at `/start`** | `/start` renders `BrittneyFullScreen`; Studio Brittney = Claude SDK |
| Project DNA classifier | Engine exists | `absorb-service` daemon + `selfTargetConfig`, `create-holoscript` scanner |
| Daemon-guided improvement | PRD written, engine exists | `studio-repo-management-prd.md`, absorb daemons |
| Compile-target picker | Built | `CompileTargetGrid.tsx` |
| Describe→render→deploy | **Live in production** | Studio `/vibe`, `/api/deploy` |
| The verticals (destinations) | 54 plugins, dormant | `packages/plugins/*` (0 consumers, ~4 commits/6mo) |

**The gap is assembly, not invention.** The wizards are orphaned components
(`ImportRepoWizard`, `WorkspaceCreationWizard`, `BrittneyWizard`,
`FirstRunWizard`, `QuickStartWizard` are each imported by **zero** app pages).
The platform built every plank of the door and never hung it.

### 2.5 The missing piece, measured (gap ledger)

A closer audit (2026-06-02) corrected the first estimate: the front door's
*machinery* is ~**85%** built, not 70%. The connective tissue thought to be
missing actually exists —

- `connector-github` has the full write-back toolset (`github_pr_create`,
  `github_pr_merge`, `github_content_create_or_update`, `github_pr_review`).
- `/api/workspace/import` is **400 real lines** — clones the repo, runs Project
  DNA, enforces repo consent.
- `/api/git/push` exists; `PatchReviewPanel` **is** wired into
  `workspace/page.tsx`; compile + deploy are live.

So the genuinely-missing ~15% is **not engines** — it splits into three very
different kinds of gap:

| Gap | Kind | What's actually missing | Effort | Blocks the family goal? |
|---|---|---|---|---|
| **A — last-mile glue** | connect-what-exists | `ImportRepoWizard.tsx` **does not call** `/api/workspace/import`. The guided wizard and the working API are disconnected halves; the path that *works* is a developer dashboard, the path that's *intuitive* is an unwired shell. | Low — highest leverage in the plan | Indirectly (it's the intuitive path) |
| **B1 — unified intent-hub** | net-new | No single "what do you want to do?" router. Only a `UXCommandPalette` (power-user) and **two** separate entry surfaces (`/` → `OnboardingWizard`, `/start` → `BrittneyFullScreen`). | Medium — real build | Yes — this *is* the "universal, intuitive" surface |
| **B2 — content safety / family-readiness** | net-new | ~**0%**. Only archived docs mention moderation; no live implementation. An open describe-anything AI surface cannot be handed to children without it. | Medium–High | **Yes — hard gate.** This is the literal blocker for "families use it." |
| **C — trust layer** | precondition | 363 failing tests, bypassed commit gate, partial auth/consent hardening. Not features — the gap between "demo" and "a thing you'd let family touch." | Phase 0 | Yes (precondition) |
| **(behind the door) vertical depth** | pull-based | The "utilize everything we offer" promise: 54 verticals still mostly hollow. Largest unbuilt *mass*, but Phase-3, not front-door. | Open-ended | No (label honestly, fund on demand) |

**The corrected read:** you are much closer than "30% to build" — most of the
remaining work is *wiring shells to engines you already paid for* (Gap A). The
sobering half: the two things that are genuinely 0% — the **intent-hub (B1)** and
**content safety (B2)** — are exactly the two things separating "a developer can
use it" from "a family can use it."

---

## 3. Why this is *also* the fix for "agents lose direction"

The review found agents drift because there's no single product the board points
at — 81% of effort is maintenance, doctrine and board disagree. **The Unified
Front Door is the missing product object.** Once it exists and is named as *the*
thing, every agent task can be scored by one question: *does this make the front
door more complete, more intuitive, or more reliable?* That single question is
the "sense of direction" that has been absent. Building the hub fixes the
product **and** the coordination problem at once.

---

## 4. The plan (phased, each phase shippable and dogfoodable)

### Phase 0 — Repair the base (do this first, it's load-bearing)
You cannot hang a door on a frame that's failing. The review found a broken
quality loop, and an intuitive product cannot sit on 363 red tests.

- Triage the **363 failing tests**: bucket into (a) pre-existing/known, (b) new
  regressions, (c) flaky. Get a true "what's actually broken" number.
- Un-break the pre-commit gate so `--no-verify` stops being routine, and
  **re-arm secret scanning** (it's been silently skipped).
- Decide CI: HoloCI is the path; make one canonical, trusted green signal.
- **Exit metric:** a green, trustworthy commit gate; failing-test count *known
  and trending down*, not mysterious.

### Phase 1 — Hang the spine flow (sign in → repo → workspace) — **mostly glue (Gap A)**
Per the gap ledger, this is connect-what-exists, not invention. The engines
(`/api/workspace/import`, Project DNA, repo consent, `/api/github/repos`) are
already built; the wizard shells just aren't plugged into them.

- **First concrete task (the keystone glue):** wire `ImportRepoWizard.tsx` to
  call the real `/api/workspace/import` route. Today they're disconnected halves
  — the wizard collects input and the API does the work, but nothing joins them.
  This single connection turns the "intuitive path" from a dead shell into the
  working path.
- Then chain: `auth` → `/api/github/repos` → `Step0ChooseRepo` →
  `ImportRepoWizard`/`WorkspaceCreationWizard` → the (already-real) import +
  Project DNA → a ready workspace.
- Brittney (`/start`) is the host of this flow, not a separate surface — and
  this is where the *two* entry surfaces (`/` and `/start`) get unified.
- Support the founder's exact case: "see all repos, **or just my
  `.ai-ecosystem` repo**" — a single-repo fast path.
- **Exit metric:** the founder can sign in with GitHub and reach a live
  workspace for a real repo in under 2 minutes, no CLI — *through the guided
  wizard, not the developer dashboard.*

### Phase 2 — The universal wizard hub ("access to all the features")
From a ready workspace, Brittney routes to every capability through one
consistent wizard surface — this is the "point to all of it."

- One hub: "what do you want to do?" → build a scene (`/vibe`), improve this
  repo (daemon dry-run → reviewable patches per the PRD), compile to a target
  (`CompileTargetGrid`), publish/deploy/share (marketplace + `/api/deploy`).
- Collapse Studio's competing navigation (the review found **three** nav
  systems) into this one hub. Push `/create`'s 50 panels behind "advanced."
- **Exit metric:** from one workspace, a non-technical user can reach and
  *complete* at least 3 capabilities (build, improve, ship) without leaving the
  guided surface.

### Phase 3 — Make the breadth honest (verticals as wizard destinations)
The 54 verticals stay — but the wizard must **never lie** about depth.

- Tag each plugin/vertical: **real** (works across targets) vs **sketch**
  (template). The wizard surfaces all, but labels sketches as "preview" and
  routes "real" ones as first-class.
- Promote depth **on demand**: when a user (or the founder) actually wants a
  vertical, that's the signal to invest in it — pulled by use, not pushed
  speculatively. (This is the idea-seeds "reopen trigger" discipline applied to
  plugins.)
- **Exit metric:** every wizard destination either works or is honestly marked
  "preview"; no dead-end that pretends to be ready.

### Phase 4 — Dogfood until it's used
The whole point: the founder and a family actually use it.

- **Hard gate before family use (Gap B2):** content safety / moderation must
  exist first. It is currently ~0% (only archived docs mention it). An open
  describe-anything AI surface cannot go to children without a moderation layer,
  age-appropriate guardrails, and abuse handling. **Founder dogfooding can begin
  without this; family use cannot.** Treat this as the explicit precondition for
  the word "families" in the brief.
- Founder runs the full flow on a real repo, weekly, and files what breaks.
- One real family-style task end to end (e.g. "describe a thing → share a link"
  via `/vibe`, or a repo-improvement via the daemon).
- **Exit metric:** the sentence "aiBrittney/the product hasn't been used" is no
  longer true — there is a logged, repeated, real session.

### Cross-cutting — Give agents the single point
- Collapse the **6 behavioral-contract docs** (CLAUDE.md, AGENTS.md,
  AGENT_INTERFACE.md, NORTH_STAR.md, GEMINI.md, .cursorrules) into **one**
  canonical decision tree whose top line is: *"The product is the Unified Front
  Door. Score every task against it."*
- Reshape the board so a majority of tasks target a front-door phase above.
- This is what stops the drift — not more ritual, one clear referent.

---

## 5. What changes vs. the review's first recommendation

| Review said | This plan says (per founder) |
|---|---|
| Pick one spine, hibernate the verticals | Keep the verticals; make them wizard destinations |
| Narrow to one user | Universal flow, repo-centric, many verticals |
| Collapse to one product | One **front door** that unifies all products |
| Cut Brittney to one impl | Still true: **Studio Brittney is the guide**; the Ollama CLI is a dev tool or archived |

The review's *health* findings (363 tests, broken gate, doc sprawl, board
mismatch) all stand — they're Phase 0 and the cross-cutting track here.

---

## What Remains After This Plan (completeness gap)

Per the contributing contract, what this plan does **not** solve:

- **It is a plan, not built.** Zero code has changed. The wizards are still
  orphaned, the gate still broken, the tests still red.
- **Depth of the 54 verticals is untouched.** The wizard will make them
  *reachable*; it will not make a dormant template into a real product. Phase 3
  labels honestly but does not fund depth — that's pulled by demand, later.
- **Auth hardening, content safety, and abuse/moderation** for real
  non-technical/family users are named but not specified here; a true public
  family launch needs a security + safety pass this plan only gestures at.
- **The two-Brittney consolidation** is asserted (Studio Brittney = canonical)
  but the actual deprecation/merge of the `aibrittney` CLI is not scoped.
- **The daemon "improve my repo" path** leans on `absorb-service` working in
  production; this plan assumes it but does not re-verify live daemon reliability.
- **No phase durations or owners** are assigned — sequencing only. Turning this
  into a dated board with task IDs is the immediate next step *if approved*.
- **The founder still owns one call:** whether Phase 0 (quality base) truly
  precedes Phase 1, or whether a thin Phase-1 demo runs in parallel to keep
  momentum visible while the base is repaired.
