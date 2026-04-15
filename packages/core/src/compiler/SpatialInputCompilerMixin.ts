/**
 * SpatialInputCompilerMixin.ts
 *
 * Generates platform-specific input handling code for each spatial input trait
 * across four export targets: ARCore (Kotlin), ARKit (Swift), OpenXR (C++),
 * and WebXR (TypeScript/JavaScript).
 *
 * Follows the same pattern as DomainBlockCompilerMixin.ts:
 *   1. Intermediate compiled representation (CompiledSpatialInput*)
 *   2. Compile functions that extract from AST domain blocks
 *   3. Platform-specific code generation functions (compileToARCore, compileToARKit, etc.)
 *
 * @version 1.0.0
 */

import type { HoloDomainBlock } from '../parser/HoloCompositionTypes';

// =============================================================================
// COMPILED INTERMEDIATE REPRESENTATIONS
// =============================================================================

/** Compiled hand tracking input configuration */
export interface CompiledHandTracking {
  name: string;
  updateRateHz: number;
  smoothing: number;
  pinchThreshold: number;
  gripThreshold: number;
  confidenceThreshold: number;
  prediction: boolean;
  hapticOnGesture: boolean;
  gestureSet: string[];
  traits: string[];
}

/** Compiled gaze transient pointer configuration */
export interface CompiledGazeTransientPointer {
  name: string;
  dwellEnabled: boolean;
  dwellTimeMs: number;
  dwellFeedback: boolean;
  hapticOnCommit: boolean;
  hapticIntensity: number;
  maxDistance: number;
  pinchToCommit: boolean;
  traits: string[];
}

/** Compiled shared spatial anchor configuration */
export interface CompiledSharedSpatialAnchor {
  name: string;
  autoShare: boolean;
  ttlSeconds: number;
  maxRetries: number;
  retryDelayMs: number;
  qualityThreshold: number;
  persistent: boolean;
  roomId: string;
  syncTransforms: boolean;
  traits: string[];
}

/** Compiled controller input configuration */
export interface CompiledControllerInput {
  name: string;
  deadzone: number;
  triggerThreshold: number;
  gripThreshold: number;
  hapticOnPress: boolean;
  hapticIntensity: number;
  trackedButtons: string[];
  thumbstickAsDpad: boolean;
  dpadThreshold: number;
  traits: string[];
}

/** Union type for all compiled spatial input types */
export type CompiledSpatialInput =
  | { kind: 'hand_tracking'; data: CompiledHandTracking }
  | { kind: 'gaze_transient_pointer'; data: CompiledGazeTransientPointer }
  | { kind: 'shared_anchor'; data: CompiledSharedSpatialAnchor }
  | { kind: 'controller_input'; data: CompiledControllerInput };

// =============================================================================
// COMPILE FUNCTIONS â€” Extract from AST Domain Blocks
// =============================================================================

export function compileHandTrackingBlock(block: HoloDomainBlock): CompiledHandTracking {
  const props = block.properties || {};
  return {
    name: block.name || 'hand_tracker',
    updateRateHz: (props.update_rate_hz as number) ?? 90,
    smoothing: (props.smoothing as number) ?? 0.3,
    pinchThreshold: (props.pinch_threshold as number) ?? 0.8,
    gripThreshold: (props.grip_threshold as number) ?? 0.7,
    confidenceThreshold: (props.confidence_threshold as number) ?? 0.5,
    prediction: (props.prediction as boolean) ?? true,
    hapticOnGesture: (props.haptic_on_gesture as boolean) ?? true,
    gestureSet: (props.gesture_set as string[]) ?? ['pinch', 'grab', 'open_hand'],
    traits: block.traits || [],
  };
}

export function compileGazeTransientPointerBlock(
  block: HoloDomainBlock
): CompiledGazeTransientPointer {
  const props = block.properties || {};
  return {
    name: block.name || 'gaze_pointer',
    dwellEnabled: (props.dwell_enabled as boolean) ?? true,
    dwellTimeMs: (props.dwell_time_ms as number) ?? 800,
    dwellFeedback: (props.dwell_feedback as boolean) ?? true,
    hapticOnCommit: (props.haptic_on_commit as boolean) ?? true,
    hapticIntensity: (props.haptic_intensity as number) ?? 0.4,
    maxDistance: (props.max_distance as number) ?? 10,
    pinchToCommit: (props.pinch_to_commit as boolean) ?? true,
    traits: block.traits || [],
  };
}

export function compileSharedSpatialAnchorBlock(
  block: HoloDomainBlock
): CompiledSharedSpatialAnchor {
  const props = block.properties || {};
  return {
    name: block.name || 'shared_anchor',
    autoShare: (props.auto_share as boolean) ?? true,
    ttlSeconds: (props.ttl_seconds as number) ?? 0,
    maxRetries: (props.max_retries as number) ?? 5,
    retryDelayMs: (props.retry_delay_ms as number) ?? 2000,
    qualityThreshold: (props.quality_threshold as number) ?? 0.6,
    persistent: (props.persistent as boolean) ?? false,
    roomId: (props.room_id as string) ?? '',
    syncTransforms: (props.sync_transforms as boolean) ?? true,
    traits: block.traits || [],
  };
}

export function compileControllerInputBlock(block: HoloDomainBlock): CompiledControllerInput {
  const props = block.properties || {};
  return {
    name: block.name || 'controller',
    deadzone: (props.deadzone as number) ?? 0.15,
    triggerThreshold: (props.trigger_threshold as number) ?? 0.5,
    gripThreshold: (props.grip_threshold as number) ?? 0.5,
    hapticOnPress: (props.haptic_on_press as boolean) ?? true,
    hapticIntensity: (props.haptic_intensity as number) ?? 0.3,
    trackedButtons: (props.tracked_buttons as string[]) ?? [],
    thumbstickAsDpad: (props.thumbstick_as_dpad as boolean) ?? false,
    dpadThreshold: (props.dpad_threshold as number) ?? 0.7,
    traits: block.traits || [],
  };
}

/**
 * Compile a spatial input domain block by keyword.
 * Returns null if the keyword is not a recognized spatial input type.
 */
export function compileSpatialInputBlock(block: HoloDomainBlock): CompiledSpatialInput | null {
  switch (block.keyword) {
    case 'hand_tracking':
    case 'spatial_input_hand_tracking':
      return { kind: 'hand_tracking', data: compileHandTrackingBlock(block) };
    case 'gaze_transient_pointer':
    case 'spatial_input_gaze_transient_pointer':
      return { kind: 'gaze_transient_pointer', data: compileGazeTransientPointerBlock(block) };
    case 'shared_anchor':
    case 'spatial_input_anchor_shared':
      return { kind: 'shared_anchor', data: compileSharedSpatialAnchorBlock(block) };
    case 'controller_input':
    case 'spatial_input_controller':
      return { kind: 'controller_input', data: compileControllerInputBlock(block) };
    default:
      return null;
  }
}

// =============================================================================
// ARCore (Kotlin) â€” Android XR / ARCore Extensions
// =============================================================================

