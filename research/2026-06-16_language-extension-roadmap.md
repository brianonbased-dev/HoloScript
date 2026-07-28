# HoloScript Language-Extension Roadmap — Deep Research Synthesis

**Date:** 2026-06-16
**Method:** 6-dimension parallel research (lang-extension-surface · engineering · science/proof · plugin-architecture · behavioral-next · external-signal) + Opus synthesis. ~922k tokens, file:line-grounded, disciplined by the founder-ratified simulation-as-proof north star (NORTH_STAR.md §Thesis + `2026-06-15_simulation-as-proof-doctrine.md`).
**Status:** Research / decision input. Keystone claims independently verified on disk (see §Verified).
**Companion:** `2026-06-15_compiler-poison-and-native-runtime.md` (what to KILL); this is what to BUILD.

---

## Thesis

HoloScript already carries proof **at the one-run level** (ContractedSimulation, CAEL chain, DomainSimulationReceipt, sovereign sim-target compilers) but **cannot yet (1) STATE what a run is supposed to prove, (2) prove a SPACE, or (3) COMPOSE proofs** — the three things the north star names as the whole point ("execution constitutes the proof", "parametric", "composes").

The same keystone surfaced independently **four times under four names** (ContractClause / PreconditionInvariantBlock / contract-carrying-trait-DSL / PluginSolverContract): **a typed `preconditions → invariants → postconditions` clause set, authored in `.holo`/`.hsplus`, checked at construction / every-step / finalize, and CARRIED INTO the receipt as the witness.**

> Today a green CAEL receipt proves a run **HAPPENED**, not that it was **RIGHT** (`acceptance` is a freeform violation list; `ContractConfig` has `scaleEnvelope` but no pre/inv/post slot). **That is the looks-right trap living inside the proof substrate itself.**

The disciplined move is therefore **not "add verticals"** but **"build the three missing pieces of proof machinery in core-sovereign, then let every vertical extend the language as plugin-DATA that fills those typed slots."** Verticals (robotics kinematics/control, GD&T/fatigue, quantum/NIR/radio-astronomy provenance, behavioral action contracts) become downstream consumers of those slots — declarative contract data + a deterministic solver, never new core vocabulary. Everything render/skin is refused or fenced behind a substrate gate.

---

## Top 5 picks (start here, in dependency order)

1. **ContractClause** — typed `preconditions/invariants/postconditions` on `ContractConfig`, carried into the receipt. _The keystone_ (4 of 6 dimensions propose it). STRICT evaluator that refuses any expression not type-checkable against the declared schema (kills `inv: true` poison). `verified` becomes "zero error-severity clause violations". **Nothing else ships before it** — every other proof feature fills its slots. Effort **M**. First step: add the shape + `clauseViolations` to provenance; prove end-to-end on a QM convergence postcondition + a neuroscience firing-rate per-step invariant.

2. **Plugin dead-wire activation sweep (manifest-gated)** — ~73% of plugins (W.705) ship a real solver the runtime **never calls** (`registerPluginTraits` never wired) → a `.holo` scene using their traits computes nothing and carries zero proof. Scaffold `runtime.ts` per plugin from its `*solver.ts` + TRAITS (medical/energy-grid pattern), staged behind a `plugin.manifest.json` `autoRegister:true`, with a CI gate. Turns proof-carrying verticals from ~15 → potentially 56. Effort **L**. _Land the manifest schema FIRST or it produces 41 more bespoke patterns._

3. **ParameterEnvelope** — first-class valid-parameter domain that auto-re-discharges on remix ("prove the space, not the instance"; doctrine §5). Generic `{param,min,max,allowed,unit}` records (NEVER domain names — retires the `UNIT_RANGES` hardcode), `isInEnvelope()`, `onViolation: warn|error|redischarge`. Within-envelope remix inherits the proof; out-of-envelope re-discharges or flags honestly. Effort **M**.

