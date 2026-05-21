import type { AndroidXRTraitMapping } from './AndroidXRComponentTypes';

/**
 * Android XR Trait Dispatch Maps
 *
 * Trait maps for physics, interaction, audio, AR, accessibility,
 * UI, environment, DP3, glasses, and multiplayer traits.
 */

export const PHYSICS_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  collidable: {
    trait: 'collidable',
    components: ['CollisionComponent'],
    level: 'full',
    imports: ['androidx.xr.scenecore.Entity', 'com.google.android.filament.utils.Float3'],
    generate: (varName, config) => {
      const mode = config.mode || 'default';
      return [
        `// @collidable -- collision detection via SceneCore InteractableComponent`,
        `// Android XR uses input events for collision; mode: ${mode}`,
        `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
        `    // Handle collision/input events`,
        `}`,
        `${varName}.addComponent(${varName}Interactable)`,
      ];
export const WorldPhysicsConfig = {
  EARTH: { gravity: -9.81 },
  // Alien presets (expand as needed for low-g, exotic atmospheres, radiation, etc.)
  ALIEN: { gravity: -3.71 },
};
    },
  },

  physics: {
    trait: 'physics',
    components: ['CollisionComponent', 'PhysicsComponent'],
    level: 'full',
    imports: ['androidx.xr.scenecore.Entity', 'com.google.android.filament.utils.Float3'],
    generate: (varName, config) => {
      const mass = config.mass ?? 1.0;
      const mode = config.kinematic ? 'kinematic' : 'dynamic';
      const friction = config.friction ?? 0.5;
      const restitution = config.restitution ?? 0.3;
      return [
        `// @physics -- Android XR SceneCore spatial physics component`,
        `// Mode: ${mode}, mass: ${mass}, friction: ${friction}, restitution: ${restitution}`,
        `val ${varName}Physics = PhysicsComponent.create(session)`,
        `${varName}Physics.mass = ${mass}f`,
        `${varName}Physics.friction = ${friction}f`,
        `${varName}Physics.restitution = ${restitution}f`,
        `${varName}Physics.mode = PhysicsMode.${String(mode).toUpperCase()}`,
        `${varName}.addComponent(${varName}Physics)`,
      ];
    },
  },

  static: {
    trait: 'static',
    components: ['CollisionComponent', 'PhysicsComponent'],
    level: 'full',
    generate: (varName) => [
      `// @static -- static physics body (no movement, collisions only)`,
      `val ${varName}Physics = PhysicsComponent.create(session)`,
      `${varName}Physics.mode = PhysicsMode.STATIC`,
      `${varName}.addComponent(${varName}Physics)`,
    ],
  },

  kinematic: {
    trait: 'kinematic',
    components: ['CollisionComponent', 'PhysicsComponent'],
    level: 'full',
    generate: (varName) => [
      `// @kinematic -- kinematic physics body (script-driven movement)`,
      `val ${varName}Physics = PhysicsComponent.create(session)`,
      `${varName}Physics.mode = PhysicsMode.KINEMATIC`,
      `${varName}.addComponent(${varName}Physics)`,
    ],
  },

  cloth: {
    trait: 'cloth',
    components: ['PhysicsComponent'],
    level: 'full',
    imports: ['com.google.android.filament.utils.Float3', 'android.opengl.GLES31'],
    generate: (varName, config) => {
      const stiffness = config.stiffness ?? 0.8;
      const damping = config.damping ?? 0.02;
      const iterations = config.iterations ?? 10;
      const width = config.width ?? 20;
      const height = config.height ?? 20;
      return [
        `// @cloth -- Position-Based Dynamics cloth simulation`,
        `// Grid: ${width}x${height}, stiffness: ${stiffness}, damping: ${damping}, iterations: ${iterations}`,
        `val ${varName}ClothSim = PBDClothSimulation(`,
        `    gridWidth = ${width},`,
        `    gridHeight = ${height},`,
        `    stiffness = ${stiffness}f,`,
        `    damping = ${damping}f,`,
        `    solverIterations = ${iterations}`,
        `)`,
        `val ${varName}ComputeShader = GLES31.glCreateShader(GLES31.GL_COMPUTE_SHADER)`,
        `// PBD constraint projection kernel:`,
        `// 1. Apply external forces (gravity)`,
        `// 2. Predict positions: x_new = x + v * dt`,
        `// 3. For each iteration: project distance constraints`,
        `// 4. Update velocities: v = (x_new - x) / dt * (1 - damping)`,
        `val ${varName}ClothProgram = GLES31.glCreateProgram()`,
        `GLES31.glAttachShader(${varName}ClothProgram, ${varName}ComputeShader)`,
        `GLES31.glLinkProgram(${varName}ClothProgram)`,
        `// Bind SSBO for particle positions/velocities`,
        `val ${varName}ParticleBuffer = IntArray(1)`,
        `GLES31.glGenBuffers(1, ${varName}ParticleBuffer, 0)`,
        `GLES31.glBindBuffer(GLES31.GL_SHADER_STORAGE_BUFFER, ${varName}ParticleBuffer[0])`,
        `// Dispatch compute: ceil(gridWidth*gridHeight / 256) work groups`,
        `GLES31.glDispatchCompute(ceil(${width} * ${height} / 256f).toInt(), 1, 1)`,
      ];
    },
  },

  soft_body: {
    trait: 'soft_body',
    components: ['PhysicsComponent'],
    level: 'full',
    imports: ['com.google.android.filament.utils.Float3', 'android.opengl.GLES31'],
    generate: (varName, config) => {
      const compliance = config.compliance ?? 0.0001;
      const damping = config.damping ?? 0.01;
      const substeps = config.substeps ?? 4;
      const volumeStiffness = config.volume_stiffness ?? 1.0;
      return [
        `// @soft_body -- XPBD soft body simulation`,
        `// compliance: ${compliance}, damping: ${damping}, substeps: ${substeps}`,
        `val ${varName}XPBDSolver = XPBDSoftBodySolver(`,
        `    compliance = ${compliance}f,`,
        `    damping = ${damping}f,`,
        `    substeps = ${substeps},`,
        `    volumeStiffness = ${volumeStiffness}f`,
        `)`,
        `// XPBD solve loop per substep:`,
        `// 1. Predict positions with velocity integration`,
        `// 2. For each constraint: compute C(x), gradC, delta_lambda`,
        `//    delta_lambda = (-C - alpha_tilde * lambda) / (gradC^2 + alpha_tilde)`,
        `// 3. Apply position correction: delta_x = delta_lambda * gradC / mass`,
        `// 4. Volume preservation: J = det(F), C_vol = J - 1`,
        `val ${varName}SoftSSBO = IntArray(2)`,
        `GLES31.glGenBuffers(2, ${varName}SoftSSBO, 0)`,
        `// Buffer 0: particle positions + predicted positions`,
        `// Buffer 1: constraint lambdas (Lagrange multipliers)`,
        `GLES31.glBindBuffer(GLES31.GL_SHADER_STORAGE_BUFFER, ${varName}SoftSSBO[0])`,
        `// Dispatch XPBD solver compute shader`,
        `GLES31.glUseProgram(${varName}XPBDSolver.program)`,
        `GLES31.glDispatchCompute(${varName}XPBDSolver.workGroupCount, 1, 1)`,
      ];
    },
  },

  fluid: {
    trait: 'fluid',
    components: ['PhysicsComponent'],
    level: 'full',
    imports: ['android.opengl.GLES31', 'com.google.android.filament.utils.Float3'],
    generate: (varName, config) => {
      const particleCount = config.particle_count ?? 10000;
      const viscosity = config.viscosity ?? 0.01;
      const restDensity = config.rest_density ?? 1000;
      const smoothingRadius = config.smoothing_radius ?? 0.1;
      const gasConstant = config.gas_constant ?? 2000;
      return [
        `// @fluid -- SPH fluid simulation via compute shader`,
        `// particles: ${particleCount}, viscosity: ${viscosity}, rest density: ${restDensity}`,
        `val ${varName}SPH = SPHFluidSimulation(`,
        `    particleCount = ${particleCount},`,
        `    viscosity = ${viscosity}f,`,
        `    restDensity = ${restDensity}f,`,
        `    smoothingRadius = ${smoothingRadius}f,`,
        `    gasConstant = ${gasConstant}f`,
        `)`,
        `// SPH pipeline (3-pass compute):`,
        `// Pass 1 — Spatial hashing: bin particles into grid cells`,
        `// Pass 2 — Density/pressure: rho_i = sum(m_j * W(r_ij, h))`,
        `//   P_i = k * (rho_i - rho_0)`,
        `// Pass 3 — Forces: F_pressure = -sum(m_j * (P_i+P_j)/(2*rho_j) * gradW)`,
        `//   F_viscosity = mu * sum(m_j * (v_j-v_i)/rho_j * laplacianW)`,
        `val ${varName}FluidBuffers = IntArray(3)`,
        `GLES31.glGenBuffers(3, ${varName}FluidBuffers, 0)`,
        `// Buffer 0: positions + velocities (vec4 each)`,
        `// Buffer 1: density + pressure per particle`,
        `// Buffer 2: spatial hash grid (cell → particle list)`,
        `GLES31.glBindBuffer(GLES31.GL_SHADER_STORAGE_BUFFER, ${varName}FluidBuffers[0])`,
        `val ${varName}WorkGroups = ceil(${particleCount} / 256f).toInt()`,
        `// Dispatch 3 passes sequentially with barriers`,
        `GLES31.glUseProgram(${varName}SPH.hashProgram)`,
        `GLES31.glDispatchCompute(${varName}WorkGroups, 1, 1)`,
        `GLES31.glMemoryBarrier(GLES31.GL_SHADER_STORAGE_BARRIER_BIT)`,
        `GLES31.glUseProgram(${varName}SPH.densityProgram)`,
        `GLES31.glDispatchCompute(${varName}WorkGroups, 1, 1)`,
        `GLES31.glMemoryBarrier(GLES31.GL_SHADER_STORAGE_BARRIER_BIT)`,
        `GLES31.glUseProgram(${varName}SPH.forceProgram)`,
        `GLES31.glDispatchCompute(${varName}WorkGroups, 1, 1)`,
      ];
    },
  },

  pbd_constraint: {
    trait: 'pbd_constraint',
    components: ['PhysicsComponent'],
    level: 'full',
    imports: ['android.opengl.GLES31'],
    generate: (varName, config) => {
      const constraintType = String(config.type || 'distance');
      const stiffness = config.stiffness ?? 1.0;
      const restLength = config.rest_length ?? 1.0;
      return [
        `// @pbd_constraint -- Position-Based Dynamics constraint (${constraintType})`,
        `val ${varName}Constraint = PBDConstraint(`,
        `    type = ConstraintType.${constraintType.toUpperCase()},`,
        `    stiffness = ${stiffness}f,`,
        `    restLength = ${restLength}f`,
        `)`,
        `// Constraint projection: C = |x1 - x2| - restLength`,
        `// delta_x = -stiffness * C * (x1 - x2) / |x1 - x2| * w_i / (w_1 + w_2)`,
        `${varName}Constraint.addToSolver(${varName}Physics)`,
      ];
    },
  },

  xpbd_solver: {
    trait: 'xpbd_solver',
    components: ['PhysicsComponent'],
    level: 'full',
    imports: ['android.opengl.GLES31'],
    generate: (varName, config) => {
      const substeps = config.substeps ?? 8;
      const gravity = WorldPhysicsConfig.EARTH.gravity;
      const maxParticles = config.max_particles ?? 50000;
      return [
        `// @xpbd_solver -- Extended Position-Based Dynamics solver`,
        `// substeps: ${substeps}, gravity: ${gravity}, max particles: ${maxParticles}`,
        `val ${varName}Solver = XPBDSolver(`,
        `    substeps = ${substeps},`,
        `    gravity = Vector3(0f, ${gravity}f, 0f),`,
        `    maxParticles = ${maxParticles}`,
        `)`,
        `// Per-frame: dt_sub = dt / substeps`,
        `// For each substep:`,
        `//   1. v += g * dt_sub (external forces)`,
        `//   2. x_pred = x + v * dt_sub`,
        `//   3. For each constraint: solve with compliance alpha_tilde = alpha / dt_sub^2`,
        `//   4. v = (x_pred - x_old) / dt_sub`,
        `//   5. x = x_pred`,
        `${varName}Solver.bindEntity(${varName})`,
        `xrSession.scene.addOnUpdateListener { frame ->`,
        `    ${varName}Solver.step(frame.deltaTime)`,
        `}`,
      ];
    },
  },

  sph_pressure: {
    trait: 'sph_pressure',
    components: ['PhysicsComponent'],
    level: 'full',
    imports: ['android.opengl.GLES31'],
    generate: (varName, config) => {
      const kernelRadius = config.kernel_radius ?? 0.05;
      const gasConstant = config.gas_constant ?? 2000;
      const restDensity = config.rest_density ?? 1000;
      return [
        `// @sph_pressure -- SPH pressure solver kernel`,
        `// kernel radius: ${kernelRadius}, gas constant: ${gasConstant}`,
        `val ${varName}PressureKernel = SPHPressureKernel(`,
        `    kernelRadius = ${kernelRadius}f,`,
        `    gasConstant = ${gasConstant}f,`,
        `    restDensity = ${restDensity}f`,
        `)`,
        `// Poly6 kernel: W(r, h) = 315 / (64 * pi * h^9) * (h^2 - r^2)^3`,
        `// Spiky gradient: gradW(r, h) = -45 / (pi * h^6) * (h - r)^2 * r_hat`,
        `// Pressure: P = k * (rho - rho_0)`,
        `${varName}PressureKernel.attachTo(${varName}Physics)`,
      ];
    },
  },

  rigid_body_chain: {
    trait: 'rigid_body_chain',
    components: ['PhysicsComponent'],
    level: 'full',
    generate: (varName, config) => {
      const linkCount = config.link_count ?? 10;
      const linkMass = config.link_mass ?? 0.5;
      const jointStiffness = config.joint_stiffness ?? 0.9;
      return [
        `// @rigid_body_chain -- linked rigid body chain (${linkCount} links)`,
        `val ${varName}Chain = mutableListOf<Entity>()`,
        `for (i in 0 until ${linkCount}) {`,
        `    val link = Entity.create(session)`,
        `    val linkPhysics = PhysicsComponent.create(session)`,
        `    linkPhysics.mass = ${linkMass}f`,
        `    linkPhysics.mode = PhysicsMode.DYNAMIC`,
        `    link.addComponent(linkPhysics)`,
        `    if (i > 0) {`,
        `        // Ball-socket joint constraint between link[i-1] and link[i]`,
        `        val joint = JointConstraint(${varName}Chain[i - 1], link, stiffness = ${jointStiffness}f)`,
        `        joint.enable()`,
        `    }`,
        `    ${varName}Chain.add(link)`,
        `}`,
      ];
    },
  },

  ragdoll: {
    trait: 'ragdoll',
    components: ['PhysicsComponent', 'GltfModelEntity'],
    level: 'full',
    imports: ['androidx.xr.scenecore.GltfModelEntity'],
    generate: (varName, config) => {
      const boneCount = config.bone_count ?? 15;
      const stiffness = config.stiffness ?? 0.7;
      return [
        `// @ragdoll -- ragdoll physics with ${boneCount} bones`,
        `val ${varName}Ragdoll = RagdollController(`,
        `    entity = ${varName},`,
        `    boneCount = ${boneCount},`,
        `    jointStiffness = ${stiffness}f`,
        `)`,
        `// Map skeleton bones to physics capsules:`,
        `// head, neck, spine_upper, spine_lower, pelvis`,
        `// left/right: upper_arm, forearm, hand, thigh, shin, foot`,
        `${varName}Ragdoll.buildFromSkeleton(${varName}Entity)`,
        `// Cone-twist constraints for shoulders/hips, hinge for elbows/knees`,
        `${varName}Ragdoll.configureJointLimits()`,
        `${varName}Ragdoll.activate()`,
      ];
    },
  },

  buoyancy: {
    trait: 'buoyancy',
    components: ['PhysicsComponent'],
    level: 'full',
    generate: (varName, config) => {
      const waterLevel = config.water_level ?? 0.0;
      const fluidDensity = config.fluid_density ?? 1000;
      const drag = config.drag ?? 0.5;
      return [
        `// @buoyancy -- Archimedes buoyancy force`,
        `// water level: ${waterLevel}, fluid density: ${fluidDensity}, drag: ${drag}`,
        `val ${varName}Buoyancy = BuoyancyComponent(`,
        `    waterLevel = ${waterLevel}f,`,
        `    fluidDensity = ${fluidDensity}f,`,
        `    linearDrag = ${drag}f`,
        `)`,
        `xrSession.scene.addOnUpdateListener { _ ->`,
        `    val pos = ${varName}.pose.translation`,
        `    val submergedVolume = ${varName}Buoyancy.calculateSubmergedVolume(pos)`,
        `    val buoyancyForce = ${fluidDensity}f * 9.81f * submergedVolume`,
        `    ${varName}Physics.applyForce(Vector3(0f, buoyancyForce, 0f))`,
        `    // Apply drag proportional to submerged area`,
        `    val dragForce = -${drag}f * ${varName}Physics.velocity`,
        `    ${varName}Physics.applyForce(dragForce)`,
        `}`,
      ];
    },
  },

  wind_force: {
    trait: 'wind_force',
    components: ['PhysicsComponent'],
    level: 'full',
    generate: (varName, config) => {
      const direction = config.direction || [1, 0, 0];
      const d = direction as number[];
      const strength = config.strength ?? 5.0;
      const turbulence = config.turbulence ?? 0.3;
      return [
        `// @wind_force -- wind force field`,
        `// direction: [${d[0]}, ${d[1]}, ${d[2]}], strength: ${strength}, turbulence: ${turbulence}`,
        `val ${varName}Wind = WindForce(`,
        `    direction = Vector3(${d[0]}f, ${d[1]}f, ${d[2]}f),`,
        `    strength = ${strength}f,`,
        `    turbulence = ${turbulence}f`,
        `)`,
        `xrSession.scene.addOnUpdateListener { frame ->`,
        `    val noise = SimplexNoise.noise3D(`,
        `        ${varName}.pose.translation[0] * 0.1f,`,
        `        frame.time * 0.5f,`,
        `        ${varName}.pose.translation[2] * 0.1f`,
        `    ) * ${turbulence}f`,
        `    val windDir = Vector3(${d[0]}f + noise, ${d[1]}f, ${d[2]}f + noise)`,
        `    ${varName}Physics.applyForce(windDir * ${strength}f)`,
        `}`,
      ];
    },
  },

  gravity_zone: {
    trait: 'gravity_zone',
    components: ['PhysicsComponent'],
    level: 'full',
    generate: (varName, config) => {
      const gravity = config.gravity || [0, -9.81, 0];
      const g = gravity as number[];
      const radius = config.radius ?? 10.0;
      return [
        `// @gravity_zone -- localized gravity zone`,
        `// gravity: [${g[0]}, ${g[1]}, ${g[2]}], radius: ${radius}m`,
        `val ${varName}GravityZone = GravityZone(`,
        `    center = ${varName}.pose.translation,`,
        `    radius = ${radius}f,`,
        `    gravity = Vector3(${g[0]}f, ${g[1]}f, ${g[2]}f)`,
        `)`,
        `xrSession.scene.addOnUpdateListener { _ ->`,
        `    for (entity in ${varName}GravityZone.getEntitiesInRange()) {`,
        `        val dist = Vector3.distance(entity.pose.translation, ${varName}.pose.translation)`,
        `        if (dist < ${radius}f) {`,
        `            val falloff = 1f - (dist / ${radius}f)`,
        `            entity.getComponent<PhysicsComponent>()?.applyForce(`,
        `                Vector3(${g[0]}f, ${g[1]}f, ${g[2]}f) * falloff`,
        `            )`,
        `        }`,
        `    }`,
        `}`,
      ];
    },
  },
};

