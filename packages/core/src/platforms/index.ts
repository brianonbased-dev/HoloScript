/**
 * Platform / XR conditional compilation and cross-reality registry (public barrel).
 * Import order for the main package is orchestrated in `src/barrel/index.ts` so culture
 * and agent exports stay between conditional-modality and cross-reality blocks.
 */

export * from './conditional-modality';
export * from './cross-reality';
