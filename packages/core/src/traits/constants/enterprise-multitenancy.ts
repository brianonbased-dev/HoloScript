/**
 * Enterprise Multi-Tenancy Traits
 *
 * Trait names for enterprise multi-tenant architecture:
 * - Tenant isolation and organization management
 * - Role-based access control (RBAC) with granular permissions
 * - Usage quotas and resource management
 * - SSO integration (SAML 2.0 + OIDC)
 * - Audit logging for compliance
 *
 * @version 1.0.0
 * @category enterprise
 */

export const ENTERPRISE_MULTITENANCY_TRAITS = [
  // Tenant isolation
  'tenant',
  'tenant_boundary',
  'tenant_registry',
  'tenant_config',
  'tenant_isolation',

  // RBAC
  'rbac',
  'rbac_role',
  'rbac_permission',
  'rbac_policy',

  // Quotas
  'quota',
  'quota_scene',
  'quota_gaussian',
  'quota_render_credits',
  'quota_storage',

  // SSO
  'sso_saml',
  'sso_oidc',
  'sso_session',

  // Audit
  'audit_log',
  'audit_trail',
] as const;

export type EnterpriseMultitenancyTraitName = (typeof ENTERPRISE_MULTITENANCY_TRAITS)[number];
