/**
 * GaussianTrainCompiler — `compile_to_gaussian_train` SOVEREIGN export target.
 *
 * Bridges the `@gaussian_train` authoring trait to the native differentiable trainer: it reads the
 * trait config from a HoloComposition and emits a validated, serializable `GaussianTrainJob`. The
 * sovereign backend's job points at `@holoscript/engine` GaussianTrainRunner (GaussianTrainer3D +
 * GaussianTrainer2D) — our own GPU/CPU autodiff path, $0, no third-party runtime, no RENDER tokens.
 * (The legacy `remote` backend points at GaussianSplatBakingPipeline → api.rendernetwork.com.)
 *
 * This is the language surface around the gradient-checked trainer (GaussianTrainer3D.test.ts /
 * GaussianTrainer2D.test.ts). It is SOVEREIGN (sovereign-targets.ts) because executing its output
 * needs no engine but ours — unlike `3dgs` (BRIDGE: emits KHR glTF for third-party splat viewers).
 *
 * CORRECTNESS IS GATE-ENFORCED (F.126): an invalid training config throws at compile time
 * (GaussianTrainConfigError) — a job that could not actually train cannot be constructed.
 *
 * @version 1.0.0
 */

import { CompilerBase } from './CompilerBase';
import type { HoloComposition, HoloObjectTrait } from '../parser/HoloCompositionTypes';
import {
  DEFAULT_GAUSSIAN_TRAIN_CONFIG,
  type GaussianTrainConfig,
  type GaussianTrainBackend,
} from '../traits/GaussianTrainTrait';

/** The sovereign native executor the compiled job dispatches against. */
export const SOVEREIGN_TRAIN_EXECUTOR = {
  module: '@holoscript/engine/gpu/GaussianTrainRunner',
  entry: 'runGaussianTrainJob',
} as const;

/** The legacy remote executor (kept for `backend: 'remote'`). */
export const REMOTE_TRAIN_EXECUTOR = {
  module: '@holoscript/core/traits/GaussianSplatBakingPipeline',
  entry: 'GaussianBakingPipeline',
} as const;

/**
 * The compiled artifact: a self-contained, JSON-serializable training-job specification. This IS
 * the emit (behavior-as-data) — the runtime/brain executes it by invoking the referenced executor.
 */
export interface GaussianTrainJob {
  kind: 'gaussian-train-job';
  version: '1.0.0';
  /** Compute backend. `sovereign` => native trainer ($0); `remote` => api.rendernetwork.com. */
  backend: GaussianTrainBackend;
  /** True iff the job runs entirely on our own path (no third-party runtime, no paid tokens). */
  sovereign: boolean;
  /** Where the job is executed (native runner for sovereign; baking pipeline for remote). */
  executor: { module: string; entry: string };
  /** Dataset references the executor resolves at run time. */
  dataset: { views: string; init: string };
  /** Hyperparameters consumed by GaussianTrainRunner (sovereign) / the remote train stage. */
  hyperparams: {
    iterations: number;
    targetGaussians: number;
    learningRates: {
      position: number;
      scale: number;
      rotation: number;
      opacity: number;
      color: number;
    };
    densifyInterval: number;
    dilation: number;
  };
  /** Output twin destination. */
  output: { path: string; format: 'ply' };
}

/** Thrown when a `@gaussian_train` config cannot produce a runnable job (F.126: fail at construction). */
export class GaussianTrainConfigError extends Error {
  constructor(public readonly violations: string[]) {
    super(`Invalid @gaussian_train config — cannot construct a runnable training job:\n  - ${violations.join('\n  - ')}`);
    this.name = 'GaussianTrainConfigError';
  }
}

export interface GaussianTrainCompilerOptions {
  /** Override the default backend when the trait omits it. */
  defaultBackend?: GaussianTrainBackend;
}

export class GaussianTrainCompiler extends CompilerBase {
  protected readonly compilerName = 'GaussianTrainCompiler';
  private readonly options: Required<GaussianTrainCompilerOptions>;

  constructor(options: GaussianTrainCompilerOptions = {}) {
    super();
    this.options = { defaultBackend: options.defaultBackend ?? 'sovereign' };
  }

  // No third-party engine runtime — sovereign target has no interchange ANS namespace.
  protected override getRequiredCapability(): string | undefined {
    return undefined;
  }

