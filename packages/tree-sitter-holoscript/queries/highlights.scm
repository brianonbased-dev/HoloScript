; tree-sitter-holoscript/queries/highlights.scm
; Syntax highlighting queries for HoloScript

; =============================================================================
; KEYWORDS
; =============================================================================

[
  "composition"
  "world"
  "template"
  "object"
  "entity"
  "action"
  "trait"
  "extends"
  "using"
] @keyword

[
  "orb"
  "cube"
  "sphere"
  "cylinder"
  "cone"
  "model"
] @keyword.type

[
  "environment"
  "state"
  "networked"
  "physics"
  "timeline"
  "logic"
  "animation"
  "spatial_group"
  "component"
  "eventBus"
] @keyword.storage

[
  "light"
  "directional_light"
  "point_light"
  "spot_light"
  "camera"
  "perspective_camera"
  "orthographic_camera"
] @keyword.type

; Control flow
[
  "if"
  "else"
  "for"
  "while"
  "return"
] @keyword.control

; Boolean and null
[
  "true"
  "false"
] @constant.builtin.boolean

(null) @constant.builtin

; =============================================================================
; TRAITS
; =============================================================================

(trait_inline
  "@" @punctuation.special
  name: (identifier) @attribute)

(trait_definition
  "trait" @keyword
  name: (identifier) @type.definition)

(trait_arguments
  "(" @punctuation.bracket
  ")" @punctuation.bracket)

; =============================================================================
; TYPES & DEFINITIONS
; =============================================================================

(composition
  name: (string) @namespace)

(world
  name: (string) @namespace)

(template
  name: (string) @type.definition)

(object
  name: (string) @variable)

(entity
  name: (string) @variable)

(spatial_group
  name: (string) @namespace)

(action
  name: (identifier) @function.definition)

(parameter
  name: (identifier) @variable.parameter)

(event_bus
  name: (identifier) @type)

; =============================================================================
; PROPERTIES
; =============================================================================

(property
  key: (identifier) @property)

(networked_property
  name: (identifier) @property)

(animation_property
  key: (identifier) @property)

; Property values that are special
(property
  key: (identifier) @property
  value: (identifier) @constant
  (#match? @property "^(geometry|skybox|type)$"))

; Sync modes
[
  "synced"
  "owner_only"
  "interpolated"
] @constant.builtin

; =============================================================================
; EVENTS
; =============================================================================

(event_handler
  event: (event_name) @function.method)

[
  "onPoint"
  "onGrab"
  "onRelease"
  "onHoverEnter"
  "onHoverExit"
  "onTriggerEnter"
  "onTriggerExit"
  "onSwing"
  "onClick"
  "onCollision"
  "onInit"
  "onUpdate"
  "onDestroy"
] @function.builtin

; =============================================================================
; TIMELINE
; =============================================================================

(timeline_entry
  time: (number) @number)

(animate_action
  "animate" @keyword
  target: (identifier) @variable)

(emit_action
  "emit" @keyword.control
  event: (string) @string)

(call_action
  "call" @keyword
  function: (property_access) @function)

; =============================================================================
; FUNCTIONS & CALLS
; =============================================================================

(function_call
  function: (identifier) @function)

(function_call
  function: (property_access
    property: (identifier) @function.method))

; Built-in functions
((function_call
  function: (property_access
    object: (identifier) @module
    property: (identifier) @function.builtin))
  (#match? @module "^(audio|haptic|network|scene|player|console)$"))

; =============================================================================
; EXPRESSIONS
; =============================================================================

(binary_expression
  operator: _ @operator)

(unary_expression
  operator: _ @operator)

(ternary_expression
  "?" @operator.ternary
  ":" @operator.ternary)

(assignment
  ["=" "+=" "-=" "*=" "/="] @operator)

; This/self reference
(this) @variable.builtin
(self) @variable.builtin

(property_access
  object: (identifier) @variable
  "." @punctuation.delimiter
  property: (identifier) @property)

(subscript
  "[" @punctuation.bracket
  "]" @punctuation.bracket)

; =============================================================================
; LITERALS
; =============================================================================

(number) @number

(string) @string

(color) @constant.character

(array
  "[" @punctuation.bracket
  "]" @punctuation.bracket)

(object_literal
  "{" @punctuation.bracket
  "}" @punctuation.bracket)

; =============================================================================
; TYPES
; =============================================================================

(type) @type

[
  "number"
  "string"
  "boolean"
  "vec2"
  "vec3"
  "vec4"
  "quaternion"
  "color"
] @type.builtin

; =============================================================================
; PUNCTUATION
; =============================================================================

["{" "}"] @punctuation.bracket
["(" ")"] @punctuation.bracket
["[" "]"] @punctuation.bracket

[":" "," "."] @punctuation.delimiter

";" @punctuation.delimiter

; =============================================================================
; COMMENTS
; =============================================================================

(comment) @comment

; =============================================================================
; IDENTIFIER (fallback)
; =============================================================================

(identifier) @variable
