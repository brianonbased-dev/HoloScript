/**
 * EXP-1 — IR-vs-NL context-efficiency + offload bench (zero-GPU).
 * Public surface for the HoloScript-native-model thesis's first falsifiable experiment.
 */
export * from './types';
export * from './runner';
export * from './metrics';
export { EXP1_FIRST_SLICE } from './tasks';
export { EXP1_EXTENDED, EXP1_FULL_SUITE } from './tasks-extended';
export { parseMutation } from './parseMutation';
export { assembleArmPrompt, EXP1_SYSTEM_PROMPT } from './promptAssembly';
export { makeProviderArm, type ProviderArmOptions } from './providerArm';
export { curatedOffload } from './offload';
export {
  localProvider,
  frontierBaselineProvider,
  SOVEREIGN_BASELINE_MODEL,
  SOVEREIGN_LITE_MODEL,
  type Exp1Provider,
} from './exp1Provider';
export { runExp1Live, runTier, type Exp1RunConfig, type RunTier } from './run';
export {
  bootstrapDiffCI,
  passRateDiffCI,
  analyzeReport,
  buildExp1Receipt,
  type CI,
  type DomainStat,
  type Exp1Analysis,
  type Exp1Receipt,
} from './analysis';