// =============================================================================
// INTERACTION TRAITS
// =============================================================================

export const INTERACTION_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  grabbable: {
    trait: 'grabbable',
    components: ['MovableComponent', 'InteractableComponent'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.MovableComponent',
      'androidx.xr.scenecore.InteractableComponent',
      'androidx.xr.scenecore.InputEvent',
    ],
    generate: (varName, config) => {
      const _snapToHand = config.snap_to_hand ?? false;
      return [
        `// @grabbable -- MovableComponent enables drag-to-move in Android XR`,
        `val ${varName}Movable = MovableComponent.createSystemMovable(session)`,
        `${varName}.addComponent(${varName}Movable)`,
        `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
        `    if (event.source == InputEvent.Source.HANDS && event.action == InputEvent.Action.ACTION_DOWN) {`,
        `        // Grab initiated`,
        `    }`,
        `}`,
        `${varName}.addComponent(${varName}Interactable)`,
      ];
    },
  },

  hoverable: {
    trait: 'hoverable',
    components: ['InteractableComponent'],
    level: 'full',
    imports: ['androidx.xr.scenecore.InteractableComponent', 'androidx.xr.scenecore.InputEvent'],
    generate: (varName, config) => {
      const highlightColor = config.highlight_color || '#ffffff';
      return [
        `// @hoverable -- InteractableComponent with HOVER_ENTER/HOVER_EXIT`,
        `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
        `    when (event.action) {`,
        `        InputEvent.Action.ACTION_HOVER_ENTER -> { /* highlight: ${highlightColor} */ }`,
        `        InputEvent.Action.ACTION_HOVER_EXIT -> { /* remove highlight */ }`,
        `    }`,
        `}`,
        `${varName}.addComponent(${varName}Interactable)`,
      ];
    },
  },

  clickable: {
    trait: 'clickable',
    components: ['InteractableComponent'],
    level: 'full',
    imports: ['androidx.xr.scenecore.InteractableComponent', 'androidx.xr.scenecore.InputEvent'],
    generate: (varName) => [
      `// @clickable -- tap/click handling via InteractableComponent`,
      `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
      `    if (event.action == InputEvent.Action.ACTION_UP) {`,
      `        // Click/tap handler for ${varName}`,
      `    }`,
      `}`,
      `${varName}.addComponent(${varName}Interactable)`,
    ],
  },

  draggable: {
    trait: 'draggable',
    components: ['MovableComponent', 'InteractableComponent'],
    level: 'full',
    imports: ['androidx.xr.scenecore.MovableComponent'],
    generate: (varName, config) => {
      const axis = config.constrain_axis;
      const lines = [
        `// @draggable -- MovableComponent for drag interaction`,
        `val ${varName}Movable = MovableComponent.createSystemMovable(session)`,
        `${varName}.addComponent(${varName}Movable)`,
      ];
      if (axis) {
        lines.push(`// Constrain drag to axis: ${axis}`);
      }
      return lines;
    },
  },

  throwable: {
    trait: 'throwable',
    components: ['MovableComponent', 'InteractableComponent', 'PhysicsComponent'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.MovableComponent',
      'androidx.xr.scenecore.InteractableComponent',
      'androidx.xr.scenecore.InputEvent',
    ],
    generate: (varName, config) => {
      const maxVelocity = config.max_velocity ?? 10;
      return [
        `// @throwable -- drag + release with velocity`,
        `val ${varName}Movable = MovableComponent.createSystemMovable(session)`,
        `${varName}.addComponent(${varName}Movable)`,
        `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
        `    if (event.action == InputEvent.Action.ACTION_UP) {`,
        `        // Apply velocity on release, max: ${maxVelocity}`,
        `    }`,
        `}`,
        `${varName}.addComponent(${varName}Interactable)`,
      ];
    },
  },

  pointable: {
    trait: 'pointable',
    components: ['InteractableComponent'],
    level: 'full',
    imports: ['androidx.xr.scenecore.InteractableComponent', 'androidx.xr.scenecore.InputEvent'],
    generate: (varName) => [
      `// @pointable -- responds to both hand and controller pointing`,
      `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
      `    // Source: event.source (HANDS or CONTROLLER)`,
      `    // Pointer: event.pointerType (LEFT or RIGHT)`,
      `}`,
      `${varName}.addComponent(${varName}Interactable)`,
    ],
  },

  scalable: {
    trait: 'scalable',
    components: ['ResizableComponent'],
    level: 'full',
    imports: ['androidx.xr.scenecore.ResizableComponent', 'androidx.xr.scenecore.ResizeEvent'],
    generate: (varName, config) => {
      const minScale = config.min_scale ?? 0.1;
      const maxScale = config.max_scale ?? 3.0;
      return [
        `// @scalable -- ResizableComponent with min/max constraints`,
        `val ${varName}Resizable = ResizableComponent.create(session) { event ->`,
        `    if (event.resizeState == ResizeEvent.ResizeState.END) {`,
        `        val s = event.newSize`,
        `        // Clamp scale between ${minScale} and ${maxScale}`,
        `    }`,
        `}`,
        `${varName}Resizable.minimumEntitySize = FloatSize3d(${minScale}f, ${minScale}f, ${minScale}f)`,
        `${varName}.addComponent(${varName}Resizable)`,
      ];
    },
  },

  rotatable: {
    trait: 'rotatable',
    components: ['InteractableComponent'],
    level: 'full',
    imports: ['androidx.xr.scenecore.InteractableComponent', 'androidx.xr.runtime.math.Quaternion'],
    generate: (varName, config) => {
      const axis = String(config.axis || 'y');
      return [
        `// @rotatable -- rotation via InteractableComponent gesture tracking`,
        `// Constrained to axis: ${axis}`,
        `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
        `    if (event.action == InputEvent.Action.ACTION_MOVE) {`,
        `        val rotation = Quaternion.fromEulerAngles(0f, event.delta[1], 0f)`,
        `        ${varName}.setPose(Pose(${varName}.pose.translation, rotation))`,
        `    }`,
        `}`,
        `${varName}.addComponent(${varName}Interactable)`,
      ];
    },
  },
};

// =============================================================================
// AUDIO TRAITS
// =============================================================================

export const AUDIO_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  audio: {
    trait: 'audio',
    components: ['SpatialSoundPool'],
    level: 'full',
    imports: ['android.media.AudioAttributes', 'android.media.SoundPool'],
    generate: (varName, config) => {
      const src = config.src || config.source || '';
      const loop = config.loop ?? false;
      const volume = config.volume ?? 1.0;
      return [
        `// @audio -- SoundPool playback`,
        `val ${varName}SoundPool = SoundPool.Builder()`,
        `    .setAudioAttributes(AudioAttributes.Builder()`,
        `        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)`,
        `        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).build())`,
        `    .build()`,
        `val ${varName}SoundId = ${varName}SoundPool.load(context.assets.openFd("${src}"), 0)`,
        `${varName}SoundPool.setOnLoadCompleteListener { pool, id, status ->`,
        `    if (status == 0) pool.play(id, ${volume}f, ${volume}f, 1, ${loop ? -1 : 0}, 1.0f)`,
        `}`,
      ];
    },
  },

  spatial_audio: {
    trait: 'spatial_audio',
    components: ['SpatialSoundPool', 'PointSourceParams'],
    level: 'full',
    imports: [
      'android.media.AudioAttributes',
      'android.media.SoundPool',
      'androidx.xr.scenecore.SpatialSoundPool',
      'androidx.xr.scenecore.PointSourceParams',
    ],
    generate: (varName, config) => {
      const refDistance = config.refDistance ?? 1.0;
      const rolloff = config.rolloff ?? 1.0;
      return [
        `// @spatial_audio -- SpatialSoundPool with PointSourceParams`,
        `// Reference distance: ${refDistance}, rolloff: ${rolloff}`,
        `if (session.scene.spatialCapabilities.contains(SpatialCapability.SPATIAL_AUDIO)) {`,
        `    val ${varName}SoundPool = SoundPool.Builder()`,
        `        .setAudioAttributes(AudioAttributes.Builder()`,
        `            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)`,
        `            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).build())`,
        `        .build()`,
        `    val ${varName}PointSource = PointSourceParams(${varName})`,
        `    val ${varName}SoundId = ${varName}SoundPool.load(context.assets.openFd("audio.mp3"), 0)`,
        `    ${varName}SoundPool.setOnLoadCompleteListener { pool, id, status ->`,
        `        if (status == 0) SpatialSoundPool.play(session, pool, id, ${varName}PointSource, 1f, 0, -1, 1f)`,
        `    }`,
        `}`,
      ];
    },
  },

  ambisonics: {
    trait: 'ambisonics',
    components: ['SpatialMediaPlayer', 'SoundFieldAttributes'],
    level: 'full',
    imports: [
      'android.media.MediaPlayer',
      'android.media.AudioAttributes',
      'androidx.xr.scenecore.SpatialMediaPlayer',
      'androidx.xr.scenecore.SoundFieldAttributes',
      'androidx.xr.scenecore.SpatializerConstants',
    ],
    generate: (varName, config) => {
      const src = config.src || config.source || 'ambisonic_soundscape';
      const _loop = config.loop ?? true;
      const order = String(config.order || 'FIRST_ORDER');
      return [
        `// @ambisonics -- SoundFieldAttributes for ambisonic playback`,
        `if (session.scene.spatialCapabilities.contains(SpatialCapability.SPATIAL_AUDIO)) {`,
        `    val ${varName}SoundField = SoundFieldAttributes(SpatializerConstants.AmbisonicsOrder.${order})`,
        `    val ${varName}Player = MediaPlayer()`,
        `    ${varName}Player.reset()`,
        `    ${varName}Player.setDataSource(context.assets.openFd("${src}"))`,
        `    SpatialMediaPlayer.setSoundFieldAttributes(session, ${varName}Player, ${varName}SoundField)`,
        `    ${varName}Player.setAudioAttributes(AudioAttributes.Builder()`,
        `        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)`,
        `        .setUsage(AudioAttributes.USAGE_MEDIA).build())`,
        `    ${varName}Player.prepare()`,
        `    ${varName}Player.isLooping = true`,
        `    ${varName}Player.start()`,
        `}`,
      ];
    },
  },

  audio_reverb: {
    trait: 'audio_reverb',
    components: ['SpatialSoundPool'],
    level: 'full',
    imports: ['android.media.audiofx.EnvironmentalReverb'],
    generate: (varName, config) => {
      const wetMix = config.wet_mix ?? 0.3;
      const roomSize = config.room_size ?? 0.7;
      return [
        `// @audio_reverb -- per-source reverb effect`,
        `// wet mix: ${wetMix}, room size: ${roomSize}`,
        `val ${varName}Reverb = EnvironmentalReverb(0, 0)`,
        `${varName}Reverb.roomLevel = (${roomSize} * -1000).toInt().toShort()`,
        `${varName}Reverb.decayTime = (${roomSize} * 3000).toInt()`,
        `${varName}Reverb.reverbLevel = (${wetMix} * -200).toInt().toShort()`,
        `${varName}Reverb.enabled = true`,
      ];
    },
  },

  reverb_zone: {
    trait: 'reverb_zone',
    components: ['SpatialSoundPool'],
    level: 'full',
    imports: ['android.media.audiofx.EnvironmentalReverb', 'android.media.audiofx.PresetReverb'],
    generate: (varName, config) => {
      const preset = String(config.preset || 'largeRoom');
      const decayTime = config.decay_time ?? 1500;
      const roomLevel = config.room_level ?? -1000;
      const reverbLevel = config.reverb_level ?? -400;
      const presetMap: Record<string, string> = {
        smallRoom: 'PresetReverb.PRESET_SMALLROOM',
        mediumRoom: 'PresetReverb.PRESET_MEDIUMROOM',
        largeRoom: 'PresetReverb.PRESET_LARGEROOM',
        hall: 'PresetReverb.PRESET_MEDIUMHALL',
        largeHall: 'PresetReverb.PRESET_LARGEHALL',
        plate: 'PresetReverb.PRESET_PLATE',
      };
      return [
        `// @reverb_zone -- environmental reverb via AudioEffect`,
        `// Preset: ${preset}, decay: ${decayTime}ms`,
        `val ${varName}Reverb = EnvironmentalReverb(0, 0)`,
        `${varName}Reverb.decayTime = ${decayTime}`,
        `${varName}Reverb.roomLevel = ${roomLevel}.toShort()`,
        `${varName}Reverb.reverbLevel = ${reverbLevel}.toShort()`,
        `${varName}Reverb.enabled = true`,
        `// Preset alternative:`,
        `val ${varName}PresetReverb = PresetReverb(0, 0)`,
        `${varName}PresetReverb.preset = ${presetMap[preset] || 'PresetReverb.PRESET_LARGEROOM'}`,
        `${varName}PresetReverb.enabled = true`,
        `// Attach to audio session: ${varName}SoundPool.setAuxEffectSendLevel(1.0f)`,
      ];
    },
  },

  audio_occlusion: {
    trait: 'audio_occlusion',
    components: ['SpatialSoundPool', 'PointSourceParams'],
    level: 'full',
    imports: ['androidx.xr.scenecore.SpatialSoundPool', 'androidx.xr.scenecore.PointSourceParams'],
    generate: (varName, config) => {
      const attenuationFactor = config.attenuation ?? 0.3;
      const lowPassCutoff = config.low_pass_cutoff ?? 800;
      return [
        `// @audio_occlusion -- raycast-based audio occlusion`,
        `// attenuation: ${attenuationFactor}, low-pass cutoff: ${lowPassCutoff}Hz`,
        `val ${varName}OcclusionProcessor = AudioOcclusionProcessor(`,
        `    attenuationFactor = ${attenuationFactor}f,`,
        `    lowPassCutoff = ${lowPassCutoff}f`,
        `)`,
        `xrSession.scene.addOnUpdateListener { _ ->`,
        `    val listenerPos = xrSession.scene.activitySpace.pose.translation`,
        `    val sourcePos = ${varName}.pose.translation`,
        `    val direction = sourcePos - listenerPos`,
        `    // Raycast from listener to source; check for occluding geometry`,
        `    val occluded = ${varName}OcclusionProcessor.raycastOcclusion(listenerPos, direction)`,
        `    if (occluded) {`,
        `        ${varName}SoundPool.setVolume(${varName}SoundId, ${attenuationFactor}f, ${attenuationFactor}f)`,
        `        // Apply low-pass filter at ${lowPassCutoff}Hz for muffled effect`,
        `    } else {`,
        `        ${varName}SoundPool.setVolume(${varName}SoundId, 1.0f, 1.0f)`,
        `    }`,
        `}`,
      ];
    },
  },

  head_tracked_audio: {
    trait: 'head_tracked_audio',
    components: ['SpatialMediaPlayer', 'PointSourceParams'],
    level: 'full',
    imports: [
      'android.media.MediaPlayer',
      'androidx.xr.scenecore.SpatialMediaPlayer',
      'androidx.xr.scenecore.PointSourceParams',
    ],
    generate: (varName) => [
      `// @head_tracked_audio -- audio anchored to head position`,
      `// Android XR: use PointSourceParams with a head-relative entity`,
      `val ${varName}PointSource = PointSourceParams(session.scene.mainPanelEntity)`,
      `val ${varName}HeadPlayer = MediaPlayer()`,
      `SpatialMediaPlayer.setPointSourceParams(session, ${varName}HeadPlayer, ${varName}PointSource)`,
      `// Audio follows user's head position automatically via mainPanelEntity binding`,
    ],
  },

  audio_filter: {
    trait: 'audio_filter',
    components: ['SpatialSoundPool'],
    level: 'full',
    imports: ['android.media.audiofx.Equalizer', 'android.media.audiofx.BassBoost'],
    generate: (varName, config) => {
      const filterType = String(config.type || 'equalizer');
      const bands = config.bands as number[] | undefined;
      return [
        `// @audio_filter -- audio filter effect (${filterType})`,
        `val ${varName}Equalizer = Equalizer(0, ${varName}SoundPool.hashCode())`,
        `${varName}Equalizer.enabled = true`,
        ...(bands
          ? bands.map(
              (gain, i) => `${varName}Equalizer.setBandLevel(${i}.toShort(), ${gain}.toShort())`
            )
          : [
              `// Configure equalizer bands (${varName}Equalizer.numberOfBands bands available)`,
              `for (i in 0 until ${varName}Equalizer.numberOfBands) {`,
              `    val range = ${varName}Equalizer.bandLevelRange`,
              `    ${varName}Equalizer.setBandLevel(i.toShort(), 0.toShort())`,
              `}`,
            ]),
        `val ${varName}BassBoost = BassBoost(0, ${varName}SoundPool.hashCode())`,
        `${varName}BassBoost.setStrength(500.toShort())`,
        `${varName}BassBoost.enabled = true`,
      ];
    },
  },

  audio_mixer: {
    trait: 'audio_mixer',
    components: ['SpatialSoundPool'],
    level: 'full',
    imports: ['android.media.AudioAttributes', 'android.media.SoundPool'],
    generate: (varName, config) => {
      const channels = config.channels ?? 8;
      const masterVolume = config.master_volume ?? 1.0;
      return [
        `// @audio_mixer -- multi-channel audio mixer (${channels} channels)`,
        `val ${varName}Mixer = SoundPool.Builder()`,
        `    .setMaxStreams(${channels})`,
        `    .setAudioAttributes(AudioAttributes.Builder()`,
        `        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)`,
        `        .setUsage(AudioAttributes.USAGE_GAME).build())`,
        `    .build()`,
        `val ${varName}MasterVolume = ${masterVolume}f`,
        `// Channel routing: assign each sound source to a mixer channel`,
        `val ${varName}Channels = mutableMapOf<Int, Float>() // streamId -> volume`,
        `fun ${varName}SetChannelVolume(streamId: Int, volume: Float) {`,
        `    val finalVol = volume * ${varName}MasterVolume`,
        `    ${varName}Mixer.setVolume(streamId, finalVol, finalVol)`,
        `    ${varName}Channels[streamId] = volume`,
        `}`,
      ];
    },
  },

  doppler_effect: {
    trait: 'doppler_effect',
    components: ['SpatialSoundPool', 'PointSourceParams'],
    level: 'full',
    imports: ['androidx.xr.scenecore.SpatialSoundPool', 'androidx.xr.scenecore.PointSourceParams'],
    generate: (varName, config) => {
      const speedOfSound = config.speed_of_sound ?? 343;
      const maxShift = config.max_shift ?? 2.0;
      return [
        `// @doppler_effect -- Doppler pitch shifting for moving sources`,
        `// speed of sound: ${speedOfSound} m/s, max shift: ${maxShift}x`,
        `var ${varName}PrevPos = ${varName}.pose.translation`,
        `xrSession.scene.addOnUpdateListener { frame ->`,
        `    val currentPos = ${varName}.pose.translation`,
        `    val listenerPos = xrSession.scene.activitySpace.pose.translation`,
        `    val sourceVelocity = (currentPos - ${varName}PrevPos) / frame.deltaTime`,
        `    val toListener = (listenerPos - currentPos).normalized()`,
        `    val relVelocity = sourceVelocity.dot(toListener)`,
        `    // Doppler: f' = f * (v_sound) / (v_sound + v_source)`,
        `    val pitchShift = (${speedOfSound}f / (${speedOfSound}f + relVelocity))`,
        `        .coerceIn(${1.0 / (maxShift as number)}f, ${maxShift}f)`,
        `    ${varName}SoundPool.setRate(${varName}StreamId, pitchShift)`,
        `    ${varName}PrevPos = currentPos`,
        `}`,
      ];
    },
  },

  audio_zone: {
    trait: 'audio_zone',
    components: ['SpatialSoundPool'],
    level: 'full',
    generate: (varName, config) => {
      const radius = config.radius ?? 5.0;
      const fadeDistance = config.fade_distance ?? 2.0;
      return [
        `// @audio_zone -- spatial audio activation zone`,
        `// radius: ${radius}m, fade distance: ${fadeDistance}m`,
        `val ${varName}ZoneRadius = ${radius}f`,
        `val ${varName}FadeDist = ${fadeDistance}f`,
        `xrSession.scene.addOnUpdateListener { _ ->`,
        `    val listenerPos = xrSession.scene.activitySpace.pose.translation`,
        `    val dist = Vector3.distance(listenerPos, ${varName}.pose.translation)`,
        `    val volume = when {`,
        `        dist > ${varName}ZoneRadius + ${varName}FadeDist -> 0f`,
        `        dist > ${varName}ZoneRadius -> 1f - ((dist - ${varName}ZoneRadius) / ${varName}FadeDist)`,
        `        else -> 1f`,
        `    }`,
        `    ${varName}SoundPool.setVolume(${varName}StreamId, volume, volume)`,
        `}`,
      ];
    },
  },

  voice_synthesis: {
    trait: 'voice_synthesis',
    components: [],
    level: 'full',
    imports: ['android.speech.tts.TextToSpeech'],
    generate: (varName, config) => {
      const voice = String(config.voice || 'default');
      const pitch = config.pitch ?? 1.0;
      const rate = config.rate ?? 1.0;
      return [
        `// @voice_synthesis -- text-to-speech synthesis`,
        `// voice: ${voice}, pitch: ${pitch}, rate: ${rate}`,
        `val ${varName}TTS = TextToSpeech(context) { status ->`,
        `    if (status == TextToSpeech.SUCCESS) {`,
        `        ${varName}TTS.language = Locale.getDefault()`,
        `        ${varName}TTS.setPitch(${pitch}f)`,
        `        ${varName}TTS.setSpeechRate(${rate}f)`,
        `    }`,
        `}`,
        `fun ${varName}Speak(text: String) {`,
        `    ${varName}TTS.speak(text, TextToSpeech.QUEUE_FLUSH, null, "${varName}_utterance")`,
        `}`,
      ];
    },
  },
};

// =============================================================================
// AR/XR TRAITS
// =============================================================================

export const AR_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  anchor: {
    trait: 'anchor',
    components: ['AnchorEntity'],
    level: 'full',
    imports: ['androidx.xr.scenecore.AnchorEntity', 'androidx.xr.arcore.Anchor'],
    generate: (varName, config) => {
      const target = String(config.anchor_type || 'plane');
      const lines = [`// @anchor -- AnchorEntity for world-locked placement (type: ${target})`];
      if (target === 'plane') {
        lines.push(
          `val ${varName}AnchorPlacement = AnchorPlacement.createForPlanes(`,
          `    anchorablePlaneOrientations = setOf(PlaneOrientation.HORIZONTAL),`,
          `    anchorablePlaneSemanticTypes = setOf(PlaneSemanticType.FLOOR, PlaneSemanticType.TABLE)`,
          `)`,
          `val ${varName}Movable = MovableComponent.createAnchorable(session, setOf(${varName}AnchorPlacement))`,
          `${varName}.addComponent(${varName}Movable)`
        );
      } else if (target === 'vertical') {
        lines.push(
          `val ${varName}AnchorPlacement = AnchorPlacement.createForPlanes(`,
          `    anchorablePlaneOrientations = setOf(PlaneOrientation.VERTICAL)`,
          `)`,
          `val ${varName}Movable = MovableComponent.createAnchorable(session, setOf(${varName}AnchorPlacement))`,
          `${varName}.addComponent(${varName}Movable)`
        );
      } else {
        lines.push(
          `val ${varName}Anchor = Anchor.create(session, ${varName}.pose)`,
          `when (${varName}Anchor) {`,
          `    is AnchorCreateSuccess -> {`,
          `        AnchorEntity.create(session, ${varName}Anchor.anchor).apply {`,
          `            parent = session.scene.activitySpace`,
          `            addChild(${varName})`,
          `        }`,
          `    }`,
          `}`
        );
      }
      return lines;
    },
  },

  plane_detection: {
    trait: 'plane_detection',
    components: ['PlaneTrackable'],
    level: 'full',
    imports: [
      'com.google.ar.core.Config',
      'com.google.ar.core.Plane',
      'com.google.ar.core.TrackingState',
    ],
    generate: (varName, config) => {
      const types = (config.types as string[]) || ['horizontal', 'vertical'];
      return [
        `// @plane_detection -- ARCore plane detection (types: ${types.join(', ')})`,
        `// android.permission.SCENE_UNDERSTANDING_COARSE required`,
        `xrSession.scene.configure { config ->`,
        `    config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL`,
        `}`,
        `xrSession.scene.addOnUpdateListener { frame ->`,
        `    for (plane in frame.getUpdatedTrackables(Plane::class.java)) {`,
        `        if (plane.trackingState == TrackingState.TRACKING) {`,
        `            val ${varName}Anchor = plane.createAnchor(plane.centerPose)`,
        `            // Place ${varName} at detected plane`,
        `        }`,
        `    }`,
        `}`,
      ];
    },
  },

  mesh_detection: {
    trait: 'mesh_detection',
    components: ['MeshReconstruction'],
    level: 'full',
    imports: ['com.google.ar.core.Config', 'com.google.ar.core.Frame', 'com.google.ar.core.Trackable'],
    generate: (varName) => [
      `// @mesh_detection -- ARCore scene mesh reconstruction`,
      `// android.permission.SCENE_UNDERSTANDING_COARSE required`,
      `xrSession.scene.configure { config ->`,
      `    config.depthMode = Config.DepthMode.AUTOMATIC`,
      `    config.instantPlacementMode = Config.InstantPlacementMode.LOCAL_Y_UP`,
      `}`,
      `val ${varName}Mesh = xrSession.scene.perceptionSpace.createMeshReconstruction()`,
      `${varName}.addComponent(${varName}Mesh)`,
      `// Process updated mesh triangles each frame`,
      `xrSession.scene.addOnUpdateListener { frame ->`,
      `    for (mesh in frame.getUpdatedTrackables(Trackable::class.java)) {`,
      `        // ${varName}: mesh vertices available via mesh.vertices`,
      `    }`,
      `}`,
    ],
  },

  hand_tracking: {
    trait: 'hand_tracking',
    components: ['HandTrackingProvider'],
    level: 'full',
    imports: [
      'androidx.xr.arcore.Hand',
      'androidx.xr.arcore.HandJointType',
      'androidx.xr.arcore.HandTrackingMode',
    ],
    generate: (varName) => [
      `// @hand_tracking -- ARCore for Jetpack XR HandTrackingProvider`,
      `// android.permission.HAND_TRACKING required`,
      `val ${varName}Config = session.config.copy(handTracking = HandTrackingMode.BOTH)`,
      `session.configure(${varName}Config)`,
      ``,
      `Hand.left(session)?.state?.collect { handState ->`,
      `    val palmPose = handState.handJoints[HandJointType.HAND_JOINT_TYPE_PALM] ?: return@collect`,
      `    val worldPose = session.scene.perceptionSpace.transformPoseTo(palmPose, session.scene.activitySpace)`,
      `    // Joint types: THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, etc.`,
      `}`,
      `Hand.right(session)?.state?.collect { handState ->`,
      `    val palmPose = handState.handJoints[HandJointType.HAND_JOINT_TYPE_PALM] ?: return@collect`,
      `    val worldPose = session.scene.perceptionSpace.transformPoseTo(palmPose, session.scene.activitySpace)`,
      `}`,
    ],
  },

  eye_tracking: {
    trait: 'eye_tracking',
    components: ['InteractableComponent'],
    level: 'full',
    imports: ['androidx.xr.scenecore.InteractableComponent', 'androidx.xr.scenecore.InputEvent'],
    generate: (varName) => [
      `// @eye_tracking -- Android XR eye tracking via gaze input events`,
      `// android.permission.EYE_TRACKING required`,
      `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
      `    when (event.action) {`,
      `        InputEvent.Action.ACTION_HOVER_ENTER -> {`,
      `            // Gaze entered ${varName} — highlight or show info`,
      `            ${varName}.setAlpha(1.0f)`,
      `        }`,
      `        InputEvent.Action.ACTION_HOVER_EXIT -> {`,
      `            // Gaze exited ${varName}`,
      `            ${varName}.setAlpha(0.8f)`,
      `        }`,
      `        InputEvent.Action.ACTION_DOWN -> {`,
      `            // Dwell-click on ${varName}`,
      `        }`,
      `    }`,
      `}`,
      `${varName}.addComponent(${varName}Interactable)`,
    ],
  },

  occlusion: {
    trait: 'occlusion',
    components: ['OcclusionProvider'],
    level: 'full',
    imports: ['com.google.ar.core.Config', 'com.google.ar.core.DepthPoint'],
    generate: (varName) => [
      `// @occlusion -- ARCore depth-based occlusion`,
      `xrSession.scene.configure { config ->`,
      `    config.depthMode = Config.DepthMode.AUTOMATIC`,
      `    config.focusMode = Config.FocusMode.AUTO`,
      `}`,
      `// Depth occlusion is active — real geometry occludes ${varName}`,
      `xrSession.scene.addOnUpdateListener { frame ->`,
      `    val depthImage = frame.acquireDepthImage16Bits()`,
      `    try {`,
      `        // Sample depth at ${varName} screen position for custom occlusion logic`,
      `        val depthPoint = DepthPoint(depthImage, 0.5f, 0.5f)`,
      `    } finally { depthImage.close() }`,
      `}`,
    ],
  },

  light_estimation: {
    trait: 'light_estimation',
    components: ['LightManager'],
    level: 'full',
    imports: ['com.google.ar.core.Config', 'com.google.android.filament.LightManager'],
    generate: (varName) => [
      `// @light_estimation -- ARCore environmental HDR light estimation`,
      `xrSession.scene.configure { config ->`,
      `    config.lightEstimationMode = Config.LightEstimationMode.ENVIRONMENTAL_HDR`,
      `}`,
      `// Filament IBL is automatically updated from ARCore light estimate for ${varName}`,
    ],
  },

  world_anchor: {
    trait: 'world_anchor',
    components: ['AnchorEntity'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.AnchorEntity',
      'androidx.xr.arcore.Anchor',
      'androidx.xr.arcore.AnchorPersistenceMode',
    ],
    generate: (varName, config) => {
      const persistent = config.persistent ?? true;
      const lines = [
        `// @world_anchor -- persistent world-locked anchor`,
        `val ${varName}AnchorResult = Anchor.create(session, ${varName}.pose)`,
        `when (${varName}AnchorResult) {`,
        `    is AnchorCreateSuccess -> {`,
        `        val ${varName}AnchorEntity = AnchorEntity.create(session, ${varName}AnchorResult.anchor)`,
        `        ${varName}AnchorEntity.parent = session.scene.activitySpace`,
        `        ${varName}AnchorEntity.addChild(${varName})`,
      ];
      if (persistent) {
        lines.push(
          `        // Persist anchor for cross-session retrieval`,
          `        val ${varName}Uuid = ${varName}AnchorResult.anchor.persist()`,
          `        // Retrieve later: Anchor.load(session, ${varName}Uuid)`
        );
      }
      lines.push(`    }`, `}`);
      return lines;
    },
  },

  geospatial: {
    trait: 'geospatial',
    components: ['AnchorEntity'],
    level: 'full',
    imports: ['com.google.ar.core.GeospatialPose', 'com.google.ar.core.Earth'],
    generate: (varName, config) => {
      const lat = config.latitude ?? 0;
      const lng = config.longitude ?? 0;
      const alt = config.altitude ?? 0;
      return [
        `// @geospatial -- ARCore Geospatial API (supported on Android XR)`,
        `// Latitude: ${lat}, Longitude: ${lng}, Altitude: ${alt}`,
        `val ${varName}Earth = xrSession.earth`,
        `if (${varName}Earth?.trackingState == TrackingState.TRACKING) {`,
        `    val ${varName}GeoAnchor = ${varName}Earth.createAnchor(${lat}, ${lng}, ${alt}, 0f, 0f, 0f, 1f)`,
        `    // Attach ${varName} to geospatial anchor`,
        `}`,
      ];
    },
  },
};

// =============================================================================
// VISUAL TRAITS
// =============================================================================

export const ACCESSIBILITY_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  accessible: {
    trait: 'accessible',
    components: ['AccessibilityDelegate'],
    level: 'full',
    imports: ['android.view.accessibility.AccessibilityNodeInfo'],
    generate: (varName, config) => {
      const label = config.label || '';
      const hint = config.hint || '';
      const isButton = config.isButton ?? false;
      return [
        `// @accessible -- Android accessibility support for ${varName}`,
        `${varName}.contentDescription = "${label}"`,
        ...(hint ? [`// Hint: ${hint}`] : []),
        ...(isButton
          ? [`// Role: Button -- set accessibilityClassName = "android.widget.Button"`]
          : []),
        `${varName}.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES`,
      ];
    },
  },

  alt_text: {
    trait: 'alt_text',
    components: ['AccessibilityDelegate'],
    level: 'full',
    generate: (varName, config) => {
      const text = config.text || '';
      return [
        `// @alt_text -- contentDescription for TalkBack`,
        `${varName}.contentDescription = "${text}"`,
      ];
    },
  },

  high_contrast: {
    trait: 'high_contrast',
    components: [],
    level: 'full',
    generate: (varName) => [
      `// @high_contrast -- Android accessibility high contrast mode`,
      `val ${varName}HighContrast = Settings.Secure.getInt(`,
      `    context.contentResolver,`,
      `    Settings.Secure.ACCESSIBILITY_HIGH_TEXT_CONTRAST_ENABLED, 0`,
      `) == 1`,
      `if (${varName}HighContrast) {`,
      `    // Apply high-contrast materials (WCAG 7:1 ratio)`,
      `}`,
    ],
  },

  motion_reduced: {
    trait: 'motion_reduced',
    components: [],
    level: 'full',
    generate: (varName) => [
      `// @motion_reduced -- respect Android reduce-motion preference`,
      `val ${varName}ReduceMotion = Settings.Global.getFloat(`,
      `    context.contentResolver,`,
      `    Settings.Global.ANIMATOR_DURATION_SCALE, 1.0f`,
      `) == 0f`,
      `if (${varName}ReduceMotion) {`,
      `    // Skip animations, use instant transitions`,
      `} else {`,
      `    // Play animations normally`,
      `}`,
    ],
  },
};

// =============================================================================
// UI TRAITS (SPATIAL)
// =============================================================================

export const UI_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  gaze_interactable: {
    trait: 'gaze_interactable',
    components: ['InteractableComponent'],
    level: 'full',
    imports: ['androidx.xr.scenecore.InteractableComponent', 'androidx.xr.scenecore.InteractableType'],
    generate: (varName) => [
      `// Combine Android SceneCore Gaze entity with Hand tracking pinch`,
      `${varName}.addComponent(InteractableComponent(InteractableType.GAZE_AND_PINCH))`,
      `${varName}.setOnClickListener { event -> handleUaalEvent(event) }`,
    ],
  },

  ui_floating: {
    trait: 'ui_floating',
    components: ['PanelEntity'],
    level: 'full',
    imports: [
      'androidx.xr.compose.spatial.SpatialPanel',
      'androidx.xr.compose.subspace.layout.SubspaceModifier',
    ],
    generate: (varName, config) => {
      const distance = config.distance ?? 0.3;
      return [
        `// @ui_floating -- SpatialPanel with offset position`,
        `SpatialPanel(SubspaceModifier.width(400f).height(300f)) {`,
        `    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {`,
        `        Text("${config.title || 'Info'}", style = MaterialTheme.typography.headlineSmall)`,
        `    }`,
        `}`,
        `// Position ${varName} at offset ${distance}m above parent`,
      ];
    },
  },

  ui_anchored: {
    trait: 'ui_anchored',
    components: ['PanelEntity', 'AnchorEntity'],
    level: 'full',
    imports: ['androidx.xr.compose.spatial.SpatialPanel', 'androidx.xr.scenecore.AnchorEntity'],
    generate: (varName, config) => {
      const to = String(config.to || 'world');
      return [
        `// @ui_anchored -- SpatialPanel anchored to ${to}`,
        `SpatialPanel(SubspaceModifier.width(400f).height(300f)) {`,
        `    // ${varName} anchored UI content`,
        `}`,
        ...(to === 'world'
          ? [
              `// Anchor to world via AnchorEntity`,
              `val ${varName}Anchor = Anchor.create(session, Pose())`,
            ]
          : []),
        ...(to.includes('hand') ? [`// Anchor to hand -- track via Hand.left/right(session)`] : []),
      ];
    },
  },

  ui_hand_menu: {
    trait: 'ui_hand_menu',
    components: ['PanelEntity', 'HandTrackingProvider'],
    level: 'full',
    imports: [
      'androidx.xr.compose.spatial.SpatialPanel',
      'androidx.xr.arcore.Hand',
      'androidx.xr.arcore.HandJointType',
    ],
    generate: (varName, config) => {
      const hand = config.hand || 'left';
      const trigger = config.trigger || 'palm_up';
      return [
        `// @ui_hand_menu -- SpatialPanel attached to ${hand} hand`,
        `// Trigger: ${trigger}`,
        `Hand.${hand}(session)?.state?.collect { handState ->`,
        `    val palmPose = handState.handJoints[HandJointType.HAND_JOINT_TYPE_PALM]`,
        `    if (palmPose != null) {`,
        `        // Position ${varName} panel at palm location`,
        `        val worldPose = session.scene.perceptionSpace.transformPoseTo(palmPose, session.scene.activitySpace)`,
        `    }`,
        `}`,
      ];
    },
  },

  ui_billboard: {
    trait: 'ui_billboard',
    components: ['PanelEntity', 'BillboardNode'],
    level: 'full',
    generate: (varName) => [
      `// @ui_billboard -- SpatialPanel that faces the user`,
      `// Android XR: update rotation in frame callback to face camera`,
      `SpatialPanel(SubspaceModifier.width(400f).height(300f)) {`,
      `    // ${varName} billboard UI content`,
      `}`,
      `${varName}.addComponent(BillboardComponent(BillboardMode.BILLBOARD_ALL_AXES))`,
    ],
  },

  ui_docked: {
    trait: 'ui_docked',
    components: ['PanelEntity'],
    level: 'full',
    imports: ['androidx.xr.compose.spatial.Orbiter', 'androidx.xr.compose.spatial.OrbiterEdge'],
    generate: (varName, config) => {
      const position = String(config.position || 'bottom');
      const edgeMap: Record<string, string> = {
        bottom: 'OrbiterEdge.Bottom',
        top: 'OrbiterEdge.Top',
        leading: 'OrbiterEdge.Start',
        trailing: 'OrbiterEdge.End',
      };
      return [
        `// @ui_docked -- Orbiter docked to panel edge`,
        `Orbiter(position = ${edgeMap[position] || 'OrbiterEdge.Bottom'}, offset = 96.dp) {`,
        `    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {`,
        `        // ${varName} docked controls`,
        `    }`,
        `}`,
      ];
    },
  },
};

