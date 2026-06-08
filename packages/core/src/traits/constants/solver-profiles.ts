/**
 * Solver-Backed Evidence Specification Language (SESL) — Domain Solver Profiles
 *
 * Each profile maps a domain's trait vocabulary to a concrete solver configuration
 * and the operational evidence fields required to close a receipt.  Profiles are
 * the "contract" between trait declarations and runtime-CAEL traces: a trait
 * belongs to a domain bucket; the profile says *what evidence a solver must
 * emit* when that trait is exercised.
 *
 * @category SESL
 * @version 1.0.0
 * @reference P17 Slice C — task_1779851876347_3yvu
 */

// =============================================================================
// Profile Types
// =============================================================================

/** Evidence field descriptor — one column in the receipt schema. */
export interface EvidenceField {
  /** Machine-readable field name (camelCase) */
  name: string;
  /** Human-readable label */
  label: string;
  /** JSON Schema–style type: 'string' | 'number' | 'boolean' | 'object' | 'array' */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** Whether this field MUST be present in every receipt for this profile */
  required: boolean;
  /** Short description of what the field captures */
  description: string;
  /** Example value for documentation and test fixtures */
  example?: unknown;
}

/** Solver configuration embedded in a profile. */
export interface SolverConfig {
  /** Solver type key — must match a SimulationSolverFactory registration */
  solverType: string;
  /** Spatial/computational scale the solver operates at */
  scale: string;
  /** Additional solver-specific parameters */
  params?: Record<string, unknown>;
}

/** CAEL trace configuration — which events the runtime must emit. */
export interface CaelTraceConfig {
  /** CAEL version */
  version: 'cael.v1';
  /** Event name pattern (e.g. 'networking-ai.endpoint.invoke') */
  eventPattern: string;
  /** Whether traces are required for receipt acceptance */
  required: boolean;
}

/** A complete SESL solver profile for a domain. */
export interface SolverProfile {
  /** Profile identifier — matches the domain constants file name */
  id: string;
  /** Human-readable domain name */
  domain: string;
  /** The trait array this profile covers (references the constants file) */
  traitSource: string;
  /** Solver configuration */
  solver: SolverConfig;
  /** Evidence fields required in receipts for this domain */
  evidenceFields: EvidenceField[];
  /** CAEL trace configuration */
  caelTrace: CaelTraceConfig;
  /** Profile version (semver) */
  version: string;
  /** Tags for filtering / grouping */
  tags: string[];
}

// =============================================================================
// Networking AI Solver Profile
// =============================================================================

export const NETWORKING_AI_SOLVER_PROFILE: SolverProfile = {
  id: 'networking-ai',
  domain: 'Networking, AI & Generative',
  traitSource: 'NETWORKING_AI_TRAITS',
  solver: {
    solverType: 'networking-ai-endpoint',
    scale: 'service',
    params: {
      maxConcurrentRequests: 1000,
      requestTimeoutMs: 30000,
      retryStrategy: 'exponential-backoff',
      circuitBreakerThreshold: 5,
    },
  },
  evidenceFields: [
    {
      name: 'endpoint',
      label: 'Endpoint',
      type: 'string',
      required: true,
      description: 'The network endpoint that was exercised (URL, host:port, or service path)',
      example: 'https://api.example.com/v1/inference',
    },
    {
      name: 'topic',
      label: 'Topic',
      type: 'string',
      required: false,
      description: 'Pub/sub topic or event channel name for streaming/AI subscriptions',
      example: 'ai.inference.results',
    },
    {
      name: 'target',
      label: 'Target',
      type: 'string',
      required: true,
      description: 'The trait or service target that was invoked',
      example: 'networked',
    },
    {
      name: 'action',
      label: 'Action',
      type: 'string',
      required: true,
      description: 'The operation performed (invoke, subscribe, publish, request, stream)',
      example: 'invoke',
    },
    {
      name: 'state',
      label: 'State',
      type: 'string',
      required: true,
      description: 'Result state: success | failure | timeout | degraded',
      example: 'success',
    },
    {
      name: 'latencyMs',
      label: 'Latency (ms)',
      type: 'number',
      required: false,
      description: 'Round-trip latency in milliseconds',
      example: 142,
    },
  ],
  caelTrace: {
    version: 'cael.v1',
    eventPattern: 'networking-ai.{target}.{action}',
    required: true,
  },
  version: '1.0.0',
  tags: ['networking', 'ai', 'generative', 'llm', 'sesl'],
};

