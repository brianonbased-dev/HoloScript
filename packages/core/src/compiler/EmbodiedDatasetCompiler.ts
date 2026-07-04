/**
 * HoloScript → Embodied-AI Dataset Generator Compiler
 *
 * Exports a HoloScript physics composition to a runnable Python **dataset generator**
 * that produces N simulation episodes as a structured embodied-AI training dataset
 * (HDF5 now; LeRobot / RLDS documented stubs). The sovereign answer to AgiBot Genie
 * Sim 3's sim-to-real dataset pipeline (CG-107): a .holo world becomes a training-data
 * factory, not a hand-built capture rig.
 *
 * Builds ON compile_to_mjcf (CG-046): it REUSES MJCFCompiler to embed the physics XML
 * from the SAME .holo (so the dataset and the sim agree on physics), then emits a plain
 * MuJoCo rollout harness (mujoco.mj_step) that collects per-step observations + actions
 * over N episodes with per-episode domain randomization, and writes them in the robomimic/
 * AgiBot HDF5 convention.
 *
 * Native-first (F.137): dataset params are declared in the .holo via a native
 * `@sim_to_real_dataset` trait (episode_count, output_format, sensor_modalities,
 * domain_randomization, steps_per_episode, seed), read off the parsed AST (composition-
 * level or any object) — zero grammar change.
 *
 * BRIDGE target (closes CG-107). The emitted harness runs on third-party runtimes
 * (mujoco + h5py / pyarrow / tensorflow-datasets), so — like compile_to_mjcf/mjx — it is
 * BRIDGE: legit sim/dataset reach we genuinely lack, not a render bridge.
 *
 * Increment-1 scope (explicit): HDF5 writer full; LeRobot/RLDS documented stubs;
 * random-action policy; fixed seed; per-episode domain randomization; no learned policy.
 *
 * @version 1.0.0
 */

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import { MJCFCompiler, type MJCFCompilerOptions } from './MJCFCompiler';
import type { HoloComposition, HoloValue } from '../parser/HoloCompositionTypes';

export type EmbodiedOutputFormat = 'rlds' | 'lerobot' | 'hdf5';

export interface EmbodiedDatasetCompilerOptions extends MJCFCompilerOptions {
  episodeCount?: number;
  stepsPerEpisode?: number;
  outputFormat?: EmbodiedOutputFormat;
  sensorModalities?: string[];
  seed?: number;
}

interface ResolvedDatasetSpec {
  episodeCount: number;
  stepsPerEpisode: number;
  outputFormat: EmbodiedOutputFormat;
  sensorModalities: string[];
  domainRandomization: Record<string, unknown>;
  seed: number;
}

