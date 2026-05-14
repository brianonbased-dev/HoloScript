# ADR-2026-05-14: Trust Primitives Decision Record

> Status: **ACCEPTED** - Canonical trust primitives for cross-surface convergence.
> Decision owner: HoloScript Core (`codex-hardware` implementing founder-ratified decision).
> Date: 2026-05-14
> Source: `C:/Users/josep/.ai-ecosystem/research/2026-05-14_studio-rethink-ideas-to-fruition-TRUST-SPINE.md`
> Canon: W.GOLD.189 (Algebraic Trust tri-layer framing), W.GOLD.013 (Trust by Construction), G.GOLD.016 (wallets are identity), W.GOLD.514 (typed-data signer discipline).

---

## 1. Context

The 2026-05-14 trust-spine survey found that HoloScript, ai-ecosystem, and HoloShell each have real trust machinery, but the product-level trust model is triplicated:

| Surface | Existing trust machinery | Gap |
|---|---|---|
| HoloScript core | `AgentPassport` DID, Agentic JWT / PoP, Ed25519 signatures, UCAN capability chains, audit events, provenance, SimulationContract replay hooks | Identity, permission, and receipt primitives are not the shared cross-surface vocabulary yet. |
| ai-ecosystem | per-window seat identity, secp256k1 x402 seat wallets, EIP-191 request envelopes, append-only audit-log scaffold | Signed attribution and receipts are not yet a single queryable local ledger. |
| HoloShell | shell objects, `read_only` / `guarded_execute` / `break_glass` policies, approval bundles, action/run receipts | Receipt forms remain local to HoloShell and need upstream schema convergence. |

The systems are independently useful but not composable. This record chooses the primitives that downstream tasks must use so the digital-twin promotion, HoloShell upstream candidates, trust keystone ledger, and trust-system convergence work can proceed without re-opening the same architectural question.

---

## 2. Decisions

### Decision 1 - Passport DID is the identity join-key

`AgentPassport` is the canonical identity root. Downstream receipts, shell objects, seat-wallet attestations, and digital-twin actors must resolve to a Passport DID, preferably a role-agnostic DID v2 (`did:holoscript:<fingerprint>`) when new identity records are created.

Seat wallets and HoloShell `actorLaneId` values are bindings to the Passport DID, not separate identity roots. A receipt may carry a lane id, wallet address, git signing key, or HoloMesh agent id for local routing, but those identifiers are subordinate to `actor.passportDid`.

### Decision 2 - HoloShell's three envelopes are the canonical permission model

The canonical user-facing permission vocabulary is:

| Envelope | Meaning |
|---|---|
| `read_only` | Inspection or classification. Must still emit a receipt. |
| `guarded_execute` | Staged mutation. Requires explicit approval before external or local state changes. |
| `break_glass` | High-risk mutation. Requires high-friction approval plus rollback, witness, or refusal evidence. |

HoloScript RBAC, UCAN, RiskRegistry, route signing, shell-object risk state, and adapter-specific policy are enforcement engines beneath this vocabulary. They do not create parallel user-facing permission words.

Compatibility note: HoloShell schema states such as `classified_per_app` are pre-classification states, and modes such as `manual_witness` are evidence modes. They must reduce to one of the three canonical envelopes before a receipt claims an action permission.

### Decision 3 - One receipt schema, reducible to Algebraic Trust

Every cross-surface trust receipt must extend the audit-event shape instead of inventing a new format. The minimal canonical receipt is:

```text
TrustReceipt
  receiptId
  schemaVersion
  recordedAt
  actor.passportDid
  actor.bindings[]              # lane id, wallet address, git key, shell actor id
  permissionEnvelope            # read_only | guarded_execute | break_glass
  action.name
  action.resource
  action.outcome                # success | failure | denied | staged | witnessed
  evidence.hashes[]
  evidence.nonce?
  evidence.commandHash?
  evidence.witnessRefs[]
  algebraicTrust.layer1Strategy
  algebraicTrust.layer2HistoryRef
  algebraicTrust.layer3OracleRef
  links.parentReceiptIds[]
  links.taskId?
  links.commit?
  storage.localLedgerRef
  storage.syncState             # local_only | synced | redacted_sync | sync_failed
```

The Algebraic Trust reduction is mandatory:

| W.GOLD.189 layer | Receipt field | Requirement |
|---|---|---|
| Layer 1 - algebra | `algebraicTrust.layer1Strategy` | Name the reducer: `authority_weighted`, `domain_override`, `strict_error`, `min_plus`, `max_plus`, or a documented successor. |
| Layer 2 - history | `algebraicTrust.layer2HistoryRef` | Point to an append-only history entry: CAEL event, audit-log sequence, git trailer, or ledger hash-chain node. |
| Layer 3 - oracle | `algebraicTrust.layer3OracleRef` | Point to the replay/witness oracle. Simulation and digital-twin receipts must use SimulationContract replay evidence; UI/hardware receipts may use visual witness or approval-bundle oracle but must not overclaim physics replay. |

