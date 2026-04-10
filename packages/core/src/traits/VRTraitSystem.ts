/**
 * VR Trait System
 *
 * Implements VR interaction traits for HoloScript+ objects:
 * - @grabbable - Hand grab interactions
 * - @throwable - Physics-based throwing
 * - @pointable - Laser pointer interactions
 * - @hoverable - Hover state and highlights
 * - @scalable - Two-handed scaling
 * - @rotatable - Rotation interactions
 * - @stackable - Stacking behavior
 * - @snappable - Snap-to-point behavior
 * - @breakable - Destruction on impact
 *
 * @version 1.0.0
 */

import type {
  VRTraitName,
  VRHand,
  Vector3,
  Vector3Tuple,
  GrabbableTrait,
  ThrowableTrait,
  PointableTrait,
  HoverableTrait,
  ScalableTrait,
  RotatableTrait,
  StackableTrait,
  SnappableTrait,
  BreakableTrait,
  SkeletonTrait,
  BodyTrait,
  ProactiveTrait,
  HSPlusNode,
} from '../types/HoloScriptPlus';

/** Helper to convert Vector3 (object or tuple) to a tuple for indexed access */
function vec3ToTuple(v: Vector3): Vector3Tuple {
  if (Array.isArray(v)) return v as Vector3Tuple;
  return [v.x ?? 0, v.y ?? 0, v.z ?? 0];
}

import {
  TraitHandler,
  TraitContext,
  AccessibilityContext,
  VRContext,
  PhysicsContext,
  AudioContext,
  HapticsContext,
  TraitEvent,
  RaycastHit,
} from './TraitTypes';

export type {
  TraitHandler,
  TraitContext,
  AccessibilityContext,
  VRContext,
  PhysicsContext,
  AudioContext,
  HapticsContext,
  TraitEvent,
  RaycastHit,
};

// Import all trait handlers here at the top
import { seatedHandler } from './SeatedTrait';
import { hapticHandler } from './HapticTrait';
import { eyeTrackedHandler } from './EyeTrackedTrait';
import { planeDetectionHandler } from './PlaneDetectionTrait';
import { meshDetectionHandler } from './MeshDetectionTrait';
import { roomMeshHandler } from './RoomMeshTrait';
import { aiUpscalingHandler, neuralUpscalingHandler } from './AiUpscalingTrait';
import { anchorHandler } from './AnchorTrait';
import { persistentAnchorHandler } from './PersistentAnchorTrait';
import { sharedAnchorHandler } from './SharedAnchorTrait';
import { geospatialEnvHandler } from './GeospatialEnvTrait';
import { occlusionHandler } from './OcclusionTrait';
import { lightEstimationHandler } from './LightEstimationTrait';
import { handTrackingHandler } from './HandTrackingTrait';
import { controllerInputHandler } from './ControllerInputTrait';
import { bodyTrackingHandler } from './BodyTrackingTrait';
import { faceTrackingHandler } from './FaceTrackingTrait';
import { spatialAccessoryHandler } from './SpatialAccessoryTrait';
import { accessibleHandler } from './AccessibleTrait';
import { altTextHandler } from './AltTextTrait';
import { spatialAudioCueHandler } from './SpatialAudioCueTrait';
import { sonificationHandler } from './SonificationTrait';
import { hapticCueHandler } from './HapticCueTrait';
import { magnifiableHandler } from './MagnifiableTrait';
import { highContrastHandler } from './HighContrastTrait';
import { motionReducedHandler } from './MotionReducedTrait';
import { subtitleHandler } from './SubtitleTrait';
import { screenReaderHandler } from './ScreenReaderTrait';
import { gaussianSplatHandler } from './GaussianSplatTrait';
import { nerfHandler } from './NerfTrait';
import { volumetricVideoHandler } from './VolumetricVideoTrait';
import { pointCloudHandler } from './PointCloudTrait';
import { photogrammetryHandler } from './PhotogrammetryTrait';
import { computeHandler } from './ComputeTrait';
import { gpuParticleHandler } from './GPUParticleTrait';
import { gpuPhysicsHandler } from './GPUPhysicsTrait';
import { gpuBufferHandler } from './GPUBufferTrait';
import { sensorHandler } from './SensorTrait';
import { digitalTwinHandler } from './DigitalTwinTrait';
import { dataBindingHandler } from './DataBindingTrait';
import { alertHandler } from './AlertTrait';
import { heatmap3dHandler } from './Heatmap3DTrait';
import { behaviorTreeHandler } from './BehaviorTreeTrait';
import { feedbackLoopHandler } from './FeedbackLoopTrait';
import { economyPrimitivesHandler } from './EconomyPrimitivesTrait';
import { goalOrientedHandler } from './GoalOrientedTrait';
import { llmAgentHandler } from './LLMAgentTrait';
import { neuralLinkHandler } from './NeuralLinkTrait';
import { memoryHandler } from './MemoryTrait';
import { perceptionHandler } from './PerceptionTrait';
import { emotionHandler } from './EmotionTrait';
import { dialogueHandler } from './DialogueTrait';
import { factionHandler } from './FactionTrait';
import { patrolHandler } from './PatrolTrait';
import { ambisonicsHandler } from './AmbisonicsTrait';
import { hrtfHandler } from './HRTFTrait';
import { reverbZoneHandler } from './ReverbZoneTrait';
import { audioOcclusionHandler } from './AudioOcclusionTrait';
import { audioPortalHandler } from './AudioPortalTrait';
import { audioMaterialHandler } from './AudioMaterialTrait';
import { headTrackedAudioHandler } from './HeadTrackedAudioTrait';
import { usdHandler } from './USDTrait';
import { gltfHandler } from './GLTFTrait';
import { fbxHandler } from './FBXTrait';
import { materialXHandler } from './MaterialXTrait';
import { sceneGraphHandler } from './SceneGraphTrait';
import { coLocatedHandler } from './CoLocatedTrait';
import { remotePresenceHandler } from './RemotePresenceTrait';
import { sharedWorldHandler } from './SharedWorldTrait';
import { voiceProximityHandler } from './VoiceProximityTrait';
import { avatarEmbodimentHandler } from './AvatarEmbodimentTrait';
import { spectatorHandler } from './SpectatorTrait';
import { roleHandler } from './RoleTrait';
import { geospatialAnchorHandler } from './GeospatialAnchorTrait';
import { terrainAnchorHandler } from './TerrainAnchorTrait';
import { rooftopAnchorHandler } from './RooftopAnchorTrait';
import { vpsHandler } from './VPSTrait';
import { poiHandler } from './POITrait';
import { nftHandler } from './NFTTrait';
import { tokenGatedHandler } from './TokenGatedTrait';
import { zkPrivateHandler } from './ZKPrivateTrait';
import { walletHandler } from './WalletTrait';
import { marketplaceHandler } from './MarketplaceTrait';
import { portableHandler } from './PortableTrait';
import { clothHandler } from './ClothTrait';
import { fluidHandler } from './FluidTrait';
import { softBodyHandler } from './SoftBodyTrait';
import { ropeHandler } from './RopeTrait';
import { chainHandler } from './ChainTrait';
import { roadmapNodeHandler } from './RoadmapTrait';
import { mitosisHandler } from './MitosisTrait';
import { windHandler } from './WindTrait';
import { buoyancyHandler } from './BuoyancyTrait';
import { destructionHandler } from './DestructionTrait';
import { userMonitorHandler } from './UserMonitorTrait';
import { emotionalVoiceHandler } from './EmotionalVoiceTrait';
import { flowFieldHandler } from './FlowFieldTrait';
import { layerAwareHandler } from './LayerAwareTrait';

// v3.1 Agentic Choreography traits
import { choreographyHandler } from './ChoreographyTrait';
import { negotiationHandler } from './NegotiationTrait';

// v3.3 Multiplayer Networking
import { networkedHandler } from './NetworkedTraitHandler';

// Enterprise Multi-Tenancy
import { tenantHandler } from './TenantTrait';
import { rbacHandler } from './RBACTrait';
import { quotaHandler } from './QuotaTrait';
import { ssoSamlHandler, ssoOidcHandler } from './SSOTrait';
import { auditLogHandler } from './AuditLogTrait';

// Scripting & Automation
import { cronHandler } from './CronTrait';
import { pipelineHandler } from './PipelineTrait';
import { watcherHandler } from './WatcherTrait';
import { taskQueueHandler } from './TaskQueueTrait';
import { webhookHandler } from './WebhookTrait';
import { shellHandler } from './ShellTrait';
import { httpClientHandler } from './HttpClientTrait';
import { SandboxExecutionTrait } from './SandboxExecutionTrait';
import { retryHandler } from './RetryTrait';
import { schedulerHandler } from './SchedulerTrait';
import { circuitBreakerHandler } from './CircuitBreakerTrait';
import { rateLimiterHandler } from './RateLimiterTrait';
import { timeoutGuardHandler } from './TimeoutGuardTrait';
import { transformHandler } from './TransformTrait';
import { bufferHandler } from './BufferTrait';
import { structuredLoggerHandler } from './StructuredLoggerTrait';

// Data & Storage handlers
import { databaseHandler } from './DatabaseTrait';
import { cacheHandler } from './CacheTrait';
import { streamHandler } from './StreamTrait';
import { snapshotHandler } from './SnapshotTrait';
import { migrateHandler } from './MigrateTrait';
import { queryHandler } from './QueryTrait';
import { indexHandler } from './IndexTrait';

// Observability handlers
import { healthcheckHandler } from './HealthcheckTrait';
import { profilerHandler } from './ProfilerTrait';
import { sloMonitorHandler } from './SLOMonitorTrait';
import { logAggregatorHandler } from './LogAggregatorTrait';
import { incidentHandler } from './IncidentTrait';

// Communication handlers
import { emailHandler } from './EmailTrait';
import { smsHandler } from './SmsTrait';
import { pushNotificationHandler } from './PushNotificationTrait';
import { slackHandler } from './SlackTrait';
import { discordHandler } from './DiscordTrait';
import { mqttPubHandler } from './MqttPubTrait';
import { sseHandler } from './SseTrait';

// ML / Inference handlers
import { modelLoadHandler } from './ModelLoadTrait';
import { inferenceHandler } from './InferenceTrait';
import { embeddingHandler } from './EmbeddingTrait';
import { fineTuneHandler } from './FineTuneTrait';
import { vectorSearchHandler } from './VectorSearchTrait';
import { promptTemplateHandler } from './PromptTemplateTrait';

// DevOps / CI handlers
import { deployHandler } from './DeployTrait';
import { rollbackHandler } from './RollbackTrait';
import { canaryHandler } from './CanaryTrait';
import { featureFlagHandler } from './FeatureFlagTrait';
import { envConfigHandler } from './EnvConfigTrait';
import { secretHandler } from './SecretTrait';

