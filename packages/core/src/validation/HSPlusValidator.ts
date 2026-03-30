/**
 * HSPlus Validator
 *
 * Validates .hsplus code for syntax and semantic correctness.
 * Extracted from Hololand's HololandParserBridge — these are
 * language-level validation rules for the HSPlus format.
 *
 * Platform-specific concerns (device optimization, trait registration,
 * UI editor integration) stay in the consuming platform.
 *
 * @module HSPlusValidator
 */

// =============================================================================
// VALIDATION TYPES
// =============================================================================

/**
 * Parser validation error with recovery suggestion
 */
export interface ParserValidationError {
  type: 'syntax' | 'semantic' | 'runtime' | 'device';
  message: string;
  line?: number;
  column?: number;
  suggestion?: string;
  recoverable: boolean;
}

/**
 * Device-specific optimization context
 */
export interface DeviceOptimizationContext {
  deviceId: string;
  gpuCapability: 'low' | 'medium' | 'high' | 'extreme';
  cpuCapability: 'low' | 'medium' | 'high' | 'extreme';
  targetFPS: number;
  maxGPUMemory: number;
  supportedShaderLevel: 'es2' | 'es3' | 'es31' | 'core';
}

/**
 * Code generation options
 */
export interface CodeGenerationOptions {
  includeMetadata?: boolean;
  optimizeForDevice?: DeviceOptimizationContext;
  generateImports?: boolean;
  strictMode?: boolean;
  validateDependencies?: boolean;
}

/**
 * Parser registration result
 */
export interface ParserRegistrationResult {
  success: boolean;
  traitId?: string;
  error?: string;
  warnings?: string[];
  metadata?: {
    deviceOptimizations?: string[];
    estimatedMemory?: number;
    performanceImpact?: 'low' | 'medium' | 'high';
  };
}

// =============================================================================
// VALIDATION RULES
// =============================================================================

/** Valid HSPlus trait decorators */
const VALID_DECORATORS = ['@material', '@trait', '@shader', '@animation', '@interaction'];

/** Valid HSPlus property type annotations */
const VALID_PROPERTY_TYPES = [':number', ':color', ':enum', ':boolean', ':string', ':vec3'];

/** Reserved keywords that should not appear in HSPlus code */
const RESERVED_KEYWORDS = ['override', 'interface', 'abstract', 'virtual'];

/** Maximum code size before performance warning (bytes) */
const MAX_CODE_SIZE = 100_000;

// =============================================================================
// VALIDATOR
// =============================================================================

/**
 * Validation result from validateHSPlus
 */
export interface HSPlusValidationResult {
  valid: boolean;
  errors: ParserValidationError[];
  warnings: ParserValidationError[];
}

/**
 * Validate HSPlus code for parser compatibility.
 *
 * Checks:
 * - Basic syntax structure (decorators, braces)
 * - Valid trait decorators
 * - Property type annotations
 * - Semantic issues (undefined/null references)
 * - Brace balance
 * - Code size limits
 * - Reserved keyword usage
 */
export function validateHSPlus(code: string): HSPlusValidationResult {
  const errors: ParserValidationError[] = [];
  const warnings: ParserValidationError[] = [];

  try {
    // Check syntax: basic structure validation
    if (!code.includes('@') || (!code.includes('{') && !code.includes('}'))) {
      errors.push({
        type: 'syntax',
        message: 'Invalid HSPlus syntax: missing trait decorator or braces',
        line: 1,
        suggestion: 'Ensure code starts with @traitType { ... }',
        recoverable: true,
      });
    }

    // Check for valid trait decorators
    const hasValidDecorator = VALID_DECORATORS.some((dec) => code.includes(dec));
    if (!hasValidDecorator) {
      warnings.push({
        type: 'semantic',
        message: 'No recognized trait decorator found',
        suggestion: `Use one of: ${VALID_DECORATORS.join(', ')}`,
        recoverable: true,
      });
    }

    // Check for property types
    const usesValidTypes = VALID_PROPERTY_TYPES.some((type) => code.includes(type));
    if (!usesValidTypes) {
      warnings.push({
        type: 'semantic',
        message: 'No recognized property types found',
        suggestion: `Use types: ${VALID_PROPERTY_TYPES.join(', ')}`,
        recoverable: true,
      });
    }

    // Semantic validation
    if (code.match(/undefined|null/gi)) {
      errors.push({
        type: 'semantic',
        message: 'Code contains undefined or null references',
        recoverable: false,
      });
    }

    // Check for nested braces balance
    const openBraces = (code.match(/{/g) || []).length;
    const closeBraces = (code.match(/}/g) || []).length;
    if (openBraces !== closeBraces) {
      errors.push({
        type: 'syntax',
        message: `Unbalanced braces: ${openBraces} open, ${closeBraces} closed`,
        recoverable: true,
      });
    }

    // Parser-specific restrictions
    if (code.length > MAX_CODE_SIZE) {
      warnings.push({
        type: 'runtime',
        message: `Code exceeds ${MAX_CODE_SIZE / 1000}KB, may impact parsing performance`,
        recoverable: true,
      });
    }

    // Reserved keywords check
    for (const keyword of RESERVED_KEYWORDS) {
      if (new RegExp(`\\b${keyword}\\b`, 'i').test(code)) {
        warnings.push({
          type: 'semantic',
          message: `Code uses reserved keyword: ${keyword}`,
          recoverable: true,
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  } catch (error) {
    errors.push({
      type: 'runtime',
      message: `Validation error: ${error instanceof Error ? error.message : String(error)}`,
      recoverable: true,
    });

    return { valid: false, errors, warnings };
  }
}
