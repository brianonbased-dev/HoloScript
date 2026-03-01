/**
 * tree-sitter-holoscript
 *
 * Tree-sitter grammar for HoloScript - VR scene description language.
 * Supports .hs, .hsplus, and .holo file formats.
 *
 * @see https://holoscript.net/docs
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

  // Handle parsing conflicts - resolved via explicit precedence rules
  conflicts: ($) => [],

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
        $.composition,
        $.world,
        $.template,
        $.object,
        $.entity,
        $.action,
        $.event_bus,
        $.trait_definition,
        $.timeline,
        $.state_declaration
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
        $.networked_block
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
      seq('option', field('label', $.string), '->', field('target', $._value)),

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
      choice($.property, $.state_block, $.networked_block, $.animation, $.event_handler, $.action),

    // =========================================================================
    // OBJECT (Instances in scene)
    // =========================================================================

    object: ($) =>
      seq(
        choice('object', 'orb', 'cube', 'sphere', 'cylinder', 'cone', 'model',
               'npc', 'portal', 'audio', 'spawnpoint', 'ui_panel', 'text',
               'module', 'gesture', 'progress', 'button', 'zone'),
        field('name', $.string),
        optional(seq('using', field('template', $.string))),
        optional($.trait_list),
        optional(seq('{', repeat($._object_content), '}'))
      ),

    _object_content: ($) =>
      choice(
        $.property,
        $.object,
        $.state_block,
        $.networked_block,
        $.physics_block,
        $.animation,
        $.event_handler
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

    physics_block: ($) => seq('physics', ':', '{', repeat(seq($.property, optional(','))), '}'),

    // =========================================================================
    // ANIMATIONS
    // =========================================================================

    animation: ($) =>
      seq('animation', field('name', $.identifier), '{', repeat($.animation_property), '}'),

    animation_property: ($) => seq(field('key', $.identifier), ':', field('value', $._value)),

    // =========================================================================
    // ACTIONS & EVENTS
    // =========================================================================

    action: ($) =>
      seq('action', field('name', $.identifier), '(', optional($.parameter_list), ')', $.block),

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

    property: ($) => seq(field('key', $.identifier), ':', field('value', $._value)),

    // =========================================================================
    // BLOCKS & STATEMENTS
    // =========================================================================

    block: ($) => prec(1, seq('{', repeat($._statement), '}')),

    _statement: ($) =>
      choice(
        $.assignment,
        $.function_call,
        $.if_statement,
        $.for_loop,
        $.while_loop,
        $.return_statement,
        $.emit_statement,
        $.expression_statement
      ),

    assignment: ($) =>
      seq(
        field('left', choice($.identifier, $.property_access)),
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
        $.subscript,
        $.parenthesized,
        $._value
      ),

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

    array: ($) => seq('[', sepByTrailing($._value, ','), ']'),

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
        'vec2',
        'vec3',
        'vec4',
        'quaternion',
        'color',
        $.identifier,
        $.array_type
      ),

    array_type: ($) => seq($.type, '[', ']'),

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
