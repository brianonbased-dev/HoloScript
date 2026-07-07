# DONE Claim Revalidation

Completion claims are evidence snapshots, not durable truth. A document, board
task, receipt, or release note that says "done", "complete", "ready", "current",
or "production-ready" is only current if the relevant proof has been rerun
against the present repo, service, registry, and external source state.

Use this workflow before promoting old work, updating strategy, publishing
registry packages, citing a paper status, or telling another agent that a
surface is finished.

## Evidence Order

1. **Current git state**: the working tree and latest commit beat old session
   notes, archive docs, screenshots, and board summaries.
2. **Canonical source**: package manifests, service routes, tests, docs, and
   generated receipts beat marketing copy and implementation summaries.
3. **Live service or registry**: npm, PyPI, MCP health, Railway, and hosted APIs
   beat local assumptions when the claim depends on deployed state.
4. **Official external source**: standards, SaaS APIs, venue deadlines, library
   behavior, and platform rules must be checked from current primary sources
   before the claim is reused.
5. **Archive docs**: archived completion docs are historical evidence only.

## Revalidation Procedure

For each claim:

1. Extract the exact claim and verb. Examples: "production-ready", "all tests
   passing", "GraphRAG authoritative", "paper complete", "published".
2. Identify the live owner. Examples: package export, service route, MCP tool,
   registry package, paper `.tex`, benchmark report, or external standard.
3. Run the current verification command. Prefer existing gates over ad hoc
   checks.
4. Check the false case. A PASS is weak if it only proves a stub, fallback, or
   tautology.
5. Update the canonical doc with one of:
   - `current`: verified in this pass, with command or source.
   - `current with caveat`: works, but scoped.
   - `stale snapshot`: historical only; rerun required.
   - `overclaimed`: wording exceeded the implementation.
   - `blocked`: exact missing proof or dependency.

## Minimum Gates By Surface

| Surface                   | Minimum current proof                                                                                                                                                                                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm package publication   | `corepack pnpm run check:npm-v1-release` plus package consumption gates.                                                                                                                                                                                                                          |
| PyPI package publication  | `corepack pnpm run check:pypi-consumption` and `corepack pnpm run check:pypi-extras-resolution`.                                                                                                                                                                                                  |
| Absorb unification        | `@holoscript/absorb-service/gev` export exists, service code stays thin, new consumers avoid shadow GraphRAG/embed packages, and package build/test gates pass.                                                                                                                                   |
| Hardware app readiness    | `node scripts/holo-ci/check-hardware-app-envelopes.mjs` passes, `node scripts/holo-ci/capture-hardware-telemetry.mjs --summary` emits a current receipt, then live HoloShell/Jetson/Vast/hosted receipts are ingested with `--receipt` or `--receipt-dir` to prove the actual machine or service. |
| MCP/codebase intelligence | cache freshness checked first; local-vs-hosted authority is named; production tool list or local adapter verified.                                                                                                                                                                                |
| Simulation proof          | solver API proof is separated from scientist-facing product readiness; parameter envelope and replay receipt status are named.                                                                                                                                                                    |
| Paper status              | `.tex`, sidecars, current audit matrix, and official venue dates are regenerated or rechecked.                                                                                                                                                                                                    |
| HoloKey/identity          | custody, secret broker, x402, and KEK paths are verified without writing secrets into docs or command arguments.                                                                                                                                                                                  |

## Documentation Rules

- Do not replace a stale claim with a vague warning. Name the proof that is
  missing.
- Do not use archived `COMPLETE` or `READY` docs as canonical status.
- Do not update counts or registry/package status by hand. Point to the command
  or source of truth.
- If an external fact is part of the claim, re-research it from a current
  primary source before restating it.
- If a claim is overbroad but the underlying work is real, tighten the claim and
  add the next buildable gap.

The objective is not pessimism. It is making "done" mean "still true under the
current evidence path."