This keeps W.GOLD.189 sharp: tropical or other semiring strategy is only Layer 1. A receipt cannot claim the full trust spine unless it names history and oracle evidence too.

### Decision 4 - Ed25519 and secp256k1 coexist under Passport DID

Do not unify the curves.

| Curve | Canonical use |
|---|---|
| Ed25519 | Agent Passport verification methods, Agentic JWT / PoP, UCAN capability chains, agent code-signing, SSH-style git signing. |
| secp256k1 | x402 seat wallets, EVM/EIP-191 request signing, EIP-712 typed-data when safe, payment and chain-attestation receipts. |

The Passport DID is the join-key that binds both verification families. A receipt that uses secp256k1 must include the wallet binding under `actor.bindings[]` and keep `actor.passportDid` as the subject. A receipt that uses Ed25519 must include the DID verification method or signing key id. Neither curve replaces the other.

For EIP-712 typed data, W.GOLD.514 applies: the requested `from` argument is advisory. Any typed-data path must pre-check the active account and post-recover the signer, or use an on-chain transaction path where the chain enforces `from`.

### Decision 5 - The unified receipt ledger is local-first with optional sync

The canonical ledger is an append-only local ledger on the user's hardware. Optional sync may copy, redact, summarize, or anchor receipts elsewhere, but sync is not the source of truth for personal trust history.

The first implementation may use NDJSON, SQLite, or an equivalent append-only local store, provided it exposes:

1. Receipt append with deterministic receipt id.
2. Query by Passport DID, permission envelope, action, outcome, resource, time range, task id, commit, and parent receipt.
3. Hash-chain or equivalent tamper-evident history reference for Layer 2.
4. Optional sync status per receipt.
5. Redaction controls so local private paths, secrets, and credential-adjacent data do not leak into browser or remote projections.

---

## 3. Anti-Decisions

These paths are explicitly rejected:

| Rejected path | Reason |
|---|---|
| Replace Ed25519 with secp256k1 everywhere | Breaks existing Passport, PoP, UCAN, and git-signing assumptions. |
| Replace secp256k1 wallets with Ed25519 everywhere | Breaks x402/EVM/payment paths and ignores G.GOLD.016 wallet identity. |
| Treat HoloShell `actorLaneId` as identity root | Lane ids are routing and presence hints, not durable identity. |
| Create a cloud-only receipt ledger | Violates the local-hardware trust promise and makes optional sync authoritative. |
| Let each surface keep its own receipt format | Keeps the exact triplication this ADR resolves. |
| Claim Algebraic Trust from a receipt with only Layer 1 | W.GOLD.189 requires algebra, history, and oracle to be named separately. |

---

## 4. Downstream Contract

Downstream work is unblocked when it follows this contract:

1. **Digital-twin promotion** uses Passport DID actors, three-envelope permissions, and receipts with SimulationContract replay references for Layer 3.
2. **HoloShell upstream candidates** map shell-object actions to the three envelopes and emit canonical receipts instead of HoloShell-only receipt shapes.
3. **Trust keystone ledger** builds local-first append/query storage for `TrustReceipt`, with optional sync metadata rather than remote-first storage.
4. **Trust-system convergence** binds seat wallets, lane ids, git signing keys, and shell actors to Passport DID without curve unification.
5. **Signed attribution hardening** may flip on separately, but its receipts must map into this schema.

---

## 5. Migration Path

### Phase 1 - Schema and validators

Add a HoloScript-owned `TrustReceipt` type, parser, and validator. The validator must reject:

- missing `actor.passportDid`,
- missing or non-canonical `permissionEnvelope`,
- missing Layer 1 / Layer 2 fields,
- missing Layer 3 for simulation/digital-twin receipts,
- secp256k1 receipts without signer recovery or transaction evidence,
- synced receipts that expose local-private or credential-adjacent fields without redaction metadata.

### Phase 2 - Surface adapters

Map existing local formats into the canonical schema:

| Existing source | Adapter obligation |
|---|---|
| HoloScript audit/provenance/SimulationContract | Emit `TrustReceipt` directly and attach SimulationContract replay references when available. |
| ai-ecosystem audit log and HoloMesh request signing | Bind actor to Passport DID plus secp256k1 wallet binding; preserve sequence number or hash-chain ref. |
| HoloShell action/run receipts | Preserve approval nonce, command hash, witness references, and shell-object id while reducing permission to the three envelopes. |
| Git commits | Treat commit hash and signing key as receipt links, not as the only receipt. |

### Phase 3 - Local ledger

