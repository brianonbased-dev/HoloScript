/**
 * Tenant Configuration Schema
 *
 * Defines the complete configuration schema for enterprise multi-tenant deployments.
 * Provides validation, default generation, and tier-based configuration profiles.
 *
 * This schema ties together:
 * - TenantTrait (organization isolation)
 * - RBACTrait (access control)
 * - QuotaTrait (usage quotas)
 * - SSOTrait (authentication)
 * - AuditLogTrait (compliance logging)
 *
 * @version 1.0.0
 * @category enterprise
 */

import type { TenantConfig, TenantTier } from './TenantTrait';
import type { RBACConfig } from './RBACTrait';
import type { QuotaConfig, QuotaEnforcement } from './QuotaTrait';
import type { SSOConfig } from './SSOTrait';
import type { AuditLogConfig, ComplianceFramework } from './AuditLogTrait';

// =============================================================================
// UNIFIED TENANT CONFIGURATION
// =============================================================================

/** Complete tenant configuration combining all enterprise traits */
export interface EnterpriseTenantConfig {
  /** Tenant core configuration */
  tenant: TenantConfig;
  /** RBAC configuration */
  rbac: RBACConfig;
  /** Quota configuration */
  quota: QuotaConfig;
  /** SSO configuration */
  sso: SSOConfig;
  /** Audit log configuration */
  auditLog: AuditLogConfig;
  /** Feature flags for the tenant */
  featureFlags: TenantFeatureFlags;
  /** Branding configuration */
  branding: TenantBranding;
}

/** Feature flags per tenant */
export interface TenantFeatureFlags {
  /** Enable Gaussian splatting traits */
  gaussianSplatting: boolean;
  /** Enable WebGPU compute traits */
  webGpuCompute: boolean;
  /** Enable multiplayer/networking traits */
  multiplayer: boolean;
  /** Enable AI/ML traits */
  aiFeatures: boolean;
  /** Enable volumetric video */
  volumetricVideo: boolean;
  /** Enable robotics traits */
  robotics: boolean;
  /** Enable custom trait registration */
  customTraits: boolean;
  /** Enable export to all platforms */
  allExportTargets: boolean;
  /** Enable marketplace features */
  marketplace: boolean;
  /** Enable advanced analytics */
  advancedAnalytics: boolean;
}

/** Tenant branding configuration */
export interface TenantBranding {
  /** Primary brand color (hex) */
  primaryColor: string;
  /** Logo URL */
  logoUrl?: string;
  /** Favicon URL */
  faviconUrl?: string;
  /** Custom CSS */
  customCss?: string;
  /** App title override */
  appTitle?: string;
}

// =============================================================================
// TIER-BASED CONFIGURATION PROFILES
// =============================================================================

/** Feature flags by tier */
const TIER_FEATURE_FLAGS: Record<TenantTier, TenantFeatureFlags> = {
  free: {
    gaussianSplatting: false,
    webGpuCompute: false,
    multiplayer: false,
    aiFeatures: false,
    volumetricVideo: false,
    robotics: false,
    customTraits: false,
    allExportTargets: false,
    marketplace: false,
    advancedAnalytics: false,
  },
  starter: {
    gaussianSplatting: true,
    webGpuCompute: false,
    multiplayer: false,
    aiFeatures: false,
    volumetricVideo: false,
    robotics: false,
    customTraits: true,
    allExportTargets: false,
    marketplace: false,
    advancedAnalytics: false,
  },
  professional: {
    gaussianSplatting: true,
    webGpuCompute: true,
    multiplayer: true,
    aiFeatures: true,
    volumetricVideo: false,
    robotics: false,
    customTraits: true,
    allExportTargets: true,
    marketplace: true,
    advancedAnalytics: true,
  },
  enterprise: {
    gaussianSplatting: true,
    webGpuCompute: true,
    multiplayer: true,
    aiFeatures: true,
    volumetricVideo: true,
    robotics: true,
    customTraits: true,
    allExportTargets: true,
    marketplace: true,
    advancedAnalytics: true,
  },
  unlimited: {
    gaussianSplatting: true,
    webGpuCompute: true,
    multiplayer: true,
    aiFeatures: true,
    volumetricVideo: true,
    robotics: true,
    customTraits: true,
    allExportTargets: true,
    marketplace: true,
    advancedAnalytics: true,
  },
};

/** Compliance requirements by tier */
const TIER_COMPLIANCE: Record<TenantTier, ComplianceFramework[]> = {
  free: [],
  starter: [],
  professional: ['soc2'],
  enterprise: ['soc2', 'gdpr', 'hipaa'],
  unlimited: ['soc2', 'gdpr', 'hipaa', 'iso27001', 'pci_dss'],
};

/** Quota enforcement by tier */
const TIER_ENFORCEMENT: Record<TenantTier, QuotaEnforcement> = {
  free: 'hard',
  starter: 'hard',
  professional: 'soft',
  enterprise: 'soft',
  unlimited: 'warn_only',
};

