# Focus Plan — The Unified Front Door

**Date:** 2026-06-02
**Author:** Claude (Opus), at founder's direction
**Companion to:** `docs/reviews/2026-06-02-aibrittney-product-review.md`

> **⚠ Correction (2026-06-02, second pass — read this first).** A code-level
> re-verification overturned this plan's central empirical claim. The earlier
> drafts asserted the onboarding wizards are "orphaned / wired into 0 pages" and
> that `ImportRepoWizard` "does not call `/api/workspace/import`" — making
> last-mile glue (Gap A) the keystone. **That is false.** The intuitive path is
> already wired end-to-end and reachable from the homepage:
> `app/page.tsx` "Import" button → `OnboardingWizard` (a real 4-path router) →
> `ImportRepoWizard` ([`useImportRepoWizard.ts:161`]) → the real
> `/api/workspace/import` route → `/api/daemon/absorb` → `/api/workspace/provision`.
> Of every wizard previously called orphaned, **only `WorkspaceCreationWizard`
> actually is** (0 callers). The door is largely *hung*, not unbuilt — so the
> machinery is even more complete than "~85%," and Phase 1 is verify-and-unify,
> not "connect disconnected halves." Sections 2, 2.5, and Phases 0–1 below are
> corrected accordingly. Two further measurements this pass: **content safety (B)
> confirmed as a real ~0% gap** (a real cross-surface safety gap — but see the
> audience correction below: it gates HoloLand/schools, not the Studio front door), and the
> trust layer's **"363 failing tests" measured down to 3 / 6214 (99.95% green)**
> in the front-door package — so Phase 0 is far lighter than first framed. Each
> gap below is tagged re-verified vs carried-forward so nothing reads as proven
> that wasn't measured.

> **⚠ Audience correction (2026-06-02, founder).** This plan originally treated
> "a family can use it" as the Studio front door's bar and named content safety
> (B) as *the hard gate* for it. **That is the wrong audience.** Per the founder:
> **families → HoloLand** (the consumer/family surface), not the Studio front
> door — HoloScript/Studio is too advanced for families. Kids learning HoloScript
> = **schools, structured** (curriculum), not the open describe-anything Studio
> surface. So the **Studio front door's audience is developers / creators / the
> founder**, and content safety (B) is a real gap but it belongs to **HoloLand
> and school deployments**, *not* the Studio front-door spine. References to
> "families using the front door" below are reframed accordingly; B is retained
> as a cross-surface safety requirement, not a Studio-front-door blocker. See
> `direction_hololand-is-the-family-surface` (D.079).
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

Every box in that flow **already has code**, and — corrected from the first
draft — they **are** connected into a working path via `OnboardingWizard`. What's
missing is not the connection but the *unification*: two separate entry surfaces
(`/` → `OnboardingWizard`, `/start` → Brittney) instead of one, plus the verify
/ polish / safety work below. This plan unifies and hardens them.

---

## 2. What already exists (the parts in the pile)

This is the critical, encouraging fact: **the front door's machinery is ~85–90%
built and *already assembled into a working (if not yet unified) flow*** —
corrected from the first-pass claim of "~0% assembled," which a code-level
re-verification falsified (see §2.5).

Wiring status column re-verified by reading the import graph on 2026-06-02
(second pass):

