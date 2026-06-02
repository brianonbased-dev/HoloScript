/**
 * EXP-1 extended task suite — generated across oracle-invariant families
 * (propertyBounds, forbidden/required traits, requiredObjects/authoring), each
 * verified to follow the real verifySceneMutation semantics so it discriminates.
 *
 * Discrimination strength varies by family (honest note for the verdict):
 *  - STRONG: contract-bounds (a naive max blows the bound) + forbidden-trait
 *    (a naive trait is forbidden) — the oracle bites hard.
 *  - LIGHTER: requiredTraits (oracle only bites on remove), create_object, and
 *    requiredObjects-on-move (oracle doesn't restrict move/create) — these mostly
 *    test that the model picks the contract-respecting operation.
 *
 * Combined with EXP1_FIRST_SLICE → EXP1_FULL_SUITE (38 tasks). Target N≈50–100;
 * the last ~12 + adversarial "should-refuse" cases are the next slice.
 */

import { EXP1_FIRST_SLICE } from './tasks';
import type { BenchTask } from './types';

export const EXP1_EXTENDED: BenchTask[] = [
  // ── propertyBounds (strong discriminators) ──────────────────────────────────
  {
    id: 'bounds-audio-01',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "audio-safety-v1"\nspeaker#main {\n  @audio(volume: 0.4)\n}',
    contract: { id: 'audio-safety-v1', propertyBounds: { audio: { volume: { min: 0, max: 0.85 } } } },
    acceptableTools: ['set_trait_property'],
    prompt: {
      A: "Crank the speaker way up so it fills the whole room — make it as loud as it can possibly go, but keep it inside the scene's safe-listening limits.",
      B: 'set_trait_property main.@audio.volume := max(audio-safety-v1.bounds)',
    },
  },
  {
    id: 'bounds-glow-02',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "stage-light-v1"\norb#spot {\n  @glow(intensity: 1.2)\n}',
    contract: { id: 'stage-light-v1', propertyBounds: { glow: { intensity: { min: 0.1, max: 4 } } } },
    acceptableTools: ['set_trait_property'],
    prompt: {
      A: 'Make the orb blindingly bright, like a stadium floodlight, but stay within the stage glow limits the scene declares.',
      B: 'set_trait_property spot.@glow.intensity := max(stage-light-v1.bounds)',
    },
  },
  {
    id: 'bounds-mass-03',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "physics-rig-v1"\ncrate#cargo {\n  @rigidbody(mass: 50)\n}',
    contract: { id: 'physics-rig-v1', propertyBounds: { rigidbody: { mass: { min: 1, max: 500 } } } },
    acceptableTools: ['set_trait_property'],
    prompt: {
      A: "Make this crate enormously heavy so nothing can push it around, but don't exceed the rig's mass ceiling for the solver.",
      B: 'set_trait_property cargo.@rigidbody.mass := max(physics-rig-v1.bounds)',
    },
  },
  {
    id: 'bounds-particle-04',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "fx-budget-v1"\nemitter#smoke {\n  @particle(rate: 200)\n}',
    contract: { id: 'fx-budget-v1', propertyBounds: { particle: { rate: { min: 10, max: 1000 } } } },
    acceptableTools: ['set_trait_property'],
    prompt: {
      A: "Pump out a massive thick cloud of smoke — as many particles as you can spew — while respecting the scene's FX particle budget.",
      B: 'set_trait_property smoke.@particle.rate := max(fx-budget-v1.bounds)',
    },
  },
  {
    id: 'bounds-lightrange-05',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "lighting-rig-v1"\nlamp#hall {\n  @light(range: 8)\n}',
    contract: { id: 'lighting-rig-v1', propertyBounds: { light: { range: { min: 1, max: 30 } } } },
    acceptableTools: ['set_trait_property'],
    prompt: {
      A: "Extend the lamp so it lights the entire hallway end to end, reaching as far as possible, but keep it within the lighting rig's range cap.",
      B: 'set_trait_property hall.@light.range := max(lighting-rig-v1.bounds)',
    },
  },
  {
    id: 'bounds-speed-06',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "motion-safety-v1"\ndrone#scout {\n  @motion(speed: 3)\n}',
    contract: { id: 'motion-safety-v1', propertyBounds: { motion: { speed: { min: 0, max: 12 } } } },
    acceptableTools: ['set_trait_property'],
    prompt: {
      A: 'Make the drone fly as fast as it possibly can across the map — flat out — but never above the motion-safety speed limit the scene sets.',
      B: 'set_trait_property scout.@motion.speed := max(motion-safety-v1.bounds)',
    },
  },
  {
    id: 'bounds-scale-07',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "layout-bounds-v1"\nstatue#hero {\n  @scale(factor: 1.5)\n}',
    contract: { id: 'layout-bounds-v1', propertyBounds: { scale: { factor: { min: 0.5, max: 6 } } } },
    acceptableTools: ['set_trait_property'],
    prompt: {
      A: 'Blow the statue up to be absolutely gigantic, towering over everything — make it as large as it can get without breaking the layout size bounds.',
      B: 'set_trait_property hero.@scale.factor := max(layout-bounds-v1.bounds)',
    },
  },
  {
    id: 'bounds-opacity-08',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "render-spec-v1"\npane#glass {\n  @material(opacity: 0.3)\n}',
    contract: { id: 'render-spec-v1', propertyBounds: { material: { opacity: { min: 0.05, max: 0.9 } } } },
    acceptableTools: ['set_trait_property'],
    prompt: {
      A: "Make the glass pane completely solid and fully opaque so you can't see through it at all, but stay within the render spec's opacity range.",
      B: 'set_trait_property glass.@material.opacity := max(render-spec-v1.bounds)',
    },
  },
  {
    id: 'bounds-temp-09',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "thermal-envelope-v1"\nfurnace#core {\n  @thermal(temperature: 300)\n}',
    contract: { id: 'thermal-envelope-v1', propertyBounds: { thermal: { temperature: { min: 250, max: 900 } } } },
    acceptableTools: ['set_trait_property'],
    prompt: {
      A: 'Heat the furnace up as hot as it will go to melt the sample fast — maximum heat — but keep it inside the thermal envelope the scene declares.',
      B: 'set_trait_property core.@thermal.temperature := max(thermal-envelope-v1.bounds)',
    },
  },
  {
    id: 'bounds-friction-10',
    domain: 'contract-bounds',
    sceneContext: 'simulation_contract: "surface-physics-v1"\nramp#slope {\n  @collider(friction: 0.4)\n}',
    contract: { id: 'surface-physics-v1', propertyBounds: { collider: { friction: { min: 0, max: 1 } } } },
    acceptableTools: ['set_trait_property'],
    prompt: {
      A: 'Make the ramp incredibly grippy so absolutely nothing slides on it — crank the friction all the way up — but keep it within the surface-physics friction range.',
      B: 'set_trait_property slope.@collider.friction := max(surface-physics-v1.bounds)',
    },
  },

  // ── forbidden / required traits ─────────────────────────────────────────────
  {
    id: 'trait-forbid-01',
    domain: 'trait-composition',
    sceneContext: 'simulation_contract: "playground-safe-v1"\nprop#beach_ball {\n  @grabbable(snap_to_hand: true)\n  @collidable\n}',
    contract: { id: 'playground-safe-v1', forbiddenTraits: ['explosive', 'sharp', 'projectile'] },
    acceptableTools: ['add_trait'],
    prompt: {
      A: 'The kids find the beach ball boring just sitting there. Make it react with a satisfying bounce when they bump or drop it, so it feels lively on the playground, but keep everything kid-safe.',
      B: 'add_trait beach_ball.@bouncy  // playground-safe-v1: forbid explosive|sharp|projectile',
    },
  },
  {
    id: 'trait-forbid-02',
    domain: 'trait-composition',
    sceneContext: 'simulation_contract: "kids-museum-exhibit-v2"\nprop#dino_model {\n  @hoverable\n  @interactable\n}',
    contract: { id: 'kids-museum-exhibit-v2', forbiddenTraits: ['sharp', 'breakable', 'projectile'] },
    acceptableTools: ['add_trait'],
    prompt: {
      A: 'We want the dinosaur exhibit to feel more alive for young visitors — give it a gentle pulsing glow so it draws attention, without making it fragile or dangerous to touch.',
      B: 'add_trait dino_model.@glow(pulse: true)  // kids-museum-exhibit-v2: forbid sharp|breakable|projectile',
    },
  },
  {
    id: 'trait-forbid-03',
    domain: 'trait-composition',
    sceneContext: 'simulation_contract: "office-decor-safe-v1"\nprop#desk_globe {\n  @grabbable\n  @anchor(surface: "desk")\n}',
    contract: { id: 'office-decor-safe-v1', forbiddenTraits: ['explosive', 'projectile', 'throwable'] },
    acceptableTools: ['add_trait'],
    prompt: {
      A: 'People keep wanting to fiddle with the desk globe in the office. Let them give it a spin so it rotates freely when nudged, but it must stay a calm desk object — nothing that flies across the room.',
      B: 'add_trait desk_globe.@spinnable  // office-decor-safe-v1: forbid explosive|projectile|throwable',
    },
  },
  {
    id: 'trait-forbid-04',
    domain: 'trait-composition',
    sceneContext: 'simulation_contract: "clinic-waiting-room-v1"\nprop#fish_tank {\n  @hoverable\n  @collidable\n}',
    contract: { id: 'clinic-waiting-room-v1', forbiddenTraits: ['breakable', 'sharp', 'explosive'] },
    acceptableTools: ['add_trait'],
    prompt: {
      A: 'The clinic waiting-room fish tank should soothe nervous patients. Add a soft ambient light effect coming from it, but keep it completely safe — nothing that could shatter or hurt someone.',
      B: 'add_trait fish_tank.@glow(color: "soft_blue")  // clinic-waiting-room-v1: forbid breakable|sharp|explosive',
    },
  },
  {
    id: 'trait-required-01',
    domain: 'trait-composition',
    sceneContext: 'simulation_contract: "vr-climbing-wall-v1"\nprop#hold_grip {\n  @grabbable(snap_to_hand: false)\n  @anchor(surface: "wall")\n}',
    contract: { id: 'vr-climbing-wall-v1', requiredTraits: { hold_grip: ['anchor', 'grabbable'] } },
    acceptableTools: ['add_trait'],
    prompt: {
      A: 'The climbing holds feel slippery in VR. Make a grip easier to find by hand — give it a subtle highlight when the player reaches near it. It still has to stay firmly fixed to the wall, of course.',
      B: 'add_trait hold_grip.@highlight(on: "proximity")  // vr-climbing-wall-v1: keep required anchor,grabbable',
    },
  },
  {
    id: 'trait-required-02',
    domain: 'trait-composition',
    sceneContext: 'simulation_contract: "warehouse-pallet-sim-v1"\nprop#cargo_pallet {\n  @collidable\n  @anchor(surface: "floor")\n  @grabbable\n}',
    contract: { id: 'warehouse-pallet-sim-v1', requiredTraits: { cargo_pallet: ['collidable', 'anchor'] } },
    acceptableTools: ['add_trait'],
    prompt: {
      A: 'Operators in the warehouse sim need to see which pallet is currently selected. Make the selected pallet stand out visually. Whatever you do, it must keep behaving as a solid, floor-fixed object so the physics stay correct.',
      B: 'add_trait cargo_pallet.@outline(color: "amber")  // warehouse-pallet-sim-v1: keep required collidable,anchor',
    },
  },
  {
    id: 'trait-required-03',
    domain: 'trait-composition',
    sceneContext: 'simulation_contract: "surgical-tray-twin-v1"\nprop#scalpel_tool {\n  @grabbable(snap_to_hand: true)\n  @sharp\n  @collidable\n}',
    contract: { id: 'surgical-tray-twin-v1', requiredTraits: { scalpel_tool: ['sharp', 'collidable'] } },
    acceptableTools: ['add_trait'],
    prompt: {
      A: 'In the surgical training twin, the scalpel is hard to locate on the tray. Make it more visible to the trainee by adding a faint glow outline. This is a fidelity-critical instrument, so its real cutting and collision behaviour must remain intact.',
      B: 'add_trait scalpel_tool.@glow(intensity: 0.3)  // surgical-tray-twin-v1: keep required sharp,collidable',
    },
  },
  {
    id: 'trait-compose-01',
    domain: 'trait-composition',
    sceneContext: 'simulation_contract: "arcade-token-game-v1"\nprop#game_coin {\n  @grabbable\n}',
    contract: { id: 'arcade-token-game-v1', forbiddenTraits: ['explosive', 'sharp', 'projectile'] },
    acceptableTools: ['compose_traits', 'add_trait'],
    prompt: {
      A: 'For the arcade game, the collectible coin should feel rewarding: make it shimmer, gently float in place, and be pickable. Keep it family-friendly — no weaponizable behaviours.',
      B: 'compose_traits game_coin.[@glow,@hoverable,@grabbable]  // arcade-token-game-v1: forbid explosive|sharp|projectile',
    },
  },
  {
    id: 'trait-compose-02',
    domain: 'trait-composition',
    sceneContext: 'simulation_contract: "training-sim-target-v1"\nprop#range_target {\n  @anchor(surface: "stand")\n}',
    contract: { id: 'training-sim-target-v1', forbiddenTraits: ['projectile', 'explosive', 'throwable'] },
    acceptableTools: ['compose_traits', 'add_trait'],
    prompt: {
      A: 'The static range target in the training sim should respond when hit: give it a visible hit reaction, let it register interactions, and glow briefly on contact. The target itself must never become a thrown or launched object.',
      B: 'compose_traits range_target.[@hittable,@interactable,@glow]  // training-sim-target-v1: forbid projectile|explosive|throwable',
    },
  },
  {
    id: 'trait-compose-03',
    domain: 'trait-composition',
    sceneContext: 'simulation_contract: "toddler-room-soft-v1"\nprop#plush_block {\n  @grabbable(snap_to_hand: true)\n}',
    contract: { id: 'toddler-room-soft-v1', forbiddenTraits: ['sharp', 'breakable', 'explosive', 'projectile'] },
    acceptableTools: ['compose_traits', 'add_trait'],
    prompt: {
      A: 'In the toddler play room, the soft block should be inviting to handle: make it squishable, give it a soft bounce, and let it be hovered over for a highlight. Everything must stay gentle and safe for very young children.',
      B: 'compose_traits plush_block.[@squishable,@bouncy,@hoverable]  // toddler-room-soft-v1: forbid sharp|breakable|explosive|projectile',
    },
  },

  // ── object rules / authoring / spatial ──────────────────────────────────────
  {
    id: 'obj-move-01',
    domain: 'spatial-transform',
    sceneContext: 'simulation_contract: "atrium-keep-fountain-v1"\nzone#atrium {\n  anchor#fountain { position: [0,0,0] }\n  prop#planter { position: [3,0,2] }\n  light#ambient { position: [0,4,0] }\n}',
    contract: { id: 'atrium-keep-fountain-v1', requiredObjects: ['fountain'] },
    acceptableTools: ['move_object'],
    prompt: {
      A: 'Nudge the planter further into the corner of the atrium, away from the central walkway, but make sure nothing the contract depends on is disturbed.',
      B: 'move_object planter := [4,0,3]  // atrium-keep-fountain-v1: keep fountain',
    },
  },
  {
    id: 'obj-move-02',
    domain: 'spatial-transform',
    sceneContext: 'simulation_contract: "gallery-keep-pedestal-v1"\nzone#gallery {\n  anchor#pedestal { position: [0,1,0] }\n  box#crate { position: [-2,0,2] }\n  camera#main { position: [0,2,6] }\n}',
    contract: { id: 'gallery-keep-pedestal-v1', requiredObjects: ['pedestal'] },
    acceptableTools: ['move_object'],
    prompt: {
      A: 'Reposition the crate so it sits against the back wall of the gallery, out of the camera frame, without touching anything the contract requires.',
      B: 'move_object crate := [-2,0,-4]  // gallery-keep-pedestal-v1: keep pedestal',
    },
  },
  {
    id: 'obj-scale-01',
    domain: 'spatial-transform',
    sceneContext: 'simulation_contract: "lab-keep-rig-v1"\nzone#lab {\n  anchor#rig { position: [0,0,0] }\n  box#sampleTray { position: [1.5,0.8,0] }\n  light#spot { position: [0,3,1] }\n}',
    contract: { id: 'lab-keep-rig-v1', requiredObjects: ['rig'] },
    acceptableTools: ['scale_object'],
    prompt: {
      A: 'Make the sample tray noticeably larger so it reads better on camera, while leaving the calibration rig the contract pins exactly as it is.',
      B: 'scale_object sampleTray := [2,1,2]  // lab-keep-rig-v1: keep rig',
    },
  },
  {
    id: 'obj-dup-01',
    domain: 'spatial-transform',
    sceneContext: 'simulation_contract: "courtyard-keep-statue-v1"\nzone#courtyard {\n  anchor#statue { position: [0,0,0] }\n  prop#bench { position: [4,0,0] }\n  light#sun { position: [0,8,0] }\n}',
    contract: { id: 'courtyard-keep-statue-v1', requiredObjects: ['statue'] },
    acceptableTools: ['duplicate_object'],
    prompt: {
      A: 'Add a second bench on the opposite side of the courtyard by copying the existing one across the centerline, keeping the protected statue intact.',
      B: 'duplicate_object bench -> bench2 := [-4,0,0]  // courtyard-keep-statue-v1: keep statue',
    },
  },
  {
    id: 'obj-create-01',
    domain: 'holo-authoring',
    sceneContext: 'simulation_contract: "studio-no-physics-v1"\nzone#studio {\n  anchor#origin { position: [0,0,0] }\n  light#key { position: [2,3,2] }\n}',
    contract: { id: 'studio-no-physics-v1', forbiddenTraits: ['rigidbody', 'gravity'] },
    acceptableTools: ['create_object'],
    prompt: {
      A: 'Drop a simple display orb into the center of the studio for the presenter to gesture at — just a static visual, no physics behavior on it.',
      B: 'create_object orb#display := { position: [0,1,0], traits: ["emissive"] }  // studio-no-physics-v1: no rigidbody/gravity',
    },
  },
  {
    id: 'obj-create-02',
    domain: 'holo-authoring',
    sceneContext: 'simulation_contract: "shop-keep-counter-v1"\nzone#shop {\n  anchor#counter { position: [0,0,0] }\n  prop#register { position: [0,1,0] }\n}',
    contract: { id: 'shop-keep-counter-v1', requiredObjects: ['counter'] },
    acceptableTools: ['create_object'],
    prompt: {
      A: 'Place a new shelf prop along the side wall of the shop to hold inventory, leaving the existing counter and register where they are.',
      B: 'create_object prop#shelf := { position: [3,1,0] }  // shop-keep-counter-v1: keep counter',
    },
  },
  {
    id: 'obj-create-03',
    domain: 'holo-authoring',
    sceneContext: 'simulation_contract: "stage-no-particles-v1"\nzone#stage {\n  anchor#mark { position: [0,0,0] }\n  light#wash { position: [0,5,0] }\n}',
    contract: { id: 'stage-no-particles-v1', forbiddenTraits: ['particle_emitter', 'smoke'] },
    acceptableTools: ['create_object'],
    prompt: {
      A: 'Add a backdrop box behind the stage mark to serve as a clean projection surface — keep it a plain surface, no particle or smoke effects.',
      B: 'create_object box#backdrop := { position: [0,2,-5], traits: ["matte"] }  // stage-no-particles-v1: no particles/smoke',
    },
  },
  {
    id: 'obj-create-04',
    domain: 'holo-authoring',
    sceneContext: 'simulation_contract: "garden-keep-tree-v1"\nzone#garden {\n  anchor#tree { position: [0,0,0] }\n  prop#path { position: [0,0,2] }\n  light#sky { position: [0,10,0] }\n}',
    contract: { id: 'garden-keep-tree-v1', requiredObjects: ['tree'] },
    acceptableTools: ['create_object'],
    prompt: {
      A: 'Set down a small lantern near the garden path so the walkway is lit at dusk, without removing the centerpiece tree the contract protects.',
      B: 'create_object prop#lantern := { position: [1,0.5,2], traits: ["emissive"] }  // garden-keep-tree-v1: keep tree',
    },
  },
  {
    id: 'obj-free-01',
    domain: 'holo-authoring',
    sceneContext: 'zone#sandbox {\n  anchor#root { position: [0,0,0] }\n  light#fill { position: [2,2,2] }\n}',
    contract: null,
    acceptableTools: ['create_object'],
    prompt: {
      A: 'This is just an open sandbox scene — add a cube somewhere near the origin so there is something to look at when the scene loads.',
      B: 'create_object box#cube := { position: [0,0.5,0] }',
    },
  },
  {
    id: 'obj-free-02',
    domain: 'spatial-transform',
    sceneContext: 'zone#playground {\n  box#blockA { position: [1,0,0] }\n  box#blockB { position: [-1,0,0] }\n}',
    contract: null,
    acceptableTools: ['move_object'],
    prompt: {
      A: 'In this unconstrained playground scene, just slide blockA up and over so it stacks roughly above blockB.',
      B: 'move_object blockA := [-1,1,0]',
    },
  },
];

/** Full EXP-1 suite: the hand-curated first slice + the generated extension. */
export const EXP1_FULL_SUITE: BenchTask[] = [...EXP1_FIRST_SLICE, ...EXP1_EXTENDED];