// =============================================================================
// ENVIRONMENT / IMMERSIVE TRAITS
// =============================================================================

export const ENVIRONMENT_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  occlusion_mesh: {
    trait: 'occlusion_mesh',
    components: [],
    level: 'full',
    imports: ['com.google.ar.core.Config', 'androidx.xr.scenegraph.PerceptionSpace'],
    generate: (varName) => [
      `// Activate strictly if depth API is physically supported on-device`,
      `if (xrSession.isDepthSupported) {`,
      `    xrSession.scene.configure { config -> config.depthMode = Config.DepthMode.AUTOMATIC }`,
      `    ${varName}.enableDepthOcclusion(true)`,
      `}`,
    ],
  },

  environment_probe: {
    trait: 'environment_probe',
    components: [],
    level: 'full',
    generate: (varName) => [
      `// Attach HDR environmental projection to scene root`,
      `val ${varName}Probe = xrSession.scene.perceptionSpace.createEnvironmentProbe()`,
      `sceneRoot.addComponent(${varName}Probe)`,
    ],
  },

  portal: {
    trait: 'portal',
    components: ['GltfModelEntity'],
    level: 'full',
    imports: [
      'com.google.android.filament.MaterialInstance',
      'com.google.android.filament.RenderableManager',
    ],
    generate: (varName, config) => {
      const targetWorld = String(config.target_world || 'portalWorld');
      const radius = config.radius ?? 1.0;
      return [
        `// @portal -- stencil-based portal to ${targetWorld}`,
        `// radius: ${radius}m`,
        `// Portal rendering technique:`,
        `// 1. Render portal frame geometry with stencil write (ref=1)`,
        `// 2. Render destination scene only where stencil == 1`,
        `// 3. Clear stencil; render normal scene`,
        `val ${varName}PortalMaterial = engine.createMaterial(portalStencilMaterialData)`,
        `val ${varName}PortalInstance = ${varName}PortalMaterial.createInstance()`,
        `${varName}PortalInstance.setParameter("portalRadius", ${radius}f)`,
        `// Load destination environment`,
        `val ${varName}DestEnv = GltfModel.create(session, Paths.get("${targetWorld}.glb"))`,
        `val ${varName}DestEntity = GltfModelEntity.create(session, ${varName}DestEnv)`,
        `${varName}DestEntity.setEnabled(false) // hidden until portal entered`,
        `// Transition: detect user crossing portal plane`,
        `xrSession.scene.addOnUpdateListener { _ ->`,
        `    val userPos = xrSession.scene.activitySpace.pose.translation`,
        `    val portalPos = ${varName}.pose.translation`,
        `    val dist = Vector3.distance(userPos, portalPos)`,
        `    if (dist < ${radius}f * 0.5f) {`,
        `        ${varName}DestEntity.setEnabled(true)`,
        `        // Transition to destination world`,
        `    }`,
        `}`,
      ];
    },
  },

  volume: {
    trait: 'volume',
    components: ['SpatialEnvironment'],
    level: 'full',
    imports: ['androidx.xr.compose.spatial.Subspace'],
    generate: (varName, config) => {
      const size = config.size || [0.6, 0.4, 0.4];
      const s = size as number[];
      return [
        `// @volume -- Subspace volumetric content container`,
        `// Size: ${s[0]}m x ${s[1]}m x ${s[2]}m`,
        `Subspace {`,
        `    // ${varName} volumetric content`,
        `    // Entities placed here are rendered in 3D space`,
        `}`,
      ];
    },
  },

  immersive: {
    trait: 'immersive',
    components: ['SpatialEnvironment'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.SpatialEnvironment',
      'androidx.xr.scenecore.GltfModel',
      'androidx.xr.scenecore.ExrImage',
    ],
    generate: (varName, config) => {
      const style = String(config.style || 'mixed');
      const lines = [`// @immersive -- SpatialEnvironment configuration (style: ${style})`];
      if (style === 'full') {
        lines.push(
          `val ${varName}Geometry = GltfModel.create(session, Paths.get("environment.glb"))`,
          `val ${varName}Skybox = ExrImage.createFromZip(session, Paths.get("skybox.zip"))`,
          `session.scene.spatialEnvironment.preferredSpatialEnvironment =`,
          `    SpatialEnvironment.SpatialEnvironmentPreference(${varName}Skybox, ${varName}Geometry)`,
          `session.scene.spatialEnvironment.setPassthroughOpacityPreference(0.0f)`
        );
      } else if (style === 'mixed') {
        lines.push(
          `// Mixed mode: passthrough with virtual overlay`,
          `session.scene.spatialEnvironment.setPassthroughOpacityPreference(0.5f)`
        );
      } else {
        lines.push(
          `// Passthrough mode`,
          `session.scene.spatialEnvironment.setPassthroughOpacityPreference(1.0f)`
        );
      }
      return lines;
    },
  },
};

