# Novelty Kill-Test Sampling Method

Date: 2026-05-25
Task: task_1779744793933_qvi0
Status: prep method, not a submission claim

This memo defines the first sampling pass for program-wide novelty
defensibility. It does not ask for founder approval because preparation is not
submission. Founder approval is required only before an external submission,
public novelty claim, or venue upload.

## Gate Being Enforced

The paper program currently distinguishes novelty language from novelty
defensibility. `research/paper-audit-matrix/front-matrix.md` gap 5 says the
front matrix only sees whether papers use novelty language. It does not verify
exact claim scope, external-corpus comparison, shipped artifacts, or named
kill-test prior art. `docs/definitions/04-architecture-concepts.md` defines
novelty at the claim level: a material, enabled, non-obvious delta from public
prior art, backed by a shipped or reproducible mechanism and a named artifact
that would falsify the claim if found.

The operational rule for this audit is:

> A claim is killed iff a prior-art artifact matching exact-scope +
> external-comparison + shipped/reproducible artifact is found.

If the pass does not find such an artifact, the claim does not become "novel."
It only survives this bounded pass.

## Sampling Order

Sample these papers first, in order:

| Order | Paper | Why first | Primary kill surface |
|---:|---|---|---|
| 1 | Paper 36: HoloScript Conjecture Engine | Highest current novelty ambiguity. The local matrix already names LeanConjecturer, AlphaEvolve, and FunSearch as near-neighbor systems; the engine/generate leg shipped, while the render leg is still an honest gap. | Any public system that binds discovery, proof/probe, rendered geometry, and deterministic receipts under one evaluator. |
| 2 | Paper 34: Differentiable + Neural Surrogate + SimContract Receipts | The seed already names PhysicsNeMo, Newton, DiffTaichi, and FNO as kill-test prior-art classes. This makes it a clean early calibration row. | Any prior artifact that binds source solver, learned checkpoint, training corpus, differentiable trace, V&V envelope, and consumed receipt. |
| 3 | Paper 19: Trait Inference | The gated matrix explicitly says novelty is undefined versus LLM-tagging baselines. Undefined novelty is higher priority than weak novelty. | Any LLM-based annotation or program-understanding system that already hits the same `.hsplus` trait target, held-out evaluation, and production corpus loop. |
| 4 | Paper 21: Adversarial Trust Injection | Security reviewers will search for prior attack/defense taxonomies aggressively. The paper has shipped measurement scaffolding, so the risk is claim breadth rather than artifact absence. | Any MCP/tool-use trust-chain attack paper that already covers the same attack classes and deployed defenses with measured efficacy. |
| 5 | Paper 12: HoloLand | Main-program paper with HoloLand/HoloShell scope pressure and I3D venue fit. It needs exact wording around scene composition, OS-layer evidence, and what is only a prototype. | Any spatial authoring or scene-composition system that already provides the same semantic source, runtime receipts, user-study evidence, and headset/world artifact. |

If any of the first two papers are killed or heavily narrowed, pause the sweep
and update the method before sampling the remaining three. If both survive with
only narrow wording changes, continue through the list.

## Per-Claim Search Procedure

Do this at the claim level, not the paper-title level.

1. Extract the minimum claim.
   - Mechanism: what actually runs.
   - Operative relationship: which pieces are bound together.
   - Artifact: committed file, command, receipt, benchmark, trace, or paper
     bundle path.
   - Evidence envelope: CAEL, SimulationContract, Base/OTS, receipt, harness,
     user study, or other reviewer-visible proof.
   - Exclusion target: the exact prior-art artifact that would kill the claim.

2. Split the claim into searchable atoms.
   - Exact phrase: paper/system names and distinctive terms.
   - Component phrases: each material element.
   - Relationship phrases: "with", "under", "verified by", "receipt",
     "replay", "contract", "falsification", "provenance", as applicable.
   - Known near-neighbors from the local matrix or paper bibliography.
   - Negative controls: generic claims that should return many false positives.

3. Search the four mandatory databases and record the top results.

