# Gate 47 Ratchet Branch Adjudication

Date: 2026-07-23  
Branch reviewed: `codex/gate-47-ratchet`  
Reviewed tip: `6c9274fa3725fd006c6052cb8c3a45cfc3680bdc`  
Disposition: **do not merge or cherry-pick the branch**

## Decision

Thirteen of the branch's fourteen changes are already represented on `main`:
nine are patch-equivalent and four landed through replacement commits. The only
remaining change, `0d625b752`, is rejected because it duplicates the canonical
vault promotion algorithm inside its verifier and collides with the current
meaning of Gate 47, `Light the Vault`.

The separately named branch `codex/memory-index-repo-default` was not folded,
deleted, or recreated. It was absent from both the local branch inventory and
`origin` when checked.

## Commit Adjudication

| Branch commit                              | Main disposition          | Evidence                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0d625b752` Gate 47 sandbox promotion      | Rejected                  | Reimplements promotion instead of invoking `vault-ops.cjs`; its gated real-vault smoke can skip successfully and returns success even after `readOk` becomes false. Current Gate 47 is `gate-47-light-the-vault-verify.mjs`. |
| `314e0c2ff` Holo Twin stub labels          | Already patch-equivalent  | `git cherry main codex/gate-47-ratchet` reports `-`.                                                                                                                                                                         |
| `ba3463889` Paper 26 handler labels        | Already patch-equivalent  | `git cherry` reports `-`.                                                                                                                                                                                                    |
| `2466e53bd` VQE SHA-256                    | Replaced and strengthened | Replacement `4f2fd2bf7`; current-main reconciliation additionally exposes and independently verifies the canonical receipt payload and calls the real `runVQE()` backend seam.                                               |
| `dece8d3a8` robot actuation stub label     | Already patch-equivalent  | `git cherry` reports `-`.                                                                                                                                                                                                    |
| `edb29930c` LifePod registered labels      | Already patch-equivalent  | `git cherry` reports `-`.                                                                                                                                                                                                    |
| `13ce3f8a3` visual-trait labels            | Already patch-equivalent  | `git cherry` reports `-`.                                                                                                                                                                                                    |
| `052831f26` sovereign topology / AI labels | Replaced and strengthened | Replacement `738d65c7a`; current-main reconciliation routes the sovereign tool to the mcp-server HoloMesh API rather than the knowledge orchestrator and preserves the synthetic-preview boundary.                           |
| `d0ed6fe27` Twin Earth / HoloLand labels   | Replaced and corrected    | Replacement `0bc95a107`; current-main reconciliation recognizes durable snapshot persistence and real MCP actuation gating while bounding the safety envelope to the application seam.                                       |
| `99a8efd5b` SNN WebGPU label               | Already patch-equivalent  | `git cherry` reports `-`.                                                                                                                                                                                                    |
| `a998b75ec` plugin discovery label         | Already patch-equivalent  | `git cherry` reports `-`.                                                                                                                                                                                                    |
| `ac328201e` portal label                   | Already patch-equivalent  | `git cherry` reports `-`.                                                                                                                                                                                                    |
| `30ca1d6d3` VRChat compiler label          | Already patch-equivalent  | `git cherry` reports `-`.                                                                                                                                                                                                    |
| `6c9274fa3` medical plugin label           | Replaced and corrected    | Replacement `a16d35e9f`; current-main wording now includes the Parkland runtime and in-memory FHIR/HL7 serializers without claiming DICOM, surgical rendering, or live clinical connectivity.                                |

## Deep-Ratchet Corrections on Current Main

The review found newer code that made parts of the old labels stale:

- `VQERunnerTrait` previously called a test-only `.vqe()` method while the real
  qm-bridge backend exposes `.runVQE()`. The trait now calls the real seam,
  maps the backend result shape, records the backend's actual optimizer,
  and emits the exact `hashPayload` committed by `payloadHash`.
- `quantum_receipt_verify.py` now recognizes the
  `cael-quantum-v1.vqe-runner` camel-case receipt shape and recomputes its
  canonical SHA-256.
- Sovereign topology exists as a deterministic mcp-server preview route, but
  the tool had still defaulted to the 45f9 knowledge-orchestrator host. It now
  uses the canonical HoloMesh API base and `x-mcp-api-key` convention. The tool
  description explicitly says the graph is modeled, not live discovery or
  telemetry.
- Twin Earth registry state is persisted by default outside tests, and robot
  actuation uses `gatedDispatch`. Wording now reflects those facts while
  retaining the application-boundary, simulated-AI, unverified-attestation,
  and in-memory HoloLand caveats.
- Medical DICOM viewing and surgical planning remain type-only. Parkland
  runtime support and in-memory serializers are real, but live FHIR/HL7
  connectivity is not.

This follows `W.GOLD.002`: qm-bridge remains an external execution adapter,
while receipt semantics, verification, and orchestration correctness are owned
by HoloScript's sovereign core/runtime surfaces.

## Verification

- `pnpm --dir packages/core exec vitest run src/traits/__tests__/VQERunnerTrait.test.ts`
  — 16 passed.
- `pnpm --dir packages/plugins/qm-bridge exec vitest run __tests__/ibm-quantum.test.ts`
  — 2 passed.
- `pnpm --dir packages/mcp-server exec vitest run src/__tests__/capability-honesty-ratchet.test.ts src/__tests__/robot-ai-mcp-tools.test.ts`
  — 67 passed.
- `pnpm --dir packages/plugins/medical-plugin test` — 54 passed.
- `pnpm --dir packages/core build` — passed.
- `pnpm --dir packages/mcp-server build` — passed.
- `pnpm --dir packages/plugins/qm-bridge build` — passed.
- Independent Python import/probe recomputed the VQE runner camel-case receipt
  hash — passed.
- Prettier check on all changed TypeScript files — passed.
- `git diff --check` on the scoped change set — passed.

The medical plugin's JavaScript bundle completed, but its declaration phase
still cannot resolve the existing peer-only `@holoscript/core` dependency. That
package-local build gap predates and is independent of the documentation-only
medical wording change; the plugin's full 54-test suite passed.
