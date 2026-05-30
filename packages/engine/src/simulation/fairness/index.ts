/**
 * Verifiable fairness sweep — governed, replayable algorithmic-fairness
 * evaluation on the HoloScript experiment engine. Domain-free core (D.007):
 * the model, cohort, and population perturbation are injected by the `.holo`
 * domain bridge for a given regulated vertical.
 *
 * @see ./FairnessSweep — orchestration on the real ExperimentOrchestrator + UQ
 * @see ./FairnessReceipt — sovereign receipt reusing the SimulationContract
 *   hash chokepoint + Guarantee-6 replay discipline (not the physics receipt)
 */

export {
  runFairnessSweep,
  runFairnessRobustness,
  analyzeDisparity,
  defaultPerturber,
  mulberry32,
  type FairnessModel,
  type FairnessRecord,
  type FairnessPerturbation,
  type CohortPerturber,
  type FairnessSweepOptions,
  type FairnessSweepResult,
  type FairnessRobustnessOptions,
  type FairnessRobustnessResult,
} from './FairnessSweep';

export {
  emitFairnessReceipt,
  emitRobustnessReceipt,
  computeReplayFingerprint,
  computeDecisionDigest,
  verifyReceiptIntegrity,
  replayFairnessReceipt,
  verifyReplayExecution,
  canonicalize,
  hashContent,
  DEFAULT_FAIRNESS_CROSSWALK,
  DEFAULT_ROBUSTNESS_CROSSWALK,
  type DeterminismGrade,
  type FairnessMetrics,
  type FairnessReplayKey,
  type FairnessReceipt,
  type FairnessRobustnessReceipt,
  type RobustnessBand,
  type ReplayVerdict,
  type EmitFairnessReceiptParams,
  type EmitRobustnessReceiptParams,
} from './FairnessReceipt';
