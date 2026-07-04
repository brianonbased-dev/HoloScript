import { describe, it, expect, beforeEach, vi } from 'vitest';
import MJXCompiler from '../MJXCompiler';
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

describe('MJXCompiler', () => {
  let compiler: MJXCompiler;

  beforeEach(() => {
    compiler = new MJXCompiler();
  });

  // =========== Emitted Python structure (verified MJX API) ===========

  it('emits the MuJoCo MJX model load + step API', () => {
    const py = compiler.compile(makeComposition(), 'test-token');
    expect(py).toContain('mujoco.MjModel.from_xml_string');
    expect(py).toContain('mjx.put_model');
    expect(py).toContain('mjx.step');
    expect(py).toContain('mjx.make_data');
  });

  it('embeds the MJCF XML produced by MJCFCompiler (composes with compile_to_mjcf)', () => {
    const py = compiler.compile(makeComposition(), 'test-token');
    expect(py).toContain('MJCF_XML = r"""');
    expect(py).toContain('<mujoco model=');
    expect(py).toContain('<worldbody>');
    expect(py).toContain('</mujoco>');
  });

  it('emits a real reverse-mode gradient demo over a control rollout', () => {
    const py = compiler.compile(makeComposition(), 'test-token');
    expect(py).toContain('jax.grad');
    expect(py).toContain('jax.lax.scan');
    expect(py).toContain('grad_rollout');
    expect(py).toContain('def rollout_loss(');
  });

  it('emits a jittable step and an env wrapper class', () => {
    const py = compiler.compile(makeComposition(), 'test-token');
    expect(py).toContain('@jax.jit');
    expect(py).toContain('def step(data, ctrl):');
    expect(py).toContain('class HoloScriptMJXEnv:');
  });

  // =========== Native-first @differentiable_physics trait ===========

  it('marks @differentiable_physics objects in DIFFERENTIABLE_ELEMENTS', () => {
    const obj = makeObject({
      name: 'Hip',
      traits: [{ name: 'differentiable_physics', config: {} }] as HoloObjectDecl['traits'],
    });
    const py = compiler.compile(makeComposition({ objects: [obj] }), 'test-token');
    expect(py).toContain('DIFFERENTIABLE_ELEMENTS = ["hip"]');
  });

  it('leaves DIFFERENTIABLE_ELEMENTS empty with no trait and default off', () => {
    const py = compiler.compile(makeComposition({ objects: [makeObject({ name: 'Plain' })] }), 'test-token');
    expect(py).toContain('DIFFERENTIABLE_ELEMENTS = []');
  });

  it('differentiableByDefault marks every body without a trait', () => {
    const c = new MJXCompiler({ differentiableByDefault: true });
    const py = c.compile(makeComposition({ objects: [makeObject({ name: 'Knee' })] }), 'test-token');
    expect(py).toContain('"knee"');
  });

  // =========== Options ===========

  it('honors envClassName and rolloutSteps options', () => {
    const c = new MJXCompiler({ envClassName: 'RobotEnv', rolloutSteps: 128 });
    const py = c.compile(makeComposition(), 'test-token');
    expect(py).toContain('class RobotEnv:');
    expect(py).toContain('ROLLOUT_STEPS = 128');
  });
});