// =============================================================================
// DP3 (DEVELOPER PREVIEW 3) TRAITS — New in Android XR SDK DP3
// =============================================================================

export const DP3_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  face_tracking: {
    trait: 'face_tracking',
    components: [],
    level: 'full',
    imports: [
      'androidx.xr.arcore.Face',
      'androidx.xr.arcore.FaceBlendShapeType',
      'androidx.xr.arcore.FaceConfidenceRegion',
      'androidx.xr.runtime.FaceTrackingMode',
    ],
    minSdkVersion: 30,
    generate: (varName, config) => {
      const blendshapes = (config.blendshapes as string[]) || [];
      const lines = [
        `// @face_tracking -- DP3: ARCore face tracking with 68 blendshapes`,
        `// android.permission.FACE_TRACKING required`,
        `val ${varName}FaceConfig = session.config.copy(`,
        `    faceTracking = FaceTrackingMode.BLEND_SHAPES`,
        `)`,
        `when (val result = session.configure(${varName}FaceConfig)) {`,
        `    is SessionConfigureSuccess -> { /* Face tracking enabled */ }`,
        `    else -> { /* Configuration failed */ }`,
        `}`,
        ``,
        `val ${varName}Face = Face.getUserFace(session)`,
        `${varName}Face?.state?.collect { faceState ->`,
        `    if (faceState.trackingState != TrackingState.TRACKING) return@collect`,
      ];
      if (blendshapes.length > 0) {
        for (const bs of blendshapes) {
          lines.push(
            `    val ${varName}_${bs.toLowerCase()} = faceState.blendShapes[FaceBlendShapeType.FACE_BLEND_SHAPE_TYPE_${bs.toUpperCase()}]`
          );
        }
      } else {
        lines.push(
          `    // 68 blendshapes available across 3 confidence regions:`,
          `    // Upper (18): BROW_LOWERER_L/R, EYES_CLOSED_L/R, EYES_LOOK_DOWN/LEFT/RIGHT/UP_L/R,`,
          `    //   INNER_BROW_RAISER_L/R, LID_TIGHTENER_L/R, OUTER_BROW_RAISER_L/R, UPPER_LID_RAISER_L/R`,
          `    // Lower (50): CHEEK_PUFF/RAISER/SUCK_L/R, CHIN_RAISER_B/T, DIMPLER_L/R,`,
          `    //   JAW_DROP/SIDEWAYS_LEFT/RIGHT/THRUST, LIP_CORNER_DEPRESSOR/PULLER_L/R,`,
          `    //   LIP_FUNNELER/PRESSOR/PUCKER/STRETCHER/SUCK/TIGHTENER_L/R, LIPS_TOWARD,`,
          `    //   LOWER_LIP_DEPRESSOR_L/R, MOUTH_LEFT/RIGHT, NOSE_WRINKLER_L/R,`,
          `    //   UPPER_LIP_RAISER_L/R, TONGUE_OUT/LEFT/RIGHT/UP/DOWN`,
          `    val jawDrop = faceState.blendShapes[FaceBlendShapeType.FACE_BLEND_SHAPE_TYPE_JAW_DROP]`,
          `    val confidence = faceState.getConfidence(FaceConfidenceRegion.FACE_CONFIDENCE_REGION_LOWER)`
        );
      }
      lines.push(`}`);
      return lines;
    },
  },

  follows_head: {
    trait: 'follows_head',
    components: ['PanelEntity'],
    level: 'full',
    imports: [
      'androidx.xr.compose.spatial.UserSubspace',
      'androidx.xr.compose.spatial.SpatialPanel',
      'androidx.xr.compose.subspace.layout.SubspaceModifier',
    ],
    generate: (varName, config) => {
      const distance = config.distance ?? config.follow_distance ?? 1.5;
      const width = config.width ?? 400;
      const height = config.height ?? 300;
      return [
        `// @follows_head -- DP3: UserSubspace with soft-locking follow behavior`,
        `// android.permission.HEAD_TRACKING required`,
        `// Content follows user's head at ${distance}m (soft-locking)`,
        `UserSubspace {`,
        `    SpatialPanel(SubspaceModifier.width(${width}f).height(${height}f)) {`,
        `        Column(modifier = Modifier.fillMaxSize()) {`,
        `            Text("${varName}")`,
        `        }`,
        `    }`,
        `}`,
      ];
    },
  },

  head_follow: {
    trait: 'head_follow',
    components: ['PanelEntity'],
    level: 'full',
    imports: [
      'androidx.xr.compose.spatial.UserSubspace',
      'androidx.xr.compose.spatial.SpatialPanel',
      'androidx.xr.compose.subspace.layout.SubspaceModifier',
    ],
    generate: (varName, config) => {
      const distance = config.distance ?? config.follow_distance ?? 1.5;
      const width = config.width ?? 400;
      const height = config.height ?? 300;
      return [
        `// @head_follow -- DP3: UserSubspace with soft-locking follow behavior`,
        `// android.permission.HEAD_TRACKING required`,
        `// Content follows user's head at ${distance}m (soft-locking)`,
        `UserSubspace {`,
        `    SpatialPanel(SubspaceModifier.width(${width}f).height(${height}f)) {`,
        `        Column(modifier = Modifier.fillMaxSize()) {`,
        `            Text("${varName}")`,
        `        }`,
        `    }`,
        `}`,
      ];
    },
  },

  drm_video: {
    trait: 'drm_video',
    components: ['SurfaceEntity'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.SurfaceEntity',
      'androidx.media3.exoplayer.ExoPlayer',
      'androidx.media3.common.MediaItem',
      'androidx.media3.common.C',
    ],
    minSdkVersion: 30,
    generate: (varName, config) => {
      const videoUri = config.uri ?? config.src ?? '';
      const licenseUri = config.license_uri ?? config.drm_license ?? '';
      const stereoMode = String(config.stereo_mode || 'SIDE_BY_SIDE');
      const shape = String(config.shape || 'quad');
      const width = config.width ?? 1.0;
      const height = config.height ?? 1.0;
      const radius = config.radius ?? 5.0;

      const stereoModeMap: Record<string, string> = {
        SIDE_BY_SIDE: 'SurfaceEntity.StereoMode.SIDE_BY_SIDE',
        TOP_BOTTOM: 'SurfaceEntity.StereoMode.TOP_BOTTOM',
        MONO: 'SurfaceEntity.StereoMode.MONO',
        MULTIVIEW_LEFT: 'SurfaceEntity.StereoMode.MULTIVIEW_LEFT_PRIMARY',
        MULTIVIEW_RIGHT: 'SurfaceEntity.StereoMode.MULTIVIEW_RIGHT_PRIMARY',
      };
      const stereoKotlin = stereoModeMap[stereoMode] ?? 'SurfaceEntity.StereoMode.SIDE_BY_SIDE';

      let shapeCode: string;
      if (shape === 'sphere') {
        shapeCode = `SurfaceEntity.Shape.Sphere(${radius}f)`;
      } else if (shape === 'hemisphere') {
        shapeCode = `SurfaceEntity.Shape.Hemisphere(${radius}f)`;
      } else {
        shapeCode = `SurfaceEntity.Shape.Quad(FloatSize2d(${width}f, ${height}f))`;
      }

      const lines = [
        `// @drm_video -- DP3: SurfaceEntity with Widevine DRM protection`,
        `// Shape: ${shape}, StereoMode: ${stereoMode}`,
        `val ${varName}Surface = SurfaceEntity.create(`,
        `    session = session,`,
        `    stereoMode = ${stereoKotlin},`,
        `    pose = Pose(Vector3(0f, 0f, -1.5f), Quaternion.identity()),`,
        `    shape = ${shapeCode},`,
        `    surfaceProtection = SurfaceEntity.SurfaceProtection.PROTECTED`,
        `)`,
      ];

      if (videoUri) {
        lines.push(
          ``,
          `val ${varName}MediaItem = MediaItem.Builder()`,
          `    .setUri("${videoUri}")`
        );
        if (licenseUri) {
          lines.push(
            `    .setDrmConfiguration(`,
            `        MediaItem.DrmConfiguration.Builder(C.WIDEVINE_UUID)`,
            `            .setLicenseUri("${licenseUri}")`,
            `            .build()`,
            `    )`
          );
        }
        lines.push(
          `    .build()`,
          ``,
          `val ${varName}Player = ExoPlayer.Builder(context).build()`,
          `${varName}Player.setVideoSurface(${varName}Surface.getSurface())`,
          `${varName}Player.setMediaItem(${varName}MediaItem)`,
          `${varName}Player.prepare()`,
          `${varName}Player.play()`
        );
      }

      return lines;
    },
  },

  protected_video: {
    trait: 'protected_video',
    components: ['SurfaceEntity'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.SurfaceEntity',
      'androidx.media3.exoplayer.ExoPlayer',
      'androidx.media3.common.MediaItem',
      'androidx.media3.common.C',
    ],
    minSdkVersion: 30,
    generate: (varName, config) => {
      // Delegates to the same implementation as drm_video
      const videoUri = config.uri ?? config.src ?? '';
      const shape = String(config.shape || 'quad');
      const width = config.width ?? 1.0;
      const height = config.height ?? 1.0;
      const radius = config.radius ?? 5.0;

      let shapeCode: string;
      if (shape === 'sphere') {
        shapeCode = `SurfaceEntity.Shape.Sphere(${radius}f)`;
      } else if (shape === 'hemisphere') {
        shapeCode = `SurfaceEntity.Shape.Hemisphere(${radius}f)`;
      } else {
        shapeCode = `SurfaceEntity.Shape.Quad(FloatSize2d(${width}f, ${height}f))`;
      }

      return [
        `// @protected_video -- DP3: SurfaceEntity with DRM surface protection`,
        `val ${varName}Surface = SurfaceEntity.create(`,
        `    session = session,`,
        `    stereoMode = SurfaceEntity.StereoMode.SIDE_BY_SIDE,`,
        `    pose = Pose.Identity,`,
        `    shape = ${shapeCode},`,
        `    surfaceProtection = SurfaceEntity.SurfaceProtection.PROTECTED`,
        `)`,
        ...(videoUri
          ? [
              `val ${varName}Player = ExoPlayer.Builder(context).build()`,
              `${varName}Player.setVideoSurface(${varName}Surface.getSurface())`,
              `${varName}Player.setMediaItem(MediaItem.fromUri("${videoUri}"))`,
              `${varName}Player.prepare()`,
              `${varName}Player.play()`,
            ]
          : []),
      ];
    },
  },

  scene_core_entity: {
    trait: 'scene_core_entity',
    components: ['GltfModelEntity'],
    level: 'full',
    imports: [
      'androidx.xr.compose.spatial.SceneCoreEntity',
      'androidx.xr.scenecore.GltfModel',
      'androidx.xr.scenecore.GltfModelEntity',
    ],
    generate: (varName, config) => {
      const modelUri = String(config.model ?? config.src ?? `${varName}.glb`);
      return [
        `// @scene_core_entity -- DP3: SceneCoreEntity composable for 3D model placement`,
        `SceneCoreEntity(`,
        `    factory = {`,
        `        val ${varName}Model = GltfModel.create(session, Uri.parse("${modelUri}"))`,
        `        GltfModelEntity.create(session, ${varName}Model)`,
        `    },`,
        `    update = { entity ->`,
        `        // Apply compose state changes to the entity`,
        `    }`,
        `) {`,
        `    // Child content within the SceneCoreEntity`,
        `}`,
      ];
    },
  },
};

