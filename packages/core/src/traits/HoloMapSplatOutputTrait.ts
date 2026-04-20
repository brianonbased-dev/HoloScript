/**
 * HoloMap Splat Output Trait
 *
 * Declares that a HoloMap reconstruction session should emit a Gaussian
 * splat representation alongside the point cloud. Downstream: compiles to
 * .splat / SPZ v2 and feeds GaussianSplatTrait for rendering.
 *
 * Scope (Sprint 1): stub handler. Splat baking lands in Sprint 2 and
 * shares the existing GaussianSplatBakingPipeline where possible.
 *
 * @version 0.0.1 (scaffold)
 */

import type { TraitHandler } from './TraitTypes';

export interface HoloMapSplatOutputConfig {
  /** Target splat format */
  format: 'splat' | 'spz';
  /** SPZ version (when format='spz') */
  spzVersion?: '1.0' | '2.0';
  /** Max splats emitted (budgets VRAM on downstream renderer) */
  maxSplats: number;
  /** Bake view-dependent spherical harmonics (costs time, improves quality) */
  bakeSphericalHarmonics: boolean;
}

export const holomapSplatOutputHandler: TraitHandler<HoloMapSplatOutputConfig> = {
  name: 'holomap_splat_output',

  defaultConfig: {
    format: 'spz',
    spzVersion: '2.0',
    maxSplats: 500_000,
    bakeSphericalHarmonics: false,
  },

  onAttach(_node, _config, context) {
    context.emit?.('holomap:splat_output_registered', {});
  },

  onEvent(_node, config, context, event) {
    if (event.type !== 'holomap:finalized') return;
    const payload = event.payload ?? {};
    context.emit?.('holomap:splat_bake_requested', {
      format: config.format,
      spzVersion: config.spzVersion,
      maxSplats: config.maxSplats,
      bakeSphericalHarmonics: config.bakeSphericalHarmonics,
      replayHash:
        payload.manifest && typeof payload.manifest === 'object'
          ? (payload.manifest as Record<string, unknown>).replayHash
          : undefined,
    });
  },
};
