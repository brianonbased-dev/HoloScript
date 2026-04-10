/**
 * @holoscript/mvc-schema - Validation
 *
 * Comprehensive validation for all MVC objects with detailed error reporting.
 *
 * @packageDocumentation
 */

export {
  validateMVC,
  validateDecisionHistory,
  validateTaskState,
  validatePreferences,
  validateSpatialContext,
  validateEvidenceTrail,
  validateAuto,
  validateBatch,
  type ValidationResult,
  type ValidationError,
} from './ajv-validator';
