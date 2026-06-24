/**
 * `@provenance_densify` — declares that an object's captured point cloud should
 * be DENSIFIED before it is splatted, and which honesty class the added points
 * carry. The GaussianSplattingCompiler reads this trait, runs the matching
 * densifier, and auto-tags every point through the provenance pipeline:
 * `observed` originals + `interpolated` (bounded-by-reality midpoints) or
 * `generative-extended` (model-invented fill) additions.
 *
 *   @provenance_densify(mode: "interpolation")                       // honest, no model
 *   @provenance_densify(mode: "generative", source: "wan2.1-sovereign")  // model fill
 *
 * This is the native authoring surface the D.101 carve-out (founder, 2026-06-24:
 * "lift freeze on this as it helps boost the language") unfroze — densification,
 * INCLUDING the generative tier, expressed in the language rather than as
 * out-of-band tooling. The generative tier dispatches to a drop-in
 * GenerativeDensifierBackend; absent one, the compiler emits a loud warning and
 * invents nothing (honest seam, never a fake producer).
 *
 * @package @holoscript/core/traits
 */
import type { DensifyMode } from '../reconstruction/densifyByInterpolation';
import type { TraitHandler } from './TraitTypes';

export interface ProvenanceDensifyConfig {
  /**
   * `interpolation` (default) = honest, bounded-by-reality midpoints; added
   * points are `interpolated`. `generative` = model-invented fill of unobserved
   * regions; added points are `generative-extended` (requires a backend).
   */
  mode?: DensifyMode;
  /** Origin label recorded on the densified output (sensor / model id). */
  source?: string;
  /** Optional cap on points added by densification. */
  maxAdded?: number;
}

export const provenanceDensifyHandler: TraitHandler<ProvenanceDensifyConfig> = {
  name: 'provenance_densify',
  defaultConfig: {
    mode: 'interpolation',
  },
  onAttach(node, config, context) {
    node.__provenanceDensify = {
      mode: config.mode ?? 'interpolation',
      source: config.source,
      maxAdded: config.maxAdded,
    };
    context.emit?.('provenance_densify_declared', { node, densify: node.__provenanceDensify });
  },
  onDetach(node, _config, context) {
    delete node.__provenanceDensify;
    context.emit?.('provenance_densify_detached', { node });
  },
};