// =============================================================================
// V43 AI/XR TRAIT MAP
// =============================================================================

export const GLASSES_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  glimmer_card: {
    trait: 'glimmer_card',
    components: ['PanelEntity'],
    level: 'full',
    imports: ['androidx.xr.glimmer.Card', 'androidx.xr.glimmer.Text', 'androidx.xr.glimmer.Button'],
    generate: (varName, config) => {
      const title = String(config.title || varName);
      const subtitle = String(config.subtitle || '');
      const actionLabel = String(config.action_label || 'View');
      return [
        `// @glimmer_card -- AI Glasses Glimmer Card composable`,
        `Card(`,
        `    title = { Text("${title}") },`,
        `    action = {`,
        `        Button(onClick = { /* ${varName} action */ }) {`,
        `            Text("${actionLabel}")`,
        `        }`,
        `    }`,
        `) {`,
        ...(subtitle ? [`    Text("${subtitle}")`] : [`    // ${varName} card content`]),
        `}`,
      ];
    },
  },

  glimmer_list: {
    trait: 'glimmer_list',
    components: ['PanelEntity'],
    level: 'full',
    imports: ['androidx.xr.glimmer.ListItem', 'androidx.xr.glimmer.Text'],
    generate: (varName, config) => {
      const items = (config.items as string[]) ?? [];
      const lines = [`// @glimmer_list -- AI Glasses Glimmer List composable`, `Column {`];
      if (items.length > 0) {
        for (const item of items) {
          lines.push(`    ListItem(headlineContent = { Text("${item}") })`);
        }
      } else {
        lines.push(`    ListItem(headlineContent = { Text("${varName}") })`);
      }
      lines.push(`}`);
      return lines;
    },
  },

  glimmer_title_chip: {
    trait: 'glimmer_title_chip',
    components: ['PanelEntity'],
    level: 'full',
    imports: ['androidx.xr.glimmer.TitleChip'],
    generate: (varName, config) => {
      const title = String(config.title || varName);
      return [
        `// @glimmer_title_chip -- AI Glasses Glimmer TitleChip`,
        `TitleChip(title = "${title}")`,
      ];
    },
  },

  projected_camera: {
    trait: 'projected_camera',
    components: [],
    level: 'full',
    imports: [
      'androidx.xr.projected.ProjectedContext',
      'androidx.camera.lifecycle.ProcessCameraProvider',
      'androidx.camera.core.CameraSelector',
      'androidx.camera.core.ImageCapture',
    ],
    generate: (varName, config) => {
      const resolution = String(config.resolution || '1920x1080');
      const fps = config.fps ?? 30;
      return [
        `// @projected_camera -- AI Glasses camera via ProjectedContext`,
        `// Resolution: ${resolution}, FPS: ${fps}`,
        `val ${varName}GlassesContext = ProjectedContext.createProjectedDeviceContext(this)`,
        `val ${varName}CameraFuture = ProcessCameraProvider.getInstance(${varName}GlassesContext)`,
        `${varName}CameraFuture.addListener({`,
        `    val cameraProvider = ${varName}CameraFuture.get()`,
        `    val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA`,
        `    if (cameraProvider.hasCamera(cameraSelector)) {`,
        `        val imageCapture = ImageCapture.Builder().build()`,
        `        cameraProvider.bindToLifecycle(this, cameraSelector, imageCapture)`,
        `    }`,
        `}, ContextCompat.getMainExecutor(this))`,
      ];
    },
  },

  projected_audio: {
    trait: 'projected_audio',
    components: [],
    level: 'full',
    imports: ['androidx.xr.projected.ProjectedContext'],
    generate: (varName) => [
      `// @projected_audio -- AI Glasses audio via Bluetooth A2DP/HFP`,
      `// Glasses connect as standard Bluetooth audio device`,
      `// Audio routing handled automatically via Android AudioManager`,
      `val ${varName}GlassesContext = ProjectedContext.createProjectedDeviceContext(this)`,
      `// Use ${varName}GlassesContext for glasses speaker output`,
    ],
  },

  glasses_display: {
    trait: 'glasses_display',
    components: [],
    level: 'full',
    imports: [
      'androidx.xr.projected.ProjectedDisplayController',
      'androidx.xr.projected.ProjectedDeviceController',
    ],
    generate: (varName, config) => {
      const brightness = config.brightness ?? 1.0;
      return [
        `// @glasses_display -- AI Glasses display control via ProjectedDisplayController`,
        `val ${varName}DisplayController = ProjectedDisplayController.create(this)`,
        `// Brightness: ${brightness}`,
        `lifecycleScope.launch {`,
        `    val controller = ProjectedDeviceController.create(this@${varName})`,
        `    val hasVisualUI = controller.capabilities.contains(`,
        `        ProjectedDeviceController.CAPABILITY_VISUAL_UI`,
        `    )`,
        `    if (hasVisualUI) {`,
        `        // Display is available, show AR overlay`,
        `    }`,
        `}`,
      ];
    },
  },

  glasses_touchpad: {
    trait: 'glasses_touchpad',
    components: ['InteractableComponent'],
    level: 'full',
    imports: ['androidx.xr.glimmer.surface'],
    generate: (varName) => [
      `// @glasses_touchpad -- AI Glasses touchpad input handling`,
      `// Touchpad gestures: tap, swipe, long-press`,
      `// Glimmer components have built-in touchpad focus/interaction support`,
      `// Apply .surface(focusable = true) for touchpad-focusable elements`,
      `Modifier.surface(focusable = true) // enables touchpad focus for ${varName}`,
    ],
  },

  glasses_voice: {
    trait: 'glasses_voice',
    components: ['SpeechRecognizer'],
    level: 'full',
    imports: [
      'android.speech.SpeechRecognizer',
      'android.speech.RecognitionListener',
      'android.speech.RecognizerIntent',
      'android.content.Intent',
      'android.os.Bundle',
    ],
    generate: (varName, config) => {
      const commands = (config.commands as string[]) ?? [];
      const wakeWord = String(config.wake_word || 'Hey Google');
      return [
        `// @glasses_voice -- AI Glasses voice input (AndroidXR)`,
        `// Wake word: "${wakeWord}"`,
        `// Voice commands available: ${commands.length > 0 ? commands.join(', ') : 'system default'}`,
        `// Uses Android SpeechRecognizer with XR glasses microphone`,
        `val ${varName}Recognizer = SpeechRecognizer.createSpeechRecognizer(this)`,
        `val ${varName}Intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {`,
        `    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)`,
        `    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)`,
        `}`,
        `${varName}Recognizer.setRecognitionListener(object : RecognitionListener {`,
        `    override fun onResults(results: Bundle?) {`,
        `        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)`,
        `        val command = matches?.firstOrNull()?.lowercase() ?: return`,
        ...(commands.length > 0
          ? [
              `        when {`,
              ...commands.map(
                (cmd) =>
                  `            command.contains("${cmd.toLowerCase()}") -> { /* handle "${cmd}" */ }`
              ),
              `            else -> { /* unrecognized command */ }`,
              `        }`,
            ]
          : [`        // Process voice command: $command`]),
        `    }`,
        `    override fun onPartialResults(partialResults: Bundle?) {}`,
        `    override fun onError(error: Int) {}`,
        `    override fun onReadyForSpeech(params: Bundle?) {}`,
        `    override fun onBeginningOfSpeech() {}`,
        `    override fun onRmsChanged(rmsdB: Float) {}`,
        `    override fun onBufferReceived(buffer: ByteArray?) {}`,
        `    override fun onEndOfSpeech() {}`,
        `    override fun onEvent(eventType: Int, params: Bundle?) {}`,
        `})`,
      ];
    },
  },
};