  /**
   * Compile a composition carrying a `@gaussian_train` trait into a validated GaussianTrainJob.
   * @throws GaussianTrainConfigError if no `@gaussian_train` trait is present, or its config is invalid.
   */
  compile(composition: HoloComposition, agentToken?: string, outputPath?: string): GaussianTrainJob {
    this.validateCompilerAccess(agentToken, outputPath);
    const raw = this.findTrainTraitConfig(composition);
    if (!raw) {
      throw new GaussianTrainConfigError([
        'no @gaussian_train trait found in the composition (compile_to_gaussian_train requires one)',
      ]);
    }
    const config = this.coerceConfig(raw);
    this.validateConfig(config);
    return this.buildJob(config);
  }

  private findTrainTraitConfig(composition: HoloComposition): Record<string, unknown> | undefined {
    for (const obj of composition.objects ?? []) {
      const trait = obj.traits?.find((t: HoloObjectTrait) => t.name === 'gaussian_train');
      if (trait && trait.config) return trait.config as Record<string, unknown>;
    }
    return undefined;
  }

  /** Merge raw trait config over defaults, coercing numeric fields. Unknown keys are ignored. */
  private coerceConfig(raw: Record<string, unknown>): GaussianTrainConfig {
    const num = (v: unknown, fallback: number): number =>
      typeof v === 'number' ? v : v != null && !Number.isNaN(Number(v)) ? Number(v) : fallback;
    const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
    const d = DEFAULT_GAUSSIAN_TRAIN_CONFIG;
    const backend: GaussianTrainBackend =
      raw.backend === 'remote' || raw.backend === 'sovereign' ? raw.backend : this.options.defaultBackend;
    return {
      views: str(raw.views, d.views),
      init: str(raw.init, d.init),
      iterations: num(raw.iterations, d.iterations),
      targetGaussians: num(raw.targetGaussians, d.targetGaussians),
      positionLR: num(raw.positionLR, d.positionLR),
      scaleLR: num(raw.scaleLR, d.scaleLR),
      rotationLR: num(raw.rotationLR, d.rotationLR),
      opacityLR: num(raw.opacityLR, d.opacityLR),
      colorLR: num(raw.colorLR, d.colorLR),
      densifyInterval: num(raw.densifyInterval, d.densifyInterval),
      dilation: num(raw.dilation, d.dilation),
      backend,
      output: str(raw.output, d.output),
    };
  }

  /** Fail-at-construction validation (F.126). */
  private validateConfig(c: GaussianTrainConfig): void {
    const v: string[] = [];
    if (!c.views || c.views.trim() === '') v.push('`views` (posed-view dataset) is required and must be non-empty');
    if (!(c.iterations > 0)) v.push(`\`iterations\` must be > 0 (got ${c.iterations})`);
    if (!(c.targetGaussians > 0)) v.push(`\`targetGaussians\` must be > 0 (got ${c.targetGaussians})`);
    for (const [k, val] of [
      ['positionLR', c.positionLR], ['scaleLR', c.scaleLR], ['rotationLR', c.rotationLR],
      ['opacityLR', c.opacityLR], ['colorLR', c.colorLR],
    ] as const) {
      if (!(val >= 0) || Number.isNaN(val)) v.push(`\`${k}\` must be a finite number >= 0 (got ${val})`);
    }
    if (!(c.densifyInterval >= 0)) v.push(`\`densifyInterval\` must be >= 0 (got ${c.densifyInterval})`);
    if (!(c.dilation >= 0)) v.push(`\`dilation\` must be >= 0 (got ${c.dilation})`);
    if (v.length > 0) throw new GaussianTrainConfigError(v);
  }

  private buildJob(c: GaussianTrainConfig): GaussianTrainJob {
    const sovereign = c.backend === 'sovereign';
    return {
      kind: 'gaussian-train-job',
      version: '1.0.0',
      backend: c.backend,
      sovereign,
      executor: sovereign ? { ...SOVEREIGN_TRAIN_EXECUTOR } : { ...REMOTE_TRAIN_EXECUTOR },
      dataset: { views: c.views, init: c.init },
      hyperparams: {
        iterations: c.iterations,
        targetGaussians: c.targetGaussians,
        learningRates: {
          position: c.positionLR,
          scale: c.scaleLR,
          rotation: c.rotationLR,
          opacity: c.opacityLR,
          color: c.colorLR,
        },
        densifyInterval: c.densifyInterval,
        dilation: c.dilation,
      },
      output: { path: c.output, format: 'ply' },
    };
  }
}

export function createGaussianTrainCompiler(options?: GaussianTrainCompilerOptions): GaussianTrainCompiler {
  return new GaussianTrainCompiler(options);
}