// =============================================================================
// IoT Autonomous Agents Solver Profile
// =============================================================================

export const IOT_AUTONOMOUS_AGENTS_SOLVER_PROFILE: SolverProfile = {
  id: 'iot-autonomous-agents',
  domain: 'Digital Twin, IoT & Autonomous Agents',
  traitSource: 'IOT_AUTONOMOUS_AGENTS_TRAITS',
  solver: {
    solverType: 'iot-device-bridge',
    scale: 'device',
    params: {
      maxDevices: 500,
      telemetryIntervalMs: 1000,
      commandTimeoutMs: 5000,
      digitalTwinSyncMs: 2000,
    },
  },
  evidenceFields: [
    {
      name: 'device',
      label: 'Device',
      type: 'string',
      required: true,
      description: 'The IoT device identifier or digital twin reference',
      example: 'thermostat-living-room-001',
    },
    {
      name: 'sensor',
      label: 'Sensor',
      type: 'string',
      required: true,
      description: 'The sensor or actuator name that produced the reading',
      example: 'temperature_sensor',
    },
    {
      name: 'action',
      label: 'Action',
      type: 'string',
      required: true,
      description: 'The IoT operation (read, write, subscribe, command, sync, alert)',
      example: 'read',
    },
    {
      name: 'state',
      label: 'State',
      type: 'string',
      required: true,
      description: 'Result state: success | failure | timeout | stale | offline',
      example: 'success',
    },
    {
      name: 'topic',
      label: 'Topic',
      type: 'string',
      required: false,
      description: 'MQTT/CoAP topic path for device communication',
      example: 'devices/thermostat/temperature',
    },
    {
      name: 'channel',
      label: 'Channel',
      type: 'string',
      required: false,
      description: 'Communication channel (mqtt, coap, http, websocket, bluetooth)',
      example: 'mqtt',
    },
    {
      name: 'value',
      label: 'Value',
      type: 'object',
      required: false,
      description: 'The sensor reading or command payload value',
      example: { celsius: 22.5, unit: 'C' },
    },
  ],
  caelTrace: {
    version: 'cael.v1',
    eventPattern: 'iot.device.{device}.{action}',
    required: true,
  },
  version: '1.0.0',
  tags: ['iot', 'digital-twin', 'autonomous', 'device', 'sesl'],
};

// =============================================================================
// Interop Co-Presence Solver Profile
// =============================================================================

export const INTEROP_COPRESENCE_SOLVER_PROFILE: SolverProfile = {
  id: 'interop-copresence',
  domain: 'OpenUSD Interoperability & Co-Presence',
  traitSource: 'INTEROP_COPRESENCE_TRAITS',
  solver: {
    solverType: 'interop-format-bridge',
    scale: 'scene',
    params: {
      supportedFormats: ['usd', 'gltf', 'fbx', 'material_x'],
      syncIntervalMs: 100,
      maxConcurrentUsers: 64,
      avatarUpdateRateHz: 30,
    },
  },
  evidenceFields: [
    {
      name: 'channel',
      label: 'Channel',
      type: 'string',
      required: true,
      description: 'The interop channel (usd, gltf, fbx, websocket, webrtc)',
      example: 'usd',
    },
    {
      name: 'target',
      label: 'Target',
      type: 'string',
      required: true,
      description: 'The interop target (format converter, sync bridge, presence server)',
      example: 'usd_gltf_converter',
    },
    {
      name: 'action',
      label: 'Action',
      type: 'string',
      required: true,
      description: 'The interop operation (convert, sync, join, leave, share, broadcast)',
      example: 'convert',
    },
    {
      name: 'state',
      label: 'State',
      type: 'string',
      required: true,
      description: 'Result state: success | failure | partial | degraded',
      example: 'success',
    },
    {
      name: 'participantCount',
      label: 'Participant Count',
      type: 'number',
      required: false,
      description: 'Number of participants in the co-presence session',
      example: 4,
    },
  ],
  caelTrace: {
    version: 'cael.v1',
    eventPattern: 'interop.copresence.{channel}.{action}',
    required: true,
  },
  version: '1.0.0',
  tags: ['interop', 'copresence', 'usd', 'gltf', 'sesl'],
};

