/**
 * `@provenance` — declares the data-origin class of an object's geometry.
 *
 * This is the NATIVE authoring surface for the observed-vs-invented moat axis
 * (see `../reconstruction/PointProvenance.ts`). A `.holo` / `.hsplus` author
 * writes
 *
 *   @provenance(class: "generative-extended", source: "artifixer-14b")
 *
 * on a `@gaussian_splat` object instead of threading per-point provenance codes
 * through compiler options. The GaussianSplattingCompiler reads this trait and
 * stamps every emitted splat with the declared class (→ glTF `_PROVENANCE`
 * attribute + `asset.extras.holoProvenance` histogram).
 *
 * WHY native (D.104): the provenance vocabulary must dissolve into the language,
 * not live only as TS payload plumbing. NVIDIA ArtiFixer carries no
 * observed-vs-invented signal at all — declaring it natively is the
 * language-level differentiator
 * (research/2026-06-23_artifixer-nvidia-generative-reconstruction.md).
 *
 * @package @holoscript/core/traits
 */
import type { PointProvenanceClass } from '../reconstruction/PointProvenance';
import type { TraitHandler } from './TraitTypes';

export interface ProvenanceTraitConfig {
  /**
   * Data-origin class for this object's geometry: `observed` (sensor-attested),
   * `interpolated` (densified between observations), or `generative-extended`
   * (model-invented). Defaults to `observed`.
   */
  class?: PointProvenanceClass;
  /**
   * Origin label — a sensor id ('sensor:quest3-depth') or a generative model id
   * ('artifixer-14b'). Recorded verbatim in the exported glTF
   * `asset.extras.holoProvenance.source`.
   */
  source?: string;
}

export const provenanceHandler: TraitHandler<ProvenanceTraitConfig> = {
  name: 'provenance',
  defaultConfig: {
    class: 'observed',
  },
  onAttach(node, config, context) {
    node.__provenance = {
      class: config.class ?? 'observed',
      source: config.source,
    };
    context.emit?.('provenance_declared', { node, provenance: node.__provenance });
  },
  onDetach(node, _config, context) {
    delete node.__provenance;
    context.emit?.('provenance_detached', { node });
  },
};
