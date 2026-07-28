# HoloScript Language Architecture — The Stratum Taxonomy

> **Status.** RATIFIED architecture decision (agent-decided per NORTH*STAR §0 — a
> technical taxonomy, not an exact-four class; open to founder redirect on any single call).
> **Author.** claude1, 2026-07-17, acting as language specialist to break the uAAL design loop.
> **Scope.** This is the \_top* of the language canon. Every other language doc
> (`uaal-language-spec.md`, `spec-vs-reality-gap.md`, the three-format papers, the HSI-IR
> design notes) is **subordinate to and scoped by** this one. Where they disagree with a
> stratum assignment here, this document wins and they get corrected.

---

## 0. The one-sentence diagnosis (why we kept circling)

**We were never circling on syntax. We were circling because one word — "uAAL" — names
three different language layers at once, so every design conversation silently talked past
itself.** A language design cannot converge while its central noun has three referents:
one person says "uAAL is the meaning layer," another remembers "uAAL is the VM," a third
needs a meaning layer, finds the name already taken twice, and mints a _fourth_ thing
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
our existing, _already-shipped_ pieces onto the three strata. Nothing new is invented here —
everything below already exists in code. We are **assigning names to things that are real**,
not building.

| Stratum         | The question it answers                               | Canonical name                                      | Canonical artifact(s) — shipped                                                  | Status                                                                                                         |
| --------------- | ----------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **① Surface**   | _What you write_ (concrete syntax)                    | **The three formats** — `.holo` · `.hsplus` · `.hs` | Rust/WASM grammar (`packages/compiler-wasm`) + parsers                           | `.holo` ✅ · `.hs` ✅ · `.hsplus` ⚠️ (parse-rate gap flagged 2026-07-02; re-verify before acting — §8.5)       |
| **② Meaning**   | _What it means_ (typed abstract syntax you can check) | **HoloMeaning — the meaning IR**                    | ONE typed IR + the family semantics (`resolve*`, enumerated live by the §6 gate) | mature semantics in `packages/uaal/semantic.ts`; typed IR forming in `core` (HSI-IR) — **currently split, §3** |
| **③ Execution** | _What it does_ (dynamic semantics / runtime)          | **The VMs** — the cognitive VM + the HOLO VM        | `packages/uaal/{vm,opcodes}.ts` (cognitive) · `packages/holo-vm` (spatial)       | cognitive ✅ (island) · spatial ✅ (wired to pixels)                                                           |

A fourth concern — **effects & receipts** (bounded effect requests at the boundary, typed
resolution records, provenance/receipts) — is _not a fourth stratum_. It is the **ABI of
stratum ③**: the typed surface where execution touches the outside world. It rides with the
VMs, not with meaning.

**Read the strata top-to-bottom as a compile pipeline:** you _write_ ① → the compiler
produces ② → a VM _executes_ ② at ③ → ③ emits effects/receipts. Meaning (②) is the pivot:
① lowers _into_ it, ③ runs _from_ it, checkers/rewards/papers all read _it_.

### 1.1 Document roles and claim registers

Language documents answer different questions. Treating all of them as current
capability inventories makes vision papers timid and makes implementation
claims unreliable. Every language artifact therefore has a **role**, and every
material claim has a **register**.

| Artifact role         | Primary job                                                                             | It is not                                       |
| --------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `vision-design`       | State a coherent, falsifiable language fixed point and generate implementation pressure | A claim that the fixed point is already shipped |
| `implementation-spec` | Define currently accepted syntax, semantics, and conformance behavior                   | A permission slip for unimplemented syntax      |
| `evidence-paper`      | Defend a scoped research claim with formal or empirical evidence                        | A general capability inventory                  |
| `capability-report`   | Record what a named revision, package, service, or runtime demonstrably does now        | The permanent boundary of the language          |

P10 (`.hs`), P11 (`.hsplus`), and P12 (`.holo`) are primarily
`vision-design` papers. They are intentionally **constructively
aspirational**: each should describe the strongest coherent language we are
building toward, not merely narrate the latest parser snapshot. Their current
implementation checkpoints remain evidence-bound, and none of the three
replaces the grammar or implementation specifications in this directory.

Use these claim registers inside every format paper:

| Claim register | Required voice                                            | Evidence rule                                                                                                                |
| -------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `target`       | “we propose”, “is designed to”, “the target invariant is” | May outrun implementation, but must be precise enough to become an acceptance test                                           |
| `formal`       | “in the model”, “under these premises”, “we prove”        | Scope the result to its definitions and premises; do not silently promote it to all current backends                         |
| `observed`     | “the current path”, “the prototype”, “we measured”        | Cite the source path plus revision, receipt, or reproducible artifact; distinguish prototype, measurement, and released path |
| `gap`          | “remains”, “requires”, “acceptance gate”                  | Name the missing parser, lowering, runtime, conformance, or evaluation work                                                  |

The governing sentence is: **vision may outrun implementation; observed claims
may not outrun evidence.** A format paper should normally move in this order:
target architecture → present construction → formal contract → observed
checkpoint → development gaps. That structure makes the papers compasses for
growth without turning aspiration into false product status.

---

## 2. The overload map — what "uAAL" really meant each time, and what retires

Every historical use of "uAAL" belongs to exactly one stratum. Here is the disambiguation.
**After this doc, "uAAL" unqualified is a banned term in new canon** — you must say which
stratum you mean.

| When you said "uAAL"…                                                    | You meant stratum | New canonical name     | Disposition                                                                                                                    |
| ------------------------------------------------------------------------ | ----------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| the stack VM, opcodes, `CALL`/`RET`, bytecode (v1, born in uaa2-service) | ③ Execution       | **the cognitive VM**   | keep the code; `@holoscript/uaal` package survives but is **re-scoped to execution+ABI only**                                  |
| `semantic.ts` + the family semantics + `resolve*` honest-abstention (v2) | ② Meaning         | **HoloMeaning**        | the _semantics_ are canon; they must move upstream so both ③ and the compiler import them (§3)                                 |
| "the canonical MEANING layer, not the file format" (2026-07-07)          | ② Meaning         | **HoloMeaning**        | correct instinct, wrong home — it was declared inside a leaf package the compiler can't import                                 |
| **HSI-IR** — "canonical typed representation" in `core` (2026-07-14+)    | ② Meaning         | **HoloMeaning**        | HSI-IR's _location_ (core) is correct; it is the seed of HoloMeaning. It must **absorb** the v2 families, not mirror them (§3) |
| `.hs` / `.hsplus` source grammar                                         | ① Surface         | **the three formats**  | unchanged                                                                                                                      |
| provenance envelope, resolution records, receipts                        | ABI of ③          | **effects & receipts** | rides with the VMs                                                                                                             |

> **Note on the name — RATIFIED by the founder, 2026-07-17: "HoloMeaning."** Chosen over
> "HSM" (universally reads as Hardware Security Module — a bad collision in an ecosystem
> running custody), over keeping "uAAL" for meaning (retains the historical ambiguity in
> every older doc), and over "HSI-IR" (crowns the mirror). The name follows HOLON.md:
> `Holo-` = part of the whole, `-Meaning` = a true noun for the thing's own complete role;
> registered in the holon registry. Package name at extraction time: `@holoscript/meaning`.
> The taxonomy is invariant to the label — what it requires is that layer ② have _exactly
> one_ name and _exactly one_ home. It now has both.

---

## 3. DECISION 1 — the meaning stratum is ONE IR, defined ONCE, imported everywhere

This is the crux — the call that stops the "uAAL-v2 vs HSI-IR" lap forever.

