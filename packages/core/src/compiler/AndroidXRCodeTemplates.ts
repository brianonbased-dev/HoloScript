import type { AndroidXRTraitMapping } from './AndroidXRComponentTypes';

/**
 * Android XR Code Templates
 *
 * Larger trait maps containing extensive Kotlin code generation templates
 * for visual, V43, and AI traits.
 */

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

export const AI_TRAIT_MAP: Record<string, AndroidXRTraitMapping> = {
  pathfinding: {
    trait: 'pathfinding',
    components: [],
    level: 'full',
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
    level: 'full',
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
    level: 'full',
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
    level: 'full',
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
    level: 'full',
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
    level: 'full',
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
    level: 'full',
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
    level: 'full',
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
    level: 'full',
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
    level: 'full',
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

