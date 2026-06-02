/**
 * EXP-1 — IR-vs-NL context-efficiency + offload bench (zero-GPU).
 * Public surface for the HoloScript-native-model thesis's first falsifiable experiment.
 */
export * from './types';
export * from './runner';
export * from './metrics';
export { EXP1_FIRST_SLICE } from './tasks';
export { parseMutation } from './parseMutation';
export { assembleArmPrompt, EXP1_SYSTEM_PROMPT } from './promptAssembly';
export { makeProviderArm, type ProviderArmOptions } from './providerArm';
export { runExp1Live, type Exp1RunConfig } from './run';
