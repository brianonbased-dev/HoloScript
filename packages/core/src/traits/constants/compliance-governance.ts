/**
 * Compliance / Governance Traits
 * @version 1.0.0
 */
export const COMPLIANCE_GOVERNANCE_TRAITS = [
  'gdpr', // GDPR data subject rights management
  'data_retention', // Data retention policy enforcement
  'consent_management', // Consent collection and tracking
  'fairness_monitor', // Live inference fairness drift monitoring
] as const;

export type ComplianceGovernanceTraitName = (typeof COMPLIANCE_GOVERNANCE_TRAITS)[number];