export function handTrackingToARCore(ht: CompiledHandTracking, varPrefix = ''): string {
  const v = varPrefix ? `${varPrefix}_` : '';
  const lines: string[] = [
    `// Hand Tracking: ${ht.name}`,
    `val ${v}handTrackingConfig = HandTrackingConfig.Builder()`,
    `    .setUpdateRateHz(${ht.updateRateHz})`,
    `    .setSmoothing(${ht.smoothing}f)`,
    `    .setPinchThreshold(${ht.pinchThreshold}f)`,
    `    .setGripThreshold(${ht.gripThreshold}f)`,
    `    .setConfidenceThreshold(${ht.confidenceThreshold}f)`,
    `    .setPrediction(${ht.prediction})`,
    `    .build()`,
    ``,
    `val ${v}handTracker = session.createHandTracker(${v}handTrackingConfig)`,
    ``,
    `// 90Hz hand tracking frame callback`,
    `${v}handTracker.setOnFrameCallback { frame ->`,
    `    val leftHand = frame.getHand(Hand.LEFT)`,
    `    val rightHand = frame.getHand(Hand.RIGHT)`,
    ``,
    `    leftHand?.let { hand ->`,
    `        val joints = hand.joints.filter { it.confidence >= ${ht.confidenceThreshold}f }`,
    `        val pinchStrength = hand.pinchStrength`,
    `        val gripStrength = hand.gripStrength`,
  ];

  if (ht.hapticOnGesture) {
    lines.push(
      `        // Haptic feedback on gesture`,
      `        if (pinchStrength >= ${ht.pinchThreshold}f) {`,
      `            vibrateController(Hand.LEFT, 0.25f, 40L)`,
      `        }`
    );
  }

  lines.push(
    `    }`,
    ``,
    `    rightHand?.let { hand ->`,
    `        val joints = hand.joints.filter { it.confidence >= ${ht.confidenceThreshold}f }`,
    `        val pinchStrength = hand.pinchStrength`,
    `        val gripStrength = hand.gripStrength`
  );

  if (ht.hapticOnGesture) {
    lines.push(
      `        if (pinchStrength >= ${ht.pinchThreshold}f) {`,
      `            vibrateController(Hand.RIGHT, 0.25f, 40L)`,
      `        }`
    );
  }

  lines.push(`    }`, `}`);

  return lines.join('\n');
}

export function gazeTransientPointerToARCore(
  gaze: CompiledGazeTransientPointer,
  varPrefix = ''
): string {
  const v = varPrefix ? `${varPrefix}_` : '';
  const lines: string[] = [
    `// Gaze Transient Pointer: ${gaze.name} (privacy-first)`,
    `// Gaze direction is NEVER exposed; only commit point at pinch moment`,
    `val ${v}gazeConfig = GazeTransientPointerConfig.Builder()`,
    `    .setMaxDistance(${gaze.maxDistance}f)`,
    `    .setDwellEnabled(${gaze.dwellEnabled})`,
    `    .setDwellTimeMs(${gaze.dwellTimeMs}L)`,
    `    .setPinchToCommit(${gaze.pinchToCommit})`,
    `    .build()`,
    ``,
    `val ${v}gazePointer = session.createGazeTransientPointer(${v}gazeConfig)`,
    ``,
    `// Only the commit intersection is revealed to the application`,
    `${v}gazePointer.setOnCommitListener { commitResult ->`,
    `    val hitPoint = commitResult.hitPoint // Vec3 - only available at pinch`,
    `    val hitNormal = commitResult.hitNormal`,
    `    val targetEntity = commitResult.targetEntity`,
  ];

  if (gaze.hapticOnCommit) {
    lines.push(
      `    // Haptic feedback on commit`,
      `    vibrateController(Hand.RIGHT, ${gaze.hapticIntensity}f, 60L)`
    );
  }

  lines.push(`    onGazeCommit(hitPoint, hitNormal, targetEntity)`, `}`);

  if (gaze.dwellEnabled) {
    lines.push(
      ``,
      `// Dwell progress (does not reveal gaze direction)`,
      `${v}gazePointer.setOnDwellProgressListener { progress ->`,
      `    onDwellProgress(progress) // [0..1]`,
      `}`
    );
  }

  return lines.join('\n');
}

export function sharedAnchorToARCore(anchor: CompiledSharedSpatialAnchor, varPrefix = ''): string {
  const v = varPrefix ? `${varPrefix}_` : '';
  const lines: string[] = [
    `// Shared Spatial Anchor: ${anchor.name}`,
    `val ${v}anchorConfig = SharedAnchorConfig.Builder()`,
    `    .setAutoShare(${anchor.autoShare})`,
    `    .setPersistent(${anchor.persistent})`,
    `    .setQualityThreshold(${anchor.qualityThreshold}f)`,
    `    .setMaxRetries(${anchor.maxRetries})`,
    `    .setRetryDelayMs(${anchor.retryDelayMs}L)`,
  ];

  if (anchor.ttlSeconds > 0) {
    lines.push(`    .setTtlSeconds(${anchor.ttlSeconds}L)`);
  }

  if (anchor.roomId) {
    lines.push(`    .setRoomId("${anchor.roomId}")`);
  }

  lines.push(
    `    .build()`,
    ``,
    `// ARCore Cloud Anchor API`,
    `val ${v}cloudAnchorFuture = session.hostCloudAnchorAsync(`,
    `    localAnchor,`,
    `    ${anchor.ttlSeconds > 0 ? anchor.ttlSeconds : 'CloudAnchorConfig.TTL_UNLIMITED'}`,
    `)`,
    ``,
    `${v}cloudAnchorFuture.addOnSuccessListener { cloudAnchor ->`,
    `    val cloudAnchorId = cloudAnchor.cloudAnchorId`,
    `    shareAnchorToRoom(cloudAnchorId, "${anchor.roomId}")`
  );

  if (anchor.syncTransforms) {
    lines.push(
      `    // Enable transform synchronization across peers`,
      `    enableTransformSync(cloudAnchor)`
    );
  }

  lines.push(
    `}`,
    ``,
    `${v}cloudAnchorFuture.addOnFailureListener { error ->`,
    `    Log.e("SharedAnchor", "Failed to host: \${error.message}")`,
    `    retryHostAnchor(${anchor.maxRetries}, ${anchor.retryDelayMs}L)`,
    `}`
  );

  return lines.join('\n');
}

export function controllerInputToARCore(ctrl: CompiledControllerInput, varPrefix = ''): string {
  const v = varPrefix ? `${varPrefix}_` : '';
  const lines: string[] = [
    `// Controller Input: ${ctrl.name}`,
    `val ${v}controllerConfig = ControllerInputConfig.Builder()`,
    `    .setDeadzone(${ctrl.deadzone}f)`,
    `    .setTriggerThreshold(${ctrl.triggerThreshold}f)`,
    `    .setGripThreshold(${ctrl.gripThreshold}f)`,
    `    .setThumbstickAsDpad(${ctrl.thumbstickAsDpad})`,
    `    .setDpadThreshold(${ctrl.dpadThreshold}f)`,
    `    .build()`,
    ``,
    `val ${v}inputManager = session.createControllerInputManager(${v}controllerConfig)`,
    ``,
    `${v}inputManager.setOnInputListener { inputEvent ->`,
    `    val hand = inputEvent.hand`,
    `    val buttons = inputEvent.buttons`,
    `    val thumbstick = inputEvent.thumbstick`,
    ``,
    `    // Apply deadzone`,
    `    val adjustedX = applyDeadzone(thumbstick[0], ${ctrl.deadzone}f)`,
    `    val adjustedY = applyDeadzone(thumbstick[1], ${ctrl.deadzone}f)`,
  ];

  if (ctrl.hapticOnPress) {
    lines.push(
      ``,
      `    // Haptic on button press`,
      `    buttons.filter { it.justPressed }.forEach { button ->`,
      `        vibrateController(hand, ${ctrl.hapticIntensity}f, 30L)`,
      `    }`
    );
  }

  lines.push(``, `    onControllerInput(hand, buttons, Vec2(adjustedX, adjustedY))`, `}`);

  return lines.join('\n');
}

