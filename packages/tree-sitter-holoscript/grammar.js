/**
 * tree-sitter-holoscript
 *
 * Tree-sitter grammar for HoloScript — spatial computing language.
 * Supports .hs (agent behaviors + spatial awareness),
 *          .hsplus (full apps: modules/structs/enums/typed functions),
 *          .holo (world compositions: environments/NPCs/quests/networking).
 *
 * 18 compile targets: Unity, Unreal, Godot, VisionOS, VRChat, Babylon,
 * PlayCanvas, R3F, WASM, WebGPU, URDF, DTDL, SDF, USD, glTF, Android, iOS, AndroidXR
 *
 * @see https://github.com/nicholascsmith/HoloScript
 * @see https://tree-sitter.github.io/tree-sitter/
 */

/// <reference types="tree-sitter-cli/dsl" />

/**
 * Helper to create comma-separated lists
 * @param {RuleOrLiteral} rule
 * @param {RuleOrLiteral} separator
 */
function sepBy(rule, separator) {
  return optional(seq(rule, repeat(seq(separator, rule))));
}

/**
 * Helper to create comma-separated lists with trailing separator allowed
 * @param {RuleOrLiteral} rule
 * @param {RuleOrLiteral} separator
 */
function sepByTrailing(rule, separator) {
  return optional(seq(rule, repeat(seq(separator, rule)), optional(separator)));
}

