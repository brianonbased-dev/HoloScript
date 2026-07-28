import { describe, it, expect, beforeEach, vi } from 'vitest';
import EmbodiedDatasetCompiler from '../EmbodiedDatasetCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestScene',
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    animations: [],
    triggers: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    ...overrides,
  } as HoloComposition;
}

function makeObject(overrides: Partial<HoloObjectDecl> = {}): HoloObjectDecl {
  return {
    type: 'Object',
    name: 'TestObj',
    properties: [],
    traits: [],
    ...overrides,
  } as HoloObjectDecl;
}

describe('EmbodiedDatasetCompiler', () => {
  let compiler: EmbodiedDatasetCompiler;

  beforeEach(() => {
    compiler = new EmbodiedDatasetCompiler();
  });

  // =========== MJCF reuse (composes with compile_to_mjcf) ===========

  it('embeds the MJCF XML produced by MJCFCompiler', () => {
    const py = compiler.compile(makeComposition(), 'test-token');
    expect(py).toContain('MJCF_XML = r"""');
    expect(py).toContain('<mujoco model=');
    expect(py).toContain('<worldbody>');
    expect(py).toContain('</mujoco>');
  });

  // =========== Plain-MuJoCo rollout harness (verified API) ===========

  it('emits a plain-MuJoCo rollout harness', () => {
    const py = compiler.compile(makeComposition(), 'test-token');
    expect(py).toContain('mujoco.MjModel.from_xml_string');
    expect(py).toContain('mujoco.MjData(model)');
    expect(py).toContain('mujoco.mj_resetData');
    expect(py).toContain('mujoco.mj_step(model, data)');
    expect(py).toContain('def rollout_episode(');
  });

  // =========== HDF5 writer (robomimic/AgiBot convention) ===========

  it('emits a real HDF5 writer in the robomimic convention', () => {
    const py = compiler.compile(makeComposition(), 'test-token');
    expect(py).toContain('import h5py');
    expect(py).toContain('create_group("data")');
    expect(py).toContain('f"demo_{i}"');
    expect(py).toContain('create_dataset("actions"');
    expect(py).toContain('num_samples');
    expect(py).toContain('d.attrs["total"] = total');
    expect(py).toContain('g.attrs["model_file"] = MJCF_XML');
  });

  it('emits LeRobot and RLDS as documented stubs', () => {
    const py = compiler.compile(makeComposition(), 'test-token');
    expect(py).toContain('def write_lerobot(');
    expect(py).toContain('def write_rlds(');
    expect(py).toContain('NotImplementedError');
  });

  // =========== Manifest + native @sim_to_real_dataset trait ===========

  it('emits a dataset spec/manifest with defaults when no trait present', () => {
    const py = compiler.compile(makeComposition(), 'test-token');
    expect(py).toContain('DATASET_SPEC = {');
    expect(py).toContain('"output_format": "hdf5"');
    expect(py).toContain('"episode_count": 10');
  });

  it('reads @sim_to_real_dataset trait config (composition-level)', () => {
    const comp = makeComposition({
      traits: [
        { name: 'sim_to_real_dataset', config: { episode_count: 25, output_format: 'hdf5' } },
      ],
    } as Partial<HoloComposition>);
    const py = compiler.compile(comp, 'test-token');
    expect(py).toContain('"episode_count": 25');
  });

  it('reads @sim_to_real_dataset trait config (object-level) and switches format', () => {
    const obj = makeObject({
      name: 'Robot',
      traits: [
        { name: 'sim_to_real_dataset', config: { output_format: 'lerobot', episode_count: 3 } },
      ] as HoloObjectDecl['traits'],
    });
    const py = compiler.compile(makeComposition({ objects: [obj] }), 'test-token');
    expect(py).toContain('"output_format": "lerobot"');
    expect(py).toContain('"episode_count": 3');
  });

  it('carries declared sensor_modalities into the spec', () => {
    const comp = makeComposition({
      traits: [
        { name: 'sim_to_real_dataset', config: { sensor_modalities: ['qpos', 'sensordata'] } },
      ],
    } as Partial<HoloComposition>);
    const py = compiler.compile(comp, 'test-token');
    expect(py).toContain('"sensordata"');
  });

  // =========== Options ===========

  it('honors constructor options when no trait present', () => {
    const c = new EmbodiedDatasetCompiler({ episodeCount: 5, stepsPerEpisode: 50 });
    const py = c.compile(makeComposition(), 'test-token');
    expect(py).toContain('"episode_count": 5');
    expect(py).toContain('"steps_per_episode": 50');
  });
});
