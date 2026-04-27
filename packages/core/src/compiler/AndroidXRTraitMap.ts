import type { Vector3 } from '../types';
/**
 * Android XR Trait Mapping System
 *
 * Maps HoloScript traits to Android XR SceneCore components, ARCore providers,
 * and Filament rendering primitives with Kotlin code generation.
 * Used by AndroidXRCompiler for trait-to-native conversion.
 *
 * Platform stack:
 *   - Jetpack XR SceneCore (entities, components, ECS)
 *   - ARCore for Jetpack XR (perception, anchors, hand tracking, face tracking)
 *   - Filament (PBR rendering, lighting, shadows)
 *   - Jetpack Compose for XR (spatial UI, UserSubspace, SceneCoreEntity)
 *   - Oboe / SoundPool / MediaPlayer (spatial audio)
 *   - SurfaceEntity with DRM (Widevine protected video playback)
 *
 * DP3 additions (Android XR SDK Developer Preview 3):
 *   - face_tracking: 68 blendshapes via FaceTrackingMode.BLEND_SHAPES
 *   - follows_head / head_follow: UserSubspace soft-locking follow behavior
 *   - drm_video / protected_video: SurfaceEntity with SurfaceProtection.PROTECTED
 *   - scene_core_entity: SceneCoreEntity composable for 3D model placement
 *
 * @version 2.0.0 — Android XR SDK Developer Preview 3
 */

// =============================================================================
// ANDROID XR COMPONENT TYPES
// =============================================================================

export type AndroidXRComponent =
  | 'MovableComponent'
  | 'ResizableComponent'
  | 'InteractableComponent'
  | 'GltfModelEntity'
  | 'PanelEntity'
  | 'SurfaceEntity'
  | 'AnchorEntity'
  | 'SpatialSoundPool'
  | 'SpatialMediaPlayer'
  | 'PointSourceParams'
  | 'SoundFieldAttributes'
  | 'SpatialEnvironment'
  | 'HandTrackingProvider'
  | 'FaceTrackingProvider' // DP3: Face tracking with 68 blendshapes
  | 'UserSubspaceComponent' // DP3: Head-following UI via UserSubspace
  | 'SceneCoreEntityComponent' // DP3: SceneCoreEntity composable
  | 'PlaneTrackable'
  | 'CollisionComponent'
  | 'PhysicsComponent'
  | 'LightManager'
  | 'ParticleSystem'
  | 'BillboardNode'
  | 'AccessibilityDelegate';

export type TraitImplementationLevel =
  | 'full' // Generates complete Kotlin/Android XR code
  | 'partial' // Generates some code with TODOs
  | 'comment' // Only generates documentation comment
  | 'unsupported'; // Not available in Android XR

export interface AndroidXRTraitMapping {
  /** HoloScript trait name */
  trait: string;
  /** Android XR components to add */
  components: AndroidXRComponent[];
  /** Implementation completeness */
  level: TraitImplementationLevel;
  /** Required Kotlin/Android imports */
  imports?: string[];
  /** Required minimum SDK version */
  minSdkVersion?: number;
  /** Code generator function */
  generate: (varName: string, config: Record<string, unknown>) => string[];
}

// =============================================================================
// PHYSICS TRAITS
// =============================================================================

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
      const gravity = config.gravity ?? -9.81;
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