export class EmbodiedDatasetCompiler extends CompilerBase {
  protected readonly compilerName = 'EmbodiedDatasetCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.EMBODIED_DATASET;
  }

  private readonly mjcfOptions: MJCFCompilerOptions;
  private readonly defaults: Omit<ResolvedDatasetSpec, 'domainRandomization'>;

  constructor(options: EmbodiedDatasetCompilerOptions = {}) {
    super();
    this.mjcfOptions = options;
    this.defaults = {
      episodeCount: Math.max(1, Math.floor(options.episodeCount ?? 10)),
      stepsPerEpisode: Math.max(1, Math.floor(options.stepsPerEpisode ?? 200)),
      outputFormat: options.outputFormat ?? 'hdf5',
      sensorModalities: options.sensorModalities ?? ['qpos', 'qvel'],
      seed: options.seed ?? 0,
    };
  }

  compile(composition: HoloComposition, agentToken: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);
    // Reuse MJCFCompiler to embed the physics XML from the SAME scene.
    const xml = new MJCFCompiler(this.mjcfOptions).compile(composition, agentToken);
    const spec = this.resolveSpec(composition);
    return this.emitPython(composition, xml, spec);
  }

  private getTraitName(trait: string | { name: string }): string {
    return typeof trait === 'string' ? trait : trait.name;
  }

  /** Find the @sim_to_real_dataset trait config at composition level or on any object. */
  private findTraitConfig(composition: HoloComposition): Record<string, HoloValue> {
    const root = (composition as { traits?: Array<string | { name: string; config?: Record<string, HoloValue> }> })
      .traits?.find((t) => this.getTraitName(t) === 'sim_to_real_dataset');
    if (root && typeof root === 'object' && root.config) return root.config;
    for (const o of composition.objects ?? []) {
      const hit = o.traits?.find((t) => this.getTraitName(t) === 'sim_to_real_dataset');
      if (hit && typeof hit === 'object' && (hit as { config?: Record<string, HoloValue> }).config) {
        return (hit as { config: Record<string, HoloValue> }).config;
      }
    }
    return {};
  }

  private num(v: HoloValue | undefined, d: number): number {
    return typeof v === 'number' ? v : d;
  }
  private str(v: HoloValue | undefined, d: string): string {
    return typeof v === 'string' ? v : d;
  }

  private resolveSpec(composition: HoloComposition): ResolvedDatasetSpec {
    const cfg = this.findTraitConfig(composition);
    const fmtRaw = this.str(cfg['output_format'], this.defaults.outputFormat);
    const outputFormat: EmbodiedOutputFormat =
      fmtRaw === 'rlds' || fmtRaw === 'lerobot' || fmtRaw === 'hdf5' ? fmtRaw : this.defaults.outputFormat;
    const modalities = Array.isArray(cfg['sensor_modalities'])
      ? (cfg['sensor_modalities'] as HoloValue[]).map(String)
      : this.defaults.sensorModalities;
    const dr =
      cfg['domain_randomization'] && typeof cfg['domain_randomization'] === 'object' && !Array.isArray(cfg['domain_randomization'])
        ? (cfg['domain_randomization'] as Record<string, unknown>)
        : {};
    return {
      episodeCount: Math.max(1, Math.floor(this.num(cfg['episode_count'], this.defaults.episodeCount))),
      stepsPerEpisode: Math.max(1, Math.floor(this.num(cfg['steps_per_episode'], this.defaults.stepsPerEpisode))),
      outputFormat,
      sensorModalities: modalities,
      domainRandomization: dr,
      seed: Math.floor(this.num(cfg['seed'], this.defaults.seed)),
    };
  }

  private emitPython(composition: HoloComposition, xml: string, spec: ResolvedDatasetSpec): string {
    const compName = String(composition.name ?? 'composition');
    const safeXml = xml.includes('"""') ? xml.replace(/"""/g, '\\"\\"\\"') : xml;
    const specObj = {
      composition: compName,
      output_format: spec.outputFormat,
      episode_count: spec.episodeCount,
      steps_per_episode: spec.stepsPerEpisode,
      seed: spec.seed,
      sensor_modalities: spec.sensorModalities,
      domain_randomization: spec.domainRandomization,
    };
    // All spec values are str/int/list/dict-of-number — JSON is valid Python literal syntax here.
    const specLiteral = JSON.stringify(specObj, null, 4);
    const drComment = Object.keys(spec.domainRandomization).length
      ? Object.keys(spec.domainRandomization).join(', ')
      : '(none)';

    return [
      '"""Auto-generated by HoloScript EmbodiedDatasetCompiler — embodied-AI dataset generator.',
      '',
      `Source composition: "${compName}"`,
      `Output format: ${spec.outputFormat}   Episodes: ${spec.episodeCount}   Steps/episode: ${spec.stepsPerEpisode}   Seed: ${spec.seed}`,
      `Sensor modalities: ${spec.sensorModalities.join(', ')}`,
      `Domain randomization: ${drComment}`,
      '',
      'BOUNDED SCOPE (increment 1): random-action policy, fixed seed, per-episode domain',
      'randomization, no learned policy. Plain MuJoCo stepping (mujoco.mj_step). HDF5 writer',
      'full (robomimic/AgiBot convention); LeRobot and RLDS are documented stubs.',
      '',
      'Requires: pip install "mujoco>=3.0" numpy h5py   # +pyarrow (lerobot) / tensorflow-datasets (rlds)',
      'Emitted from one .holo physics scene — the same source that drives compile_to_mjcf.',
      '"""',
      'from __future__ import annotations',
      '',
      'import json',
      'import numpy as np',
      'import mujoco',
      '',
      '# --- MJCF physics scene (emitted by HoloScript MJCFCompiler from the same .holo) ---',
      'MJCF_XML = r"""',
      safeXml,
      '"""',
      '',
      '# --- dataset spec / manifest (declared via the native @sim_to_real_dataset trait) ---',
      `DATASET_SPEC = ${specLiteral}`,
      '',
      'model = mujoco.MjModel.from_xml_string(MJCF_XML)',
      '',
      '',
      'def _randomize(rng):',
      '    """Per-episode domain randomization over DATASET_SPEC[\'domain_randomization\'] ranges.',
      '    Defensive: only touches known, present model fields; an unknown key is a no-op."""',
      '    for name, rng_pair in DATASET_SPEC["domain_randomization"].items():',
      '        try:',
      '            lo, hi = float(rng_pair[0]), float(rng_pair[1])',
      '        except (TypeError, ValueError, IndexError):',
      '            continue',
      '        val = rng.uniform(lo, hi)',
      '        if name == "gravity":',
      '            model.opt.gravity[2] = -abs(val)',
      '        elif name == "timestep":',
      '            model.opt.timestep = val',
      '        elif name == "friction" and model.ngeom > 0:',
      '            model.geom_friction[:, 0] = val',
      '        elif name == "mass" and model.nbody > 1:',
      '            model.body_mass[1:] = val',
      '        # unknown randomization key -> documented no-op',
      '',
      '',
      'def rollout_episode(rng):',
      '    """One episode under a random-action policy; collects per-step obs/actions/rewards/dones."""',
      '    data = mujoco.MjData(model)',
      '    mujoco.mj_resetData(model, data)',
      '    obs = {m: [] for m in DATASET_SPEC["sensor_modalities"]}',
      '    actions, rewards, dones = [], [], []',
      '    steps = DATASET_SPEC["steps_per_episode"]',
      '    for t in range(steps):',
      '        ctrl = rng.uniform(-1.0, 1.0, size=model.nu) if model.nu > 0 else np.zeros(0)',
      '        data.ctrl[:] = ctrl',
      '        mujoco.mj_step(model, data)',
      '        if "qpos" in obs: obs["qpos"].append(data.qpos.copy())',
      '        if "qvel" in obs: obs["qvel"].append(data.qvel.copy())',
      '        if "sensordata" in obs and model.nsensordata > 0:',
      '            obs["sensordata"].append(data.sensordata.copy())',
      '        actions.append(np.asarray(ctrl, dtype=np.float32))',
      '        rewards.append(0.0)',
      '        dones.append(t == steps - 1)',
      '    return obs, np.asarray(actions, dtype=np.float32), np.asarray(rewards, dtype=np.float32), np.asarray(dones, dtype=bool)',
      '',
      '',
      'def write_hdf5(path="dataset.h5"):',
      '    """Write the dataset in the robomimic/AgiBot HDF5 convention (/data/demo_i/...)."""',
      '    import h5py',
      '    rng = np.random.default_rng(DATASET_SPEC["seed"])',
      '    with h5py.File(path, "w") as f:',
      '        d = f.create_group("data")',
      '        d.attrs["env_args"] = json.dumps(',
      '            {"env_name": DATASET_SPEC["composition"], "env_type": "mujoco", "env_kwargs": {}})',
      '        total = 0',
      '        for i in range(DATASET_SPEC["episode_count"]):',
      '            _randomize(rng)',
      '            obs, actions, rewards, dones = rollout_episode(rng)',
      '            g = d.create_group(f"demo_{i}")',
      '            g.attrs["num_samples"] = int(len(actions))',
      '            g.attrs["model_file"] = MJCF_XML',
      '            og = g.create_group("obs")',
      '            for m, seq in obs.items():',
      '                og.create_dataset(m, data=np.asarray(seq))',
      '            g.create_dataset("actions", data=actions)',
      '            g.create_dataset("rewards", data=rewards)',
      '            g.create_dataset("dones", data=dones)',
      '            total += int(len(actions))',
      '        d.attrs["total"] = total',
      '    return path',
      '',
      '',
      'def write_lerobot(path="lerobot_ds"):',
      '    raise NotImplementedError(',
      '        "LeRobot writer (increment 2): meta/info.json features{observation.state, action}, "',
      '        "meta/episodes.jsonl, data/chunk-000/episode_000000.parquet (one row per step). Needs pyarrow.")',
      '',
      '',
      'def write_rlds(path="rlds_ds"):',
      '    raise NotImplementedError(',
      '        "RLDS writer (increment 2): episodes -> steps{observation, action, reward, discount, "',
      '        "is_first, is_last, is_terminal} via a tfds.core.DatasetBuilder. Needs tensorflow-datasets.")',
      '',
      '',
      'WRITERS = {"hdf5": write_hdf5, "lerobot": write_lerobot, "rlds": write_rlds}',
      '',
      'if __name__ == "__main__":',
      '    print("HoloScript embodied-dataset generator")',
      '    print("  spec:", json.dumps(DATASET_SPEC, indent=2))',
      '    out = WRITERS[DATASET_SPEC["output_format"]]()',
      '    print("  wrote:", out)',
      '',
    ].join('\n');
  }
}

export default EmbodiedDatasetCompiler;
