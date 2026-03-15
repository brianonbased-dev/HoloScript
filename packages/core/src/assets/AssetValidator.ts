/**
 * @holoscript/core Asset Validator
 *
 * Validates asset metadata, compatibility, and completeness.
 * Provides suggestions for optimization and error detection.
 */

import {
  AssetMetadata,
  AssetType,
  PlatformCompatibility,
  AssetOptimization,
} from './AssetMetadata';

/**
 * Format bytes as human-readable string
 * Enhanced implementation matching @holoscript/std
 */
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

// ============================================================================
// Validation Result Types
// ============================================================================

export type ValidationSeverity = 'error' | 'warning' | 'info';

export interface ValidationIssue {
  /** Issue code for programmatic handling */
  code: string;

  /** Severity level */
  severity: ValidationSeverity;

  /** Human-readable message */
  message: string;

  /** Affected field path */
  field?: string;

  /** Suggested fix */
  suggestion?: string;

  /** Auto-fixable? */
  autoFixable: boolean;
}

export interface ValidationResult {
  /** Is the asset valid? (no errors) */
  valid: boolean;

  /** All issues found */
  issues: ValidationIssue[];

  /** Error count */
  errorCount: number;

  /** Warning count */
  warningCount: number;

  /** Info count */
  infoCount: number;

  /** Validation timestamp */
  validatedAt: string;

  /** Suggested optimizations */
  optimizations: AssetOptimization[];
}

// ============================================================================
// Validation Rules
// ============================================================================

export interface ValidationRule {
  /** Rule identifier */
  id: string;

  /** Rule name */
  name: string;

  /** Rule description */
  description: string;

  /** Severity if rule fails */
  severity: ValidationSeverity;

  /** Asset types this rule applies to */
  appliesTo: AssetType[] | 'all';

  /** Validation function */
  validate: (asset: AssetMetadata) => ValidationIssue | null;
}

// ============================================================================
// Built-in Validation Rules
// ============================================================================