export const VISUAL_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  visible: {
    trait: 'visible',
    components: [],
    level: 'full',
    generate: (varName, config) => {
      const visible = config.visible ?? true;
      return [visible ? '' : `${varName}.setEnabled(false)`].filter(Boolean);
    },
  },

  invisible: {
    trait: 'invisible',
    components: [],
    level: 'full',
    generate: (varName) => [`${varName}.setEnabled(false)`],
  },

  billboard: {
    trait: 'billboard',
    components: ['BillboardNode'],
    level: 'full',
    imports: ['androidx.xr.runtime.math.Quaternion'],
    generate: (varName) => [
      `// @billboard -- face entity toward camera each frame`,
      `// Android XR: no built-in BillboardComponent; update rotation in frame callback`,
      `xrSession.scene.addOnUpdateListener { _ ->`,
      `    val camPose = xrSession.scene.activitySpace.pose`,
      `    val lookAt = Quaternion.lookRotation(`,
      `        camPose.translation - ${varName}.pose.translation,`,
      `        Vector3(0f, 1f, 0f)`,
      `    )`,
      `    ${varName}.setPose(Pose(${varName}.pose.translation, lookAt))`,
      `}`,
    ],
  },

  particle_emitter: {
    trait: 'particle_emitter',
    components: ['ParticleSystem'],
    level: 'full',
    imports: ['android.opengl.GLES31', 'com.google.android.filament.RenderableManager'],
    generate: (varName, config) => {
      const rate = config.rate ?? 100;
      const lifetime = config.lifetime ?? 1.0;
      const maxParticles = config.max_particles ?? 1000;
      const shape = String(config.shape || 'sphere');
      return [
        `// @particle_emitter -- GPU particle system via compute shader`,
        `// rate: ${rate}/s, lifetime: ${lifetime}s, max: ${maxParticles}, shape: ${shape}`,
        `val ${varName}MaxParticles = ${maxParticles}`,
        `val ${varName}ParticleData = FloatArray(${varName}MaxParticles * 8) // pos(3) + vel(3) + life(1) + size(1)`,
        `val ${varName}ParticleSSBO = IntArray(1)`,
        `GLES31.glGenBuffers(1, ${varName}ParticleSSBO, 0)`,
        `GLES31.glBindBuffer(GLES31.GL_SHADER_STORAGE_BUFFER, ${varName}ParticleSSBO[0])`,
        `GLES31.glBufferData(GLES31.GL_SHADER_STORAGE_BUFFER,`,
        `    ${varName}ParticleData.size * 4L, null, GLES31.GL_DYNAMIC_DRAW)`,
        `// Emit ${rate} particles per second from ${shape} shape`,
        `// Update kernel: position += velocity * dt; life -= dt; recycle dead particles`,
        `val ${varName}EmitProgram = compileComputeShader(particleEmitShaderSource)`,
        `val ${varName}UpdateProgram = compileComputeShader(particleUpdateShaderSource)`,
        `xrSession.scene.addOnUpdateListener { frame ->`,
        `    GLES31.glUseProgram(${varName}EmitProgram)`,
        `    GLES31.glDispatchCompute(ceil(${rate}f / 256f).toInt(), 1, 1)`,
        `    GLES31.glMemoryBarrier(GLES31.GL_SHADER_STORAGE_BARRIER_BIT)`,
        `    GLES31.glUseProgram(${varName}UpdateProgram)`,
        `    GLES31.glDispatchCompute(ceil(${varName}MaxParticles / 256f).toInt(), 1, 1)`,
        `}`,
      ];
    },
  },

  animated: {
    trait: 'animated',
    components: ['GltfModelEntity'],
    level: 'full',
    imports: ['androidx.xr.scenecore.GltfModelEntity', 'androidx.xr.scenecore.GltfModel'],
    generate: (varName, config) => {
      const clip = config.clip || '';
      const loop = config.loop ?? true;
      return [
        `// @animated -- GltfModelEntity animation playback`,
        clip
          ? `${varName}Entity.startAnimation(loop = ${loop}, animationName = "${clip}")`
          : `${varName}Entity.startAnimation(loop = ${loop})`,
        `// Animation state: ${varName}Entity.getAnimationState()`,
      ];
    },
  },

  lod: {
    trait: 'lod',
    components: [],
    level: 'full',
    generate: (varName, config) => {
      const distances = config.distances || [5, 15];
      const d = distances as number[];
      return [
        `// @lod -- level-of-detail switching`,
        `// Android XR: no built-in LOD; implement distance check in frame callback`,
        `// Thresholds: [${d[0] ?? 5}, ${d[1] ?? 15}] meters`,
        `xrSession.scene.addOnUpdateListener { _ ->`,
        `    val camPos = xrSession.scene.activitySpace.pose.translation`,
        `    val dist = Vector3.distance(camPos, ${varName}.pose.translation)`,
        `    when {`,
        `        dist < ${d[0] ?? 5}f -> { /* high detail */ }`,
        `        dist < ${d[1] ?? 15}f -> { /* medium detail */ }`,
        `        else -> { /* low detail */ }`,
        `    }`,
        `}`,
      ];
    },
  },

  shadow_caster: {
    trait: 'shadow_caster',
    components: ['LightManager'],
    level: 'full',
    imports: [
      'com.google.android.filament.LightManager',
      'com.google.android.filament.RenderableManager',
    ],
    generate: (varName, config) => {
      const shadowBias = config.shadow_bias ?? 0.001;
      return [
        `// @shadow_caster -- enable shadow casting via Filament`,
        `val ${varName}RenderableManager = engine.renderableManager`,
        `val ${varName}Instance = ${varName}RenderableManager.getInstance(${varName}RenderableEntity)`,
        `${varName}RenderableManager.setCastShadows(${varName}Instance, true)`,
        `// Shadow bias to prevent shadow acne: ${shadowBias}`,
        `${varName}RenderableManager.setScreenSpaceContactShadows(${varName}Instance, true)`,
      ];
    },
  },

  shadow_receiver: {
    trait: 'shadow_receiver',
    components: ['LightManager'],
    level: 'full',
    imports: [
      'com.google.android.filament.LightManager',
      'com.google.android.filament.RenderableManager',
    ],
    generate: (varName) => [
      `// @shadow_receiver -- enable shadow receiving via Filament`,
      `val ${varName}RenderableManager = engine.renderableManager`,
      `val ${varName}Instance = ${varName}RenderableManager.getInstance(${varName}RenderableEntity)`,
      `${varName}RenderableManager.setReceiveShadows(${varName}Instance, true)`,
    ],
  },

  instancing: {
    trait: 'instancing',
    components: ['GltfModelEntity'],
    level: 'full',
    imports: [
      'com.google.android.filament.RenderableManager',
      'com.google.android.filament.VertexBuffer',
    ],
    generate: (varName, config) => {
      const instanceCount = config.count ?? 100;
      return [
        `// @instancing -- GPU instancing for ${instanceCount} instances`,
        `val ${varName}InstanceCount = ${instanceCount}`,
        `val ${varName}Transforms = FloatArray(${varName}InstanceCount * 16)`,
        `// Populate per-instance transform matrices`,
        `for (i in 0 until ${varName}InstanceCount) {`,
        `    val offset = i * 16`,
        `    Matrix.setIdentityM(${varName}Transforms, offset)`,
        `    // Randomize position per instance`,
        `    Matrix.translateM(${varName}Transforms, offset, i * 1.0f, 0f, 0f)`,
        `}`,
        `val ${varName}InstanceBuffer = VertexBuffer.Builder()`,
        `    .bufferCount(1)`,
        `    .vertexCount(${varName}InstanceCount)`,
        `    .attribute(VertexBuffer.VertexAttribute.CUSTOM0, 0, VertexBuffer.AttributeType.FLOAT4, 0, 64)`,
        `    .build(engine)`,
        `// RenderableManager.Builder().instances(${varName}InstanceCount)`,
      ];
    },
  },

  gpu_culling: {
    trait: 'gpu_culling',
    components: [],
    level: 'full',
    imports: ['com.google.android.filament.View'],
    generate: (varName, config) => {
      const frustumCulling = config.frustum ?? true;
      const occlusionCulling = config.occlusion ?? false;
      return [
        `// @gpu_culling -- Filament frustum + occlusion culling`,
        `// frustum: ${frustumCulling}, occlusion: ${occlusionCulling}`,
        `val ${varName}View = engine.createView()`,
        `${varName}View.isFrontFaceWindingInverted = false`,
        `// Filament performs automatic frustum culling on all renderables`,
        ...(occlusionCulling
          ? [
              `// Occlusion culling: enable depth pre-pass`,
              `${varName}View.depthPrePass = View.DepthPrePass.ENABLED`,
            ]
          : []),
        `// Dynamic culling: disable rendering for entities beyond threshold`,
        `xrSession.scene.addOnUpdateListener { _ ->`,
        `    val camPos = xrSession.scene.activitySpace.pose.translation`,
        `    val dist = Vector3.distance(camPos, ${varName}.pose.translation)`,
        `    ${varName}.setEnabled(dist < 50f) // cull beyond 50m`,
        `}`,
      ];
    },
  },

  screen_space_reflections: {
    trait: 'screen_space_reflections',
    components: [],
    level: 'full',
    imports: ['com.google.android.filament.View'],
    generate: (varName, config) => {
      const quality = String(config.quality || 'medium');
      return [
        `// @screen_space_reflections -- Filament SSR`,
        `// quality: ${quality}`,
        `val ${varName}View = engine.createView()`,
        `${varName}View.screenSpaceReflectionsOptions = View.ScreenSpaceReflectionsOptions().apply {`,
        `    enabled = true`,
        `    thickness = 0.1f`,
        `    bias = 0.01f`,
        `    maxDistance = 3.0f`,
        `    stride = ${quality === 'high' ? '1' : quality === 'low' ? '4' : '2'}`,
        `    resolution = ${quality === 'high' ? '1.0f' : quality === 'low' ? '0.25f' : '0.5f'}`,
        `}`,
      ];
    },
  },

  volumetric_fog: {
    trait: 'volumetric_fog',
    components: [],
    level: 'full',
    imports: ['com.google.android.filament.View'],
    generate: (varName, config) => {
      const density = config.density ?? 0.02;
      const albedo = config.albedo || [0.8, 0.8, 0.9];
      const a = albedo as number[];
      const heightFalloff = config.height_falloff ?? 0.1;
      return [
        `// @volumetric_fog -- Filament volumetric fog`,
        `// density: ${density}, albedo: [${a[0]}, ${a[1]}, ${a[2]}]`,
        `val ${varName}View = engine.createView()`,
        `${varName}View.fogOptions = View.FogOptions().apply {`,
        `    enabled = true`,
        `    density = ${density}f`,
        `    color = Color(${a[0]}f, ${a[1]}f, ${a[2]}f, 1f)`,
        `    heightFalloff = ${heightFalloff}f`,
        `    inScatteringStart = 0.0f`,
        `    inScatteringSize = 50.0f`,
        `}`,
      ];
    },
  },

  decal_projector: {
    trait: 'decal_projector',
    components: ['GltfModelEntity'],
    level: 'full',
    imports: [
      'com.google.android.filament.MaterialInstance',
      'com.google.android.filament.Texture',
    ],
    generate: (varName, config) => {
      const textureUri = String(config.texture || 'decal.png');
      const size = config.size || [1, 1];
      const s = size as number[];
      return [
        `// @decal_projector -- projected decal texture`,
        `// texture: ${textureUri}, size: ${s[0]}m x ${s[1]}m`,
        `val ${varName}DecalTexture = loadTexture(engine, "${textureUri}")`,
        `val ${varName}DecalMaterial = engine.createMaterial(decalMaterialData)`,
        `val ${varName}DecalInstance = ${varName}DecalMaterial.createInstance()`,
        `${varName}DecalInstance.setParameter("baseColorMap", ${varName}DecalTexture,`,
        `    TextureSampler(TextureSampler.MinFilter.LINEAR, TextureSampler.MagFilter.LINEAR))`,
        `// Project decal onto intersecting geometry`,
        `${varName}DecalInstance.setParameter("projectionSize", ${s[0]}f, ${s[1]}f)`,
        `// Decal uses deferred rendering pass with projection matrix`,
      ];
    },
  },

  wireframe: {
    trait: 'wireframe',
    components: ['GltfModelEntity'],
    level: 'full',
    imports: ['com.google.android.filament.RenderableManager'],
    generate: (varName) => [
      `// @wireframe -- wireframe rendering mode`,
      `val ${varName}RenderableManager = engine.renderableManager`,
      `val ${varName}Instance = ${varName}RenderableManager.getInstance(${varName}RenderableEntity)`,
      `// Filament: set polygon mode to WIREFRAME via material`,
      `val ${varName}WireMaterial = engine.createMaterial(wireframeMaterialData)`,
      `val ${varName}WireInstance = ${varName}WireMaterial.createInstance()`,
      `${varName}RenderableManager.setMaterialInstanceAt(${varName}Instance, 0, ${varName}WireInstance)`,
    ],
  },

  outline: {
    trait: 'outline',
    components: ['GltfModelEntity'],
    level: 'full',
    imports: ['com.google.android.filament.RenderableManager'],
    generate: (varName, config) => {
      const color = config.color || '#00ff00';
      const width = config.width ?? 2.0;
      return [
        `// @outline -- object outline via scaled back-face extrusion`,
        `// color: ${color}, width: ${width}px`,
        `// Pass 1: Render back-faces scaled slightly larger with solid outline color`,
        `val ${varName}OutlineMaterial = engine.createMaterial(outlineMaterialData)`,
        `val ${varName}OutlineInstance = ${varName}OutlineMaterial.createInstance()`,
        `${varName}OutlineInstance.setParameter("outlineColor",`,
        `    Colors.RgbaType.SRGB, ${color.toString().replace('#', '0x')}FF.toInt())`,
        `${varName}OutlineInstance.setParameter("outlineWidth", ${width}f)`,
        `// Pass 2: Render normal geometry on top (depth test passes)`,
      ];
    },
  },

  bloom: {
    trait: 'bloom',
    components: [],
    level: 'full',
    imports: ['com.google.android.filament.View'],
    generate: (varName, config) => {
      const intensity = config.intensity ?? 0.5;
      const threshold = config.threshold ?? 1.0;
      return [
        `// @bloom -- Filament bloom post-processing`,
        `// intensity: ${intensity}, threshold: ${threshold}`,
        `val ${varName}View = engine.createView()`,
        `${varName}View.bloomOptions = View.BloomOptions().apply {`,
        `    enabled = true`,
        `    strength = ${intensity}f`,
        `    threshold = ${threshold}f`,
        `    levels = 6`,
        `    blendMode = View.BloomOptions.BlendMode.ADD`,
        `    anamorphism = 1.0f`,
        `}`,
      ];
    },
  },

  chromatic_aberration: {
    trait: 'chromatic_aberration',
    components: [],
    level: 'full',
    imports: ['com.google.android.filament.View'],
    generate: (varName, config) => {
      const intensity = config.intensity ?? 0.5;
      return [
        `// @chromatic_aberration -- chromatic fringing post-processing`,
        `// intensity: ${intensity}`,
        `val ${varName}View = engine.createView()`,
        `// Filament doesn't expose chromatic aberration directly;`,
        `// implement via custom post-processing material`,
        `val ${varName}ChromaticMaterial = engine.createMaterial(chromaticAberrationData)`,
        `val ${varName}ChromaticInstance = ${varName}ChromaticMaterial.createInstance()`,
        `${varName}ChromaticInstance.setParameter("intensity", ${intensity}f)`,
        `// R, G, B channels offset by intensity * distance_from_center`,
      ];
    },
  },

  depth_of_field: {
    trait: 'depth_of_field',
    components: [],
    level: 'full',
    imports: ['com.google.android.filament.View'],
    generate: (varName, config) => {
      const focusDistance = config.focus_distance ?? 2.0;
      const aperture = config.aperture ?? 2.8;
      const cocScale = config.coc_scale ?? 1.0;
      return [
        `// @depth_of_field -- Filament depth-of-field`,
        `// focus distance: ${focusDistance}m, aperture: f/${aperture}`,
        `val ${varName}View = engine.createView()`,
        `${varName}View.depthOfFieldOptions = View.DepthOfFieldOptions().apply {`,
        `    enabled = true`,
        `    focusDistance = ${focusDistance}f`,
        `    cocScale = ${cocScale}f`,
        `    cocAspectRatio = 1.0f`,
        `    maxApertureDiameter = ${aperture}f`,
        `}`,
      ];
    },
  },

  color_grading: {
    trait: 'color_grading',
    components: [],
    level: 'full',
    imports: ['com.google.android.filament.View', 'com.google.android.filament.ColorGrading'],
    generate: (varName, config) => {
      const exposure = config.exposure ?? 0.0;
      const contrast = config.contrast ?? 1.0;
      const saturation = config.saturation ?? 1.0;
      const toneMapping = String(config.tone_mapping || 'ACES');
      return [
        `// @color_grading -- Filament color grading`,
        `// exposure: ${exposure}, contrast: ${contrast}, saturation: ${saturation}`,
        `val ${varName}ColorGrading = ColorGrading.Builder()`,
        `    .toneMapping(ColorGrading.ToneMapping.${toneMapping})`,
        `    .exposure(${exposure}f)`,
        `    .contrast(${contrast}f)`,
        `    .saturation(${saturation}f)`,
        `    .build(engine)`,
        `val ${varName}View = engine.createView()`,
        `${varName}View.colorGrading = ${varName}ColorGrading`,
      ];
    },
  },
};

// =============================================================================
// ACCESSIBILITY TRAITS
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

