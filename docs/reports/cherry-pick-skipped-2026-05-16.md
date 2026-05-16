# Cherry-Pick Skipped Commits — HoloScript (2026-05-16)

Bulk cherry-pick session reconciled **242 local-only commits** from a divergent clone onto `origin/main` (post `69653383b` MCP hololand fix).
**107 applied cleanly and pushed (commit range `69653383b..6fc17a8d5`). 135 skipped due to file-level conflicts with origin's parallel work.**

The skipped commits remain on the local `main` of the originating clone (`C:/Users/Josep/Documents/GitHub/HoloScript`). Each needs **manual triage** — for each, decide whether the local version, origin's version, or a merge of both is the right content. The user chose "manual per file" resolution for conflicts.

## Conflict density: 56% of local commits hit conflicts

This is high because origin had ~125 parallel commits heavy on:
- **`packages/secrets-broker/`** (full sovereign-primitive build-out on origin — local had earlier seed)
- **`packages/mcp-server/src/hololand-*.ts`** (Twin Earth substrate evolution on origin)
- **`packages/core/src/legacy-exports.ts`**, `tsconfig`, `package.json` (dep churn)
- **`research/paper-audit-matrix.md`** (daily audit-cron file)
- **`scripts/canary-harness.mjs`** + **`scripts/__tests__/`** (canary reliability work)
- **`docs/cross-language-deletion-ledger.md`**, **`SURFACES.md`**, **`docs/packages/*`** (architecture doc churn)

## Skipped commits by topic cluster

### Cluster 1: secrets-broker (8 commits)
Origin shipped a more advanced secrets-broker. Local has an earlier branching design.
- `e56d217f6` — CapabilityTokenRegistry — storage layer
- `e3a3bdb7f` — integrate secret-grant primitives + capability-token scaffold
- `dc9815ea7` — HoloMesh server routes for mint/verify/revoke/device-flow
- `0be49edcc` — protocol commercialization layer (D.013)
- `3196030d6` — Studio Verify page for device-flow verificationUri
- `3c8b5c610` — GitHub OAuth device-flow integration (S-6)
- `5991f8d2e` — optional auth gate on holo_secrets_* handlers
- `27dc276f7` — wire /mobile-brief endpoint to consume capability token

### Cluster 2: hololand-mcp-tools (12+ commits)
Origin evolved Twin Earth substrate; local has earlier hololand consolidation.
- `e22d91ed1` — consolidate world CRUD + MMO + Twin Earth tools
- `5312f8f49` — sovereign Twin Earth robot/AI tool family
- `c11c0f76e` — define Twin Earth substrate contract for robot/AI monopoly
- `7e5d0ba97` — native proof slice: integrate evaluateActuation into HoloLand MCP
- `4434bc4fb` — HoloLand fork admission gate (task_1778619015439_l51b)
- `f6352d5e7` — sovereign Twin Earth robot/AI tool family
- `63f2946aa` — Brittney/NPC sovereign tools across local BYOK managed modes
- `9f63949bf` — [canary] fix HoloLand agent canary tests — envelope gating + zone status persistence
- `a4178da1a` — [canary] fix HoloLand agent canary tests
- `b17a7b0b3` — PackageProvenance + ArtifactReceiptBody validators
- `1b1796145` — security(secrets): SigningContext through holo_secrets_* dispatch chain
- Plus more in `packages/mcp-server/src/__tests__/hololand-agent-canary.test.ts`

### Cluster 3: canary-harness reliability (multiple commits)
- `b781c004c` — reliability improvements — retries, batch concurrency, secret-leak fix
- `055f2ddff` — ci(canary): GitHub workflow for MCP/REST/A2A/CLI canary harness
- `dfbfd7043` — eliminate probe-shape-bias for external surfaces

### Cluster 4: deletion-ledger + package docs (multiple commits)
- `2d973ec9c` — 52-root package-disposition ledger
- `1ec3fa165` — correct 3 misclassifications
- `a6a50b09d` — gap-fill HoloMap, HoloGram, Moltbook, Knowledge store, HoloMesh API
- `e14091e85` — remove 14 orphan doc-index entries
- `9430081f8` — archive deleted-package docs and fix remaining stale references

### Cluster 5: paper-audit-matrix + papers (multiple commits)
Same daily-cron collision pattern as ai-ecosystem.

### Cluster 6: misc — handlers.ts, board, hooks (remaining)

## Recommended next session

For each conflict cluster, in a focused triage session:
1. **Decide policy per cluster first** (e.g., "origin's secrets-broker is canonical; drop local's secrets-broker commits") to avoid per-commit decision fatigue.
2. For "drop local" decisions: just mark the local commits as superseded in a memo, no further action.
3. For "merge needed" decisions: manually rebuild the file taking the best of both, then commit on `origin/main`.
4. Once all clusters resolved, the local `main` can be safely reset to `origin/main`.

Full picker log with all 135 skip entries + file lists: `C:/tmp/holoscript-cherry-log.txt`
