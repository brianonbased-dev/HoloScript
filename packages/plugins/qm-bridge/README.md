# @holoscript/qm-bridge

Quantum mechanics bridge plugin for HoloScript. It routes molecular,
solid-state, semi-empirical, quantum-circuit, PySCF, and Quantinuum workloads
through the shared SimulationContract solver surface.

## Install

```bash
npm install @holoscript/qm-bridge
```

## Use

```ts
import { createQmSolver, groupPauliTerms, selectQmBackend } from '@holoscript/qm-bridge';
```

## Package Surface

| Surface             | Purpose                                           |
| ------------------- | ------------------------------------------------- |
| `createQmSolver`    | Construct a backend-specific QM solver            |
| `selectQmBackend`   | Route question/workload shape to a backend        |
| `QmSolver` types    | Shared SimulationContract-compatible QM contracts |
| Psi4 backend        | Molecular CCSD/DFT style workloads                |
| Quantum ESPRESSO    | Solid-state and materials workloads               |
| TBLite backend      | Semi-empirical screening workloads                |
| IBM Quantum backend | VQE and QAOA circuit workloads                    |
| PySCF backend       | PBC/materials and Hamiltonian export              |
| Quantinuum backend  | Logical-qubit and QEC receipt workflows           |
| Pauli grouping      | Measurement basis and cost helpers                |
| CAEL mapping        | QM solver config/result recording discipline      |

## Packaging Note

This package is currently source-first: `main` and `types` point at
`src/index.ts`, and the npm `files` list publishes source plus the plugin
manifest. Do not switch it to `dist` entrypoints without a dedicated
dual-export hardening pass and runtime smoke test.

## Strategy Role

This is a long-tail scientific domain plugin. Keep it installable and
documented, but do not promote it into a default fleet package lane unless a
concrete quantum, chemistry, materials, laptop, Jetson, or Vast workload needs
the bridge directly.

## Validation

```bash
corepack pnpm --filter @holoscript/qm-bridge run build
corepack pnpm --filter @holoscript/qm-bridge run test
```