// Auth / Identity handlers
import { jwtHandler } from './JwtTrait';
import { oauthHandler } from './OauthTrait';
import { apiKeyHandler } from './ApiKeyTrait';
import { sessionHandler } from './SessionTrait';
import { permissionHandler } from './PermissionTrait';
import { mfaHandler } from './MfaTrait';

// Payment handlers (walletHandler already imported in Phase 12 block above)
import { stripeHandler } from './StripeTrait';
import { invoiceHandler } from './InvoiceTrait';
import { subscriptionHandler } from './SubscriptionTrait';
import { refundHandler } from './RefundTrait';

// Media / Content handlers
import { imageResizeHandler } from './ImageResizeTrait';
import { videoTranscodeHandler } from './VideoTranscodeTrait';
import { pdfGenerateHandler } from './PdfGenerateTrait';
import { markdownRenderHandler } from './MarkdownRenderTrait';

// Testing / QA handlers
import { mockHandler } from './MockTrait';
import { fixtureHandler } from './FixtureTrait';
import { snapshotTestHandler } from './SnapshotTestTrait';
import { loadTestHandler } from './LoadTestTrait';
import { chaosTestHandler } from './ChaosTestTrait';

// Workflow / BPM handlers
import { workflowHandler } from './WorkflowTrait';
import { approvalHandler } from './ApprovalTrait';
import { stateMachineHandler } from './StateMachineTrait';
import { formBuilderHandler } from './FormBuilderTrait';

// i18n / Localization handlers
import { localeHandler } from './LocaleTrait';
import { translationHandler } from './TranslationTrait';
import { rtlHandler } from './RtlTrait';
import { timezoneHandler } from './TimezoneTrait';

// Data Pipeline / ETL handlers
import { etlHandler } from './EtlTrait';
import { batchJobHandler } from './BatchJobTrait';
import { dataTransformHandler } from './DataTransformTrait';
import { schemaMigrateHandler } from './SchemaMigrateTrait';
import { dataQualityHandler } from './DataQualityTrait';

// Notification / Alerting handlers
import { webhookOutHandler } from './WebhookOutTrait';
import { pagerdutyHandler } from './PagerdutyTrait';
import { slackAlertHandler } from './SlackAlertTrait';

// Search handlers
import { fullTextSearchHandler } from './FullTextSearchTrait';
import { facetedSearchHandler } from './FacetedSearchTrait';
import { autocompleteHandler } from './AutocompleteTrait';

// Compliance / Governance handlers
import { gdprHandler } from './GdprTrait';
import { dataRetentionHandler } from './DataRetentionTrait';
import { consentManagementHandler } from './ConsentManagementTrait';

// File Storage handlers
import { s3UploadHandler } from './S3UploadTrait';
import { fileSystemHandler } from './FileSystemTrait';
import { blobStoreHandler } from './BlobStoreTrait';

// API Gateway handlers
import { graphqlHandler } from './GraphqlTrait';
import { restEndpointHandler } from './RestEndpointTrait';
import { rpcHandler } from './RpcTrait';

// Feature Flags handlers (featureFlagHandler + canaryHandler already imported in DevOps / CI block)
import { abTestHandler } from './ABTestTrait';
import { rolloutHandler } from './RolloutTrait';

// Audit Trail handlers (auditLogHandler already imported in Enterprise Multi-Tenancy block)
import { changeTrackingHandler } from './ChangeTrackingTrait';
import { dataLineageHandler } from './DataLineageTrait';

import { computeShaderHandler } from './ComputeShaderTrait';
import { renderPipelineHandler } from './RenderPipelineTrait';
import { postProcessHandler } from './PostProcessTrait';
import { rayTraceHandler } from './RayTraceTrait';

import { tensorOpHandler } from './TensorOpTrait';
import { onnxRuntimeHandler } from './OnnxRuntimeTrait';
import { trainingLoopHandler } from './TrainingLoopTrait';

// Database / Persistence handlers
import { sqlQueryHandler } from './SqlQueryTrait';
import { ormEntityHandler } from './OrmEntityTrait';
import { offlineSyncHandler } from './OfflineSyncTrait';
import { reactiveStoreHandler } from './ReactiveStoreTrait';

// Spatial Algorithms handlers
import { astarHandler } from './AstarTrait';
import { navmeshSolverHandler } from './NavmeshSolverTrait';
import { optimizationHandler } from './OptimizationTrait';

// Debug / Cinematic handlers
import { timeTravelDebugHandler } from './TimeTravelDebugTrait';
import { spatialProfilerHandler } from './SpatialProfilerTrait';
import { cinematicSeqHandler } from './CinematicSeqTrait';
import { aiCameraHandler } from './AiCameraTrait';

// FFI / OS handlers
import { ffiHandler } from './FfiTrait';
import { nativeCallHandler } from './NativeCallTrait';
import { wasmBridgeHandler } from './WasmBridgeTrait';
import { sysIoHandler } from './SysIoTrait';

// Concurrency handlers
import { actorHandler } from './ActorTrait';
import { cspChannelHandler } from './CspChannelTrait';
import { temporalGuardHandler } from './TemporalGuardTrait';
import { deadlockFreeHandler } from './DeadlockFreeTrait';

// ── Phase A: Previously unregistered handlers ──
import { agentDiscoveryHandler } from './AgentDiscoveryTrait';
import { agentMemoryHandler } from './AgentMemoryTrait';
import { agentPortalHandler } from './AgentPortalTrait';
import { aiInpaintingHandler } from './AiInpaintingTrait';
import { ainpcBrainHandler } from './AINPCBrainTrait';
import { aiTextureGenHandler } from './AiTextureGenTrait';
import { analyticsHandler } from './AnalyticsTrait';
import { biofeedbackHandler } from './BiofeedbackTrait';
import { blackboardHandler } from './BlackboardTrait';
import { computerUseHandler } from './ComputerUseTrait';
import { consentGateHandler } from './ConsentGateTrait';
import { controlNetHandler } from './ControlNetTrait';
import { diffusionRealtimeHandler } from './DiffusionRealtimeTrait';
import { wasmBridgeHandler as ecsWorldHandler } from './ECSWorldTrait';
import { embeddingSearchHandler } from './EmbeddingSearchTrait';
import { handMeshAIHandler } from './HandMeshAITrait';
import { hitlHandler } from './HITLTrait';
import { InteractiveGraphTrait as interactiveGraphHandler } from './InteractiveGraphTrait';
import { localLLMHandler } from './LocalLLMTrait';
import { marketplaceIntegrationHandler } from './MarketplaceIntegrationTrait';
import { messagingHandler } from './MessagingTrait';
import { mqttSinkHandler } from './MQTTSinkTrait';
import { mqttSourceHandler } from './MQTTSourceTrait';
import { multiAgentHandler } from './MultiAgentTrait';
import { networkedAvatarHandler } from './NetworkedAvatarTrait';
import { neuralAnimationHandler } from './NeuralAnimationTrait';
import { neuralForgeHandler } from './NeuralForgeTrait';
import { npcAIHandler } from './NPCAITrait';
import { objectTrackingHandler } from './ObjectTrackingTrait';
import { openXRHALHandler } from './OpenXRHALTrait';
import { orbitalHandler } from './OrbitalTrait';
import { partnerSDKHandler } from './PartnerSDKTrait';
import { poseEstimationHandler } from './PoseEstimationTrait';
import { ragKnowledgeHandler } from './RAGKnowledgeTrait';
import { realityKitMeshHandler } from './RealityKitMeshTrait';
import { renderNetworkHandler } from './RenderNetworkTrait';
import { sceneReconstructionHandler } from './SceneReconstructionTrait';
import { sharePlayHandler } from './SharePlayTrait';
import { skillRegistryHandler } from './SkillRegistryTrait';
import { spatialNavigationHandler } from './SpatialNavigationTrait';
import { spatialPersonaHandler } from './SpatialPersonaTrait';
import { stableDiffusionHandler } from './StableDiffusionTrait';
import { urdfRobotHandler } from './URDFRobotTrait';
import { vectorDBHandler } from './VectorDBTrait';
import { visionHandler } from './VisionTrait';
import { voiceMeshHandler } from './VoiceMeshTrait';
import { volumetricHandler } from './VolumetricTrait';
import { volumetricWindowHandler } from './VolumetricWindowTrait';
import { wotThingHandler } from './WoTThingTrait';

// Wisdom/Gotcha Atoms — Batch 1: Memory Cluster
import { memoryCrystalHandler } from './MemoryCrystalTrait';
import { recallTriggerHandler } from './RecallTriggerTrait';
import { forgetPolicyHandler } from './ForgetPolicyTrait';
// Wisdom/Gotcha Atoms — Batch 1: State + Resilience
import { versionedStateHandler } from './VersionedStateTrait';
import { worldHeartbeatHandler } from './WorldHeartbeatTrait';
import { circuitAutoResetHandler } from './CircuitAutoResetTrait';
// Wisdom/Gotcha Meta-Traits
import { wisdomHandler } from './WisdomTrait';
import { gotchaHandler } from './GotchaTrait';

// =============================================================================
// TRAIT STATE
// =============================================================================

interface GrabState {
  isGrabbed: boolean;
  grabbingHand: VRHand | null;
  grabOffset: Vector3Tuple;
  grabRotationOffset: Vector3Tuple;
  previousHandPositions: Vector3[];
  previousHandTimes: number[];
}

interface HoverState {
  isHovered: boolean;
  hoveringHand: VRHand | null;
  originalScale: number;
  originalColor: string | null;
}

interface PointState {
  isPointed: boolean;
  pointingHand: VRHand | null;
}

interface ScaleState {
  isScaling: boolean;
  initialDistance: number;
  initialScale: number;
}

interface RotateState {
  isRotating: boolean;
  initialHandRotation: Vector3Tuple;
  initialObjectRotation: Vector3Tuple;
}

interface StackState {
  stackedItems: HSPlusNode[];
  stackParent: HSPlusNode | null;
}

/** Collision event data shape */
interface CollisionData {
  relativeVelocity: [number, number, number];
  normal: [number, number, number];
  point: [number, number, number];
  target: HSPlusNode;
}

// =============================================================================
// GRABBABLE TRAIT
// =============================================================================

