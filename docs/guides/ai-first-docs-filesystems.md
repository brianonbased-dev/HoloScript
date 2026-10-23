# AI-First Docs and Filesystems

> Status: active | refreshed 2026-10-23
> Purpose: Define how HoloScript docs and repository layout should be shaped for agent retrieval, verification, and action.
> Source of truth: This guide, [NUMBERS.md](../NUMBERS.md), [AGENTS.md](../../AGENTS.md), and [CLAUDE.md](../../CLAUDE.md).
> Verify: `pnpm docs:roadmap:drift` and `pnpm audit:red-flags`
> Next agent action: Use this checklist before adding or reorganizing docs, package READMEs, manifests, generated artifacts, or roadmap pages.

HoloScript docs and filesystems are agent interfaces first. Humans should still be able to read them, but the primary design target is an agent that needs to locate truth, verify it, change the right file, and leave behind a stable trail for the next agent.

## Contract

- Every active doc starts with purpose, status, source of truth, verification command, and next agent action.
- Every active directory has an entrypoint: `README.md`, `index.md`, manifest, or generated artifact header.
- Prefer machine-readable summaries when a page is likely to be retrieved by agents: frontmatter, a `## Machine Summary` block, tables, stable IDs, or explicit checklists.
- File names use lowercase, stable nouns unless the repo already preserves a legacy uppercase convention.
- Directories encode domain and ownership. Generated, archived, vendored, and hand-written content must be distinguishable from the path or entrypoint.
- Live mutable counts live in [NUMBERS.md](../NUMBERS.md), not scattered prose.
- Roadmaps and plans cite current source files, name verification commands, and end with `## What Remains After This Plan`.
- Avoid duplicate canonical docs. If a second page exists for discoverability, it should point to the canonical page.
- Generated artifacts identify their generator and regeneration command.
- Docs describe paths and commands, not only concepts.

## Directory Shape

| Path                   | AI-first contract                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `docs/guides/`         | Operational guides for humans and agents. Pages should include direct commands and next actions.                       |
| `docs/architecture/`   | Stable invariants and system contracts. Avoid dated implementation claims unless they include verification.            |
| `docs/strategy/`       | Current strategy and roadmap lanes. Use dated refresh notes and source links.                                          |
| `docs/archive/`        | Historical plans and frozen notes. Do not treat as active truth without Dreaming/re-intake.                            |
| `docs/packages/`       | Package reference and API entrypoints. Link to package-local READMEs where possible.                                   |
| `packages/*/README.md` | Local package entrypoint: purpose, exports, commands, generated outputs, and owner surface.                            |
| `scripts/*`            | Executable checks and maintenance tools. Scripts that enforce docs policy should be linked from the docs they protect. |

## Red Flag Audit

Run `pnpm audit:red-flags` when you need a capped report of hidden problems before changing docs, filesystem layout, or shared source. It reports focused/skipped tests, automatic TypeScript remediation comments, type suppressions, work markers, hardcoded live counts, missing top-level directory entrypoints, and uppercase active guide filenames.

The command is report-only by default because the current backlog is not zero. Use `node scripts/check-red-flags.mjs --json` for agent ingestion and `node scripts/check-red-flags.mjs --fail-on=critical` when a branch is ready to make critical findings blocking.

## Required Active Doc Header

Use this shape for active docs that guide future work:

```md
> Status: active | refreshed YYYY-MM-DD
> Purpose: One sentence describing why this file exists.
> Source of truth: Canonical files, services, or generated data this page depends on.
> Verify: `command-that-proves-this-is-current`
> Next agent action: The first useful action an agent should take from this page.
```

## Filesystem Checklist

- Can an agent identify the canonical entrypoint for this directory without reading every file?
- Does the path separate active work from archive, generated output, fixtures, or scratch files?
- Does the entrypoint say which files are safe to edit by hand?
- Does the entrypoint say which commands regenerate derived files?
- Does the entrypoint name the verification command that should run before commit?
- Does the page avoid hardcoded ecosystem counts unless it points to [NUMBERS.md](../NUMBERS.md)?

## Agent Retrieval Checklist

- Put source-of-truth links near the top.
- Use headings that match likely search queries.
- Include exact file paths and commands.
- Keep status and date visible without requiring prose archaeology.
- Preserve stable IDs for wisdom, patterns, gotchas, tasks, RFCs, and generated records.
- Put stale or speculative material in archive paths, not active guide paths.

## Where docs go (cross-repo)

One home per kind. Statuses: **ruled 2026-10-23 by CoS** = decided; **Hardware-proposed, pending** = not yet ruled; **existing** = already canon elsewhere.

| Kind | Home | Status |
|---|---|---|
| Repo docs (guides, references) | that repo's `docs/` | existing |
| Handbooks (founder ops) | `ai-ecosystem/docs/handbooks/` | existing |
| Decisions | `C:\holo-dev\decisions\` (`YYYY-MM-DD_<slug>`) | existing |
| Durable research reports | `C:\holo-dev\research\` (`-YYYYMMDD` suffix) | existing |
| Run debris (laptop) | repo `.scratch/` only, per `agent-storage-lanes.md` | existing |
| Cards | `C:\Users\josep\Documents\grok-cards` | ruled 2026-10-23 by CoS |
| Specs | `Documents\holo-specs` (`-YYYYMMDD`); moves into a repo by PR once accepted | ruled 2026-10-23 by CoS |
| Idea seeds | `C:\holo-dev\idea-seeds` (`YYYY-MM-DD-<slug>`); Idea bot writes only | ruled 2026-10-23 by CoS |
| Vision | `Documents\vision` for now; CVO decides final home later | ruled 2026-10-23 by CoS |
| Jetson receipts | `/mnt/nvme/holo/receipts/<lane>/YYYYMMDD-<slug>.md\|json` | Hardware-proposed, pending |
| Jetson scratch | `/mnt/nvme/holo/scratch/<lane>/` | Hardware-proposed, pending |

Rules:

- Names follow `C:\holo-dev\ai-ecosystem\HOLON.md`; do not invent new lanes. Laptop root lanes are fixed by `C:\holo-dev\config\laptop-canon-contract.json` (`developmentLayout`).
- To make a doc discoverable in the holon registry, link it from a generator source (venture file, repo `AGENTS.md`, `holorepo.config.json` `taskProducer.sourcePaths`, or a worktree `README.md`/`AGENTS.md`), then regenerate with `scripts/gen-holon-registry.mjs`. Never hand-edit `config/holon-registry.json`; a missing linked file becomes a conflict.
- Create / move / rename / retire an agent-facing doc: update its row in `ai-ecosystem/AGENT_FILES/catalog.md` in the same PR. Moves and deletes go by PR, never in place.

Open item (Hardware / CoS): Hardware proposed `C:\Users\josep\.scratch\<lane>` for Work. Not ratified: it conflicts with `agent-storage-lanes.md`, where repo `.scratch/` is the only run-debris lane.
## What Remains After This Plan

- Promote the red-flag audit from report-only to a strict gate after the existing backlog is triaged.
- Decide whether active docs should standardize on blockquote headers, YAML frontmatter, or both.
- Sweep legacy uppercase guide filenames and either preserve them as explicit legacy aliases or migrate them to lowercase routes.
