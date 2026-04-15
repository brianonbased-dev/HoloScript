/**
 * PostFX Module
 *
 * Re-exports post-processing pipeline from rendering subsystem.
 */

export * from '../rendering/postprocess';
export { PostProcessingStack as LegacyPostProcessing } from '../rendering/PostProcessing';
export { PostProcessStack as LegacyPostProcessStack } from '../rendering/PostProcessStack';
export { BloomEffect as LegacyBloomEffect } from '../rendering/BloomEffect';

export * from './postfx-config';