const grabbableHandler: TraitHandler<GrabbableTrait> = {
  name: 'grabbable',

  defaultConfig: {
    snap_to_hand: true,
    two_handed: false,
    haptic_on_grab: 0.5,
    grab_points: [],
    preserve_rotation: false,
    distance_grab: false,
    max_grab_distance: 3,
  },

  onAttach(node, _config, _context) {
    // Initialize grab state
    const state: GrabState = {
      isGrabbed: false,
      grabbingHand: null,
      grabOffset: [0, 0, 0],
      grabRotationOffset: [0, 0, 0],
      previousHandPositions: [],
      previousHandTimes: [],
    };
    (node as unknown as { __grabState: GrabState }).__grabState = state;
  },

  onDetach(node) {
    delete (node as unknown as { __grabState?: GrabState }).__grabState;
  },

  onUpdate(node, config, _context, _delta) {
    const state = (node as unknown as { __grabState: GrabState }).__grabState;
    if (!state?.isGrabbed || !state.grabbingHand) return;

    // Follow hand position
    const hand = state.grabbingHand;
    const handPos = vec3ToTuple(hand.position);
    const offset = state.grabOffset;
    // @ts-expect-error
    const newPosition: Vector3 = config.snap_to_hand
      ? hand.position
      : [handPos[0] + offset[0], handPos[1] + offset[1], handPos[2] + offset[2]];

    // Update position
    if (node.properties) {
      node.properties.position = newPosition;
    }

    // Track velocity for throw
    state.previousHandPositions.push(
      // @ts-expect-error
      Array.isArray(hand.position) ? [...hand.position] : { ...hand.position }
    );
    state.previousHandTimes.push(Date.now());

    // Keep last 10 frames
    if (state.previousHandPositions.length > 10) {
      state.previousHandPositions.shift();
      state.previousHandTimes.shift();
    }

    // Update rotation if not preserving
    if (!config.preserve_rotation && node.properties) {
      node.properties.rotation = hand.rotation;
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as { __grabState: GrabState }).__grabState;

    if (event.type === 'grab_start') {
      // Check distance for distance grab
      if (!config.distance_grab) {
        const evRec = event as unknown as Record<string, unknown>;
        const evHand = evRec.hand as VRHand;
        const handPos = vec3ToTuple(evHand.position);
        const nodePos = vec3ToTuple((node.properties?.position as Vector3) || [0, 0, 0]);
        const distance = Math.sqrt(
          Math.pow(handPos[0] - nodePos[0], 2) +
            Math.pow(handPos[1] - nodePos[1], 2) +
            Math.pow(handPos[2] - nodePos[2], 2)
        );
        const maxDist = (config.max_grab_distance || 3) * context.getScaleMultiplier();
        if (distance > maxDist) return;
      }

      state.isGrabbed = true;
      const evRec2 = event as unknown as Record<string, unknown>;
      const grabHand = evRec2.hand as VRHand;
      state.grabbingHand = grabHand;

      // Calculate grab offset
      const nodePosArr = vec3ToTuple((node.properties?.position as Vector3) || [0, 0, 0]);
      const handPosArr = vec3ToTuple(grabHand.position);
      state.grabOffset = [
        nodePosArr[0] - handPosArr[0],
        nodePosArr[1] - handPosArr[1],
        nodePosArr[2] - handPosArr[2],
      ];

      // Haptic feedback
      if (config.haptic_on_grab) {
        context.haptics.pulse(grabHand.id as 'left' | 'right', config.haptic_on_grab);
      }

      // Make kinematic while grabbed
      context.physics.setKinematic(node, true);

      // Emit grab event
      context.emit('grab', { node, hand: grabHand });
    }

    if (event.type === 'grab_end') {
      state.isGrabbed = false;
      state.grabbingHand = null;

      // Re-enable physics
      context.physics.setKinematic(node, false);

      // Calculate throw velocity from tracked positions
      if (state.previousHandPositions.length >= 2) {
        const len = state.previousHandPositions.length;
        const dt = (state.previousHandTimes[len - 1] - state.previousHandTimes[0]) / 1000;
        if (dt > 0) {
          const last = vec3ToTuple(state.previousHandPositions[len - 1]);
          const first = vec3ToTuple(state.previousHandPositions[0]);
          const velocity: Vector3Tuple = [
            (last[0] - first[0]) / dt,
            (last[1] - first[1]) / dt,
            (last[2] - first[2]) / dt,
          ];

          // Apply velocity if throwable trait exists
          if (node.traits?.has('throwable')) {
            const throwConfig = node.traits.get('throwable') as ThrowableTrait;
            const multiplier =
              (throwConfig.velocity_multiplier || 1) * context.getScaleMultiplier();
            // @ts-expect-error
            context.physics.applyVelocity(node, [
              velocity[0] * multiplier,
              velocity[1] * multiplier,
              velocity[2] * multiplier,
            ]);
          }
        }
      }

      // Clear tracking
      state.previousHandPositions = [];
      state.previousHandTimes = [];

      // Emit release event
      context.emit('release', { node, velocity: event.velocity });
    }
  },
};

// =============================================================================
// THROWABLE TRAIT
// =============================================================================

const throwableHandler: TraitHandler<ThrowableTrait> = {
  name: 'throwable',

  defaultConfig: {
    velocity_multiplier: 1,
    gravity: true,
    max_velocity: 50,
    spin: true,
    bounce: false,
    bounce_factor: 0.5,
  },

  onAttach(_node, _config, _context) {
    // Throwable works with grabbable - just configures throw behavior
  },

  onEvent(node, config, context, event) {
    if (event.type === 'collision' && config.bounce) {
      const evRec = event as unknown as Record<string, unknown>;
      const collision = evRec.data as CollisionData;
      const bounceFactor = config.bounce_factor || 0.5;

      // Reflect velocity
      const velocity = collision.relativeVelocity;
      const normal = collision.normal;
      const dot = velocity[0] * normal[0] + velocity[1] * normal[1] + velocity[2] * normal[2];
      // @ts-expect-error
      const reflected: Vector3 = [
        (velocity[0] - 2 * dot * normal[0]) * bounceFactor,
        (velocity[1] - 2 * dot * normal[1]) * bounceFactor,
        (velocity[2] - 2 * dot * normal[2]) * bounceFactor,
      ];

      context.physics.applyVelocity(node, reflected);
    }
  },
};

// =============================================================================
// POINTABLE TRAIT
// =============================================================================

const pointableHandler: TraitHandler<PointableTrait> = {
  name: 'pointable',

  defaultConfig: {
    highlight_on_point: true,
    highlight_color: '#00ff00',
    cursor_style: 'pointer',
  },

  onAttach(node, _config, _context) {
    const state: PointState = {
      isPointed: false,
      pointingHand: null,
    };
    (node as unknown as { __pointState: PointState }).__pointState = state;
  },

  onDetach(node) {
    delete (node as unknown as { __pointState?: PointState }).__pointState;
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as { __pointState: PointState }).__pointState;

    if (event.type === 'point_enter') {
      state.isPointed = true;
      const evRec = event as unknown as Record<string, unknown>;
      const pointHand = evRec.hand as VRHand;
      state.pointingHand = pointHand;

      if (config.highlight_on_point && node.properties) {
        node.properties.__originalEmissive = node.properties.emissive;
        node.properties.emissive = config.highlight_color;
      }

      context.emit('point_enter', { node, hand: pointHand });
    }

    if (event.type === 'point_exit') {
      state.isPointed = false;
      state.pointingHand = null;

      if (config.highlight_on_point && node.properties) {
        node.properties.emissive = node.properties.__originalEmissive || null;
        delete node.properties.__originalEmissive;
      }

      context.emit('point_exit', { node });
    }

    if (event.type === 'click') {
      const clickEvRec = event as unknown as Record<string, unknown>;
      context.emit('click', { node, hand: clickEvRec.hand as VRHand });
    }
  },
};

// =============================================================================
// HOVERABLE TRAIT
// =============================================================================

const hoverableHandler: TraitHandler<HoverableTrait> = {
  name: 'hoverable',

  defaultConfig: {
    highlight_color: '#ffffff',
    scale_on_hover: 1.1,
    show_tooltip: false,
    tooltip_offset: [0, 0.2, 0],
    glow: false,
    glow_intensity: 0.5,
  },

  onAttach(node, _config, _context) {
    const state: HoverState = {
      isHovered: false,
      hoveringHand: null,
      originalScale: typeof node.properties?.scale === 'number' ? node.properties.scale : 1,
      originalColor: null,
    };
    (node as unknown as { __hoverState: HoverState }).__hoverState = state;
  },

  onDetach(node) {
    delete (node as unknown as { __hoverState?: HoverState }).__hoverState;
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as { __hoverState: HoverState }).__hoverState;

    if (event.type === 'hover_enter') {
      state.isHovered = true;
      const hoverEvRec = event as unknown as Record<string, unknown>;
      const hoverHand = hoverEvRec.hand as VRHand;
      state.hoveringHand = hoverHand;

      // Scale up
      if (config.scale_on_hover && config.scale_on_hover !== 1 && node.properties) {
        state.originalScale = typeof node.properties.scale === 'number' ? node.properties.scale : 1;
        node.properties.scale = state.originalScale * config.scale_on_hover;
      }

      // Glow effect
      if (config.glow && node.properties) {
        state.originalColor = (node.properties.emissive as string) || null;
        node.properties.emissive = config.highlight_color;
        node.properties.emissiveIntensity = config.glow_intensity;
      }

      // Tooltip
      if (config.show_tooltip) {
        const tooltipText =
          typeof config.show_tooltip === 'string'
            ? config.show_tooltip
            : node.properties?.tooltip || node.id || node.type;
        context.emit('show_tooltip', {
          node,
          text: tooltipText,
          offset: config.tooltip_offset,
        });
      }

      context.emit('hover_enter', { node, hand: hoverHand });
    }

    if (event.type === 'hover_exit') {
      state.isHovered = false;
      state.hoveringHand = null;

      // Restore scale
      if (config.scale_on_hover && config.scale_on_hover !== 1 && node.properties) {
        node.properties.scale = state.originalScale;
      }

      // Remove glow
      if (config.glow && node.properties) {
        node.properties.emissive = state.originalColor;
        delete node.properties.emissiveIntensity;
      }

      // Hide tooltip
      if (config.show_tooltip) {
        context.emit('hide_tooltip', { node });
      }

      context.emit('hover_exit', { node });
    }
  },
};

// =============================================================================
// SCALABLE TRAIT
// =============================================================================

