import { describe, it, expect } from 'vitest';
import {
  generateTenantConfig,
  validateTenantConfig,
  TIER_FEATURE_FLAGS,
  TIER_COMPLIANCE,
  TIER_ENFORCEMENT,
} from '../TenantConfigSchema';

describe('TenantConfigSchema', () => {
  // =========================================================================
  // Configuration Generation
  // =========================================================================

  describe('generateTenantConfig', () => {
    it('generates free tier config', () => {
      const config = generateTenantConfig({
        tenantId: 'free-org',
        organizationName: 'Free Org',
        tier: 'free',
      });

      expect(config.tenant.tenantId).toBe('free-org');
      expect(config.tenant.organizationName).toBe('Free Org');
      expect(config.tenant.tier).toBe('free');
      expect(config.tenant.isolationLevel).toBe('logical');
      expect(config.tenant.maxUsers).toBe(5);
      expect(config.tenant.crossTenantSharingEnabled).toBe(false);

      expect(config.rbac.enabled).toBe(true);
      expect(config.rbac.allowCustomRoles).toBe(false);
      expect(config.rbac.maxCustomRoles).toBe(0);

      expect(config.quota.sceneCount).toBe(3);
      expect(config.quota.gaussianBudget).toBe(100_000);
      expect(config.quota.defaultEnforcement).toBe('hard');

      expect(config.sso.enabled).toBe(false);

      expect(config.auditLog.enabled).toBe(false);
      expect(config.auditLog.retentionDays).toBe(7);

      expect(config.featureFlags.gaussianSplatting).toBe(false);
      expect(config.featureFlags.customTraits).toBe(false);
    });

    it('generates starter tier config', () => {
      const config = generateTenantConfig({
        tenantId: 'starter-org',
        organizationName: 'Starter Org',
        tier: 'starter',
      });

      expect(config.tenant.maxUsers).toBe(25);
      expect(config.tenant.crossTenantSharingEnabled).toBe(true);
      expect(config.quota.sceneCount).toBe(25);
      expect(config.quota.gaussianBudget).toBe(1_000_000);
      expect(config.rbac.allowCustomRoles).toBe(true);
      expect(config.rbac.maxCustomRoles).toBe(5);
      expect(config.featureFlags.gaussianSplatting).toBe(true);
      expect(config.featureFlags.customTraits).toBe(true);
      expect(config.sso.enabled).toBe(false);
    });

    it('generates professional tier config', () => {
      const config = generateTenantConfig({
        tenantId: 'pro-org',
        organizationName: 'Pro Org',
        tier: 'professional',
      });

      expect(config.tenant.maxUsers).toBe(100);
      expect(config.quota.sceneCount).toBe(100);
      expect(config.quota.gaussianBudget).toBe(10_000_000);
      expect(config.quota.defaultEnforcement).toBe('soft');
      expect(config.auditLog.enabled).toBe(true);
      expect(config.auditLog.retentionDays).toBe(90);
      expect(config.auditLog.complianceFrameworks).toContain('soc2');
      expect(config.featureFlags.multiplayer).toBe(true);
      expect(config.featureFlags.aiFeatures).toBe(true);
    });

    it('generates enterprise tier config', () => {
      const config = generateTenantConfig({
        tenantId: 'ent-org',
        organizationName: 'Enterprise Org',
        tier: 'enterprise',
      });

      expect(config.tenant.isolationLevel).toBe('physical');
      expect(config.tenant.maxUsers).toBe(500);
      expect(config.quota.sceneCount).toBe(1_000);
      expect(config.quota.gaussianBudget).toBe(100_000_000);
      expect(config.quota.gracePeriodMinutes).toBe(60);
      expect(config.sso.enabled).toBe(true);
      expect(config.rbac.requireMfaForAdmin).toBe(true);
      expect(config.auditLog.retentionDays).toBe(365);
      expect(config.auditLog.logReads).toBe(true);
      expect(config.auditLog.enableHashChain).toBe(true);
      expect(config.auditLog.complianceFrameworks).toContain('gdpr');
      expect(config.auditLog.complianceFrameworks).toContain('hipaa');
      expect(config.featureFlags.volumetricVideo).toBe(true);
      expect(config.featureFlags.robotics).toBe(true);
    });

    it('generates unlimited tier config', () => {
      const config = generateTenantConfig({
        tenantId: 'unlimited-org',
        organizationName: 'Unlimited Org',
        tier: 'unlimited',
      });

      expect(config.tenant.isolationLevel).toBe('physical');
      expect(config.quota.sceneCount).toBe(Number.MAX_SAFE_INTEGER);
      expect(config.quota.defaultEnforcement).toBe('warn_only');
      expect(config.auditLog.complianceFrameworks).toContain('pci_dss');
    });

    it('includes custom domain in SSO config', () => {
      const config = generateTenantConfig({
        tenantId: 'custom-org',
        organizationName: 'Custom Org',
        tier: 'enterprise',
        customDomain: 'scenes.acme.com',
      });

      expect(config.tenant.customDomain).toBe('scenes.acme.com');
      expect(config.sso.acsUrl).toContain('scenes.acme.com');
      expect(config.sso.allowedRedirectUris[0]).toContain('scenes.acme.com');
    });

    it('generates consistent tenant IDs across sub-configs', () => {
      const config = generateTenantConfig({
        tenantId: 'consistent-org',
        organizationName: 'Consistent Org',
        tier: 'professional',
      });

      expect(config.tenant.tenantId).toBe('consistent-org');
      expect(config.rbac.tenantId).toBe('consistent-org');
      expect(config.quota.tenantId).toBe('consistent-org');
      expect(config.sso.tenantId).toBe('consistent-org');
      expect(config.auditLog.tenantId).toBe('consistent-org');
    });
  });

  // =========================================================================
  // Validation
  // =========================================================================

  describe('validateTenantConfig', () => {
    it('validates a correct config with no errors', () => {
      const config = generateTenantConfig({
        tenantId: 'valid-org',
        organizationName: 'Valid Org',
        tier: 'professional',
      });
      const errors = validateTenantConfig(config);
      expect(errors.filter((e) => e.severity === 'error')).toHaveLength(0);
    });

    it('catches missing tenant ID', () => {
      const errors = validateTenantConfig({
        tenant: { tenantId: '', organizationName: 'Test' } as any,
      });
      expect(errors.some((e) => e.field === 'tenant.tenantId')).toBe(true);
    });

    it('catches invalid tenant ID characters', () => {
      const errors = validateTenantConfig({
        tenant: { tenantId: 'invalid@id!', organizationName: 'Test' } as any,
      });
      expect(
        errors.some((e) => e.field === 'tenant.tenantId' && e.message.includes('alphanumeric'))
      ).toBe(true);
    });

    it('catches missing organization name', () => {
      const errors = validateTenantConfig({
        tenant: { tenantId: 'test', organizationName: '' } as any,
      });
      expect(errors.some((e) => e.field === 'tenant.organizationName')).toBe(true);
    });

    it('catches negative max users', () => {
      const errors = validateTenantConfig({
        tenant: { tenantId: 'test', organizationName: 'Test', maxUsers: 0 } as any,
      });
      expect(errors.some((e) => e.field === 'tenant.maxUsers')).toBe(true);
    });

    it('catches negative quota values', () => {
      const errors = validateTenantConfig({
        tenant: { tenantId: 'test', organizationName: 'Test' } as any,
        quota: { enabled: true, tenantId: 'test', sceneCount: -1 } as any,
      });
      expect(errors.some((e) => e.field === 'quota.sceneCount')).toBe(true);
    });

    it('warns about enforce SSO when SSO disabled', () => {
      const errors = validateTenantConfig({
        tenant: { tenantId: 'test', organizationName: 'Test' } as any,
        sso: { enabled: false, enforceSso: true } as any,
      });
      expect(errors.some((e) => e.field === 'sso.enforceSso' && e.severity === 'warning')).toBe(
        true
      );
    });

    it('catches missing SSO endpoints when enabled', () => {
      const errors = validateTenantConfig({
        tenant: { tenantId: 'test', organizationName: 'Test' } as any,
        sso: { enabled: true, spEntityId: '', acsUrl: '', sessionTimeoutMinutes: 0 } as any,
      });
      expect(errors.some((e) => e.field === 'sso.spEntityId')).toBe(true);
      expect(errors.some((e) => e.field === 'sso.acsUrl')).toBe(true);
      expect(errors.some((e) => e.field === 'sso.sessionTimeoutMinutes')).toBe(true);
    });
  });

  // =========================================================================
  // Tier Constants
  // =========================================================================

  describe('tier constants', () => {
    it('has feature flags for all tiers', () => {
      expect(TIER_FEATURE_FLAGS.free).toBeDefined();
      expect(TIER_FEATURE_FLAGS.starter).toBeDefined();
      expect(TIER_FEATURE_FLAGS.professional).toBeDefined();
      expect(TIER_FEATURE_FLAGS.enterprise).toBeDefined();
      expect(TIER_FEATURE_FLAGS.unlimited).toBeDefined();
    });

    it('has compliance frameworks for all tiers', () => {
      expect(TIER_COMPLIANCE.free).toHaveLength(0);
      expect(TIER_COMPLIANCE.enterprise.length).toBeGreaterThan(0);
    });

    it('has enforcement levels for all tiers', () => {
      expect(TIER_ENFORCEMENT.free).toBe('hard');
      expect(TIER_ENFORCEMENT.unlimited).toBe('warn_only');
    });

    it('enterprise tier enables all features', () => {
      const flags = TIER_FEATURE_FLAGS.enterprise;
      expect(Object.values(flags).every(Boolean)).toBe(true);
    });

    it('free tier disables all features', () => {
      const flags = TIER_FEATURE_FLAGS.free;
      expect(Object.values(flags).every((v) => !v)).toBe(true);
    });
  });
});