| Database | Use it for | Required query shape | Evidence to capture |
|---|---|---|---|
| arXiv API | Recent preprints, fast-moving ML/math/systems/physics claims. Official docs: https://info.arxiv.org/help/api/user-manual.html | `search_query` over exact names, title/abstract terms, and atom combinations; use `start`, `max_results`, and relevance/date sorting. | arXiv id, title, date, query URL, and why each top hit matches or does not match the exact scope. |
| DBLP search API | CS venue coverage, conference lineage, author/system names, and CoRR records. Official docs: https://dblp.org/faq/How+to+use+the+dblp+search+API.html | `https://dblp.org/search/publ/api?q=<terms>&format=json&h=<n>` for exact names and atom clusters. | DBLP key, venue/year, DOI/ee URL, type, and whether the result is peer-reviewed or CoRR-only. |
| OpenAlex Works API | Broad cross-domain coverage, DOI graph, concept drift, and citation neighborhoods. Official docs: https://developers.openalex.org/api-reference/works | Works search by exact name first, then atom clusters; use work ids and DOI fields to de-duplicate arXiv/DBLP hits. | OpenAlex id, DOI, title, year, name-collision notes, and related/cited-by follow-up target. |
| Semantic Scholar Graph API | Semantic near-neighbor search, corpus ids, abstracts, and citation context. Official docs: https://api.semanticscholar.org/api-docs/graph | Paper search for exact names, then semantic atom clusters; capture rate limits as under-resolved evidence rather than skipping the database. | Corpus id, paper id, title/year, external ids, abstract snippet if available, and citation-neighborhood follow-up. |

4. Use the database order by claim type.

| Claim type | First pass order | Reason |
|---|---|---|
| Formal methods, PL, theorem proving | DBLP -> arXiv -> OpenAlex -> Semantic Scholar | Venue lineage and CoRR coverage matter before broad graph search. |
| Systems, security, provenance, tool-use | DBLP -> Semantic Scholar -> OpenAlex -> arXiv | Security reviewers care about venue work and citation neighborhoods; arXiv catches fresh systems. |
| Graphics, VR/AR, HoloLand, interaction | DBLP -> Semantic Scholar -> OpenAlex -> arXiv | I3D/SIGGRAPH/CHI lineage first, then cross-domain spatial computing. |
| ML, learned models, data generation | Semantic Scholar -> arXiv -> OpenAlex -> DBLP | Semantic neighbors and preprints are the fastest-moving surface. |
| Quantum, physics, chemistry, numerical methods | arXiv -> OpenAlex -> Semantic Scholar -> DBLP | arXiv and DOI graph coverage dominate; DBLP catches CS overlap. |

5. Decide the verdict.
   - `killed`: a prior artifact matches the exact claim scope, external
     comparison, and shipped/reproducible artifact enough to subsume the claim.
   - `survives`: no matching artifact appears in the bounded search. This is
     not a novelty claim; it is only a search result.
   - `survives-narrowed`: prior art overlaps strongly, but a defensible smaller
     claim remains.
   - `under-resolved`: the database was rate-limited, inaccessible, ambiguous,
     or lacked abstracts/full metadata needed for a reviewer-grade decision.

## Evidence Row Format

Every sampled paper gets one row per claim. Keep the record falsifiable and
machine-diffable:

```yaml
paper: "Paper 36: HoloScript Conjecture Engine"
claim_id: "P36.C1"
minimum_claim_scope: ""
holoscript_artifact:
  paths: []
  commit_or_receipt: ""
evidence_envelope: ""
kill_target: ""
databases:
  - name: "arXiv"
    date_utc: "2026-05-25"
    queries: []
    top_hits:
      - title: ""
        id_or_url: ""
        year: ""
        include_reason: ""
        exclude_reason: ""
  - name: "DBLP"
    date_utc: "2026-05-25"
    queries: []
    top_hits: []
  - name: "OpenAlex"
    date_utc: "2026-05-25"
    queries: []
    top_hits: []
  - name: "Semantic Scholar"
    date_utc: "2026-05-25"
    queries: []
    top_hits: []
verdict: "killed | survives | survives-narrowed | under-resolved"
kill_artifact: ""
surviving_delta: ""
required_wording_change: ""
next_action: ""
reviewer_risk: "low | medium | high"
```

The `kill_artifact` field is required for `killed`. The `surviving_delta` and
`required_wording_change` fields are required for `survives-narrowed`.

## Worked Example: Paper 36

### Minimum Claim

