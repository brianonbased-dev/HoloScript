# Action-class reversibility registry

**Audience:** All HoloScript / HoloMesh agents before self-authorizing work.  
**Rule:** If an action is **not** listed here, treat it as **founder-gated** until this file is updated under explicit founder directive for that session.

## Legend

| Tag | Meaning |
|-----|---------|
| **Reversibility** | `full` — undo restores prior state; `partial` — rollback possible with extra steps or data loss; `none` — undo is impractical or trust-breaking |
| **Blast radius** | `low` — isolated files or local-only; `medium` — one package or bounded module set; `high` — monorepo-wide or cross-repo; `critical` — keys, money, production user data, or legal/evidence chain |
| **Authorization** | `self_ok` — agent may proceed without founder ping if constraints hold; `founder_required` — stop and get directive |

## Registry

| Action class | Reversibility | Blast | Authorization | Constraints / notes |
|--------------|---------------|-------|---------------|---------------------|
| Local edits + commit to **current** repo default branch (HoloScript main) | `partial` | `low`–`medium` | `self_ok` | Run tests for touched packages; `git add` **explicit paths only**; conventional commit; no secrets |
| Branch-local commits (feature branch, not yet merged) | `full` | `low` | `self_ok` | Prefer when experiment is risky; discard branch if wrong |
| Documentation-only change (markdown in-repo) | `full` | `low` | `self_ok` | Must match an assigned board task or obvious typo/link fix; no scope creep |
| Skill / `.cursor` rule / hook edits in **this** repo | `partial` | `medium` | `self_ok` | Same repo only; document *why* in commit; if cross-repo (`~/.ai-ecosystem`), see row below |
| Config in `~/.ai-ecosystem` (env templates, hooks, team-connect) | `partial` | `high` | `founder_required` | Affects all local agents; easy to break credentials flow |
| Dependency add / version bump (`package.json`, lockfile) | `partial` | `medium` | `self_ok` | Justify in commit; run `pnpm install` + targeted tests; watch supply-chain |
| Generated artifacts / build outputs | `full` | `low` | `self_ok` | Regenerable; do not commit unless repo convention says so |
| Board: claim / heartbeat / presence | `full` | `low` | `self_ok` | Use correct API key; no task spam |
| Board: `done` with commit hash | `none` | `medium` | `self_ok` | **Only** after real commit exists; summary accurate — audit trail |
| `git push` (normal) | `partial` | `medium` | `self_ok` | If credentials fail, report — do not embed tokens |
| `git push --force`, history rewrite, reflog-dependent recovery | `none` | `high`–`critical` | `founder_required` | Violates shared branch safety unless founder-owned emergency |
| Delete / move large subtrees, mass renames without absorb/impact pass | `partial` | `high` | `founder_required` | Run impact analysis first; if still fuzzy, escalate |
| Secret rotation, API key issuance, `.env` **values** | `none` | `critical` | `founder_required` | Never paste secrets into commits or chat logs |
| Vault / GOLD / sealed evidence writes | `none` | `critical` | `founder_required` | Chain-of-custody; schema and founder process |
| Production deploy, feature flags affecting users | `partial` | `critical` | `founder_required` | Unless runbook explicitly delegates |
| Destructive DB migrate, bucket wipe, IAM broad grant | `none` | `critical` | `founder_required` | Always explicit runbook + backup |

## Consultation order

1. Match the planned action to the **closest row** (wording is illustrative, not exhaustive).  
2. If **Authorization** is `founder_required`, **stop** and obtain a founder directive for this session (including “add to GOLD” / vault / force-push class work).  
3. If **Blast** is `high` or `critical` but row says `self_ok`, re-check: if your case adds risk (cross-package, first-time path), escalate.  
4. **New action classes** — add a row here in the same commit as the behavior change, or keep work blocked until the registry is updated.

## Related

- `AGENT_INTERFACE.md` — git and board contract.  
- `.cursorrules` — refactor impact workflow (blast radius before symbol edits).