// =============================================================================
// SCHEMA VALIDATION
// =============================================================================

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Validate a tenant configuration.
 * Returns an array of validation errors (empty = valid).
 */
export function validateTenantConfig(config: Partial<EnterpriseTenantConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  // Tenant validation
  if (!config.tenant?.tenantId) {
    errors.push({ field: 'tenant.tenantId', message: 'Tenant ID is required', severity: 'error' });
  } else if (!/^[a-zA-Z0-9-_]+$/.test(config.tenant.tenantId)) {
    errors.push({
      field: 'tenant.tenantId',
      message: 'Tenant ID must be alphanumeric with hyphens/underscores only',
      severity: 'error',
    });
  }

  if (!config.tenant?.organizationName) {
    errors.push({
      field: 'tenant.organizationName',
      message: 'Organization name is required',
      severity: 'error',
    });
  }

  if (config.tenant?.maxUsers !== undefined && config.tenant.maxUsers < 1) {
    errors.push({
      field: 'tenant.maxUsers',
      message: 'Max users must be at least 1',
      severity: 'error',
    });
  }

  // RBAC validation
  if (config.rbac?.enabled && !config.rbac?.tenantId) {
    errors.push({
      field: 'rbac.tenantId',
      message: 'RBAC tenant ID must match tenant configuration',
      severity: 'error',
    });
  }

  if (config.rbac?.maxCustomRoles !== undefined && config.rbac.maxCustomRoles < 0) {
    errors.push({
      field: 'rbac.maxCustomRoles',
      message: 'Max custom roles cannot be negative',
      severity: 'error',
    });
  }

  // Quota validation
  if (config.quota?.enabled && !config.quota?.tenantId) {
    errors.push({
      field: 'quota.tenantId',
      message: 'Quota tenant ID must match tenant configuration',
      severity: 'error',
    });
  }

  if (config.quota?.sceneCount !== undefined && config.quota.sceneCount < 0) {
    errors.push({
      field: 'quota.sceneCount',
      message: 'Scene count limit cannot be negative',
      severity: 'error',
    });
  }

  if (config.quota?.gaussianBudget !== undefined && config.quota.gaussianBudget < 0) {
    errors.push({
      field: 'quota.gaussianBudget',
      message: 'Gaussian budget cannot be negative',
      severity: 'error',
    });
  }

  // SSO validation
  if (config.sso?.enabled) {
    if (!config.sso.spEntityId) {
      errors.push({
        field: 'sso.spEntityId',
        message: 'Service Provider Entity ID is required when SSO is enabled',
        severity: 'error',
      });
    }
    if (!config.sso.acsUrl) {
      errors.push({
        field: 'sso.acsUrl',
        message: 'Assertion Consumer Service URL is required when SSO is enabled',
        severity: 'error',
      });
    }
    if (config.sso.sessionTimeoutMinutes < 1) {
      errors.push({
        field: 'sso.sessionTimeoutMinutes',
        message: 'Session timeout must be at least 1 minute',
        severity: 'error',
      });
    }
  }

  // Audit log validation
  if (config.auditLog?.retentionDays !== undefined && config.auditLog.retentionDays < 0) {
    errors.push({
      field: 'auditLog.retentionDays',
      message: 'Retention days cannot be negative',
      severity: 'error',
    });
  }

  // Cross-field validation
  if (config.sso?.enforceSso && !config.sso?.enabled) {
    errors.push({
      field: 'sso.enforceSso',
      message: 'Cannot enforce SSO when SSO is disabled',
      severity: 'warning',
    });
  }

  return errors;
}

// =============================================================================
// CONFIGURATION GENERATORS
// =============================================================================

/**
 * Generate a complete tenant configuration for a given tier.
 */
