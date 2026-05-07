# xsp6 Trezor anchor — first production-anchored settlement receipt

**Task**: `task_1778132312944_bcup` — xsp6 chain-anchor settlement: swap dev signer for founder Trezor.
**Status**: SHIPPED. Closes the placeholder-hex-sig gap in cbdab1387 settlement receipts.
**Date**: 2026-05-07.
**Founder**: Joseph signed at Trezor (Quest 3 + Rabby in browser).

## What this proves

The xsp6 negotiation chain-anchor pattern (commit `cbdab1387` Phase 1, `98b94e0e4` Phase 2 scaffolding) now has its **first production on-chain anchor on Base mainnet** by the founder anchor `0x0C57…660E3`.

This closes the F.041 chain-anchor pattern for negotiation settlements end-to-end:

1. **Phase 1** (cbdab1387): negotiation primitives + signed message channel — placeholder hex sigs.
2. **Phase 2 scaffolding** (98b94e0e4): `Signer` interface + `EthersSigner` adapter + `chain-anchor.ts` (viem `hashTypedData` + Base 8453 domain) + `settleNegotiationWithAnchor`. 13 tests, dev-keyed only.
3. **Phase 2 broadcaster** (02be15290): `scripts/anchor-founder-settlement-receipt.mjs` — generates EIP-712 hash + Rabby+Trezor HTML broadcaster mirroring the seat-attestation pattern.
4. **Phase 2 proof** (THIS COMMIT): the founder Trezor + Rabby actually signed and broadcast a real Base self-tx whose calldata is the EIP-712 hash. On-chain confirmation is cryptographic proof.

The Signer interface in `signer.ts` is the swap point — runtime negotiations continue using `EthersSigner` (dev-keyed) for routine settlements. **Founder-anchored settlements** use this manual flow with the Trezor in the loop.

## On-chain evidence

| Field | Value |
|-------|-------|
| Tx hash | `0x3cc575…2369d` (full hash in `2026-05-07_xsp6-trezor-anchor-proof.base.json`) |
| Block | 45676237 |
| Chain | Base mainnet (8453) |
| From | `0x0C57…660E3` (S.ANC founder anchor) |
| To | `0x0C57…660E3` (self-tx) |
| Value | 0 ETH |
| Calldata | `0xf79e63…2a34b` (EIP-712 hash; full in sidecar JSON) |
| On-chain nonce after | 126 |
| Cost | < 0.000001 ETH (~$0.0005) |
| Basescan | see sidecar JSON `basescanUrl` field |

## Verification

`node scripts/anchor-founder-settlement-receipt.mjs --verify <settlementTxHash from sidecar JSON>`

```
CHECKS
  PASS  tx.from == FOUNDER_ANCHOR
  PASS  tx.to == tx.from (self-tx)
  PASS  tx.input == eip712_hash
  PASS  receipt.status == 0x1
  PASS  tx.chainId == 8453 (Base)

VERIFIED
```

All five chain-anchor invariants from `verifyChainAnchor` (commit 98b94e0e4) hold against live Base mainnet RPC.

## The settlement receipt (durable artifact)

The full receipt with all 0x… hashes lives in the sidecar `2026-05-07_xsp6-trezor-anchor-proof.base.json` (the `.base.json` extension is exempt from the pre-commit hex-secret scanner per the EXEMPT_HEX list — `0x[a-f0-9]{64}` is ambiguous between private key and chain-anchor hash, so the scanner relies on filename convention to disambiguate).

Fields summarised:

- `protocol`: `holomesh.negotiation.v1`
- `negotiationId`: `founder-anchor-2026-05-06-marathon`
- `toolName`: `agentic-internet-substrate`
- `currency`: `NONE` (non-monetary attestation)
- `price` / `slaSeconds`: 0 / 0 (already delivered; settlement on commit)
- `settledAt`: 2026-05-07 06:30 UTC
- `chainId`: 8453 (Base)
- `signerAddress`: `0x0C57…660E3` (founder anchor)
- `blockNumber`: 45676237
- `eip712Hash`, `settlementTxHash`: full forms in sidecar

The semantic content of this receipt: the founder anchor witnesses **the 2026-05-06 marathon shipping** (11 tasks: jira / u8q2 / zp7u / xsp6 / yqll / qe2i / 0mxs / vault-Phase-3 / qe2i-Phase-2 / xsp6-Phase-2-scaffolding / Trezor-anchor-this) **as the negotiated tool delivery**. Currency NONE: this is a non-monetary attestation. The marathon shipping itself IS the deliverable.

## Stacks on / supersedes

- **F.041** chain-anchor pattern (eth_sendTransaction with EIP-712 hash as calldata; Base RPC verification). This run is the first xsp6-domain instance.
- **W.GOLD.514** signTypedData_v4 from-arg-advisory bypass. The reason we anchor via tx, not sig recovery.
- **G.GOLD.016** wallet-sacred. Trezor remained identity throughout — no key material left the device, no wallet rotation, no overwrite.
- **S.ANC** anchor pattern (`anchor_base.py`) — same Rabby+Trezor flow, applied to a SettlementReceipt instead of an attestation envelope.
- Closes placeholder-hex-sig gap in commit `cbdab1387`.

## Pattern: founder-anchored vs runtime settlements

Two-tier signer:

| Settlement class | Signer | Frequency | Latency |
|------------------|--------|-----------|---------|
| Runtime (agent-to-agent commerce) | `EthersSigner` dev-keyed | Per-negotiation | Sub-second |
| Founder-anchored (treasury, marathons, milestones) | This Trezor flow | Manual | Minutes (Joseph + button) |

The runtime path lets agents transact at full speed. The founder-anchored path provides the periodic ground-truth attestation that anchors the system to the founder's Trezor on Base. Same `Signer` interface in code; different broadcast mechanism in practice.

## Hooks for future agents

- `scripts/anchor-founder-settlement-receipt.mjs` parameterized by SETTLEMENT_RECEIPT object — change the constant + re-run to anchor any future founder-witnessed settlement.
- Verify mode (`--verify <tx_hash>`) runs all five chain-anchor invariants against live Base RPC; exits non-zero on any fail.
- HTML broadcaster regenerates from script; gitignored under `.broadcaster/`.
- Anchor a new settlement: bump `negotiationId`, `description`, `settledAt`; re-run script; pass HTML to Joseph; verify tx; commit a new proof memo.

## What's next (deferred)

- Wire the daemon-side `settleNegotiationWithAnchor` to actually populate `settlementTxHash` from runtime broadcast (currently the field exists in the type but only ths manual flow populates it).
- Index founder-anchored settlements in a queryable form so other agents can verify provenance against on-chain ground truth without re-fetching every tx.
- Consider periodic batched anchors (1 founder tx anchoring N runtime settlements via Merkle root) to reduce founder-action frequency for high-volume scenarios.

These are runtime-architecture decisions, not scope for this task. File when ready.
