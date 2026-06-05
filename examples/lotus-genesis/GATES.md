# THE LOTUS GENESIS — Gate Ledger (single source of truth)

> **This file is authoritative for gate status.** Do not reconstruct status from commit
> messages, receipts, or memory — read this ledger and re-derive it live with each gate's
> verifier. (Same discipline as `examples/gold-game/GATES.md`, the sibling ladder.)

The I.007 **Lotus Genesis** render proof: a botanical lotus pond that compiles/renders from a
single `.holo` scene. Its **own** gate ladder (sibling to the GOLD Game, not folded in), built on
the GOLD-game pattern: each gate = a verifier + a receipt JSON + a landed commit, advanced
reconcile-then-advance, claims backed by adversarial evidence (anti-F.069: state/digest deltas,
negative controls — never greps).

The canonical scene is **`packages/studio/public/scenes/lotus-pond.holo`** (the artifact every
gate reads). The R3F renderer + the `@botanical_lotus` trait are the compile *target* runtime;
the `.holo` is the scene that drives them.

## Gates

| Gate | Name | Status | Verifier (re-derive) | Receipt |
|------|------|--------|----------------------|---------|
| 1 | pond scene is **derived from `lotus-pond.holo`** (not hand-authored `.tsx`) | **PASS** (9/9) | `node_modules/.bin/tsx examples/lotus-genesis/gate-1-holo-derived-scene-verify.mjs` | `GATE-1-HOLO-DERIVED-SCENE-receipt.json` (`sceneDigest 8493458793a9`) |

### Gate 1 — what it proves (and its honest scope)
Parses the real `lotus-pond.holo` through `@holoscript/core` and asserts the **scene content is
the `.holo`**: parse-clean (0 errors), **22 objects** derived, **5 `@botanical_lotus`** blooms,
the pond is generic primitives authored in the `.holo` (`lilypad` pads, `circle` duckweed,
`cylinder` reeds, reflective water plane), and a **deterministic `sceneDigest`** that reproduces
across two independent parses. **Two negative controls:** tampering the `.holo` (removing one
lotus block) drops the lotus count to 4 and changes the digest (the `.holo` is load-bearing); a
sentinel object name never authored is absent (we read the real file, not a fixture).

This is the direct rebuttal to "you said `.holo` but I see `.tsx`": the scene IS the `.holo`,
provably. **Honest scope:** Gate 1 proves SCENE DERIVATION only. The live *pixel* render — the
renderer that WALKS this `.holo` onto a canvas — is **Gate 2** (headless/manual, exactly like
GOLD Gate 1's `PASS*`).

## Next gate (named)

**Gate 2 — the live render WALKS `lotus-pond.holo`.** Reconcile the uncommitted renderer work so
the studio surface renders the pond *from* the `.holo` with **no hand-authored pond** and **no
double-pond**: the `@botanical_lotus` trait must emit only the lotus (bloom + stem), the pond
environment must come solely from the `.holo` primitive objects, and core must be rebuilt so the
running studio reflects it. Falsifier: a build/scene assertion that the rendered pond objects are
byte-derived from `lotus-pond.holo` (tamper one `.holo` object → the rendered scene changes; a
pond object NOT in the `.holo` cannot appear). Verify the live render with a screenshot, then seal
the Gate-2 receipt. (Do NOT detour into the dormant engine `ThreeJSRenderer`/`WebGPURenderer` —
R3F is the sanctioned 3D target per GOLD Gate 1 + Gate 7 conformance; native-3D is a separate
tracked gap.)

## Why this ladder exists

Same reason as the GOLD-game ledger: before it, the lotus render lived as a `.holo` string inside
`.tsx` plus hand-authored scene code, with claims of "compiled from `.holo`" that were never
verified (the first `lotus-pond.holo` parsed with **45 errors / 0 objects** — caught by Gate 1's
probe, not by assertion). One ledger, one verifier per gate, evidence over claims.
