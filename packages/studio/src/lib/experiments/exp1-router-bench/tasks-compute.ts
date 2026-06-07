/**
 * EXP-1c COMPUTE suite — the B-vs-C separation probe.
 *
 * The verdict suite (EXP1_FULL_SUITE) saturates B and C at 100% because its IR
 * phrasing encodes the safe value SYMBOLICALLY (`max(bounds)`) — the model just
 * echoes it, so a 7B and a 1.5B both succeed. These tasks instead require the
 * model to COMPUTE a value (midpoint, percentage-of-range, delta-then-clamp) from
 * the contract bounds. The IR gives the FORMULA, not the answer; the model must
 * evaluate it. Each task carries an `accept` gate that checks the EXACT value
 * (tol 0.01), so a right-tool/wrong-number miscomputation FAILS even though it sits
 * inside the contract bounds.
 *
 * Hypothesis: arithmetic is where a 1.5B trails a 7B/Opus. If C < B here, we have
 * found the capability frontier the substrate alone does not buy back — an honest,
 * thesis-sharpening NEGATIVE if it appears. Run via EXP1_SUITE=compute.
 */

import type { BenchTask } from './types';
import type { SceneMutation } from '../../brittney/SimContractGate';

/** Value-correctness gate: right tool AND property_value within tol of expected. */
function expectValue(expected: number, tol = 0.01): (m: SceneMutation) => boolean {
  return (m) => {
    if (m.tool !== 'set_trait_property') return false;
    const v = m.input.property_value;
    return typeof v === 'number' && Math.abs(v - expected) <= tol;
  };
}

