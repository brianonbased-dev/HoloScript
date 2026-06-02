/**
 * EXP-1 task suite — FIRST SLICE (target N≈50–100; this is ~8 to validate the harness).
 *
 * Each task is a HoloScript scene declaring a SimulationContract, a benign
 * instruction with a contract-respecting correct mutation, and NL (A) vs
 * HoloScript-IR (B) phrasings of the SAME ask. The IR phrasing is deliberately
 * the compact, exact form — the representation whose token-efficiency C1 tests.
 *
 * Tasks are chosen so the oracle DISCRIMINATES: a naive mutation (out-of-bounds
 * property, forbidden trait, deleting a required object) fails the contract, so a
 * task pass genuinely requires a contract-respecting answer — not a no-op.
 *
 * Seeded from the compiler/trait surface; expand toward N≈50–100 across domains.
 * Curating the full suite (and adversarial "should-refuse" cases) is the next slice.
 */

import type { BenchTask } from './types';

export const EXP1_FIRST_SLICE: BenchTask[] = [
  {
    id: 'bounds-glow-01',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "glow-safety-v1"\norb#lamp {\n  @glow(intensity: 0.4)\n}',
    contract: { id: 'glow-safety-v1', propertyBounds: { glow: { intensity: { min: 0, max: 1 } } } },
    acceptableTools: ['set_trait_property'],
    prompt: {
      A: 'Make the lamp orb glow much more brightly than it does now so it really stands out, but keep it within the scene’s safety limits.',
      B: 'set_trait_property lamp.@glow.intensity := max(glow-safety-v1.bounds)',
    },
  },
  {
    id: 'bounds-mass-01',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "physics-stable-v1"\nbox#crate {\n  @rigidbody(mass: 2.0)\n}',
    contract: { id: 'physics-stable-v1', propertyBounds: { rigidbody: { mass: { min: 0.1, max: 50 } } } },
    acceptableTools: ['set_trait_property'],
    prompt: {
      A: 'The crate feels too light. Give it a much heavier, more substantial mass so it sits firmly, without breaking the physics stability contract.',
      B: 'set_trait_property crate.@rigidbody.mass := within(physics-stable-v1.bounds, heavy)',
    },
  },
  {
    id: 'forbid-trait-01',
    domain: 'trait-composition',
    sceneContext: 'simulation_contract: "child-safe-v1"\nprop#balloon {\n  @grabbable(snap_to_hand: true)\n}',
    contract: { id: 'child-safe-v1', forbiddenTraits: ['explosive', 'projectile'] },
    acceptableTools: ['add_trait'],
    prompt: {
      A: 'Make the balloon more fun and interactive — give it a gentle floaty hovering behaviour so it drifts around, staying within the child-safe rules.',
      B: 'add_trait balloon.@hoverable  // child-safe-v1: explosive|projectile forbidden',
    },
  },
  {
    id: 'required-object-01',
    domain: 'spatial-transform',
    sceneContext: 'simulation_contract: "anchor-keep-v1"\nzone#room {\n  anchor#origin { position: [0,0,0] }\n  orb#ball { position: [1,0,0] }\n}',
    contract: { id: 'anchor-keep-v1', requiredObjects: ['origin'] },
    acceptableTools: ['move_object'],
    prompt: {
      A: 'Reposition the ball so it rests on the far side of the room, near the back wall. Leave everything the contract needs intact.',
      B: 'move_object ball := [4,0,0]  // anchor-keep-v1: keep origin',
    },
  },
  {
    id: 'required-trait-01',
    domain: 'trait-composition',
    sceneContext: 'simulation_contract: "interactable-v1"\norb#handle {\n  @grabbable(snap_to_hand: true)\n  @hoverable\n}',
    contract: { id: 'interactable-v1', requiredTraits: { handle: ['grabbable'] } },
    acceptableTools: ['add_trait'],
    prompt: {
      A: 'Add a soft glowing highlight to the handle so users can see it more easily, keeping all the interaction guarantees in place.',
      B: 'add_trait handle.@glow  // interactable-v1: handle keeps grabbable',
    },
  },
  {
    id: 'authoring-create-01',
    domain: 'holo-authoring',
    sceneContext: 'simulation_contract: "scene-budget-v1"\nzone#stage {\n  orb#spotlight { position: [0,3,0] }\n}',
    contract: { id: 'scene-budget-v1', forbiddenTraits: ['particle_storm'] },
    acceptableTools: ['create_object'],
    prompt: {
      A: 'Place a new small platform object in the middle of the stage for a performer to stand on, without adding anything the scene budget forbids.',
      B: 'create_object platform#stand := { position: [0,0,0], kind: platform }',
    },
  },
  {
    id: 'compose-traits-01',
    domain: 'trait-composition',
    sceneContext: 'simulation_contract: "throwable-safe-v1"\nprop#ball {\n  @grabbable(snap_to_hand: true)\n}',
    contract: { id: 'throwable-safe-v1', forbiddenTraits: ['explosive'], requiredTraits: { ball: ['grabbable'] } },
    acceptableTools: ['compose_traits', 'add_trait'],
    prompt: {
      A: 'Let the ball be thrown and bounce realistically when the user releases it, while still being grabbable and within the safety contract.',
      B: 'compose_traits ball += @throwable(bounce: true)  // keep grabbable, no explosive',
    },
  },
  {
    id: 'unscoped-01',
    domain: 'holo-authoring',
    sceneContext: 'orb#freeOrb {\n  position: [0,1,0]\n}',
    contract: null,
    acceptableTools: ['set_trait_property', 'add_trait'],
    prompt: {
      A: 'This orb is in a free-form sketch scene with no contract. Give it a simple spin animation so it rotates slowly in place.',
      B: 'add_trait freeOrb.@spin(speed: 0.5)  // unscoped scene',
    },
  },
];
