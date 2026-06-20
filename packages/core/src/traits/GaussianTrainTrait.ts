/**
 * GaussianTrain Trait — the `@gaussian_train` authoring surface (compile-time trait).
 *
 * Declares the intent to TRAIN a 3D Gaussian Splat from posed views, as DATA the
 * `compile_to_gaussian_train` target consumes (F.126: behavior authored as data, not control flow).
 * The sovereign backend runs the native differentiable trainer (GaussianTrainer3D, $0, no remote);
 * the legacy `remote` backend submits to api.rendernetwork.com via GaussianSplatBakingPipeline.
 *
 * This is a COMPILE-TIME trait: it has no runtime render handler (GaussianTrainCompiler reads its
 * config at compile time). The no-op lifecycle hooks make that explicit and satisfy the
 * registry-handler requirement (constants/index.ts §394: a name in VR_TRAITS without a registered
 * handler is a silent no-op — here the no-op IS the correct semantics).
 *
 * The training-hyperparameter fields mirror the `training` section of GaussianBakingConfig
 * (GaussianSplatBakingPipeline.ts) so the sovereign and remote backends share one vocabulary.
 *
 * SCOPE (this commit): the authoring/compile config surface only — GaussianTrainCompiler reads the
 * `@gaussian_train` trait by name from the parsed composition, so the compile target needs no
 * runtime registry entry. Registering a runtime `TraitHandler` + adding `gaussian_train` to the
 * VRTraitName union is a follow-up (it touches VRTraitSystem.ts, currently carrying peer in-flight
 * imports — committing it would ship broken sibling references).
 *
 * @version 1.0.0
 */

/** Compute backend for the training job. */
export type GaussianTrainBackend = 'sovereign' | 'remote';

/**
 * `@gaussian_train` trait configuration — the authoring surface.
 * Hyperparameters mirror GaussianBakingConfig.training; `views`/`init` are the dataset the
 * sovereign trainer optimizes against (the remote backend uploads them as a capture instead).
 */
export interface GaussianTrainConfig {
  /** Posed-view dataset the trainer optimizes against (path/URL to images+camera poses). */
  views: string;
  /** Initial gaussians: a .ply / point-cloud ref, or 'random' to init from scratch. */
  init: string;
  /** Training iterations (mirrors GaussianBakingConfig.trainingIterations; default 30000). */
  iterations: number;
  /** Target gaussian count after densification (mirrors targetGaussianCount; default 500000).
   *  NOTE: NOT consumed by the sovereign runner yet — it is fixed-cardinality (no densification).
   *  This field is the shared vocabulary for the remote backend / future densification work. */
  targetGaussians: number;
  /** Learning rate — positions (mirrors GaussianBakingConfig.positionLR; default 0.00016). */
  positionLR: number;
  /** Learning rate — scales (default 0.005). */
  scaleLR: number;
  /** Learning rate — rotations/quaternions (default 0.001). */
  rotationLR: number;
  /** Learning rate — opacity (default 0.05). */
  opacityLR: number;
  /** Learning rate — colors (default 0.0025). */
  colorLR: number;
  /** Densification interval in iterations (0 = off; mirrors densificationInterval; default 100).
   *  NOTE: NOT consumed by the sovereign runner yet (fixed-cardinality) — shared vocabulary only. */
  densifyInterval: number;
  /** 2D low-pass dilation in px (Mip-Splatting eps2d, matches the renderer; default 0.3). */
  dilation: number;
  /** Compute backend: 'sovereign' (native GaussianTrainer3D, $0) | 'remote' (api.rendernetwork.com). */
  backend: GaussianTrainBackend;
  /** Output twin path for the trained splat. */
  output: string;
}

export const DEFAULT_GAUSSIAN_TRAIN_CONFIG: GaussianTrainConfig = {
  views: '',
  init: 'random',
  iterations: 30_000,
  targetGaussians: 500_000,
  positionLR: 0.00016,
  scaleLR: 0.005,
  rotationLR: 0.001,
  opacityLR: 0.05,
  colorLR: 0.0025,
  densifyInterval: 100,
  dilation: 0.3,
  backend: 'sovereign', // native-first (F.127): the sovereign trainer is the default
  output: '',
};
