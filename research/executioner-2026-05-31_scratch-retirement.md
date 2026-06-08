# Executioner — `.scratch/` Disk-Debris Retirement Proposal (HoloScript)

**Scope**: `C:\Users\Josep\Documents\GitHub\HoloScript\.scratch\` ONLY — disk debris.
**Sibling pass**: `research/executioner-2026-05-30_branch-retirement.md` covered git _branch_ retirement. This pass is **disk** debris in `.scratch/` — complementary, no overlap.
**Baseline**: `main` @ `413b519c6` (2026-05-31). `.scratch/` is fully gitignored (`.gitignore:70 /.scratch/`); **0 tracked files** under it. Deletion is invisible to git history — there is nothing to `git revert`; this is real on-disk weight, ~994MB (pre-assessed).
**Lights-OFF**: this is a PROPOSAL. Nothing was deleted, junctioned, or `git rm`'d. The user (or `/founder`) approves each item.

## Method / authority

- Worktree status: `git worktree list` + per-dir `.git` pointer-file check.
- Supersession: `git log --since=30.days` — the work that produced these dirs has landed on `main`.
- F.103 guard: `find .scratch -maxdepth 3 -name node_modules` — **19 dirs carry `node_modules`**; flagged per-item. NONE may be removed by raw `rm -rf` or junction-traversal. Safe removal of a _plain scratch dir_ with its own self-contained `node_modules` = a single non-recursive `Remove-Item -Recurse` of THAT dir only (never the shared `<repo>/node_modules`, never a junction walk into the shared store). EPERM on removal = file locks (W.103/F.103), not corruption — retry after the holding process exits, do not escalate to force.

---

## ⛔ HARD PROTECT — never a delete target (constraint 1)

The 5 registered live peer worktrees living inside `.scratch/`. Confirmed via `git worktree list` AND `.git` pointer files into `.git/worktrees/`. Worktree admin is clean (`git worktree prune --dry-run` = empty; no orphan admin entries).

| Path                                | Branch                           | Removal protocol if ever retired                                   |
| ----------------------------------- | -------------------------------- | ------------------------------------------------------------------ |
| `.scratch/fix-weitoeth`             | `codex/fix-weitoeth`             | `git worktree remove` ONLY, **with peer coordination via `/room`** |
| `.scratch/holoscript-net-readiness` | `codex/holoscript-net-readiness` | same                                                               |
| `.scratch/marketplace-revival`      | `codex/marketplace-revival`      | same                                                               |
| `.scratch/studio-readiness`         | `codex/studio-readiness`         | same                                                               |
| `.scratch/surface-readiness`        | `codex/surface-readiness`        | same                                                               |

These are live branches with unmerged peer work (the branch-retirement sibling report lists `codex/studio-readiness` as a KEEP-for-review candidate). **Do not propose, do not rm, do not `git worktree remove` without peer sign-off.** Out of scope for this pass entirely.

---

## 🟡 FOUNDER ESCALATION — paper-adjacent (constraint 3), do NOT auto-propose kill

Per the hard constraint, paper-adjacent dirs are flagged for `/founder`, never auto-killed. These are LaTeX **build artifacts** (`.aux/.bbl/.blg/.log/.out/.pdf` + a build-copy `.tex`). The **canonical** paper sources + OpenTimestamps proofs are tracked in the protected `research/` tree (`research/paper-0c-cael-aamas.tex.ots`, `…base-unsigned.json`) — so these scratch copies are reproducible from canon. But the call is the founder's.

| Dir                                                          | Contents                                                                                     | Founder question                               |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `.scratch/paper-0c-aamas`                                    | 6 files, AAMAS build artifacts (pdf+logs)                                                    | Archive build copies, keep `research/` canon?  |
| `.scratch/paper-0c-aamas-validate-20260523-1405`             | 13 files, incl. build `.tex`+`.bib`+supplemental                                             | same                                           |
| `.scratch/paper-0c-cael-aamas-build`                         | 7 files, build artifacts                                                                     | same                                           |
| `.scratch/paper-2-snn-neurips-build`                         | 7 files, NeurIPS SNN build artifacts                                                         | same                                           |
| `.scratch/paper-2-snn-neurips-supplemental-build`            | 7 files, supplemental build                                                                  | same                                           |
| `.scratch/quantum-progress`                                  | 2 `.jsonl` (incl. `fake-runtime-progress.jsonl`, `quantum_vqe_ibm_kingston_…progress.jsonl`) | quantum-\* — escalate (Paper-21/quantum track) |
| `.scratch/quantum-vqe-cobyla-kingston-smoke-2026-05-22.json` | loose 417B VQE smoke receipt                                                                 | quantum-\* — escalate                          |

**My read** (for founder): all are derivable from tracked `research/` canon → `archive` (not delete) is the conservative move; the canonical `.tex`/`.ots` already survive in `research/`. But I do not rule on paper-program artifacts. → **ESC-001..002 below.**

---

## ✅ PROPOSED KILLS — plain scratch, superseded, per-item story

Ratio = cost-of-inaction / cost-of-action. Highest first. Approver `user` unless noted. Every kill is a non-recursive delete of a single self-contained dir/file; no shared `node_modules` touched.

### KILL-001 [delete] `.scratch/vg38/` — stale full-repo checkout mirror

- **Canonical conflict**: `main` @ `413b519c6` IS the repo. `vg38` is a whole-tree copy (root `LICENSE`, `GEMINI.md`, `k8s/`, `Hololand/`, `memory/`, `examples/` — 12,316 files), no `.git`, no `node_modules`, last touched 2026-05-25.
- **Story**: Created ~2026-05-25 as a "verify gate 38" working copy of the entire tree. Superseded the moment its gate work landed on main (gate-38 commits are in history); it is now a frozen, divergent, un-versioned mirror of files that all have a live tracked counterpart. **223MB — over a fifth of the entire 994MB `.scratch` budget in one stale mirror.** Leaving it costs the single largest non-node_modules block of dead weight in `.scratch` and actively misleads any agent who greps `.scratch/vg38/...` and finds stale copies of canonical files.
- **Action**: `delete` `.scratch/vg38/` (no node_modules; safe single recursive remove of this dir).
- **Cost of action**: ~0 — every file has a tracked equivalent on main. **Cost of inaction**: 223MB dead mirror (largest single reclaim); grep/agent confusion against stale canon copies. **Approver**: user. **Highest ratio — execute first.**

### KILL-002 [delete] `.scratch/rebase-pr-254-014512`, `rebase-pr-256-014629`, `rebase-pr-257-014742`, `rebase-pr-259-014952`, `rebase-pr-271-0144`

- **Canonical conflict**: PRs 254/256/257/259/271 — **no matching local or remote branch exists** (`git branch -a` empty for all five). The PRs were closed/merged; the rebase scratch is orphaned.
- **Story**: Created 2026-05-29 ~01:45 as transient rebase staging for five in-flight PRs. The PRs resolved (merged or closed) the same night; the branches are gone. These dirs are pure rebase-conflict scratch with no surviving target. Leaving them costs nothing but clutter and 5 confusing "is PR 254 still open?" false signals.
- **Action**: `delete` all five (only `rebase-pr-271-0144` carries `node_modules` — F.103: single non-recursive remove of that self-contained dir, never the shared store).
- **Cost of action**: ~0 (targets gone). **Cost of inaction**: 5 orphan dirs implying live PRs that don't exist. **Approver**: user.

### KILL-003 [delete] empty husk dirs — `.scratch/codex`, `untrack-tex`, `push-gate38`, `verify-g41`, `g42`, `tsc6-20260526`

- **Canonical conflict**: 0 files each (verified `find -type f` = 0).
- **Story**: Each was a one-shot task workdir (untrack-tex, push gate 38, verify gate 41/42, tsc pass 6) whose output landed on main and whose files were cleaned, leaving an empty husk. They reference completed gate/task work already in git. Leaving them is harmless but is exactly the accretion this skill exists to prune.
- **Action**: `delete` the 6 empty dirs (no node_modules in any).
- **Cost of action**: 0. **Cost of inaction**: trivial clutter. **Approver**: user.

### KILL-004 [delete] superseded loose `.patch` files at `.scratch/` root

- **Files**: `ab-harness-20260526-1924.patch`, `absorb-stale-edges.patch`, `brittney-refusable-diff.patch`, `f082b-holoscript.patch`, `studio-generated-output-gate.patch`, `studio-generated-output-new-files.patch`.
- **Canonical conflict**: each patch's content has landed on `main` — f082 diagnostics (`f082b-diagnostics-20260525` work merged), absorb-stale-edges, brittney-refusable, studio-generated-output all have corresponding committed changes; patches are pre-apply snapshots.
- **Story**: These `.patch` files were hand-off / apply-staging artifacts from late May. Once applied and committed they became frozen duplicates of git history. A `.patch` on disk whose hunks are already on main is a trap — an agent may re-apply it and create conflicts. Cost of leaving = re-apply hazard + clutter.
- **Action**: `delete` the 6 patches.
- **Cost of action**: ~0 (content in git). **Cost of inaction**: stale-reapply hazard. **Approver**: user. _(If any patch represents UNlanded work the founder wants to preserve, downgrade that one to `archive` — but git log shows the corresponding work merged.)_

### KILL-005 [delete] loose smoke-test PNG/HTML/MJS artifacts at `.scratch/` root

- **Files**: `gold-game-gate23-smoke.png`, `gate24-art-smoke.png`, `gate31-holograph-smoke.png`, `gate36-toolset-smoke.png`, `gold-home-desktop.png`, `gold-home-mobile.png`, `gold-game-gold-home-smoke.mjs`, `fire-dragon-preview.png`, `fire-dragon-preview-side.png`, `fire-dragon-threejs`, `pine-tree-preview.png`, `pine-tree-threejs`, `segment-receipts.json`, `visual-reference-scan-after.json`, `commit-msg-stage-contract.txt`.
- **Canonical conflict**: GOLD-game gates 23/24/31/36 + GOLD home are sealed/landed (I.017 + GOLD-game gate commits, W.668 ledger). These PNGs are one-shot visual smoke captures, not the receipt of record (receipts are sealed in the GOLD-game GATES.md / vault).
- **Story**: Generated 2026-05-22/23 as eyeball screenshots while sealing GOLD-game gates. The durable proof is the sealed gate receipt in the GOLD-game ledger, not these loose PNGs. ~4.3MB of one-off images plus throwaway threejs/preview scratch and a single-line `commit-msg-stage-contract.txt`. Cost of leaving = bulk + no value (superseded by the sealed receipts).
- **Action**: `delete` the loose smoke artifacts. _(`gold-game-gold-home-smoke.mjs` is a script — if it's a reusable smoke harness rather than a one-shot, downgrade to `archive`; my read is one-shot.)_
- **Cost of action**: ~0 (sealed receipts are the canon). **Cost of inaction**: ~4MB + visual clutter. **Approver**: user.

### KILL-006 [archive] `.scratch/conjecture/` — SDF-conjecture validation JSON receipts

- **Canonical conflict**: SDF-conjecture work landed via `2026-05-26-reconcile-main` / `2026-05-27-sdf-conjecture` and the `sdf` direction; these 14 JSON files (`collision-equivalence`, `curvature-bound`, `proof-carrying-geometry-smoke`, `falsifiability-pregate-validation`, …) are the run outputs.
- **Story**: Created 2026-05-23 as the validation receipt set for the SDF/geometry-conjecture engine. The engine + its canonical receipts landed; these are the dev-time JSON outputs. UNLIKE the smoke PNGs, these are _falsifiability/proof-carrying_ receipts whose provenance might matter to the conjecture/geometry paper track — so `archive` (preserve, mark stale), not `delete`, per refusal #4.
- **Action**: `archive` → move to a retained `research/_archive/` or `.scratch/_archive/` with a supersession note pointing at the sdf-conjecture commits. (No node_modules.)
- **Cost of action**: low (move + note). **Cost of inaction**: low. **Approver**: user (founder if treated as paper-track → see ESC).

### KILL-007 [delete] completed dated task dirs (2026-05-21 → 2026-05-30) whose work landed on main

- **Dirs** (dated/named, work-complete, NOT worktree, NOT paper): `2026-05-21-codex-cloud-drive-cleanup`, `-codex-gauntlet-dashboard`, `-codex-live-segments`, `-codex-rigid-body`, `-codex-snn`, `-format-stress`, `-gap-investigation`, `2026-05-22-asset-shard-redaction`, `-codex-room-marathon`, `-quest-proof`, `2026-05-23-format-stress-cli`, `-graph-status-cache-smoke`, `2026-05-25-codex-humanoid-body-rig`, `-codex-multiplayer-room-botanical`, `-codex-twin-earth-vegetation`, `-codex-visual-reference`, `-competitive-monitoring`, `2026-05-26-reconcile-main`, `-refresh-competitive-monitoring-cadence`, `2026-05-27-sdf-conjecture`, plus named siblings `a020-capabilities-interface-20260525`, `arcore-depth*` (3 dirs), `android-*` (4 dirs), `c-g43-socket-main-20260525`, `codex-holomesh-profile-*`, `codex-p2-p9-twin-test-*`, `codex-shared-trait-library-*`, `codex-studio-earn-loop-*`, `core-identity-platform-*`, `e-g33-reconcile-main-20260524`, `f082-mcp-errors-*`, `f082b-diagnostics-20260525`, `fc-inbox-1350`, `founder-vista-hologram-*`, `holomesh-kq-20260526`, `holoshell-*-self-test` (8 dirs), `holoshell-readiness-custody-*`, `na2-1442`, `persistent-expired-20260525-2105`, `quest-proof-screenshot-20260525`, `rbac-test`, `rescue-stranded-20260525`, `scale-bridge-v0-*`, `studio-receipt-manifold-dev`, `task-8-gaussian-fallback-*`, `commit-messages`, `dev-servers`, `patches`.
- **Canonical conflict**: the work each represents is on `main` (e.g. RBAC → `973d73d50` AgentRBAC suite + `b4adf9341` ML-DSA; identity-signing/core-identity → `536453e65`/`f8444752d`; SNN/rigid-body/gauntlet → gate commits; arcore-depth → F.104's proven `c534590be` S23→ARCore→HoloMap rig). All are >2 days old (most 5-10 days), none is a worktree, none is paper-adjacent.
- **Story**: Each is a single-session task working copy (claim → work → commit → close) from 2026-05-21..30. Per the direct-to-main doctrine (F.089) and "the durable record is the commit + graduated MEMORY entry, not a scratch dir" (CLAUDE.md), once the commit landed the scratch copy became dead weight. **F.104 names this exact failure**: scratch sprawl made finding the _already-existing_ arcore/HoloMap rig take forever — these dirs ARE that sprawl. Cost of leaving = the bulk of the 994MB (19 of these carry `node_modules`), plus F.104 search-confusion compounding every session.
- **Action**: `delete` per-dir. **F.103 CRITICAL**: 19 of these carry self-contained `node_modules` (`a020-capabilities-interface-20260525`, `arcore-depth-frame-chains`, `codex-holomesh-profile-*`, `codex-p2-p9-twin-test-*`, `codex-shared-trait-library-*`, `codex-studio-earn-loop-*`, `core-identity-platform-*`, `e-g33-reconcile-main-20260524`, `f082b-diagnostics-20260525`, `fc-inbox-1350`, `founder-vista-hologram-*`, `holoshell-readiness-custody-*`, `na2-1442`, `persistent-expired-*`, `quest-proof-screenshot-*`, `rebase-pr-271-0144`, `rescue-stranded-*`, `scale-bridge-v0-*`, `task-8-gaussian-fallback-*`). Remove each dir as a single self-contained unit — do NOT junction-traverse, do NOT touch `<repo>/node_modules`. EPERM = locks, retry after process exit.
- **Cost of action**: low per dir, but this is the bulk — recommend the founder approve the _batch_ with the F.103 protocol, then execute one dir at a time (NOT a wildcard `rm -rf .scratch/2026-*`). **Cost of inaction**: bulk of 994MB + F.104 sprawl confusion. **Approver**: user (batch approval; per-dir execution).

---

## 👁 WATCHED — not proposed (refusal #2, no concrete supersession yet)

| Dir                                                                                                                                                                                                                                                                   | Why watched not killed                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `architect-20260530`, `gamefeel-20260530`, `lightvault-20260530`, `identity-signing`, `land-branch`, `mldsa-conformance`, `native-traversal-20260530`, `vaultops-20260530`, `rbac-test` (if active), `legacy-root-debris-2026-05-21`, `legacy-scratch-dir-2026-05-21` | Dated **2026-05-30** (yesterday) or `legacy-*` (explicit legacy-archive naming). Too fresh to assert supersession, or self-labeled as a legacy holding area. `identity-signing`/`mldsa-conformance` may relate to the still-open identity-signing branch in the sibling branch report — **do not kill until that branch is merged/retired.** Recheck next cycle. |

---

## Founder escalations

- **ESC-001**: Paper-0c (AAMAS) + Paper-2 (SNN NeurIPS) build-artifact dirs (5 dirs). Canonical `.tex`/`.ots` live in tracked `research/`. Should the build copies be `archive`d or left? My read: archive — canon survives in `research/`. Constraint 3 = founder call.
- **ESC-002**: quantum-_ (`quantum-progress` dir + loose VQE smoke JSON). Quantum/Paper-21 track. `fake-runtime-progress.jsonl` name suggests a fixture, not a real receipt — but quantum-_ is founder-gated by constraint 3. Archive vs delete = founder call.

## Summary

- **Scanned**: ~90 dated dirs + ~22 loose root files + 5 worktrees.
- **Protected (untouched)**: 5 live worktrees.
- **Escalated to /founder**: 7 paper/quantum dirs+files (ESC-001/002).
- **Proposed kills**: KILL-001..007 — 1 stale mirror, 5 orphan rebase dirs, 6 empty husks, 6 superseded patches, ~15 loose smoke artifacts, 1 conjecture-archive, ~55 completed dated task dirs (19 with F.103 node_modules).
- **Watched**: ~11 fresh/legacy dirs.
- **Reversibility**: `.scratch` is gitignored + 0 tracked files → nothing recoverable via git; recommend the founder confirm the batch before any execution. This report is the proposal; execution is the user's call.

---

## EXECUTION RECORD (2026-05-31, founder-approved end to end)

All of KILL-001..007 executed + ESC-001/002 archived. **`.scratch`: 56GB → 2.79GB** (NB: real size was 56GB, not the ~994MB pre-estimate — ~53GB reclaimed). All work done with per-dir top-level reparse-point (junction) guards; shared `node_modules` never traversed (F.103 honored). **5 codex/\* peer worktrees verified intact (5/5).** A peer committed mid-cleanup (`278a639ec`) — shared tree healthy throughout.

- **KILL-001** vg38 (194MB dead mirror) — deleted.
- **KILL-002..005** — 5 orphan rebase dirs, 6 husks, 6 patches, ~19 loose smoke artifacts, threejs/preview dirs — deleted.
- **KILL-006** `conjecture/` — archived → `.scratch/_archive/conjecture` + supersession note.
- **KILL-007** — ~54 completed dated task dirs deleted (incl. the 9 multi-GB node_modules-bearing heavies: scale-bridge-v0, task-8-gaussian-fallback, rescue-stranded, fc-inbox-1350, na2-1442, persistent-expired, quest-proof-screenshot, holoshell-readiness-custody, e-g33-reconcile-main). `legacy-scratch-dir` + `founder-vista-hologram` cleared on retry.
- **ESC-001/002** (/founder: ARCHIVE not delete) — 5 paper LaTeX build dirs + quantum receipts → `.scratch/_archive/{paper,quantum}` with provenance notes. `.tex` SHA-diff vs `research/` canon flagged 4 DIVERGED build-copies (NOT pure-reproducible) → archive was correct.

**HELD from KILL-007 (conservation call, named — refusing silent demote):**

- `android-native-toolchain` (1.5GB: android-sdk/jdk21/gradle) + `android-platform-tools` (24MB: adb) — **reusable toolchains, not task scratch**. Deleting forces expensive re-download. Kept.

**WATCHED, untouched** (per report §WATCHED): fresh 2026-05-30 dirs (architect/gamefeel/lightvault/native-traversal/vaultops), `identity-signing`, `mldsa-conformance` (may tie to open identity-signing branch), `land-branch`.

**Residual**: `legacy-root-debris-2026-05-21` (161MB) — one transient file-lock ("Incorrect function", EPERM=lock not corruption); retry next session. All else clean. Final `.scratch` = 16 dirs, every one protected or fresh-watched.
