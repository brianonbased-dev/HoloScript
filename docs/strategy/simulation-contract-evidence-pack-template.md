# SimulationContract Evidence Pack Template

> Version: 0.1.0
> Runtime implementation: `packages/engine/src/simulation/SimulationEvidencePack.ts`
> Recorder surface: `packages/engine/src/simulation/CAELRecorder.ts`
> CLI verifier: `pnpm run simulation:verify <pack.json>`

SimulationContract evidence packs are HoloScript's certification-oriented proof bundle for simulation runs. The posture is compete-on-replayable-evidence, not clone Simulink: HoloScript does not reproduce proprietary Simulink workflows, but it does make requirements traceability, deterministic replay, provenance, tolerance bounds, generated artifacts, hardware evidence, and independent verification machine-readable.

Every pack has these top-level keys:

```text
packId
schemaVersion
createdAt
simulationRunId
contractId
requirements
solverConfig
replay
provenance
toleranceTable
generatedArtifacts
hardwareValidation
verificationResult
```

`CAELRecorder.finalizeEvidencePack()` emits the pack from the active `ContractedSimulation` run. `simulation:verify` independently validates that the pack includes the requirements link, frozen solver config, deterministic replay, provenance hash, tolerance table, generated artifact hashes, hardware validation block, and verification result.

The `verificationResult.followUpAffordances` field is intentionally stable for later product work:

- Studio MBSE requirements-link UI can bind to `requirements.requirementSource` and `requirements.acceptanceCriteria`.
- HIL replay harnesses can bind to `replay`, `provenance`, `hardwareValidation`, and `generatedArtifacts`.

This is the open evidence layer around HoloScript simulations. It should be used to prove rigor, not to imply parity with specialized proprietary engineering platforms.