const BUILTIN_RULES: ValidationRule[] = [
  // ─── Required Fields ─────────────────────────────────────────────────────
  {
    id: 'required-id',
    name: 'Asset ID Required',
    description: 'Every asset must have a unique ID',
    severity: 'error',
    appliesTo: 'all',
    validate: (asset) => {
      if (!asset.id || asset.id.trim() === '') {
        return {
          code: 'MISSING_ID',
          severity: 'error',
          message: 'Asset must have a unique ID',
          field: 'id',
          autoFixable: true,
        };
      }
      return null;
    },
  },

  {
    id: 'required-name',
    name: 'Asset Name Required',
    description: 'Every asset must have a name',
    severity: 'error',
    appliesTo: 'all',
    validate: (asset) => {
      if (!asset.name || asset.name.trim() === '') {
        return {
          code: 'MISSING_NAME',
          severity: 'error',
          message: 'Asset must have a name',
          field: 'name',
          autoFixable: false,
        };
      }
      return null;
    },
  },

  {
    id: 'required-source-path',
    name: 'Source Path Required',
    description: 'Every asset must have a source path',
    severity: 'error',
    appliesTo: 'all',
    validate: (asset) => {
      if (!asset.sourcePath || asset.sourcePath.trim() === '') {
        return {
          code: 'MISSING_SOURCE_PATH',
          severity: 'error',
          message: 'Asset must have a source path',
          field: 'sourcePath',
          autoFixable: false,
        };
      }
      return null;
    },
  },

  // ─── File Size Checks ────────────────────────────────────────────────────
  {
    id: 'file-size-warning',
    name: 'Large File Warning',
    description: 'Warn about large files that may impact loading',
    severity: 'warning',
    appliesTo: 'all',
    validate: (asset) => {
      const threshold = 10 * 1024 * 1024; // 10MB
      if (asset.fileSize > threshold) {
        return {
          code: 'LARGE_FILE',
          severity: 'warning',
          message: `File size (${formatBytes(asset.fileSize)}) exceeds recommended limit (10MB)`,
          field: 'fileSize',
          suggestion: 'Consider compressing or splitting the asset',
          autoFixable: false,
        };
      }
      return null;
    },
  },

  {
    id: 'file-size-error',
    name: 'File Too Large',
    description: 'Error for extremely large files',
    severity: 'error',
    appliesTo: 'all',
    validate: (asset) => {
      const threshold = 100 * 1024 * 1024; // 100MB
      if (asset.fileSize > threshold) {
        return {
          code: 'FILE_TOO_LARGE',
          severity: 'error',
          message: `File size (${formatBytes(asset.fileSize)}) exceeds maximum limit (100MB)`,
          field: 'fileSize',
          suggestion: 'Split asset into smaller chunks or use streaming',
          autoFixable: false,
        };
      }
      return null;
    },
  },

  // ─── Model-Specific Rules ────────────────────────────────────────────────
  {
    id: 'model-poly-count',
    name: 'High Polygon Count',
    description: 'Warn about high polygon count models',
    severity: 'warning',
    appliesTo: ['model', 'scene'],
    validate: (asset) => {
      const threshold = 100000;
      if (asset.meshStats && asset.meshStats.triangleCount > threshold) {
        return {
          code: 'HIGH_POLY_COUNT',
          severity: 'warning',
          message: `Triangle count (${asset.meshStats.triangleCount.toLocaleString()}) may impact VR performance`,
          field: 'meshStats.triangleCount',
          suggestion: 'Consider using LOD or mesh simplification',
          autoFixable: false,
        };
      }
      return null;
    },
  },

  {
    id: 'model-no-lod',
    name: 'Missing LOD',
    description: 'Suggest LOD for large models',
    severity: 'info',
    appliesTo: ['model', 'scene'],
    validate: (asset) => {
      const threshold = 50000;
      if (
        asset.meshStats &&
        asset.meshStats.triangleCount > threshold &&
        (!asset.lodLevels || asset.lodLevels.length === 0)
      ) {
        return {
          code: 'MISSING_LOD',
          severity: 'info',
          message: 'Large model without LOD levels defined',
          field: 'lodLevels',
          suggestion: 'Add LOD levels for better VR/mobile performance',
          autoFixable: true,
        };
      }
      return null;
    },
  },

  // ─── Texture-Specific Rules ──────────────────────────────────────────────
  {
    id: 'texture-power-of-two',
    name: 'Non-Power-of-Two Texture',
    description: 'Warn about non-power-of-two textures',
    severity: 'warning',
    appliesTo: ['texture'],
    validate: (asset) => {
      if (asset.dimensions) {
        const isPOT = (n: number) => (n & (n - 1)) === 0 && n !== 0;
        if (!isPOT(asset.dimensions.width) || !isPOT(asset.dimensions.height)) {
          return {
            code: 'NON_POT_TEXTURE',
            severity: 'warning',
            message: `Texture dimensions (${asset.dimensions.width}x${asset.dimensions.height}) are not power-of-two`,
            field: 'dimensions',
            suggestion: 'Resize to nearest power-of-two for better GPU compatibility',
            autoFixable: true,
          };
        }
      }
      return null;
    },
  },

  {
    id: 'texture-too-large',
    name: 'Large Texture',
    description: 'Warn about very large textures',
    severity: 'warning',
    appliesTo: ['texture'],
    validate: (asset) => {
      const maxDim = 4096;
      if (
        asset.dimensions &&
        (asset.dimensions.width > maxDim || asset.dimensions.height > maxDim)
      ) {
        return {
          code: 'LARGE_TEXTURE',
          severity: 'warning',
          message: `Texture dimensions exceed ${maxDim}px`,
          field: 'dimensions',
          suggestion: 'Consider using smaller resolution or mipmaps',
          autoFixable: true,
        };
      }
      return null;
    },
  },

  {
    id: 'texture-no-compression',
    name: 'Uncompressed Texture',
    description: 'Suggest texture compression',
    severity: 'info',
    appliesTo: ['texture'],
    validate: (asset) => {
      const compressedFormats = ['ktx2', 'basis', 'webp', 'avif'];
      if (!compressedFormats.includes(asset.format)) {
        return {
          code: 'UNCOMPRESSED_TEXTURE',
          severity: 'info',
          message: 'Texture is not using compressed format',
          field: 'format',
          suggestion: 'Convert to KTX2 or Basis for GPU-compressed textures',
          autoFixable: true,
        };
      }
      return null;
    },
  },

  // ─── Platform Compatibility ──────────────────────────────────────────────
  {
    id: 'no-platform-defined',
    name: 'No Platform Compatibility',
    description: 'Warn if no platforms are explicitly supported',
    severity: 'warning',
    appliesTo: 'all',
    validate: (asset) => {
      const pc = asset.platformCompatibility;
      const hasAny =
        pc.webgl || pc.webgl2 || pc.webgpu || pc.vr || pc.ar || pc.mobile || pc.desktop;

      if (!hasAny) {
        return {
          code: 'NO_PLATFORM_DEFINED',
          severity: 'warning',
          message: 'No platform compatibility defined',
          field: 'platformCompatibility',
          suggestion: 'Define supported platforms for better optimization',
          autoFixable: true,
        };
      }
      return null;
    },
  },

  // ─── Dependencies ────────────────────────────────────────────────────────
  {
    id: 'missing-dependencies',
    name: 'Unresolved Dependencies',
    description: 'Check for declared but unresolved dependencies',
    severity: 'error',
    appliesTo: 'all',
    validate: (asset) => {
      const missingDeps = asset.dependencies.filter((d) => d.required && !d.fallback);

      if (missingDeps.length > 0) {
        return {
          code: 'MISSING_DEPENDENCIES',
          severity: 'error',
          message: `${missingDeps.length} required dependencies without fallbacks`,
          field: 'dependencies',
          suggestion: 'Add fallback assets for required dependencies',
          autoFixable: false,
        };
      }
      return null;
    },
  },

  // ─── Semantic Tags ───────────────────────────────────────────────────────
  {
    id: 'no-tags',
    name: 'No Tags Defined',
    description: 'Suggest adding tags for discoverability',
    severity: 'info',
    appliesTo: 'all',
    validate: (asset) => {
      if (!asset.tags || asset.tags.length === 0) {
        return {
          code: 'NO_TAGS',
          severity: 'info',
          message: 'Asset has no tags for discovery',
          field: 'tags',
          suggestion: 'Add descriptive tags for better searchability',
          autoFixable: false,
        };
      }
      return null;
    },
  },

  {
    id: 'no-semantic-category',
    name: 'No Semantic Category',
    description: 'Suggest adding semantic category',
    severity: 'info',
    appliesTo: 'all',
    validate: (asset) => {
      if (!asset.semanticTags?.category) {
        return {
          code: 'NO_SEMANTIC_CATEGORY',
          severity: 'info',
          message: 'Asset has no semantic category',
          field: 'semanticTags.category',
          suggestion: 'Add category (character, prop, environment, etc.)',
          autoFixable: false,
        };
      }
      return null;
    },
  },
];