4. **PluginKeywordRegistry** — runtime-injectable `.hs` verbs + AST node-types with a **family-conformance gate**. Converts today's hardcoded keyword dispatch (locomotion `move/turn`, cognitive `llm_call/recall`) into an append-only table; a new verb (`actuate`, `dose`, `measure_qubits`, `emit_gcode`) must map to an existing node-type FAMILY (bounds the table, prevents 53 micro-DSLs). The one seam that lets ANY vertical extend the language without forking core. Effort **M**.

5. **hash-policy two-tier module** — `fnv1a32` (local) / `sha256` (adversarial: HoloMesh multi-agent + on-chain anchor + QEC). Four hash variants drift today; a 64-bit receipt is trivially forgeable, and _a forgeable receipt is a forgeable proof_. Smallest effort, prerequisite-class importance. Effort **S**.

---

## Horizons

### H1 — now: forge the keystone proof machinery; stop the substrate from lying

- **ContractClause** (above) — the gate everything depends on.
- **Wire `onDetach`/`onEvent`** in core dispatch (declared at `TraitTypes.ts:20-22`, never called) — behind a characterization-flag (first-ever `onDetach` exercises untested cleanup). Prerequisite for postcondition discharge (happens at detach). Effort **S**.
- **hash-policy two-tier** (above).
- **ParameterEnvelope** (above).
- **Plugin dead-wire activation sweep** (above).
- **DimensionalTypeSystem** — SI-unit refinement types (`Float<kg>`, `Float<N>`, `Float<N/m>`) as a 6th CompilerSafetyPass; catches kg-vs-g sim-to-real failures at parse time across all 53 plugins, zero plugin code change. Generalizes the proven `@freshnessBound` checker. Lean4 mechanization deferred to paper-gate. Effort **M**.

### H2 — next: open the language to verticals WITHOUT forking core

- **PluginKeywordRegistry + node-type registration** (above).
- **Plugin contract discipline bundle** (one release): declarative `PluginSolverContract` (= ContractClause at plugin scope) + `plugin.manifest.json` + `SolverReceiptSchema` registry (closes freeform-resultSummary) + `StdlibPolicy` plugin-scope gate + `wrapSolverInContract` (plugin solvers inherit geometry-hash/fixed-dt/replay/CAEL). Effort **L**.
- **ProofCompositionLaw / ComposedReceipt** — Paper 29 algebraic-trust as runtime composition (violations union, accepted-iff-all, cross-scale projection, chained payloadHash). Domain-NEUTRAL (no "medical wins" in core). The third north-star pillar ("composes"); QM→MD→FEM gets a verified bridge. Default `paper29Satisfied:FALSE` until mechanized; label "composition-evidence" not "proof". Effort **L**.
- **KinematicChainTrait** — `@kinematic_chain` DH-parameter FK + damped-least-squares IK; receipt proves the tip stays in the workspace across a PARAMETRIC joint-angle sweep. Consolidate the 3 existing joint models into one canonical `JointDecl`. Effort **L**.
- **ControlLoopTrait** — `@control_loop(pid|mpc)` as the SSOT for control with a stability/settling receipt.

### H3 — frontier: parametric proof families (sequence LAST — deepest looks-right traps)

- **Parametric goals + `@assembly` mating constraints** — `goal name(params){when;achieve}` → a universally-quantified GOAPGoal (a dependent-type behavioral theorem over all entities/tolerances); assembly mating → USD PhysicsJoint + constraint-satisfaction receipt valid at every config in the sweep. Ship only after H1 ContractClause + H2 ActionContract validated.
- **LatentStateWorldModel** — `@worldModel` V-JEPA-2-style fast planner that is **explicitly SKIN**; the only substrate part is a HARD `divergence(latent, caelTrace) > maxDivergence` stop forcing fallback to full substrate sim. Highest skin-contamination risk; build only with the unconditional gate, never a paper substrate claim. Lowest priority.

