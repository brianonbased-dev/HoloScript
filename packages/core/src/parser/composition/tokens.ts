/**
 * HoloScript Composition Parser — Token Types & Keywords
 *
 * Extracted from HoloCompositionParser.ts (W1-T2: split by rule-family).
 * This module contains the token type definitions, keyword maps, and
 * primitive shape/light constant sets shared by the lexer and parser.
 *
 * @version 1.0.0
 */

// =============================================================================
// TOKEN TYPES
// =============================================================================

export type TokenType =
  | 'IDENTIFIER'
  | 'STRING'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'NULL'
  | 'LBRACE'
  | 'RBRACE'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'LPAREN'
  | 'RPAREN'
  | 'COLON'
  | 'COMMA'
  | 'DOT'
  | 'EQUALS'
  | 'PLUS_EQUALS'
  | 'MINUS_EQUALS'
  | 'STAR_EQUALS'
  | 'SLASH_EQUALS'
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH'
  | 'LESS'
  | 'GREATER'
  | 'LESS_EQUALS'
  | 'GREATER_EQUALS'
  | 'EQUALS_EQUALS'
  | 'BANG_EQUALS'
  | 'BANG'
  | 'AND'
  | 'OR'
  | 'ARROW'
  | 'AT'
  | 'HASH'
  | 'SEMICOLON'
  | 'QUESTION'
  | 'NEWLINE'
  | 'EOF'
  // Keywords
  | 'COMPOSITION'
  | 'THEME'
  | 'ENVIRONMENT'
  | 'STATE'
  | 'TEMPLATE'
  | 'OBJECT'
  | 'SPATIAL_GROUP'
  | 'LOGIC'
  | 'ACTION'
  | 'ASYNC'
  | 'AWAIT'
  | 'IF'
  | 'ELSE'
  | 'FOR'
  | 'IN'
  | 'RETURN'
  | 'EMIT'
  | 'ANIMATE'
  | 'USING'
  | 'IMPORT'
  | 'ON_ERROR'
  | 'FROM'
  | 'WHILE'
  | 'LET'
  | 'VAR'
  | 'CONST'
  | 'INC'
  | 'DEC'
  | 'PARTICLE_SYSTEM'
  | 'LIGHT'
  | 'EFFECTS'
  | 'CAMERA'
  | 'BIND'
  | 'TIMELINE'
  | 'AUDIO'
  | 'ZONE'
  | 'UI'
  | 'TRANSITION'
  | 'ELEMENT'
  | 'SPATIAL_AGENT'
  | 'SPATIAL_CONTAINER'
  | 'UI_PANEL'
  | 'UI_TEXT'
  | 'UI_BUTTON'
  | 'UI_SLIDER'
  | 'UI_INPUT'
  | 'UI_IMAGE'
  | 'UI_CHART'
  | 'UI_GAUGE'
  | 'UI_VALUE'
  | 'UI_STATUS_INDICATOR'
  | 'TOOL_SLOT'
  | 'BEHAVIOR'
  // Brittney AI Features
  | 'NPC'
  | 'QUEST'
  | 'ABILITY'
  | 'DIALOGUE'
  | 'STATE_MACHINE'
  | 'ACHIEVEMENT'
  | 'TALENT_TREE'
  | 'SHAPE'
  | 'SUB_ORB'
  | 'MIGRATE'
  // HSPlus language constructs
  | 'STRUCT'
  | 'ENUM'
  | 'INTERFACE'
  | 'MODULE'
  | 'EXPORT'
  | 'FUNCTION'
  | 'SWITCH'
  | 'CASE'
  | 'DEFAULT'
  | 'BREAK'
  | 'TRY'
  | 'CATCH'
  | 'FINALLY'
  | 'THROW'
  | 'NEW'
  | 'OF'
  | 'EXTENDS'
  // Domain-specific block tokens (v4.1 — March 2026)
  | 'IOT_SENSOR'
  | 'IOT_DEVICE'
  | 'IOT_BINDING'
  | 'IOT_TELEMETRY'
  | 'IOT_DIGITAL_TWIN'
  | 'ROBOT_JOINT'
  | 'ROBOT_ACTUATOR'
  | 'ROBOT_CONTROLLER'
  | 'ROBOT_END_EFFECTOR'
  | 'DATAVIZ_DASHBOARD'
  | 'DATAVIZ_CHART'
  | 'DATAVIZ_DATA_SOURCE'
  | 'DATAVIZ_WIDGET'
  | 'DATAVIZ_METRIC'
  | 'EDU_LESSON'
  | 'EDU_QUIZ'
  | 'EDU_CURRICULUM'
  | 'HEALTH_PROCEDURE'
  | 'HEALTH_PATIENT_MODEL'
  | 'HEALTH_VITAL_MONITOR'
  | 'MUSIC_INSTRUMENT'
  | 'MUSIC_TRACK'
  | 'MUSIC_SEQUENCE'
  | 'MUSIC_EFFECT_CHAIN'
  | 'ARCH_FLOOR_PLAN'
  | 'ARCH_ROOM'
  | 'ARCH_BUILDING'
  | 'ARCH_HVAC'
  | 'WEB3_CONTRACT'
  | 'WEB3_TOKEN'
  | 'WEB3_WALLET'
  | 'WEB3_MARKETPLACE'
  | 'WEB3_GOVERNANCE'
  // Extensible custom block
  | 'CUSTOM_BLOCK'
  // Simulation domain (v6.1 — PDE solvers)
  | 'SIMULATION'
  // Perception & simulation layer (v4.2 — March 2026)
  | 'MATERIAL'
  | 'PBR_MATERIAL'
  | 'UNLIT_MATERIAL'
  | 'SHADER'
  | 'COLLIDER'
  | 'RIGIDBODY'
  | 'FORCE_FIELD'
  | 'ARTICULATION'
  | 'PARTICLES'
  | 'EMITTER'
  | 'VFX'
  | 'POST_PROCESSING'
  | 'POST_FX'
  | 'AUDIO_SOURCE'
  | 'REVERB_ZONE'
  | 'AMBIENCE'
  | 'WEATHER'
  | 'ATMOSPHERE'
  | 'PROCEDURAL'
  | 'SCATTER'
  | 'LOD_BLOCK'
  | 'RENDER'
  | 'NAVMESH'
  | 'NAV_AGENT'
  | 'BEHAVIOR_TREE'
  | 'INPUT_BLOCK'
  | 'INTERACTION'
  // Codebase absorption (v4.3)
  | 'CODEBASE'
  | 'MODULE_MAP'
  | 'DEPENDENCY_GRAPH'
  | 'CALL_GRAPH'
  // Graph RAG (v4.4)
  | 'SEMANTIC_SEARCH'
  | 'GRAPH_QUERY'
  | 'ANNOTATION'
  // Norm lifecycle / cultural engineering (v4.5)
  | 'NORM'
  | 'METANORM'
  | 'NORM_PROPOSAL'
  | 'NORM_VOTING'
  | 'NORM_ADOPTION'
  | 'NORM_VIOLATION'
  | 'NORM_SANCTION'
  // Narrative / StoryWeaver Protocol (v4.6)
  | 'NARRATIVE_BLOCK'
  | 'CHAPTER'
  | 'DIALOGUE_TREE'
  | 'CUTSCENE_SEQUENCE'
  // Payment / x402 Protocol (v4.7)
  | 'PAYWALL'
  | 'PAYMENT_GATE'
  | 'SUBSCRIPTION'
  | 'TIP_JAR'
  // v6 Universal domains (v5.4 — Domains Unified)
  | 'SERVICE_BLOCK'
  | 'ENDPOINT_BLOCK'
  | 'ROUTE_BLOCK'
  | 'HANDLER_BLOCK'
  | 'MIDDLEWARE_BLOCK'
  | 'GATEWAY_BLOCK'
  | 'CONTRACT_BLOCK'
  | 'SCHEMA_BLOCK'
  | 'VALIDATOR_BLOCK'
  | 'SERIALIZER_BLOCK'
  | 'DB_BLOCK'
  | 'MODEL_BLOCK'
  | 'QUERY_BLOCK'
  | 'MIGRATION_BLOCK'
  | 'CACHE_BLOCK'
  | 'HTTP_BLOCK'
  | 'WEBSOCKET_BLOCK'
  | 'GRPC_BLOCK'
  | 'GRAPHQL_BLOCK'
  | 'PIPELINE_BLOCK'
  | 'STREAM_BLOCK'
  | 'QUEUE_BLOCK'
  | 'WORKER_BLOCK'
  | 'SCHEDULER_BLOCK'
  | 'METRIC_BLOCK'
  | 'TRACE_BLOCK'
  | 'LOG_BLOCK'
  | 'HEALTH_CHECK_BLOCK'
  | 'CONTAINER_BLOCK'
  | 'DEPLOYMENT_BLOCK'
  | 'SCALING_BLOCK'
  | 'SECRET_BLOCK'
  | 'CIRCUIT_BREAKER_BLOCK'
  | 'RETRY_BLOCK'
  | 'TIMEOUT_BLOCK'
  | 'FALLBACK_BLOCK'
  | 'BULKHEAD_BLOCK'
  | 'METADATA_BLOCK'
  // Spatial primitives
  | 'SPAWN_GROUP'
  | 'WAYPOINTS'
  | 'CONSTRAINT'
  | 'TERRAIN'
  // Process pipeline directives (.hs format — v5)
  | 'CONNECT'
  | 'EXECUTE'
  // Comment tokens (skipped by lexer but used in parser guards)
  | 'COMMENT'
  | 'LINE_COMMENT';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}

