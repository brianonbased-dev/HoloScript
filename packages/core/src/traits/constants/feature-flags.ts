/**
 * Feature Flags Traits (NEW names only — feature_flag already in devops-ci.ts)
 * @version 1.0.0
 */
export const FEATURE_FLAGS_TRAITS = [
  'abtest',             // A/B test variant assignment
  'rollout',            // Gradual percentage-based rollout
] as const;

export type FeatureFlagsTraitName = (typeof FEATURE_FLAGS_TRAITS)[number];