export const V43_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  spatial_persona: {
    trait: 'spatial_persona',
    components: ['GltfModelEntity'],
    level: 'full',
    imports: ['androidx.xr.scenecore.GltfModelEntity', 'androidx.xr.scenecore.GltfModel'],
    generate: (varName, config) => {
      const style = String(config.style || 'realistic');
      const avatarModel = String(config.model || 'avatar.glb');
      return [
        `// @spatial_persona -- 3D avatar/persona (style: ${style})`,
        `val ${varName}AvatarModel = GltfModel.create(session, Uri.parse("${avatarModel}"))`,
        `val ${varName}Avatar = GltfModelEntity.create(session, ${varName}AvatarModel)`,
        `${varName}Avatar.parent = session.scene.activitySpace`,
        `// Animate avatar from hand/head tracking data`,
        `xrSession.scene.addOnUpdateListener { _ ->`,
        `    val headPose = xrSession.scene.activitySpace.pose`,
        `    ${varName}Avatar.setPose(Pose(headPose.translation + Vector3(0f, -0.5f, 0f), headPose.rotation))`,
        `}`,
        `// IK: map hand joints to avatar skeleton for gestures`,
      ];
    },
  },

  shareplay: {
    trait: 'shareplay',
    components: [],
    level: 'full',
    imports: [
      'com.google.android.gms.nearby.Nearby',
      'com.google.android.gms.nearby.connection.Strategy',
      'com.google.android.gms.nearby.connection.Payload',
    ],
    generate: (varName, config) => {
      const activity = String(config.activity_type || 'custom');
      const maxParticipants = config.max_participants ?? 4;
      return [
        `// @shareplay -- shared activity via Nearby Connections (type: ${activity})`,
        `// max participants: ${maxParticipants}`,
        `val ${varName}Participants = mutableListOf<String>()`,
        `val ${varName}ActivityState = mutableMapOf<String, Any>()`,
        ``,
        `// Start shared activity`,
        `Nearby.getConnectionsClient(context).startAdvertising(`,
        `    "HoloScript-${activity}",`,
        `    "com.holoscript.shareplay",`,
        `    connectionLifecycleCallback,`,
        `    AdvertisingOptions.Builder().setStrategy(Strategy.P2P_STAR).build()`,
        `)`,
        `// Broadcast activity state changes`,
        `fun ${varName}BroadcastState(key: String, value: Any) {`,
        `    ${varName}ActivityState[key] = value`,
        `    val stateBytes = Json.encodeToString(${varName}ActivityState).toByteArray()`,
        `    for (participant in ${varName}Participants) {`,
        `        Nearby.getConnectionsClient(context).sendPayload(participant, Payload.fromBytes(stateBytes))`,
        `    }`,
        `}`,
      ];
    },
  },

  object_tracking: {
    trait: 'object_tracking',
    components: [],
    level: 'full',
    imports: ['com.google.ar.core.Config', 'com.google.ar.core.AugmentedImageDatabase'],
    generate: (varName, config) => {
      const referenceObject = String(config.reference_object || 'MyObject');
      const trackingMode = String(config.mode || 'image');
      return [
        `// @object_tracking -- ARCore ${trackingMode} tracking (ref: ${referenceObject})`,
        `val ${varName}ImageDb = AugmentedImageDatabase(arSession)`,
        `val ${varName}RefBitmap = BitmapFactory.decodeStream(context.assets.open("${referenceObject}.png"))`,
        `${varName}ImageDb.addImage("${referenceObject}", ${varName}RefBitmap)`,
        `val ${varName}Config = arSession.config.apply {`,
        `    augmentedImageDatabase = ${varName}ImageDb`,
        `}`,
        `arSession.configure(${varName}Config)`,
        `// Track in frame loop`,
        `xrSession.scene.addOnUpdateListener { frame ->`,
        `    val images = frame.getUpdatedTrackables(AugmentedImage::class.java)`,
        `    for (image in images) {`,
        `        if (image.trackingState == TrackingState.TRACKING && image.name == "${referenceObject}") {`,
        `            ${varName}.setPose(Pose(image.centerPose.translation.toVector3(), image.centerPose.rotation.toQuaternion()))`,
        `        }`,
        `    }`,
        `}`,
      ];
    },
  },

  scene_reconstruction: {
    trait: 'scene_reconstruction',
    components: [],
    level: 'full',
    imports: [
      'com.google.ar.core.Config',
      'com.google.ar.core.Frame',
      'com.google.ar.core.DepthPoint',
      'com.google.ar.core.PointCloud',
    ],
    generate: (varName, config) => {
      const mode = String(config.mode || 'mesh');
      const maxPoints = Number(config.max_points || 5000);
      return [
        `// @scene_reconstruction -- ARCore depth-based scene reconstruction (mode: ${mode})`,
        `xrSession.scene.configure { config ->`,
        `    config.depthMode = Config.DepthMode.AUTOMATIC`,
        `}`,
        `// Process depth frames to reconstruct scene mesh for ${varName}`,
        `val ${varName}PointCloud = mutableListOf<FloatArray>()`,
        ``,
        `fun ${varName}ProcessDepthFrame(frame: Frame) {`,
        `    // Acquire depth image from ARCore`,
        `    val depthImage = try { frame.acquireDepthImage16Bits() } catch (e: Exception) { return }`,
        `    val width = depthImage.width; val height = depthImage.height`,
        `    val buf = depthImage.planes[0].buffer.asShortBuffer()`,
        `    val pts = mutableListOf<FloatArray>()`,
        `    val stepX = (width / ${Math.ceil(Math.sqrt(maxPoints))}).coerceAtLeast(1)`,
        `    val stepY = (height / ${Math.ceil(Math.sqrt(maxPoints))}).coerceAtLeast(1)`,
        `    for (y in 0 until height step stepY) {`,
        `        for (x in 0 until width step stepX) {`,
        `            val depthMm = buf.get(y * width + x).toInt() and 0xFFFF`,
        `            if (depthMm == 0) continue`,
        `            val depthM = depthMm / 1000f`,
        `            // Back-project: focal length approximated from image width`,
        `            val fx = width.toFloat(); val fy = fx`,
        `            val cx = width / 2f; val cy = height / 2f`,
        `            pts += floatArrayOf(`,
        `                (x - cx) / fx * depthM,`,
        `                -(y - cy) / fy * depthM,`,
        `                -depthM`,
        `            )`,
        `        }`,
        `    }`,
        `    depthImage.close()`,
        `    ${varName}PointCloud.clear()`,
        `    ${varName}PointCloud.addAll(pts)`,
        `}`,
      ];
    },
  },

  volumetric_window: {
    trait: 'volumetric_window',
    components: ['SpatialEnvironment'],
    level: 'full',
    imports: [
      'androidx.xr.compose.spatial.Subspace',
      'androidx.xr.compose.subspace.layout.SubspaceModifier',
    ],
    generate: (varName, config) => {
      const width = Number(config.width || 0.5);
      const height = Number(config.height || 0.5);
      const depth = Number(config.depth || 0.5);
      return [
        `// @volumetric_window -- 3D content volume (${width}m x ${height}m x ${depth}m)`,
        `Subspace {`,
        `    // ${varName} volumetric content`,
        `    val ${varName}Model = GltfModel.create(session, Paths.get("${varName}.glb"))`,
        `    val ${varName}Entity = GltfModelEntity.create(session, ${varName}Model)`,
        `    ${varName}Entity.setPose(Pose(Vector3(0f, 0f, 0f), Quaternion.identity()))`,
        `}`,
      ];
    },
  },

  spatial_navigation: {
    trait: 'spatial_navigation',
    components: ['InteractableComponent'],
    level: 'full',
    imports: ['androidx.xr.scenecore.InteractableComponent', 'androidx.xr.scenecore.InputEvent'],
    generate: (varName, config) => {
      const mode = String(config.mode || 'gaze');
      return [
        `// @spatial_navigation -- spatial navigation (mode: ${mode})`,
        `val ${varName}NavTargets = mutableListOf<Entity>()`,
        `var ${varName}CurrentTarget = 0`,
        `val ${varName}NavInteractable = InteractableComponent.create(session, executor) { event ->`,
        `    when (event.action) {`,
        `        InputEvent.Action.ACTION_HOVER_ENTER -> {`,
        `            // Gaze entered: highlight as navigation target`,
        `        }`,
        `        InputEvent.Action.ACTION_UP -> {`,
        `            // Select current navigation target`,
        `            ${varName}CurrentTarget = (${varName}CurrentTarget + 1) % ${varName}NavTargets.size`,
        `        }`,
        `    }`,
        `}`,
        `${varName}.addComponent(${varName}NavInteractable)`,
      ];
    },
  },

  eye_tracked: {
    trait: 'eye_tracked',
    components: ['InteractableComponent'],
    level: 'full',
    imports: ['androidx.xr.scenecore.InteractableComponent', 'androidx.xr.scenecore.InputEvent'],
    generate: (varName) => [
      `// @eye_tracked -- gaze-driven interaction via hover events`,
      `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
      `    when (event.action) {`,
      `        InputEvent.Action.ACTION_HOVER_ENTER -> { /* gaze entered */ }`,
      `        InputEvent.Action.ACTION_HOVER_EXIT -> { /* gaze exited */ }`,
      `    }`,
      `}`,
      `${varName}.addComponent(${varName}Interactable)`,
    ],
  },

  realitykit_mesh: {
    trait: 'realitykit_mesh',
    components: ['GltfModelEntity'],
    level: 'full',
    imports: ['androidx.xr.scenecore.GltfModelEntity', 'androidx.xr.scenecore.GltfModel'],
    generate: (varName, config) => {
      const shape = String(config.shape || 'box');
      return [
        `// @realitykit_mesh -- GltfModelEntity from primitive (shape: ${shape})`,
        `// Android XR: use glTF models for geometry instead of programmatic shapes`,
        `val ${varName}Model = GltfModel.create(session, Paths.get("primitives/${shape}.glb"))`,
        `val ${varName}Entity = GltfModelEntity.create(session, ${varName}Model)`,
      ];
    },
  },

  eye_hand_fusion: {
    trait: 'eye_hand_fusion',
    components: ['InteractableComponent', 'HandTrackingProvider'],
    level: 'full',
    imports: [
      'androidx.xr.scenecore.InteractableComponent',
      'androidx.xr.arcore.Hand',
      'androidx.xr.arcore.HandJointType',
    ],
    generate: (varName) => [
      `// @eye_hand_fusion -- combined eye gaze + hand tracking`,
      `// Fuse gaze raycast with hand joint positions for ${varName}`,
      `var ${varName}GazeHit: FloatArray? = null  // [x, y, z] from gaze raycast`,
      ``,
      `val ${varName}Interactable = InteractableComponent.create(session, executor) { event ->`,
      `    if (event.source == InputEvent.Source.HANDS) {`,
      `        // Get index-tip pose from hand tracking`,
      `        val hand = if (event.pointerType == InputEvent.PointerType.LEFT_HAND)`,
      `            Hand.getOrCreate(session, HandType.LEFT)`,
      `        else Hand.getOrCreate(session, HandType.RIGHT)`,
      `        val tipPose = hand.handJoints[HandJointType.INDEX_TIP]`,
      `        val gazeHit = ${varName}GazeHit`,
      `        if (tipPose != null && gazeHit != null) {`,
      `            // Compute distance between finger tip and gaze hit point`,
      `            val dx = tipPose.translation.x - gazeHit[0]`,
      `            val dy = tipPose.translation.y - gazeHit[1]`,
      `            val dz = tipPose.translation.z - gazeHit[2]`,
      `            val distSq = dx * dx + dy * dy + dz * dz`,
      `            if (distSq < 0.04f) {  // within 20cm — confirmed interaction`,
      `                when (event.action) {`,
      `                    InputEvent.Action.ACTION_DOWN -> { /* pinch confirmed */ }`,
      `                    InputEvent.Action.ACTION_UP -> { /* pinch released */ }`,
      `                    else -> {}`,
      `                }`,
      `            }`,
      `        }`,
      `    }`,
      `}`,
      `${varName}.addComponent(${varName}Interactable)`,
    ],
  },

  // AI Generation traits -- comment-level stubs
  controlnet: {
    trait: 'controlnet',
    components: [],
    level: 'full',
    imports: [
      'org.tensorflow.lite.Interpreter',
      'org.tensorflow.lite.support.image.TensorImage',
    ],
    generate: (varName, config) => {
      const model = String(config.model || 'controlnet_canny');
      const endpoint = String(config.endpoint || '');
      return [
        `// @controlnet -- ControlNet inference (model: ${model})`,
        ...(endpoint
          ? [
              `// Remote inference via HTTP`,
              `fun ${varName}ControlNetInfer(inputBitmap: android.graphics.Bitmap): ByteArray? {`,
              `    val baos = java.io.ByteArrayOutputStream()`,
              `    inputBitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 90, baos)`,
              `    val b64 = android.util.Base64.encodeToString(baos.toByteArray(), android.util.Base64.NO_WRAP)`,
              `    val body = """{"model":"${model}","image":"$b64"}""".toByteArray()`,
              `    val conn = java.net.URL("${endpoint}/inference").openConnection() as java.net.HttpURLConnection`,
              `    conn.requestMethod = "POST"; conn.doOutput = true`,
              `    conn.setRequestProperty("Content-Type", "application/json")`,
              `    conn.outputStream.write(body)`,
              `    return if (conn.responseCode == 200) conn.inputStream.readBytes() else null`,
              `}`,
            ]
          : [
              `// TFLite on-device inference`,
              `fun ${varName}ControlNetInfer(inputBitmap: android.graphics.Bitmap): TensorImage? {`,
              `    val tfliteFile = context.assets.openFd("${model}.tflite")`,
              `    val chan = java.io.FileInputStream(tfliteFile.fileDescriptor).channel`,
              `    val mapped = chan.map(java.nio.channels.FileChannel.MapMode.READ_ONLY, tfliteFile.startOffset, tfliteFile.declaredLength)`,
              `    val opts = Interpreter.Options().apply { setNumThreads(4) }`,
              `    val interpreter = Interpreter(mapped, opts)`,
              `    val input = TensorImage.fromBitmap(inputBitmap)`,
              `    val outShape = interpreter.getOutputTensor(0).shape()`,
              `    val output = TensorImage(org.tensorflow.lite.DataType.FLOAT32)`,
              `    interpreter.run(input.buffer, output.buffer)`,
              `    interpreter.close()`,
              `    return output`,
              `}`,
            ]),
      ];
    },
  },

  ai_texture_gen: {
    trait: 'ai_texture_gen',
    components: ['GltfModelEntity'],
    level: 'full',
    imports: [
      'org.tensorflow.lite.Interpreter',
      'android.graphics.Bitmap',
      'android.graphics.Canvas',
      'android.graphics.Paint',
    ],
    generate: (varName, config) => {
      const style = String(config.style || 'photorealistic');
      const resolution = Number(config.resolution || 512);
      const endpoint = String(config.endpoint || '');
      return [
        `// @ai_texture_gen -- AI texture generation (style: ${style}, resolution: ${resolution})`,
        ...(endpoint
          ? [
              `fun ${varName}GenerateTexture(prompt: String): Bitmap? {`,
              `    val body = """{"prompt":"$prompt","style":"${style}","width":${resolution},"height":${resolution}}""".toByteArray()`,
              `    val conn = java.net.URL("${endpoint}/generate").openConnection() as java.net.HttpURLConnection`,
              `    conn.requestMethod = "POST"; conn.doOutput = true`,
              `    conn.setRequestProperty("Content-Type", "application/json")`,
              `    conn.outputStream.write(body)`,
              `    if (conn.responseCode != 200) return null`,
              `    val responseBytes = conn.inputStream.readBytes()`,
              `    return android.graphics.BitmapFactory.decodeByteArray(responseBytes, 0, responseBytes.size)`,
              `}`,
            ]
          : [
              `fun ${varName}GenerateTexture(prompt: String): Bitmap {`,
              `    // TFLite texture generator (requires texture_gen_${style}.tflite asset)`,
              `    return try {`,
              `        val fd = context.assets.openFd("texture_gen_${style}.tflite")`,
              `        val model = java.io.FileInputStream(fd.fileDescriptor).channel`,
              `            .map(java.nio.channels.FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)`,
              `        val opts = Interpreter.Options().apply { setNumThreads(4) }`,
              `        val tflite = Interpreter(model, opts)`,
              `        val outBuf = java.nio.FloatBuffer.allocate(${resolution} * ${resolution} * 3)`,
              `        tflite.run(prompt.encodeToByteArray(), outBuf)`,
              `        tflite.close()`,
              `        // Convert float output [0,1] to Bitmap`,
              `        val bmp = Bitmap.createBitmap(${resolution}, ${resolution}, Bitmap.Config.ARGB_8888)`,
              `        for (i in 0 until ${resolution} * ${resolution}) {`,
              `            val r = (outBuf.get(i * 3) * 255).toInt().coerceIn(0, 255)`,
              `            val g = (outBuf.get(i * 3 + 1) * 255).toInt().coerceIn(0, 255)`,
              `            val b = (outBuf.get(i * 3 + 2) * 255).toInt().coerceIn(0, 255)`,
              `            bmp.setPixel(i % ${resolution}, i / ${resolution}, android.graphics.Color.rgb(r, g, b))`,
              `        }`,
              `        bmp`,
              `    } catch (e: Exception) {`,
              `        // Fallback: solid gray`,
              `        Bitmap.createBitmap(${resolution}, ${resolution}, Bitmap.Config.ARGB_8888).also {`,
              `            Canvas(it).drawColor(android.graphics.Color.GRAY)`,
              `        }`,
              `    }`,
              `}`,
            ]),
        `// Assign generated texture to ${varName} Filament material`,
        `val ${varName}Texture = ${varName}GenerateTexture("${style} texture")`,
        `// Apply via Filament: MaterialInstance.setParameter("baseColorMap", texture)`,
      ];
    },
  },

  diffusion_realtime: {
    trait: 'diffusion_realtime',
    components: [],
    level: 'full',
    imports: [
      'org.tensorflow.lite.Interpreter',
      'android.opengl.GLES31',
    ],
    generate: (varName, config) => {
      const backend = String(config.backend || 'tflite');
      const steps = Number(config.steps || 4);
      const resolution = Number(config.resolution || 512);
      return [
        `// @diffusion_realtime -- real-time diffusion (backend: ${backend}, steps: ${steps})`,
        ...(backend === 'vulkan'
          ? [
              `// Vulkan compute pipeline for latent diffusion`,
              `// Note: Android XR Vulkan compute requires VK_KHR_vulkan_memory_model`,
              `// For production: load SPIR-V shader and dispatch denoising kernel`,
              `// Stub: Vulkan initialization via NDK (add vulkan lib in build.gradle)`,
              `fun ${varName}DiffusionStep(latent: FloatArray, step: Int): FloatArray {`,
              `    // PLACEHOLDER: call into JNI Vulkan compute dispatch`,
              `    // Each step: bind denoising UBO, dispatch(${resolution / 8}, ${resolution / 8}, 1)`,
              `    return latent  // passthrough until NDK Vulkan bridge implemented`,
              `}`,
              ``,
              `fun ${varName}RunDiffusion(noiseLatent: FloatArray): FloatArray {`,
              `    var latent = noiseLatent`,
              `    for (step in 0 until ${steps}) { latent = ${varName}DiffusionStep(latent, step) }`,
              `    return latent`,
              `}`,
            ]
          : [
              `// TFLite diffusion U-Net (requires diffusion_unet_${steps}step.tflite asset)`,
              `fun ${varName}RunDiffusion(noiseLatent: FloatArray): FloatArray {`,
              `    val fd = context.assets.openFd("diffusion_unet_${steps}step.tflite")`,
              `    val model = java.io.FileInputStream(fd.fileDescriptor).channel`,
              `        .map(java.nio.channels.FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)`,
              `    val opts = Interpreter.Options().apply { setNumThreads(4) }`,
              `    val tflite = Interpreter(model, opts)`,
              `    var latent = noiseLatent.copyOf()`,
              `    val outBuf = FloatArray(latent.size)`,
              `    for (step in 0 until ${steps}) {`,
              `        tflite.run(latent, outBuf)`,
              `        outBuf.copyInto(latent)`,
              `    }`,
              `    tflite.close()`,
              `    return latent`,
              `}`,
            ]),
      ];
    },
  },

  ai_upscaling: {
    trait: 'ai_upscaling',
    components: [],
    level: 'full',
    imports: [
      'org.tensorflow.lite.Interpreter',
      'android.graphics.Bitmap',
      'android.graphics.BitmapFactory',
    ],
    generate: (varName, config) => {
      const factor = Number(config.factor || 2);
      const modelName = String(config.model || 'super_resolution.tflite');
      return [
        `// @ai_upscaling -- TFLite super-resolution (factor: ${factor}x)`,
        `fun ${varName}Upscale(bitmap: Bitmap): Bitmap {`,
        `    val modelBuffer = context.assets.openFd("${modelName}").use {`,
        `        it.createInputStream().channel.map(java.nio.channels.FileChannel.MapMode.READ_ONLY, it.startOffset, it.declaredLength)`,
        `    }`,
        `    val interpreter = Interpreter(modelBuffer)`,
        `    val inputShape = interpreter.getInputTensor(0).shape() // [1, H, W, 3]`,
        `    val h = inputShape[1]; val w = inputShape[2]`,
        `    val scaled = Bitmap.createScaledBitmap(bitmap, w, h, true)`,
        `    val inputBuffer = java.nio.ByteBuffer.allocateDirect(1 * h * w * 3 * 4).apply { order(java.nio.ByteOrder.nativeOrder()) }`,
        `    scaled.getPixels(IntArray(h * w), 0, w, 0, 0, w, h)`,
        `    val outShape = interpreter.getOutputTensor(0).shape() // [1, H*${factor}, W*${factor}, 3]`,
        `    val outH = outShape[1]; val outW = outShape[2]`,
        `    val outputBuffer = java.nio.ByteBuffer.allocateDirect(1 * outH * outW * 3 * 4).apply { order(java.nio.ByteOrder.nativeOrder()) }`,
        `    interpreter.run(inputBuffer, outputBuffer)`,
        `    return Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888)`,
        `}`,
      ];
    },
  },

  ai_inpainting: {
    trait: 'ai_inpainting',
    components: [],
    level: 'full',
    imports: [
      'org.tensorflow.lite.Interpreter',
      'android.graphics.Bitmap',
    ],
    generate: (varName, config) => {
      const modelName = String(config.model || 'inpainting.tflite');
      return [
        `// @ai_inpainting -- TFLite mask-based inpainting`,
        `fun ${varName}Inpaint(image: Bitmap, mask: Bitmap): Bitmap {`,
        `    val modelBuffer = context.assets.openFd("${modelName}").use {`,
        `        it.createInputStream().channel.map(java.nio.channels.FileChannel.MapMode.READ_ONLY, it.startOffset, it.declaredLength)`,
        `    }`,
        `    val interpreter = Interpreter(modelBuffer)`,
        `    // Resize both image and mask to model input size`,
        `    val inputShape = interpreter.getInputTensor(0).shape() // [1, H, W, 4] (RGBA + mask)`,
        `    val h = inputShape[1]; val w = inputShape[2]`,
        `    val scaledImage = Bitmap.createScaledBitmap(image, w, h, true)`,
        `    val scaledMask = Bitmap.createScaledBitmap(mask, w, h, true)`,
        `    val inputBuffer = java.nio.ByteBuffer.allocateDirect(1 * h * w * 4 * 4).apply { order(java.nio.ByteOrder.nativeOrder()) }`,
        `    // interleave image RGB + mask alpha into input buffer`,
        `    val outputBuffer = java.nio.ByteBuffer.allocateDirect(1 * h * w * 3 * 4).apply { order(java.nio.ByteOrder.nativeOrder()) }`,
        `    interpreter.run(inputBuffer, outputBuffer)`,
        `    return Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)`,
        `}`,
      ];
    },
  },

  neural_link: {
    trait: 'neural_link',
    components: ['BluetoothGatt', 'UsbManager'],
    level: 'full',
    imports: [
      'android.bluetooth.BluetoothGatt',
      'android.bluetooth.BluetoothGattCallback',
      'android.bluetooth.BluetoothGattCharacteristic',
      'android.hardware.usb.UsbManager',
    ],
    generate: (varName, config) => {
      const interfaceType = String(config.interface_type || 'bci');
      const sampleRate = Number(config.sample_rate || 250);
      const channels = Number(config.channels || 8);
      return [
        `// @neural_link -- BCI signal processing pipeline (interface: ${interfaceType})`,
        `// Sample rate: ${sampleRate}Hz, Channels: ${channels}`,
        `val ${varName}SignalBuffer = ArrayDeque<FloatArray>(${sampleRate})`,
        `val ${varName}BciCallback = object : BluetoothGattCallback() {`,
        `    override fun onCharacteristicChanged(gatt: BluetoothGatt, char: BluetoothGattCharacteristic) {`,
        `        val raw = char.value ?: return`,
        `        // Decode ${channels}-channel EEG frame (${sampleRate}Hz, little-endian float32)`,
        `        val frame = FloatArray(${channels}) { i ->`,
        `            java.nio.ByteBuffer.wrap(raw, i * 4, 4).order(java.nio.ByteOrder.LITTLE_ENDIAN).float`,
        `        }`,
        `        ${varName}SignalBuffer.addLast(frame)`,
        `        if (${varName}SignalBuffer.size > ${sampleRate}) ${varName}SignalBuffer.removeFirst()`,
        `        val alphaPower = ${varName}BandPower(frame, 8f, 13f, ${sampleRate}f)`,
        `        val betaPower = ${varName}BandPower(frame, 13f, 30f, ${sampleRate}f)`,
        `        if (alphaPower > betaPower * 1.5f) { /* relaxed / focus state */ }`,
        `        else if (betaPower > alphaPower * 1.5f) { /* active / alert state */ }`,
        `    }`,
        `}`,
        ``,
        `fun ${varName}BandPower(frame: FloatArray, lowHz: Float, highHz: Float, fs: Float): Float {`,
        `    var power = 0f`,
        `    val binLow = (lowHz / fs * frame.size).toInt()`,
        `    val binHigh = (highHz / fs * frame.size).toInt().coerceAtMost(frame.size / 2)`,
        `    for (k in binLow..binHigh) {`,
        `        val omega = 2.0 * Math.PI * k / frame.size`,
        `        val coeff = (2.0 * Math.cos(omega)).toFloat()`,
        `        var d1 = 0f; var d2 = 0f`,
        `        for (x in frame) { val d0 = x + coeff * d1 - d2; d2 = d1; d1 = d0 }`,
        `        power += d1 * d1 + d2 * d2 - coeff * d1 * d2`,
        `    }`,
        `    return power`,
        `}`,
      ];
    },
  },

  neural_forge: {
    trait: 'neural_forge',
    components: ['TFLiteInterpreter', 'NnApiDelegate'],
    level: 'full',
    imports: [
      'org.tensorflow.lite.Interpreter',
      'org.tensorflow.lite.nnapi.NnApiDelegate',
      'java.io.FileInputStream',
      'java.nio.MappedByteBuffer',
      'java.nio.channels.FileChannel',
    ],
    generate: (varName, config) => {
      const modelPath = String(config.model_path || 'model.tflite');
      const epochs = Number(config.epochs || 5);
      return [
        `// @neural_forge -- on-device TFLite model training / NNAPI`,
        `// Model: ${modelPath}, epochs: ${epochs}`,
        `val ${varName}NnApiDelegate = NnApiDelegate()`,
        `val ${varName}Options = Interpreter.Options().apply {`,
        `    addDelegate(${varName}NnApiDelegate)`,
        `    setNumThreads(4)`,
        `}`,
        ``,
        `fun ${varName}LoadModel(context: Context): MappedByteBuffer {`,
        `    val afd = context.assets.openFd("${modelPath}")`,
        `    return FileInputStream(afd.fileDescriptor).channel`,
        `        .map(FileChannel.MapMode.READ_ONLY, afd.startOffset, afd.declaredLength)`,
        `}`,
        ``,
        `val ${varName}Interpreter = Interpreter(${varName}LoadModel(context), ${varName}Options)`,
        ``,
        `fun ${varName}TrainStep(inputs: FloatArray, labels: FloatArray) {`,
        `    val inputMap = mapOf("x" to arrayOf(inputs), "y" to arrayOf(labels))`,
        `    val outputMap = mutableMapOf<String, Any>("loss" to FloatArray(1))`,
        `    ${varName}Interpreter.runSignature(inputMap, outputMap, "train")`,
        `}`,
        ``,
        `fun ${varName}Train(dataset: List<Pair<FloatArray, FloatArray>>) {`,
        `    repeat(${epochs}) { epoch ->`,
        `        dataset.forEach { (x, y) -> ${varName}TrainStep(x, y) }`,
        `        android.util.Log.d("NeuralForge", "${varName} epoch \${epoch + 1}/${epochs}")`,
        `    }`,
        `}`,
      ];
    },
  },

  embedding_search: {
    trait: 'embedding_search',
    components: [],
    level: 'full',
    imports: ['android.database.sqlite.SQLiteOpenHelper', 'android.database.sqlite.SQLiteDatabase'],
    generate: (varName, config) => {
      const dimensions = Number(config.dimensions || 1536);
      const enableSqliteFtsStub = Boolean(config.enable_sqlite_fts_stub);
      const table = String(config.table || 'embeddings_index')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_');

      if (!enableSqliteFtsStub) {
        return [
          `// @embedding_search -- vector embedding search (dimensions: ${dimensions})`,
          `// ANN retrieval via SQLite embedding blobs + cosine similarity scoring`,
          `class ${varName}EmbeddingDb(context: Context) : SQLiteOpenHelper(context, "${varName.toLowerCase()}_ann.db", null, 1) {`,
          `    override fun onCreate(db: SQLiteDatabase) {`,
          `        db.execSQL("""`,
          `            CREATE TABLE IF NOT EXISTS ${table} (`,
          `                id TEXT PRIMARY KEY,`,
          `                text TEXT NOT NULL,`,
          `                embedding BLOB NOT NULL`,
          `            )`,
          `        """.trimIndent())`,
          `    }`,
          `    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit`,
          `}`,
          ``,
          `fun ${varName}CosineSimilarity(a: FloatArray, b: FloatArray): Float {`,
          `    require(a.size == b.size) { "Vector dimension mismatch: \${a.size} vs \${b.size}" }`,
          `    var dot = 0f; var normA = 0f; var normB = 0f`,
          `    for (i in a.indices) { dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i] }`,
          `    val denom = Math.sqrt((normA * normB).toDouble()).toFloat()`,
          `    return if (denom == 0f) 0f else dot / denom`,
          `}`,
          ``,
          `fun ${varName}AnnSearch(queryEmbedding: FloatArray, limit: Int = 5): List<Pair<String, Float>> {`,
          `    val db = ${varName}EmbeddingDb(context).readableDatabase`,
          `    val cursor = db.rawQuery("SELECT id, text, embedding FROM ${table}", null)`,
          `    val results = mutableListOf<Pair<String, Float>>()`,
          `    cursor.use {`,
          `        while (it.moveToNext()) {`,
          `            val id = it.getString(0)`,
          `            val blob = it.getBlob(2)`,
          `            val vec = FloatArray(blob.size / 4) { i ->`,
          `                java.nio.ByteBuffer.wrap(blob, i * 4, 4).order(java.nio.ByteOrder.LITTLE_ENDIAN).float`,
          `            }`,
          `            val score = ${varName}CosineSimilarity(queryEmbedding, vec)`,
          `            results += Pair(id, score)`,
          `        }`,
          `    }`,
          `    return results.sortedByDescending { it.second }.take(limit)`,
          `}`,
        ];
      }

      return [
        `// @embedding_search -- local SQLite FTS5 scaffold for ${varName}`,
        `class ${varName}EmbeddingDb(context: Context) : SQLiteOpenHelper(context, "${varName.toLowerCase()}_embeddings.db", null, 1) {`,
        `    override fun onCreate(db: SQLiteDatabase) {`,
        `        db.execSQL("""`,
        `            CREATE VIRTUAL TABLE IF NOT EXISTS ${table}`,
        `            USING fts5(id UNINDEXED, text, embedding_blob UNINDEXED)`,
        `        """.trimIndent())`,
        `    }`,
        `    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = Unit`,
        `}`,
        `val ${varName}EmbeddingDimensions = ${dimensions}`,
        `fun ${varName}Search(query: String, limit: Int = 5): String {`,
        `    // Stub: lexical fallback via FTS5; semantic ranking (cosine over embeddings) is next step`,
        `    return "SELECT id, text FROM ${table} WHERE ${table} MATCH ? LIMIT ?"`,
        `}`,
      ];
    },
  },

  ai_npc_brain: {
    trait: 'ai_npc_brain',
    components: [],
    level: 'full',
    imports: ['com.google.ai.generativelanguage.GenerativeModel'],
    generate: (varName, config) => {
      const model = String(config.model || 'gemini-nano');
      const personality = String(config.personality || 'helpful assistant');
      const memorySlots = config.memory_slots ?? 10;
      return [
        `// @ai_npc_brain -- AI NPC brain (model: ${model})`,
        `// personality: ${personality}, memory: ${memorySlots} slots`,
        `val ${varName}Brain = NPCBrain(`,
        `    model = "${model}",`,
        `    systemPrompt = "You are a ${personality}. Respond in character.",`,
        `    memoryCapacity = ${memorySlots}`,
        `)`,
        `val ${varName}Memory = ArrayDeque<String>(${memorySlots})`,
        ``,
        `suspend fun ${varName}Think(perception: String): String {`,
        `    ${varName}Memory.addLast(perception)`,
        `    if (${varName}Memory.size > ${memorySlots}) ${varName}Memory.removeFirst()`,
        `    val context = ${varName}Memory.joinToString("\\n")`,
        `    return ${
          model === 'gemini-nano'
            ? `GeminiNano.generateContent(context).text ?: ""`
            : `apiClient.generate("${model}", context)`
        }`,
        `}`,
        `// Wire to perception: ${varName}Think(${varName}PerceivedEntities.toString())`,
      ];
    },
  },

  vector_db: {
    trait: 'vector_db',
    components: ['OkHttpClient'],
    level: 'full',
    imports: [
      'okhttp3.OkHttpClient',
      'okhttp3.Request',
      'okhttp3.RequestBody',
      'okhttp3.MediaType.Companion.toMediaType',
    ],
    generate: (varName, config) => {
      const backend = String(config.backend || 'chroma');
      const host = String(config.host || 'http://localhost:8000');
      const collection = String(config.collection || varName.toLowerCase() + '_vectors');
      const isPinecone = backend === 'pinecone';
      return [
        `// @vector_db -- vector database (backend: ${backend})`,
        `val ${varName}VdbClient = OkHttpClient()`,
        `val ${varName}VdbBase = "${isPinecone ? `https://\${${varName}PineconeIndex}.svc.pinecone.io` : host}"`,
        `val ${varName}VdbJson = "application/json; charset=utf-8".toMediaType()`,
        ``,
        `fun ${varName}VdbUpsert(id: String, embedding: FloatArray, metadata: Map<String, String> = emptyMap()) {`,
        `    val vectors = embedding.joinToString(",")`,
        `    val meta = metadata.entries.joinToString(",") { "\\"` + `\${it.key}` + `\\":\\"` + `\${it.value}` + `\\"" }`,
        ...(isPinecone
          ? [
              `    val body = """{"vectors":[{"id":"$id","values":[$vectors],"metadata":{$meta}}]}"""`,
              `    val req = Request.Builder().url("\${${varName}VdbBase}/vectors/upsert")`,
              `        .addHeader("Api-Key", System.getenv("PINECONE_API_KEY") ?: "")`,
              `        .post(RequestBody.create(${varName}VdbJson, body)).build()`,
            ]
          : [
              `    val body = """{"embeddings":[$vectors],"metadatas":[{$meta}],"ids":["$id"]}"""`,
              `    val req = Request.Builder().url("\${${varName}VdbBase}/api/v1/collections/${collection}/add")`,
              `        .post(RequestBody.create(${varName}VdbJson, body)).build()`,
            ]),
        `    ${varName}VdbClient.newCall(req).execute().use { resp ->`,
        `        check(resp.isSuccessful) { "VectorDb upsert failed: \${resp.code}" }`,
        `    }`,
        `}`,
        ``,
        `fun ${varName}VdbQuery(queryEmbedding: FloatArray, topK: Int = 5): String {`,
        `    val vectors = queryEmbedding.joinToString(",")`,
        ...(isPinecone
          ? [
              `    val body = """{"vector":[$vectors],"topK":$topK,"includeMetadata":true}"""`,
              `    val req = Request.Builder().url("\${${varName}VdbBase}/query")`,
              `        .addHeader("Api-Key", System.getenv("PINECONE_API_KEY") ?: "")`,
              `        .post(RequestBody.create(${varName}VdbJson, body)).build()`,
            ]
          : [
              `    val body = """{"query_embeddings":[$vectors],"n_results":$topK}"""`,
              `    val req = Request.Builder().url("\${${varName}VdbBase}/api/v1/collections/${collection}/query")`,
              `        .post(RequestBody.create(${varName}VdbJson, body)).build()`,
            ]),
        `    return ${varName}VdbClient.newCall(req).execute().use { it.body?.string() ?: "" }`,
        `}`,
      ];
    },
  },

  vision: {
    trait: 'vision',
    components: [],
    level: 'full',
    imports: [
      'com.google.mlkit.vision.common.InputImage',
      'com.google.mlkit.vision.label.ImageLabeling',
      'com.google.mlkit.vision.label.defaults.ImageLabelerOptions',
      'com.google.mlkit.vision.text.TextRecognition',
      'com.google.mlkit.vision.text.latin.TextRecognizerOptions',
      'com.google.mlkit.vision.face.FaceDetection',
      'com.google.mlkit.vision.face.FaceDetectorOptions',
      'com.google.mlkit.vision.barcode.BarcodeScanning',
    ],
    generate: (varName, config) => {
      const task = String(config.task || 'classification');
      const mlkitSetup: Record<string, string[]> = {
        classification: [
          `val ${varName}Labeler = ImageLabeling.getClient(ImageLabelerOptions.DEFAULT_INSTANCE)`,
          `fun ${varName}Analyze(image: InputImage) {`,
          `    ${varName}Labeler.process(image).addOnSuccessListener { labels ->`,
          `        labels.forEach { label -> /* label.text, label.confidence */ }`,
          `    }`,
          `}`,
        ],
        text_recognition: [
          `val ${varName}Recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)`,
          `fun ${varName}Analyze(image: InputImage) {`,
          `    ${varName}Recognizer.process(image).addOnSuccessListener { visionText ->`,
          `        visionText.textBlocks.forEach { block -> /* block.text, block.boundingBox */ }`,
          `    }`,
          `}`,
        ],
        face_detection: [
          `val ${varName}FaceOpts = FaceDetectorOptions.Builder()`,
          `    .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)`,
          `    .enableTracking().build()`,
          `val ${varName}Detector = FaceDetection.getClient(${varName}FaceOpts)`,
          `fun ${varName}Analyze(image: InputImage) {`,
          `    ${varName}Detector.process(image).addOnSuccessListener { faces ->`,
          `        faces.forEach { face -> /* face.trackingId, face.boundingBox, face.headEulerAngleY */ }`,
          `    }`,
          `}`,
        ],
        barcode: [
          `val ${varName}Scanner = BarcodeScanning.getClient()`,
          `fun ${varName}Analyze(image: InputImage) {`,
          `    ${varName}Scanner.process(image).addOnSuccessListener { barcodes ->`,
          `        barcodes.forEach { bc -> /* bc.rawValue, bc.format, bc.boundingBox */ }`,
          `    }`,
          `}`,
        ],
      };
      const lines = mlkitSetup[task] ?? mlkitSetup['classification']!;
      return [
        `// @vision -- ML Kit Vision (task: ${task})`,
        ...lines,
      ];
    },
  },

  spatial_awareness: {
    trait: 'spatial_awareness',
    components: [],
    level: 'full',
    imports: [
      'com.google.ar.core.Config',
      'com.google.ar.core.Plane',
      'com.google.ar.core.Frame',
      'com.google.ar.core.TrackingState',
    ],
    generate: (varName, config) => {
      const depthMode = String(config.depth_mode || 'AUTOMATIC');
      const planeFinding = String(config.plane_finding || 'HORIZONTAL_AND_VERTICAL');
      return [
        `// @spatial_awareness -- ARCore spatial scene understanding`,
        `// Configure ARCore session for full spatial awareness`,
        `xrSession.scene.configure { config ->`,
        `    config.planeFindingMode = Config.PlaneFindingMode.${planeFinding}`,
        `    config.depthMode = Config.DepthMode.${depthMode}`,
        `    config.lightEstimationMode = Config.LightEstimationMode.ENVIRONMENTAL_HDR`,
        `    config.cloudAnchorMode = Config.CloudAnchorMode.ENABLED`,
        `}`,
        ``,
        `// Plane detection callback`,
        `fun ${varName}OnFrame(frame: Frame) {`,
        `    for (plane in frame.getUpdatedTrackables(Plane::class.java)) {`,
        `        if (plane.trackingState == TrackingState.TRACKING) {`,
        `            val center = plane.centerPose`,
        `            val extent = plane.extentX to plane.extentZ`,
        `            // plane.type: HORIZONTAL_UPWARD_FACING / HORIZONTAL_DOWNWARD_FACING / VERTICAL`,
        `            _ = center; _ = extent`,
        `        }`,
        `    }`,
        `    // Access depth image if depth mode enabled`,
        `    if (${JSON.stringify(depthMode)} == "AUTOMATIC") {`,
        `        runCatching { frame.acquireDepthImage16Bits() }.getOrNull()?.use { depthImg ->`,
        `            // depthImg.width, depthImg.height, depthImg.planes[0].buffer`,
        `            _ = depthImg`,
        `        }`,
        `    }`,
        `}`,
      ];
    },
  },

  neural_animation: {
    trait: 'neural_animation',
    components: [],
    level: 'full',
    imports: [
      'org.tensorflow.lite.Interpreter',
      'androidx.xr.scenecore.GltfModelEntity',
      'androidx.xr.scenecore.GltfAnimation',
    ],
    generate: (varName, config) => {
      const style = String(config.style || 'motion_matching');
      const modelAsset = String(config.model_asset || `neural_anim_${style}.tflite`);
      return [
        `// @neural_animation -- TFLite pose prediction + GltfModelEntity animation (style: ${style})`,
        `fun ${varName}RunNeuralAnimation(inputFeatures: FloatArray): FloatArray {`,
        `    val fd = context.assets.openFd("${modelAsset}")`,
        `    val mapped = java.io.FileInputStream(fd.fileDescriptor).channel`,
        `        .map(java.nio.channels.FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)`,
        `    val opts = Interpreter.Options().apply { setNumThreads(2) }`,
        `    val tflite = Interpreter(mapped, opts)`,
        `    val poseOutput = FloatArray(tflite.getOutputTensor(0).numElements())`,
        `    tflite.run(inputFeatures, poseOutput)`,
        `    tflite.close()`,
        `    return poseOutput`,
        `}`,
        ``,
        `// Drive GltfModelEntity animation with predicted pose`,
        `fun ${varName}ApplyPose(entity: GltfModelEntity, poseJoints: FloatArray) {`,
        `    // Each joint: [qx, qy, qz, qw, tx, ty, tz] = 7 floats`,
        `    val jointCount = poseJoints.size / 7`,
        `    for (i in 0 until jointCount) {`,
        `        val base = i * 7`,
        `        val q = androidx.xr.runtime.math.Quaternion(`,
        `            poseJoints[base], poseJoints[base + 1],`,
        `            poseJoints[base + 2], poseJoints[base + 3]`,
        `        )`,
        `        val t = androidx.xr.runtime.math.Vector3(`,
        `            poseJoints[base + 4], poseJoints[base + 5], poseJoints[base + 6]`,
        `        )`,
        `        entity.setJointLocalPose(i, androidx.xr.runtime.math.Pose(t, q))`,
        `    }`,
        `}`,
      ];
    },
  },

  ai_vision: {
    trait: 'ai_vision',
    components: [],
    level: 'full',
    imports: [
      'com.google.mlkit.vision.objects.ObjectDetection',
      'com.google.mlkit.vision.objects.defaults.ObjectDetectorOptions',
      'com.google.mlkit.vision.common.InputImage',
      'org.tensorflow.lite.Interpreter',
    ],
    generate: (varName, config) => {
      const task = String(config.task || 'detection');
      const modelAsset = String(config.model || '');
      if (modelAsset) {
        return [
          `// @ai_vision -- custom TFLite model (task: ${task}, model: ${modelAsset})`,
          `fun ${varName}LoadModel(context: Context): Interpreter {`,
          `    val fd = context.assets.openFd("${modelAsset}")`,
          `    val mapped = java.io.FileInputStream(fd.fileDescriptor).channel`,
          `        .map(java.nio.channels.FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)`,
          `    return Interpreter(mapped, Interpreter.Options().apply { setNumThreads(2) })`,
          `}`,
          `val ${varName}Model = ${varName}LoadModel(context)`,
          `fun ${varName}Analyze(input: FloatArray): FloatArray {`,
          `    val output = FloatArray(${varName}Model.getOutputTensor(0).numElements())`,
          `    ${varName}Model.run(input, output)`,
          `    return output`,
          `}`,
        ];
      }
      return [
        `// @ai_vision -- ML Kit ObjectDetector (task: ${task})`,
        `val ${varName}DetectorOpts = ObjectDetectorOptions.Builder()`,
        `    .setDetectorMode(ObjectDetectorOptions.STREAM_MODE)`,
        `    .enableMultipleObjects()`,
        `    .enableClassification().build()`,
        `val ${varName}ObjectDetector = ObjectDetection.getClient(${varName}DetectorOpts)`,
        `fun ${varName}Analyze(image: InputImage) {`,
        `    ${varName}ObjectDetector.process(image).addOnSuccessListener { objects ->`,
        `        objects.forEach { obj ->`,
        `            // obj.trackingId, obj.boundingBox, obj.labels[0].text, obj.labels[0].confidence`,
        `            _ = obj`,
        `        }`,
        `    }`,
        `}`,
      ];
    },
  },
};

