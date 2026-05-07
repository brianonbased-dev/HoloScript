# Agentic Internet Composition Demo — task_1778125252148_qe2i

> **Shipped:** 2026-05-07 (marathon round, claudecode-claude-x402)
> **Task:** `task_1778125252148_qe2i`
> **Pattern:** marathon-mode shipping, same as u8q2 / jira / zp7u / xsp6 earlier this session.
> **Vision check:** "HoloScript = interface of internet+VR." This demo is the receipt that the five primitives shipped 2026-05-06 do not just exist in isolation — they compose.

## What landed

| File | Purpose |
|------|---------|
| `packages/mcp-server/examples/composition/agentic-internet-demo.holo` | Single `.holo` that names every node in the chain (VR user → spatial context → mesh tool routing → negotiation → vault lease → hologram). Reads as a contract, not a renderable scene. |
| `packages/mcp-server/examples/composition/agentic-internet-demo.test.ts` | Runnable headless wiring. Imports the real primitives, exercises one happy-path cycle end-to-end, and pairs every computed assertion with a G.GOLD.013 false-case test. |
| `research/2026-05-06_agentic-internet-composition-demo.md` (this file) | Memo + screen-recordable script. |

**Path note (intentional placement).** The task description names `examples/composition/...`, but the root vitest config excludes `**/examples/**`. Only `packages/mcp-server/vitest.config.ts` includes `examples/**/*.test.ts`. Files therefore live under `packages/mcp-server/examples/composition/` so the test actually runs in the repo's standard CI lane. The relative path inside the package matches the task spec; the `packages/mcp-server/` prefix exists only to land in vitest's discovery scope.

## The five primitives, in cycle order

Each primitive is one commit shipped 2026-05-06. The demo composes them in the order the agentic-internet narrative needs:

1. **SpatialMCPContext** (jira `57fae81ba`+`ed284b32f`+`e134ee1c6`) — VR user emits a 3D-context payload (gaze + hands + room geometry). Validator enforces `version='0.1'`, `frame='tracking-space-y-up-meters'`, unit gaze direction. `pickPlacement` resolves the gaze-hit point so downstream tools know where to put the answer.
2. **Mesh tool registry / `holomesh_invoke_tool`** (yqll `e9942dc9e`+`1419cce6d`) — the responder agent (Brittney chat) publishes an `alphafold_fetch_structure` manifest with capability tags. The VR user discovers it via `discoverMeshTools('hologram alphafold')`. Attestation hash is verified before invocation; tampering with `capabilityTags` after publish flips the attestation.
3. **Agent negotiation** (xsp6 `cbdab1387`) — `createNegotiation` opens the cycle, `advanceNegotiation('quote')` by responder, `advanceNegotiation('accept')` by initiator, `advanceNegotiation('execute')` by responder, `settleNegotiation` co-signs the receipt. Wrong-actor transitions (responder accepting their own quote) are rejected.
4. **Vault lease registry** (u8q2 `16f5014be`) — mid-negotiation, Brittney needs `ALPHAFOLD_API_KEY`. `issueLease` binds the credential to (taskId, agentId) for ≤24h. `resolveSecret` enforces scope; out-of-scope refs return `lease_scope_violation`. **G.GOLD.016 invariant**: wallet refs are permanently unleasable — `env:HOLOMESH_WALLET_KEY` returns `wallet_unleasable` and never persists state.
5. **HologramMcpResponse** (zp7u `642ab1d75`) — the executor (Brittney) returns the rendered structure as `application/holoscript+holo` content_type. `wrapHologramMcpEnvelope` produces the MCP dispatch envelope; the chat client's `detectHologramContent` picks it up and routes to `/hologram`. Plain text envelopes return null from the detector — chat-only fallback works without breaking hologram-aware clients.

## Cycle anatomy