// =============================================================================
// KEYWORDS
// =============================================================================

export const KEYWORDS: Record<string, TokenType> = {
  composition: 'COMPOSITION',
  theme: 'THEME',
  environment: 'ENVIRONMENT',
  state: 'STATE',
  template: 'TEMPLATE',
  object: 'OBJECT',
  instanced_object: 'OBJECT',
  spatial_group: 'SPATIAL_GROUP',
  logic: 'LOGIC',
  action: 'ACTION',
  async: 'ASYNC',
  await: 'AWAIT',
  if: 'IF',
  else: 'ELSE',
  for: 'FOR',
  in: 'IN',
  return: 'RETURN',
  emit: 'EMIT',
  animate: 'ANIMATE',
  on_error: 'ON_ERROR',
  while: 'WHILE',
  let: 'LET',
  var: 'VAR',
  const: 'CONST',
  node: 'SPATIAL_GROUP',
  orb: 'OBJECT',
  using: 'USING',
  import: 'IMPORT',
  from: 'FROM',
  particle_system: 'PARTICLE_SYSTEM',
  light: 'LIGHT',
  effects: 'EFFECTS',
  camera: 'CAMERA',
  bind: 'BIND',
  timeline: 'TIMELINE',
  audio: 'AUDIO',
  zone: 'ZONE',
  ui: 'UI',
  transition: 'TRANSITION',
  element: 'ELEMENT',
  spatial_agent: 'SPATIAL_AGENT',
  spatial_container: 'SPATIAL_CONTAINER',
  ui_panel: 'UI_PANEL',
  ui_text: 'UI_TEXT',
  ui_button: 'UI_BUTTON',
  ui_slider: 'UI_SLIDER',
  ui_input: 'UI_INPUT',
  ui_image: 'UI_IMAGE',
  ui_chart: 'UI_CHART',
  ui_gauge: 'UI_GAUGE',
  ui_value: 'UI_VALUE',
  ui_status_indicator: 'UI_STATUS_INDICATOR',
  tool_slot: 'TOOL_SLOT',
  behavior: 'BEHAVIOR',
  // Brittney AI Features
  npc: 'NPC',
  quest: 'QUEST',
  ability: 'ABILITY',
  dialogue: 'DIALOGUE',
  state_machine: 'STATE_MACHINE',
  achievement: 'ACHIEVEMENT',
  talent_tree: 'TALENT_TREE',
  shape: 'SHAPE',
  sub_orb: 'SUB_ORB',
  migrate: 'MIGRATE',
  // HSPlus language constructs
  struct: 'STRUCT',
  enum: 'ENUM',
  interface: 'INTERFACE',
  module: 'MODULE',
  export: 'EXPORT',
  function: 'FUNCTION',
  switch: 'SWITCH',
  case: 'CASE',
  default: 'DEFAULT',
  break: 'BREAK',
  try: 'TRY',
  catch: 'CATCH',
  finally: 'FINALLY',
  throw: 'THROW',
  new: 'NEW',
  of: 'OF',
  extends: 'EXTENDS',
  // Spatial primitives
  spawn_group: 'SPAWN_GROUP',
  waypoints: 'WAYPOINTS',
  constraint: 'CONSTRAINT',
  terrain: 'TERRAIN',
  // IoT / Digital Twin
  sensor: 'IOT_SENSOR',
  device: 'IOT_DEVICE',
  binding: 'IOT_BINDING',
  telemetry_stream: 'IOT_TELEMETRY',
  digital_twin: 'IOT_DIGITAL_TWIN',
  data_binding: 'IOT_BINDING',
  mqtt_source: 'IOT_SENSOR',
  mqtt_sink: 'IOT_DEVICE',
  wot_thing: 'IOT_DEVICE',
  // Robotics
  joint: 'ROBOT_JOINT',
  actuator: 'ROBOT_ACTUATOR',
  controller: 'ROBOT_CONTROLLER',
  end_effector: 'ROBOT_END_EFFECTOR',
  kinematics: 'ROBOT_CONTROLLER',
  gripper: 'ROBOT_END_EFFECTOR',
  mobile_base: 'ROBOT_CONTROLLER',
  safety_zone: 'ZONE',
  path_planner: 'ROBOT_CONTROLLER',
  // Data Visualization
  dashboard: 'DATAVIZ_DASHBOARD',
  chart: 'DATAVIZ_CHART',
  data_source: 'DATAVIZ_DATA_SOURCE',
  widget: 'DATAVIZ_WIDGET',
  panel: 'DATAVIZ_WIDGET',
  metric: 'DATAVIZ_METRIC',
  alert_rule: 'DATAVIZ_METRIC',
  report: 'DATAVIZ_DASHBOARD',
  // Education
  lesson: 'EDU_LESSON',
  quiz: 'EDU_QUIZ',
  curriculum: 'EDU_CURRICULUM',
  course: 'EDU_CURRICULUM',
  assessment: 'EDU_QUIZ',
  flashcard: 'EDU_LESSON',
  tutorial: 'EDU_LESSON',
  lab_experiment: 'EDU_LESSON',
  exercise: 'EDU_LESSON',
  // Healthcare
  procedure: 'HEALTH_PROCEDURE',
  patient_model: 'HEALTH_PATIENT_MODEL',
  vital_monitor: 'HEALTH_VITAL_MONITOR',
  diagnosis: 'HEALTH_PROCEDURE',
  therapeutic: 'HEALTH_PROCEDURE',
  surgical_step: 'HEALTH_PROCEDURE',
  anatomy_layer: 'HEALTH_PATIENT_MODEL',
  drug_interaction: 'HEALTH_PROCEDURE',
  // Music
  instrument: 'MUSIC_INSTRUMENT',
  track: 'MUSIC_TRACK',
  sequence: 'MUSIC_SEQUENCE',
  sample: 'MUSIC_INSTRUMENT',
  effect_chain: 'MUSIC_EFFECT_CHAIN',
  mixer: 'MUSIC_EFFECT_CHAIN',
  midi_map: 'MUSIC_INSTRUMENT',
  beat_pattern: 'MUSIC_SEQUENCE',
  chord_progression: 'MUSIC_SEQUENCE',
  // Architecture
  floor_plan: 'ARCH_FLOOR_PLAN',
  room: 'ARCH_ROOM',
  building: 'ARCH_BUILDING',
  facade: 'ARCH_BUILDING',
  structural: 'ARCH_BUILDING',
  hvac_system: 'ARCH_HVAC',
  plumbing_system: 'ARCH_BUILDING',
  electrical_system: 'ARCH_BUILDING',
  landscape: 'ARCH_BUILDING',
  // Web3
  contract: 'WEB3_CONTRACT',
  token: 'WEB3_TOKEN',
  wallet: 'WEB3_WALLET',
  marketplace: 'WEB3_MARKETPLACE',
  auction: 'WEB3_MARKETPLACE',
  royalty_split: 'WEB3_CONTRACT',
  governance: 'WEB3_GOVERNANCE',
  staking_pool: 'WEB3_CONTRACT',
  bridge: 'WEB3_CONTRACT',
  // Perception & simulation layer (v4.2 — March 2026)
  material: 'MATERIAL',
  pbr_material: 'PBR_MATERIAL',
  unlit_material: 'UNLIT_MATERIAL',
  shader: 'SHADER',
  collider: 'COLLIDER',
  rigidbody: 'RIGIDBODY',
  force_field: 'FORCE_FIELD',
  gravity_zone: 'FORCE_FIELD',
  wind_zone: 'FORCE_FIELD',
  buoyancy_zone: 'FORCE_FIELD',
  magnetic_field: 'FORCE_FIELD',
  drag_zone: 'FORCE_FIELD',
  articulation: 'ARTICULATION',
  hinge: 'ARTICULATION',
  ball_socket: 'ARTICULATION',
  fixed_joint: 'ARTICULATION',
  d6_joint: 'ARTICULATION',
  spring_joint: 'ARTICULATION',
  prismatic: 'ARTICULATION',
  particles: 'PARTICLES',
  emitter: 'EMITTER',
  vfx: 'VFX',
  post_processing: 'POST_PROCESSING',
  post_fx: 'POST_FX',
  render_pipeline: 'POST_PROCESSING',
  audio_source: 'AUDIO_SOURCE',
  audio_listener: 'AUDIO_SOURCE',
  reverb_zone: 'REVERB_ZONE',
  audio_mixer: 'AUDIO_SOURCE',
  ambience: 'AMBIENCE',
  sound_emitter: 'AUDIO_SOURCE',
  weather: 'WEATHER',
  atmosphere: 'ATMOSPHERE',
  sky: 'WEATHER',
  climate: 'WEATHER',
  simulation: 'SIMULATION',
  procedural: 'PROCEDURAL',
  generate: 'PROCEDURAL',
  scatter: 'SCATTER',
  distribute: 'SCATTER',
  lod: 'LOD_BLOCK',
  render: 'RENDER',
  navmesh: 'NAVMESH',
  nav_agent: 'NAV_AGENT',
  behavior_tree: 'BEHAVIOR_TREE',
  obstacle: 'NAVMESH',
  nav_link: 'NAVMESH',
  nav_modifier: 'NAVMESH',
  crowd_manager: 'NAVMESH',
  input: 'INPUT_BLOCK',
  interaction: 'INTERACTION',
  gesture_profile: 'INPUT_BLOCK',
  controller_map: 'INPUT_BLOCK',
  // Codebase absorption (v4.3)
  codebase: 'CODEBASE',
  module_map: 'MODULE_MAP',
  dependency_graph: 'DEPENDENCY_GRAPH',
  call_graph: 'CALL_GRAPH',
  // Graph RAG (v4.4)
  semantic_search: 'SEMANTIC_SEARCH',
  graph_query: 'GRAPH_QUERY',
  // Norm lifecycle / cultural engineering (v4.5)
  norm: 'NORM',
  metanorm: 'METANORM',
  norm_proposal: 'NORM_PROPOSAL',
  norm_voting: 'NORM_VOTING',
  norm_adoption: 'NORM_ADOPTION',
  norm_violation: 'NORM_VIOLATION',
  norm_sanction: 'NORM_SANCTION',
  // Narrative / StoryWeaver Protocol (v4.6)
  narrative: 'NARRATIVE_BLOCK',
  chapter: 'CHAPTER',
  dialogue_tree: 'DIALOGUE_TREE',
  cutscene_sequence: 'CUTSCENE_SEQUENCE',
  cutscene: 'CUTSCENE_SEQUENCE',
  // Payment / x402 Protocol (v4.7)
  paywall: 'PAYWALL',
  payment_gate: 'PAYMENT_GATE',
  subscription: 'SUBSCRIPTION',
  tip_jar: 'TIP_JAR',
  // v6 Universal domains (v5.4 — Domains Unified)
  service: 'SERVICE_BLOCK',
  endpoint: 'ENDPOINT_BLOCK',
  route: 'ROUTE_BLOCK',
  handler: 'HANDLER_BLOCK',
  middleware: 'MIDDLEWARE_BLOCK',
  gateway: 'GATEWAY_BLOCK',
  service_contract: 'CONTRACT_BLOCK',
  schema: 'SCHEMA_BLOCK',
  validator: 'VALIDATOR_BLOCK',
  serializer: 'SERIALIZER_BLOCK',
  db: 'DB_BLOCK',
  data_model: 'MODEL_BLOCK',
  query: 'QUERY_BLOCK',
  migration: 'MIGRATION_BLOCK',
  cache: 'CACHE_BLOCK',
  http: 'HTTP_BLOCK',
  websocket: 'WEBSOCKET_BLOCK',
  grpc: 'GRPC_BLOCK',
  graphql: 'GRAPHQL_BLOCK',
  pipeline: 'PIPELINE_BLOCK',
  stream: 'STREAM_BLOCK',
  queue: 'QUEUE_BLOCK',
  worker: 'WORKER_BLOCK',
  scheduler: 'SCHEDULER_BLOCK',
  obs_metric: 'METRIC_BLOCK',
  trace: 'TRACE_BLOCK',
  log: 'LOG_BLOCK',
  health_check: 'HEALTH_CHECK_BLOCK',
  container: 'CONTAINER_BLOCK',
  deployment: 'DEPLOYMENT_BLOCK',
  scaling: 'SCALING_BLOCK',
  secret: 'SECRET_BLOCK',
  circuit_breaker: 'CIRCUIT_BREAKER_BLOCK',
  retry: 'RETRY_BLOCK',
  timeout: 'TIMEOUT_BLOCK',
  fallback: 'FALLBACK_BLOCK',
  bulkhead: 'BULKHEAD_BLOCK',
  // Process pipeline directives (.hs format — v5)
  connect: 'CONNECT',
  execute: 'EXECUTE',
  scene: 'COMPOSITION',
  entity: 'OBJECT',
  compute_pipeline: 'PIPELINE_BLOCK',
  frame_loop: 'LOGIC',
  buffer: 'MODEL_BLOCK',
  constants: 'STATE',
  profiler: 'METRIC_BLOCK',
  export_config: 'METADATA_BLOCK',
  texture: 'MODEL_BLOCK',
  sampler: 'MODEL_BLOCK',
  metadata: 'METADATA_BLOCK',
  post_process: 'POST_PROCESSING',
  true: 'BOOLEAN',
  false: 'BOOLEAN',
  null: 'NULL',
};

// Primitive shape types that can use #id syntax
export const PRIMITIVE_SHAPES = new Set([
  'cube',
  'box',
  'sphere',
  'cylinder',
  'cone',
  'torus',
  'plane',
  'capsule',
  'ring',
  'dodecahedron',
  'icosahedron',
  'octahedron',
  'tetrahedron',
  'circle',
  'lathe',
  'extrude',
  'text',
  'sprite',
  'mesh',
  'model',
  'splat',
  'nerf',
]);

// Light primitives handled as shorthand: point_light { ... }, ambient_light { ... }, etc.
export const LIGHT_PRIMITIVES = new Set([
  'point_light',
  'ambient_light',
  'directional_light',
  'spot_light',
  'hemisphere_light',
]);
