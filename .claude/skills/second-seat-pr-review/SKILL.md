---
name: second-seat-pr-review
description: >
  Use when a PR needs an independent, read-only security and correctness verdict
  at one exact commit SHA before it can merge.
---

# Second-Seat PR Review
An independent, read-only review that ends in a verdict bound to one exact commit.

## Verdicts (always "<VERDICT> at <sha>")
- CLEAR: no blockers, nothing to follow up.
- CLEAR with notes: safe to merge; notes are follow-ups and do not block.
- HOLD: waiting on a fact (prod state, owner decision, missing proof). Not a defect.
- BLOCK: a concrete defect. Give evidence and a fix path; re-seat on a new head.
A verdict never transfers to another SHA except by the carry-over rule.

## Read-only rules
- No commits, pushes, merges, state-changing comments or label edits.
- Never print secret values; name env vars or config keys only.
- Wrap long commands in a timeout.
- Don't stash, reset or modify anyone else's files.

## Steps
1. Pin identity: <head> and its parents, <base>, and the merge base.
2. If the head moved, review the delta <old-head>..<head> and re-check prior notes.
3. Read the full diff, then the callers and callees of every changed function.
4. Work through the checklists, recording file:line evidence.
5. Write the report.

## Money
- [ ] No double charge on retry, timeout, takeover or page reload.
- [ ] Claim confirm and debit in ONE transaction; a lost claim refuses.
- [ ] Refusals (e.g. 402) returned before any debit; proven by a test.
- [ ] Idempotency keys scoped per user.
- [ ] No free path (missing token, missing project id, alternate route).
- [ ] The "already charged" check matches the ledger on type AND metadata exactly as the writer stores it.
- [ ] Units labelled (cents vs credits).
- [ ] No unannounced pricing change.

## Auth
- [ ] Session required on every new or changed route.
- [ ] Owner check returns a uniform 404 to non-owners.
- [ ] A foreign credential that doesn't match the session gives 403.
- [ ] No service-key fallback without a user credential.
- [ ] Who pays equals who owns.
- [ ] Route matching resists trailing slashes, case and encoding tricks.

## Workspace / filesystem
- [ ] Paths confined after realpath, not by string prefix.
- [ ] Symlink and dangling-symlink write escapes closed.
- [ ] Existence-climb resolvers can't escape.
- [ ] Untrusted repo config neutralised (git filters, hooks, includes).
- [ ] No TOCTOU gap between check and use.

## Secrets
- [ ] No secret in logs, errors or stream output.
- [ ] Upstream error bodies made generic and capped.
- [ ] Scanner allowlists narrow: key name AND value shape AND path; never lease, auth or session fields.
- [ ] Whole-file allowlists flagged as a note.
- [ ] PR text about scanner config matches actual behaviour.

## Migrations
- [ ] Additive only; changes to existing tables flagged for separate owner approval.
- [ ] IF NOT EXISTS pitfall: a table already in an older shape is silently left alone.
- [ ] Was an earlier version ever applied anywhere? Verify prod state or mark it not verified.

## Tests
- [ ] Author pass counts are claims.
- [ ] New tests fail on the old head and pass on <head>.
- [ ] Conditional or skipped tests actually run in CI.

## Carry-over rule (merge-from-main heads)
The new head inherits the verdict only if all hold: identical range patch-id (git diff <mergebase> <head> | git patch-id --stable, plus the -U0 variant); git merge-tree --write-tree is clean; no hand edits in the merge commit; touched tests rerun and passing on the new head; the carry-over recorded in the receipt. Money, auth, workspace-access or secrets changes always get a fresh seat. Otherwise re-seat.

## Report
Verdict line (<VERDICT> at <sha>, base, patch-id); blockers B1.. with file:line and fix path; notes N1..; a "Not verified" list.
