# Local storefront

This is the HoloScript **language store** — one shop in the mall, not the
mall. The breezeway **and the user’s vehicle** is
`C:/holo-dev/ai-ecosystem/docs/handbooks/holon-storefront.md` (Joseph’s
instance is private git; users ride an `.ai-ecosystem` of their own).
Sibling stores (Land, Mesh, Gate, AI, Protocol) support this one and must
not be dumped into `README.md`.

**Status:** local merchandising SSOT. This is the aspiration we put in front
of agents and operators on this machine. It is **not** the public GitHub
face yet.

**Public GitHub V1** may replace `README.md` / HoloSchool lesson 1 /
`docs/PUBLIC_ACCESS.md` only when
[`github-v1-gate.md`](./github-v1-gate.md) is green. Until then, do not
rewrite those files as if the warehouse were already a shoppable store.

Worked merchandising: hardware-store menu V.3 (purpose before SKU), V.2
(aisles stay full), V.1 (short doorway). Identity stays
[`docs/spec/language-identity.md`](../spec/language-identity.md). Thesis
stays [`NORTH_STAR.md`](../../NORTH_STAR.md). Index of windows in this
tree: [`index.md`](./index.md). Worlds:
`C:/holo-dev/HoloRepo/Hololand/docs/storefront/local.md`. Vehicle:
`C:/holo-dev/ai-ecosystem/docs/storefront/local.md`.

---

## What we put in the window

HoloScript exists so a person — using any AI — can make a system they
**own**, whose **running is a proof** about reality, and remix that proof.

Three nested purposes, all true at once:

1. **People own what they make** — games, apps, worlds, twins. No coding
   degree required. No Unity / Meta / Google lock to run it (D.095).
2. **Running is the proof** — anyone, any AI, one source. A simulation that
   is a theorem about reality, not a movie of one. Pretty is skin. True is
   the moat.
3. **Same store for people and agents** — one language, one receipt. Agents
   are how people get the utility at scale. We own the bottlenecks (CI, GPU,
   seats) so others stop renting them.

The product is the **loop**, not a tool count (verify counts via
[`docs/NUMBERS.md`](../NUMBERS.md)):

- Daily: intention → route → build → verify → ship → remember → coordinate → improve
- Studio: Conceive → Build → Verify → Ship → Earn
- Frontier: Invent → Author → Embody → Experience → Evolve

Studio is where a person walks the loop. HoloShell is where they live in
the result. HoloMesh public is where agents are findable. HoloScript is
the floor.

---

## Greeter (always)

1. **Who is shopping?** A person, an agent for a person, or a teammate.
2. **Which purpose?** One of the ten jobs below — not a gadget sentence
   like “scan a VR code.”
3. **What is already in their hands?** Nothing, a `.holo` file, a headset,
   or a repo.

Then walk them to a **meal**, not the stockroom. Aisles may be long.
The door stays short.

HoloQR is **admission**: walk up to a printed mark, enter the world that
belongs to it. It is not a barcode trick. Source is authored HoloScript
compiled to Quest — not a native app with a sticker.

---

## Ten jobs (purpose index)

Hang every tool, holon, and example on one of these. MCP category names
(`core`, `compiler`, …) are stockroom labels.

| Purpose | People walk out with | Agents fetch | Honest status (2026-09-05) |
| --- | --- | --- | --- |
| Own what I make | Source plus something that runs without a vendor lock | Parse → validate → sovereign compile (WebGPU, HoloBytecode, WASM) | Source and compilers exist. Public README still sells a count, not this job. |
| Idea to shipped | An idea alive and able to earn | Traits, generate, edit, preview, then compile and verify | Studio / generate tools exist. HoloSchool lesson 1 still teaches a VR room as the identity. |
| Is-right | Heat, stress, or logic plus a replayable trace | `solve_thermal` / `solve_structural` / `solve_logic` + CAEL | Solver math exists. Not a scientist-facing product (no geometry UI). |
| Real place | A walkable map from a filmed site | HoloMap reconstruct → export | Tools exist (`holo_reconstruct_*`). Not the stranger door. |
| Admit (HoloQR) | Headset opens **this** world from a physical mark | `compile_to_quest` from `scanner.holo` | App is HoloScript-authored. Store candidate `1.0.4` still **changes-requested**. Paint desk kits are in MCP source; remote still token-matches until deploy. |
| Agent sees my files | Cited answer about **this** tree | Absorb (fresh) → ask | Absorb is holon-tagged. Remote Absorb cannot see this laptop. |
| Crew that does not wait | Work finishes without the human as switchboard | Mesh board, inbox, knowledge | Live for the team. Not the public doorway. |
| Own mind | Intelligence on metal they own | HoloTune → llama.cpp serve | Loop exists. Do not claim “we trained AGI.” |
| Own the toll | Stop renting CI / GPU seats / run-what-you-made | HoloCI, HoloKey, budgets | Local doctrine. GitHub Actions stays closed. |
| Digital then physical | Twin first, then print / robot / climb | URDF, SDF, MuJoCo, ROS 2, STL | Compilers exist. NORTH_STAR: simulation first. |

Statuses expire. Re-check with
[`docs/handbooks/done-claim-revalidation.md`](../handbooks/done-claim-revalidation.md)
before promoting any row to “proven for GitHub.”

---

## People and agents buy the same dinner

| Job | Person consumes | Agent consumes for them |
| --- | --- | --- |
| Own it | Studio / playground / a running preview | Parse → validate → sovereign compile + receipt |
| Trust it | A number they can check, not a trailer | Solver + CAEL replay. Skin never signs the proof. |
| Enter it | Headset, Shell, a printed mark | HoloQR / Quest compile from `.holo`; Gate admits; Land hosts |
| Ask it | Plain question about my files or my world | Absorb or Map first, then ask, with citations |
| Keep a mind | A counterpart that remembers and can act | Tune on owned metal, serve llama.cpp, wallet + policy |
| Not wait | Sleep; wake to done work | Mesh board and peers. Human is last resort. |

---

## What this file is not

- Not permission to rewrite `README.md` as V1.
- Not permission to shrink the language to three backends or forty traits.
- Not permission to delete tools. The warehouse stays. The door gets honest.
- Not a claim that the ten jobs are all product-ready.

## What remains after this plan

Local agents can now lead with purpose. A stranger on GitHub still hits
the old README (counts, four competing doors, VR-flavored HoloSchool).
Paint-desk kits are in MCP *source*; remote MCP still token-matches until
deploy. Who-for is an overlay, not a registry field. Those are GitHub V1
gates, not this file.
