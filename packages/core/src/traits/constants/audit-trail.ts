/**
 * Audit Trail Traits (NEW names only — audit_log already in observability.ts)
 * @version 1.0.0
 */
export const AUDIT_TRAIL_TRAITS = [
  'change_tracking', // Entity change history tracking
  'data_lineage', // Data origin and transformation lineage
] as const;

export type AuditTrailTraitName = (typeof AUDIT_TRAIL_TRAITS)[number];
