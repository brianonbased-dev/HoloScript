# GitHub V1 storefront gate

**Rule:** the local storefront is [`local.md`](./local.md). The public
GitHub face stays `README.md` until this gate is green.

GitHub V1 is the **short door** of the aspiration — proven meals only —
not a claim that every holon, compiler, and counterpart is finished.
That matches grocery merchandising (door short, aisles full) and the
native-machine ladder (`hs-machine-vN` internal; outward preview only
after evidence): [`docs/spec/native-machine-release-ladder.md`](../spec/native-machine-release-ladder.md).

Do **not** `git push` a README rewrite as “V1 storefront” while any
required row below is red. Local commits of this folder are allowed.

---

## What GitHub V1 is

When this gate is green, these public files become the V1 storefront:

- `README.md` — purposes first, house special, greeter questions, proven
  meals. Counts live in [`docs/NUMBERS.md`](../NUMBERS.md), not as
  hardcoded “80+ / 1,500+” identity.
- `docs/holoschool/level-1-fundamentals/01-what-is-holoscript.md` — same
  purpose, worked example = house special (cyan orb), not “first VR room”
  as the language boundary.
- `docs/PUBLIC_ACCESS.md` — matches live anonymous tools; no “will be
  live after next deploy” if already live.

The warehouse (full MCP catalog, holon registry, compilers) stays
behind the door. V1 does not delete it and does not dump it on the
stranger.

---

## Required proofs (door)

Each row needs a current command or live probe. Archive notes do not
count ([done-claim revalidation](../handbooks/done-claim-revalidation.md)).

| # | Proof | Why the door needs it | Current (2026-09-05) |
| --- | --- | --- | --- |
| 1 | House special compiles cyan on two backends from `examples/quickstart/1-floating-cyan-orb.holo` | Produce at the door. Strangers believe the store is real. | Source exists. WebGPU/URDF `baseColor` fix was local work; re-run the compile gate before claiming. |
| 2 | README leads with the three nested purposes, not a tool inventory | GitHub is the window. Inventory belongs in NUMBERS / manifest. | Red. README still leads with backend/trait counts. |
| 3 | Greeter copy: who / purpose / what’s in hand | A person or an agent-for-a-person can shop. | Red on GitHub. Live on local.md. Public harness `STOREFRONT.md` now asks the three questions. |
| 4 | Paint desk maps **purpose**, not tokens | “Scan a QR for my human” must not mean `hs_scan_project`. “Compile one scene to two backends” must not tie SDK with WebGPU. | Source routes meal kits (2026-09-06 tests). Remote `mcp.holoscript.net` still token-matches until that package is deployed. |
| 5 | PUBLIC_ACCESS matches live anonymous MCP | Do not advertise a door that is already open as “coming soon,” or a door that is closed as open. | Stale as of merchandising pass — re-probe `/api/public/tool` at release. |
| 6 | HoloSchool 1 uses the house special and states spatial is a domain, not the boundary | First lesson is the store’s produce. | Red. Lesson 1 still VR-room flavored. |
| 7 | Door lists only **proven meals**; other purposes stay on local.md until they have a meal | Aspiration stays local. GitHub V1 does not overclaim counterpart AGI, scientist-ready sim UI, or store-accepted HoloQR. | Red until README is rewritten under this rule. |

## Must not block GitHub V1

These are real jobs on [`local.md`](./local.md). They stay on the local
floor and in the warehouse. They are **not** required to be product-complete
before the public door exists:

- Counterpart AGI / “we trained AGI”
- Scientist-facing geometry + meshing in Studio
- Meta store acceptance of HoloQR (say the rejection honestly if mentioned)
- Every compiler as a sovereign runtime
- HoloTune producing a novel architecture
- Who-it-is-for on every holon (should follow; does not freeze V1)

## Unlock procedure

1. Re-run the required proofs against current git + live MCP.
2. Rewrite only the three public files listed above. Explicit `git add`
   those paths. Never `git add -A`.
3. Keep [`local.md`](./local.md) as the full aspiration + status table.
4. Announce: GitHub is now the V1 **door**. The warehouse is still local.md
   + holon registry + MCP manifest.
5. Push to `origin/main` only when this gate is green **and** someone
   intends the public face to change (Railway deploys on push).

## What remains after this gate

A green GitHub V1 still leaves: remote MCP serving the new meal kits,
aisle signs on MCP categories (no more junk “core”), HoloQR store path,
simulation product UI, owned-mind serving as a stranger meal. Those are
later facings, not reasons to delay an honest door.