// =============================================================================
// ARKit (Swift) â€” visionOS / iOS
// =============================================================================

export function handTrackingToARKit(ht: CompiledHandTracking, varPrefix = ''): string {
  const v = varPrefix ? `${varPrefix}_` : '';
  const lines: string[] = [
    `// Hand Tracking: ${ht.name}`,
    `let ${v}handTrackingProvider = HandTrackingProvider()`,
    ``,
    `// Request hand tracking authorization`,
    `Task {`,
    `    let session = ARKitSession()`,
    `    try await session.run([${v}handTrackingProvider])`,
    ``,
    `    for await update in ${v}handTrackingProvider.anchorUpdates {`,
    `        let anchor = update.anchor`,
    ``,
    `        guard anchor.isTracked else {`,
    `            onHandLost(anchor.chirality)`,
    `            continue`,
    `        }`,
    ``,
    `        let skeleton = anchor.handSkeleton`,
    `        guard let skeleton else { continue }`,
    ``,
    `        // Extract joint poses at ${ht.updateRateHz}Hz`,
    `        var jointPoses: [HandSkeleton.JointName: simd_float4x4] = [:]`,
    `        for joint in HandSkeleton.JointName.allCases {`,
    `            let jointTransform = skeleton.joint(joint)`,
    `            if jointTransform.isTracked {`,
    `                jointPoses[joint] = anchor.originFromAnchorTransform * jointTransform.anchorFromJointTransform`,
    `            }`,
    `        }`,
    ``,
    `        // Gesture detection`,
    `        let thumbTip = skeleton.joint(.thumbTip)`,
    `        let indexTip = skeleton.joint(.indexFingerTip)`,
    `        let pinchDistance = simd_distance(`,
    `            thumbTip.anchorFromJointTransform.columns.3.xyz,`,
    `            indexTip.anchorFromJointTransform.columns.3.xyz`,
    `        )`,
    `        let pinchStrength = max(0, 1.0 - (pinchDistance / 0.04))`,
  ];

  if (ht.hapticOnGesture) {
    lines.push(
      ``,
      `        if pinchStrength >= ${ht.pinchThreshold} {`,
      `            CHHapticEngine.shared?.playTransient(intensity: 0.25, sharpness: 0.5)`,
      `        }`
    );
  }

  lines.push(``, `        onHandUpdate(anchor.chirality, jointPoses, pinchStrength)`, `    }`, `}`);

  return lines.join('\n');
}

export function gazeTransientPointerToARKit(
  gaze: CompiledGazeTransientPointer,
  varPrefix = ''
): string {
  const v = varPrefix ? `${varPrefix}_` : '';
  const lines: string[] = [
    `// Gaze Transient Pointer: ${gaze.name} (visionOS privacy-first model)`,
    `// System handles gaze direction privately; app only receives commit events`,
    ``,
    `// On visionOS, the system provides hover/tap via SpatialTapGesture,`,
    `// which inherently implements the transient pointer model.`,
    `// Gaze direction is NEVER exposed to the application.`,
    ``,
    `let ${v}gazeEntity = ModelEntity()`,
    `${v}gazeEntity.components.set(InputTargetComponent(allowedInputTypes: .indirect))`,
    `${v}gazeEntity.components.set(HoverEffectComponent(.highlight))`,
    ``,
    `// Spatial tap = gaze commit (system reveals intersection at tap moment)`,
    `.gesture(SpatialTapGesture().targetedToEntity(${v}gazeEntity))`,
    `.onEnded { tapValue in`,
    `    let commitPoint = tapValue.convert(tapValue.location3D, from: .local, to: .scene)`,
    `    let targetEntity = tapValue.entity`,
  ];

  if (gaze.hapticOnCommit) {
    lines.push(
      `    // Haptic on commit`,
      `    CHHapticEngine.shared?.playTransient(intensity: ${gaze.hapticIntensity}, sharpness: 0.6)`
    );
  }

  lines.push(`    onGazeCommit(commitPoint, targetEntity)`, `}`);

  if (gaze.dwellEnabled) {
    lines.push(
      ``,
      `// Dwell accessibility support (system-managed, no gaze direction exposed)`,
      `.accessibilityAction(.activate) {`,
      `    onGazeCommit(${v}gazeEntity.position, ${v}gazeEntity)`,
      `}`
    );
  }

  return lines.join('\n');
}

export function sharedAnchorToARKit(anchor: CompiledSharedSpatialAnchor, varPrefix = ''): string {
  const v = varPrefix ? `${varPrefix}_` : '';
  const lines: string[] = [
    `// Shared Spatial Anchor: ${anchor.name}`,
    `let ${v}worldTrackingProvider = WorldTrackingProvider()`,
    ``,
    `Task {`,
    `    let session = ARKitSession()`,
    `    try await session.run([${v}worldTrackingProvider])`,
    ``,
    `    // Create world anchor`,
    `    let worldAnchor = WorldAnchor(originFromAnchorTransform: transform)`,
    `    try await ${v}worldTrackingProvider.addAnchor(worldAnchor)`,
    ``,
    `    // Share via MultipeerConnectivity or SharePlay`,
    `    let anchorData = try worldAnchor.serialize()`,
  ];

  if (anchor.roomId) {
    lines.push(
      `    let roomId = "${anchor.roomId}"`,
      `    shareAnchorData(anchorData, toRoom: roomId)`
    );
  }

  if (anchor.syncTransforms) {
    lines.push(
      ``,
      `    // Enable transform synchronization`,
      `    GroupSessionManager.shared.syncAnchor(worldAnchor)`
    );
  }

  if (anchor.persistent) {
    lines.push(
      ``,
      `    // Persist across sessions`,
      `    ${v}worldTrackingProvider.persistAnchor(worldAnchor)`
    );
  }

  lines.push(
    `}`,
    ``,
    `// Receive shared anchor from peer`,
    `func resolveSharedAnchor(_ data: Data) async throws {`,
    `    let worldAnchor = try WorldAnchor.deserialize(data)`,
    `    try await ${v}worldTrackingProvider.addAnchor(worldAnchor)`,
    `    onAnchorResolved(worldAnchor)`,
    `}`
  );

  return lines.join('\n');
}

