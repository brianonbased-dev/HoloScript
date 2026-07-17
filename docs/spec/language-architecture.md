# HoloScript Language Architecture — The Stratum Taxonomy

> **Status.** RATIFIED architecture decision (agent-decided per NORTH_STAR §0 — a
> technical taxonomy, not an exact-four class; open to founder redirect on any single call).
> **Author.** claude1, 2026-07-17, acting as language specialist to break the uAAL design loop.
> **Scope.** This is the *top* of the language canon. Every other language doc
> (`uaal-language-spec.md`, `spec-vs-reality-gap.md`, the three-format papers, the HSI-IR
> design notes) is **subordinate to and scoped by** this one. Where they disagree with a
> stratum assignment here, this document wins and they get corrected.

---

## 0. The one-sentence diagnosis (why we kept circling)

**We were never circling on syntax. We were circling because one word — "uAAL" — names
three different language layers at once, so every design conversation silently talked past
itself.** A language design cannot converge while its central noun has three referents:
one person says "uAAL is the meaning layer," another remembers "uAAL is the VM," a third
needs a meaning layer, finds the name already taken twice, and mints a *fourth* thing
(HSI-IR) to escape the collision. That is not disagreement — it is a **naming failure
wearing a design-debate costume.** Sixteen "should we add this vertical?" debates, four
"which grammar is canonical?" re-openings, and two "where does the meaning layer live?"
re-derivations are all downstream of this one unfixed thing.

The fix is not more design. It is a **taxonomy ratification**: one name per layer, retire
the overload, and a machine gate so it can never re-overload. (Nothing here is "done" until
the gate in §6 exists — generation without an enforcing consumer is how we got here. W.858.)

---

## 1. The canonical model — every language has exactly three strata

This is not HoloScript-specific; it is how every programming language is structured. We map
our existing, *already-shipped* pieces onto the three strata. Nothing new is invented here —
everything below already exists in code. We are **assigning names to things that are real**,
not building.

| Stratum | The question it answers | Canonical name | Canonical artifact(s) — shipped | Status |
|---|---|---|---|---|
| **① Surface** | *What you write* (concrete syntax) | **The three formats** — `.holo` · `.hsplus` · `.hs` | Rust/WASM grammar (`packages/compiler-wasm`) + parsers | `.holo` ✅ · `.hs` ✅ · `.hsplus` ⚠️ (parse-rate gap flagged 2026-07-02; re-verify before acting — §8.5) |
| **② Meaning** | *What it means* (typed abstract syntax you can check) | **HoloMeaning — the meaning IR** | ONE typed IR + the family semantics (`resolve*`, enumerated live by the §6 gate) | mature semantics in `packages/uaal/semantic.ts`; typed IR forming in `core` (HSI-IR) — **currently split, §3** |
| **③ Execution** | *What it does* (dynamic semantics / runtime) | **The VMs** — the cognitive VM + the HOLO VM | `packages/uaal/{vm,opcodes}.ts` (cognitive) · `packages/holo-vm` (spatial) | cognitive ✅ (island) · spatial ✅ (wired to pixels) |

A fourth concern — **effects & receipts** (bounded effect requests at the boundary, typed
resolution records, provenance/receipts) — is *not a fourth stratum*. It is the **ABI of
stratum ③**: the typed surface where execution touches the outside world. It rides with the
VMs, not with meaning.

**Read the strata top-to-bottom as a compile pipeline:** you *write* ① → the compiler
produces ② → a VM *executes* ② at ③ → ③ emits effects/receipts. Meaning (②) is the pivot:
① lowers *into* it, ③ runs *from* it, checkers/rewards/papers all read *it*.

---

## 2. The overload map — what "uAAL" really meant each time, and what retires

Every historical use of "uAAL" belongs to exactly one stratum. Here is the disambiguation.
**After this doc, "uAAL" unqualified is a banned term in new canon** — you must say which
stratum you mean.

