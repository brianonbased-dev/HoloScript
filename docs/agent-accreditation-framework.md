# uAA2++ Agent Accreditation Framework (Draft)

Goal: agents should be “accredited” the same way serious professional systems are: **standards + evidence + auditability + renewal**.

This framework builds directly on what you just implemented in research:

- **Self-healing indexes** (`RESEARCH_INDEX.md`)
- **Strict validation** (external claims must have URLs)
- **Deep validation** (external claims must have at least one non-homepage Tier‑1 deep link)

## Why uAA2 Compression + uAA2++ makes this possible

Agent accreditation becomes practical when proof can be:

- **Stored cheaply** (compressed),
- **Recovered reliably** (decompressed without losing critical meaning),
- **Audited consistently** (the same checks pass later),
- **Upgraded over time** (renewal + drift control).

That’s the role of:

- **uAA2 Compression**: turns bulky runs (notes, sources, traces) into compact “evidence packs” that are still reviewable.
- **uAA2++ (6 phases)**: guarantees we don’t just collect facts—we produce standards-aligned artifacts:
  - **0.INTAKE**: raw capture (what exists, what to cite)
  - **1.REFLECT**: interpretations + decision points (what the signal means)
  - **2.EXECUTE**: runnable mapping/tables (what we will enforce)
  - **3.COMPRESS**: stable summaries (what is worth keeping long-term)
  - **4.GROW**: reusable rubrics/templates (how others/agents repeat it)
  - **5.EVOLVE**: policy upgrades (how the system raises the bar)

## Core idea: accreditation is a proof pipeline

An accredited agent is not “trusted because it says so.”
It is trusted because it can produce a **portable proof pack** showing:

- which standards it claims to meet,
- what evidence supports each standard,
- how that evidence was generated,
- and how results are monitored over time.

## Accreditation objects (what we certify)

- **Agent**: a specific implementation + configuration (code + version + agent.json + policies).
- **Capability**: a task class (e.g., “produce Phase 2 EXECUTE research with Tier‑1 deep links”).
- **Operation**: a repeatable workflow (inputs → outputs → checks), ideally CI-verifiable.

## Accreditation levels (suggested)

- **L0 — Unaccredited**: exploratory; no guarantees.
- **L1 — Documented**: has a declared scope + produces structured outputs.
- **L2 — Validated**: outputs pass automated validators (format/provenance).
- **L3 — Auditable**: outputs include evidence packs + reproducible traces (tool calls, inputs, versions).
- **L4 — Monitored**: ongoing drift/quality monitoring + renewal schedules.

## Standards model (how we define “meets requirements”)

Standards are written as **machine-checkable gates** where possible:

- **S.PROVENANCE.STRICT**: external research must include URLs in `## Sources`.
- **S.PROVENANCE.DEEP**: external research must include at least one deep link (non-homepage).
- **S.METADATA**: required metadata lines exist (Date, Protocol Phase, Sources).

As you add agent capabilities, extend standards with domain gates:

- **S.DOMAIN.TIER1**: at least N Tier‑1 sources per claim category.
- **S.LICENSURE.GATE**: for accreditation-linked professional doctorates, capture both gates:
  - accreditor standards, and
  - licensure exam/board eligibility.

## Evidence packs (what an agent must emit)

Minimum evidence pack for a run:

- **Run metadata**: agent version, config hash, timestamp, protocol phase(s) executed.
- **Artifacts**: produced files (research markdown, indexes).
- **Citations**: the exact deep links used (URLs captured in Sources).
- **Validation results**: strict/deep validator outputs + exit code.

### Compression rule (practical)

Evidence packs should be stored in a **compressed form by default**, but must remain audit-friendly:

- Preserve **source URLs** and **which claim they support**
- Preserve **validator outputs** (or a hash + reproducible re-run command)
- Preserve **version identifiers** (agent version, protocol version)

## Audit trail (how we make it reviewable)

Auditors should be able to answer:

- “What claim was made?”
- “Which source supports it?”
- “Can we re-run the validator and get the same result?”
- “Did the agent drift from standards?”

Operationally, this maps to:

- `npm run research:validate:strict`
- `npm run research:validate:strict:deep`
- periodic re-validation / re-indexing

## Renewal + drift control

Accreditation expires unless renewed.
Define renewal triggers:

- **Time-based**: re-run validation monthly/quarterly.
- **Change-based**: re-accredit on code/config changes.
- **Signal-based**: re-check when external sources change/break.

## Immediate next steps (practical)

1. Make every new external-facing research file start from the template:
   - `uAA2++_Protocol/templates/RESEARCH_TEMPLATE_EXTERNAL_TIER1_DEEP.md`
2. Treat `npm run research:validate:strict:deep` as the “accreditation gate” for research-capable agents.
3. Define 3–5 agent capabilities we want to certify first (small, testable).