| Piece the vision needs | Status in repo | Evidence |
|---|---|---|
| GitHub sign-in | Exists, not production-hardened *(carried from 1st review)* | `app/api/auth/[...nextauth]`, `app/auth`, `components/auth` |
| "See your repos" API | **Real** (127 lines) | `app/api/github/repos/route.ts`, `connector-github` |
| Repo-pick wizard step | **Wired** — used by `ImportRepoWizard` | `Step0ChooseRepo.tsx`/`Step1SelectBranch.tsx` ← `ImportRepoWizard.tsx:28-29` |
| Import-a-repo wizard | **Wired into 2 surfaces; calls the real route** | `ImportRepoWizard` ← `OnboardingWizard.tsx:87` + `StudioPanelOverlays.tsx:540`; POSTs `/api/workspace/import` at `useImportRepoWizard.ts:161` |
| Workspace creation wizard | Built, **genuinely orphaned (0 callers)** — the one real orphan | `WorkspaceCreationWizard.tsx` (only self-references) |
| First-run / onboarding wizard | **Wired** — `OnboardingWizard` mounted in `app/page.tsx:314`; reaches `FirstRunWizard`/`BrittneyWizard`/`StudioSetupWizard`; `QuickStartWizard` via `CreatorLayout.tsx:30` | `OnboardingWizard.tsx:82-96`, `page.tsx:314/332` |
| Brittney as the guide | **Exists, live at `/start`** *(carried)* | `/start` renders `BrittneyFullScreen`; Studio Brittney = Claude SDK |
| Project DNA classifier | Engine exists | `absorb-service` daemon + `selfTargetConfig`, `create-holoscript` scanner |
| Daemon-guided improvement | PRD written, engine exists | `studio-repo-management-prd.md`, absorb daemons |
| Compile-target picker | Built | `CompileTargetGrid.tsx` |
| Describe→render→deploy | **Live in production** | Studio `/vibe`, `/api/deploy` |
| The verticals (destinations) | 54 plugins, dormant | `packages/plugins/*` (0 consumers, ~4 commits/6mo) |

**The gap is unification and hardening, not assembly — and certainly not
invention.** `OnboardingWizard` already composes the four onboarding paths and is
reachable from the homepage; `ImportRepoWizard`, `FirstRunWizard`,
`BrittneyWizard`, `StudioSetupWizard`, and `QuickStartWizard` all have live
callers. The door is hung and openable; it is just hung *twice* (`/` and
`/start`) and not yet hardened. Only `WorkspaceCreationWizard` is an actual
orphan — decide to mount it or delete it.

### 2.5 The missing piece, measured (gap ledger)

Two passes refined this estimate. The first pass corrected ~70% → ~85% on the
strength of the engines being real. The **second pass (code-level wiring audit,
2026-06-02)** corrected the *assembly* claim: the wizards are not orphaned and
the intuitive import path is not a dead shell — both were verified to call real
endpoints and to be reachable from the homepage. Confirmed-real machinery:

- `connector-github` has the full write-back toolset (`github_pr_create`,
  `github_pr_merge`, `github_content_create_or_update`, `github_pr_review`).
  *(carried from 1st review — not re-read this pass)*
- `/api/workspace/import` is **real** (~400 lines) — authenticated `git clone`,
  repo-consent enforcement, conversion candidates, publish-worthiness, durable
  absorb state. **Re-verified by reading `route.ts` this pass.**
- `ImportRepoWizard` **does** call it (`useImportRepoWizard.ts:161`), then
  `/api/daemon/absorb` and `/api/workspace/provision`. **Re-verified this pass.**
- `/api/git/push` exists; `PatchReviewPanel` is wired into `workspace/page.tsx`;
  compile + deploy are live. *(carried from 1st review)*

So the genuinely-remaining work is **not engines and not last-mile glue** — Gap A
as previously written does not exist. What remains splits into:

| Gap | Kind | What's actually missing | Effort | Blocks the front-door goal? |
|---|---|---|---|---|
| **A — entry-surface unification** | reconcile-what-exists | The path *works* but is hung **twice**: `/` → `OnboardingWizard` (a real 4-path router) and `/start` → `BrittneyFullScreen` are two unreconciled front doors. Not "disconnected halves" — two *competing wholes*. Pick one host (Brittney) and route the other into it. | Low–Medium | Yes — "one intuitive way in" means one entry, not two |
| **A′ — orphan cleanup** | decide | `WorkspaceCreationWizard` has 0 callers — mount it into `OnboardingWizard`'s `create` path or delete it (today that path uses `StudioSetupWizard`). | Trivial | No |
| **B — content safety (HoloLand / schools, *not* the Studio front door)** | net-new | **Re-verified this pass: confirmed.** The Brittney generative endpoint (`app/api/brittney/route.ts`) has input *size* caps (4KB/msg, 32KB body — DoS/cost, SEC-T17) and secret-redaction in errors, but **no content-moderation / harmful-content / age guardrail**. Real ~0% gap — but per the audience correction it gates the **family/consumer surface (HoloLand)** and **structured school deployments**, not the Studio creator front door. | Medium–High | **No for the Studio front door** (dev/creator audience). **Yes** as a precondition for HoloLand/schools. |
| **C — trust layer** | precondition | **Re-verified this pass — the "363" was wrong for the front door.** Measured studio (`@holoscript/studio`) suite: **3 failed / 6183 passed / 6214 total (99.95% green)**, and *none* of the 3 touch the import/onboarding spine (they are: a wasm-compiler fallback edge case, a tool-description quality lint, and a route-classification completeness test). The "363" figure, if real, is monorepo-wide and/or stale — it is **not** the front-door package's state. Commit-gate bypass + auth/consent hardening *(carried from 1st review, not re-checked)* remain the real Phase-0 items. | Phase 0 (reduced) | Partially — the front door is **not** sitting on a wall of red |
| **(behind the door) vertical depth** | pull-based | The "utilize everything we offer" promise: 54 verticals still mostly hollow. Largest unbuilt *mass*, but Phase-3, not front-door. | Open-ended | No (label honestly, fund on demand) |

**The corrected read:** you are *further along* than even the first correction
said. A signed-in user can already reach a real workspace through the guided
homepage wizard — that path is built and wired, not a shell. The remaining
**Studio front-door** work is essentially just (A) collapsing the two entry
surfaces into one Brittney-hosted door — the audience here is developers and
creators, so there is **no family/content-safety gate on this surface**. **The
trust/test layer (C) shrank dramatically on measurement:** the studio package is
3 failed / 6214 (99.95% green), not "363 red" — so Phase 0 is far lighter than the
first review implied. **Content safety (B) remains a real ~0% gap, but it gates a
different product — HoloLand (families) and structured school deployments — not
this front door.** For the Studio front door, the gap between "a developer can
reach a workspace" and "a creator uses the whole thing intuitively" is now mostly
(A): one unified entry.

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

### Phase 0 — Repair the base (much lighter than first thought)
The first review framed this as "an intuitive product cannot sit on 363 red
tests." **Measurement corrected that:** the front-door package
(`@holoscript/studio`) is **3 failed / 6214 (99.95% green)** — the frame is not
failing. Phase 0 shrinks to a short, concrete list:

- **Fix the 3 known studio failures** (none block the spine): `wasm-compiler-bridge`
  fallback edge case, `StudioAPITools` description-quality lint, `surfaceClassification`
  route-completeness test. Small, named, not mysterious.
- ~~Un-break the pre-commit gate / re-arm secret scanning~~ **— re-verified this
  pass: already done.** The active `.githooks/pre-commit` ran green on every
  commit in this verification session, and it carries a real F.106 secret-scan
  (9 token formats: GitHub PAT classic+fine, OpenAI classic+proj, Anthropic, AWS,
  NPM, Slack, private-key blocks). The "broken gate / silently-skipped secret
  scan" claim is **stale** — both are working. (The remaining nuance: a broader
  "security audit" step is explicitly deferred to HoloCI, printed as "skipped (CI
  handles this)" — not silent, by design.)
- Decide CI: HoloCI is the path; make one canonical, trusted green signal.
- *(Measured: a full `pnpm -r test` run gives ~150–200 distinct failures across
  130k+ executions (>99.8% green) — the old "363" was whole-repo and has drifted
  down. **115 of those are in `services/holoscript-net-v2`** (the .net site, not
  the front door); core 8–47 (multi-project), mcp-server 14, engine 13. None of
  this gates the front door, which is at 3.)*
- **Exit metric:** studio suite fully green (3 → 0) and a trustworthy commit gate.