const scalableHandler: TraitHandler<ScalableTrait> = {
  name: 'scalable',

  defaultConfig: {
    min_scale: 0.1,
    max_scale: 10,
    uniform: true,
    pivot: [0, 0, 0],
  },

  onAttach(node, _config, _context) {
    const state: ScaleState = {
      isScaling: false,
      initialDistance: 0,
      initialScale: 1,
    };
    (node as unknown as { __scaleState: ScaleState }).__scaleState = state;
  },

  onDetach(node) {
    delete (node as unknown as { __scaleState?: ScaleState }).__scaleState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as unknown as { __scaleState: ScaleState }).__scaleState;
    if (!state?.isScaling) return;

    const { hands } = context.vr;
    if (!hands.left || !hands.right) return;

    // Calculate current distance between hands
    const rightPos = vec3ToTuple(hands.right.position);
    const leftPos = vec3ToTuple(hands.left.position);
    const currentDistance = Math.sqrt(
      Math.pow(rightPos[0] - leftPos[0], 2) +
        Math.pow(rightPos[1] - leftPos[1], 2) +
        Math.pow(rightPos[2] - leftPos[2], 2)
    );

    // Calculate scale factor
    const scaleFactor = currentDistance / state.initialDistance;
    let newScale = state.initialScale * scaleFactor;

    // Clamp scale
    newScale = Math.max(config.min_scale || 0.1, Math.min(config.max_scale || 10, newScale));

    // Magnitude Thresholding: Transition global context if scale crosses boundaries
    const scaleMultiplier = context.getScaleMultiplier();
    const effectiveScale = newScale * scaleMultiplier;

    if (effectiveScale > 1000000 && scaleMultiplier < 1000000) {
      context.setScaleContext('galactic');
      newScale /= 1000000;
    } else if (effectiveScale > 1000 && scaleMultiplier < 1000) {
      context.setScaleContext('macro');
      newScale /= 1000;
    } else if (effectiveScale < 0.001 && scaleMultiplier > 0.001) {
      context.setScaleContext('micro');
      newScale *= 1000;
    } else if (effectiveScale < 0.000001 && scaleMultiplier > 0.000001) {
      context.setScaleContext('atomic');
      newScale *= 1000000;
    }

    if (node.properties) {
      node.properties.scale = newScale;
    }

    context.emit('scale_update', { node, scale: newScale });
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as { __scaleState: ScaleState }).__scaleState;

    if (event.type === 'scale_start') {
      state.isScaling = true;
      state.initialScale = typeof node.properties?.scale === 'number' ? node.properties.scale : 1;

      // Calculate initial distance between hands
      const scaleEvRec = event as unknown as Record<string, unknown>;
      const scaleHands = scaleEvRec.hands as {
        left: { position: Vector3 };
        right: { position: Vector3 };
      };
      const leftPos = vec3ToTuple(scaleHands.left.position);
      const rightPos = vec3ToTuple(scaleHands.right.position);
      state.initialDistance = Math.sqrt(
        Math.pow(rightPos[0] - leftPos[0], 2) +
          Math.pow(rightPos[1] - leftPos[1], 2) +
          Math.pow(rightPos[2] - leftPos[2], 2)
      );

      context.emit('scale_start', { node });
    }

    if (event.type === 'scale_end') {
      state.isScaling = false;
      context.emit('scale_end', { node, finalScale: node.properties?.scale });
    }
  },
};

// =============================================================================
// ROTATABLE TRAIT
// =============================================================================

const rotatableHandler: TraitHandler<RotatableTrait> = {
  name: 'rotatable',

  defaultConfig: {
    axis: 'all',
    snap_angles: [],
    speed: 1,
  },

  onAttach(node, _config, _context) {
    const state: RotateState = {
      isRotating: false,
      initialHandRotation: [0, 0, 0],
      initialObjectRotation: [0, 0, 0],
    };
    (node as unknown as { __rotateState: RotateState }).__rotateState = state;
  },

  onDetach(node) {
    delete (node as unknown as { __rotateState?: RotateState }).__rotateState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as unknown as { __rotateState: RotateState }).__rotateState;
    if (!state?.isRotating) return;

    const hand = context.vr.getDominantHand();
    if (!hand) return;

    // Calculate rotation delta
    const handRot = vec3ToTuple(hand.rotation);
    const initHandRot = state.initialHandRotation;
    const initObjRot = state.initialObjectRotation;
    const deltaRotation: Vector3Tuple = [
      (handRot[0] - initHandRot[0]) * (config.speed || 1),
      (handRot[1] - initHandRot[1]) * (config.speed || 1),
      (handRot[2] - initHandRot[2]) * (config.speed || 1),
    ];

    // Apply axis constraint
    let newRotation: Vector3;
    switch (config.axis) {
      case 'x':
        // @ts-expect-error
        newRotation = [initObjRot[0] + deltaRotation[0], initObjRot[1], initObjRot[2]];
        break;
      case 'y':
        // @ts-expect-error
        newRotation = [initObjRot[0], initObjRot[1] + deltaRotation[1], initObjRot[2]];
        break;
      case 'z':
        // @ts-expect-error
        newRotation = [initObjRot[0], initObjRot[1], initObjRot[2] + deltaRotation[2]];
        break;
      default:
        // @ts-expect-error
        newRotation = [
          initObjRot[0] + deltaRotation[0],
          initObjRot[1] + deltaRotation[1],
          initObjRot[2] + deltaRotation[2],
        ];
    }

    // Snap to angles if configured
    if (config.snap_angles && config.snap_angles.length > 0) {
      // @ts-expect-error
      newRotation = newRotation.map((angle: number) => {
        let closest = config.snap_angles![0];
        let minDiff = Math.abs(angle - closest);
        for (const snapAngle of config.snap_angles!) {
          const diff = Math.abs(angle - snapAngle);
          if (diff < minDiff) {
            minDiff = diff;
            closest = snapAngle;
          }
        }
        // Only snap if close enough
        return minDiff < 10 ? closest : angle;
      }) as Vector3;
    }

    if (node.properties) {
      node.properties.rotation = newRotation;
    }
    context.emit('rotate_update', { node, rotation: newRotation });
  },

  onEvent(node, _config, context, event) {
    const state = (node as unknown as { __rotateState: RotateState }).__rotateState;

    if (event.type === 'rotate_start') {
      state.isRotating = true;
      state.initialHandRotation = vec3ToTuple(
        ((event as unknown as Record<string, unknown>).hand as VRHand).rotation
      );
      state.initialObjectRotation = vec3ToTuple(
        (node.properties?.rotation as Vector3) || [0, 0, 0]
      );

      context.emit('rotate_start', { node });
    }

    if (event.type === 'rotate_end') {
      state.isRotating = false;
      context.emit('rotate_end', { node, finalRotation: node.properties?.rotation });
    }
  },
};

// =============================================================================
// =============================================================================
// STACKABLE TRAIT
// =============================================================================

const stackableHandler: TraitHandler<StackableTrait> = {
  name: 'stackable',

  defaultConfig: {
    stack_axis: 'y',
    stack_offset: 0,
    max_stack: 10,
    snap_distance: 0.5,
  },

  onAttach(node, _config, _context) {
    const state: StackState = {
      stackedItems: [],
      stackParent: null,
    };
    (node as unknown as { __stackState: StackState }).__stackState = state;
  },

  onDetach(node) {
    const state = (node as unknown as { __stackState: StackState }).__stackState;
    // Remove from parent stack
    if (state.stackParent) {
      const parentState = (state.stackParent as unknown as { __stackState: StackState })
        .__stackState;
      const index = parentState.stackedItems.indexOf(node);
      if (index > -1) {
        parentState.stackedItems.splice(index, 1);
      }
    }
    // Clear children
    state.stackedItems = [];
    delete (node as unknown as { __stackState?: StackState }).__stackState;
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as { __stackState: StackState }).__stackState;

    if (event.type === 'collision' || event.type === 'trigger_enter') {
      const other =
        event.type === 'collision'
          ? ((event as unknown as Record<string, unknown>).data as CollisionData).target
          : (event as unknown as { other: HSPlusNode }).other;

      // Check if other is stackable
      if (!other.traits?.has('stackable')) return;

      const otherState = (other as unknown as { __stackState: StackState }).__stackState;
      if (!otherState) return;

      // Check stack limit
      if (state.stackedItems.length >= (config.max_stack || 10)) return;

      // Check if close enough
      const nodePosArr = vec3ToTuple((node.properties?.position as Vector3) || [0, 0, 0]);
      const otherPosArr = vec3ToTuple((other.properties?.position as Vector3) || [0, 0, 0]);

      const axisIndex = config.stack_axis === 'x' ? 0 : config.stack_axis === 'z' ? 2 : 1;
      const otherAxes = [0, 1, 2].filter((i) => i !== axisIndex);

      // Check alignment on other axes
      let aligned = true;
      for (const axis of otherAxes) {
        if (Math.abs(nodePosArr[axis] - otherPosArr[axis]) > (config.snap_distance || 0.5)) {
          aligned = false;
          break;
        }
      }

      if (aligned && otherPosArr[axisIndex] > nodePosArr[axisIndex]) {
        // Other is above - add to stack
        state.stackedItems.push(other);
        otherState.stackParent = node;

        // Snap position
        const stackOffset = config.stack_offset || 0;
        const newPos: Vector3Tuple = [...nodePosArr];
        newPos[axisIndex] = nodePosArr[axisIndex] + stackOffset;

        if (other.properties) {
          other.properties.position = newPos;
        }

        context.emit('stack', { parent: node, child: other });
      }
    }
  },
};

// =============================================================================
// SNAPPABLE TRAIT
// =============================================================================