// =============================================================================
// MULTIPLAYER TRAITS
// =============================================================================

export const MULTIPLAYER_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  state_sync: {
    trait: 'state_sync',
    components: [],
    level: 'full',
    imports: [
      'com.google.android.gms.nearby.Nearby',
      'com.google.android.gms.nearby.connection.ConnectionsClient',
      'com.google.android.gms.nearby.connection.Strategy',
    ],
    generate: (varName, config) => {
      const strategy = String(config.strategy || 'P2P_STAR');
      const syncRate = config.sync_rate ?? 20;
      return [
        `// @state_sync -- multiplayer state synchronization (${strategy})`,
        `// sync rate: ${syncRate}Hz`,
        `val ${varName}ConnectionsClient = Nearby.getConnectionsClient(context)`,
        `val ${varName}SyncState = mutableMapOf<String, Any>()`,
        `val ${varName}Strategy = Strategy.${strategy}`,
        `// Advertise presence for peer discovery`,
        `${varName}ConnectionsClient.startAdvertising(`,
        `    "${varName}",`,
        `    "com.holoscript.mp",`,
        `    connectionLifecycleCallback,`,
        `    AdvertisingOptions.Builder().setStrategy(${varName}Strategy).build()`,
        `)`,
        `// Sync loop: serialize entity state at ${syncRate}Hz`,
        `val ${varName}SyncJob = CoroutineScope(Dispatchers.Default).launch {`,
        `    while (isActive) {`,
        `        val pose = ${varName}.pose`,
        `        val stateBytes = encodeState(pose.translation, pose.rotation)`,
        `        for (endpoint in connectedEndpoints) {`,
        `            ${varName}ConnectionsClient.sendPayload(endpoint, Payload.fromBytes(stateBytes))`,
        `        }`,
        `        delay(${Math.round(1000 / (syncRate as number))}L)`,
        `    }`,
        `}`,
      ];
    },
  },

  voice_chat: {
    trait: 'voice_chat',
    components: ['SpatialSoundPool', 'PointSourceParams'],
    level: 'full',
    imports: [
      'android.media.AudioRecord',
      'android.media.AudioFormat',
      'android.media.AudioTrack',
      'androidx.xr.scenecore.SpatialSoundPool',
      'androidx.xr.scenecore.PointSourceParams',
    ],
    generate: (varName, config) => {
      const spatial = config.spatial ?? true;
      const codec = String(config.codec || 'OPUS');
      const sampleRate = config.sample_rate ?? 48000;
      return [
        `// @voice_chat -- spatial voice chat (${codec}, ${sampleRate}Hz)`,
        `// android.permission.RECORD_AUDIO required`,
        `val ${varName}SampleRate = ${sampleRate}`,
        `val ${varName}BufferSize = AudioRecord.getMinBufferSize(`,
        `    ${varName}SampleRate,`,
        `    AudioFormat.CHANNEL_IN_MONO,`,
        `    AudioFormat.ENCODING_PCM_16BIT`,
        `)`,
        `val ${varName}AudioRecord = AudioRecord(`,
        `    MediaRecorder.AudioSource.VOICE_COMMUNICATION,`,
        `    ${varName}SampleRate,`,
        `    AudioFormat.CHANNEL_IN_MONO,`,
        `    AudioFormat.ENCODING_PCM_16BIT,`,
        `    ${varName}BufferSize`,
        `)`,
        `// Encode with ${codec} codec, transmit to peers`,
        `val ${varName}CaptureJob = CoroutineScope(Dispatchers.IO).launch {`,
        `    ${varName}AudioRecord.startRecording()`,
        `    val buffer = ShortArray(${varName}BufferSize)`,
        `    while (isActive) {`,
        `        val read = ${varName}AudioRecord.read(buffer, 0, buffer.size)`,
        `        if (read > 0) {`,
        `            val encoded = ${codec.toLowerCase()}Encode(buffer, read)`,
        `            sendToAllPeers(encoded)`,
        `        }`,
        `    }`,
        `}`,
        ...(spatial
          ? [
              `// Spatialize incoming voice at peer's 3D position`,
              `val ${varName}VoiceSource = PointSourceParams(${varName})`,
            ]
          : []),
      ];
    },
  },

  lobby: {
    trait: 'lobby',
    components: [],
    level: 'full',
    imports: [
      'com.google.android.gms.nearby.Nearby',
      'com.google.android.gms.nearby.connection.Strategy',
    ],
    generate: (varName, config) => {
      const maxPlayers = config.max_players ?? 8;
      const autoStart = config.auto_start ?? true;
      return [
        `// @lobby -- multiplayer lobby (max: ${maxPlayers} players)`,
        `data class ${varName}Player(val endpointId: String, val name: String, var ready: Boolean = false)`,
        `val ${varName}Players = mutableListOf<${varName}Player>()`,
        `val ${varName}MaxPlayers = ${maxPlayers}`,
        `val ${varName}IsHost = mutableStateOf(false)`,
        ``,
        `fun ${varName}HostLobby() {`,
        `    ${varName}IsHost.value = true`,
        `    Nearby.getConnectionsClient(context).startAdvertising(`,
        `        playerName,`,
        `        "com.holoscript.lobby",`,
        `        object : ConnectionLifecycleCallback() {`,
        `            override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {`,
        `                if (${varName}Players.size < ${varName}MaxPlayers) {`,
        `                    Nearby.getConnectionsClient(context).acceptConnection(endpointId, payloadCallback)`,
        `                }`,
        `            }`,
        `            override fun onConnectionResult(endpointId: String, result: ConnectionResolution) {`,
        `                if (result.status.isSuccess) {`,
        `                    ${varName}Players.add(${varName}Player(endpointId, "Player"))`,
        `                }`,
        `            }`,
        `            override fun onDisconnected(endpointId: String) {`,
        `                ${varName}Players.removeAll { it.endpointId == endpointId }`,
        `            }`,
        `        },`,
        `        AdvertisingOptions.Builder().setStrategy(Strategy.P2P_STAR).build()`,
        `    )`,
        `}`,
        ...(autoStart
          ? [
              `// Auto-start when all players ready`,
              `fun ${varName}CheckReady() {`,
              `    if (${varName}Players.all { it.ready }) { ${varName}StartGame() }`,
              `}`,
            ]
          : []),
      ];
    },
  },

  networked_physics: {
    trait: 'networked_physics',
    components: ['PhysicsComponent'],
    level: 'full',
    imports: ['com.google.android.gms.nearby.connection.Payload'],
    generate: (varName, config) => {
      const authoritative = String(config.authority || 'host');
      const interpolation = config.interpolation ?? true;
      return [
        `// @networked_physics -- network-synchronized physics (authority: ${authoritative})`,
        `data class ${varName}PhysicsState(`,
        `    val position: Vector3,`,
        `    val rotation: Quaternion,`,
        `    val velocity: Vector3,`,
        `    val angularVelocity: Vector3,`,
        `    val timestamp: Long`,
        `)`,
        `var ${varName}LastReceivedState: ${varName}PhysicsState? = null`,
        ``,
        `// Authority model: ${authoritative} runs simulation, clients interpolate`,
        `fun ${varName}SendPhysicsState() {`,
        `    val state = ${varName}PhysicsState(`,
        `        ${varName}.pose.translation,`,
        `        ${varName}.pose.rotation,`,
        `        ${varName}Physics.velocity,`,
        `        ${varName}Physics.angularVelocity,`,
        `        System.currentTimeMillis()`,
        `    )`,
        `    broadcastState(state.toByteArray())`,
        `}`,
        ...(interpolation
          ? [
              `// Client-side interpolation between received states`,
              `fun ${varName}InterpolateState(alpha: Float) {`,
              `    val prev = ${varName}LastReceivedState ?: return`,
              `    ${varName}.setPose(Pose(`,
              `        Vector3.lerp(${varName}.pose.translation, prev.position, alpha),`,
              `        Quaternion.slerp(${varName}.pose.rotation, prev.rotation, alpha)`,
              `    ))`,
              `}`,
            ]
          : []),
      ];
    },
  },

  networked_transform: {
    trait: 'networked_transform',
    components: [],
    level: 'full',
    imports: ['com.google.android.gms.nearby.connection.Payload'],
    generate: (varName, config) => {
      const syncRate = config.sync_rate ?? 15;
      const deadzone = config.deadzone ?? 0.01;
      return [
        `// @networked_transform -- network-synced transform (${syncRate}Hz)`,
        `// deadzone: ${deadzone} (skip updates below threshold)`,
        `var ${varName}LastSyncedPose = ${varName}.pose`,
        `val ${varName}TransformSyncJob = CoroutineScope(Dispatchers.Default).launch {`,
        `    while (isActive) {`,
        `        val currentPose = ${varName}.pose`,
        `        val posDelta = Vector3.distance(currentPose.translation, ${varName}LastSyncedPose.translation)`,
        `        if (posDelta > ${deadzone}f) {`,
        `            val bytes = encodePose(currentPose.translation, currentPose.rotation)`,
        `            broadcastPayload(Payload.fromBytes(bytes))`,
        `            ${varName}LastSyncedPose = currentPose`,
        `        }`,
        `        delay(${Math.round(1000 / (syncRate as number))}L)`,
        `    }`,
        `}`,
      ];
    },
  },

  spectator_mode: {
    trait: 'spectator_mode',
    components: [],
    level: 'full',
    generate: (varName, config) => {
      const freeCam = config.free_camera ?? true;
      return [
        `// @spectator_mode -- spectator/observer mode`,
        `val ${varName}IsSpectator = mutableStateOf(false)`,
        `fun ${varName}EnterSpectatorMode() {`,
        `    ${varName}IsSpectator.value = true`,
        `    // Disable physics interactions`,
        `    ${varName}.getComponent<InteractableComponent>()?.let { ${varName}.removeComponent(it) }`,
        `    ${varName}.getComponent<MovableComponent>()?.let { ${varName}.removeComponent(it) }`,
        ...(freeCam
          ? [
              `    // Free camera: detach from player entity`,
              `    // Allow camera orbit via hand/controller input`,
            ]
          : []),
        `}`,
        `fun ${varName}ExitSpectatorMode() {`,
        `    ${varName}IsSpectator.value = false`,
        `    // Re-enable interactions`,
        `}`,
      ];
    },
  },

  shared_anchor: {
    trait: 'shared_anchor',
    components: ['AnchorEntity'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.AnchorEntity',
      'com.google.ar.core.Anchor',
      'com.google.android.gms.nearby.connection.Payload',
    ],
    generate: (varName, config) => {
      const persistent = config.persistent ?? true;
      return [
        `// @shared_anchor -- shared spatial anchor across devices`,
        `val ${varName}AnchorResult = Anchor.create(session, ${varName}.pose)`,
        `when (${varName}AnchorResult) {`,
        `    is AnchorCreateSuccess -> {`,
        `        val anchor = ${varName}AnchorResult.anchor`,
        ...(persistent
          ? [
              `        // Persist for cross-session sharing`,
              `        val uuid = anchor.persist()`,
              `        // Share anchor UUID with all connected peers`,
              `        broadcastPayload(Payload.fromBytes(uuid.toByteArray()))`,
            ]
          : []),
        `        val ${varName}SharedAnchor = AnchorEntity.create(session, anchor)`,
        `        ${varName}SharedAnchor.parent = session.scene.activitySpace`,
        `        ${varName}SharedAnchor.addChild(${varName})`,
        `    }`,
        `}`,
        `// Receiving peer: Anchor.load(session, receivedUuid)`,
      ];
    },
  },
};

// =============================================================================
// AI / NPC TRAITS
// =============================================================================