---

## Plugin strategy

A vertical extends HoloScript by shipping **proof-carrying DATA into typed core slots, never by forking core code**:

1. **Core-sovereign owns ONLY domain-neutral machinery** — ContractClause, ParameterEnvelope, composition algebra, keyword/node-type/reaction-category registries, hash policy, dimensional checker, ContractedSimulation wrapper. **No domain noun** (retire `UNIT_RANGES`, the `EffectInference @goal_oriented→[]` gap).
2. **Every plugin ships** `plugin.manifest.json` + a declarative `PluginSolverContract` (pre/inv/acceptance as DATA, not a hand-written `verifyXxxAcceptance`) + a deterministic solver + a registered receipt schema — the slots core reads to reason about a plugin **without importing its TypeScript** (machine-introspectable by LSP / marketplace / Brittney).
3. **Domain vocabulary enters the LANGUAGE only through registry registration** (keyword verbs gated to a node-type family, ReactionCategory entries, InteractionVerb nouns) — grammar stays singular, vocabulary grows as data.
4. **Unify the two parallel registration systems** (`PluginLifecycleManager` sandbox vs `registerPluginTraits` runtime) into one activation path so `StdlibPolicy` capability-scoping + CapabilityBudget actually apply to solver code (else every plugin receipt has unbounded, unauditable inputs and breaks CAEL replay).
5. **Cross-plugin claims compose** through the structural composition law; domain conflict rules stay in each plugin's contract (core never knows "medical" exists).

Net: the plugin layer becomes the **vertical-extension vector**; proof-carrying verticals scale with manifests added, not core commits.

---

## Anti-goals (refuse by name — the looks-right/skin/redundant temptations)

1. **No new/extended render compilers** — R3F/Three/Babylon are being COLLAPSED; reject USD adoption that drags in Hydra render delegates (adopt only USD's LIVERPS arc/composition semantics).
2. **No latent world-model as substrate** — V-JEPA/neural world-models are looks-right by design; only admissible piece is a hard divergence-gate, never a paper substrate claim.
3. **No receipt that proves a run merely HAPPENED** — a green receipt with trivial invariants (`inv: simTime>=0`) is the deepest poison; require ≥1 non-trivially-falsifiable invariant or label it `execution-only`, not `verified`.
4. **No freeform-resultSummary receipts** that hash correctly but guarantee nothing (`bmi:99, accepted:true` is a valid receipt today) — gate behind the receipt-schema registry.
5. **No stub that returns PASS** — fatigue/fenicsx CAEL must hash the REAL solver output field, not an input echo; a DRY_RUN stub pollutes the proof tree.
6. **No certification theater** — `@rt_deadline` must statically refuse unbounded-WCET LLM paths; co-sim must enforce numerical stability before "proved"; gradient descent ≠ contract discharge.
7. **No scalar masquerading as GD&T** — `@tolerance` is a sovereign typed zone, not a dressed-up scalar.
8. **No domain vocabulary in core** — kill `UNIT_RANGES`; keyword-registry / envelope / composition-law never carry domain names.
9. **No fourth joint model / Nth bespoke plugin pattern** — consolidate, don't multiply.

---

## Verified (on disk, this session)

- `ContractConfig` (`packages/engine/src/simulation/SimulationContract.ts:787`) has `scaleEnvelope` but **no** `preconditions/invariants/postconditions` slot → the keystone gap is real.
- `onDetach`/`onEvent` (`packages/core/src/traits/TraitTypes.ts`) are **dead-wired** — `applyDirectives` calls only `onAttach`, `updateTraits` only `onUpdate` (independently confirmed).
- The behavioral layer (actions/movements/reactions + native LocomotionTrait, this session) is the first consumer-in-waiting of the ActionContract slot.

Full per-dimension findings (current state · gaps · proposals · external signals · risks) in the workflow transcript; this doc is the synthesis.
