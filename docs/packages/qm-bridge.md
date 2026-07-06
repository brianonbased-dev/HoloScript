# @holoscript/qm-bridge

`@holoscript/qm-bridge` is the quantum mechanics bridge plugin for HoloScript.
It wraps Psi4, Quantum ESPRESSO, TBLite, IBM Quantum, PySCF, and Quantinuum
workloads behind shared SimulationContract and CAEL recording contracts.

## Install

```bash
npm install @holoscript/qm-bridge
```

## Use

```ts
import {
  createQmSolver,
  groupPauliTerms,
  selectQmBackend,
} from '@holoscript/qm-bridge';
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
manifest. Treat a future `dist` entrypoint migration as its own hardening pass.

## Strategy Role

This package is domain plugin inventory, not a default fleet install. Use it
when quantum, chemistry, materials, or scientific simulation workloads need the
QM bridge directly.

## Validation

```bash
corepack pnpm --filter @holoscript/qm-bridge run build
corepack pnpm --filter @holoscript/qm-bridge run test
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```
