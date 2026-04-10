/**
 * DevOps / CI Traits
 *
 * Deployment, rollback, canary release, feature flags, environment
 * configuration, and secrets management for CI/CD compositions.
 *
 * @version 1.0.0
 */
export const DEVOPS_CI_TRAITS = [
  // ─── Deployment ───────────────────────────────────────────────────
  'deploy', // Deployment orchestration with stages
  'rollback', // Rollback to previous version
  'canary', // Canary / blue-green release gating

  // ─── Configuration ────────────────────────────────────────────────
  'feature_flag', // Feature flag evaluation with variants
  'env_config', // Environment variable management
  'secret', // Secrets vault access with rotation
] as const;

export type DevOpsCITraitName = (typeof DEVOPS_CI_TRAITS)[number];