`P36.C1`: HoloScript Conjecture Engine aims to bind candidate generation,
machine probe/proof obligation, rendered geometry, and deterministic receipts
under one HoloScript semiring evaluator. The claim is not "AI discovers math."
It is the narrower discover/probe/render/receipt operative relationship.

Current local status from the gated matrix: engine, runner, and GENERATE leg
have shipped; generated suites pass; receipt-carrying geometry uses
deterministic invariant probes; the render leg is still unbuilt and blocked on
a JS SDF evaluator. Therefore this claim cannot be submission-ready until the
render artifact exists.

### Queries Run

Date: 2026-05-25.

| Database | Query | Result summary |
|---|---|---|
| arXiv | `all:"LeanConjecturer" OR all:"FunSearch" OR all:"AlphaEvolve"` | Top hits included `AlphaEvolve: A coding agent for scientific and algorithmic discovery` (`arXiv:2506.13131`), `LeanConjecturer: Automatic Generation of Mathematical Conjectures for Theorem Proving` (`arXiv:2506.22005`), `ImprovEvolve` (`arXiv:2602.10233`), and AlphaEvolve derivative/improvement papers. |
| DBLP | `LeanConjecturer` | One CoRR hit: `LeanConjecturer: Automatic Generation of Mathematical Conjectures for Theorem Proving`, DOI `10.48550/ARXIV.2506.22005`. |
| DBLP | `AlphaEvolve` | Nine hits. Relevant hits include the AlphaEvolve CoRR paper (`abs/2506.13131`) and derivative works such as Magellan, ImprovEvolve, and hardware/matrix-multiplication implementations. |
| DBLP | `FunSearch` | Three hits, including FunBO and selection-operator synthesis works using FunSearch. |
| DBLP | `LeanConjecturer FunSearch AlphaEvolve` | Zero hits. This is useful as a negative control only; the combined query is too strict to prove absence. |
| OpenAlex | `AlphaEvolve` | Top hits included a name-collision finance paper from 2021, the AlphaEvolve 2025 arXiv work, AlphaEvolve improvement papers, and a 2026 FHE-on-TPU adaptation. Name collisions must be excluded explicitly. |
| Semantic Scholar | `LeanConjecturer FunSearch AlphaEvolve` | One broad hit: `Effective Harness Engineering for Algorithm Discovery with Coding Agents` (2026). Exact follow-up queries returned API 429 rate-limit responses, so this database remains under-resolved for the example row. |

### Verdict

Verdict: `survives-narrowed`, with `under-resolved` attached to the Semantic
Scholar leg.

No bounded-search hit above kills P36.C1 because the hits cover one or two
neighboring legs: conjecture generation, algorithm discovery/evolution, harness
engineering, or downstream implementations. The pass did not find a prior
artifact that binds all four material elements in the same operative
relationship: generation, probe/proof obligation, rendered geometry, and
deterministic receipt under one HoloScript-like evaluator.

The claim must still be narrowed before submission:

- Do not claim general automated mathematical discovery.
- Do not claim Lean-tier proof unless Paper 22 artifacts are explicitly in the
  evidence envelope.
- Do not claim the render leg until the JS SDF/receipt-manifold artifact ships.
- State the kill target as: any public system that already combines
  LeanConjecturer/FunSearch/AlphaEvolve-style discovery with proof/probe,
  receipt-carrying rendered geometry, and replayable deterministic evidence in
  one evaluator.

Required next action: after the render leg exists, rerun the four-database pass
with exact strings for "receipt-carrying geometry", "executable conjecture",
"proof-carrying SDF", "conjecture generation rendering", "deterministic
geometry receipt", and the final artifact names. If that pass still survives,
write the result into the paper's reviewer evidence table with URLs and
retrieved metadata.

## Output Of The First Sweep

The first sweep should produce:

1. One filled YAML row per sampled claim.
2. A short claim-wording patch for each `survives-narrowed` row.
3. A kill list for any `killed` row, including the exact prior-art artifact and
   which material elements it subsumes.
4. A retry list for any `under-resolved` database call, especially Semantic
   Scholar rate limits or missing abstracts.
5. A program-level decision: expand to all papers, patch only sampled claims,
   or stop because the sampling method found a systematic overclaim.