// =============================================================================
// Universal Service Solver Profile
// =============================================================================

export const UNIVERSAL_SERVICE_SOLVER_PROFILE: SolverProfile = {
  id: 'universal-service',
  domain: 'Universal Service & Backend',
  traitSource: 'UNIVERSAL_V6_TRAITS',
  solver: {
    solverType: 'universal-service-runtime',
    scale: 'service',
    params: {
      maxEndpointsPerService: 100,
      healthCheckIntervalMs: 10000,
      circuitBreakerThreshold: 5,
      rateLimitWindowMs: 60000,
      maxRequestsPerWindow: 10000,
    },
  },
  evidenceFields: [
    {
      name: 'endpoint',
      label: 'Endpoint',
      type: 'string',
      required: true,
      description: 'The service endpoint URL or resource path',
      example: '/api/v1/users',
    },
    {
      name: 'target',
      label: 'Target',
      type: 'string',
      required: true,
      description: 'The service trait or component name',
      example: 'rest_resource',
    },
    {
      name: 'action',
      label: 'Action',
      type: 'string',
      required: true,
      description: 'The service operation (GET, POST, PUT, DELETE, SUBSCRIBE, PUBLISH)',
      example: 'GET',
    },
    {
      name: 'state',
      label: 'State',
      type: 'string',
      required: true,
      description: 'Result state: success | failure | timeout | rate-limited | circuit-open',
      example: 'success',
    },
    {
      name: 'channel',
      label: 'Channel',
      type: 'string',
      required: false,
      description: 'The communication channel (http, websocket, grpc, mqtt)',
      example: 'http',
    },
    {
      name: 'topic',
      label: 'Topic',
      type: 'string',
      required: false,
      description: 'The messaging topic for pub/sub patterns',
      example: 'users.created',
    },
    {
      name: 'statusCode',
      label: 'Status Code',
      type: 'number',
      required: false,
      description: 'HTTP or protocol status code',
      example: 200,
    },
    {
      name: 'latencyMs',
      label: 'Latency (ms)',
      type: 'number',
      required: false,
      description: 'Service response latency in milliseconds',
      example: 45,
    },
  ],
  caelTrace: {
    version: 'cael.v1',
    eventPattern: 'universal-service.{target}.{action}',
    required: true,
  },
  version: '1.0.0',
  tags: ['service', 'backend', 'api', 'universal', 'sesl'],
};

// =============================================================================
// Accessibility Solver Profile
// =============================================================================

