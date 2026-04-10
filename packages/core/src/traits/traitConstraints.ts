import { TraitConstraint } from '../types';

// Zone/world-level constraints live in ZoneWorldConstraints.ts.
// Object-level constraints here remain the source of truth for single-entity rules.
// SemanticExpander compiler pass chains: object -> zone -> world validation.
export const BUILTIN_CONSTRAINTS: TraitConstraint[] = [
  // =============================================================================
  // PHYSICS & INTERACTION REQUIREMENTS
  // =============================================================================
  {
    type: 'requires',
    source: 'physics',
    targets: ['collidable'],
    message: 'Physics enabled objects must be collidable.',
  },
  {
    type: 'requires',
    source: 'grabbable',
    targets: ['physics'],
    message: 'Grabbable objects require physics to handle movement and collisions.',
  },
  {
    type: 'requires',
    source: 'throwable',
    targets: ['grabbable'],
    message: 'Throwable objects must be grabbable first.',
  },
  {
    type: 'requires',
    source: 'stackable',
    targets: ['physics', 'collidable'],
    message: 'Stackable objects require physics and collision detection.',
  },
  {
    type: 'requires',
    source: 'breakable',
    targets: ['physics', 'collidable'],
    message: 'Breakable objects require physics and collision to detect impacts.',
  },
  {
    type: 'requires',
    source: 'snappable',
    targets: ['grabbable'],
    message: 'Snappable objects must be grabbable to snap to positions.',
  },

  // =============================================================================
  // CONFLICT RULES
  // =============================================================================
  {
    type: 'conflicts',
    source: 'static',
    targets: ['physics', 'grabbable', 'throwable', 'scalable', 'rotatable'],
    message:
      'Static objects cannot have physics or be interactive (grabbable/throwable/scalable/rotatable).',
  },
  {
    type: 'conflicts',
    source: 'kinematic',
    targets: ['physics'],
    message: 'Kinematic objects handle their own motion and conflict with physics simulation.',
  },
  {
    type: 'conflicts',
    source: 'invisible',
    targets: ['hoverable', 'pointable'],
    message: 'Invisible objects cannot have hover or pointer visual feedback.',
  },

  // =============================================================================
  // PLATFORM EXCLUSIVITY
  // =============================================================================
  {
    type: 'conflicts',
    source: 'vr_only',
    targets: ['ar_only'],
    message: 'An object cannot be marked as both VR-only and AR-only.',
  },
  {
    type: 'conflicts',
    source: 'desktop_only',
    targets: ['vr_only', 'ar_only'],
    message: 'Desktop-only objects cannot also be VR-only or AR-only.',
  },

  // =============================================================================
  // MATERIAL & MESH DEPENDENCIES
  // =============================================================================
  {
    type: 'requires',
    source: 'cloth',
    targets: ['mesh'],
    message: 'Cloth physics requires a mesh to deform.',
  },
  {
    type: 'requires',
    source: 'soft_body',
    targets: ['mesh'],
    message: 'Soft body physics requires a mesh.',
  },
  {
    type: 'requires',
    source: 'particle_emitter',
    targets: ['visible'],
    message: 'Particle emitters must be visible to render particles.',
  },

  // =============================================================================
  // AUDIO REQUIREMENTS
  // =============================================================================
  {
    type: 'requires',
    source: 'spatial_audio',
    targets: ['audio'],
    message: 'Spatial audio requires an audio source.',
  },
  {
    type: 'requires',
    source: 'audio_zone',
    targets: ['collidable'],
    message: 'Audio zones require collision bounds to detect entry/exit.',
  },

  // =============================================================================
  // INTERACTION EXCLUSIVITY (one-of rules)
  // =============================================================================
  {
    type: 'oneof',
    source: 'interaction_mode',
    targets: ['grabbable', 'clickable', 'draggable'],
    message: 'Objects should have one primary interaction mode to avoid conflicts.',
  },

  // =============================================================================
  // ANIMATION REQUIREMENTS
  // =============================================================================
  {
    type: 'requires',
    source: 'animated',
    targets: ['mesh'],
    message: 'Animated trait requires a mesh with animation data.',
  },

  // =============================================================================
  // NETWORKING REQUIREMENTS
  // =============================================================================
  {
    type: 'requires',
    source: 'networked',
    targets: ['physics'],
    message: 'Networked objects require physics for state synchronization.',
  },
  {
    type: 'conflicts',
    source: 'local_only',
    targets: ['networked'],
    message: 'Local-only objects cannot be networked.',
  },

  // =============================================================================
  // UI TRAIT CONSTRAINTS
  // =============================================================================
  {
    type: 'conflicts',
    source: 'ui_floating',
    targets: ['ui_anchored', 'ui_docked'],
    message: 'UI panels cannot be both floating and anchored/docked.',
  },
  {
    type: 'conflicts',
    source: 'ui_anchored',
    targets: ['ui_floating', 'ui_docked'],
    message: 'UI panels cannot be both anchored and floating/docked.',
  },
  {
    type: 'conflicts',
    source: 'ui_hand_menu',
    targets: ['ui_anchored', 'ui_docked'],
    message: 'Hand menus cannot be anchored to world or docked.',
  },
  {
    type: 'requires',
    source: 'ui_keyboard',
    targets: ['ui_input'],
    message: 'Keyboard trait requires an input element to target.',
  },
  {
    type: 'oneof',
    source: 'ui_position_mode',
    targets: ['ui_floating', 'ui_anchored', 'ui_docked', 'ui_hand_menu'],
    message: 'UI element can only have one positioning mode.',
  },

  // =============================================================================
  // SPATIAL CONSTRAINT TRAIT REQUIREMENTS
  // =============================================================================

  // spatial_adjacent requires collidable bounds for distance measurement
  {
    type: 'requires',
    source: 'spatial_adjacent',
    targets: ['collidable'],
    message: 'spatial_adjacent requires collidable bounds to measure distance between entities.',
    suggestion: 'Add @collidable to provide bounds for spatial adjacency checking.',
  },

  // spatial_contains requires collidable bounds to define the container volume
  {
    type: 'requires',
    source: 'spatial_contains',
    targets: ['collidable'],
    message: 'spatial_contains requires collidable bounds to define the container volume.',
    suggestion: 'Add @collidable to define the bounding volume for containment checking.',
  },

  // spatial_reachable requires spatial_awareness for runtime path validation
  {
    type: 'requires',
    source: 'spatial_reachable',
    targets: ['spatial_awareness'],
    message:
      'spatial_reachable requires spatial_awareness for runtime path and obstacle detection.',
    suggestion: 'Add @spatial_awareness to enable spatial context for reachability checks.',
  },

  // spatial_contains conflicts with static (containers may need dynamic bounds)
  {
    type: 'conflicts',
    source: 'spatial_contains',
    targets: ['invisible'],
    message:
      'spatial_contains containers cannot be invisible; contained entities need visible boundary reference.',
    suggestion:
      'Remove @invisible or use @spatial_adjacent instead for invisible reference points.',
  },

  // Only one spatial constraint enforcement mode per entity
  {
    type: 'oneof',
    source: 'spatial_constraint_mode',
    targets: ['spatial_adjacent', 'spatial_contains'],
    message:
      'An entity should declare either spatial_adjacent or spatial_contains, not both. ' +
      'Use spatial_adjacent for proximity or spatial_contains for enclosure.',
    suggestion:
      'Choose the most appropriate spatial relationship: @spatial_adjacent for "near" or @spatial_contains for "inside".',
  },

  // =============================================================================
  // SPATIOTEMPORAL CONSTRAINT TRAIT REQUIREMENTS
  // =============================================================================

  // spatial_temporal_adjacent requires collidable for distance measurement
  {
    type: 'requires',
    source: 'spatial_temporal_adjacent',
    targets: ['collidable'],
    message:
      'spatial_temporal_adjacent requires collidable bounds to measure distance and track duration.',
    suggestion: 'Add @collidable to provide bounds for temporal adjacency checking.',
  },

  // spatial_temporal_adjacent conflicts with plain spatial_adjacent on same entity
  {
    type: 'conflicts',
    source: 'spatial_temporal_adjacent',
    targets: ['spatial_adjacent'],
    message: 'spatial_temporal_adjacent supersedes spatial_adjacent. Use one or the other.',
    suggestion:
      'Remove @spatial_adjacent if duration-based adjacency is desired, or remove @spatial_temporal_adjacent for simple distance checking.',
  },

  // spatial_temporal_reachable requires spatial_awareness
  {
    type: 'requires',
    source: 'spatial_temporal_reachable',
    targets: ['spatial_awareness'],
    message:
      'spatial_temporal_reachable requires spatial_awareness for velocity tracking and obstacle prediction.',
    suggestion:
      'Add @spatial_awareness to enable spatial context for velocity-predicted reachability.',
  },

  // spatial_temporal_reachable conflicts with plain spatial_reachable
  {
    type: 'conflicts',
    source: 'spatial_temporal_reachable',
    targets: ['spatial_reachable'],
    message: 'spatial_temporal_reachable supersedes spatial_reachable. Use one or the other.',
    suggestion:
      'Remove @spatial_reachable if velocity-predicted reachability is desired, or remove @spatial_temporal_reachable for static reachability.',
  },

  // spatial_trajectory requires physics for velocity/acceleration data
  {
    type: 'requires',
    source: 'spatial_trajectory',
    targets: ['physics'],
    message:
      'spatial_trajectory requires physics for velocity and acceleration data to predict trajectories.',
    suggestion: 'Add @physics to enable trajectory prediction from velocity data.',
  },

  // spatial_trajectory requires collidable for bounds checking
  {
    type: 'requires',
    source: 'spatial_trajectory',
    targets: ['collidable'],
    message: 'spatial_trajectory requires collidable bounds for keep_in/keep_out region checking.',
    suggestion: 'Add @collidable to provide bounds for trajectory constraint checking.',
  },

  // =============================================================================
  // ROBOTICS / URDF ROBOT MODEL CONSTRAINTS
  // =============================================================================
  {
    type: 'conflicts',
    source: 'urdf_robot',
    targets: ['cloth', 'soft_body', 'fluid'],
    message:
      'URDF robot models use rigid body joints and cannot have cloth, soft body, or fluid physics.',
  },
  {
    type: 'conflicts',
    source: 'urdf_robot',
    targets: ['particle_emitter'],
    message:
      'URDF robot models define their own visual hierarchy and conflict with particle emitters.',
  },

  // =============================================================================
  // CULTURAL PROFILE TRAIT CONSTRAINTS
  // =============================================================================

  // norm_compliant requires cultural_profile — agents must declare cultural identity
  // before they can be subject to norm compliance checking
  {
    type: 'requires',
    source: 'norm_compliant',
    targets: ['cultural_profile'],
    message: "Norm compliance requires a cultural_profile to define the agent's cultural identity.",
    suggestion:
      'Add @cultural_profile with cooperation_index, cultural_family, prompt_dialect, and norm_set.',
  },

  // cultural_memory requires cultural_profile — cultural memory storage needs
  // a cultural identity context to organize episodic and stigmergic memories
  {
    type: 'requires',
    source: 'cultural_memory',
    targets: ['cultural_profile'],
    message: 'Cultural memory requires a cultural_profile to contextualize memory storage.',
    suggestion: 'Add @cultural_profile before using @cultural_memory on an agent.',
  },

  // cultural_profile conflicts with isolationist + networked combination
  // (isolationist agents should not be networked — contradicts their nature)
  {
    type: 'conflicts',
    source: 'cultural_trace',
    targets: ['invisible'],
    message:
      'Cultural traces (stigmergic markers) must be visible for other agents to perceive them.',
    suggestion: 'Remove @invisible from objects bearing @cultural_trace, or use a visible marker.',
  },

  // =============================================================================
  // v6 UNIVERSAL SERVICE DOMAIN CONSTRAINTS
  // =============================================================================

  // Endpoint requires service — endpoints belong to a service context
  {
    type: 'requires',
    source: 'endpoint',
    targets: ['service'],
    message: 'Endpoints must belong to a service context.',
    suggestion: 'Wrap this endpoint in a service block or add @service trait.',
  },

  // Handler requires http or route — handlers need an HTTP binding
  {
    type: 'requires',
    source: 'handler',
    targets: ['http'],
    message: 'Handlers require an HTTP binding to receive requests.',
    suggestion: 'Add @http trait with method and path properties.',
  },

  // CORS requires http — CORS is HTTP-specific
  {
    type: 'requires',
    source: 'cors',
    targets: ['http'],
    message: 'CORS is an HTTP-specific concern and requires an HTTP binding.',
    suggestion: 'Add @http to enable CORS headers on HTTP responses.',
  },

  // Rate limit requires http — rate limiting is HTTP-specific
  {
    type: 'requires',
    source: 'rate_limit',
    targets: ['http'],
    message: 'Rate limiting requires HTTP request context.',
    suggestion: 'Add @http to enable request-based rate limiting.',
  },

  // Auth requires service or http — auth middleware needs service context
  {
    type: 'requires',
    source: 'auth',
    targets: ['http'],
    message: 'Auth middleware requires an HTTP context for token validation.',
    suggestion: 'Add @http to enable authentication on HTTP endpoints.',
  },

  // Gateway conflicts with proxy — different service patterns
  {
    type: 'conflicts',
    source: 'gateway',
    targets: ['proxy'],
    message: 'Gateway and proxy are mutually exclusive service patterns.',
    suggestion: 'Use @gateway for API aggregation or @proxy for transparent forwarding, not both.',
  },

  // Load balancer conflicts with gateway — different infra layers
  {
    type: 'conflicts',
    source: 'load_balancer',
    targets: ['gateway'],
    message: 'Load balancer and gateway operate at different infrastructure layers.',
    suggestion:
      'Use @load_balancer for L4/L7 traffic distribution or @gateway for API aggregation.',
  },

  // Service position mode — only one service architecture pattern
  {
    type: 'oneof',
    source: 'service_architecture_mode',
    targets: ['gateway', 'proxy', 'load_balancer', 'middleware'],
    message: 'Only one service architecture pattern per entity.',
    suggestion: 'Choose one: @gateway, @proxy, @load_balancer, or @middleware.',
  },

  // =============================================================================
  // v6 UNIVERSAL DATA DOMAIN CONSTRAINTS
  // =============================================================================

  // Data index requires data_model — index needs a model to index
  {
    type: 'requires',
    source: 'data_index',
    targets: ['data_model'],
    message: 'Data indexes require a data model to define the indexed columns.',
    suggestion: 'Define a data_model block before creating indexes on it.',
  },

  // Data trigger requires data_model — trigger needs a model
  {
    type: 'requires',
    source: 'data_trigger',
    targets: ['data_model'],
    message: 'Data triggers must reference a data model table.',
    suggestion: 'Define a data_model block to provide the table for this trigger.',
  },

  // Stored procedure requires data_model — SP needs model context
  {
    type: 'requires',
    source: 'stored_procedure',
    targets: ['data_model'],
    message: 'Stored procedures operate on data models.',
    suggestion: 'Define a data_model block that this stored procedure targets.',
  },

  // Data view requires data_model — views derive from models
  {
    type: 'requires',
    source: 'data_view',
    targets: ['data_model'],
    message: 'Data views are derived from data models.',
    suggestion: 'Define a data_model block as the source for this view.',
  },

  // Migration conflicts with seed — different lifecycle phases
  {
    type: 'conflicts',
    source: 'migration',
    targets: ['seed'],
    message: 'Migrations and seeds are different lifecycle phases and should be separate blocks.',
    suggestion: 'Define migrations and seeds in separate blocks for clear ordering.',
  },

  // =============================================================================
  // v6 UNIVERSAL PIPELINE DOMAIN CONSTRAINTS
  // =============================================================================

  // Consumer requires queue or topic — consumers need a message source
  {
    type: 'requires',
    source: 'consumer',
    targets: ['queue'],
    message: 'Consumers require a queue or topic to consume messages from.',
    suggestion: 'Define a queue block and reference it from this consumer.',
  },

  // Producer requires queue or topic — producers need a message target
  {
    type: 'requires',
    source: 'producer',
    targets: ['queue'],
    message: 'Producers require a queue or topic to publish messages to.',
    suggestion: 'Define a queue block and reference it from this producer.',
  },

  // Dead letter requires queue — DLQ needs a primary queue
  {
    type: 'requires',
    source: 'dead_letter',
    targets: ['queue'],
    message: 'Dead letter queues require a primary queue to catch failed messages from.',
    suggestion: 'Define a queue block as the source for this dead letter queue.',
  },

  // Stage requires pipeline — stages belong to pipelines
  {
    type: 'requires',
    source: 'stage',
    targets: ['pipeline'],
    message: 'Stages must belong to a pipeline.',
    suggestion: 'Wrap this stage in a pipeline block.',
  },

  // Worker conflicts with scheduler — different execution models
  {
    type: 'conflicts',
    source: 'worker',
    targets: ['scheduler'],
    message: 'Workers process jobs continuously while schedulers trigger at intervals.',
    suggestion: 'Use @worker for continuous processing or @scheduler for cron-based execution.',
  },

  // Consumer conflicts with producer on same entity — pick one direction
  {
    type: 'conflicts',
    source: 'consumer',
    targets: ['producer'],
    message: 'An entity should be either a consumer or a producer, not both.',
    suggestion:
      'Split into separate consumer and producer blocks for clear message flow direction.',
  },

  // =============================================================================
  // v6 UNIVERSAL CONTAINER/INFRA DOMAIN CONSTRAINTS
  // =============================================================================

  // Serverless conflicts with container — different deployment models
  {
    type: 'conflicts',
    source: 'serverless',
    targets: ['container'],
    message: 'Serverless and container are mutually exclusive deployment models.',
    suggestion: 'Choose @serverless for FaaS or @container for long-running services.',
  },

  // Horizontal scaling requires service — scaling needs a service to scale
  {
    type: 'requires',
    source: 'horizontal_scaling',
    targets: ['service'],
    message: 'Horizontal scaling requires a service to replicate.',
    suggestion: 'Add @service to define the scalable unit.',
  },

  // =============================================================================
  // v6 UNIVERSAL OBSERVABILITY DOMAIN CONSTRAINTS
  // =============================================================================

  // Tracing requires service or handler — tracing needs a service context
  {
    type: 'requires',
    source: 'tracing',
    targets: ['service'],
    message: 'Distributed tracing requires a service context for span propagation.',
    suggestion: 'Add @service to enable trace context propagation.',
  },

  // Alerting requires metric — alerts need metrics to alert on
  {
    type: 'requires',
    source: 'alerting',
    targets: ['metric'],
    message: 'Alerting rules require metrics to evaluate thresholds against.',
    suggestion: 'Add @metric to define the values that trigger alerts.',
  },

  // Health check requires service — health checks monitor services
  {
    type: 'requires',
    source: 'health_check',
    targets: ['service'],
    message: 'Health checks require a service to monitor.',
    suggestion: 'Add @service to define the monitored service endpoint.',
  },

  // =============================================================================
  // v6 UNIVERSAL RESILIENCE DOMAIN CONSTRAINTS (v5.4)
  // =============================================================================

  // Circuit breaker requires service — wraps service calls
  {
    type: 'requires',
    source: 'circuit_breaker',
    targets: ['service'],
    message: 'Circuit breakers wrap service calls to prevent cascade failures.',
    suggestion: 'Add @service to define the protected service endpoint.',
  },

  // Retry requires service or pipeline — retries need a callable context
  {
    type: 'requires',
    source: 'retry',
    targets: ['service'],
    message: 'Retry policies require a service or pipeline context.',
    suggestion: 'Add @service to define the endpoint with retry behavior.',
  },

  // Timeout requires service — timeouts bound service call duration
  {
    type: 'requires',
    source: 'timeout',
    targets: ['service'],
    message: 'Timeout policies require a service context to bound request duration.',
    suggestion: 'Add @service to define the endpoint with timeout behavior.',
  },

  // Bulkhead requires service — isolates concurrent requests
  {
    type: 'requires',
    source: 'bulkhead',
    targets: ['service'],
    message: 'Bulkhead isolation requires a service context for concurrency partitioning.',
    suggestion: 'Add @service to define the endpoint with bulkhead isolation.',
  },

  // Middleware requires service — middleware wraps service endpoints
  {
    type: 'requires',
    source: 'middleware',
    targets: ['service'],
    message: 'Middleware requires a service context to wrap endpoints.',
    suggestion: 'Add @service to define the service where middleware is applied.',
  },

  // Migration requires db — database migrations need a connection
  {
    type: 'requires',
    source: 'migration',
    targets: ['db'],
    message: 'Database migrations require a database connection (@db).',
    suggestion: 'Add @db to define the database connection for migrations.',
  },

  // Saga requires db — distributed transactions need persistence
  {
    type: 'requires',
    source: 'saga',
    targets: ['db'],
    message: 'Sagas require database access for transaction state management.',
    suggestion: 'Add @db for the saga coordinator state store.',
  },

  // Circuit breaker conflicts with fallback at same level
  {
    type: 'conflicts',
    source: 'circuit_breaker',
    targets: ['bulkhead'],
    message: 'Circuit breaker and bulkhead should be applied at different granularity levels.',
    suggestion:
      'Apply @circuit_breaker at the service level and @bulkhead at the endpoint level, or vice versa.',
  },
];