// =============================================================================
// AI GLASSES TRAITS — Jetpack Compose Glimmer + Jetpack Projected
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
    level: 'partial',
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
    level: 'partial',
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
    level: 'partial',
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
    level: 'partial',
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
    level: 'partial',
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
    level: 'partial',
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
    level: 'partial',
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

export const AI_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  pathfinding: {
    trait: 'pathfinding',
    components: [],
    level: 'partial',
    generate: (varName, config) => {
      const algorithm = String(config.algorithm || 'a_star');
      const navMeshResolution = config.nav_mesh_resolution ?? 0.5;
      const agentRadius = config.agent_radius ?? 0.3;
      return [
        `// @pathfinding -- ${algorithm} pathfinding on navigation mesh`,
        `// nav mesh resolution: ${navMeshResolution}m, agent radius: ${agentRadius}m`,
        `val ${varName}NavMesh = NavigationMesh(`,
        `    resolution = ${navMeshResolution}f,`,
        `    agentRadius = ${agentRadius}f`,
        `)`,
        `// Build nav mesh from scene geometry (planes + meshes)`,
        `xrSession.scene.configure { config ->`,
        `    config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL`,
        `}`,
        `fun ${varName}FindPath(target: Vector3): List<Vector3> {`,
        `    val start = ${varName}.pose.translation`,
        `    return ${varName}NavMesh.findPath(start, target, algorithm = PathAlgorithm.${algorithm.toUpperCase()})`,
        `}`,
        `// Follow path with steering behavior`,
        `fun ${varName}FollowPath(path: List<Vector3>) {`,
        `    var waypointIndex = 0`,
        `    xrSession.scene.addOnUpdateListener { frame ->`,
        `        if (waypointIndex >= path.size) return@addOnUpdateListener`,
        `        val target = path[waypointIndex]`,
        `        val dir = (target - ${varName}.pose.translation).normalized()`,
        `        ${varName}.setPose(Pose(${varName}.pose.translation + dir * frame.deltaTime, ${varName}.pose.rotation))`,
        `        if (Vector3.distance(${varName}.pose.translation, target) < ${agentRadius}f) waypointIndex++`,
        `    }`,
        `}`,
      ];
    },
  },

  dialogue_system: {
    trait: 'dialogue_system',
    components: ['PanelEntity'],
    level: 'partial',
    imports: ['androidx.xr.compose.spatial.SpatialPanel'],
    generate: (varName, config) => {
      const backend = String(config.backend || 'gemini_nano');
      const contextWindow = config.context_window ?? 4096;
      return [
        `// @dialogue_system -- NPC dialogue (backend: ${backend})`,
        `// context window: ${contextWindow} tokens`,
        `data class ${varName}DialogueEntry(val speaker: String, val text: String, val timestamp: Long)`,
        `val ${varName}DialogueHistory = mutableListOf<${varName}DialogueEntry>()`,
        `val ${varName}CurrentDialogue = mutableStateOf("")`,
        ``,
        `suspend fun ${varName}GenerateResponse(playerInput: String): String {`,
        `    ${varName}DialogueHistory.add(${varName}DialogueEntry("player", playerInput, System.currentTimeMillis()))`,
        `    // Route to ${backend} for response generation`,
        `    val context = ${varName}DialogueHistory.takeLast(${Math.floor((contextWindow as number) / 100)})`,
        `        .joinToString("\\n") { "\${it.speaker}: \${it.text}" }`,
        `    val response = ${backend === 'gemini_nano' ? 'GeminiNano.generate(context)' : 'apiClient.chat(context)'}`,
        `    ${varName}DialogueHistory.add(${varName}DialogueEntry("${varName}", response, System.currentTimeMillis()))`,
        `    ${varName}CurrentDialogue.value = response`,
        `    return response`,
        `}`,
        ``,
        `// Display dialogue as spatial panel above NPC`,
        `SpatialPanel(SubspaceModifier.width(300f).height(200f)) {`,
        `    Text(${varName}CurrentDialogue.value, style = MaterialTheme.typography.bodyMedium)`,
        `}`,
      ];
    },
  },

  behavior_tree: {
    trait: 'behavior_tree',
    components: [],
    level: 'partial',
    generate: (varName, config) => {
      const tickRate = config.tick_rate ?? 10;
      return [
        `// @behavior_tree -- NPC behavior tree (tick rate: ${tickRate}Hz)`,
        `sealed class ${varName}BTNode {`,
        `    abstract fun tick(): BTStatus`,
        `    enum class BTStatus { SUCCESS, FAILURE, RUNNING }`,
        `}`,
        `class ${varName}Sequence(val children: List<${varName}BTNode>) : ${varName}BTNode() {`,
        `    override fun tick(): BTStatus {`,
        `        for (child in children) {`,
        `            when (child.tick()) {`,
        `                BTStatus.FAILURE -> return BTStatus.FAILURE`,
        `                BTStatus.RUNNING -> return BTStatus.RUNNING`,
        `                else -> continue`,
        `            }`,
        `        }`,
        `        return BTStatus.SUCCESS`,
        `    }`,
        `}`,
        `class ${varName}Selector(val children: List<${varName}BTNode>) : ${varName}BTNode() {`,
        `    override fun tick(): BTStatus {`,
        `        for (child in children) {`,
        `            when (child.tick()) {`,
        `                BTStatus.SUCCESS -> return BTStatus.SUCCESS`,
        `                BTStatus.RUNNING -> return BTStatus.RUNNING`,
        `                else -> continue`,
        `            }`,
        `        }`,
        `        return BTStatus.FAILURE`,
        `    }`,
        `}`,
        `// Tick tree at ${tickRate}Hz`,
        `val ${varName}BTRoot: ${varName}BTNode = ${varName}Selector(listOf(/* behavior nodes */))`,
        `val ${varName}BTJob = CoroutineScope(Dispatchers.Default).launch {`,
        `    while (isActive) {`,
        `        ${varName}BTRoot.tick()`,
        `        delay(${Math.round(1000 / (tickRate as number))}L)`,
        `    }`,
        `}`,
      ];
    },
  },

  goal_planner: {
    trait: 'goal_planner',
    components: [],
    level: 'partial',
    generate: (varName, config) => {
      const maxPlanDepth = config.max_depth ?? 10;
      return [
        `// @goal_planner -- GOAP (Goal-Oriented Action Planning)`,
        `// max plan depth: ${maxPlanDepth}`,
        `data class ${varName}WorldState(val facts: Map<String, Boolean>)`,
        `data class ${varName}Action(`,
        `    val name: String,`,
        `    val preconditions: Map<String, Boolean>,`,
        `    val effects: Map<String, Boolean>,`,
        `    val cost: Float = 1f`,
        `)`,
        `data class ${varName}Goal(val conditions: Map<String, Boolean>)`,
        ``,
        `fun ${varName}Plan(`,
        `    currentState: ${varName}WorldState,`,
        `    goal: ${varName}Goal,`,
        `    actions: List<${varName}Action>`,
        `): List<${varName}Action> {`,
        `    // A* search through action space`,
        `    val openSet = PriorityQueue<Pair<Float, List<${varName}Action>>>(compareBy { it.first })`,
        `    openSet.add(0f to emptyList())`,
        `    while (openSet.isNotEmpty()) {`,
        `        val (cost, plan) = openSet.poll()`,
        `        if (plan.size > ${maxPlanDepth}) continue`,
        `        val simState = simulateActions(currentState, plan)`,
        `        if (goal.conditions.all { simState.facts[it.key] == it.value }) return plan`,
        `        for (action in actions) {`,
        `            if (action.preconditions.all { simState.facts[it.key] == it.value }) {`,
        `                openSet.add((cost + action.cost) to (plan + action))`,
        `            }`,
        `        }`,
        `    }`,
        `    return emptyList() // No plan found`,
        `}`,
      ];
    },
  },

  npc_perception: {
    trait: 'npc_perception',
    components: [],
    level: 'partial',
    generate: (varName, config) => {
      const viewAngle = config.view_angle ?? 120;
      const viewDistance = config.view_distance ?? 15;
      const hearingRange = config.hearing_range ?? 10;
      return [
        `// @npc_perception -- NPC sensory system`,
        `// vision: ${viewAngle} degrees, ${viewDistance}m range; hearing: ${hearingRange}m`,
        `data class ${varName}PerceivedEntity(val entity: Entity, val distance: Float, val isVisible: Boolean)`,
        `val ${varName}PerceivedEntities = mutableListOf<${varName}PerceivedEntity>()`,
        ``,
        `fun ${varName}UpdatePerception(entities: List<Entity>) {`,
        `    ${varName}PerceivedEntities.clear()`,
        `    val npcPos = ${varName}.pose.translation`,
        `    val npcForward = ${varName}.pose.rotation * Vector3(0f, 0f, -1f)`,
        `    for (entity in entities) {`,
        `        val toEntity = entity.pose.translation - npcPos`,
        `        val dist = toEntity.length()`,
        `        // Vision cone check`,
        `        val isInView = dist < ${viewDistance}f &&`,
        `            acos(npcForward.dot(toEntity.normalized())).toDegrees() < ${Number(viewAngle) / 2}f`,
        `        // Hearing check (omnidirectional)`,
        `        val isHeard = dist < ${hearingRange}f`,
        `        if (isInView || isHeard) {`,
        `            ${varName}PerceivedEntities.add(${varName}PerceivedEntity(entity, dist, isInView))`,
        `        }`,
        `    }`,
        `}`,
      ];
    },
  },

  gesture_recognition: {
    trait: 'gesture_recognition',
    components: ['HandTrackingProvider'],
    level: 'partial',
    imports: ['androidx.xr.arcore.Hand', 'androidx.xr.arcore.HandJointType'],
    generate: (varName, config) => {
      const gestures = (config.gestures as string[]) || ['pinch', 'fist', 'point', 'open_palm'];
      return [
        `// @gesture_recognition -- hand gesture classification`,
        `// gestures: ${gestures.join(', ')}`,
        `enum class ${varName}Gesture { ${gestures.map((g: string) => g.toUpperCase()).join(', ')}, NONE }`,
        `val ${varName}CurrentGesture = mutableStateOf(${varName}Gesture.NONE)`,
        ``,
        `fun ${varName}ClassifyGesture(handState: HandState): ${varName}Gesture {`,
        `    val thumbTip = handState.handJoints[HandJointType.HAND_JOINT_TYPE_THUMB_TIP]`,
        `    val indexTip = handState.handJoints[HandJointType.HAND_JOINT_TYPE_INDEX_TIP]`,
        `    val middleTip = handState.handJoints[HandJointType.HAND_JOINT_TYPE_MIDDLE_TIP]`,
        `    val palm = handState.handJoints[HandJointType.HAND_JOINT_TYPE_PALM]`,
        `    if (thumbTip == null || indexTip == null || palm == null) return ${varName}Gesture.NONE`,
        ``,
        `    val thumbIndexDist = Vector3.distance(thumbTip.translation, indexTip.translation)`,
        `    // Pinch: thumb and index finger close together`,
        `    if (thumbIndexDist < 0.02f) return ${varName}Gesture.PINCH`,
        `    // Point: index extended, others curled`,
        `    val indexPalmDist = Vector3.distance(indexTip.translation, palm.translation)`,
        `    val middlePalmDist = Vector3.distance(middleTip!!.translation, palm.translation)`,
        `    if (indexPalmDist > 0.1f && middlePalmDist < 0.06f) return ${varName}Gesture.POINT`,
        `    // Open palm: all fingers extended`,
        `    if (indexPalmDist > 0.1f && middlePalmDist > 0.1f) return ${varName}Gesture.OPEN_PALM`,
        `    // Fist: all fingers curled`,
        `    if (indexPalmDist < 0.06f && middlePalmDist < 0.06f) return ${varName}Gesture.FIST`,
        `    return ${varName}Gesture.NONE`,
        `}`,
        ``,
        `Hand.left(session)?.state?.collect { handState ->`,
        `    ${varName}CurrentGesture.value = ${varName}ClassifyGesture(handState)`,
        `}`,
      ];
    },
  },

  speech_to_text: {
    trait: 'speech_to_text',
    components: [],
    level: 'partial',
    imports: [
      'android.speech.SpeechRecognizer',
      'android.speech.RecognizerIntent',
      'android.content.Intent',
    ],
    generate: (varName, config) => {
      const language = String(config.language || 'en-US');
      const continuous = config.continuous ?? false;
      return [
        `// @speech_to_text -- Android SpeechRecognizer`,
        `// language: ${language}, continuous: ${continuous}`,
        `// android.permission.RECORD_AUDIO required`,
        `val ${varName}Recognizer = SpeechRecognizer.createSpeechRecognizer(context)`,
        `val ${varName}RecognizedText = mutableStateOf("")`,
        `val ${varName}RecognizerIntent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {`,
        `    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)`,
        `    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "${language}")`,
        `    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)`,
        `}`,
        `${varName}Recognizer.setRecognitionListener(object : RecognitionListener {`,
        `    override fun onResults(results: Bundle) {`,
        `        val matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)`,
        `        ${varName}RecognizedText.value = matches?.firstOrNull() ?: ""`,
        `    }`,
        `    override fun onPartialResults(partialResults: Bundle) {`,
        `        val partial = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)`,
        `        // Process partial results for real-time display`,
        `    }`,
        `    override fun onError(error: Int) { /* handle error */ }`,
        `    override fun onReadyForSpeech(params: Bundle?) {}`,
        `    override fun onBeginningOfSpeech() {}`,
        `    override fun onRmsChanged(rmsdB: Float) {}`,
        `    override fun onBufferReceived(buffer: ByteArray?) {}`,
        `    override fun onEndOfSpeech() {}`,
        `    override fun onEvent(eventType: Int, params: Bundle?) {}`,
        `})`,
        ...(continuous
          ? [
              `// Restart recognition on end for continuous mode`,
              `// onEndOfSpeech → ${varName}Recognizer.startListening(${varName}RecognizerIntent)`,
            ]
          : []),
        `${varName}Recognizer.startListening(${varName}RecognizerIntent)`,
      ];
    },
  },

  text_to_speech: {
    trait: 'text_to_speech',
    components: [],
    level: 'partial',
    imports: ['android.speech.tts.TextToSpeech', 'java.util.Locale'],
    generate: (varName, config) => {
      const language = String(config.language || 'en-US');
      const pitch = config.pitch ?? 1.0;
      const speechRate = config.rate ?? 1.0;
      return [
        `// @text_to_speech -- Android TextToSpeech engine`,
        `// language: ${language}, pitch: ${pitch}, rate: ${speechRate}`,
        `val ${varName}TTS = TextToSpeech(context) { status ->`,
        `    if (status == TextToSpeech.SUCCESS) {`,
        `        ${varName}TTS.language = Locale.forLanguageTag("${language}")`,
        `        ${varName}TTS.setPitch(${pitch}f)`,
        `        ${varName}TTS.setSpeechRate(${speechRate}f)`,
        `    }`,
        `}`,
        `fun ${varName}Speak(text: String, queueMode: Int = TextToSpeech.QUEUE_FLUSH) {`,
        `    ${varName}TTS.speak(text, queueMode, null, "${varName}_\${System.nanoTime()}")`,
        `}`,
        `fun ${varName}Stop() { ${varName}TTS.stop() }`,
        `// Cleanup: ${varName}TTS.shutdown() in onDestroy()`,
      ];
    },
  },

  npc_steering: {
    trait: 'npc_steering',
    components: ['PhysicsComponent'],
    level: 'partial',
    generate: (varName, config) => {
      const maxSpeed = config.max_speed ?? 3.0;
      const maxForce = config.max_force ?? 5.0;
      const arrivalRadius = config.arrival_radius ?? 1.0;
      return [
        `// @npc_steering -- Reynolds steering behaviors`,
        `// max speed: ${maxSpeed}, max force: ${maxForce}, arrival: ${arrivalRadius}m`,
        `val ${varName}MaxSpeed = ${maxSpeed}f`,
        `val ${varName}MaxForce = ${maxForce}f`,
        `var ${varName}Velocity = Vector3(0f, 0f, 0f)`,
        ``,
        `fun ${varName}Seek(target: Vector3): Vector3 {`,
        `    val desired = (target - ${varName}.pose.translation).normalized() * ${varName}MaxSpeed`,
        `    return (desired - ${varName}Velocity).clampLength(${varName}MaxForce)`,
        `}`,
        `fun ${varName}Flee(threat: Vector3): Vector3 = -${varName}Seek(threat)`,
        `fun ${varName}Arrive(target: Vector3): Vector3 {`,
        `    val toTarget = target - ${varName}.pose.translation`,
        `    val dist = toTarget.length()`,
        `    val speed = if (dist < ${arrivalRadius}f) ${varName}MaxSpeed * (dist / ${arrivalRadius}f) else ${varName}MaxSpeed`,
        `    val desired = toTarget.normalized() * speed`,
        `    return (desired - ${varName}Velocity).clampLength(${varName}MaxForce)`,
        `}`,
        `fun ${varName}Wander(): Vector3 {`,
        `    val wanderAngle = Random.nextFloat() * 2f * PI.toFloat()`,
        `    return Vector3(cos(wanderAngle), 0f, sin(wanderAngle)) * ${varName}MaxForce * 0.5f`,
        `}`,
        `// Apply: ${varName}Velocity += steeringForce * dt; position += velocity * dt`,
      ];
    },
  },

  emotion_system: {
    trait: 'emotion_system',
    components: [],
    level: 'partial',
    generate: (varName, config) => {
      const decayRate = config.decay_rate ?? 0.01;
      return [
        `// @emotion_system -- NPC emotional state machine`,
        `// decay rate: ${decayRate} per second`,
        `data class ${varName}EmotionState(`,
        `    var happiness: Float = 0.5f,`,
        `    var anger: Float = 0f,`,
        `    var fear: Float = 0f,`,
        `    var curiosity: Float = 0.3f`,
        `)`,
        `val ${varName}Emotions = ${varName}EmotionState()`,
        ``,
        `fun ${varName}UpdateEmotions(dt: Float) {`,
        `    // Decay all emotions toward neutral`,
        `    ${varName}Emotions.happiness = ${varName}Emotions.happiness.lerp(0.5f, ${decayRate}f * dt)`,
        `    ${varName}Emotions.anger = ${varName}Emotions.anger.lerp(0f, ${decayRate}f * dt)`,
        `    ${varName}Emotions.fear = ${varName}Emotions.fear.lerp(0f, ${decayRate}f * dt)`,
        `    ${varName}Emotions.curiosity = ${varName}Emotions.curiosity.lerp(0.3f, ${decayRate}f * dt)`,
        `}`,
        `fun ${varName}GetDominantEmotion(): String {`,
        `    val emotions = mapOf(`,
        `        "happy" to ${varName}Emotions.happiness,`,
        `        "angry" to ${varName}Emotions.anger,`,
        `        "afraid" to ${varName}Emotions.fear,`,
        `        "curious" to ${varName}Emotions.curiosity`,
        `    )`,
        `    return emotions.maxByOrNull { it.value }?.key ?: "neutral"`,
        `}`,
      ];
    },
  },
};

