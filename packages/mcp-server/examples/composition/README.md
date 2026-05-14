# Composition Examples

End-to-end composition demos that prove HoloScript primitives compose into complete cycles. These are **maintained examples** — each ships with:

1. A `.holo` file naming the cycle as a contract (not a renderable scene)
2. A `.test.ts` file with runnable headless wiring (happy-path + G.GOLD.013 false-case pairs)
3. CI coverage via `mcp-quality-gate.yml`

## What is a Composition Demo?

A composition demo proves that multiple primitives shipped independently **compose** into a complete end-to-end cycle. Unlike feature tests that validate one primitive in isolation, composition demos verify:

- **Interoperability**: Primitives accept each other's outputs
- **State machine continuity**: One agent's output becomes another's input
- **Economic + cryptographic + spatial composition**: The full stack works together

## Maintained Examples

### Agentic Internet Cycle (`agentic-internet-demo.*`)

**Task**: `task_1778125252148_qe2i`
**Shipped**: 2026-05-07
**Primitives composed**: 5

| Step | Primitive | Source Commit | Purpose |
|------|-----------|---------------|---------|
| [1/5] | `SpatialMCPContext` | `jira 57fae81ba+ed284b32f+e134ee1c6` | VR user emits gaze + hands + room context |
| [2/5] | `MeshToolRegistry` | `yqll e9942dc9e+1419cce6d` | Discover + invoke tools via capability tags |
| [3/5] | `AgentNegotiation` | `xsp6 cbdab1387` | Quote → accept → execute → settle cycle |
| [4/5] | `VaultLease` | `u8q2 16f5014be` | Task-scoped credential resolution |
| [5/5] | `HologramMcpResponse` | `zp7u 642ab1d75` | Return typed hologram envelope to chat |

**Phases**:
- **Phase 1** (task_1778125252148_qe2i): Initial composition with local invoker stub
- **Phase 2** (task_1778132217125_nme4): Real AlphaFold fetch against EBI API
- **Phase 3** (task_1778144945320_979p): Chain-anchor settlement via `eth_sendTransaction`

**Run the test**:
```bash
cd packages/mcp-server
pnpm test examples/composition/agentic-internet-demo.test.ts
```

**Expected output**: 11 tests pass (1 happy-path full-cycle + 10 G.GOLD.013 false-case pairs)

**False-case coverage**:
| Happy-path assertion | Paired false-case |
|---------------------|-------------------|
| `validateSpatialContext(ctx).ok === true` | Non-unit gaze direction rejected |
| `verifyMeshToolAttestation(manifest) === true` | Tampered `capabilityTags` fails |
| `advanceNegotiation('accept', initiator).ok === true` | Responder accepting own quote → `wrong-actor` |
| `issueLease(env:ALPHAFOLD_API_KEY).ok === true` | `env:HOLOMESH_WALLET_KEY` → `wallet_unleasable` |
| `resolveSecret(in-scope-ref).resolved === true` | Out-of-scope ref → `lease_scope_violation` |
| `detectHologramContent(envelope) !== null` | Plain text / null / random → `null` |
| `verifyMeshToolInvocationChain([hop]).verified === true` | Tampered `argsHash` breaks chain |
| Runtime fetch SHAPE matches AlphaFold schema | Upstream 404 surfaces correctly |
| `settleNegotiationWithAnchor` succeeds | Signer failure → no finalization |

**Founder vision check**: "HoloScript = interface of internet+VR." This demo is the receipt that the five primitives shipped 2026-05-06 compose into one signed cycle.

## Adding a New Composition Example

1. Create `<name>.holo` — names the cycle as a contract
2. Create `<name>.test.ts` — happy-path + G.GOLD.013 false-case pairs
3. Update this README with the new example
4. Ensure CI runs via `vitest.config.ts` include pattern

## CI Coverage

All composition examples run in GitHub Actions:
- **Workflow**: `.github/workflows/mcp-quality-gate.yml`
- **Trigger**: Push/PR to `main` touching `packages/mcp-server/**`
- **Job**: `pnpm --filter @holoscript/mcp-server test`
- **Config**: `vitest.config.ts` includes `examples/**/*.test.ts`

## Related Documentation

- Research memo: `research/2026-05-06_agentic-internet-composition-demo.md`
- G.GOLD.013: Test false-case discipline
- G.GOLD.016: Wallet keys are unleasable
- W.GOLD.514 + F.041: Chain-anchor pattern (eth_sendTransaction bypasses EIP-712 canonicalization rot)
