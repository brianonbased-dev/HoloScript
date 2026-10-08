# @holoscript/qm-bridge

## 1.1.0

### Minor Changes

- 5980f9a: Add CliffordDiagonalization: entangled measurement circuits for general-commuting Pauli groups. `groupPauliTerms` colors on general commutativity (N2: 383 terms → 22 groups, matching IBM's 21), but its single-qubit measurement bases can only realize qubit-wise-commuting groups — for N2, 1 of the 22. `diagonalizeCommutingGroup` synthesizes the Clifford circuit (h/s/sdg/cx/cz) that simultaneously diagonalizes any pairwise-commuting group via symplectic tableau elimination, with exact CHP sign tracking that doubles as a built-in validator (a non-diagonal result throws instead of shipping a wrong circuit). Also: `measurementPlanForGroup` (PauliGrouping integration), `expectationFromCounts` (bitstring → energy reconstruction, qiskit or qubit-index bit order), `measurementCircuitQasm3` (OpenQASM 3 emission), and a corrected PauliGrouping docstring citing the measured N2 receipt.

### Patch Changes

- Updated dependencies
  - @holoscript/engine@6.1.9

## 1.0.2

### Patch Changes

- Updated dependencies [c64fc1a]
- Updated dependencies [6dc9732]
  - @holoscript/core@8.0.6
  - @holoscript/engine@6.1.3

## 1.0.0

### Patch Changes

- Updated dependencies [c6e69b8]
- Updated dependencies [440e163]
  - @holoscript/engine@6.1.0
  - @holoscript/core@6.1.0

### BYOK Reality (F.066 ratchet)

Every code path reaching IBM Runtime requires an API key in caller scope:

- `config.apiToken` or `process.env.IBM_QUANTUM_API_KEY` (ibm-quantum.ts)
- `IBM_QUANTUM_API_KEY` env var (quantum_execute.py)
  No MCP tool, no orchestrator endpoint, no server-side proxy holds a key on behalf of callers.
  "Managed quantum" (F.066) is a direction/planned gateway, not a current capability.
  All quantum access is BYOK until a managed gateway is built.