```
VRUser (Quest 3)                                    BrittneyChat (Studio)
     │                                                       │
     │ [1] SpatialMCPContext                                 │
     │     (gaze [0,1.65,0] -> [0,0,-1], hit 0.5)           │
     │ ────────────────────────────────────────────────────► │
     │                                                       │
     │ [2] discoverMeshTools('hologram alphafold')           │
     │ ────────────────────────────────────────────────────► │
     │                                       publishes manifest:
     │                              alphafold_fetch_structure
     │                                manifestHash: <sha256>
     │                                                       │
     │ [3a] createNegotiation('open')                        │
     │ ────────────────────────────────────────────────────► │
     │ [3b] quote: 0.05 USDC, 30s SLA  (responder signs)     │
     │ ◄──────────────────────────────────────────────────── │
     │ [3c] accept (initiator signs)                         │
     │ ────────────────────────────────────────────────────► │
     │                                                       │
     │              [4] issueLease(env:ALPHAFOLD_API_KEY)    │
     │              resolveSecret(...) = { resolved: true }  │
     │              audit event: vault_lease_resolve_secret  │
     │                                                       │
     │              [3d] execute (responder signs)           │
     │              invokePublishedMeshTool(...)             │
     │                                                       │
     │ [3e] settleNegotiation (both sign)                    │
     │      receipt.resultHash = 0x<sha256>                  │
     │ ◄──────────────────────────────────────────────────── │
     │                                                       │
     │ [5] HologramMcpEnvelope                               │
     │     content_type: application/holoscript+holo         │
     │     payload.kind: hash                                │
     │     hints.preferredViewer: quilt                      │
     │ ◄──────────────────────────────────────────────────── │
     │                                                       │
     │              revokeLeasesForTask('task_completed')    │
     │                                                       │
     ▼                                                       ▼
   chat surface renders hologram via                  cycle complete
   /hologram route (gaze-hit position)
```

## Test results

```
$ cd packages/mcp-server && npx vitest run examples/composition/agentic-internet-demo.test.ts

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Duration  16.74s
```

**8 tests = 1 happy-path full-cycle + 7 G.GOLD.013 false-case pairs:**

| Happy-path assertion | Paired false-case |
|----------------------|-------------------|
| `validateSpatialContext(ctx).ok === true` | non-unit gaze direction `[1,1,1]` rejected with `gaze.direction` error |
| `verifyMeshToolAttestation(manifest) === true` | tampered `capabilityTags` flips verification false |
| `advanceNegotiation('accept', initiator).ok === true` | responder accepting own quote returns `wrong-actor` |
| `issueLease(env:ALPHAFOLD_API_KEY).ok === true` | `env:HOLOMESH_WALLET_KEY` returns `wallet_unleasable` (G.GOLD.016) |
| `resolveSecret(in-scope-ref).resolved === true` | out-of-scope ref returns `lease_scope_violation` |
| `detectHologramContent(envelope) !== null` | plain text envelope / null / random object all return null |
| `verifyMeshToolInvocationChain([hop]).verified === true` | tampered `argsHash` breaks chain verification |

The false-case discipline matters: if any of these primitives regressed to "always returns success," the happy-path tests would still pass but the paired false-case tests would flip red. That's the whole point of G.GOLD.013.

## Screen-recordable script (90 seconds)

For a Loom / Quest 3 capture demonstrating the chain:

**00:00–00:10** — Title card: "HoloScript = interface of internet+VR. The five primitives shipped 2026-05-06 compose into one cycle."

**00:10–00:20** — Open `agentic-internet-demo.holo` in Studio. Read the `@world` block: `task_1778125252148_qe2i`, shipped `2026-05-07`. Show the two agents (`VRUser`, `BrittneyChat`) and the five-step `agentic_internet_cycle` skill block.

**00:20–00:30** — Switch to terminal. Run `npx vitest run examples/composition/agentic-internet-demo.test.ts`. Show "8 passed" + duration.

**00:30–00:55** — Walk the cycle in `agentic-internet-demo.test.ts` from top to bottom, reading the `// ── [N/5]` headers aloud:
- [1/5] SPATIAL — `validateSpatialContext` ok, `pickPlacement` returns `'gaze-hit'` at `[0, 1.65, -0.5]`.
- [2/5] ROUTING — `publishMeshToolManifest` → `discoverMeshTools('hologram alphafold')` finds 1 manifest.
- [3/5] NEGOTIATION (a/b/c) — `open` → `quoted` (0.05 USDC) → `accepted` → `executed` → `settled` with co-signed receipt + `resultHash` matching `0x[0-9a-f]{64}`.
- [4/5] VAULT LEASE — `issueLease` ok, `resolveSecret` returns `resolved: true` for `env:ALPHAFOLD_API_KEY`. Audit event recorded.
- [5/5] HOLOGRAM — `buildHologramMcpResponse` → `wrapHologramMcpEnvelope` → `detectHologramContent` returns the typed channel.