export function controllerInputToARKit(ctrl: CompiledControllerInput, varPrefix = ''): string {
  const v = varPrefix ? `${varPrefix}_` : '';
  const lines: string[] = [
    `// Controller Input: ${ctrl.name} (visionOS uses system gestures)`,
    `// On visionOS, controller input maps to SpatialEventGesture and GameController`,
    ``,
    `import GameController`,
    ``,
    `let ${v}controllerObserver = GCController.startWirelessControllerDiscovery { controller in`,
    `    guard let extendedGamepad = controller.extendedGamepad else { return }`,
    ``,
    `    // Button handlers`,
    `    extendedGamepad.buttonA.pressedChangedHandler = { button, value, pressed in`,
    `        let adjustedValue = Float(value)`,
  ];

  if (ctrl.hapticOnPress) {
    lines.push(
      `        if pressed {`,
      `            controller.haptics?.createEngine(withLocality: .default)?.playTransient(`,
      `                intensity: ${ctrl.hapticIntensity}, sharpness: 0.5`,
      `            )`,
      `        }`
    );
  }

  lines.push(
    `        onButtonChanged(.primary, pressed: pressed, value: adjustedValue)`,
    `    }`,
    ``,
    `    // Thumbstick with deadzone`,
    `    extendedGamepad.leftThumbstick.valueChangedHandler = { stick, xValue, yValue in`,
    `        let x = applyDeadzone(Float(xValue), deadzone: ${ctrl.deadzone})`,
    `        let y = applyDeadzone(Float(yValue), deadzone: ${ctrl.deadzone})`,
    `        onThumbstickChanged(.left, x: x, y: y)`,
    `    }`,
    ``,
    `    // Trigger`,
    `    extendedGamepad.leftTrigger.valueChangedHandler = { trigger, value, pressed in`,
    `        let isActive = value >= ${ctrl.triggerThreshold}`,
    `        onTriggerChanged(.left, value: Float(value), active: isActive)`,
    `    }`,
    `}`
  );

  return lines.join('\n');
}

// =============================================================================
// OpenXR (C++) â€” Cross-Platform XR
// =============================================================================

export function handTrackingToOpenXR(ht: CompiledHandTracking, varPrefix = ''): string {
  const v = varPrefix ? `${varPrefix}_` : '';
  const lines: string[] = [
    `// Hand Tracking: ${ht.name}`,
    `// Requires XR_EXT_hand_tracking extension`,
    ``,
    `XrHandTrackerEXT ${v}handTrackerLeft = XR_NULL_HANDLE;`,
    `XrHandTrackerEXT ${v}handTrackerRight = XR_NULL_HANDLE;`,
    ``,
    `void ${v}initHandTracking(XrSession session) {`,
    `    XrHandTrackerCreateInfoEXT createInfo{XR_TYPE_HAND_TRACKER_CREATE_INFO_EXT};`,
    ``,
    `    createInfo.hand = XR_HAND_LEFT_EXT;`,
    `    createInfo.handJointSet = XR_HAND_JOINT_SET_DEFAULT_EXT;`,
    `    xrCreateHandTrackerEXT(session, &createInfo, &${v}handTrackerLeft);`,
    ``,
    `    createInfo.hand = XR_HAND_RIGHT_EXT;`,
    `    xrCreateHandTrackerEXT(session, &createInfo, &${v}handTrackerRight);`,
    `}`,
    ``,
    `// ${ht.updateRateHz}Hz hand tracking update`,
    `void ${v}updateHandTracking(XrSpace baseSpace, XrTime predictedTime) {`,
    `    XrHandJointsLocateInfoEXT locateInfo{XR_TYPE_HAND_JOINTS_LOCATE_INFO_EXT};`,
    `    locateInfo.baseSpace = baseSpace;`,
    `    locateInfo.time = predictedTime;`,
    ``,
    `    XrHandJointLocationEXT jointLocations[XR_HAND_JOINT_COUNT_EXT];`,
    `    XrHandJointLocationsEXT locations{XR_TYPE_HAND_JOINT_LOCATIONS_EXT};`,
    `    locations.jointCount = XR_HAND_JOINT_COUNT_EXT;`,
    `    locations.jointLocations = jointLocations;`,
    ``,
    `    // Left hand`,
    `    if (${v}handTrackerLeft != XR_NULL_HANDLE) {`,
    `        XrResult result = xrLocateHandJointsEXT(${v}handTrackerLeft, &locateInfo, &locations);`,
    `        if (XR_SUCCEEDED(result) && locations.isActive) {`,
    `            for (uint32_t i = 0; i < XR_HAND_JOINT_COUNT_EXT; i++) {`,
    `                if (jointLocations[i].locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) {`,
    `                    float confidence = (jointLocations[i].locationFlags & XR_SPACE_LOCATION_POSITION_TRACKED_BIT) ? 1.0f : 0.5f;`,
    `                    if (confidence >= ${ht.confidenceThreshold}f) {`,
    `                        processJoint(XR_HAND_LEFT_EXT, i, jointLocations[i], ${ht.smoothing}f);`,
    `                    }`,
    `                }`,
    `            }`,
    `            detectGestures(XR_HAND_LEFT_EXT, jointLocations, ${ht.pinchThreshold}f, ${ht.gripThreshold}f);`,
    `        }`,
    `    }`,
    ``,
    `    // Right hand`,
    `    if (${v}handTrackerRight != XR_NULL_HANDLE) {`,
    `        XrResult result = xrLocateHandJointsEXT(${v}handTrackerRight, &locateInfo, &locations);`,
    `        if (XR_SUCCEEDED(result) && locations.isActive) {`,
    `            for (uint32_t i = 0; i < XR_HAND_JOINT_COUNT_EXT; i++) {`,
    `                if (jointLocations[i].locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) {`,
    `                    float confidence = (jointLocations[i].locationFlags & XR_SPACE_LOCATION_POSITION_TRACKED_BIT) ? 1.0f : 0.5f;`,
    `                    if (confidence >= ${ht.confidenceThreshold}f) {`,
    `                        processJoint(XR_HAND_RIGHT_EXT, i, jointLocations[i], ${ht.smoothing}f);`,
    `                    }`,
    `                }`,
    `            }`,
    `            detectGestures(XR_HAND_RIGHT_EXT, jointLocations, ${ht.pinchThreshold}f, ${ht.gripThreshold}f);`,
    `        }`,
    `    }`,
    `}`,
  ];

  return lines.join('\n');
}