export const ACCESSIBILITY_SOLVER_PROFILE: SolverProfile = {
  id: 'accessibility',
  domain: 'Accessibility',
  traitSource: 'ACCESSIBILITY_TRAITS',
  solver: {
    solverType: 'accessibility-audit',
    scale: 'component',
    params: {
      wcagLevel: 'AA',
      auditTimeoutMs: 5000,
      maxViolationsPerComponent: 0,
      contrastRatioMinimum: 4.5,
    },
  },
  evidenceFields: [
    {
      name: 'target',
      label: 'Target',
      type: 'string',
      required: true,
      description: 'The accessibility trait or feature being tested',
      example: 'screen_reader',
    },
    {
      name: 'action',
      label: 'Action',
      type: 'string',
      required: true,
      description: 'The accessibility operation (verify, audit, adapt, convert, navigate)',
      example: 'verify',
    },
    {
      name: 'state',
      label: 'State',
      type: 'string',
      required: true,
      description: 'Result state: compliant | non-compliant | degraded | fallback',
      example: 'compliant',
    },
    {
      name: 'channel',
      label: 'Channel',
      type: 'string',
      required: false,
      description: 'The accessibility channel (visual, auditory, haptic, screen-reader, switch)',
      example: 'screen-reader',
    },
    {
      name: 'wcagCriterion',
      label: 'WCAG Criterion',
      type: 'string',
      required: false,
      description: 'WCAG success criterion identifier (e.g. 1.4.3, 2.1.1)',
      example: '1.4.3',
    },
    {
      name: 'violations',
      label: 'Violations',
      type: 'number',
      required: false,
      description: 'Number of accessibility violations found',
      example: 0,
    },
  ],
  caelTrace: {
    version: 'cael.v1',
    eventPattern: 'accessibility.{target}.{action}',
    required: true,
  },
  version: '1.0.0',
  tags: ['accessibility', 'a11y', 'wcag', 'sesl'],
};

// =============================================================================
// Simple Modifiers Solver Profile
// =============================================================================

export const SIMPLE_MODIFIERS_SOLVER_PROFILE: SolverProfile = {
  id: 'simple-modifiers',
  domain: 'Simple Modifiers',
  traitSource: 'SIMPLE_MODIFIER_TRAITS',
  solver: {
    solverType: 'simple-modifier-runtime',
    scale: 'component',
    params: {
      maxConcurrentModifiers: 64,
      modifierCooldownMs: 100,
      lodBiasThreshold: 0.75,
      animationBlendMs: 250,
    },
  },
  evidenceFields: [
    {
      name: 'target',
      label: 'Target',
      type: 'string',
      required: true,
      description:
        'The specific modifier trait being exercised (animated, billboard, rotating, collidable, clickable, glowing, interactive, lod)',
      example: 'animated',
    },
    {
      name: 'action',
      label: 'Action',
      type: 'string',
      required: true,
      description: 'The modifier operation (activate, deactivate, toggle, update, query)',
      example: 'activate',
    },
    {
      name: 'state',
      label: 'State',
      type: 'string',
      required: true,
      description: 'Result state: active | inactive | transitioning | failed',
      example: 'active',
    },
    {
      name: 'context',
      label: 'Context',
      type: 'string',
      required: true,
      description: 'The scene object or component the modifier was applied to (not a bare trait)',
      example: 'billboard_sign_01',
    },
    {
      name: 'intensity',
      label: 'Intensity',
      type: 'number',
      required: false,
      description: 'Modifier intensity or blend factor (0–1 for glow/animation, LOD level for lod)',
      example: 0.85,
    },
    {
      name: 'durationMs',
      label: 'Duration (ms)',
      type: 'number',
      required: false,
      description: 'How long the modifier was active during the test window',
      example: 1500,
    },
  ],
  caelTrace: {
    version: 'cael.v1',
    eventPattern: 'simple-modifier.{target}.{action}',
    required: true,
  },
  version: '1.0.0',
  tags: ['modifiers', 'behavior', 'interactive', 'sesl'],
};

// =============================================================================
// Core VR Interaction Solver Profile
// =============================================================================