**00:55–01:15** — Highlight one false-case: open the `wallet_unleasable` test, change the scope from `env:HOLOMESH_WALLET_KEY` to `env:ALPHAFOLD_API_KEY` (a leasable ref), re-run. Test fails. Revert. Test passes. **This is the receipt that the chain enforces invariants, not just executes.**

**01:15–01:30** — Close on `agentic-internet-demo.holo` showing the cycle as a contract. State: "Five primitives composed. One signed receipt. One hologram. The substrate is whole."

## Why this matters (founder-vision check)

The 17-paper program (D.010) and the agentic-internet directive aren't separable from the substrate. A paper that claims "HoloScript composes spatial + economic + cryptographic primitives end-to-end" survives reviewer scrutiny only if `npx vitest run` proves it. This file IS that proof for the 5 primitives shipped 2026-05-06.

The substrate posture (D.022 Absorb = user-facing GOLD storage; D.026 HoloScript Absorbs Everything for Sovereignty; F.037 Papers Are The Product) treats every shipped capability as both a product feature and a paper claim. This demo lands the bottom rung of that ladder for the agentic-internet thread: **the five primitives are not just scaffolded — they hold weight when stitched together.**

## Caveats

- The cycle uses an **in-process local invoker** stub for the AlphaFold tool (`localInvoker: async (toolName, args) => ({...})`). Hitting real AlphaFold over HTTP is a separate task; the demo proves the COMPOSITION, not the upstream service. The hop's `argsHash` and the negotiation's `resultHash` cover the data; the API call is a Phase-2 wiring (W.GOLD.191 frame discipline — ship what you can verify).
- The settlement signatures (`0xinitiatorsig_demo`, `0xrespondersig_demo`) are placeholder hex — production would use the W.GOLD.514-pattern chain anchor (`eth_sendTransaction` with EIP-712 hash as calldata) so the receipt is dispute-resistant by construction. The demo's `settlementTxHash` field is left undefined intentionally; a follow-up can wire Base-RPC tx anchoring.
- The vault lease's `resolveSecret` returns a boolean `resolved` flag, not the raw secret value. Phase-2 (per `vault-lease-registry.ts:60`) will wrap this with a `resolveSecretWithLease(taskId, ref)` adapter that fetches from `process.env`. Today the registry IS the substrate; the value adapter is a separate commit.

## Stacks on / superseded by

**Stacks on:**
- jira `57fae81ba`+`ed284b32f`+`e134ee1c6` — SpatialMCPContext schema + spatial-mcp tool + spec.
- yqll `e9942dc9e`+`1419cce6d` — mesh-native tool registry + invocation chain verification.
- xsp6 `cbdab1387` — agent negotiation primitives + signed message channel.
- u8q2 `16f5014be` — task-scoped credential vault leases.
- zp7u `642ab1d75` — hologram content_type protocol for MCP tools.

**Stacked beneath (next steps, not this commit):**
- Real AlphaFold HTTP hop instead of local invoker stub.
- Chain-anchor settlement (W.GOLD.514 EIP-712-via-tx pattern).
- Phase-2 `resolveSecretWithLease` adapter wrapping critical .env reads (Phase 1 issue noted in `vault-lease-registry.ts:60`).
- Studio chat client `/hologram` route consuming the envelope live (today validated by `detectHologramContent` only).

## Provenance

- **Branch:** `claude/heuristic-taussig-22fa0a`
- **Marathon round:** continuation of founder directive "commence all" (this session shipped u8q2, jira, zp7u, xsp6, and now qe2i).
- **F.040 / F.044 calibration:** confirmed before claim — peer activity verified via `git log --since='48 hours ago'` against all five primitive paths; no collisions.
- **GOLD context honoured:** P.GOLD.003 (uncoordinated convergence), P.GOLD.004 (Proof-of-Play — interaction as computation attestation), G.GOLD.013 (false-case discipline), G.GOLD.016 (wallets unleasable).
