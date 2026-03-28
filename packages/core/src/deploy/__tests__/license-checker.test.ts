import { describe, it, expect } from 'vitest';
import { checkLicenseCompatibility } from '../license-checker';
import type { ImportedLicense } from '../license-checker';

// =============================================================================
// No imports
// =============================================================================

describe('checkLicenseCompatibility — no imports', () => {
  it('returns compatible with no errors for empty imports', () => {
    const result = checkLicenseCompatibility('free', []);
    expect(result.compatible).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.forcedLicense).toBeUndefined();
  });
});

// =============================================================================
// Rule 1: exclusive blocks all imports
// =============================================================================

describe('checkLicenseCompatibility — exclusive imports', () => {
  it('produces error when importing exclusive content', () => {
    const imports: ImportedLicense[] = [
      { path: '@protected/model', license: 'exclusive' },
    ];
    const result = checkLicenseCompatibility('free', imports);
    expect(result.compatible).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('exclusive');
    expect(result.errors[0]).toContain('@protected/model');
  });

  it('blocks exclusive even with commercial composition license', () => {
    const imports: ImportedLicense[] = [
      { path: '@locked/asset', license: 'exclusive' },
    ];
    const result = checkLicenseCompatibility('commercial', imports);
    expect(result.compatible).toBe(false);
  });
});

// =============================================================================
// Rule 2: commercial requires purchase verification
// =============================================================================

describe('checkLicenseCompatibility — commercial imports', () => {
  it('produces warning for commercial imports', () => {
    const imports: ImportedLicense[] = [
      { path: '@store/premium-vfx', license: 'commercial' },
    ];
    const result = checkLicenseCompatibility('cc_by', imports);
    expect(result.compatible).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('commercial');
    expect(result.warnings[0]).toContain('purchase');
  });
});

// =============================================================================
// Rule 3: cc_by_sa forces share-alike
// =============================================================================

describe('checkLicenseCompatibility — cc_by_sa (share-alike)', () => {
  it('forces cc_by_sa when composition is less restrictive', () => {
    const imports: ImportedLicense[] = [
      { path: '@open/lib', license: 'cc_by_sa' },
    ];
    const result = checkLicenseCompatibility('free', imports);
    expect(result.compatible).toBe(true);
    expect(result.forcedLicense).toBe('cc_by_sa');
    expect(result.warnings.some(w => w.includes('cc_by_sa'))).toBe(true);
  });

  it('does not force when composition is already cc_by_sa', () => {
    const imports: ImportedLicense[] = [
      { path: '@open/lib', license: 'cc_by_sa' },
    ];
    const result = checkLicenseCompatibility('cc_by_sa', imports);
    expect(result.compatible).toBe(true);
    expect(result.forcedLicense).toBeUndefined();
  });

  it('does not force when composition is more restrictive', () => {
    const imports: ImportedLicense[] = [
      { path: '@open/lib', license: 'cc_by_sa' },
    ];
    const result = checkLicenseCompatibility('commercial', imports);
    expect(result.compatible).toBe(true);
    expect(result.forcedLicense).toBeUndefined();
  });
});

// =============================================================================
// Rule 4: cc_by_nc forces non-commercial
// =============================================================================

describe('checkLicenseCompatibility — cc_by_nc (non-commercial)', () => {
  it('forces cc_by_nc when composition is free', () => {
    const imports: ImportedLicense[] = [
      { path: '@nonprofit/asset', license: 'cc_by_nc' },
    ];
    const result = checkLicenseCompatibility('free', imports);
    expect(result.compatible).toBe(true);
    expect(result.forcedLicense).toBe('cc_by_nc');
  });

  it('forces cc_by_nc when composition is cc_by', () => {
    const imports: ImportedLicense[] = [
      { path: '@nonprofit/asset', license: 'cc_by_nc' },
    ];
    const result = checkLicenseCompatibility('cc_by', imports);
    expect(result.compatible).toBe(true);
    expect(result.forcedLicense).toBe('cc_by_nc');
  });

  it('does not force when composition is already cc_by_nc or more restrictive', () => {
    const imports: ImportedLicense[] = [
      { path: '@nonprofit/asset', license: 'cc_by_nc' },
    ];
    const result = checkLicenseCompatibility('cc_by_nc', imports);
    expect(result.compatible).toBe(true);
    expect(result.forcedLicense).toBeUndefined();
  });
});

// =============================================================================
// Rule 5: cc_by forces attribution
// =============================================================================

describe('checkLicenseCompatibility — cc_by (attribution)', () => {
  it('forces cc_by when composition is free', () => {
    const imports: ImportedLicense[] = [
      { path: '@creator/model', license: 'cc_by' },
    ];
    const result = checkLicenseCompatibility('free', imports);
    expect(result.compatible).toBe(true);
    expect(result.forcedLicense).toBe('cc_by');
  });

  it('does not force when composition is already cc_by or more restrictive', () => {
    const imports: ImportedLicense[] = [
      { path: '@creator/model', license: 'cc_by' },
    ];
    const result = checkLicenseCompatibility('cc_by', imports);
    expect(result.compatible).toBe(true);
    expect(result.forcedLicense).toBeUndefined();
  });
});

// =============================================================================
// Rule 6: free has no restrictions
// =============================================================================

describe('checkLicenseCompatibility — free imports', () => {
  it('free imports produce no warnings or errors', () => {
    const imports: ImportedLicense[] = [
      { path: '@open/lib', license: 'free' },
    ];
    const result = checkLicenseCompatibility('free', imports);
    expect(result.compatible).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.forcedLicense).toBeUndefined();
  });
});

// =============================================================================
// Mixed imports
// =============================================================================

describe('checkLicenseCompatibility — mixed imports', () => {
  it('cc_by_sa + cc_by_nc mix produces error', () => {
    const imports: ImportedLicense[] = [
      { path: '@open/share-alike', license: 'cc_by_sa' },
      { path: '@nonprofit/asset', license: 'cc_by_nc' },
    ];
    const result = checkLicenseCompatibility('free', imports);
    expect(result.compatible).toBe(false);
    expect(result.errors.some(e => e.includes('cc_by_sa') && e.includes('cc_by_nc'))).toBe(true);
  });

  it('handles multiple exclusive imports with separate errors', () => {
    const imports: ImportedLicense[] = [
      { path: '@locked/a', license: 'exclusive' },
      { path: '@locked/b', license: 'exclusive' },
    ];
    const result = checkLicenseCompatibility('free', imports);
    expect(result.compatible).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  it('forced license is the most restrictive among all imports', () => {
    const imports: ImportedLicense[] = [
      { path: '@a/lib', license: 'cc_by' },
      { path: '@b/lib', license: 'cc_by_sa' },
    ];
    const result = checkLicenseCompatibility('free', imports);
    expect(result.forcedLicense).toBe('cc_by_sa');
  });

  it('free + cc_by mix forces cc_by only', () => {
    const imports: ImportedLicense[] = [
      { path: '@open/free-lib', license: 'free' },
      { path: '@creator/model', license: 'cc_by' },
    ];
    const result = checkLicenseCompatibility('free', imports);
    expect(result.compatible).toBe(true);
    expect(result.forcedLicense).toBe('cc_by');
  });
});