export const CORE_VR_INTERACTION_SOLVER_PROFILE: SolverProfile = {
  id: 'core-vr-interaction',
  domain: 'Core VR Interaction',
  traitSource: 'CORE_VR_INTERACTION_TRAITS',
  solver: {
    solverType: 'vr-interaction-solver',
    scale: 'scene',
    params: {
      maxConcurrentInteractions: 32,
      gestureRecognitionMs: 80,
      grabThresholdDistance: 0.05,
      snapToleranceDistance: 0.1,
    },
  },
  evidenceFields: [
    {
      name: 'target',
      label: 'Target',
      type: 'string',
      required: true,
      description:
        'The interaction trait exercised (grabbable, throwable, pointable, hoverable, scalable, rotatable, stackable, snappable, breakable, stretchable, moldable, timeline, choreography)',
      example: 'grabbable',
    },
    {
      name: 'action',
      label: 'Action',
      type: 'string',
      required: true,
      description:
        'The interaction operation (grab, throw, point, hover, scale, rotate, stack, snap, break, stretch, mold, play, scrub)',
      example: 'grab',
    },
    {
      name: 'state',
      label: 'State',
      type: 'string',
      required: true,
      description: 'Result state: success | failure | partial | degraded | rejected',
      example: 'success',
    },
    {
      name: 'context',
      label: 'Context',
      type: 'string',
      required: true,
      description:
        'The VR object or controller the interaction was performed on (not a bare trait)',
      example: 'cube_prop_03',
    },
    {
      name: 'gesture',
      label: 'Gesture',
      type: 'string',
      required: false,
      description:
        'The input gesture that triggered the interaction (pinch, palm, trigger, thumbstick, ray)',
      example: 'pinch',
    },
    {
      name: 'durationMs',
      label: 'Duration (ms)',
      type: 'number',
      required: false,
      description: 'Duration of the sustained interaction in milliseconds',
      example: 320,
    },
  ],
  caelTrace: {
    version: 'cael.v1',
    eventPattern: 'core-vr-interaction.{target}.{action}',
    required: true,
  },
  version: '1.0.0',
  tags: ['vr', 'interaction', 'grabbable', 'timeline', 'sesl'],
};

// =============================================================================
// Parser Core UI Solver Profile
// =============================================================================

export const PARSER_CORE_UI_SOLVER_PROFILE: SolverProfile = {
  id: 'parser-core-ui',
  domain: 'Parser Core & UI',
  traitSource: 'PARSER_CORE_UI_TRAITS',
  solver: {
    solverType: 'parser-ui-runtime',
    scale: 'component',
    params: {
      maxUIComponentsPerScene: 256,
      layoutPassTimeoutMs: 5000,
      platformDetectionPriority: ['vr', 'ar', 'desktop'],
      renderValidationEnabled: true,
    },
  },
  evidenceFields: [
    {
      name: 'target',
      label: 'Target',
      type: 'string',
      required: true,
      description:
        'The UI or parser trait exercised (physics, draggable, static, kinematic, local_only, visible, invisible, audio, portal, vr_only, ar_only, desktop_only, ui_floating, ui_anchored, ui_hand_menu, ui_billboard, ui_curved, ui_docked)',
      example: 'ui_anchored',
    },
    {
      name: 'action',
      label: 'Action',
      type: 'string',
      required: true,
      description:
        'The UI operation (render, layout, show, hide, position, bind, unbind, parse, validate)',
      example: 'render',
    },
    {
      name: 'state',
      label: 'State',
      type: 'string',
      required: true,
      description: 'Result state: rendered | hidden | errored | fallback | parsed | invalid',
      example: 'rendered',
    },
    {
      name: 'platform',
      label: 'Platform',
      type: 'string',
      required: true,
      description: 'The platform context the trait was rendered on (vr, ar, desktop, mobile)',
      example: 'vr',
    },
    {
      name: 'layout',
      label: 'Layout',
      type: 'string',
      required: false,
      description: 'Layout context or container for UI traits (world, screen, hand, hud, panel)',
      example: 'hud',
    },
  ],
  caelTrace: {
    version: 'cael.v1',
    eventPattern: 'parser-core-ui.{target}.{action}',
    required: true,
  },
  version: '1.0.0',
  tags: ['parser', 'ui', 'platform', 'layout', 'sesl'],
};

// =============================================================================
// Visual Effects Solver Profile
// =============================================================================

