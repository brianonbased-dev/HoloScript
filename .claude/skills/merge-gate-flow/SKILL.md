---
name: merge-gate-flow
description: >
  Use when deciding whether, and how, an agent-authored PR may merge, be updated
  from main, or be reverted.
source: 'Canonical source: the Grok Bot skill store (skill merge-gate-flow); keep this body identical to it.'
---

# Merge Gate Flow

A PR merges only when both hold at the same SHA: (1) <gate check> passes on <head>; (2) a distinct second seat gives CLEAR (or CLEAR with notes) at <head>. The reviewer is never the author, and reviewers never merge.

## Roles

- Author: opens the PR, fixes findings, requests the seat.
- Second seat: read-only review with a SHA-bound verdict.
- Merger: only Release merges, after the gate passes: a second-seat CLEAR at the exact head (Mapping, or a different reviewer when Mapping is the author) and a CoS YES. Never the reviewer.
- No direct pushes to main.

## Hard rules

- No force-push or history rewrite on shared branches.
- No skipping hooks.
- No merge without a named GO from the accountable owner when policy requires one; a GO names the exact head.
- Approvals are recorded in `C:\Users\josep\Documents\holo-approvals\standing-approvals.md`. Act on what is recorded there; treat an unrecorded relayed approval as a claim to confirm via CoS.

## Flow

1. Open as a draft.
2. Get <gate check> green on <head>.
3. Request the seat with <head>, <base> and the range patch-id.
4. On BLOCK or HOLD: fix, push a new head, request a delta seat.
5. Mark ready only after CLEAR at the current head, and only when next in the merge queue.
6. Confirm the head hasn't moved since the verdict.
7. Only Release merges, after the gate passes: a second-seat CLEAR at the exact head (Mapping, or a different reviewer when Mapping is the author) and a CoS YES. Record a receipt.

## Updating from main after review

Merge, never rebase. Apply the carry-over rule: patch-id identical (--stable and -U0); merge-tree clean; no hand edits; touched tests rerun; gate green on the new head. Any failure means a fresh seat.

## Reverting

1. Branch from origin/main.
2. git revert <merge-sha> (-m 1 for merge commits).
3. Open a PR through the same gate.
4. Release merges the revert through the same gate (a second-seat CLEAR at the exact head (Mapping, or a different reviewer when Mapping is the author) and a CoS YES). No direct pushes to main.

## Receipt (one per merge)

PR, base, head SHA and merge SHA; gate run id and result; reviewer and verdict at that SHA with notes carried forward; carry-over evidence if used; who merged and when (with time zone); the GO reference; open follow-ups.