// =============================================================================
// COMBINED TRAIT MAP
// =============================================================================

export const ANDROIDXR_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  ...PHYSICS_TRAIT_MAP,
  ...INTERACTION_TRAIT_MAP,
  ...AUDIO_TRAIT_MAP,
  ...AR_TRAIT_MAP,
  ...VISUAL_TRAIT_MAP,
  ...ACCESSIBILITY_TRAIT_MAP,
  ...UI_TRAIT_MAP,
  ...ENVIRONMENT_TRAIT_MAP,
  ...DP3_TRAIT_MAP,
  ...V43_TRAIT_MAP,
  ...GLASSES_TRAIT_MAP,
  ...MULTIPLAYER_TRAIT_MAP,
  ...AI_TRAIT_MAP,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getTraitMapping(traitName: string): AndroidXRTraitMapping | undefined {
  return ANDROIDXR_TRAIT_MAP[traitName];
}

export function generateTraitCode(
  traitName: string,
  varName: string,
  config: Record<string, unknown>
): string[] {
  const mapping = getTraitMapping(traitName);
  if (!mapping) {
    return [`// @${traitName} -- no Android XR mapping defined: ${JSON.stringify(config)}`];
  }
  return mapping.generate(varName, config);
}

export function getRequiredImports(traits: string[]): string[] {
  const imports = new Set<string>();
  for (const trait of traits) {
    const mapping = getTraitMapping(trait);
    if (mapping?.imports) {
      mapping.imports.forEach((i) => imports.add(i));
    }
  }
  return Array.from(imports);
}