export const VISUAL_EFFECTS_SOLVER_PROFILE: SolverProfile = {
  id: 'visual-effects',
  domain: 'Visual Effects',
  traitSource: 'VISUAL_EFFECTS_TRAITS',
  solver: {
    solverType: 'visual-fx-renderer',
    scale: 'component',
    params: {
      maxConcurrentEffects: 128,
      effectRenderBudgetMs: 16,
      shaderCompileTimeoutMs: 2000,
      fallbackToSimpleGeometry: true,
    },
  },
  evidenceFields: [
    {
      name: 'target',
      label: 'Target',
      type: 'string',
      required: true,
      description:
        'The visual effect trait exercised (transparent, reflective, emissive, spinning, floating, pulsing, blinking, fading, color_shifting, holographic, etc.)',
      example: 'holographic',
    },
    {
      name: 'action',
      label: 'Action',
      type: 'string',
      required: true,
      description:
        'The visual effect operation (render, animate, transition, apply, remove, composite)',
      example: 'render',
    },
    {
      name: 'state',
      label: 'State',
      type: 'string',
      required: true,
      description: 'Result state: visible | hidden | transitioning | failed | fallback',
      example: 'visible',
    },
    {
      name: 'context',
      label: 'Context',
      type: 'string',
      required: true,
      description: 'The scene object or mesh the effect was applied to (not a bare trait)',
      example: 'crystal_shard_07',
    },
    {
      name: 'intensity',
      label: 'Intensity',
      type: 'number',
      required: false,
      description: 'Effect intensity or blend factor (0–1)',
      example: 0.7,
    },
    {
      name: 'shaderPass',
      label: 'Shader Pass',
      type: 'string',
      required: false,
      description: 'The render pass that executed the effect (forward, deferred, post, overlay)',
      example: 'forward',
    },
  ],
  caelTrace: {
    version: 'cael.v1',
    eventPattern: 'visual-effects.{target}.{action}',
    required: true,
  },
  version: '1.0.0',
  tags: ['vfx', 'visual', 'rendering', 'effects', 'sesl'],
};

// =============================================================================
// Lighting Solver Profile
// =============================================================================

export const LIGHTING_SOLVER_PROFILE: SolverProfile = {
  id: 'lighting',
  domain: 'Lighting & Illumination',
  traitSource: 'LIGHTING_TRAITS',
  solver: {
    solverType: 'lighting-solver',
    scale: 'scene',
    params: {
      maxLightsPerScene: 256,
      shadowMapResolution: 2048,
      giProbeSampleBudget: 50000,
      lightCullingEnabled: true,
    },
  },
  evidenceFields: [
    {
      name: 'target',
      label: 'Target',
      type: 'string',
      required: true,
      description:
        'The lighting trait exercised (global_illumination, shadow_caster, light_source, spotlight, point_light, area_light, etc.)',
      example: 'spotlight',
    },
    {
      name: 'action',
      label: 'Action',
      type: 'string',
      required: true,
      description:
        'The lighting operation (cast, illuminate, shadow, glow, flicker, dim, toggle, configure)',
      example: 'illuminate',
    },
    {
      name: 'state',
      label: 'State',
      type: 'string',
      required: true,
      description: 'Result state: illuminated | occluded | degraded | off | shadowed',
      example: 'illuminated',
    },
    {
      name: 'context',
      label: 'Context',
      type: 'string',
      required: true,
      description: 'The scene object or area the light was applied to (not a bare trait)',
      example: 'conference_room_ceiling',
    },
    {
      name: 'color',
      label: 'Color',
      type: 'string',
      required: false,
      description: 'Light color in sRGB hex or temperature descriptor',
      example: '#FFE4B5',
    },
    {
      name: 'intensity',
      label: 'Intensity',
      type: 'number',
      required: false,
      description: 'Light intensity in candela (point/spot) or lux (area)',
      example: 800,
    },
  ],
  caelTrace: {
    version: 'cael.v1',
    eventPattern: 'lighting.{target}.{action}',
    required: true,
  },
  version: '1.0.0',
  tags: ['lighting', 'illumination', 'gi', 'shadows', 'sesl'],
};