### Phase 1 — Unify and verify the spine flow (sign in → repo → workspace) — **reconcile + verify (Gap A)**
Per the corrected gap ledger, the spine is **already wired** — sign-in →
`/api/github/repos` → `Step0ChooseRepo`/`Step1SelectBranch` (inside
`ImportRepoWizard`) → real `/api/workspace/import` → absorb → provision → a ready
workspace. This phase does **not** build that connection (it exists); it
*verifies it runs end-to-end* and *collapses the two entry surfaces into one*.

- **First concrete task (verify the live path) — PARTIALLY DONE this pass.**
  Receipts captured: (a) `git clone --depth 1` of the real `ai-ecosystem` repo →
  EXIT 0, 4025 files, 6.8s, real GitHub auth; (b) the route is **live in a running
  Next 16 dev server** — `POST /api/workspace/import` (no session) → `401 Not
  authenticated`, `GET` → `200 {workspaces:[]}`; (c) the route's logic is covered
  by a 9-case unit suite. **Only remaining sliver:** the *authenticated* chain in
  one shot (OAuth session → clone → absorb → provision), which needs an interactive
  GitHub login. Every individual link is proven; the chained authed run is the
  last unverified step.
- **Unify the two front doors (the real Gap A):** make Brittney (`/start`) the
  single host and route the homepage `/` → `OnboardingWizard` path *into* it, so
  there is one entry, not two competing ones.
- **Resolve the orphan (Gap A′):** mount `WorkspaceCreationWizard` into
  `OnboardingWizard`'s `create` path or delete it (today that path uses
  `StudioSetupWizard`).
- Support the founder's exact case: "see all repos, **or just my
  `.ai-ecosystem` repo**" — a single-repo fast path.
- **Exit metric:** the founder can sign in with GitHub and reach a live
  workspace for a real repo in under 2 minutes, no CLI — through **one** unified
  guided entry, with a captured run receipt proving it, not a code-reading claim.

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
The whole point: the founder and real creators actually use it. (Families are a
**HoloLand** concern, a different product — see the audience correction up top.)

- **Content safety (Gap B) is NOT a gate for this front door.** Per the founder,
  the Studio front door's audience is developers/creators — not children — so the
  describe-anything surface here does not need a child-moderation layer to ship to
  its audience. Content safety is real and ~0%, but it gates **HoloLand (families)**
  and **structured school deployments** of HoloScript, and should be scoped there.
  Do not block Studio front-door dogfooding on it.
- Founder runs the full flow on a real repo, weekly, and files what breaks.
- One real creator task end to end (e.g. "import a repo → reach a workspace", or
  "describe a thing → share a link" via `/vibe`).
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

- **It is a plan, not built.** Zero code has changed. The two front doors are
  still un-unified, `WorkspaceCreationWizard` still orphaned, the commit gate
  still bypassable, and 3 studio tests still red (measured — down from the
  mythical "363").
- **Depth of the 54 verticals is untouched.** The wizard will make them
  *reachable*; it will not make a dormant template into a real product. Phase 3
  labels honestly but does not fund depth — that's pulled by demand, later.
- **Auth hardening** for the Studio front door is named but not specified here.
  **Content safety / abuse / moderation** is *out of scope for this plan* — it
  belongs to **HoloLand (the family surface) and structured school deployments**,
  not the Studio creator front door (see the audience correction). A public
  HoloLand/schools launch needs that safety pass; the Studio front door does not.
- **The two-Brittney consolidation** is asserted (Studio Brittney = canonical)
  but the actual deprecation/merge of the `aibrittney` CLI is not scoped.
- **The daemon "improve my repo" path** leans on `absorb-service` working in
  production; this plan assumes it but does not re-verify live daemon reliability.
- **No phase durations or owners** are assigned — sequencing only. Turning this
  into a dated board with task IDs is the immediate next step *if approved*.
- **The founder still owns one call:** whether Phase 0 (quality base) truly
  precedes Phase 1, or whether a thin Phase-1 demo runs in parallel to keep
  momentum visible while the base is repaired.