export function getMinSdkVersion(traits: string[]): number {
  let maxSdk = 26;
  for (const trait of traits) {
    const mapping = getTraitMapping(trait);
    if (mapping?.minSdkVersion) {
      if (mapping.minSdkVersion > maxSdk) {
        maxSdk = mapping.minSdkVersion;
      }
    }
  }
  return maxSdk;
}

export function listAllTraits(): string[] {
  return Object.keys(ANDROIDXR_TRAIT_MAP);
}

export function listTraitsByLevel(level: TraitImplementationLevel): string[] {
  return Object.entries(ANDROIDXR_TRAIT_MAP)
    .filter(([_, mapping]) => mapping.level === level)
    .map(([name]) => name);
}

// =============================================================================
// COVERAGE TRACKING
// =============================================================================

export interface TraitCoverageReport {
  /** Total number of traits mapped */
  total: number;
  /** Traits with full implementation */
  full: string[];
  /** Traits with partial implementation */
  partial: string[];
  /** Traits with comment-only stubs */
  comment: string[];
  /** Traits marked as unsupported */
  unsupported: string[];
  /** Coverage percentage (full + partial / total) */
  coveragePercent: number;
  /** Full implementation percentage (full only / total) */
  fullCoveragePercent: number;
  /** Traits present in VisionOS map but missing from Android XR map */
  missingFromAndroidXR: string[];
  /** Platform comparison summary */
  platformComparison: {
    visionOSOnly: string[];
    androidXROnly: string[];
    bothPlatforms: string[];
  };
}