| When you said "uAAL"… | You meant stratum | New canonical name | Disposition |
|---|---|---|---|
| the stack VM, opcodes, `CALL`/`RET`, bytecode (v1, born in uaa2-service) | ③ Execution | **the cognitive VM** | keep the code; `@holoscript/uaal` package survives but is **re-scoped to execution+ABI only** |
| `semantic.ts` + the family semantics + `resolve*` honest-abstention (v2) | ② Meaning | **HoloMeaning** | the *semantics* are canon; they must move upstream so both ③ and the compiler import them (§3) |
| "the canonical MEANING layer, not the file format" (2026-07-07) | ② Meaning | **HoloMeaning** | correct instinct, wrong home — it was declared inside a leaf package the compiler can't import |
| **HSI-IR** — "canonical typed representation" in `core` (2026-07-14+) | ② Meaning | **HoloMeaning** | HSI-IR's *location* (core) is correct; it is the seed of HoloMeaning. It must **absorb** the v2 families, not mirror them (§3) |
| `.hs` / `.hsplus` source grammar | ① Surface | **the three formats** | unchanged |
| provenance envelope, resolution records, receipts | ABI of ③ | **effects & receipts** | rides with the VMs |

> **Note on the name — RATIFIED by the founder, 2026-07-17: "HoloMeaning."** Chosen over
> "HoloMeaning" (universally reads as Hardware Security Module — a bad collision in an ecosystem
> running custody), over keeping "uAAL" for meaning (retains the historical ambiguity in
> every older doc), and over "HSI-IR" (crowns the mirror). The name follows HOLON.md:
> `Holo-` = part of the whole, `-Meaning` = a true noun for the thing's own complete role;
> registered in the holon registry. Package name at extraction time: `@holoscript/meaning`.
> The taxonomy is invariant to the label — what it requires is that layer ② have *exactly
> one* name and *exactly one* home. It now has both.

---

## 3. DECISION 1 — the meaning stratum is ONE IR, defined ONCE, imported everywhere

This is the crux — the call that stops the "uAAL-v2 vs HSI-IR" lap forever.

