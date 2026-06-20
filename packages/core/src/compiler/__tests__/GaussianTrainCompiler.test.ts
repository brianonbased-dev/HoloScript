/**
 * GaussianTrainCompiler — `compile_to_gaussian_train` sovereign target.
 *
 * Asserts the compiler bridges a @gaussian_train trait to a validated GaussianTrainJob:
 *  - sovereign backend (default) → native executor, sovereign:true, no RENDER tokens
 *  - remote backend → the legacy api.rendernetwork.com executor
 *  - invalid configs throw at compile time (F.126: a job that can't train can't be constructed)
 * G.GOLD.013 discipline: every TRUE assertion (valid → job) is paired with a FALSE
 * (invalid → throws), so the validation gate can't silently degrade to a pass-through.
 */
import { describe, it, expect } from 'vitest';
import {
  GaussianTrainCompiler,
  GaussianTrainConfigError,
  SOVEREIGN_TRAIN_EXECUTOR,
  REMOTE_TRAIN_EXECUTOR,
} from '../GaussianTrainCompiler';
import type { HoloComposition, HoloObjectDecl, HoloObjectTrait } from '../../parser/HoloCompositionTypes';

function makeTrait(name: string, config: Record<string, unknown> = {}): HoloObjectTrait {
  return { type: 'ObjectTrait', name, config };
}
function makeObject(name: string, traits: HoloObjectTrait[]): HoloObjectDecl {
  return { type: 'Object', name, properties: [], traits };
}
function makeComposition(objects: HoloObjectDecl[]): HoloComposition {
  return {
    type: 'Composition', name: 'TrainTest', templates: [], objects, spatialGroups: [], lights: [],
    imports: [], timelines: [], audio: [], zones: [], transitions: [], conditionals: [], iterators: [],
    npcs: [], quests: [], abilities: [], dialogues: [], stateMachines: [], achievements: [],
    talentTrees: [], shapes: [],
  };
}

const VALID_CONFIG = {
  views: 'captures/kitchen/posed/',
  init: 'captures/kitchen/points.ply',
  iterations: 5000,
  targetGaussians: 200000,
  positionLR: 0.0002,
  scaleLR: 0.004,
  rotationLR: 0.001,
  opacityLR: 0.04,
  colorLR: 0.0025,
  densifyInterval: 100,
  dilation: 0.3,
  output: 'twins/kitchen.ply',
};

describe('GaussianTrainCompiler — sovereign training-job emit', () => {
  it('TRUE: a valid @gaussian_train trait → sovereign job wired to the native trainer', () => {
    const comp = makeComposition([makeObject('Kitchen', [makeTrait('gaussian_train', VALID_CONFIG)])]);
    const job = new GaussianTrainCompiler().compile(comp);

    expect(job.kind).toBe('gaussian-train-job');
    expect(job.backend).toBe('sovereign'); // default is native-first (F.127)
    expect(job.sovereign).toBe(true);
    expect(job.executor).toEqual(SOVEREIGN_TRAIN_EXECUTOR);
    expect(job.dataset).toEqual({ views: VALID_CONFIG.views, init: VALID_CONFIG.init });
    expect(job.hyperparams.iterations).toBe(5000);
    expect(job.hyperparams.targetGaussians).toBe(200000);
    expect(job.hyperparams.learningRates).toEqual({
      position: 0.0002, scale: 0.004, rotation: 0.001, opacity: 0.04, color: 0.0025,
    });
    expect(job.hyperparams.dilation).toBe(0.3);
    expect(job.output).toEqual({ path: 'twins/kitchen.ply', format: 'ply' });
  });

  it('TRUE: backend:"remote" → legacy api.rendernetwork.com executor, sovereign:false', () => {
    const comp = makeComposition([
      makeObject('Kitchen', [makeTrait('gaussian_train', { ...VALID_CONFIG, backend: 'remote' })]),
    ]);
    const job = new GaussianTrainCompiler().compile(comp);
    expect(job.backend).toBe('remote');
    expect(job.sovereign).toBe(false);
    expect(job.executor).toEqual(REMOTE_TRAIN_EXECUTOR);
  });

  it('applies defaults for omitted fields (views still required)', () => {
    const comp = makeComposition([makeObject('K', [makeTrait('gaussian_train', { views: 'v/' })])]);
    const job = new GaussianTrainCompiler().compile(comp);
    expect(job.hyperparams.iterations).toBe(30000); // DEFAULT_GAUSSIAN_TRAIN_CONFIG
    expect(job.hyperparams.learningRates.position).toBeCloseTo(0.00016, 6);
    expect(job.backend).toBe('sovereign');
  });

  it('FALSE: iterations <= 0 → throws GaussianTrainConfigError (fail at construction)', () => {
    const comp = makeComposition([
      makeObject('K', [makeTrait('gaussian_train', { ...VALID_CONFIG, iterations: 0 })]),
    ]);
    expect(() => new GaussianTrainCompiler().compile(comp)).toThrow(GaussianTrainConfigError);
  });

  it('FALSE: missing `views` → throws (a trainer with no views cannot train)', () => {
    const comp = makeComposition([
      makeObject('K', [makeTrait('gaussian_train', { ...VALID_CONFIG, views: '' })]),
    ]);
    expect(() => new GaussianTrainCompiler().compile(comp)).toThrow(GaussianTrainConfigError);
  });

  it('FALSE: no @gaussian_train trait present → throws', () => {
    const comp = makeComposition([makeObject('K', [makeTrait('gaussian_splat')])]);
    expect(() => new GaussianTrainCompiler().compile(comp)).toThrow(GaussianTrainConfigError);
  });
});