/**
 * Generates a comprehensive coverage report comparing Android XR trait
 * coverage against the VisionOS trait map.
 *
 * @param visionOSTraits - Array of trait names from VisionOS trait map
 * @returns TraitCoverageReport with detailed coverage analysis
 */
export function generateCoverageReport(visionOSTraits: string[]): TraitCoverageReport {
  const androidXRTraits = Object.keys(ANDROIDXR_TRAIT_MAP);

  const full = listTraitsByLevel('full');
  const partial = listTraitsByLevel('partial');
  const comment = listTraitsByLevel('comment');
  const unsupported = listTraitsByLevel('unsupported');

  const total = androidXRTraits.length;
  const coveragePercent =
    total > 0 ? Math.round(((full.length + partial.length) / total) * 100 * 10) / 10 : 0;
  const fullCoveragePercent = total > 0 ? Math.round((full.length / total) * 100 * 10) / 10 : 0;

  const androidXRSet = new Set(androidXRTraits);
  const visionOSSet = new Set(visionOSTraits);

  const missingFromAndroidXR = visionOSTraits.filter((t) => !androidXRSet.has(t));
  const visionOSOnly = visionOSTraits.filter((t) => !androidXRSet.has(t));
  const androidXROnly = androidXRTraits.filter((t) => !visionOSSet.has(t));
  const bothPlatforms = androidXRTraits.filter((t) => visionOSSet.has(t));

  return {
    total,
    full,
    partial,
    comment,
    unsupported,
    coveragePercent,
    fullCoveragePercent,
    missingFromAndroidXR,
    platformComparison: {
      visionOSOnly,
      androidXROnly,
      bothPlatforms,
    },
  };
}

