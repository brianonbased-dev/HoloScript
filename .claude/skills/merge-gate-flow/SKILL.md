---
name: merge-gate-flow
description: >
  Use when deciding whether, and how, an agent-authored PR may merge, be updated
  from main, or be reverted.
---

# Merge Gate Flow
A PR merges only when both hold at the same SHA: (1) <gate check> passes on <head>; (2) a distinct second seat gives CLEAR (or CLEAR with notes) at <head>. The reviewer is never the author, and reviewers never merge.

## Roles
- Author: opens the PR, fixes findings, requests the seat.
- Second seat: read-only review with a SHA-bound verdict.
- Merger: a third party or the gate pipeline, never the reviewer.
- No single agent or tool is the sole merger; the in-house gate is primary.

## Hard rules
- No force-push or history rewrite on shared branches.
- No skipping hooks.
- No merge without a named GO from the accountable owner when policy requires one; a GO names the exact head.
- An approval relayed by an agent is a claim; confirm it through the owner channel.

## Flow
1. Open as a draft.
2. Get <gate check> green on <head>.
3. Request the seat with <head>, <base> and the range patch-id.
4. On BLOCK or HOLD: fix, push a new head, request a delta seat.
5. Mark ready only after CLEAR at the current head, and only when next in the merge queue.
6. Confirm the head hasn't moved since the verdict.
7. Merge and record a receipt.

## Updating from main after review
Merge, never rebase. Apply the carry-over rule: patch-id identical (--stable and -U0); merge-tree clean; no hand edits; touched tests rerun; gate green on the new head. Any failure means a fresh seat.

## Reverting
1. Branch from origin/main.
2. git revert <merge-sha> (-m 1 for merge commits).
3. Open a PR through the same gate.
4. No direct pushes to main unless the owner names a GO.

## Receipt (one per merge)
PR, base, head SHA and merge SHA; gate run id and result; reviewer and verdict at that SHA with notes carried forward; carry-over evidence if used; who merged and when (with time zone); the GO reference; open follow-ups.