export const EXP1_COMPUTE_SUITE: BenchTask[] = [
  {
    id: 'compute-midpoint-01',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "glow-mid-v1"\norb#lamp {\n  @glow(intensity: 0.5)\n}',
    contract: { id: 'glow-mid-v1', propertyBounds: { glow: { intensity: { min: 0, max: 2 } } } },
    acceptableTools: ['set_trait_property'],
    accept: expectValue(1.0),
    prompt: {
      A: 'Set the lamp glow intensity to exactly the midpoint of the allowed safety range.',
      B: 'set_trait_property lamp.@glow.intensity := (min+max)/2 over glow-mid-v1.bounds',
    },
  },
  {
    id: 'compute-midpoint-02',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "spl-mid-v1"\nspeaker#main {\n  @audio(volume: 0.2)\n}',
    contract: { id: 'spl-mid-v1', propertyBounds: { audio: { volume: { min: 0.3, max: 4.7 } } } },
    acceptableTools: ['set_trait_property'],
    accept: expectValue(2.5),
    prompt: {
      A: 'Set the speaker volume to the exact middle of the contract’s permitted range.',
      B: 'set_trait_property main.@audio.volume := (min+max)/2 over spl-mid-v1.bounds',
    },
  },
  {
    id: 'compute-pct75-03',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "mass-pct-v1"\ncrate#box {\n  @rigidbody(mass: 1)\n}',
    contract: { id: 'mass-pct-v1', propertyBounds: { rigidbody: { mass: { min: 0, max: 8 } } } },
    acceptableTools: ['set_trait_property'],
    accept: expectValue(6.0),
    prompt: {
      A: 'Set the crate mass to 75% of the way up the allowed mass range.',
      B: 'set_trait_property box.@rigidbody.mass := min + 0.75*(max-min) over mass-pct-v1.bounds',
    },
  },
  {
    id: 'compute-pct25-04',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "speed-pct-v1"\ndrone#scout {\n  @motion(speed: 1)\n}',
    contract: { id: 'speed-pct-v1', propertyBounds: { motion: { speed: { min: 0, max: 10 } } } },
    acceptableTools: ['set_trait_property'],
    accept: expectValue(2.5),
    prompt: {
      A: 'Set the drone speed to one quarter of the way up its permitted speed range.',
      B: 'set_trait_property scout.@motion.speed := min + 0.25*(max-min) over speed-pct-v1.bounds',
    },
  },
  {
    id: 'compute-delta-plus30-05',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "glow-delta-v1"\norb#beacon {\n  @glow(intensity: 2.0)\n}',
    contract: { id: 'glow-delta-v1', propertyBounds: { glow: { intensity: { min: 0, max: 5 } } } },
    acceptableTools: ['set_trait_property'],
    accept: expectValue(2.6),
    prompt: {
      A: 'Increase the beacon glow by 30% of its current value, staying within bounds.',
      B: 'set_trait_property beacon.@glow.intensity := current*1.30 clamp glow-delta-v1.bounds  // current=2.0',
    },
  },
  {
    id: 'compute-delta-minus25-06',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "mass-delta-v1"\ncrate#cargo {\n  @rigidbody(mass: 4.0)\n}',
    contract: { id: 'mass-delta-v1', propertyBounds: { rigidbody: { mass: { min: 0, max: 10 } } } },
    acceptableTools: ['set_trait_property'],
    accept: expectValue(3.0),
    prompt: {
      A: 'Reduce the cargo mass by 25% of its current value.',
      B: 'set_trait_property cargo.@rigidbody.mass := current*0.75 over mass-delta-v1.bounds  // current=4.0',
    },
  },
  {
    id: 'compute-avg-curmax-07',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "vol-avg-v1"\nspeaker#pa {\n  @audio(volume: 1.0)\n}',
    contract: { id: 'vol-avg-v1', propertyBounds: { audio: { volume: { min: 0, max: 5 } } } },
    acceptableTools: ['set_trait_property'],
    accept: expectValue(3.0),
    prompt: {
      A: 'Set the PA volume to the average of its current value and the maximum allowed.',
      B: 'set_trait_property pa.@audio.volume := (current+max)/2 over vol-avg-v1.bounds  // current=1.0',
    },
  },
  {
    id: 'compute-twothirds-08',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "rate-frac-v1"\nemitter#fog {\n  @particle(rate: 10)\n}',
    contract: { id: 'rate-frac-v1', propertyBounds: { particle: { rate: { min: 0, max: 9 } } } },
    acceptableTools: ['set_trait_property'],
    accept: expectValue(6.0),
    prompt: {
      A: 'Set the fog emitter rate to two thirds of the maximum allowed rate.',
      B: 'set_trait_property fog.@particle.rate := (2/3)*max over rate-frac-v1.bounds',
    },
  },
  {
    id: 'compute-lerp60-09',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "scale-lerp-v1"\nprop#statue {\n  @transform(scale: 1)\n}',
    contract: { id: 'scale-lerp-v1', propertyBounds: { transform: { scale: { min: 1, max: 6 } } } },
    acceptableTools: ['set_trait_property'],
    accept: expectValue(4.0),
    prompt: {
      A: 'Set the statue scale to 60% of the way from the minimum to the maximum allowed scale.',
      B: 'set_trait_property statue.@transform.scale := min + 0.6*(max-min) over scale-lerp-v1.bounds',
    },
  },
  {
    id: 'compute-double-clamp-10',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "temp-double-v1"\nforge#hearth {\n  @thermal(temp: 1.5)\n}',
    contract: { id: 'temp-double-v1', propertyBounds: { thermal: { temp: { min: 0, max: 4 } } } },
    acceptableTools: ['set_trait_property'],
    accept: expectValue(3.0),
    prompt: {
      A: 'Double the hearth temperature from its current value, but keep it within the thermal bounds.',
      B: 'set_trait_property hearth.@thermal.temp := current*2 clamp temp-double-v1.bounds  // current=1.5',
    },
  },
  {
    id: 'compute-lerp40-11',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "opacity-lerp-v1"\npane#glass {\n  @material(opacity: 0.1)\n}',
    contract: { id: 'opacity-lerp-v1', propertyBounds: { material: { opacity: { min: 0.5, max: 5.5 } } } },
    acceptableTools: ['set_trait_property'],
    accept: expectValue(2.5),
    prompt: {
      A: 'Set the glass opacity to 40% of the way from the minimum to the maximum allowed value.',
      B: 'set_trait_property glass.@material.opacity := min + 0.4*(max-min) over opacity-lerp-v1.bounds',
    },
  },
  {
    id: 'compute-third-12',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "friction-frac-v1"\ntile#floor {\n  @surface(friction: 0.9)\n}',
    contract: { id: 'friction-frac-v1', propertyBounds: { surface: { friction: { min: 0, max: 9 } } } },
    acceptableTools: ['set_trait_property'],
    accept: expectValue(3.0),
    prompt: {
      A: 'Set the floor friction to one third of the maximum permitted friction.',
      B: 'set_trait_property floor.@surface.friction := (1/3)*max over friction-frac-v1.bounds',
    },
  },
];