// ============================================================================
// Asset Validator
// ============================================================================

export class AssetValidator {
  private rules: ValidationRule[] = [...BUILTIN_RULES];

  /**
   * Add a custom validation rule
   */
  addRule(rule: ValidationRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove a rule by ID
   */
  removeRule(ruleId: string): boolean {
    const idx = this.rules.findIndex((r) => r.id === ruleId);
    if (idx !== -1) {
      this.rules.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all rules
   */
  getRules(): ValidationRule[] {
    return [...this.rules];
  }

  /**
   * Validate a single asset
   */
  validate(asset: AssetMetadata): ValidationResult {
    const issues: ValidationIssue[] = [];

    for (const rule of this.rules) {
      // Check if rule applies to this asset type
      if (rule.appliesTo !== 'all' && !rule.appliesTo.includes(asset.assetType)) {
        continue;
      }

      const issue = rule.validate(asset);
      if (issue) {
        issues.push(issue);
      }
    }

    // Count by severity
    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;
    const infoCount = issues.filter((i) => i.severity === 'info').length;

    // Generate optimization suggestions
    const optimizations = this.generateOptimizations(asset, issues);

    return {
      valid: errorCount === 0,
      issues,
      errorCount,
      warningCount,
      infoCount,
      validatedAt: new Date().toISOString(),
      optimizations,
    };
  }

  /**
   * Validate multiple assets
   */
  validateAll(assets: AssetMetadata[]): Map<string, ValidationResult> {
    const results = new Map<string, ValidationResult>();
    for (const asset of assets) {
      results.set(asset.id, this.validate(asset));
    }
    return results;
  }

  /**
   * Generate optimization suggestions based on validation
   */
  private generateOptimizations(
    asset: AssetMetadata,
    issues: ValidationIssue[]
  ): AssetOptimization[] {
    const optimizations: AssetOptimization[] = [];

    // Texture compression suggestion
    if (issues.some((i) => i.code === 'UNCOMPRESSED_TEXTURE')) {
      optimizations.push({
        type: 'texture_compression',
        suggestion: 'Convert to KTX2 with Basis Universal compression',
        estimatedImprovement: {
          memorySavings: Math.floor(asset.fileSize * 0.75),
          loadTimeSavings: 500,
        },
        priority: 0.8,
        autoApply: true,
      });
    }

    // LOD generation suggestion
    if (issues.some((i) => i.code === 'MISSING_LOD' || i.code === 'HIGH_POLY_COUNT')) {
      optimizations.push({
        type: 'lod_generation',
        suggestion: 'Generate 3 LOD levels at 50%, 25%, 10% of original',
        estimatedImprovement: {
          renderTimeSavings: 5,
        },
        priority: 0.7,
        autoApply: true,
      });
    }

    // Mesh simplification suggestion
    if (issues.some((i) => i.code === 'HIGH_POLY_COUNT')) {
      optimizations.push({
        type: 'mesh_simplification',
        suggestion: 'Reduce polygon count by 30-50% using mesh decimation',
        estimatedImprovement: {
          memorySavings: Math.floor(asset.estimatedGPUMemory * 0.3),
          renderTimeSavings: 3,
        },
        priority: 0.6,
        autoApply: false,
      });
    }

    // Large file compression
    if (issues.some((i) => i.code === 'LARGE_FILE')) {
      optimizations.push({
        type: 'format_conversion',
        suggestion: 'Apply Draco compression for mesh data',
        estimatedImprovement: {
          memorySavings: Math.floor(asset.fileSize * 0.6),
          loadTimeSavings: 1000,
        },
        priority: 0.9,
        autoApply: true,
      });
    }

    return optimizations;
  }

  /**
   * Check platform compatibility
   */
  checkPlatformCompatibility(
    asset: AssetMetadata,
    targetPlatform: keyof PlatformCompatibility
  ): { compatible: boolean; issues: string[] } {
    const issues: string[] = [];
    const pc = asset.platformCompatibility;

    // Check direct platform support
    const supported = pc[targetPlatform];
    if (supported === false) {
      issues.push(`Asset explicitly not supported on ${targetPlatform}`);
    }

    // Platform-specific checks
    if (targetPlatform === 'vr' || targetPlatform === 'mobile') {
      // Check file size
      if (asset.fileSize > 20 * 1024 * 1024) {
        issues.push('File size may cause issues on VR/mobile');
      }

      // Check poly count
      if (asset.meshStats && asset.meshStats.triangleCount > 50000) {
        issues.push('High polygon count may impact VR/mobile performance');
      }

      // Check texture size
      if (asset.dimensions && asset.dimensions.width > 2048) {
        issues.push('Large textures may impact VR/mobile memory');
      }
    }

    return {
      compatible: issues.length === 0,
      issues,
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================



// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new asset validator
 */
export function createAssetValidator(): AssetValidator {
  return new AssetValidator();
}

/**
 * Validate an asset with default rules
 */
export function validateAsset(asset: AssetMetadata): ValidationResult {
  return new AssetValidator().validate(asset);
}

/**
 * Quick check if asset is valid
 */
export function isAssetValid(asset: AssetMetadata): boolean {
  return new AssetValidator().validate(asset).valid;
}