Ship the append/query ledger. The product surface should show one timeline per Passport DID, with filters for envelope, resource, receipt type, and sync state.

### Phase 4 - Optional sync and anchoring

Add sync only after local append/query works. Remote stores, HoloMesh knowledge, public feeds, or chain anchors consume redacted receipts or receipt hashes, not raw local-private receipts by default.

---

## 6. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|
| DID binding becomes a label with no verification | Medium | High | Require each binding to name proof type, verifier, and last verified timestamp. |
| Three envelopes hide enforcement nuance | Medium | Medium | Keep RBAC/UCAN/RiskRegistry below the envelope as machine-readable enforcement metadata. |
| Receipt schema becomes too broad to implement | Medium | High | Start with the minimal fields in this ADR and adapters for three existing sources. |
| Local-first ledger conflicts with team coordination | Low | Medium | Sync receipt hashes and redacted summaries; keep raw local ledger authoritative. |
| UI receipts overclaim SimulationContract trust | Medium | High | Validator distinguishes witness or approval oracle from SimulationContract replay oracle. |

---

## 7. Verification

Evidence read for this decision:

```bash
Get-Content -Raw C:/Users/josep/.ai-ecosystem/research/2026-05-14_studio-rethink-ideas-to-fruition-TRUST-SPINE.md
Get-Content -Raw packages/core/src/compiler/identity/AgentPassport.ts
Get-Content -Raw packages/core/src/compiler/identity/AgentIdentity.ts
Get-Content -Raw packages/core/src/audit/AuditLogger.ts
Get-Content -Raw C:/Users/josep/.ai-ecosystem/docs/ops/audit-log.ts
Get-Content -Raw C:/Users/josep/Documents/GitHub/Hololand/apps/holoshell/docs/SHELL_OBJECT_SCHEMA.md
Get-Content -Raw C:/Users/josep/Documents/GitHub/Hololand/apps/holoshell/source/holoshell-brittney-presence.hsplus
Get-Content -Raw C:/Users/josep/Documents/GitHub/Hololand/apps/holoshell/source/holoshell-os-ui-capture.hsplus
Get-Content -Raw C:/Users/josep/.ai-ecosystem/hooks/lib/holomesh-signing.mjs
Get-Content -Raw D:/GOLD/wisdom/w_gold_189.md
Get-Content -Raw D:/GOLD/wisdom/w_gold_013.md
Get-Content -Raw D:/GOLD/gotchas/g_gold_016.md
Get-Content -Raw D:/GOLD/wisdom/w_gold_514.md
```

Docs-only validation command for this ADR:

```bash
git diff --check -- docs/architecture/2026-05-14_trust-primitives-decision-record.md
```

---

## 8. References

- `C:/Users/josep/.ai-ecosystem/research/2026-05-14_studio-rethink-ideas-to-fruition-TRUST-SPINE.md`
- `C:/Users/josep/.ai-ecosystem/research/2026-04-21_seat-wallets-adr.md`
- `packages/core/src/compiler/identity/AgentPassport.ts`
- `packages/core/src/compiler/identity/AgentIdentity.ts`
- `packages/core/src/audit/AuditLogger.ts`
- `C:/Users/josep/.ai-ecosystem/docs/ops/audit-log.ts`
- `C:/Users/josep/.ai-ecosystem/hooks/lib/holomesh-signing.mjs`
- `C:/Users/josep/Documents/GitHub/Hololand/apps/holoshell/docs/SHELL_OBJECT_SCHEMA.md`
- `C:/Users/josep/Documents/GitHub/Hololand/apps/holoshell/source/holoshell-brittney-presence.hsplus`
- `C:/Users/josep/Documents/GitHub/Hololand/apps/holoshell/source/holoshell-os-ui-capture.hsplus`
- W.GOLD.189 - Algebraic Trust tri-layer framing.
- W.GOLD.013 - Trust by Construction and SimulationContract guarantees.
- G.GOLD.016 - Wallets are identity; do not overwrite wallet env vars.
- W.GOLD.514 - EIP-712 typed-data `from` is advisory.

---

## 9. Decision Summary

| Question | Answer |
|---|---|
| What is the canonical identity join-key? | Passport DID. |
| What is the canonical permission vocabulary? | `read_only`, `guarded_execute`, `break_glass`. |
| What is the canonical receipt shape? | One `TrustReceipt` extending audit events and reducible to W.GOLD.189 layers. |
| Should Ed25519 and secp256k1 unify? | No. They coexist under Passport DID. |
| Where does the receipt ledger live? | Local-first on the user's hardware, with optional sync. |
| What work is unblocked? | Digital-twin promotion, HoloShell upstream candidates, trust keystone ledger, and trust-system convergence. |

**Next review date:** After the first `TrustReceipt` validator and local ledger implementation land, or when a downstream task needs a new envelope or curve binding.
