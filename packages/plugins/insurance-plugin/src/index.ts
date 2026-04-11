export { createPolicyHandler, type PolicyConfig, type PolicyType, type PolicyStatus } from './traits/PolicyTrait';
export { createClaimHandler, type ClaimConfig, type ClaimStatus } from './traits/ClaimTrait';
export { createRiskAssessmentHandler, type RiskAssessmentConfig, type RiskFactor } from './traits/RiskAssessmentTrait';
export { createUnderwritingHandler, type UnderwritingConfig, type UnderwritingDecision } from './traits/UnderwritingTrait';
export * from './traits/types';

import { createPolicyHandler } from './traits/PolicyTrait';
import { createClaimHandler } from './traits/ClaimTrait';
import { createRiskAssessmentHandler } from './traits/RiskAssessmentTrait';
import { createUnderwritingHandler } from './traits/UnderwritingTrait';

export const pluginMeta = { name: '@holoscript/plugin-insurance', version: '1.0.0', traits: ['policy', 'claim', 'risk_assessment', 'underwriting'] };
export const traitHandlers = [createPolicyHandler(), createClaimHandler(), createRiskAssessmentHandler(), createUnderwritingHandler()];