export function gazeTransientPointerToOpenXR(
  gaze: CompiledGazeTransientPointer,
  varPrefix = ''
): string {
  const v = varPrefix ? `${varPrefix}_` : '';
  const lines: string[] = [
    `// Gaze Transient Pointer: ${gaze.name} (privacy-first)`,
    `// Uses XR_EXT_eye_gaze_interaction with transient pointer semantics`,
    `// Gaze direction is NEVER stored or forwarded to application logic`,
    ``,
    `XrAction ${v}gazeCommitAction = XR_NULL_HANDLE;`,
    `XrSpace ${v}gazeSpace = XR_NULL_HANDLE;`,
    ``,
    `void ${v}initGazeTransientPointer(XrSession session, XrActionSet actionSet) {`,
    `    // Create gaze pose action (system-managed, privacy-preserving)`,
    `    XrActionCreateInfo actionInfo{XR_TYPE_ACTION_CREATE_INFO};`,
    `    strcpy(actionInfo.actionName, "${v}gaze_commit");`,
    `    strcpy(actionInfo.localizedActionName, "Gaze Commit");`,
    `    actionInfo.actionType = XR_ACTION_TYPE_POSE_INPUT;`,
    `    xrCreateAction(actionSet, &actionInfo, &${v}gazeCommitAction);`,
    ``,
    `    // Bind to eye gaze interaction profile`,
    `    XrPath gazePath;`,
    `    xrStringToPath(instance, "/user/eyes_ext/input/gaze_ext/pose", &gazePath);`,
    ``,
    `    XrActionSpaceCreateInfo spaceInfo{XR_TYPE_ACTION_SPACE_CREATE_INFO};`,
    `    spaceInfo.action = ${v}gazeCommitAction;`,
    `    spaceInfo.poseInActionSpace = {{0, 0, 0, 1}, {0, 0, 0}};`,
    `    xrCreateActionSpace(session, &spaceInfo, &${v}gazeSpace);`,
    `}`,
    ``,
    `// Called ONLY at pinch/commit moment â€” never continuously`,
    `void ${v}processGazeCommit(XrSpace baseSpace, XrTime time) {`,
    `    XrSpaceLocation location{XR_TYPE_SPACE_LOCATION};`,
    `    xrLocateSpace(${v}gazeSpace, baseSpace, time, &location);`,
    ``,
    `    if (location.locationFlags & XR_SPACE_LOCATION_POSITION_VALID_BIT) {`,
    `        // Perform raycast from gaze pose at this exact moment only`,
    `        XrPosef gazePose = location.pose;`,
    `        RaycastResult hit = castRay(gazePose, ${gaze.maxDistance}f);`,
    ``,
    `        if (hit.isValid) {`,
    `            onGazeCommit(hit.point, hit.normal, hit.entityId);`,
  ];

  if (gaze.hapticOnCommit) {
    lines.push(
      `            // Haptic feedback`,
      `            XrHapticVibration vibration{XR_TYPE_HAPTIC_VIBRATION};`,
      `            vibration.amplitude = ${gaze.hapticIntensity}f;`,
      `            vibration.duration = XR_MIN_HAPTIC_DURATION;`,
      `            vibration.frequency = XR_FREQUENCY_UNSPECIFIED;`,
      `            xrApplyHapticFeedback(session, &hapticInfo, (XrHapticBaseHeader*)&vibration);`
    );
  }

  lines.push(
    `        }`,
    `    }`,
    `    // NOTE: gaze pose is NOT stored â€” privacy invariant maintained`,
    `}`
  );

  return lines.join('\n');
}

export function sharedAnchorToOpenXR(anchor: CompiledSharedSpatialAnchor, varPrefix = ''): string {
  const v = varPrefix ? `${varPrefix}_` : '';
  const lines: string[] = [
    `// Shared Spatial Anchor: ${anchor.name}`,
    `// Uses XR_MSFT_spatial_anchor_sharing or platform-specific extension`,
    ``,
    `XrSpace ${v}anchorSpace = XR_NULL_HANDLE;`,
    ``,
    `void ${v}createSharedAnchor(XrSession session, XrSpace baseSpace, XrTime time, XrPosef pose) {`,
    `    // Create spatial anchor`,
    `    XrSpatialAnchorCreateInfoMSFT createInfo{XR_TYPE_SPATIAL_ANCHOR_CREATE_INFO_MSFT};`,
    `    createInfo.space = baseSpace;`,
    `    createInfo.pose = pose;`,
    `    createInfo.time = time;`,
    ``,
    `    XrSpatialAnchorMSFT anchor;`,
    `    XrResult result = xrCreateSpatialAnchorMSFT(session, &createInfo, &anchor);`,
    ``,
    `    if (XR_SUCCEEDED(result)) {`,
    `        // Create space from anchor`,
    `        XrSpatialAnchorSpaceCreateInfoMSFT spaceInfo{XR_TYPE_SPATIAL_ANCHOR_SPACE_CREATE_INFO_MSFT};`,
    `        spaceInfo.anchor = anchor;`,
    `        spaceInfo.poseInAnchorSpace = {{0, 0, 0, 1}, {0, 0, 0}};`,
    `        xrCreateSpatialAnchorSpaceMSFT(session, &spaceInfo, &${v}anchorSpace);`,
    ``,
    `        // Export for sharing`,
    `        XrSpatialAnchorExportSufficiencyMSFT sufficiency{XR_TYPE_SPATIAL_ANCHOR_EXPORT_SUFFICIENCY_MSFT};`,
    `        checkAnchorExportSufficiency(anchor, &sufficiency);`,
    ``,
    `        if (sufficiency.isMinimallySufficient) {`,
    `            exportAndShareAnchor(anchor, "${anchor.roomId}");`,
    `        }`,
    `    }`,
    `}`,
    ``,
    `void ${v}resolveSharedAnchor(const std::vector<uint8_t>& anchorData) {`,
    `    XrSpatialAnchorMSFT importedAnchor;`,
    `    importAnchorFromData(anchorData, &importedAnchor);`,
    ``,
    `    XrSpatialAnchorSpaceCreateInfoMSFT spaceInfo{XR_TYPE_SPATIAL_ANCHOR_SPACE_CREATE_INFO_MSFT};`,
    `    spaceInfo.anchor = importedAnchor;`,
    `    spaceInfo.poseInAnchorSpace = {{0, 0, 0, 1}, {0, 0, 0}};`,
    `    xrCreateSpatialAnchorSpaceMSFT(session, &spaceInfo, &${v}anchorSpace);`,
  ];

  if (anchor.syncTransforms) {
    lines.push(
      ``,
      `    // Enable transform synchronization`,
      `    enableTransformSync(${v}anchorSpace);`
    );
  }

  lines.push(`}`);

  return lines.join('\n');
}

