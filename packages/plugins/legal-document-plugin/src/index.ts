export { createContractDraftHandler, type ContractDraftConfig, type ContractType, type Clause } from './traits/ContractDraftTrait';
export { createESignatureHandler, type ESignatureConfig, type Signer } from './traits/ESignatureTrait';
export { createCaseManagementHandler, type CaseManagementConfig, type CaseStatus } from './traits/CaseManagementTrait';
export { createProgrammableLawHandler, type ProgrammableLawConfig, type ProgrammableLawState } from './traits/ProgrammableLawTrait';
export * from './traits/types';

import { createContractDraftHandler } from './traits/ContractDraftTrait';
import { createESignatureHandler } from './traits/ESignatureTrait';
import { createCaseManagementHandler } from './traits/CaseManagementTrait';
import { createProgrammableLawHandler } from './traits/ProgrammableLawTrait';

export const pluginMeta = { name: '@holoscript/plugin-legal-document', version: '1.0.0', traits: ['contract_draft', 'e_signature', 'case_management', 'programmable_law'] };
export const traitHandlers = [createContractDraftHandler(), createESignatureHandler(), createCaseManagementHandler(), createProgrammableLawHandler()];