const snappableHandler: TraitHandler<SnappableTrait> = {
  name: 'snappable',

  defaultConfig: {
    snap_points: [],
    snap_distance: 0.3,
    snap_rotation: false,
    magnetic: false,
  },

  onUpdate(node, config, context, _delta) {
    if (!config.snap_points || config.snap_points.length === 0) return;
    if (!config.magnetic) return;

    const nodePosArr = vec3ToTuple((node.properties?.position as Vector3) || [0, 0, 0]);

    // Find closest snap point
    let closestPoint: Vector3 | null = null;
    let closestDistance = (config.snap_distance || 0.3) * context.getScaleMultiplier();

    for (const snapPoint of config.snap_points) {
      // @ts-expect-error
      const snapArr = vec3ToTuple(snapPoint);
      const distance = Math.sqrt(
        Math.pow(nodePosArr[0] - snapArr[0], 2) +
          Math.pow(nodePosArr[1] - snapArr[1], 2) +
          Math.pow(nodePosArr[2] - snapArr[2], 2)
      );

      if (distance < closestDistance) {
        closestDistance = distance;
        // @ts-expect-error
        closestPoint = snapPoint;
      }
    }

    // Apply magnetic pull
    if (closestPoint && node.properties) {
      const pullStrength = 0.1;
      const closestArr = vec3ToTuple(closestPoint);
      node.properties.position = [
        nodePosArr[0] + (closestArr[0] - nodePosArr[0]) * pullStrength,
        nodePosArr[1] + (closestArr[1] - nodePosArr[1]) * pullStrength,
        nodePosArr[2] + (closestArr[2] - nodePosArr[2]) * pullStrength,
      ];
    }
  },

  onEvent(node, config, context, event) {
    if (event.type !== 'grab_end') return;
    if (!config.snap_points || config.snap_points.length === 0) return;

    const nodePosArr = vec3ToTuple((node.properties?.position as Vector3) || [0, 0, 0]);

    // Find closest snap point
    let closestPoint: Vector3 | null = null;
    let closestDistance = (config.snap_distance || 0.3) * context.getScaleMultiplier();

    for (const snapPoint of config.snap_points) {
      // @ts-expect-error
      const snapArr = vec3ToTuple(snapPoint);
      const distance = Math.sqrt(
        Math.pow(nodePosArr[0] - snapArr[0], 2) +
          Math.pow(nodePosArr[1] - snapArr[1], 2) +
          Math.pow(nodePosArr[2] - snapArr[2], 2)
      );

      if (distance < closestDistance) {
        closestDistance = distance;
        // @ts-expect-error
        closestPoint = snapPoint;
      }
    }

    // Snap to closest point
    if (closestPoint && node.properties) {
      node.properties.position = closestPoint;
      context.emit('snap', { node, point: closestPoint });

      // Haptic feedback
      context.haptics.pulse(
        ((event as unknown as Record<string, unknown>).hand as { id: 'left' | 'right' }).id,
        0.3
      );
    }
  },
};

// =============================================================================
// BREAKABLE TRAIT
// =============================================================================

const breakableHandler: TraitHandler<BreakableTrait> = {
  name: 'breakable',

  defaultConfig: {
    break_velocity: 5,
    fragments: 8,
    fragment_mesh: undefined,
    sound_on_break: undefined,
    respawn: false,
    respawn_delay: '5s',
  },

  onEvent(node, config, context, event) {
    if (event.type !== 'collision') return;

    const collision = (event as unknown as Record<string, unknown>).data as CollisionData;
    const impactVelocity = Math.sqrt(
      Math.pow(collision.relativeVelocity[0], 2) +
        Math.pow(collision.relativeVelocity[1], 2) +
        Math.pow(collision.relativeVelocity[2], 2)
    );

    if (impactVelocity < (config.break_velocity || 5)) return;

    // Play break sound
    if (config.sound_on_break) {
      context.audio.playSound(config.sound_on_break, {
        // @ts-expect-error
        position: collision.point,
        spatial: true,
      });
    }

    // Spawn fragments
    const fragmentCount = config.fragments || 8;
    for (let i = 0; i < fragmentCount; i++) {
      const angle = (i / fragmentCount) * Math.PI * 2;
      // @ts-expect-error
      const velocity: Vector3 = [Math.cos(angle) * 2, Math.random() * 3, Math.sin(angle) * 2];

      context.emit('spawn_fragment', {
        position: collision.point,
        velocity,
        mesh: config.fragment_mesh,
      });
    }

    // Emit break event
    context.emit('break', { node, impactVelocity, collision });

    // Handle respawn
    if (config.respawn) {
      const delay = parseDuration(config.respawn_delay || '5s');
      setTimeout(() => {
        context.emit('respawn', { node });
      }, delay);
    }

    // Mark for destruction
    if (node.properties) {
      node.properties.__destroyed = true;
    }
  },
};

// =============================================================================
// HUMANOID TRAITS
// =============================================================================

const skeletonHandler: TraitHandler<SkeletonTrait> = {
  name: 'skeleton',
  defaultConfig: {
    bones: [],
  },
  onAttach(node, config, context) {
    context.emit('skeleton_attach', { node, config });
  },
};

const bodyHandler: TraitHandler<BodyTrait> = {
  name: 'body',
  defaultConfig: {
    height: 1.8,
    proportions: {},
  },
  onAttach(node, config, context) {
    context.emit('body_attach', { node, config });
  },
};

// =============================================================================
// PROACTIVE TRAIT
// =============================================================================

/**
 * @proactive trait handler
 *
 * Implements Phase 2 'Active Autonomy'. This trait allows the object to
 * observe its environment and proactively suggest actions or state changes.
 */
const proactiveHandler: TraitHandler<ProactiveTrait> = {
  name: 'proactive',

  defaultConfig: {
    intelligence_tier: 'basic',
    observation_range: 5,
    learning_rate: 0.1,
    auto_suggest: true,
    context_window: 10,
  },

  onAttach(node, config, context) {
    context.emit('proactive_init', { nodeId: node.id, tier: config.intelligence_tier });
  },

  onUpdate(node, config, context, delta) {
    if (!config || !config.auto_suggest) return;

    // Observe proximity to user (hands or headset)
    const vr = context.vr;
    const pos = node.properties?.position as Vector3;
    if (!pos || !vr.headset.position) return;

    const posArr = vec3ToTuple(pos);
    const headArr = vec3ToTuple(vr.headset.position);
    const dx = posArr[0] - headArr[0];
    const dy = posArr[1] - headArr[1];
    const dz = posArr[2] - headArr[2];
    const distanceToHead = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distanceToHead < (config.observation_range || 5)) {
      // Logic for proactive suggestion (simulated for Phase 2 baseline)
      if (Math.random() < 0.01 * (config.learning_rate || 0.1) * delta) {
        context.emit('proactive_suggestion', {
          nodeId: node.id,
          type: 'interaction_hint',
          suggestion: 'Object is observing your proximity. Suggesting engagement.',
        });
      }
    }
  },
};

// =============================================================================
// UTILITIES
// =============================================================================

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+(?:\.\d+)?)(ms|s|m)$/);
  if (!match) return 0;

  const value = parseFloat(match[1]);
  const unit = match[2];

  switch (unit) {
    case 'ms':
      return value;
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    default:
      return value;
  }
}

// =============================================================================
// TRAIT REGISTRY
// =============================================================================

// =============================================================================
// TRAIT REGISTRY
// =============================================================================

export class VRTraitRegistry {
  private handlers: Map<VRTraitName, TraitHandler> = new Map();