module.exports = grammar({
  name: 'holoscript',

  // Handle whitespace and comments
  extras: ($) => [/\s/, $.comment],

  // Handle parsing conflicts
  conflicts: ($) => [
    [$.object],
  ],

  // External scanner for handling string interpolation (future)
  externals: ($) => [],

  // Word rule for keyword extraction
  word: ($) => $.identifier,

  // Inline rules for performance
  inline: ($) => [$._statement, $._expression, $._value],

  // Supertypes for AST queries
  supertypes: ($) => [$._definition, $._statement, $._expression, $._value],

  rules: {
    // =========================================================================
    // TOP-LEVEL STRUCTURE
    // =========================================================================

    source_file: ($) => repeat($._definition),

    _definition: ($) =>
      choice(
        // Core scene formats
        $.composition,
        $.world,
        $.template,
        $.object,
        $.entity,
        $.environment,
        // HSPlus language constructs
        $.module_declaration,
        $.struct_definition,
        $.enum_definition,
        $.interface_definition,
        $.import_statement,
        $.export_statement,
        $.function_declaration,
        // Spatial computing primitives
        $.zone_declaration,
        $.spawn_group,
        $.waypoints_block,
        $.constraint_block,
        $.terrain_block,
        // Domain-specific blocks (structured for AI training)
        $.iot_block,
        $.robotics_block,
        $.dataviz_block,
        $.education_block,
        $.healthcare_block,
        $.music_block,
        $.architecture_block,
        $.web3_block,
        // Perception & simulation layer (v4.2 — March 2026)
        $.material_block,
        $.particle_block,
        $.post_processing_block,
        $.weather_block,
        $.procedural_block,
        $.lod_block,
        $.navigation_block,
        $.input_block,
        $.audio_source_block,
        $.force_field_block,
        $.articulation_block,
        $.render_hints,
        $.annotation,
        // Built-in test framework
        $.test_block,
        // Codebase absorption (v4.3)
        $.codebase_block,
        // Shared constructs
        $.action,
        $.event_bus,
        $.trait_definition,
        $.timeline,
        $.state_declaration,
        // Linear resource types (v4.4 — compile-time safety)
        $.resource_definition,
        // Extensible: any unknown domain block
        $.custom_block
      ),

    // =========================================================================
    // COMPOSITION (Primary .holo format)
    // =========================================================================

    composition: ($) =>
      seq('composition', field('name', $.string), '{', repeat($._composition_content), '}'),

    _composition_content: ($) =>
      choice(
        $.environment,
        $.config_block,
        $.template,
        $.object,
        $.spatial_group,
        $.timeline,
        $.logic,
        $.light,
        $.camera,
        $.action,
        $.state_declaration,
        $.dialog_block,
        $.networked_block,
        // HSPlus features inside compositions
        $.module_declaration,
        $.function_declaration,
        $.zone_declaration,
        $.spawn_group,
        $.waypoints_block,
        $.event_handler,
        // Domain blocks inside compositions
        $.iot_block,
        $.robotics_block,
        $.dataviz_block,
        $.education_block,
        $.healthcare_block,
        $.music_block,
        $.architecture_block,
        $.web3_block,
        // Perception & simulation layer inside compositions
        $.material_block,
        $.particle_block,
        $.post_processing_block,
        $.weather_block,
        $.procedural_block,
        $.lod_block,
        $.navigation_block,
        $.input_block,
        $.audio_source_block,
        $.force_field_block,
        $.articulation_block,
        $.render_hints,
        $.annotation,
        $.test_block,
        $.codebase_block,
        $.custom_block
      ),

    // Environment block
    environment: ($) => seq('environment', '{', repeat(seq($.property, optional(','))), '}'),

    // Config block (zone-level configuration)
    config_block: ($) => seq('config', '{', repeat(seq($.property, optional(','))), '}'),

    // Dialog blocks (branching conversation trees)
    // e.g. dialog "greeting" { text: "Hello!"  option "Yes" -> @dialog("confirm") }
    dialog_block: ($) =>
      seq('dialog', field('id', $.string), '{',
        repeat(choice(seq($.property, optional(',')), $.dialog_option)),
      '}'),

    dialog_option: ($) =>
      seq('option', field('label', $.string), '->', field('target', $.dialog_target)),

    dialog_target: ($) =>
      choice(
        seq('@', 'dialog', '(', $.string, ')'),
        seq('@', 'close'),
        seq('@', 'action', '(', $.string, ')'),
        $._value
      ),

    // Spatial group for organizing objects
    spatial_group: ($) =>
      seq(
        'spatial_group',
        field('name', $.string),
        '{',
        repeat(choice($.object, $.spatial_group)),
        '}'
      ),

    // Timeline for animations
    timeline: ($) =>
      seq('timeline', optional(field('name', $.string)), '{', repeat($.timeline_entry), '}'),

    timeline_entry: ($) => seq(field('time', $.number), ':', $.timeline_action),

    timeline_action: ($) => choice($.animate_action, $.emit_action, $.call_action),

    animate_action: ($) =>
      seq('animate', field('target', $.identifier), '{', repeat(seq($.property, optional(','))), '}'),

    emit_action: ($) =>
      seq('emit', field('event', $.string), optional(seq('(', sepBy($.argument, ','), ')'))),

    call_action: ($) =>
      seq('call', field('function', $.property_access), '(', sepBy($.argument, ','), ')'),

    // Logic block
    logic: ($) => seq('logic', '{', repeat($.event_handler), '}'),

    // =========================================================================
    // WORLD (Alternative top-level)
    // =========================================================================

    world: ($) =>
      seq(
        'world',
        field('name', $.string),
        optional($.trait_list),
        '{',
        repeat($._world_content),
        '}'
      ),

    _world_content: ($) =>
      choice($.environment, $.template, $.object, $.entity, $.spatial_group, $.action, $.event_bus),

    // =========================================================================
    // TEMPLATE (Reusable object definitions)
    // =========================================================================

    template: ($) =>
      seq(
        'template',
        field('name', $.string),
        optional($.trait_list),
        '{',
        repeat($._template_content),
        '}'
      ),

    _template_content: ($) =>
      choice($.property, $.trait_inline, $.trait_with_body, $.state_block, $.networked_block,
        // Structured physics blocks in templates
        $.physics_block, $.collider_block, $.rigidbody_block, $.force_field_block, $.articulation_block,
        $.animation, $.event_handler, $.action, $.decorator_event_handler,
        // Compile-time safety annotations
        $.effects_decorator, $.budget_decorator),

    // =========================================================================
    // OBJECT (Instances in scene)
    // =========================================================================

    object: ($) =>
      seq(
        choice('object', 'orb', 'cube', 'sphere', 'cylinder', 'cone', 'model',
               'npc', 'portal', 'audio', 'spawnpoint', 'ui_panel', 'text',
               'gesture', 'progress', 'button', 'text'),
        field('name', $.string),
        optional(seq('using', field('template', $.string))),
        optional($.trait_list),
        optional(seq('{', repeat($._object_content), '}'))
      ),

    _object_content: ($) =>
      choice(
        $.property,
        $.trait_inline,
        $.trait_with_body,
        $.object,
        $.state_block,
        $.networked_block,
        $.physics_block,
        // Structured physics sub-blocks can also appear directly in objects
        $.collider_block,
        $.rigidbody_block,
        $.force_field_block,
        $.articulation_block,
        $.animation,
        $.event_handler,
        $.action,
        $.decorator_event_handler,
        // Compile-time safety annotations
        $.effects_decorator,
        $.budget_decorator
      ),

    // =========================================================================
    // ENTITY (Alternative object syntax)
    // =========================================================================

    entity: ($) =>
      seq(
        'entity',
        field('name', $.string),
        optional($.trait_list),
        '{',
        repeat($._entity_content),
        '}'
      ),

    _entity_content: ($) => choice($.property, $.component, $.state_block, $.event_handler),

    component: ($) => seq('component', field('name', $.identifier), '{', repeat(seq($.property, optional(','))), '}'),

    // =========================================================================
    // TRAITS
    // =========================================================================

    trait_list: ($) => prec.right(repeat1($.trait_inline)),

    trait_inline: ($) => seq('@', field('name', $.identifier), optional($.trait_arguments)),

    trait_arguments: ($) => seq('(', sepBy($.argument, ','), ')'),

    trait_definition: ($) =>
      seq(
        'trait',
        field('name', $.identifier),
        optional(seq('extends', field('base', $.identifier))),
        '{',
        repeat($._trait_content),
        '}'
      ),

    _trait_content: ($) => choice($.property, $.event_handler, $.action),

    // Structured trait with properties — @agent { type: "player", capabilities: [...] }
    trait_with_body: ($) =>
      prec(2, seq('@', field('name', $.identifier),
        optional($.trait_arguments),
        '{', repeat(seq($.property, optional(','))), '}'
      )),

    // Decorator-style event handler — @on_event("name"): { } or @on_collision: { }
    decorator_event_handler: ($) =>
      seq('@', field('event', $.identifier),
        optional(seq('(', sepBy($.argument, ','), ')')),
        ':',
        $.block
      ),

    // =========================================================================
    // STATE & NETWORKING
    // =========================================================================

    state_block: ($) => seq('state', '{', repeat(seq($.property, optional(','))), '}'),

    // Named state declaration (top-level or composition-level)
    // e.g. state GameState { started: false, score: 0 }
    state_declaration: ($) =>
      seq('state', field('name', $.identifier), '{', repeat(seq($.property, optional(','))), '}'),

    networked_block: ($) => seq('networked', '{', repeat($.networked_property), '}'),

    networked_property: ($) =>
      seq(field('name', $.identifier), ':', choice('synced', 'owner_only', 'interpolated')),

    // Structured physics block — supports both flat properties (backward compat)
    // and nested typed sub-blocks: collider, rigidbody, force_field, articulation
    // e.g. physics { collider sphere { radius: 0.5 } rigidbody { mass: 5 } mass: 2 }
    physics_block: ($) =>
      seq('physics', optional(':'), '{',
        repeat(choice(
          $.collider_block,
          $.rigidbody_block,
          $.force_field_block,
          $.articulation_block,
          seq($.property, optional(','))
        )),
      '}'),

    // =========================================================================
    // HSPLUS: MODULES, STRUCTS, ENUMS, INTERFACES
    // =========================================================================

    // Module declaration — module GameState { export let score... }
    module_declaration: ($) =>
      seq('module', field('name', $.identifier), '{',
        repeat(choice(
          $.function_declaration,
          $.variable_declaration_stmt,
          $.export_statement,
          $.property,
          $.state_block,
          $.event_handler,
          $.action,
          $.decorator_event_handler
        )),
      '}'),

    // Struct definition — struct Point { x: number, y: number }
    struct_definition: ($) =>
      seq('struct', field('name', $.identifier), '{',
        repeat(seq($.typed_field, optional(','))),
      '}'),

    typed_field: ($) =>
      seq(field('name', $.identifier), optional('?'), ':', field('type', $.type)),

    // Enum definition — enum Direction { NORTH, SOUTH, EAST }
    enum_definition: ($) =>
      seq('enum', field('name', $.identifier), '{',
        sepByTrailing($.enum_member, ','),
      '}'),

    enum_member: ($) =>
      seq(field('name', $.identifier), optional(seq('=', field('value', $._value)))),

    // Interface definition — interface BallState { position: Vector3 }
    interface_definition: ($) =>
      seq('interface', field('name', $.identifier),
        optional(seq('extends', field('base', $.identifier))),
      '{', repeat(seq($.typed_field, optional(','))), '}'),

    // Import statement — import { X, Y } from "module"
    import_statement: ($) =>
      seq('import',
        choice(
          seq('{', sepBy($.import_specifier, ','), '}', 'from', field('source', $.string)),
          seq(field('default', $.identifier), 'from', field('source', $.string)),
          seq('*', 'as', field('alias', $.identifier), 'from', field('source', $.string))
        )
      ),

    import_specifier: ($) =>
      seq(field('name', $.identifier), optional(seq('as', field('alias', $.identifier)))),

    // Export statement — export function/const/let/{ }
    export_statement: ($) =>
      seq('export',
        choice(
          $.function_declaration,
          $.variable_declaration_stmt,
          $.interface_definition,
          seq('{', sepBy($.identifier, ','), '}')
        )
      ),

    // Function declaration — function foo(x: number): string { }
    // Optional effect annotation: <physics:force, render:spawn> function foo() { }
    function_declaration: ($) =>
      seq(
        optional($.effect_annotation),
        'function', field('name', choice($.identifier, $.string)),
        '(', optional($.parameter_list), ')',
        optional(seq(':', field('return_type', $.type))),
        $.block
      ),

    // Variable declaration as a statement
    variable_declaration_stmt: ($) =>
      seq(
        choice('const', 'let', 'var'),
        field('name', $.identifier),
        optional(seq(':', field('type', $.type))),
        optional(seq('=', field('value', $._expression)))
      ),

    // =========================================================================
    // SPATIAL COMPUTING PRIMITIVES
    // =========================================================================

    // Zone declaration — zone "SafeZone" { shape: "box" bounds: [...] }
    zone_declaration: ($) =>
      seq('zone', field('name', $.string), '{',
        repeat(seq($.property, optional(','))),
      '}'),

    // Spawn group — spawn_group "Resources" { template: "X" count: 20 }
    spawn_group: ($) =>
      seq('spawn_group', field('name', $.string), '{',
        repeat(seq($.property, optional(','))),
      '}'),

    // Waypoints block — waypoints "route" [ [0,1,0], [1,0,0] ]
    waypoints_block: ($) =>
      seq('waypoints', field('name', $.string), $.array),

    // Constraint block — constraint name { type: hinge body_a: X }
    constraint_block: ($) =>
      seq('constraint', field('name', $.identifier), '{',
        repeat(seq($.property, optional(','))),
      '}'),

    // Terrain block — terrain name { generator: perlin size: [100,100] }
    terrain_block: ($) =>
      seq('terrain', field('name', $.identifier), '{',
        repeat(seq($.property, optional(','))),
      '}'),

    // =========================================================================
    // DOMAIN-SPECIFIC BLOCKS (structured for AI model training)
    // =========================================================================

    // ── IoT / Digital Twin ───────────────────────────────────────────────────
    // sensor "TempProbe" { type: "thermocouple" binding: "mqtt://factory/temp" }
    // device "SmartLight" { protocol: "matter" capability: "dimming" }
    iot_block: ($) =>
      seq(
        choice('sensor', 'device', 'binding', 'telemetry_stream', 'digital_twin',
               'data_binding', 'mqtt_source', 'mqtt_sink', 'wot_thing'),
        field('name', choice($.string, $.identifier)),
        optional($.trait_list),
        '{', repeat(choice(seq($.property, optional(',')), $.event_handler, $.object)), '}'
      ),

    // ── Robotics ─────────────────────────────────────────────────────────────
    // joint "Shoulder" { type: "revolute" axis: [0,1,0] limits: [-90,90] }
    // actuator "GripperServo" { type: "servo" torque: 5.0 }
    robotics_block: ($) =>
      seq(
        choice('joint', 'actuator', 'controller', 'end_effector', 'kinematics',
               'gripper', 'mobile_base', 'safety_zone', 'path_planner'),
        field('name', choice($.string, $.identifier)),
        optional($.trait_list),
        '{', repeat(choice(seq($.property, optional(',')), $.event_handler, $.object)), '}'
      ),

    // ── Data Visualization / Enterprise ──────────────────────────────────────
    // dashboard "FactoryMonitor" { layout: "grid" refresh: 5000 }
    // chart "Temperature" { type: "line" data_source: "sensors/temp" }
    dataviz_block: ($) =>
      seq(
        choice('dashboard', 'chart', 'data_source', 'widget', 'panel',
               'table', 'metric', 'alert_rule', 'report'),
        field('name', choice($.string, $.identifier)),
        optional($.trait_list),
        '{', repeat(choice(seq($.property, optional(',')), $.object)), '}'
      ),

    // ── Education / Learning ─────────────────────────────────────────────────
    // lesson "Cardiac Anatomy" { objective: "..." steps: [...] }
    // quiz "Final Exam" { passing_score: 80 questions: [...] }
    education_block: ($) =>
      seq(
        choice('lesson', 'quiz', 'curriculum', 'course', 'assessment',
               'flashcard', 'tutorial', 'lab_experiment', 'exercise'),
        field('name', choice($.string, $.identifier)),
        optional($.trait_list),
        '{', repeat(choice(seq($.property, optional(',')), $.object)), '}'
      ),

    // ── Healthcare / Medical ─────────────────────────────────────────────────
    // procedure "Catheterization" { steps: [...] precision_required: 0.9 }
    // patient_model "Heart" { anatomy: "cardiac" layers: [...] }
    healthcare_block: ($) =>
      seq(
        choice('procedure', 'patient_model', 'vital_monitor', 'diagnosis',
               'therapeutic', 'surgical_step', 'anatomy_layer', 'drug_interaction'),
        field('name', choice($.string, $.identifier)),
        optional($.trait_list),
        '{', repeat(choice(seq($.property, optional(',')), $.object)), '}'
      ),

    // ── Music / Audio Production ─────────────────────────────────────────────
    // instrument "Piano" { type: "sampled" midi_channel: 1 }
    // track "Melody" { bpm: 120 time_signature: "4/4" }
    music_block: ($) =>
      seq(
        choice('instrument', 'track', 'sequence', 'sample', 'effect_chain',
               'mixer', 'midi_map', 'beat_pattern', 'chord_progression'),
        field('name', choice($.string, $.identifier)),
        optional($.trait_list),
        '{', repeat(choice(seq($.property, optional(',')), $.object)), '}'
      ),

    // ── Architecture / Construction ──────────────────────────────────────────
    // floor_plan "Level1" { scale: "1:100" units: "meters" }
    // room "Kitchen" { area: 25 ceiling_height: 3.0 }
    architecture_block: ($) =>
      seq(
        choice('floor_plan', 'room', 'building', 'facade', 'structural',
               'hvac_system', 'plumbing_system', 'electrical_system', 'landscape'),
        field('name', choice($.string, $.identifier)),
        optional($.trait_list),
        '{', repeat(choice(seq($.property, optional(',')), $.object)), '}'
      ),

    // ── Web3 / Blockchain ────────────────────────────────────────────────────
    // contract "NFTMarket" { chain: "base" standard: "ERC-721" }
    // token "GameCoin" { supply: 1000000 decimals: 18 }
    web3_block: ($) =>
      seq(
        choice('contract', 'token', 'wallet', 'marketplace', 'auction',
               'royalty_split', 'governance', 'staking_pool', 'bridge'),
        field('name', choice($.string, $.identifier)),
        optional($.trait_list),
        '{', repeat(choice(seq($.property, optional(',')), $.object)), '}'
      ),

    // =========================================================================
    // CODEBASE ABSORPTION (v4.3 — March 2026)
    // Spatial code intelligence: absorb any repo into navigable knowledge graph
    // codebase "MyProject" { source: "./src" language: "typescript" }
    // module_map "Architecture" { layout: "layered" group_by: "directory" }
    // =========================================================================

    codebase_block: ($) =>
      seq(
        choice('codebase', 'module_map', 'dependency_graph', 'call_graph', 'semantic_search', 'graph_query'),
        field('name', choice($.string, $.identifier)),
        optional($.trait_list),
        '{', repeat(choice(seq($.property, optional(',')), $.event_handler, $.object, $.spatial_group)), '}'
      ),

    // =========================================================================
    // EXTENSIBLE CUSTOM BLOCK (catch-all for unknown domains)
    // Any identifier can be used as a block keyword at lowest priority
    // e.g. recipe "Pasta" { ingredients: [...] } or workflow "Deploy" { ... }
    // =========================================================================

    custom_block: ($) =>
      prec(-1,
        seq(
          field('kind', $.identifier),
          field('name', choice($.string, $.identifier)),
          optional($.trait_list),
          '{', repeat(choice(seq($.property, optional(',')), $.event_handler, $.object)), '}'
        )
      ),

    // =========================================================================
    // PERCEPTION & SIMULATION LAYER (v4.2 — March 2026)
    // The "reality stack": materials, physics, particles, post-fx, audio,
    // weather, procedural, LOD, navigation, input, transform, annotations
    // =========================================================================

    // ── P0: Material & Shader System ─────────────────────────────────────────
    // material "SteelPlate" @pbr { baseColor: #888888 roughness: 0.3 metallic: 1.0 }
    // pbr_material "Wood" {
    //   albedo_map { source: "textures/wood.png" tiling: [2, 2] filtering: "trilinear" }
    //   normal_map { source: "textures/wood_n.png" strength: 1.0 }
    //   roughness: 0.6  metallic: 0.0
    // }
    // glass_material "WindowGlass" @transparent {
    //   baseColor: #ffffff  opacity: 0.3  IOR: 1.52  transmission: 0.95
    // }
    material_block: ($) =>
      seq(
        choice('material', 'pbr_material', 'unlit_material', 'shader',
               'toon_material', 'glass_material', 'subsurface_material'),
        field('name', choice($.string, $.identifier)),
        optional($.trait_list),
        '{', repeat(choice(
          seq($.property, optional(',')),
          $.texture_map,
          $.texture_map_block,
          $.shader_pass,
          $.shader_connection
        )), '}'
      ),

    // Simple texture map assignment (inline form)
    // e.g. albedo_map: "textures/wood.png"
    texture_map: ($) =>
      seq(
        field('channel', choice(
          'albedo_map', 'normal_map', 'roughness_map', 'metallic_map',
          'emission_map', 'ao_map', 'height_map', 'opacity_map',
          'displacement_map', 'specular_map', 'clearcoat_map',
          'baseColor_map', 'emissive_map', 'transmission_map',
          'sheen_map', 'anisotropy_map', 'thickness_map',
          'subsurface_map', 'iridescence_map')),
        ':', field('source', $._expression)
      ),

    // Structured texture map sub-block (detailed form with parameters)
    // e.g. albedo_map { source: "textures/wood.png" tiling: [2, 2] filtering: "trilinear" }
    texture_map_block: ($) =>
      seq(
        field('channel', choice(
          'albedo_map', 'normal_map', 'roughness_map', 'metallic_map',
          'emission_map', 'ao_map', 'height_map', 'opacity_map',
          'displacement_map', 'specular_map', 'clearcoat_map',
          'baseColor_map', 'emissive_map', 'transmission_map',
          'sheen_map', 'anisotropy_map', 'thickness_map',
          'subsurface_map', 'iridescence_map')),
        '{', repeat(seq($.property, optional(','))), '}'
      ),

    // Shader pass for multi-pass rendering
    // e.g. pass "ForwardBase" { vertex: "shaders/pbr.vert" fragment: "shaders/pbr.frag" }
    shader_pass: ($) =>
      seq(
        'pass', optional(field('name', choice($.string, $.identifier))),
        '{', repeat(seq($.property, optional(','))), '}'
      ),

    shader_connection: ($) =>
      seq(
        field('output', $.identifier), '->', field('input', $.property_access)
      ),

    // ── P0: Structured Physics ───────────────────────────────────────────────
    // collider sphere { radius: 0.5 is_trigger: false }
    // rigidbody { mass: 5 angular_damping: 0.1 use_gravity: true }
    collider_block: ($) =>
      seq(
        choice('collider', 'trigger'),
        optional(field('shape', choice('box', 'sphere', 'capsule', 'mesh',
                                        'convex', 'cylinder', 'heightfield'))),
        '{', repeat(seq($.property, optional(','))), '}'
      ),

    rigidbody_block: ($) =>
      seq('rigidbody', '{', repeat(seq($.property, optional(','))), '}'),

    force_field_block: ($) =>
      seq(
        choice('force_field', 'gravity_zone', 'wind_zone', 'buoyancy_zone',
               'magnetic_field', 'drag_zone'),
        optional(field('name', choice($.string, $.identifier))),
        optional($.trait_list),
        '{', repeat(seq($.property, optional(','))), '}'
      ),

    articulation_block: ($) =>
      seq('articulation', field('name', choice($.string, $.identifier)),
        optional($.trait_list),
        '{', repeat(choice(
          $.joint_block,
          seq($.property, optional(','))
        )), '}'
      ),

    joint_block: ($) =>
      seq(
        choice('joint', 'hinge', 'slider', 'ball_socket', 'fixed_joint',
               'd6_joint', 'spring_joint', 'prismatic'),
        field('name', choice($.string, $.identifier)),
        '{', repeat(seq($.property, optional(','))), '}'
      ),

    // ── P1: Particle / VFX System ────────────────────────────────────────────
    // particles "CampfireSmoke" @looping { rate: 500 lifetime: [2, 4] }
    particle_block: ($) =>
      seq(
        choice('particles', 'emitter', 'vfx', 'particle_system'),
        field('name', choice($.string, $.identifier)),
        optional($.trait_list),
        '{', repeat(choice(
          seq($.property, optional(',')),
          $.particle_module
        )), '}'
      ),

    particle_module: ($) =>
      seq(
        choice('emission', 'lifetime', 'velocity', 'force', 'color_over_life',
               'size_over_life', 'noise', 'collision', 'sub_emitter',
               'shape', 'renderer', 'rotation_over_life', 'trails',
               'texture_sheet', 'inherit_velocity'),
        '{', repeat(seq($.property, optional(','))), '}'
      ),

    // ── P1: Post-Processing Pipeline ─────────────────────────────────────────
    // post_processing "Cinematic" { bloom { intensity: 0.8 } depth_of_field { aperture: 2.8 } }
    post_processing_block: ($) =>
      seq(
        choice('post_processing', 'post_fx', 'render_pipeline'),
        optional(field('name', choice($.string, $.identifier))),
        '{', repeat($.post_effect), '}'
      ),

    post_effect: ($) =>
      seq(
        choice('bloom', 'ambient_occlusion', 'ssao', 'color_grading', 'tone_mapping',
               'depth_of_field', 'motion_blur', 'vignette', 'chromatic_aberration',
               'fog', 'volumetric_fog', 'screen_space_reflections', 'ssr',
               'anti_aliasing', 'fxaa', 'smaa', 'taa', 'film_grain',
               'lens_flare', 'god_rays', 'outline', 'pixelate'),
        '{', repeat(seq($.property, optional(','))), '}'
      ),

    // ── P1: Spatial Audio System ─────────────────────────────────────────────
    // audio_source "Waterfall" @spatial @hrtf { clip: "water.ogg" volume: 0.8 }
    audio_source_block: ($) =>
      seq(
        choice('audio_source', 'audio_listener', 'reverb_zone',
               'audio_mixer', 'ambience', 'sound_emitter'),
        field('name', choice($.string, $.identifier)),
        optional($.trait_list),
        '{', repeat(seq($.property, optional(','))), '}'
      ),

    // ── P2: Weather & Atmosphere ─────────────────────────────────────────────
    // weather "Thunderstorm" { rain { intensity: 0.9 } lightning { frequency: 5 } }
    weather_block: ($) =>
      seq(
        choice('weather', 'atmosphere', 'sky', 'climate'),
        optional(field('name', choice($.string, $.identifier))),
        optional($.trait_list),
        '{', repeat(choice(
          seq($.property, optional(',')),
          $.weather_layer
        )), '}'
      ),

    weather_layer: ($) =>
      seq(
        choice('rain', 'snow', 'wind', 'lightning', 'clouds', 'hail',
               'time_of_day', 'sun', 'moon', 'fog_layer', 'aurora',
               'dust_storm', 'humidity', 'temperature'),
        '{', repeat(seq($.property, optional(','))), '}'
      ),

    // ── P2: Procedural Generation ────────────────────────────────────────────
    // procedural "WorldTerrain" { perlin base { scale: 100 octaves: 6 } biome "Forest" { ... } }
    procedural_block: ($) =>
      seq(
        choice('procedural', 'generate', 'scatter', 'distribute'),
        field('name', choice($.string, $.identifier)),
        optional($.trait_list),
        '{', repeat(choice(
          seq($.property, optional(',')),
          $.noise_function,
          $.biome_rule
        )), '}'
      ),

    noise_function: ($) =>
      seq(
        choice('perlin', 'simplex', 'voronoi', 'worley', 'fbm', 'ridged',
               'cellular', 'white_noise', 'curl', 'domain_warp'),
        optional(field('name', $.identifier)),
        '{', repeat(seq($.property, optional(','))), '}'
      ),

    biome_rule: ($) =>
      seq('biome', field('name', choice($.string, $.identifier)),
        '{', repeat(seq($.property, optional(','))), '}'
      ),

    // ── P2: LOD & Render Hints ───────────────────────────────────────────────
    // lod { level 0 { mesh: "high.glb" } level 50 { mesh: "mid.glb" } level 200 { mesh: "low.glb" } }
    lod_block: ($) =>
      seq('lod', '{', repeat($.lod_level), '}'),

    lod_level: ($) =>
      seq(
        choice('level', 'lod'),
        field('distance', $.number),
        '{', repeat(choice(
          seq($.property, optional(',')),
          $.object
        )), '}'
      ),

    // render { cast_shadows: true receive_shadows: true layer: "transparent" }
    render_hints: ($) =>
      seq('render', '{', repeat(seq($.property, optional(','))), '}'),

    // ── P3: Navigation & AI ──────────────────────────────────────────────────
    // navmesh "MainNav" { agent_radius: 0.5 agent_height: 2.0 }
    // behavior_tree "PatrolAI" { sequence { condition : "see_player" leaf : "attack" } }
    navigation_block: ($) =>
      seq(
        choice('navmesh', 'nav_agent', 'behavior_tree', 'obstacle',
               'nav_link', 'nav_modifier', 'crowd_manager'),
        field('name', choice($.string, $.identifier)),
        optional($.trait_list),
        '{', repeat(choice(
          seq($.property, optional(',')),
          $.behavior_node
        )), '}'
      ),

    behavior_node: ($) =>
      seq(
        choice('selector', 'sequence', 'condition', 'leaf', 'parallel',
               'decorator', 'inverter', 'repeater', 'cooldown', 'guard'),
        optional(field('name', $.identifier)),
        choice(
          seq('{', repeat(choice($.behavior_node, seq($.property, optional(',')))), '}'),
          seq(':', $._expression)
        )
      ),

    // ── P3: Input & Interaction ──────────────────────────────────────────────
    // input "PlayerControls" { move: "left_stick" jump: "button_a" look: "right_stick" }
    input_block: ($) =>
      seq(
        choice('input', 'interaction', 'gesture_profile', 'controller_map'),
        optional(field('name', choice($.string, $.identifier))),
        optional($.trait_list),
        '{', repeat(choice(
          seq($.property, optional(',')),
          $.input_binding
        )), '}'
      ),

    input_binding: ($) =>
      seq(
        field('action', $.identifier), '=>', field('binding', $._expression)
      ),

    // ── P3: Annotations ──────────────────────────────────────────────────────
    // #[debug, profile("gpu"), editor_only]
    annotation: ($) =>
      seq('#[', sepBy($.annotation_entry, ','), ']'),

    annotation_entry: ($) =>
      seq(field('key', $.identifier),
        optional(seq('(', sepBy($._expression, ','), ')'))
      ),

    // =========================================================================
    // BUILT-IN TEST FRAMEWORK
    // =========================================================================

    // test "material renders correctly" {
    //   given { scene: load("test.holo") }
    //   when  { apply_material(scene, "Steel") }
    //   then  { assert scene.material.metallic == 1.0 }
    // }
    test_block: ($) =>
      seq(
        'test', field('name', $.string),
        optional($.trait_list),
        '{', repeat(choice(
          $.test_given,
          $.test_when,
          $.test_then,
          $.test_assertion,
          $.test_lifecycle,
          seq($.property, optional(',')),
          $._statement
        )), '}'
      ),

    test_given: ($) =>
      seq('given', '{', repeat($._statement), '}'),

    test_when: ($) =>
      seq('when', '{', repeat($._statement), '}'),

    test_then: ($) =>
      seq('then', '{', repeat(choice($.test_assertion, $._statement)), '}'),

    test_assertion: ($) =>
      seq('assert', field('expression', $._expression)),

    test_lifecycle: ($) =>
      seq(
        choice('before_each', 'after_each', 'before_all', 'after_all'),
        '{', repeat($._statement), '}'
      ),

    // =========================================================================
    // ANIMATIONS
    // =========================================================================

    animation: ($) =>
      seq('animation', field('name', $.identifier), '{', repeat($.animation_property), '}'),

    animation_property: ($) => seq(field('key', $.identifier), ':', field('value', $._value)),

    // =========================================================================
    // ACTIONS & EVENTS
    // =========================================================================

    // Action declaration with optional effect annotation
    // <physics:force> action moveNPC(target: Entity) { }
    action: ($) =>
      seq(
        optional($.effect_annotation),
        'action', field('name', $.identifier),
        '(', optional($.parameter_list), ')',
        $.block
      ),

    parameter_list: ($) => seq($.parameter, repeat(seq(',', $.parameter))),

    parameter: ($) => seq(field('name', $.identifier), optional(seq(':', field('type', $.type)))),

    event_handler: ($) => seq(field('event', $.event_name), ':', $.block),

    event_name: ($) =>
      choice(
        'onPoint',
        'onGrab',
        'onRelease',
        'onHoverEnter',
        'onHoverExit',
        'onTriggerEnter',
        'onTriggerExit',
        'onSwing',
        'onClick',
        'onCollision',
        'onInit',
        'onUpdate',
        'onDestroy',
        'onDamage',
        'onSpawn',
        'onInteract',
        'onPlayerNear',
        'onDeath',
        'onRespawn',
        'onEquip',
        'onDrop',
        'onActivate',
        'onDeactivate',
        seq('on', $.identifier),
        seq('onGesture', '(', $.string, ')')
      ),

    event_bus: ($) => seq('eventBus', field('name', $.identifier)),

    // =========================================================================
    // LIGHTS & CAMERAS
    // =========================================================================

    light: ($) =>
      seq(
        choice('light', 'directional_light', 'point_light', 'spot_light'),
        optional(field('name', $.string)),
        '{',
        repeat(seq($.property, optional(','))),
        '}'
      ),

    camera: ($) =>
      seq(
        choice('camera', 'perspective_camera', 'orthographic_camera'),
        optional(field('name', $.string)),
        '{',
        repeat(seq($.property, optional(','))),
        '}'
      ),

    // =========================================================================
    // PROPERTIES
    // =========================================================================

    property: ($) => seq(field('key', $.identifier), ':', field('value', $._expression)),

    // =========================================================================
    // BLOCKS & STATEMENTS
    // =========================================================================

    block: ($) => prec(1, seq('{', repeat($._statement), '}')),

    _statement: ($) =>
      choice(
        $.variable_declaration,
        $.assignment,
        $.function_call,
        $.if_statement,
        $.switch_statement,
        $.for_loop,
        $.for_of_loop,
        $.while_loop,
        $.return_statement,
        $.emit_statement,
        $.throw_statement,
        $.try_statement,
        $.expression_statement
      ),

    variable_declaration: ($) =>
      seq(choice('const', 'let', 'var'), field('name', $.identifier), '=', field('value', $._expression)),

    switch_statement: ($) =>
      seq('switch', '(', field('value', $._expression), ')', '{',
        repeat($.case_clause),
        '}'),

    case_clause: ($) =>
      seq(
        choice(
          seq('case', field('value', $._value), ':'),
          seq('default', ':')
        ),
        repeat($._statement),
        optional('break')
      ),

    // For-of loop — for (const file of files) { }
    for_of_loop: ($) =>
      seq('for', '(',
        optional(choice('const', 'let', 'var')),
        field('variable', $.identifier),
        'of',
        field('iterable', $._expression),
        ')', $.block),

    // Throw statement
    throw_statement: ($) => seq('throw', $._expression),

    // Try/catch/finally
    try_statement: ($) =>
      seq('try', $.block,
        optional(seq('catch', optional(seq('(', $.identifier, ')')), $.block)),
        optional(seq('finally', $.block))),

    assignment: ($) =>
      seq(
        field('left', choice($.identifier, $.property_access, $.subscript)),
        choice('=', '+=', '-=', '*=', '/='),
        field('right', $._expression)
      ),

    function_call: ($) =>
      prec(
        1,
        seq(
          field('function', choice($.identifier, $.property_access)),
          '(',
          sepBy($.argument, ','),
          ')'
        )
      ),

    if_statement: ($) =>
      prec.right(
        seq(
          'if',
          '(',
          field('condition', $._expression),
          ')',
          $.block,
          optional(seq('else', choice($.if_statement, $.block)))
        )
      ),

    for_loop: ($) =>
      seq(
        'for',
        '(',
        field('init', optional($.assignment)),
        ';',
        field('condition', optional($._expression)),
        ';',
        field('update', optional($.assignment)),
        ')',
        $.block
      ),

    while_loop: ($) => seq('while', '(', field('condition', $._expression), ')', $.block),

    return_statement: ($) => prec.right(1, seq('return', optional($._expression))),

    emit_statement: ($) =>
      seq(
        $.identifier,
        '.',
        'emit',
        '(',
        $.string,
        optional(seq(',', sepBy($._expression, ','))),
        ')'
      ),

    expression_statement: ($) => prec(-1, $._expression),

    // =========================================================================
    // EXPRESSIONS
    // =========================================================================

    _expression: ($) =>
      choice(
        $.binary_expression,
        $.unary_expression,
        $.ternary_expression,
        $.function_call,
        $.property_access,
        $.optional_chain,
        $.subscript,
        $.parenthesized,
        $.await_expression,
        $.new_expression,
        $._value
      ),

    // Await expression — await moveTo(pos)
    await_expression: ($) =>
      prec.right(6, seq('await', $._expression)),

    // New expression — new Map()
    new_expression: ($) =>
      prec(8, seq('new', field('constructor', $.identifier),
        '(', sepBy($.argument, ','), ')')),

    // Optional chaining — zone?.pvp_enabled
    optional_chain: ($) =>
      prec.left(7, seq(
        field('object', choice($.identifier, $.property_access, $.optional_chain)),
        '?.',
        field('property', $.identifier)
      )),

    binary_expression: ($) =>
      choice(
        ...['||', '&&'].map((op, i) =>
          prec.left(
            i + 1,
            seq(field('left', $._expression), field('operator', op), field('right', $._expression))
          )
        ),
        ...['==', '!=', '<', '>', '<=', '>='].map((op) =>
          prec.left(
            3,
            seq(field('left', $._expression), field('operator', op), field('right', $._expression))
          )
        ),
        ...['+', '-'].map((op) =>
          prec.left(
            4,
            seq(field('left', $._expression), field('operator', op), field('right', $._expression))
          )
        ),
        ...['*', '/', '%'].map((op) =>
          prec.left(
            5,
            seq(field('left', $._expression), field('operator', op), field('right', $._expression))
          )
        )
      ),

    unary_expression: ($) =>
      prec.right(6, seq(field('operator', choice('!', '-', '+')), field('operand', $._expression))),

    ternary_expression: ($) =>
      prec.right(
        0,
        seq(
          field('condition', $._expression),
          '?',
          field('consequence', $._expression),
          ':',
          field('alternative', $._expression)
        )
      ),

    property_access: ($) =>
      prec.left(
        7,
        seq(
          field('object', choice($.identifier, $.property_access, 'this', 'self')),
          '.',
          field('property', $.identifier)
        )
      ),

    subscript: ($) =>
      prec.left(7, seq(field('object', $._expression), '[', field('index', $._expression), ']')),

    parenthesized: ($) => seq('(', $._expression, ')'),

    // =========================================================================
    // VALUES
    // =========================================================================

    _value: ($) =>
      choice(
        $.number,
        $.string,
        $.boolean,
        $.null,
        $.array,
        $.object_literal,
        $.identifier,
        $.color,
        $.this,
        $.self,
        $.computed_expression
      ),

    // Computed expression block — reactive value
    // e.g. material: computed { return { color: state.active ? "#ff0" : "#333" } }
    computed_expression: ($) => seq('computed', $.block),

    number: ($) => token(choice(/\d+\.?\d*([eE][+-]?\d+)?/, /\.\d+([eE][+-]?\d+)?/)),

    string: ($) => choice(seq('"', /[^"]*/, '"'), seq("'", /[^']*/, "'"), seq('`', /[^`]*/, '`')),

    boolean: ($) => choice('true', 'false'),

    null: ($) => 'null',

    this: ($) => 'this',

    self: ($) => 'self',

    array: ($) => seq('[', sepByTrailing($._expression, ','), ']'),

    // Object literals allow comma-optional properties (matching HoloScript convention)
    object_literal: ($) => prec.left(1, seq('{', repeat(seq($.property, optional(','))), '}')),

    color: ($) => token(seq('#', /[0-9a-fA-F]{3,8}/)),

    // =========================================================================
    // ARGUMENTS
    // =========================================================================

    argument: ($) => choice($._expression, $.named_argument),

    named_argument: ($) => seq(field('name', $.identifier), ':', field('value', $._expression)),

    // =========================================================================
    // TYPES
    // =========================================================================

    type: ($) =>
      choice(
        'number',
        'string',
        'boolean',
        'void',
        'any',
        'vec2',
        'vec3',
        'vec4',
        'quaternion',
        'color',
        'Vector3',
        $.generic_type,
        $.identifier,
        $.array_type
      ),

    array_type: ($) => prec.left(1, seq($.type, '[', ']')),

    // Generic type — Map<string, SymbolInfo>, Promise<void>
    generic_type: ($) =>
      prec(2, seq(field('name', $.identifier), '<', sepBy($.type, ','), '>')),

    // =========================================================================
    // COMPILE-TIME SAFETY ANNOTATIONS
    // =========================================================================

    // Effect annotation — declares which effects a function/action may produce
    // <physics:force, render:spawn> function move() { ... }
    effect_annotation: ($) =>
      prec(3, seq('<', sepBy($.effect_specifier, ','), '>')),

    // Single effect specifier — category:operation (e.g. physics:force)
    effect_specifier: ($) =>
      seq(field('category', $.identifier), ':', field('operation', $.identifier)),

    // @effects() decorator — declares effects on objects/templates
    // @effects(physics:force, render:spawn)
    effects_decorator: ($) =>
      seq('@effects', '(', sepBy($.effect_specifier, ','), ')'),

    // @budget() decorator — declares resource budget constraints
    // @budget(particles: 500, memoryMB: 16)
    budget_decorator: ($) =>
      seq('@budget', '(', sepBy($.budget_entry, ','), ')'),

    budget_entry: ($) =>
      seq(field('resource', $.identifier), ':', field('limit', $.number)),

    // Resource definition — linear resource type declaration
    // resource InventoryItem has(drop) { ... }
    // resource EntityAuthority { ... }  // no abilities = fully linear
    resource_definition: ($) =>
      seq('resource', field('name', $.identifier),
        optional($.resource_abilities),
        '{', repeat(choice($.property, $.function_declaration)), '}'),

    // Resource abilities — which linear abilities the resource has
    // has(copy, drop)  or  has(drop)
    resource_abilities: ($) =>
      seq('has', '(', sepBy($.identifier, ','), ')'),

    // =========================================================================
    // IDENTIFIERS & COMMENTS
    // =========================================================================

    identifier: ($) => /[a-zA-Z_][a-zA-Z0-9_]*/,

    comment: ($) => token(choice(
      seq('//', /.*/),
      seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')
    )),
  },
});
