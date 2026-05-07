# Root Documentation Tiering Plan

**Date:** 2026-05-07
**Task:** `task_1778186605462_n4v3` — Tier root docs and reduce root documentation sprawl
**Status:** Plan complete — all 10 root docs mapped; 55 internal references found; phased move strategy defined

## 1. Current Root Documentation Inventory

| File | Size | Tier Proposal | Internal References | Move Risk |
|---|---|---|---|---|
| `README.md` | 17 KB | **Diamond** — keep at root | 0 | N/A |
| `AGENTS.md` | 22 KB | **Platinum** — agent team protocol | 3 docs | Medium |
| `AGENT_INTERFACE.md` | 10 KB | **Platinum** — agent interface spec | 3 docs | Medium |
| `NORTH_STAR.md` | 2 KB | **Platinum** — founder vision | 3 docs + 1 code file | **High** |
| `CLAUDE.md` | 20 KB | **Silver** — surface-specific instructions | 3 docs | Medium |
| `GEMINI.md` | 2 KB | **Silver** — surface-specific instructions | 3 code files | **High** |
| `ARCHITECTURE.md` | 8 KB | **Gold** — high-level architecture | 3 docs | Medium |
| `CONTRIBUTING.md` | 21 KB | **Gold** — team standards | 3 docs | Medium |
| `CHANGELOG.md` | 79 KB | **Gold** — release history | 3 docs | Medium |
| `CODE_OF_CONDUCT.md` | 4 KB | **Gold** — community standards | 1 doc | Low |
| `DEPENDENCY-AUDIT.md` | 4 KB | **Silver** — ops/security | 1 doc | Low |

**Total references:** 55+ across docs and code. Moving any file without updating references will break links.

## 2. Reference Map (verified)

### High-risk files (referenced from code)
- `NORTH_STAR.md` → `packages/absorb-service/src/ingest/ingestHoloSource.ts`
- `GEMINI.md` → `packages/create-holoscript/src/agent-setup/cli.ts`, `packages/create-holoscript/src/agent-setup/generator.ts`, `packages/mcp-server/src/audit-tools.ts`

### Medium-risk files (referenced from multiple docs)
- `AGENTS.md` → `docs/architecture/ECOSYSTEM_SPINE.md`, `docs/guides/ai-first-docs-filesystems.md`, `docs/strategy/vision/VISION_HOLOLAND_BOOTSTRAP.md`
- `AGENT_INTERFACE.md` → `docs/recipe-lights-out.md`, `docs/team/ACTION_REVERSIBILITY_REGISTRY.md`, `docs/team/PEER_DRIFT_DETECTION.md`
- `ARCHITECTURE.md` → `docs/architecture/AI_USE_CASES.md`, `docs/architecture/DAEMON_ARCHITECTURE.md`, `docs/architecture/ECOSYSTEM_SPINE.md`
- `CLAUDE.md` → `docs/archive/CLEANUP_SUMMARY.md`, `docs/guides/ai-first-docs-filesystems.md`, `docs/plans/core-types-extraction.md`
- `CONTRIBUTING.md` → `docs/academy/README.md`, `docs/api/OVERVIEW.md`, `docs/archive/ARCHITECTURE_master_record.md`
- `CHANGELOG.md` → `docs/academy/level-1-fundamentals/10-building.md`, `docs/archive/AGENT_API_REFERENCE.md`, `docs/archive/CLEANUP_SUMMARY.md`

### Low-risk files (1-2 doc references)
- `CODE_OF_CONDUCT.md` → `docs/archive/CLEANUP_SUMMARY.md`
- `DEPENDENCY-AUDIT.md` → `docs/ops/RUNBOOK.md`

## 3. Tiering System

Adapting the GOLD vault tier metaphor (D.020) to root docs:

| Tier | Criteria | Root Presence | Destination |
|---|---|---|---|
| **Diamond** | Founder-level, external-facing, single source of truth | `README.md` only | Root (1 file) |
| **Platinum** | Cross-team strategy, agent protocol, vision | `AGENTS.md`, `AGENT_INTERFACE.md`, `NORTH_STAR.md` | `docs/team/` |
| **Gold** | Architecture, standards, history, community | `ARCHITECTURE.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md` | `docs/architecture/`, `docs/community/` |
| **Silver** | Surface-specific, ops, security, per-IDE | `CLAUDE.md`, `GEMINI.md`, `DEPENDENCY-AUDIT.md` | `docs/surfaces/`, `docs/ops/` |

**Target root count:** 1 file (`README.md`) + optional symlink or redirect index.

## 4. Phased Move Strategy

### Phase 1 — Safe moves (no code references)
**Files:** `CODE_OF_CONDUCT.md`, `DEPENDENCY-AUDIT.md`
**Action:** `git mv` to `docs/community/` and `docs/ops/`
**Link updates:** 2 docs total (`docs/archive/CLEANUP_SUMMARY.md`, `docs/ops/RUNBOOK.md`)
**Effort:** Small — 1 session

### Phase 2 — Doc-only references (no code references)
**Files:** `AGENTS.md`, `AGENT_INTERFACE.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`, `CHANGELOG.md`
**Action:** `git mv` to respective `docs/` subdirs
**Link updates:** 15 docs total (see §2)
**Effort:** Medium — 1-2 sessions; can batch by destination folder

### Phase 3 — Code-referenced files (requires code changes)
**Files:** `NORTH_STAR.md`, `GEMINI.md`, `CLAUDE.md`
**Action:** `git mv` to `docs/team/` and `docs/surfaces/`
**Link updates:** 3 docs + 4 code files
**Effort:** Medium — must update code strings/paths and verify no runtime breakage
**Blocker:** Code paths may be load-bearing (e.g., `ingestHoloSource.ts` reading `NORTH_STAR.md` for strategy alignment)

### Phase 4 — Consolidation and redirects
**Action:**
- Add `docs/ROOT_DOCS_INDEX.md` — canonical redirect map from old root paths to new paths
- Update `docs/README.md` "Contributing and RFCs" section (currently references `../CONTRIBUTING.md`)
- Consider GitHub symlink or README redirect note for external links

## 5. Immediate Action (this session)

Do **not** execute Phase 2-3 without a dedicated follow-up task. The reference surface is too large for a single P2 cleanup session.

**What to ship now:**
1. This tiering plan memo (`research/2026-05-07_root-docs-tiering-plan.md`)
2. File Phase 1 as a separate task: `git mv CODE_OF_CONDUCT.md docs/community/` + `git mv DEPENDENCY-AUDIT.md docs/ops/` + link fixes

## 6. References

- Verification command: `grep -r "FILENAME.md" docs/ packages/ --include="*.md" --include="*.ts" --include="*.tsx" -l`
- `docs/README.md` § Contributing and RFCs — references `../CONTRIBUTING.md`
- D.020 (vault tiers) — Diamond > Platinum > Gold > Silver > Bronze