  constructor() {
    // Register all built-in handlers
    this.register(grabbableHandler);
    this.register(throwableHandler);
    this.register(pointableHandler);
    this.register(hoverableHandler);
    this.register(scalableHandler);
    this.register(rotatableHandler);
    this.register(stackableHandler);
    this.register(snappableHandler);
    this.register(breakableHandler);
    this.register(skeletonHandler);
    this.register(bodyHandler);
    this.register(proactiveHandler);

    // Register VR accessibility traits
    this.register(seatedHandler as TraitHandler);
    this.register(hapticHandler as TraitHandler);
    this.register(eyeTrackedHandler as TraitHandler);
    this.register(roadmapNodeHandler as TraitHandler);
    this.register(mitosisHandler as TraitHandler);

    // Phase 1: Environment Understanding
    this.register(planeDetectionHandler as TraitHandler);
    this.register(meshDetectionHandler as TraitHandler);
    this.register(roomMeshHandler as TraitHandler);
    this.register(anchorHandler as TraitHandler);
    this.register(persistentAnchorHandler as TraitHandler);
    this.register(sharedAnchorHandler as TraitHandler);
    this.register(geospatialEnvHandler as TraitHandler);
    this.register(occlusionHandler as TraitHandler);
    this.register(lightEstimationHandler as TraitHandler);

    // Phase 2: Input Modalities
    this.register(handTrackingHandler as TraitHandler);
    this.register(controllerInputHandler as TraitHandler);
    this.register(bodyTrackingHandler as TraitHandler);
    this.register(faceTrackingHandler as TraitHandler);
    this.register(spatialAccessoryHandler as TraitHandler);

    // Phase 3: Accessibility
    this.register(accessibleHandler as TraitHandler);
    this.register(altTextHandler as TraitHandler);
    this.register(spatialAudioCueHandler as TraitHandler);
    this.register(sonificationHandler as TraitHandler);
    this.register(hapticCueHandler as TraitHandler);
    this.register(magnifiableHandler as TraitHandler);
    this.register(highContrastHandler as TraitHandler);
    this.register(motionReducedHandler as TraitHandler);
    this.register(subtitleHandler as TraitHandler);
    this.register(screenReaderHandler as TraitHandler);

    // Phase 4: Gaussian Splatting & Volumetric
    this.register(gaussianSplatHandler as TraitHandler);
    this.register(nerfHandler as TraitHandler);
    this.register(volumetricVideoHandler as TraitHandler);
    this.register(pointCloudHandler as TraitHandler);
    this.register(photogrammetryHandler as TraitHandler);

    // Phase 5: WebGPU Compute
    this.register(computeHandler as TraitHandler);
    this.register(gpuParticleHandler as TraitHandler);
    this.register(gpuPhysicsHandler as TraitHandler);
    this.register(gpuBufferHandler as TraitHandler);

    // Phase 6: Digital Twin & IoT
    this.register(sensorHandler as TraitHandler);
    this.register(digitalTwinHandler as TraitHandler);
    this.register(dataBindingHandler as TraitHandler);
    this.register(alertHandler as TraitHandler);
    this.register(heatmap3dHandler as TraitHandler);

    // Phase 7: Autonomous Agents
    this.register(behaviorTreeHandler as TraitHandler);
    this.register(feedbackLoopHandler as TraitHandler);
    this.register(economyPrimitivesHandler as TraitHandler);
    this.register(goalOrientedHandler as TraitHandler);
    this.register(llmAgentHandler as TraitHandler);
    this.register(neuralLinkHandler as TraitHandler);
    this.register(memoryHandler as TraitHandler);
    this.register(perceptionHandler as TraitHandler);
    this.register(emotionHandler as TraitHandler);
    this.register(dialogueHandler as TraitHandler);
    this.register(factionHandler as TraitHandler);
    this.register(patrolHandler as TraitHandler);

    // Phase 8: Advanced Spatial Audio
    this.register(ambisonicsHandler as TraitHandler);
    this.register(hrtfHandler as TraitHandler);
    this.register(reverbZoneHandler as TraitHandler);
    this.register(audioOcclusionHandler as TraitHandler);
    this.register(audioPortalHandler as TraitHandler);
    this.register(audioMaterialHandler as TraitHandler);
    this.register(headTrackedAudioHandler as TraitHandler);

    // Phase 9: OpenUSD & Interoperability
    this.register(usdHandler as TraitHandler);
    this.register(gltfHandler as TraitHandler);
    this.register(fbxHandler as TraitHandler);
    this.register(materialXHandler as TraitHandler);
    this.register(sceneGraphHandler as TraitHandler);

    // Phase 10: Co-Presence & Shared Experiences
    this.register(coLocatedHandler as TraitHandler);
    this.register(remotePresenceHandler as TraitHandler);
    this.register(sharedWorldHandler as TraitHandler);
    this.register(voiceProximityHandler as TraitHandler);
    this.register(avatarEmbodimentHandler as TraitHandler);
    this.register(spectatorHandler as TraitHandler);
    this.register(roleHandler as TraitHandler);

    // Phase 11: Geospatial & AR Cloud
    this.register(geospatialAnchorHandler as TraitHandler);
    this.register(terrainAnchorHandler as TraitHandler);
    this.register(rooftopAnchorHandler as TraitHandler);
    this.register(vpsHandler as TraitHandler);
    this.register(poiHandler as TraitHandler);

    // Phase 12: Web3 & Ownership
    this.register(nftHandler as TraitHandler);
    this.register(tokenGatedHandler as TraitHandler);
    this.register(walletHandler as TraitHandler);
    this.register(marketplaceHandler as TraitHandler);
    this.register(portableHandler as TraitHandler);

    // Phase 13: Physics Expansion
    this.register(clothHandler as TraitHandler);
    this.register(fluidHandler as TraitHandler);
    this.register(softBodyHandler as TraitHandler);
    this.register(ropeHandler as TraitHandler);
    this.register(chainHandler as TraitHandler);
    this.register(windHandler as TraitHandler);
    this.register(buoyancyHandler as TraitHandler);
    this.register(destructionHandler as TraitHandler);
    this.register(userMonitorHandler as TraitHandler);
    this.register(emotionalVoiceHandler as TraitHandler);
    this.register(flowFieldHandler as TraitHandler);

    // v3.1 Agentic Choreography
    this.register(choreographyHandler as TraitHandler);
    this.register(negotiationHandler as TraitHandler);

    // v3.2 UI Traits
    this.register(handMenuHandler as TraitHandler);
    this.register(scrollableHandler as TraitHandler);
    this.register(gestureHandler as TraitHandler);

    // v3.3 Multiplayer Networking
    this.register(networkedHandler as TraitHandler);

    // V43 Tier 2: AI Upscaling
    this.register(aiUpscalingHandler as TraitHandler);
    this.register(neuralUpscalingHandler as TraitHandler);

    // Enterprise Multi-Tenancy
    this.register(tenantHandler as TraitHandler);
    this.register(rbacHandler as TraitHandler);
    this.register(quotaHandler as TraitHandler);
    this.register(ssoSamlHandler as TraitHandler);
    this.register(ssoOidcHandler as TraitHandler);
    this.register(auditLogHandler as TraitHandler);

    // Scripting & Automation
    this.register(cronHandler as TraitHandler);
    this.register(pipelineHandler as TraitHandler);
    this.register(watcherHandler as TraitHandler);
    this.register(taskQueueHandler as TraitHandler);
    this.register(webhookHandler as TraitHandler);
    this.register(shellHandler as TraitHandler);
    this.register(httpClientHandler as TraitHandler);
    this.register(SandboxExecutionTrait as TraitHandler);
    this.register(retryHandler as TraitHandler);
    this.register(schedulerHandler as TraitHandler);
    this.register(circuitBreakerHandler as TraitHandler);
    this.register(rateLimiterHandler as TraitHandler);
    this.register(timeoutGuardHandler as TraitHandler);
    this.register(transformHandler as TraitHandler);
    this.register(bufferHandler as TraitHandler);
    this.register(structuredLoggerHandler as TraitHandler);

    // Data & Storage
    this.register(databaseHandler as TraitHandler);
    this.register(cacheHandler as TraitHandler);
    this.register(streamHandler as TraitHandler);
    this.register(snapshotHandler as TraitHandler);
    this.register(migrateHandler as TraitHandler);
    this.register(queryHandler as TraitHandler);
    this.register(indexHandler as TraitHandler);

    // Observability
    this.register(healthcheckHandler as TraitHandler);
    this.register(profilerHandler as TraitHandler);
    this.register(sloMonitorHandler as TraitHandler);
    this.register(logAggregatorHandler as TraitHandler);
    this.register(incidentHandler as TraitHandler);

    // Communication
    this.register(emailHandler as TraitHandler);
    this.register(smsHandler as TraitHandler);
    this.register(pushNotificationHandler as TraitHandler);
    this.register(slackHandler as TraitHandler);
    this.register(discordHandler as TraitHandler);
    this.register(mqttPubHandler as TraitHandler);
    this.register(sseHandler as TraitHandler);

    // ML / Inference
    this.register(modelLoadHandler as TraitHandler);
    this.register(inferenceHandler as TraitHandler);
    this.register(embeddingHandler as TraitHandler);
    this.register(fineTuneHandler as TraitHandler);
    this.register(vectorSearchHandler as TraitHandler);
    this.register(promptTemplateHandler as TraitHandler);

    // DevOps / CI
    this.register(deployHandler as TraitHandler);
    this.register(rollbackHandler as TraitHandler);
    this.register(canaryHandler as TraitHandler);
    this.register(featureFlagHandler as TraitHandler);
    this.register(envConfigHandler as TraitHandler);
    this.register(secretHandler as TraitHandler);

    // Auth / Identity
    this.register(jwtHandler as TraitHandler);
    this.register(oauthHandler as TraitHandler);
    this.register(apiKeyHandler as TraitHandler);
    this.register(sessionHandler as TraitHandler);
    this.register(permissionHandler as TraitHandler);
    this.register(mfaHandler as TraitHandler);

    // Payment
    this.register(stripeHandler as TraitHandler);
    this.register(invoiceHandler as TraitHandler);
    this.register(subscriptionHandler as TraitHandler);
    this.register(refundHandler as TraitHandler);
    this.register(walletHandler as TraitHandler);

    // Media / Content
    this.register(imageResizeHandler as TraitHandler);
    this.register(videoTranscodeHandler as TraitHandler);
    this.register(pdfGenerateHandler as TraitHandler);
    this.register(markdownRenderHandler as TraitHandler);

    // Scripting (existing handlers, newly registered)
    this.register(schedulerHandler as TraitHandler);
    this.register(circuitBreakerHandler as TraitHandler);
    this.register(rateLimiterHandler as TraitHandler);
    this.register(timeoutGuardHandler as TraitHandler);
    this.register(transformHandler as TraitHandler);
    this.register(bufferHandler as TraitHandler);
    this.register(structuredLoggerHandler as TraitHandler);

    // Testing / QA
    this.register(mockHandler as TraitHandler);
    this.register(fixtureHandler as TraitHandler);
    this.register(snapshotTestHandler as TraitHandler);
    this.register(loadTestHandler as TraitHandler);
    this.register(chaosTestHandler as TraitHandler);

    // Workflow / BPM
    this.register(workflowHandler as TraitHandler);
    this.register(approvalHandler as TraitHandler);
    this.register(stateMachineHandler as TraitHandler);
    this.register(formBuilderHandler as TraitHandler);

    // i18n / Localization
    this.register(localeHandler as TraitHandler);
    this.register(translationHandler as TraitHandler);
    this.register(rtlHandler as TraitHandler);
    this.register(timezoneHandler as TraitHandler);

    // Data Pipeline / ETL
    this.register(etlHandler as TraitHandler);
    this.register(batchJobHandler as TraitHandler);
    this.register(dataTransformHandler as TraitHandler);
    this.register(schemaMigrateHandler as TraitHandler);
    this.register(dataQualityHandler as TraitHandler);

    // Notification / Alerting
    this.register(webhookOutHandler as TraitHandler);
    this.register(pagerdutyHandler as TraitHandler);
    this.register(slackAlertHandler as TraitHandler);

    // Search
    this.register(fullTextSearchHandler as TraitHandler);
    this.register(facetedSearchHandler as TraitHandler);
    this.register(autocompleteHandler as TraitHandler);

    // Compliance / Governance
    this.register(gdprHandler as TraitHandler);
    this.register(dataRetentionHandler as TraitHandler);
    this.register(consentManagementHandler as TraitHandler);

    // File Storage
    this.register(s3UploadHandler as TraitHandler);
    this.register(fileSystemHandler as TraitHandler);
    this.register(blobStoreHandler as TraitHandler);

    // API Gateway
    this.register(graphqlHandler as TraitHandler);
    this.register(restEndpointHandler as TraitHandler);
    this.register(rpcHandler as TraitHandler);

    // Feature Flags
    this.register(featureFlagHandler as TraitHandler);
    this.register(abTestHandler as TraitHandler);
    this.register(rolloutHandler as TraitHandler);
    this.register(canaryHandler as TraitHandler);

    // Audit Trail
    this.register(auditLogHandler as TraitHandler);
    this.register(changeTrackingHandler as TraitHandler);
    this.register(dataLineageHandler as TraitHandler);

    // GPU Compute
    this.register(computeShaderHandler as TraitHandler);
    this.register(renderPipelineHandler as TraitHandler);
    this.register(postProcessHandler as TraitHandler);
    this.register(rayTraceHandler as TraitHandler);
    this.register(computeHandler as TraitHandler);

    // ML / Tensor
    this.register(tensorOpHandler as TraitHandler);
    this.register(onnxRuntimeHandler as TraitHandler);
    this.register(trainingLoopHandler as TraitHandler);
    this.register(modelLoadHandler as TraitHandler);
    this.register(inferenceHandler as TraitHandler);
    this.register(embeddingHandler as TraitHandler);

    // Database / Persistence
    this.register(sqlQueryHandler as TraitHandler);
    this.register(ormEntityHandler as TraitHandler);
    this.register(offlineSyncHandler as TraitHandler);
    this.register(reactiveStoreHandler as TraitHandler);

    // Spatial Algorithms
    this.register(astarHandler as TraitHandler);
    this.register(navmeshSolverHandler as TraitHandler);
    this.register(optimizationHandler as TraitHandler);

    // Debug / Cinematic
    this.register(timeTravelDebugHandler as TraitHandler);
    this.register(spatialProfilerHandler as TraitHandler);
    this.register(cinematicSeqHandler as TraitHandler);
    this.register(aiCameraHandler as TraitHandler);

    // FFI / OS
    this.register(ffiHandler as TraitHandler);
    this.register(nativeCallHandler as TraitHandler);
    this.register(wasmBridgeHandler as TraitHandler);
    this.register(sysIoHandler as TraitHandler);

    // Concurrency
    this.register(actorHandler as TraitHandler);
    this.register(cspChannelHandler as TraitHandler);
    this.register(temporalGuardHandler as TraitHandler);
    this.register(deadlockFreeHandler as TraitHandler);

    // ── Phase A: Previously unregistered handlers ──
    this.register(agentDiscoveryHandler as TraitHandler);
    this.register(agentMemoryHandler as unknown as TraitHandler);
    this.register(agentPortalHandler as TraitHandler);
    this.register(aiInpaintingHandler as TraitHandler);
    this.register(ainpcBrainHandler as TraitHandler);
    this.register(aiTextureGenHandler as TraitHandler);
    this.register(analyticsHandler as TraitHandler);
    this.register(biofeedbackHandler as TraitHandler);
    this.register(blackboardHandler as TraitHandler);
    this.register(computerUseHandler as unknown as TraitHandler);
    this.register(consentGateHandler as TraitHandler);
    this.register(controlNetHandler as TraitHandler);
    this.register(diffusionRealtimeHandler as TraitHandler);
    this.register(ecsWorldHandler as TraitHandler);
    this.register(embeddingSearchHandler as TraitHandler);
    this.register(handMeshAIHandler as TraitHandler);
    this.register(hitlHandler as TraitHandler);
    this.register(interactiveGraphHandler as TraitHandler);
    this.register(localLLMHandler as unknown as TraitHandler);
    this.register(marketplaceIntegrationHandler as TraitHandler);
    this.register(messagingHandler as unknown as TraitHandler);
    this.register(mqttSinkHandler as TraitHandler);
    this.register(mqttSourceHandler as TraitHandler);
    this.register(multiAgentHandler as TraitHandler);
    this.register(networkedAvatarHandler as TraitHandler);
    this.register(neuralAnimationHandler as TraitHandler);
    this.register(neuralForgeHandler as TraitHandler);
    this.register(npcAIHandler as TraitHandler);
    this.register(objectTrackingHandler as TraitHandler);
    this.register(openXRHALHandler as TraitHandler);
    this.register(orbitalHandler as TraitHandler);
    this.register(partnerSDKHandler as TraitHandler);
    this.register(poseEstimationHandler as TraitHandler);
    this.register(ragKnowledgeHandler as TraitHandler);
    this.register(realityKitMeshHandler as TraitHandler);
    this.register(renderNetworkHandler as TraitHandler);
    this.register(sceneReconstructionHandler as TraitHandler);
    this.register(sharePlayHandler as TraitHandler);
    this.register(skillRegistryHandler as unknown as TraitHandler);
    this.register(spatialNavigationHandler as TraitHandler);
    this.register(spatialPersonaHandler as TraitHandler);
    this.register(stableDiffusionHandler as TraitHandler);
    this.register(urdfRobotHandler as TraitHandler);
    this.register(vectorDBHandler as TraitHandler);
    this.register(visionHandler as TraitHandler);
    this.register(voiceMeshHandler as TraitHandler);
    this.register(volumetricHandler as TraitHandler);
    this.register(volumetricWindowHandler as TraitHandler);
    this.register(wotThingHandler as TraitHandler);

    // Wisdom/Gotcha Atoms — Batch 1: Memory Cluster
    this.register(memoryCrystalHandler as TraitHandler);
    this.register(recallTriggerHandler as TraitHandler);
    this.register(forgetPolicyHandler as TraitHandler);
    // Wisdom/Gotcha Atoms — Batch 1: State + Resilience
    this.register(versionedStateHandler as TraitHandler);
    this.register(worldHeartbeatHandler as TraitHandler);
    this.register(circuitAutoResetHandler as TraitHandler);
    // Wisdom/Gotcha Meta-Traits
    this.register(wisdomHandler as TraitHandler);
    this.register(gotchaHandler as TraitHandler);

    // ── CLASS trait handlers (auto-generated wrappers) ──
    this.register(absorbHandler as TraitHandler);
    this.register(advancedClothHandler as TraitHandler);
    this.register(aIDriverHandler as TraitHandler);
    this.register(animationHandler as TraitHandler);
    this.register(characterHandler as TraitHandler);
    this.register(consensusHandler as TraitHandler);
    this.register(cRDTRoomHandler as TraitHandler);
    this.register(dialogHandler as TraitHandler);
    this.register(draftHandler as TraitHandler);
    this.register(emotionDirectiveHandler as TraitHandler);
    this.register(environmentalAudioHandler as TraitHandler);
    this.register(fluidSimulationHandler as TraitHandler);
    this.register(grabbableHandler as TraitHandler);
    this.register(granularMaterialHandler as TraitHandler);
    this.register(hotReloadHandler as TraitHandler);
    this.register(iKHandler as TraitHandler);
    this.register(jointHandler as TraitHandler);
    this.register(lightingHandler as TraitHandler);
    this.register(lipSyncHandler as TraitHandler);
    this.register(lobbyHandler as TraitHandler);
    this.register(materialHandler as TraitHandler);
    this.register(morphHandler as TraitHandler);
    this.register(multiviewGaussianRendererHandler as TraitHandler);
    this.register(networkedHandler as TraitHandler);
    this.register(pIDControllerHandler as TraitHandler);
    this.register(pressableHandler as TraitHandler);
    this.register(renderingHandler as TraitHandler);
    this.register(rigidbodyHandler as TraitHandler);
    this.register(scriptTestHandler as TraitHandler);
    this.register(shaderHandler as TraitHandler);
    this.register(skeletonHandler as TraitHandler);
    this.register(slidableHandler as TraitHandler);
    this.register(spatialAwarenessHandler as TraitHandler);
    this.register(syncTierHandler as TraitHandler);
    this.register(triggerHandler as TraitHandler);
    this.register(voiceInputHandler as TraitHandler);
    this.register(voiceOutputHandler as TraitHandler);
    this.register(voronoiFractureHandler as TraitHandler);
  }

