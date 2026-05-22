# connection-mechanics-proof/ — retired Oasis track (proof fixture, NOT the flagship)

This directory holds the **retired abstract "Oasis Shard Zero" track**, kept for one
reason only: its compass co-session is the cited proof that the **AI↔human connection
*mechanics*** are real and reproducible.

It is **NOT the GOLD game flagship.** The canonical flagship is
`../gold-vault-game.holo` (the GOLD knowledge-curation system turned into a game),
whose gates and verifiers live one level up in `examples/gold-game/`.

## Hard rule (the drift this fold fixes)

An **Oasis Gate-N PASS NEVER satisfies a flagship Gate-N.** They are different
tracks that happened to share gate numbers. Treating "a verifier passed" as "the
flagship gate is done" is exactly the conflation that caused two false "done"
reports (see `../GATES.md` and GOLD entry W.GOLD.537). Always read `../GATES.md`
(the single gate ledger) for authoritative per-track gate status.

## What's here

| File | What it proves |
|------|----------------|
| `oasis-shard-zero.holo` | the abstract compass world (parses clean) |
| `gate-3-verify.mjs` | compass co-session: human (scripted input) + agent (value-selection) in ONE shared deterministic session, mutual effect, agent re-plan, WorldModelReceipts, both digests via the real `computeStateDigest` |
| `GATE-3-cosession-receipt.json` | `sharedWorldDigest=a4c1072b…`, `wmrDigest=d7ee5d31…` (the values cited by W.GOLD.537) |

## Why the rest of the Oasis track was deleted

The uncited Oasis Gate 0/1/2 verifiers and receipts (`gate-1-verify.mjs`,
`gate-2-verify.mjs`, `GATE-0/1/2` receipts) were retired (founder-approved,
2026-05-22) — they were superseded scaffolding with no inbound citation. Recover
from git history if ever needed.

## Run

```
node_modules/.bin/tsx examples/gold-game/connection-mechanics-proof/gate-3-verify.mjs
```