export function controllerInputToOpenXR(ctrl: CompiledControllerInput, varPrefix = ''): string {
  const v = varPrefix ? `${varPrefix}_` : '';
  const lines: string[] = [
    `// Controller Input: ${ctrl.name}`,
    ``,
    `XrAction ${v}triggerAction = XR_NULL_HANDLE;`,
    `XrAction ${v}gripAction = XR_NULL_HANDLE;`,
    `XrAction ${v}thumbstickAction = XR_NULL_HANDLE;`,
    `XrAction ${v}primaryAction = XR_NULL_HANDLE;`,
    `XrAction ${v}secondaryAction = XR_NULL_HANDLE;`,
    `XrAction ${v}aimPoseAction = XR_NULL_HANDLE;`,
    ``,
    `void ${v}initControllerInput(XrSession session, XrActionSet actionSet) {`,
    `    // Trigger`,
    `    XrActionCreateInfo triggerInfo{XR_TYPE_ACTION_CREATE_INFO};`,
    `    strcpy(triggerInfo.actionName, "${v}trigger");`,
    `    strcpy(triggerInfo.localizedActionName, "Trigger");`,
    `    triggerInfo.actionType = XR_ACTION_TYPE_FLOAT_INPUT;`,
    `    xrCreateAction(actionSet, &triggerInfo, &${v}triggerAction);`,
    ``,
    `    // Grip`,
    `    XrActionCreateInfo gripInfo{XR_TYPE_ACTION_CREATE_INFO};`,
    `    strcpy(gripInfo.actionName, "${v}grip");`,
    `    strcpy(gripInfo.localizedActionName, "Grip");`,
    `    gripInfo.actionType = XR_ACTION_TYPE_FLOAT_INPUT;`,
    `    xrCreateAction(actionSet, &gripInfo, &${v}gripAction);`,
    ``,
    `    // Thumbstick`,
    `    XrActionCreateInfo thumbstickInfo{XR_TYPE_ACTION_CREATE_INFO};`,
    `    strcpy(thumbstickInfo.actionName, "${v}thumbstick");`,
    `    strcpy(thumbstickInfo.localizedActionName, "Thumbstick");`,
    `    thumbstickInfo.actionType = XR_ACTION_TYPE_VECTOR2F_INPUT;`,
    `    xrCreateAction(actionSet, &thumbstickInfo, &${v}thumbstickAction);`,
    ``,
    `    // Aim pose`,
    `    XrActionCreateInfo aimInfo{XR_TYPE_ACTION_CREATE_INFO};`,
    `    strcpy(aimInfo.actionName, "${v}aim_pose");`,
    `    strcpy(aimInfo.localizedActionName, "Aim Pose");`,
    `    aimInfo.actionType = XR_ACTION_TYPE_POSE_INPUT;`,
    `    xrCreateAction(actionSet, &aimInfo, &${v}aimPoseAction);`,
    `}`,
    ``,
    `void ${v}processControllerInput(XrSession session) {`,
    `    // Read trigger value`,
    `    XrActionStateFloat triggerState{XR_TYPE_ACTION_STATE_FLOAT};`,
    `    XrActionStateGetInfo getInfo{XR_TYPE_ACTION_STATE_GET_INFO};`,
    `    getInfo.action = ${v}triggerAction;`,
    `    xrGetActionStateFloat(session, &getInfo, &triggerState);`,
    ``,
    `    if (triggerState.isActive) {`,
    `        bool pressed = triggerState.currentState >= ${ctrl.triggerThreshold}f;`,
    `        onTriggerChanged(pressed, triggerState.currentState);`,
  ];

  if (ctrl.hapticOnPress) {
    lines.push(
      `        if (pressed && triggerState.changedSinceLastSync) {`,
      `            XrHapticVibration vibration{XR_TYPE_HAPTIC_VIBRATION};`,
      `            vibration.amplitude = ${ctrl.hapticIntensity}f;`,
      `            vibration.duration = 30000000; // 30ms in nanoseconds`,
      `            vibration.frequency = XR_FREQUENCY_UNSPECIFIED;`,
      `            xrApplyHapticFeedback(session, &hapticInfo, (XrHapticBaseHeader*)&vibration);`,
      `        }`
    );
  }

  lines.push(
    `    }`,
    ``,
    `    // Read thumbstick with deadzone`,
    `    XrActionStateVector2f thumbstickState{XR_TYPE_ACTION_STATE_VECTOR2F};`,
    `    getInfo.action = ${v}thumbstickAction;`,
    `    xrGetActionStateVector2f(session, &getInfo, &thumbstickState);`,
    ``,
    `    if (thumbstickState.isActive) {`,
    `        float x = applyDeadzone(thumbstickState.currentState[0], ${ctrl.deadzone}f);`,
    `        float y = applyDeadzone(thumbstickState.currentState[1], ${ctrl.deadzone}f);`,
    `        onThumbstickChanged(x, y);`
  );

  if (ctrl.thumbstickAsDpad) {
    lines.push(
      ``,
      `        // Thumbstick as D-pad`,
      `        if (fabsf(x) > ${ctrl.dpadThreshold}f) {`,
      `            onDpadEvent(x > 0 ? DPAD_RIGHT : DPAD_LEFT, fabsf(x));`,
      `        }`,
      `        if (fabsf(y) > ${ctrl.dpadThreshold}f) {`,
      `            onDpadEvent(y > 0 ? DPAD_UP : DPAD_DOWN, fabsf(y));`,
      `        }`
    );
  }

  lines.push(`    }`, `}`);

  return lines.join('\n');
}

// =============================================================================
// WebXR (TypeScript/JavaScript) â€” Browser XR
// =============================================================================

export function handTrackingToWebXR(ht: CompiledHandTracking, varPrefix = ''): string {
  const v = varPrefix ? `${varPrefix}_` : '';
  const lines: string[] = [
    `// Hand Tracking: ${ht.name}`,
    `// Requires 'hand-tracking' feature in XRSessionInit`,
    ``,
    `interface ${v}HandJointData {`,
    `  position: Float32Array;`,
    `  orientation: Float32Array;`,
    `  radius: number;`,
    `}`,
    ``,
    `const ${v}SMOOTHING = ${ht.smoothing};`,
    `const ${v}PINCH_THRESHOLD = ${ht.pinchThreshold};`,
    `const ${v}GRIP_THRESHOLD = ${ht.gripThreshold};`,
    `const ${v}CONFIDENCE_THRESHOLD = ${ht.confidenceThreshold};`,
    `let ${v}prevJoints: Map<string, ${v}HandJointData> = new Map();`,
    ``,
    `function ${v}processHandInput(frame: XRFrame, refSpace: XRReferenceSpace) {`,
    `  for (const inputSource of frame.session.inputSources) {`,
    `    if (!inputSource.hand) continue;`,
    `    const hand = inputSource.hand;`,
    `    const handedness = inputSource.handedness;`,
    ``,
    `    const jointPoses: Map<string, ${v}HandJointData> = new Map();`,
    `    const jointSpaces = [...hand.values()];`,
    ``,
    `    for (const [jointName, jointSpace] of hand.entries()) {`,
    `      const pose = frame.getJointPose(jointSpace, refSpace);`,
    `      if (!pose) continue;`,
    ``,
    `      const pos = pose.transform.position;`,
    `      const ori = pose.transform.orientation;`,
    ``,
    `      let jointData: ${v}HandJointData = {`,
    `        position: new Float32Array([pos[0], pos[1], pos[2]]),`,
    `        orientation: new Float32Array([ori[0], ori[1], ori[2], ori[3]]),`,
    `        radius: pose.radius ?? 0.005,`,
    `      };`,
    ``,
    `      // Apply smoothing`,
    `      const prevKey = \`\${handedness}_\${jointName}\`;`,
    `      const prev = ${v}prevJoints.get(prevKey);`,
    `      if (prev && ${v}SMOOTHING > 0) {`,
    `        const s = ${v}SMOOTHING;`,
    `        const inv = 1 - s;`,
    `        jointData.position = new Float32Array([`,
    `          prev.position[0] * s + jointData.position[0] * inv,`,
    `          prev.position[1] * s + jointData.position[1] * inv,`,
    `          prev.position[2] * s + jointData.position[2] * inv,`,
    `        ]);`,
    `      }`,
    ``,
    `      ${v}prevJoints.set(prevKey, jointData);`,
    `      jointPoses.set(jointName, jointData);`,
    `    }`,
    ``,
    `    // Gesture detection: pinch (thumb tip + index tip distance)`,
    `    const thumbTip = jointPoses.get('thumb-tip');`,
    `    const indexTip = jointPoses.get('index-finger-tip');`,
    `    if (thumbTip && indexTip) {`,
    `      const dx = thumbTip.position[0] - indexTip.position[0];`,
    `      const dy = thumbTip.position[1] - indexTip.position[1];`,
    `      const dz = thumbTip.position[2] - indexTip.position[2];`,
    `      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);`,
    `      const pinchStrength = Math.max(0, 1 - distance / 0.04);`,
    ``,
    `      if (pinchStrength >= ${v}PINCH_THRESHOLD) {`,
    `        onSpatialGesture(handedness, 'pinch', pinchStrength);`,
  ];

  if (ht.hapticOnGesture) {
    lines.push(
      `        // Haptic pulse via gamepad haptic actuators`,
      `        if (inputSource.gamepad?.hapticActuators?.length) {`,
      `          inputSource.gamepad.hapticActuators[0].pulse(0.25, 40);`,
      `        }`
    );
  }

  lines.push(
    `      }`,
    `    }`,
    ``,
    `    onHandTrackingUpdate(handedness, jointPoses);`,
    `  }`,
    `}`
  );

  return lines.join('\n');
}

