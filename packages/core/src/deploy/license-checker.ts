/**
 * License Compatibility Checker for HoloScript Deploy
 *
 * Validates that a composition's license is compatible with
 * the licenses of all imported compositions. Enforces at
 * compile/deploy time — errors, not lawsuits.
 *
 * License hierarchy (most permissive → most restrictive):
 *   free (CC0) → cc_by → cc_by_sa → cc_by_nc → commercial → exclusive
 *
 * @module license-checker
 */

import type { LicenseType } from './provenance';

// =============================================================================
// TYPES
// =============================================================================

export interface ImportedLicense {
  /** Import path (for error messages) */
  path: string;
  /** License of the imported composition */
  license: LicenseType;
}

export interface LicenseCheckResult {
  /** Whether the license combination is valid */
  compatible: boolean;
  /** Hard errors that block publishing */
  errors: string[];
  /** Non-blocking warnings */
  warnings: string[];
  /** If an imported license forces the output license, this is set */
  forcedLicense?: LicenseType;
}

// =============================================================================
// LICENSE RESTRICTIVENESS RANKING
// =============================================================================

/**
 * Restrictiveness ranking: higher = more restrictive.
 * Used to determine if a composition's license is "at least as restrictive"
 * as its most restrictive import.
 */
const RESTRICTIVENESS: Record<LicenseType, number> = {
  free: 0,
  cc_by: 1,
  cc_by_sa: 2,
  cc_by_nc: 3,
  commercial: 4,
  exclusive: 5,
};

// =============================================================================
// COMPATIBILITY RULES
// =============================================================================

/**
 * Check if a composition's license is compatible with all imported licenses.
 *
 * Rules from vision doc Section 9B:
 * 1. Importing `exclusive` → ERROR (view-only, no import allowed)
 * 2. Importing `commercial` → WARNING (requires purchase verification)
 * 3. Importing `cc_by_sa` → Forces output to cc_by_sa or more restrictive
 * 4. Importing `cc_by_nc` → Output must be non-commercial (cc_by_nc or more restrictive)
 * 5. Importing `cc_by` → Output must include attribution (cc_by or more restrictive)
 * 6. Importing `free` → No restrictions
 */
export function checkLicenseCompatibility(
  compositionLicense: LicenseType,
  importedLicenses: ImportedLicense[]
): LicenseCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let forcedLicense: LicenseType | undefined;

  if (importedLicenses.length === 0) {
    return { compatible: true, errors: [], warnings: [] };
  }

  for (const imp of importedLicenses) {
    // Rule 1: Exclusive blocks all imports
    if (imp.license === 'exclusive') {
      errors.push(
        `Cannot import "${imp.path}" — license is "exclusive" (view-only, no import allowed)`
      );
      continue;
    }

    // Rule 2: Commercial requires purchase verification
    if (imp.license === 'commercial') {
      warnings.push(
        `Import "${imp.path}" has "commercial" license — ensure purchase is verified before publishing`
      );
      continue;
    }

    // Rule 3: cc_by_sa forces share-alike on output
    if (imp.license === 'cc_by_sa') {
      const compositionLevel = RESTRICTIVENESS[compositionLicense];
      const requiredLevel = RESTRICTIVENESS.cc_by_sa;

      if (compositionLevel < requiredLevel) {
        // Force the composition to at least cc_by_sa
        if (!forcedLicense || RESTRICTIVENESS[forcedLicense] < requiredLevel) {
          forcedLicense = 'cc_by_sa';
        }
        warnings.push(
          `Import "${imp.path}" is "cc_by_sa" — your composition license forced to "cc_by_sa" (share-alike)`
        );
      }
    }

    // Rule 4: cc_by_nc forces non-commercial
    if (imp.license === 'cc_by_nc') {
      if (compositionLicense === 'free' || compositionLicense === 'cc_by') {
        if (!forcedLicense || RESTRICTIVENESS[forcedLicense] < RESTRICTIVENESS.cc_by_nc) {
          forcedLicense = 'cc_by_nc';
        }
        warnings.push(
          `Import "${imp.path}" is "cc_by_nc" — your composition license forced to "cc_by_nc" (non-commercial)`
        );
      }
    }

    // Rule 5: cc_by requires attribution
    if (imp.license === 'cc_by') {
      if (compositionLicense === 'free') {
        if (!forcedLicense || RESTRICTIVENESS[forcedLicense] < RESTRICTIVENESS.cc_by) {
          forcedLicense = 'cc_by';
        }
        warnings.push(
          `Import "${imp.path}" is "cc_by" — your composition license forced to at least "cc_by" (attribution required)`
        );
      }
    }
  }

  // Check for incompatible forced licenses
  // cc_by_sa + cc_by_nc in the same composition is problematic:
  // cc_by_sa requires derivatives be cc_by_sa, cc_by_nc requires non-commercial
  const hasShareAlike = importedLicenses.some(i => i.license === 'cc_by_sa');
  const hasNonCommercial = importedLicenses.some(i => i.license === 'cc_by_nc');

  if (hasShareAlike && hasNonCommercial) {
    errors.push(
      'License conflict: cannot mix "cc_by_sa" (share-alike) and "cc_by_nc" (non-commercial) imports — ' +
      'cc_by_sa requires derivatives use the same license, but cc_by_nc requires non-commercial use'
    );
  }

  return {
    compatible: errors.length === 0,
    errors,
    warnings,
    forcedLicense,
  };
}
