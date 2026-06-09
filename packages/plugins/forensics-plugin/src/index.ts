export { evidenceChainHandler, EVIDENCE_CHAIN_TRAIT } from './traits/EvidenceChainTrait';
export type { EvidenceChainConfig } from './traits/EvidenceChainTrait';

export {
  sceneReconstructionHandler,
  SCENE_RECONSTRUCTION_TRAIT,
} from './traits/SceneReconstructionTrait';
export type { SceneReconstructionConfig } from './traits/SceneReconstructionTrait';

export { chainOfCustodyHandler, CHAIN_OF_CUSTODY_TRAIT } from './traits/ChainOfCustodyTrait';
export type { ChainOfCustodyConfig } from './traits/ChainOfCustodyTrait';

export type {
  HSPlusNode,
  TraitContext,
  TraitEvent,
  TraitHandler,
  EvidenceClassification,
  CustodyStatus,
} from './traits/types';

import { registerPluginTraits } from '@holoscript/core/runtime';
import type { TraitRegistrarTarget } from '@holoscript/core/runtime';
import { evidenceChainHandler } from './traits/EvidenceChainTrait';
import { sceneReconstructionHandler } from './traits/SceneReconstructionTrait';
import { chainOfCustodyHandler } from './traits/ChainOfCustodyTrait';

export const FORENSICS_TRAITS = [
  evidenceChainHandler,
  sceneReconstructionHandler,
  chainOfCustodyHandler,
] as const;

export function registerForensicsPlugin(runtime: TraitRegistrarTarget): void {
  registerPluginTraits(runtime, 'forensics', FORENSICS_TRAITS);
}

export const FORENSICS_KEYWORDS = [
  { term: 'evidence', traits: ['evidence_chain'], spatialRole: 'artifact' },
  { term: 'custody', traits: ['chain_of_custody'], spatialRole: 'record' },
  { term: 'reconstruct', traits: ['scene_reconstruction'], spatialRole: 'scene' },
  {
    term: 'forensics',
    traits: ['evidence_chain', 'scene_reconstruction', 'chain_of_custody'],
    spatialRole: 'analysis',
  },
];

export * from './forensicssolver';

export const VERSION = '1.0.0';
