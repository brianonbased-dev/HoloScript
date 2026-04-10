/**
 * Deprecation Module
 *
 * Re-exports all deprecation-related functionality.
 */

export {
  DeprecationRegistry,
  defaultRegistry,
  createDeprecationRegistry,
  registerDeprecation,
  isTraitDeprecated,
  checkSyntaxDeprecations,
  type DeprecationSeverity,
  type DeprecationEntry,
  type DeprecationMatch,
} from './DeprecationRegistry';
