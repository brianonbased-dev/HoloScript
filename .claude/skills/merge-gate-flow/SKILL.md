---
name: merge-gate-flow
description: >
  Use when deciding whether, and how, an agent-authored PR may merge, be updated
  from main, or be reverted.
source: 'Canonical source: the Grok Bot skill store (skill merge-gate-flow); keep this body identical to it.'
---

# Merge Gate Flow

Only the gate merges. Docs/test-only PRs merge once HoloCI records a final pass on the reviewed commit. Security/money/auth PRs need a fresh second seat (CLEAR or CLEAR with notes at <head>) + <gate check> pass on <head> + CoS YES. The reviewer is never the author and never merges.

## Roles

- Author: opens the PR, fixes findings, requests the seat.
- Second seat: read-only review with a SHA-bound verdict.
- Merger: only the gate merges. No single agent or tool is the sole merger, and the reviewer never merges.
- No direct pushes to main, except a direct revert under a named owner GO (see Reverting).

## Hard rules

- No force-push or history rewrite on shared branches.
- No skipping hooks.
- Docs/test-only PRs merge once HoloCI records a final pass on the reviewed commit.
- Security/money/auth PRs need a fresh second seat + gate pass + CoS YES.
- No merge without a named GO from the accountable owner when policy requires one; a GO names the exact head.
- Approvals are recorded in the standing approvals file kept by CoS. Act on what is recorded there; treat an unrecorded relayed approval as a claim to confirm via CoS.

## Flow

1. Open as a draft.
2. Get <gate check> green on <head>.
3. Request the seat with <head>, <base> and the range patch-id.
4. On BLOCK or HOLD: fix, push a new head, request a delta seat.
5. Mark ready only after CLEAR at the current head, and only when next in the merge queue.
6. Confirm the head hasn't moved since the verdict.
7. Only the gate merges: docs/test-only PRs once HoloCI records a final pass on the reviewed commit; security/money/auth PRs after a fresh second seat + gate pass + CoS YES. Record a receipt.

## Updating from main after review

Merge, never rebase. Apply the carry-over rule: patch-id identical (--stable and -U0); merge-tree clean; no hand edits; touched tests rerun; gate green on the new head. Any failure means a fresh seat.

## Reverting

1. Branch from origin/main.
2. git revert <merge-sha> (-m 1 for merge commits).
3. Open a PR through the same gate.
4. Only the gate merges the revert, under the same rules as any PR.

Exception: with a named GO from the accountable owner, a direct revert may go straight to main. Record a receipt either way.

## Receipt (one per merge)

PR, base, head SHA and merge SHA; gate run id and result; reviewer and verdict at that SHA with notes carried forward; carry-over evidence if used; who merged and when (with time zone); the GO reference; open follow-ups.