**The two are not competitors. They are one stratum split by an architecture accident.** The
mature semantics (the family resolvers, benchmarks, and the honest-abstention engine that took
HoloMind-s2 from 0/12 → 7/12) live in `packages/uaal`. But `core` — where the compiler and
HSI-IR live — is forbidden by design from importing `packages/uaal` (the "no `core→uaal`
edge" invariant). So when `core` needed the same meaning, it **re-derived** it as HSI-IR,
"mirroring `UAALResolution` structurally." _The mirror is the debt, and the debt is the
circle._

A language designer's rule is absolute here: **your abstract syntax / typed IR lives where
your compiler is.** You never strand your AST in a leaf package your compiler cannot reach.
Therefore:

1. **HoloMeaning's home is `core`** (or a foundational package that both `core` and the VMs import).
   HSI-IR's location is correct; it is the _seed_ of HoloMeaning.
2. **Each family's meaning is defined exactly once** — the `resolve*` semantics, gap-reason
   enums, and typed IR shapes — in that one home, and **imported** by the compiler, the
   reward, the corpus grader, the papers, and the VMs. **Mirrored nowhere.** The
   verifier-of-record principle ("the function that _labels_ training data is the function
   that _runs_ at inference") generalizes to: _the type that means a thing is the one type,
   period._
3. **The `no core→uaal` edge is preserved by moving meaning upstream, not by copying it.**
   Meaning is foundational; both the compiler (in `core`) and the VMs (in `packages/uaal`)
   depend _downward_ onto HoloMeaning. Concretely: extract the family semantics from
   `packages/uaal/semantic.ts` into HoloMeaning's home; `packages/uaal` (VM + ABI) then imports HoloMeaning
   like everyone else. No leaf→leaf edge, no mirror.

This is exactly GOLD **W.GOLD.002** (platinum): pour resources into the **one sovereign**
definition; stop maintaining bridge/mirror copies. Two definitions of "what occlusion means"
is the bridge-compiler anti-pattern at the semantics layer.

**Done state:** there is one HoloMeaning. `grep` for a second definition of any family returns
nothing. HSI-IR _is_ HoloMeaning (renamed or absorbed); uAAL-v2 semantics _are_ HoloMeaning (moved). The
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
3. a gap-generator corpus row graded by _that same_ `resolve*` (verifier-of-record);
4. a `benchmark-{family}-gap` post-gate.

**Precedent, now promoted to rule:** "close loops before opening them"; "fold, don't add"
(Causal→Counterfactual, Economics→Deontic, Plan→Composition); "genuine gap ≠ next build."
These were correct verdicts applied ad hoc — this is them made standing law. The vibe / new
substrate families wait behind the _existing_ open loops by this rule, not by a fresh debate.

---

## 5. DECISION 3 — one canonical grammar authority for the surface

"The parser is the spec" and "four contradictory grammars" are a **stratum-① problem, fully
separate from the meaning circle** — do not let them contaminate each other.

> **The Rust/WASM grammar (`packages/compiler-wasm`) is the _growing_ canonical grammar
> authority for surface syntax, and its coverage must never regress.** Corrected 2026-07-17
> against the shipped reality (the original wording overstated it): the WASM authority today
> parses `.hs` and a growing `.hsplus` `@trait` subset; `.holo` and full `.hsplus` are authored
> by the TS parsers (`HoloCompositionParser` / `HoloScriptPlusParser`) per the per-surface
> router `docs/spec/holoscript-grammar-ssot.md`. So the honest §5 is **directional, not
> present-tense**: the authority's coverage grows toward the whole surface, TS parsers are the
> strangled predecessors, and the invariant that _is_ enforced now is "**every file the
> authority already parses keeps parsing**." A human-readable grammar spec is generated from or
> conformance-tested against the authority — never a second hand-authored grammar that drifts.

This is W.GOLD.002 at stratum ①: the sovereign grammar, not bridge grammars. The `.hsplus`
figure is now current, not the stale 2026-07-02 "0.22%" — the authority parses **97.96%** of
the 2,303-file `.hsplus` corpus (TS **92.49%**; newline-drift 0/0; baseline
`scripts/lang-audit/shadow-compare-results-2026-07-17.json`). The remaining misses are
_conformance bugs against the growing authority_, not a missing spec.

---

## 6. The anti-drift gate — `check:language-strata` (the consumer that makes this real)

A taxonomy doc with no enforcing gate is lap N+1. This section is what makes §1–§5 _stick_.
The gate is CI, fails closed, and enforces:

1. **No stratum overload.** A source file's stratum is declared (path convention or header
   tag). A file tagged ③ (VM/execution) must not export stratum-② meaning types, and vice
   versa. The historical `packages/uaal` split (VM + semantics in one package) is the exact
   thing this catches — it stays green only after §3's extraction.
2. **One definition per family.** Static check: each HoloMeaning family name has exactly one
   `resolve*` / typed-IR definition in the repo. A second (a mirror) fails the build. This is
   the check that would have red-flagged HSI-IR re-deriving `UAALResolution`.
3. **No `core→uaal` edge AND no mirror.** The dependency guard stays; it is now _satisfied by
   HoloMeaning living upstream_, not by copying. The gate asserts both (edge absent) and (no duplicate
   family definition) — you can no longer satisfy one by violating the other.
4. **Banned bare "uAAL" in new canon.** New docs/spec headers must qualify the stratum. A
   lint warns on unqualified "uAAL" outside historical/archived files.
5. **Family-admission completeness.** A family present in HoloMeaning but missing any of its four
   loop artifacts (§4) fails `check:family-admission`.

Ship order for the gate: (6.2) first — highest-leverage, cheapest. **Shipped 2026-07-17**:
first run (report-only) lit the known HSI mirror (`HSICausalLoop.ts:79`) **and** a previously
unknown second mirror in the GRPO reward receipt (`UAALResolutionRewards.ts:192`) — the gate
earned its keep on day one. Same day, §8.2 stage 1 killed both mirrors and 6.2 went **strict**
at the pre-commit dev floor (Gate 5g2) and in the HoloCI catalog (`language-strata`).

**Gate-family status (2026-07-17, `check:*` all shipped):**

- **6.2 one-definition-per-family** — ✅ strict (pre-commit + catalog), unconditional.
- **6.3 verifier-of-record** (`check:verifier-of-record`) — ✅ strict on this repo's reward terms
  (pre-commit Gate 5g3 + catalog); green. Auditing the ai-ecosystem corpus builders with `--roots`
  caught one real forked-verdict labeler (`build-gap-resolution-corpus.mjs` falsely claiming VoR
  provenance) — header corrected to tell the truth, deeper fix tracked with the gap-code backlog.
- **6.5 family-admission** (`check:family-admission`) — ✅ **strict** (pre-commit Gate 5g4 + catalog).
  Shipped report-only, flagged exactly the 3 grandfathered families (occlusion / norm_status /
  dischargeable) collapsing to a coarse base bucket; same day they gained family-scoped codes
  (`occlusion.opacity_unstated`, `norm_status.opposing_force` / `.resource_contention`,
  `dischargeable.cyclic_order` / `.unstated_deadline` / `.unstated_magnitude`) — added to the
  EXISTING abstention returns, so no abstention condition changed (zero false-gap), pinned by
  `family-gap-codes.test.ts`. All 14 families now complete; the gate went strict. The corpus+benchmark
  half (§4.3/§4.4) is a cross-repo follow-up (ai-ecosystem `scripts/corpus` + `scripts/benchmark-*`),
  tracked.
- **§5 grammar-authority** (`check:grammar-authority`) — ✅ shipped (catalog, full profile): wires the
  existing Rust↔TS differential (`shadow-compare-rust-ts.mjs`) as a regression gate against a frozen
  baseline (`shadow-compare-results-2026-07-17.json`; authority parses **97.96%** of the 2,303-file
  `.hsplus` corpus) and chains `check:compiler-wasm-drift` for freshness. On landing it correctly
  surfaces a **pre-existing** stale artifact (`compiler-wasm/src` advanced past `pkg-node`) — a real
  drift needing a Rust-equipped node to rebuild; filed. The regression half (`--skip-drift`) is green.
- **6.1 stratum tags, 6.4 bare-uAAL lint** — the remaining two; small, next.

---

## 7. What this closes (the circles that stop turning)

- **"What layer _is_ uAAL?"** → answered structurally: it was three layers; now each has its
  own name. The question is ill-posed after §2 and cannot recur.
- **"uAAL-v2 or HSI-IR for meaning?"** → neither-as-rivals; **one HoloMeaning**, defined once (§3).
- **"Add this vertical or fold it?"** → the §4 rule answers it mechanically; no per-family
  debate.
- **"Which grammar is canonical?"** → the Rust/WASM authority (§5); the spec is derived.
- **"Where's the language spec?"** → _this document is the top of it_, and it is now
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
   declare it the compiler's world-IR dialect _inside_ the HoloMeaning stratum, importing the
   canonical contract — not a rival meaning IR. Its types stay physically in core for ONE
   documented reason (the core-internal `ExpressionIR` dependency; moving them would invert
   core→meaning) — if ExpressionIR is ever extracted, they can follow. Stage-3 landed with it:
   the verifier of record (`gradeByResolver`) and the eight family test files moved into
   `packages/meaning` (uaal keeps shims; VM tests stay). **Papers**: the three format papers
   (P10 `.hs` / P11 `.hsplus` / P12 `.holo`) are authored and classified as
   `vision-design` artifacts under §1.1. They cite HoloMeaning as the shared meaning
   stratum while keeping current implementation checkpoints in the `observed` register.
4. **Turn on the remaining gate rules** (6.1, 6.3, 6.5, 6.4) once the tree is green.
5. **Stratum-① conformance** (`.hsplus` parse rate) proceeds independently on its own track.

Each step is reversible, validated, announced. None is an exact-four class.

---

_Supersedes-in-scope: `docs/spec/uaal-language-spec.md` (now the stratum-③ execution spec) and
`docs/agents/uaal-vm.md`. Grounded 2026-07-17 against `packages/uaal/src/{vm,opcodes,compiler,
semantic,verifier,beneficiary}.ts`, `packages/core/src/compiler/HSICausalLoop.ts`,
`packages/holo-vm`, and GOLD W.GOLD.002 / W.GOLD.012._