**The two are not competitors. They are one stratum split by an architecture accident.** The
mature semantics (the family resolvers, benchmarks, and the honest-abstention engine that took
HoloMind-s2 from 0/12 → 7/12) live in `packages/uaal`. But `core` — where the compiler and
HSI-IR live — is forbidden by design from importing `packages/uaal` (the "no `core→uaal`
edge" invariant). So when `core` needed the same meaning, it **re-derived** it as HSI-IR,
"mirroring `UAALResolution` structurally." *The mirror is the debt, and the debt is the
circle.*

A language designer's rule is absolute here: **your abstract syntax / typed IR lives where
your compiler is.** You never strand your AST in a leaf package your compiler cannot reach.
Therefore:

1. **HoloMeaning's home is `core`** (or a foundational package that both `core` and the VMs import).
   HSI-IR's location is correct; it is the *seed* of HoloMeaning.
2. **Each family's meaning is defined exactly once** — the `resolve*` semantics, gap-reason
   enums, and typed IR shapes — in that one home, and **imported** by the compiler, the
   reward, the corpus grader, the papers, and the VMs. **Mirrored nowhere.** The
   verifier-of-record principle ("the function that *labels* training data is the function
   that *runs* at inference") generalizes to: *the type that means a thing is the one type,
   period.*
3. **The `no core→uaal` edge is preserved by moving meaning upstream, not by copying it.**
   Meaning is foundational; both the compiler (in `core`) and the VMs (in `packages/uaal`)
   depend *downward* onto HoloMeaning. Concretely: extract the family semantics from
   `packages/uaal/semantic.ts` into HoloMeaning's home; `packages/uaal` (VM + ABI) then imports HoloMeaning
   like everyone else. No leaf→leaf edge, no mirror.

This is exactly GOLD **W.GOLD.002** (platinum): pour resources into the **one sovereign**
definition; stop maintaining bridge/mirror copies. Two definitions of "what occlusion means"
is the bridge-compiler anti-pattern at the semantics layer.

**Done state:** there is one HoloMeaning. `grep` for a second definition of any family returns
nothing. HSI-IR *is* HoloMeaning (renamed or absorbed); uAAL-v2 semantics *are* HoloMeaning (moved). The
word "mirror" no longer appears in a commit message about meaning.

---

## 4. DECISION 2 — the family-admission rule (stop re-litigating "add a vertical?")

Sixteen families were debated one at a time (6 → 14 → +13 proposed → vibe), each re-running
the same "family vs fold vs drop" ritual. A language designer answers this **once**, with a
conservativity criterion, and then it is mechanical.

> **A new family is admitted to HoloMeaning if and only if it introduces a typed distinction the IR
> cannot already express, AND it arrives with its honest-abstention loop closed.**
> Otherwise it **folds** into the nearest existing family (reuses that substrate).

"Honest-abstention loop closed" = all four, or it is not admitted:
1. a `resolve<Family>(ir)` that derives `unresolvable` + a **family-scoped gap reason** from
   real IR gaps (no false gaps — the existing test discipline);
2. a structured gap-reason code registered under the family namespace (not collapsed into a
   generic `missing_precondition`);
3. a gap-generator corpus row graded by *that same* `resolve*` (verifier-of-record);
4. a `benchmark-{family}-gap` post-gate.

**Precedent, now promoted to rule:** "close loops before opening them"; "fold, don't add"
(Causal→Counterfactual, Economics→Deontic, Plan→Composition); "genuine gap ≠ next build."
These were correct verdicts applied ad hoc — this is them made standing law. The vibe / new
substrate families wait behind the *existing* open loops by this rule, not by a fresh debate.

---

## 5. DECISION 3 — one canonical grammar authority for the surface

"The parser is the spec," four contradictory grammars, and the `.hsplus` parse-rate gap
(flagged 2026-07-02; re-verify against the current `compiler-wasm` before acting) are a
**stratum-① problem, fully separate from the meaning circle** — do not let them contaminate
each other.

> **The Rust/WASM grammar (`packages/compiler-wasm`) is the single canonical grammar
> authority for surface syntax. Any human-readable grammar spec is *generated from* it or
> *conformance-tested against* it — never a second hand-authored grammar that can drift.**

This is W.GOLD.002 again at stratum ①: the sovereign grammar, not bridge grammars. `.hsplus`'s
low parse rate is then a *conformance bug against the one authority*, not evidence of a
missing spec.

---

## 6. The anti-drift gate — `check:language-strata` (the consumer that makes this real)

A taxonomy doc with no enforcing gate is lap N+1. This section is what makes §1–§5 *stick*.
The gate is CI, fails closed, and enforces:

1. **No stratum overload.** A source file's stratum is declared (path convention or header
   tag). A file tagged ③ (VM/execution) must not export stratum-② meaning types, and vice
   versa. The historical `packages/uaal` split (VM + semantics in one package) is the exact
   thing this catches — it stays green only after §3's extraction.
2. **One definition per family.** Static check: each HoloMeaning family name has exactly one
   `resolve*` / typed-IR definition in the repo. A second (a mirror) fails the build. This is
   the check that would have red-flagged HSI-IR re-deriving `UAALResolution`.
3. **No `core→uaal` edge AND no mirror.** The dependency guard stays; it is now *satisfied by
   HoloMeaning living upstream*, not by copying. The gate asserts both (edge absent) and (no duplicate
   family definition) — you can no longer satisfy one by violating the other.
4. **Banned bare "uAAL" in new canon.** New docs/spec headers must qualify the stratum. A
   lint warns on unqualified "uAAL" outside historical/archived files.
5. **Family-admission completeness.** A family present in HoloMeaning but missing any of its four
   loop artifacts (§4) fails `check:family-admission`.

Ship order for the gate: (6.2) first — highest-leverage, cheapest. **Shipped 2026-07-17**:
first run (report-only) lit the known HSI mirror (`HSICausalLoop.ts:79`) **and** a previously
unknown second mirror in the GRPO reward receipt (`UAALResolutionRewards.ts:192`) — the gate
earned its keep on day one. Same day, §8.2 stage 1 killed both mirrors and 6.2 went **strict**
at the pre-commit dev floor (Gate 5g2) and in the HoloCI catalog (`language-strata`). Then
(6.1), (6.3), (6.5), (6.4).

---

## 7. What this closes (the circles that stop turning)

- **"What layer *is* uAAL?"** → answered structurally: it was three layers; now each has its
  own name. The question is ill-posed after §2 and cannot recur.
- **"uAAL-v2 or HSI-IR for meaning?"** → neither-as-rivals; **one HoloMeaning**, defined once (§3).
- **"Add this vertical or fold it?"** → the §4 rule answers it mechanically; no per-family
  debate.
- **"Which grammar is canonical?"** → the Rust/WASM authority (§5); the spec is derived.
- **"Where's the language spec?"** → *this document is the top of it*, and it is now
  gate-enforced (§6) instead of stranded in a silo (the original 2026-06-22 failure).

---

## 8. Migration order (small, WIP-cap-1, pain-receipt-gated per D.128)

Do **not** big-bang this. The taxonomy is ratified now (it is just naming + a doc); the code
moves land one at a time behind receipts:

1. **Ratify names + land gate 6.2** — ✅ DONE 2026-07-17: HoloMeaning founder-ratified;
   `check:language-strata` shipped report-only and lit TWO reds on first run — the known
   HSI mirror (`HSICausalLoop.ts:79`) plus an unknown one in the GRPO reward receipt
   (`UAALResolutionRewards.ts:192`). Those reds **are** the pain-receipt that admits the
   extraction.
2. **Extract HoloMeaning upstream** — ✅ DONE 2026-07-17 (both stages, same day):
   **Stage 1**: `@holoscript/meaning` created (the contract — resolution record, status union,
   gap taxonomy, `structuredGap`); core (`HSICausalLoop`) and absorb-service
   (`UAALResolutionRewards`) import it — **both mirrors deleted**. Gate 6.2 went `--strict` at
   the pre-commit dev floor (Gate 5g2) and in the HoloCI catalog (`language-strata`).
   **Stage 2**: the family semantics themselves (`semantic` / `beneficiary` / `vibe` /
   `affective-harm` — all `resolve*`/`recover*` bodies and family IRs) moved into the meaning
   home via history-preserving renames; `packages/uaal` keeps tiny `export * from
   '@holoscript/meaning'` shims at the old paths, so every existing import — the published
   `/semantic` subpath, verifier/merge/query, and the whole test suite — is unchanged and the
   full uaal suite passes THROUGH the shims. The collapse pre-check surfaced one latent
   status-union mirror in `verifier.ts`, fixed by import. `CONTRACT_HOMES` collapsed to the
   ONE meaning home; probe-verified both directions (planted duplicate resolver in uaal fails
   strict and names the canonical definition; clean tree passes).
3. **Re-home HSI-IR as HoloMeaning** — ✅ DONE 2026-07-17 (naming re-home): HSI-IR's headers now
   declare it the compiler's world-IR dialect *inside* the HoloMeaning stratum, importing the
   canonical contract — not a rival meaning IR. Its types stay physically in core for ONE
   documented reason (the core-internal `ExpressionIR` dependency; moving them would invert
   core→meaning) — if ExpressionIR is ever extracted, they can follow. Stage-3 landed with it:
   the verifier of record (`gradeByResolver`) and the eight family test files moved into
   `packages/meaning` (uaal keeps shims; VM tests stay). **Papers**: the three format papers
   (P10 `.hs` / P11 `.hsplus` / P12 `.holo`) are tracked but not yet authored as files — a board
   task directs them to cite HoloMeaning as the meaning stratum at authoring time; the live
   citation surfaces (DEFINITIONS glossary, this spec, the holon registry) are updated now.
4. **Turn on the remaining gate rules** (6.1, 6.3, 6.5, 6.4) once the tree is green.
5. **Stratum-① conformance** (`.hsplus` parse rate) proceeds independently on its own track.

Each step is reversible, validated, announced. None is an exact-four class.

---

*Supersedes-in-scope: `docs/spec/uaal-language-spec.md` (now the stratum-③ execution spec) and
`docs/agents/uaal-vm.md`. Grounded 2026-07-17 against `packages/uaal/src/{vm,opcodes,compiler,
semantic,verifier,beneficiary}.ts`, `packages/core/src/compiler/HSICausalLoop.ts`,
`packages/holo-vm`, and GOLD W.GOLD.002 / W.GOLD.012.*