export function generateTenantConfig(params: {
  tenantId: string;
  organizationName: string;
  tier: TenantTier;
  customDomain?: string;
}): EnterpriseTenantConfig {
  const { tenantId, organizationName, tier, customDomain } = params;
  const namespacePrefix = `t_${tenantId.replace(/-/g, '').substring(0, 12)}`;
  const compliance = TIER_COMPLIANCE[tier];
  const enforcement = TIER_ENFORCEMENT[tier];

  return {
    tenant: {
      tenantId,
      organizationName,
      status: 'provisioning',
      tier,
      isolationLevel: tier === 'enterprise' || tier === 'unlimited' ? 'physical' : 'logical',
      customDomain,
      allowedOrigins: [],
      maxUsers: tier === 'free' ? 5 : tier === 'starter' ? 25 : tier === 'professional' ? 100 : 500,
      namespacePrefix,
      crossTenantSharingEnabled: tier !== 'free',
      tags: {},
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    },
    rbac: {
      tenantId,
      enabled: true,
      defaultRole: 'viewer',
      allowCustomRoles: tier !== 'free',
      maxCustomRoles: tier === 'free' ? 0 : tier === 'starter' ? 5 : tier === 'professional' ? 15 : 50,
      requireMfaForAdmin: tier === 'enterprise' || tier === 'unlimited',
      logAccessChecks: tier !== 'free',
      ownerIpAllowlist: [],
      sessionTimeouts: {
        owner: 30,
        admin: 60,
        editor: 120,
        viewer: 480,
      },
    },
    quota: {
      tenantId,
      enabled: true,
      sceneCount: getQuotaDefault(tier, 'sceneCount'),
      gaussianBudget: getQuotaDefault(tier, 'gaussianBudget'),
      renderCredits: getQuotaDefault(tier, 'renderCredits'),
      storageBytes: getQuotaDefault(tier, 'storageBytes'),
      exportCount: getQuotaDefault(tier, 'exportCount'),
      apiCalls: getQuotaDefault(tier, 'apiCalls'),
      concurrentUsers: getQuotaDefault(tier, 'concurrentUsers'),
      customTraits: getQuotaDefault(tier, 'customTraits'),
      defaultEnforcement: enforcement,
      enableUserSubQuotas: tier !== 'free',
      gracePeriodMinutes: tier === 'enterprise' || tier === 'unlimited' ? 60 : 0,
      notificationThresholds: [50, 75, 90, 95, 100],
    },
    sso: {
      tenantId,
      enabled: tier === 'enterprise' || tier === 'unlimited',
      enforceSso: false,
      spEntityId: `urn:holoscript:${tenantId}`,
      acsUrl: customDomain
        ? `https://${customDomain}/auth/saml/callback`
        : `https://${tenantId}.holoscript.cloud/auth/saml/callback`,
      sessionTimeoutMinutes: 480,
      maxSessionsPerUser: tier === 'free' ? 1 : tier === 'starter' ? 3 : 5,
      jitProvisioningEnabled: true,
      jitDefaultRole: 'viewer',
      syncRolesOnLogin: true,
      allowedRedirectUris: customDomain ? [`https://${customDomain}/*`] : [],
      requireMfaAfterSso: false,
    },
    auditLog: {
      tenantId,
      enabled: tier !== 'free',
      maxEntries: tier === 'free' ? 1000 : tier === 'starter' ? 10_000 : 100_000,
      retentionDays: tier === 'free' ? 7 : tier === 'starter' ? 30 : tier === 'professional' ? 90 : 365,
      minSeverity: tier === 'free' ? 'warning' : 'info',
      enableHashChain: compliance.length > 0,
      logReads: tier === 'enterprise' || tier === 'unlimited',
      categories: [],
      complianceFrameworks: compliance,
      enableRealTimeEvents: tier !== 'free',
    },
    featureFlags: TIER_FEATURE_FLAGS[tier],
    branding: {
      primaryColor: '#6366f1',
    },
  };
}

// =============================================================================
// QUOTA DEFAULTS HELPER
// =============================================================================

const QUOTA_DEFAULTS: Record<TenantTier, Record<string, number>> = {
  free: {
    sceneCount: 3,
    gaussianBudget: 100_000,
    renderCredits: 100,
    storageBytes: 100 * 1024 * 1024,
    exportCount: 5,
    apiCalls: 1_000,
    concurrentUsers: 1,
    customTraits: 0,
  },
  starter: {
    sceneCount: 25,
    gaussianBudget: 1_000_000,
    renderCredits: 1_000,
    storageBytes: 1024 * 1024 * 1024,
    exportCount: 50,
    apiCalls: 10_000,
    concurrentUsers: 5,
    customTraits: 5,
  },
  professional: {
    sceneCount: 100,
    gaussianBudget: 10_000_000,
    renderCredits: 10_000,
    storageBytes: 10 * 1024 * 1024 * 1024,
    exportCount: 500,
    apiCalls: 100_000,
    concurrentUsers: 25,
    customTraits: 25,
  },
  enterprise: {
    sceneCount: 1_000,
    gaussianBudget: 100_000_000,
    renderCredits: 100_000,
    storageBytes: 100 * 1024 * 1024 * 1024,
    exportCount: 5_000,
    apiCalls: 1_000_000,
    concurrentUsers: 100,
    customTraits: 100,
  },
  unlimited: {
    sceneCount: Number.MAX_SAFE_INTEGER,
    gaussianBudget: Number.MAX_SAFE_INTEGER,
    renderCredits: Number.MAX_SAFE_INTEGER,
    storageBytes: Number.MAX_SAFE_INTEGER,
    exportCount: Number.MAX_SAFE_INTEGER,
    apiCalls: Number.MAX_SAFE_INTEGER,
    concurrentUsers: Number.MAX_SAFE_INTEGER,
    customTraits: Number.MAX_SAFE_INTEGER,
  },
};

function getQuotaDefault(tier: TenantTier, key: string): number {
  return QUOTA_DEFAULTS[tier]?.[key] ?? 0;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  TIER_FEATURE_FLAGS,
  TIER_COMPLIANCE,
  TIER_ENFORCEMENT,
  QUOTA_DEFAULTS,
};