  register<T>(handler: TraitHandler<T>): void {
    this.handlers.set(handler.name, handler as TraitHandler);
  }

  getHandler(name: VRTraitName): TraitHandler | undefined {
    return this.handlers.get(name);
  }

  attachTrait(
    node: HSPlusNode,
    traitName: VRTraitName,
    config: Record<string, unknown>,
    context: TraitContext
  ): void {
    const handler = this.handlers.get(traitName);
    if (!handler) return;

    const mergedConfig = { ...(handler.defaultConfig as object), ...(config as object) };
    if (!node.traits) {
      (node as HSPlusNode & { traits: Map<string, unknown> }).traits = new Map();
    }
    node.traits!.set(traitName, mergedConfig);

    if (handler.onAttach) {
      handler.onAttach(node, mergedConfig, context);
    }
  }

  detachTrait(node: HSPlusNode, traitName: VRTraitName, context: TraitContext): void {
    const handler = this.handlers.get(traitName);
    if (!handler) return;

    const config = node.traits?.get(traitName);
    if (config && handler.onDetach) {
      handler.onDetach(node, config, context);
    }

    node.traits?.delete(traitName);
  }

  updateTrait(
    node: HSPlusNode,
    traitName: VRTraitName,
    context: TraitContext,
    delta: number
  ): void {
    const handler = this.handlers.get(traitName);
    if (!handler || !handler.onUpdate) return;

    const config = node.traits?.get(traitName);
    if (config) {
      handler.onUpdate(node, config, context, delta);
    }
  }

  handleEvent(
    node: HSPlusNode,
    traitName: VRTraitName,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const handler = this.handlers.get(traitName);
    if (!handler || !handler.onEvent) return;

    const config = node.traits?.get(traitName);
    if (config) {
      handler.onEvent(node, config, context, event);
    }
  }

  updateAllTraits(node: HSPlusNode, context: TraitContext, delta: number): void {
    if (!node.traits) return;
    for (const traitName of node.traits.keys()) {
      this.updateTrait(node, traitName, context, delta);
    }
  }

