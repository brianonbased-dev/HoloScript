# @holoscript/qm-bridge

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