// =============================================================================
// Profile Registry
// =============================================================================

const solverProfileRegistry = new Map<string, SolverProfile>([
  ['networking-ai', NETWORKING_AI_SOLVER_PROFILE],
  ['iot-autonomous-agents', IOT_AUTONOMOUS_AGENTS_SOLVER_PROFILE],
  ['interop-copresence', INTEROP_COPRESENCE_SOLVER_PROFILE],
  ['universal-service', UNIVERSAL_SERVICE_SOLVER_PROFILE],
  ['accessibility', ACCESSIBILITY_SOLVER_PROFILE],
  ['simple-modifiers', SIMPLE_MODIFIERS_SOLVER_PROFILE],
  ['core-vr-interaction', CORE_VR_INTERACTION_SOLVER_PROFILE],
  ['parser-core-ui', PARSER_CORE_UI_SOLVER_PROFILE],
  ['visual-effects', VISUAL_EFFECTS_SOLVER_PROFILE],
  ['lighting', LIGHTING_SOLVER_PROFILE],
]);

/**
 * Get a solver profile by domain ID.
 * @throws Error if profile not found
 */
export function getSolverProfile(id: string): SolverProfile {
  const profile = solverProfileRegistry.get(id);
  if (!profile) {
    throw new Error(
      `Unknown solver profile: ${id}. Available: ${[...solverProfileRegistry.keys()].join(', ')}`
    );
  }
  return profile;
}

/**
 * Get all registered profile IDs.
 */
export function getSolverProfileIds(): string[] {
  return Array.from(solverProfileRegistry.keys());
}

/**
 * Get all registered profiles.
 */
export function getAllSolverProfiles(): SolverProfile[] {
  return Array.from(solverProfileRegistry.values());
}

/**
 * Get the required evidence field names for a domain profile.
 * Useful for receipt validation without importing the full profile.
 */
export function getRequiredEvidenceFields(id: string): string[] {
  const profile = solverProfileRegistry.get(id);
  if (!profile) return [];
  return profile.evidenceFields.filter((f) => f.required).map((f) => f.name);
}

/**
 * Validate that a receipt's evidence keys include all required fields for a profile.
 * Returns an acceptance object with violations if any required field is missing.
 */
export function validateReceiptEvidence(
  profileId: string,
  evidence: Record<string, unknown>
): { accepted: boolean; violations: Array<{ criterion: string; message: string }> } {
  const profile = solverProfileRegistry.get(profileId);
  if (!profile) {
    return {
      accepted: false,
      violations: [{ criterion: 'profile', message: `Unknown solver profile: ${profileId}` }],
    };
  }

  const violations: Array<{ criterion: string; message: string }> = [];

  for (const field of profile.evidenceFields) {
    if (field.required && !(field.name in evidence)) {
      violations.push({
        criterion: field.name,
        message: `Required evidence field '${field.name}' (${field.label}) is missing from receipt`,
      });
    }
  }

  return {
    accepted: violations.length === 0,
    violations,
  };
}

export default {
  NETWORKING_AI_SOLVER_PROFILE,
  IOT_AUTONOMOUS_AGENTS_SOLVER_PROFILE,
  INTEROP_COPRESENCE_SOLVER_PROFILE,
  UNIVERSAL_SERVICE_SOLVER_PROFILE,
  ACCESSIBILITY_SOLVER_PROFILE,
  SIMPLE_MODIFIERS_SOLVER_PROFILE,
  CORE_VR_INTERACTION_SOLVER_PROFILE,
  PARSER_CORE_UI_SOLVER_PROFILE,
  VISUAL_EFFECTS_SOLVER_PROFILE,
  LIGHTING_SOLVER_PROFILE,
  getSolverProfile,
  getSolverProfileIds,
  getAllSolverProfiles,
  getRequiredEvidenceFields,
  validateReceiptEvidence,
};