  handleEventForAllTraits(node: HSPlusNode, context: TraitContext, event: TraitEvent): void {
    const eventType = typeof event === 'string' ? event : event.type;

    // Physics ↔ Haptics Bridge (P0 Pattern)
    // Automatically trigger light haptic feedback on physical interactions if no haptic trait override exists
    if (eventType === 'collision' || eventType === 'trigger_enter') {
      if (!node.traits?.has('haptic')) {
        const intensity = eventType === 'collision' ? 0.35 : 0.15;
        const dominant = context.vr.getDominantHand();
        if (dominant) {
          context.haptics.pulse(dominant.id as 'left' | 'right', intensity, 40);
        }
      }
    }

    if (!node.traits) return;
    for (const traitName of node.traits.keys()) {
      this.handleEvent(node, traitName, context, event);
    }
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const vrTraitRegistry = new VRTraitRegistry();

export {
  // Core VR
  grabbableHandler,
  throwableHandler,
  pointableHandler,
  hoverableHandler,
  scalableHandler,
  rotatableHandler,
  stackableHandler,
  snappableHandler,
  breakableHandler,
  skeletonHandler,
  bodyHandler,
  gaussianSplatHandler,
  nerfHandler,
  volumetricVideoHandler,
  proactiveHandler,
  seatedHandler,
  hapticHandler,
  eyeTrackedHandler,
  roadmapNodeHandler,
  mitosisHandler,
  // Phase 1: Environment Understanding
  planeDetectionHandler,
  meshDetectionHandler,
  roomMeshHandler,
  anchorHandler,
  persistentAnchorHandler,
  sharedAnchorHandler,
  geospatialEnvHandler,
  occlusionHandler,
  lightEstimationHandler,
  // Phase 2: Input Modalities
  handTrackingHandler,
  controllerInputHandler,
  bodyTrackingHandler,
  faceTrackingHandler,
  spatialAccessoryHandler,
  // Phase 3: Accessibility
  accessibleHandler,
  altTextHandler,
  spatialAudioCueHandler,
  sonificationHandler,
  hapticCueHandler,
  magnifiableHandler,
  highContrastHandler,
  motionReducedHandler,
  subtitleHandler,
  screenReaderHandler,
  // Phase 4: Gaussian Splatting & Volumetric
  pointCloudHandler,
  photogrammetryHandler,
  // Phase 5: WebGPU Compute
  computeHandler,
  gpuParticleHandler,
  gpuPhysicsHandler,
  gpuBufferHandler,
  // Phase 6: Digital Twin & IoT
  sensorHandler,
  digitalTwinHandler,
  dataBindingHandler,
  alertHandler,
  heatmap3dHandler,
  // Phase 7: Autonomous Agents
  behaviorTreeHandler,
  feedbackLoopHandler,
  economyPrimitivesHandler,
  goalOrientedHandler,
  llmAgentHandler,
  neuralLinkHandler,
  memoryHandler,
  perceptionHandler,
  emotionHandler,
  dialogueHandler,
  factionHandler,
  patrolHandler,
  // Phase 8: Advanced Spatial Audio
  ambisonicsHandler,
  hrtfHandler,
  reverbZoneHandler,
  audioOcclusionHandler,
  audioPortalHandler,
  audioMaterialHandler,
  headTrackedAudioHandler,
  // Phase 9: OpenUSD & Interoperability
  usdHandler,
  gltfHandler,
  fbxHandler,
  materialXHandler,
  sceneGraphHandler,
  // Phase 10: Co-Presence & Shared Experiences
  coLocatedHandler,
  remotePresenceHandler,
  sharedWorldHandler,
  voiceProximityHandler,
  avatarEmbodimentHandler,
  spectatorHandler,
  roleHandler,
  // Phase 11: Geospatial & AR Cloud
  geospatialAnchorHandler,
  terrainAnchorHandler,
  rooftopAnchorHandler,
  vpsHandler,
  poiHandler,
  // Phase 12: Web3 & Ownership
  nftHandler,
  tokenGatedHandler,
  zkPrivateHandler,
  walletHandler,
  marketplaceHandler,
  portableHandler,
  // Phase 13: Physics Expansion
  clothHandler,
  fluidHandler,
  softBodyHandler,
  ropeHandler,
  chainHandler,
  windHandler,
  buoyancyHandler,
  destructionHandler,
  userMonitorHandler,
  emotionalVoiceHandler,
  flowFieldHandler,
  layerAwareHandler,
  // V43 Tier 2: AI Upscaling
  aiUpscalingHandler,
  neuralUpscalingHandler,
};

import { handMenuHandler } from './HandMenuTrait';
import { scrollableHandler } from './ScrollableTrait';
import { gestureHandler } from './GestureTrait';
export { handMenuHandler, scrollableHandler, gestureHandler, networkedHandler };

// Enterprise Multi-Tenancy exports
export {
  tenantHandler,
  rbacHandler,
  quotaHandler,
  ssoSamlHandler,
  ssoOidcHandler,
  auditLogHandler,
};

// Scripting & Automation exports
export {
  cronHandler,
  pipelineHandler,
  watcherHandler,
  taskQueueHandler,
  webhookHandler,
  shellHandler,
  retryHandler,
  schedulerHandler,
  circuitBreakerHandler,
  rateLimiterHandler,
  timeoutGuardHandler,
  transformHandler,
  bufferHandler,
  structuredLoggerHandler,
};

// Data & Storage exports
export {
  databaseHandler,
  cacheHandler,
  streamHandler,
  snapshotHandler,
  migrateHandler,
  queryHandler,
  indexHandler,
};

// Observability exports
export {
  healthcheckHandler,
  profilerHandler,
  sloMonitorHandler,
  logAggregatorHandler,
  incidentHandler,
};

// Communication exports
export {
  emailHandler,
  smsHandler,
  pushNotificationHandler,
  slackHandler,
  discordHandler,
  mqttPubHandler,
  sseHandler,
};

// ML / Inference exports
export {
  modelLoadHandler,
  inferenceHandler,
  embeddingHandler,
  fineTuneHandler,
  vectorSearchHandler,
  promptTemplateHandler,
};

// DevOps / CI exports
export {
  deployHandler,
  rollbackHandler,
  canaryHandler,
  featureFlagHandler,
  envConfigHandler,
  secretHandler,
};

// Auth / Identity exports
export { jwtHandler, oauthHandler, apiKeyHandler, sessionHandler, permissionHandler, mfaHandler };

// Payment exports (walletHandler already exported in main block)
export { stripeHandler, invoiceHandler, subscriptionHandler, refundHandler };

// Media / Content exports
export { imageResizeHandler, videoTranscodeHandler, pdfGenerateHandler, markdownRenderHandler };

// Scripting (newly registered) — already exported in Scripting & Automation block above

// Testing / QA exports
export { mockHandler, fixtureHandler, snapshotTestHandler, loadTestHandler, chaosTestHandler };

// Workflow / BPM exports
export { workflowHandler, approvalHandler, stateMachineHandler, formBuilderHandler };

// i18n / Localization exports
export { localeHandler, translationHandler, rtlHandler, timezoneHandler };

// Data Pipeline / ETL exports
export {
  etlHandler,
  batchJobHandler,
  dataTransformHandler,
  schemaMigrateHandler,
  dataQualityHandler,
};

// Notification / Alerting exports
export { webhookOutHandler, pagerdutyHandler, slackAlertHandler };

// Search exports
export { fullTextSearchHandler, facetedSearchHandler, autocompleteHandler };

// Compliance / Governance exports
export { gdprHandler, dataRetentionHandler, consentManagementHandler };

// File Storage exports
export { s3UploadHandler, fileSystemHandler, blobStoreHandler };

// API Gateway exports
export { graphqlHandler, restEndpointHandler, rpcHandler };

// Feature Flags exports (featureFlagHandler, canaryHandler already exported in DevOps / CI block)
export { abTestHandler, rolloutHandler };

// Audit Trail exports (auditLogHandler already exported in Enterprise Multi-Tenancy block)
export { changeTrackingHandler, dataLineageHandler };

// GPU Compute exports
export { computeShaderHandler, renderPipelineHandler, postProcessHandler, rayTraceHandler };

// ML / Tensor exports
export { tensorOpHandler, onnxRuntimeHandler, trainingLoopHandler };

// Database / Persistence exports
export { sqlQueryHandler, ormEntityHandler, offlineSyncHandler, reactiveStoreHandler };

// Spatial Algorithms exports
export { astarHandler, navmeshSolverHandler, optimizationHandler };

// Debug / Cinematic exports
export { timeTravelDebugHandler, spatialProfilerHandler, cinematicSeqHandler, aiCameraHandler };

// FFI / OS exports
export { ffiHandler, nativeCallHandler, wasmBridgeHandler, sysIoHandler };

// Concurrency exports
export { actorHandler, cspChannelHandler, temporalGuardHandler, deadlockFreeHandler };

// Phase A: Previously unregistered handler exports
export {
  agentDiscoveryHandler,
  agentMemoryHandler,
  agentPortalHandler,
  aiInpaintingHandler,
  ainpcBrainHandler,
  aiTextureGenHandler,
  analyticsHandler,
  biofeedbackHandler,
  blackboardHandler,
  computerUseHandler,
  consentGateHandler,
  controlNetHandler,
  diffusionRealtimeHandler,
  ecsWorldHandler,
  embeddingSearchHandler,
  handMeshAIHandler,
  hitlHandler,
  interactiveGraphHandler,
  localLLMHandler,
  marketplaceIntegrationHandler,
  messagingHandler,
  mqttSinkHandler,
  mqttSourceHandler,
  multiAgentHandler,
  networkedAvatarHandler,
  neuralAnimationHandler,
  neuralForgeHandler,
  npcAIHandler,
  objectTrackingHandler,
  openXRHALHandler,
  orbitalHandler,
  partnerSDKHandler,
  poseEstimationHandler,
  ragKnowledgeHandler,
  realityKitMeshHandler,
  renderNetworkHandler,
  sceneReconstructionHandler,
  sharePlayHandler,
  skillRegistryHandler,
  spatialNavigationHandler,
  spatialPersonaHandler,
  stableDiffusionHandler,
  urdfRobotHandler,
  vectorDBHandler,
  visionHandler,
  voiceMeshHandler,
  volumetricHandler,
  volumetricWindowHandler,
  wotThingHandler,
};

// CLASS trait handler exports
import { absorbHandler } from './AbsorbTrait';
import { advancedClothHandler } from './AdvancedClothTrait';
import { aIDriverHandler } from './AIDriverTrait';
import { animationHandler } from './AnimationTrait';
import { characterHandler } from './CharacterTrait';
import { consensusHandler } from './ConsensusTrait';
import { cRDTRoomHandler } from './CRDTRoomTrait';
import { dialogHandler } from './DialogTrait';
import { draftHandler } from './DraftTrait';
import { emotionDirectiveHandler } from './EmotionDirectiveTrait';
import { environmentalAudioHandler } from './EnvironmentalAudioTrait';
import { fluidSimulationHandler } from './FluidSimulationTrait';
import { granularMaterialHandler } from './GranularMaterialTrait';
import { hotReloadHandler } from './HotReloadTrait';
import { iKHandler } from './IKTrait';
import { jointHandler } from './JointTrait';
import { lightingHandler } from './LightingTrait';
import { lipSyncHandler } from './LipSyncTrait';
import { lobbyHandler } from './LobbyTrait';
import { materialHandler } from './MaterialTrait';
import { morphHandler } from './MorphTrait';
import { multiviewGaussianRendererHandler } from './MultiviewGaussianRendererTrait';
import { pIDControllerHandler } from './PIDControllerTrait';
import { pressableHandler } from './PressableTrait';
import { renderingHandler } from './RenderingTrait';
import { rigidbodyHandler } from './RigidbodyTrait';
import { scriptTestHandler } from './ScriptTestTrait';
import { shaderHandler } from './ShaderTrait';
import { slidableHandler } from './SlidableTrait';
import { spatialAwarenessHandler } from './SpatialAwarenessTrait';
import { syncTierHandler } from './SyncTierTrait';
import { triggerHandler } from './TriggerTrait';
import { voiceInputHandler } from './VoiceInputTrait';
import { voiceOutputHandler } from './VoiceOutputTrait';
import { voronoiFractureHandler } from './VoronoiFractureTrait';

export {
  absorbHandler,
  advancedClothHandler,
  aIDriverHandler,
  animationHandler,
  characterHandler,
  consensusHandler,
  cRDTRoomHandler,
  dialogHandler,
  draftHandler,
  emotionDirectiveHandler,
  environmentalAudioHandler,
  fluidSimulationHandler,
  granularMaterialHandler,
  hotReloadHandler,
  iKHandler,
  jointHandler,
  lightingHandler,
  lipSyncHandler,
  lobbyHandler,
  materialHandler,
  morphHandler,
  multiviewGaussianRendererHandler,
  pIDControllerHandler,
  pressableHandler,
  renderingHandler,
  rigidbodyHandler,
  scriptTestHandler,
  shaderHandler,
  slidableHandler,
  spatialAwarenessHandler,
  syncTierHandler,
  triggerHandler,
  voiceInputHandler,
  voiceOutputHandler,
  voronoiFractureHandler,
};

// Wisdom/Gotcha Atoms — Batch 1: Memory Cluster exports
export { memoryCrystalHandler, recallTriggerHandler, forgetPolicyHandler };
// Wisdom/Gotcha Atoms — Batch 1: State + Resilience exports
export { versionedStateHandler, worldHeartbeatHandler, circuitAutoResetHandler };
// Wisdom/Gotcha Meta-Trait exports
export { wisdomHandler, gotchaHandler };