export function gazeTransientPointerToWebXR(
  gaze: CompiledGazeTransientPointer,
  varPrefix = ''
): string {
  const v = varPrefix ? `${varPrefix}_` : '';
  const lines: string[] = [
    `// Gaze Transient Pointer: ${gaze.name} (privacy-first)`,
    `// Uses 'transient-pointer' input source â€” gaze direction NEVER exposed`,
    ``,
    `let ${v}dwellAccum = 0;`,
    `const ${v}DWELL_TIME_MS = ${gaze.dwellTimeMs};`,
    `const ${v}MAX_DISTANCE = ${gaze.maxDistance};`,
    ``,
    `function ${v}processGazeInput(session: XRSession, frame: XRFrame, refSpace: XRReferenceSpace) {`,
    `  for (const source of session.inputSources) {`,
    `    // 'transient-pointer' is the WebXR privacy-preserving gaze model`,
    `    // System handles gaze tracking; only reveals intersection at select`,
    `    if (source.targetRayMode !== 'transient-pointer' && source.targetRayMode !== 'gaze') continue;`,
    ``,
    `    // Listen for 'select' event = commit moment`,
    `    // The select event is the ONLY point where the hit position is revealed`,
    `  }`,
    `}`,
    ``,
    `// Register for select events (commit = pinch/click moment)`,
    `function ${v}setupGazeCommitListeners(session: XRSession) {`,
    `  session.addEventListener('select', (event: XRInputSourceEvent) => {`,
    `    const source = event.inputSource;`,
    `    if (source.targetRayMode !== 'transient-pointer' && source.targetRayMode !== 'gaze') return;`,
    ``,
    `    // At this moment, the target ray pose is available (commit point)`,
    `    const frame = event.frame;`,
    `    const refSpace = /* saved reference space */;`,
    `    const pose = frame.getPose(source.targetRaySpace, refSpace);`,
    ``,
    `    if (pose) {`,
    `      const commitPoint = pose.transform.position;`,
    `      // Perform hit test at the revealed point`,
    `      const hitResults = frame.getHitTestResultsForTransientInput?.(/* source */);`,
    `      const hitPoint = hitResults?.[0]?.getPose(refSpace)?.transform.position ?? commitPoint;`,
    ``,
    `      onGazeCommit({`,
    `        x: hitPoint[0],`,
    `        y: hitPoint[1],`,
    `        z: hitPoint[2],`,
    `      });`,
  ];

  if (gaze.hapticOnCommit) {
    lines.push(
      ``,
      `      // Haptic feedback`,
      `      if (source.gamepad?.hapticActuators?.length) {`,
      `        source.gamepad.hapticActuators[0].pulse(${gaze.hapticIntensity}, 60);`,
      `      }`
    );
  }

  lines.push(
    `    }`,
    `  });`,
    ``,
    `  session.addEventListener('selectend', () => {`,
    `    onGazeRelease();`,
    `  });`,
    `}`
  );

  return lines.join('\n');
}

export function sharedAnchorToWebXR(anchor: CompiledSharedSpatialAnchor, varPrefix = ''): string {
  const v = varPrefix ? `${varPrefix}_` : '';
  const lines: string[] = [
    `// Shared Spatial Anchor: ${anchor.name}`,
    `// Uses WebXR Anchors API + application-level sharing`,
    ``,
    `interface ${v}SharedAnchorData {`,
    `  anchorId: string;`,
    `  roomId: string;`,
    `  pose: { position: [number, number, number]; orientation: { x: number; y: number; z: number; w: number } };`,
    `}`,
    ``,
    `let ${v}resolveAttempts = 0;`,
    `const ${v}MAX_RETRIES = ${anchor.maxRetries};`,
    `const ${v}RETRY_DELAY_MS = ${anchor.retryDelayMs};`,
    `const ${v}QUALITY_THRESHOLD = ${anchor.qualityThreshold};`,
    ``,
    `async function ${v}createSharedAnchor(`,
    `  frame: XRFrame,`,
    `  refSpace: XRReferenceSpace,`,
    `  pose: XRRigidTransform`,
    `): Promise<${v}SharedAnchorData | null> {`,
    `  try {`,
    `    // Create local anchor via WebXR Anchors Module`,
    `    const anchor = await frame.createAnchor(pose, refSpace);`,
    `    if (!anchor) return null;`,
    ``,
    `    // Generate shareable identifier`,
    `    const anchorId = crypto.randomUUID();`,
    ``,
    `    // Serialize pose for network sharing`,
    `    const anchorData: ${v}SharedAnchorData = {`,
    `      anchorId,`,
    `      roomId: '${anchor.roomId}',`,
    `      pose: {`,
    `        position: [pose.position[0], pose.position[1], pose.position[2]],`,
    `        orientation: [pose.orientation[0], pose.orientation[1], pose.orientation[2], pose.orientation[3]],`,
    `      },`,
    `    };`,
  ];

  if (anchor.autoShare) {
    lines.push(``, `    // Auto-share to room`, `    await shareAnchorToRoom(anchorData);`);
  }

  if (anchor.syncTransforms) {
    lines.push(
      ``,
      `    // Enable transform sync across peers`,
      `    enableTransformSync(anchorId);`
    );
  }

  lines.push(
    ``,
    `    return anchorData;`,
    `  } catch (err) {`,
    `    console.error('Failed to create shared anchor:', err);`,
    `    ${v}resolveAttempts++;`,
    `    if (${v}resolveAttempts < ${v}MAX_RETRIES) {`,
    `      await new Promise(r => setTimeout(r, ${v}RETRY_DELAY_MS));`,
    `      return ${v}createSharedAnchor(frame, refSpace, pose);`,
    `    }`,
    `    return null;`,
    `  }`,
    `}`,
    ``,
    `async function ${v}resolveSharedAnchor(`,
    `  anchorData: ${v}SharedAnchorData,`,
    `  frame: XRFrame,`,
    `  refSpace: XRReferenceSpace`,
    `): Promise<XRAnchor | null> {`,
    `  const pose = new XRRigidTransform(`,
    `    anchorData.pose.position,`,
    `    anchorData.pose.orientation`,
    `  );`,
    `  return frame.createAnchor(pose, refSpace);`,
    `}`
  );

  return lines.join('\n');
}