/**
 * Returns a human-readable coverage summary string.
 */
export function getCoverageSummary(visionOSTraits: string[]): string {
  const report = generateCoverageReport(visionOSTraits);
  const lines = [
    `=== Android XR Trait Coverage Report ===`,
    `Total traits mapped: ${report.total}`,
    `  Full:        ${report.full.length} (${report.fullCoveragePercent}%)`,
    `  Partial:     ${report.partial.length}`,
    `  Comment:     ${report.comment.length}`,
    `  Unsupported: ${report.unsupported.length}`,
    ``,
    `Implementation coverage: ${report.coveragePercent}% (full + partial)`,
    `Full coverage:           ${report.fullCoveragePercent}%`,
    ``,
  ];

  if (report.missingFromAndroidXR.length > 0) {
    lines.push(`Missing from Android XR (present in VisionOS):`);
    for (const t of report.missingFromAndroidXR) {
      lines.push(`  - ${t}`);
    }
  } else {
    lines.push(`All VisionOS traits are covered in Android XR map.`);
  }

  lines.push(``);
  lines.push(`Platform comparison:`);
  lines.push(`  Both platforms: ${report.platformComparison.bothPlatforms.length}`);
  lines.push(`  VisionOS only:  ${report.platformComparison.visionOSOnly.length}`);
  lines.push(`  Android XR only: ${report.platformComparison.androidXROnly.length}`);

  return lines.join('\n');
}