export function controllerInputToWebXR(ctrl: CompiledControllerInput, varPrefix = ''): string {
  const v = varPrefix ? `${varPrefix}_` : '';
  const lines: string[] = [
    `// Controller Input: ${ctrl.name}`,
    ``,
    `const ${v}DEADZONE = ${ctrl.deadzone};`,
    `const ${v}TRIGGER_THRESHOLD = ${ctrl.triggerThreshold};`,
    `const ${v}GRIP_THRESHOLD = ${ctrl.gripThreshold};`,
    ``,
    `function ${v}applyDeadzone(value: number, deadzone: number): number {`,
    `  if (Math.abs(value) < deadzone) return 0;`,
    `  const sign = value > 0 ? 1 : -1;`,
    `  return sign * ((Math.abs(value) - deadzone) / (1 - deadzone));`,
    `}`,
    ``,
    `interface ${v}ControllerState {`,
    `  hand: 'left' | 'right' | 'none';`,
    `  connected: boolean;`,
    `  buttons: Map<string, { pressed: boolean; touched: boolean; value: number }>;`,
    `  thumbstick: { x: number; y: number };`,
    `  triggerValue: number;`,
    `  gripValue: number;`,
    `}`,
    ``,
    `const ${v}prevButtonState = new Map<string, boolean>();`,
    ``,
    `function ${v}processControllerInput(session: XRSession, frame: XRFrame, refSpace: XRReferenceSpace) {`,
    `  for (const source of session.inputSources) {`,
    `    if (source.targetRayMode !== 'tracked-pointer') continue;`,
    `    if (!source.gamepad) continue;`,
    ``,
    `    const hand = source.handedness;`,
    `    const gp = source.gamepad;`,
    ``,
    `    // Pose`,
    `    const pose = frame.getPose(source.gripSpace!, refSpace);`,
    ``,
    `    // Buttons`,
    `    const BUTTON_MAP = ['trigger', 'grip', 'touchpad', 'thumbstick', 'primary', 'secondary'];`,
    `    const buttons = new Map<string, { pressed: boolean; touched: boolean; value: number }>();`,
    `    for (let i = 0; i < gp.buttons.length; i++) {`,
    `      const name = BUTTON_MAP[i] || \`button_\${i}\`;`,
    `      const btn = gp.buttons[i];`,
    `      buttons.set(name, { pressed: btn.pressed, touched: btn.touched, value: btn.value });`,
    ``,
    `      // Detect changes`,
    `      const prevKey = \`\${hand}_\${name}\`;`,
    `      const wasPressed = ${v}prevButtonState.get(prevKey) ?? false;`,
    `      if (btn.pressed && !wasPressed) {`,
    `        onSpatialButtonPress(hand, name, btn.value);`,
  ];

  if (ctrl.hapticOnPress) {
    lines.push(
      `        // Haptic feedback`,
      `        if (gp.hapticActuators?.length) {`,
      `          gp.hapticActuators[0].pulse(${ctrl.hapticIntensity}, 30);`,
      `        }`
    );
  }

  lines.push(
    `      } else if (!btn.pressed && wasPressed) {`,
    `        onSpatialButtonRelease(hand, name);`,
    `      }`,
    `      ${v}prevButtonState.set(prevKey, btn.pressed);`,
    `    }`,
    ``,
    `    // Axes (thumbstick/touchpad) with deadzone`,
    `    const axes = gp.axes;`,
    `    const thumbstick = {`,
    `      x: ${v}applyDeadzone(axes[2] ?? 0, ${v}DEADZONE),`,
    `      y: ${v}applyDeadzone(axes[3] ?? 0, ${v}DEADZONE),`,
    `    };`,
    ``,
    `    const triggerValue = gp.buttons[0]?.value ?? 0;`,
    `    const gripValue = gp.buttons[1]?.value ?? 0;`
  );

  if (ctrl.thumbstickAsDpad) {
    lines.push(
      ``,
      `    // Thumbstick as D-pad`,
      `    if (Math.abs(thumbstick[0]) > ${ctrl.dpadThreshold}) {`,
      `      onSpatialDpad(hand, thumbstick[0] > 0 ? 'right' : 'left', Math.abs(thumbstick[0]));`,
      `    }`,
      `    if (Math.abs(thumbstick[1]) > ${ctrl.dpadThreshold}) {`,
      `      onSpatialDpad(hand, thumbstick[1] > 0 ? 'up' : 'down', Math.abs(thumbstick[1]));`,
      `    }`
    );
  }

  lines.push(
    ``,
    `    onControllerUpdate(hand, {`,
    `      pose: pose?.transform ?? null,`,
    `      buttons,`,
    `      thumbstick,`,
    `      triggerValue,`,
    `      gripValue,`,
    `    });`,
    `  }`,
    `}`
  );

  return lines.join('\n');
}

// =============================================================================
// CONVENIENCE: Compile all spatial inputs for a target platform
// =============================================================================

export type SpatialInputTarget = 'arcore' | 'arkit' | 'openxr' | 'webxr';

/**
 * Generate platform-specific code for a compiled spatial input block.
 *
 * @param input - Compiled spatial input intermediate representation
 * @param target - Target platform
 * @param varPrefix - Variable name prefix (for multiple instances)
 * @returns Generated platform-specific code string
 */
export function spatialInputToTarget(
  input: CompiledSpatialInput,
  target: SpatialInputTarget,
  varPrefix = ''
): string {
  const generators: Record<
    SpatialInputTarget,
    Record<CompiledSpatialInput['kind'], (data: any, prefix?: string) => string>
  > = {
    arcore: {
      hand_tracking: handTrackingToARCore,
      gaze_transient_pointer: gazeTransientPointerToARCore,
      shared_anchor: sharedAnchorToARCore,
      controller_input: controllerInputToARCore,
    },
    arkit: {
      hand_tracking: handTrackingToARKit,
      gaze_transient_pointer: gazeTransientPointerToARKit,
      shared_anchor: sharedAnchorToARKit,
      controller_input: controllerInputToARKit,
    },
    openxr: {
      hand_tracking: handTrackingToOpenXR,
      gaze_transient_pointer: gazeTransientPointerToOpenXR,
      shared_anchor: sharedAnchorToOpenXR,
      controller_input: controllerInputToOpenXR,
    },
    webxr: {
      hand_tracking: handTrackingToWebXR,
      gaze_transient_pointer: gazeTransientPointerToWebXR,
      shared_anchor: sharedAnchorToWebXR,
      controller_input: controllerInputToWebXR,
    },
  };

  const generator = generators[target]?.[input.kind];
  if (!generator) {
    return `// Unsupported spatial input type '${input.kind}' for target '${target}'`;
  }

  return generator(input.data, varPrefix);
}

/**
 * Compile and generate platform-specific code for all spatial input blocks
 * found in a list of domain blocks.
 *
 * @param blocks - AST domain blocks to scan for spatial input keywords
 * @param target - Target platform
 * @param varPrefix - Variable name prefix
 * @returns Array of generated code strings (one per spatial input block)
 */
export function compileSpatialInputBlocks(
  blocks: HoloDomainBlock[],
  target: SpatialInputTarget,
  varPrefix = ''
): string[] {
  const results: string[] = [];

  for (const block of blocks) {
    const compiled = compileSpatialInputBlock(block);
    if (compiled) {
      results.push(spatialInputToTarget(compiled, target, varPrefix));
    }
  }

  return results;
}
